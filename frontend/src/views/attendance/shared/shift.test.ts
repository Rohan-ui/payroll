import { describe, it, expect } from 'vitest';
import { formatShiftClock, shiftClockToHours, shiftDisplayName } from './shift';

const base = { name: null, scheduledCode: null, workingCode: null, startTime: null, endTime: null, graceMinutes: 15, standardMinutes: 480, breakMinutes: 60 };

describe('shift display helpers', () => {
  it('formats HH:MM as 12-hour time and shows a dash when unknown', () => {
    expect(formatShiftClock('08:00')).toBe('08:00 AM');
    expect(formatShiftClock('17:00')).toBe('05:00 PM');
    expect(formatShiftClock('00:30')).toBe('12:30 AM');
    expect(formatShiftClock('12:00')).toBe('12:00 PM');
    expect(formatShiftClock(null)).toBe('—');
    expect(formatShiftClock('bad')).toBe('—');
  });

  it('converts HH:MM to decimal hours', () => {
    expect(shiftClockToHours('17:30')).toBe(17.5);
    expect(shiftClockToHours(undefined)).toBeNull();
  });

  it('prefers the device shift code and notes a different working shift', () => {
    expect(shiftDisplayName({ ...base, scheduledCode: 'GS', workingCode: 'S3' })).toBe('GS (worked as S3)');
    expect(shiftDisplayName({ ...base, scheduledCode: 'GS', workingCode: 'GS' })).toBe('GS');
    expect(shiftDisplayName({ ...base, name: 'General Shift' })).toBe('General Shift');
    expect(shiftDisplayName(undefined)).toBe('—');
  });
});
