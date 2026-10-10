import { addDays, addWorkingDays, localDate, OutreachCalendar, wallClockInstant } from '@/modules/crm/crm-outreach-schedule';

/**
 * When a sequence's emails may go out. Everything is in the workspace's time
 * zone, never the server's: the days of the week (0 = Sunday … 6 = Saturday),
 * the window (minutes after midnight, end not included), and whether the
 * workspace's holidays are skipped.
 */
export interface SendSchedule {
  timeZone: string;
  holidays: Set<string>;
  weekdays: number[];
  windowStart: number;
  windowEnd: number;
  skipHolidays: boolean;
}

export type DelayUnit = 'WORKING_DAYS' | 'CALENDAR_DAYS';

/** An instant's calendar date, minute of the day and weekday in a time zone. */
export function localParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', weekday: 'short', hour: '2-digit', minute: '2-digit' })
      .formatToParts(instant).map((p) => [p.type, p.value]),
  );
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: localDate(instant, timeZone), minute: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

const weekdayOf = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** Whether emails may go out on a calendar date. */
export function isSendDay(date: string, schedule: SendSchedule) {
  return schedule.weekdays.includes(weekdayOf(date)) && !(schedule.skipHolidays && schedule.holidays.has(date));
}

/** Whether an instant falls inside the sending window on a sending day. */
export function inWindow(instant: Date, schedule: SendSchedule) {
  const { date, minute } = localParts(instant, schedule.timeZone);
  return isSendDay(date, schedule) && minute >= schedule.windowStart && minute < schedule.windowEnd;
}

/**
 * The first moment at or after `from` when an email may go out: `from` itself
 * inside the window, otherwise the start of the next window. Null when no day
 * in the next year can send (every weekday unticked, say).
 */
export function earliestSendTime(from: Date, schedule: SendSchedule): Date | null {
  const { date, minute } = localParts(from, schedule.timeZone);
  if (isSendDay(date, schedule) && minute < schedule.windowEnd) {
    return minute >= schedule.windowStart ? from : wallClockInstant(date, schedule.windowStart, schedule.timeZone);
  }
  let day = date;
  for (let i = 0; i < 370; i += 1) {
    day = addDays(day, 1);
    if (isSendDay(day, schedule)) return wallClockInstant(day, schedule.windowStart, schedule.timeZone);
  }
  return null;
}

/** The start of the next sending day's window after the day `from` falls on: where an email goes when today's limit is reached. */
export function nextDayWindow(from: Date, schedule: SendSchedule): Date | null {
  const { date } = localParts(from, schedule.timeZone);
  return earliestSendTime(wallClockInstant(addDays(date, 1), 0, schedule.timeZone), schedule);
}

/**
 * When a step falls due: `amount` working days (Monday to Friday, the
 * workspace's holidays excluded) or calendar days after `base`, at the same
 * time of day, then moved to the next sending window if it falls outside one.
 * With 0, as soon as the window allows.
 */
export function stepDueAt(base: Date, amount: number, unit: DelayUnit, calendar: OutreachCalendar, schedule: SendSchedule): Date | null {
  if (amount <= 0) return earliestSendTime(base, schedule);
  const { date, minute } = localParts(base, schedule.timeZone);
  const target = unit === 'WORKING_DAYS' ? addWorkingDays(date, amount, calendar) : addDays(date, amount);
  return earliestSendTime(wallClockInstant(target, minute, schedule.timeZone), schedule);
}

/** The workspace's today, as an instant range [start, end). */
export function todayRange(now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  return { start: wallClockInstant(today, 0, timeZone), end: wallClockInstant(addDays(today, 1), 0, timeZone) };
}
