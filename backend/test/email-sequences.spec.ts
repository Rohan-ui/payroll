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
import { SequenceSenderService } from '@/modules/email-sequences/sequence-sender.service';
import { SequenceAutomationService } from '@/modules/email-sequences/sequence-automation.service';
import { INBOX_READER, InboxRead, InboxReader, SequenceInboxService } from '@/modules/email-sequences/sequence-inbox.service';
import { InboundMessage } from '@/modules/email-sequences/sequence-inbound';
import { deleteCrmData } from './support/crm-cleanup';
import { startFakeSmtp } from './support/fake-smtp';

/**
 * Drip sequences end to end: building and activating a sequence, enrolling
 * leads by hand, in bulk and by rules, the worker sending due emails (once
 * only, whatever runs twice or restarts), retries, holds and limits, the
 * unsubscribe link and do-not-email list, replies and bounces from the
 * sending inbox, stopping on won leads, the Client Outreach conflict, pause,
 * reports, permissions and workspace isolation.
 *
 * The worker's parts are run directly; mail goes to fake servers on 127.0.0.1
 * and the inbox is a stand-in reader.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Drip-Sequence-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = Person & { tenantId: string };

/** Messages the stand-in inbox hands the worker, by member user id. */
const inbox = new Map<string, InboundMessage[]>();
const fakeReader: InboxReader = {
  async read(_tenantId: string, userId: string): Promise<InboxRead> {
    const messages = inbox.get(userId) ?? [];
    return { mailboxEmail: `inbox-${userId}@test`, uidValidity: 1, lastUid: messages.length, messages: messages.map((m, i) => ({ ...m, uid: i + 1 })) };
  },
};

describe('Drip sequences', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sender: SequenceSenderService;
  let automation: SequenceAutomationService;
  let inboxes: SequenceInboxService;
  let org: Awaited<ReturnType<typeof startFakeSmtp>>;
  let personal: Awaited<ReturnType<typeof startFakeSmtp>>;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `drip-a-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Asha Owner' };
  const b: Workspace = { tenantId: '', token: '', email: `drip-b-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Bala Owner' };
  const rep: Person = { token: '', email: `drip-rep-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Rina Rep' };
  const viewer: Person = { token: '', email: `drip-view-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Vik Viewer' };
  const crm = { pipeline: '', newStage: '', qualified: '', won: '', source: '' };
  let host = '';

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const leadEmail = (name: string) => `${name}-${SUFFIX}@customer.test`;
  const delivered = (to: string, server = org) => server.messages.filter((m) => m.to.includes(to));
  const sendsOf = (enrollmentId: string) => prisma.rndtechnosoft_email_sequence_sends.findMany({ where: { enrollment_id: enrollmentId }, orderBy: { created_at: 'asc' } });
  const enrollmentOf = (leadId: string) => prisma.rndtechnosoft_email_sequence_enrollments.findFirstOrThrow({ where: { lead_id: leadId }, orderBy: { created_at: 'desc' } });
  /** Makes a scheduled email due now, as if its delay had passed. */
  const makeDue = (enrollmentId: string) => prisma.rndtechnosoft_email_sequence_sends.updateMany({ where: { enrollment_id: enrollmentId, send_status: 'SCHEDULED' }, data: { scheduled_at: new Date(Date.now() - 1000) } });
  const header = (raw: string, name: string) => raw.match(new RegExp(`^${name}:\\s*(.+)$`, 'im'))?.[1].trim() ?? null;

  const sequenceInput = (extra: Record<string, unknown> = {}) => ({
    name: `Follow-up ${SUFFIX}`,
    description: 'New B2B leads',
    senderMode: 'ORGANIZATION',
    // Every day, all day: the tests don't depend on the clock.
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    windowStart: 0,
    windowEnd: 1440,
    skipHolidays: false,
    dailyLimit: 50,
    stopStageIds: [],
    steps: [
      { stepName: 'Introduction', delayAmount: 0, delayUnit: 'WORKING_DAYS', subject: 'Hello {{First Name}} from {{Workspace Name}}', body: 'Hi {{First Name}},\n\nA quick idea for {{Company Name}}.', enabled: true },
      { stepName: 'Follow-up', delayAmount: 2, delayUnit: 'WORKING_DAYS', subject: 'Following up, {{First Name}}', body: 'Just checking in.', enabled: true },
    ],
    ...extra,
  });

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Drip ${label} ${SUFFIX}`, tenantCode: `DRP${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
    await prisma.rndtechnosoft_users.update({ where: { id: member.user_id }, data: { display_name: workspace.name } });
  }

  async function addMember(person: Person, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: person.userId, email: person.email, display_name: person.name, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `R_${person.name.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${person.name}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: a.tenantId, user_id: person.userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  async function setOrgSmtp(tenantId: string, port: number) {
    const row = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: tenantId } });
    const smtp = { host: '127.0.0.1', port, username: null, passwordEncrypted: null, senderName: 'RND Sales', senderEmail: `sales-${SUFFIX}@rnd.test`, replyToEmail: null, encryption: 'NONE', isActive: true };
    const settings = { ...((row?.settings as Record<string, unknown>) ?? {}), smtp } as Prisma.InputJsonObject;
    if (row) await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: tenantId }, data: { settings } });
    else await prisma.rndtechnosoft_tenant_settings.create({ data: { id: randomUUID(), tenant_id: tenantId, settings } });
  }

  async function lead(name: string, extra: Record<string, unknown> = {}, token = a.token) {
    const created = await call('post', '/crm/leads', token, {
      companyName: `${name} Industries ${SUFFIX}`, firstName: name, email: leadEmail(name.toLowerCase()), pipelineId: crm.pipeline, stageId: crm.newStage, assignedTenantMemberId: a.memberId, ...extra,
    });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }

  async function activeSequence(extra: Record<string, unknown> = {}) {
    const created = await asA('post', '/email-sequences', sequenceInput(extra));
    expect(created.status).toBe(201);
    const activated = await asA('post', `/email-sequences/${created.body.data.id}/activate`);
    expect(activated.status).toBe(200);
    return created.body.data.id as string;
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    org = await startFakeSmtp();
    personal = await startFakeSmtp({ tls: true, accounts: { [rep.email]: 'Rina-Personal-Pass-1' } });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(INBOX_READER).useValue(fakeReader).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    sender = app.get(SequenceSenderService);
    automation = app.get(SequenceAutomationService);
    inboxes = app.get(SequenceInboxService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    await register(a, 'A');
    await register(b, 'B');
    await addMember(rep, ['leads.view', 'leads.create', 'leads.update', 'marketing.view', 'sequences.view', 'sequences.enroll']);
    await addMember(viewer, ['leads.view', 'marketing.view']);
    await setOrgSmtp(a.tenantId, org.port);
    host = `${(await prisma.rndtechnosoft_tenant_domains.findFirstOrThrow({ where: { tenant_id: a.tenantId, is_primary: true } })).subdomain}.${BASE}`;

    const pipeline = await asA('post', '/crm/masters/pipelines', { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true });
    crm.pipeline = pipeline.body.data.id;
    crm.newStage = (await asA('post', '/crm/masters/stages', { pipeline_id: crm.pipeline, name: 'New lead', sort_order: 1 })).body.data.id;
    crm.qualified = (await asA('post', '/crm/masters/stages', { pipeline_id: crm.pipeline, name: 'Qualified', sort_order: 2 })).body.data.id;
    crm.won = (await asA('post', '/crm/masters/stages', { pipeline_id: crm.pipeline, name: 'Won', sort_order: 3, is_won: true })).body.data.id;
    crm.source = (await asA('post', '/crm/masters/sources', { name: `Website ${SUFFIX}` })).body.data.id;
    expect([crm.pipeline, crm.newStage, crm.qualified, crm.won, crm.source].every(Boolean)).toBe(true);
    const b1 = await call('post', '/crm/masters/pipelines', b.token, { name: 'Sales', code: `SALES_B_${SUFFIX}`, is_default: true });
    await call('post', '/crm/masters/stages', b.token, { pipeline_id: b1.body.data.id, name: 'New', sort_order: 1 });
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
    await Promise.all([org?.close(), personal?.close()]);
  });

  describe('building and activating', () => {
    it('saves a draft that never sends, refuses unknown placeholders, and activates only a complete sequence', async () => {
      const bad = await asA('post', '/email-sequences', sequenceInput({ name: `Bad ${SUFFIX}`, steps: [{ stepName: 'x', delayAmount: 0, delayUnit: 'WORKING_DAYS', subject: 'Hi {{company}}', body: 'y', enabled: true }] }));
      expect([bad.status, bad.body.message]).toEqual([400, 'Email 1 uses placeholders that don’t exist: {{company}}. Use only the listed ones.']);

      const empty = await asA('post', '/email-sequences', sequenceInput({ name: `Empty ${SUFFIX}`, steps: [] }));
      expect(empty.status).toBe(201);
      expect(empty.body.data).toMatchObject({ status: 'DRAFT', activationProblems: ['Add at least one email and switch it on.'] });
      const refused = await asA('post', `/email-sequences/${empty.body.data.id}/activate`);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toContain('Add at least one email');

      const draft = await asA('post', '/email-sequences', sequenceInput({ name: `Draft ${SUFFIX}` }));
      expect(draft.body.data.steps.map((s: { stepName: string; order: number }) => [s.order, s.stepName])).toEqual([[1, 'Introduction'], [2, 'Follow-up']]);
      expect(draft.body.data.summary).toContain(`sales-${SUFFIX}@rnd.test`);
      expect(draft.body.data.replyDetection.available).toBe(false);
      const leadId = await lead('Draftee');
      const enroll = await asA('post', `/email-sequences/${draft.body.data.id}/enrollments`, { leadIds: [leadId] });
      expect(enroll.body.data.skipped).toEqual([expect.objectContaining({ reason: 'Activate the sequence before adding leads.' })]);
      expect((await asA('post', '/email-sequences', sequenceInput({ name: `draft ${SUFFIX}` }))).status).toBe(409);
    });

    it('is for permitted members of the workspace only', async () => {
      const id = (await asA('get', '/email-sequences')).body.data[0].id;
      expect((await call('get', '/email-sequences', viewer.token)).status).toBe(403);
      expect((await call('post', '/email-sequences', rep.token, sequenceInput({ name: `Rep ${SUFFIX}` }))).status).toBe(403);
      expect((await call('get', `/email-sequences/${id}`, b.token)).status).toBe(404);
      expect((await call('get', '/email-sequences', b.token)).body.data).toEqual([]);
      expect((await call('get', '/email-sequences/suppressions', b.token)).body.data.items).toEqual([]);
    });
  });

  describe('sending', () => {
    it('sends the first email at once with an unsubscribe link, once only however often the worker runs, then schedules the next', async () => {
      const id = await activeSequence({ name: `Main ${SUFFIX}` });
      const leadId = await lead('Priya');
      const preview = await asA('post', `/email-sequences/${id}/enrollments/preview`, { leadIds: [leadId] });
      expect(preview.body.data).toMatchObject({ eligible: 1, firstStep: 'Introduction', firstEmail: { subject: `Hello Priya from Drip A ${SUFFIX}` } });
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: leadId } })).toBe(0);

      const enrolled = await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [leadId] });
      expect(enrolled.body.data).toMatchObject({ enrolled: 1, skipped: [] });
      // Twice at once: the email goes once.
      const [first, second] = await Promise.all([sender.sendDue(), sender.sendDue()]);
      expect(first.sent + second.sent).toBe(1);
      await sender.sendDue();
      const mail = delivered(leadEmail('priya'));
      expect(mail).toHaveLength(1);
      const raw = mail[0].data;
      expect(header(raw, 'Subject')).toBe(`Hello Priya from Drip A ${SUFFIX}`);
      expect(header(raw, 'List-Unsubscribe')).toMatch(new RegExp(`^<https://${host.replace(/\./g, '\\.')}/api/v1/public/email/unsubscribe/[A-Za-z0-9_-]{43}>$`));
      expect(header(raw, 'List-Unsubscribe-Post')).toBe('List-Unsubscribe=One-Click');
      expect(raw).toContain(`https://${host}/unsubscribe?token=`);

      const enrollment = await enrollmentOf(leadId);
      const [sent, next] = await sendsOf(enrollment.id);
      expect(sent).toMatchObject({ send_status: 'SENT', attempt_count: 1, recipient_email: leadEmail('priya'), sender_kind: 'ORGANIZATION', subject: `Hello Priya from Drip A ${SUFFIX}` });
      expect(header(raw, 'Message-ID')).toBe(sent.message_id);
      expect(next).toMatchObject({ send_status: 'SCHEDULED' });
      expect(next.scheduled_at.getTime()).toBeGreaterThan(Date.now() + 24 * 3600_000);
      const activities = await prisma.rndtechnosoft_crm_lead_activities.findMany({ where: { lead_id: leadId }, orderBy: { created_at: 'asc' } });
      expect(activities.map((x) => x.activity_type)).toEqual(expect.arrayContaining(['EMAIL_SEQUENCE', 'EMAIL']));

      // Enrolled again: refused. The second step, once due, completes the enrollment.
      expect((await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [leadId] })).body.data.skipped[0].reason).toContain('already in the sequence');
      await makeDue(enrollment.id);
      await sender.sendDue();
      expect(delivered(leadEmail('priya'))).toHaveLength(2);
      expect((await enrollmentOf(leadId)).enrollment_status).toBe('COMPLETED');
    });

    it('never resends after a restart: an interrupted send waits for a person; an untried one goes again', async () => {
      const id = await activeSequence({ name: `Restart ${SUFFIX}` });
      const [one, two] = [await lead('Uma'), await lead('Vera')];
      await call('post', `/email-sequences/${id}/enrollments/bulk`, a.token, { leadIds: [one, two] });
      const [e1, e2] = [await enrollmentOf(one), await enrollmentOf(two)];
      const old = new Date(Date.now() - 20 * 60_000);
      await prisma.rndtechnosoft_email_sequence_sends.updateMany({ where: { enrollment_id: e1.id }, data: { send_status: 'SENDING', claimed_at: old, message_id: '<seq.interrupted@rnd.test>', subject: 'Hello Uma', sender_email: `sales-${SUFFIX}@rnd.test` } });
      await prisma.rndtechnosoft_email_sequence_sends.updateMany({ where: { enrollment_id: e2.id }, data: { send_status: 'SENDING', claimed_at: old } });
      expect(await sender.recoverStale()).toEqual({ rescheduled: 1, uncertain: 1 });
      await sender.sendDue();
      expect(delivered(leadEmail('uma'))).toHaveLength(0);
      expect(delivered(leadEmail('vera'))).toHaveLength(1);
      const [uncertain] = await sendsOf(e1.id);
      expect(uncertain.send_status).toBe('UNCERTAIN');
      // A person confirms it went: the lead moves on, with no second email.
      expect((await asA('post', `/email-sequences/sends/${uncertain.id}/mark-sent`)).status).toBe(200);
      expect((await sendsOf(e1.id)).map((s) => s.send_status)).toEqual(['SENT', 'SCHEDULED']);
      expect(delivered(leadEmail('uma'))).toHaveLength(0);
    });

    it('retries a refused connection with growing delays, and holds an email whose placeholder has no value', async () => {
      const id = await activeSequence({ name: `Retry ${SUFFIX}` });
      const leadId = await lead('Wren');
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [leadId] });
      const enrollment = await enrollmentOf(leadId);
      await setOrgSmtp(a.tenantId, 9); // Nothing listens there.
      try {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
          await makeDue(enrollment.id);
          await sender.sendDue();
        }
      } finally {
        await setOrgSmtp(a.tenantId, org.port);
      }
      const [failed] = await sendsOf(enrollment.id);
      expect(failed).toMatchObject({ send_status: 'FAILED', attempt_count: 4, failure_code: 'NOT_CONNECTED' });
      expect((await sendsOf(enrollment.id))).toHaveLength(1);
      expect((await asA('post', `/email-sequences/sends/${failed.id}/retry`)).status).toBe(200);
      await sender.sendDue();
      expect(delivered(leadEmail('wren'))).toHaveLength(1);

      // No first name and no fallback: held, not sent as "Hi ,".
      const noName = await lead('Xan');
      await prisma.rndtechnosoft_crm_leads.update({ where: { id: noName }, data: { first_name: null } });
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [noName] });
      await sender.sendDue();
      const [held] = await sendsOf((await enrollmentOf(noName)).id);
      expect(held).toMatchObject({ send_status: 'FAILED', failure_code: 'MISSING_DATA' });
      expect(held.failure_reason).toContain('First Name');
    });

    it('keeps to the daily limit per mailbox, carrying the rest to the next sending day', async () => {
      const id = await activeSequence({ name: `Limit ${SUFFIX}`, dailyLimit: 1 });
      const leads = [await lead('Yash'), await lead('Zoe')];
      await call('post', `/email-sequences/${id}/enrollments/bulk`, a.token, { leadIds: leads });
      await sender.sendDue();
      const states = await prisma.rndtechnosoft_email_sequence_sends.findMany({ where: { sequence_id: id, rndtechnosoft_email_sequence_steps: { step_order: 1 } } });
      expect(states.map((s) => s.send_status).sort()).toEqual(['SCHEDULED', 'SENT']);
      expect(states.find((s) => s.send_status === 'SCHEDULED')!.scheduled_at.getTime()).toBeGreaterThan(Date.now());
    });

    it('pauses without losing anything, and resumes', async () => {
      const id = await activeSequence({ name: `Pause ${SUFFIX}` });
      const leadId = await lead('Paul');
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [leadId] });
      expect((await asA('post', `/email-sequences/${id}/pause`)).body.data.status).toBe('PAUSED');
      await sender.sendDue();
      expect(delivered(leadEmail('paul'))).toHaveLength(0);
      expect((await asA('post', `/email-sequences/${id}/activate`)).body.data.status).toBe('ACTIVE');
      await sender.sendDue();
      expect(delivered(leadEmail('paul'))).toHaveLength(1);
      const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, entity_id: id }, orderBy: { occurred_at: 'asc' } });
      expect(audit.map((x) => x.action_code)).toEqual(['EMAIL_SEQUENCE_CREATED', 'EMAIL_SEQUENCE_ACTIVATED', 'EMAIL_SEQUENCE_ENROLLED', 'EMAIL_SEQUENCE_PAUSED', 'EMAIL_SEQUENCE_RESUMED']);
    });
  });

  describe('unsubscribing and the do-not-email list', () => {
    it('unsubscribes through the link without signing in, stops every sequence and outreach to the address, and fails closed elsewhere', async () => {
      const id = await activeSequence({ name: `Unsub ${SUFFIX}` });
      const leadId = await lead('Quinn');
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [leadId] });
      await sender.sendDue();
      const token = delivered(leadEmail('quinn'))[0].data.match(/unsubscribe\?token=([A-Za-z0-9_-]+)/)![1];
      const pub = (method: 'get' | 'post', h = host) => request(app.getHttpServer())[method](`${API}/public/email/unsubscribe/${token}`).set('Host', h);

      expect((await pub('get', `other.${BASE}`)).status).toBe(404);
      expect((await request(app.getHttpServer()).get(`${API}/public/email/unsubscribe/not-a-real-token-but-long-enough-0000000`).set('Host', host)).status).toBe(404);
      const view = await pub('get');
      expect(view.body.data).toEqual({ company: `Drip A ${SUFFIX}`, email: expect.stringMatching(/^q\*+@customer\.test$/), unsubscribed: false });
      // Looking changes nothing; the one-click POST from a mail app unsubscribes.
      expect(await prisma.rndtechnosoft_email_suppressions.count({ where: { tenant_id: a.tenantId } })).toBe(0);
      const done = await request(app.getHttpServer()).post(`${API}/public/email/unsubscribe/${token}`).set('Host', host).type('form').send('List-Unsubscribe=One-Click');
      expect(done.status).toBe(200);
      expect((await pub('post')).status).toBe(200);
      const row = await prisma.rndtechnosoft_email_suppressions.findFirstOrThrow({ where: { tenant_id: a.tenantId, email: leadEmail('quinn') } });
      expect(row).toMatchObject({ suppression_reason: 'UNSUBSCRIBED', suppression_source: 'ONE_CLICK' });
      const enrollment = await enrollmentOf(leadId);
      expect(enrollment).toMatchObject({ enrollment_status: 'STOPPED', stop_reason: 'UNSUBSCRIBED' });
      expect((await sendsOf(enrollment.id)).map((s) => s.send_status)).toEqual(['SENT', 'CANCELLED']);

      // Another sequence, Client Outreach and the list itself all refuse the address.
      const other = await activeSequence({ name: `Unsub 2 ${SUFFIX}` });
      expect((await asA('post', `/email-sequences/${other}/enrollments`, { leadIds: [leadId] })).body.data.skipped[0].reason).toContain('do-not-email list');
      const outreach = await asA('post', '/crm/cadence/email', { leadId, subject: 'Hi', body: 'There' });
      expect(outreach.status).toBe(409);
      const listed = await asA('get', '/email-sequences/suppressions');
      const entry = listed.body.data.items.find((i: { email: string }) => i.email === leadEmail('quinn'));
      expect(entry).toMatchObject({ reason: 'UNSUBSCRIBED', removable: false });
      expect((await asA('delete', `/email-sequences/suppressions/${entry.id}`)).status).toBe(409);
      expect((await call('post', '/email-sequences/suppressions', rep.token, { emails: ['x@y.test'] })).status).toBe(403);
      const manual = await asA('post', '/email-sequences/suppressions', { emails: [`MANUAL-${SUFFIX}@Customer.test`], note: 'Asked by phone' });
      expect(manual.body.data).toEqual({ added: 1, alreadyListed: 0 });
    });
  });

  describe('replies and bounces', () => {
    it('stops a lead owner’s sequence on a genuine reply (once), not on an out-of-office, and stops and lists a hard bounce', async () => {
      // Rina sends from her own account, as the lead owner.
      expect((await asA('put', '/mail-accounts/policy', { personalAccounts: 'ALLOWED' })).status).toBe(200);
      const saved = await call('put', '/mail-accounts/me', rep.token, {
        provider: 'CUSTOM', smtpHost: personal.host, smtpPort: personal.port, smtpSecurity: 'SSL', smtpUsername: rep.email,
        smtpPassword: 'Rina-Personal-Pass-1', senderEmail: rep.email, senderName: rep.name, imapEnabled: false,
      });
      expect(saved.status).toBe(200);
      const id = await activeSequence({ name: `Owner ${SUFFIX}`, senderMode: 'LEAD_OWNER' });
      expect((await asA('get', `/email-sequences/${id}`)).body.data.replyDetection.available).toBe(true);
      const [replier, holiday, bouncer] = [await lead('Reply', { assignedTenantMemberId: rep.memberId }), await lead('Away', { assignedTenantMemberId: rep.memberId }), await lead('Gone', { assignedTenantMemberId: rep.memberId })];
      await call('post', `/email-sequences/${id}/enrollments/bulk`, a.token, { leadIds: [replier, holiday, bouncer] });
      await sender.sendDue();
      const idOf = (who: string) => header(delivered(leadEmail(who), personal)[0].data, 'Message-ID')!;
      expect(delivered(leadEmail('reply'), personal)[0].authUser).toBe(rep.email);

      inbox.set(rep.userId, [
        { messageId: `<r1-${SUFFIX}@client>`, from: leadEmail('reply'), subject: 'Re: Hello', date: new Date(), inReplyTo: idOf('reply'), references: [], headers: '' },
        { messageId: `<r2-${SUFFIX}@client>`, from: leadEmail('away'), subject: 'Automatic reply: away', date: new Date(), inReplyTo: idOf('away'), references: [], headers: 'Auto-Submitted: auto-replied\r\n' },
        {
          messageId: `<dsn-${SUFFIX}@mx>`, from: 'mailer-daemon@googlemail.com', subject: 'Delivery Status Notification (Failure)', date: new Date(), inReplyTo: null, references: [],
          headers: 'Content-Type: multipart/report; report-type=delivery-status\r\n',
          source: `Final-Recipient: rfc822; ${leadEmail('gone')}\r\nAction: failed\r\nStatus: 5.1.1\r\n\r\nMessage-ID: ${idOf('gone')}\r\n`,
        },
      ]);
      await inboxes.scanAll();
      // Read again (the next round): nothing counts twice.
      await prisma.rndtechnosoft_email_mailbox_scans.updateMany({ where: { member_id: rep.memberId }, data: { last_scanned_at: null } });
      await inboxes.scanAll();

      expect(await enrollmentOf(replier)).toMatchObject({ enrollment_status: 'STOPPED', stop_reason: 'REPLIED' });
      expect((await enrollmentOf(holiday)).enrollment_status).toBe('ACTIVE');
      expect(await enrollmentOf(bouncer)).toMatchObject({ enrollment_status: 'STOPPED', stop_reason: 'BOUNCED' });
      expect(await prisma.rndtechnosoft_email_sequence_events.count({ where: { tenant_id: a.tenantId } })).toBe(3);
      const [bounced] = await sendsOf((await enrollmentOf(bouncer)).id);
      expect(bounced).toMatchObject({ send_status: 'BOUNCED', bounce_kind: 'HARD' });
      expect(await prisma.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: a.tenantId, email: leadEmail('gone') } })).toMatchObject({ suppression_reason: 'BOUNCED' });
      const report = await asA('get', `/email-sequences/${id}/report`);
      expect(report.body.data.totals).toMatchObject({ sent: 3, replied: 1, bounced: 1, replyRate: 33.3 });
      expect(report.body.data.enrollments.stoppedBy).toEqual({ REPLIED: 1, BOUNCED: 1 });
    });
  });

  describe('automatic enrollment and stopping', () => {
    it('enrolls leads entering a stage after the rule is switched on, once each, and from a chosen source', async () => {
      const id = await activeSequence({ name: `Rules ${SUFFIX}` });
      const before = await lead('Early');
      await asA('put', `/crm/leads/${before}`, { stageId: crm.qualified });
      const rules = await asA('post', `/email-sequences/${id}/rules`, { name: 'Qualified leads', triggerKind: 'STAGE_ENTERED', pipelineId: crm.pipeline, stageId: crm.qualified, conditions: { match: 'ALL', conditions: [{ field: 'city', operator: 'EQUALS', value: 'Pune' }] } });
      expect(rules.status).toBe(201);
      const ruleId = rules.body.data[0].id;
      expect((await asA('post', `/email-sequences/${id}/rules`, { name: 'Won', triggerKind: 'STAGE_ENTERED', pipelineId: crm.pipeline, stageId: crm.won })).status).toBe(400);
      await asA('post', `/email-sequences/${id}/rules/${ruleId}/enable`);

      const pune = await lead('Pune', { city: 'Pune' });
      const delhi = await lead('Delhi', { city: 'Delhi' });
      for (const l of [pune, delhi]) await asA('put', `/crm/leads/${l}`, { stageId: crm.qualified });
      const dry = await asA('post', `/email-sequences/${id}/rules/${ruleId}/dry-run`);
      expect(dry.body.data.leads.find((l: { leadId: string }) => l.leadId === pune)).toMatchObject({ wouldEnroll: true });
      expect(dry.body.data.leads.find((l: { leadId: string }) => l.leadId === delhi)).toMatchObject({ wouldEnroll: false, reason: 'Doesn’t meet the rule’s conditions' });
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: pune } })).toBe(0);

      expect(await automation.runRules()).toBe(1);
      expect(await automation.runRules()).toBe(0);
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: pune, enrolled_via: 'RULE' } })).toBe(1);
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: { in: [before, delhi] } } })).toBe(0);
      expect((await asA('get', `/email-sequences/${id}`)).body.data.rules[0]).toMatchObject({ enrolled: 1, lastError: null });

      const sourced = await asA('post', `/email-sequences/${id}/rules`, { name: 'From the website', triggerKind: 'LEAD_CREATED', sourceId: crm.source });
      await asA('post', `/email-sequences/${id}/rules/${sourced.body.data[1].id}/enable`);
      const web = await lead('Web', { sourceId: crm.source });
      const walkIn = await lead('Walkin');
      await automation.runRules();
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: web } })).toBe(1);
      expect(await prisma.rndtechnosoft_email_sequence_enrollments.count({ where: { lead_id: walkIn } })).toBe(0);
    });

    it('stops when the lead is won, and keeps Client Outreach and sequences apart unless a person moves the lead', async () => {
      const id = await activeSequence({ name: `Stops ${SUFFIX}` });
      const winner = await lead('Winner');
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [winner] });
      await asA('put', `/crm/leads/${winner}`, { stageId: crm.won });
      expect(await automation.sweepStops()).toBeGreaterThanOrEqual(1);
      expect(await enrollmentOf(winner)).toMatchObject({ enrollment_status: 'STOPPED', stop_reason: 'WON' });

      // In Client Outreach (a cold lead joins it on creation): refused, unless moved deliberately.
      const cold = await lead('Cold', { temperature: 'COLD' });
      const refused = await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [cold] });
      expect(refused.body.data.skipped[0].reason).toContain('is in Client Outreach');
      expect((await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [cold], moveFromOutreach: true })).body.data.enrolled).toBe(1);
      const after = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: cold } });
      expect((after.custom_attributes as { cadence: { status: string; endedReason: string } }).cadence).toMatchObject({ status: 'COMPLETED', endedReason: 'MOVED_TO_DRIP_SEQUENCE' });

      // In a sequence: Client Outreach refuses it, until the sequence stops and moves it.
      const inSequence = await asA('post', '/crm/cadence', { action: 'ENROLL', leadId: cold });
      expect(inSequence.status).toBe(409);
      const enrollment = await enrollmentOf(cold);
      expect((await call('post', `/email-sequences/enrollments/${enrollment.id}/stop`, viewer.token, {})).status).toBe(403);
      const moved = await asA('post', `/email-sequences/enrollments/${enrollment.id}/stop`, { moveToOutreach: true });
      expect(moved.body.data).toEqual({ stopped: true, movedToOutreach: true });
      expect(await enrollmentOf(cold)).toMatchObject({ enrollment_status: 'STOPPED', stop_reason: 'MOVED_TO_OUTREACH' });
      const outreach = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: cold } });
      expect((outreach.custom_attributes as { cadence: { status: string } }).cadence.status).toBe('ACTIVE');
    });

    it('shows a lead’s sequences only to members who may see the lead, and the dashboard counts what happened', async () => {
      const id = await activeSequence({ name: `Seen ${SUFFIX}` });
      const mine = await lead('Mine', { assignedTenantMemberId: a.memberId });
      await asA('post', `/email-sequences/${id}/enrollments`, { leadIds: [mine] });
      expect((await call('get', `/email-sequences/leads/${mine}`, rep.token)).status).toBe(404);
      expect((await asA('get', `/email-sequences/leads/${mine}`)).body.data.enrollments[0]).toMatchObject({ status: 'ACTIVE', sequence: { name: `Seen ${SUFFIX}` } });
      expect((await call('get', `/email-sequences/${id}/enrollments`, rep.token)).body.data.items).toEqual([]);
      const overview = (await asA('get', '/email-sequences/overview')).body.data;
      expect(overview.sent).toBe(await prisma.rndtechnosoft_email_sequence_sends.count({ where: { tenant_id: a.tenantId, send_status: { in: ['SENT', 'BOUNCED'] } } }));
      expect(overview).toMatchObject({ replied: 1, bounced: 1, unsubscribed: 1 });
      expect(overview.needsAttention.failed).toBeGreaterThanOrEqual(1);
      expect((await call('get', '/email-sequences/overview', b.token)).body.data).toMatchObject({ sent: 0, enrolled: 0, replied: 0 });
    });
  });
});
