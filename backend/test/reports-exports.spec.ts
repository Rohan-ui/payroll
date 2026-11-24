import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';

/**
 * Report exports: Excel files built on the server from the workspace's own
 * records only, behind reports.view plus the area's permission, and audited.
 * The payroll register comes from the finalized payslips as they were issued.
 */

jest.setTimeout(120_000);

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Reports-Exports-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Workspace = { tenantId: string; token: string; email: string };

describe('Report exports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = process.env.PLATFORM_BASE_DOMAIN;
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `rpt-a-${SUFFIX}@reports.test` };
  const b: Workspace = { tenantId: '', token: '', email: `rpt-b-${SUFFIX}@reports.test` };
  const staff = { token: '', email: `rpt-staff-${SUFFIX}@reports.test` };
  const ids = { asha: randomUUID(), bala: randomUUID(), period: randomUUID(), otherPeriod: randomUUID() };

  const get = (url: string, token: string) =>
    request(app.getHttpServer()).get(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`)
      .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); });

  async function sheet(body: Buffer) {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(body as unknown as ArrayBuffer);
    const ws = book.worksheets[0];
    const rows: unknown[][] = [];
    ws.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
    return rows;
  }

  async function register(w: Workspace, label: string) {
    userEmails.push(w.email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Reports ${label} ${SUFFIX}`, tenantCode: `RPT${label}${SUFFIX.toUpperCase()}`, email: w.email, password: PASSWORD });
    expect(r.status).toBe(201);
    w.tenantId = r.body.activeTenant.tenantId;
    w.token = r.body.token;
    tenantIds.push(w.tenantId);
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});
    await register(a, 'A');
    await register(b, 'B');

    // A member who can see attendance but not reports.
    userEmails.push(staff.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: staff.email, display_name: 'Staff', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: 'R_ATT', role_name: 'Attendance only', is_system_role: false } });
    const permission = await prisma.rndtechnosoft_permissions.findFirstOrThrow({ where: { permission_code: 'attendance.view' } });
    await prisma.rndtechnosoft_role_permissions.create({ data: { id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: permission.id } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: staff.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    staff.token = login.body.token;

    await prisma.rndtechnosoft_employees.create({ data: { id: ids.asha, tenant_id: a.tenantId, employee_code: `A-${SUFFIX}`, first_name: 'Asha', last_name: 'Rao', employee_status: 'ACTIVE' } });
    await prisma.rndtechnosoft_employees.create({ data: { id: ids.bala, tenant_id: b.tenantId, employee_code: `B-${SUFFIX}`, first_name: 'Bala', employee_status: 'ACTIVE' } });
    const day = (tenant: string, employee: string, date: string, status: string, late = 0) => ({
      id: randomUUID(), tenant_id: tenant, employee_id: employee, attendance_date: new Date(date), attendance_status: status,
      worked_minutes: status === 'PRESENT' ? 480 : 0, payable_minutes: status === 'PRESENT' ? 480 : 0, late_minutes: late, source: 'MANUAL', approval_status: 'NOT_REQUIRED',
    });
    await prisma.rndtechnosoft_attendance_records.createMany({ data: [
      day(a.tenantId, ids.asha, '2026-08-03', 'PRESENT', 15), day(a.tenantId, ids.asha, '2026-08-04', 'PRESENT'), day(a.tenantId, ids.asha, '2026-08-05', 'ABSENT'),
      day(a.tenantId, ids.asha, '2026-09-01', 'PRESENT'), day(b.tenantId, ids.bala, '2026-08-03', 'PRESENT'),
    ] });

    const typeId = randomUUID();
    await prisma.rndtechnosoft_leave_types.create({ data: { id: typeId, tenant_id: a.tenantId, leave_type_code: 'CL', leave_type_name: 'Casual leave', is_paid: true } });
    await prisma.rndtechnosoft_leave_requests.create({ data: { id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.asha, leave_type_id: typeId, request_number: `LR-${SUFFIX}`, start_date: new Date('2026-08-10'), end_date: new Date('2026-08-11'), requested_days: '2', request_status: 'APPROVED' } });

    // A finalized August payslip with two lines.
    for (const [tenant, period] of [[a.tenantId, ids.period], [b.tenantId, ids.otherPeriod]] as const) {
      await prisma.rndtechnosoft_payroll_periods.create({ data: { id: period, tenant_id: tenant, period_code: `2026-08-${SUFFIX}`, pay_frequency: 'MONTHLY', period_start: new Date('2026-08-01'), period_end: new Date('2026-08-31') } });
    }
    const runId = randomUUID();
    const runEmployeeId = randomUUID();
    const slipId = randomUUID();
    await prisma.rndtechnosoft_payroll_runs.create({ data: { id: runId, tenant_id: a.tenantId, payroll_period_id: ids.period, run_number: `R-${SUFFIX}`, run_status: 'FINALIZED', finalized_at: new Date() } });
    await prisma.rndtechnosoft_payroll_run_employees.create({ data: { id: runEmployeeId, tenant_id: a.tenantId, payroll_run_id: runId, employee_id: ids.asha, processing_status: 'CALCULATED', gross_earnings: '30000.00', gross_deductions: '1800.00', net_pay: '28200.00' } });
    await prisma.rndtechnosoft_payslips.create({ data: {
      id: slipId, tenant_id: a.tenantId, payroll_run_employee_id: runEmployeeId, payroll_run_id: runId, payroll_period_id: ids.period, employee_id: ids.asha,
      payslip_number: `PS-${SUFFIX}`, employee_code_snapshot: `A-${SUFFIX}`, employee_name_snapshot: 'Asha Rao', currency_code: 'INR',
      gross_earnings: '30000.00', gross_deductions: '1800.00', net_pay: '28200.00', generated_at: new Date(), finalized_at: new Date(),
    } });
    await prisma.rndtechnosoft_payslip_lines.createMany({ data: [
      { id: randomUUID(), tenant_id: a.tenantId, payslip_id: slipId, component_code_snapshot: 'PF', component_name_snapshot: 'Provident fund', component_category: 'DEDUCTION', amount: '1800.00', display_order: 10 },
      { id: randomUUID(), tenant_id: a.tenantId, payslip_id: slipId, component_code_snapshot: 'BASIC', component_name_snapshot: 'Basic', component_category: 'EARNING', amount: '30000.00', display_order: 1 },
    ] });
  });

  afterAll(async () => {
    if (prisma) {
      const scope = { tenant_id: { in: tenantIds } };
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } })).map((u) => u.id);
      await prisma.rndtechnosoft_payslip_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslips.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_run_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_runs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_periods.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_records.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({ where: { target_tenant_id: { in: tenantIds } } });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
    }
    if (previous === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous;
    await app?.close();
  });

  it('exports the month’s attendance per employee, only for this workspace, and audits it', async () => {
    const r = await get('/reports/attendance?month=2026-08', a.token);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('attendance-2026-08.xlsx');
    const rows = await sheet(r.body);
    expect(rows[0]).toEqual(expect.arrayContaining(['Employee ID', 'Present', 'Absent', 'Minutes late']));
    expect(rows).toHaveLength(2);
    const header = rows[0] as string[];
    const asha = rows[1];
    expect(asha[header.indexOf('Name')]).toBe('Asha Rao');
    expect(asha[header.indexOf('Present')]).toBe(2);
    expect(asha[header.indexOf('Absent')]).toBe(1);
    expect(asha[header.indexOf('Minutes late')]).toBe(15);
    expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: a.tenantId, action_code: 'REPORT_EXPORTED' } })).toBeGreaterThan(0);
  });

  it('exports leave requests overlapping the range, and refuses a bad range', async () => {
    const r = await get('/reports/leave?from=2026-08-01&to=2026-08-31', a.token);
    expect(r.status).toBe(200);
    const rows = await sheet(r.body);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(expect.arrayContaining([`LR-${SUFFIX}`, 'Casual leave', 'Paid', 2, 'Approved']));
    expect((await get('/reports/leave?from=2026-08-31&to=2026-08-01', a.token)).status).toBe(400);
    expect((await get('/reports/leave?from=2025-01-01&to=2026-08-01', a.token)).status).toBe(400);
  });

  it('builds the payroll register from the issued payslips, earnings before deductions, and hides other workspaces’ periods', async () => {
    const r = await get(`/reports/payroll-register?periodId=${ids.period}`, a.token);
    expect(r.status).toBe(200);
    const [header, slip] = await sheet(r.body);
    expect(header).toEqual(['Payslip', 'Employee ID', 'Name', 'Department', 'Designation', 'Basic', 'Provident fund', 'Gross earnings', 'Total deductions', 'Net pay', 'Payslip status']);
    expect(slip).toEqual(expect.arrayContaining([`PS-${SUFFIX}`, 'Asha Rao', 30000, 1800, 28200]));
    expect((await get(`/reports/payroll-register?periodId=${ids.otherPeriod}`, a.token)).status).toBe(404);
  });

  it('needs reports.view as well as the area’s permission, and a valid month', async () => {
    expect((await get('/reports/attendance?month=2026-08', staff.token)).status).toBe(403);
    expect((await get('/reports/attendance?month=2026-13', a.token)).status).toBe(400);
    expect((await get('/reports/exits?from=2026-01-01&to=2026-12-31', a.token)).status).toBe(200);
  });

  it('gives each area’s current figures for the Reports page, from this workspace only', async () => {
    const call = (token: string) => request(app.getHttpServer()).get(`${API}/reports/overview`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    const r = await call(a.token);
    expect(r.status).toBe(200);
    expect(r.body.data.people).toMatchObject({ active: 1, onNotice: 0 });
    expect(r.body.data.payroll.latestPeriod).toEqual({ code: `2026-08-${SUFFIX}`, employees: 1, gross: '30000.00', deductions: '1800.00', net: '28200.00' });
    expect(r.body.data.leave).toMatchObject({ pending: 0 });
    expect(r.body.data.exits).toEqual({ inProgress: 0, leavingIn30Days: 0, completedThisYear: 0 });
    expect(r.body.data.sales).toMatchObject({ openDeals: 0, openValue: '0.00' });
    const other = await call(b.token);
    expect(other.body.data.payroll.latestPeriod).toBeNull();
    expect(other.body.data.people.active).toBe(1);
    expect((await call(staff.token)).status).toBe(403);
  });
});
