import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { startFakeSmtp } from './support/fake-smtp';

/**
 * Candidates' documents end to end over HTTP: HR asks for documents, files are
 * uploaded by HR or by the candidate through their emailed link, checked by
 * content and stored privately, kept as versions, verified or rejected, and
 * the candidate moves along the workflow as their documents are verified.
 *
 * Email goes to a fake SMTP server on 127.0.0.1 that only records messages;
 * the suite stops if a test workspace would send anywhere else. Files are
 * written to a temporary folder, removed afterwards.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Hr-Onboarding-Documents-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest-of-image')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('rest-of-photo')]);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string };
type Request = { id: string; label: string; state: string; files: { id: string; version: number; reviewStatus: string; filename: string }[] };

describe('HRMS onboarding documents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
  const storageDir = path.join(os.tmpdir(), `onboarding-documents-${SUFFIX}`);
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, storage: process.env.PRIVATE_STORAGE_DIR };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `docs-a-${SUFFIX}@onboarding.test`, memberId: '', host: '' };
  const b = { tenantId: '', token: '', email: `docs-b-${SUFFIX}@onboarding.test`, memberId: '', host: '' };
  const viewer: Person = { token: '', email: `docs-viewer-${SUFFIX}@onboarding.test`, memberId: '' };
  const ids: Record<string, string> = {};
  const links: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);
  const upload = (token: string, url: string, bytes: Buffer, filename: string) =>
    request(app.getHttpServer()).post(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`).attach('file', bytes, { filename, contentType: 'application/pdf' });
  const publicGet = (token: string, host = LOCAL) => request(app.getHttpServer()).get(`${API}/public/candidate-documents/${token}`).set('Host', host);
  const publicUpload = (token: string, requestId: string, bytes: Buffer, filename: string, host = LOCAL) =>
    request(app.getHttpServer())
      .post(`${API}/public/candidate-documents/${token}/requests/${requestId}/file`)
      .set('Host', host)
      .set('User-Agent', 'DocumentsTest/1.0')
      .attach('file', bytes, { filename, contentType: 'image/jpeg' });
  const mailTo = (email: string) => smtp.messages.filter((m) => m.to.includes(email));
  const tokenIn = (data: string) => /\/documents\?token=([A-Za-z0-9_-]{40,60})/.exec(data)?.[1] ?? '';
  const documentsOf = async (candidateId: string) => (await asA('get', `/onboarding/candidates/${candidateId}/documents`)).body.data as { candidateStatus: string; requests: Request[] };
  const requestNamed = async (candidateId: string, label: string) => (await documentsOf(candidateId)).requests.find((r) => r.label === label)!;
  const statusOf = async (candidateId: string) => (await asA('get', `/onboarding/candidates/${candidateId}`)).body.data.status as string;

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Documents ${label} ${SUFFIX}`, tenantCode: `DOC${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
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

  /** A candidate in A at the given status, reached by a recorded override. */
  async function candidateAt(label: string, status: string) {
    const created = await asA('post', '/onboarding/candidates', { fullName: `Arjun ${label}`, email: `arjun.${label}.${SUFFIX}@candidate.test`, appliedPosition: 'Accountant' });
    expect(created.status).toBe(201);
    if (status !== 'NEW') {
      const moved = await asA('post', `/onboarding/candidates/${created.body.data.id}/override`, { status, reason: 'Reached in an earlier process' });
      expect(moved.body.data.status).toBe(status);
    }
    return created.body.data.id as string;
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

  describe('asking and uploading', () => {
    it('asks for each document once, only with the permission, and starts document collection', async () => {
      ids.main = await candidateAt('main', 'OFFER_ACCEPTED');
      const items = [
        { type: 'PAN_CARD', isRequired: true },
        { type: 'AADHAAR_CARD', isRequired: true },
        { type: 'RESUME', label: 'Latest resume', isRequired: false },
      ];
      expect((await call('get', `/onboarding/candidates/${ids.main}/documents`, viewer.token)).status).toBe(403);
      expect((await call('post', `/onboarding/candidates/${ids.main}/documents`, viewer.token, { items })).status).toBe(403);
      expect((await asA('post', `/onboarding/candidates/${ids.main}/documents`, { items: [{ type: 'SALARY_SLIP', isRequired: true }] })).status).toBe(400);

      const requested = await asA('post', `/onboarding/candidates/${ids.main}/documents`, { items });
      expect(requested.status).toBe(201);
      expect(requested.body.data.requests.map((r: Request) => [r.label, r.state])).toEqual([
        ['PAN card', 'MISSING'],
        ['Aadhaar card', 'MISSING'],
        ['Latest resume', 'MISSING'],
      ]);
      expect(requested.body.data.candidateStatus).toBe('DOCUMENT_COLLECTION');

      const again = await asA('post', `/onboarding/candidates/${ids.main}/documents`, { items: [{ type: 'PAN_CARD', label: 'pan CARD', isRequired: true }] });
      expect([again.status, again.body.message]).toEqual([409, 'Already asked for: pan CARD.']);
      expect((await asB('get', `/onboarding/candidates/${ids.main}/documents`)).status).toBe(404);
      expect((await asB('post', `/onboarding/candidates/${ids.main}/documents`, { items })).status).toBe(404);
    });

    it('accepts only real PDF, JPG or PNG files within 10 MB, and stores them privately', async () => {
      const pan = await requestNamed(ids.main, 'PAN card');
      ids.pan = pan.id;
      const url = `/onboarding/candidates/${ids.main}/documents/${pan.id}/files`;

      const disguised = await upload(a.token, url, Buffer.from('<html><script>alert(1)</script></html>'), 'pan.pdf');
      expect([disguised.status, disguised.body.message]).toEqual([400, 'Upload a PDF, JPG or PNG file.']);
      expect((await upload(a.token, url, Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), 'big.pdf')).status).toBe(413);
      const empty = await request(app.getHttpServer()).post(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${a.token}`);
      expect([empty.status, empty.body.message]).toEqual([400, 'Choose a file to upload.']);
      expect((await upload(viewer.token, url, PDF, 'pan.pdf')).status).toBe(403);
      expect((await upload(b.token, url, PDF, 'pan.pdf')).status).toBe(404);

      const uploaded = await upload(a.token, url, PDF, '../../C:\\scans\\My PAN.PDF');
      expect(uploaded.status).toBe(201);
      const stored = uploaded.body.data.requests.find((r: Request) => r.id === pan.id);
      expect(stored.state).toBe('PENDING_REVIEW');
      expect(stored.files).toEqual([expect.objectContaining({ version: 1, reviewStatus: 'PENDING_REVIEW', filename: 'My PAN.pdf', uploadedVia: 'STAFF' })]);
      ids.panV1 = stored.files[0].id;

      const row = await prisma.rndtechnosoft_candidate_document_files.findFirstOrThrow({ where: { id: ids.panV1 } });
      expect(row.storage_key.startsWith(`${a.tenantId}/candidate-documents/`)).toBe(true);
      expect(await fs.readFile(path.join(storageDir, row.storage_key))).toEqual(PDF);
      expect(uploaded.text).not.toContain(row.storage_key);
    });

    it('shows a file only to members who may see documents in its own workspace, and audits it', async () => {
      const url = `/onboarding/candidates/${ids.main}/documents/files/${ids.panV1}`;
      const file = await asA('get', url).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      expect(file.status).toBe(200);
      expect(file.headers['content-type']).toBe('application/pdf');
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      expect(file.headers['content-disposition']).toContain("filename*=UTF-8''My%20PAN.pdf");
      expect(file.body).toEqual(PDF);
      expect((await call('get', url, viewer.token)).status).toBe(403);
      expect((await asB('get', url)).status).toBe(404);
      expect((await asB('get', `/onboarding/candidates/${randomUUID()}/documents/files/${ids.panV1}`)).status).toBe(404);
      expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: a.tenantId, action_code: 'ONBOARDING_DOCUMENT_VIEWED', entity_id: ids.panV1 } })).toBe(1);
    });

    it('keeps every upload as a version, replacing one still awaiting review', async () => {
      const second = await upload(a.token, `/onboarding/candidates/${ids.main}/documents/${ids.pan}/files`, PNG, 'pan-clearer.png');
      const pan = second.body.data.requests.find((r: Request) => r.id === ids.pan);
      expect(pan.files.map((f: Request['files'][number]) => [f.version, f.reviewStatus])).toEqual([[2, 'PENDING_REVIEW'], [1, 'SUPERSEDED']]);
      ids.panV2 = pan.files[0].id;
      const old = await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.panV1}/verify`);
      expect([old.status, old.body.message]).toEqual([409, 'A newer upload replaced this one. Review the newest upload instead.']);
    });
  });

  describe('verifying', () => {
    it('moves the candidate to verification, then ready to join once every required document is verified', async () => {
      const aadhaar = await requestNamed(ids.main, 'Aadhaar card');
      ids.aadhaar = aadhaar.id;

      // Upload Front Side
      const uploadedFront = await upload(a.token, `/onboarding/candidates/${ids.main}/documents/${aadhaar.id}/files`, JPG, 'aadhaar-front.jpg');
      expect(uploadedFront.body.data.candidateStatus).toBe('DOCUMENT_COLLECTION');

      // Upload Back Side
      const uploaded = await upload(a.token, `/onboarding/candidates/${ids.main}/documents/${aadhaar.id}/files`, JPG, 'aadhaar-back.jpg');
      const aadhaarReq = uploaded.body.data.requests.find((r: Request) => r.id === aadhaar.id);
      ids.aadhaarFront = (aadhaarReq.files.find((f: any) => f.slotName === 'Front Side') || aadhaarReq.files[1])?.id;
      ids.aadhaarBack = (aadhaarReq.files.find((f: any) => f.slotName === 'Back Side') || aadhaarReq.files[0])?.id;
      ids.aadhaarV1 = ids.aadhaarFront;
      expect(uploaded.body.data.candidateStatus).toBe('VERIFICATION');

      expect((await call('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.panV2}/verify`, viewer.token)).status).toBe(403);
      expect((await asB('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.panV2}/verify`)).status).toBe(404);
      expect((await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.panV2}/verify`)).body.data.documents.candidateStatus).toBe('VERIFICATION');

      // Verify Front Side
      await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.aadhaarFront}/verify`);
      // Verify Back Side
      const done = await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.aadhaarBack}/verify`);
      expect(done.status).toBe(200);
      // The optional resume is still missing; it does not hold the candidate back.
      expect(done.body.data.documents.candidateStatus).toBe('READY_TO_JOIN');
      expect(done.body.data.documents.counts).toEqual({ required: 2, verified: 2, toReview: 0 });

      const replace = await upload(a.token, `/onboarding/candidates/${ids.main}/documents/${ids.pan}/files`, PDF, 'pan.pdf');
      expect([replace.status, replace.body.message]).toEqual([409, 'PAN card is already verified.']);
      const timeline = (await asA('get', `/onboarding/candidates/${ids.main}`)).body.data.timeline as { type: string; summary: string; toStatus: string | null }[];
      expect(timeline).toContainEqual(expect.objectContaining({ type: 'DOCUMENT_STAGE', summary: 'All required documents verified', toStatus: 'READY_TO_JOIN' }));
    });

    it('rejects a document with a reason, even after verifying it, and the candidate goes back to collection', async () => {
      const short = await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.aadhaarBack}/reject`, { reason: 'no' });
      expect(short.status).toBe(400);
      const rejected = await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.aadhaarBack}/reject`, { reason: 'The photo is blurred; the number is unreadable.' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.data.documents.candidateStatus).toBe('DOCUMENT_COLLECTION');
      expect((await requestNamed(ids.main, 'Aadhaar card')).state).toBe('REJECTED');
      // No upload link was sent yet, so there is nothing to tell the candidate to use.
      expect(rejected.body.data.notifications).toEqual([]);
      const audit = await prisma.rndtechnosoft_audit_logs.findFirstOrThrow({ where: { tenant_id: a.tenantId, action_code: 'ONBOARDING_DOCUMENT_REJECTED', entity_id: ids.aadhaarBack } });
      expect(audit.old_values).toEqual({ reviewStatus: 'VERIFIED' });
    });

    it('removes a document asked for by mistake, but never one with uploads', async () => {
      const kept = await asA('delete', `/onboarding/candidates/${ids.main}/documents/${ids.pan}`);
      expect(kept.status).toBe(409);
      const resume = await requestNamed(ids.main, 'Latest resume');
      const removed = await asA('delete', `/onboarding/candidates/${ids.main}/documents/${resume.id}`);
      expect(removed.status).toBe(200);
      expect(removed.body.data.requests.map((r: Request) => r.label)).toEqual(['PAN card', 'Aadhaar card']);
    });
  });

  describe("the candidate's link", () => {
    it('is sent only once the offer is accepted and something is asked for', async () => {
      const early = await candidateAt('early', 'SCREENING');
      expect((await asA('post', `/onboarding/candidates/${early}/documents`, { items: [{ type: 'RESUME', isRequired: true }] })).status).toBe(201);
      expect(await statusOf(early)).toBe('SCREENING');
      expect((await asA('post', `/onboarding/candidates/${early}/documents/link`)).status).toBe(409);
      const nothing = await candidateAt('nothing', 'OFFER_ACCEPTED');
      expect((await asA('post', `/onboarding/candidates/${nothing}/documents/link`)).body.message).toBe('Ask for at least one document before sending the link.');
      expect((await call('post', `/onboarding/candidates/${ids.main}/documents/link`, viewer.token)).status).toBe(403);
    });

    it('emails a personal link, once even when asked twice at the same moment', async () => {
      const before = smtp.messages.length;
      const [first, second] = await Promise.all([asA('post', `/onboarding/candidates/${ids.main}/documents/link`), asA('post', `/onboarding/candidates/${ids.main}/documents/link`)]);
      expect([first.status, second.status]).toEqual([200, 200]);
      const outcomes = [first.body.data.notifications[0], second.body.data.notifications[0]];
      expect(outcomes.filter((o) => o.status === 'SENT' && !o.duplicate)).toHaveLength(1);
      const sent = smtp.messages.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toEqual([`arjun.main.${SUFFIX}@candidate.test`]);
      links.first = tokenIn(sent[0].data);
      expect(links.first).not.toBe('');
      expect(sent[0].data).not.toContain('candidate-documents/');
      const candidate = await prisma.rndtechnosoft_candidates.findFirstOrThrow({ where: { id: ids.main } });
      expect(candidate.document_token_hash).toBe(createHash('sha256').update(links.first).digest('hex'));
      expect(candidate.document_link_sent_at).not.toBeNull();
    });

    it('shows the candidate only their documents and where each stands, only on its own workspace’s address', async () => {
      expect((await publicGet(links.first, b.host)).status).toBe(404);
      expect((await publicGet('not-a-real-token-but-long-enough-to-look-like-one-xyz')).status).toBe(404);
      // A made-up link is refused before the upload is read.
      const madeUp = await publicUpload('not-a-real-token-but-long-enough-to-look-like-one-xyz', ids.aadhaar, JPG, 'x.jpg');
      expect([madeUp.status, madeUp.body.message]).toEqual([404, 'This upload link is not valid.']);
      const view = await publicGet(links.first, a.host);
      expect(view.status).toBe(200);
      expect(view.body.data).toMatchObject({ candidateName: 'Arjun main', maxFileBytes: 10 * 1024 * 1024 });
      expect(view.body.data.requests.map((r: { label: string; state: string; canUpload: boolean; rejectionReason: string | null }) => [r.label, r.state, r.canUpload, r.rejectionReason])).toEqual([
        ['PAN card', 'VERIFIED', false, null],
        ['Aadhaar card', 'REJECTED', true, 'The photo is blurred; the number is unreadable.'],
      ]);
      expect(view.text).not.toMatch(/storage|sha256|candidate-documents\//);
    });

    it('takes the candidate’s upload and moves them to verification', async () => {
      const refused = await publicUpload(links.first, ids.pan, JPG, 'pan.jpg');
      expect([refused.status, refused.body.message]).toEqual([409, 'PAN card is already verified.']);
      expect((await publicUpload(links.first, randomUUID(), JPG, 'x.jpg')).status).toBe(404);
      expect((await publicUpload(links.first, ids.aadhaar, JPG, 'aadhaar.jpg', b.host)).status).toBe(404);

      const uploaded = await publicUpload(links.first, ids.aadhaar, JPG, 'aadhaar-clear.jpg');
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data.requests[1]).toMatchObject({ state: 'PARTIALLY_VERIFIED', lastFilename: 'aadhaar-clear.jpg', canUpload: true });
      expect(await statusOf(ids.main)).toBe('VERIFICATION');
      const row = await prisma.rndtechnosoft_candidate_document_files.findFirstOrThrow({ where: { request_id: ids.aadhaar, version_number: 3 } });
      expect(row).toMatchObject({ uploaded_via: 'CANDIDATE', uploaded_by_tenant_member_id: null, content_type: 'image/jpeg' });
      ids.aadhaarV2 = row.id;
      const timeline = (await asA('get', `/onboarding/candidates/${ids.main}`)).body.data.timeline as { summary: string }[];
      expect(timeline.map((e) => e.summary)).toContain('Aadhaar card (Back Side) uploaded by the candidate (version 3)');
    });

    it('tells the candidate why a document was rejected, without the link', async () => {
      const before = smtp.messages.length;
      const rejected = await asA('post', `/onboarding/candidates/${ids.main}/documents/files/${ids.aadhaarV2}/reject`, { reason: 'Upload the back side as well.' });
      expect(rejected.body.data.notifications).toEqual([expect.objectContaining({ status: 'SENT', duplicate: false })]);
      const mail = smtp.messages.slice(before);
      expect(mail).toHaveLength(1);
      expect(mail[0].data).toContain('Upload the back side as well.');
      expect(tokenIn(mail[0].data)).toBe('');
    });

    it('stops the old link once a new one is sent', async () => {
      const before = smtp.messages.length;
      const resent = await asA('post', `/onboarding/candidates/${ids.main}/documents/link`);
      expect(resent.body.data.notifications[0]).toMatchObject({ status: 'SENT', duplicate: false });
      links.second = tokenIn(smtp.messages.slice(before).map((m) => m.data).join('\n'));
      expect(links.second).not.toBe(links.first);
      expect((await publicGet(links.first)).status).toBe(404);
      expect((await publicUpload(links.first, ids.aadhaar, JPG, 'late.jpg')).status).toBe(404);
      expect((await publicGet(links.second)).status).toBe(200);
    });

    it('stops working once expired, once the candidate withdraws, and while HRMS is off', async () => {
      await prisma.rndtechnosoft_candidates.update({ where: { id: ids.main }, data: { document_link_expires_at: new Date(Date.now() - 1000) } });
      const expired = await publicGet(links.second);
      expect([expired.status, expired.body.message]).toEqual([404, 'This upload link has expired. Ask the company to send you a new one.']);
      await prisma.rndtechnosoft_candidates.update({ where: { id: ids.main }, data: { document_link_expires_at: new Date(Date.now() + 3600 * 1000) } });

      for (const [code, enabled] of [['FINANCE', false], ['HRMS', false]] as const) expect((await asA('put', `/tenants/modules/${code}`, { enabled })).status).toBeLessThan(300);
      expect((await publicGet(links.second)).status).toBe(404);
      for (const [code, enabled] of [['HRMS', true], ['FINANCE', true]] as const) expect((await asA('put', `/tenants/modules/${code}`, { enabled })).status).toBeLessThan(300);
      expect((await publicGet(links.second)).status).toBe(200);

      expect((await asA('post', `/onboarding/candidates/${ids.main}/move`, { status: 'WITHDRAWN' })).status).toBe(200);
      expect((await publicGet(links.second)).status).toBe(404);
      const staff = await upload(a.token, `/onboarding/candidates/${ids.main}/documents/${ids.aadhaar}/files`, PDF, 'aadhaar.pdf');
      expect([staff.status, staff.body.message]).toEqual([409, 'The candidate is withdrawn, so no more documents are collected.']);
      // Nothing is lost: the documents can still be seen.
      expect((await documentsOf(ids.main)).requests).toHaveLength(2);
    });
  });

  describe('dashboard', () => {
    it('counts candidates with documents to verify and lists them', async () => {
      const waiting = await candidateAt('waiting', 'OFFER_ACCEPTED');
      await asA('post', `/onboarding/candidates/${waiting}/documents`, { items: [{ type: 'PHOTO', isRequired: true }] });
      const photo = (await documentsOf(waiting)).requests[0];
      expect((await upload(a.token, `/onboarding/candidates/${waiting}/documents/${photo.id}/files`, JPG, 'me.jpg')).status).toBe(201);

      const summary = await asA('get', '/onboarding/dashboard?timezone=Asia/Kolkata');
      expect(summary.body.data.candidatesWithDocumentsToVerify).toBe(1);
      const listed = await asA('get', '/onboarding/candidates?documents=to_verify');
      expect(listed.body.data.map((c: { id: string }) => c.id)).toEqual([waiting]);
      expect((await asB('get', '/onboarding/dashboard')).body.data.candidatesWithDocumentsToVerify).toBe(0);
    });
  });
});
