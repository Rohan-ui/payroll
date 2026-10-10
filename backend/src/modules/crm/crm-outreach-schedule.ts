/**
 * When Client Outreach touchpoints are due. Dates are the workspace's own:
 * "today" and every due date are calendar dates in the workspace's time zone
 * (Organization & Settings, India time by default), a touchpoint falls due at
 * 10:30 that day, and only working days count: Saturdays, Sundays and the
 * workspace's holidays (HRMS holiday calendars) are skipped.
 */

export const DEFAULT_OUTREACH_TIME_ZONE = 'Asia/Kolkata';
const DUE_HOUR = 10;
const DUE_MINUTE = 30;

export interface OutreachCalendar {
  timeZone: string;
  /** Holiday dates (YYYY-MM-DD) on which no touchpoint falls due. */
  holidays: Set<string>;
}

/** A time zone name the runtime knows, else India time. */
export function validTimeZone(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_OUTREACH_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
    return value.trim();
  } catch {
    return DEFAULT_OUTREACH_TIME_ZONE;
  }
}

/** The calendar date (YYYY-MM-DD) of an instant in a time zone. */
export function localDate(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** A calendar date n days later (or earlier, for negative n). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another. */
export function daysBetween(from: string, to: string): number {
  const parse = (date: string) => { const [y, m, d] = date.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

export function isWorkingDay(date: string, calendar: OutreachCalendar): boolean {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !calendar.holidays.has(date);
}

/**
 * The date `workingDays` working days after `from`; with 0, `from` itself or
 * the next working day when `from` is a weekend or holiday.
 */
export function addWorkingDays(from: string, workingDays: number, calendar: OutreachCalendar): string {
  let date = from;
  // A year of non-working days in a row would be a misconfiguration; never loop forever.
  const step = (current: string) => {
    let next = addDays(current, 1);
    for (let guard = 0; !isWorkingDay(next, calendar) && guard < 366; guard += 1) next = addDays(next, 1);
    return next;
  };
  if (!isWorkingDay(date, calendar)) date = step(date);
  for (let i = 0; i < workingDays; i += 1) date = step(date);
  return date;
}

/** The instant 10:30 falls on a calendar date in a time zone. */
export function dueInstant(date: string, timeZone: string): Date {
  return wallClockInstant(date, DUE_HOUR * 60 + DUE_MINUTE, timeZone);
}

/** The instant a wall-clock time (minutes after midnight) falls on a calendar date in a time zone. */
export function wallClockInstant(date: string, minuteOfDay: number, timeZone: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  // How far the zone's wall clock is from UTC at that moment.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return new Date(guess - (wall - guess));
}

/**
 * When the next touchpoint is due, counted from now (when the last one was
 * done): `gapDays` working days later, at 10:30 workspace time.
 */
export function nextDueAt(gapDays: number, calendar: OutreachCalendar, now = new Date()): Date {
  return dueInstant(addWorkingDays(localDate(now, calendar.timeZone), Math.max(0, gapDays), calendar), calendar.timeZone);
}

/** Where a due instant stands against the workspace's today. */
export function dueState(due: Date | string | null | undefined, calendar: OutreachCalendar, now = new Date()) {
  const today = localDate(now, calendar.timeZone);
  const when = due ? new Date(due) : null;
  if (!when || Number.isNaN(when.getTime())) return { dueOn: null, status: 'UPCOMING' as const, overdueDays: 0, today };
  const dueOn = localDate(when, calendar.timeZone);
  const late = daysBetween(dueOn, today);
  return {
    dueOn,
    status: late > 0 ? ('OVERDUE' as const) : late === 0 ? ('DUE_TODAY' as const) : ('UPCOMING' as const),
    overdueDays: Math.max(0, late),
    today,
  };
}

export type DueFilter = 'TODAY' | 'TOMORROW' | 'WEEK' | 'DATE' | 'ALL';

/**
 * The dates a due filter covers, in workspace dates: today, tomorrow, the
 * coming 7 days, or one chosen date. Overdue touchpoints are included with
 * any range that starts today or later, since they still need doing.
 */
export function dueRange(filter: DueFilter, today: string, chosen?: string): { from: string; to: string; withOverdue: boolean } | null {
  if (filter === 'ALL') return null;
  if (filter === 'TODAY') return { from: today, to: today, withOverdue: true };
  if (filter === 'TOMORROW') return { from: addDays(today, 1), to: addDays(today, 1), withOverdue: true };
  if (filter === 'WEEK') return { from: today, to: addDays(today, 6), withOverdue: true };
  const date = chosen ?? today;
  return { from: date, to: date, withOverdue: date >= today };
}
