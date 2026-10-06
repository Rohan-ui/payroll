/** CRM history (the backend audit log): what each recorded action is called, and how to read its details. */

export interface HistoryEntry {
  id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_email: string | null;
  changes_diff: Record<string, unknown> | null;
  created_at: string;
}

export const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Created',
  UPDATE: 'Edited',
  DELETE: 'Deleted',
  LEAD_ASSIGNED: 'Assigned lead',
  LEAD_UNASSIGNED: 'Unassigned lead',
  CADENCE_ENROLLED: 'Enrolled in Client Outreach',
  TOUCHPOINT_COMPLETED: 'Completed touchpoint',
  CADENCE_BRANCHED: 'Recorded a reply',
  OUTREACH_EMAIL_SENT: 'Sent email',
  OUTREACH_EMAIL_FAILED: 'Email send failed',
  // Opened for sending by hand: not a send.
  OUTREACH_WHATSAPP_OPENED: 'Opened WhatsApp',
  OUTREACH_LINKEDIN_OPENED: 'Opened LinkedIn',
  OUTREACH_LINKEDIN_MESSAGE_COPIED: 'Copied LinkedIn message',
  // Sent by hand in WhatsApp or LinkedIn, confirmed by the member.
  OUTREACH_WHATSAPP_SENT: 'Sent WhatsApp message',
  OUTREACH_LINKEDIN_SENT: 'Sent LinkedIn message',
  CONVERT_OPPORTUNITY: 'Converted to opportunity',
  CONVERT_WON: 'Marked deal won',
  WEBHOOK_INGEST: 'Received from a webhook',
  IMPORT_LEADS: 'Imported leads',
  REORDER: 'Reordered',
};

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Action filters: each option is one or more recorded actions. */
export const ACTION_FILTERS: { label: string; value: string }[] = [
  { label: 'Created', value: 'CREATE' },
  { label: 'Edited', value: 'UPDATE' },
  { label: 'Assigned / unassigned', value: 'LEAD_ASSIGNED,LEAD_UNASSIGNED' },
  { label: 'Email sent', value: 'OUTREACH_EMAIL_SENT' },
  { label: 'Email failed', value: 'OUTREACH_EMAIL_FAILED' },
  { label: 'WhatsApp / LinkedIn sent', value: 'OUTREACH_WHATSAPP_SENT,OUTREACH_LINKEDIN_SENT' },
  { label: 'WhatsApp / LinkedIn opened', value: 'OUTREACH_WHATSAPP_OPENED,OUTREACH_LINKEDIN_OPENED,OUTREACH_LINKEDIN_MESSAGE_COPIED' },
  { label: 'Touchpoints and replies', value: 'CADENCE_ENROLLED,TOUCHPOINT_COMPLETED,CADENCE_BRANCHED' },
  { label: 'Converted / won', value: 'CONVERT_OPPORTUNITY,CONVERT_WON' },
  { label: 'Deleted', value: 'DELETE' },
];

export const CHANNEL_FILTERS = [
  { label: 'Email', value: 'EMAIL' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'LinkedIn', value: 'LINKEDIN' },
  { label: 'Phone', value: 'PHONE' },
];

/** The ISO bounds of a date filter, in the viewer's time zone. */
export function dateRange(period: string, from: string, to: string): { from?: string; to?: string } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = startOfDay(new Date());
  const daysAgo = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n).toISOString();
  if (period === 'TODAY') return { from: today.toISOString() };
  if (period === '7D') return { from: daysAgo(6) };
  if (period === '30D') return { from: daysAgo(29) };
  if (period === 'CUSTOM') {
    const parse = (value: string, plusDay = false) => {
      const [y, m, d] = value.split('-').map(Number);
      return value ? new Date(y, m - 1, d + (plusDay ? 1 : 0)).toISOString() : undefined;
    };
    return { from: parse(from), to: parse(to, true) };
  }
  return {};
}

type Names = (field: string, value: unknown) => string;

const show = (value: unknown) => (value === null || value === undefined || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/**
 * The lines that explain one entry: field changes as "before → after", and the
 * facts recorded with it (sender, recipient, touchpoint, attempt, failure).
 * `names` turns ids (stages, pipelines, members) into names.
 */
export function describeEntry(entry: HistoryEntry, names: Names = (_f, v) => show(v)): string[] {
  const details = (entry.changes_diff ?? {}) as Record<string, any>;
  const lines: string[] = [];
  const touchpoint = details.touchpoint as { day?: number; title?: string } | undefined;
  if (touchpoint?.day) lines.push(`Touchpoint: Day ${touchpoint.day}${touchpoint.title ? ` — ${touchpoint.title}` : ''}`);
  if (details.sender_email) lines.push(`From: ${details.sender_name ? `${details.sender_name} <${details.sender_email}>` : details.sender_email}`);
  if (details.recipient) lines.push(`To: ${details.recipient}`);
  if (details.subject) lines.push(`Subject: ${details.subject}`);
  if (details.attempt) lines.push(`Attempt ${details.attempt}`);
  if (details.failure) lines.push(`Reason: ${details.failure === 'ORGANIZATION_EMAIL_NOT_CONFIGURED' ? 'organization email is not configured' : details.failure}`);
  if (details.edited?.subject) lines.push(`Subject edited: "${details.edited.subject.before}" → "${details.edited.subject.after}"`);
  if (details.edited?.body) lines.push('Message edited before sending');
  if (details.branch?.label) lines.push(`Reply: ${details.branch.label}`);
  if (details.created_via) lines.push(`Via ${details.created_via}`);
  if (typeof details.notes === 'string' && details.notes) lines.push(`Notes: ${details.notes}`);
  const changes = (details.changes ?? {}) as Record<string, { before?: unknown; after?: unknown; changed?: boolean }>;
  for (const [field, change] of Object.entries(changes)) {
    const label = field === 'assigned_tenant_member_id' ? 'Owner' : field.replace(/_id$/, '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
    if (change.changed) {
      lines.push(`${label} changed`);
    } else if (field === 'assigned_tenant_member_id' && details.names) {
      lines.push(`${label}: ${details.names.before ?? (change.before ? names(field, change.before) : 'Unassigned')} → ${details.names.after ?? (change.after ? names(field, change.after) : 'Unassigned')}`);
    } else {
      lines.push(`${label}: ${names(field, change.before)} → ${names(field, change.after)}`);
    }
  }
  if (details.bulk) lines.push('Part of a bulk change');
  return lines;
}
