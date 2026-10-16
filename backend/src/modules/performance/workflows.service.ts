import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly } from '@/modules/payroll/payroll-lock';
import { DuplicateDto, LibraryListQueryDto } from './dto/performance-library.dto';
import { CreateWorkflowDto, ResolveReviewersDto, WorkflowDraftDto, WorkflowSettingsDto, WorkflowStageDto } from './dto/performance-workflows.dto';
import { decimal, inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, statusCounts, text } from './performance-common';
import { STAGE_KEY, StageDef, validateWorkflow, WorkflowDef } from './workflow/workflow-definition';
import { ReviewerResolutionService } from './workflow/reviewer-resolution.service';

type Tx = Prisma.TransactionClient;

export const WORKFLOW_VERSION = {
  published_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
  rndtechnosoft_performance_workflow_stages: {
    orderBy: { display_order: 'asc' },
    include: {
      reviewer_role: { select: { id: true, role_name: true } },
      escalation_role: { select: { id: true, role_name: true } },
      rndtechnosoft_performance_workflow_stage_members: {
        orderBy: { display_order: 'asc' },
        select: { tenant_member_id: true, rndtechnosoft_tenant_members: { select: { membership_status: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } },
      },
      rndtechnosoft_performance_workflow_stage_kras: { select: { kra_id: true, rndtechnosoft_performance_kras: { select: { kra_code: true, kra_name: true } } } },
    },
  },
} satisfies Prisma.rndtechnosoft_performance_workflow_versionsInclude;

type VersionRow = Prisma.rndtechnosoft_performance_workflow_versionsGetPayload<{ include: typeof WORKFLOW_VERSION }>;
type StageRow = VersionRow['rndtechnosoft_performance_workflow_stages'][number];

/** A stage as the rules see it. */
function stageDef(s: StageRow): StageDef {
  return {
    key: s.stage_key, name: s.stage_name, step: s.step_number, source: s.reviewer_source as StageDef['source'], mode: s.assignment_mode as StageDef['mode'],
    action: s.stage_action as StageDef['action'], minReviewers: s.min_reviewers, maxReviewers: s.max_reviewers, completion: s.completion_rule as StageDef['completion'],
    minCompleted: s.min_completed, aggregation: s.aggregation as StageDef['aggregation'], scoreWeight: s.score_weight_percent, ratedScope: s.rated_scope as StageDef['ratedScope'],
    kraIds: s.rndtechnosoft_performance_workflow_stage_kras.map((k) => k.kra_id), memberIds: s.rndtechnosoft_performance_workflow_stage_members.map((m) => m.tenant_member_id),
    roleId: s.reviewer_role_id, nominatedBy: s.nominated_by as StageDef['nominatedBy'], nominationNeedsApproval: s.nomination_needs_approval,
    allowsDecline: s.allows_decline, allowsReplacement: s.allows_replacement, returnRule: s.return_rule as StageDef['returnRule'], dueDays: s.due_days,
    reminderDays: s.reminder_days, escalateAfterDays: s.escalate_after_days, escalateTo: s.escalate_to as StageDef['escalateTo'], escalationRoleId: s.escalation_role_id,
    employeeSees: s.employee_sees as StageDef['employeeSees'], identity: s.reviewer_identity as StageDef['identity'], laterStagesSee: s.later_stages_see as StageDef['laterStagesSee'],
  };
}

export function workflowDefinition(v: VersionRow): WorkflowDef {
  return {
    resolution: v.reviewer_resolution as WorkflowDef['resolution'],
    allowRepeatReviewers: v.allows_repeat_reviewers,
    stages: v.rndtechnosoft_performance_workflow_stages.map(stageDef),
  };
}

/**
 * What would stop a stage being stored at all; the database refuses these.
 * Everything else that stops publishing is reported on the draft instead.
 */
function unstorable(stages: WorkflowStageDto[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  stages.forEach((s, i) => {
    const name = s.name.trim() || `Stage ${i + 1}`;
    if (!s.name.trim()) problems.push(`Stage ${i + 1} needs a name.`);
    if (!STAGE_KEY.test(s.key)) problems.push(`${name}: its key is 2 to 40 lowercase letters, digits or underscores, starting with a letter.`);
    if (keys.has(s.key)) problems.push(`${name}: another stage uses the key ${s.key}.`);
    keys.add(s.key);
    if (s.maxReviewers < s.minReviewers) problems.push(`${name}: the most reviewers can’t be fewer than the least.`);
    if (s.completion === 'ALL' && s.minCompleted !== null) problems.push(`${name}: when every reviewer must finish, don’t give a number of reviews.`);
    if (s.completion === 'AT_LEAST' && (s.minCompleted === null || s.minCompleted > s.maxReviewers)) problems.push(`${name}: the reviews needed must be from 1 to its most reviewers.`);
    const weight = decimal(s.scoreWeightPercent);
    if (weight && (s.action !== 'RATE' || weight.isZero() || weight.gt(100))) problems.push(`${name}: only a rating stage counts toward the score, with a share above 0% and at most 100%.`);
    if ((s.source === 'ROLE_MEMBERS') !== (s.roleId !== null)) problems.push(`${name}: a role is chosen exactly when its members review.`);
    if ((s.source === 'NOMINATED') !== (s.nominatedBy !== null)) problems.push(`${name}: say who nominates exactly when reviewers are nominated.`);
    if ((s.escalateTo === 'NONE') !== (s.escalateAfterDays === null)) problems.push(`${name}: give both whom to escalate to and after how many overdue days, or neither.`);
    if ((s.escalateTo === 'ROLE') !== (s.escalationRoleId !== null)) problems.push(`${name}: a role to escalate to is chosen exactly when escalating to a role.`);
  });
  return problems;
}

/**
 * Review workflows: per department or designation, who reviews whom, how
 * many, in what order and what they may do. Versioned like templates: one
 * draft at a time, and a published version never changes.
 */
@Injectable()
export class PerformanceWorkflowsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly resolver: ReviewerResolutionService) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_workflowsWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : { workflow_status: query.status ?? 'ACTIVE' }),
      AND: [
        search ? { OR: [{ workflow_name: { contains: search, mode: 'insensitive' } }, { workflow_code: { contains: search.toUpperCase() } }] } : {},
        query.departmentId ? { OR: [{ applies_to_all: true }, { rndtechnosoft_performance_workflow_scopes: { some: { tenant_id: tenantId, department_id: query.departmentId } } }] } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_workflows.findMany({
        where, orderBy: [{ workflow_name: 'asc' }, { workflow_code: 'asc' }], skip, take: limit,
        include: {
          rndtechnosoft_performance_workflow_scopes: { select: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } } },
          rndtechnosoft_performance_workflow_versions: {
            orderBy: { version_number: 'desc' },
            select: { version_number: true, version_status: true, rndtechnosoft_performance_workflow_stages: { orderBy: { display_order: 'asc' }, select: { stage_name: true, step_number: true } } },
          },
        },
      }),
      this.prisma.rndtechnosoft_performance_workflows.count({ where }),
    ]);
    const items = rows.map((w) => {
      const current = w.rndtechnosoft_performance_workflow_versions.find((v) => v.version_status === 'PUBLISHED') ?? null;
      const draft = w.rndtechnosoft_performance_workflow_versions.find((v) => v.version_status === 'DRAFT') ?? null;
      const scopes = w.rndtechnosoft_performance_workflow_scopes;
      return {
        id: w.id, workflowCode: w.workflow_code, workflowName: w.workflow_name, status: w.workflow_status,
        appliesTo: {
          all: w.applies_to_all,
          departments: scopes.flatMap((s) => (s.rndtechnosoft_departments ? [s.rndtechnosoft_departments.department_name] : [])),
          designations: scopes.flatMap((s) => (s.rndtechnosoft_designations ? [s.rndtechnosoft_designations.designation_name] : [])),
        },
        currentVersion: current && { number: current.version_number, stages: current.rndtechnosoft_performance_workflow_stages.map((s) => ({ name: s.stage_name, step: s.step_number })) },
        draft: draft && { number: draft.version_number },
      };
    });
    const groups = await this.prisma.rndtechnosoft_performance_workflows.groupBy({ by: ['workflow_status'], where: { tenant_id: tenantId }, _count: { _all: true } });
    const counts = statusCounts(groups.map((g) => ({ status: g.workflow_status, count: g._count._all })));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const workflow = await this.prisma.rndtechnosoft_performance_workflows.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_performance_workflow_scopes: { include: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } } },
        rndtechnosoft_performance_workflow_versions: { orderBy: { version_number: 'desc' }, include: WORKFLOW_VERSION },
      },
    });
    if (!workflow) throw new NotFoundException('Review workflow not found.');
    const scopes = workflow.rndtechnosoft_performance_workflow_scopes;
    return {
      id: workflow.id, workflowCode: workflow.workflow_code, workflowName: workflow.workflow_name, description: workflow.workflow_description,
      status: workflow.workflow_status, appliesToAll: workflow.applies_to_all,
      scopes: {
        departments: scopes.flatMap((s) => (s.department_id ? [{ id: s.department_id, name: s.rndtechnosoft_departments?.department_name ?? '' }] : [])),
        designations: scopes.flatMap((s) => (s.designation_id ? [{ id: s.designation_id, name: s.rndtechnosoft_designations?.designation_name ?? '' }] : [])),
      },
      versions: workflow.rndtechnosoft_performance_workflow_versions.map((v) => this.present(v)),
    };
  }

  async create(tenantId: string, input: CreateWorkflowDto, actor: AuthenticatedTenantUser) {
    await this.checkScopes(tenantId, input);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_workflows.create({
        data: {
          id, tenant_id: tenantId, workflow_code: input.workflowCode, workflow_name: input.workflowName.trim(), workflow_description: input.description?.trim() || null,
          applies_to_all: input.appliesToAll, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      await this.writeScopes(tx, tenantId, id, input);
      await tx.rndtechnosoft_performance_workflow_versions.create({ data: { id: randomUUID(), tenant_id: tenantId, workflow_id: id, version_number: 1 } });
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A review workflow with code ${input.workflowCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_CREATED', id, { new: { code: input.workflowCode, name: input.workflowName.trim(), applies_to_all: input.appliesToAll } });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: WorkflowSettingsDto, actor: AuthenticatedTenantUser) {
    const workflow = await this.find(tenantId, id);
    if (workflow.workflow_status === 'ARCHIVED') throw new BadRequestException('This workflow is archived. Restore it to change it.');
    await this.checkScopes(tenantId, input);
    const before = await this.prisma.rndtechnosoft_performance_workflow_scopes.findMany({ where: { tenant_id: tenantId, workflow_id: id }, select: { department_id: true, designation_id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_workflows.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { workflow_name: input.workflowName.trim(), workflow_description: input.description?.trim() || null, applies_to_all: input.appliesToAll, updated_at: new Date() },
      });
      await tx.rndtechnosoft_performance_workflow_scopes.deleteMany({ where: { tenant_id: tenantId, workflow_id: id } });
      await this.writeScopes(tx, tenantId, id, input);
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_UPDATED', id, {
      old: {
        name: workflow.workflow_name, description: workflow.workflow_description, applies_to_all: workflow.applies_to_all,
        department_ids: before.flatMap((s) => (s.department_id ? [s.department_id] : [])).sort(), designation_ids: before.flatMap((s) => (s.designation_id ? [s.designation_id] : [])).sort(),
      },
      new: {
        name: input.workflowName.trim(), description: input.description?.trim() || null, applies_to_all: input.appliesToAll,
        department_ids: [...input.scopes.departmentIds].sort(), designation_ids: [...input.scopes.designationIds].sort(),
      },
    });
    return this.get(tenantId, id);
  }

  async saveDraft(tenantId: string, id: string, input: WorkflowDraftDto, actor: AuthenticatedTenantUser) {
    const workflow = await this.find(tenantId, id);
    if (workflow.workflow_status === 'ARCHIVED') throw new BadRequestException('This workflow is archived. Restore it to change it.');
    const versionId = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      let draft = await tx.rndtechnosoft_performance_workflow_versions.findFirst({ where: { tenant_id: tenantId, workflow_id: id, version_status: 'DRAFT' }, select: { id: true } });
      if (!draft) {
        const last = await tx.rndtechnosoft_performance_workflow_versions.aggregate({ where: { tenant_id: tenantId, workflow_id: id }, _max: { version_number: true } });
        draft = { id: randomUUID() };
        await tx.rndtechnosoft_performance_workflow_versions.create({ data: { id: draft.id, tenant_id: tenantId, workflow_id: id, version_number: (last._max.version_number ?? 0) + 1 } });
      }
      await this.write(tx, tenantId, draft.id, input);
      return draft.id;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_DRAFT_SAVED', id, {
      version_id: versionId, reviewer_resolution: input.reviewerResolution, stages: input.stages.map((s) => ({ key: s.key, step: s.step, source: s.source, action: s.action, weight: s.scoreWeightPercent })),
    });
    return this.get(tenantId, id);
  }

  async discardDraft(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    await this.find(tenantId, id);
    const published = await this.prisma.rndtechnosoft_performance_workflow_versions.count({ where: { tenant_id: tenantId, workflow_id: id, version_status: 'PUBLISHED' } });
    if (!published) throw new BadRequestException('This workflow has never been published, so its draft is all it has. Archive the workflow instead.');
    const { count } = await this.prisma.rndtechnosoft_performance_workflow_versions.deleteMany({ where: { tenant_id: tenantId, workflow_id: id, version_status: 'DRAFT' } });
    if (!count) throw new NotFoundException('This workflow has no draft.');
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_DRAFT_DISCARDED', id, {});
    return this.get(tenantId, id);
  }

  async publish(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const workflow = await this.find(tenantId, id);
    if (workflow.workflow_status === 'ARCHIVED') throw new BadRequestException('This workflow is archived. Restore it to publish.');
    const number = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_performance_workflow_versions.findFirst({ where: { tenant_id: tenantId, workflow_id: id, version_status: 'DRAFT' }, include: WORKFLOW_VERSION });
      if (!draft) throw new NotFoundException('This workflow has no draft to publish.');
      const problems = validateWorkflow(workflowDefinition(draft));
      if (problems.length) throw new BadRequestException({ message: 'The workflow can’t be published yet.', errors: problems });
      await tx.rndtechnosoft_performance_workflow_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: { version_status: 'PUBLISHED', published_at: new Date(), published_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      return draft.version_number;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_PUBLISHED', id, { version: number });
    return this.get(tenantId, id);
  }

  /** Who would review an employee at each stage of a saved version, on a date. Nothing is stored. */
  async resolve(tenantId: string, id: string, versionId: string, input: ResolveReviewersDto) {
    const version = await this.prisma.rndtechnosoft_performance_workflow_versions.findFirst({ where: { tenant_id: tenantId, workflow_id: id, id: versionId }, include: WORKFLOW_VERSION });
    if (!version) throw new NotFoundException('Workflow version not found.');
    const def = workflowDefinition(version);
    if (!def.stages.length) throw new BadRequestException('This version has no stages yet.');
    return { ...(await this.resolver.resolve(tenantId, def, input.employeeId, dateOnly(input.onDate))), resolvedAt: def.resolution };
  }

  async duplicate(tenantId: string, id: string, input: DuplicateDto, actor: AuthenticatedTenantUser) {
    const source = await this.prisma.rndtechnosoft_performance_workflows.findFirst({
      where: { tenant_id: tenantId, id },
      include: { rndtechnosoft_performance_workflow_scopes: true, rndtechnosoft_performance_workflow_versions: { orderBy: { version_number: 'desc' }, take: 1, include: WORKFLOW_VERSION } },
    });
    if (!source) throw new NotFoundException('Review workflow not found.');
    const latest = source.rndtechnosoft_performance_workflow_versions[0];
    const copyId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_workflows.create({
        data: { id: copyId, tenant_id: tenantId, workflow_code: input.code, workflow_name: input.name.trim(), workflow_description: source.workflow_description, applies_to_all: source.applies_to_all, created_by_tenant_member_id: actor.tenantMemberId },
      });
      await this.writeScopes(tx, tenantId, copyId, {
        scopes: {
          departmentIds: source.rndtechnosoft_performance_workflow_scopes.flatMap((s) => (s.department_id ? [s.department_id] : [])),
          designationIds: source.rndtechnosoft_performance_workflow_scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : [])),
        },
      });
      const draftId = randomUUID();
      await tx.rndtechnosoft_performance_workflow_versions.create({ data: { id: draftId, tenant_id: tenantId, workflow_id: copyId, version_number: 1 } });
      if (latest) await this.write(tx, tenantId, draftId, this.inputOf(latest));
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A review workflow with code ${input.code} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_DUPLICATED', copyId, { new: { code: input.code, name: input.name.trim() }, source_workflow_id: id, source_version: latest?.version_number ?? null });
    return this.get(tenantId, copyId);
  }

  /** Deletes a workflow with all its versions while no appraisal uses it; otherwise it can only be archived. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const workflow = await this.find(tenantId, id);
    const used = await this.prisma.rndtechnosoft_performance_appraisals.groupBy({
      by: ['cycle_id'], where: { tenant_id: tenantId, rndtechnosoft_performance_workflow_versions: { workflow_id: id } }, _count: { _all: true },
    });
    if (used.length) {
      const cycles = await this.prisma.rndtechnosoft_performance_cycles.findMany({ where: { tenant_id: tenantId, id: { in: used.map((u) => u.cycle_id) } }, select: { id: true, cycle_code: true } });
      throw new ConflictException(inUseMessage(workflow.workflow_code, used.map((u) => `${u._count._all} appraisal${u._count._all === 1 ? '' : 's'} in cycle ${cycles.find((c) => c.id === u.cycle_id)?.cycle_code ?? ''}`)));
    }
    const inCycles = await this.prisma.rndtechnosoft_performance_cycle_workflows.findMany({ where: { tenant_id: tenantId, workflow_id: id }, take: 10, select: { rndtechnosoft_performance_cycles: { select: { cycle_code: true } } } });
    if (inCycles.length) throw new ConflictException(inUseMessage(workflow.workflow_code, inCycles.map((c) => `cycle ${c.rndtechnosoft_performance_cycles.cycle_code}`)));
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      // Stages (with their members and KRAs) go with their versions, scopes with the workflow.
      await tx.rndtechnosoft_performance_workflow_versions.deleteMany({ where: { tenant_id: tenantId, workflow_id: id } });
      await tx.rndtechnosoft_performance_workflows.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } });
    }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(workflow.workflow_code, ['an appraisal']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_WORKFLOW_DELETED', id, { old: { code: workflow.workflow_code, name: workflow.workflow_name } });
    return { deleted: true };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ARCHIVED', actor);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ACTIVE', actor);
  }

  private async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'ARCHIVED', actor: AuthenticatedTenantUser) {
    const workflow = await this.find(tenantId, id);
    if (workflow.workflow_status === status) return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_workflows.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { workflow_status: status, archived_at: status === 'ARCHIVED' ? new Date() : null, updated_at: new Date() },
    });
    await this.log(tenantId, actor, status === 'ARCHIVED' ? 'PERFORMANCE_WORKFLOW_ARCHIVED' : 'PERFORMANCE_WORKFLOW_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  /** Writes a draft's stages after checking they can be stored and that everything they name is this workspace's. */
  private async write(tx: Tx, tenantId: string, versionId: string, input: WorkflowDraftDto) {
    const problems = unstorable(input.stages);
    if (problems.length) throw new BadRequestException({ message: problems[0], errors: problems.map((message) => ({ message })) });

    const roleIds = [...new Set(input.stages.flatMap((s) => [s.roleId, s.escalationRoleId]).filter((v): v is string => !!v))];
    const memberIds = [...new Set(input.stages.flatMap((s) => s.memberIds))];
    const kraIds = [...new Set(input.stages.flatMap((s) => s.kraIds))];
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [roles, members, kras] = await Promise.all([
      tx.rndtechnosoft_roles.count({ where: where(roleIds) }),
      tx.rndtechnosoft_tenant_members.count({ where: where(memberIds) }),
      tx.rndtechnosoft_performance_kras.count({ where: where(kraIds) }),
    ]);
    // Another workspace's id is reported the same as one that doesn't exist.
    if (roles !== roleIds.length) throw new BadRequestException('A role was not found in this workspace.');
    if (members !== memberIds.length) throw new BadRequestException('A member was not found in this workspace.');
    if (kras !== kraIds.length) throw new BadRequestException('A KRA was not found in this workspace.');

    await tx.rndtechnosoft_performance_workflow_versions.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: versionId } },
      data: { reviewer_resolution: input.reviewerResolution, allows_repeat_reviewers: input.allowsRepeatReviewers, change_note: input.changeNote?.trim() || null, updated_at: new Date() },
    });
    // Members and KRAs go with their stages.
    await tx.rndtechnosoft_performance_workflow_stages.deleteMany({ where: { tenant_id: tenantId, workflow_version_id: versionId } });
    for (const [i, s] of input.stages.entries()) {
      const stageId = randomUUID();
      await tx.rndtechnosoft_performance_workflow_stages.create({
        data: {
          id: stageId, tenant_id: tenantId, workflow_version_id: versionId, stage_key: s.key, stage_name: s.name.trim(), step_number: s.step, reviewer_source: s.source,
          assignment_mode: s.mode, stage_action: s.action, min_reviewers: s.minReviewers, max_reviewers: s.maxReviewers, completion_rule: s.completion, min_completed: s.minCompleted,
          aggregation: s.aggregation, score_weight_percent: decimal(s.scoreWeightPercent), rated_scope: s.ratedScope, reviewer_role_id: s.roleId, nominated_by: s.nominatedBy,
          nomination_needs_approval: s.nominationNeedsApproval, allows_decline: s.allowsDecline, allows_replacement: s.allowsReplacement, return_rule: s.returnRule,
          due_days: s.dueDays, reminder_days: [...s.reminderDays].sort((a, b) => b - a), escalate_after_days: s.escalateAfterDays, escalate_to: s.escalateTo,
          escalation_role_id: s.escalationRoleId, employee_sees: s.employeeSees, reviewer_identity: s.identity, later_stages_see: s.laterStagesSee, display_order: i + 1,
        },
      });
      if (s.memberIds.length) {
        await tx.rndtechnosoft_performance_workflow_stage_members.createMany({ data: s.memberIds.map((m, j) => ({ id: randomUUID(), tenant_id: tenantId, workflow_stage_id: stageId, tenant_member_id: m, display_order: j + 1 })) });
      }
      if (s.kraIds.length) {
        await tx.rndtechnosoft_performance_workflow_stage_kras.createMany({ data: s.kraIds.map((k) => ({ id: randomUUID(), tenant_id: tenantId, workflow_stage_id: stageId, kra_id: k })) });
      }
    }
  }

  private inputOf(v: VersionRow): WorkflowDraftDto {
    const def = workflowDefinition(v);
    return {
      reviewerResolution: def.resolution,
      allowsRepeatReviewers: def.allowRepeatReviewers,
      changeNote: v.change_note ?? undefined,
      stages: def.stages.map(({ scoreWeight, ...s }) => ({ ...s, scoreWeightPercent: text(scoreWeight) })),
    };
  }

  private present(v: VersionRow) {
    return {
      id: v.id,
      number: v.version_number,
      status: v.version_status,
      reviewerResolution: v.reviewer_resolution,
      allowsRepeatReviewers: v.allows_repeat_reviewers,
      stages: v.rndtechnosoft_performance_workflow_stages.map((s) => {
        const def = stageDef(s);
        const { scoreWeight, ...rest } = def;
        return {
          ...rest,
          scoreWeightPercent: text(scoreWeight),
          role: s.reviewer_role && { id: s.reviewer_role.id, name: s.reviewer_role.role_name },
          escalationRole: s.escalation_role && { id: s.escalation_role.id, name: s.escalation_role.role_name },
          members: s.rndtechnosoft_performance_workflow_stage_members.map((m) => ({
            id: m.tenant_member_id,
            name: m.rndtechnosoft_tenant_members.rndtechnosoft_users.display_name ?? m.rndtechnosoft_tenant_members.rndtechnosoft_users.email,
            active: m.rndtechnosoft_tenant_members.membership_status === 'ACTIVE',
          })),
          kras: s.rndtechnosoft_performance_workflow_stage_kras.map((k) => ({ id: k.kra_id, code: k.rndtechnosoft_performance_kras.kra_code, name: k.rndtechnosoft_performance_kras.kra_name })),
        };
      }),
      problems: v.version_status === 'DRAFT' ? validateWorkflow(workflowDefinition(v)) : [],
      changeNote: v.change_note,
      publishedAt: v.published_at,
      publishedBy: v.published_by?.rndtechnosoft_users.display_name ?? null,
    };
  }

  private async checkScopes(tenantId: string, input: { appliesToAll: boolean; scopes: { departmentIds: string[]; designationIds: string[] } }) {
    const count = input.scopes.departmentIds.length + input.scopes.designationIds.length;
    if (!input.appliesToAll && !count) throw new BadRequestException('Choose at least one department or designation, or make the workflow for everyone.');
    if (input.appliesToAll && count) throw new BadRequestException('A workflow for everyone has no departments or designations chosen.');
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [departments, designations] = await Promise.all([
      this.prisma.rndtechnosoft_departments.count({ where: where(input.scopes.departmentIds) }),
      this.prisma.rndtechnosoft_designations.count({ where: where(input.scopes.designationIds) }),
    ]);
    if (departments !== input.scopes.departmentIds.length || designations !== input.scopes.designationIds.length) {
      throw new BadRequestException('A department or designation was not found in this workspace.');
    }
  }

  private async writeScopes(tx: Tx, tenantId: string, workflowId: string, input: { scopes: { departmentIds: string[]; designationIds: string[] } }) {
    const rows = [...input.scopes.departmentIds.map((v) => ({ department_id: v })), ...input.scopes.designationIds.map((v) => ({ designation_id: v }))];
    if (rows.length) await tx.rndtechnosoft_performance_workflow_scopes.createMany({ data: rows.map((r) => ({ id: randomUUID(), tenant_id: tenantId, workflow_id: workflowId, ...r })) });
  }

  private async lock(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_performance_workflows WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }

  private async find(tenantId: string, id: string) {
    const workflow = await this.prisma.rndtechnosoft_performance_workflows.findFirst({ where: { tenant_id: tenantId, id } });
    if (!workflow) throw new NotFoundException('Review workflow not found.');
    return workflow;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_WORKFLOW', entityId: id, oldValues, newValues, metadata });
  }
}
