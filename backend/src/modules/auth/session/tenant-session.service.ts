import {
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID, randomBytes, createHash } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  hashPassword,
  verifyPassword,
  equalizePasswordTiming,
  PASSWORD_ALGORITHM_SCRYPT,
} from '@/common/security/password.util';
import {
  LoginThrottleService,
  IP_LOGIN_RULE,
  EMAIL_LOGIN_RULE,
} from '@/common/security/login-throttle.service';
import { AccessService } from '@/common/access/access.service';
import { ModuleStates, NavigationEntry, PermissionKey, resolveNavigation } from '@/common/access/access-catalog';

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface TenantMembershipSummary {
  tenantId: string;
  tenantCode: string;
  displayName: string;
  legalName: string;
  roles: string[];
}

/**
 * What the member may do in the active workspace, for the client to shape its
 * UI. The server re-checks on every request; this is never an authorization input.
 */
export interface TenantAccessSummary {
  permissions: PermissionKey[];
  modules: ModuleStates;
  /** Sidebar items this member may open, derived from their permissions. */
  navigation: NavigationEntry[];
}

export interface TenantSessionResult {
  token: string;
  expiresAt: Date;
  user: {
    id: string;
    email: string;
    displayName: string | null;
  };
  /** The tenant this session is pinned to. */
  activeTenant: TenantMembershipSummary;
  /** Every tenant the user may switch to. Switching re-issues a session. */
  availableTenants: TenantMembershipSummary[];
  access: TenantAccessSummary;
}

/** Identical for an unknown address and a wrong password, so neither is disclosed. */
const INVALID_CREDENTIALS = 'Invalid email or password.';

const SESSION_TTL_HOURS = 12;
const MAX_FAILED_ATTEMPTS = 8;
const LOCKOUT_MINUTES = 15;
const TOKEN_BYTES = 32;

/**
 * Tenant user authentication.
 *
 * A session pins exactly one tenant membership. Because the tenant is stored
 * with the session rather than supplied per request, a caller cannot reach
 * another tenant's data by changing a header, query parameter or body field.
 * Switching tenants requires an explicit call that re-checks membership.
 */
@Injectable()
export class TenantSessionService {
  private readonly logger = new Logger(TenantSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly throttleService: LoginThrottleService,
    private readonly accessService: AccessService,
  ) {}

  private async loadAccess(tenantId: string, tenantMemberId: string): Promise<TenantAccessSummary> {
    const [permissions, modules] = await Promise.all([
      this.accessService.getMemberPermissions(tenantId, tenantMemberId),
      this.accessService.getModuleStates(tenantId),
    ]);
    return { permissions, modules, navigation: resolveNavigation(permissions, modules) };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private truncate(value: string | undefined, max: number): string | null {
    if (!value) return null;
    return value.length > max ? value.slice(0, max) : value;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain || local.length <= 2) return `***@${domain || 'unknown'}`;
    return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}@${domain}`;
  }

  /** Active memberships in active tenants, with role codes. */
  private async loadMemberships(userId: string): Promise<TenantMembershipSummary[]> {
    const memberships = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: {
        user_id: userId,
        membership_status: 'ACTIVE',
        rndtechnosoft_tenants: { tenant_status: { in: ['ACTIVE', 'TRIALING'] } },
      },
      include: {
        rndtechnosoft_tenants: true,
        rndtechnosoft_tenant_member_roles: { include: { rndtechnosoft_roles: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    return memberships.map((membership) => ({
      tenantId: membership.tenant_id,
      tenantCode: membership.rndtechnosoft_tenants.tenant_code,
      displayName:
        membership.rndtechnosoft_tenants.display_name ||
        membership.rndtechnosoft_tenants.legal_name,
      legalName: membership.rndtechnosoft_tenants.legal_name,
      roles: membership.rndtechnosoft_tenant_member_roles.map(
        (link) => link.rndtechnosoft_roles.role_code,
      ),
    }));
  }

  async login(
    emailInput: string,
    password: string,
    context: LoginContext = {},
    requestedTenantId?: string,
  ): Promise<TenantSessionResult> {
    const email = (emailInput || '').trim().toLowerCase();

    if (!email || !password) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const ipKey = this.throttleService.ipKey(context.ipAddress, 'tenant');
    const emailKey = this.throttleService.emailKey(email, 'tenant');
    await this.throttleService.assertNotBlocked([ipKey, emailKey]);

    const throttleRules = [
      { key: ipKey, ...IP_LOGIN_RULE },
      { key: emailKey, ...EMAIL_LOGIN_RULE },
    ];

    const user = await this.prisma.rndtechnosoft_users.findUnique({ where: { email } });

    if (!user) {
      // Equalize cost so response time does not disclose whether the account exists.
      await equalizePasswordTiming(password);
      await this.throttleService.recordFailure(throttleRules);
      this.logger.warn(`Tenant sign-in failed reason=UNKNOWN_ACCOUNT email=${this.maskEmail(email)}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const now = new Date();

    if (user.locked_until && user.locked_until > now) {
      await this.throttleService.recordFailure(throttleRules);
      throw new UnauthorizedException(
        'This account is temporarily locked after repeated failed sign-in attempts. Try again in a few minutes.',
      );
    }

    if (user.user_status !== 'ACTIVE') {
      await this.throttleService.recordFailure(throttleRules);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // An account with no password set cannot be signed into. Previously a null
    // hash meant any password was accepted.
    if (!user.password_hash) {
      await equalizePasswordTiming(password);
      await this.throttleService.recordFailure(throttleRules);
      this.logger.warn(`Tenant sign-in failed reason=NO_PASSWORD_SET userId=${user.id}`);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const { isValid, requiresRehash } = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      const priorAttempts = user.locked_until ? 0 : user.failed_login_attempts;
      const attempts = priorAttempts + 1;
      const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

      await this.prisma.rndtechnosoft_users.update({
        where: { id: user.id },
        data: {
          failed_login_attempts: attempts,
          locked_until: shouldLock ? new Date(now.getTime() + LOCKOUT_MINUTES * 60_000) : null,
          updated_at: now,
        },
      });

      await this.throttleService.recordFailure(throttleRules);
      this.logger.warn(
        `Tenant sign-in failed reason=${shouldLock ? 'LOCKED_OUT' : 'BAD_PASSWORD'} userId=${user.id}`,
      );
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    const memberships = await this.loadMemberships(user.id);

    if (memberships.length === 0) {
      throw new ForbiddenException(
        'Your account is not an active member of any workspace. Ask an administrator to invite you.',
      );
    }

    // A requested tenant is honoured only when the user is genuinely a member.
    const activeTenant = requestedTenantId
      ? memberships.find((membership) => membership.tenantId === requestedTenantId)
      : memberships[0];

    if (!activeTenant) {
      // Do not disclose whether the tenant exists at all.
      throw new ForbiddenException('You do not have access to that workspace.');
    }

    await this.throttleService.clear([ipKey, emailKey]);

    const upgradedHash = requiresRehash ? await hashPassword(password) : null;

    return this.issueSession(user.id, activeTenant, memberships, context, {
      upgradedHash,
      email: user.email,
      displayName: user.display_name,
      touchLastLogin: true,
    });
  }

  /** Creates the session row and returns the one-time token. */
  private async issueSession(
    userId: string,
    activeTenant: TenantMembershipSummary,
    memberships: TenantMembershipSummary[],
    context: LoginContext,
    options: {
      upgradedHash?: string | null;
      email: string;
      displayName: string | null;
      touchLastLogin?: boolean;
    },
  ): Promise<TenantSessionResult> {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: activeTenant.tenantId, user_id: userId, membership_status: 'ACTIVE' },
      select: { id: true },
    });

    if (!member) {
      throw new ForbiddenException('You do not have access to that workspace.');
    }

    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 3_600_000);

    await this.prisma.$transaction(async (tx) => {
      if (options.touchLastLogin || options.upgradedHash) {
        await tx.rndtechnosoft_users.update({
          where: { id: userId },
          data: {
            ...(options.touchLastLogin
              ? { last_login_at: now, failed_login_attempts: 0, locked_until: null }
              : {}),
            ...(options.upgradedHash
              ? {
                  password_hash: options.upgradedHash,
                  password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
                }
              : {}),
            updated_at: now,
          },
        });
      }

      await tx.rndtechnosoft_user_sessions.create({
        data: {
          id: randomUUID(),
          user_id: userId,
          tenant_id: activeTenant.tenantId,
          tenant_member_id: member.id,
          token_hash: this.hashToken(token),
          issued_ip_address: this.truncate(context.ipAddress, 64),
          user_agent: this.truncate(context.userAgent, 255),
          expires_at: expiresAt,
        },
      });
    });

    this.logger.log(
      `Tenant sign-in succeeded userId=${userId} tenantId=${activeTenant.tenantId}`,
    );

    return {
      token,
      expiresAt,
      user: { id: userId, email: options.email, displayName: options.displayName },
      activeTenant,
      availableTenants: memberships,
      access: await this.loadAccess(activeTenant.tenantId, member.id),
    };
  }

  /**
   * Resolves a bearer token to a tenant identity.
   *
   * Re-checks on every request, so revoking a membership, suspending a tenant
   * or deactivating a user takes effect immediately rather than at expiry.
   */
  async resolveSession(token: string): Promise<AuthenticatedTenantUser> {
    if (!token) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const session = await this.prisma.rndtechnosoft_user_sessions.findUnique({
      where: { token_hash: this.hashToken(token) },
      include: {
        rndtechnosoft_users: true,
        rndtechnosoft_tenant_members: {
          include: {
            rndtechnosoft_tenants: true,
            rndtechnosoft_tenant_member_roles: { include: { rndtechnosoft_roles: true } },
          },
        },
      },
    });

    const now = new Date();

    if (!session || session.revoked_at !== null || session.expires_at <= now) {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    const user = session.rndtechnosoft_users;
    const member = session.rndtechnosoft_tenant_members;

    if (user.user_status !== 'ACTIVE') {
      throw new UnauthorizedException('Your session has expired. Sign in again.');
    }

    if (member.membership_status !== 'ACTIVE') {
      throw new ForbiddenException('Your access to this workspace has been removed.');
    }

    if (!['ACTIVE', 'TRIALING'].includes(member.rndtechnosoft_tenants.tenant_status)) {
      throw new ForbiddenException('This workspace is not currently active.');
    }

    if (now.getTime() - session.last_used_at.getTime() > 60_000) {
      await this.prisma.rndtechnosoft_user_sessions.update({
        where: { id: session.id },
        data: { last_used_at: now },
      });
    }

    return {
      userId: user.id,
      email: user.email,
      displayName: user.display_name,
      sessionId: session.id,
      // Tenant scope comes from the stored session, never from the request.
      tenantId: session.tenant_id,
      tenantMemberId: session.tenant_member_id,
      roles: member.rndtechnosoft_tenant_member_roles.map(
        (link) => link.rndtechnosoft_roles.role_code,
      ),
    };
  }

  /** Issues a new session pinned to a different tenant the user belongs to. */
  async switchTenant(
    identity: AuthenticatedTenantUser,
    targetTenantId: string,
    context: LoginContext = {},
  ): Promise<TenantSessionResult> {
    if (!targetTenantId) {
      throw new BadRequestException('Choose a workspace to switch to.');
    }

    const memberships = await this.loadMemberships(identity.userId);
    const target = memberships.find((membership) => membership.tenantId === targetTenantId);

    if (!target) {
      // Same answer whether the tenant does not exist or the user is not a
      // member, so membership cannot be probed.
      throw new ForbiddenException('You do not have access to that workspace.');
    }

    // The previous session is retired so one token maps to exactly one tenant.
    await this.prisma.rndtechnosoft_user_sessions.updateMany({
      where: { id: identity.sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });

    return this.issueSession(identity.userId, target, memberships, context, {
      email: identity.email,
      displayName: identity.displayName,
    });
  }

  async logout(identity: AuthenticatedTenantUser): Promise<void> {
    await this.prisma.rndtechnosoft_user_sessions.updateMany({
      where: { id: identity.sessionId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }

  async revokeOtherSessions(identity: AuthenticatedTenantUser): Promise<number> {
    const result = await this.prisma.rndtechnosoft_user_sessions.updateMany({
      where: { user_id: identity.userId, revoked_at: null, id: { not: identity.sessionId } },
      data: { revoked_at: new Date() },
    });

    return result.count;
  }

  async getProfile(identity: AuthenticatedTenantUser): Promise<{
    user: { id: string; email: string; displayName: string | null };
    activeTenant: TenantMembershipSummary | null;
    availableTenants: TenantMembershipSummary[];
    roles: string[];
    access: TenantAccessSummary;
  }> {
    const [memberships, access] = await Promise.all([
      this.loadMemberships(identity.userId),
      this.loadAccess(identity.tenantId, identity.tenantMemberId),
    ]);

    return {
      user: {
        id: identity.userId,
        email: identity.email,
        displayName: identity.displayName,
      },
      activeTenant:
        memberships.find((membership) => membership.tenantId === identity.tenantId) ?? null,
      availableTenants: memberships,
      roles: identity.roles,
      access,
    };
  }

  async changePassword(
    identity: AuthenticatedTenantUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!newPassword || newPassword.length < 10) {
      throw new BadRequestException('New password must be at least 10 characters long.');
    }

    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: identity.userId },
    });

    if (!user || !user.password_hash) {
      throw new UnauthorizedException('Account not found.');
    }

    const { isValid } = await verifyPassword(currentPassword, user.password_hash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const passwordHash = await hashPassword(newPassword);
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.rndtechnosoft_users.update({
        where: { id: identity.userId },
        data: {
          password_hash: passwordHash,
          password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: now,
        },
      }),
      // A password change ends every other session.
      this.prisma.rndtechnosoft_user_sessions.updateMany({
        where: { user_id: identity.userId, revoked_at: null, id: { not: identity.sessionId } },
        data: { revoked_at: now },
      }),
    ]);
  }
}
