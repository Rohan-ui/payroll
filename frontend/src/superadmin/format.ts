/** Display helpers for the platform directories. Dates use the viewer's own locale and timezone. */

const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDate = (value: string | null | undefined): string | null =>
  value ? dateFormat.format(new Date(value)) : null;

export const formatDateTime = (value: string | null | undefined): string | null =>
  value ? dateTimeFormat.format(new Date(value)) : null;

/** "5 minutes ago", "yesterday"; older than a month shows the date. */
export function formatRelative(value: string | null | undefined, now: number = Date.now()): string | null {
  if (!value) return null;
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relativeFormat.format(seconds, 'second');
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return relativeFormat.format(Math.round(seconds / 3600), 'hour');
  if (abs < 30 * 86400) return relativeFormat.format(Math.round(seconds / 86400), 'day');
  return formatDate(value);
}

/**
 * "Chrome on macOS" from a stored user-agent string, or null when it is not a
 * recognisable browser. Only what the string says; nothing is looked up.
 */
export function describeUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Version\/.*Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  // iOS and Android strings also mention macOS and Linux, so they are checked first.
  const os = /iPhone|iPad/.test(userAgent)
    ? 'iOS'
    : /Android/.test(userAgent)
      ? 'Android'
      : /Windows NT/.test(userAgent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

export function initials(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : source.slice(0, 2);
  return letters.toUpperCase();
}

/** "TENANT_SUSPENDED" → "Tenant suspended". */
export function humanize(code: string): string {
  const words = code.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The start of a calendar day (yyyy-mm-dd) in the viewer's timezone, as an instant. */
export const localDayStart = (day: string): string => new Date(`${day}T00:00:00`).toISOString();

/** The last millisecond of a calendar day in the viewer's timezone, as an instant. */
export const localDayEnd = (day: string): string => new Date(`${day}T23:59:59.999`).toISOString();

export function seatUsage(used: number, limit: number | null): string {
  return limit === null ? `${used} · no limit set` : `${used} of ${limit}`;
}

/** Formats a decimal string from the server for display. No arithmetic is done on it. */
export function formatMoney(amount: string, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount as unknown as number);
  } catch {
    return `${currency} ${amount}`;
  }
}
