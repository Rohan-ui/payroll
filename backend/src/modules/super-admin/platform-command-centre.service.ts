import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { SEAT_MEMBERSHIP_STATUSES } from '@/common/tenancy/seats';

/** Metrics the Command Centre cannot show yet, and why. Shown as "Not available", never estimated. */
const UNAVAILABLE_METRICS = [
  { metric: 'MRR and ARR', reason: 'Plans have no prices and no invoices have been paid, so recurring revenue cannot be calculated.' },
  { metric: 'Paid workspaces', reason: 'No subscription is linked to a priced plan yet.' },
  { metric: 'Churn', reason: 'Subscription cancellations are not recorded yet.' },
  { metric: 'Failed payments', reason: 'Payment attempts are not recorded; only invoices are.' },
  { metric: 'AI token usage', reason: 'AI usage is not metered.' },
  { metric: 'WhatsApp broadcasts and delivery', reason: 'Outgoing WhatsApp messages are not recorded.' },
  { metric: 'Email volume and bounces', reason: 'Outgoing email is not recorded.' },
  { metric: 'Storage usage', reason: 'File storage is not metered.' },
  { metric: 'API hits', reason: 'API requests are not metered.' },
  { metric: 'Website visitors', reason: 'No website analytics are connected.' },
  { metric: 'Marketplace revenue', reason: 'There is no marketplace.' },
  { metric: 'Uptime', reason: 'No uptime monitoring is connected.' },
] as const;

interface MoneyRow {
  currency_code: string;
  amount: string;
}

/**
 * The platform governance dashboard. Every figure is counted from stored
 * records at request time; the time window is stated with each figure.
 */
@Injectable()
export class PlatformCommandCentreService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const seated = Prisma.join([...SEAT_MEMBERSHIP_STATUSES]);
    const q = <T>(sql: Prisma.Sql) => this.prisma.$queryRaw<T>(sql);

    const [
      workspacesByStatus,
      [workspaceCounts],
      newestWorkspaces,
      [people],
      membershipsByStatus,
      [activity],
      [seats],
      growth,
      subscriptionsByStatus,
      [renewals],
      invoicesByStatus,
      outstanding,
      collected,
      [support],
      [security],
      recentActivity,
    ] = await Promise.all([
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT tenant_status AS status, count(*)::int AS count FROM rndtechnosoft_tenants GROUP BY 1 ORDER BY 1`),
      q<{ total: number; created_30d: number }[]>(Prisma.sql`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS created_30d
        FROM rndtechnosoft_tenants`),
      this.prisma.rndtechnosoft_tenants.findMany({
        orderBy: { created_at: 'desc' },
        take: 5,
        select: { id: true, tenant_code: true, display_name: true, legal_name: true, tenant_status: true, created_at: true },
      }),
      q<{ accounts: number; accounts_not_active: number }[]>(Prisma.sql`
        SELECT count(*)::int AS accounts, count(*) FILTER (WHERE user_status <> 'ACTIVE')::int AS accounts_not_active
        FROM rndtechnosoft_users`),
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT membership_status AS status, count(*)::int AS count FROM rndtechnosoft_tenant_members GROUP BY 1 ORDER BY 1`),
      q<
        {
          active_users_24h: number;
          active_users_7d: number;
          active_users_30d: number;
          sign_ins_24h: number;
          sign_ins_7d: number;
          live_sessions: number;
        }[]
      >(Prisma.sql`
        SELECT count(DISTINCT user_id) FILTER (WHERE last_used_at >= now() - interval '24 hours')::int AS active_users_24h,
               count(DISTINCT user_id) FILTER (WHERE last_used_at >= now() - interval '7 days')::int AS active_users_7d,
               count(DISTINCT user_id) FILTER (WHERE last_used_at >= now() - interval '30 days')::int AS active_users_30d,
               count(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS sign_ins_24h,
               count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS sign_ins_7d,
               count(*) FILTER (WHERE revoked_at IS NULL AND expires_at > now())::int AS live_sessions
        FROM rndtechnosoft_user_sessions`),
      q<{ limited: number; unlimited: number; seat_limit: number | null; seats_used: number }[]>(Prisma.sql`
        SELECT count(q.id)::int AS limited,
               (count(*) - count(q.id))::int AS unlimited,
               sum(q.user_seats_limit)::int AS seat_limit,
               coalesce(sum(CASE WHEN q.id IS NOT NULL THEN used.members END), 0)::int AS seats_used
        FROM rndtechnosoft_tenants t
        LEFT JOIN rndtechnosoft_tenant_quotas q ON q.tenant_id = t.id
        LEFT JOIN LATERAL (
          SELECT count(*)::int AS members FROM rndtechnosoft_tenant_members m
          WHERE m.tenant_id = t.id AND m.membership_status IN (${seated})
        ) used ON true`),
      q<{ tenant_id: string; tenant_code: string; name: string; new_members: number }[]>(Prisma.sql`
        SELECT t.id AS tenant_id, t.tenant_code, coalesce(nullif(t.display_name, ''), t.legal_name) AS name,
               count(*)::int AS new_members
        FROM rndtechnosoft_tenant_members m
        JOIN rndtechnosoft_tenants t ON t.id = m.tenant_id
        WHERE m.joined_at >= now() - interval '30 days'
        GROUP BY t.id
        ORDER BY new_members DESC, name
        LIMIT 5`),
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT subscription_status AS status, count(*)::int AS count FROM rndtechnosoft_tenant_subscriptions GROUP BY 1 ORDER BY 1`),
      q<{ due: number }[]>(Prisma.sql`
        SELECT count(*)::int AS due FROM rndtechnosoft_tenant_subscriptions
        WHERE subscription_status IN ('ACTIVE', 'TRIALING') AND ends_on BETWEEN current_date AND current_date + 14`),
      q<{ status: string; count: number }[]>(Prisma.sql`
        SELECT invoice_status AS status, count(*)::int AS count FROM rndtechnosoft_platform_invoices GROUP BY 1 ORDER BY 1`),
      q<MoneyRow[]>(Prisma.sql`
        SELECT currency_code, sum(total_amount)::text AS amount FROM rndtechnosoft_platform_invoices
        WHERE invoice_status NOT IN ('PAID', 'VOID', 'CANCELLED') GROUP BY 1 ORDER BY 1`),
      q<MoneyRow[]>(Prisma.sql`
        SELECT currency_code, sum(total_amount)::text AS amount FROM rndtechnosoft_platform_invoices
        WHERE invoice_status = 'PAID' AND paid_at >= now() - interval '30 days' GROUP BY 1 ORDER BY 1`),
      q<{ open: number; total: number }[]>(Prisma.sql`
        SELECT count(*) FILTER (WHERE status = 'OPEN')::int AS open, count(*)::int AS total
        FROM rndtechnosoft_platform_support_tickets`),
      q<{ failed_sign_ins_24h: number; live_sessions: number; accounts: number; accounts_without_mfa: number }[]>(Prisma.sql`
        SELECT (SELECT count(*) FROM rndtechnosoft_platform_activity_logs
                WHERE action = 'SUPER_ADMIN_LOGIN_FAILED' AND created_at >= now() - interval '24 hours')::int AS failed_sign_ins_24h,
               (SELECT count(*) FROM rndtechnosoft_super_admin_sessions
                WHERE revoked_at IS NULL AND expires_at > now() AND NOT mfa_pending)::int AS live_sessions,
               (SELECT count(*) FROM rndtechnosoft_super_admins WHERE is_active)::int AS accounts,
               (SELECT count(*) FROM rndtechnosoft_super_admins WHERE is_active AND NOT totp_enabled)::int AS accounts_without_mfa`),
      this.prisma.rndtechnosoft_platform_activity_logs.findMany({
        orderBy: { created_at: 'desc' },
        take: 8,
        select: {
          id: true,
          created_at: true,
          category: true,
          action: true,
          description: true,
          rndtechnosoft_super_admins: { select: { display_name: true } },
        },
      }),
    ]);

    const byStatus = (rows: { status: string; count: number }[]) =>
      Object.fromEntries(rows.map((row) => [row.status, row.count]));
    const memberships = byStatus(membershipsByStatus);
    const money = (rows: MoneyRow[]) => rows.map((row) => ({ currency: row.currency_code, amount: row.amount }));

    return {
      generatedAt: new Date(),
      workspaces: {
        total: workspaceCounts.total,
        byStatus: byStatus(workspacesByStatus),
        createdLast30Days: workspaceCounts.created_30d,
        newest: newestWorkspaces.map((t) => ({
          id: t.id,
          tenantCode: t.tenant_code,
          name: t.display_name || t.legal_name,
          status: t.tenant_status,
          createdAt: t.created_at,
        })),
      },
      people: {
        accounts: people.accounts,
        accountsNotActive: people.accounts_not_active,
        activeMemberships: memberships.ACTIVE ?? 0,
        suspendedMemberships: memberships.SUSPENDED ?? 0,
        removedMemberships: memberships.ARCHIVED ?? 0,
      },
      activity: {
        activeUsers24h: activity.active_users_24h,
        activeUsers7d: activity.active_users_7d,
        activeUsers30d: activity.active_users_30d,
        signIns24h: activity.sign_ins_24h,
        signIns7d: activity.sign_ins_7d,
        liveSessions: activity.live_sessions,
      },
      seats: {
        workspacesWithLimit: seats.limited,
        workspacesWithoutLimit: seats.unlimited,
        seatLimitTotal: seats.seat_limit,
        seatsUsedInLimitedWorkspaces: seats.seats_used,
      },
      growth: growth.map((row) => ({
        tenantId: row.tenant_id,
        tenantCode: row.tenant_code,
        name: row.name,
        newMembers: row.new_members,
      })),
      subscriptions: {
        byStatus: byStatus(subscriptionsByStatus),
        total: subscriptionsByStatus.reduce((sum, row) => sum + row.count, 0),
        renewalsDue14Days: renewals.due,
      },
      billing: {
        invoicesByStatus: byStatus(invoicesByStatus),
        invoiceCount: invoicesByStatus.reduce((sum, row) => sum + row.count, 0),
        outstanding: money(outstanding),
        collectedLast30Days: money(collected),
      },
      support: { open: support.open, total: support.total },
      security: {
        failedPlatformSignIns24h: security.failed_sign_ins_24h,
        livePlatformSessions: security.live_sessions,
        platformAccounts: security.accounts,
        platformAccountsWithoutMfa: security.accounts_without_mfa,
      },
      recentActivity: recentActivity.map((entry) => ({
        id: entry.id,
        occurredAt: entry.created_at,
        category: entry.category,
        action: entry.action,
        description: entry.description,
        actor: entry.rndtechnosoft_super_admins?.display_name ?? null,
      })),
      unavailable: UNAVAILABLE_METRICS,
    };
  }
}
