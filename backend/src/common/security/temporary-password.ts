import { Prisma } from '@prisma/client';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from './password.util';

/**
 * Replaces a user's password with a temporary one they must change at next
 * sign-in, and ends every session they have, so neither the previous password
 * nor any earlier temporary password nor an open session keeps working. Only
 * the hash is stored. With `expectedHash`, the replacement happens only if the
 * password is still the one the caller read, so two concurrent reissues cannot
 * both succeed. Returns how many sessions were ended, or null if nothing was
 * replaced.
 */
export async function replaceWithTemporaryPassword(
  tx: Pick<Prisma.TransactionClient, 'rndtechnosoft_users' | 'rndtechnosoft_user_sessions'>,
  userId: string,
  temporaryPassword: string,
  expectedHash?: string | null,
): Promise<number | null> {
  const now = new Date();
  const updated = await tx.rndtechnosoft_users.updateMany({
    where: { id: userId, ...(expectedHash !== undefined ? { password_hash: expectedHash } : {}) },
    data: {
      password_hash: await hashPassword(temporaryPassword),
      password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
      must_change_password: true,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: now,
    },
  });
  if (updated.count !== 1) return null;
  const revoked = await tx.rndtechnosoft_user_sessions.updateMany({
    where: { user_id: userId, revoked_at: null },
    data: { revoked_at: now },
  });
  return revoked.count;
}
