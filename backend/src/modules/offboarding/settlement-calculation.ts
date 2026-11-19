import { Prisma } from '@prisma/client';

/**
 * Full and final settlement rules and the calculation they drive. Pure: it
 * takes the numbers already looked up and returns the lines, so the same
 * inputs always give the same settlement. Money is Prisma.Decimal throughout
 * and each line is rounded once, to paise, at the end.
 */

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const SALARY_BASES = ['BASIC', 'GROSS'] as const;
export type SalaryBasis = (typeof SALARY_BASES)[number];

export interface SettlementPolicy {
  leaveEncashment: { enabled: boolean; basis: SalaryBasis; dayDivisor: number };
  notice: { basis: SalaryBasis; dayDivisor: number };
  gratuity: {
    enabled: boolean;
    /** Completed years of service needed to qualify. */
    minimumYears: number;
    /** Months past the last completed year that count as a whole year. */
    roundUpMonths: number;
    /** Days of wages per year of service (15 under the Payment of Gratuity Act). */
    daysPerYear: number;
    dayDivisor: number;
    /** The salary components gratuity is worked out on (Basic and Dearness Allowance). */
    componentCodes: string[];
    /** The most that is paid, as a decimal string; null for no limit. */
    cap: string | null;
  };
}

/** The defaults agreed for Indian payroll; every value can be changed per workspace. */
export const DEFAULT_SETTLEMENT_POLICY: SettlementPolicy = {
  leaveEncashment: { enabled: true, basis: 'BASIC', dayDivisor: 26 },
  notice: { basis: 'GROSS', dayDivisor: 30 },
  gratuity: { enabled: true, minimumYears: 5, roundUpMonths: 6, daysPerYear: 15, dayDivisor: 26, componentCodes: ['BASIC', 'DA'], cap: '2000000' },
};

/** Stored settings merged over the defaults, so a workspace that set nothing gets the defaults. */
export function settlementPolicy(stored: unknown): SettlementPolicy {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Partial<Record<keyof SettlementPolicy, object>>;
  return {
    leaveEncashment: { ...DEFAULT_SETTLEMENT_POLICY.leaveEncashment, ...(s.leaveEncashment ?? {}) },
    notice: { ...DEFAULT_SETTLEMENT_POLICY.notice, ...(s.notice ?? {}) },
    gratuity: { ...DEFAULT_SETTLEMENT_POLICY.gratuity, ...(s.gratuity ?? {}) },
  };
}

export type SettlementComponent =
  | 'FINAL_SALARY' | 'LEAVE_ENCASHMENT' | 'GRATUITY' | 'NOTICE_PAY' | 'BONUS' | 'INCENTIVE' | 'REIMBURSEMENT' | 'COMMISSION' | 'OTHER_PAYMENT'
  | 'NOTICE_RECOVERY' | 'LOAN_RECOVERY' | 'ADVANCE_RECOVERY' | 'OTHER_RECOVERY';

export const MANUAL_COMPONENTS: Record<string, 'EARNING' | 'RECOVERY'> = {
  BONUS: 'EARNING', INCENTIVE: 'EARNING', REIMBURSEMENT: 'EARNING', COMMISSION: 'EARNING', OTHER_PAYMENT: 'EARNING', OTHER_RECOVERY: 'RECOVERY',
};

export interface SettlementInputs {
  separationType: string;
  joiningDate: string;
  lastWorkingDate: string;
  /** A full month of the salary in force on the last working day, by component code, plus its gross; null when none is assigned. */
  monthlySalary: { gross: string; components: Record<string, string> } | null;
  notice: { shortfallDays: number; decision: 'RECOVER' | 'WAIVE' | null };
  leave: { leaveTypeId: string; name: string; balanceDays: string; encashable: boolean; asOf: string }[];
  loans: { loanId: string; number: string; type: string; outstanding: string; installmentIds: string[] }[];
  /** The finalized payslip for the month of the last working day, when there is one. */
  finalPayslip: { periodCode: string; gross: string; net: string } | null;
}

export interface CalculatedLine {
  kind: 'EARNING' | 'RECOVERY';
  code: SettlementComponent;
  label: string;
  amount: Prisma.Decimal;
  countsInTotal: boolean;
  basis: Record<string, unknown>;
}

export interface SettlementCalculation {
  lines: CalculatedLine[];
  /** What must be resolved before the settlement can be submitted. */
  problems: string[];
}

/** Completed years and leftover months of service, counting whole calendar months. */
export function serviceLength(from: string, to: string) {
  const [fy, fm, fd] = from.split('-').map(Number);
  // Service runs to the end of the last day, so count up to the day after it: 1 Jan to 31 Dec is a full year.
  const end = new Date(`${to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const [ty, tm, td] = [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()];
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1;
  return { years: Math.floor(months / 12), months: months % 12 };
}

export function calculateSettlement(input: SettlementInputs, policy: SettlementPolicy): SettlementCalculation {
  const lines: CalculatedLine[] = [];
  const problems: string[] = [];
  const salary = input.monthlySalary;
  const component = (codes: string[]) => codes.reduce((sum, code) => sum.add(D(salary?.components[code] ?? 0)), D(0));
  const basisAmount = (basis: SalaryBasis) => (basis === 'GROSS' ? D(salary?.gross ?? 0) : component(['BASIC']));
  if (!salary) problems.push('No salary is assigned on the last working day, so salary-based amounts can’t be worked out.');

  // Paid through payroll; shown so the settlement reconciles with it, never paid again.
  lines.push({
    kind: 'EARNING', code: 'FINAL_SALARY', label: 'Final month salary (paid through payroll)', countsInTotal: false,
    amount: input.finalPayslip ? D(input.finalPayslip.net) : D(0),
    basis: input.finalPayslip
      ? { rule: 'Net pay on the finalized payslip for the month of the last working day', period: input.finalPayslip.periodCode, gross: input.finalPayslip.gross, net: input.finalPayslip.net }
      : { rule: 'Payroll for the month of the last working day is not finalized yet' },
  });
  if (!input.finalPayslip) problems.push(`Finalize payroll for ${input.lastWorkingDate.slice(0, 7)} first, so the final salary and that month’s loan instalments are settled once, through payroll.`);

  if (policy.leaveEncashment.enabled) {
    const perDay = basisAmount(policy.leaveEncashment.basis).div(policy.leaveEncashment.dayDivisor);
    for (const leave of input.leave.filter((l) => l.encashable && D(l.balanceDays).gt(0))) {
      lines.push({
        kind: 'EARNING', code: 'LEAVE_ENCASHMENT', label: `Leave encashment: ${leave.name}`, countsInTotal: true,
        amount: money(perDay.times(leave.balanceDays)),
        basis: { rule: `${policy.leaveEncashment.basis === 'GROSS' ? 'Gross' : 'Basic'} ÷ ${policy.leaveEncashment.dayDivisor} × days`, leaveTypeId: leave.leaveTypeId, days: leave.balanceDays, perDay: money(perDay).toFixed(2), balanceAsOf: leave.asOf },
      });
    }
  }

  const service = serviceLength(input.joiningDate, input.lastWorkingDate);
  if (policy.gratuity.enabled) {
    const countedYears = service.years + (service.months >= policy.gratuity.roundUpMonths ? 1 : 0);
    const eligible = service.years >= policy.gratuity.minimumYears;
    const wages = component(policy.gratuity.componentCodes);
    let amount = eligible ? wages.times(policy.gratuity.daysPerYear).div(policy.gratuity.dayDivisor).times(countedYears) : D(0);
    const capped = policy.gratuity.cap !== null && amount.gt(policy.gratuity.cap);
    if (capped) amount = D(policy.gratuity.cap!);
    lines.push({
      kind: 'EARNING', code: 'GRATUITY', label: 'Gratuity', countsInTotal: true, amount: money(amount),
      basis: {
        rule: `${policy.gratuity.componentCodes.join(' + ')} × ${policy.gratuity.daysPerYear} ÷ ${policy.gratuity.dayDivisor} × years`,
        eligible, service: `${service.years} years ${service.months} months`, countedYears, monthlyWages: money(wages).toFixed(2),
        ...(eligible ? {} : { reason: `Needs ${policy.gratuity.minimumYears} completed years of service` }),
        ...(capped ? { cappedAt: policy.gratuity.cap } : {}),
      },
    });
  }

  if (input.notice.shortfallDays > 0) {
    const perDay = basisAmount(policy.notice.basis).div(policy.notice.dayDivisor);
    const amount = money(perDay.times(input.notice.shortfallDays));
    const rule = `${policy.notice.basis === 'GROSS' ? 'Gross' : 'Basic'} ÷ ${policy.notice.dayDivisor} × ${input.notice.shortfallDays} days`;
    if (input.notice.decision === null) problems.push('Decide whether the notice shortfall is recovered or waived.');
    else if (input.notice.decision === 'WAIVE') {
      // Shown at nil so the waiver is on the statement.
      lines.push({ kind: input.separationType === 'RESIGNATION' ? 'RECOVERY' : 'EARNING', code: input.separationType === 'RESIGNATION' ? 'NOTICE_RECOVERY' : 'NOTICE_PAY', label: 'Notice shortfall (waived)', countsInTotal: true, amount: D(0), basis: { rule, waived: true, days: input.notice.shortfallDays } });
    } else if (input.separationType === 'RESIGNATION') {
      lines.push({ kind: 'RECOVERY', code: 'NOTICE_RECOVERY', label: 'Notice period recovery', countsInTotal: true, amount, basis: { rule, days: input.notice.shortfallDays, perDay: money(perDay).toFixed(2) } });
    } else {
      // The company ended the employment at short notice, so it pays for the days.
      lines.push({ kind: 'EARNING', code: 'NOTICE_PAY', label: 'Notice pay in lieu', countsInTotal: true, amount, basis: { rule, days: input.notice.shortfallDays, perDay: money(perDay).toFixed(2) } });
    }
  }

  for (const loan of input.loans) {
    lines.push({
      kind: 'RECOVERY', code: loan.type === 'ADVANCE' ? 'ADVANCE_RECOVERY' : 'LOAN_RECOVERY', label: `${loan.type === 'ADVANCE' ? 'Advance' : 'Loan'} recovery: ${loan.number}`,
      countsInTotal: true, amount: money(D(loan.outstanding)),
      basis: { rule: 'Instalments not yet recovered', loanId: loan.loanId, outstanding: loan.outstanding, installmentIds: loan.installmentIds },
    });
  }

  return { lines, problems };
}

/** Totals of the lines that count; net is negative when the employee owes the company. */
export function settlementTotals(lines: { kind: string; amount: Prisma.Decimal.Value; countsInTotal: boolean }[]) {
  const sum = (kind: string) => lines.filter((l) => l.countsInTotal && l.kind === kind).reduce((t, l) => t.add(D(l.amount)), D(0));
  const earnings = sum('EARNING');
  const recoveries = sum('RECOVERY');
  return { earnings, recoveries, net: earnings.minus(recoveries) };
}
