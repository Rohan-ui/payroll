import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { isDemoMode } from '@/common/demo/demo-mode';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, finalizedThrough, isoDate } from '@/modules/payroll/payroll-lock';
import {
  CancelSeparationDto, ClearanceItemDto, ClearanceTeam, ClearanceUpdateDto, ExitInterviewDto, ListSeparationsQueryDto,
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
  rndtechnosoft_separation_clearance_items: { orderBy: { display_order: 'asc' }, include: { cleared_by: memberName } },
  requested_by: memberName,
  approved_by: memberName,
  interview_by: memberName,
  completed_by: memberName,
  closed_by: memberName,
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
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly access: AccessService) {}

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

  async detail(tenantId: string, id: string) {
    const row = await this.find(tenantId, id);
    const today = await this.today(tenantId);
    const employee = row.rndtechnosoft_employees;
    const [reports, member, paidThrough] = await Promise.all([
      this.prisma.rndtechnosoft_employee_reporting_lines.count({
        where: {
          tenant_id: tenantId, manager_employee_id: employee.id, relationship_type: 'PRIMARY', line_status: 'ACTIVE',
          OR: [{ effective_to: null }, { effective_to: { gt: row.last_working_date } }],
        },
      }),
      this.signIn(this.prisma, tenantId, employee.user_id),
      finalizedThrough(this.prisma, tenantId, employee.id),
    ]);
    const lastDay = isoDate(row.last_working_date);
    const pending = row.rndtechnosoft_separation_clearance_items.filter((i) => i.item_status === 'PENDING').length;
    const blockers: string[] = [];
    if (row.separation_status === 'IN_PROGRESS') {
      if (lastDay > today) blockers.push(`The last working day, ${lastDay}, hasn’t come yet.`);
      if (pending) blockers.push(`${pending} checklist item${pending > 1 ? 's are' : ' is'} still open.`);
    }
    const warnings: string[] = [];
    if (OPEN.includes(row.separation_status as SeparationStatus)) {
      if (reports) warnings.push(`${reports} ${reports > 1 ? 'people report' : 'person reports'} to ${fullName(employee)} after their last day. Give them a new manager from their employee page.`);
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
      checklist: row.rndtechnosoft_separation_clearance_items.map((i) => ({
        id: i.id, team: i.clearance_team, title: i.item_title, status: i.item_status, note: i.clearance_note, clearedBy: who(i.cleared_by), clearedAt: i.cleared_at?.toISOString() ?? null,
      })),
      hasSignIn: !!member && member.membership_status === 'ACTIVE',
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
      await this.createChecklist(tx, tenantId, id);
    }));
    await this.log(tenantId, actor, 'SEPARATION_STARTED', id, { new: { employee_id: employee.id, type: input.type, notice_date: input.noticeDate, last_working_date: input.lastWorkingDate } });
    return this.detail(tenantId, id);
  }

  /** Accepts a resignation, agreeing the last working day, and opens the exit checklist. */
  async approve(tenantId: string, id: string, lastWorkingDate: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'accept your own resignation');
    if (lastWorkingDate < isoDate(row.notice_date)) throw new BadRequestException('The last working day can’t be before the day notice was given.');
    await this.prisma.$transaction(async (tx) => {
      await this.transition(tenantId, id, ['PENDING_APPROVAL'], {
        separation_status: 'IN_PROGRESS', last_working_date: dateOnly(lastWorkingDate), approved_at: new Date(), approved_by_tenant_member_id: actor.tenantMemberId,
      }, tx);
      await this.createChecklist(tx, tenantId, id);
    });
    await this.log(tenantId, actor, 'SEPARATION_APPROVED', id, { old: { status: row.separation_status, last_working_date: isoDate(row.last_working_date) }, new: { status: 'IN_PROGRESS', last_working_date: lastWorkingDate } });
    return this.detail(tenantId, id);
  }

  async changeLastWorkingDate(tenantId: string, id: string, lastWorkingDate: string, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'change your own last working day');
    if (lastWorkingDate < isoDate(row.notice_date)) throw new BadRequestException('The last working day can’t be before the day notice was given.');
    await this.transition(tenantId, id, ['IN_PROGRESS'], { last_working_date: dateOnly(lastWorkingDate) });
    await this.log(tenantId, actor, 'SEPARATION_LAST_DAY_CHANGED', id, { old: { last_working_date: isoDate(row.last_working_date) }, new: { last_working_date: lastWorkingDate } });
    return this.detail(tenantId, id);
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
    return this.detail(tenantId, id);
  }

  async addChecklistItem(tenantId: string, id: string, input: ClearanceItemDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('Checklist items can only be added while the exit is under way.');
    const last = row.rndtechnosoft_separation_clearance_items.reduce((max, i) => Math.max(max, i.display_order), 0);
    const itemId = randomUUID();
    await this.prisma.rndtechnosoft_separation_clearance_items.create({
      data: { id: itemId, tenant_id: tenantId, separation_id: id, clearance_team: input.team, item_title: input.title.trim(), display_order: last + 1 },
    });
    await this.log(tenantId, actor, 'SEPARATION_ITEM_ADDED', id, { new: { item_id: itemId, team: input.team } });
    return this.detail(tenantId, id);
  }

  async updateChecklistItem(tenantId: string, id: string, itemId: string, input: ClearanceUpdateDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'clear your own exit checklist');
    if (row.separation_status !== 'IN_PROGRESS') throw new BadRequestException('The checklist can only change while the exit is under way.');
    const item = row.rndtechnosoft_separation_clearance_items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException('Checklist item not found.');
    const note = input.note?.trim() || null;
    if (input.status === 'WAIVED' && !note) throw new BadRequestException('Say why this item is being waived.');
    const done = input.status !== 'PENDING';
    await this.prisma.rndtechnosoft_separation_clearance_items.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: itemId } },
      data: { item_status: input.status, clearance_note: note, cleared_at: done ? new Date() : null, cleared_by_tenant_member_id: done ? actor.tenantMemberId : null, updated_at: new Date() },
    });
    await this.log(tenantId, actor, 'SEPARATION_ITEM_UPDATED', id, { item_id: itemId, old: { status: item.item_status }, new: { status: input.status } });
    return this.detail(tenantId, id);
  }

  async cancel(tenantId: string, id: string, input: CancelSeparationDto, actor: Actor) {
    const row = await this.find(tenantId, id);
    this.notOwn(row, actor, 'cancel your own exit');
    await this.transition(tenantId, id, OPEN, {
      separation_status: 'CANCELLED', closed_at: new Date(), closed_by_tenant_member_id: actor.tenantMemberId, close_reason: input.reason.trim(),
    });
    await this.log(tenantId, actor, 'SEPARATION_CANCELLED', id, { old: { status: row.separation_status }, new: { status: 'CANCELLED' } });
    return this.detail(tenantId, id);
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

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await this.transition(tenantId, id, ['IN_PROGRESS'], { separation_status: 'COMPLETED', completed_at: now, completed_by_tenant_member_id: actor.tenantMemberId }, tx);
      await tx.rndtechnosoft_employees.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: employee.id } },
        data: { employee_status: 'EXITED', exit_date: lastDay, updated_at: now },
      });
      const employment = employee.rndtechnosoft_employee_employments[0];
      if (employment) {
        await tx.rndtechnosoft_employee_employments.update({ where: { tenant_id_id: { tenant_id: tenantId, id: employment.id } }, data: { termination_date: lastDay, updated_at: now } });
      }
      if (ending) {
        if (ending.isAdmin) await this.assertAnotherActiveAdmin(tx, tenantId, ending.id);
        await tx.rndtechnosoft_tenant_members.update({ where: { tenant_id_id: { tenant_id: tenantId, id: ending.id } }, data: { membership_status: 'SUSPENDED', updated_at: now } });
        await tx.rndtechnosoft_user_sessions.updateMany({ where: { tenant_id: tenantId, tenant_member_id: ending.id, revoked_at: null }, data: { revoked_at: now } });
      }
    });

    await this.log(tenantId, actor, 'SEPARATION_COMPLETED', id, {
      employee_id: employee.id,
      old: { status: 'IN_PROGRESS', employee_status: employee.employee_status },
      new: { status: 'COMPLETED', employee_status: 'EXITED', exit_date: isoDate(lastDay), sign_in_suspended: !!ending },
    });
    return this.detail(tenantId, id);
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

  private createChecklist(tx: Tx, tenantId: string, separationId: string) {
    return tx.rndtechnosoft_separation_clearance_items.createMany({
      data: DEFAULT_CHECKLIST.map((item, index) => ({ id: randomUUID(), tenant_id: tenantId, separation_id: separationId, clearance_team: item.team, item_title: item.title, display_order: index + 1 })),
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
