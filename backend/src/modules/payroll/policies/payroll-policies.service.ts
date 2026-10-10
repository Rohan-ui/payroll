import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, dayBefore, finalizedThrough, isOverlapViolation, isoDate, lockedProblem } from '../payroll-lock';
import { defaultPolicyConfig, PayrollPolicyConfig, validatePolicyConfig } from './policy-config';
import { choosePolicy, EmploymentPlacement, PolicyCandidate, ScopeKind } from './policy-resolution';
import { CreatePolicyDto, PolicyDraftDto, PolicyScopesDto, UpdatePolicyDto } from './dto/payroll-policies.dto';

type Tx = Prisma.TransactionClient;
type ScopeRow = { department_id: string | null; branch_id: string | null; employment_type_id: string | null; designation_id: string | null };

const scopeOf = (row: ScopeRow): { kind: ScopeKind; refId: string } =>
  row.department_id ? { kind: 'department', refId: row.department_id }
  : row.branch_id ? { kind: 'branch', refId: row.branch_id }
  : row.employment_type_id ? { kind: 'employmentType', refId: row.employment_type_id }
  : { kind: 'designation', refId: row.designation_id as string };

/**
 * Payroll policies: named, versioned rules for how attendance becomes pay.
 * A policy is edited as one draft version at a time; publishing it fixes it
 * for good and closes the version before it.
 */
@Injectable()
export class PayrollPoliciesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** The starting rules and the choices for each setting, for the editor. */
  template() {
    return { config: defaultPolicyConfig() };
  }

  async list(tenantId: string, includeArchived = false) {
    const policies = await this.prisma.rndtechnosoft_payroll_policies.findMany({
      where: { tenant_id: tenantId, ...(includeArchived ? {} : { policy_status: 'ACTIVE' }) },
      orderBy: [{ is_default: 'desc' }, { policy_name: 'asc' }],
      take: 200,
      include: {
        rndtechnosoft_payroll_policy_versions: { orderBy: { version_number: 'desc' }, select: { id: true, version_number: true, version_status: true, effective_from: true, effective_to: true } },
        rndtechnosoft_payroll_policy_scopes: true,
      },
    });
    const today = new Date();
    return policies.map((p) => {
      const published = p.rndtechnosoft_payroll_policy_versions.filter((v) => v.version_status === 'PUBLISHED');
      const current = published.find((v) => v.effective_from <= today && (!v.effective_to || v.effective_to >= today)) ?? null;
      const draft = p.rndtechnosoft_payroll_policy_versions.find((v) => v.version_status === 'DRAFT') ?? null;
      return {
        id: p.id,
        policyCode: p.policy_code,
        policyName: p.policy_name,
        description: p.policy_description,
        isDefault: p.is_default,
        status: p.policy_status,
        currentVersion: current && { number: current.version_number, effectiveFrom: isoDate(current.effective_from) },
        upcomingVersion: (() => {
          const next = published.find((v) => v.effective_from > today);
          return next ? { number: next.version_number, effectiveFrom: isoDate(next.effective_from) } : null;
        })(),
        draft: draft && { number: draft.version_number, effectiveFrom: isoDate(draft.effective_from) },
        scopeCount: p.rndtechnosoft_payroll_policy_scopes.length,
      };
    });
  }

  async get(tenantId: string, id: string) {
    const policy = await this.prisma.rndtechnosoft_payroll_policies.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_payroll_policy_versions: {
          orderBy: { version_number: 'desc' },
          include: { published_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } } },
        },
        rndtechnosoft_payroll_policy_scopes: true,
      },
    });
    if (!policy) throw new NotFoundException('Payroll policy not found.');
    const scopes = policy.rndtechnosoft_payroll_policy_scopes.map(scopeOf);
    const ids = (kind: ScopeKind) => scopes.filter((s) => s.kind === kind).map((s) => s.refId);
    return {
      id: policy.id,
      policyCode: policy.policy_code,
      policyName: policy.policy_name,
      description: policy.policy_description,
      isDefault: policy.is_default,
      status: policy.policy_status,
      scopes: { departmentIds: ids('department'), branchIds: ids('branch'), employmentTypeIds: ids('employmentType'), designationIds: ids('designation') },
      versions: policy.rndtechnosoft_payroll_policy_versions.map((v) => ({
        id: v.id,
        number: v.version_number,
        status: v.version_status,
        effectiveFrom: isoDate(v.effective_from),
        effectiveTo: v.effective_to ? isoDate(v.effective_to) : null,
        config: v.policy_config as unknown as PayrollPolicyConfig,
        changeNote: v.change_note,
        publishedAt: v.published_at,
        publishedBy: v.published_by?.rndtechnosoft_users.display_name ?? null,
      })),
      lockedThrough: await this.lockedThrough(tenantId),
    };
  }

  /** Options to scope a policy by. */
  async scopeOptions(tenantId: string) {
    const where = { tenant_id: tenantId };
    const [departments, branches, employmentTypes, designations] = await Promise.all([
      this.prisma.rndtechnosoft_departments.findMany({ where, select: { id: true, department_name: true }, orderBy: { department_name: 'asc' }, take: 500 }),
      this.prisma.rndtechnosoft_branches.findMany({ where, select: { id: true, branch_name: true }, orderBy: { branch_name: 'asc' }, take: 500 }),
      this.prisma.rndtechnosoft_employment_types.findMany({ where, select: { id: true, employment_type_name: true }, orderBy: { employment_type_name: 'asc' }, take: 500 }),
      this.prisma.rndtechnosoft_designations.findMany({ where, select: { id: true, designation_name: true }, orderBy: { designation_name: 'asc' }, take: 500 }),
    ]);
    return {
      departments: departments.map((d) => ({ id: d.id, name: d.department_name })),
      branches: branches.map((b) => ({ id: b.id, name: b.branch_name })),
      employmentTypes: employmentTypes.map((e) => ({ id: e.id, name: e.employment_type_name })),
      designations: designations.map((d) => ({ id: d.id, name: d.designation_name })),
    };
  }

  async create(tenantId: string, input: CreatePolicyDto, actor: AuthenticatedTenantUser) {
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const locked = lockedProblem(effectiveFrom, await finalizedThrough(this.prisma, tenantId), 'a new policy');
    if (locked) throw new BadRequestException(locked);
    const existing = await this.prisma.rndtechnosoft_payroll_policies.findFirst({ where: { tenant_id: tenantId, policy_code: input.policyCode }, select: { id: true } });
    if (existing) throw new ConflictException(`A payroll policy with code ${input.policyCode} already exists.`);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_payroll_policies.create({
        data: {
          id, tenant_id: tenantId, policy_code: input.policyCode, policy_name: input.policyName.trim(), policy_description: input.description?.trim() || null,
          is_default: input.isDefault ?? false, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      await tx.rndtechnosoft_payroll_policy_versions.create({
        data: { id: randomUUID(), tenant_id: tenantId, payroll_policy_id: id, version_number: 1, effective_from: effectiveFrom, policy_config: defaultPolicyConfig() as unknown as Prisma.InputJsonValue },
      });
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_CREATED', id, { code: input.policyCode, is_default: input.isDefault ?? false });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: UpdatePolicyDto, actor: AuthenticatedTenantUser) {
    const policy = await this.find(tenantId, id);
    if (policy.policy_status === 'ARCHIVED') throw new BadRequestException('This policy is archived.');
    await this.prisma.$transaction(async (tx) => {
      if (input.isDefault && !policy.is_default) await this.clearDefault(tx, tenantId);
      await tx.rndtechnosoft_payroll_policies.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { policy_name: input.policyName.trim(), policy_description: input.description?.trim() || null, is_default: input.isDefault, updated_at: new Date() },
      });
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_UPDATED', id, {
      before: { name: policy.policy_name, is_default: policy.is_default },
      after: { name: input.policyName.trim(), is_default: input.isDefault },
    });
    return this.get(tenantId, id);
  }

  async setScopes(tenantId: string, id: string, input: PolicyScopesDto, actor: AuthenticatedTenantUser) {
    const policy = await this.find(tenantId, id);
    if (policy.policy_status === 'ARCHIVED') throw new BadRequestException('This policy is archived.');
    // Every target must be this workspace's; another workspace's id is reported as not found.
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [d, b, e, g] = await Promise.all([
      this.prisma.rndtechnosoft_departments.count({ where: where(input.departmentIds) }),
      this.prisma.rndtechnosoft_branches.count({ where: where(input.branchIds) }),
      this.prisma.rndtechnosoft_employment_types.count({ where: where(input.employmentTypeIds) }),
      this.prisma.rndtechnosoft_designations.count({ where: where(input.designationIds) }),
    ]);
    if (d !== input.departmentIds.length || b !== input.branchIds.length || e !== input.employmentTypeIds.length || g !== input.designationIds.length) {
      throw new BadRequestException('A department, branch, employment type or designation was not found in this workspace.');
    }
    const rows = [
      ...input.departmentIds.map((v) => ({ department_id: v })),
      ...input.branchIds.map((v) => ({ branch_id: v })),
      ...input.employmentTypeIds.map((v) => ({ employment_type_id: v })),
      ...input.designationIds.map((v) => ({ designation_id: v })),
    ];
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_payroll_policy_scopes.deleteMany({ where: { tenant_id: tenantId, payroll_policy_id: id } });
      if (rows.length) await tx.rndtechnosoft_payroll_policy_scopes.createMany({ data: rows.map((r) => ({ id: randomUUID(), tenant_id: tenantId, payroll_policy_id: id, ...r })) });
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_SCOPES_CHANGED', id, {
      departments: input.departmentIds.length, branches: input.branchIds.length, employment_types: input.employmentTypeIds.length, designations: input.designationIds.length,
    });
    return this.get(tenantId, id);
  }

  /** Creates or replaces the policy's one draft version. */
  async saveDraft(tenantId: string, id: string, input: PolicyDraftDto, actor: AuthenticatedTenantUser) {
    const policy = await this.find(tenantId, id);
    if (policy.policy_status === 'ARCHIVED') throw new BadRequestException('This policy is archived.');
    const checked = validatePolicyConfig(input.config);
    if ('problems' in checked) throw new BadRequestException({ message: 'Some policy settings need fixing.', errors: checked.problems });
    const effectiveFrom = dateOnly(input.effectiveFrom);
    await this.checkDate(tenantId, id, effectiveFrom);
    const versionId = await this.prisma.$transaction(async (tx) => {
      await this.lockPolicy(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_payroll_policy_versions.findFirst({ where: { tenant_id: tenantId, payroll_policy_id: id, version_status: 'DRAFT' }, select: { id: true } });
      const data = { effective_from: effectiveFrom, policy_config: checked.config as unknown as Prisma.InputJsonValue, change_note: input.changeNote?.trim() || null };
      if (draft) {
        await tx.rndtechnosoft_payroll_policy_versions.update({ where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } }, data: { ...data, updated_at: new Date() } });
        return draft.id;
      }
      const last = await tx.rndtechnosoft_payroll_policy_versions.aggregate({ where: { tenant_id: tenantId, payroll_policy_id: id }, _max: { version_number: true } });
      const newId = randomUUID();
      await tx.rndtechnosoft_payroll_policy_versions.create({ data: { id: newId, tenant_id: tenantId, payroll_policy_id: id, version_number: (last._max.version_number ?? 0) + 1, ...data } });
      return newId;
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_DRAFT_SAVED', id, { version_id: versionId, effective_from: input.effectiveFrom });
    return this.get(tenantId, id);
  }

  async discardDraft(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    await this.find(tenantId, id);
    const { count } = await this.prisma.rndtechnosoft_payroll_policy_versions.deleteMany({ where: { tenant_id: tenantId, payroll_policy_id: id, version_status: 'DRAFT' } });
    if (!count) throw new NotFoundException('This policy has no draft.');
    await this.log(tenantId, actor, 'PAYROLL_POLICY_DRAFT_DISCARDED', id, {});
    return this.get(tenantId, id);
  }

  /** Publishes the draft: from its date it replaces the version before, which ends the day before. */
  async publish(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const policy = await this.find(tenantId, id);
    if (policy.policy_status === 'ARCHIVED') throw new BadRequestException('This policy is archived.');
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockPolicy(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_payroll_policy_versions.findFirst({ where: { tenant_id: tenantId, payroll_policy_id: id, version_status: 'DRAFT' } });
      if (!draft) throw new NotFoundException('This policy has no draft to publish.');
      // Checked again: the rules may have been saved under an older version of this code.
      const checked = validatePolicyConfig(draft.policy_config);
      if ('problems' in checked) throw new BadRequestException({ message: 'Some policy settings need fixing before publishing.', errors: checked.problems });
      await this.checkDate(tenantId, id, draft.effective_from, tx);
      const previous = await tx.rndtechnosoft_payroll_policy_versions.findFirst({
        where: { tenant_id: tenantId, payroll_policy_id: id, version_status: 'PUBLISHED', effective_to: null },
        select: { id: true, version_number: true },
      });
      if (previous) {
        await tx.rndtechnosoft_payroll_policy_versions.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: dayBefore(draft.effective_from), updated_at: new Date() } });
      }
      await tx.rndtechnosoft_payroll_policy_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: { version_status: 'PUBLISHED', published_at: new Date(), published_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      return { versionId: draft.id, number: draft.version_number, effectiveFrom: isoDate(draft.effective_from), closed: previous?.version_number ?? null };
    }).catch((e) => {
      if (isOverlapViolation(e)) throw new ConflictException('These dates overlap another published version of this policy.');
      throw e;
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_PUBLISHED', id, { version_id: result.versionId, version: result.number, effective_from: result.effectiveFrom, closed_version: result.closed });
    return this.get(tenantId, id);
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const policy = await this.find(tenantId, id);
    if (policy.policy_status === 'ARCHIVED') return this.get(tenantId, id);
    if (policy.is_default) throw new BadRequestException('This is the default policy. Make another policy the default before archiving it.');
    const inUse = await this.prisma.rndtechnosoft_employee_salary_assignments.count({
      where: { tenant_id: tenantId, payroll_policy_id: id, assignment_status: 'ACTIVE', effective_to: null },
    });
    if (inUse) throw new BadRequestException(`${inUse} employee salar${inUse === 1 ? 'y names' : 'ies name'} this policy. Revise ${inUse === 1 ? 'it' : 'them'} to another policy first.`);
    await this.prisma.rndtechnosoft_payroll_policies.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { policy_status: 'ARCHIVED', archived_at: new Date(), updated_at: new Date() },
    });
    await this.log(tenantId, actor, 'PAYROLL_POLICY_ARCHIVED', id, {});
    return this.get(tenantId, id);
  }

  /**
   * The policy and version that apply to an employee on a date: the one
   * their salary names, else the one that covers them, else the default.
   */
  async resolve(tenantId: string, employeeId: string, onDate: Date, namedPolicyId: string | null) {
    const policies = await this.prisma.rndtechnosoft_payroll_policies.findMany({
      where: { tenant_id: tenantId, policy_status: 'ACTIVE', ...(namedPolicyId ? { id: namedPolicyId } : {}) },
      include: {
        rndtechnosoft_payroll_policy_scopes: true,
        rndtechnosoft_payroll_policy_versions: {
          where: { version_status: 'PUBLISHED', effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
          take: 1,
        },
      },
    });
    const inForce = policies.filter((p) => p.rndtechnosoft_payroll_policy_versions.length);
    let choice: { policyId: string; reason: string } | { problem: string };
    if (namedPolicyId) {
      choice = inForce.length ? { policyId: namedPolicyId, reason: 'Named on the employee’s salary' } : { problem: 'The policy named on the employee’s salary has no published version in force on this date, or is archived.' };
    } else {
      const employment = await this.prisma.rndtechnosoft_employee_employments.findFirst({
        where: { tenant_id: tenantId, employee_id: employeeId, effective_from: { lte: onDate }, OR: [{ effective_to: null }, { effective_to: { gte: onDate } }] },
        orderBy: { effective_from: 'desc' },
        select: { department_id: true, branch_id: true, employment_type_id: true, designation_id: true },
      });
      const placement: EmploymentPlacement | null = employment && {
        department: employment.department_id, branch: employment.branch_id, employmentType: employment.employment_type_id, designation: employment.designation_id,
      };
      const candidates: PolicyCandidate[] = inForce.map((p) => ({ id: p.id, name: p.policy_name, isDefault: p.is_default, scopes: p.rndtechnosoft_payroll_policy_scopes.map(scopeOf) }));
      choice = choosePolicy(candidates, placement);
    }
    if ('problem' in choice) return { policy: null, version: null, reason: null, problem: choice.problem };
    const policy = inForce.find((p) => p.id === choice.policyId);
    if (!policy) return { policy: null, version: null, reason: null, problem: 'The chosen policy could not be loaded.' };
    const version = policy.rndtechnosoft_payroll_policy_versions[0];
    return {
      policy: { id: policy.id, policyCode: policy.policy_code, policyName: policy.policy_name },
      version: { id: version.id, number: version.version_number, effectiveFrom: isoDate(version.effective_from), config: version.policy_config as unknown as PayrollPolicyConfig },
      reason: choice.reason,
      problem: null,
    };
  }

  /** A draft's date must be after finalized payroll and after every published version. */
  private async checkDate(tenantId: string, id: string, effectiveFrom: Date, db: Tx | PrismaService = this.prisma) {
    const locked = lockedProblem(effectiveFrom, await finalizedThrough(db, tenantId), 'a change of policy');
    if (locked) throw new BadRequestException(locked);
    const latest = await db.rndtechnosoft_payroll_policy_versions.findFirst({
      where: { tenant_id: tenantId, payroll_policy_id: id, version_status: 'PUBLISHED' },
      orderBy: { effective_from: 'desc' },
      select: { effective_from: true, version_number: true },
    });
    if (latest && effectiveFrom <= latest.effective_from) {
      throw new BadRequestException(`Version ${latest.version_number} already starts on ${isoDate(latest.effective_from)}. A new version must start after that.`);
    }
  }

  private async lockedThrough(tenantId: string) {
    const date = await finalizedThrough(this.prisma, tenantId);
    return date ? isoDate(date) : null;
  }

  private async lockPolicy(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_payroll_policies WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }

  private async clearDefault(tx: Tx, tenantId: string) {
    await tx.rndtechnosoft_payroll_policies.updateMany({ where: { tenant_id: tenantId, is_default: true }, data: { is_default: false, updated_at: new Date() } });
  }

  private async find(tenantId: string, id: string) {
    const policy = await this.prisma.rndtechnosoft_payroll_policies.findFirst({ where: { tenant_id: tenantId, id } });
    if (!policy) throw new NotFoundException('Payroll policy not found.');
    return policy;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PAYROLL_POLICY', entityId: id, metadata });
  }
}
