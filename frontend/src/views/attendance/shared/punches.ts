import type { EmployeeMonthDayRecord } from '../../../api/attendance.api';

export type ApiPunch = EmployeeMonthDayRecord['punches'][number];

export interface AttendancePunch {
  /** 1-based position in the day's punch sequence (API returns punches ordered by punch_at). */
  number: number;
  punchAt: string;
  direction: 'IN' | 'OUT';
  /** An IN punch opens a new session; an OUT punch closes the open one. */
  session: number;
  raw: ApiPunch;
}

export interface PunchSession {
  number: number;
  in: AttendancePunch | null;
  out: AttendancePunch | null;
  /** Null while the session is missing its IN or OUT punch. */
  minutes: number | null;
}

/**
 * Normalizes every punch the API returned for a day. Nothing is capped or deduplicated;
 * punches with an unparseable timestamp are skipped. IN/OUT comes from the API's punch_type
 * (for COSEC data the backend derives it from punch position: odd = IN, even = OUT).
 */
export const getAttendancePunches = (apiPunches: ApiPunch[] | undefined): AttendancePunch[] => {
  const punches: AttendancePunch[] = [];
  let session = 0;
  let sessionOpen = false;
  for (const raw of apiPunches ?? []) {
    if (Number.isNaN(new Date(raw.punchAt).getTime())) continue;
    const direction = raw.punchType === 'IN' || raw.punchType === 'CHECK_IN' ? 'IN' : 'OUT';
    if (direction === 'IN' || !sessionOpen) session++;
    sessionOpen = direction === 'IN';
    punches.push({ number: punches.length + 1, punchAt: raw.punchAt, direction, session, raw });
  }
  return punches;
};

export const getPunchSessions = (punches: AttendancePunch[]): PunchSession[] => {
  const sessions: PunchSession[] = [];
  for (const p of punches) {
    let s = sessions[sessions.length - 1];
    if (!s || s.number !== p.session) {
      s = { number: p.session, in: null, out: null, minutes: null };
      sessions.push(s);
    }
    if (p.direction === 'IN') s.in = p;
    else s.out = p;
  }
  for (const s of sessions) {
    if (s.in && s.out) {
      s.minutes = Math.round((new Date(s.out.punchAt).getTime() - new Date(s.in.punchAt).getTime()) / 60000);
    }
  }
  return sessions;
};
