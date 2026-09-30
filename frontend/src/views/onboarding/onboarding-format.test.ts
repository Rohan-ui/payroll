import { describe, expect, it } from 'vitest';
import { isoToZonedTime, zonedTimeToIso } from './onboarding-format';
import { describeEmails } from './InterviewDialogs';

describe('interview times across time zones', () => {
  it('turns a wall-clock time in a zone into the exact moment, whatever zone the browser is in', () => {
    expect(zonedTimeToIso('2026-10-05T10:30', 'Asia/Kolkata')).toBe('2026-10-05T05:00:00.000Z');
    expect(zonedTimeToIso('2026-10-05T10:30', 'UTC')).toBe('2026-10-05T10:30:00.000Z');
    // New York is UTC-4 in summer and UTC-5 in winter.
    expect(zonedTimeToIso('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
    expect(zonedTimeToIso('2026-12-01T09:00', 'America/New_York')).toBe('2026-12-01T14:00:00.000Z');
    expect(zonedTimeToIso('not a time', 'UTC')).toBeNull();
  });

  it('shows a saved moment back as the wall-clock time in its zone', () => {
    expect(isoToZonedTime('2026-10-05T05:00:00.000Z', 'Asia/Kolkata')).toBe('2026-10-05T10:30');
    expect(isoToZonedTime('2026-12-01T14:00:00.000Z', 'America/New_York')).toBe('2026-12-01T09:00');
  });
});

describe('what happened to the emails', () => {
  it('says plainly when nothing was sent, and why', () => {
    expect(describeEmails([])).toBeNull();
    expect(describeEmails([{ recipient: 'a@x.test', status: 'SENT', duplicate: false, error: null }])).toEqual({ tone: 'ok', text: 'Email sent to 1 recipient.' });
    expect(
      describeEmails([
        { recipient: 'a@x.test', status: 'NOT_SENT', duplicate: false, error: 'The workspace has no active SMTP account.' },
        { recipient: 'b@x.test', status: 'NOT_SENT', duplicate: false, error: 'The workspace has no active SMTP account.' },
      ]),
    ).toEqual({ tone: 'warn', text: 'No email was sent. The workspace has no active SMTP account.' });
  });
});
