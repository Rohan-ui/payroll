import { randomBytes } from 'crypto';

/**
 * What a failed send means for retrying it:
 * - TRANSIENT: the email certainly did not go out and may succeed later (a
 *   connection refused, a 4xx reply). Retried after a while.
 * - PERMANENT: it did not go out and would not on a retry (a recipient the
 *   server refuses, the account's sign-in refused). Waits for a person.
 * - UNCERTAIN: the connection broke after the message was handed over, so the
 *   server may have accepted it. Never sent again automatically.
 */
export type SendFailure = { kind: 'TRANSIENT' | 'PERMANENT' | 'UNCERTAIN'; code: string; reason: string };

/** Retry delays after a transient failure: 1, 5 and 15 minutes; then it waits for a person. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

type Detail = { code?: unknown; command?: unknown; responseCode?: unknown; message?: unknown; cause?: unknown; safeReason?: unknown; status?: unknown };

/** The SMTP details of an error, from it or what it wraps. */
function details(error: unknown): Detail {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const d = current as Detail;
    if (d.command !== undefined || d.responseCode !== undefined || (typeof d.code === 'string' && /^E[A-Z]+$/.test(d.code))) return d;
    current = d.cause;
  }
  return (error && typeof error === 'object' ? error : {}) as Detail;
}

/** Commands before the message itself: a failure there means nothing was sent. */
const BEFORE_MESSAGE = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO|API)/i;

export function classifySendFailure(error: unknown, safeReason?: string): SendFailure {
  const d = details(error);
  const responseCode = typeof d.responseCode === 'number' ? d.responseCode : null;
  const command = typeof d.command === 'string' ? d.command : '';
  const code = typeof d.code === 'string' ? d.code : '';
  const reason = (safeReason ?? (typeof (error as Detail)?.safeReason === 'string' ? (error as { safeReason: string }).safeReason : null) ?? 'The mail server did not take the email.').slice(0, 500);
  if (code === 'EAUTH' || /^AUTH/i.test(command) || responseCode === 535 || responseCode === 534) return { kind: 'PERMANENT', code: 'SENDER_SIGN_IN_REFUSED', reason };
  if (responseCode !== null && responseCode >= 500) {
    return { kind: 'PERMANENT', code: /^RCPT/i.test(command) || [550, 551, 553].includes(responseCode) ? 'RECIPIENT_REFUSED' : 'MESSAGE_REFUSED', reason };
  }
  if (responseCode !== null && responseCode >= 400) return { kind: 'TRANSIENT', code: 'TEMPORARILY_REFUSED', reason };
  if (BEFORE_MESSAGE.test(command) || ['ECONNECTION', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETLS'].includes(code)) {
    return { kind: 'TRANSIENT', code: 'NOT_CONNECTED', reason };
  }
  return { kind: 'UNCERTAIN', code: 'CONNECTION_LOST', reason: 'The connection to the mail server broke while the email was being handed over, so it may or may not have been sent.' };
}

/** A Message-ID for one email, made before sending so its replies and bounces can be matched to it. */
export function newMessageId(senderEmail: string) {
  const domain = senderEmail.split('@')[1]?.replace(/[^a-z0-9.-]/gi, '') || 'voogyo.local';
  return `<seq.${randomBytes(16).toString('hex')}@${domain}>`;
}
