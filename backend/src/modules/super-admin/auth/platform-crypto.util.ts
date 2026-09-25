import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'crypto';

/**
 * Authenticated encryption for platform secrets held at rest, such as TOTP
 * shared secrets. A database dump alone must not yield a working second
 * factor, so the ciphertext is useless without PLATFORM_ENCRYPTION_KEY.
 *
 * Stored form: `v1.<iv-base64>.<authTag-base64>.<ciphertext-base64>`
 */

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class PlatformEncryptionKeyMissingError extends Error {
  constructor() {
    super(
      'PLATFORM_ENCRYPTION_KEY is not configured. Set a 32-byte key (base64 or 64 hex characters) before using platform two-factor authentication.',
    );
    this.name = 'PlatformEncryptionKeyMissingError';
  }
}

function readKey(): Buffer {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;

  if (!raw || raw.trim().length === 0) {
    throw new PlatformEncryptionKeyMissingError();
  }

  const trimmed = raw.trim();
  let key: Buffer;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    key = Buffer.from(trimmed, 'hex');
  } else {
    key = Buffer.from(trimmed, 'base64');
  }

  if (key.length !== KEY_BYTES) {
    throw new PlatformEncryptionKeyMissingError();
  }

  return key;
}

/** True when a usable encryption key is configured. */
export function isPlatformEncryptionConfigured(): boolean {
  try {
    readKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptPlatformSecret(plaintext: string): string {
  const key = readKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

export function decryptPlatformSecret(stored: string): string {
  const key = readKey();
  const parts = stored.split('.');

  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Stored platform secret is malformed.');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** SHA-256 digest used for recovery-code lookup. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** Recovery codes are compared case-insensitively and ignore separators. */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/** Length-safe constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');

  if (bufferA.length !== bufferB.length) {
    return false;
  }

  return timingSafeEqual(bufferA, bufferB);
}
