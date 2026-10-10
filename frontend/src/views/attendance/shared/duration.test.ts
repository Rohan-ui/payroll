import { describe, expect, it } from 'vitest';
import { attendanceToday, clockTime, formatDuration, formatMinutes, workedFromBounds, workedFromPunches } from './duration';
import { getAttendancePunches, type ApiPunch } from './punches';

const punch = (punchAt: string, punchType: 'IN' | 'OUT', id: string): ApiPunch => ({ id, punchAt, punchType, source: 'COSEC_SYNC' } as ApiPunch);
// 10 Oct 2026, India time (+05:30).
const ist = (time: string) => `2026-10-10T${time}+05:30`;
const at = (time: string) => new Date(ist(time)).getTime();

describe('attendance durations', () => {
  it('shows hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0h 00m 00s');
    expect(formatDuration((8 * 3600 + 5 * 60 + 12) * 1000 + 999)).toBe('8h 05m 12s');
    expect(formatDuration(-5000)).toBe('0h 00m 00s');
    expect(formatMinutes(485)).toBe('8h 05m');
    expect(formatMinutes(0)).toBe('–');
  });

  it('reads punch times in India time, to the second, whatever the computer’s time zone', () => {
    expect(clockTime(ist('09:31:07'))).toBe('09:31:07 AM');
    expect(clockTime('2026-10-10T12:40:05Z')).toBe('06:10:05 PM');
    expect(attendanceToday(at('00:10:00'))).toBe('2026-10-10');
  });

  it('adds up each check-in to its check-out exactly, and counts the open one up to now today', () => {
    const punches = getAttendancePunches([
      punch(ist('09:30:15'), 'IN', 'a'), punch(ist('13:00:45'), 'OUT', 'b'), punch(ist('13:45:00'), 'IN', 'c'),
    ]);
    const now = at('15:00:30');
    const today = workedFromPunches(punches, '2026-10-10', now);
    // 3h 30m 30s done, plus 1h 15m 30s since the 13:45:00 check-in.
    expect(today).toEqual({ ms: (3 * 3600 + 30 * 60 + 30 + 3600 + 15 * 60 + 30) * 1000, running: true, since: ist('13:45:00') });
    expect(formatDuration(today.ms)).toBe('4h 46m 00s');
    // On an earlier day an open check-in is a missing check-out, not time worked.
    expect(workedFromPunches(punches, '2026-10-09', now)).toEqual({ ms: (3 * 3600 + 30 * 60 + 30) * 1000, running: false, since: null });
  });

  it('runs from first check-in to now while still inside today, and stops at the check-out', () => {
    expect(workedFromBounds(ist('09:00:00'), null, '2026-10-10', at('09:00:42'))).toEqual({ ms: 42_000, running: true, since: ist('09:00:00') });
    expect(workedFromBounds(ist('09:00:00'), ist('18:30:09'), '2026-10-10', at('20:00:00'))).toEqual({ ms: (9 * 3600 + 30 * 60 + 9) * 1000, running: false, since: null });
    expect(workedFromBounds(ist('09:00:00'), null, '2026-10-09', at('09:00:42'))).toBeNull();
    expect(workedFromBounds(null, null, '2026-10-10', at('09:00:42'))).toBeNull();
  });
});
