import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { decimal, personName } from './performance-common';
import { TEMPLATE_VERSION } from './templates.service';
import { AssignReviewerDto, DecideNominationDto, NominateDto, TargetsDto } from './dto/performance-cycles.dto';
import { AppraisalRuntimeService, LIVE, loadRun, Run, today } from './appraisal/appraisal-runtime.service';
import { formLines, visibility } from './appraisal/appraisal-lines';
import { AssignmentStatus } from './workflow/workflow-engine';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;
const MEMBER = { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const memberName = (m: { rndtechnosoft_users: { display_name: string | null; email: string } } | null | undefined) => (m ? m.rndtechnosoft_users.display_name ?? m.rndtechnosoft_users.email : null);

/**
 * Appraisals once launched: what HR sees and does (reviewers, targets,
 * cancelling), what employees see of their own, and nominations. Every
 * change goes through the runtime with the appraisal locked, so the stages
 * move on by the workflow's rules and history stays in place.
 */
@Injectable()
export class PerformanceAppraisalsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly runtime: AppraisalRuntimeService) {}

  /** An appraisal for people who run cycles: every stage, who reviews and how they were found, targets and nominations. */
  async detail(tenantId: string, appraisalId: string) {
    const run = await loadRun(this.prisma as unknown as Tx, tenantId, appraisalId);
    const [employee, cycle, version, targets, members, nominations] = await Promise.all([
      this.prisma.rndtechnosoft_employees.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.employee_id }, select: { first_name: true, last_name: true, preferred_name: true, employee_code: true, user_id: true } }),
      this.prisma.rndtechnosoft_performance_cycles.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.cycle_id }, select: { id: true, cycle_name: true, period_start: true, period_end: true } }),
      this.prisma.rndtechnosoft_performance_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.template_version_id }, include: { ...TEMPLATE_VERSION, rndtechnosoft_performance_templates: { select: { template_code: true, template_name: true } } } }),
      this.prisma.rndtechnosoft_performance_appraisal_targets.findMany({ where: { tenant_id: tenantId, appraisal_id: appraisalId } }),
      this.prisma.rndtechnosoft_tenant_members.findMany({ where: { tenant_id: tenantId, id: { in: run.assignments.map((a) => a.reviewer_tenant_member_id) } }, ...MEMBER }),
      this.prisma.rndtechnosoft_performance_nominations.findMany({
        where: { tenant_id: tenantId, appraisal_id: appraisalId }, orderBy: { created_at: 'asc' },
        include: { nominee: MEMBER, nominated_by: MEMBER, decided_by: MEMBER },
      }),
    ]);
    const lines = formLines(version, new Map(targets.map((t) => [t.template_kpi_id, { target: t.target_value, threshold: t.threshold_value, stretch: t.stretch_value }])));
    const todayIso = isoDate(today());
    return {
      id: run.appraisal.id,
      status: run.appraisal.appraisal_status,
      currentStep: run.appraisal.current_step,
      employee: { id: run.appraisal.employee_id, name: personName(employee), code: employee.employee_code, hasSignIn: !!employee.user_id },
      cycle: { id: cycle.id, name: cycle.cycle_name, periodStart: isoDate(cycle.period_start), periodEnd: isoDate(cycle.period_end) },
      template: { code: version.rndtechnosoft_performance_templates.template_code, name: version.rndtechnosoft_performance_templates.template_name, version: version.version_number },
      workflow: { version: run.appraisal.workflow_version_id, resolution: run.def.resolution },
      stages: run.def.stages.map((stage) => {
        const row = run.stages.get(stage.key);
        return {
          key: stage.key, name: stage.name, step: stage.step, source: stage.source, action: stage.action, mode: stage.mode,
          minReviewers: stage.minReviewers, maxReviewers: stage.maxReviewers, allowsReplacement: stage.allowsReplacement,
          status: row?.stage_status ?? 'WAITING', dueDate: row?.due_date ? isoDate(row.due_date) : null,
          overdue: !!row?.due_date && ['OPEN', 'NEEDS_REVIEWERS'].includes(row.stage_status) && isoDate(row.due_date) < todayIso,
          note: row?.resolution_note ?? null,
          assignments: run.assignments.filter((a) => a.appraisal_stage_id === row?.id).map((a) => ({
            id: a.id, reviewer: { id: a.reviewer_tenant_member_id, name: memberName(members.find((m) => m.id === a.reviewer_tenant_member_id)) },
            status: a.assignment_status, via: a.found_via, isLead: a.is_lead, reason: a.status_reason, assignedAt: a.assigned_at, submittedAt: a.submitted_at, replaces: a.replaces_assignment_id,
          })),
          nominations: nominations.filter((n) => n.appraisal_stage_id === row?.id).map((n) => ({
            id: n.id, nominee: memberName(n.nominee), nominatedBy: memberName(n.nominated_by), status: n.nomination_status, decidedBy: memberName(n.decided_by), note: n.decision_note,
          })),
        };
      }),
      // KPIs whose targets are set per employee.
      targets: lines.filter((l) => l.targetSource === 'PER_EMPLOYEE').map((l) => ({
        templateKpiId: l.id, kpi: `${l.kraName} → ${l.name}`, method: l.method, unitLabel: l.unitLabel, target: l.target, threshold: l.threshold, stretch: l.stretch,
        set: targets.some((t) => t.template_kpi_id === l.id),
      })),
      cancelledAt: run.appraisal.cancelled_at,
      cancellationReason: run.appraisal.cancellation_reason,
    };
  }

  /**
   * Sets the employee's own targets for KPIs the template leaves open,
   * before anyone has submitted ratings on them.
   */
  async setTargets(tenantId: string, appraisalId: string, input: TargetsDto, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.runtime.lock(tx, tenantId, appraisalId);
      const run = await loadRun(tx, tenantId, appraisalId);
      if (run.appraisal.appraisal_status !== 'IN_PROGRESS') throw new BadRequestException('Targets can only change while the appraisal is under way.');
      const kpis = await tx.rndtechnosoft_performance_template_kpis.findMany({ where: { tenant_id: tenantId, template_version_id: run.appraisal.template_version_id, target_source: 'PER_EMPLOYEE' }, select: { id: true } });
      const open = new Set(kpis.map((k) => k.id));
      if (input.targets.some((t) => !open.has(t.templateKpiId))) throw new BadRequestException('Targets can only be set for KPIs this template sets per employee.');
      const rated = await tx.rndtechnosoft_performance_review_items.count({
        where: { tenant_id: tenantId, template_kpi_id: { in: input.targets.map((t) => t.templateKpiId) }, rndtechnosoft_performance_reviews: { review_status: 'SUBMITTED', rndtechnosoft_performance_reviewer_assignments: { appraisal_id: appraisalId } } },
      });
      if (rated) throw new ConflictException('Someone has already submitted ratings against these targets, so they can no longer change.');
      for (const t of input.targets) {
        const data = { target_value: decimal(t.target), threshold_value: decimal(t.threshold), stretch_value: decimal(t.stretch), set_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() };
        await tx.rndtechnosoft_performance_appraisal_targets.upsert({
          where: { tenant_id_appraisal_id_template_kpi_id: { tenant_id: tenantId, appraisal_id: appraisalId, template_kpi_id: t.templateKpiId } },
          create: { id: randomUUID(), tenant_id: tenantId, appraisal_id: appraisalId, template_kpi_id: t.templateKpiId, ...data },
          update: data,
        });
      }
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TARGETS_SET', appraisalId, { new: { targets: input.targets } });
    return this.detail(tenantId, appraisalId);
  }

  /** Assigns a reviewer to a stage, or replaces one; the replaced one stays in the history. */
  async assign(tenantId: string, appraisalId: string, stageKey: string, input: AssignReviewerDto, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.runtime.lock(tx, tenantId, appraisalId);
      const run = await loadRun(tx, tenantId, appraisalId);
      const stage = this.openStage(run, stageKey, true);
      const member = await tx.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: input.tenantMemberId }, select: { membership_status: true, archived_at: true } });
      if (!member || member.membership_status !== 'ACTIVE' || member.archived_at) throw new BadRequestException('Choose an active member of this workspace.');
      if (input.replacesAssignmentId) {
        const row = run.stages.get(stageKey);
        const old = run.assignments.find((a) => a.id === input.replacesAssignmentId && a.appraisal_stage_id === row?.id);
        if (!old || old.assignment_status !== 'ASSIGNED') throw new BadRequestException('Only a reviewer still assigned in this stage can be replaced.');
        if (!stage.allowsReplacement) throw new BadRequestException(`${stage.name} doesn’t allow replacing reviewers.`);
        await tx.rndtechnosoft_performance_reviewer_assignments.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: old.id } },
          data: { assignment_status: 'REPLACED', status_reason: input.reason.trim(), closed_at: new Date(), updated_at: new Date() },
        });
        old.assignment_status = 'REPLACED';
      }
      const who = await tx.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: actor.tenantMemberId }, ...MEMBER });
      await this.runtime.addAssignment(tx, tenantId, run, stage, input.tenantMemberId, `Assigned by ${memberName(who) ?? 'an administrator'}: ${input.reason.trim()}`, actor.tenantMemberId, input.replacesAssignmentId);
      await this.runtime.refresh(tx, tenantId, appraisalId);
    });
    await this.log(tenantId, actor, input.replacesAssignmentId ? 'PERFORMANCE_REVIEWER_REPLACED' : 'PERFORMANCE_REVIEWER_ASSIGNED', appraisalId, {
      stage: stageKey, new: { reviewer_member_id: input.tenantMemberId }, replaces_assignment_id: input.replacesAssignmentId, reason: input.reason.trim(),
    });
    return this.detail(tenantId, appraisalId);
  }

  async cancel(tenantId: string, appraisalId: string, reason: string, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.runtime.lock(tx, tenantId, appraisalId);
      const run = await loadRun(tx, tenantId, appraisalId);
      if (run.appraisal.appraisal_status === 'CANCELLED') throw new BadRequestException('This appraisal is already cancelled.');
      const now = new Date();
      await tx.rndtechnosoft_performance_reviewer_assignments.updateMany({
        where: { tenant_id: tenantId, appraisal_id: appraisalId, assignment_status: 'ASSIGNED' },
        data: { assignment_status: 'CANCELLED', status_reason: `Appraisal cancelled: ${reason.trim()}`.slice(0, 500), closed_at: now, updated_at: now },
      });
      await tx.rndtechnosoft_performance_appraisals.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: appraisalId } },
        data: { appraisal_status: 'CANCELLED', current_step: null, cancelled_at: now, cancelled_by_tenant_member_id: actor.tenantMemberId, cancellation_reason: reason.trim(), updated_at: now },
      });
    });
    await this.log(tenantId, actor, 'PERFORMANCE_APPRAISAL_CANCELLED', appraisalId, { reason: reason.trim() });
    return this.detail(tenantId, appraisalId);
  }

  /** The signed-in member's own appraisals. */
  async mine(tenantId: string, actor: AuthenticatedTenantUser) {
    const employee = await this.employeeOf(this.prisma, tenantId, actor.userId);
    if (!employee) return { linked: false, appraisals: [] };
    const rows = await this.prisma.rndtechnosoft_performance_appraisals.findMany({
      where: { tenant_id: tenantId, employee_id: employee.id, appraisal_status: { not: 'CANCELLED' } },
      orderBy: { launched_at: 'desc' }, take: 50,
      include: { rndtechnosoft_performance_cycles: { select: { cycle_name: true, period_start: true, period_end: true } } },
    });
    return {
      linked: true,
      appraisals: rows.map((a) => ({
        id: a.id, status: a.appraisal_status, cycle: a.rndtechnosoft_performance_cycles.cycle_name,
        periodStart: isoDate(a.rndtechnosoft_performance_cycles.period_start), periodEnd: isoDate(a.rndtechnosoft_performance_cycles.period_end),
      })),
    };
  }

  /**
   * One of the member's own appraisals: where it stands, their
   * self-assessment, and nominations they make. Reviewers stay unnamed here;
   * what others wrote is shown by the review form only as each stage allows.
   */
  async myAppraisal(tenantId: string, appraisalId: string, actor: AuthenticatedTenantUser) {
    const employee = await this.employeeOf(this.prisma, tenantId, actor.userId);
    const run = await loadRun(this.prisma as unknown as Tx, tenantId, appraisalId).catch(() => null);
    if (!employee || !run || run.appraisal.employee_id !== employee.id || run.appraisal.appraisal_status === 'CANCELLED') throw new NotFoundException('Appraisal not found.');
    const cycle = await this.prisma.rndtechnosoft_performance_cycles.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.cycle_id }, select: { cycle_name: true, period_start: true, period_end: true } });
    const nominations = await this.prisma.rndtechnosoft_performance_nominations.findMany({
      where: { tenant_id: tenantId, appraisal_id: appraisalId, nominated_by_tenant_member_id: actor.tenantMemberId }, include: { nominee: MEMBER },
    });
    const own = run.assignments.find((a) => a.reviewer_tenant_member_id === actor.tenantMemberId && LIVE.includes(a.assignment_status as AssignmentStatus));
    return {
      id: run.appraisal.id,
      status: run.appraisal.appraisal_status,
      cycle: { name: cycle.cycle_name, periodStart: isoDate(cycle.period_start), periodEnd: isoDate(cycle.period_end) },
      stages: run.def.stages.map((s) => {
        const row = run.stages.get(s.key);
        return {
          key: s.key, name: s.name, step: s.step, status: row?.stage_status ?? 'WAITING', dueDate: row?.due_date ? isoDate(row.due_date) : null,
          isSelf: s.source === 'SELF',
          // Stages whose reviewers the employee nominates, while that is still possible.
          nominate: s.source === 'NOMINATED' && s.nominatedBy === 'EMPLOYEE' && row?.stage_status !== 'COMPLETE' && run.appraisal.appraisal_status === 'IN_PROGRESS'
            ? { min: s.minReviewers, max: s.maxReviewers, needsApproval: s.nominationNeedsApproval, nominations: nominations.filter((n) => n.appraisal_stage_id === row?.id).map((n) => ({ id: n.id, nominee: memberName(n.nominee), status: n.nomination_status, note: n.decision_note })) }
            : null,
        };
      }),
      selfAssessment: own ? { assignmentId: own.id, status: own.assignment_status } : null,
      // Submitted reviews by others the employee may read now, by the workflow's visibility rules.
      readable: run.assignments
        .filter((a) => a.assignment_status === 'SUBMITTED' && a.id !== own?.id)
        .filter((a) => ['FULL', 'ANONYMOUS'].includes(visibility({ memberId: actor.tenantMemberId, isEmployee: true, viewAll: false }, run, a)))
        .map((a) => {
          const row = [...run.stages.values()].find((s) => s.id === a.appraisal_stage_id);
          return { assignmentId: a.id, stage: run.def.stages.find((s) => s.key === row?.stage_key)?.name ?? '' };
        }),
    };
  }

  /** Nominates reviewers for a stage, as the workflow says who may. */
  async nominate(tenantId: string, appraisalId: string, stageKey: string, input: NominateDto, actor: AuthenticatedTenantUser, isAdmin: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await this.runtime.lock(tx, tenantId, appraisalId);
      const run = await loadRun(tx, tenantId, appraisalId);
      const stage = this.openStage(run, stageKey, true);
      if (stage.source !== 'NOMINATED') throw new BadRequestException(`${stage.name}’s reviewers aren’t nominated.`);
      const employee = await tx.rndtechnosoft_employees.findFirstOrThrow({ where: { tenant_id: tenantId, id: run.appraisal.employee_id }, select: { user_id: true } });
      const isEmployee = employee.user_id === actor.userId;
      const isManager = await this.isManagerOf(tx, tenantId, run.appraisal.employee_id, actor.userId);
      const allowed = isAdmin || (stage.nominatedBy === 'EMPLOYEE' && isEmployee) || (stage.nominatedBy === 'MANAGER' && isManager);
      if (!allowed) throw new ForbiddenException('You can’t nominate reviewers for this stage.');
      const row = run.stages.get(stageKey);
      const live = await tx.rndtechnosoft_performance_nominations.findMany({ where: { tenant_id: tenantId, appraisal_stage_id: row?.id, nomination_status: { in: ['PROPOSED', 'APPROVED'] } }, select: { nominee_tenant_member_id: true } });
      if (live.length + input.tenantMemberIds.length > stage.maxReviewers) throw new BadRequestException(`${stage.name} has at most ${stage.maxReviewers} reviewers.`);
      const members = await tx.rndtechnosoft_tenant_members.findMany({ where: { tenant_id: tenantId, id: { in: input.tenantMemberIds }, membership_status: 'ACTIVE', archived_at: null }, select: { id: true } });
      if (members.length !== input.tenantMemberIds.length) throw new BadRequestException('Choose active members of this workspace.');
      const by = await tx.rndtechnosoft_tenant_members.findFirst({ where: { tenant_id: tenantId, id: actor.tenantMemberId }, ...MEMBER });
      const needsApproval = stage.nominationNeedsApproval && !isAdmin;
      for (const memberId of input.tenantMemberIds) {
        if (live.some((n) => n.nominee_tenant_member_id === memberId)) throw new ConflictException('Someone chosen is already nominated.');
        await tx.rndtechnosoft_performance_nominations.create({
          data: {
            id: randomUUID(), tenant_id: tenantId, appraisal_id: appraisalId, appraisal_stage_id: row?.id as string, nominee_tenant_member_id: memberId,
            nominated_by_tenant_member_id: actor.tenantMemberId, nomination_status: needsApproval ? 'PROPOSED' : 'APPROVED',
            ...(needsApproval ? {} : { decided_by_tenant_member_id: actor.tenantMemberId, decided_at: new Date() }),
          },
        });
        if (!needsApproval) await this.runtime.addAssignment(tx, tenantId, run, stage, memberId, `Nominated by ${memberName(by) ?? 'a colleague'}`, actor.tenantMemberId, null);
      }
      await this.runtime.refresh(tx, tenantId, appraisalId);
    });
    await this.log(tenantId, actor, 'PERFORMANCE_REVIEWERS_NOMINATED', appraisalId, { stage: stageKey, nominees: input.tenantMemberIds.length });
    return { nominated: input.tenantMemberIds.length };
  }

  /** Approves or rejects a nomination: the employee's manager, or someone who runs cycles. */
  async decide(tenantId: string, nominationId: string, input: DecideNominationDto, actor: AuthenticatedTenantUser, isAdmin: boolean) {
    const appraisalId = await this.prisma.$transaction(async (tx) => {
      const first = await tx.rndtechnosoft_performance_nominations.findFirst({ where: { tenant_id: tenantId, id: nominationId }, select: { appraisal_id: true } });
      if (!first) throw new NotFoundException('Nomination not found.');
      await this.runtime.lock(tx, tenantId, first.appraisal_id);
      const nomination = await tx.rndtechnosoft_performance_nominations.findFirstOrThrow({ where: { tenant_id: tenantId, id: nominationId }, include: { nominated_by: MEMBER } });
      const run = await loadRun(tx, tenantId, nomination.appraisal_id);
      if (!isAdmin && !(await this.isManagerOf(tx, tenantId, run.appraisal.employee_id, actor.userId))) throw new NotFoundException('Nomination not found.');
      if (nomination.nomination_status !== 'PROPOSED') throw new BadRequestException('This nomination was already decided.');
      const row = [...run.stages.values()].find((s) => s.id === nomination.appraisal_stage_id);
      const stage = this.openStage(run, row?.stage_key as string, true);
      await tx.rndtechnosoft_performance_nominations.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: nominationId } },
        data: { nomination_status: input.approve ? 'APPROVED' : 'REJECTED', decided_by_tenant_member_id: actor.tenantMemberId, decided_at: new Date(), decision_note: input.note?.trim() || null, updated_at: new Date() },
      });
      if (input.approve) await this.runtime.addAssignment(tx, tenantId, run, stage, nomination.nominee_tenant_member_id, `Nominated by ${memberName(nomination.nominated_by) ?? 'a colleague'}`, nomination.nominated_by_tenant_member_id, null);
      await this.runtime.refresh(tx, tenantId, run.appraisal.id);
      return run.appraisal.id;
    });
    await this.log(tenantId, actor, input.approve ? 'PERFORMANCE_NOMINATION_APPROVED' : 'PERFORMANCE_NOMINATION_REJECTED', appraisalId, { nomination_id: nominationId });
    return { decided: true };
  }

  /** Nominations waiting for this member, as the manager of the employee. */
  async nominationsToDecide(tenantId: string, actor: AuthenticatedTenantUser) {
    const me = await this.employeeOf(this.prisma, tenantId, actor.userId);
    if (!me) return [];
    const reports = await this.prisma.rndtechnosoft_employee_reporting_lines.findMany({
      where: { tenant_id: tenantId, manager_employee_id: me.id, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: today() }, OR: [{ effective_to: null }, { effective_to: { gte: today() } }] },
      select: { employee_id: true }, take: 500,
    });
    const rows = await this.prisma.rndtechnosoft_performance_nominations.findMany({
      where: { tenant_id: tenantId, nomination_status: 'PROPOSED', rndtechnosoft_performance_appraisals: { employee_id: { in: reports.map((r) => r.employee_id) }, appraisal_status: 'IN_PROGRESS' } },
      orderBy: { created_at: 'asc' }, take: 100,
      include: { nominee: MEMBER, nominated_by: MEMBER, rndtechnosoft_performance_appraisals: { select: { rndtechnosoft_employees: { select: { first_name: true, last_name: true, preferred_name: true } } } } },
    });
    return rows.map((n) => ({ id: n.id, employee: personName(n.rndtechnosoft_performance_appraisals.rndtechnosoft_employees), nominee: memberName(n.nominee), nominatedBy: memberName(n.nominated_by) }));
  }

  /** A stage that can still take reviewers; WAITING ones too when `early`, so reviewers can be lined up. */
  private openStage(run: Run, stageKey: string, early: boolean) {
    if (run.appraisal.appraisal_status !== 'IN_PROGRESS') throw new BadRequestException('This appraisal isn’t under way.');
    const stage = run.def.stages.find((s) => s.key === stageKey);
    const row = run.stages.get(stageKey);
    if (!stage || !row) throw new NotFoundException('Stage not found.');
    if (row.stage_status === 'COMPLETE' || (!early && row.stage_status === 'WAITING')) throw new BadRequestException(`${stage.name} is ${row.stage_status === 'COMPLETE' ? 'complete' : 'not open yet'}.`);
    return stage;
  }

  private employeeOf(db: Db, tenantId: string, userId: string) {
    return db.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, user_id: userId }, select: { id: true } });
  }

  /** Whether a sign-in belongs to the employee's primary manager today. */
  private async isManagerOf(db: Db, tenantId: string, employeeId: string, userId: string) {
    const line = await db.rndtechnosoft_employee_reporting_lines.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, relationship_type: 'PRIMARY', line_status: 'ACTIVE', effective_from: { lte: today() }, OR: [{ effective_to: null }, { effective_to: { gte: today() } }] },
      select: { rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: { select: { user_id: true } } },
    });
    return !!line && line.rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees.user_id === userId;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, appraisalId: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_APPRAISAL', entityId: appraisalId, oldValues, newValues, metadata });
  }
}

