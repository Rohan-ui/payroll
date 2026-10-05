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
import { encryptPlatformSecret } from '@/modules/super-admin/auth/platform-crypto.util';
import { CADENCE_STEPS_MASTER, interpolateText } from '@/modules/crm/crm-cadence.helper';
import { deleteCrmData } from './support/crm-cleanup';
import { startFakeSmtp } from './support/fake-smtp';

/**
 * Client Outreach email and its history over HTTP. Whoever executes an email
 * touchpoint, it goes out from the workspace's organization account (never a
 * member's own, even where personal accounts are allowed), and the member is
 * recorded as the executor. Every attempt is kept, a touchpoint completes only
 * after a real send, and each lead's history (who did what, with before and
 * after values) is append-only and visible only inside its workspace.
 *
 * Mail goes to fake servers on 127.0.0.1 only.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Outreach-Email-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const B_SMTP_PASSWORD = 'B-Org-Smtp-Secret-7k2p';

type Method = 'get' | 'post' | 'put';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = { tenantId: string; token: string; email: string; memberId: string; userId: string };

const OUTREACH = ['leads.view', 'leads.create', 'leads.update', 'outreach.view', 'outreach.create', 'outreach.update'];

describe('Client Outreach email', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgA: Awaited<ReturnType<typeof startFakeSmtp>>;
  let orgB: Awaited<ReturnType<typeof startFakeSmtp>>;
  let personal: Awaited<ReturnType<typeof startFakeSmtp>>;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const ravi: Workspace = { tenantId: '', token: '', email: `ravi-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const other: Workspace = { tenantId: '', token: '', email: `owner-b-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const neha: Person = { token: '', email: `neha-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Neha Mishra' };
  const sagar: Person = { token: '', email: `sagar-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Sagar Bhanushali' };
  const meet: Person = { token: '', email: `meet-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Meet Patel' };
  const lead = { ravi: '', neha: '', sagar: '', other: '', twice: '' };
  const SALES = { name: 'RND Technosoft', email: `sales-${SUFFIX}@rnd.test`, replyTo: `replies-${SUFFIX}@rnd.test` };

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const send = (token: string, leadId: string, extra: Record<string, unknown> = {}) =>
    call('post', '/crm/cadence/email', token, { leadId, subject: `Introduction ${SUFFIX}`, body: 'Hello from RND Technosoft.', ...extra });
  const leadEmail = (name: string) => `${name}-${SUFFIX}@customer.test`;
  const delivered = (server: typeof orgA, to: string) => server.messages.filter((m) => m.to.includes(to));
  const audits = (leadId: string, action: string) =>
    prisma.rndtechnosoft_crm_audit_logs.findMany({ where: { entity_id: leadId, action_type: action }, orderBy: { created_at: 'asc' } });
  const cadenceOf = async (leadId: string) =>
    ((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: leadId } })).custom_attributes as { cadence: { completedSteps: { dayNumber: number }[] } }).cadence;

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Outreach ${label} ${SUFFIX}`, tenantCode: `OUT${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
    await prisma.rndtechnosoft_users.update({ where: { id: member.user_id }, data: { display_name: label === 'A' ? 'Ravi Shah' : 'Owner B' } });
  }

  async function addMember(person: Person, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: person.userId, email: person.email, display_name: person.name, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: ravi.tenantId, role_code: `R_${person.name.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${person.name}`, is_system_role: false } });
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

  async function setOrgSmtp(tenantId: string, smtp: Record<string, unknown> | null) {
    const row = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId } });
    const settings = { ...((row?.settings as Record<string, unknown>) ?? {}), smtp } as Prisma.InputJsonObject;
    if (row) await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: tenantId }, data: { settings } });
    else await prisma.rndtechnosoft_tenant_settings.create({ data: { id: randomUUID(), tenant_id: tenantId, settings } });
    if (smtp && smtp.host !== '127.0.0.1') throw new Error('Refusing to run: a test workspace would send real email');
  }

  async function outreachLead(workspace: Workspace, name: string, assignee: string) {
    const created = await call('post', '/crm/leads', workspace.token, {
      companyName: `${name} Industries ${SUFFIX}`, firstName: name, email: leadEmail(name.toLowerCase()), temperature: 'COLD', assignedTenantMemberId: assignee,
    });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    orgA = await startFakeSmtp();
    orgB = await startFakeSmtp({ tls: true, accounts: { [`smtp-b-${SUFFIX}`]: B_SMTP_PASSWORD } });
    personal = await startFakeSmtp({ tls: true, accounts: { [neha.email]: 'Neha-Personal-Pass-1' } });
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
    await addMember(neha, OUTREACH);
    await addMember(sagar, OUTREACH);
    await addMember(meet, ['leads.view', 'outreach.view']);

    await setOrgSmtp(ravi.tenantId, { host: orgA.host, port: orgA.port, username: null, passwordEncrypted: null, senderName: SALES.name, senderEmail: SALES.email, replyToEmail: SALES.replyTo, encryption: 'NONE', isActive: true });
    // Personal accounts are allowed in A, and Neha has one: outreach must still use the organization's.
    expect((await call('put', '/mail-accounts/policy', ravi.token, { personalAccounts: 'ALLOWED' })).status).toBe(200);
    const saved = await call('put', '/mail-accounts/me', neha.token, {
      provider: 'CUSTOM', smtpHost: personal.host, smtpPort: personal.port, smtpSecurity: 'SSL', smtpUsername: neha.email,
      smtpPassword: 'Neha-Personal-Pass-1', senderEmail: neha.email, senderName: 'Neha Mishra', imapEnabled: false,
    });
    expect(saved.status).toBe(200);

    for (const workspace of [ravi, other]) {
      const pipeline = await call('post', '/crm/masters/pipelines', workspace.token, { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true });
      expect((await call('post', '/crm/masters/stages', workspace.token, { pipeline_id: pipeline.body.data.id, name: 'New', sort_order: 1 })).status).toBe(201);
    }
    lead.ravi = await outreachLead(ravi, 'Asha', ravi.memberId);
    lead.neha = await outreachLead(ravi, 'Bala', neha.memberId);
    lead.sagar = await outreachLead(ravi, 'Chirag', sagar.memberId);
    lead.other = await outreachLead(other, 'Divya', other.memberId);
    lead.twice = await outreachLead(ravi, 'Esha', ravi.memberId);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await deleteCrmData(prisma, tenantIds);
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
    await Promise.all([orgA?.close(), orgB?.close(), personal?.close()]);
  });

  describe('the sender', () => {
    it('shows the organization sender, and nothing about the account behind it', async () => {
      const shown = await call('get', '/crm/cadence/email-sender', sagar.token);
      expect(shown.status).toBe(200);
      expect(shown.body.data).toEqual({ configured: true, name: SALES.name, email: SALES.email, replyTo: SALES.replyTo });
      expect(shown.text).not.toContain(String(orgA.port));
      expect((await call('get', '/crm/cadence/email-sender', other.token)).body.data).toEqual({ configured: false, name: null, email: null, replyTo: null });
    });
  });

  describe('sending', () => {
    it('sends from the organization with its Reply-To, records the executor, and leaves the day open unless asked', async () => {
      const response = await send(ravi.token, lead.ravi);
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ sent: true, from: { name: SALES.name, email: SALES.email }, to: leadEmail('asha'), touchpoint: { day: 1 }, attempt: 1, touchpointCompleted: false });
      const [mail] = delivered(orgA, leadEmail('asha'));
      expect(mail.from).toContain(`<${SALES.email}>`);
      expect(mail.data).toContain(`From: ${SALES.name} <${SALES.email}>`);
      expect(mail.data).toContain(`Reply-To: ${SALES.replyTo}`);
      expect(mail.data).toContain(`Subject: Introduction ${SUFFIX}`);
      expect((await cadenceOf(lead.ravi)).completedSteps).toEqual([]);

      const [audit] = await audits(lead.ravi, 'OUTREACH_EMAIL_SENT');
      expect(audit).toMatchObject({ tenant_id: ravi.tenantId, entity_type: 'LEAD', actor_id: ravi.memberId, actor_name: 'Ravi Shah' });
      expect(audit.changes_diff).toMatchObject({
        channel: 'EMAIL', status: 'SENT', sender_email: SALES.email, recipient: leadEmail('asha'), subject: `Introduction ${SUFFIX}`,
        touchpoint: { day: 1, step_index: 0 }, executed_by: { member_id: ravi.memberId, name: 'Ravi Shah' }, attempt: 1,
        edited: { subject: { after: `Introduction ${SUFFIX}` } },
      });
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: lead.ravi, activity_type: 'EMAIL' } });
      expect(activity).toMatchObject({ performed_by_tenant_member_id: ravi.memberId, title: `Email sent: Introduction ${SUFFIX}` });
      expect(activity.description).toContain(`From: ${SALES.name} <${SALES.email}>`);
      expect(activity.description).toContain('Executed by: Ravi Shah');
    });

    it('never uses a member’s own account, even where personal accounts are allowed, and completes the day when asked', async () => {
      const response = await send(neha.token, lead.neha, { completeTouchpoint: true });
      expect(response.status).toBe(200);
      expect(response.body.data.touchpointCompleted).toBe(true);
      expect(delivered(orgA, leadEmail('bala'))).toHaveLength(1);
      expect(personal.messages).toHaveLength(0);
      expect(personal.logins).toHaveLength(0);
      expect((await cadenceOf(lead.neha)).completedSteps.map((s) => s.dayNumber)).toEqual([1]);
      const [sent] = await audits(lead.neha, 'OUTREACH_EMAIL_SENT');
      expect(sent).toMatchObject({ actor_id: neha.memberId, actor_name: 'Neha Mishra' });
      const [completed] = await audits(lead.neha, 'TOUCHPOINT_COMPLETED');
      expect(completed).toMatchObject({ actor_id: neha.memberId });
      expect(completed.changes_diff).toMatchObject({ channel: 'EMAIL', touchpoint: { day: 1 }, changes: { cadence_status: { before: 'ACTIVE', after: 'ACTIVE' } } });
    });

    it('records an unedited template email as not edited, for another member', async () => {
      const step = CADENCE_STEPS_MASTER[0];
      const vars = { firstName: 'Chirag', companyName: `Chirag Industries ${SUFFIX}`, industry: 'general', assigneeName: 'Sagar Bhanushali' };
      const response = await send(sagar.token, lead.sagar, { subject: interpolateText(step.templates.email!.subject, vars), body: interpolateText(step.templates.email!.body, vars) });
      expect(response.status).toBe(200);
      const [audit] = await audits(lead.sagar, 'OUTREACH_EMAIL_SENT');
      expect(audit).toMatchObject({ actor_id: sagar.memberId, actor_name: 'Sagar Bhanushali' });
      expect(audit.changes_diff).not.toHaveProperty('edited');
    });

    it('refuses a sender, account or performer supplied by the browser, and sends nothing', async () => {
      const before = orgA.messages.length;
      for (const smuggled of [{ from: 'personal@gmail.com' }, { smtp: { host: '10.0.0.1', password: 'x' } }, { performedByUserId: sagar.userId }, { to: 'someone@else.test' }]) {
        const refused = await send(neha.token, lead.neha, smuggled);
        expect(refused.status).toBe(400);
      }
      expect(orgA.messages.length).toBe(before);
    });

    it('needs permission to execute outreach, and a lead the member may see', async () => {
      expect((await send(meet.token, lead.ravi)).status).toBe(403);
      const hidden = await send(sagar.token, lead.neha);
      expect([hidden.status, hidden.body.message]).toEqual([404, 'Lead not found']);
      expect((await send(ravi.token, lead.other)).status).toBe(404);
    });
  });

  describe('the touchpoint’s email state', () => {
    type EmailAction = { status: string; sentAt?: string; executedBy: { memberId: string; name: string }; from?: { email: string }; to?: string; attempt: number; activityId?: string };
    const emailState = async (leadId: string, day = '1') =>
      (((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: leadId } })).custom_attributes as { cadence: { channelActions?: Record<string, { EMAIL?: EmailAction }> } })
        .cadence.channelActions?.[day]?.EMAIL);

    it('is saved as SENT with when, by whom, from and to, while the day stays in progress, and comes back on every read', async () => {
      const state = await emailState(lead.ravi);
      expect(state).toMatchObject({ status: 'SENT', executedBy: { memberId: ravi.memberId, name: 'Ravi Shah' }, from: { email: SALES.email }, to: leadEmail('asha'), attempt: 1 });
      expect(Date.parse(state!.sentAt!)).not.toBeNaN();
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findUniqueOrThrow({ where: { id: state!.activityId! } });
      expect(activity).toMatchObject({ activity_type: 'EMAIL', performed_by_tenant_member_id: ravi.memberId });

      // What the outreach screen loads after a reload or when the window is opened again.
      const listed = (await call('get', `/crm/cadence?search=${encodeURIComponent(leadEmail('asha'))}`, ravi.token)).body.data.radar.allActive[0];
      expect(listed.currentStep.dayNumber).toBe(1);
      expect(listed.currentStep.dayStatus).toBe('IN_PROGRESS');
      expect(listed.currentStep.channelActions.EMAIL).toMatchObject({ status: 'SENT', executedBy: { name: 'Ravi Shah' } });
      expect(listed.cadence.completedSteps).toEqual([]);
    });

    it('answers a send with the saved state', async () => {
      const sent = await send(ravi.token, lead.twice);
      expect(sent.status).toBe(200);
      expect(sent.body.data.email).toMatchObject({ status: 'SENT', executedBy: { memberId: ravi.memberId, name: 'Ravi Shah' }, from: { email: SALES.email }, to: leadEmail('esha'), attempt: 1 });
      expect(sent.body.data.touchpoint).toMatchObject({ day: 1, channel: 'EMAIL', status: 'IN_PROGRESS' });
      expect(sent.body.data.channelActions.EMAIL).toEqual(await emailState(lead.twice));
    });

    it('refuses to send a sent email again unless it is an explicit resend, which is its own attempt', async () => {
      const before = delivered(orgA, leadEmail('esha')).length;
      const again = await send(neha.token, lead.twice);
      expect(again.status).toBe(404); // Neha may not see Ravi's lead at all.
      const duplicate = await send(ravi.token, lead.twice);
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.message).toMatch(/^The Day 1 email was already sent to .* by Ravi Shah\. Use Resend to send it again\.$/);
      expect(delivered(orgA, leadEmail('esha')).length).toBe(before);

      const resent = await send(ravi.token, lead.twice, { resend: true });
      expect(resent.status).toBe(200);
      expect(resent.body.data.email.attempt).toBe(2);
      expect(delivered(orgA, leadEmail('esha')).length).toBe(before + 1);
      expect((await emailState(lead.twice))?.attempt).toBe(2);
      const audits = await prisma.rndtechnosoft_crm_audit_logs.findMany({ where: { entity_id: lead.twice, action_type: 'OUTREACH_EMAIL_SENT' }, orderBy: { created_at: 'asc' } });
      expect(audits.map((a) => (a.changes_diff as { attempt: number; resend?: boolean }).attempt)).toEqual([1, 2]);
      expect((audits[1].changes_diff as { resend?: boolean }).resend).toBe(true);
    });

    it('sends once when the button is pressed twice at the same moment', async () => {
      const fresh = await outreachLead(ravi, 'Farah', ravi.memberId);
      const [first, second] = await Promise.all([send(ravi.token, fresh), send(ravi.token, fresh)]);
      expect([first.status, second.status].sort()).toEqual([200, 409]);
      expect(delivered(orgA, leadEmail('farah'))).toHaveLength(1);
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { entity_id: fresh, action_type: 'OUTREACH_EMAIL_SENT' } })).toBe(1);
    });
  });

  describe('failures and retries', () => {
    it('says so when the organization has no email set up, never falling back, and keeps the day open', async () => {
      const refused = await send(other.token, lead.other);
      expect(refused.status).toBe(409);
      expect(refused.body.message).toBe("Organization email is not configured. Please contact your workspace administrator to configure the organization's email settings.");
      expect(delivered(orgA, leadEmail('divya'))).toHaveLength(0);
    });

    it('keeps every attempt: failed ones stay on record and a retry is a new entry; only a real send completes the day', async () => {
      await setOrgSmtp(other.tenantId, {
        host: orgB.host, port: orgB.port, username: `smtp-b-${SUFFIX}`, passwordEncrypted: encryptPlatformSecret('not-the-password'),
        senderName: 'Workspace B', senderEmail: `hello-${SUFFIX}@b.test`, replyToEmail: null, encryption: 'SSL', isActive: true,
      });
      const failed = await send(other.token, lead.other, { completeTouchpoint: true });
      expect(failed.status).toBe(503);
      const afterFailure = ((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.other } })).custom_attributes as { cadence: { channelActions: Record<string, { EMAIL: { status: string } }> } }).cadence.channelActions['1'].EMAIL;
      expect(afterFailure).toMatchObject({ status: 'FAILED', attempt: 2 });
      expect(failed.body.message).toBe("The organization's email service could not send this message. Please check the organization email configuration.");
      expect((await cadenceOf(lead.other)).completedSteps).toEqual([]);

      await setOrgSmtp(other.tenantId, {
        host: orgB.host, port: orgB.port, username: `smtp-b-${SUFFIX}`, passwordEncrypted: encryptPlatformSecret(B_SMTP_PASSWORD),
        senderName: 'Workspace B', senderEmail: `hello-${SUFFIX}@b.test`, replyToEmail: null, encryption: 'SSL', isActive: true,
      });
      const retried = await send(other.token, lead.other, { completeTouchpoint: true });
      expect(retried.status).toBe(200);
      expect(retried.body.data.attempt).toBe(3);
      expect(delivered(orgB, leadEmail('divya'))).toHaveLength(1);
      expect(delivered(orgA, leadEmail('divya'))).toHaveLength(0);
      expect((await cadenceOf(lead.other)).completedSteps.map((s) => s.dayNumber)).toEqual([1]);

      const history = await prisma.rndtechnosoft_crm_audit_logs.findMany({
        where: { entity_id: lead.other, action_type: { in: ['OUTREACH_EMAIL_SENT', 'OUTREACH_EMAIL_FAILED'] } }, orderBy: { created_at: 'asc' },
      });
      expect(history.map((h) => [h.action_type, (h.changes_diff as { attempt: number }).attempt])).toEqual([
        ['OUTREACH_EMAIL_FAILED', 1], ['OUTREACH_EMAIL_FAILED', 2], ['OUTREACH_EMAIL_SENT', 3],
      ]);
      expect((history[0].changes_diff as { failure: string }).failure).toBe('ORGANIZATION_EMAIL_NOT_CONFIGURED');
      const failedActivities = await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: lead.other, activity_type: 'EMAIL_FAILED' } });
      expect(failedActivities).toBe(2);
      const everything = JSON.stringify(await prisma.rndtechnosoft_crm_audit_logs.findMany({ where: { tenant_id: other.tenantId } }));
      expect(everything).not.toContain(B_SMTP_PASSWORD);
      expect(everything).not.toContain('not-the-password');
    });
  });

  describe('history', () => {
    const history = (token: string, leadId: string, query = '') => call('get', `/crm/leads/${leadId}/history?limit=100${query}`, token);

    it('records who edited a lead, with before and after values, whatever the request claims', async () => {
      const updated = await call('put', `/crm/leads/${lead.neha}`, neha.token, { designation: 'General Manager', phone: '+91 9876543211', performedBy: sagar.memberId });
      expect(updated.status).toBe(200);
      const rows = (await history(neha.token, lead.neha, '&actionType=UPDATE')).body.data;
      expect(rows[0]).toMatchObject({ action_type: 'UPDATE', actor_id: neha.memberId, actor_name: 'Neha Mishra', actor_email: neha.email });
      expect(rows[0].changes_diff.changes).toEqual({ designation: { before: null, after: 'General Manager' }, phone: { before: null, after: '+91 9876543211' } });
    });

    it('records a reassignment with the owner before and after', async () => {
      expect((await call('post', '/crm/leads/assign', ravi.token, { leadIds: [lead.neha], assigneeMemberId: sagar.memberId })).status).toBe(200);
      const [row] = (await history(ravi.token, lead.neha, '&actionType=LEAD_ASSIGNED')).body.data;
      expect(row).toMatchObject({ actor_id: ravi.memberId, actor_name: 'Ravi Shah' });
      expect(row.changes_diff).toMatchObject({ changes: { assigned_tenant_member_id: { before: neha.memberId, after: sagar.memberId } }, names: { before: 'Neha Mishra', after: 'Sagar Bhanushali' } });
    });

    it('shows a lead’s whole story newest first, filtered by member, action, channel and date', async () => {
      const all = (await history(ravi.token, lead.neha)).body;
      expect(all.data.map((r: { action_type: string }) => r.action_type)).toEqual(['LEAD_ASSIGNED', 'UPDATE', 'TOUCHPOINT_COMPLETED', 'OUTREACH_EMAIL_SENT', 'CREATE']);
      expect(all.actors.map((a: { name: string }) => a.name)).toEqual(expect.arrayContaining(['Neha Mishra', 'Ravi Shah', 'Sagar Bhanushali']));
      const byNeha = (await history(ravi.token, lead.neha, `&actorId=${neha.memberId}`)).body.data.map((r: { action_type: string }) => r.action_type);
      expect(byNeha).toEqual(['UPDATE', 'TOUCHPOINT_COMPLETED', 'OUTREACH_EMAIL_SENT']);
      const email = (await history(ravi.token, lead.neha, '&channel=EMAIL')).body.data.map((r: { action_type: string }) => r.action_type);
      expect(email).toEqual(['TOUCHPOINT_COMPLETED', 'OUTREACH_EMAIL_SENT']);
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
      expect((await history(ravi.token, lead.neha, `&from=${encodeURIComponent(tomorrow)}`)).body.data).toEqual([]);
    });

    it('keeps history inside the workspace and to members who may see the lead', async () => {
      expect((await history(other.token, lead.neha)).status).toBe(404);
      expect((await history(meet.token, lead.neha)).status).toBe(404);
      const trail = await call('get', '/crm/audit-logs?actionType=OUTREACH_EMAIL_SENT&limit=100', ravi.token);
      expect(trail.status).toBe(200);
      expect(trail.body.data.every((r: { tenant_id: string }) => r.tenant_id === ravi.tenantId)).toBe(true);
      expect([...new Set(trail.body.data.map((r: { actor_name: string }) => r.actor_name))].sort()).toEqual(['Neha Mishra', 'Ravi Shah', 'Sagar Bhanushali']);
      expect((await call('get', '/crm/audit-logs', neha.token)).status).toBe(403);
    });

    it('cannot be changed once written', async () => {
      const [row] = await audits(lead.neha, 'UPDATE');
      await expect(prisma.$executeRaw`UPDATE rndtechnosoft_crm_audit_logs SET actor_id = ${sagar.memberId}::uuid WHERE id = ${row.id}::uuid`).rejects.toThrow(/cannot be changed/);
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: lead.neha } });
      await expect(prisma.$executeRaw`UPDATE rndtechnosoft_crm_lead_activities SET title = 'rewritten' WHERE id = ${activity.id}::uuid`).rejects.toThrow(/cannot be changed/);
      expect((await prisma.rndtechnosoft_crm_audit_logs.findUniqueOrThrow({ where: { id: row.id } })).actor_id).toBe(neha.memberId);
    });
  });
});
