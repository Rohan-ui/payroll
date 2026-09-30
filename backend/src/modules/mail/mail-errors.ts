import { describeSmtpFailure } from '@/modules/email/email.service';

export { describeSmtpFailure };

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** A reason for a failed IMAP sign-in or connection that names no credential. */
export function describeImapFailure(error: unknown, host: string, port: number): string {
  const e = asRecord(error);
  const combined = `${text(e.code) ?? ''} ${text(e.message) ?? ''} ${text(e.responseText) ?? ''} ${text(e.serverResponseCode) ?? ''}`;
  if (e.authenticationFailed === true || /AUTHENTICATIONFAILED|Invalid credentials|Authentication failed|LOGIN failed/i.test(combined)) {
    return `${host} refused the IMAP username or password. Most providers need the full email address as the username, and an app password when two-factor sign-in is on.`;
  }
  if (/ENOTFOUND|EAI_AGAIN/.test(combined)) return `The IMAP host ${host} could not be found.`;
  if (/ETIMEDOUT|timeout/i.test(combined)) return `Timed out connecting to ${host}:${port}.`;
  if (/certificate|ssl|tls|wrong version number/i.test(combined)) {
    return `The secure connection to ${host}:${port} failed. Check the security mode: SSL/TLS for port 993, STARTTLS for 143.`;
  }
  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH/.test(combined)) return `Could not connect to ${host}:${port}. Check the host, port and security mode.`;
  return `Could not sign in to ${host}:${port}.`;
}
