import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  generateTotpSecret,
  verifyTotpCode,
  buildOtpAuthUri,
  formatSecretForDisplay,
  generateRecoveryCodes,
} from './totp.util';
import {
  encryptPlatformSecret,
  decryptPlatformSecret,
  isPlatformEncryptionConfigured,
  hashRecoveryCode,
  normalizeRecoveryCode,
} from './platform-crypto.util';
import { verifyPassword } from '@/common/security/password.util';

export interface MfaEnrollmentStart {
  /** Base32 secret, shown once so the operator can add it to their app. */
  secret: string;
  secretFormatted: string;
  otpauthUri: string;
}

export interface MfaStatus {
  isEnabled: boolean;
  enrolledAt: Date | null;
  unusedRecoveryCodeCount: number;
}

export type MfaFactorUsed = 'TOTP' | 'RECOVERY_CODE';

const RECOVERY_CODE_COUNT = 10;

@Injectable()
export class SuperAdminMfaService {
  private readonly logger = new Logger(SuperAdminMfaService.name);

  constructor(private readonly prisma: PrismaService) {}

  private assertEncryptionReady(): void {
    if (!isPlatformEncryptionConfigured()) {
      // Fail closed: never store a second-factor secret in the clear.
      throw new ServiceUnavailableException(
        'Two-factor authentication is unavailable because the platform encryption key is not configured. Contact your administrator.',
      );
    }
  }

  private async audit(
    superAdminId: string,
    action: string,
    description: string,
  ): Promise<void> {
    try {
      await this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action,
          description,
        },
      });
    } catch (error) {
      this.logger.error(`Unable to write ${action} audit entry`, error as Error);
    }
  }

  async getStatus(superAdminId: string): Promise<MfaStatus> {
    const [admin, unusedRecoveryCodeCount] = await Promise.all([
      this.prisma.rndtechnosoft_super_admins.findUnique({
        where: { id: superAdminId },
        select: { totp_enabled: true, totp_enrolled_at: true },
      }),
      this.prisma.rndtechnosoft_super_admin_recovery_codes.count({
        where: { super_admin_id: superAdminId, used_at: null },
      }),
    ]);

    if (!admin) {
      throw new UnauthorizedException('Platform account not found.');
    }

    return {
      isEnabled: admin.totp_enabled,
      enrolledAt: admin.totp_enrolled_at,
      unusedRecoveryCodeCount,
    };
  }

  /**
   * Issues a fresh secret and stores it encrypted, leaving the factor disabled
   * until a generated code proves the authenticator app is configured.
   */
  async beginEnrollment(superAdminId: string): Promise<MfaEnrollmentStart> {
    this.assertEncryptionReady();

    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: superAdminId },
      select: { email: true, totp_enabled: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Platform account not found.');
    }

    if (admin.totp_enabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled. Disable it first to enrol a new device.',
      );
    }

    const secret = generateTotpSecret();

    await this.prisma.rndtechnosoft_super_admins.update({
      where: { id: superAdminId },
      data: {
        totp_secret_encrypted: encryptPlatformSecret(secret),
        totp_enabled: false,
        totp_last_used_step: null,
        updated_at: new Date(),
      },
    });

    await this.audit(superAdminId, 'MFA_ENROLLMENT_STARTED', 'Started two-factor enrolment');

    return {
      secret,
      secretFormatted: formatSecretForDisplay(secret),
      otpauthUri: buildOtpAuthUri(secret, admin.email),
    };
  }

  /**
   * Confirms enrolment with a code from the authenticator app, enables the
   * factor and returns a fresh set of single-use recovery codes.
   */
  async confirmEnrollment(superAdminId: string, code: string): Promise<string[]> {
    this.assertEncryptionReady();

    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: superAdminId },
      select: { totp_secret_encrypted: true, totp_enabled: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Platform account not found.');
    }

    if (admin.totp_enabled) {
      throw new ConflictException('Two-factor authentication is already enabled.');
    }

    if (!admin.totp_secret_encrypted) {
      throw new BadRequestException('Start enrolment before confirming a code.');
    }

    const secret = decryptPlatformSecret(admin.totp_secret_encrypted);
    const result = verifyTotpCode(secret, code);

    if (!result.isValid) {
      await this.audit(
        superAdminId,
        'MFA_ENROLLMENT_FAILED',
        'Two-factor enrolment code rejected',
      );
      throw new UnauthorizedException(
        'That code is not valid. Check your authenticator app and try the current code.',
      );
    }

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_super_admins.update({
        where: { id: superAdminId },
        data: {
          totp_enabled: true,
          totp_enrolled_at: now,
          totp_last_used_step: BigInt(result.matchedStep!),
          updated_at: now,
        },
      }),
      // Replace any codes from an earlier enrolment.
      this.prisma.rndtechnosoft_super_admin_recovery_codes.deleteMany({
        where: { super_admin_id: superAdminId },
      }),
      this.prisma.rndtechnosoft_super_admin_recovery_codes.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          id: randomUUID(),
          super_admin_id: superAdminId,
          code_hash: hashRecoveryCode(recoveryCode),
        })),
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action: 'MFA_ENABLED',
          description: `Two-factor authentication enabled with ${RECOVERY_CODE_COUNT} recovery codes`,
        },
      }),
    ]);

    return recoveryCodes;
  }

  /**
   * Verifies a second factor during sign-in. Accepts either a current TOTP
   * code or an unused recovery code.
   */
  async verifyFactor(superAdminId: string, submitted: string): Promise<MfaFactorUsed> {
    this.assertEncryptionReady();

    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: superAdminId },
      select: { totp_secret_encrypted: true, totp_enabled: true, totp_last_used_step: true },
    });

    if (!admin || !admin.totp_enabled || !admin.totp_secret_encrypted) {
      throw new BadRequestException('Two-factor authentication is not enabled for this account.');
    }

    const candidate = (submitted || '').trim();

    // A recovery code carries letters or a separator; a TOTP code is six digits.
    const looksLikeRecoveryCode = /[^0-9]/.test(candidate);

    if (!looksLikeRecoveryCode) {
      const secret = decryptPlatformSecret(admin.totp_secret_encrypted);
      const minimumStep =
        admin.totp_last_used_step === null ? null : Number(admin.totp_last_used_step);

      const result = verifyTotpCode(secret, candidate, { minimumStep });

      if (result.isValid) {
        // Recording the step prevents the same code being replayed while it
        // is still inside its validity window.
        await this.prisma.rndtechnosoft_super_admins.update({
          where: { id: superAdminId },
          data: { totp_last_used_step: BigInt(result.matchedStep!) },
        });
        return 'TOTP';
      }

      throw new UnauthorizedException('That code is not valid or has already been used.');
    }

    const normalized = normalizeRecoveryCode(candidate);

    if (normalized.length === 0) {
      throw new UnauthorizedException('That code is not valid.');
    }

    const match = await this.prisma.rndtechnosoft_super_admin_recovery_codes.findFirst({
      where: {
        super_admin_id: superAdminId,
        code_hash: hashRecoveryCode(candidate),
        used_at: null,
      },
      select: { id: true },
    });

    if (!match) {
      throw new UnauthorizedException('That code is not valid or has already been used.');
    }

    // Conditional update: two concurrent requests cannot both spend one code.
    const spent = await this.prisma.rndtechnosoft_super_admin_recovery_codes.updateMany({
      where: { id: match.id, used_at: null },
      data: { used_at: new Date() },
    });

    if (spent.count === 0) {
      throw new UnauthorizedException('That code is not valid or has already been used.');
    }

    const remaining = await this.prisma.rndtechnosoft_super_admin_recovery_codes.count({
      where: { super_admin_id: superAdminId, used_at: null },
    });

    await this.audit(
      superAdminId,
      'MFA_RECOVERY_CODE_USED',
      `Signed in with a recovery code; ${remaining} remaining`,
    );

    return 'RECOVERY_CODE';
  }

  /** Issues a replacement set of recovery codes, invalidating the previous set. */
  async regenerateRecoveryCodes(superAdminId: string, code: string): Promise<string[]> {
    await this.verifyFactor(superAdminId, code);

    const recoveryCodes = generateRecoveryCodes(RECOVERY_CODE_COUNT);

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_super_admin_recovery_codes.deleteMany({
        where: { super_admin_id: superAdminId },
      }),
      this.prisma.rndtechnosoft_super_admin_recovery_codes.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          id: randomUUID(),
          super_admin_id: superAdminId,
          code_hash: hashRecoveryCode(recoveryCode),
        })),
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action: 'MFA_RECOVERY_CODES_REGENERATED',
          description: 'Recovery codes replaced; the previous set no longer works',
        },
      }),
    ]);

    return recoveryCodes;
  }

  /** Turns the factor off. Requires both the password and a current code. */
  async disable(superAdminId: string, password: string, code: string): Promise<void> {
    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: superAdminId },
      select: { password_hash: true, totp_enabled: true },
    });

    if (!admin) {
      throw new UnauthorizedException('Platform account not found.');
    }

    if (!admin.totp_enabled) {
      throw new BadRequestException('Two-factor authentication is not enabled.');
    }

    const { isValid } = await verifyPassword(password, admin.password_hash);

    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    await this.verifyFactor(superAdminId, code);

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_super_admins.update({
        where: { id: superAdminId },
        data: {
          totp_enabled: false,
          totp_secret_encrypted: null,
          totp_enrolled_at: null,
          totp_last_used_step: null,
          updated_at: now,
        },
      }),
      this.prisma.rndtechnosoft_super_admin_recovery_codes.deleteMany({
        where: { super_admin_id: superAdminId },
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action: 'MFA_DISABLED',
          description: 'Two-factor authentication disabled and recovery codes destroyed',
        },
      }),
    ]);
  }
}
