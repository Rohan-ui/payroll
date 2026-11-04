import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { ADMIN_ROLE_CODE, MODULES, moduleFeatures, resolveModuleStates } from '@/common/access/access-catalog';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { SEAT_MEMBERSHIP_STATUSES } from '@/common/tenancy/seats';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { describeSmtpFailure } from '@/modules/email/email.service';
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
  isPlatformEncryptionConfigured,
} from '@/modules/super-admin/auth/platform-crypto.util';
import {
  SaveSmtpSettingsDto,
  SaveWhatsAppSettingsDto,
  TestSmtpSettingsDto,
  TestWhatsAppSettingsDto,
  UpdateOrganizationProfileDto,
} from './dto/organization-settings.dto';

type JsonRecord = Record<string, unknown>;
type SettingsSection = 'profile' | 'smtp' | 'whatsapp' | 'modules' | 'email';

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const PROFILE_FIELDS = [
  'company_name',
  'industry_type',
  'currency',
  'timezone',
  'tax_gstin',
  'website_url',
  'primary_contact_name',
  'primary_contact_email',
  'primary_contact_phone',
  'company_address',
] as const;

/**
 * Webhook verify tokens that earlier builds filled in by default. They are
 * published in source, so a stored copy is treated as "not configured".
 */
const PUBLIC_DEFAULT_VERIFY_TOKENS = ['rnd_voogyo_verify_token_2026', 'voogyo_verify'];

/**
 * Organization profile and outbound channel settings for the session's tenant.
 *
 * Everything is keyed by the tenant id from the session. Secrets (SMTP
 * password, WhatsApp tokens) are encrypted at rest and never returned; reads
 * report only whether one is stored.
 */
@Injectable()
export class OrganizationSettingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly auditService: AuditService,
    private readonly domains: TenantDomainsService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.encryptLegacyPlaintextSecrets();
  }

  // ── Reads ────────────────────────────────────────────────────

  /** Identity of the current workspace, without its settings document. */
  async getCurrentTenant(tenantId: string) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        tenant_code: true,
        legal_name: true,
        display_name: true,
        country_code: true,
        default_currency_code: true,
        tenant_status: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Workspace not found.');
    }

    return tenant;
  }

  async getSettings(tenantId: string) {
    const [tenant, settings, quotas, owner, subdomain] = await Promise.all([
      this.getCurrentTenant(tenantId),
      this.readSettings(tenantId),
      this.prisma.rndtechnosoft_tenant_quotas.findUnique({ where: { tenant_id: tenantId } }),
      this.findWorkspaceOwner(tenantId),
      this.subdomainOf(tenantId),
    ]);

    const profile = asRecord(settings.profile);
    const savedContactEmail = text(profile.primary_contact_email);

    return {
      tenant: {
        id: tenant.id,
        tenant_code: tenant.tenant_code,
        company_name: text(profile.company_name) ?? tenant.display_name,
        legal_name: tenant.legal_name,
        subdomain,
        industry_type: text(profile.industry_type),
        currency: text(profile.currency) ?? tenant.default_currency_code,
        timezone: text(profile.timezone) ?? text(settings.timezone),
        tax_gstin: text(profile.tax_gstin),
        website_url: text(profile.website_url),
        // Until a contact is saved, the workspace owner (the first administrator)
        // is shown, never the person who happens to be signed in.
        primary_contact_name: savedContactEmail
          ? text(profile.primary_contact_name)
          : text(profile.primary_contact_name) ?? owner?.display_name ?? null,
        primary_contact_email: savedContactEmail ?? owner?.email ?? null,
        primary_contact_phone: text(profile.primary_contact_phone),
        company_address: text(profile.company_address),
        contact_is_workspace_owner: !savedContactEmail && Boolean(owner),
      },
      smtp: this.toPublicSmtp(settings.smtp),
      email: { personalAccounts: this.personalAccountsOf(settings.email) },
      whatsapp: this.toPublicWhatsApp(settings.whatsapp),
      quotas: quotas
        ? {
            user_seats_limit: quotas.user_seats_limit,
            branch_limit: quotas.branch_limit,
            storage_limit_mb: quotas.storage_limit_mb,
            monthly_ai_tokens: quotas.monthly_ai_tokens,
            monthly_whatsapp_credits: quotas.monthly_whatsapp_credits,
          }
        : null,
    };
  }

  // ── Organization profile ─────────────────────────────────────

  async updateProfile(tenantId: string, input: UpdateOrganizationProfileDto, actor: AuthenticatedTenantUser) {
    const changedFields = await this.saveProfile(tenantId, input);

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'ORGANIZATION_PROFILE_UPDATED',
      entityType: 'TENANT',
      entityId: tenantId,
      // Field names only: contact details and tax identifiers stay out of the audit trail.
      metadata: { changedFields },
    });

    return {
      success: true,
      message: 'Organization profile saved.',
      data: (await this.getSettings(tenantId)).tenant,
    };
  }

  /**
   * Saves the organization profile and the workspace columns it mirrors, for
   * the workspace's own settings page and for the platform console (which
   * also sets the legal name and country). Returns the names of the fields
   * that changed; the caller records the change in its own audit trail.
   */
  async saveProfile(
    tenantId: string,
    input: UpdateOrganizationProfileDto,
    tenantColumns: { legal_name?: string; country_code?: string | null } = {},
  ): Promise<string[]> {
    const before = asRecord((await this.readSettings(tenantId)).profile);

    const profile = {
      company_name: input.company_name,
      industry_type: input.industry_type || null,
      currency: input.currency,
      timezone: input.timezone,
      tax_gstin: input.tax_gstin || null,
      website_url: input.website_url || null,
      primary_contact_name: input.primary_contact_name || null,
      primary_contact_email: input.primary_contact_email?.toLowerCase() || null,
      primary_contact_phone: input.primary_contact_phone || null,
      company_address: input.company_address || null,
    };

    await this.prisma.$transaction(async (tx) => {
      await this.mergeSettingsSection(tx, tenantId, 'profile', profile);
      await tx.rndtechnosoft_tenants.update({
        where: { id: tenantId },
        data: {
          display_name: input.company_name,
          default_currency_code: input.currency,
          ...tenantColumns,
          updated_at: new Date(),
        },
      });
    });

    return PROFILE_FIELDS.filter((field) => (text(before[field]) ?? null) !== (profile[field] ?? null));
  }

  // ── SMTP ─────────────────────────────────────────────────────

  async saveSmtp(tenantId: string, input: SaveSmtpSettingsDto, actor: AuthenticatedTenantUser) {
    const current = asRecord((await this.readSettings(tenantId)).smtp);

    const passwordEncrypted = input.password
      ? this.encryptSecret(input.password)
      : this.keepEncrypted(current.passwordEncrypted, current.password);

    const smtp = {
      host: input.host.toLowerCase(),
      port: input.port,
      username: input.username || null,
      passwordEncrypted,
      senderName: input.senderName || null,
      senderEmail: input.senderEmail.toLowerCase(),
      replyToEmail: input.replyToEmail?.toLowerCase() || null,
      encryption: input.encryption,
      isActive: input.isActive,
    };

    await this.mergeSettingsSection(this.prisma, tenantId, 'smtp', smtp);

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'SMTP_SETTINGS_UPDATED',
      entityType: 'TENANT_SMTP_SETTINGS',
      entityId: tenantId,
      metadata: {
        host: smtp.host,
        port: smtp.port,
        encryption: smtp.encryption,
        isActive: smtp.isActive,
        passwordReplaced: Boolean(input.password),
      },
    });

    return { success: true, message: 'SMTP settings saved.', data: this.toPublicSmtp(smtp) };
  }

  /**
   * The workspace's saved SMTP account, ready to send mail as the workspace, or
   * null when none is saved or it is switched off. For server-side senders
   * only: it includes the decrypted password.
   */
  async workspaceSmtp(tenantId: string) {
    const saved = asRecord((await this.readSettings(tenantId)).smtp);
    const host = text(saved.host);
    const senderEmail = text(saved.senderEmail);
    if (!host || !senderEmail || saved.isActive === false) return null;
    return {
      host,
      port: typeof saved.port === 'number' ? saved.port : 587,
      username: text(saved.username),
      password: this.readSecret(saved.passwordEncrypted, saved.password, 'SMTP password'),
      encryption: text(saved.encryption) ?? 'TLS',
      senderName: text(saved.senderName),
      senderEmail,
      replyToEmail: text(saved.replyToEmail),
    };
  }

  // ── Email policy ─────────────────────────────────────────────

  /**
   * Whether members may send from their own mail accounts (ALLOWED), or all
   * mail goes through the organization's account (ORGANIZATION_ONLY, the
   * default, which is how every workspace sent before personal accounts).
   */
  async emailPolicy(tenantId: string): Promise<'ALLOWED' | 'ORGANIZATION_ONLY'> {
    return this.personalAccountsOf((await this.readSettings(tenantId)).email);
  }

  async saveEmailPolicy(tenantId: string, personalAccounts: 'ALLOWED' | 'ORGANIZATION_ONLY', actor: AuthenticatedTenantUser) {
    const before = await this.emailPolicy(tenantId);
    await this.mergeSettingsSection(this.prisma, tenantId, 'email', { personalAccounts });
    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'EMAIL_POLICY_UPDATED',
      entityType: 'TENANT_EMAIL_POLICY',
      entityId: tenantId,
      oldValues: { personalAccounts: before },
      newValues: { personalAccounts },
    });
    return { personalAccounts };
  }

  private personalAccountsOf(raw: unknown): 'ALLOWED' | 'ORGANIZATION_ONLY' {
    return asRecord(raw).personalAccounts === 'ALLOWED' ? 'ALLOWED' : 'ORGANIZATION_ONLY';
  }

  async testSmtp(tenantId: string, input: TestSmtpSettingsDto) {
    let config: { host: string; port: number; username: string | null; password: string | null; encryption: string };

    if (input.password) {
      // A draft is being tested: every value, including the secret, comes from the caller.
      if (!input.host || !input.port) {
        throw new BadRequestException('Enter the SMTP host and port to test these settings.');
      }
      config = {
        host: input.host,
        port: input.port,
        username: input.username || null,
        password: input.password,
        encryption: input.encryption ?? 'TLS',
      };
    } else {
      // The saved configuration is tested and nothing in the request is used,
      // so a stored password is only ever sent to the stored host.
      const saved = asRecord((await this.readSettings(tenantId)).smtp);
      const host = text(saved.host);
      if (!host) {
        throw new BadRequestException('Save your SMTP settings first, or enter the password to test new values.');
      }
      config = {
        host,
        port: typeof saved.port === 'number' ? saved.port : 587,
        username: text(saved.username),
        password: this.readSecret(saved.passwordEncrypted, saved.password, 'SMTP password'),
        encryption: text(saved.encryption) ?? 'TLS',
      };
    }

    const startedAt = Date.now();
    try {
      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.port === 465 || config.encryption === 'SSL',
        requireTLS: config.encryption === 'TLS',
        ignoreTLS: config.encryption === 'NONE',
        auth: config.username && config.password ? { user: config.username, pass: config.password } : undefined,
        connectionTimeout: 6000,
        greetingTimeout: 5000,
        socketTimeout: 8000,
      });
      await transporter.verify();

      const latencyMs = Date.now() - startedAt;
      return {
        success: true,
        data: {
          connected: true,
          server: config.host,
          port: config.port,
          latencyMs,
          message: `Connected to ${config.host}:${config.port} and signed in (${latencyMs} ms).`,
        },
      };
    } catch (err) {
      // A safe reason: the server's reply can echo the account name, so it is redacted.
      return {
        success: false,
        error: describeSmtpFailure(err, config.host, config.port, [config.username, config.password]),
        latencyMs: Date.now() - startedAt,
      };
    }
  }

  // ── WhatsApp ─────────────────────────────────────────────────

  async saveWhatsApp(tenantId: string, input: SaveWhatsAppSettingsDto, actor: AuthenticatedTenantUser) {
    const current = asRecord((await this.readSettings(tenantId)).whatsapp);

    const accessTokenEncrypted = input.accessToken
      ? this.encryptSecret(input.accessToken)
      : this.keepEncrypted(current.accessTokenEncrypted, current.accessToken);

    if (!accessTokenEncrypted) {
      throw new BadRequestException('Enter the API access token or Otomat token.');
    }

    const webhookVerifyTokenEncrypted = input.webhookVerifyToken
      ? this.encryptSecret(input.webhookVerifyToken)
      : this.keepEncrypted(current.webhookVerifyTokenEncrypted, this.usableVerifyToken(current.webhookVerifyToken));

    const apiBaseUrl = input.apiBaseUrl?.trim() || text(current.apiBaseUrl) || 'https://otomat.in/api';
    const vendorUid = input.vendorUid?.trim() || text(current.vendorUid) || '';

    const whatsapp = {
      provider: input.provider,
      apiBaseUrl,
      vendorUid,
      wabaId: input.wabaId || null,
      phoneNumberId: input.phoneNumberId || null,
      senderPhoneNumber: input.senderPhoneNumber || null,
      accessTokenEncrypted,
      webhookVerifyTokenEncrypted,
      isActive: input.isActive,
    };

    await this.mergeSettingsSection(this.prisma, tenantId, 'whatsapp', whatsapp);

    // If Otomat provider, synchronize automatically to CRM WhatsApp config so both modules stay in sync
    if (input.provider === 'OTOMAT' && vendorUid) {
      try {
        const existingConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
          where: { tenant_id: tenantId, is_default: true },
        });
        if (existingConfig) {
          await this.prisma.rndtechnosoft_crm_whatsapp_configs.update({
            where: { id: existingConfig.id },
            data: {
              api_base_url: apiBaseUrl,
              vendor_uid: vendorUid,
              bearer_token_encrypted: accessTokenEncrypted,
              from_phone_number_id: input.phoneNumberId || null,
              is_active: input.isActive,
            },
          });
        } else {
          await this.prisma.rndtechnosoft_crm_whatsapp_configs.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              account_name: 'Otomat WhatsApp Gateway',
              api_base_url: apiBaseUrl,
              vendor_uid: vendorUid,
              bearer_token_encrypted: accessTokenEncrypted,
              from_phone_number_id: input.phoneNumberId || null,
              is_default: true,
              is_active: input.isActive,
            },
          });
        }
      } catch {
        // Non-fatal sync to CRM table
      }
    }

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: 'WHATSAPP_SETTINGS_UPDATED',
      entityType: 'TENANT_WHATSAPP_SETTINGS',
      entityId: tenantId,
      metadata: {
        provider: whatsapp.provider,
        isActive: whatsapp.isActive,
        accessTokenReplaced: Boolean(input.accessToken),
        verifyTokenReplaced: Boolean(input.webhookVerifyToken),
      },
    });

    return { success: true, message: 'WhatsApp settings saved.', data: this.toPublicWhatsApp(whatsapp) };
  }

  async testWhatsApp(tenantId: string, input: TestWhatsAppSettingsDto) {
    const saved = asRecord((await this.readSettings(tenantId)).whatsapp);
    const provider = input.provider || text(saved.provider) || 'META_CLOUD_API';
    const accessToken = input.accessToken || this.readSecret(saved.accessTokenEncrypted, saved.accessToken, 'WhatsApp access token');

    if (provider === 'OTOMAT') {
      const apiBaseUrl = (input.apiBaseUrl || text(saved.apiBaseUrl) || 'https://otomat.in/api').replace(/\/+$/, '');
      const vendorUid = input.vendorUid || text(saved.vendorUid) || '';

      if (!vendorUid) {
        throw new BadRequestException('Enter your Vendor ID to test the Otomat connection.');
      }
      if (!accessToken) {
        throw new BadRequestException('Enter your Token / Bearer Token to test the Otomat connection.');
      }

      const testUrl = `${apiBaseUrl}/${encodeURIComponent(vendorUid)}/contact/template-list?token=${encodeURIComponent(accessToken)}`;
      try {
        const response = await fetch(testUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          return {
            success: true,
            data: {
              connected: true,
              message: `Connected to Otomat API (${apiBaseUrl}/${vendorUid}).`,
            },
          };
        }

        const body = asRecord(await response.json().catch(() => ({})));
        const errorMsg = body?.message || body?.error || `HTTP ${response.status}: ${response.statusText}`;
        return {
          success: false,
          error: `Otomat rejected authentication: ${errorMsg}`,
        };
      } catch (err: any) {
        return {
          success: false,
          error: `Could not reach Otomat server: ${err.message}`,
        };
      }
    }

    let phoneNumberId: string;

    if (input.accessToken) {
      if (!input.phoneNumberId) {
        throw new BadRequestException('Enter the Phone Number ID to test this access token.');
      }
      phoneNumberId = input.phoneNumberId;
    } else {
      const savedPhoneNumberId = text(saved.phoneNumberId);
      if (!savedPhoneNumberId || !accessToken) {
        throw new BadRequestException('Save your WhatsApp settings first, or enter the access token to test new values.');
      }
      phoneNumberId = savedPhoneNumberId;
    }

    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${encodeURIComponent(phoneNumberId)}?fields=verified_name,display_phone_number`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(8000) },
      );
      const body = asRecord(await response.json().catch(() => ({})));
      const error = asRecord(body.error);

      if (!response.ok || Object.keys(error).length > 0) {
        return {
          success: false,
          error: text(error.message) ?? `Meta rejected the request (HTTP ${response.status}).`,
        };
      }

      const number = text(body.display_phone_number) ?? text(body.verified_name) ?? phoneNumberId;
      return { success: true, message: `Connected to WhatsApp Business number ${number}.` };
    } catch (err) {
      return {
        success: false,
        error: `Could not reach the Meta WhatsApp API. ${err instanceof Error ? err.message : ''}`.trim(),
      };
    }
  }

  // ── Modules ──────────────────────────────────────────────────

  async getModules(tenantId: string) {
    const [tenant, states, quotas, seatsUsed, subscription, subdomain] = await Promise.all([
      this.getCurrentTenant(tenantId),
      this.accessService.getModuleStates(tenantId),
      this.prisma.rndtechnosoft_tenant_quotas.findUnique({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_tenant_members.count({
        where: { tenant_id: tenantId, membership_status: { in: [...SEAT_MEMBERSHIP_STATUSES] } },
      }),
      this.prisma.rndtechnosoft_tenant_subscriptions.findFirst({
        where: { tenant_id: tenantId, subscription_status: { in: ['ACTIVE', 'TRIALING'] } },
        orderBy: { starts_on: 'desc' },
        include: { rndtechnosoft_plans: { select: { plan_code: true, plan_name: true } } },
      }),
      this.subdomainOf(tenantId),
    ]);

    return {
      tenant: {
        id: tenant.id,
        company_name: tenant.display_name,
        subdomain,
        status: tenant.tenant_status,
        plan_name: subscription?.rndtechnosoft_plans.plan_name ?? null,
        plan_code: subscription?.rndtechnosoft_plans.plan_code ?? null,
        seats_used: seatsUsed,
        max_seats: quotas?.user_seats_limit ?? null,
        storage_limit_mb: quotas?.storage_limit_mb ?? null,
        monthly_ai_token_quota: quotas?.monthly_ai_tokens ?? null,
        monthly_whatsapp_quota: quotas?.monthly_whatsapp_credits ?? null,
      },
      modules: MODULES.map((m) => ({
        id: m.code,
        name: m.name,
        description: m.description,
        // What turning the module off hides and refuses, from the same catalog.
        features: moduleFeatures(m.code),
        requires: [...m.requires],
        is_enabled: states[m.code],
      })),
    };
  }

  async setModuleEnabled(
    tenantId: string,
    moduleCode: string,
    enabled: boolean,
    actor: AuthenticatedTenantUser,
  ) {
    const target = await this.applyModuleSwitch(tenantId, moduleCode, enabled);

    await this.auditService.log({
      ...this.auditActor(tenantId, actor),
      actionCode: enabled ? 'MODULE_ENABLED' : 'MODULE_DISABLED',
      entityType: 'TENANT_MODULE',
      entityId: tenantId,
      metadata: { module: target.code },
    });

    return {
      success: true,
      message: `${target.name} is now ${enabled ? 'on' : 'off'} for this workspace.`,
    };
  }

  /**
   * Turns one module on or off, refusing a change that would leave a module
   * on without a module it depends on. Shared by the workspace's own settings
   * and the platform console; the caller records the change in its own audit trail.
   */
  async applyModuleSwitch(tenantId: string, moduleCode: string, enabled: boolean) {
    const target = MODULES.find((m) => m.code === moduleCode);
    if (!target) {
      throw new NotFoundException('That module does not exist.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Row lock so two concurrent toggles cannot leave a dependency broken.
      const rows = await tx.$queryRaw<{ modules: unknown }[]>`
        SELECT settings->'modules' AS modules
        FROM rndtechnosoft_tenant_settings
        WHERE tenant_id = ${tenantId}::uuid
        FOR UPDATE
      `;
      const next = { ...resolveModuleStates(rows[0]?.modules), [target.code]: enabled };

      if (enabled) {
        const missing = MODULES.filter((m) => (target.requires as readonly string[]).includes(m.code) && !next[m.code]);
        if (missing.length > 0) {
          throw new BadRequestException(
            `Turn on ${missing.map((m) => m.name).join(' and ')} first. ${target.name} depends on it.`,
          );
        }
      } else {
        const dependents = MODULES.filter((m) => (m.requires as readonly string[]).includes(target.code) && next[m.code]);
        if (dependents.length > 0) {
          throw new BadRequestException(
            `Turn off ${dependents.map((m) => m.name).join(' and ')} first. It depends on ${target.name}.`,
          );
        }
      }

      await this.mergeSettingsSection(
        tx,
        tenantId,
        'modules',
        MODULES.map((m) => ({ id: m.code, is_enabled: next[m.code] })),
      );
    });

    return target;
  }

  // ── Internals ────────────────────────────────────────────────

  /** The workspace's primary address label, as stored; null if it has none. */
  private async subdomainOf(tenantId: string): Promise<string | null> {
    return (await this.domains.primarySubdomains([tenantId])).get(tenantId)?.subdomain ?? null;
  }

  private async readSettings(tenantId: string): Promise<JsonRecord> {
    const row = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
      where: { tenant_id: tenantId },
      select: { settings: true },
    });
    return asRecord(row?.settings);
  }

  /**
   * Replaces one top-level key of the settings document in a single statement,
   * so concurrent writers of other keys (CRM industries, COSEC config) are not
   * overwritten by a stale read-modify-write.
   */
  private async mergeSettingsSection(
    db: Pick<Prisma.TransactionClient, '$executeRaw'>,
    tenantId: string,
    section: SettingsSection,
    value: unknown,
  ): Promise<void> {
    const patch = JSON.stringify({ [section]: value });
    await db.$executeRaw`
      INSERT INTO rndtechnosoft_tenant_settings (id, tenant_id, settings, created_at, updated_at)
      VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${patch}::jsonb, now(), now())
      ON CONFLICT (tenant_id) DO UPDATE
      SET settings = rndtechnosoft_tenant_settings.settings || EXCLUDED.settings,
          updated_at = now()
    `;
  }

  /** Earliest active administrator: the account that created or was given the workspace. */
  private async findWorkspaceOwner(tenantId: string) {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: {
        tenant_id: tenantId,
        membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: {
          some: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE } },
        },
      },
      orderBy: [{ joined_at: 'asc' }, { created_at: 'asc' }],
      select: { rndtechnosoft_users: { select: { email: true, display_name: true } } },
    });
    return member?.rndtechnosoft_users ?? null;
  }

  private toPublicSmtp(raw: unknown) {
    const smtp = asRecord(raw);
    const host = text(smtp.host);
    if (!host) return null;

    return {
      host,
      port: typeof smtp.port === 'number' ? smtp.port : 587,
      username: text(smtp.username),
      hasPassword: Boolean(text(smtp.passwordEncrypted) ?? text(smtp.password)),
      senderName: text(smtp.senderName),
      senderEmail: text(smtp.senderEmail),
      replyToEmail: text(smtp.replyToEmail),
      encryption: text(smtp.encryption) ?? 'TLS',
      isActive: smtp.isActive !== false,
    };
  }

  private toPublicWhatsApp(raw: unknown) {
    const whatsapp = asRecord(raw);
    const provider = text(whatsapp.provider) ?? 'META_CLOUD_API';
    const phoneNumberId = text(whatsapp.phoneNumberId);
    const vendorUid = text(whatsapp.vendorUid);
    const apiBaseUrl = text(whatsapp.apiBaseUrl) ?? 'https://otomat.in/api';
    if (!phoneNumberId && !vendorUid) return null;

    return {
      provider,
      apiBaseUrl,
      vendorUid,
      wabaId: text(whatsapp.wabaId),
      phoneNumberId,
      senderPhoneNumber: text(whatsapp.senderPhoneNumber),
      hasAccessToken: Boolean(text(whatsapp.accessTokenEncrypted) ?? text(whatsapp.accessToken)),
      hasWebhookVerifyToken: Boolean(
        text(whatsapp.webhookVerifyTokenEncrypted) ?? this.usableVerifyToken(whatsapp.webhookVerifyToken),
      ),
      isActive: whatsapp.isActive !== false,
    };
  }

  private usableVerifyToken(value: unknown): string | null {
    const token = text(value);
    return token && !PUBLIC_DEFAULT_VERIFY_TOKENS.includes(token) ? token : null;
  }

  private encryptSecret(plaintext: string): string {
    if (!isPlatformEncryptionConfigured()) {
      this.logger.error('Refusing to store an integration secret: PLATFORM_ENCRYPTION_KEY is not configured.');
      throw new ServiceUnavailableException(
        'Credentials cannot be stored securely on this server right now. Contact support; nothing was saved.',
      );
    }
    return encryptPlatformSecret(plaintext);
  }

  /** Keeps an already-encrypted secret, or encrypts a legacy plaintext one. */
  private keepEncrypted(encrypted: unknown, legacyPlaintext: unknown): string | null {
    const stored = text(encrypted);
    if (stored) return stored;
    const legacy = text(legacyPlaintext);
    return legacy ? this.encryptSecret(legacy) : null;
  }

  private readSecret(encrypted: unknown, legacyPlaintext: unknown, label: string): string | null {
    const stored = text(encrypted);
    if (!stored) return text(legacyPlaintext);
    try {
      return decryptPlatformSecret(stored);
    } catch {
      this.logger.error(`Stored ${label} could not be decrypted.`);
      throw new BadRequestException(`The saved ${label} can no longer be read. Enter it again and save.`);
    }
  }

  /**
   * Earlier builds stored SMTP passwords and WhatsApp tokens in plaintext.
   * Encrypt any that remain, once per boot; a no-op when there are none.
   */
  private async encryptLegacyPlaintextSecrets(): Promise<void> {
    const rows = await this.prisma.$queryRaw<{ tenant_id: string; smtp: unknown; whatsapp: unknown }[]>`
      SELECT tenant_id, settings->'smtp' AS smtp, settings->'whatsapp' AS whatsapp
      FROM rndtechnosoft_tenant_settings
      WHERE jsonb_exists(COALESCE(settings->'smtp', '{}'::jsonb), 'password')
         OR jsonb_exists(COALESCE(settings->'whatsapp', '{}'::jsonb), 'accessToken')
         OR jsonb_exists(COALESCE(settings->'whatsapp', '{}'::jsonb), 'webhookVerifyToken')
    `;

    if (rows.length === 0) return;

    if (!isPlatformEncryptionConfigured()) {
      this.logger.error(
        `${rows.length} workspace(s) hold plaintext integration secrets and PLATFORM_ENCRYPTION_KEY is not configured to encrypt them.`,
      );
      return;
    }

    for (const row of rows) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const smtp = asRecord(row.smtp);
          if ('password' in smtp) {
            const { password, hasPassword: _hasPassword, ...rest } = smtp;
            await this.mergeSettingsSection(tx, row.tenant_id, 'smtp', {
              ...rest,
              passwordEncrypted: this.keepEncrypted(rest.passwordEncrypted, password),
            });
          }

          const whatsapp = asRecord(row.whatsapp);
          if ('accessToken' in whatsapp || 'webhookVerifyToken' in whatsapp) {
            const { accessToken, webhookVerifyToken, hasAccessToken: _hasAccessToken, ...rest } = whatsapp;
            await this.mergeSettingsSection(tx, row.tenant_id, 'whatsapp', {
              ...rest,
              accessTokenEncrypted: this.keepEncrypted(rest.accessTokenEncrypted, accessToken),
              webhookVerifyTokenEncrypted: this.keepEncrypted(
                rest.webhookVerifyTokenEncrypted,
                this.usableVerifyToken(webhookVerifyToken),
              ),
            });
          }
        });
        this.logger.log(`Encrypted legacy integration secrets tenantId=${row.tenant_id}`);
      } catch (err) {
        this.logger.error(
          `Could not encrypt legacy integration secrets tenantId=${row.tenant_id}: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
  }

  private auditActor(tenantId: string, actor: AuthenticatedTenantUser) {
    return { tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId };
  }
}
