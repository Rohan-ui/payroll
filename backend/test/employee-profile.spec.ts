import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { sealLegacyAccountNumbers } from '@/common/security/bank-account.util';
import { decryptPlatformSecret } from '@/modules/super-admin/auth/platform-crypto.util';

/**
 * The employee profile: one read of the whole record, and the changes HR makes
 * from it. Job changes and addresses keep their history, nothing reaches into
 * finalized payroll, bank details are masked and shown only to people who may
 * see pay, every change is audited without personal values, and another
 * workspace can neither read nor change any of it.
 */

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Profile-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('Employee profile', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const tenants: Record<'A' | 'B', string> = { A: '', B: '' };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const call = (method: 'get' | 'post' | 'put' | 'delete', url: string, who: string, body?: object) => {
    const r = request(app.getHttpServer())[method](`${API}${url}`).set({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
    return body ? r.send(body) : r;
  };
  const profile = async (who: string, employeeId = ids.Asha) => (await call('get', `/employees/${employeeId}`, who)).body.data;
  const audits = (action: string) => prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: tenants.A, action_code: action }, orderBy: { occurred_at: 'asc' } });

  async function register(key: 'A' | 'B') {
    const email = `prof-owner-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Profile ${key} ${SUFFIX}`, tenantCode: `PRF${key}${SUFFIX.toUpperCase()}`, email, password: PASSWORD, adminName: `Owner ${key}` });
    expect(r.status).toBe(201);
    tenants[key] = r.body.activeTenant.tenantId;
    tenantIds.push(tenants[key]);
    tokens[`Owner${key}`] = r.body.token;
  }

  /** A sign-in in workspace A whose role holds exactly these permissions. */
  async function member(key: string, permissions: string[]) {
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: tenants.A, role_code: `${key}_${SUFFIX}`.toUpperCase(), role_name: key } });
    const rows = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissions } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: rows.map((p) => ({ id: randomUUID(), tenant_id: tenants.A, role_id: roleId, permission_id: p.id })) });
    const email = `prof-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenants.A, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenants.A, tenant_member_id: memberId, role_id: roleId } });
    const r = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD });
    expect(r.status).toBe(200);
    tokens[key] = r.body.token;
  }

  async function employee(tenantId: string, key: string, first: string, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: `${key.toUpperCase()}-${SUFFIX}`, first_name: first, last_name: 'Test', hire_date: date('2024-01-10'), ...extra } });
    ids[key] = id;
    return id;
  }

  async function job(tenantId: string, employeeId: string, from: string, dept: string | null) {
    await prisma.rndtechnosoft_employee_employments.create({
      data: { id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, department_id: dept, joining_date: date('2024-01-10'), effective_from: date(from), employment_status: 'CONFIRMED', notice_period_days: 30 },
    });
  }

  async function department(tenantId: string, key: string, name: string) {
    ids[key] = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: ids[key], tenant_id: tenantId, department_code: `${key}_${SUFFIX}`.toUpperCase(), department_name: name } });
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
    await member('HR', ['people.view', 'people.update', 'leave.view']);
    await member('Viewer', ['people.view']);

    await department(tenants.A, 'ENG', 'Engineering');
    await department(tenants.A, 'SALES', 'Sales');
    await department(tenants.B, 'ENG_B', 'Engineering B');

    await employee(tenants.A, 'Asha', 'Asha', { work_email: `asha-${SUFFIX}@acme.test` });
    await job(tenants.A, ids.Asha, '2024-01-10', ids.ENG);
    await employee(tenants.A, 'Bala', 'Bala');
    await job(tenants.A, ids.Bala, '2024-01-10', ids.ENG);
    await employee(tenants.A, 'Gone', 'Gone', { employee_status: 'EXITED', exit_date: date('2025-06-30') });
    await employee(tenants.B, 'Other', 'Other');
    await job(tenants.B, ids.Other, '2024-01-10', ids.ENG_B);

    await prisma.rndtechnosoft_employee_reporting_lines.create({ data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Bala, manager_employee_id: ids.Asha, effective_from: date('2024-02-01') } });
    await prisma.rndtechnosoft_employee_addresses.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Asha, address_type: 'CURRENT', address_line_1: '1 Old Street', city: 'Pune', country_code: 'IN', is_primary: true, valid_from: date('2024-01-10') },
    });
    await prisma.rndtechnosoft_employee_bank_accounts.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Asha, account_holder_name: 'Asha Test', bank_name: 'HDFC Bank', account_number_encrypted: 'ENC[50100123456789]', account_number_last4: '6789', bank_code_type: 'IFSC', bank_code: 'HDFC0001234', effective_from: date('2024-01-10') },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const userRows = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = userRows.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_leave_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_run_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_runs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_payroll_periods.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_salary_assignments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_salary_structures.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_emergency_contacts.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_addresses.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_bank_accounts.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_reporting_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
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

  it('reads the whole record, with the manager and direct reports, and masks the bank account', async () => {
    const asOwner = await call('get', `/employees/${ids.Asha}`, 'OwnerA');
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toMatchObject({
      employeeCode: `ASHA-${SUFFIX}`,
      personal: { firstName: 'Asha', workEmail: `asha-${SUFFIX}@acme.test`, bloodGroup: null },
      employment: { department: { id: ids.ENG, name: 'Engineering' }, effectiveFrom: '2024-01-10', effectiveTo: null, noticePeriodDays: 30 },
      upcomingEmployment: null,
      addresses: [{ type: 'CURRENT', addressLine1: '1 Old Street', city: 'Pune' }, { type: 'PERMANENT', addressLine1: null }],
      directReports: [{ id: ids.Bala, name: 'Bala Test' }],
      bankAccount: { bankName: 'HDFC Bank', accountNumberLast4: '6789', ifsc: 'HDFC0001234' },
      canSeeBankAccount: true,
    });
    expect(JSON.stringify(asOwner.body)).not.toContain('50100123456789');
    expect((await profile('OwnerA', ids.Bala)).manager).toEqual({ id: ids.Asha, employeeCode: `ASHA-${SUFFIX}`, name: 'Asha Test' });

    // HR without pay permissions sees no bank details at all.
    expect(await profile('HR')).toMatchObject({ bankAccount: null, canSeeBankAccount: false });
  });

  it('hides other workspaces’ employees and refuses malformed ids', async () => {
    expect((await call('get', `/employees/${ids.Other}`, 'OwnerA')).status).toBe(404);
    expect((await call('get', '/employees/not-a-uuid', 'OwnerA')).status).toBe(400);
    expect((await call('put', `/employees/${ids.Other}/personal`, 'OwnerA', { firstName: 'Hijack' })).status).toBe(404);
    expect((await prisma.rndtechnosoft_employees.findFirst({ where: { id: ids.Other } }))?.first_name).toBe('Other');
  });

  it('validates and saves personal details, auditing which fields changed but not their values', async () => {
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { personalEmail: 'not-an-email' })).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { bloodGroup: 'Z+' })).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { salary: '1' })).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { dateOfBirth: day(5) })).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { firstName: '   ' })).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'Viewer', { bloodGroup: 'O+' })).status).toBe(403);

    const saved = await call('put', `/employees/${ids.Asha}/personal`, 'HR', {
      middleName: 'Kiran', dateOfBirth: '1994-05-12', maritalStatus: 'MARRIED', bloodGroup: 'O+', nationalityCountryCode: 'IN',
      personalEmail: `Asha.Personal-${SUFFIX}@Mail.test`, personalMobile: '+91 98000 11111',
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.personal).toMatchObject({
      fullName: 'Asha Kiran Test', dateOfBirth: '1994-05-12', maritalStatus: 'MARRIED', bloodGroup: 'O+', nationalityCountryCode: 'IN',
      personalEmail: `asha.personal-${SUFFIX}@mail.test`, personalMobile: '+91 98000 11111',
    });

    // Clearing an optional field.
    expect((await call('put', `/employees/${ids.Asha}/personal`, 'HR', { middleName: null })).body.data.personal.middleName).toBeNull();

    const audit = await audits('EMPLOYEE_PERSONAL_UPDATED');
    expect(audit.map((a) => a.metadata)).toEqual([
      { fields: ['middleName', 'dateOfBirth', 'maritalStatus', 'bloodGroup', 'nationalityCountryCode', 'personalEmail', 'personalMobile'] },
      { fields: ['middleName'] },
    ]);
    expect(JSON.stringify(audit)).not.toMatch(/1994|98000|asha\.personal/i);
  });

  it('keeps the old address when a new one replaces it, and corrects a same-day entry in place', async () => {
    const address = { addressLine1: '22 New Road', city: 'Mumbai', postalCode: '400001', countryCode: 'IN' };
    expect((await call('put', `/employees/${ids.Asha}/addresses/OFFICE`, 'HR', address)).status).toBe(400);
    expect((await call('put', `/employees/${ids.Asha}/addresses/CURRENT`, 'HR', { ...address, countryCode: 'India' })).status).toBe(400);

    const saved = await call('put', `/employees/${ids.Asha}/addresses/CURRENT`, 'HR', address);
    expect(saved.status).toBe(200);
    expect(saved.body.data.addresses[0]).toMatchObject({ addressLine1: '22 New Road', city: 'Mumbai', validFrom: day(0) });

    await call('put', `/employees/${ids.Asha}/addresses/CURRENT`, 'HR', { ...address, addressLine1: '22A New Road' });
    const rows = await prisma.rndtechnosoft_employee_addresses.findMany({ where: { employee_id: ids.Asha, address_type: 'CURRENT' }, orderBy: { valid_from: 'asc' } });
    expect(rows.map((r) => [r.address_line_1, r.valid_to?.toISOString().slice(0, 10) ?? null])).toEqual([['1 Old Street', day(-1)], ['22A New Road', null]]);
  });

  it('adds, edits and removes emergency contacts with one primary', async () => {
    expect((await call('post', `/employees/${ids.Asha}/emergency-contacts`, 'HR', { contactName: 'Ravi', mobileNumber: 'call me' })).status).toBe(400);
    const first = await call('post', `/employees/${ids.Asha}/emergency-contacts`, 'HR', { contactName: 'Ravi', relationship: 'Brother', mobileNumber: '+91 90000 00001' });
    expect(first.status).toBe(201);
    expect(first.body.data.emergencyContacts).toMatchObject([{ contactName: 'Ravi', isPrimary: true }]);

    const second = await call('post', `/employees/${ids.Asha}/emergency-contacts`, 'HR', { contactName: 'Meera', mobileNumber: '90000 00002', isPrimary: true });
    expect(second.body.data.emergencyContacts.map((c: { contactName: string; isPrimary: boolean }) => [c.contactName, c.isPrimary])).toEqual([['Meera', true], ['Ravi', false]]);

    const ravi = second.body.data.emergencyContacts.find((c: { contactName: string }) => c.contactName === 'Ravi');
    const edited = await call('put', `/employees/${ids.Asha}/emergency-contacts/${ravi.id}`, 'HR', { contactName: 'Ravi K', mobileNumber: '+91 90000 00001' });
    expect(edited.body.data.emergencyContacts.find((c: { id: string }) => c.id === ravi.id)).toMatchObject({ contactName: 'Ravi K', isPrimary: false });

    // Another employee's id in the path cannot reach this contact.
    expect((await call('delete', `/employees/${ids.Bala}/emergency-contacts/${ravi.id}`, 'HR')).status).toBe(404);
    const removed = await call('delete', `/employees/${ids.Asha}/emergency-contacts/${ravi.id}`, 'HR');
    expect(removed.body.data.emergencyContacts.map((c: { contactName: string }) => c.contactName)).toEqual(['Meera']);
  });

  it('records a job change from a date, ending the old record the day before', async () => {
    const changed = await call('post', `/employees/${ids.Asha}/employment-changes`, 'HR', { effectiveFrom: day(0), departmentId: ids.SALES, noticePeriodDays: 60, reason: 'Moved to sales' });
    expect(changed.status).toBe(201);
    expect(changed.body.data.employment).toMatchObject({ department: { name: 'Sales' }, effectiveFrom: day(0), noticePeriodDays: 60, joiningDate: '2024-01-10' });
    expect(changed.body.data.employmentHistory.map((h: { effectiveFrom: string; effectiveTo: string | null }) => [h.effectiveFrom, h.effectiveTo])).toEqual([[day(0), null], ['2024-01-10', day(-1)]]);

    const directory = await call('get', `/employees?search=ASHA-${SUFFIX}`, 'HR');
    expect(directory.body.items[0].currentEmployment.department).toBe('Sales');

    const audit = await audits('EMPLOYEE_EMPLOYMENT_CHANGED');
    expect(audit[0].metadata).toEqual({
      effective_from: day(0), reason: 'Moved to sales',
      changes: [{ field: 'Department', from: 'Engineering', to: 'Sales' }, { field: 'Notice period', from: '30 days', to: '60 days' }],
    });
  });

  it('shows a future job change as upcoming without changing today’s record', async () => {
    const future = await call('post', `/employees/${ids.Asha}/employment-changes`, 'HR', { effectiveFrom: day(30), departmentId: ids.ENG, reason: 'Back to engineering' });
    expect(future.status).toBe(201);
    expect(future.body.data.employment.department.name).toBe('Sales');
    expect(future.body.data.upcomingEmployment).toMatchObject({ department: { name: 'Engineering' }, effectiveFrom: day(30) });
    expect((await call('get', `/employees?search=ASHA-${SUFFIX}`, 'HR')).body.items[0].currentEmployment.department).toBe('Sales');
  });

  it('refuses job changes that overlap, change nothing, point elsewhere or reach finalized payroll', async () => {
    const before = await prisma.rndtechnosoft_employee_employments.count({ where: { employee_id: ids.Bala } });
    expect((await call('post', `/employees/${ids.Bala}/employment-changes`, 'HR', { effectiveFrom: '2024-01-10', departmentId: ids.SALES, reason: 'Same day' })).body.message).toMatch(/must start after/);
    expect((await call('post', `/employees/${ids.Bala}/employment-changes`, 'HR', { effectiveFrom: day(0), departmentId: ids.ENG, reason: 'No-op' })).body.message).toMatch(/Nothing changes/);
    expect((await call('post', `/employees/${ids.Bala}/employment-changes`, 'HR', { effectiveFrom: day(0), departmentId: ids.ENG_B, reason: 'Other workspace' })).status).toBe(400);
    expect((await call('post', `/employees/${ids.Bala}/employment-changes`, 'HR', { effectiveFrom: day(0), departmentId: ids.SALES })).status).toBe(400);
    expect((await call('post', `/employees/${ids.Bala}/employment-changes`, 'Viewer', { effectiveFrom: day(0), departmentId: ids.SALES, reason: 'Viewer' })).status).toBe(403);
    expect((await call('post', `/employees/${ids.Gone}/employment-changes`, 'HR', { effectiveFrom: day(0), departmentId: ids.SALES, reason: 'Exited' })).status).toBe(400);

    const period = randomUUID();
    const run = randomUUID();
    await prisma.rndtechnosoft_payroll_periods.create({ data: { id: period, tenant_id: tenants.A, period_code: `PRF-${SUFFIX}`, pay_frequency: 'MONTHLY', period_start: date(day(-40)), period_end: date(day(-10)) } });
    await prisma.rndtechnosoft_payroll_runs.create({ data: { id: run, tenant_id: tenants.A, payroll_period_id: period, run_number: '1', run_status: 'FINALIZED' } });
    await prisma.rndtechnosoft_payroll_run_employees.create({ data: { id: randomUUID(), tenant_id: tenants.A, payroll_run_id: run, employee_id: ids.Bala } });
    const locked = await call('post', `/employees/${ids.Bala}/employment-changes`, 'HR', { effectiveFrom: day(-20), departmentId: ids.SALES, reason: 'Back-dated' });
    expect(locked.status).toBe(400);
    expect(locked.body.message).toMatch(new RegExp(`finalized up to ${day(-10)}`));

    expect(await prisma.rndtechnosoft_employee_employments.count({ where: { employee_id: ids.Bala } })).toBe(before);
  });

  it('changes employment status with a reason, never to or from Exited', async () => {
    expect((await call('post', `/employees/${ids.Bala}/status`, 'HR', { status: 'EXITED', reason: 'Left' })).status).toBe(400);
    expect((await call('post', `/employees/${ids.Bala}/status`, 'HR', { status: 'ON_NOTICE' })).status).toBe(400);
    const changed = await call('post', `/employees/${ids.Bala}/status`, 'HR', { status: 'ON_NOTICE', reason: 'Resigned, serving notice' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.employeeStatus).toBe('ON_NOTICE');
    expect((await call('post', `/employees/${ids.Bala}/status`, 'HR', { status: 'ON_NOTICE', reason: 'Again' })).status).toBe(409);
    expect((await call('post', `/employees/${ids.Gone}/status`, 'HR', { status: 'ACTIVE', reason: 'Rehire' })).body.message).toMatch(/Offboarding/);
  });

  it('replaces the bank account from a date, needing its own permission and keeping the old one', async () => {
    const account = { accountHolderName: 'Asha Test', bankName: 'ICICI Bank', accountNumber: '000401234567', bankCode: 'ICIC0000004', effectiveFrom: day(0) };
    expect((await call('post', `/employees/${ids.Asha}/bank-account`, 'HR', account)).status).toBe(403);
    expect((await call('post', `/employees/${ids.Asha}/bank-account`, 'OwnerA', { ...account, bankCode: 'ICICI4' })).status).toBe(400);
    const replaced = await call('post', `/employees/${ids.Asha}/bank-account`, 'OwnerA', account);
    expect(replaced.status).toBe(201);
    expect(replaced.body.data.bankAccount).toMatchObject({ bankName: 'ICICI Bank', accountNumberLast4: '4567', effectiveFrom: day(0) });
    expect(JSON.stringify(replaced.body)).not.toContain('000401234567');

    const rows = await prisma.rndtechnosoft_employee_bank_accounts.findMany({ where: { employee_id: ids.Asha }, orderBy: { effective_from: 'asc' } });
    expect(rows.map((r) => [r.account_number_last4, r.effective_to?.toISOString().slice(0, 10) ?? null])).toEqual([['6789', day(-1)], ['4567', null]]);
    // The new number is encrypted at rest, never stored readable.
    expect(rows[1].account_number_encrypted.startsWith('v1.')).toBe(true);
    expect(rows[1].account_number_encrypted).not.toContain('000401234567');
    expect(decryptPlatformSecret(rows[1].account_number_encrypted)).toBe('000401234567');

    // The older row, stored the old way, is sealed by the backfill: a dry run changes nothing, then it is encrypted once.
    const scope = { tenant_id: tenants.A };
    expect(await sealLegacyAccountNumbers(prisma, false, scope)).toEqual({ found: 1, sealed: 1, unreadable: 0 });
    expect((await prisma.rndtechnosoft_employee_bank_accounts.findFirstOrThrow({ where: { id: rows[0].id } })).account_number_encrypted).toBe('ENC[50100123456789]');
    expect(await sealLegacyAccountNumbers(prisma, true, scope)).toEqual({ found: 1, sealed: 1, unreadable: 0 });
    const sealed = await prisma.rndtechnosoft_employee_bank_accounts.findFirstOrThrow({ where: { id: rows[0].id } });
    expect(decryptPlatformSecret(sealed.account_number_encrypted)).toBe('50100123456789');
    expect(sealed.account_number_last4).toBe('6789');
    expect(await sealLegacyAccountNumbers(prisma, true, scope)).toEqual({ found: 0, sealed: 0, unreadable: 0 });
    expect(JSON.stringify((await audits('EMPLOYEE_BANK_ACCOUNT_REPLACED')).map((a) => a.metadata))).not.toContain('000401234567');
  });

  it('tells the employee’s story newest first, in plain words, with who did it', async () => {
    const structure = randomUUID();
    const assignment = randomUUID();
    await prisma.rndtechnosoft_salary_structures.create({ data: { id: structure, tenant_id: tenants.A, salary_structure_code: `PRF_${SUFFIX}`.toUpperCase(), salary_structure_name: 'Profile test' } });
    await prisma.rndtechnosoft_employee_salary_assignments.create({ data: { id: assignment, tenant_id: tenants.A, employee_id: ids.Asha, salary_structure_id: structure, currency_code: 'INR', effective_from: date('2024-01-10') } });
    await prisma.rndtechnosoft_audit_logs.create({ data: { id: randomUUID(), tenant_id: tenants.A, action_code: 'SALARY_REVISED', entity_type: 'SALARY_ASSIGNMENT', entity_id: assignment, metadata: { monthly: '90000' } } });

    const asOwner = await call('get', `/employees/${ids.Asha}/activity`, 'OwnerA');
    expect(asOwner.status).toBe(200);
    const labels = asOwner.body.data.items.map((i: { label: string }) => i.label);
    expect(labels).toEqual(expect.arrayContaining(['Salary revision recorded', 'Bank account changed', 'Job changed', 'Address updated', 'Personal details updated', 'Emergency contact added']));
    const job = asOwner.body.data.items.find((i: { label: string; detail: string }) => i.label === 'Job changed' && i.detail.includes('Moved to sales'));
    expect(job).toMatchObject({ actor: 'HR', detail: `From ${day(0)} · Department: Engineering → Sales · Notice period: 30 days → 60 days · Reason: Moved to sales` });
    // Raw audit values (such as salary amounts) never come back.
    expect(JSON.stringify(asOwner.body)).not.toMatch(/90000|asha\.personal|98000/);

    const asHr = await call('get', `/employees/${ids.Asha}/activity`, 'HR');
    expect(asHr.body.data.items.map((i: { label: string }) => i.label)).not.toContain('Salary revision recorded');

    const first = await call('get', `/employees/${ids.Asha}/activity?limit=2`, 'OwnerA');
    expect(first.body.data.items).toHaveLength(2);
    expect(first.body.data.next).toEqual(first.body.data.items[1].at);
    const second = await call('get', `/employees/${ids.Asha}/activity?limit=2&before=${encodeURIComponent(first.body.data.next)}`, 'OwnerA');
    expect(second.body.data.items[0].at < first.body.data.items[1].at).toBe(true);

    expect((await call('get', `/employees/${ids.Other}/activity`, 'OwnerA')).status).toBe(404);
  });

  it('lists an employee’s leave requests from the leave module, with days as exact decimals', async () => {
    const type = randomUUID();
    await prisma.rndtechnosoft_leave_types.create({ data: { id: type, tenant_id: tenants.A, leave_type_code: `CL_${SUFFIX}`, leave_type_name: 'Casual leave' } });
    await prisma.rndtechnosoft_leave_requests.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Asha, leave_type_id: type, request_number: `LR-${SUFFIX}`, start_date: date('2026-03-02'), end_date: date('2026-03-03'), requested_days: '1.5', request_status: 'PENDING' },
    });
    const list = await call('get', `/leave/employees/${ids.Asha}/requests`, 'HR');
    expect(list.status).toBe(200);
    expect(list.body.data).toMatchObject({ pendingCount: 1, items: [{ leaveType: 'Casual leave', days: '1.5', status: 'PENDING', startDate: '2026-03-02' }], pagination: { total: 1 } });
    expect((await call('get', `/leave/employees/${ids.Asha}/requests?status=APPROVED`, 'HR')).body.data.items).toEqual([]);
    expect((await call('get', `/leave/employees/${ids.Other}/requests`, 'HR')).status).toBe(404);
    expect((await call('get', `/leave/employees/${ids.Asha}/requests`, 'Viewer')).status).toBe(403);
  });
});
