import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ADMIN_ROLE_CODE, PERMISSION_KEYS } from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';

/**
 * The Command Centre and the commercial and governance screens report stored
 * records only. Metrics without a data source are listed as unavailable
 * instead of estimated, and the endpoints that used to fabricate data are gone.
 */

const API = '/api/v1';
const PASSWORD = 'Platform-Governance-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

describe('Platform governance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let tenantToken: string;
  const adminIds: string[] = [];
  const tenantIds: string[] = [];
  const userIds: string[] = [];
  const couponCodes: string[] = [];
  const savedSettings = new Map<string, Prisma.JsonValue | null>();

  const api = () => request(app.getHttpServer());
  const asPlatform = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    // Settings this suite edits are restored afterwards.
    for (const key of ['platform_branding', 'website_settings']) {
      const row = await prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: key } });
      savedSettings.set(key, row ? (row.setting_value as Prisma.JsonValue) : null);
    }

    const adminId = randomUUID();
    const email = `governance-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: adminId,
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: 'Governance suite',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
    adminIds.push(adminId);
    token = (await api().post(`${API}/super-admin/auth/login`).send({ email, password: PASSWORD })).body.data.token;

    // A workspace owner, to prove tenant sessions cannot reach any of this.
    const tenantId = randomUUID();
    tenantIds.push(tenantId);
    await prisma.rndtechnosoft_tenants.create({
      data: { id: tenantId, tenant_code: `GV${SUFFIX.toUpperCase()}`, legal_name: 'Governance Ltd', display_name: 'Governance' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({
      data: { id: roleId, tenant_id: tenantId, role_code: ADMIN_ROLE_CODE, role_name: 'Administrator', is_system_role: true },
    });
    await grantDefaultRolePermissions(prisma, tenantId, roleId, ADMIN_ROLE_CODE);
    const userId = randomUUID();
    userIds.push(userId);
    const ownerEmail = `governance-owner-${SUFFIX}@governance.test`;
    await prisma.rndtechnosoft_users.create({
      data: {
        id: userId,
        email: ownerEmail,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        user_status: 'ACTIVE',
      },
    });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId },
    });
    tenantToken = (await api().post(`${API}/auth/login`).send({ email: ownerEmail, password: PASSWORD })).body.token;
  });

  afterAll(async () => {
    if (prisma) {
      for (const [key, value] of savedSettings) {
        if (value === null) await prisma.rndtechnosoft_platform_settings.deleteMany({ where: { setting_key: key } });
        else await prisma.rndtechnosoft_platform_settings.update({ where: { setting_key: key }, data: { setting_value: value as Prisma.InputJsonValue } });
      }
      await prisma.rndtechnosoft_platform_coupons.deleteMany({ where: { coupon_code: { in: couponCodes } } });
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  describe('Command Centre', () => {
    it('counts from the database and lists what it cannot measure instead of estimating it', async () => {
      const response = await api().get(`${API}/super-admin/command-centre`).set(asPlatform());
      expect(response.status).toBe(200);
      const data = response.body.data;

      const [tenants, users, active, removed] = await Promise.all([
        prisma.rndtechnosoft_tenants.count(),
        prisma.rndtechnosoft_users.count(),
        prisma.rndtechnosoft_tenant_members.count({ where: { membership_status: 'ACTIVE' } }),
        prisma.rndtechnosoft_tenant_members.count({ where: { membership_status: 'ARCHIVED' } }),
      ]);
      expect(data.workspaces.total).toBe(tenants);
      expect(data.people).toMatchObject({ accounts: users, activeMemberships: active, removedMemberships: removed });
      expect(data.security.platformAccounts).toBeGreaterThanOrEqual(1);
      expect(data.unavailable.map((m: { metric: string }) => m.metric)).toEqual(
        expect.arrayContaining(['MRR and ARR', 'Churn', 'AI token usage', 'WhatsApp broadcasts and delivery', 'Storage usage', 'API hits', 'Website visitors', 'Marketplace revenue', 'Uptime']),
      );
      // None of the figures the old dashboard invented.
      const raw = JSON.stringify(response.body);
      for (const invented of ['14999', '1499900', '99.4', '14.8M', '8,920', '18,420', '18500', 'HEALTHY']) {
        expect([invented, raw.includes(invented)]).toEqual([invented, false]);
      }
    });
  });

  describe('governance and commercial views', () => {
    it('reports platform security without any secret', async () => {
      const response = await api().get(`${API}/super-admin/security`).set(asPlatform());
      expect(response.status).toBe(200);
      expect(typeof response.body.data.encryptionConfigured).toBe('boolean');
      expect(response.body.data.platformAccounts).toEqual(
        expect.arrayContaining([expect.objectContaining({ email: `governance-${SUFFIX}@voogyo.test`, mfaEnabled: false })]),
      );
      // No field carries a credential, and none of the invented scores remain.
      const keys = new Set<string>();
      const collect = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(collect);
        else if (value && typeof value === 'object') {
          for (const [key, child] of Object.entries(value)) {
            keys.add(key);
            collect(child);
          }
        }
      };
      collect(response.body);
      expect([...keys].filter((key) => /password|secret|token|hash|score|pentest|waf/i.test(key))).toEqual([]);
    });

    it('lists role templates with the Administrator role holding the whole permission catalog', async () => {
      const response = await api().get(`${API}/super-admin/roles-templates`).set(asPlatform());
      expect(response.status).toBe(200);
      const byCode = Object.fromEntries(response.body.data.templates.map((t: { code: string }) => [t.code, t]));
      expect(byCode[ADMIN_ROLE_CODE]).toMatchObject({ kind: 'OWNER', editable: false });
      expect(byCode[ADMIN_ROLE_CODE].permissions).toHaveLength(PERMISSION_KEYS.length);
      expect(Object.keys(byCode)).toEqual(expect.arrayContaining([ADMIN_ROLE_CODE, 'EMPLOYEE', 'HR_ACCOUNTANT', 'MANAGER']));
    });

    it('summarises billing from stored plans, subscriptions and invoices only', async () => {
      const [billing, subscriptions, invoices] = await Promise.all([
        api().get(`${API}/super-admin/billing`).set(asPlatform()),
        api().get(`${API}/super-admin/subscriptions`).set(asPlatform()),
        api().get(`${API}/super-admin/invoices`).set(asPlatform()),
      ]);
      expect(billing.status).toBe(200);
      expect(billing.body.data.plans.length).toBe(await prisma.rndtechnosoft_plans.count());
      expect(typeof billing.body.data.paymentGatewayConfigured).toBe('boolean');
      expect(subscriptions.body.data.total).toBe(await prisma.rndtechnosoft_tenant_subscriptions.count());
      expect(invoices.body.data.total).toBe(await prisma.rndtechnosoft_platform_invoices.count());
    });

    it('validates and saves platform branding', async () => {
      const bad = await api().put(`${API}/super-admin/settings/branding`).set(asPlatform()).send({ platformName: 'Voogyo', supportEmail: 'nope', currency: 'INR' });
      expect(bad.status).toBe(400);
      const good = await api()
        .put(`${API}/super-admin/settings/branding`)
        .set(asPlatform())
        .send({ platformName: 'Voogyo Test', supportEmail: 'help@voogyo.test', websiteUrl: 'https://voogyo.test', currency: 'inr' });
      expect(good.status).toBe(200);
      expect(good.body.data).toMatchObject({ platformName: 'Voogyo Test', currency: 'INR', supportEmail: 'help@voogyo.test' });
    });

    it('validates website settings and returns nothing it was not given', async () => {
      const bad = await api().put(`${API}/super-admin/settings/website`).set(asPlatform()).send({ brand_color: 'blue' });
      expect(bad.status).toBe(400);
      const good = await api().put(`${API}/super-admin/settings/website`).set(asPlatform()).send({ hero_title: 'Payroll for India' });
      expect(good.status).toBe(200);
      expect(good.body.data).toMatchObject({ hero_title: 'Payroll for India', contact_phone: null, contact_email: null });
    });

    it('validates coupons and keeps money as decimal strings', async () => {
      const code = `GOV${SUFFIX.toUpperCase()}`;
      couponCodes.push(code);
      const tooMuch = await api().post(`${API}/super-admin/coupons`).set(asPlatform()).send({ couponCode: code, discountType: 'PERCENTAGE', discountValue: 150 });
      expect(tooMuch.status).toBe(400);
      const created = await api().post(`${API}/super-admin/coupons`).set(asPlatform()).send({ couponCode: code, discountType: 'FIXED', discountValue: 499.5 });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ code, discountType: 'FIXED', discountValue: '499.5' });
    });

    it('pages the activity log', async () => {
      const response = await api().get(`${API}/super-admin/activity`).query({ pageSize: 5 }).set(asPlatform());
      expect(response.status).toBe(200);
      expect(response.body.data.items.length).toBeLessThanOrEqual(5);
      expect(response.body.data.total).toBe(await prisma.rndtechnosoft_platform_activity_logs.count());
    });
  });

  describe('removed and protected endpoints', () => {
    it('no longer serves the endpoints that fabricated data', async () => {
      const gone = await Promise.all([
        api().get(`${API}/super-admin/dashboard`).set(asPlatform()),
        api().get(`${API}/super-admin/analytics/overview`).set(asPlatform()),
        api().get(`${API}/super-admin/transactions`).set(asPlatform()),
        api().get(`${API}/super-admin/forms`).set(asPlatform()),
        api().get(`${API}/super-admin/settings`).set(asPlatform()),
        api().get(`${API}/super-admin/settings/razorpay`).set(asPlatform()),
        api().post(`${API}/super-admin/ai-assistant`).set(asPlatform()).send({ prompt: 'mrr' }),
        api().get(`${API}/super-admin/registered-users`).set(asPlatform()),
        api().get(`${API}/super-admin/invited-users`).set(asPlatform()),
      ]);
      expect(gone.map((r) => r.status)).toEqual([404, 404, 404, 404, 404, 404, 404, 404, 404]);
    });

    it('refuses a workspace owner’s session on every governance and commercial route', async () => {
      const routes = ['command-centre', 'security', 'billing', 'subscriptions', 'invoices', 'coupons', 'activity', 'roles-templates', 'settings/branding', 'domains'];
      for (const route of routes) {
        const response = await api().get(`${API}/super-admin/${route}`).set('Authorization', `Bearer ${tenantToken}`);
        expect([route, response.status]).toEqual([route, 401]);
      }
    });
  });
});
