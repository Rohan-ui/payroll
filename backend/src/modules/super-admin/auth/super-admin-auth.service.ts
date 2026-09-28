import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedSuperAdmin } from '@/common/interfaces/request-with-super-admin.interface';
import { SuperAdminMfaService } from './super-admin-mfa.service';
import {
  LoginThrottleService,
  IP_LOGIN_RULE,
  EMAIL_LOGIN_RULE,
  MFA_RULE,
} from '@/common/security/login-throttle.service';
import {
  hashPassword,
  verifyPassword,
  equalizePasswordTiming,
  PASSWORD_ALGORITHM_SCRYPT,
} from '@/common/security/password.util';

export interface SuperAdminLoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface SuperAdminSessionResult {
  token: string;
  expiresAt: Date;
  /** True while the token only permits completing the second-factor challenge. */
  mfaRequired: boolean;
  superAdmin: {
    id: string;
    email: string;
    displayName: string;
    role: string;
  };
}

/** Generic message: never reveal whether the email exists or is merely locked. */
const INVALID_CREDENTIALS = 'Invalid email or password.';

const SESSION_TTL_HOURS = 8;
/** A half-finished sign-in is short lived; it only carries the MFA challenge. */
const MFA_CHALLENGE_TTL_MINUTES = 5;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const TOKEN_BYTES = 32;

@Injectable()
export class SuperAdminAuthService {
  private readonly logger = new Logger(SuperAdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mfaService: SuperAdminMfaService,
    private readonly throttleService: LoginThrottleService,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private truncate(value: string | undefined, max: number): string | null {
    if (!value) return null;
    return value.length > max ? value.slice(0, max) : value;
  }

  /**
   * Authenticates a platform super admin and issues an opaque server-side
   * session token. The raw token is returned once; only its SHA-256 digest is
   * persisted, so a database read cannot reconstruct a usable session.
   */
  async login(
    emailInput: string,
    password: string,
    context: SuperAdminLoginContext = {},
  ): Promise<SuperAdminSessionResult> {
    const email = (emailInput || '').trim().toLowerCase();

    if (!email || !password) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const ipKey = this.throttleService.ipKey(context.ipAddress);
    const emailKey = this.throttleService.emailKey(email);

    // Checked before the password is verified, so a throttled caller never
    // reaches the deliberately slow key derivation.
    await this.throttleService.assertNotBlocked([ipKey, emailKey]);

    const throttleRules = [
      { key: ipKey, ...IP_LOGIN_RULE },
      { key: emailKey, ...EMAIL_LOGIN_RULE },
    ];

    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { email },
    });

    if (!admin) {
      // Equalize timing against a real verification so the response time does
      // not disclose whether the account exists.
      await equalizePasswordTiming(password);
      await this.throttleService.recordFailure(throttleRules);
      await this.recordFailedLogin(null, email, context);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();

    if (admin.locked_until && admin.locked_until > now) {
      await this.recordFailedLogin(admin.id, email, context, 'LOCKED');
      throw new UnauthorizedException(
        'This account is temporarily locked after repeated failed sign-in attempts. Try again later or contact another platform administrator.',
      );
    }

    if (!admin.is_active) {
      await this.throttleService.recordFailure(throttleRules);
      await this.recordFailedLogin(admin.id, email, context, 'INACTIVE');
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const { isValid, requiresRehash } = await verifyPassword(
      password,
      admin.password_hash,
    );

    if (!isValid) {
      // A lock that has already expired starts the count over, so one mistake
      // after the window does not immediately re-lock the account.
      const priorAttempts = admin.locked_until ? 0 : admin.failed_login_attempts;
      const attempts = priorAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

      await this.prisma.rndtechnosoft_super_admins.update({
        where: { id: admin.id },
        data: {
          failed_login_attempts: attempts,
          locked_until: shouldLock
            ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000)
            : null,
          updated_at: now,
        },
      });

      await this.throttleService.recordFailure(throttleRules);
      await this.recordFailedLogin(
        admin.id,
        email,
        context,
        shouldLock ? 'LOCKED_OUT' : 'BAD_PASSWORD',
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // The password is correct, so stop counting this caller as an attacker.
    await this.throttleService.clear([ipKey, emailKey]);

    // With a second factor enrolled, the password alone yields only a short
    // lived challenge token. The guard refuses it for every route except the
    // challenge endpoint until the factor is verified.
    const mfaRequired = admin.totp_enabled;

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const expiresAt = mfaRequired
      ? new Date(now.getTime() + MFA_CHALLENGE_TTL_MINUTES * 60_000)
      : new Date(now.getTime() + SESSION_TTL_HOURS * 3_600_000);

    // Key derivation is deliberately slow, so do it before opening the
    // transaction rather than holding row locks while it runs.
    const upgradedHash = requiresRehash ? await hashPassword(password) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_super_admins.update({
        where: { id: admin.id },
        data: {
          failed_login_attempts: 0,
          locked_until: null,
          last_login_at: now,
          updated_at: now,
          ...(upgradedHash
            ? {
                password_hash: upgradedHash,
                password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
              }
            : {}),
        },
      });

      await tx.rndtechnosoft_super_admin_sessions.create({
        data: {
          id: randomUUID(),
          super_admin_id: admin.id,
          token_hash: this.hashToken(token),
          issued_ip_address: this.truncate(context.ipAddress, 64),
          user_agent: this.truncate(context.userAgent, 255),
          expires_at: expiresAt,
          mfa_pending: mfaRequired,
        },
      });

      await tx.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: admin.id,
          category: 'AUTH',
          action: mfaRequired ? 'SUPER_ADMIN_PASSWORD_ACCEPTED' : 'SUPER_ADMIN_LOGIN',
          description: mfaRequired
            ? `Password accepted for ${admin.email}; awaiting second factor`
            : `Platform sign-in succeeded for ${admin.email}`,
          ip_address: this.truncate(context.ipAddress, 64),
          user_agent: this.truncate(context.userAgent, 255),
        },
      });
    });

    this.logger.log(
      `Platform password accepted superAdminId=${admin.id} role=${admin.role} mfaRequired=${mfaRequired}`,
    );

    return {
      token,
      expiresAt,
      mfaRequired,
      superAdmin: {
        id: admin.id,
        email: admin.email,
        displayName: admin.display_name,
        role: admin.role,
      },
    };
  }

  /**
   * Resolves a bearer token to a live platform identity. Expired, revoked, or
   * deactivated sessions are rejected.
   */
  async resolveSession(token: string): Promise<AuthenticatedSuperAdmin> {
    if (!token) {
      throw new UnauthorizedException('Platform authentication is required.');
    }

    const session = await this.prisma.rndtechnosoft_super_admin_sessions.findUnique({
      where: { token_hash: this.hashToken(token) },
      include: { rndtechnosoft_super_admins: true },
    });

    const now = new Date();

    if (
      !session ||
      session.revoked_at !== null ||
      session.expires_at <= now ||
      !session.rndtechnosoft_super_admins.is_active
    ) {
      throw new UnauthorizedException('Your platform session has expired. Sign in again.');
    }

    // Refresh last_used_at at most once a minute to avoid a write per request.
    if (now.getTime() - session.last_used_at.getTime() > 60_000) {
      await this.prisma.rndtechnosoft_super_admin_sessions.update({
        where: { id: session.id },
        data: { last_used_at: now },
      });
    }

    const admin = session.rndtechnosoft_super_admins;

    return {
      superAdminId: admin.id,
      sessionId: session.id,
      email: admin.email,
      displayName: admin.display_name,
      role: admin.role,
      isMfaPending: session.mfa_pending,
    };
  }

  /**
   * Completes a second-factor challenge and promotes the short lived token
   * into a full session. The token itself never changes, so the client keeps
   * the one it already holds.
   */
  async completeMfaChallenge(
    token: string,
    code: string,
    context: SuperAdminLoginContext = {},
  ): Promise<SuperAdminSessionResult> {
    const identity = await this.resolveSession(token);

    if (!identity.isMfaPending) {
      throw new BadRequestException('This sign-in has already been completed.');
    }

    const throttleKey = this.throttleService.sessionKey(identity.sessionId);
    await this.throttleService.assertNotBlocked([throttleKey]);

    try {
      const factorUsed = await this.mfaService.verifyFactor(identity.superAdminId, code);
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3_600_000);

      await this.prisma.$transaction([
        this.prisma.rndtechnosoft_super_admin_sessions.update({
          where: { id: identity.sessionId },
          data: { mfa_pending: false, expires_at: expiresAt, last_used_at: now },
        }),
        this.prisma.rndtechnosoft_super_admins.update({
          where: { id: identity.superAdminId },
          data: { last_login_at: now, updated_at: now },
        }),
        this.prisma.rndtechnosoft_platform_activity_logs.create({
          data: {
            id: randomUUID(),
            super_admin_id: identity.superAdminId,
            category: 'AUTH',
            action: 'SUPER_ADMIN_LOGIN',
            description: `Platform sign-in completed with ${
              factorUsed === 'TOTP' ? 'an authenticator code' : 'a recovery code'
            }`,
            ip_address: this.truncate(context.ipAddress, 64),
            user_agent: this.truncate(context.userAgent, 255),
          },
        }),
      ]);

      await this.throttleService.clear([throttleKey]);

      this.logger.log(
        `Platform second factor accepted superAdminId=${identity.superAdminId} factor=${factorUsed}`,
      );

      return {
        token,
        expiresAt,
        mfaRequired: false,
        superAdmin: {
          id: identity.superAdminId,
          email: identity.email,
          displayName: identity.displayName,
          role: identity.role,
        },
      };
    } catch (error) {
      await this.throttleService.recordFailure([{ key: throttleKey, ...MFA_RULE }]);

      this.logger.warn(
        `Platform second factor rejected superAdminId=${identity.superAdminId}`,
      );

      await this.prisma.rndtechnosoft_platform_activity_logs
        .create({
          data: {
            id: randomUUID(),
            super_admin_id: identity.superAdminId,
            category: 'SECURITY',
            action: 'MFA_CHALLENGE_FAILED',
            description: 'Second-factor challenge rejected during sign-in',
            ip_address: this.truncate(context.ipAddress, 64),
            user_agent: this.truncate(context.userAgent, 255),
          },
        })
        .catch(() => undefined);

      throw error;
    }
  }

  async logout(sessionId: string, superAdminId: string): Promise<void> {
    const now = new Date();

    await this.prisma.rndtechnosoft_super_admin_sessions.updateMany({
      where: { id: sessionId, super_admin_id: superAdminId, revoked_at: null },
      data: { revoked_at: now },
    });

    await this.prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: superAdminId,
        category: 'AUTH',
        action: 'SUPER_ADMIN_LOGOUT',
        description: 'Platform session ended',
      },
    });
  }

  /** Revokes every other live session for this admin. */
  async revokeOtherSessions(superAdminId: string, keepSessionId: string): Promise<number> {
    const result = await this.prisma.rndtechnosoft_super_admin_sessions.updateMany({
      where: {
        super_admin_id: superAdminId,
        revoked_at: null,
        id: { not: keepSessionId },
      },
      data: { revoked_at: new Date() },
    });

    await this.prisma.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: superAdminId,
        category: 'SECURITY',
        action: 'SESSIONS_REVOKED',
        description: `Revoked ${result.count} other platform session(s)`,
      },
    });

    return result.count;
  }

  async listSessions(superAdminId: string, currentSessionId: string) {
    const sessions = await this.prisma.rndtechnosoft_super_admin_sessions.findMany({
      where: { super_admin_id: superAdminId, revoked_at: null, expires_at: { gt: new Date() } },
      orderBy: { last_used_at: 'desc' },
      take: 20,
      select: {
        id: true,
        issued_ip_address: true,
        user_agent: true,
        created_at: true,
        last_used_at: true,
        expires_at: true,
      },
    });

    return sessions.map((session) => ({
      id: session.id,
      ipAddress: session.issued_ip_address,
      userAgent: session.user_agent,
      createdAt: session.created_at,
      lastUsedAt: session.last_used_at,
      expiresAt: session.expires_at,
      isCurrent: session.id === currentSessionId,
    }));
  }

  async changePassword(
    superAdminId: string,
    currentPassword: string,
    newPassword: string,
    keepSessionId: string,
  ): Promise<void> {
    if (!newPassword || newPassword.length < 12) {
      throw new BadRequestException('New password must be at least 12 characters long.');
    }

    const admin = await this.prisma.rndtechnosoft_super_admins.findUnique({
      where: { id: superAdminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Platform account not found.');
    }

    const { isValid } = await verifyPassword(currentPassword, admin.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_super_admins.update({
        where: { id: superAdminId },
        data: {
          password_hash: passwordHash,
          password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: now,
        },
      }),
      // A password change invalidates every other session.
      this.prisma.rndtechnosoft_super_admin_sessions.updateMany({
        where: { super_admin_id: superAdminId, revoked_at: null, id: { not: keepSessionId } },
        data: { revoked_at: now },
      }),
      this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action: 'PASSWORD_CHANGED',
          description: 'Platform password changed; other sessions revoked',
        },
      }),
    ]);
  }

  private async recordFailedLogin(
    superAdminId: string | null,
    email: string,
    context: SuperAdminLoginContext,
    reason = 'UNKNOWN_ACCOUNT',
  ): Promise<void> {
    const maskedEmail = this.maskEmail(email);

    this.logger.warn(
      `Platform sign-in failed reason=${reason} email=${maskedEmail} ip=${context.ipAddress || 'unknown'}`,
    );

    try {
      await this.prisma.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: superAdminId,
          category: 'SECURITY',
          action: 'SUPER_ADMIN_LOGIN_FAILED',
          description: `Failed platform sign-in (${reason}) for ${maskedEmail}`,
          ip_address: this.truncate(context.ipAddress, 64),
          user_agent: this.truncate(context.userAgent, 255),
        },
      });
    } catch (error) {
      this.logger.error('Unable to persist failed platform sign-in audit entry', error as Error);
    }
  }

  /** Masks an address for audit trails: r****n@example.com */
  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain || local.length <= 2) {
      return `***@${domain || 'unknown'}`;
    }
    return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}@${domain}`;
  }
}
