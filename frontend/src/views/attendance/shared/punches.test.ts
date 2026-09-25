import { describe, it, expect } from 'vitest';
import { getAttendancePunches, getPunchSessions, type ApiPunch } from './punches';

const punch = (n: number, time: string, punchType: ApiPunch['punchType']): ApiPunch => ({
  id: `p${n}`,
  punchAt: `2026-09-22T${time}.000Z`,
  punchType,
  source: 'COSEC_SYNC',
});

describe('getAttendancePunches', () => {
  it('returns every punch with number, session and the original API object', () => {
    const api = Array.from({ length: 12 }, (_, i) =>
      punch(i + 1, `${String(3 + i).padStart(2, '0')}:00:00`, i % 2 === 0 ? 'CHECK_IN' : 'CHECK_OUT'),
    );
    const punches = getAttendancePunches(api);
    expect(punches).toHaveLength(12);
    expect(punches.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(punches.map((p) => p.session)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6]);
    expect(punches[11].raw).toBe(api[11]);
  });

  it('does not drop punches seconds apart', () => {
    const punches = getAttendancePunches([
      punch(1, '06:26:22', 'CHECK_OUT'),
      punch(2, '06:26:29', 'CHECK_IN'),
    ]);
    expect(punches).toHaveLength(2);
  });

  it('skips punches with unparseable timestamps and handles missing input', () => {
    expect(getAttendancePunches(undefined)).toEqual([]);
    expect(getAttendancePunches([{ ...punch(1, '03:00:00', 'IN'), punchAt: 'not-a-date' }])).toEqual([]);
  });
});

describe('getPunchSessions', () => {
  it('pairs IN with the next OUT and leaves an unpaired IN open', () => {
    const sessions = getPunchSessions(
      getAttendancePunches([
        punch(1, '03:23:44', 'IN'),
        punch(2, '04:16:39', 'OUT'),
        punch(3, '04:28:55', 'IN'),
      ]),
    );
    expect(sessions.map((s) => [s.number, s.minutes])).toEqual([[1, 53], [2, null]]);
    expect(sessions[1].out).toBeNull();
  });

  it('starts a new session for an OUT with no open IN and for consecutive INs', () => {
    const sessions = getPunchSessions(
      getAttendancePunches([
        punch(1, '03:00:00', 'OUT'),
        punch(2, '04:00:00', 'IN'),
        punch(3, '05:00:00', 'IN'),
        punch(4, '06:00:00', 'OUT'),
      ]),
    );
    expect(sessions.map((s) => [s.in?.number ?? null, s.out?.number ?? null, s.minutes])).toEqual([
      [null, 1, null],
      [2, null, null],
      [3, 4, 60],
    ]);
  });
});
