import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { ConversionMethod, InputKind, ScaleDefinition, ScaleDraftInput, scorePercent, validateScale } from './rating-scale';
import { CreateScaleDto, LibraryListQueryDto, ScaleDraftDto, UpdateScaleDto } from './dto/performance-library.dto';
import { inUseMessage, isForeignKeyViolation, isUniqueViolation, pageOf, statusCounts, text } from './performance-common';

type Tx = Prisma.TransactionClient;
type VersionRow = Prisma.rndtechnosoft_performance_rating_scale_versionsGetPayload<{
  include: { rndtechnosoft_performance_rating_scale_levels: true; rndtechnosoft_performance_rating_scale_bands: true };
}>;

/** A stored version as the definition the scoring rules work on. */
export function definitionOf(version: VersionRow): ScaleDefinition {
  return {
    inputKind: version.input_kind as InputKind,
    conversionMethod: version.conversion_method as ConversionMethod,
    minValue: version.min_value,
    maxValue: version.max_value,
    stepValue: version.step_value,
    unitLabel: version.unit_label,
    levels: [...version.rndtechnosoft_performance_rating_scale_levels]
      .sort((a, b) => a.level_value.comparedTo(b.level_value))
      .map((l) => ({ value: l.level_value, label: l.level_label, description: l.level_description, scorePercent: l.score_percent })),
    bands: [...version.rndtechnosoft_performance_rating_scale_bands]
      .sort((a, b) => a.min_percent.comparedTo(b.min_percent))
      .map((b) => ({ label: b.band_label, description: b.band_description, minPercent: b.min_percent, maxPercent: b.max_percent })),
  };
}

const VERSION_ROWS = { rndtechnosoft_performance_rating_scale_levels: true, rndtechnosoft_performance_rating_scale_bands: true } as const;

/**
 * Rating scales: how raters rate and how a rating becomes a score. A scale is
 * edited as one draft version at a time; publishing fixes that version for
 * good, and appraisals keep the version they were given.
 */
@Injectable()
export class RatingScalesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(tenantId: string, query: LibraryListQueryDto) {
    const { page, limit, skip } = pageOf(query);
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_performance_rating_scalesWhereInput = {
      tenant_id: tenantId,
      ...(query.status === 'ALL' ? {} : { scale_status: query.status ?? 'ACTIVE' }),
      ...(search ? { OR: [{ scale_name: { contains: search, mode: 'insensitive' } }, { scale_code: { contains: search.toUpperCase() } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_performance_rating_scales.findMany({
        where,
        orderBy: { scale_name: 'asc' },
        skip,
        take: limit,
        include: {
          rndtechnosoft_performance_rating_scale_versions: {
            orderBy: { version_number: 'desc' },
            select: {
              version_number: true, version_status: true, input_kind: true, min_value: true, max_value: true, unit_label: true,
              _count: { select: { rndtechnosoft_performance_rating_scale_levels: true, rndtechnosoft_performance_rating_scale_bands: true } },
            },
          },
        },
      }),
      this.prisma.rndtechnosoft_performance_rating_scales.count({ where }),
    ]);
    const items = rows.map((s) => {
      const versions = s.rndtechnosoft_performance_rating_scale_versions;
      const current = versions.find((v) => v.version_status === 'PUBLISHED') ?? null;
      const draft = versions.find((v) => v.version_status === 'DRAFT') ?? null;
      return {
        id: s.id,
        scaleCode: s.scale_code,
        scaleName: s.scale_name,
        description: s.scale_description,
        status: s.scale_status,
        currentVersion: current && {
          number: current.version_number,
          inputKind: current.input_kind,
          minValue: text(current.min_value),
          maxValue: text(current.max_value),
          unitLabel: current.unit_label,
          levelCount: current._count.rndtechnosoft_performance_rating_scale_levels,
          bandCount: current._count.rndtechnosoft_performance_rating_scale_bands,
        },
        draft: draft && { number: draft.version_number },
      };
    });
    const groups = await this.prisma.rndtechnosoft_performance_rating_scales.groupBy({ by: ['scale_status'], where: { tenant_id: tenantId }, _count: { _all: true } });
    const counts = statusCounts(groups.map((g) => ({ status: g.scale_status, count: g._count._all })));
    return { items, total, page, limit, totalPages: Math.ceil(total / limit), hasMore: page * limit < total, counts };
  }

  async get(tenantId: string, id: string) {
    const scale = await this.prisma.rndtechnosoft_performance_rating_scales.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_performance_rating_scale_versions: {
          orderBy: { version_number: 'desc' },
          include: { ...VERSION_ROWS, published_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } } },
        },
      },
    });
    if (!scale) throw new NotFoundException('Rating scale not found.');
    const [kras, kpis] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kras.count({ where: { tenant_id: tenantId, rating_scale_id: id, kra_status: 'ACTIVE' } }),
      this.prisma.rndtechnosoft_performance_kpis.count({ where: { tenant_id: tenantId, rating_scale_id: id, kpi_status: 'ACTIVE' } }),
    ]);
    return {
      id: scale.id,
      scaleCode: scale.scale_code,
      scaleName: scale.scale_name,
      description: scale.scale_description,
      status: scale.scale_status,
      usedBy: { kras, kpis },
      versions: scale.rndtechnosoft_performance_rating_scale_versions.map((v) => {
        const definition = definitionOf(v);
        return {
          id: v.id,
          number: v.version_number,
          status: v.version_status,
          inputKind: definition.inputKind,
          conversionMethod: definition.conversionMethod,
          minValue: text(definition.minValue),
          maxValue: text(definition.maxValue),
          stepValue: text(definition.stepValue),
          unitLabel: definition.unitLabel,
          levels: definition.levels.map((l) => ({ value: l.value.toString(), label: l.label, description: l.description, scorePercent: text(l.scorePercent) })),
          bands: definition.bands.map((b) => ({ label: b.label, description: b.description, minPercent: b.minPercent.toString(), maxPercent: b.maxPercent.toString() })),
          // What each labelled level scores, so people see the conversion before using the scale.
          conversion: definition.levels.map((l) => {
            const result = scorePercent(definition, l.value.toString());
            return { value: l.value.toString(), label: l.label, percent: 'percent' in result ? result.percent.toString() : null };
          }),
          changeNote: v.change_note,
          publishedAt: v.published_at,
          publishedBy: v.published_by?.rndtechnosoft_users.display_name ?? null,
        };
      }),
    };
  }

  async create(tenantId: string, input: CreateScaleDto, actor: AuthenticatedTenantUser) {
    const checked = this.check(input.draft);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_performance_rating_scales.create({
        data: { id, tenant_id: tenantId, scale_code: input.scaleCode, scale_name: input.scaleName.trim(), scale_description: input.description?.trim() || null, created_by_tenant_member_id: actor.tenantMemberId },
      });
      await this.writeVersion(tx, tenantId, id, null, 1, checked, input.draft.changeNote);
    }).catch((e) => {
      if (isUniqueViolation(e)) throw new ConflictException(`A rating scale with code ${input.scaleCode} already exists.`);
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_CREATED', id, { new: { code: input.scaleCode, name: input.scaleName.trim() } });
    return this.get(tenantId, id);
  }

  async update(tenantId: string, id: string, input: UpdateScaleDto, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    if (scale.scale_status === 'ARCHIVED') throw new BadRequestException('This rating scale is archived. Restore it to change it.');
    const after = { name: input.scaleName.trim(), description: input.description?.trim() || null };
    await this.prisma.rndtechnosoft_performance_rating_scales.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: { scale_name: after.name, scale_description: after.description, updated_at: new Date() },
    });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_UPDATED', id, { old: { name: scale.scale_name, description: scale.scale_description }, new: after });
    return this.get(tenantId, id);
  }

  /** Creates or replaces the scale's one draft version. */
  async saveDraft(tenantId: string, id: string, input: ScaleDraftDto, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    if (scale.scale_status === 'ARCHIVED') throw new BadRequestException('This rating scale is archived. Restore it to change it.');
    const checked = this.check(input);
    const versionId = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_performance_rating_scale_versions.findFirst({ where: { tenant_id: tenantId, rating_scale_id: id, version_status: 'DRAFT' }, select: { id: true, version_number: true } });
      if (draft) return this.writeVersion(tx, tenantId, id, draft.id, draft.version_number, checked, input.changeNote);
      const last = await tx.rndtechnosoft_performance_rating_scale_versions.aggregate({ where: { tenant_id: tenantId, rating_scale_id: id }, _max: { version_number: true } });
      return this.writeVersion(tx, tenantId, id, null, (last._max.version_number ?? 0) + 1, checked, input.changeNote);
    });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_DRAFT_SAVED', id, { version_id: versionId, input_kind: checked.inputKind, levels: checked.levels.length, bands: checked.bands.length });
    return this.get(tenantId, id);
  }

  async discardDraft(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    await this.find(tenantId, id);
    const published = await this.prisma.rndtechnosoft_performance_rating_scale_versions.count({ where: { tenant_id: tenantId, rating_scale_id: id, version_status: 'PUBLISHED' } });
    if (!published) throw new BadRequestException('This scale has never been published, so its draft is all it has. Archive the scale instead.');
    const { count } = await this.prisma.rndtechnosoft_performance_rating_scale_versions.deleteMany({ where: { tenant_id: tenantId, rating_scale_id: id, version_status: 'DRAFT' } });
    if (!count) throw new NotFoundException('This scale has no draft.');
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_DRAFT_DISCARDED', id, {});
    return this.get(tenantId, id);
  }

  /** Publishes the draft. Earlier versions stay as they are for the appraisals that use them. */
  async publish(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    if (scale.scale_status === 'ARCHIVED') throw new BadRequestException('This rating scale is archived. Restore it to publish.');
    const number = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_performance_rating_scale_versions.findFirst({ where: { tenant_id: tenantId, rating_scale_id: id, version_status: 'DRAFT' }, include: VERSION_ROWS });
      if (!draft) throw new NotFoundException('This scale has no draft to publish.');
      // Checked again from what was stored, in case the rules changed since it was saved.
      const definition = definitionOf(draft);
      this.check({
        inputKind: definition.inputKind,
        conversionMethod: definition.conversionMethod,
        minValue: definition.inputKind === 'RANGE' ? text(definition.minValue) : null,
        maxValue: definition.inputKind === 'RANGE' ? text(definition.maxValue) : null,
        stepValue: text(definition.stepValue),
        unitLabel: definition.unitLabel,
        levels: definition.levels.map((l) => ({ value: l.value.toString(), label: l.label, description: l.description, scorePercent: text(l.scorePercent) })),
        bands: definition.bands.map((b) => ({ label: b.label, description: b.description, minPercent: b.minPercent.toString(), maxPercent: b.maxPercent.toString() })),
      });
      await tx.rndtechnosoft_performance_rating_scale_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: { version_status: 'PUBLISHED', published_at: new Date(), published_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      return draft.version_number;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_PUBLISHED', id, { version: number });
    return this.get(tenantId, id);
  }

  /** Deletes a scale no KRA, KPI or template uses, with all its versions; otherwise it can only be archived. */
  async remove(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    const versionIds = (await this.prisma.rndtechnosoft_performance_rating_scale_versions.findMany({ where: { tenant_id: tenantId, rating_scale_id: id }, select: { id: true } })).map((v) => v.id);
    const onVersion = { tenant_id: tenantId, rating_scale_version_id: { in: versionIds } };
    const [kras, kpis, templateLines] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kras.findMany({ where: { tenant_id: tenantId, rating_scale_id: id }, take: 10, select: { kra_code: true } }),
      this.prisma.rndtechnosoft_performance_kpis.findMany({ where: { tenant_id: tenantId, rating_scale_id: id }, take: 10, select: { kpi_code: true } }),
      Promise.all([
        this.prisma.rndtechnosoft_performance_template_kras.count({ where: onVersion }),
        this.prisma.rndtechnosoft_performance_template_kpis.count({ where: onVersion }),
        this.prisma.rndtechnosoft_performance_template_fields.count({ where: onVersion }),
        this.prisma.rndtechnosoft_performance_template_versions.count({ where: { tenant_id: tenantId, final_scale_version_id: { in: versionIds } } }),
      ]),
    ]);
    const lines = templateLines.reduce((t, n) => t + n, 0);
    const uses = [...kras.map((k) => `KRA ${k.kra_code}`), ...kpis.map((k) => `KPI ${k.kpi_code}`), ...(lines ? [`${lines} appraisal template line${lines === 1 ? '' : 's'}`] : [])];
    if (uses.length) throw new ConflictException(inUseMessage(scale.scale_code, uses));
    await this.prisma.$transaction(async (tx) => {
      // Levels and bands go with their versions.
      await tx.rndtechnosoft_performance_rating_scale_versions.deleteMany({ where: { tenant_id: tenantId, rating_scale_id: id } });
      await tx.rndtechnosoft_performance_rating_scales.delete({ where: { tenant_id_id: { tenant_id: tenantId, id } } });
    }).catch((e) => {
      if (isForeignKeyViolation(e)) throw new ConflictException(inUseMessage(scale.scale_code, ['something saved just now']));
      throw e;
    });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_DELETED', id, { old: { code: scale.scale_code, name: scale.scale_name } });
    return { deleted: true };
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    if (scale.scale_status === 'ARCHIVED') return this.get(tenantId, id);
    const [kras, kpis] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kras.count({ where: { tenant_id: tenantId, rating_scale_id: id, kra_status: 'ACTIVE' } }),
      this.prisma.rndtechnosoft_performance_kpis.count({ where: { tenant_id: tenantId, rating_scale_id: id, kpi_status: 'ACTIVE' } }),
    ]);
    if (kras + kpis) {
      throw new BadRequestException(`${kras} KRA${kras === 1 ? '' : 's'} and ${kpis} KPI${kpis === 1 ? '' : 's'} use this scale. Choose another scale for them, or archive them, first.`);
    }
    await this.prisma.rndtechnosoft_performance_rating_scales.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { scale_status: 'ARCHIVED', archived_at: new Date(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_ARCHIVED', id, {});
    return this.get(tenantId, id);
  }

  async restore(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const scale = await this.find(tenantId, id);
    if (scale.scale_status === 'ACTIVE') return this.get(tenantId, id);
    await this.prisma.rndtechnosoft_performance_rating_scales.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { scale_status: 'ACTIVE', archived_at: null, updated_at: new Date() } });
    await this.log(tenantId, actor, 'PERFORMANCE_RATING_SCALE_RESTORED', id, {});
    return this.get(tenantId, id);
  }

  /**
   * Refuses a scale that KRAs and KPIs can't rate with: not this workspace's,
   * archived, or never published. `keepId` is the scale the item already has,
   * which may stay even if it was archived since.
   */
  async assertUsable(tenantId: string, scaleId: string, keepId: string | null = null) {
    const scale = await this.prisma.rndtechnosoft_performance_rating_scales.findFirst({
      where: { tenant_id: tenantId, id: scaleId },
      select: { scale_name: true, scale_status: true, _count: { select: { rndtechnosoft_performance_rating_scale_versions: { where: { version_status: 'PUBLISHED' } } } } },
    });
    if (!scale) throw new BadRequestException('The chosen rating scale was not found in this workspace.');
    if (scaleId === keepId) return scale;
    if (scale.scale_status !== 'ACTIVE') throw new BadRequestException(`The rating scale “${scale.scale_name}” is archived.`);
    if (!scale._count.rndtechnosoft_performance_rating_scale_versions) throw new BadRequestException(`The rating scale “${scale.scale_name}” has not been published yet. Publish it first.`);
    return scale;
  }

  private check(input: ScaleDraftInput) {
    const checked = validateScale(input);
    if ('problems' in checked) throw new BadRequestException({ message: 'Some rating scale settings need fixing.', errors: checked.problems });
    return checked.scale;
  }

  private async writeVersion(tx: Tx, tenantId: string, scaleId: string, draftId: string | null, number: number, scale: ScaleDefinition, changeNote: string | undefined) {
    const data = {
      input_kind: scale.inputKind,
      conversion_method: scale.conversionMethod,
      min_value: scale.minValue,
      max_value: scale.maxValue,
      step_value: scale.stepValue,
      unit_label: scale.unitLabel,
      change_note: changeNote?.trim() || null,
    };
    let versionId = draftId;
    if (versionId) {
      await tx.rndtechnosoft_performance_rating_scale_levels.deleteMany({ where: { tenant_id: tenantId, rating_scale_version_id: versionId } });
      await tx.rndtechnosoft_performance_rating_scale_bands.deleteMany({ where: { tenant_id: tenantId, rating_scale_version_id: versionId } });
      await tx.rndtechnosoft_performance_rating_scale_versions.update({ where: { tenant_id_id: { tenant_id: tenantId, id: versionId } }, data: { ...data, updated_at: new Date() } });
    } else {
      versionId = randomUUID();
      await tx.rndtechnosoft_performance_rating_scale_versions.create({ data: { id: versionId, tenant_id: tenantId, rating_scale_id: scaleId, version_number: number, ...data } });
    }
    const version = versionId;
    if (scale.levels.length) {
      await tx.rndtechnosoft_performance_rating_scale_levels.createMany({
        data: scale.levels.map((l, i) => ({
          id: randomUUID(), tenant_id: tenantId, rating_scale_version_id: version, level_value: l.value, level_label: l.label, level_description: l.description, score_percent: l.scorePercent, display_order: i + 1,
        })),
      });
    }
    if (scale.bands.length) {
      await tx.rndtechnosoft_performance_rating_scale_bands.createMany({
        data: scale.bands.map((b, i) => ({
          id: randomUUID(), tenant_id: tenantId, rating_scale_version_id: version, band_label: b.label, band_description: b.description, min_percent: b.minPercent, max_percent: b.maxPercent, display_order: i + 1,
        })),
      });
    }
    return version;
  }

  private async lock(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_performance_rating_scales WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }

  private async find(tenantId: string, id: string) {
    const scale = await this.prisma.rndtechnosoft_performance_rating_scales.findFirst({ where: { tenant_id: tenantId, id } });
    if (!scale) throw new NotFoundException('Rating scale not found.');
    return scale;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, values: { old?: Record<string, unknown>; new?: Record<string, unknown> } & Record<string, unknown>) {
    const { old: oldValues, new: newValues, ...metadata } = values;
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'PERFORMANCE_RATING_SCALE', entityId: id, oldValues, newValues, metadata });
  }
}
