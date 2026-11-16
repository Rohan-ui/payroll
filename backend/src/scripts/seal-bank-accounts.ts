/**
 * Encrypts employee bank account numbers still stored readable (the old
 * ENC[...] placeholder) with PLATFORM_ENCRYPTION_KEY.
 *
 *   npm run bank:seal            # dry run: counts only, changes nothing
 *   npm run bank:seal -- --apply # encrypt them
 *
 * Prints counts only, never an account number. Safe to run again: sealed rows
 * are skipped, and a row changed meanwhile is left for the next run.
 */
import { PrismaClient } from '@prisma/client';
import { sealLegacyAccountNumbers } from '../common/security/bank-account.util';

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const result = await sealLegacyAccountNumbers(prisma, apply);
    console.log(`${apply ? 'Encrypted' : 'Would encrypt'} ${result.sealed} of ${result.found} readable account numbers.`);
    if (result.unreadable) console.log(`${result.unreadable} stored values are not account numbers and were left alone; review them by id.`);
    if (!apply && result.sealed) console.log('Run again with --apply to encrypt them.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'The bank account encryption did not finish.');
  process.exit(1);
});
