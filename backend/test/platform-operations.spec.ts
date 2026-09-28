import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ADMIN_ROLE_CODE, PERMISSION_KEYS } from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';

/**
 * What the platform console changes: a workspace's organization details,
 * modules and subscription; a user account's own details; workspace
 * memberships (without ever deleting the global account); and role templates.
 * Every change must persist, be audited, stay inside the workspace it names,
 * and be reachable only by a SUPER_ADMIN platform session.
 */

const API = '/api/v1';
const PASSWORD = 'Platform-Operations-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase();
const TEMPLATE_CODE = `PO_${SUFFIX.toUpperCase()}`;

describe('Platform operations: workspaces, users, memberships and role templates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let platformToken: string;
  let supportToken: string;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const adminIds: string[] = [];
  const planIds: string[] = [];
  const tenants = { a: '', b: '' };
  const users = { ownerA: '', ownerB: '', person: '' };
  const members = { ownerA: '', personB: '' };

  const api = () => request(app.getHttpServer());
  const asPlatform = (token = platformToken) => ({ Authorization: `Bearer ${token}` });
  const email = (label: string) => `po-${label.toLowerCase()}-${SUFFIX}@operations.test`;
  const call = (method: string, path: string) => (api() as unknown as Record<string, (url: string) => request.Test>)[method](`${API}${path}`);

  async function createTenant(key: keyof typeof tenants) {
    const id = randomUUID();
    await prisma.rndtechnosoft_tenants.create({
      data: {
        id,
        tenant_code: `PO${SUFFIX.toUpperCase()}${key.toUpperCase()}`,
        legal_name: `Operations ${key} ${SUFFIX} Pvt Ltd`,
        display_name: `Operations ${key} ${SUFFIX}`,
        default_currency_code: 'INR',
        tenant_status: 'ACTIVE',
      },
    });
    tenantIds.push(id);
    tenants[key] = id;
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({
      data: { id: roleId, tenant_id: id, role_code: ADMIN_ROLE_CODE, role_name: 'Administrator', is_system_role: true, role_status: 'ACTIVE' },
    });
    await grantDefaultRolePermissions(prisma, id, roleId, ADMIN_ROLE_CODE);
    return { id, adminRoleId: roleId };
  }

  async function createUser(key: keyof typeof users) {
    const id = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: {
        id,
        email: email(key),
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `Person ${key}`,
        user_status: 'ACTIVE',
      },
    });
    userIds.push(id);
    users[key] = id;
    return id;
  }

  async function addMember(tenantId: string, userId: string, roleId: string) {
    const id = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: { id, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: id, role_id: roleId } });
    return id;
  }

  async function platformAccount(label: string, role: string) {
    const id = randomUUID();
    const address = `po-platform-${label}-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id,
        email: address,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `Operations ${label}`,
        role,
        is_active: true,
      },
    });
    adminIds.push(id);
    return (await api().post(`${API}/super-admin/auth/login`).send({ email: address, password: PASSWORD })).body.data.token as string;
  }

  const signIn = (key: keyof typeof users, tenantId: string) =>
    api().post(`${API}/auth/login`).send({ email: email(key), password: PASSWORD, tenantId });

  const lastLog = (action: string) =>
    prisma.rndtechnosoft_platform_activity_logs.findFirst({ where: { super_admin_id: adminIds[0], action }, orderBy: { created_at: 'desc' } });

  const organization = (overrides: Record<string, unknown> = {}) => ({
    organizationName: `Renamed ${SUFFIX}`,
    legalName: `Renamed ${SUFFIX} Private Limited`,
    industry: 'CONSULTING',
    website: 'https://renamed.example.com',
    contactName: 'Office Manager',
    contactEmail: `office-${SUFFIX}@operations.test`,
    contactPhone: '+91 90000 00000',
    address: '2 Changed Street',
    countryCode: 'in',
    taxId: '27ABCDE1234F1Z5',
    timezone: 'Asia/Kolkata',
    currency: 'USD',
    ...overrides,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    const a = await createTenant('a');
    const b = await createTenant('b');
    members.ownerA = await addMember(a.id, await createUser('ownerA'), a.adminRoleId);
    await addMember(b.id, await createUser('ownerB'), b.adminRoleId);
    // Someone who belongs to B only; the tests add them to A.
    members.personB = await addMember(b.id, await createUser('person'), b.adminRoleId);

    platformToken = await platformAccount('super', 'SUPER_ADMIN');
    supportToken = await platformAccount('support', 'SUPPORT');
  });

  afterAll(async () => {
    if (prisma) {
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_role_templates.deleteMany({ where: { template_code: { startsWith: TEMPLATE_CODE } } });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({
        where: { OR: [{ super_admin_id: { in: adminIds } }, { target_tenant_id: { in: tenantIds } }] },
      });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_subscriptions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_plans.deleteMany({ where: { id: { in: planIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  describe('who may use it', () => {
    it('refuses anonymous callers, workspace sessions and non-SUPER_ADMIN platform accounts on every change route', async () => {
      const login = await signIn('ownerA', tenants.a);
      expect(login.status).toBe(200);
      const tenantToken = login.body.token as string;

      const routes: [string, string][] = [
        ['put', `/super-admin/tenants/${tenants.a}`],
        ['put', `/super-admin/tenants/${tenants.a}/modules/CRM`],
        ['put', `/super-admin/tenants/${tenants.a}/subscription`],
        ['get', `/super-admin/tenants/${tenants.a}/assignable-roles`],
        ['put', `/super-admin/users/${users.person}`],
        ['post', `/super-admin/users/${users.person}/memberships`],
        ['put', `/super-admin/users/${users.person}/memberships/${members.personB}`],
        ['delete', `/super-admin/users/${users.person}/memberships/${members.personB}`],
        ['get', '/super-admin/roles-templates'],
        ['post', '/super-admin/roles-templates'],
        ['put', '/super-admin/roles-templates/EMPLOYEE'],
        ['delete', '/super-admin/roles-templates/EMPLOYEE'],
      ];
      for (const [method, path] of routes) {
        const anonymous = await call(method, path).send({});
        const workspace = await call(method, path).set({ Authorization: `Bearer ${tenantToken}` }).send({});
        const support = await call(method, path).set(asPlatform(supportToken)).send({});
        expect([`${method} ${path}`, anonymous.status, workspace.status, support.status]).toEqual([`${method} ${path}`, 401, 401, 403]);
      }
      // Nothing was changed by any of those attempts.
      expect(await prisma.rndtechnosoft_tenant_members.findUniqueOrThrow({ where: { id: members.personB } })).toMatchObject({
        membership_status: 'ACTIVE',
      });
    });
  });

  describe('workspace details', () => {
    it('validates, saves and audits organization details, touching no other workspace', async () => {
      expect((await api().put(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform()).send(organization({ timezone: 'Mars/Base' }))).status).toBe(400);
      expect((await api().put(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform()).send(organization({ extra: 1 }))).status).toBe(400);
      expect((await api().put(`${API}/super-admin/tenants/${randomUUID()}`).set(asPlatform()).send(organization())).status).toBe(404);

      const saved = await api().put(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform()).send(organization());
      expect(saved.status).toBe(200);
      expect(saved.body.data.changedFields).toEqual(expect.arrayContaining(['company_name', 'currency', 'legal_name', 'country_code']));

      // Persisted: what a reload of the workspace page reads.
      const detail = (await api().get(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform())).body.data;
      expect(detail.overview).toMatchObject({ name: `Renamed ${SUFFIX}`, legalName: `Renamed ${SUFFIX} Private Limited`, countryCode: 'IN' });
      expect(detail.organization).toMatchObject({
        companyName: `Renamed ${SUFFIX}`,
        industry: 'CONSULTING',
        currency: 'USD',
        contactEmail: `office-${SUFFIX}@operations.test`,
        address: '2 Changed Street',
      });
      expect(await prisma.rndtechnosoft_tenants.findUniqueOrThrow({ where: { id: tenants.b } })).toMatchObject({
        display_name: `Operations b ${SUFFIX}`,
      });

      const log = await lastLog('TENANT_UPDATED');
      expect(log).toMatchObject({ target_tenant_id: tenants.a });
      expect(JSON.stringify(log)).not.toContain(`office-${SUFFIX}`);
    });

    it('switches modules on and off, refusing a broken dependency', async () => {
      const set = (code: string, enabled: boolean) =>
        api().put(`${API}/super-admin/tenants/${tenants.a}/modules/${code}`).set(asPlatform()).send({ enabled });
      expect((await set('HRMS', false)).status).toBe(400); // Finance is on and needs it
      expect((await set('FINANCE', false)).status).toBe(200);
      expect((await set('HRMS', false)).status).toBe(200);
      expect((await set('FINANCE', true)).status).toBe(400); // Finance needs HRMS
      expect((await set('HRMS', true)).status).toBe(200);
      expect((await set('FINANCE', true)).status).toBe(200);
      expect((await set('HRMS', false)).status).toBe(400); // Finance still needs it
      expect((await set('CRM', false)).body.data).toEqual({ code: 'CRM', name: 'CRM & Sales', enabled: false });
      expect((await set('PAYROLL', true)).status).toBe(404);
      expect((await api().put(`${API}/super-admin/tenants/${tenants.a}/modules/CRM`).set(asPlatform()).send({ enabled: 'yes' })).status).toBe(400);

      const modules = (await api().get(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform())).body.data.modules;
      expect(Object.fromEntries(modules.map((m: { code: string; enabled: boolean }) => [m.code, m.enabled]))).toEqual({ CRM: false, HRMS: true, FINANCE: true });
      expect((await lastLog('TENANT_MODULE_DISABLED'))?.metadata).toEqual({ module: 'CRM' });
    });

    it('changes the subscription, keeping the previous one as history', async () => {
      const planA = randomUUID();
      const planB = randomUUID();
      planIds.push(planA, planB);
      await prisma.rndtechnosoft_plans.createMany({
        data: [
          { id: planA, plan_code: `PO_START_${SUFFIX}`, plan_name: 'Operations start', billing_interval: 'MONTHLY' },
          { id: planB, plan_code: `PO_GROW_${SUFFIX}`, plan_name: 'Operations grow', billing_interval: 'MONTHLY' },
        ],
      });
      const change = (body: Record<string, unknown>) => api().put(`${API}/super-admin/tenants/${tenants.a}/subscription`).set(asPlatform()).send(body);

      expect((await change({ planCode: 'NO_SUCH_PLAN', status: 'ACTIVE', startsOn: '2026-10-01' })).status).toBe(400);
      expect((await change({ planCode: `PO_START_${SUFFIX}`, status: 'TRIALING', startsOn: '2026-10-01' })).status).toBe(400);
      expect((await change({ planCode: `PO_START_${SUFFIX}`, status: 'ACTIVE', startsOn: '2026-10-01', endsOn: '2026-09-01' })).status).toBe(400);

      expect((await change({ planCode: `PO_START_${SUFFIX}`, status: 'ACTIVE', startsOn: '2026-10-01' })).status).toBe(200);
      // Starting on or before the current one would rewrite history.
      expect((await change({ planCode: `PO_GROW_${SUFFIX}`, status: 'ACTIVE', startsOn: '2026-10-01' })).status).toBe(400);
      const moved = await change({ planCode: `PO_GROW_${SUFFIX}`, status: 'ACTIVE', startsOn: '2026-11-01' });
      expect(moved.status).toBe(200);
      expect(moved.body.data).toMatchObject({ planCode: `PO_GROW_${SUFFIX}`, previousPlans: [`PO_START_${SUFFIX}`] });

      const history = await prisma.rndtechnosoft_tenant_subscriptions.findMany({ where: { tenant_id: tenants.a }, orderBy: { starts_on: 'asc' } });
      expect(history.map((s) => [s.plan_id, s.subscription_status, s.ends_on?.toISOString().slice(0, 10) ?? null])).toEqual([
        [planA, 'ENDED', '2026-10-31'],
        [planB, 'ACTIVE', null],
      ]);
      const detail = (await api().get(`${API}/super-admin/tenants/${tenants.a}`).set(asPlatform())).body.data;
      expect(detail.overview.plan).toEqual({ code: `PO_GROW_${SUFFIX}`, name: 'Operations grow' });
      expect(await prisma.rndtechnosoft_tenant_subscriptions.count({ where: { tenant_id: tenants.b } })).toBe(0);
    });
  });

  describe('user accounts', () => {
    it('edits the global account, refusing an email another account uses', async () => {
      const update = (body: Record<string, unknown>) => api().put(`${API}/super-admin/users/${users.person}`).set(asPlatform()).send(body);
      expect((await update({ name: 'X', email: 'not-an-email' })).status).toBe(400);
      expect((await update({ name: 'X', email: email('person'), phone: 'abc' })).status).toBe(400);
      expect((await api().put(`${API}/super-admin/users/${randomUUID()}`).set(asPlatform()).send({ name: 'X', email: email('nobody') })).status).toBe(404);
      const taken = await update({ name: 'X', email: email('ownerA') });
      expect(taken.status).toBe(409);
      expect(taken.body.message).toBe('Another account already uses that email address.');

      const saved = await update({ name: 'Priya Person', email: email('PersonRenamed'), phone: '+91 91234 56789' });
      expect(saved.status).toBe(200);
      expect(saved.body.data.changedFields).toEqual(['name', 'email', 'phone']);
      const detail = (await api().get(`${API}/super-admin/users/${users.person}`).set(asPlatform())).body.data;
      expect(detail.identity).toMatchObject({ name: 'Priya Person', email: email('personrenamed'), phone: '+91 91234 56789', emailVerifiedAt: null });

      const log = await lastLog('USER_ACCOUNT_UPDATED');
      expect(log?.metadata).toEqual({ userId: users.person, changedFields: ['name', 'email', 'phone'] });
      expect(JSON.stringify(log)).not.toContain('91234');

      // Put the sign-in address back for the membership tests.
      expect((await update({ name: 'Priya Person', email: email('person'), phone: '' })).status).toBe(200);
    });
  });

  describe('workspace memberships', () => {
    let memberA: string;

    it('offers the workspace roles and the templates it does not have yet', async () => {
      const roles = (await api().get(`${API}/super-admin/tenants/${tenants.a}/assignable-roles`).set(asPlatform())).body.data;
      expect(roles[0]).toEqual({ code: ADMIN_ROLE_CODE, name: 'Administrator', source: 'WORKSPACE' });
      expect(roles).toEqual(expect.arrayContaining([
        { code: 'MANAGER', name: 'Manager', source: 'TEMPLATE' },
        { code: 'EMPLOYEE', name: 'Employee', source: 'TEMPLATE' },
      ]));
    });

    it('adds a user to a workspace with a role created from its template', async () => {
      const add = (roleCode: string) =>
        api().post(`${API}/super-admin/users/${users.person}/memberships`).set(asPlatform()).send({ tenantId: tenants.a, roleCode });
      expect((await add('NO_SUCH_ROLE')).status).toBe(400);
      expect((await api().post(`${API}/super-admin/users/${users.person}/memberships`).set(asPlatform()).send({ tenantId: randomUUID(), roleCode: 'MANAGER' })).status).toBe(404);

      const added = await add('manager');
      expect(added.status).toBe(201);
      expect(added.body.data).toMatchObject({ tenantId: tenants.a, roleCode: 'MANAGER', status: 'ACTIVE' });
      memberA = added.body.data.memberId;
      expect((await add('MANAGER')).status).toBe(409);

      // The role now exists in that workspace only, with the template's grants copied onto it.
      const role = await prisma.rndtechnosoft_roles.findUniqueOrThrow({
        where: { tenant_id_role_code: { tenant_id: tenants.a, role_code: 'MANAGER' } },
        include: { _count: { select: { rndtechnosoft_role_permissions: true } } },
      });
      const template = await prisma.rndtechnosoft_role_templates.findUniqueOrThrow({
        where: { template_code: 'MANAGER' },
        include: { _count: { select: { rndtechnosoft_role_template_permissions: true } } },
      });
      expect(role).toMatchObject({ role_name: template.template_name, is_system_role: true });
      expect(role._count.rndtechnosoft_role_permissions).toBe(template._count.rndtechnosoft_role_template_permissions);
      expect(await prisma.rndtechnosoft_roles.count({ where: { tenant_id: tenants.b, role_code: 'MANAGER' } })).toBe(0);

      const login = await signIn('person', tenants.a);
      expect(login.status).toBe(200);
      expect(login.body.activeTenant.roles).toEqual(['MANAGER']);
    });

    it('changes the role, suspends and reactivates, ending the workspace sessions on suspension', async () => {
      const update = (body: Record<string, unknown>, member = memberA, user = users.person) =>
        api().put(`${API}/super-admin/users/${user}/memberships/${member}`).set(asPlatform()).send(body);
      expect((await update({})).status).toBe(400);
      expect((await update({ status: 'ARCHIVED' })).status).toBe(400);
      // A membership id paired with someone else's account is not found.
      expect((await update({ status: 'SUSPENDED' }, memberA, users.ownerB)).status).toBe(404);

      expect((await update({ roleCode: 'EMPLOYEE' })).body.data).toMatchObject({ roleCode: 'EMPLOYEE', status: 'ACTIVE' });

      const session = (await signIn('person', tenants.a)).body.token as string;
      expect((await api().get(`${API}/auth/me`).set({ Authorization: `Bearer ${session}` })).status).toBe(200);
      expect((await update({ status: 'SUSPENDED' })).body.data.status).toBe('SUSPENDED');
      expect((await api().get(`${API}/auth/me`).set({ Authorization: `Bearer ${session}` })).status).toBe(401);
      expect((await signIn('person', tenants.a)).status).toBe(403);
      // Their other workspace is untouched.
      expect((await signIn('person', tenants.b)).status).toBe(200);

      expect((await update({ status: 'ACTIVE' })).body.data.status).toBe('ACTIVE');
      expect((await signIn('person', tenants.a)).status).toBe(200);
      expect((await lastLog('MEMBERSHIP_UPDATED'))?.metadata).toMatchObject({ statusFrom: 'SUSPENDED', statusTo: 'ACTIVE' });
    });

    it('never leaves a workspace without an active administrator', async () => {
      const path = `${API}/super-admin/users/${users.ownerA}/memberships/${members.ownerA}`;
      for (const body of [{ roleCode: 'EMPLOYEE' }, { status: 'SUSPENDED' }]) {
        const refused = await api().put(path).set(asPlatform()).send(body);
        expect(refused.status).toBe(400);
        expect(refused.body.message).toMatch(/only active administrator/);
      }
      expect((await api().delete(path).set(asPlatform())).status).toBe(400);

      // With a second administrator, the first can step down.
      expect((await api().put(`${API}/super-admin/users/${users.person}/memberships/${memberA}`).set(asPlatform()).send({ roleCode: 'ADMIN' })).status).toBe(200);
      expect((await api().put(path).set(asPlatform()).send({ roleCode: 'EMPLOYEE' })).status).toBe(200);
      expect((await api().put(path).set(asPlatform()).send({ roleCode: 'ADMIN' })).status).toBe(200);
    });

    it('removes a user from one workspace only, keeping the account, and can add them back', async () => {
      const removed = await api().delete(`${API}/super-admin/users/${users.person}/memberships/${memberA}`).set(asPlatform());
      expect(removed.status).toBe(200);
      expect(removed.body.data).toMatchObject({ memberId: memberA, status: 'ARCHIVED' });
      expect((await api().delete(`${API}/super-admin/users/${users.person}/memberships/${memberA}`).set(asPlatform())).status).toBe(409);
      expect((await api().put(`${API}/super-admin/users/${users.person}/memberships/${memberA}`).set(asPlatform()).send({ roleCode: 'EMPLOYEE' })).status).toBe(400);

      // The account and its other membership are untouched; the removed membership stays on record.
      expect(await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { id: users.person } })).toMatchObject({ user_status: 'ACTIVE' });
      expect(await prisma.rndtechnosoft_tenant_members.findUniqueOrThrow({ where: { id: members.personB } })).toMatchObject({ membership_status: 'ACTIVE' });
      expect(await prisma.rndtechnosoft_tenant_members.findUniqueOrThrow({ where: { id: memberA } })).toMatchObject({ membership_status: 'ARCHIVED' });
      expect((await signIn('person', tenants.a)).status).toBe(403);
      expect((await signIn('person', tenants.b)).status).toBe(200);

      const restored = await api().post(`${API}/super-admin/users/${users.person}/memberships`).set(asPlatform()).send({ tenantId: tenants.a, roleCode: 'EMPLOYEE' });
      expect(restored.status).toBe(201);
      expect(restored.body.data.memberId).toBe(memberA);
      expect((await lastLog('MEMBERSHIP_ADDED'))?.metadata).toMatchObject({ restored: true, roleCode: 'EMPLOYEE' });
    });
  });

  describe('role templates', () => {
    const templates = async () => (await api().get(`${API}/super-admin/roles-templates`).set(asPlatform())).body.data;

    it('lists the locked Administrator role first, then the built-in templates, with the permission catalog', async () => {
      const data = await templates();
      expect(data.templates[0]).toMatchObject({ code: 'ADMIN', kind: 'OWNER', editable: false, deletable: false });
      expect(data.templates[0].permissions).toHaveLength(PERMISSION_KEYS.length);
      for (const code of ['HR_ACCOUNTANT', 'MANAGER', 'EMPLOYEE']) {
        expect(data.templates.find((t: { code: string }) => t.code === code)).toMatchObject({ kind: 'SYSTEM', editable: true, deletable: false });
      }
      const keys = data.catalog.flatMap((s: { groups: { permissions: { key: string }[] }[] }) => s.groups.flatMap((g) => g.permissions.map((p) => p.key)));
      expect(keys.sort()).toEqual([...PERMISSION_KEYS].sort());
    });

    it('creates templates from granular permissions only, with a unique code', async () => {
      const create = (body: Record<string, unknown>) => api().post(`${API}/super-admin/roles-templates`).set(asPlatform()).send(body);
      expect((await create({ code: TEMPLATE_CODE, name: 'Sales desk', permissions: ['finance.view'] })).status).toBe(400);
      expect((await create({ code: 'admin', name: 'Owner copy', permissions: [] })).status).toBe(400);
      expect((await create({ code: '9LIVES', name: 'Bad code', permissions: [] })).status).toBe(400);
      expect((await create({ code: TEMPLATE_CODE, name: 'Sales desk', permissions: ['leads.view', 'leads.view'] })).status).toBe(400);

      const created = await create({ code: TEMPLATE_CODE.toLowerCase(), name: 'Sales desk', description: 'Leads only', permissions: ['leads.view', 'leads.create'] });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ code: TEMPLATE_CODE, name: 'Sales desk', kind: 'CUSTOM', deletable: true, workspaces: 0 });
      expect(created.body.data.permissions.sort()).toEqual(['leads.create', 'leads.view']);
      expect((await create({ code: TEMPLATE_CODE, name: 'Again', permissions: [] })).status).toBe(409);
    });

    it('applies template changes to roles created afterwards, never to roles that already exist', async () => {
      // Workspace A gets a role from the template as it is now.
      const addToA = await api().post(`${API}/super-admin/users/${users.ownerB}/memberships`).set(asPlatform()).send({ tenantId: tenants.a, roleCode: TEMPLATE_CODE });
      expect(addToA.status).toBe(201);

      const updated = await api()
        .put(`${API}/super-admin/roles-templates/${TEMPLATE_CODE}`)
        .set(asPlatform())
        .send({ name: 'Sales desk plus', permissions: ['leads.view', 'quotations.view'] });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({ name: 'Sales desk plus', workspaces: 1 });
      expect(updated.body.data.permissions.sort()).toEqual(['leads.view', 'quotations.view']);
      expect((await lastLog('ROLE_TEMPLATE_UPDATED'))?.metadata).toEqual({ templateCode: TEMPLATE_CODE, added: ['quotations.view'], removed: ['leads.create'] });

      const grants = async (tenantId: string) =>
        (
          await prisma.rndtechnosoft_role_permissions.findMany({
            where: { tenant_id: tenantId, rndtechnosoft_roles: { role_code: TEMPLATE_CODE } },
            select: { rndtechnosoft_permissions: { select: { permission_code: true } } },
          })
        )
          .map((g) => g.rndtechnosoft_permissions.permission_code)
          .sort();
      expect(await grants(tenants.a)).toEqual(['leads.create', 'leads.view']);

      // A role created now, in workspace B, starts from the updated template.
      expect((await api().put(`${API}/super-admin/users/${users.person}/memberships/${members.personB}`).set(asPlatform()).send({ roleCode: TEMPLATE_CODE })).status).toBe(200);
      expect(await grants(tenants.b)).toEqual(['leads.view', 'quotations.view']);
    });

    it('protects the Administrator role and built-in templates, and deletes a custom one', async () => {
      expect((await api().put(`${API}/super-admin/roles-templates/ADMIN`).set(asPlatform()).send({ name: 'Admin', permissions: [] })).status).toBe(400);
      expect((await api().delete(`${API}/super-admin/roles-templates/ADMIN`).set(asPlatform())).status).toBe(400);
      expect((await api().delete(`${API}/super-admin/roles-templates/EMPLOYEE`).set(asPlatform())).status).toBe(400);
      expect((await api().put(`${API}/super-admin/roles-templates/NO_SUCH_TEMPLATE`).set(asPlatform()).send({ name: 'X Y', permissions: [] })).status).toBe(404);

      expect((await api().delete(`${API}/super-admin/roles-templates/${TEMPLATE_CODE}`).set(asPlatform())).status).toBe(200);
      expect((await templates()).templates.some((t: { code: string }) => t.code === TEMPLATE_CODE)).toBe(false);
      expect((await api().delete(`${API}/super-admin/roles-templates/${TEMPLATE_CODE}`).set(asPlatform())).status).toBe(404);
      // Workspace roles created from it are theirs to keep.
      expect(await prisma.rndtechnosoft_roles.count({ where: { tenant_id: { in: tenantIds }, role_code: TEMPLATE_CODE } })).toBe(2);
    });
  });
});
