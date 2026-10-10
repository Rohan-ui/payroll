import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { finalizedThrough, isoDate } from '@/modules/payroll/payroll-lock';
import { SalaryComponentsService } from './salary-components.service';
import { SalaryStructuresService } from './salary-structures.service';
import { SalaryAssignmentsService } from './salary-assignments.service';
import { ImportCommitDto, ImportPreviewDto, ImportRowDto, ImportStructureDto } from './dto/salary-import.dto';

/**
 * Importing salaries exported from the earlier system: each employee's
 * structure, start date and monthly gross (or hourly rate). The export says
 * nothing about how a structure splits into Basic, HRA and so on, so an
 * imported structure has one earning that pays the whole gross: the totals
 * match the sheet exactly, and HR publishes a version with the real split
 * later. Nothing is invented.
 *
 * The preview only reads. The commit goes through the same structure and
 * salary-revision code as the screens, so every rule (dates, finalized
 * payroll, no overlaps) and every audit entry applies. Rows already imported
 * are reported as such, so running it again does no harm.
 */

/** The single earning of an imported structure, by how its people are paid. */
const IMPORT_COMPONENTS = {
  MONTHLY: { code: 'GROSS_SALARY', name: 'Gross salary', formula: 'MONTHLY_SALARY', isProrated: true, description: 'The whole monthly salary, for structures imported without a component split.' },
  HOURLY: { code: 'HOURLY_PAY', name: 'Hourly pay', formula: 'HOURLY_RATE * PAYABLE_HOURS', isProrated: false, description: 'The hourly rate times payable hours, for structures imported without a component split.' },
} as const;

export const IMPORT_REASON = 'Imported from the earlier system’s employee salary export';

/** Lower-case words only, so “Aadesh  Bhadilkar” and “aadesh bhadilkar” are the same name. */
export const normalName = (value: string) => value.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean).join(' ');

/** A structure code from its name: “HOURLY BASE” → HOURLY_BASE. */
export function structureCode(name: string, taken: Set<string>) {
  let base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'IMPORTED';
  if (!/^[A-Z]/.test(base)) base = `S_${base}`.slice(0, 60);
  let code = base;
  for (let n = 2; taken.has(code); n += 1) code = `${base}_${n}`;
  taken.add(code);
  return code;
}

export interface EmployeeOption { id: string; code: string; name: string; status: string }

@Injectable()
export class SalaryImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly components: SalaryComponentsService,
    private readonly structures: SalaryStructuresService,
    private readonly assignments: SalaryAssignmentsService,
  ) {}

  /** What an import would do, row by row, with suggested employee matches. Nothing is saved. */
  async preview(tenantId: string, input: ImportPreviewDto) {
    const plan = await this.plan(tenantId, input.structures);
    const employees = await this.employees(tenantId);
    const byName = new Map<string, EmployeeOption[]>();
    const byFirstLast = new Map<string, EmployeeOption[]>();
    for (const e of employees) {
      const words = normalName(e.name).split(' ');
      const push = (map: Map<string, EmployeeOption[]>, key: string) => map.set(key, [...(map.get(key) ?? []), e]);
      push(byName, words.join(' '));
      push(byFirstLast, `${words[0]} ${words[words.length - 1]}`);
    }
    const candidatesFor = (row: ImportRowDto) => {
      for (const name of [row.employeeName, row.altName ?? '']) {
        const words = normalName(name).split(' ').filter(Boolean);
        if (!words.length) continue;
        const found = byName.get(words.join(' ')) ?? byFirstLast.get(`${words[0]} ${words[words.length - 1]}`);
        if (found?.length) return found;
      }
      return [];
    };

    const existing = await this.prisma.rndtechnosoft_employee_salary_assignments.findMany({
      where: { tenant_id: tenantId, assignment_status: 'ACTIVE' },
      select: { employee_id: true, effective_from: true },
    });
    const latestStart = new Map<string, string>();
    for (const a of existing) {
      const from = isoDate(a.effective_from);
      if ((latestStart.get(a.employee_id) ?? '') < from) latestStart.set(a.employee_id, from);
    }

    const seen = new Set<string>();
    const rows = input.rows.map((row) => {
      const candidates = candidatesFor(row);
      const match = candidates.length === 1 ? candidates[0] : null;
      const structure = plan.find((p) => p.sourceName === row.structureName);
      const notes: string[] = [];
      if (!structure) notes.push(`The structure “${row.structureName}” is not in the structure list.`);
      if (!candidates.length) notes.push('No employee with this name: choose one, or leave the row out.');
      if (candidates.length > 1) notes.push(`${candidates.length} employees have this name: choose the right one.`);
      if (match) {
        const key = `${match.id} ${row.startDate}`;
        if (seen.has(key)) notes.push('Another row gives this employee a salary from the same date.');
        seen.add(key);
        const latest = latestStart.get(match.id);
        if (latest && latest >= row.startDate) notes.push(latest === row.startDate ? 'This salary looks already imported (one starts on this date).' : `The employee already has a salary from ${latest}, so this earlier one can’t be added.`);
      }
      return {
        rowNumber: row.rowNumber,
        employeeName: row.employeeName,
        structureName: row.structureName,
        basis: structure?.basis ?? null,
        startDate: row.startDate,
        amount: row.amount,
        suggestedEmployeeId: match?.id ?? null,
        candidates,
        notes,
      };
    });
    return {
      structures: plan.map((p) => ({ ...p, effectiveFrom: this.firstStart(input.rows, p.sourceName) })),
      rows,
      employees,
      lockedThrough: await finalizedThrough(this.prisma, tenantId).then((d) => (d ? isoDate(d) : null)),
    };
  }

  /** Creates what the structures need, then records each chosen row as a salary revision. */
  async commit(tenantId: string, input: ImportCommitDto, actor: AuthenticatedTenantUser) {
    const plan = await this.plan(tenantId, input.structures);
    for (const row of input.rows) {
      if (!plan.some((p) => p.sourceName === row.structureName)) throw new BadRequestException(`Row ${row.rowNumber}: the structure “${row.structureName}” is not in the structure list.`);
    }
    const ids = [...new Set(input.rows.map((r) => r.employeeId))];
    const found = await this.prisma.rndtechnosoft_employees.count({ where: { tenant_id: tenantId, id: { in: ids } } });
    if (found !== ids.length) throw new BadRequestException('An employee chosen for a row was not found in this workspace.');

    // Structures first: an existing one is reused, a new one is created and published.
    const structureIds = new Map<string, string>();
    for (const p of plan) {
      if (!input.rows.some((r) => r.structureName === p.sourceName)) continue;
      if (p.existing) {
        structureIds.set(p.sourceName, p.existing.id);
        continue;
      }
      const componentId = await this.importComponent(tenantId, p.basis, actor);
      const spec = IMPORT_COMPONENTS[p.basis];
      const created = await this.structures.create(tenantId, {
        structureCode: p.code,
        structureName: p.sourceName,
        effectiveFrom: this.firstStart(input.rows, p.sourceName) as string,
        changeNote: 'Imported without a component split: one earning pays the whole salary',
        lines: [{ salaryComponentId: componentId, defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: spec.formula, isMandatory: true }],
      }, actor);
      await this.structures.publish(tenantId, created.id, actor);
      structureIds.set(p.sourceName, created.id);
    }

    // Each employee's rows oldest first, so later ones become revisions of earlier ones.
    const ordered = [...input.rows].sort((a, b) => a.employeeId.localeCompare(b.employeeId) || a.startDate.localeCompare(b.startDate));
    const results: { rowNumber: number; outcome: 'IMPORTED' | 'SKIPPED'; reason: string | null }[] = [];
    for (const row of ordered) {
      const basis = (plan.find((p) => p.sourceName === row.structureName) as (typeof plan)[number]).basis;
      try {
        await this.assignments.revise(tenantId, row.employeeId, {
          salaryStructureId: structureIds.get(row.structureName) as string,
          effectiveFrom: row.startDate,
          payBasis: basis,
          monthlySalary: basis === 'MONTHLY' ? row.amount : null,
          annualCtc: null,
          baseRate: basis === 'HOURLY' ? row.amount : null,
          currencyCode: 'INR',
          payrollPolicyId: null,
          isOvertimeEligible: false,
          paymentMethod: 'BANK_TRANSFER',
          changeReason: IMPORT_REASON,
          componentValues: [],
        }, actor);
        results.push({ rowNumber: row.rowNumber, outcome: 'IMPORTED', reason: null });
      } catch (e) {
        // Expected refusals (already imported, finalized payroll, a later salary) are reported per row.
        if (!(e instanceof HttpException)) throw e;
        results.push({ rowNumber: row.rowNumber, outcome: 'SKIPPED', reason: e.message });
      }
    }
    results.sort((a, b) => a.rowNumber - b.rowNumber);
    const imported = results.filter((r) => r.outcome === 'IMPORTED').length;
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'SALARY_IMPORT_COMPLETED', entityType: 'SALARY_IMPORT',
      metadata: { rows: input.rows.length, imported, skipped: input.rows.length - imported, structures_created: plan.filter((p) => !p.existing && structureIds.has(p.sourceName)).map((p) => p.code) },
    });
    return { imported, skipped: input.rows.length - imported, results };
  }

  /** Each named structure: the existing one with its generated code, or the code a new one gets. */
  private async plan(tenantId: string, structures: ImportStructureDto[]) {
    const names = structures.map((s) => s.sourceName.trim());
    if (new Set(names).size !== names.length) throw new BadRequestException('A structure is listed more than once.');
    const existing = await this.prisma.rndtechnosoft_salary_structures.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, salary_structure_code: true, salary_structure_name: true, structure_status: true },
    });
    const taken = new Set(existing.map((s) => s.salary_structure_code));
    return structures.map((s) => {
      const name = s.sourceName.trim();
      const same = existing.find((e) => e.salary_structure_name === name && e.structure_status === 'ACTIVE');
      return {
        sourceName: name,
        basis: s.basis,
        code: same ? same.salary_structure_code : structureCode(name, taken),
        existing: same ? { id: same.id, name: same.salary_structure_name } : null,
      };
    });
  }

  /** The earning an imported structure pays through, created once. */
  private async importComponent(tenantId: string, basis: 'MONTHLY' | 'HOURLY', actor: AuthenticatedTenantUser) {
    const spec = IMPORT_COMPONENTS[basis];
    const current = await this.prisma.rndtechnosoft_salary_components.findFirst({ where: { tenant_id: tenantId, component_code: spec.code } });
    if (current) {
      if (current.component_category !== 'EARNING' || current.calculation_type !== 'FORMULA' || current.component_status !== 'ACTIVE') {
        throw new BadRequestException(`A component ${spec.code} already exists but isn’t an active formula earning, so the import can’t use it. Rename or archive it first.`);
      }
      return current.id;
    }
    const created = await this.components.create(tenantId, {
      componentCode: spec.code, componentName: spec.name, description: spec.description, category: 'EARNING', calculationType: 'FORMULA', systemRule: null,
      isStatutory: false, isTaxable: true, isProrated: spec.isProrated, includeInGross: true, includeInCtc: true, showOnPayslip: true,
      minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 10,
    }, actor);
    return created.id;
  }

  private firstStart(rows: { structureName: string; startDate: string }[], structureName: string) {
    return rows.filter((r) => r.structureName === structureName).map((r) => r.startDate).sort()[0] ?? null;
  }

  private async employees(tenantId: string): Promise<EmployeeOption[]> {
    const rows = await this.prisma.rndtechnosoft_employees.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, employee_code: true, first_name: true, last_name: true, employee_status: true },
      orderBy: [{ first_name: 'asc' }, { last_name: 'asc' }],
      take: 5000,
    });
    return rows.map((e) => ({ id: e.id, code: e.employee_code, name: [e.first_name, e.last_name].filter(Boolean).join(' '), status: e.employee_status }));
  }
}
