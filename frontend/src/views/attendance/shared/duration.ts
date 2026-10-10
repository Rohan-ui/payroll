import { useEffect, useState } from 'react';
import type { AttendancePunch } from './punches';

/**
 * Attendance durations to the second, and the live clock for a day still in
 * progress. “Now” is this computer's clock; attendance days are India time.
 */

export const ATTENDANCE_TIME_ZONE = 'Asia/Kolkata';
const pad = (n: number) => String(n).padStart(2, '0');

/** A length of time as “8h 05m 12s” (never negative). */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 3600)}h ${pad(Math.floor((total % 3600) / 60))}m ${pad(total % 60)}s`;
}

/** Stored whole minutes as “8h 05m”, or “–” for none. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return '–';
  return `${Math.floor(minutes / 60)}h ${pad(minutes % 60)}m`;
}

/** Today's date (YYYY-MM-DD) in India time. */
export function attendanceToday(now: number = Date.now()): string {
  return new Date(now).toLocaleDateString('en-CA', { timeZone: ATTENDANCE_TIME_ZONE });
}

/** A punch time as a clock time in India time, to the second. */
export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString('en-US', { timeZone: ATTENDANCE_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

export interface WorkedTime {
  /** Time inside: every completed check-in → check-out, plus the open one up to now when the day is today. */
  ms: number;
  /** Whether a check-in is still open today, so the time keeps running. */
  running: boolean;
  /** When the open check-in started, if running. */
  since: string | null;
}

/** Time worked from a day's punches. An open check-in on an earlier day is a missing check-out, not time worked. */
export function workedFromPunches(punches: AttendancePunch[], date: string, now: number): WorkedTime {
  let ms = 0;
  let openSince: string | null = null;
  for (const p of punches) {
    if (p.direction === 'IN') openSince = p.punchAt;
    else if (openSince) {
      ms += Math.max(0, new Date(p.punchAt).getTime() - new Date(openSince).getTime());
      openSince = null;
    }
  }
  const running = !!openSince && date === attendanceToday(now);
  if (running) ms += Math.max(0, now - new Date(openSince as string).getTime());
  return { ms, running, since: running ? openSince : null };
}

/**
 * Time worked for a day without its punches: from first check-in to last
 * check-out, or to now while still checked in today.
 */
export function workedFromBounds(firstIn: string | null | undefined, lastOut: string | null | undefined, date: string, now: number): WorkedTime | null {
  if (!firstIn) return null;
  const start = new Date(firstIn).getTime();
  if (lastOut) return { ms: Math.max(0, new Date(lastOut).getTime() - start), running: false, since: null };
  if (date === attendanceToday(now)) return { ms: Math.max(0, now - start), running: true, since: firstIn };
  return null;
}

/** The computer's clock, refreshed every second while `active` (and not at all otherwise). */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
