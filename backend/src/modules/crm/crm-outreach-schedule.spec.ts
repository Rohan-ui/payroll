import { addWorkingDays, dueInstant, dueRange, dueState, localDate, nextDueAt, validTimeZone } from './crm-outreach-schedule';

const india = { timeZone: 'Asia/Kolkata', holidays: new Set<string>() };

describe('outreach due dates', () => {
  it.each([
    ['2026-10-09', 2, '2026-10-13'], // Friday + 2 working days: Tuesday, not Sunday
    ['2026-10-05', 4, '2026-10-09'], // Monday + 4: Friday
    ['2026-10-10', 0, '2026-10-12'], // due on a Saturday: the next Monday
    ['2026-10-06', 0, '2026-10-06'],
  ])('counts working days from %s + %i to %s', (from, days, expected) => {
    expect(addWorkingDays(from, days, india)).toBe(expected);
  });

  it('skips the workspace’s holidays too', () => {
    const withDiwali = { ...india, holidays: new Set(['2026-11-09', '2026-11-10']) };
    expect(addWorkingDays('2026-11-06', 1, withDiwali)).toBe('2026-11-11');
  });

  it('falls due at 10:30 in the workspace’s time zone', () => {
    expect(dueInstant('2026-10-08', 'Asia/Kolkata').toISOString()).toBe('2026-10-08T05:00:00.000Z');
    expect(dueInstant('2026-07-08', 'America/New_York').toISOString()).toBe('2026-07-08T14:30:00.000Z');
    expect(dueInstant('2026-12-08', 'America/New_York').toISOString()).toBe('2026-12-08T15:30:00.000Z');
  });

  it('counts the next touchpoint from when the last was done', () => {
    // Day 1 done Friday evening India time (already Friday 13:00 UTC): Day 3 (2 working days) on Tuesday.
    expect(nextDueAt(2, india, new Date('2026-10-09T13:00:00Z')).toISOString()).toBe('2026-10-13T05:00:00.000Z');
    // Just after midnight in India is already the next day there.
    expect(localDate(new Date('2026-10-08T19:00:00Z'), 'Asia/Kolkata')).toBe('2026-10-09');
  });

  it('says whether a touchpoint is overdue, due today or upcoming, in workspace dates', () => {
    const now = new Date('2026-10-08T06:00:00Z');
    expect(dueState('2026-10-06T05:00:00Z', india, now)).toEqual({ dueOn: '2026-10-06', status: 'OVERDUE', overdueDays: 2, today: '2026-10-08' });
    expect(dueState('2026-10-08T05:00:00Z', india, now)).toMatchObject({ status: 'DUE_TODAY', overdueDays: 0 });
    expect(dueState('2026-10-09T05:00:00Z', india, now)).toMatchObject({ dueOn: '2026-10-09', status: 'UPCOMING' });
  });

  it('turns a due filter into dates, keeping overdue touchpoints in any range from today on', () => {
    expect(dueRange('TODAY', '2026-10-08')).toEqual({ from: '2026-10-08', to: '2026-10-08', withOverdue: true });
    expect(dueRange('TOMORROW', '2026-10-08')).toEqual({ from: '2026-10-09', to: '2026-10-09', withOverdue: true });
    expect(dueRange('WEEK', '2026-10-08')).toEqual({ from: '2026-10-08', to: '2026-10-14', withOverdue: true });
    expect(dueRange('DATE', '2026-10-08', '2026-10-01')).toEqual({ from: '2026-10-01', to: '2026-10-01', withOverdue: false });
    expect(dueRange('ALL', '2026-10-08')).toBeNull();
  });

  it('falls back to India time for an unknown time zone', () => {
    expect(validTimeZone('Mars/Olympus')).toBe('Asia/Kolkata');
    expect(validTimeZone('Europe/London')).toBe('Europe/London');
    expect(validTimeZone(undefined)).toBe('Asia/Kolkata');
  });
});
