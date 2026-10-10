import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { defaultPolicyConfig } from '@/modules/payroll/policies/policy-config';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Payroll calculation end to end (phase 3): pay worked out from salary,
 * policy and attendance for monthly and hourly people, a salary change and
 * a joiner in the month, missing attendance held as an exception, and a run
 * that can't be approved until every exception is fixed, then finalized into
 * payslips.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Payroll-Calc-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
type Method = 'get' | 'post' | 'put';

describe('Payroll calculation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `calc-a-${SUFFIX}@rnd.test` };
  const b = { tenantId: '', token: '', email: `calc-b-${SUFFIX}@rnd.test` };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const ok = async (method: Method, url: string, body?: unknown) => {
    const response = await asA(method, url, body);
    if (response.status >= 300) throw new Error(`${method} ${url} → ${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data ?? response.body;
  };

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Calc ${label} ${SUFFIX}`, tenantCode: `CALC${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
  }

  const component = (componentCode: string, extra: Record<string, unknown> = {}) => ({
    componentCode, componentName: componentCode, category: 'EARNING', calculationType: 'FORMULA', systemRule: null, isStatutory: false, isTaxable: true,
    isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100, ...extra,
  });
  const line = (code: string, extra: Record<string, unknown>) => ({ salaryComponentId: ids[code], defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: null, isMandatory: true, ...extra });

  async function employee(code: string, hireDate: string | null = null) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: a.tenantId, employee_code: `${code}-${SUFFIX}`, first_name: code, employee_status: 'ACTIVE', hire_date: hireDate ? new Date(hireDate) : null } });
    return id;
  }
  /** September 2026: Sundays are weekly offs, every other day the given status (or present). */
  async function attendance(employeeId: string, statuses: Record<string, string> = {}, from = 1, skip: number[] = []) {
    const rows = [];
    for (let d = from; d <= 30; d += 1) {
      if (skip.includes(d)) continue;
      const date = `2026-09-${String(d).padStart(2, '0')}`;
      const status = new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? 'WEEKEND' : statuses[date] ?? 'PRESENT';
      const worked = status === 'PRESENT' ? 480 : 0;
      rows.push({ id: randomUUID(), tenant_id: a.tenantId, employee_id: employeeId, attendance_date: new Date(date), attendance_status: status, worked_minutes: worked, payable_minutes: worked, source: 'MANUAL', approval_status: 'NOT_REQUIRED' });
    }
    await prisma.rndtechnosoft_attendance_records.createMany({ data: rows });
  }
  const salary = (structure: string, extra: Record<string, unknown> = {}) => ({
    salaryStructureId: ids[structure], effectiveFrom: '2026-01-01', payBasis: 'MONTHLY', monthlySalary: '30000', annualCtc: null, baseRate: null, currencyCode: 'INR',
    payrollPolicyId: null, isOvertimeEligible: false, paymentMethod: 'BANK_TRANSFER', changeReason: 'Test salary', componentValues: [], ...extra,
  });
  const preview = (employeeId: string) => ok('get', `/payroll/calculation/preview?employeeId=${employeeId}&month=2026-09`);
  const amounts = (pay: { lines: { componentCode: string; amount: string }[] }) => Object.fromEntries(pay.lines.map((l) => [l.componentCode, l.amount]));

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

    for (const [code, extra] of Object.entries({
      BASIC: { calculationType: 'PERCENTAGE' }, HRA: { calculationType: 'PERCENTAGE' }, SPECIAL: {},
      PF: { category: 'DEDUCTION', includeInGross: false }, PF_EMPLOYER: { category: 'EMPLOYER_CONTRIBUTION', includeInGross: false },
      HOURLY_PAY: { isProrated: false },
    })) ids[code] = (await ok('post', '/salary/components', component(code, extra))).id;
    ids.STD = (await ok('post', '/salary/structures', { structureCode: 'STD', structureName: 'Standard', effectiveFrom: '2026-01-01', lines: [
      line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }), line('HRA', { defaultPercentage: '40', percentageBase: 'BASIC' }),
      line('SPECIAL', { formula: 'MONTHLY_SALARY - BASIC - HRA' }), line('PF', { formula: 'min(BASIC, 15000) * 12%' }), line('PF_EMPLOYER', { formula: 'PF' }),
    ] })).id;
    await ok('post', `/salary/structures/${ids.STD}/draft/publish`);
    ids.HOURLY = (await ok('post', '/salary/structures', { structureCode: 'HOURLY', structureName: 'Hourly', effectiveFrom: '2026-01-01', lines: [line('HOURLY_PAY', { formula: 'HOURLY_RATE * PAYABLE_HOURS' })] })).id;
    await ok('post', `/salary/structures/${ids.HOURLY}/draft/publish`);
    ids.POLICY = (await ok('post', '/payroll/policies', { policyCode: 'STANDARD', policyName: 'Standard', isDefault: true, effectiveFrom: '2026-01-01' })).id;
    await ok('put', `/payroll/policies/${ids.POLICY}/draft`, { effectiveFrom: '2026-01-01', config: defaultPolicyConfig() });
    await ok('post', `/payroll/policies/${ids.POLICY}/draft/publish`);

    ids.ABSENT3 = await employee('ABSENT3');
    await ok('post', `/salary/employees/${ids.ABSENT3}/revisions`, salary('STD'));
    await attendance(ids.ABSENT3, { '2026-09-02': 'ABSENT', '2026-09-03': 'ABSENT', '2026-09-04': 'ABSENT' });

    ids.MISSING = await employee('MISSING');
    await ok('post', `/salary/employees/${ids.MISSING}/revisions`, salary('STD', { monthlySalary: '20000' }));
    await attendance(ids.MISSING, {}, 1, [10]);

    ids.HOURLYP = await employee('HOURLYP');
    await ok('post', `/salary/employees/${ids.HOURLYP}/revisions`, salary('HOURLY', { payBasis: 'HOURLY', monthlySalary: null, baseRate: '125' }));
    await attendance(ids.HOURLYP);

    ids.RAISED = await employee('RAISED');
    await ok('post', `/salary/employees/${ids.RAISED}/revisions`, salary('STD'));
    await ok('post', `/salary/employees/${ids.RAISED}/revisions`, salary('STD', { effectiveFrom: '2026-09-16', monthlySalary: '36000', changeReason: 'Raise' }));
    await attendance(ids.RAISED);

    ids.JOINER = await employee('JOINER', '2026-09-16');
    await ok('post', `/salary/employees/${ids.JOINER}/revisions`, salary('STD', { effectiveFrom: '2026-09-16' }));
    await attendance(ids.JOINER, {}, 16);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_bookkeeping_entry_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_bookkeeping_entries.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_year_ledger_balances.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslip_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslips.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_run_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_runs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_periods.deleteMany({ where: scope });
      await prisma.rndtechnosoft_accounting_ledgers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_years.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_records.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_component_values.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structures.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policy_scopes.deleteMany({ where: scope });
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

  it('pays a monthly salary for the paid share of the month, and explains each line', async () => {
    const pay = await preview(ids.ABSENT3);
    expect(pay.status).toBe('READY');
    expect(pay.attendance).toMatchObject({ calendarDays: 30, workingDays: 26, absentDays: 3, weeklyOffs: 4, paidDays: '27', unpaidDays: '3' });
    expect(amounts(pay)).toEqual({ BASIC: '13500.00', HRA: '5400.00', SPECIAL: '8100.00', PF: '1620.00', PF_EMPLOYER: '1620.00' });
    expect(pay.totals).toMatchObject({ earnings: '27000.00', deductions: '1620.00', employerContributions: '1620.00', net: '25380.00' });
    expect(pay.lines[0].steps).toEqual(['50% of MONTHLY_SALARY (30000) = 15000', '× paid share of the month 0.9 = 13500.00']);
    expect(pay.segments[0]).toMatchObject({ structure: { code: 'STD', version: 1 }, policy: { code: 'STANDARD', reason: 'The workspace’s default policy' }, variables: { DIVISOR: '30', PRORATION: '0.9' } });
  });

  it('holds pay for a working day with no attendance instead of guessing', async () => {
    const pay = await preview(ids.MISSING);
    expect(pay.status).toBe('EXCEPTION');
    expect(pay.exceptions).toEqual([expect.stringContaining('No attendance on 1 working day: 2026-09-10')]);
  });

  it('pays people paid by the hour for their payable hours', async () => {
    const pay = await preview(ids.HOURLYP);
    expect(pay.status).toBe('READY');
    expect(amounts(pay)).toEqual({ HOURLY_PAY: '26000.00' });
    expect(pay.lines[0].steps).toEqual(['HOURLY_RATE (125) × PAYABLE_HOURS (208) = 26000']);
  });

  it('splits the month where the salary changes, and pays a joiner from the day they joined', async () => {
    const raised = await preview(ids.RAISED);
    expect(raised.segments.map((s: { from: string; to: string; variables: { PRORATION: string; MONTHLY_SALARY: string } }) => [s.from, s.to, s.variables.MONTHLY_SALARY, s.variables.PRORATION])).toEqual([
      ['2026-09-01', '2026-09-15', '30000', '0.5'], ['2026-09-16', '2026-09-30', '36000', '0.5'],
    ]);
    expect(amounts(raised).BASIC).toBe('16500.00');
    expect(raised.totals.earnings).toBe('33000.00');
    expect(raised.lines[0].steps[0]).toMatch(/^2026-09-01 to 2026-09-15: 50% of MONTHLY_SALARY \(30000\)/);

    const joiner = await preview(ids.JOINER);
    expect(joiner.status).toBe('READY');
    expect(joiner.attendance).toMatchObject({ notEmployedDays: 15 });
    expect(joiner.totals.earnings).toBe('15000.00');
  });

  it('keeps each workspace’s payroll to itself', async () => {
    expect((await call('get', `/payroll/calculation/preview?employeeId=${ids.ABSENT3}&month=2026-09`, b.token)).status).toBe(404);
    expect((await call('get', '/payroll/calculation/employees?month=2026-09', b.token)).body.data).toEqual([]);
    expect((await asA('get', `/payroll/calculation/preview?employeeId=${ids.ABSENT3}&month=2026-13`)).status).toBe(400);
  });

  it('runs payroll: exceptions stop approval until fixed, then payslips keep every line', async () => {
    const people = await ok('get', '/payroll/calculation/employees?month=2026-09');
    expect(people).toHaveLength(5);
    const period = await ok('post', '/payroll/periods', { periodCode: `2026-09-${SUFFIX}`, periodStart: '2026-09-01', periodEnd: '2026-09-30' });
    const run = await ok('post', '/payroll/runs', { payrollPeriodId: period.id });
    const calculated = await ok('post', `/payroll/runs/${run.id}/calculate`);
    const statuses = Object.fromEntries(calculated.rndtechnosoft_payroll_run_employees.map((r: { employee_id: string; processing_status: string }) => [r.employee_id, r.processing_status]));
    expect(statuses[ids.MISSING]).toBe('EXCEPTION');
    expect(statuses[ids.ABSENT3]).toBe('CALCULATED');
    const held = await asA('post', `/payroll/runs/${run.id}/approve`);
    expect(held.status).toBe(400);
    expect(held.body.message).toBe('1 employee has pay exceptions. Fix them and recalculate before approving.');

    await prisma.rndtechnosoft_attendance_records.create({ data: { id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.MISSING, attendance_date: new Date('2026-09-10'), attendance_status: 'PRESENT', worked_minutes: 480, payable_minutes: 480, source: 'MANUAL', approval_status: 'NOT_REQUIRED' } });
    await ok('post', `/payroll/runs/${run.id}/calculate`);
    await ok('post', `/payroll/runs/${run.id}/approve`);
    await ok('post', `/payroll/runs/${run.id}/finalize`);

    const slip = await prisma.rndtechnosoft_payslips.findFirstOrThrow({ where: { tenant_id: a.tenantId, employee_id: ids.ABSENT3 }, include: { rndtechnosoft_payslip_lines: true } });
    expect(slip.net_pay.toFixed(2)).toBe('25380.00');
    expect(slip.rndtechnosoft_payslip_lines.map((l) => [l.component_code_snapshot, l.component_category, l.amount.toFixed(2)]).sort()).toEqual([
      ['BASIC', 'EARNING', '13500.00'], ['HRA', 'EARNING', '5400.00'], ['PF', 'DEDUCTION', '1620.00'], ['PF_EMPLOYER', 'EMPLOYER_CONTRIBUTION', '1620.00'], ['SPECIAL', 'EARNING', '8100.00'],
    ]);
    expect(await prisma.rndtechnosoft_payslips.count({ where: { tenant_id: a.tenantId, payroll_run_id: run.id } })).toBe(5);
    // Finalized payroll is final: no recalculation, and salaries before it can't change.
    expect((await asA('post', `/payroll/runs/${run.id}/calculate`)).status).toBe(400);
    expect((await asA('post', `/salary/employees/${ids.ABSENT3}/revisions`, salary('STD', { effectiveFrom: '2026-09-20', changeReason: 'Late change' }))).body.message).toMatch(/finalized up to 2026-09-30/);
  });

  it('summarises the month on the payroll overview from the finalized run, without claiming payment', async () => {
    const overview = await ok('get', '/payroll/dashboard?month=2026-09');
    expect(overview.run).toMatchObject({ status: 'FINALIZED' });
    expect(overview.summary).toMatchObject({ employees: 5, ready: 5, exceptions: 0 });
    const slips = await prisma.rndtechnosoft_payslips.findMany({ where: { tenant_id: a.tenantId } });
    const sum = (key: 'gross_earnings' | 'net_pay') => slips.reduce((t, x) => t + Number(x[key]), 0).toFixed(2);
    expect(overview.summary.earnings).toBe(sum('gross_earnings'));
    expect(overview.summary.net).toBe(sum('net_pay'));
    // Cost is what employees earn plus what the employer contributes on top.
    expect(Number(overview.summary.totalCost)).toBeCloseTo(Number(overview.summary.earnings) + Number(overview.summary.employerContributions), 2);
    expect(overview.trend).toHaveLength(12);
    expect(overview.trend[11]).toMatchObject({ month: '2026-09', status: 'FINALIZED', totalCost: overview.summary.totalCost });
    expect(overview.trend[10]).toEqual({ month: '2026-08', totalCost: null, status: null });
    expect(overview.changes).toBeNull();

    const page = await ok('get', '/payroll/dashboard/employees?month=2026-09&limit=2&page=1');
    expect(page).toMatchObject({ total: 5, limit: 2, counts: { all: 5, ready: 5, exceptions: 0, finalized: 5 } });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({ status: 'FINALIZED', payment: null });
    const found = await ok('get', '/payroll/dashboard/employees?month=2026-09&search=absent3');
    expect(found.items.map((i: { employeeId: string; net: string }) => [i.employeeId, i.net])).toEqual([[ids.ABSENT3, '25380.00']]);
    expect((await ok('get', '/payroll/dashboard/employees?month=2026-09&status=EXCEPTION')).total).toBe(0);
    expect((await call('get', '/payroll/dashboard?month=2026-09', b.token)).body.data.summary).toBeNull();
    expect((await call('get', '/payroll/dashboard/employees?month=2026-09', b.token)).body.data.total).toBe(0);
  });
});
