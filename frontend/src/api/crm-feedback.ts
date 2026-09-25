import { toast } from '../lib/toast';

/**
 * CRM & Sales feedback, raised centrally from the API client so every CRM
 * screen behaves the same: a success toast when a create, update or delete is
 * committed, and an error toast with the server's own (safe) message when any
 * CRM request fails. Screens never need their own toast code for API results.
 */

export interface FeedbackOptions {
  /** Replaces the default success text, or `false` for no success toast. */
  success?: string | false;
  /** `false` when the screen reports this failure itself. */
  error?: false;
}

/** A record id segment (UUID); anything else after the collection is an action such as /import or /bulk. */
const ID = '(\\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?';
const collection = (name: string) => new RegExp(`^crm\\/${name}${ID}$`, 'i');

/** Names of CRM records by path, for "<Record> created/updated/deleted successfully". */
const RECORDS: [RegExp, string][] = [
  [collection('leads'), 'Lead'],
  [collection('clients'), 'Client'],
  [collection('quotations'), 'Quotation'],
  [collection('followups'), 'Follow-up'],
  [collection('meetings'), 'Meeting'],
  [/^crm\/activities$/, 'Activity'],
  [/^crm\/(masters\/)?pipelines$/, 'Pipeline'],
  [/^crm\/masters\/stages$/, 'Stage'],
  [/^crm\/masters\/services$/, 'Service'],
  [/^crm\/masters\/sources$/, 'Lead source'],
  [/^crm\/masters\/industries\/sub$/, 'Sub-industry'],
  [/^crm\/masters\/industries$/, 'Industry'],
];

const VERBS: Record<string, string> = { POST: 'created', PUT: 'updated', PATCH: 'updated', DELETE: 'deleted' };

/** The CRM path of a request URL, without /api/v1, query or trailing slash; null when not CRM. */
export function crmPath(url: string): string | null {
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0].replace(/\/+$/, '');
  const match = path.match(/^(?:\/api\/v1)?\/(crm\/.*)$/);
  return match ? match[1] : null;
}

/** The success text for a committed CRM change, or null when there is nothing to say (reads). */
export function successMessage(path: string, method: string, body: unknown): string | null {
  const verb = VERBS[method.toUpperCase()];
  if (!verb) return null;
  const record = RECORDS.find(([pattern]) => pattern.test(path))?.[1];
  if (record) return `${record} ${verb} successfully`;
  // Actions (convert, import, bulk, cadence…): the server describes what it did.
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.trim() ? message : 'Saved successfully';
}

/** The server's error message, which the API keeps free of internals; a plain fallback otherwise. */
export function errorMessage(status: number, body: unknown): string {
  const record = (body ?? {}) as { message?: unknown; error?: unknown };
  const message = Array.isArray(record.message) ? record.message.join(', ') : record.message ?? record.error;
  if (typeof message === 'string' && message.trim()) return message;
  if (status === 403) return 'You do not have permission to do this.';
  if (status === 404) return 'That record was not found.';
  return `The request failed (${status}). Try again.`;
}

export const NETWORK_ERROR = 'Could not reach the server. Check your connection and try again.';

/** Raises the toast for one finished CRM request. 401 is left to the session-expiry handling. */
export function reportCrmResult(path: string, method: string, status: number, ok: boolean, body: unknown, options: FeedbackOptions = {}) {
  if (!ok) {
    if (status !== 401 && options.error !== false) toast.error(errorMessage(status, body));
    return;
  }
  if (options.success === false) return;
  const text = typeof options.success === 'string' ? options.success : successMessage(path, method, body);
  if (text) toast.success(text);
}
