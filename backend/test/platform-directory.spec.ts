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
 * The platform console's tenant and user directories: cross-tenant by design,
 * reachable only by a SUPER_ADMIN platform session, and built from stored
 * records only. Fixture names carry a per-run suffix so the real workspaces in
 * the database never affect the assertions.
 */

const API = '/api/v1';
const PASSWORD = 'Platform-Directory-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8).toLowerCase();
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const SMTP_CIPHERTEXT = `enc-smtp-ciphertext-${SUFFIX}`;
const COSEC_PASSWORD = `cosec-plain-password-${SUFFIX}`;

interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

describe('Platform tenant and user directories', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const adminIds: string[] = [];
  let platformToken: string;
  let supportToken: string;

  const tenants: Record<'empty' | 'solo' | 'team' | 'suspended', string> = { empty: '', solo: '', team: '', suspended: '' };
  const users: Record<'soloOwner' | 'teamOwner' | 'teamAdmin' | 'multi' | 'suspendedMember' | 'removed' | 'disabled' | 'clerk', string> = {
    soloOwner: '',
    teamOwner: '',
    teamAdmin: '',
    multi: '',
    suspendedMember: '',
    removed: '',
    disabled: '',
    clerk: '',
  };
  const roleIds: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const asPlatform = (token = platformToken) => ({ Authorization: `Bearer ${token}` });
  // Stored lower-case, as sign-in expects.
  const email = (label: string) => `pd-${label.toLowerCase()}-${SUFFIX}@directory.test`;

  async function createTenant(key: keyof typeof tenants, label: string, status = 'ACTIVE', createdAt?: Date) {
    const id = randomUUID();
    await prisma.rndtechnosoft_tenants.create({
      data: {
        id,
        tenant_code: `PD${SUFFIX.toUpperCase()}${label.toUpperCase()}`,
        legal_name: `Directory ${label} ${SUFFIX} Pvt Ltd`,
        display_name: `Directory ${label} ${SUFFIX}`,
        default_currency_code: 'INR',
        tenant_status: status,
        ...(createdAt ? { created_at: createdAt } : {}),
      },
    });
    tenantIds.push(id);
    tenants[key] = id;
    return id;
  }

  async function createRole(tenantId: string, code: string, isSystem: boolean) {
    const id = randomUUID();
    await prisma.rndtechnosoft_roles.create({
      data: { id, tenant_id: tenantId, role_code: code, role_name: `${code} role`, is_system_role: isSystem, role_status: 'ACTIVE' },
    });
    await grantDefaultRolePermissions(prisma, tenantId, id, code);
    roleIds[`${tenantId}:${code}`] = id;
    return id;
  }

  async function createUser(key: keyof typeof users, options: { name: string; phone?: string; status?: string }) {
    const id = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: {
        id,
        email: email(key),
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: options.name,
        mobile_number: options.phone ?? null,
        user_status: options.status ?? 'ACTIVE',
      },
    });
    userIds.push(id);
    users[key] = id;
    return id;
  }

  async function addMember(tenantId: string, userId: string, roleCode: string, status = 'ACTIVE', joinedAt = new Date()) {
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: status, joined_at: joinedAt },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleIds[`${tenantId}:${roleCode}`] },
    });
    return memberId;
  }

  async function createPlatformAccount(label: string, role: string) {
    const id = randomUUID();
    const address = `pd-platform-${label}-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id,
        email: address,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `Directory ${label}`,
        role,
        is_active: true,
      },
    });
    adminIds.push(id);
    const login = await api().post(`${API}/super-admin/auth/login`).send({ email: address, password: PASSWORD });
    expect(login.status).toBe(200);
    return login.body.data.token as string;
  }

  async function tenantLogin(key: keyof typeof users, tenantId?: string) {
    const login = await api()
      .post(`${API}/auth/login`)
      .set('User-Agent', USER_AGENT)
      .send({ email: email(key), password: PASSWORD, ...(tenantId ? { tenantId } : {}) });
    return login;
  }

  const listTenants = async (query: Record<string, string | number | boolean>) => {
    const response = await api().get(`${API}/super-admin/tenants`).query(query).set(asPlatform());
    expect(response.status).toBe(200);
    return response.body.data as Page<Record<string, any>>;
  };

  const listUsers = async (query: Record<string, string | number>) => {
    const response = await api().get(`${API}/super-admin/users`).query(query).set(asPlatform());
    expect(response.status).toBe(200);
    return response.body.data as Page<Record<string, any>>;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    // An empty workspace: no members, no settings.
    await createTenant('empty', 'empty', 'ACTIVE', new Date('2020-01-15T00:00:00Z'));

    // One owner, a saved organization profile, a stored SMTP secret and COSEC password, CRM switched off.
    await createTenant('solo', 'solo');
    await createRole(tenants.solo, ADMIN_ROLE_CODE, true);
    await createRole(tenants.solo, 'EMPLOYEE', true);
    await prisma.rndtechnosoft_tenant_settings.create({
      data: {
        id: randomUUID(),
        tenant_id: tenants.solo,
        settings: {
          timezone: 'Asia/Kolkata',
          profile: {
            company_name: `Solo Industries ${SUFFIX}`,
            industry_type: 'MANUFACTURING',
            tax_gstin: '24AAACS1234A1Z5',
            company_address: '1 Test Road, Ahmedabad',
          },
          smtp: { host: 'smtp.example.test', username: 'mailer', passwordEncrypted: SMTP_CIPHERTEXT },
          cosecApi: { baseUrl: 'http://cosec.example.test', username: 'cosec', password: COSEC_PASSWORD },
          modules: [{ id: 'CRM', is_enabled: false }],
        },
      },
    });
    await createUser('soloOwner', { name: `Solo Owner ${SUFFIX}`, phone: `+91 90000 ${SUFFIX.slice(0, 5)}` });
    await addMember(tenants.solo, users.soloOwner, ADMIN_ROLE_CODE);

    // Several members: two administrators (the earlier one is the owner), a
    // suspended membership, a removed one, a globally disabled account and a custom role.
    await createTenant('team', 'team');
    await createRole(tenants.team, ADMIN_ROLE_CODE, true);
    await createRole(tenants.team, 'EMPLOYEE', true);
    await createRole(tenants.team, 'FIELD_CLERK', false);
    await prisma.rndtechnosoft_tenant_quotas.create({ data: { id: randomUUID(), tenant_id: tenants.team, user_seats_limit: 5 } });
    await createUser('teamOwner', { name: `Team Owner ${SUFFIX}` });
    await createUser('teamAdmin', { name: `Team Second Admin ${SUFFIX}` });
    await createUser('multi', { name: `Multi Workspace ${SUFFIX}` });
    await createUser('suspendedMember', { name: `Suspended Member ${SUFFIX}` });
    await createUser('removed', { name: `Removed Member ${SUFFIX}` });
    await createUser('disabled', { name: `Disabled Account ${SUFFIX}`, status: 'DISABLED' });
    await createUser('clerk', { name: `Field Clerk ${SUFFIX}` });
    await addMember(tenants.team, users.teamOwner, ADMIN_ROLE_CODE, 'ACTIVE', new Date('2026-01-01T00:00:00Z'));
    await addMember(tenants.team, users.teamAdmin, ADMIN_ROLE_CODE, 'ACTIVE', new Date('2026-02-01T00:00:00Z'));
    await addMember(tenants.team, users.multi, 'EMPLOYEE');
    await addMember(tenants.team, users.suspendedMember, 'EMPLOYEE', 'SUSPENDED');
    await addMember(tenants.team, users.removed, 'EMPLOYEE', 'ARCHIVED');
    await addMember(tenants.team, users.disabled, 'EMPLOYEE');
    await addMember(tenants.team, users.clerk, 'FIELD_CLERK');
    // The same global account belongs to a second workspace.
    await addMember(tenants.solo, users.multi, 'EMPLOYEE');

    // A suspended workspace with an owner.
    await createTenant('suspended', 'suspended', 'SUSPENDED');
    await createRole(tenants.suspended, ADMIN_ROLE_CODE, true);

    platformToken = await createPlatformAccount('operator', 'SUPER_ADMIN');
    supportToken = await createPlatformAccount('support', 'SUPPORT');
  });

  afterAll(async () => {
    if (prisma) {
      const tenantScope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({
        where: { OR: [{ super_admin_id: { in: adminIds } }, { target_tenant_id: { in: tenantIds } }] },
      });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  describe('who may use it', () => {
    it('refuses tenant sessions, even a workspace owner’s, on every directory and commercial route', async () => {
      const login = await tenantLogin('soloOwner');
      expect(login.status).toBe(200);
      const tenantToken = login.body.token as string;

      const routes: [string, string][] = [
        ['get', `/super-admin/tenants`],
        ['get', `/super-admin/tenants/${tenants.solo}`],
        ['get', `/super-admin/tenants/${tenants.team}/activity`],
        ['get', `/super-admin/users`],
        ['get', `/super-admin/users/${users.soloOwner}`],
        ['post', `/super-admin/users/${users.clerk}/disable`],
        ['post', `/super-admin/tenants/${tenants.team}/suspend`],
        ['get', `/super-admin/subscriptions`],
        ['get', `/super-admin/invoices`],
      ];
      for (const [method, path] of routes) {
        const response = await (api() as unknown as Record<string, (url: string) => request.Test>)
          [method](`${API}${path}`)
          .set({ Authorization: `Bearer ${tenantToken}` });
        expect([`${method.toUpperCase()} ${path}`, response.status]).toEqual([`${method.toUpperCase()} ${path}`, 401]);
      }
    });

    it('refuses a platform account that is not a SUPER_ADMIN', async () => {
      const [tenantList, userList] = await Promise.all([
        api().get(`${API}/super-admin/tenants`).set(asPlatform(supportToken)),
        api().get(`${API}/super-admin/users`).set(asPlatform(supportToken)),
      ]);
      expect(tenantList.status).toBe(403);
      expect(userList.status).toBe(403);
    });

    it('validates query parameters at the boundary', async () => {
      const responses = await Promise.all([
        api().get(`${API}/super-admin/tenants`).query({ status: 'PENDING' }).set(asPlatform()),
        api().get(`${API}/super-admin/tenants`).query({ pageSize: 1000 }).set(asPlatform()),
        api().get(`${API}/super-admin/tenants`).query({ sort: 'password_hash' }).set(asPlatform()),
        api().get(`${API}/super-admin/users`).query({ tenantId: 'not-a-uuid' }).set(asPlatform()),
        api().get(`${API}/super-admin/tenants/not-a-uuid`).set(asPlatform()),
      ]);
      expect(responses.map((r) => r.status)).toEqual([400, 400, 400, 400, 400]);
    });
  });

  describe('tenant workspaces', () => {
    it('lists every workspace across the platform, paginated on the server', async () => {
      const all = await listTenants({ search: SUFFIX });
      expect(all.total).toBe(4);
      expect(all.items.map((t) => t.id).sort()).toEqual([...tenantIds].sort());

      const first = await listTenants({ search: SUFFIX, pageSize: 3, page: 1, sort: 'code', order: 'asc' });
      const second = await listTenants({ search: SUFFIX, pageSize: 3, page: 2, sort: 'code', order: 'asc' });
      expect([first.items.length, second.items.length, first.totalPages, first.total]).toEqual([3, 1, 2, 4]);
      expect(new Set([...first.items, ...second.items].map((t) => t.id)).size).toBe(4);
      expect((await listTenants({ search: SUFFIX, pageSize: 3, page: 3 })).items).toEqual([]);
    });

    it('shows stored values only, and nothing for what is not stored', async () => {
      const { items } = await listTenants({ search: SUFFIX });
      const empty = items.find((t) => t.id === tenants.empty);
      const team = items.find((t) => t.id === tenants.team);

      expect(empty).toMatchObject({
        owner: null,
        plan: null,
        subscriptionStatus: null,
        members: { current: 0, active: 0, suspended: 0, removed: 0, allTime: 0, accountsDisabled: 0 },
        seats: { limit: null, used: 0 },
        timezone: null,
        lastActivityAt: null,
        currency: 'INR',
      });
      expect(team).toMatchObject({
        owner: { userId: users.teamOwner, email: email('teamOwner') },
        // Removed members stay in the history but never use a seat.
        members: { current: 6, active: 5, suspended: 1, removed: 1, allTime: 7, accountsDisabled: 1 },
        seats: { limit: 5, used: 6 },
      });
    });

    it('searches by name, code, owner name and owner email', async () => {
      const ids = async (search: string) => (await listTenants({ search })).items.map((t) => t.id);

      expect(await ids(`Directory solo ${SUFFIX}`)).toEqual([tenants.solo]);
      expect(await ids(`PD${SUFFIX}TEAM`)).toEqual([tenants.team]);
      expect(await ids(email('teamOwner'))).toEqual([tenants.team]);
      expect(await ids(`Solo Owner ${SUFFIX}`)).toEqual([tenants.solo]);
      // The second administrator is not the owner.
      expect(await ids(`Team Second Admin ${SUFFIX}`)).toEqual([]);
      // LIKE wildcards in the search term are literal.
      expect(await ids(`%${SUFFIX}`)).toEqual([]);
    });

    it('filters by status, module switch and creation date', async () => {
      const ids = async (query: Record<string, string | boolean>) =>
        (await listTenants({ search: SUFFIX, ...query })).items.map((t) => t.id).sort();

      expect(await ids({ status: 'SUSPENDED' })).toEqual([tenants.suspended]);
      expect(await ids({ module: 'CRM', moduleEnabled: false })).toEqual([tenants.solo]);
      expect(await ids({ module: 'CRM', moduleEnabled: true })).toEqual([tenants.empty, tenants.team, tenants.suspended].sort());
      expect(await ids({ createdTo: '2020-12-31T23:59:59Z' })).toEqual([tenants.empty]);
      expect(await ids({ createdFrom: '2021-01-01T00:00:00Z' })).toEqual([tenants.solo, tenants.team, tenants.suspended].sort());
    });

    it('offers filter choices that exist in the data', async () => {
      const response = await api().get(`${API}/super-admin/tenants/filter-options`).set(asPlatform());
      expect(response.status).toBe(200);
      expect(response.body.data.statuses).toEqual(['ACTIVE', 'TRIALING', 'SUSPENDED']);
      expect(response.body.data.modules.map((m: { code: string }) => m.code)).toEqual(['CRM', 'HRMS', 'FINANCE']);
    });

    it('opens a workspace with its owner, members, roles and modules', async () => {
      const response = await api().get(`${API}/super-admin/tenants/${tenants.team}`).set(asPlatform());
      expect(response.status).toBe(200);
      const detail = response.body.data;

      expect(detail.overview).toMatchObject({ id: tenants.team, tenantCode: `PD${SUFFIX.toUpperCase()}TEAM`, subdomain: null, plan: null });
      expect(detail.owner).toMatchObject({ userId: users.teamOwner, email: email('teamOwner'), accountStatus: 'ACTIVE' });
      expect(detail.users).toEqual({
        total: 6,
        active: 5,
        suspended: 1,
        removed: 1,
        accountsDisabled: 1,
        seatsLimit: 5,
        seatsUsed: 6,
      });
      const roles = Object.fromEntries(detail.roles.map((r: { code: string }) => [r.code, r]));
      expect(roles[ADMIN_ROLE_CODE]).toMatchObject({ kind: 'OWNER', memberCount: 2, permissionCount: PERMISSION_KEYS.length });
      expect(roles.EMPLOYEE).toMatchObject({ kind: 'BUILT_IN', memberCount: 3 });
      expect(roles.FIELD_CLERK).toMatchObject({ kind: 'CUSTOM', memberCount: 1, permissionCount: 0 });
      expect(detail.modules.map((m: { code: string; enabled: boolean; features: string[] }) => [m.code, m.enabled, m.features])).toEqual([
        ['CRM', true, expect.arrayContaining(['Sales Pipelines'])],
        ['HRMS', true, ['People', 'Attendance', 'Onboarding', 'Performance', 'Compliance']],
        ['FINANCE', true, ['Payroll', 'Payslips', 'Bookkeeping', 'Reports']],
      ]);
    });

    it('shows the organization profile without any stored secret', async () => {
      const response = await api().get(`${API}/super-admin/tenants/${tenants.solo}`).set(asPlatform());
      expect(response.status).toBe(200);
      const detail = response.body.data;

      expect(detail.organization).toMatchObject({
        companyName: `Solo Industries ${SUFFIX}`,
        taxId: '24AAACS1234A1Z5',
        timezone: 'Asia/Kolkata',
        address: '1 Test Road, Ahmedabad',
        website: null,
      });
      const configured = Object.fromEntries(detail.health.configuration.map((c: { key: string; configured: boolean }) => [c.key, c.configured]));
      expect(configured).toMatchObject({ owner: true, taxId: true, smtp: true, cosec: true, whatsapp: false, seats: false, subscription: false });
      expect(detail.modules.find((m: { code: string }) => m.code === 'CRM').enabled).toBe(false);

      const raw = JSON.stringify(response.body);
      expect(raw).not.toContain(SMTP_CIPHERTEXT);
      expect(raw).not.toContain(COSEC_PASSWORD);
      expect(raw).not.toContain('passwordEncrypted');
    });

    it('reports an empty workspace as empty, not with borrowed values', async () => {
      const response = await api().get(`${API}/super-admin/tenants/${tenants.empty}`).set(asPlatform());
      expect(response.status).toBe(200);
      const detail = response.body.data;

      expect(detail.owner).toBeNull();
      expect(detail.users).toEqual({ total: 0, active: 0, suspended: 0, removed: 0, accountsDisabled: 0, seatsLimit: null, seatsUsed: 0 });
      expect(detail.roles).toEqual([]);
      expect(detail.organization).toMatchObject({ contactName: null, contactEmail: null, taxId: null, timezone: null });
      expect(detail.health).toMatchObject({ lastActivityAt: null, activeSessions: 0, ownerLastLoginAt: null });
      expect(detail.health.configuration.every((c: { configured: boolean }) => c.configured === false)).toBe(true);
    });

    it('answers 404 for a workspace that does not exist', async () => {
      const response = await api().get(`${API}/super-admin/tenants/${randomUUID()}`).set(asPlatform());
      expect(response.status).toBe(404);
    });

    it('agrees with the workspace’s own settings page about who the owner is', async () => {
      const login = await tenantLogin('teamOwner');
      const settings = await api().get(`${API}/tenant/settings`).set({ Authorization: `Bearer ${login.body.token}` });
      const detail = await api().get(`${API}/super-admin/tenants/${tenants.team}`).set(asPlatform());

      expect(settings.body.data.tenant.primary_contact_email).toBe(detail.body.data.owner.email);
    });
  });

  describe('suspending and reactivating a workspace', () => {
    it('locks every member out at once, and lets them back in on reactivation, with an audit trail', async () => {
      const login = await tenantLogin('soloOwner');
      const member = { Authorization: `Bearer ${login.body.token}` };
      expect((await api().get(`${API}/tenant/current`).set(member)).status).toBe(200);

      const suspend = await api().post(`${API}/super-admin/tenants/${tenants.solo}/suspend`).set(asPlatform());
      expect(suspend.status).toBe(200);
      expect((await api().get(`${API}/tenant/current`).set(member)).status).toBe(403);
      expect((await api().post(`${API}/super-admin/tenants/${tenants.solo}/suspend`).set(asPlatform())).status).toBe(409);

      const reactivate = await api().post(`${API}/super-admin/tenants/${tenants.solo}/reactivate`).set(asPlatform());
      expect(reactivate.status).toBe(200);
      expect((await api().get(`${API}/tenant/current`).set(member)).status).toBe(200);
      expect((await api().post(`${API}/super-admin/tenants/${tenants.solo}/reactivate`).set(asPlatform())).status).toBe(409);

      const activity = await api().get(`${API}/super-admin/tenants/${tenants.solo}/activity`).set(asPlatform());
      expect(activity.status).toBe(200);
      expect(activity.body.data.items.slice(0, 2).map((a: { action: string; source: string; actor: { name: string } }) => [a.source, a.action, a.actor.name])).toEqual([
        ['PLATFORM', 'TENANT_REACTIVATED', 'Directory operator'],
        ['PLATFORM', 'TENANT_SUSPENDED', 'Directory operator'],
      ]);
    });
  });

  describe('user management', () => {
    it('lists every account once, with all of its workspace memberships', async () => {
      const page = await listUsers({ search: SUFFIX, pageSize: 100 });
      expect(page.total).toBe(8);
      expect(new Set(page.items.map((u) => u.id)).size).toBe(8);

      const multi = page.items.find((u) => u.id === users.multi);
      expect(multi?.memberships.map((m: { tenantId: string }) => m.tenantId).sort()).toEqual([tenants.solo, tenants.team].sort());
      const owner = page.items.find((u) => u.id === users.teamOwner);
      expect(owner?.memberships[0].roles).toEqual([{ code: ADMIN_ROLE_CODE, name: `${ADMIN_ROLE_CODE} role`, kind: 'OWNER' }]);
    });

    it('filters by workspace, keeping each workspace’s people in it', async () => {
      const team = await listUsers({ tenantId: tenants.team, pageSize: 100 });
      const solo = await listUsers({ tenantId: tenants.solo, pageSize: 100 });

      expect(team.items.map((u) => u.id).sort()).toEqual(
        [users.teamOwner, users.teamAdmin, users.multi, users.suspendedMember, users.removed, users.disabled, users.clerk].sort(),
      );
      expect(solo.items.map((u) => u.id).sort()).toEqual([users.soloOwner, users.multi].sort());
      expect((await listUsers({ tenantId: tenants.empty })).total).toBe(0);
    });

    it('filters by role, membership status and global account status', async () => {
      const ids = async (query: Record<string, string>) => (await listUsers({ pageSize: 100, ...query })).items.map((u) => u.id).sort();

      expect(await ids({ tenantId: tenants.team, roleCode: ADMIN_ROLE_CODE })).toEqual([users.teamOwner, users.teamAdmin].sort());
      expect(await ids({ tenantId: tenants.team, membershipStatus: 'SUSPENDED' })).toEqual([users.suspendedMember]);
      expect(await ids({ tenantId: tenants.team, membershipStatus: 'ARCHIVED' })).toEqual([users.removed]);
      expect(await ids({ search: SUFFIX, accountStatus: 'DISABLED' })).toEqual([users.disabled]);
      // Workspace, role and status must hold for the same membership.
      expect(await ids({ tenantId: tenants.solo, roleCode: 'FIELD_CLERK' })).toEqual([]);
    });

    it('searches by name, email, phone and workspace', async () => {
      const ids = async (search: string) => (await listUsers({ search, pageSize: 100 })).items.map((u) => u.id).sort();

      expect(await ids(`Field Clerk ${SUFFIX}`)).toEqual([users.clerk]);
      expect(await ids(email('removed'))).toEqual([users.removed]);
      expect(await ids(`90000 ${SUFFIX.slice(0, 5)}`)).toEqual([users.soloOwner]);
      expect(await ids(`PD${SUFFIX}SOLO`)).toEqual([users.soloOwner, users.multi].sort());
    });

    it('offers role choices per workspace or across workspaces', async () => {
      const team = await api().get(`${API}/super-admin/users/role-options`).query({ tenantId: tenants.team }).set(asPlatform());
      expect(team.body.data.map((r: { code: string }) => r.code).sort()).toEqual([ADMIN_ROLE_CODE, 'EMPLOYEE', 'FIELD_CLERK']);
      const all = await api().get(`${API}/super-admin/users/role-options`).set(asPlatform());
      expect(all.body.data.map((r: { code: string }) => r.code)).toEqual(expect.arrayContaining([ADMIN_ROLE_CODE, 'FIELD_CLERK']));
    });

    it('opens an account with its memberships and real session details, and no secrets', async () => {
      const login = await tenantLogin('teamOwner');
      expect(login.status).toBe(200);

      const response = await api().get(`${API}/super-admin/users/${users.teamOwner}`).set(asPlatform());
      expect(response.status).toBe(200);
      const detail = response.body.data;

      expect(detail.identity).toMatchObject({ id: users.teamOwner, email: email('teamOwner') });
      expect(detail.account.status).toBe('ACTIVE');
      expect(detail.memberships).toEqual([
        expect.objectContaining({ tenantId: tenants.team, membershipStatus: 'ACTIVE', roles: [expect.objectContaining({ kind: 'OWNER' })] }),
      ]);
      expect(detail.sessions.active).toBeGreaterThanOrEqual(1);
      expect(detail.sessions.recent[0]).toMatchObject({ isActive: true, userAgent: USER_AGENT, workspace: { tenantId: tenants.team } });

      const raw = JSON.stringify(response.body);
      expect(raw).not.toMatch(/password|token_hash|tokenHash/i);
    });

    it('shows every workspace a multi-workspace account belongs to', async () => {
      const response = await api().get(`${API}/super-admin/users/${users.multi}`).set(asPlatform());
      expect(response.body.data.memberships.map((m: { tenantId: string }) => m.tenantId).sort()).toEqual([tenants.solo, tenants.team].sort());
      expect((await api().get(`${API}/super-admin/users/${randomUUID()}`).set(asPlatform())).status).toBe(404);
    });
  });

  describe('disabling a global account', () => {
    it('signs the person out everywhere and blocks sign-in, without touching memberships', async () => {
      const login = await tenantLogin('clerk');
      expect(login.status).toBe(200);
      const session = { Authorization: `Bearer ${login.body.token}` };
      expect((await api().get(`${API}/tenant/current`).set(session)).status).toBe(200);

      const disable = await api().post(`${API}/super-admin/users/${users.clerk}/disable`).set(asPlatform());
      expect(disable.status).toBe(200);
      expect(disable.body.data).toMatchObject({ accountStatus: 'DISABLED', revokedSessions: 1 });
      expect((await api().get(`${API}/tenant/current`).set(session)).status).toBe(401);
      expect((await tenantLogin('clerk')).status).toBe(401);
      expect((await api().post(`${API}/super-admin/users/${users.clerk}/disable`).set(asPlatform())).status).toBe(409);

      const membership = await prisma.rndtechnosoft_tenant_members.findFirst({ where: { user_id: users.clerk } });
      expect(membership?.membership_status).toBe('ACTIVE');

      const enable = await api().post(`${API}/super-admin/users/${users.clerk}/enable`).set(asPlatform());
      expect(enable.status).toBe(200);
      expect((await tenantLogin('clerk')).status).toBe(200);
      expect((await api().post(`${API}/super-admin/users/${users.clerk}/enable`).set(asPlatform())).status).toBe(409);

      const detail = await api().get(`${API}/super-admin/users/${users.clerk}`).set(asPlatform());
      expect(
        detail.body.data.securityEvents
          .filter((e: { source: string }) => e.source === 'PLATFORM')
          .map((e: { action: string; actor: string }) => [e.action, e.actor]),
      ).toEqual([
        ['USER_ACCOUNT_ENABLED', 'Directory operator'],
        ['USER_ACCOUNT_DISABLED', 'Directory operator'],
      ]);
    });
  });

  describe('real workspaces', () => {
    it('keeps each existing workspace’s owner and members inside that workspace', async () => {
      const existing = await prisma.rndtechnosoft_tenants.findMany({
        where: { id: { notIn: tenantIds } },
        select: { id: true, tenant_code: true },
      });

      for (const tenant of existing) {
        const detail = await api().get(`${API}/super-admin/tenants/${tenant.id}`).set(asPlatform());
        expect([tenant.tenant_code, detail.status]).toEqual([tenant.tenant_code, 200]);
        if (detail.body.data.owner) {
          const membership = await prisma.rndtechnosoft_tenant_members.findFirst({
            where: { tenant_id: tenant.id, user_id: detail.body.data.owner.userId },
          });
          expect([tenant.tenant_code, Boolean(membership)]).toEqual([tenant.tenant_code, true]);
        }

        const members = await listUsers({ tenantId: tenant.id, pageSize: 100 });
        for (const user of members.items) {
          expect([tenant.tenant_code, user.memberships.some((m: { tenantId: string }) => m.tenantId === tenant.id)]).toEqual([
            tenant.tenant_code,
            true,
          ]);
        }
      }
    });
  });
});
