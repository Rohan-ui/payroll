import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InterviewListItem } from '../../../api/onboarding.api';
import { periodDays, stageOf } from './interview-utils';
import { layoutDay } from './WeekTimeGrid';

const listInterviews = vi.fn();
vi.mock('../../../api/onboarding.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/onboarding.api')>()),
  onboardingApi: { listInterviews: (...args: unknown[]) => listInterviews(...args) },
}));
const { InterviewsView } = await import('../InterviewsView');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const HOUR = 3_600_000;

const interview = (id: string, name: string, startsAt: number, extra: Partial<InterviewListItem> = {}): InterviewListItem => ({
  id, roundNumber: 1, roundName: null, interviewType: 'ONLINE', startsAt: new Date(startsAt).toISOString(), durationMinutes: 45, timezone: 'Asia/Kolkata',
  location: null, meetingLink: null, status: 'SCHEDULED', decision: null, isMine: false,
  candidate: { id: `c-${id}`, name, code: `CAN-${id}`, position: 'Engineer', status: 'INTERVIEW_SCHEDULED' },
  panel: [{ memberId: 'm1', name: 'Ravi', feedbackSubmitted: false }],
  ...extra,
});

describe('interview stages and periods', () => {
  const now = Date.UTC(2026, 10, 28, 12);
  it('places an interview by status, decision and time', () => {
    expect(stageOf({ status: 'SCHEDULED', decision: null, startsAt: new Date(now + HOUR).toISOString() }, now)).toBe('upcoming');
    expect(stageOf({ status: 'SCHEDULED', decision: null, startsAt: new Date(now - HOUR).toISOString() }, now)).toBe('awaiting');
    expect(stageOf({ status: 'COMPLETED', decision: 'ADVANCE', startsAt: new Date(now - HOUR).toISOString() }, now)).toBe('passed');
    expect(stageOf({ status: 'COMPLETED', decision: 'REJECT', startsAt: new Date(now - HOUR).toISOString() }, now)).toBe('failed');
    expect(stageOf({ status: 'CANCELLED', decision: null, startsAt: new Date(now + HOUR).toISOString() }, now)).toBe('cancelled');
  });

  it('draws a month as whole Monday-to-Sunday weeks, inside the server limit', () => {
    const days = periodDays(new Date(2026, 10, 15), 'month'); // November 2026 starts on a Sunday
    expect(days[0].getDay()).toBe(1);
    expect(days[days.length - 1].getDay()).toBe(0);
    expect(days.some((d) => d.getMonth() === 10 && d.getDate() === 1)).toBe(true);
    expect(days.some((d) => d.getMonth() === 10 && d.getDate() === 30)).toBe(true);
    expect(days.length % 7).toBe(0);
    expect(days.length).toBeLessThanOrEqual(42);
  });
});

describe('week time grid layout', () => {
  const at = (h: number, m = 0) => new Date(2026, 10, 30, h, m).getTime();
  it('puts overlapping interviews side by side and gives the rest the full width', () => {
    const placed = layoutDay([
      interview('a', 'A', at(10), { durationMinutes: 60 }),
      interview('b', 'B', at(10, 30), { durationMinutes: 30 }),
      interview('c', 'C', at(14), { durationMinutes: 45 }),
    ]);
    const byName = Object.fromEntries(placed.map((p) => [p.row.candidate.name, p]));
    expect([byName.A.lane, byName.A.lanes]).toEqual([0, 2]);
    expect([byName.B.lane, byName.B.lanes]).toEqual([1, 2]);
    expect([byName.C.lane, byName.C.lanes]).toEqual([0, 1]);
    expect([byName.A.startMin, byName.A.endMin]).toEqual([600, 660]);
  });

  it('reuses a lane once the earlier interview in it has ended', () => {
    const placed = layoutDay([
      interview('a', 'A', at(9), { durationMinutes: 120 }),
      interview('b', 'B', at(9, 30), { durationMinutes: 30 }),
      interview('c', 'C', at(10, 15), { durationMinutes: 30 }),
    ]);
    const byName = Object.fromEntries(placed.map((p) => [p.row.candidate.name, p]));
    expect(byName.C.lane).toBe(1);
    expect(placed.every((p) => p.lanes === 2)).toBe(true);
  });
});

describe('InterviewsView', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    localStorage.clear();
    const now = Date.now();
    listInterviews.mockReset().mockResolvedValue([
      interview('1', 'Asha Upcoming', now + 2 * HOUR),
      interview('2', 'Bala Waiting', now - 2 * HOUR),
      interview('3', 'Chitra Cancelled', now + 3 * HOUR, { status: 'CANCELLED' }),
    ]);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const settle = () => act(async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); });
  const button = (text: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

  it('shows the same interviews as a calendar, a board and a list, and hides cancelled ones unless asked', async () => {
    const onOpen = vi.fn();
    await act(async () => root.render(<InterviewsView onOpenCandidate={onOpen} />));
    await settle();
    expect(container.textContent).toContain('Asha Upcoming');
    expect(container.textContent).not.toContain('Chitra Cancelled');

    act(() => button('Board').click());
    const column = (title: string) => container.querySelector(`[aria-labelledby="${[...container.querySelectorAll('h3')].find((h) => h.textContent?.includes(title))?.id}"]`);
    expect(column('Upcoming')?.textContent).toContain('Asha Upcoming');
    expect(column('Awaiting decision')?.textContent).toContain('Bala Waiting');

    act(() => button('List').click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    act(() => [...container.querySelectorAll('label')].find((l) => l.textContent?.includes('Show cancelled'))?.click());
    expect(container.querySelectorAll('tbody tr')).toHaveLength(3);

    act(() => button('Bala Waiting').click());
    expect(onOpen).toHaveBeenCalledWith('c-2');
  });

  it('asks the server for a whole month when the month period is picked', async () => {
    await act(async () => root.render(<InterviewsView onOpenCandidate={() => undefined} />));
    await settle();
    act(() => button('Month').click());
    await settle();
    const [from, to] = listInterviews.mock.calls.at(-1) as [string, string];
    const spanDays = (new Date(to).getTime() - new Date(from).getTime()) / (24 * HOUR);
    expect(spanDays).toBeGreaterThanOrEqual(28);
    expect(spanDays).toBeLessThanOrEqual(43);
  });
});
