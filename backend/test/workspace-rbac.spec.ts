import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import {
  ADMIN_ROLE_CODE,
  NAVIGATION,
  PERMISSION_KEYS,
} from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';

/**
 * Role-based access across every sidebar module, in one fresh workspace.
 *
 * Each role holds only the permission rows it is given. The rules checked
 * here: the API refuses what a role does not grant, the sidebar a member gets
 * matches exactly what they may open, switched-off modules are refused even to
 * the owner, and nobody can hand out access they do not hold.
 */

const API = '/api/v1';
const PASSWORD = 'Workspace-Rbac-Suite-Password-1';

interface Actor {
  email: string;
  userId: string;
  memberId: string;
  token: string;
}

describe('Workspace role-based access control', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantId: string;
  const userEmails: string[] = [];

  let owner: Actor;
  let sales: Actor;
  let hr: Actor;
  let employee: Actor;
  let roleLead: Actor;
  let clerk: Actor;
  let salesRoleId: string;

  const api = () => request(app.getHttpServer());
  const as = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  async function createRole(code: string, extra: readonly string[] = [], isSystem = false) {
    const role = await prisma.rndtechnosoft_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, role_code: code, role_name: code, is_system_role: isSystem, role_status: 'ACTIVE' },
    });
    await grantDefaultRolePermissions(prisma, tenantId, role.id, code);
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: [...extra] } } });
    await prisma.rndtechnosoft_role_permissions.createMany({
      data: permissions.map((p) => ({ id: randomUUID(), tenant_id: tenantId, role_id: role.id, permission_id: p.id })),
      skipDuplicates: true,
    });
    return role.id;
  }

  async function seedMember(roleId: string, label: string): Promise<Actor> {
    const email = `rbac-${label}-${randomUUID()}@rbac.test`;
    userEmails.push(email);
    const user = await prisma.rndtechnosoft_users.create({
      data: {
        id: randomUUID(),
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `RBAC ${label}`,
        user_status: 'ACTIVE',
      },
    });
    const member = await prisma.rndtechnosoft_tenant_members.create({
      data: { id: randomUUID(), tenant_id: tenantId, user_id: user.id, membership_status: 'ACTIVE', joined_at: new Date() },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: member.id, role_id: roleId },
    });
    const login = await api().post(`${API}/auth/login`).send({ email, password: PASSWORD });
    expect(login.status).toBe(200);
    return { email, userId: user.id, memberId: member.id, token: login.body.token };
  }

  async function navigationOf(actor: Actor): Promise<string[]> {
    const me = await api().get(`${API}/auth/me`).set(as(actor));
    return me.body.access.navigation.map((entry: { id: string }) => entry.id);
  }

  async function statuses(actor: Actor, calls: [string, string, object?][]) {
    const results: [string, number][] = [];
    for (const [method, path, body] of calls) {
      const req = (api() as unknown as Record<string, (url: string) => request.Test>)[method](`${API}${path}`).set(as(actor));
      const res = body ? await req.send(body) : await req;
      results.push([`${method.toUpperCase()} ${path}`, res.status]);
    }
    return results;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    tenantId = randomUUID();
    await prisma.rndtechnosoft_tenants.create({
      data: {
        id: tenantId,
        tenant_code: `RBAC${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`,
        legal_name: 'RBAC Suite Workspace Pvt Ltd',
        display_name: 'RBAC Suite Workspace',
        default_currency_code: 'INR',
        tenant_status: 'ACTIVE',
      },
    });
    await prisma.rndtechnosoft_tenant_settings.create({ data: { id: randomUUID(), tenant_id: tenantId, settings: {} } });

    owner = await seedMember(await createRole(ADMIN_ROLE_CODE, [], true), 'owner');
    salesRoleId = await createRole('SALES_TEAM', [
      'pipelines.view',
      'leads.view',
      'leads.create',
      'quotations.view',
      'masters.services.view',
      'outreach.view',
      'outreach.update',
    ]);
    sales = await seedMember(salesRoleId, 'sales');
    hr = await seedMember(await createRole('PEOPLE_TEAM', ['people.view', 'people.update', 'attendance.view', 'payroll.view']), 'hr');
    employee = await seedMember(await createRole('EMPLOYEE', [], true), 'employee');
    roleLead = await seedMember(await createRole('ROLE_LEAD', ['roles.view', 'roles.update', 'leads.view', 'leads.create']), 'role-lead');
    clerk = await seedMember(await createRole('LEDGER_CLERK', ['attendance.view', 'bookkeeping.ledgers.view']), 'clerk');
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      const scope = { tenant_id: tenantId };
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: users.map((u) => u.id) } } });
      await prisma.rndtechnosoft_attendance_adjustments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_punches.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_records.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_bank_accounts.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_designations.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
      // Reading ledgers creates the default chart of accounts for a workspace that has none.
      await prisma.rndtechnosoft_bookkeeping_entry_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_bookkeeping_entries.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_year_ledger_balances.deleteMany({ where: scope });
      await prisma.rndtechnosoft_accounting_ledgers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_financial_years.deleteMany({ where: scope });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_crm_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: tenantId } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  describe('permission catalog', () => {
    it('is served from GET /permissions, grouped in sidebar order', async () => {
      const response = await api().get(`${API}/permissions`).set(as(owner));

      expect(response.status).toBe(200);
      const sections: { section: string; groups: { group: string; permissions: { key: string }[] }[] }[] = response.body.data;
      expect(sections.map((s) => s.section)).toEqual(
        NAVIGATION.filter((item) => item.parent === null).map((item) => item.label),
      );
      const crm = sections.find((s) => s.section === 'CRM & Sales');
      expect(crm?.groups.map((g) => g.group)).toEqual([
        'Client Outreach',
        'Sales Pipelines',
        'Leads',
        'Email & Marketing',
        'Drip Sequences',
        'Follow-ups & Meetings',
        'Quotations',
        'Clients',
        'Reports & Analytics',
        'Masters',
        'Audit Trail',
      ]);
      // Business modules list their feature-level permissions underneath them.
      expect(sections.find((s) => s.section === 'HRMS')?.groups.map((g) => g.group)).toEqual([
        'People',
        'Attendance',
        'Onboarding',
        'Leave',
        'Biometric device (COSEC)',
      ]);
      expect(sections.find((s) => s.section === 'Finance')?.groups.map((g) => g.group)).toEqual([
        'Payroll',
        'Payroll policies',
        'Payroll inputs',
        'Salary setup',
        'Payslips',
        'Bookkeeping',
      ]);
      const keys = sections.flatMap((s) => s.groups.flatMap((g) => g.permissions.map((p) => p.key)));
      expect(keys.sort()).toEqual([...PERMISSION_KEYS].sort());
    });

    // Other roles start from editable role templates, so only the Administrator role has fixed grants.
    it('is stored in the database, with every Administrator role holding every permission', async () => {
      const stored = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: [...PERMISSION_KEYS] } } });
      expect(stored.length).toBe(PERMISSION_KEYS.length);

      const builtIn = await prisma.rndtechnosoft_roles.findMany({
        where: { role_code: ADMIN_ROLE_CODE },
        select: {
          role_code: true,
          rndtechnosoft_tenants: { select: { tenant_code: true } },
          rndtechnosoft_role_permissions: { select: { rndtechnosoft_permissions: { select: { permission_code: true } } } },
        },
      });
      const missing = builtIn
        .map((role) => ({
          role: `${role.rndtechnosoft_tenants.tenant_code}/${role.role_code}`,
          missing: PERMISSION_KEYS.filter(
            (key) => !role.rndtechnosoft_role_permissions.some((g) => g.rndtechnosoft_permissions.permission_code === key),
          ),
        }))
        .filter((row) => row.missing.length > 0);
      expect(missing).toEqual([]);
    });
  });

  describe('a sales role', () => {
    it('reaches the CRM resources it was granted and nothing else', async () => {
      expect(
        await statuses(sales, [
          ['get', '/crm/leads'],
          ['get', '/crm/quotations'],
          ['get', '/crm/pipelines'],
          ['get', '/crm/masters/services'],
          ['get', '/crm/followups'],
          ['get', '/crm/meetings'],
          ['get', '/crm/masters/sources'],
          ['get', '/crm/audit-logs'],
          ['get', '/crm/leads/export'],
          ['get', '/employees'],
          ['get', '/attendance/records'],
          ['get', '/payroll/periods'],
          ['get', '/bookkeeping/ledgers'],
          ['get', '/tenant/settings'],
        ]),
      ).toEqual([
        ['GET /crm/leads', 200],
        ['GET /crm/quotations', 200],
        ['GET /crm/pipelines', 200],
        ['GET /crm/masters/services', 200],
        ['GET /crm/followups', 403],
        ['GET /crm/meetings', 403],
        ['GET /crm/masters/sources', 403],
        ['GET /crm/audit-logs', 403],
        ['GET /crm/leads/export', 403],
        ['GET /employees', 403],
        ['GET /attendance/records', 403],
        ['GET /payroll/periods', 403],
        ['GET /bookkeeping/ledgers', 403],
        ['GET /tenant/settings', 403],
      ]);
    });

    it('sees only the CRM sidebar items its permissions reveal', async () => {
      expect(await navigationOf(sales)).toEqual(['crm', 'crm.cold-funnel', 'crm.pipeline', 'crm.leads', 'crm.proposals', 'crm.masters']);
    });

    it('can work outreach steps but not enroll new leads without outreach.create', async () => {
      const enroll = await api().post(`${API}/crm/cadence`).set(as(sales)).send({ action: 'ENROLL', leadIds: [] });
      const step = await api().post(`${API}/crm/cadence`).set(as(sales)).send({ action: 'COMPLETE_STEP', leadIds: [] });

      expect(enroll.status).toBe(403);
      expect(step.status).not.toBe(403);
    });
  });

  describe('an HR role', () => {
    it('reaches people, attendance and payroll data but no CRM', async () => {
      expect(
        await statuses(hr, [
          ['get', '/employees'],
          ['get', '/attendance/records'],
          ['get', '/payroll/periods'],
          ['get', '/crm/leads'],
          ['post', '/attendance/bulk-mark', { month: '2026-09' }],
          ['post', '/payroll/runs', {}],
        ]),
      ).toEqual([
        ['GET /employees', 200],
        ['GET /attendance/records', 200],
        ['GET /payroll/periods', 200],
        ['GET /crm/leads', 403],
        ['POST /attendance/bulk-mark', 403],
        ['POST /payroll/runs', 403],
      ]);
      expect(await navigationOf(hr)).toEqual(['hrms', 'people', 'attendance', 'finance', 'payroll']);
    });

    it('needs people.bank.update to send bank details with an employee update', async () => {
      const withBank = await api()
        .put(`${API}/employees/${randomUUID()}`)
        .set(as(hr))
        .send({ bankDetails: { bankName: 'Test Bank', accountNumber: '000011112222', ifsc: 'TEST0000001' } });
      const withoutBank = await api().put(`${API}/employees/${randomUUID()}`).set(as(hr)).send({ firstName: 'Renamed' });

      expect(withBank.status).toBe(403);
      // Authorized, then refused only because that employee does not exist.
      expect(withoutBank.status).toBe(404);
    });
  });

  describe('an employee', () => {
    it('gets only the pages granted by default and nothing from any module API', async () => {
      expect(await navigationOf(employee)).toEqual(['dashboard', 'help']);

      const results = await statuses(employee, [
        ['get', '/employees'],
        ['get', '/attendance/records'],
        ['post', '/attendance/punch', { employeeId: randomUUID(), punchType: 'IN' }],
        ['get', '/leave/types'],
        ['get', '/payroll/periods'],
        ['get', '/salary/components'],
        ['get', '/bookkeeping/ledgers'],
        ['get', '/crm/leads'],
        ['get', '/external-api/cosec/config'],
        ['get', '/users'],
      ]);
      expect(results.filter(([, status]) => status !== 403)).toEqual([]);
    });
  });

  describe('individual features inside a business module', () => {
    it('opens only the features a role grants, under their module', async () => {
      const me = await api().get(`${API}/auth/me`).set(as(clerk));
      expect(
        me.body.access.navigation.map((entry: { id: string; label: string; parent: string | null }) => [entry.id, entry.label, entry.parent]),
      ).toEqual([
        ['hrms', 'HRMS', null],
        ['attendance', 'Attendance', 'hrms'],
        ['finance', 'Finance', null],
        ['bookkeeping', 'Bookkeeping', 'finance'],
      ]);
      expect(
        await statuses(clerk, [
          ['get', '/attendance/records'],
          ['get', '/employees'],
          ['get', '/bookkeeping/ledgers'],
          ['get', '/payroll/periods'],
        ]),
      ).toEqual([
        ['GET /attendance/records', 200],
        ['GET /employees', 403],
        ['GET /bookkeeping/ledgers', 200],
        ['GET /payroll/periods', 403],
      ]);
    });

    it('approves attendance corrections only with attendance.approve, apart from direct edits', async () => {
      const editor = await seedMember(await createRole('ATTENDANCE_EDITOR', ['attendance.view', 'attendance.adjust']), 'editor');
      const approver = await seedMember(await createRole('ATTENDANCE_APPROVER', ['attendance.view', 'attendance.approve']), 'approver');
      const approve = `/attendance/adjustments/${randomUUID()}/approve`;

      // Authorized, then refused only because that correction does not exist.
      expect(await statuses(approver, [['post', approve]])).toEqual([[`POST ${approve}`, 404]]);
      expect(await statuses(editor, [['post', approve]])).toEqual([[`POST ${approve}`, 403]]);
      expect(await statuses(approver, [['post', '/attendance/bulk-mark', { month: '2026-09' }]])).toEqual([
        ['POST /attendance/bulk-mark', 403],
      ]);
    });
  });

  describe('business module switches', () => {
    const financeCalls: [string, string][] = [
      ['get', '/payroll/periods'],
      ['get', '/salary/components'],
      ['get', '/bookkeeping/ledgers'],
    ];
    const hrmsCalls: [string, string][] = [
      ['get', '/employees'],
      ['get', '/attendance/records'],
      ['get', '/leave/types'],
      ['get', '/external-api/cosec/config'],
    ];
    const withStatus = (calls: [string, string][], status: number) =>
      calls.map(([method, path]) => [`${method.toUpperCase()} ${path}`, status]);
    const moduleEntries = async (module: string) => {
      const me = await api().get(`${API}/auth/me`).set(as(owner));
      return me.body.access.navigation
        .filter((entry: { module: string | null }) => entry.module === module)
        .map((entry: { id: string; parent: string | null; moduleEnabled: boolean }) => [entry.id, entry.parent, entry.moduleEnabled]);
    };

    it('refuses a switched-off module’s APIs even to the owner, and flags its whole group in the sidebar', async () => {
      try {
        // HRMS cannot go while Finance, which calculates payroll from it, is on.
        const hrmsFirst = await api().put(`${API}/tenant/modules/HRMS`).set(as(owner)).send({ enabled: false });
        expect(hrmsFirst.status).toBe(400);
        expect(hrmsFirst.body.message).toContain('Finance');

        expect((await api().put(`${API}/tenant/modules/FINANCE`).set(as(owner)).send({ enabled: false })).status).toBe(200);
        expect(await statuses(owner, [...financeCalls, ...hrmsCalls])).toEqual([
          ...withStatus(financeCalls, 403),
          ...withStatus(hrmsCalls, 200),
        ]);
        const me = await api().get(`${API}/auth/me`).set(as(owner));
        // The role keeps its permissions; only the module is off.
        expect(me.body.access.permissions).toEqual(expect.arrayContaining(['payroll.view', 'bookkeeping.ledgers.view']));
        expect(await moduleEntries('FINANCE')).toEqual([
          ['finance', null, false],
          ['payroll', 'finance', false],
          ['payslips', 'finance', false],
          ['bookkeeping', 'finance', false],
          ['reports', null, false],
        ]);

        expect((await api().put(`${API}/tenant/modules/HRMS`).set(as(owner)).send({ enabled: false })).status).toBe(200);
        expect(await statuses(owner, hrmsCalls)).toEqual(withStatus(hrmsCalls, 403));
        expect(await moduleEntries('HRMS')).toEqual([
          ['hrms', null, false],
          ['people', 'hrms', false],
          ['attendance', 'hrms', false],
          ['onboarding', 'hrms', false],
          ['settings', null, false],
        ]);
        // Workspace administration never depends on a module.
        expect((await api().get(`${API}/tenant/settings`).set(as(owner))).status).toBe(200);

        const financeFirst = await api().put(`${API}/tenant/modules/FINANCE`).set(as(owner)).send({ enabled: true });
        expect(financeFirst.status).toBe(400);
        expect(financeFirst.body.message).toContain('HRMS');

        expect((await api().put(`${API}/tenant/modules/HRMS`).set(as(owner)).send({ enabled: true })).status).toBe(200);
        expect((await api().put(`${API}/tenant/modules/FINANCE`).set(as(owner)).send({ enabled: true })).status).toBe(200);
        expect(await statuses(owner, [...financeCalls, ...hrmsCalls])).toEqual(withStatus([...financeCalls, ...hrmsCalls], 200));
      } finally {
        await prisma.rndtechnosoft_tenant_settings.updateMany({ where: { tenant_id: tenantId }, data: { settings: {} } });
      }
    });
  });

  describe('granting access', () => {
    it('does not let a role administrator grant a permission they do not hold', async () => {
      const escalate = await api()
        .put(`${API}/tenant/roles/${salesRoleId}/permissions`)
        .set(as(roleLead))
        .send({ permissionKey: 'leads.delete', granted: true });
      const allowed = await api()
        .put(`${API}/tenant/roles/${salesRoleId}/permissions`)
        .set(as(roleLead))
        .send({ permissionKey: 'leads.view', granted: true });

      expect(escalate.status).toBe(403);
      expect(allowed.status).toBe(200);
    });
  });

  describe('CRM masters', () => {
    it('exposes only resources and actions the backend implements', async () => {
      expect(
        await statuses(owner, [
          ['get', '/crm/masters/services'],
          ['get', '/crm/masters/stages'],
          ['get', '/crm/masters/lost-reasons'],
          ['get', '/crm/masters/sop-steps'],
          ['get', '/crm/masters/quotation-categories'],
          ['put', '/crm/masters/quotation-categories', { id: randomUUID(), name: 'x' }],
          ['post', '/crm/masters/quotation-categories', { name: 'x' }],
        ]),
      ).toEqual([
        ['GET /crm/masters/services', 200],
        ['GET /crm/masters/stages', 200],
        ['GET /crm/masters/lost-reasons', 200],
        ['GET /crm/masters/sop-steps', 200],
        ['GET /crm/masters/quotation-categories', 404],
        ['PUT /crm/masters/quotation-categories', 404],
        ['POST /crm/masters/quotation-categories', 404],
      ]);
    });
  });

  describe('who is recorded as acting', () => {
    it('records the signed-in member on attendance corrections, whatever the body says', async () => {
      const created = await api()
        .post(`${API}/employees`)
        .set(as(owner))
        .send({ employeeCode: `RBAC-${Date.now()}`, firstName: 'Rbac', joiningDate: '2026-01-01' });
      expect(created.status).toBe(201);
      const employeeId: string = created.body.id ?? created.body.data?.id;

      const record = await api()
        .post(`${API}/attendance/records`)
        .set(as(owner))
        .send({ employeeId, attendanceDate: '2026-09-01', attendanceStatus: 'PRESENT' });
      expect(record.status).toBe(201);
      const recordId: string = record.body.id ?? record.body.data?.id;

      const requested = await api()
        .post(`${API}/attendance/adjustments`)
        .set(as(owner))
        .send({
          attendanceRecordId: recordId,
          requestedByTenantMemberId: sales.memberId,
          adjustmentReason: 'Forgot to clock out',
          requestedValues: { attendanceStatus: 'HALF_DAY' },
        });
      expect(requested.status).toBe(201);
      const adjustmentId: string = requested.body.id ?? requested.body.data?.id;

      const approved = await api()
        .post(`${API}/attendance/adjustments/${adjustmentId}/approve`)
        .set(as(owner))
        .send({ approverTenantMemberId: sales.memberId });
      expect(approved.status).toBe(201);

      const stored = await prisma.rndtechnosoft_attendance_adjustments.findUnique({ where: { id: adjustmentId } });
      expect(stored?.requested_by_tenant_member_id).toBe(owner.memberId);
      expect(stored?.approved_by_tenant_member_id).toBe(owner.memberId);
    });
  });
});
