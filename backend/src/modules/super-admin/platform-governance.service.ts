import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { ADMIN_ROLE_CODE, DEFAULT_ROLE_PERMISSIONS, groupPermissionCatalog } from '@/common/access/access-catalog';
import { AuthenticatedSuperAdmin } from '@/common/interfaces/request-with-super-admin.interface';
import { isPlatformEncryptionConfigured } from './auth/platform-crypto.util';
import type { PlatformActionContext } from './super-admin.service';
import { PageQueryDto } from './dto/platform-directory.dto';
import { BrandingDto } from './dto/platform-settings.dto';

const DEFAULT_PAGE_SIZE = 25;

function paging(query: PageQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const toPage = <T>(items: T[], total: number, page: number, pageSize: number) => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/**
 * Commercial and governance views for the platform console: subscriptions,
 * billing, security and role templates. Only stored records are reported;
 * money is summed in the database and returned as decimal strings.
 */
@Injectable()
export class PlatformGovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  async listSubscriptions(query: PageQueryDto) {
    const { page, pageSize, offset } = paging(query);
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_tenant_subscriptions.findMany({
        orderBy: [{ starts_on: 'desc' }, { created_at: 'desc' }],
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          subscription_status: true,
          starts_on: true,
          ends_on: true,
          trial_ends_on: true,
          external_subscription_reference: true,
          created_at: true,
          rndtechnosoft_tenants: { select: { id: true, tenant_code: true, display_name: true, legal_name: true } },
          rndtechnosoft_plans: { select: { plan_code: true, plan_name: true, billing_interval: true } },
        },
      }),
      this.prisma.rndtechnosoft_tenant_subscriptions.count(),
    ]);
    return toPage(
      rows.map((row) => ({
        id: row.id,
        workspace: {
          tenantId: row.rndtechnosoft_tenants.id,
          tenantCode: row.rndtechnosoft_tenants.tenant_code,
          name: row.rndtechnosoft_tenants.display_name || row.rndtechnosoft_tenants.legal_name,
        },
        plan: {
          code: row.rndtechnosoft_plans.plan_code,
          name: row.rndtechnosoft_plans.plan_name,
          billingInterval: row.rndtechnosoft_plans.billing_interval,
        },
        status: row.subscription_status,
        startsOn: row.starts_on,
        endsOn: row.ends_on,
        trialEndsOn: row.trial_ends_on,
        externalReference: row.external_subscription_reference,
        createdAt: row.created_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  async billingSummary() {
    const q = <T>(sql: Prisma.Sql) => this.prisma.$queryRaw<T>(sql);
    const [plans, subscriptions, invoices, totals, coupons, gateway] = await Promise.all([
      this.prisma.rndtechnosoft_plans.findMany({
        orderBy: { plan_name: 'asc' },
        select: { id: true, plan_code: true, plan_name: true, billing_interval: true, plan_status: true },
      }),
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT subscription_status AS status, count(*)::int AS count FROM rndtechnosoft_tenant_subscriptions GROUP BY 1 ORDER BY 1`),
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT invoice_status AS status, count(*)::int AS count FROM rndtechnosoft_platform_invoices GROUP BY 1 ORDER BY 1`),
      q<{ currency_code: string; outstanding: string; paid: string }[]>(Prisma.sql`
        SELECT currency_code,
               coalesce(sum(total_amount) FILTER (WHERE invoice_status NOT IN ('PAID', 'VOID', 'CANCELLED')), 0)::text AS outstanding,
               coalesce(sum(total_amount) FILTER (WHERE invoice_status = 'PAID'), 0)::text AS paid
        FROM rndtechnosoft_platform_invoices GROUP BY 1 ORDER BY 1`),
      q<{ active: number; total: number }[]>(Prisma.sql`
        SELECT count(*) FILTER (WHERE is_active AND (valid_until IS NULL OR valid_until >= current_date))::int AS active,
               count(*)::int AS total
        FROM rndtechnosoft_platform_coupons`),
      this.prisma.rndtechnosoft_platform_settings.count({ where: { setting_key: 'razorpay_settings' } }),
    ]);

    return {
      plans: plans.map((plan) => ({
        id: plan.id,
        code: plan.plan_code,
        name: plan.plan_name,
        billingInterval: plan.billing_interval,
        status: plan.plan_status,
      })),
      subscriptionsByStatus: Object.fromEntries(subscriptions.map((row) => [row.status, row.count])),
      invoicesByStatus: Object.fromEntries(invoices.map((row) => [row.status, row.count])),
      totalsByCurrency: totals.map((row) => ({ currency: row.currency_code, outstanding: row.outstanding, paid: row.paid })),
      coupons: coupons[0],
      // Whether gateway settings were ever saved. Their contents are never returned.
      paymentGatewayConfigured: gateway > 0,
    };
  }

  async securityOverview() {
    const now = new Date();
    const [accounts, liveSessions, [counts], [tenantAccounts], events] = await Promise.all([
      this.prisma.rndtechnosoft_super_admins.findMany({
        orderBy: { display_name: 'asc' },
        // Never the password hash or the TOTP secret.
        select: {
          id: true,
          display_name: true,
          email: true,
          role: true,
          is_active: true,
          totp_enabled: true,
          last_login_at: true,
          locked_until: true,
          failed_login_attempts: true,
        },
      }),
      this.prisma.rndtechnosoft_super_admin_sessions.groupBy({
        by: ['super_admin_id'],
        where: { revoked_at: null, expires_at: { gt: now }, mfa_pending: false },
        _count: { _all: true },
      }),
      this.prisma.$queryRaw<{ failed_24h: number; failed_7d: number; mfa_failed_7d: number }[]>`
        SELECT count(*) FILTER (WHERE action = 'SUPER_ADMIN_LOGIN_FAILED' AND created_at >= now() - interval '24 hours')::int AS failed_24h,
               count(*) FILTER (WHERE action = 'SUPER_ADMIN_LOGIN_FAILED' AND created_at >= now() - interval '7 days')::int AS failed_7d,
               count(*) FILTER (WHERE action = 'MFA_CHALLENGE_FAILED' AND created_at >= now() - interval '7 days')::int AS mfa_failed_7d
        FROM rndtechnosoft_platform_activity_logs`,
      this.prisma.$queryRaw<{ locked: number; with_failures: number }[]>`
        SELECT count(*) FILTER (WHERE locked_until > now())::int AS locked,
               count(*) FILTER (WHERE failed_login_attempts > 0)::int AS with_failures
        FROM rndtechnosoft_users`,
      this.prisma.rndtechnosoft_platform_activity_logs.findMany({
        where: { category: { in: ['SECURITY', 'AUTH'] } },
        orderBy: { created_at: 'desc' },
        take: 25,
        select: {
          id: true,
          created_at: true,
          category: true,
          action: true,
          description: true,
          ip_address: true,
          rndtechnosoft_super_admins: { select: { display_name: true } },
        },
      }),
    ]);
    const sessionsByAdmin = new Map(liveSessions.map((row) => [row.super_admin_id, row._count._all]));

    return {
      encryptionConfigured: isPlatformEncryptionConfigured(),
      platformAccounts: accounts.map((account) => ({
        id: account.id,
        name: account.display_name,
        email: account.email,
        role: account.role,
        isActive: account.is_active,
        mfaEnabled: account.totp_enabled,
        lastLoginAt: account.last_login_at,
        lockedUntil: account.locked_until && account.locked_until > now ? account.locked_until : null,
        failedSignInAttempts: account.failed_login_attempts,
        liveSessions: sessionsByAdmin.get(account.id) ?? 0,
      })),
      platformSignIns: {
        failedLast24Hours: counts.failed_24h,
        failedLast7Days: counts.failed_7d,
        failedTwoFactorLast7Days: counts.mfa_failed_7d,
      },
      workspaceAccounts: { lockedNow: tenantAccounts.locked, withRecentFailures: tenantAccounts.with_failures },
      recentEvents: events.map((event) => ({
        id: event.id,
        occurredAt: event.created_at,
        category: event.category,
        action: event.action,
        description: event.description,
        ipAddress: event.ip_address,
        actor: event.rndtechnosoft_super_admins?.display_name ?? null,
      })),
    };
  }

  /**
   * The built-in roles every workspace can start from, with the permissions
   * they are granted on creation (the catalog's DEFAULT_ROLE_PERMISSIONS) and
   * how many workspaces use each. Workspaces then edit their own copies.
   */
  async roleTemplates() {
    const usage = await this.prisma.$queryRaw<{ role_code: string; workspaces: number; members: number; name: string }[]>`
      SELECT r.role_code,
             count(DISTINCT r.tenant_id)::int AS workspaces,
             count(DISTINCT mr.tenant_member_id) FILTER (WHERE m.membership_status = 'ACTIVE')::int AS members,
             mode() WITHIN GROUP (ORDER BY r.role_name) AS name
      FROM rndtechnosoft_roles r
      LEFT JOIN rndtechnosoft_tenant_member_roles mr ON mr.tenant_id = r.tenant_id AND mr.role_id = r.id
      LEFT JOIN rndtechnosoft_tenant_members m ON m.tenant_id = mr.tenant_id AND m.id = mr.tenant_member_id
      WHERE r.role_code IN (${Prisma.join(Object.keys(DEFAULT_ROLE_PERMISSIONS))})
      GROUP BY r.role_code`;
    const byCode = new Map(usage.map((row) => [row.role_code, row]));
    const catalog = groupPermissionCatalog();

    return Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([code, keys]) => {
      const granted = new Set<string>(keys);
      return {
        code,
        name: byCode.get(code)?.name ?? null,
        isOwnerRole: code === ADMIN_ROLE_CODE,
        permissionCount: granted.size,
        workspaces: byCode.get(code)?.workspaces ?? 0,
        activeMembers: byCode.get(code)?.members ?? 0,
        sections: catalog
          .map((section) => ({
            section: section.section,
            groups: section.groups
              .map((group) => ({ group: group.group, permissions: group.permissions.filter((p) => granted.has(p.key)) }))
              .filter((group) => group.permissions.length > 0),
          }))
          .filter((section) => section.groups.length > 0),
      };
    });
  }

  async getBranding() {
    const row = await this.prisma.rndtechnosoft_platform_settings.findUnique({
      where: { setting_key: 'platform_branding' },
      select: { setting_value: true, updated_at: true },
    });
    const value = asRecord(row?.setting_value);
    return {
      platformName: text(value.platformName),
      supportEmail: text(value.supportEmail),
      websiteUrl: text(value.websiteUrl),
      currency: text(value.currency),
      updatedAt: row?.updated_at ?? null,
    };
  }

  async saveBranding(input: BrandingDto, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    const value = {
      platformName: input.platformName,
      supportEmail: input.supportEmail ?? null,
      websiteUrl: input.websiteUrl ?? null,
      currency: input.currency,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_platform_settings.upsert({
        where: { setting_key: 'platform_branding' },
        update: { setting_value: value, updated_at: new Date() },
        create: {
          id: randomUUID(),
          setting_category: 'BRANDING',
          setting_key: 'platform_branding',
          setting_value: value,
          description: 'Platform name, support contact, website and default currency',
        },
      });
      await tx.rndtechnosoft_platform_activity_logs.create({
        data: {
          id: randomUUID(),
          super_admin_id: admin.superAdminId,
          category: 'SETTINGS',
          action: 'PLATFORM_BRANDING_UPDATED',
          description: 'Updated platform branding',
          ip_address: context.ipAddress ? context.ipAddress.slice(0, 64) : null,
          user_agent: context.userAgent ? context.userAgent.slice(0, 255) : null,
        },
      });
    });
    return this.getBranding();
  }
}
