import { defaultPolicyConfig, PayrollPolicyConfig, validatePolicyConfig } from './policy-config';

const withChanges = (change: (c: Record<string, any>) => void) => {
  const c = JSON.parse(JSON.stringify(defaultPolicyConfig()));
  change(c);
  return validatePolicyConfig(c);
};
const problemsOf = (result: ReturnType<typeof validatePolicyConfig>) => ('problems' in result ? result.problems.map((p) => p.path) : []);

describe('payroll policy rules', () => {
  it('accepts the starting policy as it is', () => {
    expect(validatePolicyConfig(defaultPolicyConfig())).toEqual({ config: defaultPolicyConfig() });
  });

  it('accepts a fully configured policy', () => {
    const result = withChanges((c) => {
      c.weeklyOffDays = [6, 0, 0];
      c.divisor = { method: 'FIXED_DAYS', fixedDays: 26 };
      c.overtime.enabled = true;
      c.overtime.monthlyCapMinutes = 3000;
      c.lateArrival = {
        enabled: true, graceMinutes: 10, freeOccurrences: 2, monthlyCapAmount: '2000',
        bands: [
          { fromMinute: 11, toMinute: 30, action: 'WARNING', amount: null, dayFraction: null },
          { fromMinute: 31, toMinute: 60, action: 'FIXED_AMOUNT', amount: '100', dayFraction: null },
          { fromMinute: 61, toMinute: null, action: 'DAY_FRACTION', amount: null, dayFraction: '0.5' },
        ],
        repeated: { everyOccurrences: 3, dayFraction: '0.5' },
      };
    });
    expect('config' in result).toBe(true);
    const config = (result as { config: PayrollPolicyConfig }).config;
    expect(config.weeklyOffDays).toEqual([0, 6]);
    expect(config.lateArrival.bands).toHaveLength(3);
  });

  it('refuses settings it does not know rather than ignoring them', () => {
    expect(problemsOf(withChanges((c) => { c.script = 'alert(1)'; }))).toEqual(['policy.script']);
    expect(problemsOf(withChanges((c) => { c.overtime.bonus = true; }))).toEqual(['policy.overtime.bonus']);
  });

  it('refuses numbers as binary floats, negative amounts and out-of-range values', () => {
    expect(problemsOf(withChanges((c) => { c.hoursPerDay = 8; }))).toEqual(['policy.hoursPerDay']);
    expect(problemsOf(withChanges((c) => { c.hoursPerDay = '-8'; }))).toEqual(['policy.hoursPerDay']);
    expect(problemsOf(withChanges((c) => { c.hoursPerDay = '25'; }))).toEqual(['policy.hoursPerDay']);
    expect(problemsOf(withChanges((c) => { c.attendance.halfDayValue = '0'; }))).toEqual(['policy.attendance.halfDayValue']);
    expect(problemsOf(withChanges((c) => { c.overtime.multipliers.holiday = '1e3'; }))).toEqual(['policy.overtime.multipliers.holiday']);
    expect(problemsOf(withChanges((c) => { c.overtime.roundToMinutes = 0; }))).toEqual(['policy.overtime.roundToMinutes']);
    expect(problemsOf(withChanges((c) => { c.weeklyOffDays = [0, 1, 2, 3, 4, 5, 6]; }))).toEqual(['policy.weeklyOffDays']);
    expect(problemsOf(withChanges((c) => { c.weeklyOffDays = [7]; }))).toEqual(['policy.weeklyOffDays']);
  });

  it('needs a number of days for a fixed divisor, and only then', () => {
    expect(problemsOf(withChanges((c) => { c.divisor = { method: 'FIXED_DAYS', fixedDays: null }; }))).toEqual(['policy.divisor.fixedDays']);
    expect(problemsOf(withChanges((c) => { c.divisor = { method: 'WORKING_DAYS', fixedDays: 26 }; }))).toEqual(['policy.divisor.fixedDays']);
  });

  it('checks penalty bands are ordered, after the grace period, and have what their action needs', () => {
    const band = (fromMinute: number, toMinute: number | null, extra: object = {}) => ({ fromMinute, toMinute, action: 'WARNING', amount: null, dayFraction: null, ...extra });
    const late = (bands: object[], graceMinutes = 10) => withChanges((c) => { c.lateArrival = { ...c.lateArrival, enabled: true, graceMinutes, bands }; });
    expect(problemsOf(late([band(5, 20)]))).toEqual(['policy.lateArrival.bands[0].fromMinute']);
    expect(problemsOf(late([band(11, 30), band(25, 40)]))).toEqual(['policy.lateArrival.bands[1].fromMinute']);
    expect(problemsOf(late([band(11, null), band(40, 50)]))).toEqual(['policy.lateArrival.bands[1].fromMinute']);
    expect(problemsOf(late([band(30, 20)]))).toEqual(['policy.lateArrival.bands[0].toMinute']);
    expect(problemsOf(late([band(11, null, { action: 'FIXED_AMOUNT' })]))).toEqual(['policy.lateArrival.bands[0].amount']);
    expect(problemsOf(late([band(11, null, { action: 'DAY_FRACTION', dayFraction: '1.5' })]))).toEqual(['policy.lateArrival.bands[0].dayFraction']);
    expect(problemsOf(late([band(11, null, { amount: '5' })]))).toEqual(['policy.lateArrival.bands[0].amount']);
    expect(problemsOf(late([]))).toEqual(['policy.lateArrival.bands']);
  });

  it('reports every problem at once', () => {
    expect(problemsOf(withChanges((c) => { c.hoursPerDay = 'x'; c.rounding.netPayScale = 5; c.schemaVersion = 2; })).sort()).toEqual(['policy.hoursPerDay', 'policy.rounding.netPayScale', 'policy.schemaVersion']);
    expect(problemsOf(validatePolicyConfig(null))).toEqual(['policy']);
  });
});
