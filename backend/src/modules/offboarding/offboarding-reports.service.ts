import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AccessService } from '@/common/access/access.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { isoDate } from '@/modules/payroll/payroll-lock';
import { OffboardingReportQueryDto } from './dto/offboarding.dto';
import { ExitReasonsService } from './exit-reasons.service';

type Actor = AuthenticatedTenantUser;

/** How many days ahead counts as an upcoming last working day. */
const UPCOMING_DAYS = 30;
/**
 * shortcut: every exit of the workspace is read and grouped here, which is
 * fine for thousands of exits; move the grouping into SQL if a workspace
 * nears this many.
 */
const MAX_EXITS = 20_000;

const TYPE_GROUP: Record<string, string> = { RESIGNATION: 'Voluntary resignation', TERMINATION: 'Termination', RETIREMENT: 'Retirement', CONTRACT_END: 'Contract completion' };

interface ExitRow {
  id: string;
  separation_type: string;
  separation_status: string;
  last_working_date: Date;
  primary_exit_reason: string | null;
  employee_code: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  designation_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  manager_employee_id: string | null;
  manager_name: string | null;
}

const count = <K extends string>(rows: ExitRow[], key: (r: ExitRow) => K | null) => {
  const map = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k !== null) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || String(a.label).localeCompare(String(b.label)));
};

const period = (d: Date, by: 'month' | 'quarter' | 'year') => {
  const y = d.getUTCFullYear();
  if (by === 'year') return `${y}`;
  if (by === 'quarter') return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** Every period between two dates, so a period with no exits still shows as zero. */
const periods = (from: string, to: string, by: 'month' | 'quarter' | 'year') => {
  const out: string[] = [];
  const d = new Date(`${from.slice(0, 7)}-01T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (d <= end && out.length < 400) {
    const p = period(d, by);
    if (out[out.length - 1] !== p) out.push(p);
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
};

/**
 * The offboarding dashboard and reports, for one workspace. Filters by
 * department, location, exit type, status and manager apply throughout; the
 * date range picks exits by their last working day for the trends and
 * breakdowns. Settlement money is shown only to those who may see settlements.
 */
@Injectable()
export class OffboardingReportsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly reasons: ExitReasonsService) {}

  async report(tenantId: string, q: OffboardingReportQueryDto, actor: Actor) {
    if (q.from > q.to) throw new BadRequestException('The start of the range must be on or before its end.');
    const [all, reasons, held] = await Promise.all([this.exits(tenantId), this.reasons.list(tenantId), this.access.getMemberPermissions(tenantId, actor.tenantMemberId)]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const soon = isoDate(new Date(new Date(`${today}T00:00:00.000Z`).getTime() + UPCOMING_DAYS * 86_400_000));

    const options = {
      departments: count(all.filter((r) => r.department_id), (r) => `${r.department_id}|${r.department_name}`).map((o) => ({ id: o.label.split('|')[0], name: o.label.split('|')[1] })),
      locations: count(all.filter((r) => r.branch_id), (r) => `${r.branch_id}|${r.branch_name}`).map((o) => ({ id: o.label.split('|')[0], name: o.label.split('|')[1] })),
      managers: count(all.filter((r) => r.manager_employee_id), (r) => `${r.manager_employee_id}|${r.manager_name}`).map((o) => ({ id: o.label.split('|')[0], name: o.label.split('|')[1] })),
    };
    for (const list of Object.values(options)) list.sort((a, b) => a.name.localeCompare(b.name));

    const scoped = all.filter((r) => (!q.departmentId || r.department_id === q.departmentId) && (!q.locationId || r.branch_id === q.locationId)
      && (!q.type || r.separation_type === q.type) && (!q.status || r.separation_status === q.status) && (!q.managerId || r.manager_employee_id === q.managerId));
    // In the range: exits that happen (or happened), unless the status filter asks for withdrawn or cancelled ones.
    const ranged = scoped.filter((r) => {
      const day = isoDate(r.last_working_date);
      return day >= q.from && day <= q.to && (q.status ? true : !['WITHDRAWN', 'CANCELLED'].includes(r.separation_status));
    });
    const byStatus = (s: string) => scoped.filter((r) => r.separation_status === s);
    const open = byStatus('IN_PROGRESS');

    const [pendingItems, settlements] = await Promise.all([
      open.length ? this.prisma.rndtechnosoft_separation_clearance_items.count({ where: { tenant_id: tenantId, item_status: 'PENDING', separation_id: { in: open.map((r) => r.id) } } }) : 0,
      held.includes('offboarding.settlement.view') ? this.settlements(tenantId, scoped, ranged) : null,
    ]);

    const label = (code: string | null) => (code ? reasons.find((r) => r.code === code)?.label ?? code : null);
    const trend = new Map(periods(q.from, q.to, q.groupBy).map((p) => [p, 0]));
    for (const r of ranged) {
      const p = period(r.last_working_date, q.groupBy);
      if (trend.has(p)) trend.set(p, (trend.get(p) ?? 0) + 1);
    }

    return {
      range: { from: q.from, to: q.to, groupBy: q.groupBy },
      today,
      summary: {
        total: scoped.length,
        pendingResignations: byStatus('PENDING_APPROVAL').length,
        accepted: open.length,
        upcomingLastDays: open.filter((r) => { const d = isoDate(r.last_working_date); return d >= today && d <= soon; }).length,
        pastLastDay: open.filter((r) => isoDate(r.last_working_date) < today).length,
        completed: byStatus('COMPLETED').length,
        cancelled: byStatus('CANCELLED').length + byStatus('WITHDRAWN').length,
        pendingChecklistItems: pendingItems,
      },
      trend: [...trend.entries()].map(([p, value]) => ({ period: p, value })),
      byDepartment: count(ranged, (r) => r.department_name ?? 'No department'),
      byDesignation: count(ranged, (r) => r.designation_name ?? 'No designation'),
      byType: count(ranged, (r) => TYPE_GROUP[r.separation_type] ?? 'Other'),
      byReason: count(ranged, (r) => label(r.primary_exit_reason) ?? 'Interview not recorded'),
      settlements,
      upcoming: open
        .filter((r) => isoDate(r.last_working_date) <= soon)
        .sort((a, b) => a.last_working_date.getTime() - b.last_working_date.getTime())
        .slice(0, 50)
        .map((r) => ({
          id: r.id, lastWorkingDate: isoDate(r.last_working_date), type: r.separation_type, employee: { name: r.employee_name, code: r.employee_code },
          department: r.department_name, location: r.branch_name, manager: r.manager_name,
        })),
      options,
    };
  }

  /** Every exit with the department, designation and location it ended in, and the manager on the last day. */
  private exits(tenantId: string) {
    return this.prisma.$queryRaw<ExitRow[]>(Prisma.sql`
      SELECT s.id, s.separation_type, s.separation_status, s.last_working_date, s.primary_exit_reason,
             e.employee_code, btrim(coalesce(nullif(e.preferred_name, ''), e.first_name) || ' ' || coalesce(e.last_name, '')) AS employee_name,
             job.department_id, d.department_name, g.designation_name, job.branch_id, b.branch_name,
             line.manager_employee_id, btrim(coalesce(nullif(m.preferred_name, ''), m.first_name) || ' ' || coalesce(m.last_name, '')) AS manager_name
      FROM rndtechnosoft_employee_separations s
      JOIN rndtechnosoft_employees e ON e.tenant_id = s.tenant_id AND e.id = s.employee_id
      LEFT JOIN LATERAL (
        SELECT department_id, designation_id, branch_id FROM rndtechnosoft_employee_employments j
        WHERE j.tenant_id = s.tenant_id AND j.employee_id = s.employee_id AND j.effective_from <= s.last_working_date
        ORDER BY j.effective_from DESC LIMIT 1
      ) job ON true
      LEFT JOIN rndtechnosoft_departments d ON d.tenant_id = s.tenant_id AND d.id = job.department_id
      LEFT JOIN rndtechnosoft_designations g ON g.tenant_id = s.tenant_id AND g.id = job.designation_id
      LEFT JOIN rndtechnosoft_branches b ON b.tenant_id = s.tenant_id AND b.id = job.branch_id
      LEFT JOIN LATERAL (
        SELECT manager_employee_id FROM rndtechnosoft_employee_reporting_lines l
        WHERE l.tenant_id = s.tenant_id AND l.employee_id = s.employee_id AND l.relationship_type = 'PRIMARY' AND l.line_status = 'ACTIVE'
          AND l.effective_from <= LEAST(s.last_working_date, CURRENT_DATE) AND (l.effective_to IS NULL OR l.effective_to >= LEAST(s.last_working_date, CURRENT_DATE))
        ORDER BY l.effective_from DESC LIMIT 1
      ) line ON true
      LEFT JOIN rndtechnosoft_employees m ON m.tenant_id = s.tenant_id AND m.id = line.manager_employee_id
      WHERE s.tenant_id = ${tenantId}::uuid
      ORDER BY s.last_working_date DESC
      LIMIT ${MAX_EXITS}
    `);
  }

  /** Settlement counts and money: the live settlement of each exit in scope; payments and recoveries for exits in the range. */
  private async settlements(tenantId: string, scoped: ExitRow[], ranged: ExitRow[]) {
    const rows = scoped.length
      ? await this.prisma.rndtechnosoft_final_settlements.findMany({
        where: { tenant_id: tenantId, separation_id: { in: scoped.map((r) => r.id) }, settlement_status: { in: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PAID'] } },
        select: { separation_id: true, settlement_status: true, net_amount: true, total_recoveries: true },
      })
      : [];
    const inRange = new Set(ranged.map((r) => r.id));
    const settled = new Set(rows.map((r) => r.separation_id));
    const sum = (list: typeof rows, pick: (r: (typeof rows)[number]) => Prisma.Decimal) => list.reduce((t, r) => t.add(pick(r)), new Prisma.Decimal(0)).toFixed(2);
    const paidInRange = rows.filter((r) => r.settlement_status === 'PAID' && inRange.has(r.separation_id));
    const awaitingApproval = rows.filter((r) => ['DRAFT', 'PENDING_REVIEW'].includes(r.settlement_status));
    const approved = rows.filter((r) => r.settlement_status === 'APPROVED');
    return {
      // Exits that need one: under way or completed, with no settlement yet, plus drafts and those in review.
      pending: awaitingApproval.length + scoped.filter((r) => ['IN_PROGRESS', 'COMPLETED'].includes(r.separation_status) && !settled.has(r.id)).length,
      notStarted: scoped.filter((r) => ['IN_PROGRESS', 'COMPLETED'].includes(r.separation_status) && !settled.has(r.id)).length,
      inReview: awaitingApproval.length,
      approvedUnpaid: approved.length,
      approvedUnpaidAmount: sum(approved, (r) => r.net_amount),
      paid: paidInRange.length,
      // Money in the range: what was paid out (only what the company paid, not what the employee owed) and what was recovered.
      totalPaid: sum(paidInRange.filter((r) => r.net_amount.gt(0)), (r) => r.net_amount),
      totalRecoveries: sum(paidInRange, (r) => r.total_recoveries),
    };
  }
}
