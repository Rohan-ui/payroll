import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';

/** How long a first-password link stays usable. */
export const ACCOUNT_SETUP_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 32 random bytes, base64url: 43 characters. */
export const ACCOUNT_SETUP_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const hashAccountSetupToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Issues a one-time link for a user with no password, revoking any earlier
 * unused one. Only the digest is stored: the returned token exists in memory
 * just long enough to be put in the email.
 */
export async function issueAccountSetupToken(
  db: Pick<Prisma.TransactionClient, 'rndtechnosoft_account_setup_tokens'>,
  input: { userId: string; tenantId: string; superAdminId: string | null },
): Promise<{ token: string; expiresAt: Date }> {
  const now = new Date();
  await db.rndtechnosoft_account_setup_tokens.updateMany({
    where: { user_id: input.userId, used_at: null, revoked_at: null },
    data: { revoked_at: now },
  });

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ACCOUNT_SETUP_TTL_MS);
  await db.rndtechnosoft_account_setup_tokens.create({
    data: {
      id: randomUUID(),
      user_id: input.userId,
      tenant_id: input.tenantId,
      token_hash: hashAccountSetupToken(token),
      expires_at: expiresAt,
      created_by_super_admin_id: input.superAdminId,
      created_at: now,
    },
  });
  return { token, expiresAt };
}
