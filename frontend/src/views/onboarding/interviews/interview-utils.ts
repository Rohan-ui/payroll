import type { InterviewListItem } from '../../../api/onboarding.api';

export type CalendarUnit = 'week' | 'month';

/** Where an interview sits in the hiring flow, worked out from its status, decision and time. */
export type InterviewStage = 'upcoming' | 'awaiting' | 'passed' | 'failed' | 'cancelled';

export const STAGES: { id: InterviewStage; label: string; hint: string; accent: string; dot: string }[] = [
  { id: 'upcoming', label: 'Upcoming', hint: 'Scheduled, not held yet', accent: 'border-l-violet-500', dot: 'bg-violet-500' },
  { id: 'awaiting', label: 'Awaiting decision', hint: 'Held, no decision yet', accent: 'border-l-amber-500', dot: 'bg-amber-500' },
  { id: 'passed', label: 'Passed', hint: 'Selected or moved on a round', accent: 'border-l-emerald-500', dot: 'bg-emerald-500' },
  { id: 'failed', label: 'Not selected', hint: 'Rejected at this round', accent: 'border-l-red-500', dot: 'bg-red-500' },
  { id: 'cancelled', label: 'Cancelled', hint: 'Called off', accent: 'border-l-slate-300', dot: 'bg-slate-400' },
];
export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s])) as Record<InterviewStage, (typeof STAGES)[number]>;

export function stageOf(row: Pick<InterviewListItem, 'status' | 'decision' | 'startsAt'>, now: number): InterviewStage {
  if (row.status === 'CANCELLED') return 'cancelled';
  if (row.status === 'PASSED' || row.decision === 'SELECT' || row.decision === 'ADVANCE') return 'passed';
  if (row.status === 'FAILED' || row.decision === 'REJECT') return 'failed';
  return new Date(row.startsAt).getTime() < now ? 'awaiting' : 'upcoming';
}

/** Monday 00:00 (viewer's time zone) of the week holding a date. */
export function weekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

export const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const sameDay = (a: Date, b: Date) => dayKey(a) === dayKey(b);

/**
 * The days a view covers. A week is Monday to Sunday; a month is drawn as whole weeks, so the grid
 * starts on the Monday on or before the 1st and ends on the Sunday on or after the last day.
 */
export function periodDays(anchor: Date, unit: CalendarUnit): Date[] {
  if (unit === 'week') {
    const start = weekStart(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = weekStart(first);
  const end = addDays(weekStart(last), 6);
  const count = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Array.from({ length: count }, (_, i) => addDays(start, i));
}

export const shiftAnchor = (anchor: Date, unit: CalendarUnit, step: number) =>
  unit === 'week' ? addDays(anchor, 7 * step) : new Date(anchor.getFullYear(), anchor.getMonth() + step, 1);

export function periodLabel(anchor: Date, unit: CalendarUnit): string {
  if (unit === 'month') return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(anchor);
  const days = periodDays(anchor, 'week');
  const f = (d: Date, withYear: boolean) => new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) }).format(d);
  return `${f(days[0], false)} – ${f(days[6], true)}`;
}

export const timeLabel = (iso: string) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
export const feedbackCount = (row: Pick<InterviewListItem, 'panel'>) => ({ done: row.panel.filter((p) => p.feedbackSubmitted).length, total: row.panel.length });
