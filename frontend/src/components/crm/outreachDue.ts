/** How a touchpoint's due date reads on Client Outreach, from the server's workspace dates. */

export interface DueInfo {
  dueOn?: string | null;
  dueStatus?: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';
  overdueDays?: number;
}

/** A workspace date (YYYY-MM-DD) as "Thu 9 Oct", the same in every viewer's time zone. */
export function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
}

export function dueText(step: DueInfo | null | undefined): { text: string; tone: 'overdue' | 'today' | 'upcoming' } | null {
  if (!step?.dueOn) return null;
  if (step.dueStatus === 'OVERDUE') {
    const days = step.overdueDays ?? 0;
    return { text: `Overdue by ${days} ${days === 1 ? 'day' : 'days'} (was due ${shortDate(step.dueOn)})`, tone: 'overdue' };
  }
  if (step.dueStatus === 'DUE_TODAY') return { text: 'Due today', tone: 'today' };
  return { text: `Due ${shortDate(step.dueOn)}`, tone: 'upcoming' };
}

export type DueFilter = 'TODAY' | 'TOMORROW' | 'WEEK' | 'DATE' | 'ALL';

export const DUE_FILTERS: { value: DueFilter; label: string }[] = [
  { value: 'TODAY', label: 'Today' },
  { value: 'TOMORROW', label: 'Tomorrow' },
  { value: 'WEEK', label: 'Next 7 days' },
  { value: 'DATE', label: 'Pick a date' },
  { value: 'ALL', label: 'All leads' },
];
