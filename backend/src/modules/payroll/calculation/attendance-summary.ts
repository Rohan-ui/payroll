import { Prisma } from '@prisma/client';
import { PayrollPolicyConfig } from '../policies/policy-config';

/**
 * A pay period's attendance, counted the way payroll needs it. Every day of
 * the period is one of: worked, half day, paid or unpaid leave, absent,
 * holiday, weekly off, not employed, or missing. Nothing is assumed: a
 * working day with no attendance is “missing” and, under the policy, either
 * holds the employee's pay for review or counts unpaid, and is reported
 * either way.
 */

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'PAID_LEAVE', 'UNPAID_LEAVE', 'HOLIDAY', 'WEEKEND'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface DayRecord {
  date: string;
  status: string;
  workedMinutes: number;
  payableMinutes: number;
  lateMinutes: number;
  earlyMinutes: number;
  overtimeMinutes: number;
  approvalStatus: string;
}

export interface SummaryInput {
  /** Inclusive YYYY-MM-DD dates. */
  periodStart: string;
  periodEnd: string;
  /** The days this calculation covers (the employee's salary may change mid-period). */
  windowStart: string;
  windowEnd: string;
  /** Employment dates; null when not recorded. */
  hireDate: string | null;
  exitDate: string | null;
  payBasis: 'MONTHLY' | 'DAILY' | 'HOURLY';
  policy: PayrollPolicyConfig;
  /** Holidays from the employee's holiday calendar, YYYY-MM-DD. */
  holidays: Set<string>;
  records: Map<string, DayRecord>;
  /** Approved leave by date: paid or not, and the share of the day (1 or 0.5). */
  leaves?: Map<string, { paid: boolean; fraction: Decimal; type: string }>;
  /** The last day attendance can exist for (today). */
  today: string;
}

export type DayKind = 'PRESENT' | 'HALF_DAY' | 'PAID_LEAVE' | 'UNPAID_LEAVE' | 'ABSENT' | 'HOLIDAY' | 'WEEKLY_OFF' | 'NOT_EMPLOYED' | 'OUTSIDE' | 'MISSING' | 'NOT_YET';

export interface AttendanceSummary {
  calendarDays: number;
  /** Days of the period that are neither weekly offs nor holidays. */
  workingDays: number;
  presentDays: Decimal;
  halfDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  absentDays: number;
  holidays: number;
  weeklyOffs: number;
  missingDays: number;
  notEmployedDays: number;
  /** Days paid within the window. */
  paidDays: Decimal;
  /** Unpaid days, counted in the policy divisor's terms. */
  unpaidDays: Decimal;
  workedMinutes: number;
  payableMinutes: number;
  lateCount: number;
  lateMinutes: number;
  earlyCount: number;
  earlyMinutes: number;
  /** Overtime recorded by attendance, before the policy's overtime rules. */
  overtimeMinutes: number;
  /** Each day late, early or with overtime in the window, for the policy's rules. */
  lateDays: { date: string; minutes: number }[];
  earlyDays: { date: string; minutes: number }[];
  overtimeDays: { date: string; dayType: 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY'; minutes: number }[];
  days: { date: string; kind: DayKind }[];
  /** Problems that stop this employee being paid until fixed. */
  exceptions: string[];
  /** Things to know that don't stop pay. */
  warnings: string[];
}

const DAY = 24 * 60 * 60 * 1000;
const parse = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const eachDay = (from: string, to: string) => {
  const days: string[] = [];
  for (let t = parse(from).getTime(); t <= parse(to).getTime(); t += DAY) days.push(iso(new Date(t)));
  return days;
};
const list = (dates: string[]) => (dates.length <= 5 ? dates.join(', ') : `${dates.slice(0, 5).join(', ')} and ${dates.length - 5} more`);

export function summarizeAttendance(input: SummaryInput): AttendanceSummary {
  const { policy } = input;
  const halfValue = D(policy.attendance.halfDayValue);
  const s: AttendanceSummary = {
    calendarDays: 0, workingDays: 0, presentDays: ZERO, halfDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0, absentDays: 0, holidays: 0, weeklyOffs: 0,
    missingDays: 0, notEmployedDays: 0, paidDays: ZERO, unpaidDays: ZERO, workedMinutes: 0, payableMinutes: 0,
    lateCount: 0, lateMinutes: 0, earlyCount: 0, earlyMinutes: 0, overtimeMinutes: 0, lateDays: [], earlyDays: [], overtimeDays: [], days: [], exceptions: [], warnings: [],
  };
  const missing: string[] = [];
  const notYet: string[] = [];
  const unapproved: string[] = [];
  const unknown: string[] = [];
  const workedAfterExit: string[] = [];
  const workedOnLeave: string[] = [];
  /** Approved leave for a day with no attendance or an absence: the leave share, and the rest unpaid. */
  const takeLeave = (leave: { paid: boolean; fraction: Decimal }) => {
    if (leave.paid) { s.paidLeaveDays += leave.fraction.toNumber(); s.paidDays = s.paidDays.plus(leave.fraction); }
    else { s.unpaidLeaveDays += leave.fraction.toNumber(); s.unpaidDays = s.unpaidDays.plus(leave.fraction); }
    if (leave.fraction.lt(1)) { s.absentDays += 1; s.unpaidDays = s.unpaidDays.plus(D(1).minus(leave.fraction)); }
    return leave.paid ? 'PAID_LEAVE' : 'UNPAID_LEAVE';
  };
  const paidForNonWorking = (kind: 'HOLIDAY' | 'WEEKLY_OFF') =>
    input.payBasis === 'MONTHLY' || (input.payBasis === 'DAILY' && (kind === 'HOLIDAY' ? policy.attendance.holidaysPaidForDaily : policy.attendance.weeklyOffsPaidForDaily));
  // With a calendar-day divisor every unpaid day counts; otherwise only unpaid working days do.
  const unpaidCounts = (isWorkingDay: boolean) => policy.divisor.method === 'CALENDAR_DAYS' || isWorkingDay;

  for (const date of eachDay(input.periodStart, input.periodEnd)) {
    s.calendarDays += 1;
    const record = input.records.get(date);
    const weekday = parse(date).getUTCDay();
    const offByCalendar = input.holidays.has(date) ? 'HOLIDAY' : policy.weeklyOffDays.includes(weekday) ? 'WEEKLY_OFF' : null;
    const nonWorking = record?.status === 'HOLIDAY' ? 'HOLIDAY' : record?.status === 'WEEKEND' ? 'WEEKLY_OFF' : record ? null : offByCalendar;
    const isWorkingDay = !nonWorking;
    if (isWorkingDay) s.workingDays += 1;
    if (nonWorking === 'HOLIDAY') s.holidays += 1;
    if (nonWorking === 'WEEKLY_OFF') s.weeklyOffs += 1;

    let kind: DayKind;
    if (date < input.windowStart || date > input.windowEnd) {
      // Paid by another salary of the same period; for this one it is unpaid.
      kind = 'OUTSIDE';
      if (unpaidCounts(isWorkingDay)) s.unpaidDays = s.unpaidDays.plus(1);
    } else if ((input.hireDate && date < input.hireDate) || (input.exitDate && date > input.exitDate)) {
      kind = 'NOT_EMPLOYED';
      s.notEmployedDays += 1;
      if (unpaidCounts(isWorkingDay)) s.unpaidDays = s.unpaidDays.plus(1);
      if (record && ['PRESENT', 'HALF_DAY'].includes(record.status)) workedAfterExit.push(date);
    } else if (input.leaves?.get(date) && isWorkingDay && (!record || record.status === 'ABSENT')) {
      kind = takeLeave(input.leaves.get(date) as { paid: boolean; fraction: Decimal });
    } else if (!record) {
      if (nonWorking) {
        kind = nonWorking;
        if (paidForNonWorking(nonWorking)) s.paidDays = s.paidDays.plus(1);
        else if (unpaidCounts(false)) s.unpaidDays = s.unpaidDays.plus(1);
      } else if (date > input.today) {
        kind = 'NOT_YET';
        notYet.push(date);
      } else {
        kind = 'MISSING';
        s.missingDays += 1;
        missing.push(date);
        if (policy.attendance.missingAttendance === 'UNPAID') s.unpaidDays = s.unpaidDays.plus(1);
      }
    } else {
      if (policy.attendance.requireApprovedAttendance && ['PENDING', 'REJECTED'].includes(record.approvalStatus)) unapproved.push(date);
      s.workedMinutes += record.workedMinutes;
      s.payableMinutes += record.payableMinutes;
      s.overtimeMinutes += record.overtimeMinutes;
      const late = record.lateMinutes > policy.lateArrival.graceMinutes ? record.lateMinutes : 0;
      const early = record.earlyMinutes > policy.earlyDeparture.graceMinutes ? record.earlyMinutes : 0;
      if (late) { s.lateCount += 1; s.lateMinutes += late; s.lateDays.push({ date, minutes: late }); }
      if (early) { s.earlyCount += 1; s.earlyMinutes += early; s.earlyDays.push({ date, minutes: early }); }
      if (record.overtimeMinutes > 0) s.overtimeDays.push({ date, dayType: nonWorking === 'HOLIDAY' ? 'HOLIDAY' : nonWorking === 'WEEKLY_OFF' ? 'WEEKLY_OFF' : 'WORKING', minutes: record.overtimeMinutes });
      const leave = input.leaves?.get(date);
      if (leave && record.status === 'PRESENT') workedOnLeave.push(date);
      switch (record.status) {
        case 'PRESENT':
          kind = 'PRESENT';
          s.presentDays = s.presentDays.plus(1);
          s.paidDays = s.paidDays.plus(1);
          break;
        case 'HALF_DAY': {
          kind = 'HALF_DAY';
          s.halfDays += 1;
          s.presentDays = s.presentDays.plus(halfValue);
          s.paidDays = s.paidDays.plus(halfValue);
          // The other half is approved leave when there is some, else unpaid.
          const rest = D(1).minus(halfValue);
          if (leave?.paid) { s.paidLeaveDays += rest.toNumber(); s.paidDays = s.paidDays.plus(rest); }
          else { if (leave) s.unpaidLeaveDays += rest.toNumber(); s.unpaidDays = s.unpaidDays.plus(rest); }
          break;
        }
        case 'PAID_LEAVE':
          kind = 'PAID_LEAVE';
          s.paidLeaveDays += 1;
          s.paidDays = s.paidDays.plus(1);
          break;
        case 'UNPAID_LEAVE':
          kind = 'UNPAID_LEAVE';
          s.unpaidLeaveDays += 1;
          s.unpaidDays = s.unpaidDays.plus(1);
          break;
        case 'ABSENT':
          kind = 'ABSENT';
          s.absentDays += 1;
          s.unpaidDays = s.unpaidDays.plus(1);
          break;
        case 'HOLIDAY':
        case 'WEEKEND': {
          kind = record.status === 'HOLIDAY' ? 'HOLIDAY' : 'WEEKLY_OFF';
          if (paidForNonWorking(kind)) s.paidDays = s.paidDays.plus(1);
          else if (unpaidCounts(false)) s.unpaidDays = s.unpaidDays.plus(1);
          break;
        }
        default:
          kind = 'MISSING';
          unknown.push(`${date} (${record.status})`);
      }
    }
    s.days.push({ date, kind });
  }

  if (missing.length) {
    const text = `No attendance on ${missing.length} working day${missing.length === 1 ? '' : 's'}: ${list(missing)}.`;
    if (policy.attendance.missingAttendance === 'EXCEPTION') s.exceptions.push(`${text} Record it, or set the policy to count such days unpaid.`);
    else s.warnings.push(`${text} Counted unpaid, as the policy says.`);
  }
  if (notYet.length) s.exceptions.push(`The period isn’t over: attendance for ${notYet.length} day${notYet.length === 1 ? '' : 's'} (${list(notYet)}) can’t exist yet.`);
  if (unapproved.length) s.exceptions.push(`Attendance on ${list(unapproved)} isn’t approved, and the policy pays only approved attendance.`);
  if (unknown.length) s.exceptions.push(`Attendance with a status payroll doesn’t know: ${list(unknown)}.`);
  if (workedOnLeave.length) s.warnings.push(`Present on approved leave days (${list(workedOnLeave)}); paid as worked, and the leave isn’t counted.`);
  if (workedAfterExit.length) s.warnings.push(`Attendance shows work outside employment dates (${list(workedAfterExit)}); those days aren’t paid.`);
  return s;
}
