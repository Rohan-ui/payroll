import { workedFromPunches } from './external-api.service';

const at = (time: string) => new Date(`2026-10-10T${time}+05:30`);

describe('worked time from punches', () => {
  it('adds up each check-in to the check-out after it', () => {
    expect(workedFromPunches([
      { punch_at: at('09:30:15'), punch_type: 'CHECK_IN' },
      { punch_at: at('13:00:45'), punch_type: 'CHECK_OUT' },
      { punch_at: at('13:45:00'), punch_type: 'CHECK_IN' },
      { punch_at: at('18:15:00'), punch_type: 'CHECK_OUT' },
    ])).toBe(210 + 270);
  });

  it('counts nothing for a check-in still open, rather than assuming a full day', () => {
    expect(workedFromPunches([{ punch_at: at('09:30:00'), punch_type: 'CHECK_IN' }])).toBe(0);
    expect(workedFromPunches([
      { punch_at: at('09:00:00'), punch_type: 'CHECK_IN' },
      { punch_at: at('12:00:00'), punch_type: 'CHECK_OUT' },
      { punch_at: at('13:00:00'), punch_type: 'CHECK_IN' },
    ])).toBe(180);
  });
});
