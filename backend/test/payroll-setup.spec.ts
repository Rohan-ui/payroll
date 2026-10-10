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
 * Payroll setup end to end: salary components, versioned salary structures
 * with their formulas and preview, payroll policies, employee salary
 * revisions, the lock from finalized payroll, the database's own history
 * guards, permissions and workspace isolation.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Payroll-Setup-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = Person & { tenantId: string };

describe('Payroll setup', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `pay-a-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Asha Admin' };
  const b: Workspace = { tenantId: '', token: '', email: `pay-b-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Bala Admin' };
  const viewer: Person = { token: '', email: `pay-view-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Vik Viewer' };
  const outsider: Person = { token: '', email: `pay-out-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Oma Outsider' };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);

  const component = (componentCode: string, extra: Record<string, unknown> = {}) => ({
    componentCode, componentName: componentCode, category: 'EARNING', calculationType: 'FIXED', systemRule: null, isStatutory: false, isTaxable: true,
    isProrated: true, includeInGross: true, includeInCtc: true, showOnPayslip: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', displayOrder: 100, ...extra,
  });
  const deduction = { category: 'DEDUCTION', includeInGross: false, isProrated: false };
  const line = (code: string, extra: Record<string, unknown> = {}) => ({ salaryComponentId: ids[code], defaultAmount: null, defaultPercentage: null, percentageBase: null, formula: null, isMandatory: true, ...extra });
  const standardLines = () => [
    line('BASIC', { defaultPercentage: '50', percentageBase: 'MONTHLY_SALARY' }),
    line('HRA', { defaultPercentage: '40', percentageBase: 'BASIC' }),
    line('SPECIAL', { formula: 'MONTHLY_SALARY - BASIC - HRA' }),
    line('TRAVEL'),
    line('PF', { formula: 'min(BASIC, 15000) * 12%' }),
    line('BONUS'),
    line('OT'),
  ];
  const revision = (extra: Record<string, unknown> = {}) => ({
    salaryStructureId: ids.STD, effectiveFrom: '2026-01-01', payBasis: 'MONTHLY', monthlySalary: '50000', annualCtc: '600000', baseRate: null, currencyCode: 'INR',
    payrollPolicyId: null, isOvertimeEligible: true, paymentMethod: 'BANK_TRANSFER', changeReason: 'Joining salary',
    componentValues: [{ salaryComponentId: ids.TRAVEL, amount: '1600', percentage: null }], ...extra,
  });

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Payroll ${label} ${SUFFIX}`, tenantCode: `PAY${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: person.userId, email: person.email, display_name: person.name, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `R_${person.name.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${person.name}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: a.tenantId, user_id: person.userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  async function employee(tenantId: string, code: string) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: `${code}-${SUFFIX}`, first_name: code } });
    return id;
  }

  /** Expects the database itself to refuse a statement. */
  async function refusedByDatabase(statement: Promise<unknown>, text: RegExp) {
    await expect(statement).rejects.toThrow(text);
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
    await addMember(viewer, ['salary.view', 'payroll.policies.view']);
    await addMember(outsider, ['dashboard.view']);
    ids.E1 = await employee(a.tenantId, 'E1');
    ids.E2 = await employee(a.tenantId, 'E2');
    ids.EB = await employee(b.tenantId, 'EB');
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
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
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
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

  it('checks salary components as they are created', async () => {
    const make = async (code: string, extra: Record<string, unknown> = {}) => {
      const response = await asA('post', '/salary/components', component(code, extra));
      expect(response.status).toBe(201);
      ids[code] = response.body.data.id;
    };
    await make('BASIC', { calculationType: 'PERCENTAGE' });
    await make('HRA', { calculationType: 'PERCENTAGE' });
    await make('SPECIAL', { calculationType: 'FORMULA' });
    await make('TRAVEL');
    await make('PF', { ...deduction, calculationType: 'FORMULA', isStatutory: true, roundingScale: 0 });
    await make('BONUS', { calculationType: 'MANUAL', isProrated: false });
    await make('OT', { calculationType: 'SYSTEM_CALCULATED', systemRule: 'OVERTIME', isProrated: false });

    expect((await asA('post', '/salary/components', component('GROSS'))).status).toBe(400);
    expect((await asA('post', '/salary/components', component('BASIC'))).status).toBe(409);
    expect((await asA('post', '/salary/components', component('basic_pay'))).status).toBe(400);
    expect((await asA('post', '/salary/components', component('OT2', { calculationType: 'SYSTEM_CALCULATED' }))).status).toBe(400);
    expect((await asA('post', '/salary/components', component('LOAN', { category: 'DEDUCTION' }))).body.message).toBe('Only earnings can be counted in gross pay.');
    expect((await asA('post', '/salary/components', component('CAP', { minAmount: '10', maxAmount: '5' }))).status).toBe(400);
    expect((await asA('post', '/salary/components', component('FLOAT', { minAmount: 10 }))).status).toBe(400);

    const list = await call('get', '/salary/components', viewer.token);
    expect(list.status).toBe(200);
    expect(list.body.data.map((c: { componentCode: string }) => c.componentCode)).toEqual(expect.arrayContaining(['BASIC', 'HRA', 'SPECIAL', 'TRAVEL', 'PF', 'BONUS', 'OT']));
    // Another workspace sees none of them.
    expect((await asB('get', '/salary/components')).body.data).toEqual([]);
  });

  it('previews a structure with explanations, and finds problems before publishing', async () => {
    const preview = await call('post', '/salary/structures/preview', viewer.token, {
      lines: standardLines(), variables: { MONTHLY_SALARY: '50000' }, overrides: { TRAVEL: { amount: '1600' } }, provided: { BONUS: '2000' },
    });
    expect(preview.status).toBe(200);
    expect(preview.body.data.problems).toEqual([]);
    const amounts = Object.fromEntries(preview.body.data.lines.map((l: { code: string; amount: string }) => [l.code, l.amount]));
    expect(amounts).toEqual({ BASIC: '25000', HRA: '10000', SPECIAL: '15000', TRAVEL: '1600', PF: '1800', BONUS: '2000', OT: '0' });
    expect(preview.body.data.totals).toEqual({ gross: '53600.00', earnings: '53600.00', deductions: '1800.00', employerContributions: '0.00', net: '51800.00' });
    const pf = preview.body.data.lines.find((l: { code: string }) => l.code === 'PF');
    expect(pf.steps).toEqual(['min(BASIC (25000), 15000) × 12% = 1800']);

    const cyclic = await asA('post', '/salary/structures/preview', { lines: [line('BASIC', { defaultPercentage: '50', percentageBase: 'HRA' }), line('HRA', { defaultPercentage: '40', percentageBase: 'BASIC' })] });
    expect(cyclic.body.data.problems[0].message).toMatch(/use each other/);
    const unpaid = await asA('post', '/salary/structures/preview', { lines: standardLines(), variables: { MONTHLY_SALARY: '50000', PRORATION: '0.9' }, overrides: { TRAVEL: { amount: '1600' } } });
    expect(unpaid.body.data.lines.find((l: { code: string }) => l.code === 'BASIC').amount).toBe('22500');
    expect((await asA('post', '/salary/structures/preview', { lines: standardLines(), variables: { GROSS: '1' } })).status).toBe(400);
    expect((await asA('post', '/salary/structures/preview', { lines: [line('HRA', { formula: '1' })] })).status).toBe(400);
  });

  it('publishes structure versions that can no longer change', async () => {
    const created = await asA('post', '/salary/structures', { structureCode: 'STD', structureName: 'Standard', effectiveFrom: '2026-01-01', lines: [...standardLines(), line('SPECIAL', { formula: 'NOPE' })].slice(1) });
    expect(created.status).toBe(400); // SPECIAL twice
    const ok = await asA('post', '/salary/structures', { structureCode: 'STD', structureName: 'Standard', effectiveFrom: '2026-01-01', lines: standardLines().map((l) => (l.salaryComponentId === ids.SPECIAL ? { ...l, formula: 'MONTHLY_SALARY - BASIC - NOPE' } : l)) });
    expect(ok.status).toBe(201);
    ids.STD = ok.body.data.id;
    expect(ok.body.data.versions[0]).toMatchObject({ number: 1, status: 'DRAFT' });

    const refused = await asA('post', `/salary/structures/${ids.STD}/draft/publish`);
    expect(refused.status).toBe(400);
    expect(refused.body.errors).toEqual([{ code: 'SPECIAL', message: expect.stringContaining('NOPE, which is not in this structure') }]);

    expect((await asA('put', `/salary/structures/${ids.STD}/draft`, { effectiveFrom: '2026-01-01', lines: standardLines() })).status).toBe(200);
    expect((await call('post', `/salary/structures/${ids.STD}/draft/publish`, viewer.token)).status).toBe(403);
    const published = await asA('post', `/salary/structures/${ids.STD}/draft/publish`);
    expect(published.status).toBe(200);
    expect(published.body.data.versions[0]).toMatchObject({ number: 1, status: 'PUBLISHED', effectiveFrom: '2026-01-01', effectiveTo: null, publishedBy: expect.any(String) });

    // How a used component is calculated is fixed; its name is not.
    const changed = await asA('put', `/salary/components/${ids.BASIC}`, { ...component('BASIC', { calculationType: 'PERCENTAGE', isProrated: false }), componentCode: undefined });
    expect(changed.status).toBe(400);
    expect(changed.body.message).toMatch(/used by a published salary structure/);
    const renamed = await asA('put', `/salary/components/${ids.BASIC}`, { ...component('BASIC', { calculationType: 'PERCENTAGE', componentName: 'Basic pay' }), componentCode: undefined });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data).toMatchObject({ componentName: 'Basic pay', usedInPublished: true });

    // A second version must start after the first, and then closes it.
    expect((await asA('put', `/salary/structures/${ids.STD}/draft`, { effectiveFrom: '2026-01-01', lines: standardLines() })).status).toBe(400);
    expect((await asA('put', `/salary/structures/${ids.STD}/draft`, { effectiveFrom: '2027-04-01', changeNote: 'New HRA', lines: standardLines() })).status).toBe(200);
    const second = await asA('post', `/salary/structures/${ids.STD}/draft/publish`);
    expect(second.status).toBe(200);
    expect(second.body.data.versions.map((v: { number: number; effectiveFrom: string; effectiveTo: string | null }) => [v.number, v.effectiveFrom, v.effectiveTo])).toEqual([[2, '2027-04-01', null], [1, '2026-01-01', '2027-03-31']]);

    const version1 = await prisma.rndtechnosoft_salary_structure_versions.findFirstOrThrow({ where: { tenant_id: a.tenantId, salary_structure_id: ids.STD, version_number: 1 } });
    await refusedByDatabase(prisma.rndtechnosoft_salary_structure_components.updateMany({ where: { salary_structure_version_id: version1.id }, data: { default_percentage: 60 } }), /published salary structure version/);
    await refusedByDatabase(prisma.rndtechnosoft_salary_structure_versions.update({ where: { id: version1.id }, data: { effective_from: new Date('2025-01-01') } }), /published version cannot be changed/);
    await refusedByDatabase(prisma.rndtechnosoft_salary_components.update({ where: { id: ids.HRA }, data: { rounding_scale: 0 } }), /used by a published salary structure/);

    // Another workspace can't see or use the structure.
    expect((await asB('get', `/salary/structures/${ids.STD}`)).status).toBe(404);
    expect((await asB('post', `/salary/structures/${ids.STD}/draft/publish`)).status).toBe(404);
  });

  it('checks payroll policy rules and publishes versions of them', async () => {
    const created = await asA('post', '/payroll/policies', { policyCode: 'STANDARD', policyName: 'Standard', isDefault: true, effectiveFrom: '2026-01-01' });
    expect(created.status).toBe(201);
    ids.POLICY = created.body.data.id;
    expect(created.body.data.versions[0]).toMatchObject({ number: 1, status: 'DRAFT', config: defaultPolicyConfig() });

    const config = { ...defaultPolicyConfig(), divisor: { method: 'FIXED_DAYS', fixedDays: 26 } };
    const bad = await asA('put', `/payroll/policies/${ids.POLICY}/draft`, { effectiveFrom: '2026-01-01', config: { ...config, hoursPerDay: 8, extra: true } });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['policy.extra', 'policy.hoursPerDay']);
    expect((await asA('put', `/payroll/policies/${ids.POLICY}/draft`, { effectiveFrom: '2026-01-01', config, changeNote: '26-day month' })).status).toBe(200);
    const published = await asA('post', `/payroll/policies/${ids.POLICY}/draft/publish`);
    expect(published.status).toBe(200);
    expect(published.body.data.versions[0]).toMatchObject({ status: 'PUBLISHED', config: { divisor: { method: 'FIXED_DAYS', fixedDays: 26 } } });
    const version = await prisma.rndtechnosoft_payroll_policy_versions.findFirstOrThrow({ where: { payroll_policy_id: ids.POLICY } });
    await refusedByDatabase(prisma.rndtechnosoft_payroll_policy_versions.update({ where: { id: version.id }, data: { policy_config: defaultPolicyConfig() as object } }), /published version cannot be changed/);

    // Scopes only take this workspace's departments.
    const departmentB = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: departmentB, tenant_id: b.tenantId, department_code: `D-${SUFFIX}`, department_name: 'Other' } });
    const scopes = { departmentIds: [departmentB], branchIds: [], employmentTypeIds: [], designationIds: [] };
    expect((await asA('put', `/payroll/policies/${ids.POLICY}/scopes`, scopes)).status).toBe(400);
    expect((await asA('post', `/payroll/policies/${ids.POLICY}/archive`)).body.message).toMatch(/default policy/);
    expect((await call('get', '/payroll/policies', viewer.token)).status).toBe(200);
    expect((await call('post', '/payroll/policies', viewer.token, { policyCode: 'X1', policyName: 'X', effectiveFrom: '2026-01-01' })).status).toBe(403);
    expect((await call('get', '/payroll/policies', outsider.token)).status).toBe(403);
    expect((await asB('get', `/payroll/policies/${ids.POLICY}`)).status).toBe(404);
  });

  it('records salary revisions as history, never edits', async () => {
    const missing = await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ componentValues: [] }));
    expect(missing.status).toBe(400);
    expect(missing.body.message).toMatch(/no default for TRAVEL/);
    expect((await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ monthlySalary: null }))).body.message).toBe('Enter the monthly salary.');
    expect((await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ monthlySalary: 50000 }))).status).toBe(400);
    expect((await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ effectiveFrom: '2025-06-01' }))).body.message).toMatch(/no published version in force/);

    const first = await asA('post', `/salary/employees/${ids.E1}/revisions`, revision());
    expect(first.status).toBe(201);
    const salary = first.body.data;
    expect(salary.policy).toMatchObject({ policy: { policyCode: 'STANDARD' }, reason: 'The workspace’s default policy' });
    expect(salary.estimate.problems).toEqual([]);
    expect(Object.fromEntries(salary.estimate.lines.map((l: { code: string; amount: string }) => [l.code, l.amount]))).toMatchObject({ BASIC: '25000', TRAVEL: '1600', PF: '1800' });
    expect(salary.estimate.totals.net).toBe('49800.00');

    const raise = await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ effectiveFrom: '2026-06-01', monthlySalary: '60000', changeReason: 'Promotion' }));
    expect(raise.status).toBe(201);
    expect(raise.body.data.history.map((h: { effectiveFrom: string; effectiveTo: string | null; monthlySalary: string }) => [h.effectiveFrom, h.effectiveTo, h.monthlySalary])).toEqual([
      ['2026-06-01', null, '60000'], ['2026-01-01', '2026-05-31', '50000'],
    ]);
    expect((await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ effectiveFrom: '2026-03-01' }))).status).toBe(409);

    const latest = raise.body.data.history[0].id;
    await refusedByDatabase(prisma.rndtechnosoft_employee_salary_assignments.update({ where: { id: latest }, data: { monthly_gross_target: 1 } }), /cannot be edited/);
    await refusedByDatabase(prisma.rndtechnosoft_employee_salary_component_values.updateMany({ where: { employee_salary_assignment_id: latest }, data: { amount: 1 } }), /cannot be edited/);
    await refusedByDatabase(
      prisma.rndtechnosoft_employee_salary_assignments.update({ where: { id: raise.body.data.history[1].id }, data: { effective_to: null } }),
      /exclusion constraint|ex_employee_salary_assignments_overlap/,
    );

    // Cancelling the latest revision brings back the salary before it.
    expect((await asA('post', `/salary/assignments/${raise.body.data.history[1].id}/cancel`, { reason: 'Entered wrongly' })).body.message).toMatch(/later salary revision/);
    const cancelled = await asA('post', `/salary/assignments/${latest}/cancel`, { reason: 'Promotion postponed' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.history.map((h: { status: string; effectiveTo: string | null }) => [h.status, h.effectiveTo])).toEqual([['CANCELLED', null], ['ACTIVE', null]]);
    expect(cancelled.body.data.history[0]).toMatchObject({ cancellationReason: 'Promotion postponed', cancelledBy: expect.any(String) });

    const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, action_code: { in: ['SALARY_REVISED', 'SALARY_REVISION_CANCELLED'] } } });
    expect(audit).toHaveLength(3);
    // The audit trail says what changed, not the amounts.
    expect(JSON.stringify(audit.map((x) => x.metadata))).not.toMatch(/60000|50000/);
  });

  it('keeps salaries and policies of finalized months unchanged', async () => {
    const period = randomUUID();
    const run = randomUUID();
    await prisma.rndtechnosoft_payroll_periods.create({ data: { id: period, tenant_id: a.tenantId, period_code: `2026-07-${SUFFIX}`, pay_frequency: 'MONTHLY', period_start: new Date('2026-07-01'), period_end: new Date('2026-07-31') } });
    await prisma.rndtechnosoft_payroll_runs.create({ data: { id: run, tenant_id: a.tenantId, payroll_period_id: period, run_number: '1', run_status: 'FINALIZED' } });
    await prisma.rndtechnosoft_payroll_run_employees.create({ data: { id: randomUUID(), tenant_id: a.tenantId, payroll_run_id: run, employee_id: ids.E1 } });

    const locked = await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ effectiveFrom: '2026-07-15', changeReason: 'Late increment' }));
    expect(locked.status).toBe(400);
    expect(locked.body.message).toMatch(/finalized up to 2026-07-31.*2026-08-01.*arrears/);
    expect((await asA('post', `/salary/employees/${ids.E1}/revisions`, revision({ effectiveFrom: '2026-08-01', monthlySalary: '55000', changeReason: 'Increment' }))).status).toBe(201);
    // Another employee wasn't in that payroll, so their salary can still start in July.
    expect((await asA('post', `/salary/employees/${ids.E2}/revisions`, revision({ effectiveFrom: '2026-07-01' }))).status).toBe(201);
    // Workspace rules can't change for a finalized month.
    const draft = await asA('put', `/payroll/policies/${ids.POLICY}/draft`, { effectiveFrom: '2026-07-01', config: defaultPolicyConfig() });
    expect(draft.status).toBe(400);
    expect(draft.body.message).toMatch(/finalized up to 2026-07-31/);
  });

  it('imports salaries from the earlier system’s export, with every row matched by a person', async () => {
    ids.IMP1 = await employee(a.tenantId, 'Imran');
    await prisma.rndtechnosoft_employees.update({ where: { id: ids.IMP1 }, data: { first_name: 'Imran', last_name: 'Khan' } });
    ids.IMP2 = await employee(a.tenantId, 'Hema');
    await prisma.rndtechnosoft_employees.update({ where: { id: ids.IMP2 }, data: { first_name: 'Hema', last_name: 'Rao' } });
    const structures = [{ sourceName: 'Staff', basis: 'MONTHLY' }, { sourceName: 'HOURLY BASE', basis: 'HOURLY' }];
    const rows = [
      { rowNumber: 2, employeeName: 'Imran  Khan', structureName: 'Staff', startDate: '2025-04-01', amount: '20000.00' },
      { rowNumber: 3, employeeName: 'Imran Ahmed Khan', altName: 'Imran Khan', structureName: 'Staff', startDate: '2026-04-01', amount: '24000.00' },
      { rowNumber: 4, employeeName: 'Hema Rao', structureName: 'HOURLY BASE', startDate: '2025-11-07', amount: '125' },
      { rowNumber: 5, employeeName: 'Nobody Here', structureName: 'Staff', startDate: '2025-04-01', amount: '9000' },
    ];
    expect((await call('post', '/salary/imports/preview', viewer.token, { structures, rows })).status).toBe(403);
    const preview = await asA('post', '/salary/imports/preview', { structures, rows });
    expect(preview.status).toBe(200);
    expect(preview.body.data.structures.map((s: { code: string; existing: unknown; effectiveFrom: string }) => [s.code, s.existing, s.effectiveFrom])).toEqual([['STAFF', null, '2025-04-01'], ['HOURLY_BASE', null, '2025-11-07']]);
    expect(preview.body.data.rows.map((r: { suggestedEmployeeId: string | null }) => r.suggestedEmployeeId)).toEqual([ids.IMP1, ids.IMP1, ids.IMP2, null]);
    expect(preview.body.data.rows[3].notes[0]).toMatch(/No employee with this name/);
    expect(preview.body.data.employees.some((e: { id: string }) => e.id === ids.EB)).toBe(false);

    // Another workspace's employee can't be chosen.
    const foreign = await asA('post', '/salary/imports/commit', { structures, rows: [{ ...rows[0], employeeId: ids.EB }] });
    expect(foreign.status).toBe(400);

    const commitRows = [{ ...rows[0], employeeId: ids.IMP1 }, { ...rows[1], employeeId: ids.IMP1 }, { ...rows[2], employeeId: ids.IMP2 }];
    const done = await asA('post', '/salary/imports/commit', { structures, rows: commitRows });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ imported: 3, skipped: 0 });

    const staff = await prisma.rndtechnosoft_salary_structures.findFirstOrThrow({ where: { tenant_id: a.tenantId, salary_structure_code: 'STAFF' } });
    const detail = await asA('get', `/salary/structures/${staff.id}`);
    expect(detail.body.data.versions).toEqual([expect.objectContaining({ number: 1, status: 'PUBLISHED', effectiveFrom: '2025-04-01' })]);
    expect(detail.body.data.versions[0].lines).toEqual([expect.objectContaining({ formula: 'MONTHLY_SALARY', component: expect.objectContaining({ componentCode: 'GROSS_SALARY' }) })]);

    const imran = await asA('get', `/salary/employees/${ids.IMP1}`);
    expect(imran.body.data.history.map((h: { effectiveFrom: string; effectiveTo: string | null; monthlySalary: string; changeReason: string }) => [h.effectiveFrom, h.effectiveTo, h.monthlySalary])).toEqual([
      ['2026-04-01', null, '24000'], ['2025-04-01', '2026-03-31', '20000'],
    ]);
    expect(imran.body.data.estimate.totals.gross).toBe('24000.00');
    const hema = await asA('get', `/salary/employees/${ids.IMP2}`);
    expect(hema.body.data.history[0]).toMatchObject({ payBasis: 'HOURLY', baseRate: '125', monthlySalary: null, structure: { code: 'HOURLY_BASE' } });

    // Running it again changes nothing: the structures are reused and each row is reported as already there.
    const again = await asA('post', '/salary/imports/commit', { structures, rows: commitRows });
    expect(again.body.data).toMatchObject({ imported: 0, skipped: 3 });
    expect(again.body.data.results[0].reason).toMatch(/already recorded/);
    expect(await prisma.rndtechnosoft_salary_structures.count({ where: { tenant_id: a.tenantId, salary_structure_code: { startsWith: 'STAFF' } } })).toBe(1);
    const repeat = await asA('post', '/salary/imports/preview', { structures, rows });
    expect(repeat.body.data.structures[0].existing).toMatchObject({ id: staff.id });
    expect(repeat.body.data.rows[1].notes).toEqual(['This salary looks already imported (one starts on this date).']);
  });

  it('keeps each workspace’s salaries to itself', async () => {
    expect((await asB('get', `/salary/employees/${ids.E1}`)).status).toBe(404);
    expect((await asB('post', `/salary/employees/${ids.E1}/revisions`, revision())).status).toBe(404);
    // B's own employee with A's structure: the structure isn't found in B.
    expect((await asB('post', `/salary/employees/${ids.EB}/revisions`, revision())).status).toBe(404);
    const history = await asA('get', `/salary/employees/${ids.E1}`);
    expect((await asB('post', `/salary/assignments/${history.body.data.history[0].id}/cancel`, { reason: 'Not mine' })).status).toBe(404);
    expect((await call('get', `/salary/employees/${ids.E1}`, outsider.token)).status).toBe(403);
    expect((await call('post', `/salary/employees/${ids.E1}/revisions`, viewer.token, revision())).status).toBe(403);
    expect((await call('get', `/salary/employees/${ids.E1}`, viewer.token)).status).toBe(200);
  });
});
