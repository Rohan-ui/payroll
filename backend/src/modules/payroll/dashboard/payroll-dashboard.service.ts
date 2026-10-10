import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { isoDate } from '../payroll-lock';
import { monthRange } from '../calculation/dto/calculation.dto';
import { DashboardEmployeesQuery } from './payroll-dashboard.dto';

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** Change from one amount to another as a percentage with one decimal, or null when there is nothing to compare with. */
const change = (now: Decimal, before: Decimal | null) => (before && !before.isZero() ? now.minus(before).div(before).times(100).toDecimalPlaces(1, Prisma.Decimal.ROUND_HALF_UP).toFixed(1) : null);

interface RunTotals {
  earnings: Decimal;
  deductions: Decimal;
  employerContributions: Decimal;
  net: Decimal;
  totalCost: Decimal;
  employees: number;
  ready: number;
  exceptions: number;
}

/**
 * The payroll overview: what a month's payroll comes to, how it compares
 * with the month before, the past year's cost, and each employee's pay. All
 * figures come from calculated or finalized payroll runs; nothing is
 * estimated, and nothing is shown as paid without a recorded payment.
 */
@Injectable()
export class PayrollDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(tenantId: string, month: string) {
    const current = await this.runFor(tenantId, month);
    const previousMonth = shiftMonth(month, -1);
    const previous = await this.runFor(tenantId, previousMonth);
    const [totals, previousTotals] = await Promise.all([
      current.run ? this.totals(tenantId, current.run.id) : null,
      previous.run ? this.totals(tenantId, previous.run.id) : null,
    ]);

    const trend = [];
    for (let i = 11; i >= 0; i -= 1) {
      const m = shiftMonth(month, -i);
      const found = m === month ? current : m === previousMonth ? previous : await this.runFor(tenantId, m);
      const t = found.run ? (m === month ? totals : m === previousMonth ? previousTotals : await this.totals(tenantId, found.run.id)) : null;
      trend.push({ month: m, totalCost: t ? t.totalCost.toFixed(2) : null, status: found.run?.run_status ?? null });
    }

    const [activeEmployees, withSalary] = await Promise.all([
      this.prisma.rndtechnosoft_employees.count({ where: { tenant_id: tenantId, employee_status: 'ACTIVE' } }),
      this.prisma.rndtechnosoft_employees.count({
        where: {
          tenant_id: tenantId, employee_status: 'ACTIVE',
          rndtechnosoft_employee_salary_assignments: { some: { assignment_status: 'ACTIVE', effective_from: { lte: day(monthRange(month).end) }, OR: [{ effective_to: null }, { effective_to: { gte: day(monthRange(month).start) } }] } },
        },
      }),
    ]);

    const money = (t: RunTotals | null) => t && {
      totalCost: t.totalCost.toFixed(2), earnings: t.earnings.toFixed(2), deductions: t.deductions.toFixed(2),
      employerContributions: t.employerContributions.toFixed(2), net: t.net.toFixed(2), employees: t.employees, ready: t.ready, exceptions: t.exceptions,
    };
    return {
      month,
      currency: 'INR',
      period: current.period && {
        id: current.period.id, start: isoDate(current.period.period_start), end: isoDate(current.period.period_end),
        paymentDate: current.period.payment_date ? isoDate(current.period.payment_date) : null,
      },
      run: current.run && {
        id: current.run.id, number: current.run.run_number, status: current.run.run_status, calculatedAt: current.run.calculation_completed_at,
        approvedAt: current.run.approved_at, finalizedAt: current.run.finalized_at,
      },
      summary: money(totals),
      previous: previousTotals && { month: previousMonth, ...money(previousTotals) },
      changes: totals && previousTotals ? {
        totalCost: change(totals.totalCost, previousTotals.totalCost),
        deductions: change(totals.deductions, previousTotals.deductions),
        employerContributions: change(totals.employerContributions, previousTotals.employerContributions),
        employees: change(D(totals.employees), D(previousTotals.employees)),
      } : null,
      trend,
      readiness: { activeEmployees, withoutSalary: activeEmployees - withSalary },
    };
  }

  /** The month's employees in its payroll run, paged and filtered on the server. */
  async employees(tenantId: string, query: DashboardEmployeesQuery) {
    const { period, run } = await this.runFor(tenantId, query.month);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    if (!run || !period) return { total: 0, page, limit, counts: { all: 0, ready: 0, exceptions: 0, finalized: 0 }, items: [] };
    const search = query.search?.trim();
    const base: Prisma.rndtechnosoft_payroll_run_employeesWhereInput = {
      tenant_id: tenantId, payroll_run_id: run.id,
      ...(search ? { rndtechnosoft_employees: { OR: [
        { first_name: { contains: search, mode: 'insensitive' } }, { last_name: { contains: search, mode: 'insensitive' } }, { employee_code: { contains: search, mode: 'insensitive' } },
      ] } } : {}),
    };
    const finalized = run.run_status === 'FINALIZED';
    const statusWhere: Record<string, Prisma.rndtechnosoft_payroll_run_employeesWhereInput> = {
      ALL: {},
      READY: { processing_status: 'CALCULATED' },
      EXCEPTION: { processing_status: { in: ['EXCEPTION', 'FAILED'] } },
      FINALIZED: finalized ? { processing_status: 'CALCULATED' } : { id: '00000000-0000-0000-0000-000000000000' },
    };
    const where = { ...base, ...statusWhere[query.status ?? 'ALL'] };
    const [total, all, ready, exceptions, rows] = await Promise.all([
      this.prisma.rndtechnosoft_payroll_run_employees.count({ where }),
      this.prisma.rndtechnosoft_payroll_run_employees.count({ where: base }),
      this.prisma.rndtechnosoft_payroll_run_employees.count({ where: { ...base, processing_status: 'CALCULATED' } }),
      this.prisma.rndtechnosoft_payroll_run_employees.count({ where: { ...base, processing_status: { in: ['EXCEPTION', 'FAILED'] } } }),
      this.prisma.rndtechnosoft_payroll_run_employees.findMany({
        where,
        orderBy: [{ processing_status: 'desc' }, { rndtechnosoft_employees: { first_name: 'asc' } }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          employee_id: true, processing_status: true, gross_earnings: true, gross_deductions: true, net_pay: true, calculation_error: true,
          rndtechnosoft_employees: {
            select: {
              first_name: true, last_name: true, employee_code: true,
              rndtechnosoft_employee_employments: {
                where: { effective_from: { lte: period.period_end }, OR: [{ effective_to: null }, { effective_to: { gte: period.period_start } }] },
                orderBy: { effective_from: 'desc' }, take: 1,
                select: { rndtechnosoft_departments: { select: { department_name: true } }, rndtechnosoft_designations: { select: { designation_name: true } } },
              },
            },
          },
          rndtechnosoft_payslips: { select: { payslip_number: true, rndtechnosoft_payroll_payments: { select: { payment_status: true, payment_date: true }, orderBy: { created_at: 'desc' }, take: 1 } } },
        },
      }),
    ]);
    return {
      total, page, limit,
      counts: { all, ready, exceptions, finalized: finalized ? ready : 0 },
      items: rows.map((r) => {
        const employment = r.rndtechnosoft_employees.rndtechnosoft_employee_employments[0];
        const slip = r.rndtechnosoft_payslips;
        const payment = slip?.rndtechnosoft_payroll_payments[0];
        return {
          employeeId: r.employee_id,
          name: [r.rndtechnosoft_employees.first_name, r.rndtechnosoft_employees.last_name].filter(Boolean).join(' '),
          code: r.rndtechnosoft_employees.employee_code,
          department: employment?.rndtechnosoft_departments?.department_name ?? null,
          designation: employment?.rndtechnosoft_designations?.designation_name ?? null,
          gross: r.gross_earnings.toFixed(2),
          deductions: r.gross_deductions.toFixed(2),
          net: r.net_pay.toFixed(2),
          status: r.processing_status === 'CALCULATED' ? (finalized ? 'FINALIZED' : run.run_status === 'APPROVED' ? 'APPROVED' : 'READY') : 'EXCEPTION',
          problem: r.calculation_error ? r.calculation_error.split('\n')[0] : null,
          payslipNumber: slip?.payslip_number ?? null,
          payment: payment ? { status: payment.payment_status, date: payment.payment_date ? isoDate(payment.payment_date) : null } : null,
          paymentDate: period.payment_date ? isoDate(period.payment_date) : null,
        };
      }),
    };
  }

  /** The month's pay period and its payroll run: the finalized run if there is one, else the latest. */
  private async runFor(tenantId: string, month: string) {
    const { start, end } = monthRange(month);
    const period = await this.prisma.rndtechnosoft_payroll_periods.findFirst({ where: { tenant_id: tenantId, period_start: day(start), period_end: day(end) } });
    if (!period) return { period: null, run: null };
    const runs = await this.prisma.rndtechnosoft_payroll_runs.findMany({ where: { tenant_id: tenantId, payroll_period_id: period.id }, orderBy: { created_at: 'desc' } });
    const run = runs.find((r) => r.run_status === 'FINALIZED') ?? runs.find((r) => r.calculation_completed_at) ?? runs[0] ?? null;
    return { period, run };
  }

  private async totals(tenantId: string, runId: string): Promise<RunTotals> {
    const rows = await this.prisma.rndtechnosoft_payroll_run_employees.findMany({
      where: { tenant_id: tenantId, payroll_run_id: runId },
      select: { processing_status: true, gross_earnings: true, gross_deductions: true, net_pay: true, calculation_snapshot: true },
    });
    const t: RunTotals = { earnings: ZERO, deductions: ZERO, employerContributions: ZERO, net: ZERO, totalCost: ZERO, employees: rows.length, ready: 0, exceptions: 0 };
    for (const r of rows) {
      if (r.processing_status !== 'CALCULATED') { t.exceptions += 1; continue; }
      t.ready += 1;
      t.earnings = t.earnings.plus(r.gross_earnings);
      t.deductions = t.deductions.plus(r.gross_deductions);
      t.net = t.net.plus(r.net_pay);
      const employer = (r.calculation_snapshot as { totals?: { employerContributions?: string } } | null)?.totals?.employerContributions;
      if (employer) t.employerContributions = t.employerContributions.plus(employer);
    }
    t.totalCost = t.earnings.plus(t.employerContributions);
    return t;
  }
}
