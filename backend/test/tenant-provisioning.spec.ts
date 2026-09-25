import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomBytes, randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { hashAccountSetupToken } from '@/common/security/account-setup-token';
import { PERMISSION_KEYS } from '@/common/access/access-catalog';
import { SMTP_SETTINGS_KEY } from '@/modules/email/email.service';
import { FakeSmtpServer } from './support/fake-smtp-server';

/**
 * Onboarding a workspace from HQ: provisioning in one transaction, the owner's
 * one-time setup link, real onboarding email delivery (through a local SMTP
 * server), the SMTP settings, idempotency, and who may do any of it.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const PASSWORD = 'Provisioning-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const SMTP_PORT = 2525;

describe('Tenant provisioning and onboarding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const smtp = new FakeSmtpServer();
  const previousBaseDomain = process.env.PLATFORM_BASE_DOMAIN;
  let previousSmtpSetting: { setting_value: unknown } | null = null;

  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const adminIds: string[] = [];
  const planIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const asPlatform = () => ({ Authorization: `Bearer ${token}` });
  const host = (label: string) => `${label}.${BASE}`;

  /** A complete, valid provisioning request; each test changes what it needs. */
  const form = (label: string, overrides: Record<string, unknown> = {}) => ({
    idempotencyKey: randomUUID(),
    organizationName: `Onboard ${label} ${SUFFIX}`,
    legalName: `Onboard ${label} ${SUFFIX} Private Limited`,
    tenantCode: `OB_${label.toUpperCase()}_${SUFFIX.toUpperCase()}`,
    subdomain: `ob-${label}-${SUFFIX}`,
    industry: 'IT_SERVICES',
    website: 'https://example.com',
    contactEmail: `office-${label}-${SUFFIX}@provisioning.test`,
    address: '1 Test Road',
    countryCode: 'IN',
    taxId: '27ABCDE1234F1Z5',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    ownerFirstName: 'Asha',
    ownerLastName: label,
    ownerEmail: `owner-${label}-${SUFFIX}@provisioning.test`,
    ownerPhone: '+91 98765 43210',
    modules: ['HRMS', 'FINANCE'],
    ...overrides,
  });

  async function provision(body: Record<string, unknown>) {
    userEmails.push(String(body.ownerEmail));
    const response = await api().post(`${API}/super-admin/tenants`).set(asPlatform()).send(body);
    if (response.body?.data?.tenant?.id) tenantIds.push(response.body.data.tenant.id);
    return response;
  }

  const saveSmtp = (overrides: Record<string, unknown> = {}) =>
    api()
      .put(`${API}/super-admin/settings/smtp`)
      .set(asPlatform())
      .send({ host: '127.0.0.1', port: SMTP_PORT, encryption: 'NONE', fromEmail: 'hq@provisioning.test', fromName: 'Voogyo HQ', ...overrides });

  const setupTokenIn = (body: string) => body.match(/#setup=([A-Za-z0-9_-]{43})/)?.[1] ?? null;

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    await smtp.start(SMTP_PORT);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    previousSmtpSetting = await prisma.rndtechnosoft_platform_settings.findUnique({
      where: { setting_key: SMTP_SETTINGS_KEY },
      select: { setting_value: true },
    });
    await prisma.rndtechnosoft_platform_settings.deleteMany({ where: { setting_key: SMTP_SETTINGS_KEY } });

    const adminId = randomUUID();
    const email = `provisioning-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: adminId,
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: 'Provisioning suite',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
    adminIds.push(adminId);
    token = (await api().post(`${API}/super-admin/auth/login`).send({ email, password: PASSWORD })).body.data.token;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_account_setup_tokens.deleteMany({ where: { OR: [scope, { user_id: { in: userIds } }] } });
      await prisma.rndtechnosoft_tenant_onboardings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_email_deliveries.deleteMany({
        where: { OR: [scope, { requested_by_super_admin_id: { in: adminIds } }] },
      });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: { OR: [scope, { actor_user_id: { in: userIds } }] } });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({
        where: { OR: [{ super_admin_id: { in: adminIds } }, { target_tenant_id: { in: tenantIds } }] },
      });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_subscriptions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_plans.deleteMany({ where: { id: { in: planIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      await prisma.rndtechnosoft_platform_settings.deleteMany({ where: { setting_key: SMTP_SETTINGS_KEY } });
      if (previousSmtpSetting) {
        await prisma.rndtechnosoft_platform_settings.create({
          data: {
            id: randomUUID(),
            setting_category: 'EMAIL',
            setting_key: SMTP_SETTINGS_KEY,
            setting_value: previousSmtpSetting.setting_value as object,
          },
        });
      }
    }
    await smtp.stop();
    if (previousBaseDomain === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previousBaseDomain;
    await app?.close();
  });

  describe('SMTP settings', () => {
    it('reports nothing configured and sends nothing before setup', async () => {
      const settings = await api().get(`${API}/super-admin/settings/smtp`).set(asPlatform());
      expect(settings.body.data).toMatchObject({ configured: false, hasPassword: false });

      const test = await api().post(`${API}/super-admin/settings/smtp/test`).set(asPlatform()).send({ recipient: 'someone@provisioning.test' });
      expect(test.status).toBe(200);
      expect(test.body.data).toMatchObject({ status: 'NOT_SENT', deliveryId: null });
      expect(smtp.messages).toHaveLength(0);
    });

    it('stores the password encrypted and never returns it', async () => {
      const secret = `smtp-secret-${SUFFIX}`;
      const saved = await saveSmtp({ encryption: 'TLS', username: 'mailer', password: secret });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ configured: true, hasPassword: true, username: 'mailer' });
      expect(JSON.stringify(saved.body)).not.toContain(secret);

      const read = await api().get(`${API}/super-admin/settings/smtp`).set(asPlatform());
      expect(JSON.stringify(read.body)).not.toContain(secret);
      expect(Object.keys(read.body.data)).not.toContain('password');

      const row = await prisma.rndtechnosoft_platform_settings.findUniqueOrThrow({ where: { setting_key: SMTP_SETTINGS_KEY } });
      expect(JSON.stringify(row.setting_value)).not.toContain(secret);
      expect((row.setting_value as { passwordEncrypted?: string }).passwordEncrypted).toMatch(/^v1\./);

      const log = await prisma.rndtechnosoft_platform_activity_logs.findFirst({
        where: { super_admin_id: adminIds[0], action: 'SMTP_SETTINGS_UPDATED' },
        orderBy: { created_at: 'desc' },
      });
      expect(log?.metadata).toMatchObject({ passwordReplaced: true });
      expect(JSON.stringify(log)).not.toContain(secret);
    });

    it('refuses to send a password unencrypted, and keeps no password for a server without sign-in', async () => {
      expect((await saveSmtp({ username: 'mailer', password: 'x-secret-value' })).status).toBe(400);
      const plain = await saveSmtp();
      expect(plain.status).toBe(200);
      expect(plain.body.data).toMatchObject({ hasPassword: false, username: null, encryption: 'NONE' });
    });

    it('delivers a real test message and says so', async () => {
      const before = smtp.messages.length;
      const test = await api().post(`${API}/super-admin/settings/smtp/test`).set(asPlatform()).send({ recipient: 'check@provisioning.test' });
      expect(test.body.data).toMatchObject({ status: 'SENT', error: null });
      expect(smtp.messages).toHaveLength(before + 1);
      expect(smtp.messages.at(-1)).toMatchObject({ from: 'hq@provisioning.test', to: ['check@provisioning.test'] });

      const delivery = await prisma.rndtechnosoft_email_deliveries.findUniqueOrThrow({ where: { id: test.body.data.deliveryId } });
      expect(delivery).toMatchObject({ delivery_status: 'SENT', template_code: 'SMTP_TEST' });
    });

    it('reports a refused recipient as FAILED with a safe reason', async () => {
      smtp.rejectedRecipients.add('nobody@provisioning.test');
      const test = await api().post(`${API}/super-admin/settings/smtp/test`).set(asPlatform()).send({ recipient: 'nobody@provisioning.test' });
      expect(test.body.data.status).toBe('FAILED');
      expect(test.body.data.error).toMatch(/refused the sender or recipient address \(server replied: 550 5\.1\.1 No such user\)/);
      const delivery = await prisma.rndtechnosoft_email_deliveries.findUniqueOrThrow({ where: { id: test.body.data.deliveryId } });
      expect(delivery).toMatchObject({ delivery_status: 'FAILED', sent_at: null });
    });

    it('reports an unreachable server as FAILED', async () => {
      await saveSmtp({ port: 25 });
      const test = await api().post(`${API}/super-admin/settings/smtp/test`).set(asPlatform()).send({ recipient: 'check@provisioning.test' });
      expect(test.body.data).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/Could not connect to 127\.0\.0\.1:25/) });
      await saveSmtp();
    });
  });

  describe('provisioning', () => {
    let owner: { email: string; subdomain: string; tenantId: string; setupToken: string };

    it('offers the real module catalog, the owner role and stored plans', async () => {
      const options = await api().get(`${API}/super-admin/provisioning/options`).set(asPlatform());
      expect(options.status).toBe(200);
      expect(options.body.data.ownerRole).toEqual({ code: 'ADMIN', name: 'Administrator' });
      expect(options.body.data.modules.map((m: { code: string }) => m.code)).toEqual(['CRM', 'HRMS', 'FINANCE']);
      expect(options.body.data.modules.find((m: { code: string }) => m.code === 'FINANCE').requires).toEqual(['HRMS']);
      expect(options.body.data).toMatchObject({ baseDomain: BASE, linksAvailable: true, emailConfigured: true });
    });

    it('creates the workspace, owner, modules and profile, then sends a real onboarding email with a setup link', async () => {
      const body = form('alpha');
      const before = smtp.messages.length;
      const response = await provision(body);
      expect(response.status).toBe(201);
      const data = response.body.data;
      expect(data).toMatchObject({
        replayed: false,
        tenant: { tenantCode: body.tenantCode, name: body.organizationName, status: 'ACTIVE' },
        address: { subdomain: body.subdomain, hostname: host(body.subdomain), url: `https://${host(body.subdomain)}` },
        owner: { email: body.ownerEmail, name: 'Asha alpha', role: 'Administrator', isNewAccount: true, passwordSet: false },
        subscription: null,
        onboardingEmail: { status: 'SENT', recipient: body.ownerEmail, error: null },
      });
      expect(data.modules).toEqual([
        { code: 'CRM', name: 'CRM & Sales', enabled: false },
        { code: 'HRMS', name: 'HRMS', enabled: true },
        { code: 'FINANCE', name: 'Finance', enabled: true },
      ]);

      // The email: sent once, to the owner, with the address and a setup link, and no password.
      expect(smtp.messages).toHaveLength(before + 1);
      const message = smtp.messages.at(-1)!;
      expect(message.to).toEqual([body.ownerEmail]);
      expect(message.body).toContain(body.organizationName);
      expect(message.body).toContain(`https://${host(body.subdomain)}`);
      expect(message.body).not.toMatch(/temporary password|password:/i);
      const setupToken = setupTokenIn(message.body);
      expect(setupToken).not.toBeNull();

      // Only the digest of the token is stored.
      const tokens = await prisma.rndtechnosoft_account_setup_tokens.findMany({ where: { tenant_id: data.tenant.id } });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].token_hash).toBe(hashAccountSetupToken(setupToken!));
      expect(JSON.stringify(tokens)).not.toContain(setupToken!);

      // Profile and module switches, in the workspace's own settings document.
      const settings = await prisma.rndtechnosoft_tenant_settings.findUniqueOrThrow({ where: { tenant_id: data.tenant.id } });
      expect(settings.settings).toMatchObject({
        profile: { company_name: body.organizationName, timezone: 'Asia/Kolkata', currency: 'INR', tax_gstin: body.taxId, industry_type: 'IT_SERVICES' },
        modules: [
          { id: 'CRM', is_enabled: false },
          { id: 'HRMS', is_enabled: true },
          { id: 'FINANCE', is_enabled: true },
        ],
      });

      // The owner is an active member holding the existing Administrator role with every permission.
      const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({
        where: { tenant_id: data.tenant.id },
        include: { rndtechnosoft_tenant_member_roles: { include: { rndtechnosoft_roles: { include: { rndtechnosoft_role_permissions: true } } } } },
      });
      expect(member.membership_status).toBe('ACTIVE');
      const role = member.rndtechnosoft_tenant_member_roles[0].rndtechnosoft_roles;
      expect(role.role_code).toBe('ADMIN');
      expect(role.rndtechnosoft_role_permissions).toHaveLength(PERMISSION_KEYS.length);

      const user = await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { email: body.ownerEmail } });
      expect(user).toMatchObject({ password_hash: null, display_name: 'Asha alpha', mobile_number: body.ownerPhone });

      owner = { email: body.ownerEmail, subdomain: body.subdomain, tenantId: data.tenant.id, setupToken: setupToken! };
    });

    it('lets the owner set a password once from the link, at their workspace address only', async () => {
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      const inspect = await api().post(`${API}/auth/account-setup/inspect`).set('Host', host(owner.subdomain)).send({ token: owner.setupToken });
      expect(inspect.status).toBe(200);
      expect(inspect.body).toMatchObject({ email: owner.email, name: 'Asha alpha' });

      // Opened at another workspace's address: refused like a sign-in there.
      const elsewhere = await provision(form('beta', { modules: ['CRM'] }));
      const wrongHost = await api()
        .post(`${API}/auth/account-setup`)
        .set('Host', host(elsewhere.body.data.address.subdomain))
        .send({ token: owner.setupToken, password: PASSWORD });
      expect(wrongHost.status).toBe(400);

      expect((await api().post(`${API}/auth/account-setup`).set('Host', host(owner.subdomain)).send({ token: owner.setupToken, password: 'short' })).status).toBe(400);

      const done = await api().post(`${API}/auth/account-setup`).set('Host', host(owner.subdomain)).send({ token: owner.setupToken, password: PASSWORD });
      expect(done.status).toBe(200);
      expect((await api().post(`${API}/auth/account-setup`).set('Host', host(owner.subdomain)).send({ token: owner.setupToken, password: PASSWORD })).status).toBe(400);

      const login = await api().post(`${API}/auth/login`).set('Host', host(owner.subdomain)).send({ email: owner.email, password: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.activeTenant.tenantId).toBe(owner.tenantId);

      const audit = await prisma.rndtechnosoft_audit_logs.findFirst({ where: { tenant_id: owner.tenantId, action_code: 'ACCOUNT_SETUP_COMPLETED' } });
      expect(audit).not.toBeNull();
    });

    it('refuses invalid setup links without saying whether they existed', async () => {
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      for (const bad of ['short', 'x'.repeat(43), owner.setupToken]) {
        const response = await api().post(`${API}/auth/account-setup/inspect`).send({ token: bad });
        expect([bad.slice(0, 5), response.status, response.body.message]).toEqual([
          bad.slice(0, 5),
          400,
          'This setup link is invalid, already used or expired. Ask your administrator to send a new one.',
        ]);
      }
    });

    it('returns the same workspace for a repeated submission, even two at once', async () => {
      const body = form('gamma');
      const [first, second] = await Promise.all([provision(body), provision(body)]);
      expect([first.status, second.status].sort()).toEqual([201, 201]);
      expect(first.body.data.tenant.id).toBe(second.body.data.tenant.id);
      expect([first.body.data.replayed, second.body.data.replayed].sort()).toEqual([false, true]);

      const third = await provision(body);
      expect(third.body.data).toMatchObject({ replayed: true, tenant: { id: first.body.data.tenant.id } });
      expect(await prisma.rndtechnosoft_tenants.count({ where: { tenant_code: body.tenantCode } })).toBe(1);
      expect(await prisma.rndtechnosoft_email_deliveries.count({ where: { tenant_id: first.body.data.tenant.id } })).toBe(1);
    });

    it('refuses reserved, invalid and taken addresses, taken codes and broken module sets, creating nothing', async () => {
      const attempts: [string, Record<string, unknown>, number][] = [
        ['reserved address', { subdomain: 'admin' }, 400],
        ['reserved address', { subdomain: 'support' }, 400],
        ['invalid address', { subdomain: '---' }, 400],
        ['invalid address', { subdomain: 'x' }, 400],
        ['taken address', { subdomain: owner.subdomain }, 409],
        ['taken code', { tenantCode: `OB_ALPHA_${SUFFIX.toUpperCase()}` }, 409],
        ['finance without HRMS', { modules: ['FINANCE'] }, 400],
        ['unknown module', { modules: ['PAYROLL'] }, 400],
        ['bad timezone', { timezone: 'Mars/Olympus' }, 400],
      ];
      for (const [label, overrides, status] of attempts) {
        const body = form(`x${randomBytes(3).toString('hex')}`, overrides);
        const response = await provision(body);
        expect([label, response.status]).toEqual([label, status]);
        if (overrides.tenantCode === undefined) {
          expect(await prisma.rndtechnosoft_tenants.count({ where: { tenant_code: String(body.tenantCode) } })).toBe(0);
        }
        expect(await prisma.rndtechnosoft_users.count({ where: { email: String(body.ownerEmail) } })).toBe(0);
      }
    });

    it('gives an existing account the workspace without a setup link, and refuses a disabled one', async () => {
      const body = form('delta', { ownerEmail: owner.email });
      const before = smtp.messages.length;
      const response = await provision(body);
      expect(response.status).toBe(201);
      expect(response.body.data.owner).toMatchObject({ isNewAccount: false, passwordSet: true });
      expect(smtp.messages).toHaveLength(before + 1);
      expect(setupTokenIn(smtp.messages.at(-1)!.body)).toBeNull();
      expect(smtp.messages.at(-1)!.body).toMatch(/your existing .+ password/);

      const disabledEmail = `disabled-${SUFFIX}@provisioning.test`;
      userEmails.push(disabledEmail);
      await prisma.rndtechnosoft_users.create({ data: { id: randomUUID(), email: disabledEmail, user_status: 'DISABLED' } });
      const refused = await provision(form('epsilon', { ownerEmail: disabledEmail }));
      expect(refused.status).toBe(409);
    });

    it('keeps the workspace when the email fails, and sends it again with a fresh link', async () => {
      await saveSmtp({ port: 25 });
      const body = form('zeta');
      const response = await provision(body);
      expect(response.status).toBe(201);
      expect(response.body.data.onboardingEmail).toMatchObject({ status: 'FAILED', error: expect.stringMatching(/Could not connect/) });
      const tenantId = response.body.data.tenant.id;
      expect(await prisma.rndtechnosoft_tenants.count({ where: { id: tenantId } })).toBe(1);

      await saveSmtp();
      const before = smtp.messages.length;
      const resent = await api().post(`${API}/super-admin/tenants/${tenantId}/onboarding/resend-email`).set(asPlatform());
      expect(resent.status).toBe(200);
      expect(resent.body.data.onboardingEmail.status).toBe('SENT');
      expect(smtp.messages).toHaveLength(before + 1);
      const freshToken = setupTokenIn(smtp.messages.at(-1)!.body)!;

      const tokens = await prisma.rndtechnosoft_account_setup_tokens.findMany({ where: { tenant_id: tenantId }, orderBy: { created_at: 'asc' } });
      expect(tokens).toHaveLength(2);
      expect(tokens[0].revoked_at).not.toBeNull();
      expect(tokens[1]).toMatchObject({ token_hash: hashAccountSetupToken(freshToken), revoked_at: null });

      const status = await api().get(`${API}/super-admin/tenants/${tenantId}/onboarding`).set(asPlatform());
      expect(status.body.data.onboardingEmail.status).toBe('SENT');

      const actions = (await prisma.rndtechnosoft_platform_activity_logs.findMany({ where: { target_tenant_id: tenantId }, orderBy: { created_at: 'asc' } })).map((l) => l.action);
      expect(actions).toEqual(['TENANT_PROVISIONED', 'ONBOARDING_EMAIL_FAILED', 'ONBOARDING_EMAIL_SENT']);
      const logs = JSON.stringify(await prisma.rndtechnosoft_platform_activity_logs.findMany({ where: { target_tenant_id: tenantId } }));
      expect(logs).not.toContain(freshToken);
    });

    it('creates the workspace but reports the email as not sent when SMTP is not configured', async () => {
      const saved = await prisma.rndtechnosoft_platform_settings.findUniqueOrThrow({ where: { setting_key: SMTP_SETTINGS_KEY } });
      await prisma.rndtechnosoft_platform_settings.delete({ where: { setting_key: SMTP_SETTINGS_KEY } });
      try {
        const response = await provision(form('eta'));
        expect(response.status).toBe(201);
        expect(response.body.data.onboardingEmail).toMatchObject({ status: 'NOT_SENT', error: expect.stringMatching(/not configured/) });
      } finally {
        await prisma.rndtechnosoft_platform_settings.create({ data: { ...saved, setting_value: saved.setting_value as object } });
      }
    });

    it('attaches a subscription to an existing plan, with trial dates checked', async () => {
      const planId = randomUUID();
      planIds.push(planId);
      await prisma.rndtechnosoft_plans.create({ data: { id: planId, plan_code: `OB_PLAN_${SUFFIX}`, plan_name: 'Onboarding test plan', billing_interval: 'MONTHLY' } });

      const invalid: [Record<string, unknown>, number][] = [
        [{ planCode: 'NO_SUCH_PLAN', status: 'ACTIVE', startsOn: '2026-10-01' }, 400],
        [{ planCode: `OB_PLAN_${SUFFIX}`, status: 'TRIALING', startsOn: '2026-10-01' }, 400],
        [{ planCode: `OB_PLAN_${SUFFIX}`, status: 'TRIALING', startsOn: '2026-10-01', trialEndsOn: '2026-09-01' }, 400],
      ];
      for (const [subscription, status] of invalid) {
        expect((await provision(form(`s${randomBytes(3).toString('hex')}`, { subscription }))).status).toBe(status);
      }

      const response = await provision(
        form('theta', { subscription: { planCode: `OB_PLAN_${SUFFIX}`, status: 'TRIALING', startsOn: '2026-10-01', trialEndsOn: '2026-10-31' } }),
      );
      expect(response.status).toBe(201);
      expect(response.body.data.subscription).toEqual({
        planCode: `OB_PLAN_${SUFFIX}`,
        planName: 'Onboarding test plan',
        status: 'TRIALING',
        startsOn: '2026-10-01',
        endsOn: null,
        trialEndsOn: '2026-10-31',
      });
    });

    it('lists the new workspace in Tenant Workspaces with the owner as its one member', async () => {
      const list = await api().get(`${API}/super-admin/tenants`).query({ search: `OB_ALPHA_${SUFFIX}` }).set(asPlatform());
      expect(list.status).toBe(200);
      const item = list.body.data.items.find((t: { id: string }) => t.id === owner.tenantId);
      expect(item).toMatchObject({
        subdomain: owner.subdomain,
        status: 'ACTIVE',
        owner: { email: owner.email },
        members: { current: 1, active: 1, suspended: 0, removed: 0, allTime: 1 },
        seats: { used: 1 },
        timezone: 'Asia/Kolkata',
        currency: 'INR',
      });
      expect(item.modules.filter((m: { enabled: boolean }) => m.enabled).map((m: { code: string }) => m.code)).toEqual(['HRMS', 'FINANCE']);
    });
  });

  describe('authorization', () => {
    it('keeps provisioning, onboarding and SMTP away from anonymous callers and workspace sessions', async () => {
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      // An owner who completed setup, so they can sign in to their workspace.
      const onboarded = await prisma.rndtechnosoft_tenant_onboardings.findFirstOrThrow({
        where: { tenant_id: { in: tenantIds }, owner_is_new_account: true, rndtechnosoft_users: { password_hash: { not: null } } },
        include: { rndtechnosoft_users: true },
      });
      const subdomain = (await prisma.rndtechnosoft_tenant_domains.findFirstOrThrow({ where: { tenant_id: onboarded.tenant_id } })).subdomain!;
      const login = await api().post(`${API}/auth/login`).set('Host', host(subdomain)).send({ email: onboarded.rndtechnosoft_users.email, password: PASSWORD });
      expect(login.status).toBe(200);
      const tenantToken = login.body.token;

      const routes: [string, string][] = [
        ['get', '/super-admin/provisioning/options'],
        ['get', '/super-admin/provisioning/check?subdomain=abc'],
        ['post', '/super-admin/tenants'],
        ['get', `/super-admin/tenants/${onboarded.tenant_id}/onboarding`],
        ['post', `/super-admin/tenants/${onboarded.tenant_id}/onboarding/resend-email`],
        ['put', `/super-admin/tenants/${onboarded.tenant_id}/quotas`],
        ['get', '/super-admin/settings/smtp'],
        ['put', '/super-admin/settings/smtp'],
        ['post', '/super-admin/settings/smtp/test'],
      ];
      for (const [method, path] of routes) {
        const anonymous = await (api() as unknown as Record<string, (url: string) => request.Test>)[method](`${API}${path}`).send(form('auth'));
        const workspace = await (api() as unknown as Record<string, (url: string) => request.Test>)[method](`${API}${path}`)
          .set('Authorization', `Bearer ${tenantToken}`)
          .send(form('auth'));
        expect([path, anonymous.status, workspace.status]).toEqual([path, 401, 401]);
      }
    });

    it('validates and audits workspace limit changes', async () => {
      const tenantId = tenantIds[0];
      expect((await api().put(`${API}/super-admin/tenants/${tenantId}/quotas`).set(asPlatform()).send({ userSeatsLimit: -5 })).status).toBe(400);
      expect((await api().put(`${API}/super-admin/tenants/${tenantId}/quotas`).set(asPlatform()).send({ extra: 1 })).status).toBe(400);
      expect((await api().put(`${API}/super-admin/tenants/${randomUUID()}/quotas`).set(asPlatform()).send({ userSeatsLimit: 5 })).status).toBe(404);
      const saved = await api().put(`${API}/super-admin/tenants/${tenantId}/quotas`).set(asPlatform()).send({ userSeatsLimit: 40 });
      expect(saved.status).toBe(200);
      expect(saved.body.data.user_seats_limit).toBe(40);
      const log = await prisma.rndtechnosoft_platform_activity_logs.findFirst({ where: { target_tenant_id: tenantId, action: 'TENANT_QUOTAS_UPDATED' } });
      expect(log?.metadata).toMatchObject({ before: { userSeatsLimit: 25 }, after: { userSeatsLimit: 40 } });
    });
  });
});
