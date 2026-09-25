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
import { issueAccountSetupToken } from '@/common/security/account-setup-token';
import { PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { TenantDomainsService, platformBaseDomain } from '@/modules/tenancy/tenant-domains.service';
import { EmailService, PlatformActor, SendOutcome } from '@/modules/email/email.service';
import { INDUSTRY_TYPES } from '@/modules/tenants/dto/organization-settings.dto';
import { ProvisioningCheckQueryDto, ProvisionTenantDto } from './dto/provision-tenant.dto';

const OWNER_ROLE_NAME = 'Administrator';

type EmailStatus = 'NOT_SENT' | 'QUEUED' | 'SENT' | 'FAILED';

/** A unique-constraint failure on one of the named columns or indexes (Prisma reports either). */
const isUniqueViolation = (error: unknown, ...targets: string[]) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === 'P2002' &&
  targets.some((target) => JSON.stringify(error.meta?.target ?? '').includes(target));

const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/**
 * Onboarding a customer workspace from the platform console: one transaction
 * creates the workspace, its address, organization profile, modules, owner
 * (with the existing Administrator role) and optional subscription; the
 * onboarding email is sent only after that commits, and its real outcome is
 * recorded. A failed email never undoes the workspace.
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

    const plan = input.subscription ? await this.subscriptionPlan(input) : null;
    const tenantCode = input.tenantCode.toUpperCase();
    const ownerEmail = input.ownerEmail.toLowerCase();
    const ownerName = [input.ownerFirstName, input.ownerLastName].filter(Boolean).join(' ');
    const tenantId = randomUUID();
    const now = new Date();

    let created: { subdomain: string; ownerUserId: string; ownerIsNew: boolean; setup: { token: string; expiresAt: Date } | null };
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
          select: { id: true, user_status: true, password_hash: true },
        });
        const ownerIsNew = owner === null;
        if (owner && owner.user_status !== 'ACTIVE') {
          throw new ConflictException('That owner email belongs to a disabled account. Re-enable it in User management or use another email.');
        }
        if (!owner) {
          // No password: the owner chooses one from the emailed setup link.
          owner = await tx.rndtechnosoft_users.create({
            data: {
              id: randomUUID(),
              email: ownerEmail,
              password_hash: null,
              password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
              display_name: ownerName,
              mobile_number: input.ownerPhone || null,
              user_status: 'ACTIVE',
            },
            select: { id: true, user_status: true, password_hash: true },
          });
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

        const setup = owner.password_hash
          ? null
          : await issueAccountSetupToken(tx, { userId: owner.id, tenantId, superAdminId: actor.superAdminId });

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

        return { subdomain, ownerUserId: owner.id, ownerIsNew, setup };
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
      setup: created.setup,
      actor,
    });
    return { replayed: false, ...(await this.describe(tenantId, outcome)) };
  }

  /** Sends the onboarding email again, with a new setup link if the owner still has no password. */
  async resendOnboardingEmail(tenantId: string, actor: PlatformActor) {
    const onboarding = await this.prisma.rndtechnosoft_tenant_onboardings.findUnique({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_users: { select: { id: true, email: true, display_name: true, password_hash: true, user_status: true } },
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

    let setup: { token: string; expiresAt: Date } | null = null;
    if (!owner.password_hash) {
      try {
        setup = await issueAccountSetupToken(this.prisma, { userId: owner.id, tenantId, superAdminId: actor.superAdminId });
      } catch (error) {
        if (isUniqueViolation(error, 'user_id', 'uq_account_setup_tokens_open')) throw new ConflictException('A new setup link is already being sent. Refresh in a moment.');
        throw error;
      }
    }

    const outcome = await this.sendOnboardingEmail({
      tenantId,
      organizationName: onboarding.rndtechnosoft_tenants.display_name,
      ownerName: owner.display_name,
      ownerEmail: owner.email,
      subdomain,
      setup,
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

  private async subscriptionPlan(input: ProvisionTenantDto) {
    const subscription = input.subscription!;
    const plan = await this.prisma.rndtechnosoft_plans.findFirst({
      where: { plan_code: subscription.planCode, plan_status: 'ACTIVE' },
      select: { id: true, plan_code: true },
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

  private async sendOnboardingEmail(input: {
    tenantId: string;
    organizationName: string;
    ownerName: string | null;
    ownerEmail: string;
    subdomain: string;
    setup: { token: string; expiresAt: Date } | null;
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
            // The token rides in the fragment, which browsers never send to a server.
            setupUrl: input.setup ? `${workspaceUrl}/#setup=${input.setup.token}` : null,
            setupExpiresAt: input.setup?.expiresAt ?? null,
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
      { deliveryId: outcome.deliveryId, status: outcome.status, includesSetupLink: Boolean(input.setup) },
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
        rndtechnosoft_users: { select: { id: true, email: true, display_name: true, password_hash: true } },
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
        passwordSet: owner.password_hash !== null,
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
