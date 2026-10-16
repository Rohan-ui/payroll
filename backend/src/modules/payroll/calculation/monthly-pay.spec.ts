import { Prisma } from '@prisma/client';
import { defaultPolicyConfig } from '../policies/policy-config';
import { calculateStructure, checkStructure, prorationShare, StructureLine } from '@/modules/salary/formula/structure-engine';
import { DayRecord, eachDay, summarizeAttendance } from './attendance-summary';

/**
 * A monthly salary is divided by the days in the month, and weekly offs and
 * holidays are paid: only absences, unpaid leave and unpaid half days reduce it.
 * August 2026: 31 days, Sundays 2, 9, 16, 23 and 30; one half day.
 */
const D = (v: string | number) => new Prisma.Decimal(v);
const records = (sundayStatus: string) => new Map<string, DayRecord>(eachDay('2026-08-01', '2026-08-31').map((date) => {
  const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  const status = sunday ? sundayStatus : date === '2026-08-12' ? 'HALF_DAY' : 'PRESENT';
  return [date, { date, status, workedMinutes: 0, payableMinutes: 0, lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0, approvalStatus: 'NOT_REQUIRED' }];
}));
const summary = (sundayStatus: string) => summarizeAttendance({
  periodStart: '2026-08-01', periodEnd: '2026-08-31', windowStart: '2026-08-01', windowEnd: '2026-08-31', hireDate: null, exitDate: null,
  payBasis: 'MONTHLY', policy: defaultPolicyConfig(), holidays: new Set(), records: records(sundayStatus), today: '2026-10-10',
});
const pay = (formula: string, isProrated: boolean, s: ReturnType<typeof summary>) => {
  const lines: StructureLine[] = [{
    code: 'GROSS_SALARY', name: 'Gross salary', category: 'EARNING', calculationType: 'FORMULA', amount: null, percentage: null, percentageBase: null, formula,
    isProrated, includeInGross: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP',
  }];
  const variables = {
    MONTHLY_SALARY: D(22000), CALENDAR_DAYS: D(s.calendarDays), DIVISOR: D(s.calendarDays),
    PAID_DAYS: s.paidDays, PRESENT_DAYS: s.presentDays, PRORATION: prorationShare(D(s.calendarDays), s.unpaidDays),
  };
  return calculateStructure(lines, checkStructure(lines), { variables, overrides: {}, provided: {} }).lines[0].amount.toFixed(2);
};

describe('a monthly salary in August 2026', () => {
  it('pays the Sundays: ₹22,000 × 30.5 paid days ÷ 31', () => {
    const s = summary('WEEKEND');
    expect([s.presentDays.toFixed(), s.weeklyOffs, s.paidDays.toFixed(), s.unpaidDays.toFixed()]).toEqual(['25.5', 5, '30.5', '0.5']);
    // The imported structure: the whole salary, in proportion to paid days.
    expect(pay('MONTHLY_SALARY', true, s)).toBe('21645.16');
    // The same with a formula on paid days.
    expect(pay('MONTHLY_SALARY / CALENDAR_DAYS * PAID_DAYS', false, s)).toBe('21645.16');
  });

  it('pays only worked days if a formula uses PRESENT_DAYS: the ₹18,097 seen', () => {
    expect(pay('MONTHLY_SALARY / CALENDAR_DAYS * PRESENT_DAYS', false, summary('WEEKEND'))).toBe('18096.77');
  });

  it('holds pay while Sundays carry a status payroll doesn’t know, instead of guessing', () => {
    expect(summary('WEEK_OFF').exceptions[0]).toMatch(/status payroll doesn’t know: 2026-08-02 \(WEEK_OFF\)/);
  });
});
