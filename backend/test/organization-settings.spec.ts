import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ADMIN_ROLE_CODE, PERMISSIONS, PERMISSION_KEYS, permissionModule } from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';

/**
 * Organization settings, team, roles and modules across two workspaces.
 *
 * Tenant A ("Northwind") has a saved organization profile, like RND
 * TECHNOSOFT. Tenant B ("Southgate") was registered and never saved one, like
 * KPMG. Every assertion is a rule the product depends on: each session sees and
 * changes only its own workspace, and ids from another workspace behave as if
 * they did not exist.
 */

const API = '/api/v1';
const PASSWORD = 'Org-Settings-Suite-Password-1';

interface Actor {
  email: string;
  userId: string;
  memberId: string;
  token: string;
}

describe('Organization settings and tenant access control', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  let tenantA: string;
  let tenantB: string;
  let adminRoleA: string;
  let employeeRoleA: string;
  let adminRoleB: string;
  let adminA: Actor;
  let employeeA: Actor;
  let hrA: Actor;
  let delegateA: Actor;
  let adminB: Actor;
  let employeeB: Actor;

  const PROFILE_A = {
    company_name: 'Northwind Consulting',
    tax_gstin: '27AAACN1234F1Z5',
    website_url: 'https://northwind.example',
    primary_contact_name: 'Nadia North',
    primary_contact_email: 'contact@northwind.example',
    primary_contact_phone: '+91 9800000001',
    company_address: '1 North Road, Mumbai',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
  };

  const api = () => request(app.getHttpServer());
  const as = (actor: Actor) => ({ Authorization: `Bearer ${actor.token}` });

  async function createTenant(name: string, profile?: Prisma.InputJsonObject): Promise<string> {
    const id = randomUUID();
    await prisma.rndtechnosoft_tenants.create({
      data: {
        id,
        tenant_code: `T${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`,
        legal_name: `${name} Private Limited`,
        display_name: name,
        default_currency_code: 'INR',
        tenant_status: 'ACTIVE',
      },
    });
    await prisma.rndtechnosoft_tenant_settings.create({
      data: {
        id: randomUUID(),
        tenant_id: id,
        settings: { timezone: 'Asia/Kolkata', ...(profile ? { profile } : {}) },
      },
    });
    tenantIds.push(id);
    return id;
  }

  /**
   * Creates a role the way the product does: the defaults for its code via
   * grantDefaultRolePermissions, plus any extra grants a test needs.
   */
  async function createRole(
    tenantId: string,
    code: string,
    extraPermissions: readonly string[] = [],
    { isSystem = true, withDefaults = true }: { isSystem?: boolean; withDefaults?: boolean } = {},
  ) {
    const role = await prisma.rndtechnosoft_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        role_code: code,
        role_name: code,
        is_system_role: isSystem,
        role_status: 'ACTIVE',
      },
    });
    if (withDefaults) {
      await grantDefaultRolePermissions(prisma, tenantId, role.id, code);
    }
    const catalog = await prisma.rndtechnosoft_permissions.findMany({
      where: { permission_code: { in: [...extraPermissions] } },
    });
    await prisma.rndtechnosoft_role_permissions.createMany({
      data: catalog.map((permission) => ({ id: randomUUID(), tenant_id: tenantId, role_id: role.id, permission_id: permission.id })),
      skipDuplicates: true,
    });
    return role.id;
  }

  async function seedMember(tenantId: string, roleId: string, label: string): Promise<Actor> {
    const email = `org-${label}-${randomUUID()}@settings.test`;
    userEmails.push(email);
    const user = await prisma.rndtechnosoft_users.create({
      data: {
        id: randomUUID(),
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `Member ${label}`,
        user_status: 'ACTIVE',
      },
    });
    const member = await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        user_id: user.id,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: member.id, role_id: roleId },
    });
    return { email, userId: user.id, memberId: member.id, token: await signIn(email, PASSWORD) };
  }

  async function signIn(email: string, password: string): Promise<string> {
    const response = await api().post(`${API}/auth/login`).send({ email, password });
    expect(response.status).toBe(200);
    return response.body.token;
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

    tenantA = await createTenant('Northwind Consulting', PROFILE_A);
    tenantB = await createTenant('Southgate Advisory');

    adminRoleA = await createRole(tenantA, ADMIN_ROLE_CODE);
    employeeRoleA = await createRole(tenantA, 'EMPLOYEE');
    const hrRoleA = await createRole(tenantA, 'HR_ACCOUNTANT');
    // Can manage people and roles, but holds no organization or module rights.
    const delegateRoleA = await createRole(
      tenantA,
      'PEOPLE_LEAD',
      ['users.view', 'users.update', 'roles.view', 'roles.update'],
      { isSystem: false },
    );
    adminRoleB = await createRole(tenantB, ADMIN_ROLE_CODE);
    const employeeRoleB = await createRole(tenantB, 'EMPLOYEE');

    // Owner first: the earliest administrator is the workspace owner.
    adminB = await seedMember(tenantB, adminRoleB, 'admin-b');
    adminA = await seedMember(tenantA, adminRoleA, 'admin-a');
    employeeA = await seedMember(tenantA, employeeRoleA, 'employee-a');
    hrA = await seedMember(tenantA, hrRoleA, 'hr-a');
    delegateA = await seedMember(tenantA, delegateRoleA, 'delegate-a');
    employeeB = await seedMember(tenantB, employeeRoleB, 'employee-b');
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({
        where: { email: { in: userEmails } },
        select: { id: true },
      });
      const userIds = users.map((u) => u.id);
      const tenantScope = { tenant_id: { in: tenantIds } };

      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_crm_audit_logs.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_crm_clients.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: tenantScope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  describe('permission catalog', () => {
    it('is installed with exactly the keys the application enforces', async () => {
      const rows = await prisma.rndtechnosoft_permissions.findMany({
        where: { permission_code: { in: [...PERMISSION_KEYS] } },
        select: { permission_code: true },
      });
      expect(rows.map((r) => r.permission_code).sort()).toEqual([...PERMISSION_KEYS].sort());
    });

    it('records the business module that owns each permission', async () => {
      const rows = await prisma.rndtechnosoft_permissions.findMany({
        where: { permission_code: { in: [...PERMISSION_KEYS] } },
        select: { permission_code: true, module_code: true },
      });
      const stored = Object.fromEntries(rows.map((r) => [r.permission_code, r.module_code]));
      const expected = Object.fromEntries(
        PERMISSIONS.map((p) => [p.key, permissionModule(p.key) ?? p.section.toUpperCase()]),
      );
      expect(stored).toEqual(expected);
    });
  });

  describe('organization profile', () => {
    it('shows a workspace without a saved profile its own identity, never another organization’s', async () => {
      const response = await api().get(`${API}/tenant/settings`).set(as(adminB));

      expect(response.status).toBe(200);
      const profile = response.body.data.tenant;
      expect(profile.id).toBe(tenantB);
      expect(profile.company_name).toBe('Southgate Advisory');
      expect(profile.legal_name).toBe('Southgate Advisory Private Limited');
      // The owner's address stands in for a contact until one is saved.
      expect(profile.primary_contact_email).toBe(adminB.email);
      expect(profile.contact_is_workspace_owner).toBe(true);
      expect(profile.tax_gstin).toBeNull();
      expect(profile.website_url).toBeNull();
      expect(profile.company_address).toBeNull();

      const serialized = JSON.stringify(response.body);
      for (const value of Object.values(PROFILE_A)) {
        if (value !== 'INR' && value !== 'Asia/Kolkata') expect(serialized).not.toContain(value);
      }
      for (const legacyDefault of ['RND Technosoft', 'ravi@rndtechnosoft.com', 'Ravi Shah', '27AABCU9603R1ZM', 'rndtechnosoft.com']) {
        expect(serialized).not.toContain(legacyDefault);
      }
    });

    it('shows a workspace its saved profile', async () => {
      const response = await api().get(`${API}/tenant/settings`).set(as(adminA));

      expect(response.status).toBe(200);
      expect(response.body.data.tenant).toMatchObject({
        id: tenantA,
        company_name: PROFILE_A.company_name,
        primary_contact_email: PROFILE_A.primary_contact_email,
        tax_gstin: PROFILE_A.tax_gstin,
        contact_is_workspace_owner: false,
      });
    });

    it('ignores a tenant id supplied by the caller', async () => {
      const response = await api()
        .get(`${API}/tenant/settings`)
        .query({ tenantId: tenantA })
        .set('x-tenant-id', tenantA)
        .set(as(adminB));

      expect(response.status).toBe(200);
      expect(response.body.data.tenant.id).toBe(tenantB);
    });

    it('saves a profile for the session’s workspace only', async () => {
      const response = await api()
        .put(`${API}/tenant/settings/profile`)
        .set(as(adminB))
        .send({
          company_name: 'Southgate Advisory LLP',
          industry_type: 'CONSULTING',
          currency: 'USD',
          timezone: 'Europe/London',
          tax_gstin: '',
          website_url: 'https://southgate.example',
          primary_contact_name: 'Sam South',
          primary_contact_email: 'office@southgate.example',
          primary_contact_phone: '',
          company_address: '',
        });

      expect(response.status).toBe(200);
      expect(response.body.data.company_name).toBe('Southgate Advisory LLP');

      const [b, a] = await Promise.all([
        prisma.rndtechnosoft_tenants.findUnique({ where: { id: tenantB } }),
        api().get(`${API}/tenant/settings`).set(as(adminA)),
      ]);
      expect(b?.display_name).toBe('Southgate Advisory LLP');
      expect(b?.default_currency_code).toBe('USD');
      expect(a.body.data.tenant.company_name).toBe(PROFILE_A.company_name);
    });

    it('rejects invalid profile input at the API boundary', async () => {
      const response = await api()
        .put(`${API}/tenant/settings/profile`)
        .set(as(adminB))
        .send({ company_name: 'X', currency: 'RUPEES', timezone: 'Mars/Base', primary_contact_email: 'nope' });

      expect(response.status).toBe(400);
    });

    it('does not return the settings document from /tenant/current', async () => {
      const response = await api().get(`${API}/tenant/current`).set(as(employeeA));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(tenantA);
      expect(response.body.rndtechnosoft_tenant_settings).toBeUndefined();
    });
  });

  describe('SMTP and WhatsApp credentials', () => {
    const SMTP_PASSWORD = 'smtp-secret-value-123';
    const WHATSAPP_TOKEN = 'EAAG-secret-access-token-value';

    it('stores the SMTP password encrypted and never returns it', async () => {
      const save = await api()
        .put(`${API}/tenant/settings/smtp`)
        .set(as(adminB))
        .send({
          host: 'smtp.saved-host.invalid',
          port: 587,
          username: 'mailer@southgate.example',
          password: SMTP_PASSWORD,
          senderName: 'Southgate',
          senderEmail: 'mailer@southgate.example',
          replyToEmail: '',
          encryption: 'TLS',
          isActive: true,
        });
      expect(save.status).toBe(200);
      expect(JSON.stringify(save.body)).not.toContain(SMTP_PASSWORD);

      const read = await api().get(`${API}/tenant/settings`).set(as(adminB));
      expect(read.body.data.smtp).toMatchObject({ host: 'smtp.saved-host.invalid', hasPassword: true });
      expect(JSON.stringify(read.body)).not.toContain(SMTP_PASSWORD);

      const stored = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantB } });
      const smtp = (stored?.settings as { smtp: Record<string, unknown> }).smtp;
      expect(JSON.stringify(smtp)).not.toContain(SMTP_PASSWORD);
      expect(String(smtp.passwordEncrypted)).toMatch(/^v1\./);
    });

    it('keeps the stored password when a save leaves it blank', async () => {
      const before = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantB } });
      const encryptedBefore = (before?.settings as { smtp: { passwordEncrypted: string } }).smtp.passwordEncrypted;

      const save = await api()
        .put(`${API}/tenant/settings/smtp`)
        .set(as(adminB))
        .send({
          host: 'smtp.saved-host.invalid',
          port: 587,
          username: 'mailer@southgate.example',
          password: '',
          senderName: 'Southgate Mail',
          senderEmail: 'mailer@southgate.example',
          encryption: 'TLS',
          isActive: true,
        });
      expect(save.status).toBe(200);

      const after = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantB } });
      expect((after?.settings as { smtp: { passwordEncrypted: string } }).smtp.passwordEncrypted).toBe(encryptedBefore);
    });

    it('never sends the saved password to a host named in the test request', async () => {
      const response = await api()
        .post(`${API}/tenant/settings/smtp/test`)
        .set(as(adminB))
        .send({ host: 'attacker.example.com', port: 587, username: 'x' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('smtp.saved-host.invalid');
      expect(response.body.error).not.toContain('attacker');
    });

    it('stores WhatsApp tokens encrypted and returns only whether they are set', async () => {
      const save = await api()
        .put(`${API}/tenant/settings/whatsapp`)
        .set(as(adminB))
        .send({
          provider: 'META_CLOUD_API',
          wabaId: '209876543210987',
          phoneNumberId: '109876543210987',
          senderPhoneNumber: '+44 7700900123',
          accessToken: WHATSAPP_TOKEN,
          webhookVerifyToken: 'southgate-verify-token',
          isActive: true,
        });
      expect(save.status).toBe(200);

      const read = await api().get(`${API}/tenant/settings`).set(as(adminB));
      expect(read.body.data.whatsapp).toMatchObject({
        phoneNumberId: '109876543210987',
        hasAccessToken: true,
        hasWebhookVerifyToken: true,
      });
      const serialized = JSON.stringify(read.body);
      expect(serialized).not.toContain(WHATSAPP_TOKEN);
      expect(serialized).not.toContain('southgate-verify-token');
    });

    it('encrypts secrets that earlier builds stored in plaintext', async () => {
      const legacyTenant = await createTenant('Legacy Plaintext Co');
      await prisma.rndtechnosoft_tenant_settings.update({
        where: { tenant_id: legacyTenant },
        data: {
          settings: {
            smtp: { host: 'smtp.legacy.invalid', port: 587, password: 'legacy-smtp-pass', hasPassword: true },
            whatsapp: {
              phoneNumberId: '100000000000001',
              accessToken: 'legacy-access-token',
              webhookVerifyToken: 'rnd_voogyo_verify_token_2026',
            },
          },
        },
      });

      await app.get(OrganizationSettingsService).onApplicationBootstrap();

      const stored = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: legacyTenant } });
      const serialized = JSON.stringify(stored?.settings);
      expect(serialized).not.toContain('legacy-smtp-pass');
      expect(serialized).not.toContain('legacy-access-token');
      const settings = stored?.settings as { smtp: Record<string, unknown>; whatsapp: Record<string, unknown> };
      expect(String(settings.smtp.passwordEncrypted)).toMatch(/^v1\./);
      expect(String(settings.whatsapp.accessTokenEncrypted)).toMatch(/^v1\./);
      // The shared default published in source is dropped rather than kept as a secret.
      expect(settings.whatsapp.webhookVerifyTokenEncrypted).toBeNull();
    });

    it('keeps one workspace’s channels invisible to another', async () => {
      const response = await api().get(`${API}/tenant/settings`).set(as(adminA));

      expect(response.body.data.smtp).toBeNull();
      expect(response.body.data.whatsapp).toBeNull();
    });
  });

  describe('team members', () => {
    it('lists only members of the session’s workspace', async () => {
      const response = await api().get(`${API}/users`).set(as(adminB));

      expect(response.status).toBe(200);
      const ids: string[] = response.body.data.users.map((u: { id: string }) => u.id);
      expect(ids).toContain(adminB.userId);
      expect(ids).not.toContain(adminA.userId);
      expect(ids).not.toContain(employeeA.userId);

      const roleIds: string[] = response.body.data.roles.map((r: { id: string }) => r.id);
      expect(roleIds).not.toContain(adminRoleA);
      expect(roleIds).toContain(adminRoleB);
    });

    it('adds a new person to the session’s workspace with a one-time password', async () => {
      const email = `new-member-${randomUUID()}@settings.test`;
      userEmails.push(email);

      const response = await api()
        .post(`${API}/users`)
        .set(as(adminB))
        .send({ email, first_name: 'Nina', last_name: 'New', phone: '', role_id: adminRoleB });

      expect(response.status).toBe(201);
      const temporaryPassword: string = response.body.data.temporaryPassword;
      expect(temporaryPassword.length).toBeGreaterThanOrEqual(16);

      const membership = await prisma.rndtechnosoft_tenant_members.findFirst({
        where: { user_id: response.body.data.id },
      });
      expect(membership?.tenant_id).toBe(tenantB);

      const user = await prisma.rndtechnosoft_users.findUnique({ where: { email } });
      expect(user?.password_hash).toMatch(/^scrypt\$/);
      // The retired shared default must not open the account.
      const legacy = await api().post(`${API}/auth/login`).send({ email, password: 'Voogyo@2026!' });
      expect(legacy.status).toBe(401);
      expect(await signIn(email, temporaryPassword)).toBeTruthy();
    });

    it('refuses a role that belongs to another workspace', async () => {
      const email = `cross-role-${randomUUID()}@settings.test`;
      const response = await api()
        .post(`${API}/users`)
        .set(as(adminB))
        .send({ email, first_name: 'Cross', role_id: adminRoleA });

      expect(response.status).toBe(404);
      expect(await prisma.rndtechnosoft_users.count({ where: { email } })).toBe(0);
    });

    it('cannot edit or deactivate a member of another workspace', async () => {
      const before = await prisma.rndtechnosoft_users.findUnique({ where: { id: employeeA.userId } });

      const response = await api()
        .patch(`${API}/users/${employeeA.userId}`)
        .set(as(adminB))
        .send({ first_name: 'Hijacked', is_active: false });

      expect(response.status).toBe(404);
      const after = await prisma.rndtechnosoft_users.findUnique({ where: { id: employeeA.userId } });
      expect(after?.display_name).toBe(before?.display_name);
      expect(after?.user_status).toBe('ACTIVE');
    });

    it('cannot remove a member of another workspace', async () => {
      const response = await api().delete(`${API}/users/${employeeA.userId}`).set(as(adminB));

      expect(response.status).toBe(404);
      const membership = await prisma.rndtechnosoft_tenant_members.findUnique({ where: { id: employeeA.memberId } });
      expect(membership?.membership_status).toBe('ACTIVE');
    });

    it('does not let a member promote themselves', async () => {
      const response = await api()
        .patch(`${API}/users/${employeeA.userId}`)
        .set(as(employeeA))
        .send({ role_id: adminRoleA });

      expect(response.status).toBe(403);
      const roles = await prisma.rndtechnosoft_tenant_member_roles.findMany({
        where: { tenant_member_id: employeeA.memberId },
      });
      expect(roles.map((r) => r.role_id)).toEqual([employeeRoleA]);
    });

    it('does not let a delegated manager hand out the Administrator role', async () => {
      const response = await api()
        .patch(`${API}/users/${employeeA.userId}`)
        .set(as(delegateA))
        .send({ role_id: adminRoleA });

      expect(response.status).toBe(403);
    });

    it('suspends access to one workspace without disabling the account', async () => {
      const token = await signIn(employeeA.email, PASSWORD);

      const response = await api()
        .patch(`${API}/users/${employeeA.userId}`)
        .set(as(adminA))
        .send({ is_active: false });
      expect(response.status).toBe(200);

      const user = await prisma.rndtechnosoft_users.findUnique({ where: { id: employeeA.userId } });
      expect(user?.user_status).toBe('ACTIVE');
      const me = await api().get(`${API}/auth/me`).set({ Authorization: `Bearer ${token}` });
      expect([401, 403]).toContain(me.status);

      const restore = await api().patch(`${API}/users/${employeeA.userId}`).set(as(adminA)).send({ is_active: true });
      expect(restore.status).toBe(200);
      employeeA.token = await signIn(employeeA.email, PASSWORD);
    });

    it('keeps at least one active administrator', async () => {
      const response = await api().delete(`${API}/users/${adminB.userId}`).set(as(adminB));
      expect(response.status).toBe(400);
    });
  });

  describe('roles and permissions', () => {
    it('lists only the session workspace’s roles', async () => {
      const response = await api().get(`${API}/tenant/roles`).set(as(adminB));

      expect(response.status).toBe(200);
      const ids: string[] = response.body.data.roles.map((r: { id: string }) => r.id);
      expect(ids).toContain(adminRoleB);
      expect(ids).not.toContain(adminRoleA);
      expect(ids).not.toContain(employeeRoleA);
    });

    it('cannot rename, delete or change permissions of another workspace’s role', async () => {
      const rename = await api().patch(`${API}/tenant/roles/${employeeRoleA}`).set(as(adminB)).send({ name: 'Taken over' });
      const grant = await api()
        .put(`${API}/tenant/roles/${employeeRoleA}/permissions`)
        .set(as(adminB))
        .send({ permissionKey: 'organization.update', granted: true });
      const remove = await api().delete(`${API}/tenant/roles/${employeeRoleA}`).set(as(adminB));

      expect([rename.status, grant.status, remove.status]).toEqual([404, 404, 404]);
      const role = await prisma.rndtechnosoft_roles.findUnique({ where: { id: employeeRoleA } });
      expect(role?.role_name).toBe('EMPLOYEE');
      // The grant attempted from the other workspace did not land.
      expect(
        await prisma.rndtechnosoft_role_permissions.count({
          where: { role_id: employeeRoleA, rndtechnosoft_permissions: { permission_code: 'organization.update' } },
        }),
      ).toBe(0);
    });

    it('only accepts permissions from the catalog', async () => {
      const before = await prisma.rndtechnosoft_permissions.count();
      const response = await api()
        .put(`${API}/tenant/roles/${employeeRoleA}/permissions`)
        .set(as(adminA))
        .send({ permissionKey: 'EVERYTHING_ALL', granted: true });

      expect(response.status).toBe(400);
      expect(await prisma.rndtechnosoft_permissions.count()).toBe(before);
    });

    it('does not let a member grant a permission they do not hold', async () => {
      const response = await api()
        .put(`${API}/tenant/roles/${employeeRoleA}/permissions`)
        .set(as(delegateA))
        .send({ permissionKey: 'organization.update', granted: true });

      expect(response.status).toBe(403);
    });

    it('creates, grants, and deletes a custom role inside the workspace', async () => {
      const created = await api().post(`${API}/tenant/roles`).set(as(adminB)).send({ name: 'Sales Manager' });
      expect(created.status).toBe(201);
      const roleId: string = created.body.data.id;

      const role = await prisma.rndtechnosoft_roles.findUnique({ where: { id: roleId } });
      expect(role?.tenant_id).toBe(tenantB);

      const grant = await api()
        .put(`${API}/tenant/roles/${roleId}/permissions`)
        .set(as(adminB))
        .send({ permissionKey: 'leads.view', granted: true });
      expect(grant.status).toBe(200);

      const duplicateName = await api().post(`${API}/tenant/roles`).set(as(adminB)).send({ name: 'sales manager' });
      expect(duplicateName.status).toBe(409);

      const removed = await api().delete(`${API}/tenant/roles/${roleId}`).set(as(adminB));
      expect(removed.status).toBe(200);
      expect(await prisma.rndtechnosoft_roles.count({ where: { id: roleId } })).toBe(0);
    });
  });

  describe('workspace owner access comes from role permissions', () => {
    /**
     * One request per permission, chosen so an authorized caller is stopped by
     * validation or "not found" rather than changing data: 200/400/404 means
     * the permission check passed, 403 means it did not.
     */
    const OWNER_PERMISSION_CHECKS: { permission: string; method: 'get' | 'put' | 'post' | 'patch' | 'delete'; path: string; body?: object }[] = [
      { permission: 'organization.view', method: 'get', path: '/tenant/settings' },
      { permission: 'organization.update', method: 'put', path: '/tenant/settings/profile', body: {} },
      { permission: 'users.view', method: 'get', path: '/users' },
      { permission: 'users.create', method: 'post', path: '/users', body: {} },
      { permission: 'users.update', method: 'patch', path: `/users/${randomUUID()}`, body: {} },
      { permission: 'users.delete', method: 'delete', path: `/users/${randomUUID()}` },
      { permission: 'roles.view', method: 'get', path: '/tenant/roles' },
      { permission: 'roles.create', method: 'post', path: '/tenant/roles', body: {} },
      { permission: 'roles.update', method: 'patch', path: `/tenant/roles/${randomUUID()}`, body: {} },
      { permission: 'roles.delete', method: 'delete', path: `/tenant/roles/${randomUUID()}` },
      { permission: 'modules.view', method: 'get', path: '/tenant/modules' },
      { permission: 'modules.update', method: 'put', path: '/tenant/modules/CRM', body: {} },
    ];

    const send = (actor: Actor, check: (typeof OWNER_PERMISSION_CHECKS)[number]) => {
      const req = api()[check.method](`${API}${check.path}`).set(as(actor));
      return check.body ? req.send(check.body) : req;
    };

    it('stores every catalog permission on every workspace owner role in the database', async () => {
      const owners = await prisma.rndtechnosoft_roles.findMany({
        where: { role_code: ADMIN_ROLE_CODE },
        select: {
          id: true,
          rndtechnosoft_tenants: { select: { tenant_code: true } },
          rndtechnosoft_role_permissions: { select: { rndtechnosoft_permissions: { select: { permission_code: true } } } },
        },
      });
      expect(owners.length).toBeGreaterThan(0);

      const missing = owners
        .map((role) => ({
          tenant: role.rndtechnosoft_tenants.tenant_code,
          missing: PERMISSION_KEYS.filter(
            (key) => !role.rndtechnosoft_role_permissions.some((g) => g.rndtechnosoft_permissions.permission_code === key),
          ),
        }))
        .filter((row) => row.missing.length > 0);
      expect(missing).toEqual([]);
    });

    it.each([
      ['workspace A', () => adminA],
      ['workspace B', () => adminB],
    ])('lets the %s owner use every organization settings permission', async (_label, owner) => {
      const me = await api().get(`${API}/auth/me`).set(as(owner()));
      expect(me.body.access.permissions).toEqual(expect.arrayContaining(OWNER_PERMISSION_CHECKS.map((c) => c.permission)));

      const statuses = await Promise.all(OWNER_PERMISSION_CHECKS.map((check) => send(owner(), check).then((r) => [check.permission, r.status])));
      for (const [permission, status] of statuses) {
        expect([permission, [200, 400, 404].includes(status as number)]).toEqual([permission, true]);
      }
    });

    it.each([
      ['workspace A', () => employeeA],
      ['workspace B', () => employeeB],
    ])('refuses every organization settings permission to a %s employee', async (_label, employee) => {
      const statuses = await Promise.all(OWNER_PERMISSION_CHECKS.map((check) => send(employee(), check).then((r) => [check.permission, r.status])));
      expect(statuses).toEqual(OWNER_PERMISSION_CHECKS.map((check) => [check.permission, 403]));
    });

    it('does not authorize a role by its code: an owner role without permission rows is refused', async () => {
      const tenantC = await createTenant('Rowless Owner Co');
      const bareOwnerRole = await createRole(tenantC, ADMIN_ROLE_CODE, [], { withDefaults: false });
      const bareOwner = await seedMember(tenantC, bareOwnerRole, 'bare-owner');

      const response = await api().get(`${API}/tenant/settings`).set(as(bareOwner));
      expect(response.status).toBe(403);
    });

    it('gives the owner of a newly registered workspace the full permission set', async () => {
      const email = `registered-owner-${randomUUID()}@settings.test`;
      const code = `R${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      userEmails.push(email);

      const response = await api().post(`${API}/auth/register-tenant`).send({
        companyName: 'Freshly Registered Ltd',
        tenantCode: code,
        email,
        password: 'Registered-Owner-Password-1',
        adminName: 'Fresh Owner',
      });

      expect(response.status).toBe(201);
      tenantIds.push(response.body.activeTenant.tenantId);
      expect([...response.body.access.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());

      const settings = await api().get(`${API}/tenant/settings`).set({ Authorization: `Bearer ${response.body.token}` });
      expect(settings.status).toBe(200);
      expect(settings.body.data.tenant.primary_contact_email).toBe(email);
    });
  });

  describe('server-side authorization inside a workspace', () => {
    it('refuses settings, team and module administration to a member without permissions', async () => {
      const responses = await Promise.all([
        api().get(`${API}/tenant/settings`).set(as(employeeA)),
        api().put(`${API}/tenant/settings/profile`).set(as(employeeA)).send({ company_name: 'Hijack', currency: 'INR', timezone: 'UTC' }),
        api().get(`${API}/users`).set(as(employeeA)),
        api().post(`${API}/tenant/roles`).set(as(employeeA)).send({ name: 'Rogue' }),
        api().put(`${API}/tenant/modules/CRM`).set(as(employeeA)).send({ enabled: false }),
      ]);

      expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403, 403]);
    });

    it('gives built-in HR roles read access but not administration', async () => {
      const read = await api().get(`${API}/tenant/settings`).set(as(hrA));
      const write = await api()
        .put(`${API}/tenant/settings/profile`)
        .set(as(hrA))
        .send({ company_name: 'Changed by HR', currency: 'INR', timezone: 'UTC' });

      expect(read.status).toBe(200);
      expect(write.status).toBe(403);
    });

    it('reports the caller’s permissions and modules with the session', async () => {
      const me = await api().get(`${API}/auth/me`).set(as(hrA));

      expect(me.status).toBe(200);
      expect(me.body.access.permissions).toEqual(expect.arrayContaining(['organization.view', 'people.view', 'payroll.process']));
      expect(me.body.access.permissions).not.toContain('organization.update');
      expect(me.body.access.permissions).not.toContain('leads.view');
      expect(me.body.access.modules).toMatchObject({ CRM: true, HRMS: true });
    });
  });

  describe('modules', () => {
    it('turns a module off for one workspace and enforces it on the API', async () => {
      const off = await api().put(`${API}/tenant/modules/CRM`).set(as(adminB)).send({ enabled: false });
      expect(off.status).toBe(200);

      const [blocked, unaffected, modules] = await Promise.all([
        api().get(`${API}/crm/leads`).set(as(adminB)),
        api().get(`${API}/crm/leads`).set(as(adminA)),
        api().get(`${API}/tenant/modules`).set(as(adminB)),
      ]);
      expect(blocked.status).toBe(403);
      expect(unaffected.status).toBe(200);
      expect(modules.body.data.modules.find((m: { id: string }) => m.id === 'CRM').is_enabled).toBe(false);

      const on = await api().put(`${API}/tenant/modules/CRM`).set(as(adminB)).send({ enabled: true });
      expect(on.status).toBe(200);
      expect((await api().get(`${API}/crm/leads`).set(as(adminB))).status).toBe(200);
    });

    it('lists the business modules with the screens each switch covers', async () => {
      const response = await api().get(`${API}/tenant/modules`).set(as(adminB));

      expect(response.status).toBe(200);
      expect(
        response.body.data.modules.map((m: { id: string; name: string; features: string[]; requires: string[] }) => [
          m.id,
          m.name,
          m.features,
          m.requires,
        ]),
      ).toEqual([
        ['CRM', 'CRM & Sales', expect.arrayContaining(['Sales Pipelines', 'Quotations']), []],
        ['HRMS', 'HRMS', ['People', 'Attendance', 'Onboarding', 'Compliance'], []],
        ['FINANCE', 'Finance', ['Payroll', 'Payslips', 'Bookkeeping', 'Reports'], ['HRMS']],
      ]);
    });

    it('refuses to turn off a module another enabled module depends on', async () => {
      const response = await api().put(`${API}/tenant/modules/HRMS`).set(as(adminB)).send({ enabled: false });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Finance');
    });

    it('no longer knows a separate Payroll module', async () => {
      const response = await api().put(`${API}/tenant/modules/PAYROLL`).set(as(adminB)).send({ enabled: false });

      expect(response.status).toBe(404);
    });
  });

  describe('CRM records by id', () => {
    it('cannot update another workspace’s client, and cannot move a client between workspaces', async () => {
      const created = await api()
        .post(`${API}/crm/clients`)
        .set(as(adminA))
        .send({ company_name: 'Acme Buyer', contact_person: 'Ann', email: 'ann@acme.example', phone: '+91 9000000009' });
      expect(created.status).toBe(201);
      const clientId: string = created.body.data.id;

      const crossTenant = await api()
        .put(`${API}/crm/clients/${clientId}`)
        .set(as(adminB))
        .send({ company_name: 'Stolen' });
      expect(crossTenant.status).toBe(404);

      const reassign = await api()
        .put(`${API}/crm/clients/${clientId}`)
        .set(as(adminA))
        .send({ company_name: 'Acme Buyer Ltd', tenant_id: tenantB });
      expect(reassign.status).toBeLessThan(400);

      const client = await prisma.rndtechnosoft_crm_clients.findUnique({ where: { id: clientId } });
      expect(client?.tenant_id).toBe(tenantA);
      expect(client?.company_name).toBe('Acme Buyer Ltd');
    });
  });

  describe('workspace registration', () => {
    it('does not attach an existing account to a new workspace', async () => {
      const code = `R${randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
      const response = await api().post(`${API}/auth/register-tenant`).send({
        companyName: 'Takeover Ltd',
        tenantCode: code,
        email: adminA.email,
        password: 'Some-Other-Password-1',
      });

      expect(response.status).toBe(409);
      expect(await prisma.rndtechnosoft_tenants.count({ where: { tenant_code: code } })).toBe(0);
    });
  });
});
