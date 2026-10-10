import { defaultPolicyConfig, PayrollPolicyConfig } from '../policies/policy-config';
import { DayRecord, eachDay, summarizeAttendance, SummaryInput } from './attendance-summary';

// September 2026: 30 days, Sundays on the 6th, 13th, 20th and 27th.
const record = (date: string, status: string, extra: Partial<DayRecord> = {}): DayRecord => ({
  date, status, workedMinutes: status === 'PRESENT' ? 480 : status === 'HALF_DAY' ? 240 : 0, payableMinutes: status === 'PRESENT' ? 480 : status === 'HALF_DAY' ? 240 : 0,
  lateMinutes: 0, earlyMinutes: 0, overtimeMinutes: 0, approvalStatus: 'NOT_REQUIRED', ...extra,
});
const fullMonth = () => new Map(eachDay('2026-09-01', '2026-09-30').map((d) => [d, record(d, new Date(`${d}T00:00:00Z`).getUTCDay() === 0 ? 'WEEKEND' : 'PRESENT')]));
const input = (extra: Partial<SummaryInput> = {}, policy: Partial<PayrollPolicyConfig> = {}): SummaryInput => ({
  periodStart: '2026-09-01', periodEnd: '2026-09-30', windowStart: '2026-09-01', windowEnd: '2026-09-30', hireDate: null, exitDate: null,
  payBasis: 'MONTHLY', policy: { ...defaultPolicyConfig(), ...policy }, holidays: new Set(), records: fullMonth(), today: '2026-10-09', ...extra,
});
const count = (s: ReturnType<typeof summarizeAttendance>) => ({ paid: s.paidDays.toFixed(), unpaid: s.unpaidDays.toFixed(), present: s.presentDays.toFixed(), working: s.workingDays });

describe('attendance summary', () => {
  it('counts a full month: 26 working days, 4 weekly offs, nothing unpaid', () => {
    const s = summarizeAttendance(input());
    expect(count(s)).toEqual({ paid: '30', unpaid: '0', present: '26', working: 26 });
    expect([s.weeklyOffs, s.exceptions, s.payableMinutes]).toEqual([4, [], 26 * 480]);
  });

  it('counts absences, unpaid leave and half days as unpaid, and paid leave as paid', () => {
    const records = fullMonth();
    records.set('2026-09-02', record('2026-09-02', 'ABSENT'));
    records.set('2026-09-03', record('2026-09-03', 'UNPAID_LEAVE'));
    records.set('2026-09-04', record('2026-09-04', 'HALF_DAY'));
    records.set('2026-09-05', record('2026-09-05', 'PAID_LEAVE'));
    const s = summarizeAttendance(input({ records }));
    expect(count(s)).toEqual({ paid: '27.5', unpaid: '2.5', present: '22.5', working: 26 });
    expect([s.absentDays, s.unpaidLeaveDays, s.halfDays, s.paidLeaveDays]).toEqual([1, 1, 1, 1]);
  });

  it('holds pay for a working day with no attendance, or counts it unpaid if the policy says so', () => {
    const records = fullMonth();
    records.delete('2026-09-10');
    const held = summarizeAttendance(input({ records }));
    expect(held.exceptions[0]).toMatch(/No attendance on 1 working day: 2026-09-10/);
    const unpaid = summarizeAttendance(input({ records }, { attendance: { ...defaultPolicyConfig().attendance, missingAttendance: 'UNPAID' } }));
    expect(unpaid.exceptions).toEqual([]);
    expect(unpaid.warnings[0]).toMatch(/Counted unpaid/);
    expect(count(unpaid).unpaid).toBe('1');
  });

  it('uses the policy’s weekly offs and the holiday calendar where there is no attendance', () => {
    const s = summarizeAttendance(input({ records: new Map(), holidays: new Set(['2026-09-17']), today: '2026-09-01' }));
    expect([s.weeklyOffs, s.holidays, s.workingDays]).toEqual([4, 1, 25]);
    expect(s.exceptions).toEqual([expect.stringMatching(/No attendance on 1 working day: 2026-09-01/), expect.stringMatching(/The period isn’t over: attendance for 24 days/)]);
  });

  it('prorates a joiner: days before joining are unpaid, counted by the divisor', () => {
    const calendar = summarizeAttendance(input({ hireDate: '2026-09-16' }));
    expect([calendar.notEmployedDays, count(calendar).unpaid]).toEqual([15, '15']);
    // With a working-day or fixed divisor only the 13 working days before joining count.
    const fixed = summarizeAttendance(input({ hireDate: '2026-09-16' }, { divisor: { method: 'FIXED_DAYS', fixedDays: 26 } }));
    expect(count(fixed).unpaid).toBe('13');
  });

  it('pays weekly offs and holidays to people paid by the day only if the policy says so', () => {
    const daily = summarizeAttendance(input({ payBasis: 'DAILY' }, { divisor: { method: 'WORKING_DAYS', fixedDays: null } }));
    expect(count(daily)).toMatchObject({ paid: '26', unpaid: '0' });
    const paidOffs = summarizeAttendance(input({ payBasis: 'DAILY' }, { attendance: { ...defaultPolicyConfig().attendance, weeklyOffsPaidForDaily: true } }));
    expect(count(paidOffs).paid).toBe('30');
  });

  it('counts late and early only beyond the grace period', () => {
    const records = fullMonth();
    records.set('2026-09-01', record('2026-09-01', 'PRESENT', { lateMinutes: 5 }));
    records.set('2026-09-02', record('2026-09-02', 'PRESENT', { lateMinutes: 25, earlyMinutes: 15 }));
    const s = summarizeAttendance(input({ records }, { lateArrival: { ...defaultPolicyConfig().lateArrival, graceMinutes: 10 } }));
    expect([s.lateCount, s.lateMinutes, s.earlyCount, s.earlyMinutes]).toEqual([1, 25, 1, 15]);
  });

  it('splits a month between two salaries by their windows', () => {
    const first = summarizeAttendance(input({ windowEnd: '2026-09-15' }));
    const second = summarizeAttendance(input({ windowStart: '2026-09-16' }));
    expect([count(first).unpaid, count(second).unpaid]).toEqual(['15', '15']);
    expect([count(first).paid, count(second).paid]).toEqual(['15', '15']);
  });

  it('refuses unapproved attendance when the policy pays only approved days, and unknown statuses', () => {
    const records = fullMonth();
    records.set('2026-09-01', record('2026-09-01', 'PRESENT', { approvalStatus: 'PENDING' }));
    records.set('2026-09-02', record('2026-09-02', 'ON_DUTY'));
    const s = summarizeAttendance(input({ records }, { attendance: { ...defaultPolicyConfig().attendance, requireApprovedAttendance: true } }));
    expect(s.exceptions).toEqual([expect.stringMatching(/2026-09-01 isn’t approved/), expect.stringMatching(/doesn’t know: 2026-09-02 \(ON_DUTY\)/)]);
  });
});
