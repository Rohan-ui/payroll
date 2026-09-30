import { CANDIDATE_STATUSES, CLOSED_STATUSES, manualMoves, refuseManualMove, refuseOverride } from './onboarding-workflow';
import { todayIn } from './onboarding-dashboard.service';

describe('candidate workflow', () => {
  it('allows only the hand moves the process defines', () => {
    expect(refuseManualMove('NEW', 'SCREENING')).toBeNull();
    expect(refuseManualMove('NEW', 'REJECTED')).toBeNull();
    expect(refuseManualMove('SCREENING', 'WITHDRAWN')).toBeNull();
    expect(refuseManualMove('OFFER_ACCEPTED', 'WITHDRAWN')).toBeNull();
  });

  it('refuses skipping steps, and says how the status is reached', () => {
    expect(refuseManualMove('NEW', 'SELECTED')).toBe(
      'A candidate who is new can\'t be moved to selected by hand. Record a "select" decision on a completed interview. An override with a reason is also possible.',
    );
    expect(refuseManualMove('SCREENING', 'INTERVIEW_SCHEDULED')).toMatch(/Schedule an interview/);
    expect(refuseManualMove('SELECTED', 'JOINED')).toMatch(/converted to an employee/);
    expect(refuseManualMove('SCREENING', 'SCREENING')).toBe('The candidate is already screening.');
  });

  it('treats closed statuses as final except by override', () => {
    for (const status of CLOSED_STATUSES) expect(manualMoves(status)).toEqual([]);
    expect(refuseOverride('REJECTED', 'SCREENING')).toBeNull();
  });

  it('never overrides into or out of Joined', () => {
    expect(refuseOverride('READY_TO_JOIN', 'JOINED')).toBe('A candidate joins only by being converted to an employee.');
    expect(refuseOverride('JOINED', 'WITHDRAWN')).toMatch(/already an employee/);
  });

  it('defines hand moves only between known statuses', () => {
    for (const from of CANDIDATE_STATUSES) {
      for (const to of manualMoves(from)) expect(CANDIDATE_STATUSES).toContain(to);
    }
  });
});

describe('today in a time zone', () => {
  it('starts the day at local midnight', () => {
    // 20:00 UTC on 30 Sep is 01:30 on 1 Oct in India.
    const india = todayIn('Asia/Kolkata', new Date('2026-09-30T20:00:00Z'));
    expect(india.date).toBe('2026-10-01');
    expect(india.start.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(india.end.toISOString()).toBe('2026-10-01T18:30:00.000Z');
    expect(todayIn('UTC', new Date('2026-09-30T20:00:00Z')).date).toBe('2026-09-30');
  });
});
