import type { CandidateStatus } from '../../api/onboarding.api';

/** Shared formatting for the onboarding screens. */

export const BROWSER_TIMEZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
})();

/** How many minutes a time zone is ahead of UTC at a given moment. */
function offsetMinutes(instant: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(instant))
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * A wall-clock date and time ("2026-10-05T10:30") in a time zone, as an exact
 * ISO moment. Works whatever time zone the browser itself is in.
 */
export function zonedTimeToIso(localValue: string, timezone: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Once for the guess, once more in case the guess crossed a daylight-saving change.
  let instant = wall - offsetMinutes(wall, timezone) * 60000;
  instant = wall - offsetMinutes(instant, timezone) * 60000;
  return new Date(instant).toISOString();
}

/** An exact moment as the wall-clock value a datetime-local field shows, in a time zone. */
export function isoToZonedTime(iso: string | null | undefined, timezone: string): string {
  if (!iso) return '';
  try {
    const instant = new Date(iso).getTime();
    if (isNaN(instant)) return '';
    const local = new Date(instant + offsetMinutes(instant, timezone) * 60000);
    return local.toISOString().slice(0, 16);
  } catch {
    return '';
  }
}

export function formatInTimezone(iso: string | null | undefined, timezone: string, withZone = true): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    const text = new Intl.DateTimeFormat('en-IN', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
    return withZone ? `${text} (${timezone})` : text;
  } catch {
    return '—';
  }
}

export const formatDateTime = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(d);
  } catch {
    return '—';
  }
};

/** A date (YYYY-MM-DD or full ISO timestamp) as a readable date in en-IN format without shifting time zone. */
export const formatDate = (isoDate: string | null | undefined): string => {
  if (!isoDate) return '—';
  try {
    const clean = String(isoDate).trim();
    if (!clean) return '—';

    // If it's a date-only string like YYYY-MM-DD, parse with UTC midnight to avoid local offset shifts
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const d = new Date(`${clean}T00:00:00Z`);
      if (!isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(d);
      }
    }

    // If it's an ISO timestamp (e.g. 2026-10-28T05:30:00.000Z), parse directly
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d);
    }
    return '—';
  } catch {
    return '—';
  }
};

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
/** An amount string from the server, shown as rupees. Display only: never computed on. */
export const formatAmount = (amount: string | null) => (amount === null ? '—' : rupees.format(Number(amount)));

export const STATUS_VARIANT: Record<CandidateStatus, 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple'> = {
  NEW: 'neutral',
  SCREENING: 'info',
  INTERVIEW_SCHEDULED: 'purple',
  INTERVIEW_COMPLETED: 'purple',
  SELECTED: 'success',
  REJECTED: 'danger',
  OFFER_SENT: 'warning',
  OFFER_ACCEPTED: 'success',
  OFFER_DECLINED: 'danger',
  DOCUMENT_COLLECTION: 'warning',
  VERIFICATION: 'warning',
  READY_TO_JOIN: 'success',
  JOINED: 'success',
  WITHDRAWN: 'neutral',
};

export const INTERVIEW_TYPE_LABELS = { IN_PERSON: 'In person', PHONE: 'Phone', ONLINE: 'Online' } as const;
export const RECOMMENDATION_LABELS = { STRONG_YES: 'Strong yes', YES: 'Yes', NO: 'No', STRONG_NO: 'Strong no' } as const;
export const DECISION_LABELS = { ADVANCE: 'Another round', SELECT: 'Selected', REJECT: 'Rejected' } as const;

export const fieldClass =
  'w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#12111A] text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 aria-[invalid=true]:border-red-400';
export const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
