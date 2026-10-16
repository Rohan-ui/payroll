import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, isoDate } from '@/modules/payroll/payroll-lock';
import { RatingScalesService } from './rating-scales.service';
import { CreateKraDto, DuplicateDto, KraSettingsDto, LibraryListQueryDto, UpdateKraDto } from './dto/performance-library.dto';
import { decimal, inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, personName, statusCounts, text } from './performance-common';

type Tx = Prisma.TransactionClient;
type Settings = ReturnType<KrasService['normalize']>;

const DETAIL = {
  rndtechnosoft_performance_kra_scopes: {
    include: {
      rndtechnosoft_departments: { select: { department_name: true } },
      rndtechnosoft_designations: { select: { designation_name: true } },
      rndtechnosoft_employees: { select: { first_name: true, last_name: true, preferred_name: true, employee_code: true } },
    },
  },
  rndtechnosoft_performance_kra_kpis: {
    orderBy: { display_order: 'asc' },
    include: {
      rndtechnosoft_performance_kpis: {
        select: {
          id: true, kpi_code: true, kpi_name: true, measurement_type: true, kpi_status: true, direction: true, unit_label: true,
          default_target: true, minimum_expected: true, stretch_target: true, default_max_marks: true, rating_scale_id: true,
        },
      },
    },
  },
  rndtechnosoft_performance_rating_scales: { select: { id: true, scale_name: true, scale_status: true } },
  created_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
  updated_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
} satisfies Prisma.rndtechnosoft_performance_krasInclude;

type KraRow = Prisma.rndtechnosoft_performance_krasGetPayload<{ include: typeof DETAIL }>;

/**
 * The KRA library. A KRA is an editable definition: every edit raises its
 * revision, and an edit made from an older revision is refused rather than
 * silently overwriting someone else's. Templates copy what they use when
 * they are published, so edits never reach appraisals already under way.
 */
@Injectable()
export class KrasService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scales: RatingScalesService) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_krasWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : { kra_status: query.status ?? 'ACTIVE' }),
      AND: [
        search ? { OR: [{ kra_name: { contains: search, mode: 'insensitive' } }, { kra_code: { contains: search.toUpperCase() } }] } : {},
        query.departmentId ? { OR: [{ applies_to_all: true }, { rndtechnosoft_performance_kra_scopes: { some: { tenant_id: tenantId, department_id: query.departmentId } } }] } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kras.findMany({
        where,
        orderBy: [{ kra_name: 'asc' }, { kra_code: 'asc' }],
        skip,
        take: limit,
        include: {
          rndtechnosoft_performance_kra_scopes: { select: { department_id: true, designation_id: true, employee_id: true, rndtechnosoft_departments: { select: { department_name: true } } } },
          rndtechnosoft_performance_rating_scales: { select: { scale_name: true } },
          _count: { select: { rndtechnosoft_performance_kra_kpis: true } },
        },
      }),
      this.prisma.rndtechnosoft_performance_kras.count({ where }),
    ]);
    const items = rows.map((k) => {
      const scopes = k.rndtechnosoft_performance_kra_scopes;
      return {
        id: k.id,
        kraCode: k.kra_code,
        kraName: k.kra_name,
        status: k.kra_status,
        evidenceRequirement: k.evidence_requirement,
        defaultWeightPercent: text(k.default_weight_percent),
        defaultMaxMarks: text(k.default_max_marks),
        ratingScaleName: k.rndtechnosoft_performance_rating_scales?.scale_name ?? null,
        kpiCount: k._count.rndtechnosoft_performance_kra_kpis,
        appliesTo: {
          all: k.applies_to_all,
          departments: scopes.filter((s) => s.department_id).map((s) => s.rndtechnosoft_departments?.department_name ?? ''),
          designationCount: scopes.filter((s) => s.designation_id).length,
          employeeCount: scopes.filter((s) => s.employee_id).length,
        },
        effectiveFrom: isoDate(k.effective_from),
        effectiveTo: k.effective_to ? isoDate(k.effective_to) : null,
      };
    });
    const groups = await this.prisma.rndtechnosoft_performance_kras.groupBy({ by: ['kra_status'], where: { tenant_id: tenantId }, _count: { _all: true } });
    const counts = statusCounts(groups.map((g) => ({ status: g.kra_status, count: g._count._all })));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const kra = await this.prisma.rndtechnosoft_performance_kras.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!kra) throw new NotFoundException('KRA not found.');
    return this.present(kra);
  }

  async create(tenantId: string, input: CreateKraDto, actor: AuthenticatedTenantUser) {
    const settings = await this.check(tenantId, input, null);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_kras.create({
        data: { id, tenant_id: tenantId, kra_code: input.kraCode, ...this.columns(settings), created_by_tenant_member_id: actor.tenantMemberId, updated_by_tenant_member_id: actor.tenantMemberId },
      });
      await this.writeChildren(tx, tenantId, id, settings);
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A KRA with code ${input.kraCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KRA_CREATED', id, { new: { code: input.kraCode, ...this.snapshot(settings) } });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: UpdateKraDto, actor: AuthenticatedTenantUser) {
    const current = await this.prisma.rndtechnosoft_performance_kras.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!current) throw new NotFoundException('KRA not found.');
    if (current.kra_status === 'ARCHIVED') throw new BadRequestException('This KRA is archived. Restore it to change it.');
    const settings = await this.check(tenantId, input, current);
    await this.prisma.$transaction(async (tx) => {
      // Only the revision the edit was made from may be replaced.
      const { count } = await tx.rndtechnosoft_performance_kras.updateMany({
        where: { tenant_id: tenantId, id, revision_number: input.expectedRevision, kra_status: 'ACTIVE' },
        data: { ...this.columns(settings), revision_number: { increment: 1 }, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      if (!count) throw new ConflictException('Someone else changed this KRA after you opened it. Reload it to see their changes, then make yours again.');
      await tx.rndtechnosoft_performance_kra_scopes.deleteMany({ where: { tenant_id: tenantId, kra_id: id } });
      await tx.rndtechnosoft_performance_kra_kpis.deleteMany({ where: { tenant_id: tenantId, kra_id: id } });
      await this.writeChildren(tx, tenantId, id, settings);
    });
    const before = this.snapshot(this.settingsOf(current));
    const after = this.snapshot(settings);
    const changed = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    await this.log(tenantId, actor, 'PERFORMANCE_KRA_UPDATED', id, {
      old: Object.fromEntries(changed.map((key) => [key, before[key]])),
      new: Object.fromEntries(changed.map((key) => [key, after[key]])),
      revision: input.expectedRevision + 1,
    });
    return this.get(tenantId, id);
  }

  /** A new KRA with the same settings, scopes and KPIs under another code. */
  async duplicate(tenantId: string, id: string, input: DuplicateDto, actor: AuthenticatedTenantUser) {
    const source = await this.prisma.rndtechnosoft_performance_kras.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!source) throw new NotFoundException('KRA not found.');
    const settings = { ...this.settingsOf(source), kraName: input.name.trim() };
    const copyId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_kras.create({
        data: { id: copyId, tenant_id: tenantId, kra_code: input.code, ...this.columns(settings), created_by_tenant_member_id: actor.tenantMemberId, updated_by_tenant_member_id: actor.tenantMemberId },
      });
      await this.writeChildren(tx, tenantId, copyId, settings);
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A KRA with code ${input.code} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KRA_DUPLICATED', copyId, { new: { code: input.code, name: settings.kraName }, source_kra_id: id });
    return this.get(tenantId, copyId);
  }

  /** Deletes a KRA no template or workflow uses; otherwise it can only be archived. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const kra = await this.prisma.rndtechnosoft_performance_kras.findFirst({ where: { tenant_id: tenantId, id }, select: { kra_code: true, kra_name: true } });
    if (!kra) throw new NotFoundException('KRA not found.');
    const [templates, stages] = await Promise.all([
      this.prisma.rndtechnosoft_performance_template_kras.findMany({
        where: { tenant_id: tenantId, kra_id: id }, take: 10,
        select: { rndtechnosoft_performance_template_versions: { select: { version_number: true, rndtechnosoft_performance_templates: { select: { template_code: true } } } } },
      }),
      this.prisma.rndtechnosoft_performance_workflow_stage_kras.findMany({
        where: { tenant_id: tenantId, kra_id: id }, take: 10,
        select: { rndtechnosoft_performance_workflow_stages: { select: { rndtechnosoft_performance_workflow_versions: { select: { version_number: true, rndtechnosoft_performance_workflows: { select: { workflow_code: true } } } } } } },
      }),
    ]);
    const uses = [
      ...templates.map((t) => `template ${t.rndtechnosoft_performance_template_versions.rndtechnosoft_performance_templates.template_code} version ${t.rndtechnosoft_performance_template_versions.version_number}`),
      ...stages.map((s) => `workflow ${s.rndtechnosoft_performance_workflow_stages.rndtechnosoft_performance_workflow_versions.rndtechnosoft_performance_workflows.workflow_code} version ${s.rndtechnosoft_performance_workflow_stages.rndtechnosoft_performance_workflow_versions.version_number}`),
    ];
    if (uses.length) throw new ConflictException(inUseMessage(kra.kra_code, [...new Set(uses)]));
    // Its scopes and suggested KPIs go with it; the database refuses if something started using it meanwhile.
    await this.prisma.rndtechnosoft_performance_kras.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(kra.kra_code, ['a template or workflow saved just now']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KRA_DELETED', id, { old: { code: kra.kra_code, name: kra.kra_name } });
    return { deleted: true };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ARCHIVED', actor);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ACTIVE', actor);
  }

  private async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'ARCHIVED', actor: AuthenticatedTenantUser) {
    const kra = await this.prisma.rndtechnosoft_performance_kras.findFirst({ where: { tenant_id: tenantId, id }, select: { kra_status: true } });
    if (!kra) throw new NotFoundException('KRA not found.');
    if (kra.kra_status === status) return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_kras.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { kra_status: status, archived_at: status === 'ARCHIVED' ? new Date() : null, revision_number: { increment: 1 }, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
    });
    await this.log(tenantId, actor, status === 'ARCHIVED' ? 'PERFORMANCE_KRA_ARCHIVED' : 'PERFORMANCE_KRA_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  /** Checks the settings against this workspace's data; every referenced record must be its own. */
  private async check(tenantId: string, input: KraSettingsDto, current: KraRow | null) {
    const settings = this.normalize(input);
    const problems: string[] = [];
    const { scopes } = settings;
    const scopeCount = scopes.departmentIds.length + scopes.designationIds.length + scopes.employeeIds.length;
    if (!settings.appliesToAll && !scopeCount) problems.push('Choose at least one department, designation or employee, or make the KRA available to everyone.');
    if (settings.appliesToAll && scopeCount) problems.push('A KRA for everyone has no departments, designations or employees chosen.');
    if (settings.defaultMinMarks && !settings.defaultMaxMarks) problems.push('Give the maximum marks before the minimum.');
    if (settings.defaultMinMarks && settings.defaultMaxMarks && !settings.defaultMinMarks.lt(settings.defaultMaxMarks)) problems.push('The minimum marks must be less than the maximum.');
    if (settings.defaultMaxMarks?.isZero()) problems.push('The maximum marks must be more than 0.');
    if (settings.defaultWeightPercent && (settings.defaultWeightPercent.isZero() || settings.defaultWeightPercent.gt(100))) problems.push('The suggested weight is more than 0% and at most 100%.');
    if (settings.effectiveTo && settings.effectiveTo < settings.effectiveFrom) problems.push('The last date can’t be before the first.');
    const kpiIds = settings.kpis.map((k) => k.kpiId);
    if (new Set(kpiIds).size !== kpiIds.length) problems.push('A KPI is listed twice.');
    settings.kpis.forEach((k) => {
      if (k.defaultWeightPercent && (k.defaultWeightPercent.isZero() || k.defaultWeightPercent.gt(100))) problems.push('A KPI’s suggested weight is more than 0% and at most 100%.');
    });
    if (problems.length) throw new BadRequestException({ message: problems[0], errors: problems.map((message) => ({ message })) });

    if (settings.ratingScaleId) await this.scales.assertUsable(tenantId, settings.ratingScaleId, current?.rating_scale_id ?? null);

    // Another workspace's id is reported the same as one that doesn't exist.
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [departments, designations, employees, kpis] = await Promise.all([
      this.prisma.rndtechnosoft_departments.count({ where: where(scopes.departmentIds) }),
      this.prisma.rndtechnosoft_designations.count({ where: where(scopes.designationIds) }),
      this.prisma.rndtechnosoft_employees.count({ where: where(scopes.employeeIds) }),
      this.prisma.rndtechnosoft_performance_kpis.findMany({ where: where(kpiIds), select: { id: true, kpi_name: true, kpi_status: true } }),
    ]);
    if (departments !== scopes.departmentIds.length || designations !== scopes.designationIds.length || employees !== scopes.employeeIds.length) {
      throw new BadRequestException('A department, designation or employee was not found in this workspace.');
    }
    if (kpis.length !== kpiIds.length) throw new BadRequestException('A KPI was not found in this workspace.');
    const linked = new Set(current?.rndtechnosoft_performance_kra_kpis.map((l) => l.kpi_id) ?? []);
    const archived = kpis.find((k) => k.kpi_status !== 'ACTIVE' && !linked.has(k.id));
    if (archived) throw new BadRequestException(`The KPI “${archived.kpi_name}” is archived, so it can’t be added.`);
    return settings;
  }

  private normalize(input: KraSettingsDto) {
    return {
      kraName: input.kraName.trim(),
      description: input.description?.trim() || null,
      measurementMethod: input.measurementMethod?.trim() || null,
      evaluationInstructions: input.evaluationInstructions?.trim() || null,
      evidenceRequirement: input.evidenceRequirement,
      defaultWeightPercent: decimal(input.defaultWeightPercent),
      defaultMaxMarks: decimal(input.defaultMaxMarks),
      defaultMinMarks: decimal(input.defaultMinMarks),
      ratingScaleId: input.ratingScaleId,
      appliesToAll: input.appliesToAll,
      scopes: { departmentIds: [...input.scopes.departmentIds], designationIds: [...input.scopes.designationIds], employeeIds: [...input.scopes.employeeIds] },
      kpis: input.kpis.map((k) => ({ kpiId: k.kpiId, defaultWeightPercent: decimal(k.defaultWeightPercent) })),
      effectiveFrom: dateOnly(input.effectiveFrom),
      effectiveTo: input.effectiveTo ? dateOnly(input.effectiveTo) : null,
    };
  }

  /** The stored KRA as settings, for duplicating and for the audit trail. */
  private settingsOf(kra: KraRow): Settings {
    const scopes = kra.rndtechnosoft_performance_kra_scopes;
    return {
      kraName: kra.kra_name,
      description: kra.kra_description,
      measurementMethod: kra.measurement_method,
      evaluationInstructions: kra.evaluation_instructions,
      evidenceRequirement: kra.evidence_requirement as Settings['evidenceRequirement'],
      defaultWeightPercent: kra.default_weight_percent,
      defaultMaxMarks: kra.default_max_marks,
      defaultMinMarks: kra.default_min_marks,
      ratingScaleId: kra.rating_scale_id,
      appliesToAll: kra.applies_to_all,
      scopes: {
        departmentIds: scopes.flatMap((s) => (s.department_id ? [s.department_id] : [])),
        designationIds: scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : [])),
        employeeIds: scopes.flatMap((s) => (s.employee_id ? [s.employee_id] : [])),
      },
      kpis: kra.rndtechnosoft_performance_kra_kpis.map((l) => ({ kpiId: l.kpi_id, defaultWeightPercent: l.default_weight_percent })),
      effectiveFrom: kra.effective_from,
      effectiveTo: kra.effective_to,
    };
  }

  private columns(s: Settings) {
    return {
      kra_name: s.kraName,
      kra_description: s.description,
      measurement_method: s.measurementMethod,
      evaluation_instructions: s.evaluationInstructions,
      evidence_requirement: s.evidenceRequirement,
      default_weight_percent: s.defaultWeightPercent,
      default_max_marks: s.defaultMaxMarks,
      default_min_marks: s.defaultMinMarks,
      rating_scale_id: s.ratingScaleId,
      applies_to_all: s.appliesToAll,
      effective_from: s.effectiveFrom,
      effective_to: s.effectiveTo,
    };
  }

  private async writeChildren(tx: Tx, tenantId: string, kraId: string, s: Settings) {
    const scopeRows = [
      ...s.scopes.departmentIds.map((v) => ({ department_id: v })),
      ...s.scopes.designationIds.map((v) => ({ designation_id: v })),
      ...s.scopes.employeeIds.map((v) => ({ employee_id: v })),
    ];
    if (scopeRows.length) await tx.rndtechnosoft_performance_kra_scopes.createMany({ data: scopeRows.map((r) => ({ id: randomUUID(), tenant_id: tenantId, kra_id: kraId, ...r })) });
    if (s.kpis.length) {
      await tx.rndtechnosoft_performance_kra_kpis.createMany({
        data: s.kpis.map((k, i) => ({ id: randomUUID(), tenant_id: tenantId, kra_id: kraId, kpi_id: k.kpiId, default_weight_percent: k.defaultWeightPercent, display_order: i + 1 })),
      });
    }
  }

  /** What the audit trail records of a KRA: its settings, with ids and plain values. */
  private snapshot(s: Settings): Record<string, unknown> {
    return {
      name: s.kraName,
      description: s.description,
      measurement_method: s.measurementMethod,
      evaluation_instructions: s.evaluationInstructions,
      evidence_requirement: s.evidenceRequirement,
      default_weight_percent: text(s.defaultWeightPercent),
      default_max_marks: text(s.defaultMaxMarks),
      default_min_marks: text(s.defaultMinMarks),
      rating_scale_id: s.ratingScaleId,
      applies_to_all: s.appliesToAll,
      department_ids: [...s.scopes.departmentIds].sort(),
      designation_ids: [...s.scopes.designationIds].sort(),
      employee_ids: [...s.scopes.employeeIds].sort(),
      kpis: s.kpis.map((k) => ({ kpi_id: k.kpiId, default_weight_percent: text(k.defaultWeightPercent) })),
      effective_from: isoDate(s.effectiveFrom),
      effective_to: s.effectiveTo ? isoDate(s.effectiveTo) : null,
    };
  }

  private present(kra: KraRow) {
    const scopes = kra.rndtechnosoft_performance_kra_scopes;
    return {
      id: kra.id,
      kraCode: kra.kra_code,
      kraName: kra.kra_name,
      description: kra.kra_description,
      measurementMethod: kra.measurement_method,
      evaluationInstructions: kra.evaluation_instructions,
      evidenceRequirement: kra.evidence_requirement,
      defaultWeightPercent: text(kra.default_weight_percent),
      defaultMaxMarks: text(kra.default_max_marks),
      defaultMinMarks: text(kra.default_min_marks),
      ratingScale: kra.rndtechnosoft_performance_rating_scales && {
        id: kra.rndtechnosoft_performance_rating_scales.id,
        name: kra.rndtechnosoft_performance_rating_scales.scale_name,
        status: kra.rndtechnosoft_performance_rating_scales.scale_status,
      },
      appliesToAll: kra.applies_to_all,
      scopes: {
        departments: scopes.flatMap((s) => (s.department_id ? [{ id: s.department_id, name: s.rndtechnosoft_departments?.department_name ?? '' }] : [])),
        designations: scopes.flatMap((s) => (s.designation_id ? [{ id: s.designation_id, name: s.rndtechnosoft_designations?.designation_name ?? '' }] : [])),
        employees: scopes.flatMap((s) => (s.employee_id && s.rndtechnosoft_employees
          ? [{ id: s.employee_id, name: personName(s.rndtechnosoft_employees), code: s.rndtechnosoft_employees.employee_code }]
          : [])),
      },
      kpis: kra.rndtechnosoft_performance_kra_kpis.map((l) => ({
        kpiId: l.kpi_id,
        kpiCode: l.rndtechnosoft_performance_kpis.kpi_code,
        kpiName: l.rndtechnosoft_performance_kpis.kpi_name,
        measurementType: l.rndtechnosoft_performance_kpis.measurement_type,
        status: l.rndtechnosoft_performance_kpis.kpi_status,
        defaultWeightPercent: text(l.default_weight_percent),
        // The KPI's own defaults, for adding the KRA to a template.
        direction: l.rndtechnosoft_performance_kpis.direction,
        unitLabel: l.rndtechnosoft_performance_kpis.unit_label,
        defaultTarget: text(l.rndtechnosoft_performance_kpis.default_target),
        minimumExpected: text(l.rndtechnosoft_performance_kpis.minimum_expected),
        stretchTarget: text(l.rndtechnosoft_performance_kpis.stretch_target),
        defaultMaxMarks: text(l.rndtechnosoft_performance_kpis.default_max_marks),
        ratingScaleId: l.rndtechnosoft_performance_kpis.rating_scale_id,
      })),
      effectiveFrom: isoDate(kra.effective_from),
      effectiveTo: kra.effective_to ? isoDate(kra.effective_to) : null,
      status: kra.kra_status,
      revision: kra.revision_number,
      createdBy: kra.created_by?.rndtechnosoft_users.display_name ?? null,
      updatedBy: kra.updated_by?.rndtechnosoft_users.display_name ?? null,
      updatedAt: kra.updated_at,
    };
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_KRA', entityId: id, oldValues, newValues, metadata });
  }
}
