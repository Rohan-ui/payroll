import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { LeadVisibility } from './lead-visibility';

/** How far back the won-deals trend goes, in months, this one included. */
const TREND_MONTHS = 12;

type Money = Prisma.Decimal | string | number | null;
const amount = (v: Money) => new Prisma.Decimal(v ?? 0).toFixed(2);

/**
 * CRM reports, worked out on the server from every lead in the workspace's
 * sales pipelines (outreach pipelines are not deals yet), as the member may
 * see them: everyone's with leads.view_all, otherwise their own. Amounts are
 * decimal strings in rupees. The weighted forecast uses the stage's
 * probability, else the lead's own, else 20%, as the CRM always has.
 */
@Injectable()
export class CrmReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * The same figures as the reports page, as an Excel workbook: one sheet per
   * section. Audited, since it copies the member's whole sales picture.
   */
  async exportSummary(tenantId: string, visibility: LeadVisibility, actor: AuthenticatedTenantUser): Promise<Buffer> {
    const r = await this.summary(tenantId, visibility);
    const book = new ExcelJS.Workbook();
    book.created = new Date();
    const RUPEES = '#,##0.00';
    const sheet = (name: string, columns: { header: string; key: string; width?: number; money?: boolean }[], rows: object[]) => {
      const ws = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.money ? { numFmt: RUPEES } : undefined }));
      ws.getRow(1).font = { bold: true };
      ws.addRows(rows);
    };
    const n = (v: string | null) => (v === null ? null : Number(v));
    const t = r.totals;
    sheet('Summary', [{ header: 'Measure', key: 'measure', width: 28 }, { header: 'Value', key: 'value', width: 18 }], [
      { measure: 'Leads', value: t.totalLeads },
      { measure: 'New leads this month', value: t.newThisMonth },
      { measure: 'New leads last month', value: t.newLastMonth },
      { measure: 'Average days to win', value: t.averageDaysToWin },
      { measure: 'Open deals', value: t.openCount },
      { measure: 'Open pipeline value (₹)', value: n(t.openValue) },
      { measure: 'Weighted forecast (₹)', value: n(t.weightedForecast) },
      { measure: 'Deals won', value: t.wonCount },
      { measure: 'Won value (₹)', value: n(t.wonValue) },
      { measure: 'Deals lost', value: t.lostCount },
      { measure: 'Win rate (%)', value: t.winRate },
      { measure: 'Average won deal (₹)', value: n(t.averageWon) },
    ]);
    sheet('Open deals by stage', [
      { header: 'Pipeline', key: 'pipelineName', width: 22 }, { header: 'Stage', key: 'name', width: 26 },
      { header: 'Open deals', key: 'count' }, { header: 'Value (₹)', key: 'value', money: true },
    ], r.stages.map((s) => ({ ...s, value: n(s.value) })));
    sheet('By source', [
      { header: 'Source', key: 'name', width: 24 }, { header: 'Leads', key: 'leads' }, { header: 'Won', key: 'won' }, { header: 'Value (₹)', key: 'value', money: true },
    ], r.sources.map((s) => ({ ...s, value: n(s.value) })));
    sheet('By assignee', [
      { header: 'Assignee', key: 'name', width: 26 }, { header: 'Open deals', key: 'open' }, { header: 'Open value (₹)', key: 'openValue', money: true }, { header: 'Won', key: 'won' },
    ], r.assignees.map((a) => ({ ...a, openValue: n(a.openValue) })));
    sheet('By month', [
      { header: 'Month', key: 'month' }, { header: 'Leads created', key: 'created' }, { header: 'Deals won', key: 'won' }, { header: 'Value (₹)', key: 'value', money: true },
    ], r.wonByMonth.map((m) => ({ ...m, value: n(m.value) })));
    const bytes = Buffer.from(await book.xlsx.writeBuffer());
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'CRM_REPORT_EXPORTED', entityType: 'CRM_REPORT', metadata: { scope: visibility.all ? 'ALL' : 'OWN' },
    });
    return bytes;
  }

  async summary(tenantId: string, visibility: LeadVisibility) {
    const seen = visibility.all ? Prisma.empty : Prisma.sql`AND l.assigned_tenant_member_id = ${visibility.memberId}::uuid`;
    // Leads in the workspace's sales pipelines that this member may see.
    const leads = Prisma.sql`rndtechnosoft_crm_leads l
      JOIN rndtechnosoft_crm_pipelines p ON p.tenant_id = l.tenant_id AND p.id = l.pipeline_id AND p.pipeline_kind = 'SALES'`;
    const mine = Prisma.sql`l.tenant_id = ${tenantId}::uuid ${seen}`;

    const [totals, stages, sources, assignees, trend, created] = await Promise.all([
      this.prisma.$queryRaw<{ open_count: number; open_value: Money; weighted: Money; won_count: number; won_value: Money; lost_count: number; total: number; new_this_month: number; new_last_month: number; avg_days_to_win: number | null }[]>(Prisma.sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE l.created_at >= date_trunc('month', now()))::int AS new_this_month,
          count(*) FILTER (WHERE l.created_at >= date_trunc('month', now()) - interval '1 month' AND l.created_at < date_trunc('month', now()))::int AS new_last_month,
          round(avg(extract(epoch FROM (l.closed_at - l.created_at)) / 86400) FILTER (WHERE l.is_won AND l.closed_at IS NOT NULL))::int AS avg_days_to_win,
          count(*) FILTER (WHERE NOT l.is_won AND NOT l.is_lost)::int AS open_count,
          coalesce(sum(l.budget_amount) FILTER (WHERE NOT l.is_won AND NOT l.is_lost), 0) AS open_value,
          coalesce(sum(l.budget_amount * coalesce(nullif(s.stage_probability, 0), l.win_probability, 20) / 100) FILTER (WHERE NOT l.is_won AND NOT l.is_lost), 0) AS weighted,
          count(*) FILTER (WHERE l.is_won)::int AS won_count,
          coalesce(sum(l.budget_amount) FILTER (WHERE l.is_won), 0) AS won_value,
          count(*) FILTER (WHERE l.is_lost AND NOT l.is_won)::int AS lost_count
        FROM ${leads}
        LEFT JOIN rndtechnosoft_crm_stages s ON s.tenant_id = l.tenant_id AND s.id = l.stage_id
        WHERE ${mine}`),
      // Every stage of every active sales pipeline with its open deals, empty stages included.
      this.prisma.$queryRaw<{ stage_id: string; stage_name: string; color: string; pipeline_id: string; pipeline_name: string; count: number; value: Money }[]>(Prisma.sql`
        SELECT s.id AS stage_id, s.name AS stage_name, s.color, p.id AS pipeline_id, p.name AS pipeline_name,
               count(l.id)::int AS count, coalesce(sum(l.budget_amount), 0) AS value
        FROM rndtechnosoft_crm_stages s
        JOIN rndtechnosoft_crm_pipelines p ON p.tenant_id = s.tenant_id AND p.id = s.pipeline_id AND p.pipeline_kind = 'SALES' AND p.is_active
        LEFT JOIN rndtechnosoft_crm_leads l ON l.tenant_id = s.tenant_id AND l.stage_id = s.id AND NOT l.is_won AND NOT l.is_lost ${seen}
        WHERE s.tenant_id = ${tenantId}::uuid
        GROUP BY s.id, s.name, s.color, s.sort_order, p.id, p.name, p.sort_order
        ORDER BY p.sort_order, p.name, s.sort_order, s.name`),
      this.prisma.$queryRaw<{ name: string | null; leads: number; won: number; value: Money }[]>(Prisma.sql`
        SELECT src.name, count(*)::int AS leads, count(*) FILTER (WHERE l.is_won)::int AS won, coalesce(sum(l.budget_amount), 0) AS value
        FROM ${leads}
        LEFT JOIN rndtechnosoft_crm_lead_sources src ON src.tenant_id = l.tenant_id AND src.id = l.source_id
        WHERE ${mine}
        GROUP BY src.name
        ORDER BY count(*) DESC, src.name`),
      this.prisma.$queryRaw<{ name: string | null; open: number; open_value: Money; won: number }[]>(Prisma.sql`
        SELECT coalesce(nullif(u.display_name, ''), u.email) AS name,
               count(*) FILTER (WHERE NOT l.is_won AND NOT l.is_lost)::int AS open,
               coalesce(sum(l.budget_amount) FILTER (WHERE NOT l.is_won AND NOT l.is_lost), 0) AS open_value,
               count(*) FILTER (WHERE l.is_won)::int AS won
        FROM ${leads}
        LEFT JOIN rndtechnosoft_tenant_members m ON m.tenant_id = l.tenant_id AND m.id = l.assigned_tenant_member_id
        LEFT JOIN rndtechnosoft_users u ON u.id = m.user_id
        WHERE ${mine}
        GROUP BY 1
        ORDER BY 2 DESC, 1`),
      this.prisma.$queryRaw<{ month: string; won: number; value: Money }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', l.closed_at), 'YYYY-MM') AS month, count(*)::int AS won, coalesce(sum(l.budget_amount), 0) AS value
        FROM ${leads}
        WHERE ${mine} AND l.is_won AND l.closed_at >= date_trunc('month', now()) - make_interval(months => ${TREND_MONTHS - 1}::int)
        GROUP BY 1`),
      this.prisma.$queryRaw<{ month: string; created: number }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', l.created_at), 'YYYY-MM') AS month, count(*)::int AS created
        FROM ${leads}
        WHERE ${mine} AND l.created_at >= date_trunc('month', now()) - make_interval(months => ${TREND_MONTHS - 1}::int)
        GROUP BY 1`),
    ]);

    const t = totals[0];
    const closed = t.won_count + t.lost_count;
    const byMonth = new Map(trend.map((r) => [r.month, r]));
    const createdByMonth = new Map(created.map((r) => [r.month, r.created]));
    const months: { month: string; won: number; value: string; created: number }[] = [];
    const now = new Date();
    for (let i = TREND_MONTHS - 1; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      const row = byMonth.get(key);
      months.push({ month: key, won: row?.won ?? 0, value: amount(row?.value ?? 0), created: createdByMonth.get(key) ?? 0 });
    }

    return {
      totals: {
        totalLeads: t.total, newThisMonth: t.new_this_month, newLastMonth: t.new_last_month, averageDaysToWin: t.avg_days_to_win,
        openCount: t.open_count, openValue: amount(t.open_value), weightedForecast: amount(t.weighted),
        wonCount: t.won_count, wonValue: amount(t.won_value), lostCount: t.lost_count,
        // Of the deals that are closed, how many were won; null until one closes.
        winRate: closed ? Math.round((t.won_count / closed) * 100) : null,
        averageWon: t.won_count ? amount(new Prisma.Decimal(t.won_value ?? 0).div(t.won_count)) : null,
      },
      stages: stages.map((s) => ({ id: s.stage_id, name: s.stage_name, color: s.color, pipelineId: s.pipeline_id, pipelineName: s.pipeline_name, count: s.count, value: amount(s.value) })),
      sources: sources.map((s) => ({ name: s.name ?? 'No source', leads: s.leads, won: s.won, value: amount(s.value) })),
      assignees: assignees.map((a) => ({ name: a.name ?? 'Unassigned', open: a.open, openValue: amount(a.open_value), won: a.won })),
      wonByMonth: months,
    };
  }
}
