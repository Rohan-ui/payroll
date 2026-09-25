/**
 * Platform (super admin) account management.
 *
 * The platform portal has no self-service sign-up by design: accounts are
 * provisioned here by an operator with database access.
 *
 *   npm run platform:admin -- create <email> "<Display Name>" [role]
 *   npm run platform:admin -- reset-password <email>
 *   npm run platform:admin -- deactivate <email>
 *   npm run platform:admin -- reset-mfa <email>
 *   npm run platform:admin -- list
 *
 * Passwords are never taken from argv (they would land in shell history and
 * process listings). A strong password is generated and printed once.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID, randomBytes } from 'crypto';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '../common/security/password.util';

const prisma = new PrismaClient();

function generatePassword(): string {
  return randomBytes(18).toString('base64url');
}

function printCredential(email: string, password: string): void {
  console.log('');
  console.log('  ┌─ Platform credential (shown once) ─────────────────────');
  console.log(`  │ Email    : ${email}`);
  console.log(`  │ Password : ${password}`);
  console.log('  └────────────────────────────────────────────────────────');
  console.log('  Store it in your password manager and change it after first sign-in.');
  console.log('');
}

async function create(email: string, displayName: string, role: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const existing = await prisma.rndtechnosoft_super_admins.findUnique({ where: { email: normalized } });

  if (existing) {
    throw new Error(`A platform admin already exists for ${normalized}. Use reset-password instead.`);
  }

  const password = generatePassword();

  await prisma.rndtechnosoft_super_admins.create({
    data: {
      id: randomUUID(),
      email: normalized,
      password_hash: await hashPassword(password),
      password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
      display_name: displayName,
      role,
      is_active: true,
    },
  });

  console.log(`✓ Created platform admin ${normalized} (${role})`);
  printCredential(normalized, password);
}

async function resetPassword(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const admin = await prisma.rndtechnosoft_super_admins.findUnique({ where: { email: normalized } });

  if (!admin) {
    throw new Error(`No platform admin found for ${normalized}.`);
  }

  const password = generatePassword();

  await prisma.$transaction([
    prisma.rndtechnosoft_super_admins.update({
      where: { id: admin.id },
      data: {
        password_hash: await hashPassword(password),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        failed_login_attempts: 0,
        locked_until: null,
        updated_at: new Date(),
      },
    }),
    // A reset invalidates every live session for that admin.
    prisma.rndtechnosoft_super_admin_sessions.updateMany({
      where: { super_admin_id: admin.id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
    prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: admin.id,
        category: 'SECURITY',
        action: 'PASSWORD_RESET_CLI',
        description: 'Password reset via operator CLI; all sessions revoked',
      },
    }),
  ]);

  console.log(`✓ Password reset for ${normalized}; all sessions revoked`);
  printCredential(normalized, password);
}

async function deactivate(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const admin = await prisma.rndtechnosoft_super_admins.findUnique({ where: { email: normalized } });

  if (!admin) {
    throw new Error(`No platform admin found for ${normalized}.`);
  }

  await prisma.$transaction([
    prisma.rndtechnosoft_super_admins.update({
      where: { id: admin.id },
      data: { is_active: false, updated_at: new Date() },
    }),
    prisma.rndtechnosoft_super_admin_sessions.updateMany({
      where: { super_admin_id: admin.id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
    prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: admin.id,
        category: 'SECURITY',
        action: 'ADMIN_DEACTIVATED',
        description: 'Platform admin deactivated via operator CLI; all sessions revoked',
      },
    }),
  ]);

  console.log(`✓ Deactivated ${normalized}; all sessions revoked`);
}

/**
 * Clears a lost second factor. Used when an operator loses their authenticator
 * device and has no recovery codes left. Every session is revoked, so the
 * account must sign in again and enrol a new device.
 */
async function resetMfa(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const admin = await prisma.rndtechnosoft_super_admins.findUnique({ where: { email: normalized } });

  if (!admin) {
    throw new Error(`No platform admin found for ${normalized}.`);
  }

  if (!admin.totp_enabled && !admin.totp_secret_encrypted) {
    console.log(`${normalized} has no second factor configured. Nothing to reset.`);
    return;
  }

  await prisma.$transaction([
    prisma.rndtechnosoft_super_admins.update({
      where: { id: admin.id },
      data: {
        totp_enabled: false,
        totp_secret_encrypted: null,
        totp_enrolled_at: null,
        totp_last_used_step: null,
        updated_at: new Date(),
      },
    }),
    prisma.rndtechnosoft_super_admin_recovery_codes.deleteMany({
      where: { super_admin_id: admin.id },
    }),
    prisma.rndtechnosoft_super_admin_sessions.updateMany({
      where: { super_admin_id: admin.id, revoked_at: null },
      data: { revoked_at: new Date() },
    }),
    prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: admin.id,
        category: 'SECURITY',
        action: 'MFA_RESET_CLI',
        description: 'Two-factor authentication reset by an operator; all sessions revoked',
      },
    }),
  ]);

  console.log(`✓ Two-factor reset for ${normalized}; all sessions revoked`);
  console.log('  Ask them to sign in and enrol a new device immediately.');
}

async function list(): Promise<void> {
  const admins = await prisma.rndtechnosoft_super_admins.findMany({
    orderBy: { created_at: 'asc' },
    select: {
      email: true,
      display_name: true,
      role: true,
      is_active: true,
      locked_until: true,
      last_login_at: true,
      password_algorithm: true,
      totp_enabled: true,
    },
  });

  if (admins.length === 0) {
    console.log('No platform admins exist yet. Create one with: npm run platform:admin -- create <email> "<Name>"');
    return;
  }

  console.table(
    admins.map((a) => ({
      email: a.email,
      name: a.display_name,
      role: a.role,
      active: a.is_active,
      locked: a.locked_until && a.locked_until > new Date() ? 'YES' : 'no',
      hash: a.password_algorithm,
      mfa: a.totp_enabled ? 'on' : 'OFF',
      lastLogin: a.last_login_at ? a.last_login_at.toISOString() : 'never',
    })),
  );
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'create': {
      const [email, displayName, role] = args;
      if (!email || !displayName) {
        throw new Error('Usage: create <email> "<Display Name>" [role]');
      }
      await create(email, displayName, role || 'SUPER_ADMIN');
      break;
    }
    case 'reset-password': {
      const [email] = args;
      if (!email) throw new Error('Usage: reset-password <email>');
      await resetPassword(email);
      break;
    }
    case 'deactivate': {
      const [email] = args;
      if (!email) throw new Error('Usage: deactivate <email>');
      await deactivate(email);
      break;
    }
    case 'reset-mfa': {
      const [email] = args;
      if (!email) throw new Error('Usage: reset-mfa <email>');
      await resetMfa(email);
      break;
    }
    case 'list':
      await list();
      break;
    default:
      console.log('Commands: create | reset-password | deactivate | reset-mfa | list');
      process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
