/**
 * Where a Client Outreach WhatsApp or LinkedIn touchpoint opens (the server
 * applies the same rules in outreach-channels.ts). Messages pass through as
 * the Unicode text they are: nothing here changes, strips or replaces characters.
 */

/**
 * WhatsApp's click-to-chat address. Not wa.me: its redirect to this address
 * re-encodes the message and turns every emoji (four-byte UTF-8) into U+FFFD,
 * which WhatsApp shows as "?". Going here directly keeps the text intact.
 */
export const WHATSAPP_SEND_URL = 'https://api.whatsapp.com/send';

export const WHATSAPP_NUMBER_MISSING = 'WhatsApp number is not available for this lead.';
export const WHATSAPP_NUMBER_INVALID = 'Invalid WhatsApp number.';
export const LINKEDIN_MISSING = 'LinkedIn profile is not available for this lead.';
export const LINKEDIN_INVALID = 'Invalid LinkedIn profile URL.';
export const COPY_FAILED = 'Could not copy the message. Please copy it manually.';

/** A phone number as the digits WhatsApp dials: digits only, India's code added to a 10-digit number. */
export function whatsAppDigits(phone: string | null | undefined): { digits: string } | { problem: string } {
  if (!phone || !phone.trim()) return { problem: WHATSAPP_NUMBER_MISSING };
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 8 || digits.length > 15) return { problem: WHATSAPP_NUMBER_INVALID };
  return { digits };
}

/** A WhatsApp chat with the message filled in, encoded once (as UTF-8) by URLSearchParams. */
export function whatsAppChatUrl(digits: string, message: string): string {
  const url = new URL(WHATSAPP_SEND_URL);
  url.searchParams.set('phone', digits);
  if (message) url.searchParams.set('text', message);
  return url.toString();
}

export type LinkedInDestination = { url: string; kind: 'CONVERSATION' | 'PROFILE' | 'PAGE' };

const TRACKING = /^(utm_.*|trk|trkInfo|originalSubdomain|lipi|lici|midToken|midSig|trackingId|miniProfileUrn|refId)$/i;

/**
 * A LinkedIn address as https://www.linkedin.com/…, or null when it is not one:
 * a messaging thread (a conversation), /in/<name> (a profile, reduced to the
 * profile itself), or another LinkedIn page without tracking parameters.
 */
export function normalizeLinkedInUrl(raw: string | null | undefined): LinkedInDestination | null {
  const text = (raw ?? '').trim();
  if (!text || /\s/.test(text)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'linkedin.com' && !/^([a-z]{2,3}|www)\.linkedin\.com$/.test(host)) return null;
  const path = url.pathname.replace(/\/{2,}/g, '/');
  if (path === '/' || path === '') return null;

  const thread = path.match(/^\/messaging\/thread\/([^/]+)\/?/i);
  if (thread) return { url: `https://www.linkedin.com/messaging/thread/${thread[1]}/`, kind: 'CONVERSATION' };
  const profile = path.match(/^\/(in|pub)\/([^/]+)/i);
  if (profile) return { url: `https://www.linkedin.com/${profile[1].toLowerCase()}/${profile[2]}/`, kind: 'PROFILE' };

  const out = new URL(`https://www.linkedin.com${path}`);
  for (const [key, value] of url.searchParams) if (!TRACKING.test(key)) out.searchParams.append(key, value);
  const result = out.toString();
  return result.length <= 255 ? { url: result, kind: 'PAGE' } : null;
}

/** An address shown without its scheme: linkedin.com/in/rajesh-sharma/. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '');

/**
 * Copies text exactly as given (emoji, line breaks and all). Resolves true only
 * once the clipboard has it; false when the browser refused.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
