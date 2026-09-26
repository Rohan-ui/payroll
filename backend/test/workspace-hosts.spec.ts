import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Workspace addresses: <subdomain>.<PLATFORM_BASE_DOMAIN>. Registration gives
 * every workspace a unique, valid, non-reserved subdomain; the Host header then
 * narrows a request to that workspace, and never grants anything by itself.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const PASSWORD = 'Workspace-Hosts-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

describe('Workspace addresses and hostname tenancy', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousBaseDomain = process.env.PLATFORM_BASE_DOMAIN;

  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const adminIds: string[] = [];
  let platformToken: string;

  const alpha = { tenantId: '', subdomain: `alpha-${SUFFIX}`, email: `owner-alpha-${SUFFIX}@hosts.test` };
  const beta = { tenantId: '', subdomain: '', code: `HB_${SUFFIX.toUpperCase()}`, email: `owner-beta-${SUFFIX}@hosts.test` };
  const twin = { tenantId: '', subdomain: '', code: `HB-${SUFFIX.toUpperCase()}`, email: `owner-twin-${SUFFIX}@hosts.test` };
  const shared = { email: `shared-${SUFFIX}@hosts.test` };

  const api = () => request(app.getHttpServer());
  const host = (label: string) => `${label}.${BASE}`;

  async function register(body: Record<string, unknown>, hostHeader = BASE) {
    return api().post(`${API}/auth/register-tenant`).set('Host', hostHeader).send({ password: PASSWORD, ...body });
  }

  async function login(email: string, hostHeader: string, tenantId?: string) {
    return api()
      .post(`${API}/auth/login`)
      .set('Host', hostHeader)
      .send({ email, password: PASSWORD, ...(tenantId ? { tenantId } : {}) });
  }

  const current = (token: string, hostHeader: string) =>
    api().get(`${API}/tenant/current`).set('Host', hostHeader).set('Authorization', `Bearer ${token}`);

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

    const adminId = randomUUID();
    const adminEmail = `hosts-platform-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: adminId,
        email: adminEmail,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: 'Hosts suite',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
    adminIds.push(adminId);
    const platformLogin = await api().post(`${API}/super-admin/auth/login`).send({ email: adminEmail, password: PASSWORD });
    platformToken = platformLogin.body.data.token;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_tenant_onboardings.deleteMany({ where: { tenant_id: { in: tenantIds } } });
      await prisma.rndtechnosoft_email_deliveries.deleteMany({ where: { tenant_id: { in: tenantIds } } });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({
        where: { OR: [{ super_admin_id: { in: adminIds } }, { target_tenant_id: { in: tenantIds } }] },
      });
      await deleteCrmData(prisma, tenantIds);
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    if (previousBaseDomain === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previousBaseDomain;
    await app?.close();
  });

  describe('registration', () => {
    it('gives a new workspace the address it asked for', async () => {
      userEmails.push(alpha.email);
      const response = await register({
        companyName: `Host Alpha ${SUFFIX}`,
        tenantCode: `HA${SUFFIX.toUpperCase()}`,
        subdomain: alpha.subdomain,
        email: alpha.email,
      });
      expect(response.status).toBe(201);
      alpha.tenantId = response.body.activeTenant.tenantId;
      tenantIds.push(alpha.tenantId);

      const domain = await prisma.rndtechnosoft_tenant_domains.findFirst({ where: { tenant_id: alpha.tenantId } });
      expect(domain).toMatchObject({ subdomain: alpha.subdomain, is_primary: true, provisioning_status: 'PENDING' });
    });

    it('derives an address from the tenant code, and suffixes it when taken', async () => {
      userEmails.push(beta.email, twin.email);
      const first = await register({ companyName: `Host Beta ${SUFFIX}`, tenantCode: beta.code, email: beta.email });
      const second = await register({ companyName: `Host Twin ${SUFFIX}`, tenantCode: twin.code, email: twin.email });
      expect([first.status, second.status]).toEqual([201, 201]);
      beta.tenantId = first.body.activeTenant.tenantId;
      twin.tenantId = second.body.activeTenant.tenantId;
      tenantIds.push(beta.tenantId, twin.tenantId);

      const domains = await prisma.rndtechnosoft_tenant_domains.findMany({
        where: { tenant_id: { in: [beta.tenantId, twin.tenantId] } },
        select: { tenant_id: true, subdomain: true },
      });
      beta.subdomain = domains.find((d) => d.tenant_id === beta.tenantId)?.subdomain ?? '';
      twin.subdomain = domains.find((d) => d.tenant_id === twin.tenantId)?.subdomain ?? '';
      expect(beta.subdomain).toBe(`hb-${SUFFIX}`);
      expect(twin.subdomain).toBe(`hb-${SUFFIX}-2`);
    });

    it('refuses reserved, invalid and duplicate addresses without creating anything', async () => {
      const attempts: [string, number][] = [
        ['admin', 400],
        ['www', 400],
        ['x', 400],
        ['---', 400],
        [alpha.subdomain, 409],
      ];
      for (const [subdomain, status] of attempts) {
        const code = `HX${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        const email = `refused-${randomUUID()}@hosts.test`;
        userEmails.push(email);
        const response = await register({ companyName: 'Refused Ltd', tenantCode: code, subdomain, email });
        expect([subdomain, response.status]).toEqual([subdomain, status]);
        expect(await prisma.rndtechnosoft_tenants.count({ where: { tenant_code: code } })).toBe(0);
      }
    });

    it('only registers from the main site', async () => {
      const body = { companyName: 'Wrong Door Ltd', tenantCode: `HW${SUFFIX.toUpperCase()}`, email: `wrong-door-${SUFFIX}@hosts.test` };
      userEmails.push(body.email);
      expect((await register(body, host(alpha.subdomain))).status).toBe(400);
      expect((await register(body, host(`nobody-${SUFFIX}`))).status).toBe(400);
      expect((await register(body, 'evil.example')).status).toBe(421);
    });

    it('reports whether an address is free', async () => {
      const check = async (subdomain: string) =>
        (await api().get(`${API}/auth/subdomain-availability`).query({ subdomain })).body;
      expect(await check(alpha.subdomain)).toMatchObject({ available: false, reason: 'That address is already in use.' });
      expect(await check('Admin')).toMatchObject({ subdomain: 'admin', available: false, reason: expect.stringMatching(/reserved/) });
      expect(await check(`Fresh Name ${SUFFIX}`)).toMatchObject({ subdomain: `fresh-name-${SUFFIX}`, available: true });
    });
  });

  describe('signing in on a workspace address', () => {
    beforeAll(async () => {
      // One account that belongs to both alpha and beta.
      const userId = randomUUID();
      userEmails.push(shared.email);
      await prisma.rndtechnosoft_users.create({
        data: {
          id: userId,
          email: shared.email,
          password_hash: await hashPassword(PASSWORD),
          password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
          display_name: 'Shared Member',
          user_status: 'ACTIVE',
        },
      });
      for (const tenantId of [alpha.tenantId, beta.tenantId]) {
        const roleId = randomUUID();
        await prisma.rndtechnosoft_roles.create({
          data: { id: roleId, tenant_id: tenantId, role_code: 'EMPLOYEE', role_name: 'Employee', is_system_role: true },
        });
        await grantDefaultRolePermissions(prisma, tenantId, roleId, 'EMPLOYEE');
        const memberId = randomUUID();
        await prisma.rndtechnosoft_tenant_members.create({
          data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() },
        });
        await prisma.rndtechnosoft_tenant_member_roles.create({
          data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId },
        });
      }
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    });

    it('opens the workspace whose address it is', async () => {
      const onBeta = await login(shared.email, host(beta.subdomain));
      expect(onBeta.status).toBe(200);
      expect(onBeta.body.activeTenant.tenantId).toBe(beta.tenantId);

      const onAlpha = await login(shared.email, host(alpha.subdomain));
      expect(onAlpha.body.activeTenant.tenantId).toBe(alpha.tenantId);
    });

    it('refuses an account that is not a member, even with the right password', async () => {
      const response = await login(alpha.email, host(beta.subdomain));
      expect(response.status).toBe(403);
      expect(response.body.token).toBeUndefined();
    });

    it('refuses a sign-in that asks for a different workspace than the address', async () => {
      expect((await login(shared.email, host(alpha.subdomain), beta.tenantId)).status).toBe(400);
    });

    it('refuses unknown, foreign and nested addresses', async () => {
      expect((await login(alpha.email, host(`nobody-${SUFFIX}`))).status).toBe(404);
      expect((await login(alpha.email, 'evil.example')).status).toBe(421);
      expect((await login(alpha.email, `x.${host(alpha.subdomain)}`)).status).toBe(421);
    });

    it('lets the main site choose among the account’s own workspaces', async () => {
      const response = await login(shared.email, BASE, beta.tenantId);
      expect(response.status).toBe(200);
      expect(response.body.activeTenant.tenantId).toBe(beta.tenantId);
    });
  });

  describe('requests on a workspace address', () => {
    let alphaToken: string;
    let sharedOnAlpha: string;

    beforeAll(async () => {
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      alphaToken = (await login(alpha.email, host(alpha.subdomain))).body.token;
      sharedOnAlpha = (await login(shared.email, BASE, alpha.tenantId)).body.token;
    });

    it('accepts the session on its own address and on platform hosts', async () => {
      expect((await current(alphaToken, host(alpha.subdomain))).status).toBe(200);
      expect((await current(alphaToken, `${alpha.subdomain.toUpperCase()}.VOOGYO.TEST:443`)).status).toBe(200);
      expect((await current(alphaToken, BASE)).status).toBe(200);
      expect((await current(alphaToken, `app.${BASE}`)).status).toBe(200);
    });

    it('refuses the session on another workspace’s address (Host header manipulation)', async () => {
      const response = await current(alphaToken, host(beta.subdomain));
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain(beta.tenantId);
    });

    it('refuses unknown, foreign, lookalike and nested hosts', async () => {
      expect((await current(alphaToken, host(`nobody-${SUFFIX}`))).status).toBe(404);
      expect((await current(alphaToken, 'evil.example')).status).toBe(421);
      expect((await current(alphaToken, `${host(alpha.subdomain)}.evil.example`)).status).toBe(421);
      expect((await current(alphaToken, `x.${host(alpha.subdomain)}`)).status).toBe(421);
    });

    it('serves local access (the dev proxy sends Host: localhost) from the session alone', async () => {
      // Reproduces HTTP 421 "This address does not serve Voogyo workspaces." on
      // POST /crm/leads when PLATFORM_BASE_DOMAIN is set and the browser goes
      // through the development proxy.
      for (const local of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000', 'localhost']) {
        const response = await current(alphaToken, local);
        expect([local, response.status, response.body.id ?? response.body.data?.id]).toEqual([local, 200, alpha.tenantId]);
      }
      const local = (path: string, body: object) =>
        api().post(`${API}${path}`).set('Host', 'localhost:4000').set('Authorization', `Bearer ${alphaToken}`).send(body);
      const pipeline = await local('/crm/pipelines', { name: 'Sales', code: `local_${SUFFIX}` });
      expect(pipeline.status).toBe(201);
      expect((await local('/crm/masters/stages', { pipeline_id: pipeline.body.data.id, name: 'New', sort_order: 1 })).status).toBe(201);
      const lead = await api()
        .post(`${API}/crm/leads`)
        .set('Host', 'localhost:4000')
        .set('Authorization', `Bearer ${alphaToken}`)
        .send({ companyName: `Local ${SUFFIX}`, firstName: 'Local', email: `lead-${SUFFIX}@hosts.test`, phone: '+91 90000 00001' });
      expect(lead.status).toBe(201);
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { id: lead.body.data.id, tenant_id: alpha.tenantId } })).toBe(1);
    });

    it('does not treat look-alikes of localhost as local', async () => {
      for (const lookalike of ['localhost.evil.example', 'mylocalhost', '127.0.0.1.evil.example']) {
        expect([lookalike, (await current(alphaToken, lookalike)).status]).toEqual([lookalike, 421]);
      }
    });

    it('ignores a tenant id supplied in a header', async () => {
      const response = await current(alphaToken, host(alpha.subdomain)).set('x-tenant-id', beta.tenantId);
      expect(response.status).toBe(200);
      expect(response.body.id).toBe(alpha.tenantId);
    });

    it('does not switch to another workspace from this address', async () => {
      const switched = await api()
        .post(`${API}/auth/switch-tenant`)
        .set('Host', host(alpha.subdomain))
        .set('Authorization', `Bearer ${sharedOnAlpha}`)
        .send({ tenantId: beta.tenantId });
      expect(switched.status).toBe(403);
    });

    it('tells the sign-in page which workspace an address belongs to', async () => {
      const onAlpha = await api().get(`${API}/auth/host`).set('Host', host(alpha.subdomain));
      const onApex = await api().get(`${API}/auth/host`).set('Host', BASE);
      expect(onAlpha.body).toEqual({ baseDomain: BASE, kind: 'tenant', workspace: { name: `Host Alpha ${SUFFIX}`, status: 'ACTIVE' } });
      expect(onApex.body).toEqual({ baseDomain: BASE, kind: 'platform', workspace: null });
    });
  });

  describe('managing addresses from the platform console', () => {
    const asPlatform = () => ({ Authorization: `Bearer ${platformToken}` });

    it('moves a workspace to a new address, and the old one stops working', async () => {
      const newSubdomain = `beta-${SUFFIX}`;
      const changed = await api()
        .put(`${API}/super-admin/tenants/${beta.tenantId}/subdomain`)
        .set(asPlatform())
        .send({ subdomain: newSubdomain });
      expect(changed.status).toBe(200);
      expect(changed.body.data).toEqual({ subdomain: newSubdomain, address: host(newSubdomain) });

      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      const token = (await login(beta.email, host(newSubdomain))).body.token;
      expect((await current(token, host(newSubdomain))).status).toBe(200);
      expect((await current(token, host(beta.subdomain))).status).toBe(404);
      beta.subdomain = newSubdomain;
    });

    it('refuses reserved and taken addresses', async () => {
      const put = (subdomain: string) =>
        api().put(`${API}/super-admin/tenants/${beta.tenantId}/subdomain`).set(asPlatform()).send({ subdomain });
      expect((await put('api')).status).toBe(400);
      expect((await put(alpha.subdomain)).status).toBe(409);
    });

    it('lists addresses and records a failed verification with its reason', async () => {
      const list = await api().get(`${API}/super-admin/domains`).query({ search: SUFFIX }).set(asPlatform());
      expect(list.status).toBe(200);
      expect(list.body.data.baseDomain).toBe(BASE);
      expect(list.body.data.items.map((d: { subdomain: string }) => d.subdomain).sort()).toEqual(
        [alpha.subdomain, beta.subdomain, twin.subdomain].sort(),
      );

      const domainId = list.body.data.items.find((d: { subdomain: string }) => d.subdomain === alpha.subdomain).id;
      const verified = await api().post(`${API}/super-admin/domains/${domainId}/verify`).set(asPlatform());
      expect(verified.status).toBe(200);
      // voogyo.test never resolves, so the check fails and says why.
      expect(verified.body.data).toMatchObject({ status: 'FAILED', attempts: 1, error: expect.stringMatching(/DNS lookup/) });
    });

    const provision = ({ adminEmail, ...body }: { tenantCode: string; adminEmail: string; subdomain?: string }) =>
      api()
        .post(`${API}/super-admin/tenants`)
        .set(asPlatform())
        .send({
          idempotencyKey: randomUUID(),
          organizationName: `Provisioned ${SUFFIX}`,
          legalName: `Provisioned ${SUFFIX} Pvt Ltd`,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          ownerFirstName: 'Provisioned',
          ownerLastName: 'Owner',
          ownerEmail: adminEmail,
          modules: ['CRM'],
          ...body,
        });

    it('provisions a workspace at the address asked for, or one made from its code', async () => {
      const picked = { tenantCode: `HP_${SUFFIX.toUpperCase()}`, subdomain: `picked-${SUFFIX}`, adminEmail: `owner-picked-${SUFFIX}@hosts.test` };
      const derived = { tenantCode: `HD_${SUFFIX.toUpperCase()}`, adminEmail: `owner-derived-${SUFFIX}@hosts.test` };
      userEmails.push(picked.adminEmail, derived.adminEmail);

      const first = await provision(picked);
      const second = await provision(derived);
      expect([first.status, second.status]).toEqual([201, 201]);
      tenantIds.push(first.body.data.tenant.id, second.body.data.tenant.id);

      expect(first.body.data.address).toMatchObject({ subdomain: picked.subdomain, hostname: host(picked.subdomain) });
      expect(second.body.data.address).toMatchObject({ subdomain: `hd-${SUFFIX}`, hostname: host(`hd-${SUFFIX}`) });
      const domain = await prisma.rndtechnosoft_tenant_domains.findFirst({ where: { tenant_id: first.body.data.tenant.id } });
      expect(domain).toMatchObject({ subdomain: picked.subdomain, is_primary: true, provisioning_status: 'PENDING' });
    });

    it('refuses a reserved or taken address when provisioning, and creates nothing', async () => {
      const attempts: [string, number][] = [
        ['admin', 400],
        [alpha.subdomain, 409],
      ];
      for (const [subdomain, status] of attempts) {
        const tenantCode = `HX${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
        const adminEmail = `refused-${randomUUID()}@hosts.test`;
        userEmails.push(adminEmail);
        const response = await provision({ tenantCode, subdomain, adminEmail });
        expect([subdomain, response.status]).toEqual([subdomain, status]);
        expect(await prisma.rndtechnosoft_tenants.count({ where: { tenant_code: tenantCode } })).toBe(0);
        expect(await prisma.rndtechnosoft_users.count({ where: { email: adminEmail } })).toBe(0);
      }
    });

    it('keeps address management away from tenant sessions', async () => {
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      const token = (await login(alpha.email, host(alpha.subdomain))).body.token;
      const attempts = await Promise.all([
        api().get(`${API}/super-admin/domains`).set('Authorization', `Bearer ${token}`),
        api().put(`${API}/super-admin/tenants/${alpha.tenantId}/subdomain`).set('Authorization', `Bearer ${token}`).send({ subdomain: 'taken-over' }),
      ]);
      expect(attempts.map((r) => r.status)).toEqual([401, 401]);
    });
  });
});
