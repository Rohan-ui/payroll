import { ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { encryptPlatformSecret, isPlatformEncryptionConfigured } from '@/modules/super-admin/auth/platform-crypto.util';

/** The placeholder every bank account number was stored in before encryption: the number itself, readable. */
const LEGACY = /^ENC\[([0-9A-Za-z]{4,34})\]$/;
const SEALED_PREFIX = 'v1.';

/**
 * The columns that hold a bank account number: the number sealed with
 * AES-256-GCM under PLATFORM_ENCRYPTION_KEY, and its last four digits for
 * display. Refuses rather than storing the number readable when no key is set.
 */
export function sealAccountNumber(accountNumber: string) {
  const digits = accountNumber.replace(/\s/g, '');
  if (!isPlatformEncryptionConfigured()) {
    throw new ServiceUnavailableException('Bank details cannot be saved until the server’s encryption key is configured. Ask your platform administrator.');
  }
  return { account_number_encrypted: encryptPlatformSecret(digits), account_number_last4: digits.slice(-4) };
}

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Seals every account number still stored readable. Each row is updated only
 * if it still holds the value read, so a concurrent change is never
 * overwritten; nothing is printed or returned but counts. Safe to run again.
 * `scope` narrows it (tests use it to touch only their own workspaces).
 */
export async function sealLegacyAccountNumbers(db: Db, apply: boolean, scope: Prisma.rndtechnosoft_employee_bank_accountsWhereInput = {}) {
  const rows = await db.rndtechnosoft_employee_bank_accounts.findMany({
    where: { ...scope, NOT: { account_number_encrypted: { startsWith: SEALED_PREFIX } } },
    select: { id: true, account_number_encrypted: true },
  });
  let sealed = 0;
  let unreadable = 0;
  for (const row of rows) {
    const match = LEGACY.exec(row.account_number_encrypted) ?? /^([0-9]{4,34})$/.exec(row.account_number_encrypted);
    if (!match) {
      unreadable += 1;
      continue;
    }
    if (!apply) {
      sealed += 1;
      continue;
    }
    const updated = await db.rndtechnosoft_employee_bank_accounts.updateMany({
      where: { id: row.id, account_number_encrypted: row.account_number_encrypted },
      data: { ...sealAccountNumber(match[1]), updated_at: new Date() },
    });
    sealed += updated.count;
  }
  return { found: rows.length, sealed, unreadable };
}
