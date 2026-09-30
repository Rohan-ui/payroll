import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OnboardingMailerService } from '@/modules/onboarding/onboarding-mailer.service';
import { startFakeSmtp } from './support/fake-smtp';

/**
 * Offers end to end over HTTP: approved templates, drafting, an ordered
 * approval chain, sending by email with the PDF and a one-time link, and the
 * candidate accepting or declining through that link.
 *
 * Email goes to a fake SMTP server on 127.0.0.1 that only records messages;
 * workspace A's SMTP settings point there, and the suite stops if they point
 * anywhere else. Files are written to a temporary folder, removed afterwards.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Hr-Onboarding-Offers-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const DAY = 24 * 3600 * 1000;
const date = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string };

describe('HRMS onboarding offers', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
  const storageDir = path.join(os.tmpdir(), `onboarding-files-${SUFFIX}`);
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, storage: process.env.PRIVATE_STORAGE_DIR };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `offers-a-${SUFFIX}@onboarding.test`, memberId: '', host: '' };
  const b = { tenantId: '', token: '', email: `offers-b-${SUFFIX}@onboarding.test`, memberId: '', host: '' };
  const approver1: Person = { token: '', email: `approver1-${SUFFIX}@onboarding.test`, memberId: '' };
  const approver2: Person = { token: '', email: `approver2-${SUFFIX}@onboarding.test`, memberId: '' };
  const viewer: Person = { token: '', email: `viewer-${SUFFIX}@onboarding.test`, memberId: '' };
  const ids: Record<string, string> = {};
  const links: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);
  const publicCall = (method: 'get' | 'post', url: string, host = LOCAL, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}/public/offers/${url}`).set('Host', host).set('User-Agent', 'OfferTest/1.0');
    return body === undefined ? req : req.send(body as object);
  };
  const mailTo = (email: string) => smtp.messages.filter((m) => m.to.includes(email));
  const tokenIn = (data: string) => /\/offer\?token=([A-Za-z0-9_-]{40,60})/.exec(data)?.[1] ?? '';

  const TEMPLATE_BODY = [
    'Dear {{candidate_name}},',
    '',
    'We are pleased to offer you the role of {{job_title}} in {{department}} at {{company_name}}, starting {{joining_date}}.',
    '',
    'Your total annual pay is {{salary}}. Probation: {{probation_period}}. Please reply by {{offer_expiry_date}}.',
  ].join('\n');
  const offerInput = (extra: Record<string, unknown> = {}) => ({
    templateVersionId: ids.templateV2,
    jobTitle: 'Backend Engineer',
    departmentId: ids.department,
    workLocation: 'Pune',
    components: [
      { label: 'Basic', annualAmount: '900000.50' },
      { label: 'HRA', annualAmount: '300000.25' },
    ],
    probationMonths: 6,
    joiningDate: date(30),
    expiresOn: date(10),
    specialTerms: 'Joining bonus paid with the first salary.',
    ...extra,
  });

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Offers ${label} ${SUFFIX}`, tenantCode: `OFR${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    workspace.memberId = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } })).id;
    const domain = await prisma.rndtechnosoft_tenant_domains.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, is_primary: true } });
    workspace.host = `${domain.subdomain}.${BASE}`;
  }

  async function addMember(person: Person, roleCode: string, permissionCodes: string[]) {
    userEmails.push(person.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: userId, email: person.email, display_name: roleCode, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: roleCode, role_name: roleCode, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  /** A candidate in A, moved to Selected by a recorded override. */
  async function selectedCandidate(label: string) {
    const created = await asA('post', '/onboarding/candidates', { fullName: `Priya ${label}`, email: `priya.${label}.${SUFFIX}@candidate.test`, appliedPosition: 'Backend Engineer' });
    expect(created.status).toBe(201);
    const selected = await asA('post', `/onboarding/candidates/${created.body.data.id}/override`, { status: 'SELECTED', reason: 'Selected in an earlier process' });
    expect(selected.body.data.status).toBe('SELECTED');
    return created.body.data.id as string;
  }

  /** Drafts, approves and sends an offer; returns its id and the candidate's link token. */
  async function sentOffer(candidateId: string) {
    const offer = await asA('post', `/onboarding/candidates/${candidateId}/offers`, offerInput());
    expect(offer.status).toBe(201);
    await asA('post', `/onboarding/offers/${offer.body.data.id}/submit`, { approverMemberIds: [approver1.memberId] });
    expect((await call('post', `/onboarding/offers/${offer.body.data.id}/approve`, approver1.token, {})).status).toBe(200);
    const before = smtp.messages.length;
    const sent = await asA('post', `/onboarding/offers/${offer.body.data.id}/send`);
    expect(sent.body.data.offer.status).toBe('SENT');
    return { offerId: offer.body.data.id as string, token: tokenIn(smtp.messages.slice(before).map((m) => m.data).join('\n')) };
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
    await addMember(approver1, 'APPROVER_ONE', ['onboarding.view', 'onboarding.offers.approve']);
    await addMember(approver2, 'APPROVER_TWO', ['onboarding.view', 'onboarding.offers.approve']);
    await addMember(viewer, 'VIEWER', ['onboarding.view']);

    // Workspace A sends through the fake server only; B has no SMTP account.
    const smtpSettings = { host: smtp.host, port: smtp.port, username: null, passwordEncrypted: null, senderName: 'Acme HR', senderEmail: `hr-${SUFFIX}@acme.test`, replyToEmail: null, encryption: 'NONE', isActive: true };
    const row = await prisma.rndtechnosoft_tenant_settings.findUnique({ where: { tenant_id: a.tenantId } });
    const merged = { ...((row?.settings as Record<string, unknown>) ?? {}), smtp: smtpSettings };
    if (row) await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: a.tenantId }, data: { settings: merged } });
    else await prisma.rndtechnosoft_tenant_settings.create({ data: { id: randomUUID(), tenant_id: a.tenantId, settings: merged } });
    for (const setting of await prisma.rndtechnosoft_tenant_settings.findMany({ where: { tenant_id: { in: tenantIds } } })) {
      const configured = (setting.settings as { smtp?: { host?: string } } | null)?.smtp?.host;
      if (configured && configured !== '127.0.0.1') throw new Error('Refusing to run: a test workspace would send real email');
    }

    ids.department = (await prisma.rndtechnosoft_departments.create({ data: { id: randomUUID(), tenant_id: a.tenantId, department_code: `ENG_${SUFFIX}`, department_name: 'Engineering', department_status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offer_approvals.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offer_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_template_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_templates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interview_panelists.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interviews.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
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
    await fs.rm(storageDir, { recursive: true, force: true });
    for (const [key, value] of [['PLATFORM_BASE_DOMAIN', previous.base], ['PRIVATE_STORAGE_DIR', previous.storage]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await app?.close();
    await smtp?.close();
  });

  describe('templates', () => {
    it('refuses unknown or broken placeholders, and makes a new template a draft', async () => {
      const unknown = await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Standard', title: 'Offer', body: 'Hello {{first_name}}' });
      expect([unknown.status, unknown.body.message]).toEqual([400, "These placeholders don't exist: {{first_name}}. Use only the ones listed."]);
      expect((await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Standard', title: 'Offer', body: 'Hello {{candidate_name}' })).status).toBe(400);
      expect((await asA('post', '/onboarding/templates', { kind: 'JOINING_LETTER', name: 'Later', title: 'x', body: 'y' })).status).toBe(400);
      expect((await call('post', '/onboarding/templates', viewer.token, { kind: 'OFFER_LETTER', name: 'x', title: 'x', body: 'y' })).status).toBe(403);

      const created = await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Standard', title: 'Offer of employment: {{job_title}}', body: TEMPLATE_BODY });
      expect(created.status).toBe(201);
      ids.template = created.body.data.id;
      expect(created.body.data.versions).toEqual([expect.objectContaining({ number: 1, status: 'DRAFT' })]);
      ids.templateV1 = created.body.data.versions[0].id;
      expect((await asB('get', `/onboarding/templates/${ids.template}`)).status).toBe(404);
    });

    it('is usable only once approved, and approving a new version retires the old one', async () => {
      const candidate = await selectedCandidate('draft-template');
      expect((await asA('post', `/onboarding/candidates/${candidate}/offers`, offerInput({ templateVersionId: ids.templateV1 }))).body.message).toBe('Choose an approved offer letter template.');
      expect((await call('post', `/onboarding/templates/${ids.template}/approve`, viewer.token)).status).toBe(403);
      expect((await asA('post', `/onboarding/templates/${ids.template}/approve`)).body.data.versions[0].status).toBe('APPROVED');

      const edited = await asA('put', `/onboarding/templates/${ids.template}/draft`, { title: 'Offer of employment: {{job_title}}', body: `${TEMPLATE_BODY}\n\nSpecial terms: {{special_terms}}` });
      expect(edited.body.data.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'DRAFT'], [1, 'APPROVED']]);
      const approved = await asA('post', `/onboarding/templates/${ids.template}/approve`);
      expect(approved.body.data.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'APPROVED'], [1, 'RETIRED']]);
      ids.templateV2 = approved.body.data.versions[0].id;
    });
  });

  describe('drafting', () => {
    it('drafts an offer for a selected candidate only, with the total pay summed exactly', async () => {
      const fresh = await asA('post', '/onboarding/candidates', { fullName: 'Not Selected', email: `not.selected.${SUFFIX}@candidate.test`, appliedPosition: 'X' });
      expect((await asA('post', `/onboarding/candidates/${fresh.body.data.id}/offers`, offerInput())).status).toBe(409);

      ids.candidate = await selectedCandidate('main');
      for (const [label, body] of [
        ['expiry in the past', offerInput({ expiresOn: date(-1) })],
        ['joining before the last day to accept', offerInput({ joiningDate: date(5) })],
        ['amount with commas', offerInput({ components: [{ label: 'Basic', annualAmount: '9,00,000' }] })],
        ['no pay lines', offerInput({ components: [] })],
      ] as const) {
        const refused = await asA('post', `/onboarding/candidates/${ids.candidate}/offers`, body);
        expect([label, refused.status]).toEqual([label, 400]);
      }
      const drafted = await asA('post', `/onboarding/candidates/${ids.candidate}/offers`, offerInput());
      expect(drafted.status).toBe(201);
      ids.offer = drafted.body.data.id;
      expect(drafted.body.data).toMatchObject({ status: 'DRAFT', annualCtc: '1200000.75', letterIsFinal: false });
      expect(drafted.body.data.offerCode).toMatch(/^OFR-\d{4}-\d{6}$/);
      expect(drafted.body.data.letter.body).toContain('INR 12,00,000.75');
      expect((await asA('post', `/onboarding/candidates/${ids.candidate}/offers`, offerInput())).status).toBe(409);
      expect((await asB('get', `/onboarding/offers/${ids.offer}`)).status).toBe(404);
    });
  });

  describe('approval', () => {
    it('needs approvers other than the submitter who may approve offers, and fixes the letter', async () => {
      expect((await asA('post', `/onboarding/offers/${ids.offer}/submit`, { approverMemberIds: [a.memberId] })).body.message).toBe('You can’t approve an offer you submit. Choose other approvers.');
      expect((await asA('post', `/onboarding/offers/${ids.offer}/submit`, { approverMemberIds: [viewer.memberId] })).body.message).toBe('Every approver must be allowed to approve offers.');

      const before = smtp.messages.length;
      const submitted = await asA('post', `/onboarding/offers/${ids.offer}/submit`, { approverMemberIds: [approver1.memberId, approver2.memberId] });
      expect(submitted.status).toBe(200);
      expect(submitted.body.data.offer).toMatchObject({ status: 'PENDING_APPROVAL', letterIsFinal: true });
      expect(submitted.body.data.offer.letter.body).toContain('Dear Priya main,');
      expect(smtp.messages.slice(before).map((m) => m.to)).toEqual([[approver1.email]]);
      expect((await asA('put', `/onboarding/offers/${ids.offer}`, offerInput())).status).toBe(409);
    });

    it('is approved in order, and sending it back returns it to draft with the reason kept', async () => {
      expect((await call('post', `/onboarding/offers/${ids.offer}/approve`, approver2.token, {})).status).toBe(403);
      const first = await call('post', `/onboarding/offers/${ids.offer}/approve`, approver1.token, { comment: 'Pay is within band' });
      expect(first.body.data.offer.status).toBe('PENDING_APPROVAL');
      expect(mailTo(approver2.email)).toHaveLength(1);

      expect((await call('post', `/onboarding/offers/${ids.offer}/reject`, approver2.token, {})).status).toBe(400);
      const back = await call('post', `/onboarding/offers/${ids.offer}/reject`, approver2.token, { comment: 'Probation should be 3 months' });
      expect(back.body.data.offer).toMatchObject({ status: 'DRAFT', letterIsFinal: false });

      expect((await asA('put', `/onboarding/offers/${ids.offer}`, offerInput({ probationMonths: 3 }))).status).toBe(200);
      await asA('post', `/onboarding/offers/${ids.offer}/submit`, { approverMemberIds: [approver1.memberId, approver2.memberId] });
      await call('post', `/onboarding/offers/${ids.offer}/approve`, approver1.token, {});
      const approved = await call('post', `/onboarding/offers/${ids.offer}/approve`, approver2.token, {});
      expect(approved.body.data.offer.status).toBe('APPROVED');
      expect(approved.body.data.offer.letter.body).toContain('Probation: 3 months');
      // Both rounds of approval stay on record.
      expect(approved.body.data.offer.approvals.map((x: { submission: number; step: number; status: string }) => [x.submission, x.step, x.status])).toEqual([
        [2, 1, 'APPROVED'], [2, 2, 'APPROVED'], [1, 1, 'APPROVED'], [1, 2, 'REJECTED'],
      ]);
    });
  });

  describe('sending', () => {
    it('is refused to members without the permission, then emails the PDF and a one-time link', async () => {
      expect((await call('post', `/onboarding/offers/${ids.offer}/send`, approver1.token)).status).toBe(403);
      const before = smtp.messages.length;
      const sent = await asA('post', `/onboarding/offers/${ids.offer}/send`);
      expect(sent.status).toBe(200);
      expect(sent.body.data.notifications).toEqual([expect.objectContaining({ status: 'SENT', duplicate: false })]);
      expect(sent.body.data.offer).toMatchObject({ status: 'SENT', hasPdf: true });
      expect((await asA('get', `/onboarding/candidates/${ids.candidate}`)).body.data.status).toBe('OFFER_SENT');

      const [mail] = smtp.messages.slice(before);
      expect(mail.to).toEqual([`priya.main.${SUFFIX}@candidate.test`]);
      expect(mail.data).toContain('Content-Type: application/pdf');
      links.main = tokenIn(mail.data);
      expect(links.main).toHaveLength(43);
      // Only a hash of the link is stored.
      const stored = await prisma.rndtechnosoft_offers.findUniqueOrThrow({ where: { id: ids.offer } });
      expect(stored.response_token_hash).not.toContain(links.main);
      const file = await fs.readFile(path.join(storageDir, stored.pdf_storage_key!));
      expect(file.subarray(0, 5).toString()).toBe('%PDF-');
      expect(stored.pdf_storage_key!.startsWith(`${a.tenantId}/offers/`)).toBe(true);

      const again = await asA('post', `/onboarding/offers/${ids.offer}/send`);
      expect([again.status, again.body.message]).toEqual([409, 'This offer has already been sent.']);
      const pdf = await asA('get', `/onboarding/offers/${ids.offer}/pdf`);
      expect([pdf.status, pdf.headers['content-type']]).toEqual([200, 'application/pdf']);
    });

    it('sends one email when two sends arrive together', async () => {
      const candidate = await selectedCandidate('race');
      const offer = await asA('post', `/onboarding/candidates/${candidate}/offers`, offerInput());
      await asA('post', `/onboarding/offers/${offer.body.data.id}/submit`, { approverMemberIds: [approver1.memberId] });
      await call('post', `/onboarding/offers/${offer.body.data.id}/approve`, approver1.token, {});
      const before = mailTo(`priya.race.${SUFFIX}@candidate.test`).length;
      await Promise.all([asA('post', `/onboarding/offers/${offer.body.data.id}/send`), asA('post', `/onboarding/offers/${offer.body.data.id}/send`)]);
      expect(mailTo(`priya.race.${SUFFIX}@candidate.test`).length - before).toBe(1);
      expect((await asA('get', `/onboarding/offers/${offer.body.data.id}`)).body.data.status).toBe('SENT');
    });

    it('refuses to send when the workspace has no email account, and leaves the offer approved', async () => {
      const settings = await prisma.rndtechnosoft_tenant_settings.findUniqueOrThrow({ where: { tenant_id: a.tenantId } });
      const saved = settings.settings as Record<string, unknown>;
      await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: a.tenantId }, data: { settings: { ...saved, smtp: { ...(saved.smtp as object), isActive: false } } } });
      const candidate = await selectedCandidate('nosmtp');
      const offer = await asA('post', `/onboarding/candidates/${candidate}/offers`, offerInput());
      await asA('post', `/onboarding/offers/${offer.body.data.id}/submit`, { approverMemberIds: [approver1.memberId] });
      await call('post', `/onboarding/offers/${offer.body.data.id}/approve`, approver1.token, {});
      const attempt = await asA('post', `/onboarding/offers/${offer.body.data.id}/send`);
      expect(attempt.body.data.notifications[0]).toMatchObject({ status: 'NOT_SENT', error: expect.stringMatching(/no active SMTP account/) });
      expect(attempt.body.data.offer.status).toBe('APPROVED');
      expect((await prisma.rndtechnosoft_offers.findUniqueOrThrow({ where: { id: offer.body.data.id } })).response_token_hash).toBeNull();

      // Once email works again, the same offer can be sent.
      await prisma.rndtechnosoft_tenant_settings.update({ where: { tenant_id: a.tenantId }, data: { settings: saved as object } });
      expect((await asA('post', `/onboarding/offers/${offer.body.data.id}/send`)).body.data.offer.status).toBe('SENT');
    });
  });

  describe('the candidate’s link', () => {
    it('shows only that offer, only on its own workspace’s address', async () => {
      const view = await publicCall('get', links.main);
      expect(view.status).toBe(200);
      expect(view.body.data).toMatchObject({ jobTitle: 'Backend Engineer', status: 'SENT', canRespond: true, annualCtc: '1200000.75', candidateName: 'Priya main' });
      expect(view.body.data.approvals).toBeUndefined();
      expect(JSON.stringify(view.body.data)).not.toMatch(/tenant|approver|memberId/i);
      expect((await publicCall('get', links.main, a.host)).status).toBe(200);
      expect((await publicCall('get', links.main, b.host)).status).toBe(404);
      expect((await publicCall('get', `${links.main.slice(0, -1)}x`)).status).toBe(404);
      expect((await publicCall('get', 'short')).status).toBe(404);
      const pdf = await publicCall('get', `${links.main}/pdf`);
      expect([pdf.status, pdf.headers['content-type']]).toEqual([200, 'application/pdf']);
    });

    it('records an explicit acceptance with the typed name, time and source, once', async () => {
      expect((await publicCall('post', `${links.main}/accept`, LOCAL, { typedName: 'Priya Main' })).status).toBe(400);
      const before = smtp.messages.length;
      const accepted = await publicCall('post', `${links.main}/accept`, LOCAL, { typedName: 'Priya Main', confirm: true });
      expect(accepted.status).toBe(200);
      expect(accepted.body.data).toMatchObject({ status: 'ACCEPTED', canRespond: false });

      const stored = await prisma.rndtechnosoft_offers.findUniqueOrThrow({ where: { id: ids.offer } });
      expect(stored).toMatchObject({ offer_status: 'ACCEPTED', accepted_name: 'Priya Main', response_user_agent: 'OfferTest/1.0' });
      expect(stored.responded_at).not.toBeNull();
      const candidate = (await asA('get', `/onboarding/candidates/${ids.candidate}`)).body.data;
      expect(candidate.status).toBe('OFFER_ACCEPTED');
      expect(candidate.timeline[0].summary).toContain('accepted by the candidate (typed name: Priya Main)');
      expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: a.tenantId, action_code: 'ONBOARDING_OFFER_ACCEPTED', entity_id: ids.offer } })).toBe(1);
      expect(smtp.messages.slice(before).map((m) => m.to[0]).sort()).toEqual([a.email, `priya.main.${SUFFIX}@candidate.test`].sort());

      expect((await publicCall('post', `${links.main}/accept`, LOCAL, { typedName: 'Priya Main', confirm: true })).status).toBe(409);
      expect((await publicCall('post', `${links.main}/decline`, LOCAL, {})).status).toBe(409);
    });

    it('records a decline, and the candidate moves to offer declined', async () => {
      const candidate = await selectedCandidate('declines');
      const { token } = await sentOffer(candidate);
      const declined = await publicCall('post', `${token}/decline`, LOCAL, { reason: 'Accepted another offer' });
      expect(declined.body.data.status).toBe('DECLINED');
      expect((await asA('get', `/onboarding/candidates/${candidate}`)).body.data.status).toBe('OFFER_DECLINED');
    });

    it('expires an unanswered offer after its last day, returning the candidate to selected', async () => {
      const candidate = await selectedCandidate('expires');
      const { offerId, token } = await sentOffer(candidate);
      await prisma.rndtechnosoft_offers.update({ where: { id: offerId }, data: { expires_on: new Date(date(-1)) } });
      expect((await publicCall('get', token)).body.data).toMatchObject({ status: 'EXPIRED', canRespond: false });
      expect((await publicCall('post', `${token}/accept`, LOCAL, { typedName: 'Too Late', confirm: true })).status).toBe(409);
      expect((await asA('get', `/onboarding/candidates/${candidate}`)).body.data.status).toBe('SELECTED');
    });

    it('shows a withdrawn offer as withdrawn, and the candidate can be offered again', async () => {
      const candidate = await selectedCandidate('withdrawn');
      const { offerId, token } = await sentOffer(candidate);
      expect((await asA('post', `/onboarding/offers/${offerId}/withdraw`, { reason: 'Role closed' })).body.data.offer.status).toBe('WITHDRAWN');
      expect((await publicCall('get', token)).body.data).toMatchObject({ status: 'WITHDRAWN', canRespond: false });
      expect((await asA('get', `/onboarding/candidates/${candidate}`)).body.data.status).toBe('SELECTED');
      expect((await asA('post', `/onboarding/candidates/${candidate}/offers`, offerInput())).status).toBe(201);
    });

    it('stops working while HRMS is switched off', async () => {
      const candidate = await selectedCandidate('module-off');
      const { token } = await sentOffer(candidate);
      // Finance depends on HRMS, so it goes off first and comes back last.
      for (const [code, enabled] of [['FINANCE', false], ['HRMS', false]] as const) {
        const switched = await asA('put', `/tenants/modules/${code}`, { enabled });
        expect([code, switched.status < 300, switched.body.message]).toEqual([code, true, switched.body.message]);
      }
      expect((await publicCall('get', token)).status).toBe(404);
      for (const [code, enabled] of [['HRMS', true], ['FINANCE', true]] as const) expect((await asA('put', `/tenants/modules/${code}`, { enabled })).status).toBeLessThan(300);
      expect((await publicCall('get', token)).status).toBe(200);
    });
  });

  describe('dashboard and email retries', () => {
    it('counts offers waiting for approval and for an answer', async () => {
      const candidate = await selectedCandidate('dashboard');
      const offer = await asA('post', `/onboarding/candidates/${candidate}/offers`, offerInput());
      await asA('post', `/onboarding/offers/${offer.body.data.id}/submit`, { approverMemberIds: [approver1.memberId] });
      const forApprover = await call('get', '/onboarding/dashboard', approver1.token);
      expect(forApprover.body.data).toMatchObject({ offersAwaitingApproval: 1, myApprovalsDue: 1 });
      expect(forApprover.body.data.offersAwaitingResponse).toBeGreaterThanOrEqual(1);
      const mine = await call('get', '/onboarding/offers?awaitingMyApproval=true', approver1.token);
      expect(mine.body.data.map((o: { id: string }) => o.id)).toEqual([offer.body.data.id]);
    });

    it('retries an email that did not go out, and never sends a sent one again', async () => {
      const mailer = app.get(OnboardingMailerService);
      const email = { idempotencyKey: `retry:${SUFFIX}`, templateCode: 'TEST', to: `retry-${SUFFIX}@candidate.test`, subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' };
      const notSent = await mailer.send({ ...email, tenantId: b.tenantId });
      expect(notSent).toMatchObject({ status: 'NOT_SENT', duplicate: false });
      expect(await mailer.send({ ...email, tenantId: b.tenantId })).toMatchObject({ status: 'NOT_SENT', duplicate: false });

      const first = await mailer.send({ ...email, tenantId: a.tenantId });
      const second = await mailer.send({ ...email, tenantId: a.tenantId });
      expect([first.status, first.duplicate, second.status, second.duplicate]).toEqual(['SENT', false, 'SENT', true]);
      expect(mailTo(`retry-${SUFFIX}@candidate.test`)).toHaveLength(1);
    });
  });
});
