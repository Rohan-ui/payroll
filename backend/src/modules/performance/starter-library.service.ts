import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { KrasService } from './kras.service';
import { KpisService } from './kpis.service';
import { RatingScalesService } from './rating-scales.service';
import { STARTER_KPIS, STARTER_KRAS, STARTER_SCALE } from './starter-library';

/**
 * Loads the starter KRA and KPI library into a workspace through the same
 * services as the screens, so every item is checked and audited as if made
 * by hand. Items whose code already exists are left alone, so loading again
 * only adds what is missing.
 */
@Injectable()
export class StarterLibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kras: KrasService,
    private readonly kpis: KpisService,
    private readonly scales: RatingScalesService,
  ) {}

  async load(tenantId: string, actor: AuthenticatedTenantUser) {
    const [existingKpis, existingKras, departments] = await Promise.all([
      this.prisma.rndtechnosoft_performance_kpis.findMany({ where: { tenant_id: tenantId, kpi_code: { in: STARTER_KPIS.map((k) => k.code) } }, select: { id: true, kpi_code: true } }),
      this.prisma.rndtechnosoft_performance_kras.findMany({ where: { tenant_id: tenantId, kra_code: { in: STARTER_KRAS.map((k) => k.code) } }, select: { kra_code: true } }),
      this.prisma.rndtechnosoft_departments.findMany({ where: { tenant_id: tenantId, archived_at: null }, select: { id: true, department_name: true }, take: 500 }),
    ]);
    const kpiIds = new Map(existingKpis.map((k) => [k.kpi_code, k.id]));
    const haveKras = new Set(existingKras.map((k) => k.kra_code));
    const scaleId = await this.scale(tenantId, actor);

    let kpisCreated = 0;
    for (const k of STARTER_KPIS) {
      if (kpiIds.has(k.code)) continue;
      const created = await this.kpis.create(tenantId, {
        kpiCode: k.code, kpiName: k.name, description: k.description, measurementType: k.type, unitLabel: k.unit,
        currencyCode: k.type === 'CURRENCY' ? 'INR' : null, direction: k.direction,
        minimumExpected: k.targets?.[0] ?? null, defaultTarget: k.targets?.[1] ?? null, stretchTarget: k.targets?.[2] ?? null,
        defaultMaxMarks: null, ratingScaleId: k.type === 'RATING' ? scaleId : null, evidenceRequirement: k.evidence, evaluationInstructions: null,
      }, actor);
      kpiIds.set(k.code, created.id);
      kpisCreated += 1;
    }

    const effectiveFrom = `${new Date().getUTCFullYear()}-01-01`;
    let krasCreated = 0;
    const noDepartment = new Set<string>();
    for (const k of STARTER_KRAS) {
      if (haveKras.has(k.code)) continue;
      const departmentIds = k.department ? departments.filter((d) => k.department?.match.test(d.department_name)).map((d) => d.id) : [];
      if (k.department && !departmentIds.length) {
        noDepartment.add(k.department.label);
        continue;
      }
      await this.kras.create(tenantId, {
        kraCode: k.code, kraName: k.name, description: k.description, measurementMethod: null, evaluationInstructions: null,
        evidenceRequirement: 'OPTIONAL', defaultWeightPercent: k.weight, defaultMaxMarks: null, defaultMinMarks: null,
        ratingScaleId: k.rated ? scaleId : null, appliesToAll: !k.department,
        scopes: { departmentIds, designationIds: [], employeeIds: [] },
        kpis: k.kpis.map(([code, weight]) => ({ kpiId: kpiIds.get(code) as string, defaultWeightPercent: weight })),
        effectiveFrom, effectiveTo: null,
      }, actor);
      krasCreated += 1;
    }

    return {
      kpisCreated,
      krasCreated,
      alreadyThere: existingKpis.length + existingKras.length,
      // Department KRAs not loaded because no department's name matched.
      departmentsNotFound: [...noDepartment],
    };
  }

  /** The starter rating scale (1–5), created and published if the workspace doesn't have it. */
  private async scale(tenantId: string, actor: AuthenticatedTenantUser) {
    const existing = await this.prisma.rndtechnosoft_performance_rating_scales.findFirst({ where: { tenant_id: tenantId, scale_code: STARTER_SCALE.code }, select: { id: true } });
    if (existing) return existing.id;
    const created = await this.scales.create(tenantId, {
      scaleCode: STARTER_SCALE.code, scaleName: STARTER_SCALE.name, description: 'From 1 (needs improvement) to 5 (outstanding).',
      draft: {
        inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null,
        levels: STARTER_SCALE.levels.map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null })), bands: [],
      },
    }, actor);
    await this.scales.publish(tenantId, created.id, actor);
    return created.id;
  }
}
