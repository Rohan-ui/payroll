import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { CreateCycleDto, CycleSettingsDto, LaunchDto, AppraisalListQueryDto } from './dto/performance-cycles.dto';
import { LibraryListQueryDto } from './dto/performance-library.dto';
import { inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, personName, statusCounts } from './performance-common';
import { WORKFLOW_VERSION, workflowDefinition } from './workflows.service';
import { ReviewerResolutionService } from './workflow/reviewer-resolution.service';
import { AppraisalRuntimeService, today } from './appraisal/appraisal-runtime.service';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

/** A template or workflow a cycle may give, with what decides who gets it. */
export interface Candidate { id: string; code: string; name: string; versionId: string; versionNumber: number; appliesToAll: boolean; departmentIds: string[]; designationIds: string[] }
export interface Placement { departmentId: string | null; designationId: string | null }

/**
 * Who gets which template or workflow: one meant for their department or
 * designation wins over one for everyone; two equally fitting ones, or none,
 * need a choice in the launch preview rather than a guess.
 */
export function chooseFor(candidates: Candidate[], placement: Placement, what: string): { choice: Candidate; reason: string } | { problem: string } {
  const scoped = candidates.filter((c) => !c.appliesToAll
    && ((placement.departmentId && c.departmentIds.includes(placement.departmentId)) || (placement.designationId && c.designationIds.includes(placement.designationId))));
  if (scoped.length === 1) return { choice: scoped[0], reason: 'Meant for their department or designation' };
  if (scoped.length > 1) return { problem: `${scoped.length} ${what}s fit them (${scoped.map((c) => c.code).join(', ')}). Choose one.` };
  const general = candidates.filter((c) => c.appliesToAll);
  if (general.length === 1) return { choice: general[0], reason: 'For everyone' };
  if (general.length > 1) return { problem: `${general.length} ${what}s for everyone fit them (${general.map((c) => c.code).join(', ')}). Choose one.` };
  return { problem: `No ${what} in this cycle is meant for them.` };
}

const STAGE_SUMMARY = { select: { stage_key: true, step_number: true, stage_status: true, due_date: true } } as const;

/**
 * Appraisal cycles: a review period, who is eligible, and the templates and
 * workflows they may get. Launching shows a preview first and needs
 * confirming; it never creates two appraisals for one employee in a cycle,
 * and keeps people out of overlapping active cycles unless the cycle allows it.
 */
@Injectable()
export class PerformanceCyclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: ReviewerResolutionService,
    private readonly runtime: AppraisalRuntimeService,
  ) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const archived = query.status === 'ARCHIVED';
    const where: Prisma.rndtechnosoft_performance_cyclesWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : archived ? { cycle_status: 'ARCHIVED' } : { cycle_status: { not: 'ARCHIVED' } }),
      ...(search ? { OR: [{ cycle_name: { contains: search, mode: 'insensitive' } }, { cycle_code: { contains: search.toUpperCase() } }] } : {}),
    };
    const [rows, total, groups] = await Promise.all([
      this.prisma.rndtechnosoft_performance_cycles.findMany({ where, orderBy: [{ period_start: 'desc' }, { cycle_name: 'asc' }], skip, take: limit }),
      this.prisma.rndtechnosoft_performance_cycles.count({ where }),
      this.prisma.rndtechnosoft_performance_cycles.groupBy({ by: ['cycle_status'], where: { tenant_id: tenantId }, _count: { _all: true } }),
    ]);
    const progress = await this.progress(rows.map((c) => c.id), tenantId);
    const counts = statusCounts([
      { status: 'ACTIVE', count: groups.filter((g) => g.cycle_status !== 'ARCHIVED').reduce((t, g) => t + g._count._all, 0) },
      { status: 'ARCHIVED', count: groups.find((g) => g.cycle_status === 'ARCHIVED')?._count._all ?? 0 },
    ]);
    const items = rows.map((c) => ({
      id: c.id, cycleCode: c.cycle_code, cycleName: c.cycle_name, cycleKind: c.cycle_kind, status: c.cycle_status,
      periodStart: isoDate(c.period_start), periodEnd: isoDate(c.period_end), launchedAt: c.launched_at, progress: progress.get(c.id) ?? null,
    }));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const cycle = await this.prisma.rndtechnosoft_performance_cycles.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_performance_cycle_scopes: { include: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } } },
        rndtechnosoft_performance_cycle_templates: { include: { rndtechnosoft_performance_templates: { select: { id: true, template_code: true, template_name: true, template_status: true } } } },
        rndtechnosoft_performance_cycle_workflows: { include: { rndtechnosoft_performance_workflows: { select: { id: true, workflow_code: true, workflow_name: true, workflow_status: true } } } },
        launched_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
      },
    });
    if (!cycle) throw new NotFoundException('Appraisal cycle not found.');
    const scopes = cycle.rndtechnosoft_performance_cycle_scopes;
    return {
      id: cycle.id, cycleCode: cycle.cycle_code, cycleName: cycle.cycle_name, description: cycle.cycle_description, cycleKind: cycle.cycle_kind,
      status: cycle.cycle_status, periodStart: isoDate(cycle.period_start), periodEnd: isoDate(cycle.period_end), appliesToAll: cycle.applies_to_all,
      scopes: {
        departments: scopes.flatMap((s) => (s.department_id ? [{ id: s.department_id, name: s.rndtechnosoft_departments?.department_name ?? '' }] : [])),
        designations: scopes.flatMap((s) => (s.designation_id ? [{ id: s.designation_id, name: s.rndtechnosoft_designations?.designation_name ?? '' }] : [])),
      },
      joinedOnOrBefore: cycle.joined_on_or_before ? isoDate(cycle.joined_on_or_before) : null,
      allowsOverlap: cycle.allows_overlap,
      templates: cycle.rndtechnosoft_performance_cycle_templates.map((t) => ({ id: t.template_id, code: t.rndtechnosoft_performance_templates.template_code, name: t.rndtechnosoft_performance_templates.template_name, status: t.rndtechnosoft_performance_templates.template_status })),
      workflows: cycle.rndtechnosoft_performance_cycle_workflows.map((w) => ({ id: w.workflow_id, code: w.rndtechnosoft_performance_workflows.workflow_code, name: w.rndtechnosoft_performance_workflows.workflow_name, status: w.rndtechnosoft_performance_workflows.workflow_status })),
      launchedAt: cycle.launched_at,
      launchedBy: cycle.launched_by?.rndtechnosoft_users.display_name ?? null,
      progress: (await this.progress([cycle.id], tenantId)).get(cycle.id) ?? null,
    };
  }

  async create(tenantId: string, input: CreateCycleDto, actor: AuthenticatedTenantUser) {
    await this.checkSettings(tenantId, input);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_cycles.create({ data: { id, tenant_id: tenantId, cycle_code: input.cycleCode, ...this.columns(input), created_by_tenant_member_id: actor.tenantMemberId } });
      await this.writeChildren(tx, tenantId, id, input);
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`An appraisal cycle with code ${input.cycleCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_CREATED', id, { new: { code: input.cycleCode, name: input.cycleName.trim(), period: `${input.periodStart} to ${input.periodEnd}` } });
    return this.get(tenantId, id);
  }

  /** A draft cycle changes freely; once launched only its name and description do, so everyone already in it was chosen by the same rules. */
  async update(tenantId: string, id: string, input: CycleSettingsDto, actor: AuthenticatedTenantUser) {
    const cycle = await this.find(tenantId, id);
    if (cycle.cycle_status === 'ARCHIVED') throw new BadRequestException('This cycle is archived. Restore it to change it.');
    if (cycle.cycle_status !== 'DRAFT') {
      await this.prisma.rndtechnosoft_performance_cycles.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { cycle_name: input.cycleName.trim(), cycle_description: input.description?.trim() || null, updated_at: new Date() },
      });
      await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_UPDATED', id, { old: { name: cycle.cycle_name }, new: { name: input.cycleName.trim() }, note: 'Launched: only the name and description changed' });
      return this.get(tenantId, id);
    }
    await this.checkSettings(tenantId, input);
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_cycles.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { ...this.columns(input), updated_at: new Date() } });
      await tx.rndtechnosoft_performance_cycle_scopes.deleteMany({ where: { tenant_id: tenantId, cycle_id: id } });
      await tx.rndtechnosoft_performance_cycle_templates.deleteMany({ where: { tenant_id: tenantId, cycle_id: id } });
      await tx.rndtechnosoft_performance_cycle_workflows.deleteMany({ where: { tenant_id: tenantId, cycle_id: id } });
      await this.writeChildren(tx, tenantId, id, input);
    });
    await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_UPDATED', id, {
      old: { name: cycle.cycle_name, period: `${isoDate(cycle.period_start)} to ${isoDate(cycle.period_end)}` },
      new: { name: input.cycleName.trim(), period: `${input.periodStart} to ${input.periodEnd}`, templates: input.templateIds, workflows: input.workflowIds },
    });
    return this.get(tenantId, id);
  }

  /**
   * Who would be appraised if the cycle launched now, with the template,
   * workflow and reviewers each would get, and anything that needs a
   * decision first. Nothing is stored.
   */
  async preview(tenantId: string, id: string, onlyEmployeeIds?: string[]) {
    const cycle = await this.find(tenantId, id);
    const plan = await this.plan(this.prisma, tenantId, cycle, onlyEmployeeIds);
    const rows = [];
    for (const row of plan.rows) {
      let reviewers: { stage: string; status: string; message: string }[] = [];
      if (row.workflow && !row.problems.length && !row.alreadyIn) {
        const def = plan.workflowDefs.get(row.workflow.versionId);
        if (def) {
          const found = await this.resolver.resolve(tenantId, def, row.employee.id, today());
          reviewers = found.stages.map((s) => ({ stage: s.stageName, status: s.status, message: s.message }));
        }
      }
      rows.push({ ...row, reviewers });
    }
    return {
      templates: plan.templates.map((t) => ({ id: t.id, code: t.code, name: t.name, versionNumber: t.versionNumber })),
      workflows: plan.workflows.map((w) => ({ id: w.id, code: w.code, name: w.name, versionNumber: w.versionNumber })),
      rows,
      summary: {
        eligible: rows.length,
        ready: rows.filter((r) => !r.problems.length && !r.alreadyIn).length,
        needChoice: rows.filter((r) => r.problems.length && !r.alreadyIn).length,
        alreadyIn: rows.filter((r) => r.alreadyIn).length,
        needingReviewers: rows.filter((r) => r.reviewers.some((s) => s.status !== 'RESOLVED')).length,
      },
    };
  }

  /** Starts appraisals for everyone ready (after choices and exclusions), in one transaction. */
  async launch(tenantId: string, id: string, input: LaunchDto, actor: AuthenticatedTenantUser) {
    if (input.confirm !== true) throw new BadRequestException('Confirm the launch: it starts appraisals for everyone listed.');
    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rndtechnosoft_performance_cycles WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
      const cycle = await this.find(tenantId, id, tx);
      if (cycle.cycle_status === 'ARCHIVED' || cycle.cycle_status === 'COMPLETED') throw new BadRequestException('This cycle is closed. Restore or reopen it first.');
      if (cycle.cycle_status === 'ACTIVE' && !input.onlyEmployeeIds) throw new BadRequestException('This cycle is already running. Add people to it by choosing them.');
      // Worked out again here, on the server: the preview is only a preview.
      const plan = await this.plan(tx, tenantId, cycle, input.onlyEmployeeIds);
      const excluded = new Set(input.excludeEmployeeIds);
      const started: string[] = [];
      const skipped: { employeeId: string; name: string; reason: string }[] = [];
      for (const row of plan.rows) {
        if (row.alreadyIn || excluded.has(row.employee.id)) continue;
        const choice = input.choices.find((c) => c.employeeId === row.employee.id);
        const template = choice ? plan.templates.find((t) => t.id === choice.templateId) : row.template;
        const workflow = choice ? plan.workflows.find((w) => w.id === choice.workflowId) : row.workflow;
        const blocking = row.problems.filter((p) => p.kind === 'OVERLAP' || !choice);
        if (choice && (!template || !workflow)) { skipped.push({ employeeId: row.employee.id, name: row.employee.name, reason: 'The chosen template or workflow is not part of this cycle or has no published version.' }); continue; }
        if (blocking.length || !template || !workflow) { skipped.push({ employeeId: row.employee.id, name: row.employee.name, reason: blocking.map((p) => p.message).join(' ') || 'No template or workflow.' }); continue; }
        const def = plan.workflowDefs.get(workflow.versionId);
        if (!def) { skipped.push({ employeeId: row.employee.id, name: row.employee.name, reason: 'The workflow has no published version.' }); continue; }
        started.push(await this.runtime.start(tx, tenantId, {
          cycleId: id, employeeId: row.employee.id, templateVersionId: template.versionId, workflowVersionId: workflow.versionId,
          departmentId: row.placement.departmentId, designationId: row.placement.designationId, actorMemberId: actor.tenantMemberId,
        }, def));
      }
      if (!started.length) throw new BadRequestException(skipped.length ? `Nobody could be started: ${skipped[0].name}: ${skipped[0].reason}` : 'Nobody eligible is waiting to be started.');
      if (cycle.cycle_status === 'DRAFT') {
        await tx.rndtechnosoft_performance_cycles.update({
          where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { cycle_status: 'ACTIVE', launched_at: new Date(), launched_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
        });
      }
      return { started: started.length, skipped };
    }, { timeout: 300000, maxWait: 10000 }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException('Someone was started in this cycle at the same moment. Look at the cycle again before launching.');
      throw e;
    });
    await this.log(tenantId, actor, input.onlyEmployeeIds ? 'PERFORMANCE_CYCLE_EMPLOYEES_ADDED' : 'PERFORMANCE_CYCLE_LAUNCHED', id, { started: outcome.started, skipped: outcome.skipped.length });
    return { ...outcome, cycle: await this.get(tenantId, id) };
  }

  async appraisals(tenantId: string, cycleId: string, query: AppraisalListQueryDto) {
    await this.find(tenantId, cycleId);
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_appraisalsWhereInput = {
      tenant_id: tenantId, cycle_id: cycleId,
      ...(query.status === 'NEEDS_REVIEWERS'
        ? { appraisal_status: 'IN_PROGRESS', rndtechnosoft_performance_appraisal_stages: { some: { stage_status: 'NEEDS_REVIEWERS' } } }
        : query.status ? { appraisal_status: query.status } : {}),
      ...(query.departmentId ? { department_id: query.departmentId } : {}),
      ...(search ? { rndtechnosoft_employees: { OR: [{ first_name: { contains: search, mode: 'insensitive' } }, { last_name: { contains: search, mode: 'insensitive' } }, { employee_code: { contains: search, mode: 'insensitive' } }] } } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_appraisals.findMany({
        where, skip, take: limit, orderBy: [{ rndtechnosoft_employees: { first_name: 'asc' } }],
        include: {
          rndtechnosoft_employees: { select: { first_name: true, last_name: true, preferred_name: true, employee_code: true } },
          rndtechnosoft_departments: { select: { department_name: true } },
          rndtechnosoft_designations: { select: { designation_name: true } },
          rndtechnosoft_performance_appraisal_stages: STAGE_SUMMARY,
          rndtechnosoft_performance_workflow_versions: { select: { rndtechnosoft_performance_workflow_stages: { select: { stage_key: true, stage_name: true } } } },
          rndtechnosoft_performance_template_versions: { select: { version_number: true, rndtechnosoft_performance_templates: { select: { template_code: true } } } },
        },
      }),
      this.prisma.rndtechnosoft_performance_appraisals.count({ where }),
    ]);
    const todayIso = isoDate(today());
    const items = rows.map((a) => {
      const names = new Map(a.rndtechnosoft_performance_workflow_versions.rndtechnosoft_performance_workflow_stages.map((s) => [s.stage_key, s.stage_name]));
      const open = a.rndtechnosoft_performance_appraisal_stages.filter((s) => s.stage_status === 'OPEN' || s.stage_status === 'NEEDS_REVIEWERS');
      return {
        id: a.id,
        employee: { id: a.employee_id, name: personName(a.rndtechnosoft_employees), code: a.rndtechnosoft_employees.employee_code },
        department: a.rndtechnosoft_departments?.department_name ?? null,
        designation: a.rndtechnosoft_designations?.designation_name ?? null,
        status: a.appraisal_status,
        template: `${a.rndtechnosoft_performance_template_versions.rndtechnosoft_performance_templates.template_code} v${a.rndtechnosoft_performance_template_versions.version_number}`,
        currentStages: open.map((s) => ({
          name: names.get(s.stage_key) ?? s.stage_key, status: s.stage_status, dueDate: s.due_date ? isoDate(s.due_date) : null,
          overdue: !!s.due_date && isoDate(s.due_date) < todayIso,
        })),
      };
    });
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const cycle = await this.find(tenantId, id);
    if (cycle.cycle_status === 'ARCHIVED') return this.get(tenantId, id);
    const running = await this.prisma.rndtechnosoft_performance_appraisals.count({ where: { tenant_id: tenantId, cycle_id: id, appraisal_status: 'IN_PROGRESS' } });
    if (running) throw new BadRequestException(`${running} appraisal${running === 1 ? ' is' : 's are'} still under way in this cycle. Finish or cancel ${running === 1 ? 'it' : 'them'} before archiving.`);
    await this.prisma.rndtechnosoft_performance_cycles.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { cycle_status: 'ARCHIVED', archived_at: new Date(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_ARCHIVED', id, {});
    return this.get(tenantId, id);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const cycle = await this.find(tenantId, id);
    if (cycle.cycle_status !== 'ARCHIVED') return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_cycles.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { cycle_status: cycle.launched_at ? 'ACTIVE' : 'DRAFT', archived_at: null, updated_at: new Date() },
    });
    await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  /** A cycle is deleted only before anyone is appraised in it. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const cycle = await this.find(tenantId, id);
    const appraisals = await this.prisma.rndtechnosoft_performance_appraisals.count({ where: { tenant_id: tenantId, cycle_id: id } });
    if (appraisals) throw new ConflictException(inUseMessage(cycle.cycle_code, [`${appraisals} appraisal${appraisals === 1 ? '' : 's'}`]));
    await this.prisma.rndtechnosoft_performance_cycles.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(cycle.cycle_code, ['an appraisal started just now']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_CYCLE_DELETED', id, { old: { code: cycle.cycle_code, name: cycle.cycle_name } });
    return { deleted: true };
  }

  /**
   * Everyone eligible and what they would get: worked out from the cycle,
   * the employees' placement at the end of the period, and the cycle's
   * templates' and workflows' latest published versions.
   */
  private async plan(db: Db, tenantId: string, cycle: Awaited<ReturnType<PerformanceCyclesService['find']>>, onlyEmployeeIds?: string[]) {
    const [scopes, templateLinks, workflowLinks] = await Promise.all([
      db.rndtechnosoft_performance_cycle_scopes.findMany({ where: { tenant_id: tenantId, cycle_id: cycle.id } }),
      db.rndtechnosoft_performance_cycle_templates.findMany({
        where: { tenant_id: tenantId, cycle_id: cycle.id },
        include: { rndtechnosoft_performance_templates: { include: { rndtechnosoft_performance_template_scopes: true, rndtechnosoft_performance_template_versions: { where: { version_status: 'PUBLISHED' }, orderBy: { version_number: 'desc' }, take: 1, select: { id: true, version_number: true } } } } },
      }),
      db.rndtechnosoft_performance_cycle_workflows.findMany({
        where: { tenant_id: tenantId, cycle_id: cycle.id },
        include: { rndtechnosoft_performance_workflows: { include: { rndtechnosoft_performance_workflow_scopes: true, rndtechnosoft_performance_workflow_versions: { where: { version_status: 'PUBLISHED' }, orderBy: { version_number: 'desc' }, take: 1, include: WORKFLOW_VERSION } } } },
      }),
    ]);
    const templates: Candidate[] = templateLinks.flatMap((l) => {
      const t = l.rndtechnosoft_performance_templates;
      const v = t.rndtechnosoft_performance_template_versions[0];
      return t.template_status === 'ACTIVE' && v ? [{
        id: t.id, code: t.template_code, name: t.template_name, versionId: v.id, versionNumber: v.version_number, appliesToAll: t.applies_to_all,
        departmentIds: t.rndtechnosoft_performance_template_scopes.flatMap((s) => (s.department_id ? [s.department_id] : [])),
        designationIds: t.rndtechnosoft_performance_template_scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : [])),
      }] : [];
    });
    const workflowDefs = new Map<string, ReturnType<typeof workflowDefinition>>();
    const workflows: Candidate[] = workflowLinks.flatMap((l) => {
      const w = l.rndtechnosoft_performance_workflows;
      const v = w.rndtechnosoft_performance_workflow_versions[0];
      if (w.workflow_status !== 'ACTIVE' || !v) return [];
      workflowDefs.set(v.id, workflowDefinition(v));
      return [{
        id: w.id, code: w.workflow_code, name: w.workflow_name, versionId: v.id, versionNumber: v.version_number, appliesToAll: w.applies_to_all,
        departmentIds: w.rndtechnosoft_performance_workflow_scopes.flatMap((s) => (s.department_id ? [s.department_id] : [])),
        designationIds: w.rndtechnosoft_performance_workflow_scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : [])),
      }];
    });

    const end = cycle.period_end;
    const employees = await db.rndtechnosoft_employees.findMany({
      where: { tenant_id: tenantId, employee_status: 'ACTIVE', archived_at: null, ...(onlyEmployeeIds ? { id: { in: onlyEmployeeIds } } : {}) },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      take: 5000,
      select: {
        id: true, first_name: true, last_name: true, preferred_name: true, employee_code: true, hire_date: true,
        rndtechnosoft_employee_employments: {
          where: { effective_from: { lte: end }, OR: [{ effective_to: null }, { effective_to: { gte: end } }] },
          orderBy: { effective_from: 'desc' }, take: 1,
          select: { department_id: true, designation_id: true, joining_date: true, rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } },
        },
      },
    });
    const deptIds = scopes.flatMap((s) => (s.department_id ? [s.department_id] : []));
    const desigIds = scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : []));
    const [inThisCycle, overlapping] = await Promise.all([
      db.rndtechnosoft_performance_appraisals.findMany({ where: { tenant_id: tenantId, cycle_id: cycle.id, appraisal_status: { not: 'CANCELLED' } }, select: { employee_id: true } }),
      cycle.allows_overlap ? Promise.resolve([]) : db.rndtechnosoft_performance_appraisals.findMany({
        where: {
          tenant_id: tenantId, appraisal_status: { not: 'CANCELLED' }, cycle_id: { not: cycle.id },
          rndtechnosoft_performance_cycles: { cycle_status: 'ACTIVE', period_start: { lte: cycle.period_end }, period_end: { gte: cycle.period_start } },
        },
        select: { employee_id: true, rndtechnosoft_performance_cycles: { select: { cycle_code: true } } },
      }),
    ]);
    const already = new Set(inThisCycle.map((a) => a.employee_id));
    const rows = [];
    for (const e of employees) {
      const job = e.rndtechnosoft_employee_employments[0];
      const placement: Placement = { departmentId: job?.department_id ?? null, designationId: job?.designation_id ?? null };
      if (!cycle.applies_to_all && !((placement.departmentId && deptIds.includes(placement.departmentId)) || (placement.designationId && desigIds.includes(placement.designationId)))) continue;
      const joined = job?.joining_date ?? e.hire_date;
      if (cycle.joined_on_or_before && (!joined || joined > cycle.joined_on_or_before)) continue;
      const problems: { kind: 'TEMPLATE' | 'WORKFLOW' | 'OVERLAP'; message: string }[] = [];
      const template = chooseFor(templates, placement, 'template');
      const workflow = chooseFor(workflows, placement, 'workflow');
      if ('problem' in template) problems.push({ kind: 'TEMPLATE', message: template.problem });
      if ('problem' in workflow) problems.push({ kind: 'WORKFLOW', message: workflow.problem });
      const clash = overlapping.find((o) => o.employee_id === e.id);
      if (clash) problems.push({ kind: 'OVERLAP', message: `Already in the overlapping cycle ${clash.rndtechnosoft_performance_cycles.cycle_code}.` });
      rows.push({
        employee: { id: e.id, name: personName(e), code: e.employee_code },
        department: job?.rndtechnosoft_departments?.department_name ?? null,
        designation: job?.rndtechnosoft_designations?.designation_name ?? null,
        placement,
        alreadyIn: already.has(e.id),
        template: 'choice' in template ? template.choice : null,
        templateReason: 'choice' in template ? template.reason : null,
        workflow: 'choice' in workflow ? workflow.choice : null,
        workflowReason: 'choice' in workflow ? workflow.reason : null,
        problems,
      });
    }
    return { templates, workflows, workflowDefs, rows };
  }

  /** Progress of cycles: appraisals by status, and stages needing reviewers or past their deadline. */
  private async progress(cycleIds: string[], tenantId: string) {
    if (!cycleIds.length) return new Map<string, { total: number; inProgress: number; reviewsComplete: number; cancelled: number; needingReviewers: number; overdue: number }>();
    const [byStatus, needing, overdue] = await Promise.all([
      this.prisma.rndtechnosoft_performance_appraisals.groupBy({ by: ['cycle_id', 'appraisal_status'], where: { tenant_id: tenantId, cycle_id: { in: cycleIds } }, _count: { _all: true } }),
      this.prisma.rndtechnosoft_performance_appraisals.groupBy({
        by: ['cycle_id'], where: { tenant_id: tenantId, cycle_id: { in: cycleIds }, appraisal_status: 'IN_PROGRESS', rndtechnosoft_performance_appraisal_stages: { some: { stage_status: 'NEEDS_REVIEWERS' } } }, _count: { _all: true },
      }),
      this.prisma.rndtechnosoft_performance_appraisals.groupBy({
        by: ['cycle_id'], where: { tenant_id: tenantId, cycle_id: { in: cycleIds }, appraisal_status: 'IN_PROGRESS', rndtechnosoft_performance_appraisal_stages: { some: { stage_status: { in: ['OPEN', 'NEEDS_REVIEWERS'] }, due_date: { lt: today() } } } }, _count: { _all: true },
      }),
    ]);
    return new Map(cycleIds.map((id) => {
      const of = (status: string) => byStatus.find((g) => g.cycle_id === id && g.appraisal_status === status)?._count._all ?? 0;
      return [id, {
        total: byStatus.filter((g) => g.cycle_id === id).reduce((t, g) => t + g._count._all, 0),
        inProgress: of('IN_PROGRESS'), reviewsComplete: of('REVIEWS_COMPLETE'), cancelled: of('CANCELLED'),
        needingReviewers: needing.find((g) => g.cycle_id === id)?._count._all ?? 0,
        overdue: overdue.find((g) => g.cycle_id === id)?._count._all ?? 0,
      }];
    }));
  }

  private async checkSettings(tenantId: string, input: CycleSettingsDto) {
    if (input.periodEnd < input.periodStart) throw new BadRequestException('The period must end on or after it starts.');
    const count = input.scopes.departmentIds.length + input.scopes.designationIds.length;
    if (!input.appliesToAll && !count) throw new BadRequestException('Choose at least one department or designation, or make the cycle for everyone.');
    if (input.appliesToAll && count) throw new BadRequestException('A cycle for everyone has no departments or designations chosen.');
    if (!input.templateIds.length) throw new BadRequestException('Choose at least one appraisal template.');
    if (!input.workflowIds.length) throw new BadRequestException('Choose at least one review workflow.');
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [departments, designations, templates, workflows] = await Promise.all([
      this.prisma.rndtechnosoft_departments.count({ where: where(input.scopes.departmentIds) }),
      this.prisma.rndtechnosoft_designations.count({ where: where(input.scopes.designationIds) }),
      this.prisma.rndtechnosoft_performance_templates.findMany({ where: where(input.templateIds), select: { template_code: true, template_status: true } }),
      this.prisma.rndtechnosoft_performance_workflows.findMany({ where: where(input.workflowIds), select: { workflow_code: true, workflow_status: true } }),
    ]);
    // Another workspace's id is reported the same as one that doesn't exist.
    if (departments !== input.scopes.departmentIds.length || designations !== input.scopes.designationIds.length) throw new BadRequestException('A department or designation was not found in this workspace.');
    if (templates.length !== input.templateIds.length) throw new BadRequestException('An appraisal template was not found in this workspace.');
    if (workflows.length !== input.workflowIds.length) throw new BadRequestException('A review workflow was not found in this workspace.');
    const archived = [...templates.filter((t) => t.template_status !== 'ACTIVE').map((t) => t.template_code), ...workflows.filter((w) => w.workflow_status !== 'ACTIVE').map((w) => w.workflow_code)];
    if (archived.length) throw new BadRequestException(`${archived.join(', ')} ${archived.length === 1 ? 'is' : 'are'} archived.`);
  }

  private columns(input: CycleSettingsDto) {
    return {
      cycle_name: input.cycleName.trim(), cycle_description: input.description?.trim() || null, cycle_kind: input.cycleKind,
      period_start: dateOnly(input.periodStart), period_end: dateOnly(input.periodEnd), applies_to_all: input.appliesToAll,
      joined_on_or_before: input.joinedOnOrBefore ? dateOnly(input.joinedOnOrBefore) : null, allows_overlap: input.allowsOverlap,
    };
  }

  private async writeChildren(tx: Tx, tenantId: string, cycleId: string, input: CycleSettingsDto) {
    const scopes = [...input.scopes.departmentIds.map((v) => ({ department_id: v })), ...input.scopes.designationIds.map((v) => ({ designation_id: v }))];
    if (scopes.length) await tx.rndtechnosoft_performance_cycle_scopes.createMany({ data: scopes.map((s) => ({ id: randomUUID(), tenant_id: tenantId, cycle_id: cycleId, ...s })) });
    await tx.rndtechnosoft_performance_cycle_templates.createMany({ data: input.templateIds.map((t) => ({ id: randomUUID(), tenant_id: tenantId, cycle_id: cycleId, template_id: t })) });
    await tx.rndtechnosoft_performance_cycle_workflows.createMany({ data: input.workflowIds.map((w) => ({ id: randomUUID(), tenant_id: tenantId, cycle_id: cycleId, workflow_id: w })) });
  }

  private async find(tenantId: string, id: string, db: Db = this.prisma) {
    const cycle = await db.rndtechnosoft_performance_cycles.findFirst({ where: { tenant_id: tenantId, id } });
    if (!cycle) throw new NotFoundException('Appraisal cycle not found.');
    return cycle;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_CYCLE', entityId: id, oldValues, newValues, metadata });
  }
}
