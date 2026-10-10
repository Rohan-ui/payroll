import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PayrollPoliciesService } from '../policies/payroll-policies.service';
import { PayrollPolicyConfig } from '../policies/policy-config';
import { dateOnly, isoDate } from '../payroll-lock';
import { calculateStructure, checkStructure, prorationShare } from '@/modules/salary/formula/structure-engine';
import { rateVariables } from '@/modules/salary/formula/salary-variables';
import { engineLines } from '@/modules/salary/salary-structures.service';
import { AttendanceSummary, DayRecord, summarizeAttendance } from './attendance-summary';
import { overtimePay, penaltyDeduction } from './adjustments';

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);
const DAY = 24 * 60 * 60 * 1000;
const COMPONENT = 'rndtechnosoft_salary_components_rndtechnosoft_salary_structure_components_tenant_id_salary_component_idTorndtechnosoft_salary_components' as const;
const ROUNDING = { HALF_UP: Prisma.Decimal.ROUND_HALF_UP, UP: Prisma.Decimal.ROUND_UP, DOWN: Prisma.Decimal.ROUND_DOWN } as const;

export const SYSTEM_RULES = ['OVERTIME', 'LATE_ARRIVAL', 'EARLY_DEPARTURE', 'LOAN_RECOVERY', 'ARREARS'] as const;
export type SystemRule = (typeof SYSTEM_RULES)[number];
const RULE_NAMES: Record<SystemRule, string> = {
  OVERTIME: 'overtime', LATE_ARRIVAL: 'late arrival deductions', EARLY_DEPARTURE: 'early departure deductions', LOAN_RECOVERY: 'loan and advance recovery', ARREARS: 'arrears',
};
/** Whether a rule's amount is paid to the employee or taken from pay. */
const RULE_CATEGORY: Record<SystemRule, 'EARNING' | 'DEDUCTION'> = {
  OVERTIME: 'EARNING', LATE_ARRIVAL: 'DEDUCTION', EARLY_DEPARTURE: 'DEDUCTION', LOAN_RECOVERY: 'DEDUCTION', ARREARS: 'EARNING',
};

export interface PayLine {
  salaryComponentId: string;
  componentCode: string;
  componentName: string;
  componentCategory: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  calculationType: string;
  amount: string;
  displayOrder: number;
  showOnPayslip: boolean;
  source: 'STRUCTURE' | 'VARIABLE_INPUT' | 'SYSTEM';
  steps: string[];
}

type AttendanceView = Omit<AttendanceSummary, 'days' | 'exceptions' | 'warnings' | 'presentDays' | 'paidDays' | 'unpaidDays' | 'lateDays' | 'earlyDays' | 'overtimeDays'>
  & { presentDays: string; paidDays: string; unpaidDays: string };

export interface EmployeePay {
  employee: { id: string; code: string; name: string };
  period: { start: string; end: string };
  /** READY can be paid; EXCEPTION needs someone to fix what `exceptions` says first. */
  status: 'READY' | 'EXCEPTION';
  exceptions: string[];
  warnings: string[];
  currency: string;
  salaryAssignmentId: string | null;
  segments: {
    from: string;
    to: string;
    salaryAssignmentId: string;
    structure: { code: string; name: string; version: number };
    policy: { code: string; name: string; version: number; reason: string } | null;
    payBasis: string;
    variables: Record<string, string>;
  }[];
  attendance: AttendanceView;
  lines: PayLine[];
  totals: { earnings: string; deductions: string; employerContributions: string; gross: string; netBeforeRounding: string; roundingAdjustment: string; net: string };
  /** What finalizing this pay settles: loan instalments recovered and arrears paid. */
  settles: { loanInstallments: { id: string; loanId: string; amount: string }[]; arrearsIds: string[]; overtimeMinutes: number };
}

/** A salary to calculate with instead of the recorded ones from a date: how arrears are worked out. */
export interface SalaryOverride {
  from: string;
  assignment: AssignmentLike;
}

export interface AssignmentLike {
  id: string;
  salary_structure_id: string;
  pay_basis: string;
  monthly_gross_target: Decimal | null;
  annual_ctc: Decimal | null;
  base_rate: Decimal | null;
  payroll_policy_id: string | null;
  is_overtime_eligible: boolean;
  currency_code: string;
  effective_from: Date;
  effective_to: Date | null;
  rndtechnosoft_employee_salary_component_values: { amount: Decimal | null; percentage: Decimal | null; rndtechnosoft_salary_components: { component_code: string } }[];
}

export interface CalculateOptions {
  today?: string;
  override?: SalaryOverride;
  /** Work out earnings only, without loan recovery or arrears (for arrears of a past month). */
  earningsOnly?: boolean;
}

/**
 * Works out one employee's pay for a period from their salary history,
 * payroll policy, attendance and leave, overtime decisions, monthly entries,
 * loans and arrears. The structure engine is the same one the structure
 * preview uses, and nothing is guessed: anything missing is an exception.
 */
@Injectable()
export class PayrollCalculationService {
  constructor(private readonly prisma: PrismaService, private readonly policies: PayrollPoliciesService) {}

  async calculate(tenantId: string, employeeId: string, periodStart: string, periodEnd: string, options: CalculateOptions = {}): Promise<EmployeePay> {
    const today = options.today ?? isoDate(new Date());
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId, id: employeeId },
      select: { id: true, employee_code: true, first_name: true, last_name: true, hire_date: true, exit_date: true },
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    const start = dateOnly(periodStart);
    const end = dateOnly(periodEnd);
    const exceptions: string[] = [];
    const warnings: string[] = [];
    const hireDate = employee.hire_date ? isoDate(employee.hire_date) : null;
    const exitDate = employee.exit_date ? isoDate(employee.exit_date) : null;

    const [recorded, records, holidays, inputs, leaves, approvals, installments, arrears, ruleComponents] = await Promise.all([
      this.prisma.rndtechnosoft_employee_salary_assignments.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, assignment_status: 'ACTIVE', effective_from: { lte: end }, OR: [{ effective_to: null }, { effective_to: { gte: start } }] },
        orderBy: { effective_from: 'asc' },
        include: { rndtechnosoft_employee_salary_component_values: { include: { rndtechnosoft_salary_components: { select: { component_code: true } } } } },
      }),
      this.prisma.rndtechnosoft_attendance_records.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, attendance_date: { gte: start, lte: end } },
        select: { attendance_date: true, attendance_status: true, worked_minutes: true, payable_minutes: true, late_minutes: true, early_departure_minutes: true, overtime_minutes: true, approval_status: true },
      }),
      this.holidays(tenantId, employeeId, start, end),
      this.inputs(tenantId, employeeId, start, end),
      this.leaves(tenantId, employeeId, start, end),
      this.prisma.rndtechnosoft_overtime_approvals.findMany({ where: { tenant_id: tenantId, employee_id: employeeId, work_date: { gte: start, lte: end } } }),
      options.earningsOnly ? Promise.resolve([]) : this.prisma.rndtechnosoft_loan_installments.findMany({
        where: { tenant_id: tenantId, installment_status: 'SCHEDULED', due_date: { gte: start, lte: end }, rndtechnosoft_employee_loans: { employee_id: employeeId, loan_status: 'ACTIVE' } },
        include: { rndtechnosoft_employee_loans: { select: { id: true, loan_number: true, loan_type: true } } },
        orderBy: { due_date: 'asc' },
      }),
      options.earningsOnly ? Promise.resolve([]) : this.prisma.rndtechnosoft_salary_arrears.findMany({
        where: { tenant_id: tenantId, employee_id: employeeId, arrears_status: 'PENDING' },
        include: { rndtechnosoft_payroll_periods: { select: { period_start: true, period_end: true } } },
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.rndtechnosoft_salary_components.findMany({
        where: { tenant_id: tenantId, component_status: 'ACTIVE', calculation_type: 'SYSTEM_CALCULATED' },
        orderBy: [{ display_order: 'asc' }, { component_code: 'asc' }],
      }),
    ]);

    // Arrears are worked out against a revised salary from a date instead of the recorded one.
    let assignments: AssignmentLike[] = recorded;
    if (options.override) {
      const from = dateOnly(options.override.from);
      assignments = recorded
        .filter((a) => a.effective_from < from)
        .map((a) => ({ ...a, effective_to: !a.effective_to || a.effective_to >= from ? new Date(from.getTime() - DAY) : a.effective_to }));
      assignments.push(options.override.assignment);
    }

    const dayRecords = new Map<string, DayRecord>(records.map((r) => [isoDate(r.attendance_date), {
      date: isoDate(r.attendance_date), status: r.attendance_status, workedMinutes: r.worked_minutes, payableMinutes: r.payable_minutes, lateMinutes: r.late_minutes,
      earlyMinutes: r.early_departure_minutes, overtimeMinutes: r.overtime_minutes, approvalStatus: r.approval_status,
    }]));

    const segments = assignments.map((a) => ({
      from: isoDate(a.effective_from > start ? a.effective_from : start),
      to: isoDate(a.effective_to && a.effective_to < end ? a.effective_to : end),
      assignment: a,
    }));
    if (!segments.length) exceptions.push('No salary covers this period. Set the employee’s salary first.');
    const covered = (date: string) => segments.some((s) => s.from <= date && date <= s.to);
    const employed = (date: string) => (!hireDate || date >= hireDate) && (!exitDate || date <= exitDate);
    const uncovered: string[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
      const date = isoDate(new Date(t));
      if (segments.length && employed(date) && !covered(date)) uncovered.push(date);
    }
    if (uncovered.length) warnings.push(`No salary covers ${uncovered.length} employed day${uncovered.length === 1 ? '' : 's'} (from ${uncovered[0]}); they aren’t paid.`);

    // Pass 1: each part of the period with its structure version, policy, days and rates.
    type Part = Awaited<ReturnType<PayrollCalculationService['structureParts']>>[number];
    const prepared: {
      part: Part; assignment: AssignmentLike; policy: PayrollPolicyConfig;
      policyRef: { code: string; name: string; version: number; reason: string };
      variables: Record<string, Decimal>;
    }[] = [];
    let wholeSummary: AttendanceSummary | null = null;
    for (const segment of segments) {
      const a = segment.assignment;
      const parts = await this.structureParts(tenantId, a.salary_structure_id, segment.from, segment.to);
      if (!parts.length) { exceptions.push(`The salary’s structure has no published version in force from ${segment.from} to ${segment.to}.`); continue; }
      for (const part of parts) {
        if (part.missing) { exceptions.push(`The salary’s structure has no published version in force from ${part.from} to ${part.to}.`); continue; }
        const resolved = await this.policies.resolve(tenantId, employeeId, dateOnly(part.from), a.payroll_policy_id);
        if (!resolved.version || !resolved.policy) { exceptions.push(resolved.problem ?? 'No payroll policy applies.'); continue; }
        const policy = resolved.version.config;
        const payBasis = a.pay_basis as 'MONTHLY' | 'DAILY' | 'HOURLY';
        const summary = summarizeAttendance({ periodStart, periodEnd, windowStart: part.from, windowEnd: part.to, hireDate, exitDate, payBasis, policy, holidays, records: dayRecords, leaves, today });
        if (!wholeSummary) {
          wholeSummary = summarizeAttendance({ periodStart, periodEnd, windowStart: periodStart, windowEnd: periodEnd, hireDate, exitDate, payBasis, policy, holidays, records: dayRecords, leaves, today });
          exceptions.push(...wholeSummary.exceptions);
          warnings.push(...wholeSummary.warnings);
        }
        const rates = rateVariables(
          { payBasis, monthlySalary: a.monthly_gross_target, annualCtc: a.annual_ctc, baseRate: a.base_rate },
          policy,
          { calendarDays: summary.calendarDays, workingDays: summary.workingDays },
        );
        exceptions.push(...rates.problems);
        const hours = (minutes: number) => D(minutes).div(60).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const variables: Record<string, Decimal> = {
          ...rates.values,
          PAID_DAYS: summary.paidDays, UNPAID_DAYS: summary.unpaidDays, PRESENT_DAYS: summary.presentDays, HALF_DAYS: D(summary.halfDays),
          PAID_LEAVE_DAYS: D(summary.paidLeaveDays), UNPAID_LEAVE_DAYS: D(summary.unpaidLeaveDays), HOLIDAYS: D(summary.holidays), WEEKLY_OFFS: D(summary.weeklyOffs),
          WORKED_HOURS: hours(summary.workedMinutes), PAYABLE_HOURS: hours(summary.payableMinutes),
          LATE_COUNT: D(summary.lateCount), LATE_MINUTES: D(summary.lateMinutes), EARLY_COUNT: D(summary.earlyCount), EARLY_MINUTES: D(summary.earlyMinutes),
          OVERTIME_HOURS: ZERO,
        };
        if (rates.values.DIVISOR?.gt(0)) variables.PRORATION = prorationShare(rates.values.DIVISOR, summary.unpaidDays);
        prepared.push({
          part, assignment: a, policy, variables,
          policyRef: { code: resolved.policy.policyCode, name: resolved.policy.policyName, version: resolved.version.number, reason: resolved.reason ?? '' },
        });
      }
    }

    // Pass 2: the month's overtime, deductions, recovery and arrears, worked out once with the last part's policy and rates.
    const ruleAmounts = new Map<SystemRule, { amount: Decimal; steps: string[] }>();
    const settles: EmployeePay['settles'] = { loanInstallments: [], arrearsIds: [], overtimeMinutes: 0 };
    const last = prepared[prepared.length - 1];
    if (last && wholeSummary) {
      const { policy, assignment, variables } = last;
      const paidWindow = (date: string) => employed(date) && covered(date);
      // Overtime
      const otDays = wholeSummary.overtimeDays.filter((d) => paidWindow(d.date));
      if (policy.overtime.enabled && assignment.is_overtime_eligible && otDays.length) {
        if (!variables.HOURLY_RATE) exceptions.push('Overtime can’t be worked out: there is no hourly rate.');
        else {
          const byDate = new Map(approvals.map((x) => [isoDate(x.work_date), x]));
          const ot = overtimePay(otDays.map((d) => {
            const decision = byDate.get(d.date);
            return { date: d.date, dayType: d.dayType, recordedMinutes: d.minutes, approvedMinutes: decision ? decision.approved_minutes : null, approvedAgainstMinutes: decision ? decision.recorded_minutes : null };
          }), policy, variables.HOURLY_RATE);
          variables.OVERTIME_HOURS = D(ot.paidMinutes).div(60).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          settles.overtimeMinutes = ot.paidMinutes;
          if (ot.amount.gt(0)) ruleAmounts.set('OVERTIME', { amount: ot.amount, steps: ot.steps });
          if (ot.awaitingApproval.length) warnings.push(`Overtime on ${ot.awaitingApproval.join(', ')} is waiting for approval and isn’t paid.`);
          if (ot.changedSinceApproval.length) warnings.push(`Overtime on ${ot.changedSinceApproval.join(', ')} changed after it was approved; it isn’t paid until it is approved again.`);
        }
      } else if (otDays.length && policy.overtime.enabled && !assignment.is_overtime_eligible) {
        warnings.push('Attendance records overtime, but this salary isn’t eligible for overtime, so none is paid.');
      }
      // Late arrival and early departure
      for (const [rule, key, days, what] of [
        ['LATE_ARRIVAL', 'lateArrival', wholeSummary.lateDays, 'late'],
        ['EARLY_DEPARTURE', 'earlyDeparture', wholeSummary.earlyDays, 'early'],
      ] as const) {
        const penaltyRule = policy[key];
        if (!penaltyRule.enabled) continue;
        const needsDailyRate = penaltyRule.repeated || penaltyRule.bands.some((b) => b.action === 'DAY_FRACTION');
        if (needsDailyRate && !variables.DAILY_RATE) { exceptions.push(`${RULE_NAMES[rule]} can’t be worked out: there is no daily rate.`); continue; }
        const result = penaltyDeduction(penaltyRule, days.filter((d) => paidWindow(d.date)), variables.DAILY_RATE ?? ZERO, what);
        if (result.amount.gt(0)) ruleAmounts.set(rule, { amount: result.amount, steps: result.steps });
      }
      // Loan and advance recovery
      if (installments.length) {
        const amount = installments.reduce((s, i) => s.plus(i.total_amount), ZERO);
        ruleAmounts.set('LOAN_RECOVERY', {
          amount,
          steps: installments.map((i) => `${i.rndtechnosoft_employee_loans.loan_type === 'ADVANCE' ? 'Advance' : 'Loan'} ${i.rndtechnosoft_employee_loans.loan_number}, instalment ${i.installment_number} due ${isoDate(i.due_date)}: ${i.total_amount.toFixed(2)}`),
        });
        settles.loanInstallments = installments.map((i) => ({ id: i.id, loanId: i.rndtechnosoft_employee_loans.id, amount: i.total_amount.toFixed(2) }));
      }
      // Arrears
      if (arrears.length) {
        ruleAmounts.set('ARREARS', {
          amount: arrears.reduce((s, x) => s.plus(x.arrears_amount), ZERO),
          steps: arrears.map((x) => `Arrears for ${isoDate(x.rndtechnosoft_payroll_periods.period_start)} to ${isoDate(x.rndtechnosoft_payroll_periods.period_end)}: revised earnings ${x.revised_earnings.toFixed(2)} − paid ${x.paid_earnings.toFixed(2)} = ${x.arrears_amount.toFixed(2)}`),
        });
        settles.arrearsIds = arrears.map((x) => x.id);
      }
    }

    // Pass 3: the structure engine for each part, with the month's amounts in the last part.
    const byCode = new Map<string, { line: PayLine; amount: Decimal }>();
    const outSegments: EmployeePay['segments'] = [];
    const multi = prepared.length > 1;
    const usedRules = new Set<SystemRule>();
    for (const [index, p] of prepared.entries()) {
      const isLast = index === prepared.length - 1;
      const lines = engineLines(p.part.lines);
      const components = new Map(p.part.lines.map((l) => [l[COMPONENT].component_code, l[COMPONENT]]));
      const provided: Record<string, { amount: Decimal; note: string }> = {};
      for (const line of lines) {
        const component = components.get(line.code);
        if (line.calculationType === 'SYSTEM_CALCULATED') {
          const rule = component?.system_rule as SystemRule;
          const given = isLast ? ruleAmounts.get(rule) : undefined;
          if (isLast && given) usedRules.add(rule);
          provided[line.code] = given ? { amount: given.amount, note: given.steps.join('; ') } : { amount: ZERO, note: `No ${RULE_NAMES[rule] ?? 'amount'} this period` };
        }
        if (line.calculationType === 'MANUAL' && isLast) {
          const entered = inputs.approved.get(component?.id ?? '');
          if (entered) provided[line.code] = entered;
        }
      }
      const overrides = Object.fromEntries(p.assignment.rndtechnosoft_employee_salary_component_values.map((v) => [v.rndtechnosoft_salary_components.component_code, { amount: v.amount, percentage: v.percentage }]));
      const result = calculateStructure(lines, checkStructure(lines), { variables: p.variables, overrides, provided });
      exceptions.push(...result.problems.map((x) => x.message));
      const prefix = multi ? `${p.part.from} to ${p.part.to}: ` : '';
      const position = new Map(lines.map((l, i) => [l.code, i]));
      for (const calc of result.lines) {
        const component = components.get(calc.code);
        if (!component) continue;
        const kind = component.calculation_type;
        // A line with nothing to pay that only exists to take entered or worked-out amounts isn't shown.
        if (calc.amount.isZero() && (kind === 'MANUAL' || kind === 'SYSTEM_CALCULATED')) continue;
        const entry = byCode.get(calc.code) ?? {
          amount: ZERO,
          line: {
            salaryComponentId: component.id, componentCode: calc.code, componentName: component.component_name,
            componentCategory: component.component_category as PayLine['componentCategory'], calculationType: kind, amount: '0',
            displayOrder: ((position.get(calc.code) ?? 0) + 1) * 10, showOnPayslip: component.show_on_payslip,
            source: (kind === 'SYSTEM_CALCULATED' ? 'SYSTEM' : 'STRUCTURE') as PayLine['source'], steps: [],
          },
        };
        entry.amount = entry.amount.plus(calc.amount);
        entry.line.steps.push(...calc.steps.map((s) => (kind === 'SYSTEM_CALCULATED' ? s : `${prefix}${s}`)));
        byCode.set(calc.code, entry);
      }
      outSegments.push({
        from: p.part.from, to: p.part.to, salaryAssignmentId: p.assignment.id,
        structure: { code: p.part.structureCode, name: p.part.structureName, version: p.part.version },
        policy: p.policyRef, payBasis: p.assignment.pay_basis,
        variables: Object.fromEntries(Object.entries(p.variables).map(([k, v]) => [k, v.toFixed()])),
      });
    }

    // The month's amounts whose structure has no line for them use the workspace's component for the rule.
    for (const [rule, given] of ruleAmounts) {
      if (usedRules.has(rule)) continue;
      const component = ruleComponents.find((c) => c.system_rule === rule);
      if (!component) {
        exceptions.push(`${given.amount.toFixed(2)} of ${RULE_NAMES[rule]} is due, but no salary component is set up for it. Create a ${RULE_CATEGORY[rule] === 'EARNING' ? 'earning' : 'deduction'} component worked out by payroll from “${RULE_NAMES[rule]}”.`);
        continue;
      }
      if (component.component_category !== RULE_CATEGORY[rule]) {
        exceptions.push(`${component.component_code} works out ${RULE_NAMES[rule]} but is ${component.component_category === 'EARNING' ? 'an earning' : 'a deduction'}; it must be ${RULE_CATEGORY[rule] === 'EARNING' ? 'an earning' : 'a deduction'}.`);
        continue;
      }
      byCode.set(component.component_code, {
        amount: given.amount,
        line: {
          salaryComponentId: component.id, componentCode: component.component_code, componentName: component.component_name,
          componentCategory: component.component_category as PayLine['componentCategory'], calculationType: component.calculation_type, amount: '0',
          displayOrder: 900 + component.display_order, showOnPayslip: component.show_on_payslip, source: 'SYSTEM', steps: given.steps,
        },
      });
    }

    // Entered amounts for components that aren't in the structure are paid as their own lines.
    for (const [componentId, entered] of inputs.approved) {
      if ([...byCode.values()].some((e) => e.line.salaryComponentId === componentId)) continue;
      const component = await this.prisma.rndtechnosoft_salary_components.findFirst({ where: { tenant_id: tenantId, id: componentId } });
      if (!component) continue;
      byCode.set(component.component_code, {
        amount: entered.amount,
        line: {
          salaryComponentId: component.id, componentCode: component.component_code, componentName: component.component_name,
          componentCategory: component.component_category as PayLine['componentCategory'], calculationType: component.calculation_type, amount: '0',
          displayOrder: 1000 + component.display_order, showOnPayslip: component.show_on_payslip, source: 'VARIABLE_INPUT', steps: [entered.note],
        },
      });
    }
    if (inputs.pending) warnings.push(`${inputs.pending} monthly entr${inputs.pending === 1 ? 'y is' : 'ies are'} waiting for approval and ${inputs.pending === 1 ? 'isn’t' : 'aren’t'} included.`);

    const lines = [...byCode.values()].map((e) => ({ ...e.line, amount: e.amount.toFixed(2) })).sort((x, y) => x.displayOrder - y.displayOrder);
    const sum = (category: PayLine['componentCategory']) => lines.filter((l) => l.componentCategory === category).reduce((s, l) => s.plus(l.amount), ZERO);
    const earnings = sum('EARNING');
    const deductions = sum('DEDUCTION');
    const netBefore = earnings.minus(deductions);
    const rounding = last?.policy.rounding ?? { netPayScale: 2 as const, netPayMode: 'HALF_UP' as const };
    const net = netBefore.toDecimalPlaces(rounding.netPayScale, ROUNDING[rounding.netPayMode]);
    if (net.isNegative()) exceptions.push(`Deductions (${deductions.toFixed(2)}) are more than earnings (${earnings.toFixed(2)}), so net pay would be negative.`);
    if (!exceptions.length && earnings.isZero() && segments.length) warnings.push('Nothing is payable for this period.');

    const summary = wholeSummary;
    const lastAssignment = assignments[assignments.length - 1];
    return {
      employee: { id: employee.id, code: employee.employee_code, name: [employee.first_name, employee.last_name].filter(Boolean).join(' ') },
      period: { start: periodStart, end: periodEnd },
      status: exceptions.length ? 'EXCEPTION' : 'READY',
      exceptions: [...new Set(exceptions)],
      warnings: [...new Set(warnings)],
      currency: lastAssignment?.currency_code ?? 'INR',
      salaryAssignmentId: lastAssignment?.id ?? null,
      segments: outSegments,
      attendance: summary ? {
        calendarDays: summary.calendarDays, workingDays: summary.workingDays, presentDays: summary.presentDays.toFixed(), halfDays: summary.halfDays,
        paidLeaveDays: summary.paidLeaveDays, unpaidLeaveDays: summary.unpaidLeaveDays, absentDays: summary.absentDays, holidays: summary.holidays, weeklyOffs: summary.weeklyOffs,
        missingDays: summary.missingDays, notEmployedDays: summary.notEmployedDays, paidDays: summary.paidDays.toFixed(), unpaidDays: summary.unpaidDays.toFixed(),
        workedMinutes: summary.workedMinutes, payableMinutes: summary.payableMinutes, lateCount: summary.lateCount, lateMinutes: summary.lateMinutes,
        earlyCount: summary.earlyCount, earlyMinutes: summary.earlyMinutes, overtimeMinutes: summary.overtimeMinutes,
      } : emptyAttendance(),
      lines,
      totals: {
        earnings: earnings.toFixed(2), deductions: deductions.toFixed(2), employerContributions: sum('EMPLOYER_CONTRIBUTION').toFixed(2), gross: earnings.toFixed(2),
        netBeforeRounding: netBefore.toFixed(2), roundingAdjustment: net.minus(netBefore).toFixed(2), net: net.toFixed(2),
      },
      settles,
    };
  }

  /** A structure's published versions over a window, with any gap marked missing. */
  private async structureParts(tenantId: string, structureId: string, from: string, to: string) {
    const versions = await this.prisma.rndtechnosoft_salary_structure_versions.findMany({
      where: { tenant_id: tenantId, salary_structure_id: structureId, version_status: 'PUBLISHED', effective_from: { lte: dateOnly(to) }, OR: [{ effective_to: null }, { effective_to: { gte: dateOnly(from) } }] },
      orderBy: { effective_from: 'asc' },
      include: {
        rndtechnosoft_salary_structures: { select: { salary_structure_code: true, salary_structure_name: true } },
        rndtechnosoft_salary_structure_components: { include: { [COMPONENT]: true } },
      },
    });
    type Part = { from: string; to: string; missing: boolean; version: number; structureCode: string; structureName: string; lines: (typeof versions)[number]['rndtechnosoft_salary_structure_components'] };
    const parts: Part[] = [];
    let cursor = from;
    const next = (iso: string) => isoDate(new Date(dateOnly(iso).getTime() + DAY));
    const before = (iso: string) => isoDate(new Date(dateOnly(iso).getTime() - DAY));
    for (const v of versions) {
      const vFrom = isoDate(v.effective_from) > cursor ? isoDate(v.effective_from) : cursor;
      const vTo = v.effective_to && isoDate(v.effective_to) < to ? isoDate(v.effective_to) : to;
      if (vFrom > cursor) parts.push({ from: cursor, to: before(vFrom), missing: true, version: 0, structureCode: '', structureName: '', lines: [] });
      parts.push({ from: vFrom, to: vTo, missing: false, version: v.version_number, structureCode: v.rndtechnosoft_salary_structures.salary_structure_code, structureName: v.rndtechnosoft_salary_structures.salary_structure_name, lines: v.rndtechnosoft_salary_structure_components });
      cursor = next(vTo);
    }
    if (parts.length && cursor <= to) parts.push({ from: cursor, to, missing: true, version: 0, structureCode: '', structureName: '', lines: [] });
    return parts;
  }

  /** Holidays from the calendars assigned to the employee or their branch over the period (optional holidays aren't days off). */
  private async holidays(tenantId: string, employeeId: string, start: Date, end: Date) {
    const employment = await this.prisma.rndtechnosoft_employee_employments.findFirst({
      where: { tenant_id: tenantId, employee_id: employeeId, effective_from: { lte: end }, OR: [{ effective_to: null }, { effective_to: { gte: start } }] },
      orderBy: { effective_from: 'desc' },
      select: { branch_id: true },
    });
    const assigned = await this.prisma.rndtechnosoft_holiday_calendar_assignments.findMany({
      where: {
        tenant_id: tenantId,
        OR: [{ employee_id: employeeId }, ...(employment?.branch_id ? [{ branch_id: employment.branch_id, employee_id: null }] : [])],
        effective_from: { lte: end },
        AND: [{ OR: [{ effective_to: null }, { effective_to: { gte: start } }] }],
      },
      select: { holiday_calendar_id: true, employee_id: true },
    });
    // An employee's own calendar replaces their branch's.
    const own = assigned.filter((a) => a.employee_id);
    const calendars = (own.length ? own : assigned).map((a) => a.holiday_calendar_id);
    if (!calendars.length) return new Set<string>();
    const days = await this.prisma.rndtechnosoft_holidays.findMany({
      where: { tenant_id: tenantId, holiday_calendar_id: { in: calendars }, is_optional: false, holiday_date: { gte: start, lte: end } },
      select: { holiday_date: true },
    });
    return new Set(days.map((d) => isoDate(d.holiday_date)));
  }

  /** Approved leave by day over the period, from approved leave requests. */
  private async leaves(tenantId: string, employeeId: string, start: Date, end: Date) {
    const days = await this.prisma.rndtechnosoft_leave_request_days.findMany({
      where: {
        tenant_id: tenantId, leave_date: { gte: start, lte: end },
        rndtechnosoft_leave_requests: { employee_id: employeeId, request_status: 'APPROVED' },
      },
      select: { leave_date: true, day_fraction: true, rndtechnosoft_leave_requests: { select: { rndtechnosoft_leave_types: { select: { is_paid: true, leave_type_name: true } } } } },
    });
    const byDate = new Map<string, { paid: boolean; fraction: Decimal; type: string }>();
    for (const d of days) {
      const type = d.rndtechnosoft_leave_requests.rndtechnosoft_leave_types;
      const date = isoDate(d.leave_date);
      const fraction = Prisma.Decimal.min(D(1), (byDate.get(date)?.fraction ?? ZERO).plus(d.day_fraction));
      byDate.set(date, { paid: type.is_paid, fraction, type: type.leave_type_name });
    }
    return byDate;
  }

  /** Approved amounts entered for the payroll period that matches these dates, by component; and how many still wait for approval. */
  private async inputs(tenantId: string, employeeId: string, start: Date, end: Date) {
    const rows = await this.prisma.rndtechnosoft_payroll_inputs.findMany({
      where: { tenant_id: tenantId, employee_id: employeeId, input_status: { in: ['APPROVED', 'PENDING'] }, rndtechnosoft_payroll_periods: { period_start: start, period_end: end } },
      select: { salary_component_id: true, amount: true, input_source: true, input_status: true, notes: true },
    });
    const approved = new Map<string, { amount: Decimal; note: string }>();
    let pending = 0;
    for (const r of rows) {
      if (r.input_status === 'PENDING') { pending += 1; continue; }
      const amount = (approved.get(r.salary_component_id)?.amount ?? ZERO).plus(r.amount);
      approved.set(r.salary_component_id, { amount, note: `Entered for this period${r.notes ? ` (${r.notes})` : ''}: ${amount.toFixed(2)}` });
    }
    return { approved, pending };
  }
}

function emptyAttendance(): AttendanceView {
  return {
    calendarDays: 0, workingDays: 0, presentDays: '0', halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, holidays: 0, weeklyOffs: 0,
    missingDays: 0, notEmployedDays: 0, paidDays: '0', unpaidDays: '0', workedMinutes: 0, payableMinutes: 0, lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0, overtimeMinutes: 0,
  };
}
