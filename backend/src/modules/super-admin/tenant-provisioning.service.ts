import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  ADMIN_ROLE_CODE,
  MODULES,
  ModuleCode,
  moduleCapabilities,
  unmetModuleRequirements,
} from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { generateTemporaryPassword, hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { TenantDomainsService, platformBaseDomain } from '@/modules/tenancy/tenant-domains.service';
import { EmailService, PlatformActor, SendOutcome } from '@/modules/email/email.service';
import { INDUSTRY_TYPES } from '@/modules/tenants/dto/organization-settings.dto';
import { ProvisioningCheckQueryDto, ProvisionSubscriptionDto, ProvisionTenantDto } from './dto/provision-tenant.dto';

const OWNER_ROLE_NAME = 'Administrator';

type EmailStatus = 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED';

/** A unique-constraint failure on one of the named columns or indexes (Prisma reports either). */
const isUniqueViolation = (error: unknown, ...targets: string[]) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  targets.some((target) => JSON.stringify(error.meta?.target ?? '').includes(target));

export const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/** The active plan a subscription names, after checking its dates make sense together. */
export async function activeSubscriptionPlan(prisma: PrismaService, subscription: ProvisionSubscriptionDto) {
  const plan = await prisma.rndtechnosoft_plans.findFirst({
    where: { plan_code: subscription.planCode, plan_status: 'ACTIVE' },
    select: { id: true, plan_code: true, plan_name: true },
  });
  if (!plan) throw new BadRequestException('That plan does not exist or is not active.');
  if (subscription.endsOn && subscription.endsOn < subscription.startsOn) {
    throw new BadRequestException('The subscription cannot end before it starts.');
  }
  if (subscription.status === 'TRIALING' && !subscription.trialEndsOn) {
    throw new BadRequestException('Enter when the trial ends.');
  }
  if (subscription.trialEndsOn && subscription.trialEndsOn < subscription.startsOn) {
    throw new BadRequestException('The trial cannot end before the subscription starts.');
  }
  return plan;
}

/** An owner who has never chosen a password of their own is sent a (new) temporary one. */
const needsTemporaryPassword = (owner: { password_hash: string | null; must_change_password: boolean }) =>
  owner.password_hash === null || owner.must_change_password;

/**
 * Onboarding a customer workspace from the platform console: one transaction
 * creates the workspace, its address, organization profile, modules, owner
 * (with the existing Administrator role) and optional subscription; the
 * onboarding email is sent only after that commits, and its real outcome is
 * recorded. A failed email never undoes the workspace.
 *
 * A new owner gets a random temporary password. Only its hash is stored; the
 * plaintext lives in memory until the email is handed to the mail server and
 * is never logged or returned. The owner must replace it at first sign-in.
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly domains: TenantDomainsService,
    private readonly email: EmailService,
  ) {}

  /** What the provisioning form can offer, from the real catalog and settings. */
  async options() {
    const [plans, smtp] = await Promise.all([
      this.prisma.rndtechnosoft_plans.findMany({
        where: { plan_status: 'ACTIVE' },
        orderBy: { plan_name: 'asc' },
        select: { plan_code: true, plan_name: true, billing_interval: true },
      }),
      this.email.getSmtpSettings(),
    ]);
    return {
      baseDomain: platformBaseDomain(),
      linksAvailable: this.domains.workspaceUrl('example') !== null,
      emailConfigured: smtp.configured,
      industries: INDUSTRY_TYPES,
      ownerRole: { code: ADMIN_ROLE_CODE, name: OWNER_ROLE_NAME },
      modules: MODULES.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        requires: [...m.requires],
        capabilities: moduleCapabilities(m.code),
      })),
      plans: plans.map((p) => ({ code: p.plan_code, name: p.plan_name, billingInterval: p.billing_interval })),
    };
  }

  /** Whether a tenant code and subdomain are free, for the form. Provisioning checks again. */
  async check(query: ProvisioningCheckQueryDto) {
    const tenantCode = query.tenantCode?.trim().toUpperCase();
    const codeTaken = tenantCode
      ? (await this.prisma.rndtechnosoft_tenants.count({ where: { tenant_code: tenantCode } })) > 0
      : null;
    return {
      tenantCode: tenantCode ? { value: tenantCode, available: !codeTaken } : null,
      subdomain: query.subdomain ? await this.domains.availability(query.subdomain) : null,
    };
  }

  async provision(input: ProvisionTenantDto, actor: PlatformActor) {
    const earlier = await this.prisma.rndtechnosoft_tenant_onboardings.findUnique({
      where: { idempotency_key: input.idempotencyKey },
      select: { tenant_id: true },
    });
    if (earlier) return { replayed: true, ...(await this.describe(earlier.tenant_id)) };

    const states = Object.fromEntries(MODULES.map((m) => [m.code, input.modules.includes(m.code)])) as Record<ModuleCode, boolean>;
    const unmet = unmetModuleRequirements(states);
    if (unmet.length > 0) {
      const name = (code: ModuleCode) => MODULES.find((m) => m.code === code)?.name ?? code;
      throw new BadRequestException(
        unmet.map((u) => `${name(u.module)} requires ${u.missing.map(name).join(' and ')}.`).join(' '),
      );
    }

    const plan = input.subscription ? await activeSubscriptionPlan(this.prisma, input.subscription) : null;
    const tenantCode = input.tenantCode.toUpperCase();
    const ownerEmail = input.ownerEmail.toLowerCase();
    const ownerName = [input.ownerFirstName, input.ownerLastName].filter(Boolean).join(' ');
    const tenantId = randomUUID();
    const now = new Date();

    let created: { subdomain: string; temporaryPassword: string | null };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_tenants.create({
          data: {
            id: tenantId,
            tenant_code: tenantCode,
            legal_name: input.legalName,
            display_name: input.organizationName,
            country_code: input.countryCode || null,
            default_currency_code: input.currency,
            tenant_status: 'ACTIVE',
          },
        });

        const subdomain = await this.domains.assignPrimarySubdomain(tx, tenantId, {
          requested: input.subdomain || undefined,
          derivedFrom: tenantCode,
        });

        await tx.rndtechnosoft_tenant_quotas.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            user_seats_limit: 25,
            branch_limit: 3,
            storage_limit_mb: 25600,
            monthly_ai_tokens: 250000,
            monthly_whatsapp_credits: 1000,
          },
        });

        // The same profile keys the workspace edits in its own organization settings.
        await tx.rndtechnosoft_tenant_settings.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            settings: {
              profile: {
                company_name: input.organizationName,
                industry_type: input.industry || null,
                currency: input.currency,
                timezone: input.timezone,
                tax_gstin: input.taxId || null,
                website_url: input.website || null,
                primary_contact_name: input.contactName || null,
                primary_contact_email: input.contactEmail?.toLowerCase() || null,
                primary_contact_phone: input.contactPhone || null,
                company_address: input.address || null,
              },
              modules: MODULES.map((m) => ({ id: m.code, is_enabled: states[m.code] })),
            },
          },
        });

        let owner = await tx.rndtechnosoft_users.findUnique({
          where: { email: ownerEmail },
          select: { id: true, user_status: true, password_hash: true, must_change_password: true },
        });
        const ownerIsNew = owner === null;
        if (owner && owner.user_status !== 'ACTIVE') {
          throw new ConflictException('That owner email belongs to a disabled account. Re-enable it in User management or use another email.');
        }
        // An existing account keeps the password its owner chose; anyone else gets a temporary one.
        let temporaryPassword: string | null = null;
        if (!owner) {
          temporaryPassword = generateTemporaryPassword();
          owner = await tx.rndtechnosoft_users.create({
            data: {
              id: randomUUID(),
              email: ownerEmail,
              password_hash: await hashPassword(temporaryPassword),
              password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
              must_change_password: true,
              display_name: ownerName,
              mobile_number: input.ownerPhone || null,
              user_status: 'ACTIVE',
            },
            select: { id: true, user_status: true, password_hash: true, must_change_password: true },
          });
        } else if (needsTemporaryPassword(owner)) {
          temporaryPassword = generateTemporaryPassword();
          await this.replaceWithTemporaryPassword(tx, owner.id, temporaryPassword);
        }

        const roleId = randomUUID();
        await tx.rndtechnosoft_roles.create({
          data: {
            id: roleId,
            tenant_id: tenantId,
            role_code: ADMIN_ROLE_CODE,
            role_name: OWNER_ROLE_NAME,
            is_system_role: true,
            role_status: 'ACTIVE',
          },
        });
        await grantDefaultRolePermissions(tx, tenantId, roleId, ADMIN_ROLE_CODE);

        const memberId = randomUUID();
        await tx.rndtechnosoft_tenant_members.create({
          data: { id: memberId, tenant_id: tenantId, user_id: owner.id, membership_status: 'ACTIVE', invited_at: now, joined_at: now },
        });
        await tx.rndtechnosoft_tenant_member_roles.create({
          data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId },
        });

        if (plan && input.subscription) {
          await tx.rndtechnosoft_tenant_subscriptions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              plan_id: plan.id,
              subscription_status: input.subscription.status,
              starts_on: dateOnly(input.subscription.startsOn),
              ends_on: input.subscription.endsOn ? dateOnly(input.subscription.endsOn) : null,
              trial_ends_on: input.subscription.trialEndsOn ? dateOnly(input.subscription.trialEndsOn) : null,
            },
          });
        }

        await tx.rndtechnosoft_tenant_onboardings.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            idempotency_key: input.idempotencyKey,
            owner_user_id: owner.id,
            owner_is_new_account: ownerIsNew,
            provisioned_by_super_admin_id: actor.superAdminId,
          },
        });

        await this.log(tx, actor, tenantId, 'TENANT_PROVISIONED', `Provisioned workspace ${input.organizationName} (${tenantCode})`, {
          tenantCode,
          subdomain,
          modules: input.modules,
          plan: plan?.plan_code ?? null,
          ownerIsNewAccount: ownerIsNew,
        });

        return { subdomain, temporaryPassword };
      });
    } catch (error) {
      // The same submission arrived twice and the other request created it
      // first: this one then collides on the tenant code, address or key.
      const winner = await this.prisma.rndtechnosoft_tenant_onboardings.findUnique({
        where: { idempotency_key: input.idempotencyKey },
        select: { tenant_id: true },
      });
      if (winner) return { replayed: true, ...(await this.describe(winner.tenant_id)) };
      if (isUniqueViolation(error, 'tenant_code', 'uq_tenants_1')) throw new ConflictException('That tenant code is already in use.');
      throw error;
    }

    const outcome = await this.sendOnboardingEmail({
      tenantId,
      organizationName: input.organizationName,
      ownerName: ownerName || null,
      ownerEmail,
      subdomain: created.subdomain,
      temporaryPassword: created.temporaryPassword,
      actor,
    });
    return { replayed: false, ...(await this.describe(tenantId, outcome)) };
  }

  /**
   * Sends the onboarding email again. If the owner has not yet replaced their
   * temporary password, it carries a new one and the earlier one stops working.
   */
  async resendOnboardingEmail(tenantId: string, actor: PlatformActor) {
    const onboarding = await this.prisma.rndtechnosoft_tenant_onboardings.findUnique({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_users: {
          select: { id: true, email: true, display_name: true, password_hash: true, must_change_password: true, user_status: true },
        },
        rndtechnosoft_tenants: { select: { display_name: true, tenant_status: true } },
      },
    });
    if (!onboarding) throw new NotFoundException('This workspace was not onboarded from HQ, so there is no onboarding email to send.');
    if (onboarding.rndtechnosoft_tenants.tenant_status === 'SUSPENDED') {
      throw new BadRequestException('Reactivate the workspace before sending its onboarding email.');
    }
    const owner = onboarding.rndtechnosoft_users;
    if (owner.user_status !== 'ACTIVE') throw new BadRequestException("The owner's account is disabled.");

    const subdomain = (await this.domains.primarySubdomains([tenantId])).get(tenantId)?.subdomain;
    if (!subdomain) throw new BadRequestException('This workspace has no address.');
    // Checked before a new password is issued, so the owner's current one is not replaced by one nobody receives.
    if (!this.domains.workspaceUrl(subdomain)) {
      throw new BadRequestException('The workspace has no web address yet (PLATFORM_BASE_DOMAIN is not set), so the email would have no working link.');
    }
    if (!(await this.email.getSmtpSettings()).configured) {
      throw new BadRequestException('Outgoing email is not set up. Configure SMTP in Global Settings, then send the email again.');
    }

    let temporaryPassword: string | null = null;
    if (needsTemporaryPassword(owner)) {
      const fresh = generateTemporaryPassword();
      const issued = await this.prisma.$transaction((tx) =>
        // Conditional on the hash just read, so two resends at once cannot both issue a password.
        this.replaceWithTemporaryPassword(tx, owner.id, fresh, owner.password_hash),
      );
      if (!issued) throw new ConflictException('A new onboarding email is already being sent. Refresh in a moment.');
      temporaryPassword = fresh;
    }

    const outcome = await this.sendOnboardingEmail({
      tenantId,
      organizationName: onboarding.rndtechnosoft_tenants.display_name,
      ownerName: owner.display_name,
      ownerEmail: owner.email,
      subdomain,
      temporaryPassword,
      actor,
    });
    return this.describe(tenantId, outcome);
  }

  /** The onboarding record of a workspace, built from stored data; null if it was not onboarded from HQ. */
  async onboardingStatus(tenantId: string) {
    const exists = await this.prisma.rndtechnosoft_tenant_onboardings.count({ where: { tenant_id: tenantId } });
    return exists ? this.describe(tenantId) : null;
  }

  // ── Internals ────────────────────────────────────────────────

  /**
   * Replaces the owner's password with a temporary one they must change at
   * next sign-in, and ends their sessions. With `expectedHash`, only if the
   * password is still the one read; returns whether it was replaced.
   */
  private async replaceWithTemporaryPassword(
    tx: Prisma.TransactionClient,
    userId: string,
    temporaryPassword: string,
    expectedHash?: string | null,
  ): Promise<boolean> {
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
    if (updated.count !== 1) return false;
    await tx.rndtechnosoft_user_sessions.updateMany({ where: { user_id: userId, revoked_at: null }, data: { revoked_at: now } });
    return true;
  }

  private async sendOnboardingEmail(input: {
    tenantId: string;
    organizationName: string;
    ownerName: string | null;
    ownerEmail: string;
    subdomain: string;
    temporaryPassword: string | null;
    actor: PlatformActor;
  }): Promise<SendOutcome> {
    const workspaceUrl = this.domains.workspaceUrl(input.subdomain);
    let outcome: SendOutcome;
    if (!workspaceUrl) {
      outcome = {
        status: 'NOT_SENT',
        deliveryId: null,
        error: 'The workspace has no web address yet (PLATFORM_BASE_DOMAIN is not set), so the email would have no working link.',
      };
    } else {
      try {
        outcome = await this.email.sendTenantOnboardingEmail(
          {
            organizationName: input.organizationName,
            ownerName: input.ownerName,
            ownerEmail: input.ownerEmail,
            workspaceUrl,
            temporaryPassword: input.temporaryPassword,
          },
          { tenantId: input.tenantId, requestedBySuperAdminId: input.actor.superAdminId },
        );
      } catch (error) {
        this.logger.error(`Onboarding email could not be attempted tenantId=${input.tenantId}: ${error instanceof Error ? error.name : 'unknown'}`);
        outcome = { status: 'NOT_SENT', deliveryId: null, error: 'The onboarding email could not be sent because of a server error. Send it again from the workspace page.' };
      }
    }

    if (outcome.deliveryId) {
      await this.prisma.rndtechnosoft_tenant_onboardings.update({
        where: { tenant_id: input.tenantId },
        data: { onboarding_email_delivery_id: outcome.deliveryId, updated_at: new Date() },
      });
    }
    const action = outcome.status === 'SENT' ? 'ONBOARDING_EMAIL_SENT' : outcome.status === 'FAILED' ? 'ONBOARDING_EMAIL_FAILED' : 'ONBOARDING_EMAIL_NOT_SENT';
    await this.log(
      this.prisma,
      input.actor,
      input.tenantId,
      action,
      outcome.status === 'SENT' ? 'Sent the onboarding email to the workspace owner' : `Onboarding email not delivered: ${outcome.error}`,
      { deliveryId: outcome.deliveryId, status: outcome.status, includesTemporaryPassword: input.temporaryPassword !== null },
    );
    return outcome;
  }

  /** The provisioning result, from stored records. */
  private async describe(tenantId: string, latest?: SendOutcome) {
    const onboarding = await this.prisma.rndtechnosoft_tenant_onboardings.findUniqueOrThrow({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_tenants: {
          select: {
            id: true,
            tenant_code: true,
            display_name: true,
            legal_name: true,
            tenant_status: true,
            created_at: true,
            rndtechnosoft_tenant_settings: { select: { settings: true } },
            rndtechnosoft_tenant_subscriptions: {
              orderBy: { created_at: 'desc' },
              take: 1,
              include: { rndtechnosoft_plans: { select: { plan_code: true, plan_name: true } } },
            },
          },
        },
        rndtechnosoft_users: { select: { id: true, email: true, display_name: true, password_hash: true, must_change_password: true } },
        rndtechnosoft_email_deliveries: true,
      },
    });
    const tenant = onboarding.rndtechnosoft_tenants;
    const owner = onboarding.rndtechnosoft_users;
    const delivery = onboarding.rndtechnosoft_email_deliveries;
    const subdomain = (await this.domains.primarySubdomains([tenantId])).get(tenantId)?.subdomain ?? null;
    const storedModules = (tenant.rndtechnosoft_tenant_settings?.settings as { modules?: unknown } | null)?.modules;
    const enabled = new Set(
      Array.isArray(storedModules)
        ? storedModules.filter((m) => m && typeof m === 'object' && (m as { is_enabled?: unknown }).is_enabled === true).map((m) => (m as { id: string }).id)
        : [],
    );
    const subscription = tenant.rndtechnosoft_tenant_subscriptions[0] ?? null;

    let emailStatus: EmailStatus = delivery ? (delivery.delivery_status as EmailStatus) : 'NOT_SENT';
    let emailError = delivery?.error_message ?? null;
    if (!delivery) {
      emailError = latest?.error ?? 'No onboarding email has been sent yet.';
      emailStatus = 'NOT_SENT';
    }

    return {
      tenant: {
        id: tenant.id,
        tenantCode: tenant.tenant_code,
        name: tenant.display_name,
        legalName: tenant.legal_name,
        status: tenant.tenant_status,
        createdAt: tenant.created_at,
      },
      address: subdomain
        ? { subdomain, hostname: this.domains.addressOf(subdomain), url: this.domains.workspaceUrl(subdomain) }
        : null,
      owner: {
        userId: owner.id,
        email: owner.email,
        name: owner.display_name,
        role: OWNER_ROLE_NAME,
        isNewAccount: onboarding.owner_is_new_account,
        // TEMPORARY: the owner has not yet replaced the password from the onboarding email.
        passwordStatus: owner.password_hash === null ? 'NOT_SET' : owner.must_change_password ? 'TEMPORARY' : 'SET',
      },
      modules: MODULES.map((m) => ({ code: m.code, name: m.name, enabled: enabled.has(m.code) })),
      subscription: subscription
        ? {
            planCode: subscription.rndtechnosoft_plans.plan_code,
            planName: subscription.rndtechnosoft_plans.plan_name,
            status: subscription.subscription_status,
            startsOn: isoDate(subscription.starts_on),
            endsOn: isoDate(subscription.ends_on),
            trialEndsOn: isoDate(subscription.trial_ends_on),
          }
        : null,
      onboardingEmail: {
        status: emailStatus,
        recipient: delivery?.recipient_email ?? owner.email,
        error: emailStatus === 'SENT' ? null : emailError,
        sentAt: delivery?.sent_at ?? null,
        attemptedAt: delivery?.created_at ?? null,
      },
      provisionedAt: onboarding.created_at,
    };
  }

  private async log(
    db: Pick<Prisma.TransactionClient, 'rndtechnosoft_platform_activity_logs'>,
    actor: PlatformActor,
    tenantId: string,
    action: string,
    description: string,
    metadata: Record<string, unknown>,
  ) {
    await db.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: actor.superAdminId,
        category: 'TENANT',
        action,
        target_tenant_id: tenantId,
        description: description.slice(0, 500),
        metadata: metadata as Prisma.InputJsonValue,
        ip_address: actor.ipAddress ? actor.ipAddress.slice(0, 64) : null,
        user_agent: actor.userAgent ? actor.userAgent.slice(0, 255) : null,
      },
    });
  }
}
