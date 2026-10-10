import { Prisma } from '@prisma/client';
import { defaultPolicyConfig, PayrollPolicyConfig, PenaltyRule } from '../policies/policy-config';
import { OvertimeDay, overtimePay, penaltyDeduction } from './adjustments';

const D = (v: string | number) => new Prisma.Decimal(v);
const policy = (overtime: Partial<PayrollPolicyConfig['overtime']> = {}): PayrollPolicyConfig => {
  const p = defaultPolicyConfig();
  p.overtime = { ...p.overtime, enabled: true, ...overtime };
  return p;
};
const day = (date: string, recordedMinutes: number, approvedMinutes: number | null = recordedMinutes, dayType: OvertimeDay['dayType'] = 'WORKING'): OvertimeDay =>
  ({ date, dayType, recordedMinutes, approvedMinutes, approvedAgainstMinutes: approvedMinutes === null ? null : recordedMinutes });

describe('overtime pay', () => {
  it('pays approved overtime at the day type’s rate, after the minimum and rounding', () => {
    // 1.5× on working days, 2× on weekly offs; blocks of 15 minutes rounded down; at least 30 minutes.
    const r = overtimePay([day('2026-09-01', 70), day('2026-09-06', 120, 120, 'WEEKLY_OFF'), day('2026-09-02', 20)], policy(), D(100));
    expect(r.paidMinutes).toBe(60 + 120);
    expect(r.amount.toFixed(2)).toBe('550.00'); // 1 h × 100 × 1.5 + 2 h × 100 × 2
    expect(r.steps).toEqual(['2026-09-01 (working day): 60 min × hourly rate 100 × 1.5 = 150.00', '2026-09-06 (weekly off): 120 min × hourly rate 100 × 2 = 400.00']);
  });

  it('pays nothing without approval when approval is required, and reports what waits', () => {
    const r = overtimePay([day('2026-09-01', 60, null), day('2026-09-02', 60)], policy(), D(100));
    expect([r.paidMinutes, r.awaitingApproval]).toEqual([60, ['2026-09-01']]);
    const changed = overtimePay([{ ...day('2026-09-03', 90), approvedAgainstMinutes: 60 }], policy(), D(100));
    expect([changed.paidMinutes, changed.changedSinceApproval]).toEqual([0, ['2026-09-03']]);
    expect(overtimePay([day('2026-09-01', 60, null)], policy({ requiresApproval: false }), D(100)).paidMinutes).toBe(60);
  });

  it('pays no more than approved, or than the daily and monthly caps', () => {
    expect(overtimePay([day('2026-09-01', 120, 45)], policy(), D(100)).paidMinutes).toBe(45);
    const capped = overtimePay([day('2026-09-01', 240), day('2026-09-02', 240)], policy({ dailyCapMinutes: 180, monthlyCapMinutes: 300 }), D(100));
    expect(capped.paidMinutes).toBe(300);
    expect(capped.steps[capped.steps.length - 1]).toBe('Limited to the policy’s 300 minutes a month');
  });
});

const rule = (extra: Partial<PenaltyRule> = {}): PenaltyRule => ({ enabled: true, graceMinutes: 10, freeOccurrences: 0, bands: [], repeated: null, monthlyCapAmount: null, ...extra });

describe('late and early deductions', () => {
  it('ignores the grace period and free occurrences, then charges by band', () => {
    const r = penaltyDeduction(rule({
      freeOccurrences: 1,
      bands: [
        { fromMinute: 11, toMinute: 30, action: 'FIXED_AMOUNT', amount: '100', dayFraction: null },
        { fromMinute: 31, toMinute: 60, action: 'PER_MINUTE', amount: '5', dayFraction: null },
        { fromMinute: 61, toMinute: null, action: 'DAY_FRACTION', amount: null, dayFraction: '0.5' },
      ],
    }), [{ date: '2026-09-01', minutes: 8 }, { date: '2026-09-02', minutes: 20 }, { date: '2026-09-03', minutes: 20 }, { date: '2026-09-04', minutes: 40 }, { date: '2026-09-05', minutes: 90 }], D(1000), 'late');
    expect(r.occurrences).toBe(4);
    expect(r.amount.toFixed(2)).toBe('800.00'); // free, 100, 40 × 5, 0.5 × 1000
    expect(r.steps[0]).toBe('2026-09-02: 20 min late, one of 1 free time a month');
  });

  it('deducts part of a day for every N times, within the monthly cap', () => {
    const late = Array.from({ length: 6 }, (_, i) => ({ date: `2026-09-0${i + 1}`, minutes: 15 }));
    const r = penaltyDeduction(rule({ bands: [{ fromMinute: 11, toMinute: null, action: 'WARNING', amount: null, dayFraction: null }], repeated: { everyOccurrences: 3, dayFraction: '0.5' } }), late, D(1000), 'late');
    expect(r.amount.toFixed(2)).toBe('1000.00');
    expect(r.steps).toContain('3 times late: 0.5 × daily rate 1000 = 500.00');
    expect(penaltyDeduction(rule({ repeated: { everyOccurrences: 3, dayFraction: '0.5' }, monthlyCapAmount: '600' }), late, D(1000), 'early').amount.toFixed(2)).toBe('600.00');
  });

  it('deducts nothing when the rule is off', () => {
    expect(penaltyDeduction(rule({ enabled: false }), [{ date: '2026-09-01', minutes: 200 }], D(1000), 'late').amount.toFixed()).toBe('0');
  });
});
