/**
 * A payroll policy's rules: how days, hours, overtime, late arrival and early
 * departure turn into pay. Stored as JSON on each policy version, and only
 * ever in the shape this file accepts: a version is checked here before it is
 * saved, and unknown or ill-typed settings are refused rather than ignored.
 * Amounts and fractions are decimal strings, never binary floating point.
 */

export const POLICY_SCHEMA_VERSION = 1;

export const DIVISOR_METHODS = ['CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_DAYS'] as const;
export const MISSING_ATTENDANCE = ['EXCEPTION', 'UNPAID'] as const;
export const OVERTIME_ROUNDING = ['DOWN', 'NEAREST', 'UP'] as const;
export const PENALTY_ACTIONS = ['WARNING', 'FIXED_AMOUNT', 'PER_MINUTE', 'DAY_FRACTION'] as const;
export const NET_ROUNDING = ['HALF_UP', 'UP', 'DOWN'] as const;

export interface PenaltyBand {
  /** Minutes late (or early) from which this band applies, inclusive. */
  fromMinute: number;
  /** Up to and including this minute; null for no upper limit. */
  toMinute: number | null;
  action: (typeof PENALTY_ACTIONS)[number];
  /** FIXED_AMOUNT: per occurrence; PER_MINUTE: per minute. */
  amount: string | null;
  /** DAY_FRACTION: the share of a day's pay deducted, such as "0.5". */
  dayFraction: string | null;
}

export interface PenaltyRule {
  enabled: boolean;
  /** Being this many minutes late (or early) or less is not counted at all. */
  graceMinutes: number;
  /** Counted occurrences in a month that carry no penalty. */
  freeOccurrences: number;
  bands: PenaltyBand[];
  /** Every N counted occurrences (after the free ones) also deducts this share of a day. */
  repeated: { everyOccurrences: number; dayFraction: string } | null;
  /** The most this rule can deduct in a month; null for no limit. */
  monthlyCapAmount: string | null;
}

export interface PayrollPolicyConfig {
  schemaVersion: typeof POLICY_SCHEMA_VERSION;
  payFrequency: 'MONTHLY';
  /** Days of the week that are off (0 = Sunday … 6 = Saturday), used where no shift says otherwise. */
  weeklyOffDays: number[];
  /** What a monthly salary is divided by to give a day's pay. */
  divisor: { method: (typeof DIVISOR_METHODS)[number]; fixedDays: number | null };
  /** Standard hours in a working day, for an hourly rate from a daily or monthly one. */
  hoursPerDay: string;
  attendance: {
    /** Share of a day paid for a half day. */
    halfDayValue: string;
    /** Whether weekly offs and holidays are paid to people paid by the day. */
    weeklyOffsPaidForDaily: boolean;
    holidaysPaidForDaily: boolean;
    /**
     * A working day with no attendance record: EXCEPTION holds the employee's
     * pay for review; UNPAID counts the day unpaid, and still reports it.
     */
    missingAttendance: (typeof MISSING_ATTENDANCE)[number];
    /** Only approved attendance is paid; anything else is an exception. */
    requireApprovedAttendance: boolean;
  };
  overtime: {
    enabled: boolean;
    requiresApproval: boolean;
    /** Overtime shorter than this on a day is not paid. */
    minimumMinutes: number;
    /** Overtime is rounded to blocks of this many minutes (1 = no rounding). */
    roundToMinutes: number;
    roundingMode: (typeof OVERTIME_ROUNDING)[number];
    dailyCapMinutes: number | null;
    monthlyCapMinutes: number | null;
    /** Multiples of the hourly rate. */
    multipliers: { workingDay: string; weeklyOff: string; holiday: string };
  };
  lateArrival: PenaltyRule;
  earlyDeparture: PenaltyRule;
  rounding: { netPayScale: 0 | 1 | 2; netPayMode: (typeof NET_ROUNDING)[number] };
}

const noPenalty = (): PenaltyRule => ({ enabled: false, graceMinutes: 0, freeOccurrences: 0, bands: [], repeated: null, monthlyCapAmount: null });

/** A starting point for a new policy: nothing is deducted and no overtime is paid until someone sets it. */
export function defaultPolicyConfig(): PayrollPolicyConfig {
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    payFrequency: 'MONTHLY',
    weeklyOffDays: [0],
    divisor: { method: 'CALENDAR_DAYS', fixedDays: null },
    hoursPerDay: '8',
    attendance: { halfDayValue: '0.5', weeklyOffsPaidForDaily: false, holidaysPaidForDaily: true, missingAttendance: 'EXCEPTION', requireApprovedAttendance: false },
    overtime: { enabled: false, requiresApproval: true, minimumMinutes: 30, roundToMinutes: 15, roundingMode: 'DOWN', dailyCapMinutes: null, monthlyCapMinutes: null, multipliers: { workingDay: '1.5', weeklyOff: '2', holiday: '2' } },
    lateArrival: noPenalty(),
    earlyDeparture: noPenalty(),
    rounding: { netPayScale: 0, netPayMode: 'HALF_UP' },
  };
}

export interface PolicyProblem {
  path: string;
  message: string;
}

const DECIMAL = /^\d{1,12}(\.\d{1,4})?$/;
const MINUTES_IN_DAY = 24 * 60;

/**
 * Checks a policy's rules. Returns the config exactly as accepted (a fresh
 * object holding only known settings), or every problem found, by path.
 */
export function validatePolicyConfig(input: unknown): { config: PayrollPolicyConfig } | { problems: PolicyProblem[] } {
  const problems: PolicyProblem[] = [];
  const fail = (path: string, message: string) => { problems.push({ path, message }); return undefined; };

  const object = (v: unknown, path: string, keys: string[]): Record<string, unknown> | undefined => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail(path, 'Must be a group of settings.');
    for (const k of Object.keys(v)) if (!keys.includes(k)) fail(`${path}.${k}`, 'Is not a policy setting.');
    return v as Record<string, unknown>;
  };
  const bool = (v: unknown, path: string) => (typeof v === 'boolean' ? v : fail(path, 'Must be yes or no.'));
  const int = (v: unknown, path: string, min: number, max: number) =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max ? (v as number) : fail(path, `Must be a whole number from ${min} to ${max}.`);
  const intOrNull = (v: unknown, path: string, min: number, max: number) => (v === null ? null : int(v, path, min, max));
  const oneOf = <T extends string>(v: unknown, path: string, options: readonly T[]) =>
    options.includes(v as T) ? (v as T) : fail(path, `Must be one of ${options.join(', ')}.`);
  // Decimals are strings so they are never rounded by binary floating point.
  const decimal = (v: unknown, path: string, opts: { positive?: boolean; max?: number } = {}) => {
    if (typeof v !== 'string' || !DECIMAL.test(v)) return fail(path, 'Must be a number such as 1.5 (up to 4 decimal places, not negative).');
    const n = Number(v);
    if (opts.positive && n <= 0) return fail(path, 'Must be more than zero.');
    if (opts.max !== undefined && n > opts.max) return fail(path, `Must be at most ${opts.max}.`);
    return v;
  };
  const decimalOrNull = (v: unknown, path: string, opts: { positive?: boolean; max?: number } = {}) => (v === null ? null : decimal(v, path, opts));

  const penalty = (v: unknown, path: string): PenaltyRule | undefined => {
    const o = object(v, path, ['enabled', 'graceMinutes', 'freeOccurrences', 'bands', 'repeated', 'monthlyCapAmount']);
    if (!o) return undefined;
    const rule = {
      enabled: bool(o.enabled, `${path}.enabled`),
      graceMinutes: int(o.graceMinutes, `${path}.graceMinutes`, 0, 240),
      freeOccurrences: int(o.freeOccurrences, `${path}.freeOccurrences`, 0, 31),
      bands: [] as PenaltyBand[],
      repeated: null as PenaltyRule['repeated'],
      monthlyCapAmount: decimalOrNull(o.monthlyCapAmount, `${path}.monthlyCapAmount`),
    };
    if (!Array.isArray(o.bands)) fail(`${path}.bands`, 'Must be a list of bands.');
    else if (o.bands.length > 10) fail(`${path}.bands`, 'At most 10 bands.');
    else {
      o.bands.forEach((b, i) => {
        const bp = `${path}.bands[${i}]`;
        const band = object(b, bp, ['fromMinute', 'toMinute', 'action', 'amount', 'dayFraction']);
        if (!band) return;
        const action = oneOf(band.action, `${bp}.action`, PENALTY_ACTIONS);
        const parsed: PenaltyBand = {
          fromMinute: int(band.fromMinute, `${bp}.fromMinute`, 1, MINUTES_IN_DAY) ?? 0,
          toMinute: intOrNull(band.toMinute, `${bp}.toMinute`, 1, MINUTES_IN_DAY) ?? null,
          action: action ?? 'WARNING',
          amount: null,
          dayFraction: null,
        };
        if (action === 'FIXED_AMOUNT' || action === 'PER_MINUTE') parsed.amount = decimal(band.amount, `${bp}.amount`, { positive: true }) ?? null;
        else if (band.amount !== null && band.amount !== undefined) fail(`${bp}.amount`, 'Only fixed-amount and per-minute bands have an amount.');
        if (action === 'DAY_FRACTION') parsed.dayFraction = decimal(band.dayFraction, `${bp}.dayFraction`, { positive: true, max: 1 }) ?? null;
        else if (band.dayFraction !== null && band.dayFraction !== undefined) fail(`${bp}.dayFraction`, 'Only day-fraction bands deduct part of a day.');
        if (parsed.toMinute !== null && parsed.toMinute < parsed.fromMinute) fail(`${bp}.toMinute`, 'Must not be before the band’s first minute.');
        if (rule.graceMinutes !== undefined && parsed.fromMinute <= rule.graceMinutes) fail(`${bp}.fromMinute`, `Must be after the ${rule.graceMinutes}-minute grace period.`);
        const previous = rule.bands[rule.bands.length - 1];
        if (previous && (previous.toMinute === null || parsed.fromMinute <= previous.toMinute)) fail(`${bp}.fromMinute`, 'Bands must be in order and must not overlap.');
        rule.bands.push(parsed);
      });
    }
    if (o.repeated !== null) {
      const r = object(o.repeated, `${path}.repeated`, ['everyOccurrences', 'dayFraction']);
      if (r) {
        const every = int(r.everyOccurrences, `${path}.repeated.everyOccurrences`, 1, 31);
        const fraction = decimal(r.dayFraction, `${path}.repeated.dayFraction`, { positive: true, max: 1 });
        if (every !== undefined && fraction !== undefined) rule.repeated = { everyOccurrences: every, dayFraction: fraction };
      }
    }
    if (rule.enabled && rule.bands.length === 0 && !rule.repeated) fail(`${path}.bands`, 'An enabled rule needs at least one band or a repeated-occurrence deduction.');
    return rule as PenaltyRule;
  };

  const root = object(input, 'policy', ['schemaVersion', 'payFrequency', 'weeklyOffDays', 'divisor', 'hoursPerDay', 'attendance', 'overtime', 'lateArrival', 'earlyDeparture', 'rounding']);
  if (!root) return { problems };
  if (root.schemaVersion !== POLICY_SCHEMA_VERSION) fail('policy.schemaVersion', `Must be ${POLICY_SCHEMA_VERSION}.`);
  const payFrequency = oneOf(root.payFrequency, 'policy.payFrequency', ['MONTHLY'] as const);

  let weeklyOffDays: number[] = [];
  if (!Array.isArray(root.weeklyOffDays) || root.weeklyOffDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) fail('policy.weeklyOffDays', 'Must be a list of days of the week, 0 (Sunday) to 6 (Saturday).');
  else {
    weeklyOffDays = [...new Set(root.weeklyOffDays as number[])].sort((x, y) => x - y);
    if (weeklyOffDays.length > 6) fail('policy.weeklyOffDays', 'At least one day of the week must be a working day.');
  }

  const d = object(root.divisor, 'policy.divisor', ['method', 'fixedDays']);
  const divisor = d && { method: oneOf(d.method, 'policy.divisor.method', DIVISOR_METHODS), fixedDays: null as number | null };
  if (d && divisor) {
    if (divisor.method === 'FIXED_DAYS') divisor.fixedDays = int(d.fixedDays, 'policy.divisor.fixedDays', 1, 31) ?? null;
    else if (d.fixedDays !== null && d.fixedDays !== undefined) fail('policy.divisor.fixedDays', 'Only a fixed-days divisor has a number of days.');
  }

  const hoursPerDay = decimal(root.hoursPerDay, 'policy.hoursPerDay', { positive: true, max: 24 });

  const a = object(root.attendance, 'policy.attendance', ['halfDayValue', 'weeklyOffsPaidForDaily', 'holidaysPaidForDaily', 'missingAttendance', 'requireApprovedAttendance']);
  const attendance = a && {
    halfDayValue: decimal(a.halfDayValue, 'policy.attendance.halfDayValue', { positive: true, max: 1 }),
    weeklyOffsPaidForDaily: bool(a.weeklyOffsPaidForDaily, 'policy.attendance.weeklyOffsPaidForDaily'),
    holidaysPaidForDaily: bool(a.holidaysPaidForDaily, 'policy.attendance.holidaysPaidForDaily'),
    missingAttendance: oneOf(a.missingAttendance, 'policy.attendance.missingAttendance', MISSING_ATTENDANCE),
    requireApprovedAttendance: bool(a.requireApprovedAttendance, 'policy.attendance.requireApprovedAttendance'),
  };

  const ot = object(root.overtime, 'policy.overtime', ['enabled', 'requiresApproval', 'minimumMinutes', 'roundToMinutes', 'roundingMode', 'dailyCapMinutes', 'monthlyCapMinutes', 'multipliers']);
  const m = ot && object(ot.multipliers, 'policy.overtime.multipliers', ['workingDay', 'weeklyOff', 'holiday']);
  const overtime = ot && {
    enabled: bool(ot.enabled, 'policy.overtime.enabled'),
    requiresApproval: bool(ot.requiresApproval, 'policy.overtime.requiresApproval'),
    minimumMinutes: int(ot.minimumMinutes, 'policy.overtime.minimumMinutes', 0, MINUTES_IN_DAY),
    roundToMinutes: int(ot.roundToMinutes, 'policy.overtime.roundToMinutes', 1, 120),
    roundingMode: oneOf(ot.roundingMode, 'policy.overtime.roundingMode', OVERTIME_ROUNDING),
    dailyCapMinutes: intOrNull(ot.dailyCapMinutes, 'policy.overtime.dailyCapMinutes', 1, MINUTES_IN_DAY),
    monthlyCapMinutes: intOrNull(ot.monthlyCapMinutes, 'policy.overtime.monthlyCapMinutes', 1, 31 * MINUTES_IN_DAY),
    multipliers: m && {
      workingDay: decimal(m.workingDay, 'policy.overtime.multipliers.workingDay', { positive: true, max: 10 }),
      weeklyOff: decimal(m.weeklyOff, 'policy.overtime.multipliers.weeklyOff', { positive: true, max: 10 }),
      holiday: decimal(m.holiday, 'policy.overtime.multipliers.holiday', { positive: true, max: 10 }),
    },
  };

  const lateArrival = penalty(root.lateArrival, 'policy.lateArrival');
  const earlyDeparture = penalty(root.earlyDeparture, 'policy.earlyDeparture');

  const r = object(root.rounding, 'policy.rounding', ['netPayScale', 'netPayMode']);
  const rounding = r && { netPayScale: int(r.netPayScale, 'policy.rounding.netPayScale', 0, 2), netPayMode: oneOf(r.netPayMode, 'policy.rounding.netPayMode', NET_ROUNDING) };

  if (problems.length) return { problems };
  return {
    config: { schemaVersion: POLICY_SCHEMA_VERSION, payFrequency, weeklyOffDays, divisor, hoursPerDay, attendance, overtime, lateArrival, earlyDeparture, rounding } as PayrollPolicyConfig,
  };
}
