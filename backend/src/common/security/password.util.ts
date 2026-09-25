import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCRYPT_PREFIX = 'scrypt$1$';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export const PASSWORD_ALGORITHM_SCRYPT = 'SCRYPT';
export const PASSWORD_ALGORITHM_LEGACY_SHA256 = 'SHA256';

/**
 * Hashes a password with Node's built-in scrypt KDF. Shared by platform
 * (super admin) and tenant user authentication so there is one implementation
 * of credential storage in the codebase.
 * Stored form: `scrypt$1$<salt-base64>$<derived-key-base64>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await scrypt(password, salt, KEY_BYTES);
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${derived.toString('base64')}`;
}

async function verifyScrypt(password: string, stored: string): Promise<boolean> {
  // Stored form is `scrypt$<version>$<salt>$<key>` => exactly four segments.
  const parts = stored.split('$');
  if (parts.length !== 4) {
    return false;
  }

  const [, , saltB64, keyB64] = parts;
  let salt: Buffer;
  let expected: Buffer;

  try {
    salt = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(keyB64, 'base64');
  } catch {
    return false;
  }

  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) {
    return false;
  }

  const derived = await scrypt(password, salt, KEY_BYTES);
  return timingSafeEqual(derived, expected);
}

function verifyLegacySha256(password: string, stored: string): boolean {
  const candidate = createHash('sha256').update(password).digest();
  let expected: Buffer;

  try {
    expected = Buffer.from(stored, 'hex');
  } catch {
    return false;
  }

  if (expected.length !== candidate.length) {
    return false;
  }

  return timingSafeEqual(candidate, expected);
}

/**
 * Performs one scrypt derivation and discards it. Used on the unknown-account
 * path so response time does not disclose whether an address is registered.
 */
export async function equalizePasswordTiming(password: string): Promise<void> {
  await scrypt(password, Buffer.alloc(SALT_BYTES), KEY_BYTES);
}

export interface PasswordVerificationResult {
  isValid: boolean;
  /** True when the stored hash uses a legacy algorithm and should be re-hashed. */
  requiresRehash: boolean;
}

/**
 * Verifies a password against the stored hash, transparently supporting the
 * legacy unsalted SHA-256 hashes that predate the platform portal so existing
 * super admins are not locked out. A legacy match asks the caller to re-hash.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<PasswordVerificationResult> {
  if (storedHash.startsWith(SCRYPT_PREFIX)) {
    return { isValid: await verifyScrypt(password, storedHash), requiresRehash: false };
  }

  const isLegacyMatch = verifyLegacySha256(password, storedHash);
  return { isValid: isLegacyMatch, requiresRehash: isLegacyMatch };
}
