import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/**
 * TOTP (RFC 6238) over HMAC-SHA1, the algorithm every mainstream authenticator
 * app implements. Built on Node's crypto module so the platform's second
 * factor adds no third-party dependency.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20; // 160 bits, the RFC 4226 recommendation for HMAC-SHA1
const DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;

/** Steps of clock skew tolerated on each side of the current step. */
export const TOTP_SKEW_STEPS = 1;

export function encodeBase32(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function decodeBase32(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) {
      throw new Error('Secret is not valid base32.');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/** Generates a new base32 TOTP shared secret. */
export function generateTotpSecret(): string {
  return encodeBase32(randomBytes(SECRET_BYTES));
}

/** Current time step for a given moment. */
export function currentTimeStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Computes the 6-digit code for one time step. */
export function generateTotpCode(secretBase32: string, step: number): string {
  const key = decodeBase32(secretBase32);

  const counter = Buffer.alloc(8);
  // Write the step as a 64-bit big-endian integer.
  counter.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  counter.writeUInt32BE(step >>> 0, 4);

  const digest = createHmac('sha1', key).update(counter).digest();

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

export interface TotpVerificationResult {
  isValid: boolean;
  /** The step the code matched, so the caller can reject replays. */
  matchedStep: number | null;
}

/**
 * Verifies a submitted code against the steps around now.
 *
 * `minimumStep` rejects any step at or below the last one this account already
 * used, which stops an observed code being replayed inside its validity window.
 */
export function verifyTotpCode(
  secretBase32: string,
  submittedCode: string,
  options: { atMs?: number; minimumStep?: number | null } = {},
): TotpVerificationResult {
  const normalized = (submittedCode || '').replace(/\D/g, '');

  if (normalized.length !== DIGITS) {
    return { isValid: false, matchedStep: null };
  }

  const now = currentTimeStep(options.atMs ?? Date.now());
  const submitted = Buffer.from(normalized, 'utf8');

  for (let offset = -TOTP_SKEW_STEPS; offset <= TOTP_SKEW_STEPS; offset += 1) {
    const step = now + offset;

    if (step < 0) continue;
    if (options.minimumStep != null && step <= options.minimumStep) continue;

    const expected = Buffer.from(generateTotpCode(secretBase32, step), 'utf8');

    if (expected.length === submitted.length && timingSafeEqual(expected, submitted)) {
      return { isValid: true, matchedStep: step };
    }
  }

  return { isValid: false, matchedStep: null };
}

/**
 * Builds the otpauth:// URI an authenticator app consumes, either by scanning
 * a QR code or by pasting the link.
 */
export function buildOtpAuthUri(
  secretBase32: string,
  accountEmail: string,
  issuer = 'Voogyo Platform HQ',
): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Groups the secret into blocks of four for readable manual entry. */
export function formatSecretForDisplay(secretBase32: string): string {
  return secretBase32.replace(/(.{4})/g, '$1 ').trim();
}

/** Generates single-use recovery codes in the form XXXXX-XXXXX. */
export function generateRecoveryCodes(count = 10): string[] {
  // Crockford-style alphabet: no I, L, O, U, so codes are unambiguous to read.
  const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const codes: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const bytes = randomBytes(10);
    let code = '';

    for (let position = 0; position < 10; position += 1) {
      code += alphabet[bytes[position] % alphabet.length];
    }

    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);
  }

  return codes;
}
