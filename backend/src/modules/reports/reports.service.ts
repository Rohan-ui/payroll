import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

/** The most rows one export holds; past this the member narrows the range. */
const MAX_ROWS = 20_000;
/** The longest date range a range report covers, in days. */
const MAX_RANGE_DAYS = 366;
const DAY_MS = 86_400_000;

type Column = { header: string; key: string; width?: number; numFmt?: string };
export type ReportFile = { bytes: Buffer; filename: string };

/** The employee's department and designation as of today, from their current employment. */
const CURRENT_JOB = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT ee.department_id, ee.designation_id
    FROM rndtechnosoft_employee_employments ee
    WHERE ee.tenant_id = e.tenant_id AND ee.employee_id = e.id AND (ee.effective_to IS NULL OR ee.effective_to >= CURRENT_DATE)
    ORDER BY (ee.effective_from <= CURRENT_DATE) DESC, ee.effective_from DESC
    LIMIT 1
  ) cur ON TRUE
  LEFT JOIN rndtechnosoft_departments d ON d.tenant_id = e.tenant_id AND d.id = cur.department_id
  LEFT JOIN rndtechnosoft_designations g ON g.tenant_id = e.tenant_id AND g.id = cur.designation_id`;

const NAME = Prisma.sql`concat_ws(' ', e.first_name, e.middle_name, e.last_name)`;

/**
 * Excel exports for the Reports page, one per HR and payroll area. Every query
 * is scoped to the caller's workspace, the permissions are checked on the
 * route, and each export is audited because it is a bulk copy of employee data.
 * Money comes from the database as decimals and is written as numbers with two
 * places only for the spreadsheet; nothing is calculated from it here.
 */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Per employee, the month's attendance days by status and the minutes worked, late and overtime. */
  async attendance(tenantId: string, month: string, actor: AuthenticatedTenantUser): Promise<ReportFile> {
    const start = `${month}-01`;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.employee_code AS code, ${NAME} AS name, d.department_name AS department, g.designation_name AS designation,
             count(*) FILTER (WHERE r.attendance_status = 'PRESENT')::int AS present,
             count(*) FILTER (WHERE r.attendance_status = 'HALF_DAY')::int AS half_day,
             count(*) FILTER (WHERE r.attendance_status = 'ABSENT')::int AS absent,
             count(*) FILTER (WHERE r.attendance_status = 'PAID_LEAVE')::int AS paid_leave,
             count(*) FILTER (WHERE r.attendance_status = 'UNPAID_LEAVE')::int AS unpaid_leave,
             count(*) FILTER (WHERE r.attendance_status IN ('HOLIDAY', 'WEEKEND'))::int AS off_days,
             round(coalesce(sum(r.worked_minutes), 0) / 60.0, 2)::float AS worked_hours,
             coalesce(sum(r.late_minutes), 0)::int AS late_minutes,
             round(coalesce(sum(r.overtime_minutes), 0) / 60.0, 2)::float AS overtime_hours
      FROM rndtechnosoft_attendance_records r
      JOIN rndtechnosoft_employees e ON e.tenant_id = r.tenant_id AND e.id = r.employee_id
      ${CURRENT_JOB}
      WHERE r.tenant_id = ${tenantId}::uuid
        AND r.attendance_date >= ${start}::date AND r.attendance_date < (${start}::date + interval '1 month')
      GROUP BY e.id, e.employee_code, e.first_name, e.middle_name, e.last_name, d.department_name, g.designation_name
      ORDER BY e.employee_code
      LIMIT ${MAX_ROWS + 1}`;
    return this.write(tenantId, actor, 'ATTENDANCE', { month }, `attendance-${month}`, 'Attendance', [
      { header: 'Employee ID', key: 'code', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 22 },
      { header: 'Present', key: 'present' },
      { header: 'Half day', key: 'half_day' },
      { header: 'Absent', key: 'absent' },
      { header: 'Paid leave', key: 'paid_leave' },
      { header: 'Unpaid leave', key: 'unpaid_leave' },
      { header: 'Holidays and weekends', key: 'off_days', width: 12 },
      { header: 'Hours worked', key: 'worked_hours', numFmt: '0.00' },
      { header: 'Minutes late', key: 'late_minutes' },
      { header: 'Overtime hours', key: 'overtime_hours', numFmt: '0.00' },
    ], rows);
  }

  /** Every leave request that overlaps the range, with its type, days and decision. */
  async leave(tenantId: string, from: string, to: string, actor: AuthenticatedTenantUser): Promise<ReportFile> {
    this.checkRange(from, to);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT q.request_number AS number, e.employee_code AS code, ${NAME} AS name, d.department_name AS department,
             t.leave_type_name AS type, CASE WHEN t.is_paid THEN 'Paid' ELSE 'Unpaid' END AS paid,
             q.start_date AS start_date, q.end_date AS end_date, q.requested_days::float AS days,
             initcap(replace(q.request_status, '_', ' ')) AS status, q.submitted_at AS submitted, q.final_decision_at AS decided
      FROM rndtechnosoft_leave_requests q
      JOIN rndtechnosoft_employees e ON e.tenant_id = q.tenant_id AND e.id = q.employee_id
      JOIN rndtechnosoft_leave_types t ON t.tenant_id = q.tenant_id AND t.id = q.leave_type_id
      ${CURRENT_JOB}
      WHERE q.tenant_id = ${tenantId}::uuid AND q.start_date <= ${to}::date AND q.end_date >= ${from}::date
      ORDER BY q.start_date, e.employee_code
      LIMIT ${MAX_ROWS + 1}`;
    return this.write(tenantId, actor, 'LEAVE', { from, to }, `leave-${from}-to-${to}`, 'Leave', [
      { header: 'Request', key: 'number', width: 16 },
      { header: 'Employee ID', key: 'code', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Leave type', key: 'type', width: 20 },
      { header: 'Paid or unpaid', key: 'paid' },
      { header: 'From', key: 'start_date', numFmt: 'dd-mmm-yyyy' },
      { header: 'To', key: 'end_date', numFmt: 'dd-mmm-yyyy' },
      { header: 'Days', key: 'days', numFmt: '0.0' },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Submitted', key: 'submitted', width: 18, numFmt: 'dd-mmm-yyyy hh:mm' },
      { header: 'Decided', key: 'decided', width: 18, numFmt: 'dd-mmm-yyyy hh:mm' },
    ], rows);
  }

  /**
   * The payroll register for a period, from its finalized payslips: the
   * values people were actually paid, as recorded then, one column per pay
   * component, never recalculated from today's salary setup.
   */
  async payrollRegister(tenantId: string, periodId: string, actor: AuthenticatedTenantUser): Promise<ReportFile> {
    const period = await this.prisma.rndtechnosoft_payroll_periods.findFirst({ where: { tenant_id: tenantId, id: periodId }, select: { period_code: true } });
    if (!period) throw new NotFoundException('That payroll period was not found.');

    const slips = await this.prisma.rndtechnosoft_payslips.findMany({
      where: { tenant_id: tenantId, payroll_period_id: periodId },
      orderBy: { employee_code_snapshot: 'asc' },
      take: MAX_ROWS + 1,
      select: {
        payslip_number: true, employee_code_snapshot: true, employee_name_snapshot: true, department_name_snapshot: true,
        designation_name_snapshot: true, gross_earnings: true, gross_deductions: true, net_pay: true, payslip_status: true,
        rndtechnosoft_payslip_lines: { select: { component_code_snapshot: true, component_name_snapshot: true, component_category: true, amount: true, display_order: true } },
      },
    });

    // One column per component that appears in the period, earnings before deductions, in payslip order.
    const components = new Map<string, { name: string; category: string; order: number }>();
    for (const line of slips.flatMap((s) => s.rndtechnosoft_payslip_lines)) {
      if (!components.has(line.component_code_snapshot)) components.set(line.component_code_snapshot, { name: line.component_name_snapshot, category: line.component_category, order: line.display_order });
    }
    const isDeduction = (category: string) => /DEDUCT/i.test(category);
    const ordered = [...components.entries()].sort(([, a], [, b]) => Number(isDeduction(a.category)) - Number(isDeduction(b.category)) || a.order - b.order);

    const money = (v: Prisma.Decimal) => Number(v.toFixed(2));
    const rows = slips.map((s) => {
      const row: Record<string, unknown> = {
        number: s.payslip_number, code: s.employee_code_snapshot, name: s.employee_name_snapshot,
        department: s.department_name_snapshot, designation: s.designation_name_snapshot,
        gross: money(s.gross_earnings), deductions: money(s.gross_deductions), net: money(s.net_pay), status: s.payslip_status,
      };
      const byComponent = new Map<string, Prisma.Decimal>();
      for (const line of s.rndtechnosoft_payslip_lines) {
        byComponent.set(line.component_code_snapshot, (byComponent.get(line.component_code_snapshot) ?? new Prisma.Decimal(0)).add(line.amount));
      }
      for (const [code, total] of byComponent) row[`c_${code}`] = money(total);
      return row;
    });

    const RUPEES = '#,##0.00';
    return this.write(tenantId, actor, 'PAYROLL_REGISTER', { periodId }, `payroll-register-${period.period_code}`, 'Payroll register', [
      { header: 'Payslip', key: 'number', width: 18 },
      { header: 'Employee ID', key: 'code', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 22 },
      ...ordered.map(([code, c]) => ({ header: c.name, key: `c_${code}`, width: 14, numFmt: RUPEES })),
      { header: 'Gross earnings', key: 'gross', width: 16, numFmt: RUPEES },
      { header: 'Total deductions', key: 'deductions', width: 16, numFmt: RUPEES },
      { header: 'Net pay', key: 'net', width: 16, numFmt: RUPEES },
      { header: 'Payslip status', key: 'status', width: 14 },
    ], rows);
  }

  /** Exits whose last working day falls in the range, with the type, reason and exit interview. */
  async exits(tenantId: string, from: string, to: string, actor: AuthenticatedTenantUser): Promise<ReportFile> {
    this.checkRange(from, to);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e.employee_code AS code, ${NAME} AS name, d.department_name AS department, g.designation_name AS designation,
             initcap(replace(s.separation_type, '_', ' ')) AS type, initcap(replace(s.separation_status, '_', ' ')) AS status,
             s.notice_date AS notice_date, s.last_working_date AS last_day, s.primary_exit_reason AS reason,
             CASE WHEN s.rehire_eligible IS NULL THEN NULL WHEN s.rehire_eligible THEN 'Yes' ELSE 'No' END AS rehire,
             s.exit_interview_date AS interview_date
      FROM rndtechnosoft_employee_separations s
      JOIN rndtechnosoft_employees e ON e.tenant_id = s.tenant_id AND e.id = s.employee_id
      ${CURRENT_JOB}
      WHERE s.tenant_id = ${tenantId}::uuid AND s.last_working_date BETWEEN ${from}::date AND ${to}::date
      ORDER BY s.last_working_date, e.employee_code
      LIMIT ${MAX_ROWS + 1}`;
    return this.write(tenantId, actor, 'EXITS', { from, to }, `exits-${from}-to-${to}`, 'Exits', [
      { header: 'Employee ID', key: 'code', width: 14 },
      { header: 'Name', key: 'name', width: 26 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Designation', key: 'designation', width: 22 },
      { header: 'Exit type', key: 'type', width: 16 },
      { header: 'Status', key: 'status', width: 16 },
      { header: 'Notice given', key: 'notice_date', numFmt: 'dd-mmm-yyyy' },
      { header: 'Last working day', key: 'last_day', numFmt: 'dd-mmm-yyyy' },
      { header: 'Main exit reason', key: 'reason', width: 22 },
      { header: 'Eligible for rehire', key: 'rehire' },
      { header: 'Exit interview', key: 'interview_date', numFmt: 'dd-mmm-yyyy' },
    ], rows);
  }

  private checkRange(from: string, to: string) {
    const span = (Date.parse(to) - Date.parse(from)) / DAY_MS;
    if (span < 0) throw new BadRequestException('The end date is before the start date.');
    if (span > MAX_RANGE_DAYS) throw new BadRequestException(`Choose a range of at most ${MAX_RANGE_DAYS} days.`);
  }

  /** The rows as a one-sheet workbook, audited as a bulk export. */
  private async write(
    tenantId: string, actor: AuthenticatedTenantUser, report: string, filters: Record<string, string>,
    name: string, sheetName: string, columns: Column[], rows: Record<string, unknown>[],
  ): Promise<ReportFile> {
    if (rows.length > MAX_ROWS) throw new BadRequestException(`This report has more than ${MAX_ROWS} rows. Choose a shorter range.`);
    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 12, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
    sheet.getRow(1).font = { bold: true };
    sheet.addRows(rows);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'REPORT_EXPORTED', entityType: 'REPORT', metadata: { report, rows: rows.length, filters },
    });
    return { bytes, filename: `${name}.xlsx` };
  }
}
