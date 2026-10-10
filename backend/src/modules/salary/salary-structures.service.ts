import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { dateOnly, dayBefore, finalizedThrough, isOverlapViolation, isoDate, lockedProblem } from '@/modules/payroll/payroll-lock';
import { calculateStructure, checkStructure, StructureLine } from './formula/structure-engine';
import { FORMULA_FUNCTIONS } from './formula/formula';
import { SYSTEM_VARIABLE_NAMES, SYSTEM_VARIABLES } from './formula/variables';
import { componentView } from './salary-components.service';
import { CreateStructureDto, StructureDraftDto, StructureLineDto, StructurePreviewDto } from './dto/salary.dto';

type Tx = Prisma.TransactionClient;
type ComponentRow = Prisma.rndtechnosoft_salary_componentsGetPayload<object>;
type LineRow = Prisma.rndtechnosoft_salary_structure_componentsGetPayload<object>;
const COMPONENT = 'rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components' as const;
const D = (v: string | number) => new Prisma.Decimal(v);
const DECIMAL = /^-?\d{1,16}(\.\d{1,6})?$/;

/** A structure line as the payroll engine reads it. */
export function engineLine(component: ComponentRow, line: { default_amount: Prisma.Decimal | null; default_percentage: Prisma.Decimal | null; formula_expression: string | null }, percentageBase: string | null): StructureLine {
  return {
    code: component.component_code,
    name: component.component_name,
    category: component.component_category as StructureLine['category'],
    calculationType: component.calculation_type as StructureLine['calculationType'],
    amount: line.default_amount,
    percentage: line.default_percentage,
    percentageBase,
    formula: line.formula_expression,
    isProrated: component.is_prorated,
    includeInGross: component.include_in_gross,
    minAmount: component.min_amount,
    maxAmount: component.max_amount,
    roundingScale: component.rounding_scale,
    roundingMode: component.rounding_mode as StructureLine['roundingMode'],
  };
}

/** The engine's lines for stored structure lines, in display order. */
export function engineLines(rows: (LineRow & { [COMPONENT]: ComponentRow })[]): StructureLine[] {
  const codes = new Map(rows.map((r) => [r.salary_component_id, r[COMPONENT].component_code]));
  return [...rows]
    .sort((a, b) => a.display_order - b.display_order)
    .map((r) => engineLine(r[COMPONENT], r, r.percentage_base_variable ?? (r.percentage_base_component_id ? codes.get(r.percentage_base_component_id) ?? null : null)));
}

/**
 * Salary structures: which components an employee's pay is made of and how
 * each is worked out. Edited as one draft version at a time; publishing it
 * fixes it for good and closes the version before it.
 */
@Injectable()
export class SalaryStructuresService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** What formulas can use: system values and functions. */
  formulaReference() {
    return { variables: SYSTEM_VARIABLES, functions: FORMULA_FUNCTIONS };
  }

  async list(tenantId: string, includeArchived = false) {
    const structures = await this.prisma.rndtechnosoft_salary_structures.findMany({
      where: { tenant_id: tenantId, ...(includeArchived ? {} : { structure_status: 'ACTIVE' }) },
      orderBy: { salary_structure_name: 'asc' },
      take: 200,
      include: {
        rndtechnosoft_salary_structure_versions: {
          orderBy: { version_number: 'desc' },
          select: { version_number: true, version_status: true, effective_from: true, effective_to: true, _count: { select: { rndtechnosoft_salary_structure_components: true } } },
        },
      },
    });
    const today = new Date();
    return structures.map((s) => {
      const versions = s.rndtechnosoft_salary_structure_versions;
      const current = versions.find((v) => v.version_status === 'PUBLISHED' && v.effective_from <= today && (!v.effective_to || v.effective_to >= today));
      const upcoming = versions.find((v) => v.version_status === 'PUBLISHED' && v.effective_from > today);
      const draft = versions.find((v) => v.version_status === 'DRAFT');
      const brief = (v: (typeof versions)[number] | undefined) => v && { number: v.version_number, effectiveFrom: isoDate(v.effective_from), components: v._count.rndtechnosoft_salary_structure_components };
      return {
        id: s.id,
        structureCode: s.salary_structure_code,
        structureName: s.salary_structure_name,
        payFrequency: s.pay_frequency,
        status: s.structure_status,
        currentVersion: brief(current) ?? null,
        upcomingVersion: brief(upcoming) ?? null,
        draft: brief(draft) ?? null,
      };
    });
  }

  async get(tenantId: string, id: string) {
    const structure = await this.prisma.rndtechnosoft_salary_structures.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_salary_structure_versions: {
          orderBy: { version_number: 'desc' },
          include: {
            published_by: { select: { rndtechnosoft_users: { select: { display_name: true } } } },
            rndtechnosoft_salary_structure_components: { include: { [COMPONENT]: true } },
          },
        },
      },
    });
    if (!structure) throw new NotFoundException('Salary structure not found.');
    const locked = await finalizedThrough(this.prisma, tenantId);
    return {
      id: structure.id,
      structureCode: structure.salary_structure_code,
      structureName: structure.salary_structure_name,
      payFrequency: structure.pay_frequency,
      status: structure.structure_status,
      lockedThrough: locked ? isoDate(locked) : null,
      versions: structure.rndtechnosoft_salary_structure_versions.map((v) => {
        const rows = v.rndtechnosoft_salary_structure_components as (LineRow & { [COMPONENT]: ComponentRow })[];
        const codes = new Map(rows.map((r) => [r.salary_component_id, r[COMPONENT].component_code]));
        return {
          id: v.id,
          number: v.version_number,
          status: v.version_status,
          effectiveFrom: isoDate(v.effective_from),
          effectiveTo: v.effective_to ? isoDate(v.effective_to) : null,
          changeNote: v.change_note,
          publishedAt: v.published_at,
          publishedBy: v.published_by?.rndtechnosoft_users.display_name ?? null,
          lines: [...rows].sort((a, b) => a.display_order - b.display_order).map((r) => ({
            salaryComponentId: r.salary_component_id,
            component: componentView(r[COMPONENT]),
            defaultAmount: r.default_amount?.toFixed() ?? null,
            defaultPercentage: r.default_percentage?.toFixed() ?? null,
            percentageBase: r.percentage_base_variable ?? (r.percentage_base_component_id ? codes.get(r.percentage_base_component_id) ?? null : null),
            formula: r.formula_expression,
            isMandatory: r.is_mandatory,
          })),
        };
      }),
    };
  }

  async create(tenantId: string, input: CreateStructureDto, actor: AuthenticatedTenantUser) {
    const existing = await this.prisma.rndtechnosoft_salary_structures.findFirst({ where: { tenant_id: tenantId, salary_structure_code: input.structureCode }, select: { id: true } });
    if (existing) throw new ConflictException(`A salary structure with code ${input.structureCode} already exists.`);
    // A new structure's first version may start in the past: nobody was paid
    // on it, so no finalized month changes.
    const effectiveFrom = dateOnly(input.effectiveFrom);
    const components = await this.components(tenantId, input.lines);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_salary_structures.create({ data: { id, tenant_id: tenantId, salary_structure_code: input.structureCode, salary_structure_name: input.structureName.trim() } });
      const versionId = randomUUID();
      await tx.rndtechnosoft_salary_structure_versions.create({ data: { id: versionId, tenant_id: tenantId, salary_structure_id: id, version_number: 1, effective_from: effectiveFrom, change_note: input.changeNote?.trim() || null } });
      await this.writeLines(tx, tenantId, versionId, input.lines, components);
    });
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_CREATED', id, { code: input.structureCode, components: input.lines.length });
    return this.get(tenantId, id);
  }

  async rename(tenantId: string, id: string, structureName: string, actor: AuthenticatedTenantUser) {
    const structure = await this.find(tenantId, id);
    await this.prisma.rndtechnosoft_salary_structures.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { salary_structure_name: structureName.trim(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_RENAMED', id, { before: structure.salary_structure_name, after: structureName.trim() });
    return this.get(tenantId, id);
  }

  /** Creates or replaces the structure's one draft version. */
  async saveDraft(tenantId: string, id: string, input: StructureDraftDto, actor: AuthenticatedTenantUser) {
    const structure = await this.find(tenantId, id);
    if (structure.structure_status === 'ARCHIVED') throw new BadRequestException('This structure is archived.');
    const effectiveFrom = dateOnly(input.effectiveFrom);
    await this.checkDate(this.prisma, tenantId, id, effectiveFrom);
    const components = await this.components(tenantId, input.lines);
    const versionId = await this.prisma.$transaction(async (tx) => {
      await this.lockStructure(tx, tenantId, id);
      let draft = await tx.rndtechnosoft_salary_structure_versions.findFirst({ where: { tenant_id: tenantId, salary_structure_id: id, version_status: 'DRAFT' }, select: { id: true } });
      if (draft) {
        await tx.rndtechnosoft_salary_structure_components.deleteMany({ where: { tenant_id: tenantId, salary_structure_version_id: draft.id } });
        await tx.rndtechnosoft_salary_structure_versions.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
          data: { effective_from: effectiveFrom, change_note: input.changeNote?.trim() || null, updated_at: new Date() },
        });
      } else {
        const last = await tx.rndtechnosoft_salary_structure_versions.aggregate({ where: { tenant_id: tenantId, salary_structure_id: id }, _max: { version_number: true } });
        draft = { id: randomUUID() };
        await tx.rndtechnosoft_salary_structure_versions.create({
          data: { id: draft.id, tenant_id: tenantId, salary_structure_id: id, version_number: (last._max.version_number ?? 0) + 1, effective_from: effectiveFrom, change_note: input.changeNote?.trim() || null },
        });
      }
      await this.writeLines(tx, tenantId, draft.id, input.lines, components);
      return draft.id;
    });
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_DRAFT_SAVED', id, { version_id: versionId, effective_from: input.effectiveFrom, components: input.lines.length });
    return this.get(tenantId, id);
  }

  async discardDraft(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    await this.find(tenantId, id);
    const discarded = await this.prisma.$transaction(async (tx) => {
      const draft = await tx.rndtechnosoft_salary_structure_versions.findFirst({ where: { tenant_id: tenantId, salary_structure_id: id, version_status: 'DRAFT' }, select: { id: true } });
      if (!draft) return false;
      await tx.rndtechnosoft_salary_structure_components.deleteMany({ where: { tenant_id: tenantId, salary_structure_version_id: draft.id } });
      await tx.rndtechnosoft_salary_structure_versions.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } } });
      return true;
    });
    if (!discarded) throw new NotFoundException('This structure has no draft.');
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_DRAFT_DISCARDED', id, {});
    return this.get(tenantId, id);
  }

  /** Publishes the draft once every line can be worked out: from its date it replaces the version before. */
  async publish(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const structure = await this.find(tenantId, id);
    if (structure.structure_status === 'ARCHIVED') throw new BadRequestException('This structure is archived.');
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockStructure(tx, tenantId, id);
      const draft = await tx.rndtechnosoft_salary_structure_versions.findFirst({
        where: { tenant_id: tenantId, salary_structure_id: id, version_status: 'DRAFT' },
        include: { rndtechnosoft_salary_structure_components: { include: { [COMPONENT]: true } } },
      });
      if (!draft) throw new NotFoundException('This structure has no draft to publish.');
      const rows = draft.rndtechnosoft_salary_structure_components as (LineRow & { [COMPONENT]: ComponentRow })[];
      const archived = rows.filter((r) => r[COMPONENT].component_status !== 'ACTIVE').map((r) => r[COMPONENT].component_code);
      const checked = checkStructure(engineLines(rows));
      const problems = [...checked.problems, ...archived.map((code) => ({ code, message: `${code} is archived. Restore it or take it out of the structure.` }))];
      if (problems.length) throw new BadRequestException({ message: 'The structure can’t be published yet.', errors: problems });
      await this.checkDate(tx, tenantId, id, draft.effective_from);
      const previous = await tx.rndtechnosoft_salary_structure_versions.findFirst({
        where: { tenant_id: tenantId, salary_structure_id: id, version_status: 'PUBLISHED', effective_to: null },
        select: { id: true, version_number: true },
      });
      if (previous) {
        await tx.rndtechnosoft_salary_structure_versions.update({ where: { tenant_id_id: { tenant_id: tenantId, id: previous.id } }, data: { effective_to: dayBefore(draft.effective_from), updated_at: new Date() } });
      }
      await tx.rndtechnosoft_salary_structure_versions.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: draft.id } },
        data: { version_status: 'PUBLISHED', published_at: new Date(), published_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
      });
      return { versionId: draft.id, number: draft.version_number, effectiveFrom: isoDate(draft.effective_from), closed: previous?.version_number ?? null };
    }).catch((e) => {
      if (isOverlapViolation(e)) throw new ConflictException('These dates overlap another published version of this structure.');
      throw e;
    });
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_PUBLISHED', id, { version_id: result.versionId, version: result.number, effective_from: result.effectiveFrom, closed_version: result.closed });
    return this.get(tenantId, id);
  }

  async archive(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const structure = await this.find(tenantId, id);
    if (structure.structure_status === 'ARCHIVED') return this.get(tenantId, id);
    const inUse = await this.prisma.rndtechnosoft_employee_salary_assignments.count({ where: { tenant_id: tenantId, salary_structure_id: id, assignment_status: 'ACTIVE', effective_to: null } });
    if (inUse) throw new BadRequestException(`${inUse} employee salar${inUse === 1 ? 'y uses' : 'ies use'} this structure. Revise ${inUse === 1 ? 'it' : 'them'} to another structure first.`);
    await this.prisma.rndtechnosoft_salary_structures.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { structure_status: 'ARCHIVED', archived_at: new Date(), updated_at: new Date() } });
    await this.log(tenantId, actor, 'SALARY_STRUCTURE_ARCHIVED', id, {});
    return this.get(tenantId, id);
  }

  /**
   * Works out lines as they stand in the editor, with sample or given values,
   * and explains each. Nothing is saved.
   */
  async preview(tenantId: string, input: StructurePreviewDto) {
    const components = await this.components(tenantId, input.lines, true);
    const lines = input.lines.map((l) => engineLine(components.get(l.salaryComponentId) as ComponentRow, {
      default_amount: l.defaultAmount ? D(l.defaultAmount) : null,
      default_percentage: l.defaultPercentage ? D(l.defaultPercentage) : null,
      formula_expression: l.formula?.trim() || null,
    }, l.percentageBase ?? null));
    const decimal = (v: unknown, what: string) => {
      if (typeof v !== 'string' || !DECIMAL.test(v)) throw new BadRequestException(`${what} must be a number.`);
      return D(v);
    };
    const variables: Record<string, Prisma.Decimal> = {};
    for (const v of SYSTEM_VARIABLES) variables[v.name] = D(v.sample);
    delete variables.GROSS;
    for (const [name, value] of Object.entries(input.variables ?? {})) {
      if (!SYSTEM_VARIABLE_NAMES.has(name) || name === 'GROSS') throw new BadRequestException(`${name} is not a system value you can set.`);
      variables[name] = decimal(value, name);
    }
    if (variables.PRORATION.lt(0) || variables.PRORATION.gt(1)) throw new BadRequestException('The paid share of the month is between 0 and 1.');
    const overrides: Record<string, { amount?: Prisma.Decimal | null; percentage?: Prisma.Decimal | null }> = {};
    for (const [code, o] of Object.entries(input.overrides ?? {})) {
      overrides[code] = { amount: o?.amount ? decimal(o.amount, `${code}’s amount`) : null, percentage: o?.percentage ? decimal(o.percentage, `${code}’s percentage`) : null };
    }
    const provided: Record<string, { amount: Prisma.Decimal; note: string }> = {};
    for (const line of lines) {
      const given = input.provided?.[line.code];
      if (given !== undefined) provided[line.code] = { amount: decimal(given, `${line.code}’s amount`), note: `Amount tried in this preview: ${given}` };
      else if (line.calculationType === 'SYSTEM_CALCULATED') provided[line.code] = { amount: D(0), note: 'Worked out by payroll from attendance and records; 0 in this preview' };
    }
    const checked = checkStructure(lines);
    const result = calculateStructure(lines, checked, { variables, overrides, provided });
    const money = (v: Prisma.Decimal) => v.toFixed(2);
    return {
      problems: result.problems,
      lines: result.lines.map((l) => ({ code: l.code, name: l.name, category: l.category, fullAmount: l.fullAmount.toFixed(), amount: l.amount.toFixed(), steps: l.steps })),
      totals: { gross: money(result.gross), earnings: money(result.totalEarnings), deductions: money(result.totalDeductions), employerContributions: money(result.employerContributions), net: money(result.net) },
      variables: Object.fromEntries(Object.entries(variables).map(([k, v]) => [k, v.toFixed()])),
    };
  }

  /** The components the lines name: this workspace's, each once, and active unless only previewing. */
  private async components(tenantId: string, lines: StructureLineDto[], previewOnly = false) {
    const ids = lines.map((l) => l.salaryComponentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A component is in the structure more than once.');
    const rows = await this.prisma.rndtechnosoft_salary_components.findMany({ where: { tenant_id: tenantId, id: { in: ids } } });
    if (rows.length !== ids.length) throw new BadRequestException('A salary component was not found in this workspace.');
    const byId = new Map(rows.map((r) => [r.id, r]));
    if (!previewOnly) {
      const archived = rows.filter((r) => r.component_status !== 'ACTIVE');
      if (archived.length) throw new BadRequestException(`${archived.map((r) => r.component_code).join(', ')} ${archived.length === 1 ? 'is' : 'are'} archived.`);
    }
    for (const line of lines) {
      const component = byId.get(line.salaryComponentId) as ComponentRow;
      const type = component.calculation_type;
      if (type !== 'FIXED' && line.defaultAmount) throw new BadRequestException(`${component.component_code} isn’t a fixed amount, so it has no default amount.`);
      if (type !== 'PERCENTAGE' && (line.defaultPercentage || line.percentageBase)) throw new BadRequestException(`${component.component_code} isn’t a percentage.`);
      if (type !== 'FORMULA' && line.formula?.trim()) throw new BadRequestException(`${component.component_code} isn’t calculated by formula.`);
    }
    return byId;
  }

  private async writeLines(tx: Tx, tenantId: string, versionId: string, lines: StructureLineDto[], components: Map<string, ComponentRow>) {
    const idByCode = new Map([...components.values()].map((c) => [c.component_code, c.id]));
    await tx.rndtechnosoft_salary_structure_components.createMany({
      data: lines.map((l, index) => {
        const base = l.percentageBase ?? null;
        const isVariable = base !== null && SYSTEM_VARIABLE_NAMES.has(base);
        if (base && !isVariable && !idByCode.has(base)) {
          const code = (components.get(l.salaryComponentId) as ComponentRow).component_code;
          throw new BadRequestException(`${code} is a percentage of ${base}, which is not in this structure or a system value.`);
        }
        return {
          id: randomUUID(),
          tenant_id: tenantId,
          salary_structure_version_id: versionId,
          salary_component_id: l.salaryComponentId,
          default_amount: l.defaultAmount ? D(l.defaultAmount) : null,
          default_percentage: l.defaultPercentage ? D(l.defaultPercentage) : null,
          percentage_base_component_id: base && !isVariable ? (idByCode.get(base) as string) : null,
          percentage_base_variable: isVariable ? base : null,
          formula_expression: l.formula?.trim() || null,
          is_mandatory: l.isMandatory,
          display_order: (index + 1) * 10,
        };
      }),
    });
  }

  /**
   * A draft's date must be after every published version, and a change to a
   * structure already in use must also start after finalized payroll. A
   * structure's first version may start earlier: nobody was paid on it.
   */
  private async checkDate(db: Tx | PrismaService, tenantId: string, id: string, effectiveFrom: Date) {
    const latest = await db.rndtechnosoft_salary_structure_versions.findFirst({
      where: { tenant_id: tenantId, salary_structure_id: id, version_status: 'PUBLISHED' },
      orderBy: { effective_from: 'desc' },
      select: { effective_from: true, version_number: true },
    });
    if (!latest) return;
    const locked = lockedProblem(effectiveFrom, await finalizedThrough(db, tenantId), 'a change of structure');
    if (locked) throw new BadRequestException(locked);
    if (effectiveFrom <= latest.effective_from) {
      throw new BadRequestException(`Version ${latest.version_number} already starts on ${isoDate(latest.effective_from)}. A new version must start after that.`);
    }
  }

  private async lockStructure(tx: Tx, tenantId: string, id: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_salary_structures WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid FOR UPDATE`;
  }

  private async find(tenantId: string, id: string) {
    const structure = await this.prisma.rndtechnosoft_salary_structures.findFirst({ where: { tenant_id: tenantId, id } });
    if (!structure) throw new NotFoundException('Salary structure not found.');
    return structure;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, id: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'SALARY_STRUCTURE', entityId: id, metadata });
  }
}
