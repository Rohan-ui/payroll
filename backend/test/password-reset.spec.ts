import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT, verifyPassword } from '@/common/security/password.util';
import { replaceWithTemporaryPassword } from '@/common/security/temporary-password';
import { SMTP_SETTINGS_KEY } from '@/modules/email/email.service';
import { FakeSmtpServer } from './support/fake-smtp-server';

/**
 * Passwords after onboarding: replacing a temporary password (the session
 * proves it), voluntary changes, and a Super Admin reset that emails a new
 * temporary password, ends every session and makes every earlier password
 * unusable. Plaintext passwords and hashes must never leave the server except
 * the temporary password, in its email.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const ADMIN_PASSWORD = 'Password-Reset-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const SMTP_PORT = 2525;

describe('Temporary passwords, password changes and Super Admin resets', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let supportToken: string;
  const smtp = new FakeSmtpServer();
  const previousBaseDomain = process.env.PLATFORM_BASE_DOMAIN;
  let previousSmtpSetting: { setting_value: unknown } | null = null;

  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const adminIds: string[] = [];

  const api = () => request(app.getHttpServer());
  const asPlatform = (t = token) => ({ Authorization: `Bearer ${t}` });
  const host = (label: string) => `${label}.${BASE}`;
  const temporaryPasswordIn = (body: string) => body.match(/Temporary password: ([A-Za-z0-9]{16})\b/)?.[1] ?? null;
  const lastMailTo = (email: string) => smtp.messages.filter((m) => m.to.includes(email)).at(-1)?.body ?? '';
  const signIn = (subdomain: string, email: string, password: string) =>
    api().post(`${API}/auth/login`).set('Host', host(subdomain)).send({ email, password });
  const bearer = (login: request.Response, subdomain: string) => ({ Authorization: `Bearer ${login.body.token}`, Host: host(subdomain) });
  const hashOf = async (email: string) => (await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { email } })).password_hash;
  /** No password hash, and none of the given secrets, anywhere in a response. */
  const leaksNothing = (response: request.Response, ...secrets: string[]) => {
    const body = JSON.stringify(response.body);
    return !body.includes('scrypt$') && !/password_?hash/i.test(body) && secrets.every((secret) => !body.includes(secret));
  };

  /** A workspace provisioned from HQ; its owner then replaces the emailed temporary password with `password`. */
  async function onboard(label: string, password: string) {
    const email = `pr-${label}-${SUFFIX}@password.test`;
    const subdomain = `pr-${label}-${SUFFIX}`;
    userEmails.push(email);
    const created = await api()
      .post(`${API}/super-admin/tenants`)
      .set(asPlatform())
      .send({
        idempotencyKey: randomUUID(),
        organizationName: `Reset ${label} ${SUFFIX}`,
        legalName: `Reset ${label} ${SUFFIX} Pvt Ltd`,
        tenantCode: `PR_${label.toUpperCase()}_${SUFFIX.toUpperCase()}`,
        subdomain,
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        ownerFirstName: 'Priya',
        ownerLastName: label,
        ownerEmail: email,
        modules: ['HRMS'],
      });
    expect(created.status).toBe(201);
    tenantIds.push(created.body.data.tenant.id);
    const temporary = temporaryPasswordIn(lastMailTo(email));
    expect(temporary).not.toBeNull();
    const login = await signIn(subdomain, email, temporary!);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect((await api().post(`${API}/auth/change-password`).set(bearer(login, subdomain)).send({ newPassword: password })).status).toBe(200);
    const user = await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { email } });
    return { email, subdomain, tenantId: created.body.data.tenant.id as string, userId: user.id };
  }

  async function platformAccount(label: string, role: string) {
    const id = randomUUID();
    const email = `pr-${label}-${SUFFIX}@voogyo.test`;
    await prisma.rndtechnosoft_super_admins.create({
      data: { id, email, password_hash: await hashPassword(ADMIN_PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, display_name: label, role, is_active: true },
    });
    adminIds.push(id);
    return (await api().post(`${API}/super-admin/auth/login`).send({ email, password: ADMIN_PASSWORD })).body.data.token as string;
  }

  let target: Awaited<ReturnType<typeof onboard>>;
  let other: Awaited<ReturnType<typeof onboard>>;
  const P0 = `Chosen-Password-${SUFFIX}-0`;
  const P1 = `Chosen-Password-${SUFFIX}-1`;
  const P2 = `Chosen-Password-${SUFFIX}-2`;
  const OTHER = `Other-Password-${SUFFIX}`;
  let firstTemporary = '';
  let secondTemporary = '';

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

    previousSmtpSetting = await prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: SMTP_SETTINGS_KEY }, select: { setting_value: true } });
    token = await platformAccount('super', 'SUPER_ADMIN');
    supportToken = await platformAccount('support', 'SUPPORT');
    const smtpSaved = await api()
      .put(`${API}/super-admin/settings/smtp`)
      .set(asPlatform())
      .send({ host: '127.0.0.1', port: SMTP_PORT, encryption: 'NONE', fromEmail: 'hq@password.test', fromName: 'Voogyo HQ' });
    expect(smtpSaved.status).toBe(200);

    target = await onboard('target', P0);
    other = await onboard('other', OTHER);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_tenant_onboardings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_email_deliveries.deleteMany({ where: { OR: [scope, { requested_by_super_admin_id: { in: adminIds } }] } });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: { OR: [scope, { actor_user_id: { in: userIds } }] } });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({ where: { OR: [{ super_admin_id: { in: adminIds } }, { target_tenant_id: { in: tenantIds } }] } });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: { OR: [scope, { user_id: { in: userIds } }] } });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
      await prisma.rndtechnosoft_super_admin_sessions.deleteMany({ where: { super_admin_id: { in: adminIds } } });
      await prisma.rndtechnosoft_super_admins.deleteMany({ where: { id: { in: adminIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
      await prisma.rndtechnosoft_platform_settings.deleteMany({ where: { setting_key: SMTP_SETTINGS_KEY } });
      if (previousSmtpSetting) {
        await prisma.rndtechnosoft_platform_settings.create({
          data: { id: randomUUID(), setting_category: 'EMAIL', setting_key: SMTP_SETTINGS_KEY, setting_value: previousSmtpSetting.setting_value as object },
        });
      }
    }
    await smtp.stop();
    if (previousBaseDomain === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previousBaseDomain;
    await app?.close();
  });

  beforeEach(() => prisma.rndtechnosoft_login_throttle.deleteMany({}));

  describe('signing in and replacing a temporary password', () => {
    it('signs in normally with a chosen password, and returns no password material', async () => {
      const login = await signIn(target.subdomain, target.email, P0);
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(false);
      expect(leaksNothing(login, P0)).toBe(true);
      const me = await api().get(`${API}/auth/me`).set(bearer(login, target.subdomain));
      expect(me.status).toBe(200);
      expect(leaksNothing(me, P0)).toBe(true);
    });
  });

  describe('Super Admin reset', () => {
    it('emails a new temporary password, ends every session and makes the old password unusable', async () => {
      const open = await signIn(target.subdomain, target.email, P0);
      const otherSession = await signIn(other.subdomain, other.email, OTHER);
      const before = smtp.messages.length;

      const reset = await api().post(`${API}/super-admin/users/${target.userId}/reset-password`).set(asPlatform());
      expect(reset.status).toBe(200);
      expect(reset.body.data).toMatchObject({ userId: target.userId, email: { status: 'SENT', recipient: target.email, error: null } });
      expect(reset.body.data.revokedSessions).toBeGreaterThanOrEqual(1);

      expect(smtp.messages).toHaveLength(before + 1);
      const mail = lastMailTo(target.email);
      expect(mail).toContain('password was reset');
      expect(mail).toContain(`https://${host(target.subdomain)}`);
      firstTemporary = temporaryPasswordIn(mail)!;
      expect(firstTemporary).toMatch(/^[A-Za-z0-9]{16}$/);
      expect(leaksNothing(reset, firstTemporary)).toBe(true);

      // Every open session of that account ended; someone else's did not.
      expect((await api().get(`${API}/auth/me`).set(bearer(open, target.subdomain))).status).toBe(401);
      expect((await api().get(`${API}/auth/me`).set(bearer(otherSession, other.subdomain))).status).toBe(200);

      // The previous password no longer works; the temporary one signs in, but only to replace it.
      expect((await signIn(target.subdomain, target.email, P0)).status).toBe(401);
      const login = await signIn(target.subdomain, target.email, firstTemporary);
      expect(login.status).toBe(200);
      expect(login.body.user.mustChangePassword).toBe(true);
      const blocked = await api().get(`${API}/tenant/current`).set(bearer(login, target.subdomain));
      expect([blocked.status, blocked.body.code]).toEqual([403, 'PASSWORD_CHANGE_REQUIRED']);

      // Only its hash is stored; the plaintext is nowhere in the database.
      const row = await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { id: target.userId } });
      expect(row.must_change_password).toBe(true);
      expect((await verifyPassword(firstTemporary, row.password_hash!)).isValid).toBe(true);
      const stored = JSON.stringify([
        row,
        await prisma.rndtechnosoft_email_deliveries.findMany({ where: { recipient_email: target.email } }),
        await prisma.rndtechnosoft_platform_activity_logs.findMany({ where: { super_admin_id: adminIds[0] } }),
      ]);
      expect(stored).not.toContain(firstTemporary);
      const log = await prisma.rndtechnosoft_platform_activity_logs.findFirst({ where: { action: 'USER_PASSWORD_RESET', super_admin_id: adminIds[0] } });
      expect(log?.metadata).toMatchObject({ userId: target.userId });

      // Memberships and roles are untouched.
      const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({
        where: { user_id: target.userId, tenant_id: target.tenantId },
        include: { rndtechnosoft_tenant_member_roles: { include: { rndtechnosoft_roles: true } } },
      });
      expect(member.membership_status).toBe('ACTIVE');
      expect(member.rndtechnosoft_tenant_member_roles.map((r) => r.rndtechnosoft_roles.role_code)).toEqual(['ADMIN']);
    });

    it('makes the previous temporary password unusable when reset again', async () => {
      const reset = await api().post(`${API}/super-admin/users/${target.userId}/reset-password`).set(asPlatform());
      expect(reset.body.data.email.status).toBe('SENT');
      secondTemporary = temporaryPasswordIn(lastMailTo(target.email))!;
      expect(secondTemporary).not.toBe(firstTemporary);
      expect((await signIn(target.subdomain, target.email, firstTemporary)).status).toBe(401);
      expect((await signIn(target.subdomain, target.email, secondTemporary)).status).toBe(200);
    });

    it('lets the user replace the temporary password once, after which it no longer works', async () => {
      const login = await signIn(target.subdomain, target.email, secondTemporary);
      const session = bearer(login, target.subdomain);
      const changed = await api().post(`${API}/auth/change-password`).set(session).send({ newPassword: P1 });
      expect(changed.status).toBe(200);
      expect(leaksNothing(changed, P1, secondTemporary)).toBe(true);

      expect((await api().get(`${API}/auth/me`).set(session)).body.user.mustChangePassword).toBe(false);
      expect((await api().get(`${API}/tenant/current`).set(session)).status).toBe(200);
      expect((await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { id: target.userId } })).must_change_password).toBe(false);
      expect((await signIn(target.subdomain, target.email, secondTemporary)).status).toBe(401);
      expect((await signIn(target.subdomain, target.email, P1)).status).toBe(200);
    });

    it('can only be done by a SUPER_ADMIN platform account', async () => {
      const hash = await hashOf(target.email);
      const otherHash = await hashOf(other.email);
      // Even the workspace's own administrator cannot reach it with a workspace session.
      const workspaceAdmin = await signIn(target.subdomain, target.email, P1);
      const path = `${API}/super-admin/users/${other.userId}/reset-password`;
      expect((await api().post(path)).status).toBe(401);
      expect((await api().post(path).set(bearer(workspaceAdmin, target.subdomain))).status).toBe(401);
      expect((await api().post(path).set(asPlatform(supportToken))).status).toBe(403);
      expect(await hashOf(other.email)).toBe(otherHash);
      expect((await signIn(other.subdomain, other.email, OTHER)).status).toBe(200);
      expect(await hashOf(target.email)).toBe(hash);
    });

    it('refuses unknown, disabled and workspace-less accounts, and missing email setup, changing nothing', async () => {
      expect((await api().post(`${API}/super-admin/users/${randomUUID()}/reset-password`).set(asPlatform())).status).toBe(404);
      expect((await api().post(`${API}/super-admin/users/not-a-uuid/reset-password`).set(asPlatform())).status).toBe(400);

      const loneEmail = `pr-lone-${SUFFIX}@password.test`;
      userEmails.push(loneEmail);
      const lone = await prisma.rndtechnosoft_users.create({
        data: { id: randomUUID(), email: loneEmail, password_hash: await hashPassword(P2), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
      });
      const noWorkspace = await api().post(`${API}/super-admin/users/${lone.id}/reset-password`).set(asPlatform());
      expect([noWorkspace.status, noWorkspace.body.message]).toEqual([400, expect.stringMatching(/not an active member of any active workspace/)]);
      expect(await hashOf(loneEmail)).toBe(lone.password_hash);

      const hash = await hashOf(other.email);
      expect((await api().post(`${API}/super-admin/users/${other.userId}/disable`).set(asPlatform())).status).toBe(200);
      expect((await api().post(`${API}/super-admin/users/${other.userId}/reset-password`).set(asPlatform())).status).toBe(400);
      expect((await api().post(`${API}/super-admin/users/${other.userId}/enable`).set(asPlatform())).status).toBe(200);
      expect(await hashOf(other.email)).toBe(hash);

      const saved = await prisma.rndtechnosoft_platform_settings.findUniqueOrThrow({ where: { setting_key: SMTP_SETTINGS_KEY } });
      await prisma.rndtechnosoft_platform_settings.delete({ where: { setting_key: SMTP_SETTINGS_KEY } });
      try {
        const noEmail = await api().post(`${API}/super-admin/users/${other.userId}/reset-password`).set(asPlatform());
        expect([noEmail.status, noEmail.body.message]).toEqual([400, expect.stringMatching(/Configure SMTP/)]);
        expect(await hashOf(other.email)).toBe(hash);
      } finally {
        await prisma.rndtechnosoft_platform_settings.create({ data: { ...saved, setting_value: saved.setting_value as object } });
      }
    });

    it('issues nothing when the password changed after it was read', async () => {
      const hash = await hashOf(other.email);
      const replaced = await prisma.$transaction((tx) => replaceWithTemporaryPassword(tx, other.userId, 'Stale1234567890X', 'not-the-current-hash'));
      expect(replaced).toBeNull();
      expect(await hashOf(other.email)).toBe(hash);
    });
  });

  describe('changing a password voluntarily', () => {
    it('needs the current password, keeps the session on a mistake, and ends the other sessions', async () => {
      const elsewhere = await signIn(target.subdomain, target.email, P1);
      const login = await signIn(target.subdomain, target.email, P1);
      const session = bearer(login, target.subdomain);

      const missing = await api().post(`${API}/auth/change-password`).set(session).send({ newPassword: P2 });
      expect([missing.status, missing.body.message]).toEqual([400, 'Enter your current password.']);
      const wrong = await api().post(`${API}/auth/change-password`).set(session).send({ currentPassword: 'not-it', newPassword: P2 });
      expect([wrong.status, wrong.body.message]).toEqual([400, 'Current password is incorrect.']);
      const same = await api().post(`${API}/auth/change-password`).set(session).send({ currentPassword: P1, newPassword: P1 });
      expect(same.status).toBe(400);
      const short = await api().post(`${API}/auth/change-password`).set(session).send({ currentPassword: P1, newPassword: 'short' });
      expect(short.status).toBe(400);
      expect((await api().get(`${API}/auth/me`).set(session)).status).toBe(200);

      expect((await api().post(`${API}/auth/change-password`).set(session).send({ currentPassword: P1, newPassword: P2 })).status).toBe(200);
      expect((await api().get(`${API}/auth/me`).set(session)).status).toBe(200);
      expect((await api().get(`${API}/auth/me`).set(bearer(elsewhere, target.subdomain))).status).toBe(401);
      expect((await signIn(target.subdomain, target.email, P1)).status).toBe(401);
      expect((await signIn(target.subdomain, target.email, P2)).status).toBe(200);
    });

    it("changes only the caller's own password; another user cannot be named", async () => {
      const targetHash = await hashOf(target.email);
      const otherHash = await hashOf(other.email);
      const login = await signIn(other.subdomain, other.email, OTHER);
      const named = await api()
        .post(`${API}/auth/change-password`)
        .set(bearer(login, other.subdomain))
        .send({ currentPassword: OTHER, newPassword: `Hijack-${SUFFIX}-000`, userId: target.userId });
      expect(named.status).toBe(400);
      expect(await hashOf(target.email)).toBe(targetHash);
      expect(await hashOf(other.email)).toBe(otherHash);
      expect((await signIn(other.subdomain, other.email, OTHER)).status).toBe(200);
    });
  });

  it('never returns password hashes from the platform user directory', async () => {
    const [list, detail] = await Promise.all([
      api().get(`${API}/super-admin/users`).query({ search: SUFFIX }).set(asPlatform()),
      api().get(`${API}/super-admin/users/${target.userId}`).set(asPlatform()),
    ]);
    expect([list.status, detail.status]).toEqual([200, 200]);
    expect(leaksNothing(list)).toBe(true);
    expect(leaksNothing(detail)).toBe(true);
  });
});
