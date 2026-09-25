import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { LoginThrottleService, ThrottleRule } from '@/common/security/login-throttle.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ACCOUNT_SETUP_TOKEN_PATTERN, hashAccountSetupToken } from '@/common/security/account-setup-token';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';

const INVALID_LINK = 'This setup link is invalid, already used or expired. Ask your administrator to send a new one.';

/** Wrong or stale links from one network address. */
const SETUP_IP_RULE = { limit: 20, windowMinutes: 15, blockMinutes: 15 };

interface RequestContext {
  hostHeader: string | undefined;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * First-password setup from a one-time emailed link. The link identifies the
 * account and the workspace; opened at a workspace address it must be that
 * workspace's. Nothing reveals whether a given link ever existed.
 */
@Injectable()
export class AccountSetupService {
  private readonly logger = new Logger(AccountSetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly throttle: LoginThrottleService,
    private readonly domains: TenantDomainsService,
  ) {}

  /** What the link is for, so the page can greet the person before they choose a password. */
  async inspect(token: string, context: RequestContext) {
    const link = await this.usableLink(token, context);
    return {
      email: link.rndtechnosoft_users.email,
      name: link.rndtechnosoft_users.display_name,
      workspace: link.rndtechnosoft_tenants.display_name,
      expiresAt: link.expires_at,
    };
  }

  async complete(token: string, password: string, context: RequestContext) {
    const link = await this.usableLink(token, context);
    const now = new Date();
    const passwordHash = await hashPassword(password);

    const completed = await this.prisma.$transaction(async (tx) => {
      // Both updates are conditional, so two submissions of one link cannot both succeed.
      const claimed = await tx.rndtechnosoft_account_setup_tokens.updateMany({
        where: { id: link.id, used_at: null, revoked_at: null, expires_at: { gt: now } },
        data: { used_at: now },
      });
      if (claimed.count !== 1) return false;

      const updated = await tx.rndtechnosoft_users.updateMany({
        where: { id: link.user_id, password_hash: null },
        data: {
          password_hash: passwordHash,
          password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
          email_verified_at: link.rndtechnosoft_users.email_verified_at ?? now,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: now,
        },
      });
      if (updated.count !== 1) throw new BadRequestException(INVALID_LINK);
      return true;
    });
    if (!completed) throw new BadRequestException(INVALID_LINK);

    await this.audit.log({
      tenantId: link.tenant_id,
      actorUserId: link.user_id,
      actionCode: 'ACCOUNT_SETUP_COMPLETED',
      entityType: 'USER',
      entityId: link.user_id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { email: link.rndtechnosoft_users.email, workspace: link.rndtechnosoft_tenants.display_name };
  }

  private async usableLink(token: string, context: RequestContext) {
    const ipRule: ThrottleRule = { key: `setup:ip:${(context.ipAddress || 'unknown').slice(0, 110)}`, ...SETUP_IP_RULE };
    await this.throttle.assertNotBlocked([ipRule.key]);

    const link = ACCOUNT_SETUP_TOKEN_PATTERN.test(token)
      ? await this.prisma.rndtechnosoft_account_setup_tokens.findUnique({
          where: { token_hash: hashAccountSetupToken(token) },
          include: {
            rndtechnosoft_users: { select: { email: true, display_name: true, user_status: true, password_hash: true, email_verified_at: true } },
            rndtechnosoft_tenants: { select: { display_name: true, tenant_status: true } },
          },
        })
      : null;

    const usable =
      link !== null &&
      link.used_at === null &&
      link.revoked_at === null &&
      link.expires_at > new Date() &&
      link.rndtechnosoft_users.user_status === 'ACTIVE' &&
      link.rndtechnosoft_users.password_hash === null &&
      link.rndtechnosoft_tenants.tenant_status !== 'SUSPENDED';

    if (!link || !usable) {
      await this.throttle.recordFailure([ipRule]);
      this.logger.warn(`Account setup refused reason=${link ? 'NOT_USABLE' : 'UNKNOWN_LINK'}`);
      throw new BadRequestException(INVALID_LINK);
    }

    // A link opened at another workspace's address is refused like a sign-in there.
    this.domains.tenantForSignIn(await this.domains.resolveHost(context.hostHeader), link.tenant_id);
    return link;
  }
}
