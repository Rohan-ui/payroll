import type { DelayUnit, SendStatus, SequenceStatus } from '../../../api/sequences.api';

/** Monday first, as people read a week; values are 0 = Sunday … 6 = Saturday. */
export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
];

/** Minutes after midnight as HH:MM, and back. 1440 is the end of the day (24:00). */
export const toClock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
export const fromClock = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

export const SEQUENCE_STATUS: Record<SequenceStatus, { label: string; variant: 'success' | 'warning' | 'neutral' | 'info' }> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  ACTIVE: { label: 'Active', variant: 'success' },
  PAUSED: { label: 'Paused', variant: 'warning' },
  ARCHIVED: { label: 'Archived', variant: 'neutral' },
};

export const SEND_STATUS: Record<SendStatus, { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
  SCHEDULED: { label: 'Scheduled', variant: 'info' },
  SENDING: { label: 'Sending', variant: 'info' },
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  UNCERTAIN: { label: 'May not have sent', variant: 'warning' },
  CANCELLED: { label: 'Cancelled', variant: 'neutral' },
  BOUNCED: { label: 'Bounced', variant: 'danger' },
};

export const ENROLLMENT_STATUS: Record<'ACTIVE' | 'COMPLETED' | 'STOPPED', { label: string; variant: 'success' | 'neutral' | 'info' }> = {
  ACTIVE: { label: 'In progress', variant: 'info' },
  COMPLETED: { label: 'Finished', variant: 'success' },
  STOPPED: { label: 'Stopped', variant: 'neutral' },
};

export const delayText = (amount: number, unit: DelayUnit, first: boolean) =>
  amount === 0 ? (first ? 'Right after enrollment' : 'Right after the previous email') : `${amount} ${unit === 'WORKING_DAYS' ? 'working' : 'calendar'} day${amount === 1 ? '' : 's'} after ${first ? 'enrollment' : 'the previous email'}`;

/** A time in the workspace's time zone, as people read it. */
export const formatWhen = (iso: string | null | undefined, timeZone?: string) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
};

export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'That did not work. Try again.');

export const cardClass = 'bg-white dark:bg-[#181724] rounded-xl border border-slate-200 dark:border-[#2B293E]';
export const fieldClass = 'w-full rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-500';
export const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
export const primaryButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg bg-teal-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50';
export const secondaryButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-transparent px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
export const dangerButton = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white dark:bg-transparent px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50';
export const smallButton = 'inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-[#2B293E] px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-50';
