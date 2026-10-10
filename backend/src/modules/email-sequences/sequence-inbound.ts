/**
 * Reading a mailbox for what came back from sequence emails: replies (which
 * stop the sequence), automatic replies such as out-of-office (which don't),
 * and bounces (hard ones stop it and suppress the address; soft ones are only
 * noted). Matching is by Message-ID: a reply names the email it answers in
 * In-Reply-To or References, and a bounce carries the original's headers.
 */

export interface InboundMessage {
  messageId: string | null;
  from: string | null;
  subject: string | null;
  date: Date;
  inReplyTo: string | null;
  references: string[];
  /** Raw header block, for Auto-Submitted and the like. */
  headers: string;
  /** The whole message, only fetched for likely bounces. */
  source?: string;
}

export const normalizeId = (id: string) => {
  const trimmed = id.trim();
  return trimmed.startsWith('<') ? trimmed.toLowerCase() : `<${trimmed.toLowerCase()}>`;
};

/** Message-IDs written in a header value. */
export const idsIn = (value: string | null | undefined) => (value ? [...value.matchAll(/<[^<>\s]+>/g)].map((m) => normalizeId(m[0])) : []);

const header = (headers: string, name: string) => {
  const match = headers.match(new RegExp(`^${name}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)`, 'im'));
  return match ? match[1].replace(/\r?\n[ \t]+/g, ' ').trim() : null;
};

/** Sent by a program rather than a person: out-of-office and other automatic replies. */
export function isAutomatic(message: InboundMessage) {
  const auto = header(message.headers, 'Auto-Submitted');
  if (auto && auto.toLowerCase() !== 'no') return true;
  if (header(message.headers, 'X-Autoreply') || header(message.headers, 'X-Autorespond')) return true;
  if (/^(auto_reply|auto-reply|autoreply)$/i.test(header(message.headers, 'Precedence') ?? '')) return true;
  return /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|ooo\b)/i.test((message.subject ?? '').trim());
}

/** From the mail system rather than a person: a delivery report. */
export function isDeliveryReport(message: InboundMessage) {
  if (/multipart\/report/i.test(header(message.headers, 'Content-Type') ?? '')) return true;
  return /^(mailer-daemon|postmaster|mail-daemon)@/i.test(message.from ?? '');
}

/**
 * A delivery report's verdict: the original email it is about (one of
 * `ownIds`), and whether the failure is permanent (5.x.x, HARD) or temporary
 * (4.x.x, SOFT). Null when it names none of our emails.
 */
export function readBounce(message: InboundMessage, ownIds: Set<string>): { messageId: string; kind: 'HARD' | 'SOFT'; status: string | null } | null {
  const source = message.source ?? '';
  const named = [...source.matchAll(/^Message-ID:[ \t]*(<[^<>\s]+>)/gim)].map((m) => normalizeId(m[1])).find((id) => ownIds.has(id));
  if (!named) return null;
  const status = source.match(/^Status:[ \t]*([245]\.\d{1,3}\.\d{1,3})/im)?.[1] ?? null;
  // Without a status, a report naming a failed recipient is taken as permanent.
  const kind = status ? (status.startsWith('5') ? 'HARD' : 'SOFT') : /^X-Failed-Recipients:/im.test(source) || /^Action:[ \t]*failed/im.test(source) ? 'HARD' : 'SOFT';
  return { messageId: named, kind, status };
}

/** The sequence email a message answers, by its headers. */
export function repliedTo(message: InboundMessage, ownIds: Set<string>): string | null {
  for (const id of [...idsIn(message.inReplyTo), ...message.references.map(normalizeId)]) if (ownIds.has(id)) return id;
  return null;
}

/** An address as compared: lowercase, trimmed. */
export const plainAddress = (value: string | null | undefined) => (value ?? '').trim().toLowerCase();
