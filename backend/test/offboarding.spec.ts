import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OffboardingNotificationsService } from '@/modules/offboarding/offboarding-notifications.service';
import { jest } from '@jest/globals';

/**
 * Offboarding: an employee resigns from their own sign-in and only ever sees
 * their own exit; HR accepts it, clears the checklist and completes it, which
 * sets the exit date, marks the employee exited, ends their sign-in and takes
 * them out of later payroll. Nobody approves or completes their own exit, and
 * another workspace sees none of it.
 */

// Each test walks a whole exit through 15 to 20 requests, each many database
// round trips; against a remote development database that runs past the
// default 30 seconds without anything being wrong.
jest.setTimeout(120_000);

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Offboarding-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const HR_PERMISSIONS = ['offboarding.my.view', 'offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete'];

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
const nextMonth = (() => { const d = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 7); })();

describe('Offboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const tenants: Record<'A' | 'B', string> = { A: '', B: '' };
  const tokens: Record<string, string> = {};
  const users: Record<string, string> = {};
  const employees: Record<string, string> = {};

  const server = () => app.getHttpServer();
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const get = (url: string, who: string) => request(server()).get(`${API}${url}`).set(as(who));
  const post = (url: string, who: string, body: object = {}) => request(server()).post(`${API}${url}`).set(as(who)).send(body);
  const put = (url: string, who: string, body: object) => request(server()).put(`${API}${url}`).set(as(who)).send(body);

  async function register(key: 'A' | 'B') {
    const email = `offb-owner-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(server()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Offboarding ${key} ${SUFFIX}`, tenantCode: `OFB${key}${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    tenants[key] = r.body.activeTenant.tenantId;
    tenantIds.push(tenants[key]);
    tokens[`Owner${key}`] = r.body.token;
    users[`Owner${key}`] = r.body.user?.id ?? (await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { email } })).id;
  }

  async function role(tenantId: string, code: string, permissions: string[]) {
    const id = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id, tenant_id: tenantId, role_code: `${code}_${SUFFIX.toUpperCase()}`, role_name: code, is_system_role: false } });
    const rows = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissions } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: rows.map((p) => ({ id: randomUUID(), tenant_id: tenantId, role_id: id, permission_id: p.id })) });
    return id;
  }

  /** A sign-in in the workspace with the role, optionally with an employee record linked to it. */
  async function person(key: string, tenantId: string, roleId: string, withEmployee = true) {
    const email = `offb-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId } });
    users[key] = userId;
    if (withEmployee) employees[key] = await employee(key, tenantId, userId);
    const r = await request(server()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD, tenantId });
    expect(r.status).toBe(200);
    tokens[key] = r.body.token;
  }

  async function employee(key: string, tenantId: string, userId: string | null) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: `${key.toUpperCase()}-${SUFFIX}`, first_name: key, user_id: userId, hire_date: new Date('2025-01-01') } });
    return id;
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
    await register('A');
    await register('B');

    const staffA = await role(tenants.A, 'STAFF', ['offboarding.my.view']);
    const hrA = await role(tenants.A, 'HR', HR_PERMISSIONS);
    const hrB = await role(tenants.B, 'HR', HR_PERMISSIONS);
    await person('Sneha', tenants.A, staffA);
    await person('Priya', tenants.A, hrA);
    await person('Lone', tenants.A, staffA, false);
    await person('Bharat', tenants.B, hrB);
    // The owner is an employee too, with more access than HR.
    employees.OwnerA = await employee('OwnerA', tenants.A, users.OwnerA);

    // A salary, so the payroll check below covers the "anyone with a salary" path.
    const structureId = randomUUID();
    await prisma.rndtechnosoft_salary_structures.create({ data: { id: structureId, tenant_id: tenants.A, salary_structure_code: `OFB_${SUFFIX.toUpperCase()}`, salary_structure_name: 'Offboarding test' } });
    await prisma.rndtechnosoft_employee_salary_assignments.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: employees.Sneha, salary_structure_id: structureId, currency_code: 'INR', effective_from: new Date('2025-01-01') },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const userRows = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = userRows.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_separation_clearance_items.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_date_changes.deleteMany({ where: scope });
      await app.get(OffboardingNotificationsService).flush();
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_comments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_separations.deleteMany({ where: scope });
      await prisma.rndtechnosoft_loan_installments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_loans.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_cosec_mappings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_reporting_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structures.deleteMany({ where: scope });
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
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
    await app?.close();
  });

  let separationId = '';

  it('lets an employee resign, see only their own exit, and withdraw it before HR accepts', async () => {
    expect((await post('/offboarding/my/resignation', 'Sneha', { reason: 'Higher studies', lastWorkingDate: shift(today, -1) })).status).toBe(400);
    const first = await post('/offboarding/my/resignation', 'Sneha', { reason: 'Higher studies', lastWorkingDate: shift(today, 30) });
    expect(first.status).toBe(201);
    expect(first.body.data.current).toMatchObject({ status: 'PENDING_APPROVAL', type: 'RESIGNATION', lastWorkingDate: shift(today, 30) });
    expect((await post('/offboarding/my/resignation', 'Sneha', { reason: 'Again', lastWorkingDate: shift(today, 30) })).status).toBe(409);

    // Nothing of HR's: no list, no one else's exit, no employee id to pass.
    expect((await get('/offboarding/separations', 'Sneha')).status).toBe(403);
    expect((await get(`/offboarding/separations/${first.body.data.current.id}`, 'Sneha')).status).toBe(403);
    expect((await post(`/offboarding/separations/${first.body.data.current.id}/approve`, 'Sneha', { lastWorkingDate: today })).status).toBe(403);
    expect((await get(`/offboarding/my?employeeId=${employees.Priya}`, 'Sneha')).body.data.employee.id).toBe(employees.Sneha);

    const withdrawn = await post('/offboarding/my/resignation/withdraw', 'Sneha', { reason: 'Changed my mind' });
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.data.current).toBeNull();
    expect(withdrawn.body.data.past[0]).toMatchObject({ status: 'WITHDRAWN' });

    const again = await post('/offboarding/my/resignation', 'Sneha', { reason: 'Higher studies abroad', lastWorkingDate: shift(today, 30) });
    expect(again.status).toBe(201);
    separationId = again.body.data.current.id;
    expect((await get('/offboarding/my', 'Lone')).body.data).toEqual({ linked: false });
  });

  it('shows nothing to another workspace', async () => {
    expect((await get(`/offboarding/separations/${separationId}`, 'Bharat')).status).toBe(404);
    expect((await post(`/offboarding/separations/${separationId}/approve`, 'Bharat', { lastWorkingDate: today })).status).toBe(404);
    expect((await get('/offboarding/separations', 'Bharat')).body.data).toEqual([]);
    expect((await post('/offboarding/separations', 'Bharat', { employeeId: employees.Sneha, type: 'TERMINATION', reason: 'Test', noticeDate: today, lastWorkingDate: today })).status).toBe(404);
  });

  it('never lets someone act on their own exit', async () => {
    const own = await post('/offboarding/my/resignation', 'Priya', { reason: 'Relocating', lastWorkingDate: shift(today, 10) });
    expect(own.status).toBe(201);
    const ownId = own.body.data.current.id;
    expect((await post(`/offboarding/separations/${ownId}/approve`, 'Priya', { lastWorkingDate: shift(today, 10) })).status).toBe(403);
    expect((await post(`/offboarding/separations/${ownId}/cancel`, 'Priya', { reason: 'Never mind' })).status).toBe(403);
    expect((await post('/offboarding/my/resignation/withdraw', 'Priya')).status).toBe(200);
  });

  it('lets HR accept, clear the checklist and complete the exit, which ends the sign-in and later payroll', async () => {
    const list = await get('/offboarding/separations?status=PENDING_APPROVAL', 'Priya');
    expect(list.body.data.map((s: { id: string }) => s.id)).toEqual([separationId]);

    const accepted = await post(`/offboarding/separations/${separationId}/approve`, 'Priya', { lastWorkingDate: shift(today, 20) });
    expect(accepted.status).toBe(200);
    expect(accepted.body.data).toMatchObject({ status: 'IN_PROGRESS', lastWorkingDate: shift(today, 20), hasSignIn: true });
    expect(accepted.body.data.checklist).toHaveLength(6);
    expect(accepted.body.data.blockers.length).toBe(2);
    expect((await post('/offboarding/my/resignation/withdraw', 'Sneha')).status).toBe(400);

    // The employee sees their checklist, never HR's notes.
    await put(`/offboarding/separations/${separationId}/exit-interview`, 'Priya', { interviewDate: today, notes: 'Private notes', rehireEligible: false });
    const mine = await get('/offboarding/my', 'Sneha');
    expect(JSON.stringify(mine.body.data)).not.toContain('Private notes');
    expect(mine.body.data.current.checklist).toHaveLength(6);

    expect((await post(`/offboarding/separations/${separationId}/complete`, 'Priya')).status).toBe(400);
    expect((await put(`/offboarding/separations/${separationId}/last-working-date`, 'Priya', { lastWorkingDate: today })).status).toBe(200);
    const [first, ...rest] = accepted.body.data.checklist as { id: string }[];
    expect((await put(`/offboarding/separations/${separationId}/checklist/${first.id}`, 'Priya', { status: 'WAIVED' })).status).toBe(400);
    expect((await put(`/offboarding/separations/${separationId}/checklist/${first.id}`, 'Priya', { status: 'WAIVED', waiverReason: 'Remote employee, nothing to hand over' })).status).toBe(200);
    for (const item of rest) {
      expect((await put(`/offboarding/separations/${separationId}/checklist/${item.id}`, 'Priya', { status: 'CLEARED' })).status).toBe(200);
    }

    const completed = await post(`/offboarding/separations/${separationId}/complete`, 'Priya');
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({ status: 'COMPLETED', hasSignIn: false });
    const row = await prisma.rndtechnosoft_employees.findUniqueOrThrow({ where: { id: employees.Sneha } });
    expect(row.employee_status).toBe('EXITED');
    expect(row.exit_date?.toISOString().slice(0, 10)).toBe(today);
    const salary = await prisma.rndtechnosoft_employee_salary_assignments.findFirstOrThrow({ where: { employee_id: employees.Sneha } });
    expect([salary.assignment_status, salary.effective_to?.toISOString().slice(0, 10)]).toEqual(['ACTIVE', today]);
    expect((await get('/offboarding/my', 'Sneha')).status).toBe(401);

    const payable = async (month: string) => (await get(`/payroll/calculation/employees?month=${month}`, 'OwnerA')).body.data.map((e: { id: string }) => e.id);
    expect(await payable(today.slice(0, 7))).toContain(employees.Sneha);
    expect(await payable(nextMonth)).not.toContain(employees.Sneha);
  });

  it('refuses to end the sign-in of someone with more access than HR', async () => {
    const started = await post('/offboarding/separations', 'Priya', { employeeId: employees.OwnerA, type: 'TERMINATION', reason: 'Test of access', noticeDate: today, lastWorkingDate: today });
    expect(started.status).toBe(201);
    for (const item of started.body.data.checklist as { id: string }[]) {
      await put(`/offboarding/separations/${started.body.data.id}/checklist/${item.id}`, 'Priya', { status: 'CLEARED' });
    }
    expect((await post(`/offboarding/separations/${started.body.data.id}/complete`, 'Priya')).status).toBe(403);
    const cancelled = await post(`/offboarding/separations/${started.body.data.id}/cancel`, 'Priya', { reason: 'Started by mistake' });
    expect(cancelled.body.data).toMatchObject({ status: 'CANCELLED', closeReason: 'Started by mistake' });
  });

  it('closes the leaver’s records, after their team is reassigned, notice decided and loans dealt with', async () => {
    const A = tenants.A;
    const leaver = await employee('Leaver', A, null);
    const report = await employee('Report', A, null);
    const boss = await employee('Boss', A, null);
    const since = new Date('2025-01-01');
    await prisma.rndtechnosoft_employee_employments.create({ data: { id: randomUUID(), tenant_id: A, employee_id: leaver, joining_date: since, effective_from: since, employment_status: 'CONFIRMED', notice_period_days: 30 } });
    await prisma.rndtechnosoft_employee_reporting_lines.createMany({ data: [
      { id: randomUUID(), tenant_id: A, employee_id: report, manager_employee_id: leaver, relationship_type: 'PRIMARY', effective_from: since },
      { id: randomUUID(), tenant_id: A, employee_id: leaver, manager_employee_id: employees.OwnerA, relationship_type: 'PRIMARY', effective_from: since },
    ] });
    await prisma.rndtechnosoft_employee_cosec_mappings.create({ data: { id: randomUUID(), tenant_id: A, employee_id: leaver, cosec_employee_id: `C${SUFFIX}`, mapping_status: 'MAPPED', mapping_source: 'MANUAL', verification_status: 'VERIFIED' } });
    const loanId = randomUUID();
    await prisma.rndtechnosoft_employee_loans.create({ data: { id: loanId, tenant_id: A, employee_id: leaver, loan_number: `L-${SUFFIX}`, loan_type: 'LOAN', principal_amount: '10000', total_repayable_amount: '10000', installment_amount: '5000', start_date: since } });
    await prisma.rndtechnosoft_loan_installments.createMany({ data: [10, 40].map((d, n) => ({ id: randomUUID(), tenant_id: A, employee_loan_id: loanId, installment_number: n + 1, due_date: new Date(`${shift(today, d)}T00:00:00Z`), principal_amount: '5000', total_amount: '5000' })) });

    const started = await post('/offboarding/separations', 'Priya', { employeeId: leaver, type: 'TERMINATION', reason: 'Role closed', noticeDate: shift(today, -10), lastWorkingDate: shift(today, -1) });
    expect(started.status).toBe(201);
    const id = started.body.data.id as string;

    // The day changes, with its reason kept.
    const moved = await put(`/offboarding/separations/${id}/last-working-date`, 'Priya', { lastWorkingDate: today, reason: 'Handover needs one more day' });
    expect(moved.body.data.dateChanges).toEqual([expect.objectContaining({ from: shift(today, -1), to: today, reason: 'Handover needs one more day' })]);
    const exit = moved.body.data;
    expect(exit.notice).toMatchObject({ requiredDays: 30, servedDays: 10, shortfallDays: 20, contractualLastDay: shift(today, 20), decision: null });
    expect(exit.obligations).toMatchObject({ outstanding: '10000.00', loans: [expect.objectContaining({ outstanding: '10000.00', dueAfterLastDay: '10000.00', installmentsAfterLastDay: 2 })] });
    expect(exit.directReports.map((r: { id: string }) => r.id)).toEqual([report]);
    expect(exit.blockers.join(' ')).toMatch(/still report.*notice shortfall.*not settled/s);

    // Notice: a waiver needs a reason; recovering does not.
    expect((await put(`/offboarding/separations/${id}/notice-decision`, 'Priya', { decision: 'WAIVE' })).status).toBe(400);
    expect((await put(`/offboarding/separations/${id}/notice-decision`, 'Priya', { decision: 'RECOVER' })).body.data.notice).toMatchObject({ decision: 'RECOVER' });

    // Finance can't be cleared over an open loan; a waiver with its reason is the recorded exception.
    const items = exit.checklist as { id: string; team: string }[];
    const finance = items.find((i) => i.team === 'FINANCE')!;
    expect((await put(`/offboarding/separations/${id}/checklist/${finance.id}`, 'Priya', { status: 'CLEARED' })).status).toBe(400);
    expect((await put(`/offboarding/separations/${id}/checklist/${finance.id}`, 'Priya', { status: 'WAIVED', waiverReason: 'Recovered from the final settlement' })).status).toBe(200);

    // Reassigning the team needs People access too.
    expect((await post(`/offboarding/separations/${id}/reassign-reports`, 'Priya', { managerEmployeeId: boss })).status).toBe(403);
    const reassigned = await post(`/offboarding/separations/${id}/reassign-reports`, 'OwnerA', { managerEmployeeId: boss });
    expect(reassigned.status).toBe(200);
    expect(reassigned.body.failed).toEqual([]);
    expect(reassigned.body.data.directReports).toEqual([]);

    for (const item of items.filter((i) => i.id !== finance.id)) {
      expect((await put(`/offboarding/separations/${id}/checklist/${item.id}`, 'Priya', { status: 'CLEARED' })).status).toBe(200);
    }
    const done = await post(`/offboarding/separations/${id}/complete`, 'Priya');
    expect(done.status).toBe(200);

    const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    const employment = await prisma.rndtechnosoft_employee_employments.findFirstOrThrow({ where: { employee_id: leaver } });
    expect([day(employment.effective_to), day(employment.termination_date)]).toEqual([today, today]);
    const ownLine = await prisma.rndtechnosoft_employee_reporting_lines.findFirstOrThrow({ where: { employee_id: leaver } });
    expect([ownLine.line_status, day(ownLine.effective_to)]).toEqual(['ACTIVE', today]);
    const reportLines = await prisma.rndtechnosoft_employee_reporting_lines.findMany({ where: { employee_id: report }, orderBy: { effective_from: 'asc' } });
    expect(reportLines.map((l) => [l.manager_employee_id, day(l.effective_from), day(l.effective_to)])).toEqual([[leaver, '2025-01-01', today], [boss, shift(today, 1), null]]);
    expect((await prisma.rndtechnosoft_employee_cosec_mappings.findFirstOrThrow({ where: { employee_id: leaver } })).mapping_status).toBe('DEACTIVATED');
    // History stays: the loan is untouched, waiting for the final settlement.
    expect((await prisma.rndtechnosoft_employee_loans.findUniqueOrThrow({ where: { id: loanId } })).loan_status).toBe('ACTIVE');

    // Nothing new can start after they left.
    const structure = await prisma.rndtechnosoft_salary_structures.findFirstOrThrow({ where: { tenant_id: A } });
    const revision = await post(`/salary/employees/${leaver}/revisions`, 'OwnerA', { salaryStructureId: structure.id, effectiveFrom: shift(today, 1), payBasis: 'MONTHLY', monthlySalary: '50000', currencyCode: 'INR', isOvertimeEligible: false, paymentMethod: 'BANK_TRANSFER', changeReason: 'Increment', componentValues: [] });
    expect(revision.status).toBe(400);
    expect(revision.body.message).toContain('left on');
  });
});
