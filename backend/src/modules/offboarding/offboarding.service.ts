import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { EmployeeRelationsService } from '@/modules/employees/employee-relations.service';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { isDemoMode } from '@/common/demo/demo-mode';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, finalizedThrough, isoDate } from '@/modules/payroll/payroll-lock';
import { DecimalMath } from '@/common/utils/decimal-math.util';
import { OffboardingNotificationsService } from './offboarding-notifications.service';
import { canClearTeam, ChecklistTemplateItem, ExitChecklistService } from './exit-checklist.service';
import {
  CancelSeparationDto, ClearanceDetailsDto, ClearanceItemDto, LastWorkingDateDto, NoticeDecisionDto, ReassignReportsDto, ClearanceTeam, ClearanceUpdateDto, ExitInterviewDto, ListSeparationsQueryDto,
  ResignDto, SeparationStatus, StartSeparationDto, WithdrawDto,
} from './dto/offboarding.dto';

type Tx = Prisma.TransactionClient;
type Actor = AuthenticatedTenantUser;

const OPEN: SeparationStatus[] = ['PENDING_APPROVAL', 'IN_PROGRESS'];

/** The checklist every exit starts with once it is under way; HR can add items to it. */
const DEFAULT_CHECKLIST: { team: ClearanceTeam; title: string }[] = [
  { team: 'MANAGER', title: 'Work handed over and knowledge transfer done' },
  { team: 'IT', title: 'Laptop and accessories returned' },
  { team: 'IT', title: 'Email, system and tool access removed' },
  { team: 'ADMIN', title: 'ID card, access card and keys returned' },
  { team: 'FINANCE', title: 'Advances, loans and expense claims settled' },
  { team: 'HR', title: 'Exit paperwork signed' },
];

const TEAM_NAME: Record<ClearanceTeam, string> = { MANAGER: 'the manager', IT: 'IT', ADMIN: 'Admin', FINANCE: 'Finance', HR: 'HR' };

const EMPLOYEE = {
  select: {
    id: true, employee_code: true, first_name: true, last_name: true, preferred_name: true, user_id: true, employee_status: true, archived_at: true,
    rndtechnosoft_employee_employments: {
      where: { effective_to: null }, orderBy: { effective_from: 'desc' }, take: 1,
      select: { id: true, notice_period_days: true, rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } },
    },
  },
} as const;

type EmployeeRow = Prisma.rndtechnosoft_employeesGetPayload<typeof EMPLOYEE>;
type SeparationRow = Prisma.rndtechnosoft_employee_separationsGetPayload<{ include: typeof DETAIL_INCLUDE }>;

const memberName = { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const DETAIL_INCLUDE = {
  rndtechnosoft_employees: EMPLOYEE,
  rndtechnosoft_separation_clearance_items: { orderBy: { display_order: 'asc' }, include: { cleared_by: memberName, assigned_to: memberName } },
  requested_by: memberName,
  approved_by: memberName,
  interview_by: memberName,
  completed_by: memberName,
  closed_by: memberName,
  notice_decided_by: memberName,
  rndtechnosoft_separation_date_changes: { orderBy: { created_at: 'asc' }, include: { changed_by: memberName } },
} as const;

const fullName = (e: { first_name: string; last_name: string | null; preferred_name: string | null }) => `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim();
const who = (m: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) => (m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null);
const day = (d: Date | null) => (d ? isoDate(d) : null);


/**
 * Offboarding: an employee's exit, from their resignation (or HR starting a
 * termination, retirement or contract end) through the notice period and the
 * exit checklist to their last working day.
 *
 * The workspace and the employee always come from the session: an employee
 * only ever reaches their own exit, through the sign-in linked to them.
 * Completing an exit sets the employee's exit date (payroll pays up to it and
 * no further), marks them exited and ends their sign-in to this workspace.
 */
@Injectable()
export class OffboardingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly access: AccessService,
    private readonly relations: EmployeeRelationsService, private readonly notifications: OffboardingNotificationsService,
    private readonly checklist: ExitChecklistService,
  ) {}

  // ── The employee's own exit ─────────────────────────────────

  async mine(tenantId: string, actor: Actor) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: actor.userId }, ...EMPLOYEE });
    if (!employee) return { linked: false as const };
    const rows = await this.prisma.rndtechnosoft_employee_separations.findMany({
      where: { tenant_id: tenantId, employee_id: employee.id }, include: DETAIL_INCLUDE, orderBy: { created_at: 'desc' }, take: 20,
    });
    const current = rows.find((r) => OPEN.includes(r.separation_status as SeparationStatus) || r.separation_status === 'COMPLETED') ?? null;
    return {
      linked: true as const,
      employee: { ...this.person(employee), status: employee.employee_status, noticePeriodDays: employee.rndtechnosoft_employee_employments[0]?.notice_period_days ?? null },
      today: await this.today(tenantId),
      current: current && this.ownView(current),
      past: rows.filter((r) => r !== current).map((r) => this.ownView(r)),
    };
  }

  async resign(tenantId: string, input: ResignDto, actor: Actor) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: actor.userId }, ...EMPLOYEE });
    if (!employee) throw new NotFoundException('Your sign-in isn’t linked to an employee record yet. Ask HR to link it from your employee page.');
    if (employee.employee_status !== 'ACTIVE' || employee.archived_at) throw new BadRequestException('Only an active employee can resign.');
    const today = await this.today(tenantId);
    if (input.lastWorkingDate < today) throw new BadRequestException('Your last working day can’t be in the past.');

    const id = randomUUID();
    await this.createOpen(() => this.prisma.rndtechnosoft_employee_separations.create({
      data: {
        id, tenant_id: tenantId, employee_id: employee.id, separation_type: 'RESIGNATION', separation_status: 'PENDING_APPROVAL',
        separation_reason: input.reason.trim(), notice_date: dateOnly(today), notice_period_days: employee.rndtechnosoft_employee_employments[0]?.notice_period_days ?? null,
        requested_last_working_date: dateOnly(input.lastWorkingDate), last_working_date: dateOnly(input.lastWorkingDate),
        is_self_service: true, requested_by_tenant_member_id: actor.tenantMemberId,
      },
    }));
    await this.log(tenantId, actor, 'SEPARATION_RESIGNED', id, { new: { employee_id: employee.id, last_working_date: input.lastWorkingDate } });
    this.notifications.notify(tenantId, 'RESIGNATION_SUBMITTED', id, { actor });
    return this.mine(tenantId, actor);
  }

  /** An employee may take back their resignation until HR accepts it; after that, HR cancels it. */
  async withdraw(tenantId: string, input: WithdrawDto, actor: Actor) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: actor.userId }, select: { id: true } });
    if (!employee) throw new NotFoundException('Your sign-in isn’t linked to an employee record yet. Ask HR to link it from your employee page.');
    const open = await this.prisma.rndtechnosoft_employee_separations.findFirst({ where: { tenant_id: tenantId, employee_id: employee.id, separation_status: { in: OPEN } }, select: { id: true, separation_status: true } });
    if (!open) throw new NotFoundException('You have no resignation to withdraw.');
    if (open.separation_status !== 'PENDING_APPROVAL') throw new BadRequestException('HR has already accepted your resignation. Ask HR to cancel it.');
    await this.transition(tenantId, open.id, ['PENDING_APPROVAL'], {
      separation_status: 'WITHDRAWN', closed_at: new Date(), closed_by_tenant_member_id: actor.tenantMemberId, close_reason: input.reason?.trim() || null,
    });
    await this.log(tenantId, actor, 'SEPARATION_WITHDRAWN', open.id, { old: { status: 'PENDING_APPROVAL' }, new: { status: 'WITHDRAWN' } });
    this.notifications.notify(tenantId, 'RESIGNATION_WITHDRAWN', open.id, { actor });
    return this.mine(tenantId, actor);
  }

  // ── HR ──────────────────────────────────────────────────────

  async summary(tenantId: string) {
    const today = await this.today(tenantId);
    const [pending, inProgress, leavingSoon, overdue] = await Promise.all([
      this.count(tenantId, { separation_status: 'PENDING_APPROVAL' }),
      this.count(tenantId, { separation_status: 'IN_PROGRESS' }),
      this.count(tenantId, { separation_status: 'IN_PROGRESS', last_working_date: { gte: dateOnly(today), lte: dateOnly(addDays(today, 30)) } }),
      this.count(tenantId, { separation_status: 'IN_PROGRESS', last_working_date: { lt: dateOnly(today) } }),
    ]);
    return { pendingApproval: pending, inProgress, leavingIn30Days: leavingSoon, pastLastDay: overdue };
  }

  async list(tenantId: string, query: ListSeparationsQueryDto) {
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_employee_separationsWhereInput = {
      tenant_id: tenantId,
      ...(query.status ? { separation_status: query.status } : {}),
      ...(search ? {
        rndtechnosoft_employees: {
          OR: [
            { first_name: { contains: search, mode: 'insensitive' } },
            { last_name: { contains: search, mode: 'insensitive' } },
            { employee_code: { contains: search, mode: 'insensitive' } },
          ],
        },
      } : {}),
    };
    const [total, rows] = await Promise.all([
      this.prisma.rndtechnosoft_employee_separations.count({ where }),
      this.prisma.rndtechnosoft_employee_separations.findMany({
        where,
        include: { rndtechnosoft_employees: EMPLOYEE, rndtechnosoft_separation_clearance_items: { select: { item_status: true } } },
        orderBy: [{ last_working_date: 'asc' }, { created_at: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return {
      items: rows.map((r) => ({
        id: r.id,
        employee: this.person(r.rndtechnosoft_employees),
        type: r.separation_type,
        status: r.separation_status,
        isSelfService: r.is_self_service,
        noticeDate: day(r.notice_date),
        lastWorkingDate: day(r.last_working_date),
        checklist: { done: r.rndtechnosoft_separation_clearance_items.filter((i) => i.item_status !== 'PENDING').length, total: r.rndtechnosoft_separation_clearance_items.length },
      })),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  /** The exit as HR sees it; with the actor, which checklist items they can clear or waive. */
  async detail(tenantId: string, id: string, actor?: Actor) {
    const row = await this.find(tenantId, id);
    const isOwnExit = !!actor && row.rndtechnosoft_employees.user_id === actor.userId;
    const employee = row.rndtechnosoft_employees;
    const [comments, today, permissions, directReports, member, paidThrough, obligations, laterEmployments] = await Promise.all([
      this.prisma.rndtechnosoft_separation_comments.findMany({ where: { tenant_id: tenantId, separation_id: id }, orderBy: { created_at: 'asc' }, take: 200, include: { author: memberName } }),
      this.today(tenantId),
      actor ? this.checklist.permissions(tenantId, actor) : new Set<string>(),
      this.directReports(tenantId, employee.id, row.last_working_date),
      this.signIn(this.prisma, tenantId, employee.user_id),
      finalizedThrough(this.prisma, tenantId, employee.id),
      this.obligations(tenantId, employee.id, row.last_working_date),
      this.prisma.rndtechnosoft_employee_employments.count({ where: { tenant_id: tenantId, employee_id: employee.id, effective_from: { gt: row.last_working_date } } }),
    ]);
    const reports = directReports.length;
    const notice = noticeOf({
      noticeDate: isoDate(row.notice_date),
      requiredDays: row.notice_period_days,
      requestedLastDay: isoDate(row.requested_last_working_date),
      lastDay: isoDate(row.last_working_date),
    });
    const lastDay = isoDate(row.last_working_date);
    // Optional items never hold the exit back.
    const pending = row.rndtechnosoft_separation_clearance_items.filter((i) => i.item_status === 'PENDING' && i.is_required).length;
    const blockers: string[] = [];
    if (row.separation_status === 'IN_PROGRESS') {
      if (lastDay > today) blockers.push(`The last working day, ${lastDay}, hasn’t come yet.`);
      if (pending) blockers.push(`${pending} required checklist item${pending > 1 ? 's are' : ' is'} still open.`);
      if (reports) blockers.push(`${reports} ${reports > 1 ? 'people still report' : 'person still reports'} to ${fullName(employee)} after their last day. Give them a new manager first.`);
      if (notice.shortfallDays > 0 && !row.notice_shortfall_decision) blockers.push(`Decide whether to recover or waive the ${notice.shortfallDays}-day notice shortfall.`);
      const financeWaived = row.rndtechnosoft_separation_clearance_items.some((i) => i.clearance_team === 'FINANCE' && i.item_status === 'WAIVED');
      if (obligations.loans.length && !financeWaived) blockers.push(`${obligations.loans.length} loan or advance${obligations.loans.length > 1 ? 's are' : ' is'} not settled (${obligations.outstanding} outstanding). Settle ${obligations.loans.length > 1 ? 'them' : 'it'}, or waive the Finance checklist item with the reason.`);
      if (laterEmployments) blockers.push('An employment record starts after the last working day. Correct it on the employee’s page first.');
    }
    const warnings: string[] = [];
    if (OPEN.includes(row.separation_status as SeparationStatus)) {
      if (paidThrough && isoDate(paidThrough) > lastDay) warnings.push(`Payroll is already finalized through ${isoDate(paidThrough)}, after the last working day. Pay for the days after it has been paid; recover it with a payroll deduction.`);
    }

    return {
      ...this.ownView(row),
      reason: row.separation_reason,
      requestedBy: who(row.requested_by),
      approvedBy: who(row.approved_by),
      completedBy: who(row.completed_by),
      closedBy: who(row.closed_by),
      closeReason: row.close_reason,
      exitInterview: row.exit_interview_date
        ? { date: isoDate(row.exit_interview_date), notes: row.exit_interview_notes, rehireEligible: row.rehire_eligible, recordedBy: who(row.interview_by) }
        : null,
      checklist: row.rndtechnosoft_separation_clearance_items.map((i) => {
        const owns = row.separation_status === 'IN_PROGRESS' && !isOwnExit && canClearTeam(permissions, i.clearance_team as ClearanceTeam);
        return {
          id: i.id, team: i.clearance_team, title: i.item_title, description: i.item_description, isRequired: i.is_required,
          dueDate: isoDate(i.due_date ?? row.last_working_date), hasOwnDueDate: !!i.due_date,
          assignedTo: i.assigned_tenant_member_id ? { id: i.assigned_tenant_member_id, name: who(i.assigned_to) } : null,
          status: i.item_status, note: i.clearance_note, waiverReason: i.waiver_reason, clearedBy: who(i.cleared_by), clearedAt: i.cleared_at?.toISOString() ?? null,
          canClear: owns, canWaive: owns,
        };
      }),
      hasSignIn: !!member && member.membership_status === 'ACTIVE',
      notice: {
        ...notice,
        decision: row.notice_shortfall_decision as 'RECOVER' | 'WAIVE' | null,
        decisionReason: row.notice_decision_reason,
        decidedBy: who(row.notice_decided_by),
        decidedAt: row.notice_decided_at?.toISOString() ?? null,
      },
      dateChanges: row.rndtechnosoft_separation_date_changes.map((c) => ({
        from: isoDate(c.previous_last_working_date), to: isoDate(c.new_last_working_date), reason: c.change_reason, changedBy: who(c.changed_by), changedAt: c.created_at.toISOString(),
      })),
      directReports,
      managerComments: comments.map((c) => ({ id: c.id, kind: c.comment_kind, body: c.comment_body, author: who(c.author), createdAt: c.created_at.toISOString() })),
      obligations,
      today,
      blockers,
      warnings,
    };
  }

  /** Active employees without an open exit, to start one for: at most 20 matches. */
  async searchEmployees(tenantId: string, search: string | undefined) {
    const term = search?.trim();
    const rows = await this.prisma.rndtechnosoft_employees.findMany({
      where: {
        tenant_id: tenantId, employee_status: 'ACTIVE', archived_at: null,
        rndtechnosoft_employee_separations: { none: { separation_status: { in: OPEN } } },
        ...(term ? { OR: [
          { first_name: { contains: term, mode: 'insensitive' } },
          { last_name: { contains: term, mode: 'insensitive' } },
          { employee_code: { contains: term, mode: 'insensitive' } },
        ] } : {}),
      },
      ...EMPLOYEE,
      orderBy: [{ first_name: 'asc' }, { employee_code: 'asc' }],
      take: 20,
    });
    return rows.map((e) => ({ ...this.person(e), noticePeriodDays: e.rndtechnosoft_employee_employments[0]?.notice_period_days ?? null }));
  }

  async start(tenantId: string, input: StartSeparationDto, actor: Actor) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.employeeId }, ...EMPLOYEE });
    if (!employee) throw new NotFoundException('Employee not found.');
    if (employee.employee_status !== 'ACTIVE' || employee.archived_at) throw new BadRequestException('Only an active employee’s exit can be started.');
    if (employee.user_id === actor.userId) throw new ForbiddenException('You can’t start your own exit here. Resign from My resignation, and someone else in HR will accept it.');
    const today = await this.today(tenantId);
    if (input.noticeDate > today) throw new BadRequestException('The notice date can’t be in the future.');
    if (input.lastWorkingDate < input.noticeDate) throw new BadRequestException('The last working day can’t be before the notice date.');

    const id = randomUUID();
    const extra = await this.checklist.template(tenantId);
    await this.createOpen(() => this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.rndtechnosoft_employee_separations.create({
        data: {
          id, tenant_id: tenantId, employee_id: employee.id, separation_type: input.type, separation_status: 'IN_PROGRESS',
          separation_reason: input.reason.trim(), notice_date: dateOnly(input.noticeDate), notice_period_days: employee.rndtechnosoft_employee_employments[0]?.notice_period_days ?? null,
          requested_last_working_date: dateOnly(input.lastWorkingDate), last_working_date: dateOnly(input.lastWorkingDate),
          is_self_service: false, requested_by_tenant_member_id: actor.tenantMemberId, approved_by_tenant_member_id: actor.tenantMemberId, approved_at: now,
        },
      });
      await this.createChecklist(tx, tenantId, id, extra);
    }));
    await this.log(tenantId, actor, 'SEPARATION_STARTED', id, { new: { employee_id: employee.id, type: input.type, notice_date: input.noticeDate, last_working_date: input.lastWorkingDate } });
    this.notifications.notify(tenantId, 'EXIT_STARTED', id, { actor });
    this.notifications.notify(tenantId, 'CHECKLIST_ASSIGNED', id, { actor });
    return this.detail(tenantId, id, actor);
  }

  /** Accepts a resignation, agreeing the last working day, and opens the exit checklist. */
  async approve(tenantId: string, id: string, input: LastWorkingDateDto, actor: Actor) {
    const { lastWorkingDate } = input;
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'accept your own resignation');
    if (lastWorkingDate < isoDate(row.notice_date)) throw new BadRequestException('The last working day can’t be before the day notice was given.');
    const extra = await this.checklist.template(tenantId);
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tenantId, id, ['PENDING_APPROVAL'], {
        separation_status: 'IN_PROGRESS', last_working_date: dateOnly(lastWorkingDate), approved_at: new Date(), approved_by_tenant_member_id: actor.tenantMemberId,
      }, tx);
      await this.recordDateChange(tx, tenantId, id, row.last_working_date, lastWorkingDate, input.reason, actor);
      await this.createChecklist(tx, tenantId, id, extra);
    });
    await this.log(tenantId, actor, 'SEPARATION_APPROVED', id, { old: { status: row.separation_status, last_working_date: isoDate(row.last_working_date) }, new: { status: 'IN_PROGRESS', last_working_date: lastWorkingDate } });
    this.notifications.notify(tenantId, 'RESIGNATION_ACCEPTED', id, { actor });
    this.notifications.notify(tenantId, 'CHECKLIST_ASSIGNED', id, { actor });
    return this.detail(tenantId, id, actor);
  }

  async changeLastWorkingDate(tenantId: string, id: string, input: LastWorkingDateDto, actor: Actor) {
    const { lastWorkingDate } = input;
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'change your own last working day');
    if (lastWorkingDate < isoDate(row.notice_date)) throw new BadRequestException('The last working day can’t be before the day notice was given.');
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tenantId, id, ['IN_PROGRESS'], { last_working_date: dateOnly(lastWorkingDate) }, tx);
      await this.recordDateChange(tx, tenantId, id, row.last_working_date, lastWorkingDate, input.reason, actor);
    });
    await this.log(tenantId, actor, 'SEPARATION_LAST_DAY_CHANGED', id, { old: { last_working_date: isoDate(row.last_working_date) }, new: { last_working_date: lastWorkingDate }, reason: input.reason?.trim() || null });
    return this.detail(tenantId, id, actor);
  }

  async recordInterview(tenantId: string, id: string, input: ExitInterviewDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'record your own exit interview');
    await this.transition(tenantId, id, ['IN_PROGRESS', 'COMPLETED'], {
      exit_interview_date: dateOnly(input.interviewDate), exit_interview_notes: input.notes.trim(), rehire_eligible: input.rehireEligible ?? null,
      exit_interview_recorded_by_tenant_member_id: actor.tenantMemberId,
    });
    // The notes stay on the exit; the audit trail records only that they changed.
    await this.log(tenantId, actor, 'SEPARATION_INTERVIEW_RECORDED', id, { new: { interview_date: input.interviewDate, rehire_eligible: input.rehireEligible ?? null } });
    return this.detail(tenantId, id, actor);
  }

  async addChecklistItem(tenantId: string, id: string, input: ClearanceItemDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('Checklist items can only be added while the exit is under way.');
    if (input.assignedMemberId) await this.checklist.assertOwner(tenantId, input.team, input.assignedMemberId);
    const last = row.rndtechnosoft_separation_clearance_items.reduce((max, i) => Math.max(max, i.display_order), 0);
    const itemId = randomUUID();
    await this.prisma.rndtechnosoft_separation_clearance_items.create({
      data: {
        id: itemId, tenant_id: tenantId, separation_id: id, clearance_team: input.team, item_title: input.title.trim(), item_description: input.description?.trim() || null,
        is_required: input.isRequired ?? true, due_date: input.dueDate ? dateOnly(input.dueDate) : null, assigned_tenant_member_id: input.assignedMemberId ?? null, display_order: last + 1,
      },
    });
    await this.log(tenantId, actor, 'SEPARATION_ITEM_ADDED', id, { new: { item_id: itemId, team: input.team, required: input.isRequired ?? true, due_date: input.dueDate ?? null, assigned_member_id: input.assignedMemberId ?? null } });
    return this.detail(tenantId, id, actor);
  }

  /** Changes an item's description, whether it is required, its due date or who has it. HR only. */
  async updateChecklistDetails(tenantId: string, id: string, itemId: string, input: ClearanceDetailsDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('The checklist can only change while the exit is under way.');
    const item = row.rndtechnosoft_separation_clearance_items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found.');
    if (input.assignedMemberId) await this.checklist.assertOwner(tenantId, item.clearance_team as ClearanceTeam, input.assignedMemberId);
    const data = {
      ...(input.description !== undefined ? { item_description: input.description.trim() || null } : {}),
      ...(input.isRequired !== undefined ? { is_required: input.isRequired } : {}),
      ...(input.dueDate !== undefined ? { due_date: input.dueDate ? dateOnly(input.dueDate) : null } : {}),
      ...(input.assignedMemberId !== undefined ? { assigned_tenant_member_id: input.assignedMemberId } : {}),
    };
    await this.prisma.rndtechnosoft_separation_clearance_items.update({ where: { tenant_id_id: { tenant_id: tenantId, id: itemId } }, data: { ...data, updated_at: new Date() } });
    await this.log(tenantId, actor, 'SEPARATION_ITEM_DETAILS_CHANGED', id, {
      item_id: itemId,
      old: { description: item.item_description, required: item.is_required, due_date: day(item.due_date), assigned_member_id: item.assigned_tenant_member_id },
      new: { description: data.item_description, required: data.is_required, due_date: input.dueDate, assigned_member_id: input.assignedMemberId },
    });
    return this.detail(tenantId, id, actor);
  }

  /** An item reached from its owners' list, without the exit's id. */
  async updateChecklistItemById(tenantId: string, itemId: string, input: ClearanceUpdateDto, actor: Actor) {
    const item = await this.prisma.rndtechnosoft_separation_clearance_items.findFirst({ where: { tenant_id: tenantId, id: itemId }, select: { separation_id: true } });
    if (!item) throw new NotFoundException('Checklist item not found.');
    await this.updateChecklistItem(tenantId, item.separation_id, itemId, input, actor);
    return this.checklist.mine(tenantId, actor);
  }

  /**
   * Clears, waives or reopens an item. Each team clears and waives only its
   * own items; HR's override covers all of them. A waiver needs its reason.
   */
  async updateChecklistItem(tenantId: string, id: string, itemId: string, input: ClearanceUpdateDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'clear your own exit checklist');
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('The checklist can only change while the exit is under way.');
    const item = row.rndtechnosoft_separation_clearance_items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found.');
    const team = item.clearance_team as ClearanceTeam;
    if (!canClearTeam(await this.checklist.permissions(tenantId, actor), team)) {
      throw new ForbiddenException(team === 'MANAGER' ? 'The manager clears this item from My team.' : `Only ${TEAM_NAME[team]} clears this item.`);
    }
    const note = input.note?.trim() || null;
    const waiverReason = input.waiverReason?.trim() || null;
    if (input.status === 'WAIVED' && !waiverReason) throw new BadRequestException('Say why this item is being waived.');
    if (input.status === 'CLEARED' && item.clearance_team === 'FINANCE') {
      const { loans, outstanding } = await this.obligations(tenantId, row.employee_id, row.last_working_date);
      if (loans.length) throw new BadRequestException(`Finance can’t be cleared while ${outstanding} in loans or advances is outstanding. Settle them, or waive this item with the reason.`);
    }
    const done = input.status !== 'PENDING';
    // Only from the status it was read in, so two people acting at once can't both succeed.
    const changed = await this.prisma.rndtechnosoft_separation_clearance_items.updateMany({
      where: { tenant_id: tenantId, id: itemId, item_status: item.item_status },
      data: {
        item_status: input.status, clearance_note: note, waiver_reason: input.status === 'WAIVED' ? waiverReason : null,
        cleared_at: done ? new Date() : null, cleared_by_tenant_member_id: done ? actor.tenantMemberId : null, updated_at: new Date(),
      },
    });
    if (changed.count !== 1) throw new ConflictException('This item changed while you were working. Reload and try again.');
    await this.log(tenantId, actor, input.status === 'WAIVED' ? 'SEPARATION_ITEM_WAIVED' : 'SEPARATION_ITEM_UPDATED', id, {
      item_id: itemId, team, old: { status: item.item_status, waiver_reason: item.waiver_reason }, new: { status: input.status, waiver_reason: input.status === 'WAIVED' ? waiverReason : null },
    });
    return this.detail(tenantId, id, actor);
  }

  /** Records whether a notice-period shortfall is recovered or waived; a waiver needs a reason. */
  async decideNotice(tenantId: string, id: string, input: NoticeDecisionDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'decide your own notice period');
    const reason = input.reason?.trim() || null;
    if (input.decision === 'WAIVE' && !reason) throw new BadRequestException('Say why the notice shortfall is being waived.');
    const notice = noticeOf({ noticeDate: isoDate(row.notice_date), requiredDays: row.notice_period_days, requestedLastDay: isoDate(row.requested_last_working_date), lastDay: isoDate(row.last_working_date) });
    if (notice.shortfallDays === 0) throw new BadRequestException('This exit has no notice shortfall to decide.');
    await this.transition(tenantId, id, OPEN, {
      notice_shortfall_decision: input.decision, notice_decision_reason: reason, notice_decided_by_tenant_member_id: actor.tenantMemberId, notice_decided_at: new Date(),
    });
    await this.log(tenantId, actor, 'SEPARATION_NOTICE_DECIDED', id, {
      old: { decision: row.notice_shortfall_decision }, new: { decision: input.decision, shortfall_days: notice.shortfallDays }, reason,
    });
    return this.detail(tenantId, id, actor);
  }

  /**
   * Gives the leaver's direct reports a new manager from the day after the
   * last working day, through the employee page's own rules (no loops, no
   * overlaps). Reports that cannot be moved are listed with the reason.
   */
  async reassignReports(tenantId: string, id: string, input: ReassignReportsDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'reassign your own team');
    if (!OPEN.includes(row.separation_status as SeparationStatus)) throw new BadRequestException('Reports can only be reassigned while the exit is open.');
    if (input.managerEmployeeId === row.employee_id) throw new BadRequestException('Choose someone other than the person leaving.');
    const reports = await this.directReports(tenantId, row.employee_id, row.last_working_date);
    const chosen = input.employeeIds?.length ? reports.filter((r) => input.employeeIds!.includes(r.id)) : reports;
    const from = addDays(isoDate(row.last_working_date), 1);
    const failed: { employeeId: string; name: string; reason: string }[] = [];
    for (const report of chosen) {
      try {
        await this.relations.setManager(tenantId, report.id, { managerEmployeeId: input.managerEmployeeId, effectiveFrom: from, reason: `Previous manager leaving (exit ${id})` }, actor);
      } catch (error) {
        if (!(error instanceof BadRequestException || error instanceof ConflictException || error instanceof NotFoundException)) throw error;
        failed.push({ employeeId: report.id, name: report.name, reason: error.message });
      }
    }
    await this.log(tenantId, actor, 'SEPARATION_REPORTS_REASSIGNED', id, {
      new: { manager_employee_id: input.managerEmployeeId, effective_from: from, moved: chosen.length - failed.length, failed: failed.length },
    });
    return { exit: await this.detail(tenantId, id, actor), failed };
  }

  async cancel(tenantId: string, id: string, input: CancelSeparationDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'cancel your own exit');
    await this.transition(tenantId, id, OPEN, {
      separation_status: 'CANCELLED', closed_at: new Date(), closed_by_tenant_member_id: actor.tenantMemberId, close_reason: input.reason.trim(),
    });
    await this.log(tenantId, actor, 'SEPARATION_CANCELLED', id, { old: { status: row.separation_status }, new: { status: 'CANCELLED' } });
    return this.detail(tenantId, id, actor);
  }

  /**
   * The employee leaves: their exit date becomes the last working day (payroll
   * pays up to it and no further), they are marked exited, and their sign-in to
   * this workspace is suspended with its sessions ended at once. Their records,
   * payslips and history stay.
   */
  async complete(tenantId: string, id: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'complete your own exit');
    const detail = await this.detail(tenantId, id);
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('Only an exit that is under way can be completed.');
    if (detail.blockers.length) throw new BadRequestException(`This exit can’t be completed yet. ${detail.blockers.join(' ')}`);

    const employee = row.rndtechnosoft_employees;
    const member = await this.signIn(this.prisma, tenantId, employee.user_id);
    const ending = member && member.membership_status === 'ACTIVE' ? member : null;
    if (ending) {
      if (isDemoMode()) throw new ForbiddenException('In the demo workspace, exits of people who can sign in can’t be completed, so the demo stays open for everyone.');
      // Ending someone's sign-in needs at least the access they have, as on the Team page.
      await this.access.assertHoldsAll(tenantId, actor.tenantMemberId, await this.access.getMemberPermissions(tenantId, ending.id), 'You can’t end the sign-in of someone who has access you don’t have. Ask an administrator to complete this exit.');
    }
    const lastDay = row.last_working_date;
    let closed: Awaited<ReturnType<OffboardingService['closeRecords']>> | null = null;

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.transition(tenantId, id, ['IN_PROGRESS'], { separation_status: 'COMPLETED', completed_at: now, completed_by_tenant_member_id: actor.tenantMemberId }, tx);
      await tx.rndtechnosoft_employees.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: employee.id } },
        data: { employee_status: 'EXITED', exit_date: lastDay, updated_at: now },
      });
      closed = await this.closeRecords(tx, tenantId, employee.id, lastDay, actor, now);
      if (ending) {
        if (ending.isAdmin) await this.assertAnotherActiveAdmin(tx, tenantId, ending.id);
        await tx.rndtechnosoft_tenant_members.update({ where: { tenant_id_id: { tenant_id: tenantId, id: ending.id } }, data: { membership_status: 'SUSPENDED', updated_at: now } });
        await tx.rndtechnosoft_user_sessions.updateMany({ where: { tenant_id: tenantId, tenant_member_id: ending.id, revoked_at: null }, data: { revoked_at: now } });
      }
    });

    await this.log(tenantId, actor, 'SEPARATION_COMPLETED', id, {
      employee_id: employee.id,
      old: { status: 'IN_PROGRESS', employee_status: employee.employee_status },
      new: { status: 'COMPLETED', employee_status: 'EXITED', exit_date: isoDate(lastDay), sign_in_suspended: !!ending, sessions_ended: !!ending },
      records_closed: closed,
    });
    this.notifications.notify(tenantId, 'EXIT_COMPLETED', id, { actor });
    return this.detail(tenantId, id, actor);
  }

  // ── Helpers ─────────────────────────────────────────────────

  /** What the employee sees of their own exit: no exit-interview notes, waiver notes or rehire decision. */
  private ownView(row: SeparationRow) {
    return {
      id: row.id,
      employee: this.person(row.rndtechnosoft_employees),
      type: row.separation_type,
      status: row.separation_status,
      isSelfService: row.is_self_service,
      reason: row.is_self_service ? row.separation_reason : null,
      noticeDate: isoDate(row.notice_date),
      noticePeriodDays: row.notice_period_days,
      requestedLastWorkingDate: isoDate(row.requested_last_working_date),
      lastWorkingDate: isoDate(row.last_working_date),
      approvedAt: row.approved_at?.toISOString() ?? null,
      completedAt: row.completed_at?.toISOString() ?? null,
      closedAt: row.closed_at?.toISOString() ?? null,
      exitInterviewDate: day(row.exit_interview_date),
      checklist: row.rndtechnosoft_separation_clearance_items.map((i) => ({ id: i.id, team: i.clearance_team, title: i.item_title, status: i.item_status, clearedAt: i.cleared_at?.toISOString() ?? null })),
    };
  }

  private person(e: EmployeeRow) {
    const employment = e.rndtechnosoft_employee_employments[0];
    return {
      id: e.id, code: e.employee_code, name: fullName(e),
      department: employment?.rndtechnosoft_departments?.department_name ?? null,
      designation: employment?.rndtechnosoft_designations?.designation_name ?? null,
    };
  }

  /** People whose primary manager is the leaver on any day after the last working day. */
  private async directReports(tenantId: string, employeeId: string, lastDay: Date) {
    const lines = await this.prisma.rndtechnosoft_employee_reporting_lines.findMany({
      where: {
        tenant_id: tenantId, manager_employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE',
        OR: [{ effective_to: null }, { effective_to: { gt: lastDay } }],
      },
      orderBy: { effective_from: 'asc' },
      select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees: { select: { id: true, employee_code: true, first_name: true, last_name: true, preferred_name: true } } },
    });
    const people = lines.map((l) => l.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees);
    return [...new Map(people.map((p) => [p.id, { id: p.id, code: p.employee_code, name: fullName(p) }])).values()];
  }

  /** Active loans and advances with what is still to be recovered; amounts are decimal strings. */
  private async obligations(tenantId: string, employeeId: string, lastDay: Date) {
    const loans = await this.prisma.rndtechnosoft_employee_loans.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, loan_status: 'ACTIVE' },
      orderBy: { start_date: 'asc' },
      select: {
        id: true, loan_number: true, loan_type: true, principal_amount: true, installment_amount: true,
        rndtechnosoft_loan_installments: { where: { installment_status: { in: ['SCHEDULED', 'DEFERRED'] } }, select: { due_date: true, total_amount: true } },
      },
    });
    const sum = (values: Prisma.Decimal[]) => values.reduce((total, v) => total.add(v), DecimalMath.toDecimal(0));
    const rows = loans.map((l) => {
      const open = l.rndtechnosoft_loan_installments;
      const afterExit = open.filter((i) => i.due_date > lastDay);
      return {
        id: l.id, number: l.loan_number, type: l.loan_type, principal: l.principal_amount.toFixed(2), installment: l.installment_amount.toFixed(2),
        outstanding: sum(open.map((i) => i.total_amount)).toFixed(2),
        installmentsLeft: open.length,
        dueAfterLastDay: sum(afterExit.map((i) => i.total_amount)).toFixed(2),
        installmentsAfterLastDay: afterExit.length,
      };
    });
    return { loans: rows, outstanding: sum(rows.map((r) => DecimalMath.toDecimal(r.outstanding))).toFixed(2) };
  }

  private recordDateChange(tx: Tx, tenantId: string, separationId: string, previous: Date, next: string, reason: string | undefined, actor: Actor) {
    if (isoDate(previous) === next) return Promise.resolve();
    return tx.rndtechnosoft_separation_date_changes.create({
      data: { id: randomUUID(), tenant_id: tenantId, separation_id: separationId, previous_last_working_date: previous, new_last_working_date: dateOnly(next), change_reason: reason?.trim() || null, changed_by_tenant_member_id: actor.tenantMemberId },
    });
  }

  /**
   * Ends everything that applies to the employee after their last day, keeping
   * history: records running past it end on it, and records that would only
   * start after it are cancelled. Nothing is deleted.
   */
  private async closeRecords(tx: Tx, tenantId: string, employeeId: string, lastDay: Date, actor: Actor, now: Date) {
    const scope = { tenant_id: tenantId, employee_id: employeeId };
    const running = { effective_from: { lte: lastDay }, OR: [{ effective_to: null }, { effective_to: { gt: lastDay } }] };
    const later = { effective_from: { gt: lastDay } };
    const why = 'Employee exited before this started';
    const cancelled = { cancelled_at: now, cancelled_by_tenant_member_id: actor.tenantMemberId, cancellation_reason: why, updated_at: now };

    const employments = await tx.rndtechnosoft_employee_employments.updateMany({ where: { ...scope, ...running }, data: { effective_to: lastDay, termination_date: lastDay, updated_at: now } });
    const salary = await tx.rndtechnosoft_employee_salary_assignments.updateMany({ where: { ...scope, ...running, assignment_status: 'ACTIVE' }, data: { effective_to: lastDay, updated_at: now } });
    const salaryCancelled = await tx.rndtechnosoft_employee_salary_assignments.updateMany({ where: { ...scope, ...later, assignment_status: 'ACTIVE' }, data: { assignment_status: 'CANCELLED', ...cancelled } });
    const shifts = await tx.rndtechnosoft_employee_shift_assignments.updateMany({ where: { ...scope, ...running, assignment_status: 'ACTIVE' }, data: { effective_to: lastDay, updated_at: now } });
    const shiftsCancelled = await tx.rndtechnosoft_employee_shift_assignments.updateMany({ where: { ...scope, ...later, assignment_status: 'ACTIVE' }, data: { assignment_status: 'CANCELLED', updated_at: now } });
    const leave = await tx.rndtechnosoft_employee_leave_policy_assignments.updateMany({ where: { ...scope, ...running, assignment_status: 'ACTIVE' }, data: { effective_to: lastDay, updated_at: now } });
    const leaveCancelled = await tx.rndtechnosoft_employee_leave_policy_assignments.updateMany({ where: { ...scope, ...later, assignment_status: 'ACTIVE' }, data: { assignment_status: 'CANCELLED', updated_at: now } });
    const managers = await tx.rndtechnosoft_employee_reporting_lines.updateMany({ where: { ...scope, ...running, line_status: 'ACTIVE' }, data: { effective_to: lastDay, updated_at: now } });
    const managersCancelled = await tx.rndtechnosoft_employee_reporting_lines.updateMany({ where: { ...scope, ...later, line_status: 'ACTIVE' }, data: { line_status: 'CANCELLED', ...cancelled } });
    // Their attendance-device ID stops mapping to an active person; the ID itself stays on record.
    const device = await tx.rndtechnosoft_employee_cosec_mappings.updateMany({
      where: { ...scope, mapping_status: { not: 'DEACTIVATED' } },
      data: { mapping_status: 'DEACTIVATED', review_notes: `Deactivated on exit (last working day ${isoDate(lastDay)})`, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: now },
    });
    return {
      employments: employments.count,
      salaryAssignments: salary.count + salaryCancelled.count,
      shiftAssignments: shifts.count + shiftsCancelled.count,
      leavePolicyAssignments: leave.count + leaveCancelled.count,
      reportingLines: managers.count + managersCancelled.count,
      attendanceDeviceMappings: device.count,
    };
  }

  private async find(tenantId: string, id: string): Promise<SeparationRow> {
    const row = await this.prisma.rndtechnosoft_employee_separations.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL_INCLUDE });
    if (!row) throw new NotFoundException('Exit not found.');
    return row;
  }

  /** Nobody approves, clears or completes their own exit. */
  private notOwn(row: SeparationRow, actor: Actor, action: string) {
    if (row.rndtechnosoft_employees.user_id === actor.userId) throw new ForbiddenException(`You can’t ${action}. Ask someone else in HR.`);
  }

  /** Changes an exit only while it is still in one of the expected states, so two people acting at once can't both succeed. */
  private async transition(tenantId: string, id: string, from: SeparationStatus[], data: Prisma.rndtechnosoft_employee_separationsUncheckedUpdateManyInput, db: Tx | PrismaService = this.prisma) {
    const changed = await db.rndtechnosoft_employee_separations.updateMany({
      where: { tenant_id: tenantId, id, separation_status: { in: from } },
      data: { ...data, updated_at: new Date() },
    });
    if (changed.count !== 1) throw new ConflictException('This exit has changed since you opened it. Reload it and try again.');
  }

  private async createOpen(create: () => Promise<unknown>) {
    try {
      await create();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This employee already has an exit in progress.');
      }
      throw error;
    }
  }

  /** The standard six items, then the workspace's own. */
  private createChecklist(tx: Tx, tenantId: string, separationId: string, extra: ChecklistTemplateItem[]) {
    const items = [...DEFAULT_CHECKLIST.map((i) => ({ ...i, description: null, isRequired: true })), ...extra];
    return tx.rndtechnosoft_separation_clearance_items.createMany({
      data: items.map((item, index) => ({
        id: randomUUID(), tenant_id: tenantId, separation_id: separationId, clearance_team: item.team, item_title: item.title, item_description: item.description, is_required: item.isRequired, display_order: index + 1,
      })),
    });
  }

  private async signIn(db: Tx | PrismaService, tenantId: string, userId: string | null) {
    if (!userId) return null;
    const member = await db.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: userId },
      select: { id: true, membership_status: true, rndtechnosoft_tenant_member_roles: { select: { rndtechnosoft_roles: { select: { role_code: true } } } } },
    });
    return member && { id: member.id, membership_status: member.membership_status, isAdmin: member.rndtechnosoft_tenant_member_roles.some((r) => r.rndtechnosoft_roles.role_code === ADMIN_ROLE_CODE) };
  }

  private async assertAnotherActiveAdmin(tx: Tx, tenantId: string, excludingMemberId: string) {
    const others = await tx.rndtechnosoft_tenant_members.count({
      where: {
        tenant_id: tenantId, id: { not: excludingMemberId }, membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: { some: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE } } },
      },
    });
    if (!others) throw new BadRequestException('This is the only active administrator. Make someone else an administrator before completing this exit.');
  }

  private count(tenantId: string, where: Prisma.rndtechnosoft_employee_separationsWhereInput) {
    return this.prisma.rndtechnosoft_employee_separations.count({ where: { tenant_id: tenantId, ...where } });
  }

  /** Today in the workspace's time zone (India time unless the workspace set another). */
  private async today(tenantId: string): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ timezone: string | null }[]>`
      SELECT settings->>'timezone' AS timezone FROM rndtechnosoft_tenant_settings WHERE tenant_id = ${tenantId}::uuid
    `;
    const zone = rows[0]?.timezone || 'Asia/Kolkata';
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    }
  }

  private log(tenantId: string, actor: Actor, actionCode: string, separationId: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'EMPLOYEE_SEPARATION', entityId: separationId, oldValues, newValues, metadata });
  }
}

function addDays(iso: string, days: number) {
  return isoDate(new Date(dateOnly(iso).getTime() + days * 24 * 3600 * 1000));
}


/**
 * The notice period, counted in calendar days after the day notice was given:
 * notice given on 1 March with 30 days required ends on 31 March. A required
 * period that was never recorded means there is no shortfall to work out.
 */
export function noticeOf(input: { noticeDate: string; requiredDays: number | null; requestedLastDay: string; lastDay: string }) {
  const days = (from: string, to: string) => Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / (24 * 3600 * 1000));
  const servedDays = days(input.noticeDate, input.lastDay);
  if (input.requiredDays === null) {
    return { requiredDays: null, servedDays, requestedLastDay: input.requestedLastDay, contractualLastDay: null, lastDay: input.lastDay, shortfallDays: 0 };
  }
  return {
    requiredDays: input.requiredDays,
    servedDays,
    requestedLastDay: input.requestedLastDay,
    contractualLastDay: addDays(input.noticeDate, input.requiredDays),
    lastDay: input.lastDay,
    shortfallDays: Math.max(0, input.requiredDays - servedDays),
  };
}
