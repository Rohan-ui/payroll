import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { defaultPolicyConfig } from '@/modules/payroll/policies/policy-config';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Payroll phase 4 end to end, for one employee over August and September
 * 2026: approved overtime at day-type rates, a late arrival deduction, an
 * absence covered by approved leave, a bonus approved by someone else, loan
 * recovery settled when payroll is finalized, and a back-dated raise paid as
 * arrears the next month without touching the finalized payslip.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Payroll-Adjust-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
type Method = 'get' | 'post' | 'put';

describe('Payroll adjustments', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `adj-a-${SUFFIX}@rnd.test` };
  const approver = { token: '', email: `adj-ap-${SUFFIX}@rnd.test` };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const ok = async (method: Method, url: string, body?: unknown, token = a.token) => {
    const response = await call(method, url, token, body);
    if (response.status >= 300) throw new Error(`${method} ${url} → ${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data ?? response.body;
  };
  const component = (componentCode: string, extra: Record<string, unknown> = {}) => ({
    componentCode, componentName: componentCode, category: 'EARNING', calculationType: 'FORMULA', systemRule: null, isStatutory: false, isTaxable: true,
    isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100, ...extra,
  });
  const system = (rule: string, category: 'EARNING' | 'DEDUCTION') => ({ calculationType: 'SYSTEM_CALCULATED', systemRule: rule, category, isProrated: false, includeInGross: category === 'EARNING' });
  const line = (code: string, extra: Record<string, unknown>) => ({ salaryComponentId: ids[code], defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: null, isMandatory: true, ...extra });
  const preview = (month: string) => ok('get', `/payroll/calculation/preview?employeeId=${ids.W}&month=${month}`);
  const amounts = (pay: { lines: { componentCode: string; amount: string }[] }) => Object.fromEntries(pay.lines.map((l) => [l.componentCode, l.amount]));

  /** A month of attendance: Sundays weekly offs, everything else present, with the given changes. */
  async function attendance(month: string, days: number, changes: Record<number, Partial<{ status: string; overtime: number; late: number }> | null> = {}) {
    const rows = [];
    for (let d = 1; d <= days; d += 1) {
      if (changes[d] === null) continue;
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
      const change = changes[d] ?? {};
      const status = change.status ?? (sunday ? 'WEEKEND' : 'PRESENT');
      rows.push({
        id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.W, attendance_date: new Date(date), attendance_status: status,
        worked_minutes: status === 'PRESENT' ? 480 : 0, payable_minutes: status === 'PRESENT' ? 480 : 0, overtime_minutes: change.overtime ?? 0, late_minutes: change.late ?? 0,
        source: 'MANUAL', approval_status: 'NOT_REQUIRED',
      });
    }
    await prisma.rndtechnosoft_attendance_records.createMany({ data: rows });
  }

  async function runAndFinalize(month: string) {
    const days = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const period = await prisma.rndtechnosoft_payroll_periods.findFirst({ where: { tenant_id: a.tenantId, period_start: new Date(`${month}-01`) } })
      ?? await ok('post', '/payroll/periods', { periodCode: month, periodStart: `${month}-01`, periodEnd: `${month}-${days}` });
    const run = await ok('post', '/payroll/runs', { payrollPeriodId: period.id });
    const calculated = await ok('post', `/payroll/runs/${run.id}/calculate`);
    expect(calculated.rndtechnosoft_payroll_run_employees.map((r: { processing_status: string; calculation_error: string | null }) => [r.processing_status, r.calculation_error])).toEqual([['CALCULATED', null]]);
    await ok('post', `/payroll/runs/${run.id}/approve`);
    await ok('post', `/payroll/runs/${run.id}/finalize`);
    return run.id as string;
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

    userEmails.push(a.email);
    const registered = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Adjust ${SUFFIX}`, tenantCode: `ADJ${SUFFIX.toUpperCase()}`, email: a.email, password: PASSWORD });
    expect(registered.status).toBe(201);
    a.tenantId = registered.body.activeTenant.tenantId;
    a.token = registered.body.token;
    tenantIds.push(a.tenantId);

    // A second member who can approve monthly entries.
    userEmails.push(approver.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: approver.email, display_name: 'Appu Approver', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: 'R_APPROVER', role_name: 'Approver', is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: ['payroll.view', 'payroll.inputs.approve'] } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: approver.email, password: PASSWORD, tenantId: a.tenantId });
    approver.token = login.body.token;

    for (const [code, extra] of Object.entries({
      BASIC: { calculationType: 'PERCENTAGE' }, HRA: { calculationType: 'PERCENTAGE' }, SPECIAL: {},
      BONUS: { calculationType: 'MANUAL', isProrated: false },
      LATE: system('LATE_ARRIVAL', 'DEDUCTION'), LOAN: system('LOAN_RECOVERY', 'DEDUCTION'), ARREARS: system('ARREARS', 'EARNING'),
    })) ids[code] = (await ok('post', '/salary/components', component(code, extra))).id;
    ids.STD = (await ok('post', '/salary/structures', { structureCode: 'STD', structureName: 'Standard', effectiveFrom: '2026-01-01', lines: [
      line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }), line('HRA', { defaultPercentage: '40', percentageBase: 'BASIC' }), line('SPECIAL', { formula: 'MONTHLY_SALARY - BASIC - HRA' }),
    ] })).id;
    await ok('post', `/salary/structures/${ids.STD}/draft/publish`);
    const config = defaultPolicyConfig();
    config.overtime.enabled = true;
    config.lateArrival = { enabled: true, graceMinutes: 10, freeOccurrences: 0, bands: [{ fromMinute: 11, toMinute: null, action: 'FIXED_AMOUNT', amount: '100', dayFraction: null }], repeated: null, monthlyCapAmount: null };
    const policy = await ok('post', '/payroll/policies', { policyCode: 'STANDARD', policyName: 'Standard', isDefault: true, effectiveFrom: '2026-01-01' });
    await ok('put', `/payroll/policies/${policy.id}/draft`, { effectiveFrom: '2026-01-01', config });
    await ok('post', `/payroll/policies/${policy.id}/draft/publish`);

    ids.W = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id: ids.W, tenant_id: a.tenantId, employee_code: `W-${SUFFIX}`, first_name: 'Wasim', employee_status: 'ACTIVE' } });
    await ok('post', `/salary/employees/${ids.W}/revisions`, {
      salaryStructureId: ids.STD, effectiveFrom: '2026-01-01', payBasis: 'MONTHLY', monthlySalary: '30000', annualCtc: null, baseRate: null, currencyCode: 'INR',
      payrollPolicyId: null, isOvertimeEligible: true, paymentMethod: 'BANK_TRANSFER', changeReason: 'Joining salary', componentValues: [],
    });
    // August 2026: Sundays 2, 9, 16, 23, 30. Overtime on Monday 3rd and Sunday 9th, late on the 4th (and within grace on the 5th), nothing on the 10th.
    await attendance('2026-08', 31, { 3: { overtime: 70 }, 9: { status: 'WEEKEND', overtime: 120 }, 4: { late: 25 }, 5: { late: 5 }, 10: null });
    await attendance('2026-09', 30);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_bookkeeping_entry_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_bookkeeping_entries.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_year_ledger_balances.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_arrears.deleteMany({ where: scope });
      await prisma.rndtechnosoft_loan_repayments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_loan_installments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_loans.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslip_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslips.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_run_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_runs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_inputs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_periods.deleteMany({ where: scope });
      await prisma.rndtechnosoft_accounting_ledgers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_years.deleteMany({ where: scope });
      await prisma.rndtechnosoft_overtime_approvals.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_request_days.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_records.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_component_values.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structures.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policy_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policies.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await deleteCrmData(prisma, tenantIds);
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
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
    await app?.close();
  });

  it('counts an absence covered by approved paid leave as paid leave', async () => {
    const held = await preview('2026-08');
    expect(held.exceptions).toEqual(expect.arrayContaining([expect.stringContaining('No attendance on 1 working day: 2026-08-10')]));
    const typeId = randomUUID();
    const requestId = randomUUID();
    await prisma.rndtechnosoft_leave_types.create({ data: { id: typeId, tenant_id: a.tenantId, leave_type_code: 'CL', leave_type_name: 'Casual leave', is_paid: true } });
    await prisma.rndtechnosoft_leave_requests.create({ data: { id: requestId, tenant_id: a.tenantId, employee_id: ids.W, leave_type_id: typeId, request_number: `LR-${SUFFIX}`, start_date: new Date('2026-08-10'), end_date: new Date('2026-08-10'), requested_days: 1, request_status: 'APPROVED' } });
    await prisma.rndtechnosoft_leave_request_days.create({ data: { id: randomUUID(), tenant_id: a.tenantId, leave_request_id: requestId, leave_date: new Date('2026-08-10') } });
    const pay = await preview('2026-08');
    expect(pay.attendance).toMatchObject({ paidLeaveDays: 1, missingDays: 0, unpaidDays: '0' });
    expect(pay.exceptions).not.toEqual(expect.arrayContaining([expect.stringContaining('No attendance')]));
  });

  it('pays overtime only once approved, at the day type’s rate, through an overtime component', async () => {
    let pay = await preview('2026-08');
    expect(pay.warnings).toEqual(expect.arrayContaining([expect.stringContaining('Overtime on 2026-08-03, 2026-08-09 is waiting for approval')]));
    expect(amounts(pay).OT).toBeUndefined();

    const days = await ok('get', '/payroll/overtime?month=2026-08');
    expect(days.map((d: { date: string; recordedMinutes: number; state: string; eligible: boolean }) => [d.date, d.recordedMinutes, d.state, d.eligible])).toEqual([['2026-08-03', 70, 'PENDING', true], ['2026-08-09', 120, 'PENDING', true]]);
    expect((await call('post', '/payroll/overtime/decisions', approver.token, { decisions: [{ employeeId: ids.W, date: '2026-08-03', decision: 'APPROVED' }] })).status).toBe(403);
    expect((await asA('post', '/payroll/overtime/decisions', { decisions: [{ employeeId: ids.W, date: '2026-08-03', decision: 'APPROVED', approvedMinutes: 90 }] })).status).toBe(400);
    await ok('post', '/payroll/overtime/decisions', { decisions: [
      { employeeId: ids.W, date: '2026-08-03', decision: 'APPROVED', approvedMinutes: 60 },
      { employeeId: ids.W, date: '2026-08-09', decision: 'APPROVED' },
    ] });

    // No component pays overtime yet: the employee is held, not paid without it.
    pay = await preview('2026-08');
    expect(pay.status).toBe('EXCEPTION');
    expect(pay.exceptions).toEqual(expect.arrayContaining([expect.stringContaining('of overtime is due, but no salary component is set up for it')]));
    ids.OT = (await ok('post', '/salary/components', component('OT', system('OVERTIME', 'EARNING')))).id;
    pay = await preview('2026-08');
    // Hourly rate 30000 ÷ 31 ÷ 8 = 120.9677: 1 h × 1.5 on a working day, 2 h × 2 on a weekly off.
    expect(amounts(pay).OT).toBe('665.32');
    expect(pay.lines.find((l: { componentCode: string }) => l.componentCode === 'OT').steps).toEqual([
      '2026-08-03 (working day): 60 min × hourly rate 120.9677 × 1.5 = 181.45',
      '2026-08-09 (weekly off): 120 min × hourly rate 120.9677 × 2 = 483.87',
    ]);
    expect(pay.segments[0].variables.OVERTIME_HOURS).toBe('3');
  });

  it('deducts late arrival by the policy’s bands, beyond the grace period', async () => {
    const pay = await preview('2026-08');
    expect(amounts(pay).LATE).toBe('100.00');
    expect(pay.lines.find((l: { componentCode: string }) => l.componentCode === 'LATE').steps).toEqual(['2026-08-04: 25 min late, fixed 100 = 100.00']);
  });

  it('pays a monthly entry only once someone else approves it', async () => {
    expect((await call('post', '/payroll/inputs', approver.token, { month: '2026-08', employeeId: ids.W, salaryComponentId: ids.BONUS, amount: '2000' })).status).toBe(403);
    const created = await ok('post', '/payroll/inputs', { month: '2026-08', employeeId: ids.W, salaryComponentId: ids.BONUS, amount: '2000', note: 'Festival bonus' });
    const entry = created.entries[0];
    expect(entry).toMatchObject({ status: 'PENDING', amount: '2000.00', component: { code: 'BONUS' } });
    expect((await asA('post', '/payroll/inputs', { month: '2026-08', employeeId: ids.W, salaryComponentId: ids.BONUS, amount: '500' })).status).toBe(409);
    expect((await asA('post', '/payroll/inputs', { month: '2026-08', employeeId: ids.W, salaryComponentId: ids.BASIC, amount: '500' })).status).toBe(400);
    expect((await preview('2026-08')).warnings).toEqual(expect.arrayContaining(['1 monthly entry is waiting for approval and isn’t included.']));

    const self = await asA('post', `/payroll/inputs/${entry.id}/approve`);
    expect([self.status, self.body.message]).toEqual([403, 'Someone else must approve an entry you made.']);
    await ok('post', `/payroll/inputs/${entry.id}/approve`, undefined, approver.token);
    const pay = await preview('2026-08');
    expect(amounts(pay).BONUS).toBe('2000.00');
    expect(pay.lines.find((l: { componentCode: string }) => l.componentCode === 'BONUS').source).toBe('VARIABLE_INPUT');
  });

  it('recovers a loan month by month, settled only when payroll is finalized', async () => {
    const loan = await ok('post', '/payroll/loans', { employeeId: ids.W, loanType: 'LOAN', principal: '3000', installments: 3, firstMonth: '2026-08', note: 'Medical' });
    expect(loan.installments.map((i: { dueDate: string; amount: string }) => [i.dueDate, i.amount])).toEqual([['2026-08-31', '1000.00'], ['2026-09-30', '1000.00'], ['2026-10-31', '1000.00']]);
    ids.LOAN_ID = loan.id;

    const pay = await preview('2026-08');
    expect(pay.status).toBe('READY');
    expect(amounts(pay)).toEqual({ BASIC: '15000.00', HRA: '6000.00', SPECIAL: '9000.00', BONUS: '2000.00', OT: '665.32', LATE: '100.00', LOAN: '1000.00' });
    expect(pay.totals).toMatchObject({ earnings: '32665.32', deductions: '1100.00', netBeforeRounding: '31565.32', roundingAdjustment: '-0.32', net: '31565.00' });
    // Previewing settles nothing.
    expect((await ok('get', `/payroll/loans/${loan.id}`)).outstanding).toBe('3000.00');

    await runAndFinalize('2026-08');
    const after = await ok('get', `/payroll/loans/${loan.id}`);
    expect(after).toMatchObject({ recovered: '1000.00', outstanding: '2000.00', status: 'ACTIVE' });
    expect(after.installments.map((i: { status: string }) => i.status)).toEqual(['RECOVERED', 'SCHEDULED', 'SCHEDULED']);
    expect(after.repayments).toEqual([expect.objectContaining({ date: '2026-08-31', amount: '1000.00', source: 'PAYROLL' })]);
    // Finalized months are closed to changes.
    expect((await asA('post', '/payroll/inputs', { month: '2026-08', employeeId: ids.W, salaryComponentId: ids.BONUS, amount: '1' })).body.message).toMatch(/finalized/);
    expect((await asA('post', '/payroll/overtime/decisions', { decisions: [{ employeeId: ids.W, date: '2026-08-03', decision: 'REJECTED' }] })).body.message).toMatch(/finalized up to 2026-08-31/);
  });

  it('pays a back-dated raise as arrears in the next payroll, leaving the finalized payslip as it was', async () => {
    const slipBefore = await prisma.rndtechnosoft_payslips.findFirstOrThrow({ where: { tenant_id: a.tenantId, employee_id: ids.W } });
    const raise = (extra: Record<string, unknown>) => ({
      salaryStructureId: ids.STD, effectiveFrom: '2026-09-01', payBasis: 'MONTHLY', monthlySalary: '36000', annualCtc: null, baseRate: null, currencyCode: 'INR',
      payrollPolicyId: null, isOvertimeEligible: true, paymentMethod: 'BANK_TRANSFER', changeReason: 'Annual increment', componentValues: [], ...extra,
    });
    expect((await asA('post', `/salary/employees/${ids.W}/revisions`, raise({ effectiveFrom: '2026-08-01' }))).body.message).toMatch(/add arrears from the date/);
    expect((await asA('post', `/salary/employees/${ids.W}/revisions`, raise({ arrearsFrom: '2026-09-01', effectiveFrom: '2026-10-01' }))).body.message).toMatch(/only for months whose payroll is finalized/);
    const salary = await ok('post', `/salary/employees/${ids.W}/revisions`, raise({ arrearsFrom: '2026-08-01' }));
    // August again on 36000: 36000 + overtime at the new rate 798.39 + bonus 2000, against 32665.32 paid.
    expect(salary.arrears).toEqual([expect.objectContaining({ status: 'PENDING', period: { start: '2026-08-01', end: '2026-08-31' }, paid: '32665.32', revised: '38798.39', amount: '6133.07' })]);

    const september = await preview('2026-09');
    expect(september.status).toBe('READY');
    expect(amounts(september)).toMatchObject({ BASIC: '18000.00', ARREARS: '6133.07', LOAN: '1000.00' });
    expect(september.lines.find((l: { componentCode: string }) => l.componentCode === 'ARREARS').steps).toEqual(['Arrears for 2026-08-01 to 2026-08-31: revised earnings 38798.39 − paid 32665.32 = 6133.07']);

    await runAndFinalize('2026-09');
    const paidArrears = await prisma.rndtechnosoft_salary_arrears.findFirstOrThrow({ where: { tenant_id: a.tenantId, employee_id: ids.W } });
    expect(paidArrears.arrears_status).toBe('INCLUDED');
    expect((await preview('2026-10')).lines.some((l: { componentCode: string }) => l.componentCode === 'ARREARS')).toBe(false);
    const slipAfter = await prisma.rndtechnosoft_payslips.findFirstOrThrow({ where: { id: slipBefore.id } });
    expect(slipAfter.gross_earnings.toFixed(2)).toBe(slipBefore.gross_earnings.toFixed(2));
  });
});
