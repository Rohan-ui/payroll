import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { jest } from '@jest/globals';
import { startFakeSmtp } from './support/fake-smtp';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The candidate information form: HR emails a one-time link, the candidate
 * fills in their details without signing in (only on their workspace's
 * address, once, before it expires), HR reviews them and records an
 * eligibility decision, optionally telling a rejected candidate politely.
 * Email goes to a fake SMTP server on 127.0.0.1 that only records messages.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Candidate-Form-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';

const FORM = {
  fullName: 'Arjun Mehta',
  dateOfBirth: '1996-04-12',
  genderCode: 'MALE',
  phone: '+91 98000 11111',
  currentAddress: { addressLine1: '12 MG Road', city: 'Pune', postalCode: '411001', countryCode: 'IN' },
  education: [
    { qualification: 'B.Com', institution: 'Symbiosis College', university: 'Pune University', passingYear: 2017, score: '72%' },
    { qualification: 'M.Com', institution: 'Symbiosis College', passingYear: 2019, score: '8.1 CGPA' },
  ],
  experience: [
    { companyName: 'Acme Books', designation: 'Junior Accountant', startDate: '2019-07-01', endDate: '2022-06-30', lastSalary: '420000.50' },
    { companyName: 'Ledger & Co', designation: 'Accountant', startDate: '2022-07-01', isCurrent: true, lastSalary: '600000' },
  ],
  totalExperienceYears: '5.5',
  expectedSalary: '750000',
  noticePeriodDays: 30,
  skills: 'Tally, GST, reconciliations',
  emergencyContactName: 'Meera Mehta',
  emergencyContactRelationship: 'Spouse',
  emergencyContactPhone: '+91 98000 22222',
  references: [{ name: 'R. Iyer', relationship: 'Former manager', companyName: 'Acme Books', email: 'r.iyer@acme.test' }],
  confirmed: true,
};

describe('Candidate information form and eligibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, storage: process.env.PRIVATE_STORAGE_DIR };
  const storageDir = path.join(os.tmpdir(), `candidate-form-${SUFFIX}`);
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `form-a-${SUFFIX}@onboarding.test`, host: '' };
  const b = { tenantId: '', token: '', email: `form-b-${SUFFIX}@onboarding.test`, host: '' };
  const viewer = { token: '', email: `form-viewer-${SUFFIX}@onboarding.test` };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const publicGet = (token: string, host = LOCAL) => request(app.getHttpServer()).get(`${API}/public/candidate-form/${token}`).set('Host', host);
  const publicSubmit = (token: string, body: object, host = LOCAL) =>
    request(app.getHttpServer()).post(`${API}/public/candidate-form/${token}`).set('Host', host).set('User-Agent', 'FormTest/1.0').send(body);
  const mailTo = (email: string) => smtp.messages.filter((m) => m.to.includes(email));
  const tokenIn = (data: string) => /\/candidate-form\?token=([A-Za-z0-9_-]{40,60})/.exec(data)?.[1] ?? '';
  const statusOf = async (id: string) => (await asA('get', `/onboarding/candidates/${id}`)).body.data.status as string;

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Form ${label} ${SUFFIX}`, tenantCode: `FRM${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const domain = await prisma.rndtechnosoft_tenant_domains.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, is_primary: true } });
    workspace.host = `${domain.subdomain}.${BASE}`;
  }

  async function candidate(label: string) {
    const created = await asA('post', '/onboarding/candidates', { fullName: `Arjun ${label}`, email: `arjun.${label}.${SUFFIX}@candidate.test`, appliedPosition: 'Accountant' });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }

  async function sendForm(id: string, body: object = {}) {
    const email = (await prisma.rndtechnosoft_candidates.findUniqueOrThrow({ where: { id } })).email;
    const before = mailTo(email).length;
    const sent = await asA('post', `/onboarding/candidates/${id}/form/send`, body);
    expect(sent.status).toBe(200);
    const mail = mailTo(email).slice(before);
    return { response: sent, token: tokenIn(mail.map((m) => m.data).join('\n')), mail };
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    process.env.PRIVATE_STORAGE_DIR = storageDir;
    smtp = await startFakeSmtp();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});
    await register(a, 'A');
    await register(b, 'B');

    userEmails.push(viewer.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: viewer.email, display_name: 'Viewer', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `VIEW_${SUFFIX}`.toUpperCase(), role_name: 'Viewer' } });
    const perm = await prisma.rndtechnosoft_permissions.findUniqueOrThrow({ where: { permission_code: 'onboarding.view' } });
    await prisma.rndtechnosoft_role_permissions.create({ data: { id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: perm.id } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    viewer.token = (await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: viewer.email, password: PASSWORD, tenantId: a.tenantId })).body.token;

    const smtpSettings = { host: smtp.host, port: smtp.port, username: null, passwordEncrypted: null, senderName: 'Acme HR', senderEmail: `hr-${SUFFIX}@acme.test`, replyToEmail: null, encryption: 'NONE', isActive: true };
    const row = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: a.tenantId } });
    const merged = { ...((row?.settings as Record<string, unknown>) ?? {}), smtp: smtpSettings };
    await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: a.tenantId }, data: { settings: merged } });
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
      await prisma.rndtechnosoft_crm_whatsapp_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_crm_whatsapp_mappings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_crm_message_templates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_crm_whatsapp_configs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_document_files.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_document_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_type_employment_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_addresses.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_education.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_experience.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_references.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interview_panelists.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interviews.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employment_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_onboarding_workflow_transitions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_onboarding_workflow_stages.deleteMany({ where: scope });
      await prisma.rndtechnosoft_onboarding_workflow_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_onboarding_workflows.deleteMany({ where: scope });
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
    if (previous.storage === undefined) delete process.env.PRIVATE_STORAGE_DIR;
    else process.env.PRIVATE_STORAGE_DIR = previous.storage;
    await fs.rm(storageDir, { recursive: true, force: true });
    await app?.close();
    await smtp?.close();
  });

  let token = '';

  it('emails a one-time form link and moves the candidate to Form sent, only with the permission', async () => {
    ids.main = await candidate('main');
    expect((await call('post', `/onboarding/candidates/${ids.main}/form/send`, viewer.token, {})).status).toBe(403);
    const sent = await sendForm(ids.main);
    expect(sent.response.body.data.status).toBe('FORM_SENT');
    expect(sent.response.body.notifications).toMatchObject([{ status: 'SENT', duplicate: false }]);
    expect(sent.mail[0].data).toMatch(/Your application to Form A/);
    token = sent.token;
    expect(token).toHaveLength(43);

    // Only the digest is stored; the token appears nowhere in the database's notification log or events.
    const row = await prisma.rndtechnosoft_candidates.findUniqueOrThrow({ where: { id: ids.main } });
    expect(row.form_token_hash).toHaveLength(64);
    expect(row.form_token_hash).not.toContain(token);
    const notification = await prisma.rndtechnosoft_onboarding_notifications.findFirstOrThrow({ where: { tenant_id: a.tenantId, idempotency_key: `candidate-form:${ids.main}:1` } });
    expect(JSON.stringify(notification)).not.toContain(token);
  });

  it('shows the candidate only their own details, only on their workspace’s address', async () => {
    const view = await publicGet(token);
    expect(view.status).toBe(200);
    expect(view.body.data).toMatchObject({ position: 'Accountant', details: { fullName: 'Arjun main', email: `arjun.main.${SUFFIX}@candidate.test` } });
    expect(JSON.stringify(view.body)).not.toMatch(/eligibility|recruiter|tenant_id/i);
    expect((await publicGet(token, b.host)).status).toBe(404);
    expect((await publicGet('x'.repeat(43))).status).toBe(410);
    expect((await publicGet('bad token')).status).toBe(404);
  });

  it('validates the submission, then saves it once and closes the link', async () => {
    expect((await publicSubmit(token, { ...FORM, confirmed: false })).status).toBe(400);
    expect((await publicSubmit(token, { ...FORM, education: [{ institution: 'No qualification' }] })).status).toBe(400);
    expect((await publicSubmit(token, { ...FORM, references: [{ name: 'Nobody' }] })).body.message).toMatch(/phone number or email for Nobody/);
    expect((await publicSubmit(token, { ...FORM, experience: [{ ...FORM.experience[0], endDate: '2018-01-01' }] })).body.message).toMatch(/end date at Acme Books/);
    expect((await publicSubmit(token, { ...FORM, salaryOffered: '1' })).status).toBe(400);

    const [first, second] = await Promise.all([publicSubmit(token, FORM), publicSubmit(token, FORM)]);
    expect([first.status, second.status].sort()).toEqual([200, 409].sort((x, y) => x - y));
    expect(await statusOf(ids.main)).toBe('FORM_SUBMITTED');
    expect((await publicGet(token)).status).toBe(410);
    expect((await publicSubmit(token, FORM)).status).toBe(410);

    const audit = await prisma.rndtechnosoft_audit_logs.findFirstOrThrow({ where: { tenant_id: a.tenantId, action_code: 'ONBOARDING_FORM_SUBMITTED', entity_id: ids.main } });
    expect(JSON.stringify(audit)).not.toMatch(/1996|98000|Symbiosis|Meera/);
  });

  it('shows HR everything submitted, with salaries as exact decimals', async () => {
    const review = await call('get', `/onboarding/candidates/${ids.main}/form`, viewer.token);
    expect(review.status).toBe(200);
    expect(review.body.data).toMatchObject({
      form: { linkNumber: 1, isOpen: false },
      personal: { fullName: 'Arjun Mehta', dateOfBirth: '1996-04-12', totalExperienceYears: '5.5', expectedSalary: '750000', noticePeriodDays: 30, emergencyContactName: 'Meera Mehta' },
      addresses: { CURRENT: { addressLine1: '12 MG Road', city: 'Pune' }, PERMANENT: null },
      education: [{ qualification: 'B.Com' }, { qualification: 'M.Com', university: null }],
      experience: [{ companyName: 'Acme Books', lastSalary: '420000.5' }, { companyName: 'Ledger & Co', isCurrent: true, endDate: null }],
      references: [{ name: 'R. Iyer', email: 'r.iyer@acme.test' }],
      eligibility: null,
    });
    expect((await call('get', `/onboarding/candidates/${ids.main}/form`, b.token)).status).toBe(404);
  });

  it('reopens the form with a message to ask for more, prefilled, replacing the answers on resubmission', async () => {
    const again = await sendForm(ids.main, { message: 'Please add your permanent address.' });
    expect(again.response.body.data.status).toBe('FORM_SENT');
    expect(again.mail[0].data).toMatch(/Please add your permanent address/);
    const view = await publicGet(again.token);
    expect(view.body.data).toMatchObject({ message: 'Please add your permanent address.', details: { fullName: 'Arjun Mehta', education: [{ qualification: 'B.Com' }, { qualification: 'M.Com' }] } });
    expect((await publicGet(token)).status).toBe(410);

    expect((await publicSubmit(again.token, { ...FORM, permanentAddress: { addressLine1: '4 Lake View', city: 'Nashik', countryCode: 'IN' }, education: [FORM.education[0]] })).status).toBe(200);
    const review = (await asA('get', `/onboarding/candidates/${ids.main}/form`)).body.data;
    expect(review.addresses.PERMANENT).toMatchObject({ city: 'Nashik' });
    expect(review.education).toHaveLength(1);
  });

  it('records eligibility only with the decide permission, and lets an eligible candidate be interviewed', async () => {
    expect((await call('post', `/onboarding/candidates/${ids.main}/eligibility`, viewer.token, { decision: 'ELIGIBLE' })).status).toBe(403);
    const eligible = await asA('post', `/onboarding/candidates/${ids.main}/eligibility`, { decision: 'ELIGIBLE', remarks: 'Strong GST background' });
    expect(eligible.status).toBe(200);
    expect(eligible.body.data.status).toBe('ELIGIBLE');
    expect((await asA('post', `/onboarding/candidates/${ids.main}/eligibility`, { decision: 'ELIGIBLE' })).status).toBe(409);
    const review = (await asA('get', `/onboarding/candidates/${ids.main}/form`)).body.data;
    expect(review.eligibility).toMatchObject({ decision: 'ELIGIBLE', remarks: 'Strong GST background', reason: null, decidedBy: expect.any(String) });
  });

  it('marks a candidate not eligible only with a reason, and tells them politely without the reason', async () => {
    ids.reject = await candidate('reject');
    expect((await asA('post', `/onboarding/candidates/${ids.reject}/eligibility`, { decision: 'NOT_ELIGIBLE' })).status).toBe(400);
    const email = `arjun.reject.${SUFFIX}@candidate.test`;
    const before = mailTo(email).length;
    const rejected = await asA('post', `/onboarding/candidates/${ids.reject}/eligibility`, { decision: 'NOT_ELIGIBLE', reason: 'Needs CA qualification', notifyCandidate: true });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('NOT_ELIGIBLE');
    expect(rejected.body.notifications).toMatchObject([{ status: 'SENT' }]);
    const mail = mailTo(email).slice(before);
    expect(mail).toHaveLength(1);
    expect(mail[0].data).toMatch(/will not be moving forward/);
    expect(mail[0].data).not.toMatch(/CA qualification/);

    // Not eligible is closed: no form, no interview, no second decision.
    expect((await asA('post', `/onboarding/candidates/${ids.reject}/form/send`, {})).status).toBe(409);
    expect((await asA('post', `/onboarding/candidates/${ids.reject}/eligibility`, { decision: 'ELIGIBLE' })).status).toBe(409);
    const events = await prisma.rndtechnosoft_candidate_events.findMany({ where: { candidate_id: ids.reject }, orderBy: { created_at: 'asc' } });
    expect(events.at(-1)).toMatchObject({ event_type: 'ELIGIBILITY_DECIDED', to_status: 'NOT_ELIGIBLE', summary: 'Marked not eligible: Needs CA qualification' });
  });

  it('reports WhatsApp as not set up, with what to do, while the email still goes', async () => {
    ids.wa = await candidate('wa');
    await prisma.rndtechnosoft_candidates.update({ where: { id: ids.wa }, data: { phone: '+91 98000 33333' } });
    const sent = await asA('post', `/onboarding/candidates/${ids.wa}/form/send`, { channels: ['EMAIL', 'WHATSAPP'] });
    expect(sent.status).toBe(200);
    expect(sent.body.data.status).toBe('FORM_SENT');
    expect(sent.body.notifications).toMatchObject([
      { status: 'SENT' },
      { recipient: 'WhatsApp +91 98000 33333', status: 'NOT_SENT', error: expect.stringMatching(/ONBOARDING_FORM_INVITATION/) },
    ]);
    expect((await asA('post', `/onboarding/candidates/${ids.wa}/form/send`, { channels: ['SMS'] })).status).toBe(400);
  });

  it('sends the link by WhatsApp through the mapped template, and keeps it out of the message log', async () => {
    expect((await asA('post', '/crm/whatsapp/config', { account_name: 'Acme WA', vendor_uid: 'vendor-1', bearer_token: 'test-token-1' })).status).toBeLessThan(300);
    const template = await asA('post', '/crm/whatsapp/templates', { template_code: 'ONBOARDING_FORM_INVITATION', template_name: 'Form invitation', message_body: 'Hi {{candidate_name}}, {{form_link}}' });
    expect(template.status).toBeLessThan(300);
    const crmTemplateId = template.body.data?.id ?? template.body.id;
    const mapping = await asA('post', '/crm/whatsapp/mappings', {
      crm_template_id: crmTemplateId, whatsapp_template_name: 'form_invite', whatsapp_template_language: 'en',
      body_mapping: { field_1: 'candidate_name', field_2: 'form_link' },
    });
    expect(mapping.status).toBeLessThan(300);

    const provider = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ result: 'success', data: { wamid: 'wamid.FORM1', status: 'accepted' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    try {
      ids.wa2 = await candidate('wa2');
      await prisma.rndtechnosoft_candidates.update({ where: { id: ids.wa2 }, data: { phone: '9800044444' } });
      const sent = await asA('post', `/onboarding/candidates/${ids.wa2}/form/send`, { channels: ['WHATSAPP'] });
      expect(sent.body.notifications).toMatchObject([{ status: 'SENT' }]);
      expect(sent.body.data.status).toBe('FORM_SENT');

      // The provider received the link; the stored log no longer holds it.
      const body = JSON.parse(String((provider.mock.calls[0][1] as RequestInit).body));
      const token = /token=([A-Za-z0-9_-]{43})/.exec(body.field_2)?.[1] ?? '';
      expect(token).toHaveLength(43);
      const logs = await prisma.rndtechnosoft_crm_whatsapp_logs.findMany({ where: { tenant_id: a.tenantId } });
      expect(logs).toHaveLength(1);
      expect(JSON.stringify(logs[0])).not.toContain(token);
      expect(JSON.stringify(logs[0].payload_sent)).toContain('[link removed]');
      // And the link works.
      expect((await publicGet(token)).status).toBe(200);
    } finally {
      provider.mockRestore();
    }
  });

  it('records each round’s outcome: rescheduled, held, passed or failed, and returns an eligible candidate to eligible on cancel', async () => {
    const owner = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: a.tenantId, rndtechnosoft_users: { email: a.email } } });
    const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    const round = (extra: Record<string, unknown> = {}) => ({ interviewType: 'ONLINE', startsAt: inHours(24), durationMinutes: 45, timezone: 'Asia/Kolkata', meetingLink: 'https://meet.example.com/x', interviewerMemberIds: [owner.id], notifyCandidate: false, notifyInterviewers: false, ...extra });
    const statusesOf = async (id: string) => (await asA('get', `/onboarding/candidates/${id}`)).body.data.interviews
      .filter((i: { status: string }) => i.status !== 'CANCELLED')
      .map((i: { roundNumber: number; status: string }) => [i.roundNumber, i.status]);

    // The eligible candidate can be interviewed; cancelling the only round puts them back to eligible.
    const first = await asA('post', `/onboarding/candidates/${ids.main}/interviews`, round());
    expect(first.status).toBe(201);
    const cancelled = await asA('post', `/onboarding/interviews/${first.body.data.interviewId}/cancel`, { reason: 'Panel unavailable', notify: false });
    expect(cancelled.body.data.candidate.status).toBe('ELIGIBLE');

    const second = await asA('post', `/onboarding/candidates/${ids.main}/interviews`, round());
    const interviewId = second.body.data.interviewId;
    const moved = await asA('post', `/onboarding/interviews/${interviewId}/reschedule`, { startsAt: inHours(48), durationMinutes: 45, timezone: 'Asia/Kolkata', reason: 'Candidate asked to move it' });
    expect(moved.status).toBe(200);
    expect(await statusesOf(ids.main)).toEqual([[1, 'RESCHEDULED']]);

    await prisma.rndtechnosoft_interviews.update({ where: { id: interviewId }, data: { scheduled_start: new Date(Date.now() - 2 * 3600_000) } });
    expect((await asA('post', `/onboarding/interviews/${interviewId}/complete`)).body.data.candidate.status).toBe('INTERVIEW_COMPLETED');
    expect(await statusesOf(ids.main)).toEqual([[1, 'COMPLETED']]);

    const failed = await asA('post', `/onboarding/interviews/${interviewId}/decision`, { decision: 'REJECT', notes: 'Not strong enough on GST' });
    expect(failed.body.data.candidate.status).toBe('REJECTED');
    expect(await statusesOf(ids.main)).toEqual([[1, 'FAILED']]);
    expect((await asA('post', `/onboarding/interviews/${interviewId}/decision`, { decision: 'SELECT' })).body.message).toMatch(/already been recorded/);

    // The database keeps the outcome and the decision together.
    await expect(prisma.rndtechnosoft_interviews.update({ where: { id: interviewId }, data: { interview_status: 'PASSED' } })).rejects.toThrow(/ck_interviews_outcome/);
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    const failedList = await asA('get', `/onboarding/interviews?status=FAILED&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    expect(failedList.status).toBe(200);
    expect(JSON.stringify(failedList.body.data)).toContain(interviewId);
  });

  it('lets the workflow diagram move stages by hand, but never set a status only an action may set', async () => {
    expect((await asA('get', '/onboarding/workflows/active')).status).toBe(200);
    const id = await candidate('flow');
    const screening = await asA('post', `/onboarding/candidates/${id}/move`, { status: 'SCREENING' });
    expect([screening.status, screening.body.data?.status]).toEqual([200, 'SCREENING']);

    // A stage that is not a status: the stage moves, the status stays.
    const interviewStage = await asA('post', `/onboarding/candidates/${id}/move`, { status: 'INTERVIEW' });
    expect(interviewStage.status).toBe(200);
    expect(await statusOf(id)).toBe('SCREENING');

    // The diagram draws Interview → Selected, but selection is only by an interview decision (or an override).
    const jump = await asA('post', `/onboarding/candidates/${id}/move`, { status: 'SELECTED' });
    expect(jump.status).toBe(409);
    expect(jump.body.message).toMatch(/Record a "select" decision/);
    expect(await statusOf(id)).toBe('SCREENING');
  });

  it('collects documents by checklist rules: with the form, by employment type, uploaded once checked, with completion', async () => {
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
    const contract = randomUUID();
    await prisma.rndtechnosoft_employment_types.create({ data: { id: contract, tenant_id: a.tenantId, employment_type_code: `CON_${SUFFIX}`, employment_type_name: 'Contract' } });

    // The defaults: a resume with the application, the rest at joining. A photo is asked of contract staff only, with the form.
    const types = (await asA('get', '/onboarding/document-types')).body.data as { id: string; code: string; collectAt: string; employmentTypeIds: string[] }[];
    expect(types.find((t) => t.code === 'RESUME')?.collectAt).toBe('APPLICATION');
    expect(types.find((t) => t.code === 'PAN_CARD')?.collectAt).toBe('JOINING');
    const photo = types.find((t) => t.code === 'PHOTO')!;
    const limited = await asA('put', `/onboarding/document-types/${photo.id}`, { collectAt: 'APPLICATION', employmentTypeIds: [contract] });
    expect(limited.body.data ?? limited.body).toMatchObject({ collectAt: 'APPLICATION', employmentTypeIds: [contract] });

    // Sending the form asks for the application documents that apply: a permanent hire gets the resume only.
    ids.docs = await candidate('docs');
    const sent = await sendForm(ids.docs);
    const form = await publicGet(sent.token);
    expect(form.body.data.documents.map((d: { label: string }) => d.label)).toEqual(['Resume']);

    // A contract hire also gets the photo.
    ids.contract = await candidate('contract');
    await prisma.rndtechnosoft_candidates.update({ where: { id: ids.contract }, data: { employment_type_id: contract } });
    const contractForm = await publicGet((await sendForm(ids.contract)).token);
    expect(contractForm.body.data.documents.map((d: { label: string }) => d.label).sort()).toEqual(['Passport-size Photo', 'Resume'].sort());

    // The candidate uploads on the form; files are checked by content.
    const resume = form.body.data.documents[0].id as string;
    const upload = (token: string, bytes: Buffer, name: string) =>
      request(app.getHttpServer()).post(`${API}/public/candidate-form/${token}/documents/${resume}/files`).set('Host', LOCAL).attach('files', bytes, { filename: name });
    expect((await upload(sent.token, Buffer.from('MZ not a document'), 'cv.pdf')).status).toBe(400);
    expect((await upload('y'.repeat(43), PDF, 'cv.pdf')).status).toBe(404);
    const uploaded = await upload(sent.token, PDF, 'cv.pdf');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data[0]).toMatchObject({ label: 'Resume', state: 'PENDING_REVIEW', files: [{ filename: 'cv.pdf', reviewStatus: 'PENDING_REVIEW' }] });
    expect(JSON.stringify(uploaded.body)).not.toMatch(/storage|reviewedBy|uploadedBy/);

    // Once submitted, the link takes no more files.
    expect((await publicSubmit(sent.token, FORM)).status).toBe(200);
    expect((await upload(sent.token, PDF, 'cv2.pdf')).status).toBe(404);

    // HR applies the joining checklist: everything at joining, once; the resume is not asked for twice.
    const joining = await asA('post', `/onboarding/candidates/${ids.docs}/documents/checklist`, { stage: 'JOINING' });
    expect(joining.status).toBe(200);
    const labels = joining.body.data.requests.map((r: { label: string }) => r.label);
    expect(labels).toContain('PAN card');
    expect(labels).not.toContain('Passport-size Photo');
    expect(labels.filter((l: string) => l === 'Resume')).toHaveLength(1);
    const again = await asA('post', `/onboarding/candidates/${ids.docs}/documents/checklist`, { stage: 'JOINING' });
    expect(again.body.data.requests).toHaveLength(labels.length);
    expect((await call('post', `/onboarding/candidates/${ids.docs}/documents/checklist`, viewer.token, { stage: 'JOINING' })).status).toBe(403);

    const required = joining.body.data.requests.filter((r: { isRequired: boolean }) => r.isRequired).length;
    expect(joining.body.data.completion).toMatchObject({ percent: 0, required, verified: 0, status: 'DOCUMENTS_PENDING' });
  });
});
