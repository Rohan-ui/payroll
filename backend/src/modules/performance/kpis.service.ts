import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { RatingScalesService } from './rating-scales.service';
import { CreateKpiDto, DuplicateDto, KpiSettingsDto, LibraryListQueryDto, UpdateKpiDto } from './dto/performance-library.dto';
import { decimal, inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, statusCounts, text } from './performance-common';

type Settings = ReturnType<typeof normalize>;

/** KPIs rated on a scale or answered yes or no have no target and no direction. */
const UNMEASURED = new Set(['YES_NO', 'RATING', 'QUALITATIVE']);
const RATED = new Set(['RATING', 'QUALITATIVE']);

function normalize(input: KpiSettingsDto) {
  return {
    kpiName: input.kpiName.trim(),
    description: input.description?.trim() || null,
    measurementType: input.measurementType,
    unitLabel: input.unitLabel?.trim() || null,
    currencyCode: input.currencyCode,
    direction: input.direction,
    defaultTarget: decimal(input.defaultTarget),
    minimumExpected: decimal(input.minimumExpected),
    stretchTarget: decimal(input.stretchTarget),
    defaultMaxMarks: decimal(input.defaultMaxMarks),
    ratingScaleId: input.ratingScaleId,
    evidenceRequirement: input.evidenceRequirement,
    evaluationInstructions: input.evaluationInstructions?.trim() || null,
  };
}

/**
 * What is wrong with a KPI's settings for its kind of measurement, if
 * anything. Targets must be in order: for higher-is-better the threshold is
 * the lowest acceptable result and the stretch the best counted; for
 * lower-is-better (such as a defect rate) the other way round.
 */
export function kpiProblems(s: Settings): string[] {
  const problems: string[] = [];
  const type = s.measurementType;
  if (type === 'CURRENCY' && !s.currencyCode) problems.push('Choose the currency the KPI is measured in.');
  if (type !== 'CURRENCY' && s.currencyCode) problems.push('Only currency KPIs have a currency.');
  if (UNMEASURED.has(type)) {
    if (s.direction !== 'NOT_APPLICABLE') problems.push('Yes/no and rated KPIs have no “higher or lower is better”.');
    if (s.defaultTarget || s.minimumExpected || s.stretchTarget) problems.push('Yes/no and rated KPIs have no targets.');
  } else if (s.direction === 'NOT_APPLICABLE') {
    problems.push('Say whether a higher or a lower result is better.');
  }
  if (RATED.has(type) && !s.ratingScaleId) problems.push('Choose the rating scale this KPI is rated on.');
  if (s.defaultMaxMarks?.isZero()) problems.push('The maximum marks must be more than 0.');
  const ordered = [s.minimumExpected, s.defaultTarget, s.stretchTarget].filter((v): v is Prisma.Decimal => v !== null);
  const lower = s.direction === 'LOWER_IS_BETTER';
  for (let i = 1; i < ordered.length; i += 1) {
    if (lower ? ordered[i].gt(ordered[i - 1]) : ordered[i].lt(ordered[i - 1])) {
      problems.push(lower
        ? 'For a lower-is-better KPI, the threshold is the highest acceptable result, then the target, then the stretch target (lowest).'
        : 'The threshold is the lowest acceptable result, then the target, then the stretch target (highest).');
      break;
    }
  }
  return problems;
}

const DETAIL = {
  rndtechnosoft_performance_rating_scales: { select: { id: true, scale_name: true, scale_status: true } },
  rndtechnosoft_performance_kra_kpis: {
    include: { rndtechnosoft_performance_kras: { select: { id: true, kra_code: true, kra_name: true, kra_status: true } } },
  },
  created_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
  updated_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
} satisfies Prisma.rndtechnosoft_performance_kpisInclude;

type KpiRow = Prisma.rndtechnosoft_performance_kpisGetPayload<{ include: typeof DETAIL }>;

/**
 * The KPI library. Like KRAs, KPIs are editable definitions guarded by a
 * revision number; published templates keep their own copy.
 */
@Injectable()
export class KpisService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly scales: RatingScalesService) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_kpisWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : { kpi_status: query.status ?? 'ACTIVE' }),
      ...(search ? { OR: [{ kpi_name: { contains: search, mode: 'insensitive' } }, { kpi_code: { contains: search.toUpperCase() } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kpis.findMany({
        where,
        orderBy: [{ kpi_name: 'asc' }, { kpi_code: 'asc' }],
        skip,
        take: limit,
        include: {
          rndtechnosoft_performance_rating_scales: { select: { scale_name: true } },
          _count: { select: { rndtechnosoft_performance_kra_kpis: true } },
        },
      }),
      this.prisma.rndtechnosoft_performance_kpis.count({ where }),
    ]);
    const items = rows.map((k) => ({
      id: k.id,
      kpiCode: k.kpi_code,
      kpiName: k.kpi_name,
      status: k.kpi_status,
      measurementType: k.measurement_type,
      unitLabel: k.unit_label,
      currencyCode: k.currency_code,
      direction: k.direction,
      defaultTarget: text(k.default_target),
      defaultMaxMarks: text(k.default_max_marks),
      ratingScaleName: k.rndtechnosoft_performance_rating_scales?.scale_name ?? null,
      evidenceRequirement: k.evidence_requirement,
      kraCount: k._count.rndtechnosoft_performance_kra_kpis,
    }));
    const groups = await this.prisma.rndtechnosoft_performance_kpis.groupBy({ by: ['kpi_status'], where: { tenant_id: tenantId }, _count: { _all: true } });
    const counts = statusCounts(groups.map((g) => ({ status: g.kpi_status, count: g._count._all })));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const kpi = await this.prisma.rndtechnosoft_performance_kpis.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!kpi) throw new NotFoundException('KPI not found.');
    return this.present(kpi);
  }

  async create(tenantId: string, input: CreateKpiDto, actor: AuthenticatedTenantUser) {
    const settings = await this.check(tenantId, input, null);
    const id = randomUUID();
    await this.prisma.rndtechnosoft_performance_kpis.create({
      data: { id, tenant_id: tenantId, kpi_code: input.kpiCode, ...this.columns(settings), created_by_tenant_member_id: actor.tenantMemberId, updated_by_tenant_member_id: actor.tenantMemberId },
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A KPI with code ${input.kpiCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KPI_CREATED', id, { new: { code: input.kpiCode, ...this.snapshot(settings) } });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: UpdateKpiDto, actor: AuthenticatedTenantUser) {
    const current = await this.prisma.rndtechnosoft_performance_kpis.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!current) throw new NotFoundException('KPI not found.');
    if (current.kpi_status === 'ARCHIVED') throw new BadRequestException('This KPI is archived. Restore it to change it.');
    const settings = await this.check(tenantId, input, current);
    const { count } = await this.prisma.rndtechnosoft_performance_kpis.updateMany({
      where: { tenant_id: tenantId, id, revision_number: input.expectedRevision, kpi_status: 'ACTIVE' },
      data: { ...this.columns(settings), revision_number: { increment: 1 }, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
    });
    if (!count) throw new ConflictException('Someone else changed this KPI after you opened it. Reload it to see their changes, then make yours again.');
    const before = this.snapshot(this.settingsOf(current));
    const after = this.snapshot(settings);
    const changed = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
    await this.log(tenantId, actor, 'PERFORMANCE_KPI_UPDATED', id, {
      old: Object.fromEntries(changed.map((key) => [key, before[key]])),
      new: Object.fromEntries(changed.map((key) => [key, after[key]])),
      revision: input.expectedRevision + 1,
    });
    return this.get(tenantId, id);
  }

  async duplicate(tenantId: string, id: string, input: DuplicateDto, actor: AuthenticatedTenantUser) {
    const source = await this.prisma.rndtechnosoft_performance_kpis.findFirst({ where: { tenant_id: tenantId, id }, include: DETAIL });
    if (!source) throw new NotFoundException('KPI not found.');
    const settings = { ...this.settingsOf(source), kpiName: input.name.trim() };
    const copyId = randomUUID();
    await this.prisma.rndtechnosoft_performance_kpis.create({
      data: { id: copyId, tenant_id: tenantId, kpi_code: input.code, ...this.columns(settings), created_by_tenant_member_id: actor.tenantMemberId, updated_by_tenant_member_id: actor.tenantMemberId },
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A KPI with code ${input.code} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KPI_DUPLICATED', copyId, { new: { code: input.code, name: settings.kpiName }, source_kpi_id: id });
    return this.get(tenantId, copyId);
  }

  /** Deletes a KPI no KRA suggests and no template uses; otherwise it can only be archived. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const kpi = await this.prisma.rndtechnosoft_performance_kpis.findFirst({ where: { tenant_id: tenantId, id }, select: { kpi_code: true, kpi_name: true } });
    if (!kpi) throw new NotFoundException('KPI not found.');
    const [templates, kras] = await Promise.all([
      this.prisma.rndtechnosoft_performance_template_kpis.findMany({
        where: { tenant_id: tenantId, kpi_id: id }, take: 10,
        select: { rndtechnosoft_performance_template_versions: { select: { version_number: true, rndtechnosoft_performance_templates: { select: { template_code: true } } } } },
      }),
      this.prisma.rndtechnosoft_performance_kra_kpis.findMany({ where: { tenant_id: tenantId, kpi_id: id }, take: 10, select: { rndtechnosoft_performance_kras: { select: { kra_code: true } } } }),
    ]);
    const uses = [
      ...templates.map((t) => `template ${t.rndtechnosoft_performance_template_versions.rndtechnosoft_performance_templates.template_code} version ${t.rndtechnosoft_performance_template_versions.version_number}`),
      ...kras.map((k) => `KRA ${k.rndtechnosoft_performance_kras.kra_code}`),
    ];
    if (uses.length) throw new ConflictException(inUseMessage(kpi.kpi_code, [...new Set(uses)]));
    await this.prisma.rndtechnosoft_performance_kpis.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(kpi.kpi_code, ['a KRA or template saved just now']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_KPI_DELETED', id, { old: { code: kpi.kpi_code, name: kpi.kpi_name } });
    return { deleted: true };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ARCHIVED', actor);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ACTIVE', actor);
  }

  private async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'ARCHIVED', actor: AuthenticatedTenantUser) {
    const kpi = await this.prisma.rndtechnosoft_performance_kpis.findFirst({ where: { tenant_id: tenantId, id }, select: { kpi_status: true } });
    if (!kpi) throw new NotFoundException('KPI not found.');
    if (kpi.kpi_status === status) return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_kpis.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { kpi_status: status, archived_at: status === 'ARCHIVED' ? new Date() : null, revision_number: { increment: 1 }, updated_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
    });
    await this.log(tenantId, actor, status === 'ARCHIVED' ? 'PERFORMANCE_KPI_ARCHIVED' : 'PERFORMANCE_KPI_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  private async check(tenantId: string, input: KpiSettingsDto, current: KpiRow | null) {
    const settings = normalize(input);
    const problems = kpiProblems(settings);
    if (problems.length) throw new BadRequestException({ message: problems[0], errors: problems.map((message) => ({ message })) });
    if (settings.ratingScaleId) await this.scales.assertUsable(tenantId, settings.ratingScaleId, current?.rating_scale_id ?? null);
    return settings;
  }

  private settingsOf(kpi: KpiRow): Settings {
    return {
      kpiName: kpi.kpi_name,
      description: kpi.kpi_description,
      measurementType: kpi.measurement_type as Settings['measurementType'],
      unitLabel: kpi.unit_label,
      currencyCode: kpi.currency_code,
      direction: kpi.direction as Settings['direction'],
      defaultTarget: kpi.default_target,
      minimumExpected: kpi.minimum_expected,
      stretchTarget: kpi.stretch_target,
      defaultMaxMarks: kpi.default_max_marks,
      ratingScaleId: kpi.rating_scale_id,
      evidenceRequirement: kpi.evidence_requirement as Settings['evidenceRequirement'],
      evaluationInstructions: kpi.evaluation_instructions,
    };
  }

  private columns(s: Settings) {
    return {
      kpi_name: s.kpiName,
      kpi_description: s.description,
      measurement_type: s.measurementType,
      unit_label: s.unitLabel,
      currency_code: s.currencyCode,
      direction: s.direction,
      default_target: s.defaultTarget,
      minimum_expected: s.minimumExpected,
      stretch_target: s.stretchTarget,
      default_max_marks: s.defaultMaxMarks,
      rating_scale_id: s.ratingScaleId,
      evidence_requirement: s.evidenceRequirement,
      evaluation_instructions: s.evaluationInstructions,
    };
  }

  private snapshot(s: Settings): Record<string, unknown> {
    return {
      name: s.kpiName,
      description: s.description,
      measurement_type: s.measurementType,
      unit_label: s.unitLabel,
      currency_code: s.currencyCode,
      direction: s.direction,
      default_target: text(s.defaultTarget),
      minimum_expected: text(s.minimumExpected),
      stretch_target: text(s.stretchTarget),
      default_max_marks: text(s.defaultMaxMarks),
      rating_scale_id: s.ratingScaleId,
      evidence_requirement: s.evidenceRequirement,
      evaluation_instructions: s.evaluationInstructions,
    };
  }

  private present(kpi: KpiRow) {
    return {
      id: kpi.id,
      kpiCode: kpi.kpi_code,
      kpiName: kpi.kpi_name,
      description: kpi.kpi_description,
      measurementType: kpi.measurement_type,
      unitLabel: kpi.unit_label,
      currencyCode: kpi.currency_code,
      direction: kpi.direction,
      defaultTarget: text(kpi.default_target),
      minimumExpected: text(kpi.minimum_expected),
      stretchTarget: text(kpi.stretch_target),
      defaultMaxMarks: text(kpi.default_max_marks),
      ratingScale: kpi.rndtechnosoft_performance_rating_scales && {
        id: kpi.rndtechnosoft_performance_rating_scales.id,
        name: kpi.rndtechnosoft_performance_rating_scales.scale_name,
        status: kpi.rndtechnosoft_performance_rating_scales.scale_status,
      },
      evidenceRequirement: kpi.evidence_requirement,
      evaluationInstructions: kpi.evaluation_instructions,
      usedBy: kpi.rndtechnosoft_performance_kra_kpis.map((l) => ({
        kraId: l.rndtechnosoft_performance_kras.id,
        kraCode: l.rndtechnosoft_performance_kras.kra_code,
        kraName: l.rndtechnosoft_performance_kras.kra_name,
        status: l.rndtechnosoft_performance_kras.kra_status,
      })),
      status: kpi.kpi_status,
      revision: kpi.revision_number,
      createdBy: kpi.created_by?.rndtechnosoft_users.display_name ?? null,
      updatedBy: kpi.updated_by?.rndtechnosoft_users.display_name ?? null,
      updatedAt: kpi.updated_at,
    };
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_KPI', entityId: id, oldValues, newValues, metadata });
  }
}
