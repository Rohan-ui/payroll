import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OnboardingMailerService } from '@/modules/onboarding/onboarding-mailer.service';
import { startFakeImap, startFakeSmtp } from './support/fake-smtp';

/**
 * Members' own mail accounts over HTTP: each member saves, tests and
 * disconnects only their own account, passwords are encrypted and never
 * returned, emails a member starts go from their own account only when the
 * workspace allows it (else the organization's), automatic emails always go
 * from the organization's, and nothing crosses workspaces.
 *
 * Mail goes to fake servers on 127.0.0.1 only: the organization's (plain, no
 * sign-in, like the existing tests) and a personal one over TLS that checks
 * each member's password, with a test-only certificate trusted through
 * NODE_EXTRA_CA_CERTS. The suite stops if a workspace would send anywhere else.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Personal-Mail-Accounts-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string };

describe('personal mail accounts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let org: Awaited<ReturnType<typeof startFakeSmtp>>;
  let personal: Awaited<ReturnType<typeof startFakeSmtp>>;
  let imap: Awaited<ReturnType<typeof startFakeImap>>;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const ravi = { tenantId: '', token: '', email: `ravi-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const other = { tenantId: '', token: '', email: `owner-b-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const neha: Person = { token: '', email: `neha-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const sagar: Person = { token: '', email: `sagar-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const meet: Person = { token: '', email: `meet-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const viewer: Person = { token: '', email: `viewer-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const SECRETS = { neha: 'neha-App-Pass-9f3k', nehaNew: 'neha-New-Pass-2x8q', sagar: 'sagar-App-Pass-7h2m', wrong: 'Wrong-Pass-5z1c' };

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const account = (person: { email: string }, extra: Record<string, unknown> = {}) => ({
    provider: 'CUSTOM',
    smtpHost: personal.host,
    smtpPort: personal.port,
    smtpSecurity: 'SSL',
    smtpUsername: person.email,
    senderEmail: person.email,
    senderName: 'Business Development',
    imapEnabled: false,
    ...extra,
  });
  const compose = (person: { token: string }, subject: string) => call('post', '/gmail/messages/send', person.token, { to: [`lead-${SUFFIX}@customer.test`], subject, text: 'Hello from sales.' });
  const received = (server: typeof org, subject: string) => server.messages.filter((m) => m.data.includes(`Subject: ${subject}`));

  async function register(workspace: typeof ravi, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Mail ${label} ${SUFFIX}`, tenantCode: `MAIL${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, roleCode: string, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: person.userId, email: person.email, display_name: roleCode, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: ravi.tenantId, role_code: `${roleCode}_${person.email.slice(0, 5).toUpperCase()}`, role_name: `${roleCode} ${person.email.slice(0, 5)}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: ravi.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: ravi.tenantId, user_id: person.userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: ravi.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: ravi.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    org = await startFakeSmtp();
    personal = await startFakeSmtp({
      tls: true,
      accounts: { [neha.email]: SECRETS.neha, [`neha2-${SUFFIX}@rnd.test`]: SECRETS.nehaNew, [sagar.email]: SECRETS.sagar },
    });
    imap = await startFakeImap({ [neha.email]: SECRETS.neha });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    await register(ravi, 'A');
    await register(other, 'B');
    const sales = ['marketing.view', 'marketing.manage', 'onboarding.view', 'onboarding.documents.view', 'onboarding.documents.manage'];
    await addMember(neha, 'BDM', sales);
    await addMember(sagar, 'BDM', sales);
    await addMember(meet, 'BDM', sales);
    await addMember(viewer, 'VIEWER', ['onboarding.view']);

    // Workspace A's organization account is the plain fake server; B has none.
    const smtpSettings = { host: org.host, port: org.port, username: null, passwordEncrypted: null, senderName: 'RND HR', senderEmail: `hr-${SUFFIX}@rnd.test`, replyToEmail: null, encryption: 'NONE', isActive: true };
    const row = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: ravi.tenantId } });
    const merged = { ...((row?.settings as Record<string, unknown>) ?? {}), smtp: smtpSettings };
    if (row) await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: ravi.tenantId }, data: { settings: merged } });
    else await prisma.rndtechnosoft_tenant_settings.create({ data: { id: randomUUID(), tenant_id: ravi.tenantId, settings: merged } });
    for (const setting of await prisma.rndtechnosoft_tenant_settings.findMany({ where: { tenant_id: { in: tenantIds } } })) {
      const configured = (setting.settings as { smtp?: { host?: string } } | null)?.smtp?.host;
      if (configured && configured !== '127.0.0.1') throw new Error('Refusing to run: a test workspace would send real email');
    }
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_document_files.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_document_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_user_mail_accounts.deleteMany({ where: scope });
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
    await Promise.all([org?.close(), personal?.close(), imap?.close()]);
  });

  describe('saving', () => {
    it('saves a member’s own account, encrypts the password, and never returns it', async () => {
      const saved = await call('put', '/mail-accounts/me', neha.token, account(neha, { smtpPassword: SECRETS.neha }));
      expect(saved.status).toBe(200);
      expect(saved.body.data.account).toMatchObject({ senderEmail: neha.email, hasSmtpPassword: true, smtpStatus: 'UNTESTED', enabled: true });
      expect(saved.text).not.toContain(SECRETS.neha);
      const row = await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: neha.userId } });
      expect(row.smtp_password_encrypted?.startsWith('v1.')).toBe(true);
      expect(JSON.stringify(row)).not.toContain(SECRETS.neha);
      expect((await call('get', '/mail-accounts/me', neha.token)).text).not.toContain(SECRETS.neha);
      // Saving sends nothing.
      expect(personal.messages).toHaveLength(0);
      expect(personal.logins).toHaveLength(0);
    });

    it('keeps each member to their own account: others see and change only theirs', async () => {
      expect((await call('get', '/mail-accounts/me', sagar.token)).body.data.account).toBeNull();
      expect((await call('get', '/mail-accounts/me', ravi.token)).body.data.account).toBeNull();
      expect((await call('get', '/mail-accounts/me', other.token)).body.data.account).toBeNull();
      // A user id in the body is refused, not used.
      const smuggled = await call('put', '/mail-accounts/me', sagar.token, { ...account(sagar, { smtpPassword: SECRETS.sagar }), userId: neha.userId });
      expect(smuggled.status).toBe(400);
      expect((await call('put', '/mail-accounts/me', sagar.token, account(sagar, { smtpPassword: SECRETS.sagar }))).status).toBe(200);
      const nehaRow = await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: neha.userId } });
      expect(nehaRow.smtp_username).toBe(neha.email);
      expect(await prisma.rndtechnosoft_user_mail_accounts.count({ where: { tenant_id: ravi.tenantId } })).toBe(2);
    });

    it('sends a saved password only to the server it was saved for', async () => {
      const moved = await call('put', '/mail-accounts/me', neha.token, account(neha, { smtpHost: 'smtp.attacker.test' }));
      expect([moved.status, moved.body.message]).toEqual([400, 'You changed the SMTP server or username: enter the password again.']);
      const kept = await call('put', '/mail-accounts/me', neha.token, account(neha, { senderName: 'Neha Mishra | Business Development' }));
      expect(kept.status).toBe(200);
      expect(kept.body.data.account.senderName).toBe('Neha Mishra | Business Development');
    });

    it('refuses unencrypted connections, header tricks, and senders a provider won’t allow', async () => {
      expect((await call('put', '/mail-accounts/me', meet.token, account(meet, { smtpSecurity: 'NONE', smtpPassword: 'x' }))).status).toBe(400);
      expect((await call('put', '/mail-accounts/me', meet.token, account(meet, { senderName: 'Meet\r\nBcc: all@x.test', smtpPassword: 'x' }))).status).toBe(400);
      const gmail = await call('put', '/mail-accounts/me', meet.token, account(meet, { provider: 'GMAIL', senderEmail: 'ceo@rnd.test', smtpPassword: 'x' }));
      expect(gmail.status).toBe(400);
      expect(gmail.body.message).toContain('only sends as the address you sign in with');
    });
  });

  describe('testing', () => {
    it('signs in to test the connection and records when it last worked', async () => {
      const tested = await call('post', '/mail-accounts/me/test-smtp', neha.token);
      expect(tested.body.data.ok).toBe(true);
      expect(personal.logins.at(-1)).toEqual({ user: neha.email, ok: true });
      const shown = (await call('get', '/mail-accounts/me', neha.token)).body.data.account;
      expect(shown.smtpStatus).toBe('CONNECTED');
      expect(shown.smtpLastSuccessAt).not.toBeNull();
      expect(personal.messages).toHaveLength(0);
    });

    it('reports a wrong password safely, without the password', async () => {
      await call('put', '/mail-accounts/me', meet.token, account(meet, { smtpPassword: SECRETS.wrong }));
      const tested = await call('post', '/mail-accounts/me/test-smtp', meet.token);
      expect(tested.body.data.ok).toBe(false);
      expect(tested.body.data.message).toContain('rejected the SMTP username or password');
      expect(tested.text).not.toContain(SECRETS.wrong);
      const row = await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: meet.userId } });
      expect(row.smtp_status).toBe('FAILED');
      expect(row.smtp_last_error).not.toContain(SECRETS.wrong);
    });

    it('tests reading the inbox over IMAP with the same password', async () => {
      const saved = await call('put', '/mail-accounts/me', neha.token, account(neha, { imapEnabled: true, imapHost: imap.host, imapPort: imap.port, imapSecurity: 'SSL', imapUsesSmtpPassword: true, smtpPassword: SECRETS.neha }));
      expect(saved.body.data.account).toMatchObject({ imapEnabled: true, imapUsesSmtpPassword: true, imapStatus: 'UNTESTED' });
      const tested = await call('post', '/mail-accounts/me/test-imap', neha.token);
      expect(tested.body.data).toMatchObject({ ok: true });
      expect(imap.logins.at(-1)).toEqual({ user: neha.email, ok: true });
      // The inbox now shows as connected through the member's own account.
      expect((await call('get', '/gmail/status', neha.token)).body).toMatchObject({ connected: true, via: 'IMAP', email: neha.email });
    });

    it('sends a test email only when asked, to the typed address, through the member’s own account', async () => {
      const before = personal.messages.length;
      const sent = await call('post', '/mail-accounts/me/test-email', neha.token, { recipient: `me-${SUFFIX}@inbox.test` });
      expect(sent.body.data.ok).toBe(true);
      expect(personal.messages).toHaveLength(before + 1);
      expect(personal.messages.at(-1)).toMatchObject({ authUser: neha.email, to: [`me-${SUFFIX}@inbox.test`] });
      expect(personal.messages.at(-1)?.data).toContain(`From: Business Development <${neha.email}>`);
    });

    it('limits connection tests and test emails per member', async () => {
      const limited = { ...viewer };
      for (let i = 0; i < 9; i += 1) expect((await call('post', '/mail-accounts/me/test-smtp', meet.token)).status).toBe(200);
      expect((await call('post', '/mail-accounts/me/test-smtp', meet.token)).status).toBe(429);
      // Another member is not affected.
      expect((await call('post', '/mail-accounts/me/test-smtp', neha.token)).status).toBe(200);
      for (let i = 0; i < 4; i += 1) expect((await call('post', '/mail-accounts/me/test-email', neha.token, { recipient: `me-${SUFFIX}@inbox.test` })).status).toBe(200);
      expect((await call('post', '/mail-accounts/me/test-email', neha.token, { recipient: `me-${SUFFIX}@inbox.test` })).status).toBe(429);
      expect((await call('post', '/mail-accounts/me/test-smtp', limited.token)).status).toBe(409);
    });
  });

  describe('sending', () => {
    it('sends everything from the organization’s account until an administrator allows personal accounts', async () => {
      const sent = await compose(neha, `Policy off ${SUFFIX}`);
      expect(sent.status).toBe(201);
      expect(sent.body).toMatchObject({ sentFromKind: 'ORGANIZATION', sentFrom: `hr-${SUFFIX}@rnd.test` });
      expect(received(org, `Policy off ${SUFFIX}`)).toHaveLength(1);
      expect(received(personal, `Policy off ${SUFFIX}`)).toHaveLength(0);

      expect((await call('put', '/mail-accounts/policy', neha.token, { personalAccounts: 'ALLOWED' })).status).toBe(403);
      const allowed = await call('put', '/mail-accounts/policy', ravi.token, { personalAccounts: 'ALLOWED' });
      expect(allowed.body.data).toEqual({ personalAccounts: 'ALLOWED' });
      expect((await call('get', '/tenants/settings', ravi.token)).body.data.email).toEqual({ personalAccounts: 'ALLOWED' });
    });

    it('sends each member’s email from their own account, never another member’s', async () => {
      await call('put', '/mail-accounts/me', sagar.token, account(sagar, { smtpPassword: SECRETS.sagar }));
      const fromNeha = await compose(neha, `From Neha ${SUFFIX}`);
      const fromSagar = await compose(sagar, `From Sagar ${SUFFIX}`);
      expect(fromNeha.body).toMatchObject({ sentFromKind: 'PERSONAL', sentFrom: neha.email });
      expect(fromSagar.body).toMatchObject({ sentFromKind: 'PERSONAL', sentFrom: sagar.email });
      expect(received(personal, `From Neha ${SUFFIX}`).map((m) => m.authUser)).toEqual([neha.email]);
      expect(received(personal, `From Sagar ${SUFFIX}`).map((m) => m.authUser)).toEqual([sagar.email]);
      expect(received(personal, `From Sagar ${SUFFIX}`)[0].data).toContain(`<${sagar.email}>`);
      const audit = await prisma.rndtechnosoft_audit_logs.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, action_code: 'GMAIL_MESSAGE_SENT', actor_tenant_member_id: sagar.memberId } });
      expect(audit.metadata).toMatchObject({ senderKind: 'PERSONAL', senderEmail: sagar.email });
    });

    it('falls back to the organization’s account for a member without one', async () => {
      await prisma.rndtechnosoft_user_mail_accounts.deleteMany({ where: { tenant_id: ravi.tenantId, user_id: meet.userId } });
      const sent = await compose(meet, `Meet fallback ${SUFFIX}`);
      expect(sent.body).toMatchObject({ sentFromKind: 'ORGANIZATION' });
      expect(received(org, `Meet fallback ${SUFFIX}`)).toHaveLength(1);
    });

    it('reports a failing personal account without the password, and never switches account silently', async () => {
      await call('put', '/mail-accounts/me', sagar.token, account(sagar, { smtpPassword: SECRETS.wrong }));
      const failed = await compose(sagar, `Sagar fails ${SUFFIX}`);
      expect(failed.status).toBe(503);
      expect(failed.body.message).toContain(`The email was not sent from ${sagar.email}.`);
      expect(failed.text).not.toContain(SECRETS.wrong);
      expect(received(org, `Sagar fails ${SUFFIX}`)).toHaveLength(0);
      const logs = JSON.stringify(await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: ravi.tenantId } }));
      expect(logs).not.toContain(SECRETS.wrong);
      expect(logs).not.toContain(SECRETS.sagar);
      expect(logs).not.toContain(SECRETS.neha);
    });

    it('uses changed settings at once, with no connection left over', async () => {
      const before = (await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: neha.userId } })).credential_version;
      const changed = await call('put', '/mail-accounts/me', neha.token, account({ email: `neha2-${SUFFIX}@rnd.test` }, { smtpPassword: SECRETS.nehaNew }));
      expect(changed.status).toBe(200);
      expect((await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: neha.userId } })).credential_version).toBe(before + 1);
      await compose(neha, `Neha changed ${SUFFIX}`);
      expect(received(personal, `Neha changed ${SUFFIX}`).map((m) => m.authUser)).toEqual([`neha2-${SUFFIX}@rnd.test`]);
    });

    it('stops using a disconnected account and forgets its password', async () => {
      const gone = await call('delete', '/mail-accounts/me', sagar.token);
      expect(gone.body.data.account).toMatchObject({ enabled: false, hasSmtpPassword: false, smtpStatus: 'DISCONNECTED' });
      const row = await prisma.rndtechnosoft_user_mail_accounts.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, user_id: sagar.userId } });
      expect([row.smtp_password_encrypted, row.imap_password_encrypted]).toEqual([null, null]);
      expect((await call('post', '/mail-accounts/me/test-smtp', sagar.token)).status).toBe(409);
      const sent = await compose(sagar, `Sagar after ${SUFFIX}`);
      expect(sent.body.sentFromKind).toBe('ORGANIZATION');
    });

    it('sends automatic emails from the organization, and member-started ones from the member, recording who started them', async () => {
      const mailer = app.get(OnboardingMailerService);
      const automatic = await mailer.send({ tenantId: ravi.tenantId, idempotencyKey: `auto:${SUFFIX}`, templateCode: 'TEST', to: `c-${SUFFIX}@candidate.test`, subject: `Automatic ${SUFFIX}`, text: 'x', html: '<p>x</p>' });
      expect(automatic).toMatchObject({ status: 'SENT', sentFrom: `hr-${SUFFIX}@rnd.test` });
      expect(received(org, `Automatic ${SUFFIX}`)).toHaveLength(1);

      const created = await call('post', '/onboarding/candidates', ravi.token, { fullName: 'Arjun Mehta', email: `arjun-${SUFFIX}@candidate.test`, appliedPosition: 'Accountant' });
      await call('post', `/onboarding/candidates/${created.body.data.id}/override`, ravi.token, { status: 'OFFER_ACCEPTED', reason: 'Accepted in an earlier process' });
      await call('post', `/onboarding/candidates/${created.body.data.id}/documents`, neha.token, { items: [{ type: 'PAN_CARD', isRequired: true }] });
      const link = await call('post', `/onboarding/candidates/${created.body.data.id}/documents/link`, neha.token);
      expect(link.body.data.notifications[0]).toMatchObject({ status: 'SENT', sentFrom: `neha2-${SUFFIX}@rnd.test` });
      const note = await prisma.rndtechnosoft_onboarding_notifications.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, template_code: 'DOCUMENT_UPLOAD_LINK' } });
      expect(note).toMatchObject({ sender_kind: 'PERSONAL', sender_email: `neha2-${SUFFIX}@rnd.test`, initiated_by_tenant_member_id: neha.memberId });
      const auto = await prisma.rndtechnosoft_onboarding_notifications.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, idempotency_key: `auto:${SUFFIX}` } });
      expect(auto).toMatchObject({ sender_kind: 'ORGANIZATION', initiated_by_tenant_member_id: null });
    });
  });

  describe('workspaces and administrators', () => {
    it('never uses one workspace’s accounts in another', async () => {
      expect((await call('put', '/mail-accounts/policy', other.token, { personalAccounts: 'ALLOWED' })).status).toBe(200);
      const sent = await compose(other, `Other workspace ${SUFFIX}`);
      expect([sent.status, sent.body.message]).toEqual([409, 'The workspace has no active SMTP account. Set one up in Organization Settings to send email.']);
      expect(received(personal, `Other workspace ${SUFFIX}`)).toHaveLength(0);
      const theirs = await call('get', '/mail-accounts/members', other.token);
      expect(theirs.body.data.map((m: { loginEmail: string }) => m.loginEmail)).toEqual([other.email]);
    });

    it('shows administrators who has connected an account, never a password', async () => {
      expect((await call('get', '/mail-accounts/members', viewer.token)).status).toBe(403);
      const list = await call('get', '/mail-accounts/members', ravi.token);
      expect(list.status).toBe(200);
      const nehaRow = list.body.data.find((m: { loginEmail: string }) => m.loginEmail === neha.email);
      expect(nehaRow.account).toMatchObject({ senderEmail: `neha2-${SUFFIX}@rnd.test`, enabled: true });
      expect(list.body.data.find((m: { loginEmail: string }) => m.loginEmail === sagar.email).account).toMatchObject({ enabled: false, smtpStatus: 'DISCONNECTED' });
      expect(list.text).not.toMatch(/password|v1\./i);
    });
  });
});
