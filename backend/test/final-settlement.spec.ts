import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { defaultPolicyConfig } from '@/modules/payroll/policies/policy-config';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OffboardingNotificationsService } from '@/modules/offboarding/offboarding-notifications.service';

/**
 * Full and final settlement end to end: worked out from the real salary
 * structure, leave balance, notice shortfall, loans and the finalized final
 * payroll; adjusted only with a reason; reviewed by Finance and approved by
 * someone who didn't prepare it; paid, which settles the loan and uses up the
 * encashed leave. One live settlement per exit, and another workspace sees none.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Settlement-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
type Method = 'get' | 'post' | 'put';

describe('Full and final settlement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  let A = '';

  const call = (method: Method, url: string, who: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${tokens[who]}`);
    return body === undefined ? req : req.send(body as object);
  };
  const ok = async (method: Method, url: string, body?: unknown) => {
    const response = await call(method, url, 'Owner', body);
    if (response.status >= 300) throw new Error(`${method} ${url} → ${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data ?? response.body;
  };

  async function register(key: string) {
    const email = `fnf-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Settlement ${key} ${SUFFIX}`, tenantCode: `FNF${key}${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    tenantIds.push(r.body.activeTenant.tenantId);
    tokens[key] = r.body.token;
    return r.body.activeTenant.tenantId as string;
  }

  async function member(key: string, tenantId: string, permissions: string[]) {
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: tenantId, role_code: `${key.toUpperCase()}_${SUFFIX.toUpperCase()}`, role_name: key, is_system_role: false } });
    const rows = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissions } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: rows.map((p) => ({ id: randomUUID(), tenant_id: tenantId, role_id: roleId, permission_id: p.id })) });
    const email = `fnf-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId } });
    const r = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD, tenantId });
    expect(r.status).toBe(200);
    tokens[key] = r.body.token;
  }

  const component = (componentCode: string, extra: Record<string, unknown> = {}) => ({
    componentCode, componentName: componentCode, category: 'EARNING', calculationType: 'FORMULA', systemRule: null, isStatutory: false, isTaxable: true,
    isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100, ...extra,
  });
  const line = (code: string, extra: Record<string, unknown>) => ({ salaryComponentId: ids[code], defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: null, isMandatory: true, ...extra });

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
    A = await register('Owner');
    await register('Other');
    await member('Finance', A, ['offboarding.view', 'offboarding.settlement.view', 'offboarding.settlement.review', 'offboarding.settlement.approve', 'offboarding.settlement.pay']);

    // A salary of 60,000 a month: Basic is half of it.
    ids.BASIC = (await ok('post', '/salary/components', component('BASIC', { calculationType: 'PERCENTAGE' }))).id;
    ids.SPECIAL = (await ok('post', '/salary/components', component('SPECIAL'))).id;
    ids.STD = (await ok('post', '/salary/structures', { structureCode: 'STD', structureName: 'Standard', effectiveFrom: '2019-01-01', lines: [
      line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }), line('SPECIAL', { formula: 'MONTHLY_SALARY - BASIC' }),
    ] })).id;
    await ok('post', `/salary/structures/${ids.STD}/draft/publish`);
    ids.POLICY = (await ok('post', '/payroll/policies', { policyCode: 'STANDARD', policyName: 'Standard', isDefault: true, effectiveFrom: '2019-01-01' })).id;
    await ok('put', `/payroll/policies/${ids.POLICY}/draft`, { effectiveFrom: '2019-01-01', config: defaultPolicyConfig() });
    await ok('post', `/payroll/policies/${ids.POLICY}/draft/publish`);

    // Joined 1 Jan 2019 with 30 days' notice; leaves 31 Aug 2025 after 20 days' notice.
    ids.leaver = randomUUID();
    const joined = new Date('2019-01-01');
    await prisma.rndtechnosoft_employees.create({ data: { id: ids.leaver, tenant_id: A, employee_code: `L-${SUFFIX}`, first_name: 'Leaver', hire_date: joined } });
    await prisma.rndtechnosoft_employee_employments.create({ data: { id: randomUUID(), tenant_id: A, employee_id: ids.leaver, joining_date: joined, effective_from: joined, employment_status: 'CONFIRMED', notice_period_days: 30 } });
    await ok('post', `/salary/employees/${ids.leaver}/revisions`, {
      salaryStructureId: ids.STD, effectiveFrom: '2019-01-01', payBasis: 'MONTHLY', monthlySalary: '60000', annualCtc: null, baseRate: null, currencyCode: 'INR',
      payrollPolicyId: null, isOvertimeEligible: false, paymentMethod: 'BANK_TRANSFER', changeReason: 'Joining salary', componentValues: [],
    });

    // 10 days of earned leave, which the policy lets them encash; sick leave it doesn't.
    const policyId = randomUUID();
    ids.EL = randomUUID();
    ids.SL = randomUUID();
    await prisma.rndtechnosoft_leave_types.createMany({ data: [{ id: ids.EL, tenant_id: A, leave_type_code: 'EL', leave_type_name: 'Earned leave' }, { id: ids.SL, tenant_id: A, leave_type_code: 'SL', leave_type_name: 'Sick leave' }] });
    await prisma.rndtechnosoft_leave_policies.create({ data: { id: policyId, tenant_id: A, leave_policy_code: 'STD', leave_policy_name: 'Standard', effective_from: joined } });
    await prisma.rndtechnosoft_leave_policy_rules.createMany({ data: [{ id: randomUUID(), tenant_id: A, leave_policy_id: policyId, leave_type_id: ids.EL, encashment_allowed: true }, { id: randomUUID(), tenant_id: A, leave_policy_id: policyId, leave_type_id: ids.SL }] });
    await prisma.rndtechnosoft_employee_leave_policy_assignments.create({ data: { id: randomUUID(), tenant_id: A, employee_id: ids.leaver, leave_policy_id: policyId, effective_from: joined } });
    await prisma.rndtechnosoft_leave_balance_summaries.createMany({ data: [{ id: randomUUID(), tenant_id: A, employee_id: ids.leaver, leave_type_id: ids.EL, balance_days: '10', as_of_date: new Date('2025-08-31') }, { id: randomUUID(), tenant_id: A, employee_id: ids.leaver, leave_type_id: ids.SL, balance_days: '4', as_of_date: new Date('2025-08-31') }] });

    // A loan with two instalments still to recover.
    ids.loan = randomUUID();
    await prisma.rndtechnosoft_employee_loans.create({ data: { id: ids.loan, tenant_id: A, employee_id: ids.leaver, loan_number: `L-${SUFFIX}`, loan_type: 'LOAN', principal_amount: '10000', total_repayable_amount: '10000', installment_amount: '5000', start_date: new Date('2025-06-01') } });
    await prisma.rndtechnosoft_loan_installments.createMany({ data: ['2025-09-30', '2025-10-31'].map((d, n) => ({ id: randomUUID(), tenant_id: A, employee_loan_id: ids.loan, installment_number: n + 1, due_date: new Date(d), principal_amount: '5000', total_amount: '5000' })) });

    const started = await call('post', '/offboarding/separations', 'Owner', { employeeId: ids.leaver, type: 'RESIGNATION', reason: 'Moving cities', noticeDate: '2025-08-11', lastWorkingDate: '2025-08-31' });
    expect(started.status).toBe(201);
    ids.exit = started.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      const scope = { tenant_id: { in: tenantIds } };
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
      const exitDocs = { ...scope, separation_id: { not: null } };
      const docIds = (await prisma.rndtechnosoft_candidate_documents.findMany({ where: exitDocs, select: { id: true } })).map((d) => d.id);
      await prisma.rndtechnosoft_candidate_document_versions.deleteMany({ where: { document_id: { in: docIds } } });
      await prisma.rndtechnosoft_candidate_documents.deleteMany({ where: exitDocs });
      await prisma.rndtechnosoft_final_settlement_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_final_settlements.updateMany({ where: scope, data: { revised_from_settlement_id: null } });
      await prisma.rndtechnosoft_final_settlements.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_clearance_items.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_date_changes.deleteMany({ where: scope });
      await app.get(OffboardingNotificationsService).flush();
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_comments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_separations.deleteMany({ where: scope });
      await prisma.rndtechnosoft_loan_repayments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_loan_installments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_loans.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_balance_transactions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_balance_summaries.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_leave_policy_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_policy_rules.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_policies.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payslips.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_run_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_runs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_periods.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_component_values.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structure_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structures.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policy_scopes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policy_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_policies.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_designations.deleteMany({ where: scope });
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
    await app?.close();
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
  });

  /** August 2025's payroll, finalized, with the leaver's payslip. */
  async function finalizeAugustPayroll() {
    const periodId = randomUUID();
    const runId = randomUUID();
    const runEmployeeId = randomUUID();
    await prisma.rndtechnosoft_payroll_periods.create({ data: { id: periodId, tenant_id: A, period_code: '2025-08', pay_frequency: 'MONTHLY', period_start: new Date('2025-08-01'), period_end: new Date('2025-08-31'), period_status: 'CLOSED' } });
    await prisma.rndtechnosoft_payroll_runs.create({ data: { id: runId, tenant_id: A, payroll_period_id: periodId, run_number: `R-${SUFFIX}`, run_status: 'FINALIZED', finalized_at: new Date() } });
    await prisma.rndtechnosoft_payroll_run_employees.create({ data: { id: runEmployeeId, tenant_id: A, payroll_run_id: runId, employee_id: ids.leaver, gross_earnings: '60000', gross_deductions: '10000', net_pay: '50000' } });
    await prisma.rndtechnosoft_payslips.create({
      data: {
        id: randomUUID(), tenant_id: A, payroll_run_employee_id: runEmployeeId, payroll_run_id: runId, payroll_period_id: periodId, employee_id: ids.leaver, payslip_number: `PS-${SUFFIX}`,
        employee_code_snapshot: `L-${SUFFIX}`, employee_name_snapshot: 'Leaver', currency_code: 'INR', gross_earnings: '60000', gross_deductions: '10000', net_pay: '50000', generated_at: new Date(),
      },
    });
  }

  const settlement = async (who = 'Owner') => (await call('get', `/offboarding/separations/${ids.exit}/settlement`, who)).body.data;
  const amountOf = (s: { lines: { code: string; amount: string }[] }, code: string) => s.lines.find((l) => l.code === code)?.amount;

  it('works the settlement out from salary, leave, notice, loans and the final payroll', async () => {
    expect(await settlement()).toMatchObject({ current: null, canPrepare: true });
    expect((await call('post', `/offboarding/separations/${ids.exit}/settlement`, 'Finance')).status).toBe(403);

    const prepared = (await call('post', `/offboarding/separations/${ids.exit}/settlement`, 'Owner')).body.data.current;
    // Notice undecided and August payroll not finalized: both must be settled first.
    expect(prepared.problems.join(' ')).toMatch(/Finalize payroll for 2025-08.*recovered or waived/s);
    ids.settlement = prepared.id;
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/submit`, 'Owner')).status).toBe(400);

    await call('put', `/offboarding/separations/${ids.exit}/notice-decision`, 'Owner', { decision: 'RECOVER' });
    await finalizeAugustPayroll();
    const s = (await call('post', `/offboarding/settlements/${ids.settlement}/recalculate`, 'Owner')).body.data.current;
    expect(s.problems).toEqual([]);
    // Gratuity: 30,000 × 15 ÷ 26 × 7 (6 years 8 months); encashment: 30,000 ÷ 26 × 10; notice: 60,000 ÷ 30 × 10 days.
    expect(amountOf(s, 'GRATUITY')).toBe('121153.85');
    expect(amountOf(s, 'LEAVE_ENCASHMENT')).toBe('11538.46');
    expect(s.lines.filter((l: { code: string }) => l.code === 'LEAVE_ENCASHMENT')).toHaveLength(1);
    expect(amountOf(s, 'NOTICE_RECOVERY')).toBe('20000.00');
    expect(amountOf(s, 'LOAN_RECOVERY')).toBe('10000.00');
    expect(s.lines.find((l: { code: string }) => l.code === 'FINAL_SALARY')).toMatchObject({ amount: '50000.00', countsInTotal: false });
    expect(s.totals).toEqual({ earnings: '132692.31', recoveries: '30000.00', net: '102692.31' });
  });

  it('changes amounts only with a reason, and never recovers more than is owed', async () => {
    const s = (await settlement()).current;
    const lineId = (code: string) => s.lines.find((l: { code: string }) => l.code === code).id;
    expect((await call('put', `/offboarding/settlements/${ids.settlement}/lines/${lineId('LOAN_RECOVERY')}`, 'Owner', { amount: '12000', reason: 'More' })).status).toBe(400);
    expect((await call('put', `/offboarding/settlements/${ids.settlement}/lines/${lineId('GRATUITY')}`, 'Owner', { amount: '1' })).status).toBe(400);
    expect((await call('put', `/offboarding/settlements/${ids.settlement}/lines/${lineId('FINAL_SALARY')}`, 'Owner', { amount: '1', reason: 'x' })).status).toBe(400);
    const bonus = await call('post', `/offboarding/settlements/${ids.settlement}/lines`, 'Owner', { code: 'BONUS', label: 'Pro-rata bonus', amount: '5000', reason: 'Bonus policy, 2025' });
    expect(bonus.status).toBe(201);
    expect(bonus.body.data.current.totals.net).toBe('107692.31');
  });

  it('is reviewed by Finance and approved by someone who didn’t prepare it', async () => {
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/submit`, 'Owner')).status).toBe(200);
    expect((await call('put', `/offboarding/settlements/${ids.settlement}/lines/${(await settlement()).current.lines[1].id}`, 'Owner', { amount: '1', reason: 'late' })).status).toBe(400);
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/approve`, 'Finance')).status).toBe(400); // not reviewed yet
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/review`, 'Finance', { notes: 'Checked against payroll' })).status).toBe(200);
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/approve`, 'Owner')).status).toBe(403); // prepared it
    const approved = await call('post', `/offboarding/settlements/${ids.settlement}/approve`, 'Finance');
    expect(approved.status).toBe(200);
    expect(approved.body.data.current).toMatchObject({ status: 'APPROVED', reviewedBy: 'Finance', approvedBy: 'Finance' });
    expect((await call('post', `/offboarding/separations/${ids.exit}/settlement`, 'Owner')).status).toBe(409);
  });

  it('records the payment, settling the loan and using up the encashed leave, once', async () => {
    const paid = await call('post', `/offboarding/settlements/${ids.settlement}/pay`, 'Finance', { paymentDate: '2025-09-10', mode: 'BANK_TRANSFER', reference: 'UTR123' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.current).toMatchObject({ status: 'PAID', payment: { date: '2025-09-10', mode: 'BANK_TRANSFER', reference: 'UTR123' } });
    expect((await prisma.rndtechnosoft_employee_loans.findUniqueOrThrow({ where: { id: ids.loan } })).loan_status).toBe('CLOSED');
    const installments = await prisma.rndtechnosoft_loan_installments.findMany({ where: { employee_loan_id: ids.loan } });
    expect(installments.map((i) => i.installment_status)).toEqual(['RECOVERED', 'RECOVERED']);
    expect(await prisma.rndtechnosoft_loan_repayments.count({ where: { employee_loan_id: ids.loan, repayment_source: 'FINAL_SETTLEMENT' } })).toBe(2);
    const leave = await prisma.rndtechnosoft_leave_balance_summaries.findFirstOrThrow({ where: { employee_id: ids.leaver, leave_type_id: ids.EL } });
    expect(leave.balance_days.toFixed()).toBe('0');
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/pay`, 'Finance', { paymentDate: '2025-09-10', mode: 'BANK_TRANSFER' })).status).toBe(409);

    // The exit's own check now sees nothing left to settle.
    expect((await call('get', `/offboarding/separations/${ids.exit}`, 'Owner')).body.data.obligations.loans).toEqual([]);
  });

  it('shows nothing to another workspace', async () => {
    expect((await call('get', `/offboarding/separations/${ids.exit}/settlement`, 'Other')).status).toBe(404);
    expect((await call('post', `/offboarding/settlements/${ids.settlement}/approve`, 'Other')).status).toBe(404);
  });

  it('keeps its own rules per workspace, merged over the defaults', async () => {
    const saved = await call('put', '/offboarding/settlement-policy', 'Owner', { gratuity: { enabled: false, minimumYears: 5, roundUpMonths: 6, daysPerYear: 15, dayDivisor: 26, componentCodes: ['BASIC'], cap: '2000000' } });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ gratuity: { enabled: false }, leaveEncashment: { basis: 'BASIC', dayDivisor: 26 } });
    expect((await call('get', '/offboarding/settlement-policy', 'Other')).body.data.gratuity.enabled).toBe(true);
  });

  describe('exit documents', () => {
    const docs = async (who = 'Owner') => (await call('get', `/offboarding/separations/${ids.exit}/documents`, who)).body.data;
    const generate = (documentType: string, who = 'Owner') => call('post', `/offboarding/separations/${ids.exit}/documents`, who, { documentType });
    type ExitDoc = { id: string; type: string; status: string; version: number; missing: string[] };
    const doc = (list: { documents: ExitDoc[] }, type: string) => list.documents.find((d) => d.type === type) as ExitDoc;

    it('makes letters from the employee’s own records, flagging what the records lack, for someone never a candidate', async () => {
      expect((await generate('EXPERIENCE_LETTER', 'Finance')).status).toBe(403);
      const first = await generate('EXPERIENCE_LETTER');
      expect(first.status).toBe(200);
      const letter = doc(first.body.data, 'EXPERIENCE_LETTER');
      expect(letter).toMatchObject({ status: 'DRAFT', version: 1 });
      expect(letter.missing.sort()).toEqual(['department', 'designation']);
      const row = await prisma.rndtechnosoft_candidate_documents.findUniqueOrThrow({ where: { id: letter.id } });
      expect([row.candidate_id, row.employee_id, row.separation_id]).toEqual([null, ids.leaver, ids.exit]);
      expect(row.rendered_body).toContain('from 1 January 2019 to 31 August 2025, a period of 6 years 8 months');

      // Once the records have the details, a regenerated draft is a new version with nothing missing.
      const dept = randomUUID();
      const role = randomUUID();
      await prisma.rndtechnosoft_departments.create({ data: { id: dept, tenant_id: A, department_code: 'FIN', department_name: 'Finance' } });
      await prisma.rndtechnosoft_designations.create({ data: { id: role, tenant_id: A, designation_code: 'ACC', designation_name: 'Accountant' } });
      await prisma.rndtechnosoft_employee_employments.updateMany({ where: { employee_id: ids.leaver }, data: { department_id: dept, designation_id: role } });
      const again = doc((await generate('EXPERIENCE_LETTER')).body.data, 'EXPERIENCE_LETTER');
      expect(again).toMatchObject({ id: letter.id, version: 2, missing: [] });
      expect((await call('get', `/offboarding/separations/${ids.exit}/documents/${letter.id}/versions`, 'Owner')).body.data.map((v: { version: number }) => v.version)).toEqual([2, 1]);

      // Letters are issued only once the exit is complete.
      expect((await call('post', `/offboarding/separations/${ids.exit}/documents/${letter.id}/issue`, 'Owner')).status).toBe(400);
    });

    it('makes the settlement statement from the approved settlement, and serves it only through the session', async () => {
      const statement = doc((await generate('FULL_AND_FINAL_STATEMENT')).body.data, 'FULL_AND_FINAL_STATEMENT');
      const row = await prisma.rndtechnosoft_candidate_documents.findUniqueOrThrow({ where: { id: statement.id } });
      expect(row.rendered_body).toContain('Net amount payable');
      expect(row.rendered_body).toContain('Gratuity');
      expect(row.rendered_body).toContain('UTR123');

      const pdf = await call('get', `/offboarding/separations/${ids.exit}/documents/${statement.id}/pdf`, 'Owner').buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      expect(pdf.status).toBe(200);
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      expect((await request(app.getHttpServer()).get(`${API}/offboarding/separations/${ids.exit}/documents/${statement.id}/pdf`).set('Host', LOCAL)).status).toBe(401);
      expect((await call('get', `/offboarding/separations/${ids.exit}/documents`, 'Other')).status).toBe(404);

      const issued = await call('post', `/offboarding/separations/${ids.exit}/documents/${statement.id}/issue`, 'Owner');
      expect(doc(issued.body.data, 'FULL_AND_FINAL_STATEMENT').status).toBe('ISSUED');
      expect((await generate('FULL_AND_FINAL_STATEMENT')).status).toBe(409);
    });

    it('issues the relieving letter once the exit is complete', async () => {
      const exit = (await call('get', `/offboarding/separations/${ids.exit}`, 'Owner')).body.data;
      for (const item of exit.checklist as { id: string }[]) {
        expect((await call('put', `/offboarding/separations/${ids.exit}/checklist/${item.id}`, 'Owner', { status: 'CLEARED' })).status).toBe(200);
      }
      expect((await call('post', `/offboarding/separations/${ids.exit}/complete`, 'Owner')).status).toBe(200);
      const relieving = doc((await generate('RELIEVING_LETTER')).body.data, 'RELIEVING_LETTER');
      const row = await prisma.rndtechnosoft_candidate_documents.findUniqueOrThrow({ where: { id: relieving.id } });
      expect(row.rendered_body).toContain('your resignation notified on 11 August 2025');
      const issued = await call('post', `/offboarding/separations/${ids.exit}/documents/${relieving.id}/issue`, 'Owner');
      expect(issued.status).toBe(200);
      expect(doc(issued.body.data, 'RELIEVING_LETTER').status).toBe('ISSUED');
    });
  });
});
