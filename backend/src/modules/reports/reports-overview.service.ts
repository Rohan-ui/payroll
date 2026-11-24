import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AccessService } from '@/common/access/access.service';
import { leadVisibility } from '@/modules/crm/lead-visibility';

type Money = Prisma.Decimal | string | number | null;
const amount = (v: Money) => new Prisma.Decimal(v ?? 0).toFixed(2);

/**
 * A snapshot of each area for the Reports page, so each report is shown with
 * what it currently holds. An area appears only when the member holds the same
 * permissions its export needs; the rest are left out, not zeroed. Counts are
 * the workspace's own; amounts are decimal strings in rupees.
 */
@Injectable()
export class ReportsOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async overview(tenantId: string, memberId: string) {
    const held = await this.access.getMemberPermissions(tenantId, memberId);
    const has = (...keys: string[]) => keys.every((k) => (held as string[]).includes(k));
    const reports = has('reports.view');

    const [people, attendance, leave, payroll, exits, sales] = await Promise.all([
      has('people.export') || (reports && has('people.view')) ? this.people(tenantId) : null,
      reports && has('attendance.view') ? this.attendance(tenantId) : null,
      reports && has('leave.view') ? this.leave(tenantId) : null,
      reports && has('payroll.view', 'salary.view') ? this.payroll(tenantId) : null,
      reports && has('offboarding.view') ? this.exits(tenantId) : null,
      has('leads.export') || has('analytics.view') ? this.sales(tenantId, leadVisibility(held, memberId)) : null,
    ]);
    return { people, attendance, leave, payroll, exits, sales };
  }

  private async people(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ active: number; on_notice: number; inactive: number; joined: number }[]>`
      SELECT count(*) FILTER (WHERE e.employee_status IN ('ACTIVE', 'ON_NOTICE'))::int AS active,
             count(*) FILTER (WHERE e.employee_status = 'ON_NOTICE')::int AS on_notice,
             count(*) FILTER (WHERE e.employee_status NOT IN ('ACTIVE', 'ON_NOTICE'))::int AS inactive,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM rndtechnosoft_employee_employments ee
               WHERE ee.tenant_id = e.tenant_id AND ee.employee_id = e.id AND ee.joining_date >= date_trunc('month', CURRENT_DATE)
             ))::int AS joined
      FROM rndtechnosoft_employees e
      WHERE e.tenant_id = ${tenantId}::uuid`;
    return { active: row.active, onNotice: row.on_notice, inactive: row.inactive, joinedThisMonth: row.joined };
  }

  /** The current month so far. */
  private async attendance(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ month: string; present: number; half: number; absent: number; leave: number; late: number; overtime: number }[]>`
      SELECT to_char(CURRENT_DATE, 'YYYY-MM') AS month,
             count(*) FILTER (WHERE r.attendance_status = 'PRESENT')::int AS present,
             count(*) FILTER (WHERE r.attendance_status = 'HALF_DAY')::int AS half,
             count(*) FILTER (WHERE r.attendance_status = 'ABSENT')::int AS absent,
             count(*) FILTER (WHERE r.attendance_status IN ('PAID_LEAVE', 'UNPAID_LEAVE'))::int AS leave,
             count(*) FILTER (WHERE r.late_minutes > 0)::int AS late,
             coalesce(sum(r.overtime_minutes), 0)::int AS overtime
      FROM rndtechnosoft_attendance_records r
      WHERE r.tenant_id = ${tenantId}::uuid AND r.attendance_date >= date_trunc('month', CURRENT_DATE) AND r.attendance_date <= CURRENT_DATE`;
    const working = row.present + row.half + row.absent;
    return {
      month: row.month,
      // Half days count half; leave, holidays and weekends are not working days here.
      attendanceRate: working ? Math.round(((row.present + row.half / 2) / working) * 100) : null,
      absentDays: row.absent, leaveDays: row.leave, lateMarks: row.late, overtimeHours: Math.round(row.overtime / 60),
    };
  }

  private async leave(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ pending: number; on_leave_today: number; approved_days: number }[]>`
      SELECT count(*) FILTER (WHERE q.request_status = 'PENDING')::int AS pending,
             count(DISTINCT q.employee_id) FILTER (WHERE q.request_status = 'APPROVED' AND CURRENT_DATE BETWEEN q.start_date AND q.end_date)::int AS on_leave_today,
             coalesce(sum(q.requested_days) FILTER (WHERE q.request_status = 'APPROVED' AND q.start_date >= date_trunc('month', CURRENT_DATE)), 0)::float AS approved_days
      FROM rndtechnosoft_leave_requests q
      WHERE q.tenant_id = ${tenantId}::uuid`;
    return { pending: row.pending, onLeaveToday: row.on_leave_today, approvedDaysThisMonth: row.approved_days };
  }

  /** The latest period with issued payslips, from the payslips themselves. */
  private async payroll(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ period_code: string; period_start: Date; employees: number; gross: Money; deductions: Money; net: Money }[]>`
      SELECT p.period_code, p.period_start, count(s.id)::int AS employees,
             sum(s.gross_earnings) AS gross, sum(s.gross_deductions) AS deductions, sum(s.net_pay) AS net
      FROM rndtechnosoft_payroll_periods p
      JOIN rndtechnosoft_payslips s ON s.tenant_id = p.tenant_id AND s.payroll_period_id = p.id
      WHERE p.tenant_id = ${tenantId}::uuid
      GROUP BY p.id, p.period_code, p.period_start
      ORDER BY p.period_start DESC
      LIMIT 1`;
    const open = await this.prisma.rndtechnosoft_payroll_periods.count({ where: { tenant_id: tenantId, period_status: { not: 'CLOSED' } } });
    if (!row) return { latestPeriod: null, openPeriods: open };
    return {
      latestPeriod: { code: row.period_code, employees: row.employees, gross: amount(row.gross), deductions: amount(row.deductions), net: amount(row.net) },
      openPeriods: open,
    };
  }

  private async exits(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ in_progress: number; leaving_soon: number; completed_year: number }[]>`
      SELECT count(*) FILTER (WHERE s.separation_status IN ('PENDING_APPROVAL', 'IN_PROGRESS'))::int AS in_progress,
             count(*) FILTER (WHERE s.separation_status IN ('PENDING_APPROVAL', 'IN_PROGRESS') AND s.last_working_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30)::int AS leaving_soon,
             count(*) FILTER (WHERE s.separation_status = 'COMPLETED' AND s.last_working_date >= date_trunc('year', CURRENT_DATE))::int AS completed_year
      FROM rndtechnosoft_employee_separations s
      WHERE s.tenant_id = ${tenantId}::uuid`;
    return { inProgress: row.in_progress, leavingIn30Days: row.leaving_soon, completedThisYear: row.completed_year };
  }

  /** Sales pipelines only, as the member may see them. */
  private async sales(tenantId: string, visibility: ReturnType<typeof leadVisibility>) {
    const mine = visibility.all ? Prisma.empty : Prisma.sql`AND l.assigned_tenant_member_id = ${visibility.memberId}::uuid`;
    const [row] = await this.prisma.$queryRaw<{ leads: number; open: number; open_value: Money; won_month: number; won_month_value: Money }[]>`
      SELECT count(*)::int AS leads,
             count(*) FILTER (WHERE NOT l.is_won AND NOT l.is_lost)::int AS open,
             coalesce(sum(l.budget_amount) FILTER (WHERE NOT l.is_won AND NOT l.is_lost), 0) AS open_value,
             count(*) FILTER (WHERE l.is_won AND l.closed_at >= date_trunc('month', now()))::int AS won_month,
             coalesce(sum(l.budget_amount) FILTER (WHERE l.is_won AND l.closed_at >= date_trunc('month', now())), 0) AS won_month_value
      FROM rndtechnosoft_crm_leads l
      JOIN rndtechnosoft_crm_pipelines p ON p.tenant_id = l.tenant_id AND p.id = l.pipeline_id AND p.pipeline_kind = 'SALES'
      WHERE l.tenant_id = ${tenantId}::uuid ${mine}`;
    return { leads: row.leads, openDeals: row.open, openValue: amount(row.open_value), wonThisMonth: row.won_month, wonThisMonthValue: amount(row.won_month_value) };
  }
}
