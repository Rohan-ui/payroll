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
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Client Outreach WhatsApp and LinkedIn touchpoints over HTTP. Opening a lead's
 * WhatsApp chat or LinkedIn page (and copying the LinkedIn message) is recorded
 * as exactly that, on the touchpoint, the lead's activity and the audit log,
 * never as a sent message. The number and address recorded are the lead's own;
 * LinkedIn addresses are checked and normalized when saved; and leads of
 * another workspace, or not visible to the member, can't be touched.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Outreach-Channels-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const OUTREACH = ['leads.view', 'leads.create', 'leads.update', 'outreach.view', 'outreach.create', 'outreach.update'];

type Method = 'get' | 'post' | 'put';
type Workspace = { tenantId: string; token: string; email: string; memberId: string };
type Person = { token: string; email: string; memberId: string; name: string };
type Action = { status: string; to: string; openedAt?: string; copiedAt?: string; destination?: string; executedBy: { name: string } };

describe('Client Outreach WhatsApp and LinkedIn', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const ravi: Workspace = { tenantId: '', token: '', email: `ravi-ch-${SUFFIX}@rnd.test`, memberId: '' };
  const other: Workspace = { tenantId: '', token: '', email: `owner-ch-${SUFFIX}@rnd.test`, memberId: '' };
  const neha: Person = { token: '', email: `neha-ch-${SUFFIX}@rnd.test`, memberId: '', name: 'Neha Mishra' };
  const viewer: Person = { token: '', email: `view-ch-${SUFFIX}@rnd.test`, memberId: '', name: 'View Only' };
  const lead = { rajesh: '', thread: '', bare: '', neha: '', warm: '', other: '' };

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const record = (token: string, leadId: string, channel: string, action: string, extra: Record<string, unknown> = {}) =>
    call('post', '/crm/cadence/channel-action', token, { leadId, channel, action, ...extra });
  const row = (id: string) => prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id } });
  /** The day's email as the email service records a send (sending needs a mail server, which tests don't have). */
  const emailSent = async (id: string, day: string) => {
    const lead = await row(id);
    const attributes = lead.custom_attributes as { cadence: { channelActions?: Record<string, Record<string, unknown>> } };
    const actions = attributes.cadence.channelActions ?? {};
    actions[day] = { ...(actions[day] ?? {}), EMAIL: { status: 'SENT', attempt: 1, executedBy: { memberId: ravi.memberId, name: 'Ravi Shah' }, startedAt: new Date().toISOString(), sentAt: new Date().toISOString() } };
    await prisma.rndtechnosoft_crm_leads.update({ where: { id }, data: { custom_attributes: { ...attributes, cadence: { ...attributes.cadence, channelActions: actions } } as object } });
  };
  const day1 = async (id: string) =>
    (((await row(id)).custom_attributes as { cadence: { channelActions?: Record<string, Record<string, Action>> } }).cadence.channelActions?.['1'] ?? {});

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Channels ${label} ${SUFFIX}`, tenantCode: `CHN${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    await prisma.rndtechnosoft_users.update({ where: { id: member.user_id }, data: { display_name: label === 'A' ? 'Ravi Shah' : 'Owner B' } });
  }

  async function addMember(person: Person, permissionCodes: string[]) {
    userEmails.push(person.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: userId, email: person.email, display_name: person.name, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: ravi.tenantId, role_code: `R_${person.name.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${person.name}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: ravi.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: ravi.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: ravi.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: ravi.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  async function createLead(workspace: Workspace, name: string, extra: Record<string, unknown> = {}) {
    const created = await call('post', '/crm/leads', workspace.token, {
      companyName: `${name} Engineering ${SUFFIX}`, firstName: name, email: `${name.toLowerCase()}-${SUFFIX}@customer.test`, temperature: 'COLD', assignedTenantMemberId: workspace.memberId, ...extra,
    });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }

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

    await register(ravi, 'A');
    await register(other, 'B');
    await addMember(neha, OUTREACH);
    await addMember(viewer, ['leads.view', 'outreach.view']);
    for (const workspace of [ravi, other]) {
      const pipeline = await call('post', '/crm/masters/pipelines', workspace.token, { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true });
      expect((await call('post', '/crm/masters/stages', workspace.token, { pipeline_id: pipeline.body.data.id, name: 'New', sort_order: 1 })).status).toBe(201);
    }
    lead.rajesh = await createLead(ravi, 'Rajesh', { lastName: 'Sharma', phone: '+91 98250 12345', linkedinUrl: 'linkedin.com/in/rajesh-sharma?trk=public_profile' });
    lead.thread = await createLead(ravi, 'Tara', { phone: '98250 67890', linkedinUrl: 'https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/' });
    lead.bare = await createLead(ravi, 'Bare');
    lead.neha = await createLead(ravi, 'Nisha', { phone: '98250 11111', linkedinUrl: 'linkedin.com/in/nisha', assignedTenantMemberId: neha.memberId });
    lead.warm = await createLead(ravi, 'Warm', { phone: '98250 22222', temperature: 'WARM' });
    lead.other = await createLead(other, 'Divya', { phone: '98250 33333', linkedinUrl: 'linkedin.com/in/divya' });
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await deleteCrmData(prisma, tenantIds);
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
  });

  describe('LinkedIn addresses on leads', () => {
    it('are stored as https://www.linkedin.com/… addresses, and anything else is refused', async () => {
      expect((await row(lead.rajesh)).linkedin_url).toBe('https://www.linkedin.com/in/rajesh-sharma/');
      const bad = await call('post', '/crm/leads', ravi.token, { companyName: `Bad ${SUFFIX}`, firstName: 'Bad', email: `bad-${SUFFIX}@customer.test`, linkedinUrl: 'https://evil.example/in/bad' });
      expect([bad.status, bad.body.message]).toEqual([400, 'Invalid LinkedIn profile URL.']);
      const company = await call('put', `/crm/leads/${lead.bare}`, ravi.token, { linkedinCompanyUrl: 'Bare Engineering' });
      expect([company.status, company.body.message]).toEqual([400, 'Invalid LinkedIn company URL.']);
      expect((await call('put', `/crm/leads/${lead.warm}`, ravi.token, { linkedinUrl: 'www.linkedin.com/in/warm-lead/' })).status).toBe(200);
      expect((await row(lead.warm)).linkedin_url).toBe('https://www.linkedin.com/in/warm-lead/');
      expect((await call('put', `/crm/leads/${lead.warm}`, ravi.token, { linkedinUrl: '' })).status).toBe(200);
      expect((await row(lead.warm)).linkedin_url).toBeNull();
    });
  });

  describe('WhatsApp', () => {
    it('records the chat as opened with the lead’s own number, never as sent', async () => {
      const before = await row(lead.rajesh);
      const opened = await record(ravi.token, lead.rajesh, 'WHATSAPP', 'OPENED');
      expect(opened.status).toBe(200);
      expect(opened.body.data).toMatchObject({ channel: 'WHATSAPP', action: 'OPENED', to: '+919825012345' });

      expect((await day1(lead.rajesh)).WHATSAPP).toMatchObject({ status: 'OPENED', to: '+919825012345', executedBy: { name: 'Ravi Shah' } });
      const [activity] = await prisma.rndtechnosoft_crm_lead_activities.findMany({ where: { lead_id: lead.rajesh, activity_type: 'WHATSAPP' } });
      expect(activity.title).toBe('Opened WhatsApp');
      expect(activity.description).toContain('Phone: +919825012345');
      expect(activity.description).toContain('Executed by: Ravi Shah');
      expect(activity.description).toContain('the CRM has not sent it');
      const [audit] = await prisma.rndtechnosoft_crm_audit_logs.findMany({ where: { entity_id: lead.rajesh, action_type: 'OUTREACH_WHATSAPP_OPENED' } });
      expect(audit.changes_diff).toMatchObject({ channel: 'WHATSAPP', action: 'OPENED', phone: '+919825012345', touchpoint: { day: 1 }, executed_by: { name: 'Ravi Shah' } });

      // Nothing claims a send, and the day is not completed by opening a chat.
      const after = await row(lead.rajesh);
      expect(JSON.stringify(after.custom_attributes)).not.toContain('"SENT"');
      expect([after.last_contacted_at, after.touchpoints_count]).toEqual([before.last_contacted_at, before.touchpoints_count]);
      expect((after.custom_attributes as { cadence: { completedSteps: unknown[] } }).cadence.completedSteps).toEqual([]);
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { entity_id: lead.rajesh, action_type: { in: ['OUTREACH_EMAIL_SENT', 'TOUCHPOINT_COMPLETED'] } } })).toBe(0);

      const copied = await record(ravi.token, lead.rajesh, 'WHATSAPP', 'MESSAGE_COPIED');
      expect(copied.status).toBe(400);
    });

    it('says when the lead has no usable number', async () => {
      const missing = await record(ravi.token, lead.bare, 'WHATSAPP', 'OPENED');
      expect([missing.status, missing.body.message]).toEqual([400, 'WhatsApp number is not available for this lead.']);
      await prisma.rndtechnosoft_crm_leads.update({ where: { id: lead.bare }, data: { phone: '12345', whatsapp_number: '12345' } });
      const invalid = await record(ravi.token, lead.bare, 'WHATSAPP', 'OPENED');
      expect([invalid.status, invalid.body.message]).toEqual([400, 'Invalid WhatsApp number.']);
    });
  });

  describe('LinkedIn', () => {
    it('opens the lead’s profile, then records the copied message, keeping both', async () => {
      const opened = await record(ravi.token, lead.rajesh, 'LINKEDIN', 'OPENED');
      expect(opened.body.data).toMatchObject({ to: 'https://www.linkedin.com/in/rajesh-sharma/', destination: 'PROFILE' });
      const copied = await record(ravi.token, lead.rajesh, 'LINKEDIN', 'MESSAGE_COPIED');
      expect(copied.status).toBe(200);
      const state = (await day1(lead.rajesh)).LINKEDIN;
      expect(state).toMatchObject({ status: 'OPENED', destination: 'PROFILE', to: 'https://www.linkedin.com/in/rajesh-sharma/' });
      expect(state.openedAt && state.copiedAt).toBeTruthy();
      // WhatsApp's record on the same day is kept.
      expect((await day1(lead.rajesh)).WHATSAPP.status).toBe('OPENED');
      const titles = (await prisma.rndtechnosoft_crm_lead_activities.findMany({ where: { lead_id: lead.rajesh, activity_type: 'LINKEDIN' }, orderBy: { created_at: 'asc' } })).map((a) => a.title);
      expect(titles).toEqual(['Opened LinkedIn profile', 'LinkedIn message copied']);
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { entity_id: lead.rajesh, action_type: { in: ['OUTREACH_LINKEDIN_OPENED', 'OUTREACH_LINKEDIN_MESSAGE_COPIED'] } } })).toBe(2);
    });

    it('opens a stored conversation as the conversation', async () => {
      const opened = await record(ravi.token, lead.thread, 'LINKEDIN', 'OPENED');
      expect(opened.body.data).toMatchObject({ to: 'https://www.linkedin.com/messaging/thread/2-ZjQ5MzE1/', destination: 'CONVERSATION' });
      const [activity] = await prisma.rndtechnosoft_crm_lead_activities.findMany({ where: { lead_id: lead.thread, activity_type: 'LINKEDIN' } });
      expect(activity.title).toBe('Opened LinkedIn conversation');
    });

    it('says when the lead has no LinkedIn address, or a stored one is not LinkedIn', async () => {
      const missing = await record(ravi.token, lead.bare, 'LINKEDIN', 'OPENED');
      expect([missing.status, missing.body.message]).toEqual([400, 'LinkedIn profile is not available for this lead.']);
      // An address saved before addresses were checked.
      await prisma.rndtechnosoft_crm_leads.update({ where: { id: lead.bare }, data: { linkedin_url: 'https://evil.example/in/bare' } });
      const invalid = await record(ravi.token, lead.bare, 'LINKEDIN', 'OPENED');
      expect([invalid.status, invalid.body.message]).toEqual([400, 'Invalid LinkedIn profile URL.']);
    });
  });

  describe('messages marked sent', () => {
    const MESSAGE = "Hi Rajesh 👋,\n\nWe'd love to explore how Voogyo can help 🚀.\n\n₹12,50,000";

    it('are tracked like an email: sent, with the message, who sent it and when, and the lead contacted', async () => {
      const before = await row(lead.rajesh);
      expect((await record(ravi.token, lead.rajesh, 'WHATSAPP', 'MARKED_SENT')).status).toBe(400);
      expect((await record(ravi.token, lead.rajesh, 'WHATSAPP', 'OPENED', { message: 'x' })).status).toBe(400);

      const sent = await record(ravi.token, lead.rajesh, 'WHATSAPP', 'MARKED_SENT', { message: MESSAGE });
      expect(sent.status).toBe(200);
      expect(sent.body.data).toMatchObject({ action: 'MARKED_SENT', to: '+919825012345', touchpointCompleted: false, state: { status: 'SENT', confirmation: 'USER', attempt: 1, message: MESSAGE } });
      const state = (await day1(lead.rajesh)).WHATSAPP as Action & { sentAt: string; message: string; confirmation: string };
      expect(state).toMatchObject({ status: 'SENT', confirmation: 'USER', message: MESSAGE, executedBy: { name: 'Ravi Shah' } });
      expect(state.openedAt).toBeDefined();

      const [activity] = await prisma.rndtechnosoft_crm_lead_activities.findMany({ where: { lead_id: lead.rajesh, title: 'WhatsApp message sent' } });
      expect(activity.description).toContain('marked sent by Ravi Shah');
      expect(activity.description).toContain(MESSAGE);
      const [audit] = await prisma.rndtechnosoft_crm_audit_logs.findMany({ where: { entity_id: lead.rajesh, action_type: 'OUTREACH_WHATSAPP_SENT' } });
      expect(audit.changes_diff).toMatchObject({ channel: 'WHATSAPP', status: 'SENT', confirmation: 'USER', attempt: 1, message: MESSAGE, phone: '+919825012345' });

      const after = await row(lead.rajesh);
      expect(after.last_contacted_at).not.toBeNull();
      expect(after.touchpoints_count).toBe(before.touchpoints_count + 1);
      expect((after.custom_attributes as { cadence: { completedSteps: unknown[] } }).cadence.completedSteps).toEqual([]);
    });

    it('are recorded once unless sent again on purpose, and opening the chat again keeps them sent', async () => {
      const twice = await record(ravi.token, lead.rajesh, 'WHATSAPP', 'MARKED_SENT', { message: MESSAGE });
      expect(twice.status).toBe(409);
      expect(twice.body.message).toContain('already marked sent by Ravi Shah');
      const again = await record(ravi.token, lead.rajesh, 'WHATSAPP', 'MARKED_SENT', { message: 'Following up 🙏', resend: true });
      expect(again.body.data.state).toMatchObject({ status: 'SENT', attempt: 2, message: 'Following up 🙏' });
      expect((await record(ravi.token, lead.rajesh, 'WHATSAPP', 'OPENED')).status).toBe(200);
      expect((await day1(lead.rajesh)).WHATSAPP).toMatchObject({ status: 'SENT', message: 'Following up 🙏' });
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { entity_id: lead.rajesh, action_type: 'OUTREACH_WHATSAPP_SENT' } })).toBe(2);
    });

    it('completes the day only once every message of the day is sent', async () => {
      // Day 1 sends WhatsApp, email and LinkedIn: nothing completes it until all three are done.
      const early = await call('post', '/crm/cadence', ravi.token, { action: 'COMPLETE_STEP', leadId: lead.thread });
      expect(early.status).toBe(400);
      expect(early.body.message).toBe('Day 1 can’t be marked complete yet: send the WhatsApp, email and LinkedIn messages first, or mark the lead as not on LinkedIn.');

      const linkedIn = await record(ravi.token, lead.thread, 'LINKEDIN', 'MARKED_SENT', { message: 'Hi Tara 👋', completeTouchpoint: true });
      expect(linkedIn.body.data).toMatchObject({ touchpointCompleted: false, stillToDo: ['WHATSAPP', 'EMAIL'], state: { status: 'SENT', destination: 'CONVERSATION' } });
      // Tara has a WhatsApp number, so that message can't be skipped.
      const skip = await record(ravi.token, lead.thread, 'WHATSAPP', 'NOT_AVAILABLE');
      expect(skip.status).toBe(400);
      expect(skip.body.message).toContain('This lead has a WhatsApp number');
      expect((await record(ravi.token, lead.thread, 'WHATSAPP', 'MARKED_SENT', { message: 'Hi Tara' })).body.data.stillToDo).toEqual(['EMAIL']);
      expect((await call('post', '/crm/cadence', ravi.token, { action: 'COMPLETE_STEP', leadId: lead.thread })).body.message).toContain('send the email message first');

      await emailSent(lead.thread, '1');
      expect((await call('post', '/crm/cadence', ravi.token, { action: 'COMPLETE_STEP', leadId: lead.thread })).status).toBe(201);
      const cadence = ((await row(lead.thread)).custom_attributes as { cadence: { completedSteps: { dayNumber: number }[] } }).cadence;
      expect(cadence.completedSteps.map((c) => c.dayNumber)).toEqual([1]);
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { entity_id: lead.thread, action_type: 'OUTREACH_LINKEDIN_SENT' } })).toBe(1);
    });

    it('records a LinkedIn action that has no message (engaging with a post) as done', async () => {
      // Day 5: WhatsApp and LinkedIn "engage with their post", which has no message.
      const done = await record(ravi.token, lead.thread, 'LINKEDIN', 'MARKED_SENT', { completeTouchpoint: true });
      expect(done.status).toBe(200);
      expect(done.body.data).toMatchObject({ day: 5, touchpointCompleted: false, stillToDo: ['WHATSAPP'], state: { status: 'SENT' } });
      expect(done.body.data.state.message).toContain('LinkedIn action done (ENGAGE_POST)');
      const whatsApp = await record(ravi.token, lead.thread, 'WHATSAPP', 'MARKED_SENT', { message: 'Day 5 hello', completeTouchpoint: true });
      expect(whatsApp.body.data).toMatchObject({ touchpointCompleted: true, stillToDo: [] });
    });
  });

  describe('a lead not on LinkedIn, or without a WhatsApp number', () => {
    it('can be marked so for the day, with a reason, so the day goes ahead without that message', async () => {
      const linkedIn = await record(ravi.token, lead.bare, 'LINKEDIN', 'NOT_AVAILABLE', { reason: 'Searched by name and company' });
      expect(linkedIn.status).toBe(200);
      expect(linkedIn.body.data).toMatchObject({ channel: 'LINKEDIN', stillToDo: ['WHATSAPP', 'EMAIL'], state: { status: 'NOT_AVAILABLE', reason: 'Searched by name and company', executedBy: { name: 'Ravi Shah' } } });
      // No number at all: WhatsApp can be marked too.
      expect((await record(ravi.token, lead.bare, 'WHATSAPP', 'NOT_AVAILABLE')).body.data.stillToDo).toEqual(['EMAIL']);
      const board = await call('get', '/crm/cadence?due=ALL', ravi.token);
      const card = board.body.data.radar.allActive.find((c: { id: string }) => c.id === lead.bare);
      expect(card.currentStep).toMatchObject({ dayStatus: 'IN_PROGRESS', stillToDo: ['EMAIL'], channelActions: { LINKEDIN: { status: 'NOT_AVAILABLE' } } });

      await emailSent(lead.bare, '1');
      expect((await call('post', '/crm/cadence', ravi.token, { action: 'COMPLETE_STEP', leadId: lead.bare })).status).toBe(201);
      const audit = await prisma.rndtechnosoft_crm_audit_logs.findFirstOrThrow({ where: { entity_id: lead.bare, action_type: 'OUTREACH_LINKEDIN_NOT_AVAILABLE' } });
      expect(audit.changes_diff).toMatchObject({ channel: 'LINKEDIN', reason: 'Searched by name and company', touchpoint: { day: 1 } });
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: lead.bare, title: 'Not on LinkedIn' } });
      expect(activity.description).toContain('The lead has no LinkedIn profile');
    });

    it('can’t undo a message already sent', async () => {
      await record(ravi.token, lead.neha, 'LINKEDIN', 'MARKED_SENT', { message: 'Hi Nisha' });
      const undo = await record(ravi.token, lead.neha, 'LINKEDIN', 'NOT_AVAILABLE');
      expect(undo.status).toBe(409);
      expect((await day1(lead.neha)).LINKEDIN).toMatchObject({ status: 'SENT' });
    });
  });

  describe('who may record what', () => {
    it('only for visible, enrolled leads of the workspace, by members who execute outreach, with nothing taken from the browser', async () => {
      expect((await record(other.token, lead.rajesh, 'WHATSAPP', 'OPENED')).status).toBe(404);
      expect((await record(neha.token, lead.rajesh, 'LINKEDIN', 'OPENED')).status).toBe(404);
      expect((await record(neha.token, lead.neha, 'LINKEDIN', 'OPENED')).status).toBe(200);
      expect((await record(viewer.token, lead.neha, 'WHATSAPP', 'OPENED')).status).toBe(403);
      expect((await record(ravi.token, lead.warm, 'WHATSAPP', 'OPENED')).status).toBe(409);
      const forged = await record(ravi.token, lead.rajesh, 'LINKEDIN', 'OPENED', { linkedinUrl: 'https://evil.example/' });
      expect(forged.status).toBe(400);
      expect((await record(ravi.token, lead.rajesh, 'EMAIL', 'OPENED')).status).toBe(400);
      expect(await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: lead.other, activity_type: { in: ['WHATSAPP', 'LINKEDIN'] } } })).toBe(0);
    });

    it('shows the touchpoint as started on the cadence board', async () => {
      const board = await call('get', '/crm/cadence?due=ALL', ravi.token);
      const card = board.body.data.radar.allActive.find((c: { id: string }) => c.id === lead.rajesh);
      expect(card.currentStep.dayStatus).toBe('IN_PROGRESS');
      expect(card.currentStep.channelActions.LINKEDIN.status).toBe('OPENED');
    });
  });
});
