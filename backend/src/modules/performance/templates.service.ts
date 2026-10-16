import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { definitionOf as scaleDefinitionOf } from './rating-scales.service';
import { DuplicateDto, LibraryListQueryDto } from './dto/performance-library.dto';
import { CreateTemplateDto, TemplateDraftDto, TemplateSettingsDto } from './dto/performance-templates.dto';
import { decimal, inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, statusCounts, text } from './performance-common';
import { Direction, ItemInput, MeasurementType, ScoringMethod } from './scoring/scoring-methods';
import { EmployeeVisibility, FieldType, FilledBy, SCORABLE_FIELD_TYPES } from './scoring/form-fields';
import { MissingRule, ScoringModel, TargetSource, TemplateDef, validateTemplate, WeightRule } from './scoring/template-definition';
import { scoreAppraisal } from './scoring/scoring-engine';

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaService;

const SCALE_VERSION = {
  include: {
    rndtechnosoft_performance_rating_scale_levels: true,
    rndtechnosoft_performance_rating_scale_bands: true,
    rndtechnosoft_performance_rating_scales: { select: { id: true, scale_name: true } },
  },
} as const;

export const TEMPLATE_VERSION = {
  final_scale_version: SCALE_VERSION,
  published_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
  rndtechnosoft_performance_template_kras: {
    orderBy: { display_order: 'asc' },
    include: {
      rndtechnosoft_performance_rating_scale_versions: SCALE_VERSION,
      rndtechnosoft_performance_template_kpis: { orderBy: { display_order: 'asc' }, include: { rndtechnosoft_performance_rating_scale_versions: SCALE_VERSION } },
    },
  },
  rndtechnosoft_performance_template_fields: { orderBy: { display_order: 'asc' }, include: { rndtechnosoft_performance_rating_scale_versions: SCALE_VERSION } },
} satisfies Prisma.rndtechnosoft_performance_template_versionsInclude;

export type TemplateVersionRow = Prisma.rndtechnosoft_performance_template_versionsGetPayload<{ include: typeof TEMPLATE_VERSION }>;
type VersionRow = Prisma.rndtechnosoft_performance_template_versionsGetPayload<{ include: typeof TEMPLATE_VERSION }>;
type ScaleVersionRow = Prisma.rndtechnosoft_performance_rating_scale_versionsGetPayload<typeof SCALE_VERSION>;

/** A pinned scale version as the editor and preview need it. */
const scaleRef = (v: ScaleVersionRow | null) => {
  if (!v) return null;
  const d = scaleDefinitionOf(v);
  return {
    scaleId: v.rating_scale_id,
    scaleName: v.rndtechnosoft_performance_rating_scales.scale_name,
    versionId: v.id,
    versionNumber: v.version_number,
    inputKind: d.inputKind,
    minValue: text(d.minValue),
    maxValue: text(d.maxValue),
    stepValue: text(d.stepValue),
    levels: d.levels.map((l) => ({ value: l.value.toString(), label: l.label })),
    bands: d.bands.map((b) => ({ label: b.label, minPercent: b.minPercent.toString(), maxPercent: b.maxPercent.toString() })),
  };
};

/** A stored template version as the scoring rules see it. */
export function templateDefinition(v: VersionRow): TemplateDef {
  const scale = (row: ScaleVersionRow | null) => (row ? scaleDefinitionOf(row) : null);
  return {
    policy: {
      model: v.scoring_model as ScoringModel, weightRule: v.weight_rule as WeightRule, totalMarks: v.total_marks,
      missingRule: v.missing_rating_rule as MissingRule, decimals: v.score_decimals, finalScale: scale(v.final_scale_version),
    },
    kras: v.rndtechnosoft_performance_template_kras.map((k) => ({
      key: k.id, code: k.kra_code, name: k.kra_name, weightPercent: k.weight_percent, maxMarks: k.max_marks, minMarks: k.min_marks,
      method: k.scoring_method as ScoringMethod | null, scale: scale(k.rndtechnosoft_performance_rating_scale_versions), allowsExemption: k.allows_exemption,
      kpis: k.rndtechnosoft_performance_template_kpis.map((p) => ({
        key: p.id, code: p.kpi_code, name: p.kpi_name, measurementType: p.measurement_type as MeasurementType, direction: p.direction as Direction, unitLabel: p.unit_label,
        method: p.scoring_method as ScoringMethod, config: p.scoring_config, targetSource: p.target_source as TargetSource,
        target: p.target_value, threshold: p.threshold_value, stretch: p.stretch_value, weightPercent: p.weight_percent, maxMarks: p.max_marks,
        scale: scale(p.rndtechnosoft_performance_rating_scale_versions), allowsExemption: p.allows_exemption,
      })),
    })),
    fields: v.rndtechnosoft_performance_template_fields.map((f) => ({
      key: f.id, fieldKey: f.field_key, label: f.field_label, type: f.field_type as FieldType, required: f.is_required, filledBy: f.filled_by as FilledBy,
      visibility: f.employee_visibility as EmployeeVisibility, config: f.field_config, scale: scale(f.rndtechnosoft_performance_rating_scale_versions),
      scored: f.is_scored, weightPercent: f.weight_percent, maxMarks: f.max_marks,
    })),
  };
}

const ITEM_TEXT_KEYS = ['actual', 'target', 'threshold', 'stretch', 'rating', 'marks', 'value', 'scorePercent'] as const;

/** Only the values a line can take, as short strings; anything else is treated as not given. */
function cleanInputs(raw: Record<string, unknown>, keys: Set<string>): Record<string, ItemInput> {
  const inputs: Record<string, ItemInput> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!keys.has(key) || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const given = value as Record<string, unknown>;
    const item: ItemInput = {};
    for (const k of ITEM_TEXT_KEYS) if (typeof given[k] === 'string' && (given[k] as string).length <= 30) item[k] = given[k] as string;
    if (given.answer === 'YES' || given.answer === 'NO') item.answer = given.answer;
    if (typeof given.justification === 'string') item.justification = given.justification.slice(0, 1000);
    if (given.exempt === true) item.exempt = true;
    inputs[key] = item;
  }
  return inputs;
}

/**
 * Appraisal templates: per department or designation, the KRAs and KPIs
 * people are appraised on, how each is weighted and scored, and the form's
 * questions. A template is edited as one draft at a time. Saving and
 * publishing copy the library definitions in and pin each rating scale's
 * latest published version, so a published version is self-contained and
 * never changes; publishing refuses anything validateTemplate objects to.
 */
@Injectable()
export class PerformanceTemplatesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_templatesWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : { template_status: query.status ?? 'ACTIVE' }),
      AND: [
        search ? { OR: [{ template_name: { contains: search, mode: 'insensitive' } }, { template_code: { contains: search.toUpperCase() } }] } : {},
        query.departmentId ? { OR: [{ applies_to_all: true }, { rndtechnosoft_performance_template_scopes: { some: { tenant_id: tenantId, department_id: query.departmentId } } }] } : {},
      ],
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_templates.findMany({
        where,
        orderBy: [{ template_name: 'asc' }, { template_code: 'asc' }],
        skip,
        take: limit,
        include: {
          rndtechnosoft_performance_template_scopes: { select: { department_id: true, designation_id: true, rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } } },
          rndtechnosoft_performance_template_versions: {
            orderBy: { version_number: 'desc' },
            select: { version_number: true, version_status: true, scoring_model: true, _count: { select: { rndtechnosoft_performance_template_kras: true, rndtechnosoft_performance_template_fields: true } } },
          },
        },
      }),
      this.prisma.rndtechnosoft_performance_templates.count({ where }),
    ]);
    const items = rows.map((t) => {
      const versions = t.rndtechnosoft_performance_template_versions;
      const current = versions.find((v) => v.version_status === 'PUBLISHED') ?? null;
      const draft = versions.find((v) => v.version_status === 'DRAFT') ?? null;
      const scopes = t.rndtechnosoft_performance_template_scopes;
      return {
        id: t.id,
        templateCode: t.template_code,
        templateName: t.template_name,
        status: t.template_status,
        appliesTo: {
          all: t.applies_to_all,
          departments: scopes.flatMap((s) => (s.rndtechnosoft_departments ? [s.rndtechnosoft_departments.department_name] : [])),
          designations: scopes.flatMap((s) => (s.rndtechnosoft_designations ? [s.rndtechnosoft_designations.designation_name] : [])),
        },
        currentVersion: current && { number: current.version_number, scoringModel: current.scoring_model, kraCount: current._count.rndtechnosoft_performance_template_kras, questionCount: current._count.rndtechnosoft_performance_template_fields },
        draft: draft && { number: draft.version_number },
      };
    });
    const groups = await this.prisma.rndtechnosoft_performance_templates.groupBy({ by: ['template_status'], where: { tenant_id: tenantId }, _count: { _all: true } });
    const counts = statusCounts(groups.map((g) => ({ status: g.template_status, count: g._count._all })));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const template = await this.prisma.rndtechnosoft_performance_templates.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_performance_template_scopes: { include: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } } },
        rndtechnosoft_performance_template_versions: { orderBy: { version_number: 'desc' }, include: TEMPLATE_VERSION },
      },
    });
    if (!template) throw new NotFoundException('Appraisal template not found.');
    const scopes = template.rndtechnosoft_performance_template_scopes;
    return {
      id: template.id,
      templateCode: template.template_code,
      templateName: template.template_name,
      description: template.template_description,
      status: template.template_status,
      appliesToAll: template.applies_to_all,
      scopes: {
        departments: scopes.flatMap((s) => (s.department_id ? [{ id: s.department_id, name: s.rndtechnosoft_departments?.department_name ?? '' }] : [])),
        designations: scopes.flatMap((s) => (s.designation_id ? [{ id: s.designation_id, name: s.rndtechnosoft_designations?.designation_name ?? '' }] : [])),
      },
      versions: template.rndtechnosoft_performance_template_versions.map((v) => this.present(v)),
    };
  }

  async create(tenantId: string, input: CreateTemplateDto, actor: AuthenticatedTenantUser) {
    await this.checkScopes(tenantId, input);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_templates.create({
        data: {
          id, tenant_id: tenantId, template_code: input.templateCode, template_name: input.templateName.trim(), template_description: input.description?.trim() || null,
          applies_to_all: input.appliesToAll, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      await this.writeScopes(tx, tenantId, id, input);
      await tx.rndtechnosoft_performance_template_versions.create({ data: { id: randomUUID(), tenant_id: tenantId, template_id: id, version_number: 1 } });
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`An appraisal template with code ${input.templateCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_CREATED', id, { new: { code: input.templateCode, name: input.templateName.trim(), applies_to_all: input.appliesToAll } });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: TemplateSettingsDto, actor: AuthenticatedTenantUser) {
    const template = await this.find(tenantId, id);
    if (template.template_status === 'ARCHIVED') throw new BadRequestException('This template is archived. Restore it to change it.');
    await this.checkScopes(tenantId, input);
    const before = await this.prisma.rndtechnosoft_performance_template_scopes.findMany({ where: { tenant_id: tenantId, template_id: id }, select: { department_id: true, designation_id: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_templates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { template_name: input.templateName.trim(), template_description: input.description?.trim() || null, applies_to_all: input.appliesToAll, updated_at: new Date() },
      });
      await tx.rndtechnosoft_performance_template_scopes.deleteMany({ where: { tenant_id: tenantId, template_id: id } });
      await this.writeScopes(tx, tenantId, id, input);
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_UPDATED', id, {
      old: {
        name: template.template_name, description: template.template_description, applies_to_all: template.applies_to_all,
        department_ids: before.flatMap((s) => (s.department_id ? [s.department_id] : [])).sort(), designation_ids: before.flatMap((s) => (s.designation_id ? [s.designation_id] : [])).sort(),
      },
      new: {
        name: input.templateName.trim(), description: input.description?.trim() || null, applies_to_all: input.appliesToAll,
        department_ids: [...input.scopes.departmentIds].sort(), designation_ids: [...input.scopes.designationIds].sort(),
      },
    });
    return this.get(tenantId, id);
  }

  /** Creates or replaces the template's one draft version. Problems that only block publishing are reported, not refused. */
  async saveDraft(tenantId: string, id: string, input: TemplateDraftDto, actor: AuthenticatedTenantUser) {
    const template = await this.find(tenantId, id);
    if (template.template_status === 'ARCHIVED') throw new BadRequestException('This template is archived. Restore it to change it.');
    const versionId = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      const keep = await this.inUse(tx, tenantId, id);
      let draft = await tx.rndtechnosoft_performance_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: id, version_status: 'DRAFT' }, select: { id: true } });
      if (!draft) {
        const last = await tx.rndtechnosoft_performance_template_versions.aggregate({ where: { tenant_id: tenantId, template_id: id }, _max: { version_number: true } });
        draft = { id: randomUUID() };
        await tx.rndtechnosoft_performance_template_versions.create({ data: { id: draft.id, tenant_id: tenantId, template_id: id, version_number: (last._max.version_number ?? 0) + 1 } });
      }
      await this.write(tx, tenantId, draft.id, input, keep);
      return draft.id;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_DRAFT_SAVED', id, {
      version_id: versionId, scoring_model: input.scoringModel, weight_rule: input.weightRule, kras: input.kras.length,
      kpis: input.kras.reduce((n, k) => n + k.kpis.length, 0), questions: input.fields.length,
    });
    return this.get(tenantId, id);
  }

  async discardDraft(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    await this.find(tenantId, id);
    const published = await this.prisma.rndtechnosoft_performance_template_versions.count({ where: { tenant_id: tenantId, template_id: id, version_status: 'PUBLISHED' } });
    if (!published) throw new BadRequestException('This template has never been published, so its draft is all it has. Archive the template instead.');
    const { count } = await this.prisma.rndtechnosoft_performance_template_versions.deleteMany({ where: { tenant_id: tenantId, template_id: id, version_status: 'DRAFT' } });
    if (!count) throw new NotFoundException('This template has no draft.');
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_DRAFT_DISCARDED', id, {});
    return this.get(tenantId, id);
  }

  /**
   * Publishes the draft. Library definitions are copied in again and each
   * scale's latest published version pinned again, so what is published is
   * the library as it stands; then every rule is checked.
   */
  async publish(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const template = await this.find(tenantId, id);
    if (template.template_status === 'ARCHIVED') throw new BadRequestException('This template is archived. Restore it to publish.');
    const number = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_performance_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: id, version_status: 'DRAFT' }, include: TEMPLATE_VERSION });
      if (!draft) throw new NotFoundException('This template has no draft to publish.');
      await this.write(tx, tenantId, draft.id, this.inputOf(draft), await this.inUse(tx, tenantId, id));
      const fresh = await tx.rndtechnosoft_performance_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: draft.id }, include: TEMPLATE_VERSION });
      const problems = validateTemplate(templateDefinition(fresh));
      if (problems.length) throw new BadRequestException({ message: 'The template can’t be published yet.', errors: problems });
      await tx.rndtechnosoft_performance_template_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: { version_status: 'PUBLISHED', published_at: new Date(), published_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      return draft.version_number;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_PUBLISHED', id, { version: number });
    return this.get(tenantId, id);
  }

  /** Tries the scoring of a saved version with sample results; nothing is stored. */
  async preview(tenantId: string, id: string, versionId: string, raw: Record<string, unknown>) {
    const version = await this.prisma.rndtechnosoft_performance_template_versions.findFirst({ where: { tenant_id: tenantId, template_id: id, id: versionId }, include: TEMPLATE_VERSION });
    if (!version) throw new NotFoundException('Template version not found.');
    const def = templateDefinition(version);
    const problems = validateTemplate(def);
    if (problems.length) throw new BadRequestException({ message: 'Fix the template’s problems before trying its scoring.', errors: problems });
    const keys = new Set([...def.kras.flatMap((k) => [k.key, ...k.kpis.map((p) => p.key)]), ...def.fields.map((f) => f.key)]);
    return scoreAppraisal(def, cleanInputs(raw, keys));
  }

  async duplicate(tenantId: string, id: string, input: DuplicateDto, actor: AuthenticatedTenantUser) {
    const source = await this.prisma.rndtechnosoft_performance_templates.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_performance_template_scopes: true,
        rndtechnosoft_performance_template_versions: { orderBy: { version_number: 'desc' }, take: 1, include: TEMPLATE_VERSION },
      },
    });
    if (!source) throw new NotFoundException('Appraisal template not found.');
    const copyId = randomUUID();
    const latest = source.rndtechnosoft_performance_template_versions[0];
    const settings = {
      appliesToAll: source.applies_to_all,
      scopes: {
        departmentIds: source.rndtechnosoft_performance_template_scopes.flatMap((s) => (s.department_id ? [s.department_id] : [])),
        designationIds: source.rndtechnosoft_performance_template_scopes.flatMap((s) => (s.designation_id ? [s.designation_id] : [])),
      },
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_templates.create({
        data: {
          id: copyId, tenant_id: tenantId, template_code: input.code, template_name: input.name.trim(), template_description: source.template_description,
          applies_to_all: source.applies_to_all, created_by_tenant_member_id: actor.tenantMemberId,
        },
      });
      await this.writeScopes(tx, tenantId, copyId, settings);
      const draftId = randomUUID();
      await tx.rndtechnosoft_performance_template_versions.create({ data: { id: draftId, tenant_id: tenantId, template_id: copyId, version_number: 1 } });
      if (latest) {
        const draftInput = this.inputOf(latest);
        await this.write(tx, tenantId, draftId, draftInput, this.idsOf(draftInput));
      }
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`An appraisal template with code ${input.code} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_DUPLICATED', copyId, { new: { code: input.code, name: input.name.trim() }, source_template_id: id, source_version: latest?.version_number ?? null });
    return this.get(tenantId, copyId);
  }

  /** Deletes a template with all its versions while no appraisal uses it; otherwise it can only be archived. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const template = await this.find(tenantId, id);
    const used = await this.prisma.rndtechnosoft_performance_appraisals.groupBy({
      by: ['cycle_id'], where: { tenant_id: tenantId, rndtechnosoft_performance_template_versions: { template_id: id } }, _count: { _all: true },
    });
    if (used.length) {
      const cycles = await this.prisma.rndtechnosoft_performance_cycles.findMany({ where: { tenant_id: tenantId, id: { in: used.map((u) => u.cycle_id) } }, select: { id: true, cycle_code: true } });
      throw new ConflictException(inUseMessage(template.template_code, used.map((u) => `${u._count._all} appraisal${u._count._all === 1 ? '' : 's'} in cycle ${cycles.find((c) => c.id === u.cycle_id)?.cycle_code ?? ''}`)));
    }
    const inCycles = await this.prisma.rndtechnosoft_performance_cycle_templates.findMany({ where: { tenant_id: tenantId, template_id: id }, take: 10, select: { rndtechnosoft_performance_cycles: { select: { cycle_code: true } } } });
    if (inCycles.length) throw new ConflictException(inUseMessage(template.template_code, inCycles.map((c) => `cycle ${c.rndtechnosoft_performance_cycles.cycle_code}`)));
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      // Lines go with their versions, scopes with the template.
      await tx.rndtechnosoft_performance_template_versions.deleteMany({ where: { tenant_id: tenantId, template_id: id } });
      await tx.rndtechnosoft_performance_templates.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } });
    }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(template.template_code, ['an appraisal']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_TEMPLATE_DELETED', id, { old: { code: template.template_code, name: template.template_name } });
    return { deleted: true };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ARCHIVED', actor);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    return this.setStatus(tenantId, id, 'ACTIVE', actor);
  }

  private async setStatus(tenantId: string, id: string, status: 'ACTIVE' | 'ARCHIVED', actor: AuthenticatedTenantUser) {
    const template = await this.find(tenantId, id);
    if (template.template_status === status) return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_templates.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { template_status: status, archived_at: status === 'ARCHIVED' ? new Date() : null, updated_at: new Date() },
    });
    await this.log(tenantId, actor, status === 'ARCHIVED' ? 'PERFORMANCE_TEMPLATE_ARCHIVED' : 'PERFORMANCE_TEMPLATE_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  /**
   * Checks a draft's references against this workspace and writes it,
   * copying in the library's definitions and pinning each scale's latest
   * published version. `keep` holds what the template already uses, which
   * may stay even if archived since; anything new must be active.
   */
  private async write(tx: Tx, tenantId: string, versionId: string, input: TemplateDraftDto, keep: Set<string>) {
    const refuse = (message: string): never => { throw new BadRequestException(message); };
    if (input.scoringModel === 'WEIGHTED' && input.totalMarks !== null) refuse('Total marks only apply when scoring in marks.');

    const kraIds = input.kras.map((k) => k.kraId);
    const kpiIds = input.kras.flatMap((k) => k.kpis.map((p) => p.kpiId));
    if (new Set(kraIds).size !== kraIds.length) refuse('A KRA is in the template twice.');
    if (new Set(kpiIds).size !== kpiIds.length) refuse('A KPI is in the template twice; a KPI can be counted once.');
    const fieldKeys = input.fields.map((f) => f.key);
    if (new Set(fieldKeys).size !== fieldKeys.length) refuse('Two questions have the same key.');

    const weights = [...input.kras, ...input.kras.flatMap((k) => k.kpis), ...input.fields];
    if (weights.some((w) => w.weightPercent !== null && (decimal(w.weightPercent)?.isZero() || decimal(w.weightPercent)?.gt(100)))) refuse('A weight must be more than 0% and at most 100%.');
    if (weights.some((w) => w.maxMarks !== null && decimal(w.maxMarks)?.isZero())) refuse('Maximum marks must be more than 0.');
    if (input.totalMarks !== null && decimal(input.totalMarks)?.isZero()) refuse('Total marks must be more than 0.');
    for (const field of input.fields) {
      if (field.scored && !SCORABLE_FIELD_TYPES.includes(field.type)) refuse(`“${field.label || field.key}” can’t count toward the score; only rating and number questions can.`);
      if (!field.scored && (field.weightPercent !== null || field.maxMarks !== null)) refuse(`“${field.label || field.key}” doesn’t count toward the score, so it has no weight or marks.`);
    }

    // Every referenced record must be this workspace's; another workspace's id is reported as not found.
    const [kras, kpis] = await Promise.all([
      tx.rndtechnosoft_performance_kras.findMany({ where: { tenant_id: tenantId, id: { in: kraIds } } }),
      tx.rndtechnosoft_performance_kpis.findMany({ where: { tenant_id: tenantId, id: { in: kpiIds } } }),
    ]);
    if (kras.length !== kraIds.length) refuse('A KRA was not found in this workspace.');
    if (kpis.length !== kpiIds.length) refuse('A KPI was not found in this workspace.');
    const archivedKra = kras.find((k) => k.kra_status !== 'ACTIVE' && !keep.has(k.id));
    if (archivedKra) refuse(`The KRA “${archivedKra.kra_name}” is archived, so it can’t be added.`);
    const archivedKpi = kpis.find((k) => k.kpi_status !== 'ACTIVE' && !keep.has(k.id));
    if (archivedKpi) refuse(`The KPI “${archivedKpi.kpi_name}” is archived, so it can’t be added.`);

    const scaleIds = [...new Set([
      input.finalScaleId, ...input.kras.map((k) => k.ratingScaleId), ...input.kras.flatMap((k) => k.kpis.map((p) => p.ratingScaleId)), ...input.fields.map((f) => f.ratingScaleId),
    ].filter((v): v is string => !!v))];
    const scales = await tx.rndtechnosoft_performance_rating_scales.findMany({
      where: { tenant_id: tenantId, id: { in: scaleIds } },
      select: { id: true, scale_name: true, scale_status: true, rndtechnosoft_performance_rating_scale_versions: { where: { version_status: 'PUBLISHED' }, orderBy: { version_number: 'desc' }, take: 1, select: { id: true } } },
    });
    if (scales.length !== scaleIds.length) refuse('A rating scale was not found in this workspace.');
    const pinned = new Map<string, string>();
    for (const scale of scales) {
      if (scale.scale_status !== 'ACTIVE' && !keep.has(scale.id)) refuse(`The rating scale “${scale.scale_name}” is archived.`);
      const latest = scale.rndtechnosoft_performance_rating_scale_versions[0];
      if (!latest) refuse(`The rating scale “${scale.scale_name}” has not been published yet. Publish it first.`);
      pinned.set(scale.id, latest.id);
    }
    const pin = (scaleId: string | null) => (scaleId ? (pinned.get(scaleId) as string) : null);

    await tx.rndtechnosoft_performance_template_versions.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: versionId } },
      data: {
        scoring_model: input.scoringModel, weight_rule: input.weightRule, total_marks: decimal(input.totalMarks), missing_rating_rule: input.missingRatingRule,
        score_decimals: input.scoreDecimals, final_scale_version_id: pin(input.finalScaleId), change_note: input.changeNote?.trim() || null, updated_at: new Date(),
      },
    });
    await tx.rndtechnosoft_performance_template_fields.deleteMany({ where: { tenant_id: tenantId, template_version_id: versionId } });
    // KPI lines go with their KRA lines.
    await tx.rndtechnosoft_performance_template_kras.deleteMany({ where: { tenant_id: tenantId, template_version_id: versionId } });

    const kraById = new Map(kras.map((k) => [k.id, k]));
    const kpiById = new Map(kpis.map((k) => [k.id, k]));
    const kraRows: Prisma.rndtechnosoft_performance_template_krasCreateManyInput[] = [];
    const kpiRows: Prisma.rndtechnosoft_performance_template_kpisCreateManyInput[] = [];
    input.kras.forEach((line, i) => {
      const kra = kraById.get(line.kraId) as (typeof kras)[number];
      const lineId = randomUUID();
      kraRows.push({
        id: lineId, tenant_id: tenantId, template_version_id: versionId, kra_id: kra.id, kra_code: kra.kra_code, kra_name: kra.kra_name, kra_description: kra.kra_description,
        measurement_method: kra.measurement_method, evaluation_instructions: kra.evaluation_instructions, evidence_requirement: kra.evidence_requirement,
        weight_percent: decimal(line.weightPercent), max_marks: decimal(line.maxMarks), min_marks: decimal(line.minMarks),
        scoring_method: line.kpis.length ? null : line.scoringMethod, rating_scale_version_id: line.kpis.length ? null : pin(line.ratingScaleId),
        allows_exemption: line.allowsExemption, display_order: i + 1,
      });
      line.kpis.forEach((kpiLine, j) => {
        const kpi = kpiById.get(kpiLine.kpiId) as (typeof kpis)[number];
        kpiRows.push({
          id: randomUUID(), tenant_id: tenantId, template_version_id: versionId, template_kra_id: lineId, kpi_id: kpi.id, kpi_code: kpi.kpi_code, kpi_name: kpi.kpi_name,
          kpi_description: kpi.kpi_description, measurement_type: kpi.measurement_type, unit_label: kpi.unit_label, currency_code: kpi.currency_code, direction: kpi.direction,
          evidence_requirement: kpi.evidence_requirement, evaluation_instructions: kpi.evaluation_instructions,
          weight_percent: decimal(kpiLine.weightPercent), max_marks: decimal(kpiLine.maxMarks), scoring_method: kpiLine.scoringMethod,
          scoring_config: kpiLine.scoringConfig as Prisma.InputJsonValue, target_source: kpiLine.targetSource,
          target_value: decimal(kpiLine.target), threshold_value: decimal(kpiLine.threshold), stretch_value: decimal(kpiLine.stretch),
          rating_scale_version_id: pin(kpiLine.ratingScaleId), allows_exemption: kpiLine.allowsExemption, display_order: j + 1,
        });
      });
    });
    if (kraRows.length) await tx.rndtechnosoft_performance_template_kras.createMany({ data: kraRows });
    if (kpiRows.length) await tx.rndtechnosoft_performance_template_kpis.createMany({ data: kpiRows });
    if (input.fields.length) {
      await tx.rndtechnosoft_performance_template_fields.createMany({
        data: input.fields.map((f, i) => ({
          id: randomUUID(), tenant_id: tenantId, template_version_id: versionId, field_key: f.key, field_type: f.type, field_label: f.label.trim(), field_description: f.description?.trim() || null,
          is_required: f.required, filled_by: f.filledBy, employee_visibility: f.visibility, field_config: f.config as Prisma.InputJsonValue,
          rating_scale_version_id: pin(f.ratingScaleId), is_scored: f.scored, weight_percent: decimal(f.weightPercent), max_marks: decimal(f.maxMarks), display_order: i + 1,
        })),
      });
    }
  }

  /** A stored version as a draft input, to write it again (publishing) or copy it (duplicating). */
  private inputOf(v: VersionRow): TemplateDraftDto {
    const scaleOf = (row: ScaleVersionRow | null) => row?.rating_scale_id ?? null;
    return {
      scoringModel: v.scoring_model as ScoringModel,
      weightRule: v.weight_rule as WeightRule,
      totalMarks: text(v.total_marks),
      missingRatingRule: v.missing_rating_rule as MissingRule,
      scoreDecimals: v.score_decimals,
      finalScaleId: scaleOf(v.final_scale_version),
      changeNote: v.change_note ?? undefined,
      kras: v.rndtechnosoft_performance_template_kras.map((k) => ({
        kraId: k.kra_id, weightPercent: text(k.weight_percent), maxMarks: text(k.max_marks), minMarks: text(k.min_marks),
        scoringMethod: k.scoring_method as ScoringMethod | null, ratingScaleId: scaleOf(k.rndtechnosoft_performance_rating_scale_versions), allowsExemption: k.allows_exemption,
        kpis: k.rndtechnosoft_performance_template_kpis.map((p) => ({
          kpiId: p.kpi_id, weightPercent: text(p.weight_percent), maxMarks: text(p.max_marks), scoringMethod: p.scoring_method as ScoringMethod,
          scoringConfig: p.scoring_config as Record<string, unknown>, targetSource: p.target_source as TargetSource, target: text(p.target_value),
          threshold: text(p.threshold_value), stretch: text(p.stretch_value), ratingScaleId: scaleOf(p.rndtechnosoft_performance_rating_scale_versions), allowsExemption: p.allows_exemption,
        })),
      })),
      fields: v.rndtechnosoft_performance_template_fields.map((f) => ({
        key: f.field_key, type: f.field_type as FieldType, label: f.field_label, description: f.field_description, required: f.is_required,
        filledBy: f.filled_by as FilledBy, visibility: f.employee_visibility as EmployeeVisibility, config: f.field_config as Record<string, unknown>,
        ratingScaleId: scaleOf(f.rndtechnosoft_performance_rating_scale_versions), scored: f.is_scored, weightPercent: text(f.weight_percent), maxMarks: text(f.max_marks),
      })),
    };
  }

  private idsOf(input: TemplateDraftDto) {
    return new Set([
      ...input.kras.map((k) => k.kraId), ...input.kras.flatMap((k) => k.kpis.map((p) => p.kpiId)),
      ...[input.finalScaleId, ...input.kras.map((k) => k.ratingScaleId), ...input.kras.flatMap((k) => k.kpis.map((p) => p.ratingScaleId)), ...input.fields.map((f) => f.ratingScaleId)].filter((v): v is string => !!v),
    ]);
  }

  /** What the template's draft and latest published version already use. */
  private async inUse(db: Db, tenantId: string, templateId: string) {
    const versions = await db.rndtechnosoft_performance_template_versions.findMany({
      where: { tenant_id: tenantId, template_id: templateId },
      orderBy: { version_number: 'desc' },
      take: 2,
      include: TEMPLATE_VERSION,
    });
    const ids = new Set<string>();
    versions.forEach((v) => this.idsOf(this.inputOf(v)).forEach((id) => ids.add(id)));
    return ids;
  }



  private present(v: VersionRow) {
    return {
      id: v.id,
      number: v.version_number,
      status: v.version_status,
      policy: {
        scoringModel: v.scoring_model, weightRule: v.weight_rule, totalMarks: text(v.total_marks), missingRatingRule: v.missing_rating_rule,
        scoreDecimals: v.score_decimals, finalScale: scaleRef(v.final_scale_version),
      },
      kras: v.rndtechnosoft_performance_template_kras.map((k) => ({
        id: k.id, kraId: k.kra_id, kraCode: k.kra_code, kraName: k.kra_name, description: k.kra_description, measurementMethod: k.measurement_method,
        evaluationInstructions: k.evaluation_instructions, evidenceRequirement: k.evidence_requirement, weightPercent: text(k.weight_percent),
        maxMarks: text(k.max_marks), minMarks: text(k.min_marks), scoringMethod: k.scoring_method, ratingScale: scaleRef(k.rndtechnosoft_performance_rating_scale_versions),
        allowsExemption: k.allows_exemption,
        kpis: k.rndtechnosoft_performance_template_kpis.map((p) => ({
          id: p.id, kpiId: p.kpi_id, kpiCode: p.kpi_code, kpiName: p.kpi_name, description: p.kpi_description, measurementType: p.measurement_type,
          unitLabel: p.unit_label, currencyCode: p.currency_code, direction: p.direction, evidenceRequirement: p.evidence_requirement,
          evaluationInstructions: p.evaluation_instructions, weightPercent: text(p.weight_percent), maxMarks: text(p.max_marks), scoringMethod: p.scoring_method,
          scoringConfig: p.scoring_config, targetSource: p.target_source, target: text(p.target_value), threshold: text(p.threshold_value), stretch: text(p.stretch_value),
          ratingScale: scaleRef(p.rndtechnosoft_performance_rating_scale_versions), allowsExemption: p.allows_exemption,
        })),
      })),
      fields: v.rndtechnosoft_performance_template_fields.map((f) => ({
        id: f.id, key: f.field_key, type: f.field_type, label: f.field_label, description: f.field_description, required: f.is_required, filledBy: f.filled_by,
        visibility: f.employee_visibility, config: f.field_config, ratingScale: scaleRef(f.rndtechnosoft_performance_rating_scale_versions), scored: f.is_scored,
        weightPercent: text(f.weight_percent), maxMarks: text(f.max_marks),
      })),
      // What still stops a draft being published.
      problems: v.version_status === 'DRAFT' ? validateTemplate(templateDefinition(v)) : [],
      changeNote: v.change_note,
      publishedAt: v.published_at,
      publishedBy: v.published_by?.rndtechnosoft_users.display_name ?? null,
    };
  }

  private async checkScopes(tenantId: string, input: TemplateSettingsDto) {
    const count = input.scopes.departmentIds.length + input.scopes.designationIds.length;
    if (!input.appliesToAll && !count) throw new BadRequestException('Choose at least one department or designation, or make the template for everyone.');
    if (input.appliesToAll && count) throw new BadRequestException('A template for everyone has no departments or designations chosen.');
    const where = (ids: string[]) => ({ tenant_id: tenantId, id: { in: ids } });
    const [departments, designations] = await Promise.all([
      this.prisma.rndtechnosoft_departments.count({ where: where(input.scopes.departmentIds) }),
      this.prisma.rndtechnosoft_designations.count({ where: where(input.scopes.designationIds) }),
    ]);
    if (departments !== input.scopes.departmentIds.length || designations !== input.scopes.designationIds.length) {
      throw new BadRequestException('A department or designation was not found in this workspace.');
    }
  }

  private async writeScopes(tx: Tx, tenantId: string, templateId: string, input: { scopes: { departmentIds: string[]; designationIds: string[] } }) {
    const rows = [
      ...input.scopes.departmentIds.map((v) => ({ department_id: v })),
      ...input.scopes.designationIds.map((v) => ({ designation_id: v })),
    ];
    if (rows.length) await tx.rndtechnosoft_performance_template_scopes.createMany({ data: rows.map((r) => ({ id: randomUUID(), tenant_id: tenantId, template_id: templateId, ...r })) });
  }

  private async lock(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_performance_templates WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }

  private async find(tenantId: string, id: string) {
    const template = await this.prisma.rndtechnosoft_performance_templates.findFirst({ where: { tenant_id: tenantId, id } });
    if (!template) throw new NotFoundException('Appraisal template not found.');
    return template;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_TEMPLATE', entityId: id, oldValues, newValues, metadata });
  }
}
