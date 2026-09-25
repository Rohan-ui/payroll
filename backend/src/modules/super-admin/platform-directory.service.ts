import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AccessService } from '@/common/access/access.service';
import {
  ADMIN_ROLE_CODE,
  MODULES,
  PERMISSION_KEYS,
  moduleCapabilities,
  moduleFeatures,
  resolveModuleStates,
} from '@/common/access/access-catalog';
import { AuthenticatedSuperAdmin } from '@/common/interfaces/request-with-super-admin.interface';
import { SEAT_MEMBERSHIP_STATUSES } from '@/common/tenancy/seats';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { ExternalApiService } from '@/modules/external-api/external-api.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { DomainProvisioningService } from '@/modules/tenancy/domain-provisioning.service';
import type { PlatformActionContext } from './super-admin.service';
import {
  DomainListQueryDto,
  PageQueryDto,
  RoleOptionsQueryDto,
  TENANT_STATUSES,
  TenantListQueryDto,
  TenantSort,
  UserListQueryDto,
  UserSort,
} from './dto/platform-directory.dto';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type RoleKind = 'OWNER' | 'BUILT_IN' | 'CUSTOM';

const DEFAULT_PAGE_SIZE = 25;
const LIVE_SUBSCRIPTIONS = ['ACTIVE', 'TRIALING'];
const RECENT_LIMIT = 20;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const roleKind = (code: string, isSystem: boolean): RoleKind =>
  code === ADMIN_ROLE_CODE ? 'OWNER' : isSystem ? 'BUILT_IN' : 'CUSTOM';

/** `%term%` for LIKE, lower-cased like the indexed search expressions, with the term's own wildcards escaped. */
const containsPattern = (term: string) => `%${term.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function paging(query: PageQueryDto) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, offset: (page - 1) * pageSize };
}

const toPage = <T>(items: T[], total: number, page: number, pageSize: number): Page<T> => ({
  items,
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});

const direction = (order: 'asc' | 'desc') => (order === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`);

const TENANT_SORT: Record<TenantSort, { column: Prisma.Sql; order: 'asc' | 'desc' }> = {
  created: { column: Prisma.sql`t.created_at`, order: 'desc' },
  name: { column: Prisma.sql`lower(t.display_name)`, order: 'asc' },
  code: { column: Prisma.sql`t.tenant_code`, order: 'asc' },
  status: { column: Prisma.sql`t.tenant_status`, order: 'asc' },
  lastActivity: { column: Prisma.sql`activity.last_activity_at`, order: 'desc' },
  members: { column: Prisma.sql`counts.members`, order: 'desc' },
};

const USER_SORT: Record<UserSort, { column: Prisma.Sql; order: 'asc' | 'desc' }> = {
  created: { column: Prisma.sql`u.created_at`, order: 'desc' },
  name: { column: Prisma.sql`lower(coalesce(u.display_name, u.email))`, order: 'asc' },
  email: { column: Prisma.sql`u.email`, order: 'asc' },
  lastLogin: { column: Prisma.sql`u.last_login_at`, order: 'desc' },
  lastActivity: { column: Prisma.sql`sess.last_activity_at`, order: 'desc' },
};

/**
 * A module's state from the stored switches, exactly as resolveModuleStates
 * reads them: the last valid entry for the module wins, and no entry means on.
 */
const moduleEnabledSql = (code: string) => Prisma.sql`coalesce((
  SELECT (e.value->>'is_enabled')::boolean
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(s.settings->'modules') = 'array' THEN s.settings->'modules' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS e(value, ord)
  WHERE e.value->>'id' = ${code} AND jsonb_typeof(e.value->'is_enabled') = 'boolean'
  ORDER BY e.ord DESC
  LIMIT 1
), true)`;

interface TenantRow {
  id: string;
  tenant_code: string;
  legal_name: string;
  display_name: string;
  tenant_status: string;
  default_currency_code: string;
  created_at: Date;
  updated_at: Date;
  profile_timezone: string | null;
  settings_timezone: string | null;
  profile_currency: string | null;
  modules: unknown;
  subdomain: string | null;
  domain_status: string | null;
  user_seats_limit: number | null;
  plan_code: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_phone: string | null;
  members: number;
  active_members: number;
  suspended_members: number;
  removed_members: number;
  disabled_accounts: number;
  last_activity_at: Date | null;
}

interface MembershipJson {
  memberId: string;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  tenantStatus: string;
  membershipStatus: string;
  joinedAt: string | null;
  roles: { code: string; name: string; isSystem: boolean }[];
}

interface UserRow {
  id: string;
  display_name: string | null;
  email: string;
  mobile_number: string | null;
  user_status: string;
  created_at: Date;
  last_login_at: Date | null;
  locked_until: Date | null;
  active_sessions: number;
  last_activity_at: Date | null;
  last_ip: string | null;
  last_user_agent: string | null;
  memberships: MembershipJson[];
}

interface ActivityRow {
  id: string;
  source: 'WORKSPACE' | 'PLATFORM';
  occurred_at: Date;
  action: string;
  subject: string;
  actor_name: string | null;
  actor_email: string | null;
  description: string | null;
}

/**
 * The platform console's view of every workspace and every user account.
 *
 * Deliberately cross-tenant: only the platform API (SuperAdminAuthGuard,
 * SUPER_ADMIN role) reaches it, never a tenant session. Everything shown comes
 * from stored records; a value that is not stored is returned as null rather
 * than filled in. Secrets in tenant settings are never selected.
 */
@Injectable()
export class PlatformDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService: AccessService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly externalApi: ExternalApiService,
    private readonly domains: TenantDomainsService,
    private readonly provisioning: DomainProvisioningService,
  ) {}

  // ── Tenants ──────────────────────────────────────────────────

  async listTenants(query: TenantListQueryDto) {
    const { page, pageSize, offset } = paging(query);
    const source = this.tenantSource(query);
    const sort = TENANT_SORT[query.sort ?? 'created'];

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<TenantRow[]>`
        SELECT t.id, t.tenant_code, t.legal_name, t.display_name, t.tenant_status, t.default_currency_code,
               t.created_at, t.updated_at,
               s.settings->'profile'->>'timezone' AS profile_timezone,
               s.settings->>'timezone' AS settings_timezone,
               s.settings->'profile'->>'currency' AS profile_currency,
               s.settings->'modules' AS modules,
               dom.subdomain, dom.provisioning_status AS domain_status,
               q.user_seats_limit,
               sub.plan_code, sub.plan_name, sub.subscription_status,
               ow.user_id AS owner_user_id, ow.display_name AS owner_name, ow.email AS owner_email,
               ow.mobile_number AS owner_phone,
               counts.members, counts.active_members, counts.suspended_members, counts.removed_members,
               counts.disabled_accounts,
               activity.last_activity_at
        ${source}
        ORDER BY ${sort.column} ${direction(query.order ?? sort.order)} NULLS LAST, t.id
        LIMIT ${pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${source}`,
    ]);

    return toPage(
      rows.map((row) => {
        const states = resolveModuleStates(row.modules);
        return {
          id: row.id,
          tenantCode: row.tenant_code,
          name: row.display_name || row.legal_name,
          legalName: row.legal_name,
          status: row.tenant_status,
          subdomain: row.subdomain,
          address: row.subdomain ? this.domains.addressOf(row.subdomain) : null,
          addressStatus: row.domain_status,
          plan: row.plan_code ? { code: row.plan_code, name: row.plan_name } : null,
          subscriptionStatus: row.subscription_status,
          owner: row.owner_user_id
            ? { userId: row.owner_user_id, name: row.owner_name, email: row.owner_email, phone: row.owner_phone }
            : null,
          // Current members hold seats; removed members stay countable for history but never use a seat.
          members: {
            current: row.members,
            active: row.active_members,
            suspended: row.suspended_members,
            removed: row.removed_members,
            allTime: row.members + row.removed_members,
            accountsDisabled: row.disabled_accounts,
          },
          seats: { limit: row.user_seats_limit, used: row.members },
          modules: MODULES.map((m) => ({ code: m.code, name: m.name, enabled: states[m.code] })),
          timezone: text(row.profile_timezone) ?? text(row.settings_timezone),
          currency: text(row.profile_currency) ?? row.default_currency_code,
          lastActivityAt: row.last_activity_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
      total,
      page,
      pageSize,
    );
  }

  /** The filter choices that exist in the data. */
  async tenantFilterOptions() {
    const [plans, subscriptions] = await Promise.all([
      this.prisma.rndtechnosoft_plans.findMany({
        orderBy: { plan_name: 'asc' },
        select: { plan_code: true, plan_name: true },
      }),
      this.prisma.rndtechnosoft_tenant_subscriptions.findMany({
        distinct: ['subscription_status'],
        orderBy: { subscription_status: 'asc' },
        select: { subscription_status: true },
      }),
    ]);

    return {
      statuses: [...TENANT_STATUSES],
      plans: plans.map((p) => ({ code: p.plan_code, name: p.plan_name })),
      subscriptionStatuses: subscriptions.map((s) => s.subscription_status),
      modules: MODULES.map((m) => ({ code: m.code, name: m.name })),
    };
  }

  async getTenant(tenantId: string) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        tenant_code: true,
        legal_name: true,
        display_name: true,
        country_code: true,
        tenant_status: true,
        archived_at: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!tenant) {
      throw new NotFoundException('Workspace not found.');
    }

    const now = new Date();
    const [settings, moduleStates, owner, membershipCounts, accountsDisabled, roles, subscription, sessions, activeSessions, cosec, primaryDomain] =
      await Promise.all([
        // The same public view the workspace's own settings page shows: no secrets.
        this.organizationSettings.getSettings(tenantId),
        this.accessService.getModuleStates(tenantId),
        this.findOwner(tenantId),
        this.prisma.rndtechnosoft_tenant_members.groupBy({
          by: ['membership_status'],
          where: { tenant_id: tenantId },
          _count: { _all: true },
        }),
        this.prisma.rndtechnosoft_tenant_members.count({
          where: {
            tenant_id: tenantId,
            membership_status: { in: [...SEAT_MEMBERSHIP_STATUSES] },
            rndtechnosoft_users: { user_status: { not: 'ACTIVE' } },
          },
        }),
        this.prisma.rndtechnosoft_roles.findMany({
          where: { tenant_id: tenantId },
          orderBy: [{ is_system_role: 'desc' }, { role_name: 'asc' }],
          select: {
            id: true,
            role_code: true,
            role_name: true,
            description: true,
            is_system_role: true,
            role_status: true,
            _count: {
              select: {
                rndtechnosoft_tenant_member_roles: {
                  where: { rndtechnosoft_tenant_members: { membership_status: { in: [...SEAT_MEMBERSHIP_STATUSES] } } },
                },
                rndtechnosoft_role_permissions: {
                  where: { rndtechnosoft_permissions: { permission_code: { in: [...PERMISSION_KEYS] } } },
                },
              },
            },
          },
        }),
        this.currentSubscription(tenantId),
        this.prisma.rndtechnosoft_user_sessions.aggregate({
          where: { tenant_id: tenantId },
          _max: { last_used_at: true },
        }),
        this.prisma.rndtechnosoft_user_sessions.count({
          where: { tenant_id: tenantId, revoked_at: null, expires_at: { gt: now } },
        }),
        this.externalApi.getCosecConfigPublic(tenantId),
        this.prisma.rndtechnosoft_tenant_domains.findFirst({
          where: { tenant_id: tenantId, is_primary: true, domain_kind: 'SUBDOMAIN' },
          select: {
            id: true,
            subdomain: true,
            provisioning_status: true,
            provisioning_error: true,
            provisioning_attempts: true,
            last_checked_at: true,
            verified_at: true,
          },
        }),
      ]);

    const byStatus = Object.fromEntries(membershipCounts.map((row) => [row.membership_status, row._count._all]));
    const active = byStatus.ACTIVE ?? 0;
    const suspended = byStatus.SUSPENDED ?? 0;
    const org = settings.tenant;
    const seatsLimit = settings.quotas?.user_seats_limit ?? null;
    const liveSubscription = subscription !== null && LIVE_SUBSCRIPTIONS.includes(subscription.status);

    return {
      overview: {
        id: tenant.id,
        tenantCode: tenant.tenant_code,
        name: tenant.display_name || tenant.legal_name,
        legalName: tenant.legal_name,
        status: tenant.tenant_status,
        countryCode: tenant.country_code,
        subdomain: primaryDomain?.subdomain ?? null,
        address: primaryDomain?.subdomain ? this.domains.addressOf(primaryDomain.subdomain) : null,
        addressProvisioning: primaryDomain
          ? {
              domainId: primaryDomain.id,
              status: primaryDomain.provisioning_status,
              error: primaryDomain.provisioning_error,
              attempts: primaryDomain.provisioning_attempts,
              lastCheckedAt: primaryDomain.last_checked_at,
              verifiedAt: primaryDomain.verified_at,
            }
          : null,
        plan: subscription?.plan ?? null,
        subscription: subscription
          ? {
              status: subscription.status,
              startsOn: subscription.startsOn,
              endsOn: subscription.endsOn,
              trialEndsOn: subscription.trialEndsOn,
            }
          : null,
        archivedAt: tenant.archived_at,
        createdAt: tenant.created_at,
        updatedAt: tenant.updated_at,
      },
      organization: {
        companyName: org.company_name,
        industry: org.industry_type,
        taxId: org.tax_gstin,
        currency: org.currency,
        timezone: org.timezone,
        website: org.website_url,
        contactName: org.primary_contact_name,
        contactEmail: org.primary_contact_email,
        contactPhone: org.primary_contact_phone,
        contactIsWorkspaceOwner: org.contact_is_workspace_owner,
        address: org.company_address,
      },
      owner,
      users: {
        total: active + suspended,
        active,
        suspended,
        removed: byStatus.ARCHIVED ?? 0,
        accountsDisabled,
        seatsLimit,
        seatsUsed: active + suspended,
      },
      roles: roles.map((role) => ({
        id: role.id,
        code: role.role_code,
        name: role.role_name,
        description: role.description,
        kind: roleKind(role.role_code, role.is_system_role),
        status: role.role_status,
        memberCount: role._count.rndtechnosoft_tenant_member_roles,
        permissionCount: role._count.rndtechnosoft_role_permissions,
      })),
      modules: MODULES.map((m) => ({
        code: m.code,
        name: m.name,
        description: m.description,
        enabled: moduleStates[m.code],
        requires: [...m.requires],
        features: moduleFeatures(m.code),
        capabilities: moduleCapabilities(m.code),
      })),
      health: {
        status: tenant.tenant_status,
        subscriptionStatus: subscription?.status ?? null,
        lastActivityAt: sessions._max.last_used_at,
        activeSessions,
        ownerLastLoginAt: owner?.lastLoginAt ?? null,
        // Only settings that are actually stored; each is simply present or not.
        configuration: [
          { key: 'owner', label: 'Active workspace owner', configured: owner !== null },
          { key: 'subscription', label: 'Active subscription', configured: liveSubscription },
          { key: 'seats', label: 'Seat limit', configured: seatsLimit !== null },
          { key: 'industry', label: 'Industry', configured: org.industry_type !== null },
          { key: 'taxId', label: 'Tax ID (GSTIN)', configured: org.tax_gstin !== null },
          { key: 'address', label: 'Registered address', configured: org.company_address !== null },
          {
            key: 'contact',
            label: 'Primary contact',
            configured: !org.contact_is_workspace_owner && org.primary_contact_email !== null,
          },
          { key: 'timezone', label: 'Timezone', configured: org.timezone !== null },
          { key: 'smtp', label: 'Outgoing email (SMTP)', configured: Boolean(settings.smtp?.hasPassword) },
          { key: 'whatsapp', label: 'WhatsApp', configured: Boolean(settings.whatsapp?.hasAccessToken) },
          { key: 'cosec', label: 'Biometric device (COSEC)', configured: Boolean(cosec?.passwordSet) },
        ],
      },
    };
  }

  /** Workspace administration and platform actions concerning one workspace, newest first. */
  async listTenantActivity(tenantId: string, query: PageQueryDto) {
    await this.assertTenantExists(tenantId);
    const { page, pageSize, offset } = paging(query);
    const source = Prisma.sql`
      FROM (
        SELECT a.id, 'WORKSPACE' AS source, a.occurred_at, a.action_code AS action, a.entity_type AS subject,
               u.display_name AS actor_name, u.email AS actor_email, NULL::varchar AS description
        FROM rndtechnosoft_audit_logs a
        LEFT JOIN rndtechnosoft_users u ON u.id = a.actor_user_id
        WHERE a.tenant_id = ${tenantId}::uuid
        UNION ALL
        SELECT p.id, 'PLATFORM', p.created_at, p.action, p.category,
               sa.display_name, sa.email, p.description
        FROM rndtechnosoft_platform_activity_logs p
        LEFT JOIN rndtechnosoft_super_admins sa ON sa.id = p.super_admin_id
        WHERE p.target_tenant_id = ${tenantId}::uuid
      ) activity`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<ActivityRow[]>`
        SELECT * ${source} ORDER BY occurred_at DESC, id LIMIT ${pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${source}`,
    ]);

    return toPage(
      rows.map((row) => ({
        id: row.id,
        source: row.source,
        occurredAt: row.occurred_at,
        action: row.action,
        subject: row.subject,
        actor: row.actor_name || row.actor_email ? { name: row.actor_name, email: row.actor_email } : null,
        description: row.description,
      })),
      total,
      page,
      pageSize,
    );
  }

  suspendTenant(tenantId: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    return this.changeTenantStatus(tenantId, ['ACTIVE', 'TRIALING'], 'SUSPENDED', admin, context);
  }

  reactivateTenant(tenantId: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    return this.changeTenantStatus(tenantId, ['SUSPENDED'], 'ACTIVE', admin, context);
  }

  // ── Domains ──────────────────────────────────────────────────

  /** Every workspace address with its provisioning state. */
  async listDomains(query: DomainListQueryDto) {
    const { page, pageSize, offset } = paging(query);
    const conditions: Prisma.Sql[] = [];
    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(Prisma.sql`(
        d.subdomain LIKE ${pattern} OR lower(coalesce(d.custom_hostname, '')) LIKE ${pattern}
        OR lower(t.display_name || ' ' || t.legal_name || ' ' || t.tenant_code) LIKE ${pattern}
      )`);
    }
    if (query.status) conditions.push(Prisma.sql`d.provisioning_status = ${query.status}`);
    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
    const source = Prisma.sql`FROM rndtechnosoft_tenant_domains d JOIN rndtechnosoft_tenants t ON t.id = d.tenant_id ${where}`;

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<
        {
          id: string;
          tenant_id: string;
          tenant_code: string;
          tenant_name: string;
          tenant_status: string;
          domain_kind: string;
          subdomain: string | null;
          custom_hostname: string | null;
          is_primary: boolean;
          provisioning_status: string;
          provisioning_error: string | null;
          provisioning_attempts: number;
          last_checked_at: Date | null;
          verified_at: Date | null;
          created_at: Date;
        }[]
      >`
        SELECT d.id, d.tenant_id, t.tenant_code, coalesce(nullif(t.display_name, ''), t.legal_name) AS tenant_name,
               t.tenant_status, d.domain_kind, d.subdomain, d.custom_hostname, d.is_primary, d.provisioning_status,
               d.provisioning_error, d.provisioning_attempts, d.last_checked_at, d.verified_at, d.created_at
        ${source}
        ORDER BY d.created_at DESC, d.id
        LIMIT ${pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total ${source}`,
    ]);

    return toPage(
      rows.map((row) => ({
        id: row.id,
        workspace: { tenantId: row.tenant_id, tenantCode: row.tenant_code, name: row.tenant_name, status: row.tenant_status },
        kind: row.domain_kind,
        subdomain: row.subdomain,
        hostname: row.custom_hostname ?? (row.subdomain ? this.domains.addressOf(row.subdomain) : null),
        isPrimary: row.is_primary,
        status: row.provisioning_status,
        error: row.provisioning_error,
        attempts: row.provisioning_attempts,
        lastCheckedAt: row.last_checked_at,
        verifiedAt: row.verified_at,
        createdAt: row.created_at,
      })),
      total,
      page,
      pageSize,
    );
  }

  /** Moves a workspace to a new address. Old links stop working at once, so this is audited. */
  async changeSubdomain(tenantId: string, requested: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    await this.assertTenantExists(tenantId);
    const change = await this.domains.changePrimarySubdomain(tenantId, requested);
    if (change.previous !== change.subdomain) {
      await this.prisma.$transaction((tx) =>
        this.logPlatformAction(tx, admin, context, {
          category: 'TENANT',
          action: 'TENANT_SUBDOMAIN_CHANGED',
          targetTenantId: tenantId,
          description: `Changed workspace address from ${change.previous} to ${change.subdomain}`,
          metadata: { previous: change.previous, subdomain: change.subdomain },
        }),
      );
    }
    return { subdomain: change.subdomain, address: this.domains.addressOf(change.subdomain) };
  }

  /** Runs the DNS and HTTPS checks for one address now. */
  async verifyDomain(domainId: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    const result = await this.provisioning.verify(domainId);
    const domain = await this.prisma.rndtechnosoft_tenant_domains.findUniqueOrThrow({
      where: { id: domainId },
      select: { tenant_id: true },
    });
    await this.prisma.$transaction((tx) =>
      this.logPlatformAction(tx, admin, context, {
        category: 'TENANT',
        action: 'TENANT_DOMAIN_VERIFIED',
        targetTenantId: domain.tenant_id,
        description: `Checked workspace address ${result.subdomain ?? result.custom_hostname}: ${result.provisioning_status}`,
        metadata: { domainId, status: result.provisioning_status },
      }),
    );
    return {
      id: result.id,
      status: result.provisioning_status,
      error: result.provisioning_error,
      attempts: result.provisioning_attempts,
      lastCheckedAt: result.last_checked_at,
      verifiedAt: result.verified_at,
    };
  }

  // ── Users ────────────────────────────────────────────────────

  /** One row per global user account, with every workspace membership it holds. */
  async listUsers(query: UserListQueryDto) {
    const { page, pageSize, offset } = paging(query);
    const where = this.userWhere(query);
    const sort = USER_SORT[query.sort ?? 'created'];

    const [rows, [{ total }]] = await Promise.all([
      this.prisma.$queryRaw<UserRow[]>`
        SELECT u.id, u.display_name, u.email, u.mobile_number, u.user_status, u.created_at, u.last_login_at,
               u.locked_until,
               coalesce(sess.active_sessions, 0) AS active_sessions, sess.last_activity_at,
               latest.issued_ip_address AS last_ip, latest.user_agent AS last_user_agent,
               coalesce(ms.memberships, '[]'::jsonb) AS memberships
        FROM rndtechnosoft_users u
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE s.revoked_at IS NULL AND s.expires_at > now())::int AS active_sessions,
                 max(s.last_used_at) AS last_activity_at
          FROM rndtechnosoft_user_sessions s
          WHERE s.user_id = u.id
        ) sess ON true
        LEFT JOIN LATERAL (
          SELECT s.issued_ip_address, s.user_agent
          FROM rndtechnosoft_user_sessions s
          WHERE s.user_id = u.id
          ORDER BY s.last_used_at DESC
          LIMIT 1
        ) latest ON true
        LEFT JOIN LATERAL (
          SELECT jsonb_agg(jsonb_build_object(
                   'memberId', m.id,
                   'tenantId', t.id,
                   'tenantCode', t.tenant_code,
                   'tenantName', coalesce(nullif(t.display_name, ''), t.legal_name),
                   'tenantStatus', t.tenant_status,
                   'membershipStatus', m.membership_status,
                   'joinedAt', m.joined_at,
                   'roles', coalesce((
                     SELECT jsonb_agg(
                              jsonb_build_object('code', r.role_code, 'name', r.role_name, 'isSystem', r.is_system_role)
                              ORDER BY r.role_name)
                     FROM rndtechnosoft_tenant_member_roles mr
                     JOIN rndtechnosoft_roles r ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
                     WHERE mr.tenant_id = m.tenant_id AND mr.tenant_member_id = m.id
                   ), '[]'::jsonb)
                 ) ORDER BY m.joined_at ASC NULLS LAST, m.created_at ASC) AS memberships
          FROM rndtechnosoft_tenant_members m
          JOIN rndtechnosoft_tenants t ON t.id = m.tenant_id
          WHERE m.user_id = u.id
        ) ms ON true
        ${where}
        ORDER BY ${sort.column} ${direction(query.order ?? sort.order)} NULLS LAST, u.id
        LIMIT ${pageSize} OFFSET ${offset}`,
      this.prisma.$queryRaw<{ total: number }[]>`SELECT count(*)::int AS total FROM rndtechnosoft_users u ${where}`,
    ]);

    return toPage(
      rows.map((row) => ({
        id: row.id,
        name: row.display_name,
        email: row.email,
        phone: row.mobile_number,
        accountStatus: row.user_status,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at,
        lockedUntil: row.locked_until,
        activeSessions: row.active_sessions,
        lastActivityAt: row.last_activity_at,
        lastSignInIp: row.last_ip,
        lastUserAgent: row.last_user_agent,
        memberships: row.memberships.map((m) => ({
          memberId: m.memberId,
          tenantId: m.tenantId,
          tenantCode: m.tenantCode,
          tenantName: m.tenantName,
          tenantStatus: m.tenantStatus,
          membershipStatus: m.membershipStatus,
          joinedAt: m.joinedAt,
          roles: m.roles.map((r) => ({ code: r.code, name: r.name, kind: roleKind(r.code, r.isSystem) })),
        })),
      })),
      total,
      page,
      pageSize,
    );
  }

  /** Role choices for the user filter: one workspace's roles, or every role code in use. */
  async roleOptions(query: RoleOptionsQueryDto) {
    if (query.tenantId) {
      const roles = await this.prisma.rndtechnosoft_roles.findMany({
        where: { tenant_id: query.tenantId },
        orderBy: { role_name: 'asc' },
        select: { role_code: true, role_name: true },
      });
      return roles.map((r) => ({ code: r.role_code, name: r.role_name }));
    }

    return this.prisma.$queryRaw<{ code: string; name: string }[]>`
      SELECT r.role_code AS code, mode() WITHIN GROUP (ORDER BY r.role_name) AS name
      FROM rndtechnosoft_roles r
      GROUP BY r.role_code
      ORDER BY name`;
  }

  async getUser(userId: string) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
      // Never the password hash.
      select: {
        id: true,
        email: true,
        display_name: true,
        mobile_number: true,
        user_status: true,
        email_verified_at: true,
        failed_login_attempts: true,
        locked_until: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const memberships = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { user_id: userId },
      orderBy: [{ joined_at: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        tenant_id: true,
        membership_status: true,
        joined_at: true,
        archived_at: true,
        rndtechnosoft_tenants: {
          select: { tenant_code: true, display_name: true, legal_name: true, tenant_status: true },
        },
        rndtechnosoft_tenant_member_roles: {
          select: { rndtechnosoft_roles: { select: { role_code: true, role_name: true, is_system_role: true } } },
        },
      },
    });
    const memberIds = memberships.map((m) => m.id);
    const workspaces = new Map(
      memberships.map((m) => [
        m.tenant_id,
        {
          tenantId: m.tenant_id,
          tenantCode: m.rndtechnosoft_tenants.tenant_code,
          tenantName: m.rndtechnosoft_tenants.display_name || m.rndtechnosoft_tenants.legal_name,
        },
      ]),
    );
    const workspace = (tenantId: string | null) => (tenantId ? (workspaces.get(tenantId) ?? null) : null);

    const now = new Date();
    const [sessions, activeSessions, workspaceActivity, crmActivity, membershipEvents, platformEvents] =
      await Promise.all([
        this.prisma.rndtechnosoft_user_sessions.findMany({
          where: { user_id: userId },
          orderBy: { last_used_at: 'desc' },
          take: RECENT_LIMIT,
          // Never the token hash.
          select: {
            id: true,
            tenant_id: true,
            created_at: true,
            last_used_at: true,
            expires_at: true,
            revoked_at: true,
            issued_ip_address: true,
            user_agent: true,
          },
        }),
        this.prisma.rndtechnosoft_user_sessions.count({
          where: { user_id: userId, revoked_at: null, expires_at: { gt: now } },
        }),
        this.prisma.rndtechnosoft_audit_logs.findMany({
          where: { actor_user_id: userId },
          orderBy: { occurred_at: 'desc' },
          take: RECENT_LIMIT,
          select: { id: true, tenant_id: true, occurred_at: true, action_code: true, entity_type: true },
        }),
        memberIds.length > 0
          ? this.prisma.rndtechnosoft_crm_audit_logs.findMany({
              where: { actor_id: { in: memberIds } },
              orderBy: { created_at: 'desc' },
              take: RECENT_LIMIT,
              select: { id: true, tenant_id: true, created_at: true, action_type: true, entity_type: true },
            })
          : [],
        // What workspace administrators changed about this person's memberships.
        memberIds.length > 0
          ? this.prisma.rndtechnosoft_audit_logs.findMany({
              where: { entity_type: 'TENANT_MEMBER', entity_id: { in: memberIds } },
              orderBy: { occurred_at: 'desc' },
              take: RECENT_LIMIT,
              select: {
                id: true,
                tenant_id: true,
                occurred_at: true,
                action_code: true,
                rndtechnosoft_users: { select: { display_name: true, email: true } },
              },
            })
          : [],
        // Platform actions on this account.
        this.prisma.$queryRaw<
          { id: string; created_at: Date; action: string; description: string; admin_name: string | null }[]
        >`
          SELECT p.id, p.created_at, p.action, p.description, sa.display_name AS admin_name
          FROM rndtechnosoft_platform_activity_logs p
          LEFT JOIN rndtechnosoft_super_admins sa ON sa.id = p.super_admin_id
          WHERE p.metadata ? 'userId' AND p.metadata->>'userId' = ${userId}
          ORDER BY p.created_at DESC
          LIMIT ${RECENT_LIMIT}`,
      ]);

    return {
      identity: {
        id: user.id,
        name: user.display_name,
        email: user.email,
        phone: user.mobile_number,
        emailVerifiedAt: user.email_verified_at,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      account: {
        status: user.user_status,
        lastLoginAt: user.last_login_at,
        failedSignInAttempts: user.failed_login_attempts,
        lockedUntil: user.locked_until,
      },
      memberships: memberships.map((m) => ({
        memberId: m.id,
        tenantId: m.tenant_id,
        tenantCode: m.rndtechnosoft_tenants.tenant_code,
        tenantName: m.rndtechnosoft_tenants.display_name || m.rndtechnosoft_tenants.legal_name,
        tenantStatus: m.rndtechnosoft_tenants.tenant_status,
        membershipStatus: m.membership_status,
        joinedAt: m.joined_at,
        removedAt: m.archived_at,
        roles: m.rndtechnosoft_tenant_member_roles.map(({ rndtechnosoft_roles: r }) => ({
          code: r.role_code,
          name: r.role_name,
          kind: roleKind(r.role_code, r.is_system_role),
        })),
      })),
      sessions: {
        active: activeSessions,
        recent: sessions.map((s) => ({
          id: s.id,
          workspace: workspace(s.tenant_id),
          signedInAt: s.created_at,
          lastUsedAt: s.last_used_at,
          expiresAt: s.expires_at,
          revokedAt: s.revoked_at,
          isActive: s.revoked_at === null && s.expires_at > now,
          ipAddress: s.issued_ip_address,
          userAgent: s.user_agent,
        })),
      },
      activity: [
        ...workspaceActivity.map((a) => ({
          id: a.id,
          source: 'WORKSPACE' as const,
          occurredAt: a.occurred_at,
          workspace: workspace(a.tenant_id),
          action: a.action_code,
          subject: a.entity_type,
        })),
        ...crmActivity.map((a) => ({
          id: a.id,
          source: 'CRM' as const,
          occurredAt: a.created_at,
          workspace: workspace(a.tenant_id),
          action: a.action_type,
          subject: a.entity_type,
        })),
      ]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, RECENT_LIMIT),
      securityEvents: [
        ...membershipEvents.map((e) => ({
          id: e.id,
          source: 'WORKSPACE' as const,
          occurredAt: e.occurred_at,
          workspace: workspace(e.tenant_id),
          action: e.action_code,
          actor: e.rndtechnosoft_users?.display_name ?? e.rndtechnosoft_users?.email ?? null,
          description: null,
        })),
        ...platformEvents.map((e) => ({
          id: e.id,
          source: 'PLATFORM' as const,
          occurredAt: e.created_at,
          workspace: null,
          action: e.action,
          actor: e.admin_name,
          description: e.description,
        })),
      ]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, RECENT_LIMIT),
    };
  }

  /**
   * Disables the global sign-in account, on every workspace at once, and ends
   * its sessions. Memberships are left as they are: those belong to each
   * workspace's administrators.
   */
  async disableUser(userId: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    const user = await this.findUserStatus(userId);
    const now = new Date();

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rndtechnosoft_users.updateMany({
        where: { id: userId, user_status: { not: 'DISABLED' } },
        data: { user_status: 'DISABLED', updated_at: now },
      });
      if (updated.count === 0) {
        throw new ConflictException('This account is already disabled.');
      }
      const revoked = await tx.rndtechnosoft_user_sessions.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: now },
      });
      await this.logPlatformAction(tx, admin, context, {
        category: 'USER',
        action: 'USER_ACCOUNT_DISABLED',
        description: 'Disabled a user account on every workspace and ended its sessions',
        metadata: { userId, previousStatus: user.user_status, revokedSessions: revoked.count },
      });
      return revoked.count;
    });

    return { id: userId, accountStatus: 'DISABLED', revokedSessions };
  }

  async enableUser(userId: string, admin: AuthenticatedSuperAdmin, context: PlatformActionContext) {
    await this.findUserStatus(userId);

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.rndtechnosoft_users.updateMany({
        where: { id: userId, user_status: 'DISABLED' },
        data: { user_status: 'ACTIVE', updated_at: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException('Only a disabled account can be enabled.');
      }
      await this.logPlatformAction(tx, admin, context, {
        category: 'USER',
        action: 'USER_ACCOUNT_ENABLED',
        description: 'Enabled a user account',
        metadata: { userId, previousStatus: 'DISABLED' },
      });
    });

    return { id: userId, accountStatus: 'ACTIVE' };
  }

  // ── Internals ────────────────────────────────────────────────

  private tenantSource(query: TenantListQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(Prisma.sql`(
        lower(t.display_name || ' ' || t.legal_name || ' ' || t.tenant_code) LIKE ${pattern}
        OR dom.subdomain LIKE ${pattern}
        OR lower(coalesce(ow.display_name, '') || ' ' || coalesce(ow.email, '')) LIKE ${pattern}
      )`);
    }
    if (query.status) conditions.push(Prisma.sql`t.tenant_status = ${query.status}`);
    if (query.plan) conditions.push(Prisma.sql`sub.plan_code = ${query.plan}`);
    if (query.subscriptionStatus) conditions.push(Prisma.sql`sub.subscription_status = ${query.subscriptionStatus}`);
    if (query.module) conditions.push(Prisma.sql`${moduleEnabledSql(query.module)} = ${query.moduleEnabled ?? true}`);
    if (query.createdFrom) conditions.push(Prisma.sql`t.created_at >= ${query.createdFrom}::timestamptz`);
    if (query.createdTo) conditions.push(Prisma.sql`t.created_at <= ${query.createdTo}::timestamptz`);

    const where = conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

    // The owner is the earliest-joined active member holding the owner role,
    // the same rule the workspace's own settings page uses.
    return Prisma.sql`
      FROM rndtechnosoft_tenants t
      LEFT JOIN rndtechnosoft_tenant_settings s ON s.tenant_id = t.id
      LEFT JOIN rndtechnosoft_tenant_quotas q ON q.tenant_id = t.id
      LEFT JOIN rndtechnosoft_tenant_domains dom
        ON dom.tenant_id = t.id AND dom.is_primary AND dom.domain_kind = 'SUBDOMAIN'
      LEFT JOIN LATERAL (
        SELECT p.plan_code, p.plan_name, ts.subscription_status
        FROM rndtechnosoft_tenant_subscriptions ts
        JOIN rndtechnosoft_plans p ON p.id = ts.plan_id
        WHERE ts.tenant_id = t.id
        ORDER BY (ts.subscription_status IN (${Prisma.join(LIVE_SUBSCRIPTIONS)})) DESC, ts.starts_on DESC, ts.created_at DESC
        LIMIT 1
      ) sub ON true
      LEFT JOIN LATERAL (
        SELECT u.id AS user_id, u.display_name, u.email, u.mobile_number
        FROM rndtechnosoft_tenant_members m
        JOIN rndtechnosoft_users u ON u.id = m.user_id
        WHERE m.tenant_id = t.id
          AND m.membership_status = 'ACTIVE'
          AND EXISTS (
            SELECT 1
            FROM rndtechnosoft_tenant_member_roles mr
            JOIN rndtechnosoft_roles r ON r.tenant_id = mr.tenant_id AND r.id = mr.role_id
            WHERE mr.tenant_id = m.tenant_id AND mr.tenant_member_id = m.id AND r.role_code = ${ADMIN_ROLE_CODE}
          )
        ORDER BY m.joined_at ASC NULLS LAST, m.created_at ASC
        LIMIT 1
      ) ow ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE m.membership_status IN (${Prisma.join([...SEAT_MEMBERSHIP_STATUSES])}))::int AS members,
               count(*) FILTER (WHERE m.membership_status = 'ACTIVE')::int AS active_members,
               count(*) FILTER (WHERE m.membership_status = 'SUSPENDED')::int AS suspended_members,
               count(*) FILTER (WHERE m.membership_status = 'ARCHIVED')::int AS removed_members,
               count(*) FILTER (
                 WHERE m.membership_status IN (${Prisma.join([...SEAT_MEMBERSHIP_STATUSES])}) AND mu.user_status <> 'ACTIVE'
               )::int AS disabled_accounts
        FROM rndtechnosoft_tenant_members m
        JOIN rndtechnosoft_users mu ON mu.id = m.user_id
        WHERE m.tenant_id = t.id
      ) counts ON true
      LEFT JOIN LATERAL (
        SELECT max(us.last_used_at) AS last_activity_at
        FROM rndtechnosoft_user_sessions us
        WHERE us.tenant_id = t.id
      ) activity ON true
      ${where}`;
  }

  private userWhere(query: UserListQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [];

    if (query.search) {
      const pattern = containsPattern(query.search);
      conditions.push(Prisma.sql`(
        lower(coalesce(u.display_name, '') || ' ' || u.email || ' ' || coalesce(u.mobile_number, '')) LIKE ${pattern}
        OR EXISTS (
          SELECT 1
          FROM rndtechnosoft_tenant_members sm
          JOIN rndtechnosoft_tenants st ON st.id = sm.tenant_id
          WHERE sm.user_id = u.id
            AND lower(st.display_name || ' ' || st.legal_name || ' ' || st.tenant_code) LIKE ${pattern}
        )
      )`);
    }
    if (query.accountStatus) conditions.push(Prisma.sql`u.user_status = ${query.accountStatus}`);

    // Workspace, membership status and role must all hold for the same membership.
    const membership: Prisma.Sql[] = [];
    if (query.tenantId) membership.push(Prisma.sql`fm.tenant_id = ${query.tenantId}::uuid`);
    if (query.membershipStatus) membership.push(Prisma.sql`fm.membership_status = ${query.membershipStatus}`);
    if (query.roleCode) {
      membership.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM rndtechnosoft_tenant_member_roles fmr
        JOIN rndtechnosoft_roles fr ON fr.tenant_id = fmr.tenant_id AND fr.id = fmr.role_id
        WHERE fmr.tenant_id = fm.tenant_id AND fmr.tenant_member_id = fm.id AND fr.role_code = ${query.roleCode}
      )`);
    }
    if (membership.length > 0) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM rndtechnosoft_tenant_members fm
        WHERE fm.user_id = u.id AND ${Prisma.join(membership, ' AND ')}
      )`);
    }

    return conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;
  }

  private async findOwner(tenantId: string) {
    const member = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: {
        tenant_id: tenantId,
        membership_status: 'ACTIVE',
        rndtechnosoft_tenant_member_roles: {
          some: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: ADMIN_ROLE_CODE } },
        },
      },
      orderBy: [{ joined_at: 'asc' }, { created_at: 'asc' }],
      select: {
        id: true,
        membership_status: true,
        joined_at: true,
        rndtechnosoft_users: {
          select: {
            id: true,
            display_name: true,
            email: true,
            mobile_number: true,
            user_status: true,
            last_login_at: true,
          },
        },
        rndtechnosoft_tenant_member_roles: {
          select: { rndtechnosoft_roles: { select: { role_code: true, role_name: true, is_system_role: true } } },
        },
      },
    });
    if (!member) return null;

    const user = member.rndtechnosoft_users;
    return {
      userId: user.id,
      memberId: member.id,
      name: user.display_name,
      email: user.email,
      phone: user.mobile_number,
      accountStatus: user.user_status,
      membershipStatus: member.membership_status,
      joinedAt: member.joined_at,
      lastLoginAt: user.last_login_at,
      roles: member.rndtechnosoft_tenant_member_roles.map(({ rndtechnosoft_roles: r }) => ({
        code: r.role_code,
        name: r.role_name,
        kind: roleKind(r.role_code, r.is_system_role),
      })),
    };
  }

  /** The live subscription if there is one, otherwise the most recent. */
  private async currentSubscription(tenantId: string) {
    const subscriptions = await this.prisma.rndtechnosoft_tenant_subscriptions.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ starts_on: 'desc' }, { created_at: 'desc' }],
      select: {
        subscription_status: true,
        starts_on: true,
        ends_on: true,
        trial_ends_on: true,
        rndtechnosoft_plans: { select: { plan_code: true, plan_name: true } },
      },
    });
    const current =
      subscriptions.find((s) => LIVE_SUBSCRIPTIONS.includes(s.subscription_status)) ?? subscriptions[0];
    if (!current) return null;

    return {
      status: current.subscription_status,
      startsOn: current.starts_on,
      endsOn: current.ends_on,
      trialEndsOn: current.trial_ends_on,
      plan: { code: current.rndtechnosoft_plans.plan_code, name: current.rndtechnosoft_plans.plan_name },
    };
  }

  private async assertTenantExists(tenantId: string) {
    const exists = await this.prisma.rndtechnosoft_tenants.count({ where: { id: tenantId } });
    if (exists === 0) {
      throw new NotFoundException('Workspace not found.');
    }
  }

  private async findUserStatus(userId: string) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
      select: { user_status: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    return user;
  }

  private async changeTenantStatus(
    tenantId: string,
    from: string[],
    to: 'ACTIVE' | 'SUSPENDED',
    admin: AuthenticatedSuperAdmin,
    context: PlatformActionContext,
  ) {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { tenant_code: true, tenant_status: true },
    });
    if (!tenant) {
      throw new NotFoundException('Workspace not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the current status, so a concurrent change cannot be overwritten.
      const updated = await tx.rndtechnosoft_tenants.updateMany({
        where: { id: tenantId, tenant_status: { in: from } },
        data: { tenant_status: to, updated_at: new Date() },
      });
      if (updated.count === 0) {
        throw new ConflictException(
          to === 'SUSPENDED'
            ? `${tenant.tenant_code} is already suspended.`
            : `${tenant.tenant_code} is not suspended, so there is nothing to reactivate.`,
        );
      }
      await this.logPlatformAction(tx, admin, context, {
        category: 'TENANT',
        action: to === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_REACTIVATED',
        targetTenantId: tenantId,
        description: `${to === 'SUSPENDED' ? 'Suspended' : 'Reactivated'} workspace ${tenant.tenant_code}`,
        metadata: { previousStatus: tenant.tenant_status },
      });
    });

    return { id: tenantId, status: to };
  }

  private async logPlatformAction(
    tx: Prisma.TransactionClient,
    admin: AuthenticatedSuperAdmin,
    context: PlatformActionContext,
    entry: {
      category: string;
      action: string;
      description: string;
      targetTenantId?: string;
      metadata: Record<string, unknown>;
    },
  ) {
    await tx.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: admin.superAdminId,
        category: entry.category,
        action: entry.action,
        target_tenant_id: entry.targetTenantId ?? null,
        description: entry.description,
        metadata: entry.metadata as Prisma.InputJsonValue,
        ip_address: context.ipAddress ? context.ipAddress.slice(0, 64) : null,
        user_agent: context.userAgent ? context.userAgent.slice(0, 255) : null,
      },
    });
  }
}
