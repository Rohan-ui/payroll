import { unrecordedDayStatus } from './attendance.service';

describe('a working day with no attendance record', () => {
  it('is absent once it has passed, FUTURE until it comes', () => {
    expect(unrecordedDayStatus('2026-11-24', '2026-11-25')).toBe('ABSENT');
    expect(unrecordedDayStatus('2026-11-25', '2026-11-25')).toBe('ABSENT');
    expect(unrecordedDayStatus('2026-11-26', '2026-11-25')).toBe('FUTURE');
  });
});
