import { describe, expect, it } from 'vitest';
import { summariseDay, shiftHhmm, ClockSession } from './ClockInView';

const shift = { start_time: '1970-01-01T09:30:00.000Z', end_time: '18:30:00', grace_in_minutes: 15, grace_out_minutes: 15 };
const s = (clockIn: string, clockOut: string, hasClockOut = true): ClockSession => ({ id: clockIn, clockIn, clockOut, hasClockOut });

describe('summariseDay', () => {
  it('reads shift times in either format', () => {
    expect(shiftHhmm(shift.start_time)).toBe('09:30');
    expect(shiftHhmm(shift.end_time)).toBe('18:30');
  });

  it('sums sessions, leaves out the gap, and does not add overtime to worked time', () => {
    const d = summariseDay([s('13:30', '18:30'), s('09:30', '12:30')], 0, 'PRESENT', shift);
    expect(d).toMatchObject({ sessionMinutes: 480, gapMinutes: 60, workedMinutes: 480, payableDays: 1, firstIn: '09:30', lastOut: '18:30', lateByMinutes: 0, earlyExitMinutes: 0 });
  });

  it('flags late arrival and early exit only beyond grace', () => {
    expect(summariseDay([s('09:44', '18:16')], 0, 'PRESENT', shift)).toMatchObject({ lateByMinutes: 0, earlyExitMinutes: 0 });
    expect(summariseDay([s('10:00', '17:00')], 0, 'PRESENT', shift)).toMatchObject({ lateByMinutes: 30, earlyExitMinutes: 90 });
  });

  it('pays half a day for a short present day, and nothing for absent', () => {
    expect(summariseDay([s('09:30', '13:00')], 0, 'PRESENT', shift).payableDays).toBe(0.5);
    expect(summariseDay([s('09:30', '18:30')], 0, 'HALF_DAY', shift).payableDays).toBe(0.5);
    expect(summariseDay([], 0, 'ABSENT', shift).payableDays).toBe(0);
    expect(summariseDay([], 0, 'PAID_LEAVE', shift).payableDays).toBe(1);
  });

  it('counts an open session toward first-in but not worked time', () => {
    const d = summariseDay([s('09:30', '', false)], 30, 'PRESENT', null);
    expect(d).toMatchObject({ firstIn: '09:30', lastOut: '', sessionMinutes: 0, workedMinutes: 0 });
  });
});
