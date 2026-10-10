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
import { startFakeSmtp } from './support/fake-smtp';
import { makePng } from './support/png';
import { inspectPdf, pdfTexts } from './support/pdf-content';

/**
 * Letterheads and document previews over HTTP: letterheads with checked,
 * privately stored images; template layouts that use them; sample previews of
 * unsaved templates and offers; and offer PDFs shown (inline) or saved
 * (attachment) only when asked, without changing the offer.
 *
 * Email goes to a fake SMTP server on 127.0.0.1 only. Files are written to a
 * temporary folder, removed afterwards.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Hr-Letterheads-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const DAY = 24 * 3600 * 1000;
const date = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string };

describe('HRMS letterheads and document previews', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let smtp: Awaited<ReturnType<typeof startFakeSmtp>>;
  const storageDir = path.join(os.tmpdir(), `letterheads-${SUFFIX}`);
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, storage: process.env.PRIVATE_STORAGE_DIR };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `lh-a-${SUFFIX}@onboarding.test`, memberId: '' };
  const b = { tenantId: '', token: '', email: `lh-b-${SUFFIX}@onboarding.test`, memberId: '' };
  const viewer: Person = { token: '', email: `lh-viewer-${SUFFIX}@onboarding.test`, memberId: '' };
  const writer: Person = { token: '', email: `lh-writer-${SUFFIX}@onboarding.test`, memberId: '' };
  const approver: Person = { token: '', email: `lh-approver-${SUFFIX}@onboarding.test`, memberId: '' };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);
  /** A response whose body is a file, kept as bytes. */
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  const upload = (token: string, url: string, bytes: Buffer, filename = 'logo.png') =>
    request(app.getHttpServer()).post(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`).attach('file', bytes, { filename, contentType: 'image/png' });
  const text = (pdf: Buffer) => pdfTexts(pdf).flat();

  const letterheadInput = (extra: Record<string, unknown> = {}) => ({
    name: 'Official',
    companyName: 'Acme Technologies Pvt Ltd',
    addressText: '4th Floor, Baner Road, Pune 411045',
    phone: '+91 20 4000 1234',
    email: 'hr@acme.test',
    website: 'acme.test',
    registrationText: 'CIN U72200MH2015PTC000001',
    footerText: 'Private and confidential',
    logoPosition: 'LEFT',
    headerHeightMm: 30,
    footerHeightMm: 16,
    isDefault: true,
    ...extra,
  });
  const BODY = 'Dear {{candidate_name}},\n\nWe offer you the role of {{job_title}} at {{company_name}}, starting {{joining_date}}.\n\nYours sincerely,\nHuman Resources';
  const offerInput = (extra: Record<string, unknown> = {}) => ({
    templateVersionId: ids.version,
    jobTitle: 'Payroll Analyst',
    components: [{ label: 'Basic', annualAmount: '600000.00' }, { label: 'HRA', annualAmount: '240000.00' }],
    probationMonths: 3,
    joiningDate: date(30),
    expiresOn: date(10),
    ...extra,
  });

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Letterheads ${label} ${SUFFIX}`, tenantCode: `LTH${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    workspace.memberId = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } })).id;
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
    await addMember(writer, 'TEMPLATE_WRITER', ['onboarding.view', 'onboarding.templates.manage']);
    await addMember(approver, 'OFFER_APPROVER', ['onboarding.view', 'onboarding.offers.approve']);

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
      await prisma.rndtechnosoft_offer_approvals.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offer_components.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_template_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_templates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_letterhead_elements.deleteMany({ where: scope });
      await prisma.rndtechnosoft_letterhead_assets.deleteMany({ where: scope });
      await prisma.rndtechnosoft_letterheads.deleteMany({ where: scope });
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

  describe('letterheads', () => {
    it('are managed only by members who approve templates, and seen by all onboarding members', async () => {
      expect((await call('post', '/onboarding/letterheads', viewer.token, letterheadInput())).status).toBe(403);
      expect((await call('post', '/onboarding/letterheads', writer.token, letterheadInput())).status).toBe(403);
      const created = await asA('post', '/onboarding/letterheads', letterheadInput());
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ name: 'Official', isDefault: true, images: { logo: false, header: false, footer: false } });
      ids.letterhead = created.body.data.id;
      expect((await call('get', '/onboarding/letterheads', viewer.token)).body.data.map((l: { id: string }) => l.id)).toEqual([ids.letterhead]);

      expect((await asA('post', '/onboarding/letterheads', letterheadInput({ name: 'official', isDefault: false }))).status).toBe(409);
      expect((await asA('post', '/onboarding/letterheads', letterheadInput({ headerHeightMm: 5 }))).status).toBe(400);
      const second = await asA('post', '/onboarding/letterheads', letterheadInput({ name: 'Formal', logoPosition: 'CENTER', headerHeightMm: 45 }));
      ids.formal = second.body.data.id;
      const list = (await asA('get', '/onboarding/letterheads')).body.data as { id: string; isDefault: boolean }[];
      expect(list.filter((l) => l.isDefault).map((l) => l.id)).toEqual([ids.formal]);

      expect((await asB('get', `/onboarding/letterheads/${ids.letterhead}`)).status).toBe(404);
      expect((await asB('put', `/onboarding/letterheads/${ids.letterhead}`, letterheadInput())).status).toBe(404);
    });

    it('take only PNG or JPEG images that documents can use, up to 2 MB, stored privately', async () => {
      const url = `/onboarding/letterheads/${ids.letterhead}/images/logo`;
      expect((await upload(writer.token, url, makePng(400, 100))).status).toBe(403);
      const svg = await upload(a.token, url, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.svg');
      expect([svg.status, svg.body.message]).toEqual([400, 'Upload a PNG or JPEG image.']);
      const broken = await upload(a.token, url, Buffer.concat([makePng(10, 10).subarray(0, 40)]));
      expect(broken.status).toBe(400);
      expect(broken.body.message).toContain('can’t be used in documents');
      expect((await upload(a.token, url, Buffer.concat([makePng(10, 10), Buffer.alloc(2 * 1024 * 1024)]))).status).toBe(413);
      expect((await upload(a.token, `/onboarding/letterheads/${ids.letterhead}/images/background`, makePng(10, 10))).status).toBe(404);
      expect((await upload(b.token, url, makePng(400, 100))).status).toBe(404);

      const logo = makePng(400, 100);
      const saved = await upload(a.token, url, logo);
      expect(saved.status).toBe(201);
      expect(saved.body.data.images).toEqual({ logo: true, header: false, footer: false });
      const row = await prisma.rndtechnosoft_letterheads.findFirstOrThrow({ where: { id: ids.letterhead } });
      expect(row.logo_storage_key?.startsWith(`${a.tenantId}/letterheads/`)).toBe(true);
      expect(saved.text).not.toContain(row.logo_storage_key);

      const shown = await binary(call('get', url, viewer.token));
      expect([shown.status, shown.headers['content-type'], shown.headers['x-content-type-options']]).toEqual([200, 'image/png', 'nosniff']);
      expect(shown.body).toEqual(logo);
      expect((await asB('get', url)).status).toBe(404);
    });

    it('preview unsaved details on a sample letter without storing anything', async () => {
      const before = await prisma.rndtechnosoft_letterheads.findFirstOrThrow({ where: { id: ids.letterhead } });
      const preview = await binary(call('post', '/onboarding/letterheads/preview-pdf', writer.token, { ...letterheadInput({ companyName: 'Acme Renamed Pvt Ltd' }), letterheadId: ids.letterhead }));
      expect([preview.status, preview.headers['content-type']]).toEqual([200, 'application/pdf']);
      expect(preview.headers['content-disposition']).toMatch(/^inline;/);
      const pages = inspectPdf(preview.body, 841.89);
      expect(pages[0].texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Acme Renamed Pvt Ltd', 'SAMPLE', 'Page 1 of 1']));
      expect(pages[0].images[0].width / pages[0].images[0].height).toBeCloseTo(4, 2);
      expect(await prisma.rndtechnosoft_letterheads.findFirstOrThrow({ where: { id: ids.letterhead } })).toEqual(before);
      expect((await call('post', '/onboarding/letterheads/preview-pdf', viewer.token, letterheadInput())).status).toBe(403);
      expect((await asB('post', '/onboarding/letterheads/preview-pdf', { ...letterheadInput(), letterheadId: ids.letterhead })).status).toBe(404);
    });
    it('keep where the editor placed each image, checked against the header and footer, and preview with it', async () => {
      const url = `/onboarding/letterheads/${ids.letterhead}`;
      // Upright unless turned: rotation 0.
      const logoBox = { x: 10, y: 5, width: 40, height: 10, stretch: false, rotation: 0 };
      const saved = await asA('put', url, letterheadInput({ logoBox, headerArtBox: null, footerArtBox: null }));
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ logoBox, headerArtBox: null, footerArtBox: null });
      // Saving without boxes leaves them as they are; reloading returns them.
      await asA('put', url, letterheadInput({ footerHeightMm: 20 }));
      expect((await asA('get', url)).body.data).toMatchObject({ logoBox, footerHeightMm: 20 });

      const tooTall = await asA('put', url, letterheadInput({ logoBox: { ...logoBox, y: 25 } }));
      expect([tooTall.status, tooTall.body.message]).toEqual([400, 'The logo reaches below the header (30 mm tall). Make it smaller, move it up, or make the header taller.']);
      const tooWide = await asA('put', url, letterheadInput({ footerArtBox: { x: 100, y: 0, width: 120, height: 10, stretch: true } }));
      expect([tooWide.status, tooWide.body.message]).toEqual([400, 'The footer artwork is wider than the page. Make it narrower or move it left.']);
      for (const bad of [{ ...logoBox, width: 1 }, { ...logoBox, x: -1 }, { ...logoBox, x: 1.25 }, { ...logoBox, unit: 'px' }, { x: 1, y: 1 }]) {
        expect((await asA('put', url, letterheadInput({ logoBox: bad }))).status).toBe(400);
      }
      expect((await asA('get', url)).body.data.logoBox).toEqual(logoBox);

      const MM = 72 / 25.4;
      const previewWith = async (extra: Record<string, unknown>) =>
        inspectPdf((await binary(call('post', '/onboarding/letterheads/preview-pdf', writer.token, { ...letterheadInput(extra), letterheadId: ids.letterhead }))).body, 841.89)[0].images[0];
      // The sample letter uses A4 with 20 mm margins.
      const savedBox = await previewWith({});
      expect([savedBox.left, savedBox.top, savedBox.width, savedBox.height].map((n) => Math.round(n / MM))).toEqual([30, 25, 40, 10]);
      const moved = await previewWith({ logoBox: { ...logoBox, x: 50, width: 60, height: 15 } });
      expect([moved.left, moved.top, moved.width, moved.height].map((n) => Math.round(n / MM))).toEqual([70, 25, 60, 15]);
      const automatic = await previewWith({ logoBox: null });
      expect(Math.round(automatic.left / MM)).toBe(20);
      expect((await asA('get', url)).body.data.logoBox).toEqual(logoBox);
    });

    it('sit at the page margins, or at set distances from the page edges down to the edge itself', async () => {
      const url = `/onboarding/letterheads/${ids.letterhead}`;
      expect((await asA('get', url)).body.data.placement).toBeNull();
      const placement = { headerOffsetMm: 0, footerOffsetMm: 0, sideOffsetMm: 0 };
      const saved = await asA('put', url, letterheadInput({ placement }));
      expect([saved.status, saved.body.data.placement]).toEqual([200, placement]);
      // Saving without a placement keeps it.
      await asA('put', url, letterheadInput());
      expect((await asA('get', url)).body.data.placement).toEqual(placement);
      for (const bad of [{ ...placement, headerOffsetMm: -1 }, { ...placement, sideOffsetMm: 61 }, { ...placement, footerOffsetMm: 0.5 }, { headerOffsetMm: 0 }]) {
        expect((await asA('put', url, letterheadInput({ placement: bad }))).status).toBe(400);
      }

      // The saved logo box (10, 5 mm) now measures from the paper's top-left corner.
      const MM = 72 / 25.4;
      const preview = await binary(call('post', '/onboarding/letterheads/preview-pdf', writer.token, { ...letterheadInput(), letterheadId: ids.letterhead }));
      const logo = inspectPdf(preview.body, 841.89)[0].images[0];
      expect([logo.left, logo.top].map((n) => Math.round(n / MM))).toEqual([10, 5]);

      const cleared = await asA('put', url, letterheadInput({ placement: null }));
      expect(cleared.body.data.placement).toBeNull();
    });

    it('keep turned images, hidden and locked ones, and page elements with their own uploaded images, in this workspace only', async () => {
      const url = `/onboarding/letterheads/${ids.letterhead}`;
      const logoBox = { x: 10, y: 5, width: 40, height: 10, stretch: false, rotation: 90 };
      const turned = await asA('put', url, letterheadInput({ logoBox, hiddenImages: ['footer'], lockedImages: ['logo'] }));
      expect(turned.status).toBe(200);
      expect(turned.body.data).toMatchObject({ logoBox, hiddenImages: ['footer'], lockedImages: ['logo'], elements: [] });

      // An image for elements: checked like a logo, stored privately, shown only to this workspace.
      const assetUrl = `${url}/assets`;
      expect((await upload(writer.token, assetUrl, makePng(200, 100))).status).toBe(403);
      expect((await upload(a.token, assetUrl, Buffer.from('<svg/>'), 'x.svg')).status).toBe(400);
      expect((await upload(b.token, assetUrl, makePng(200, 100))).status).toBe(404);
      const seal = makePng(200, 100);
      const uploaded = await upload(a.token, assetUrl, seal, 'seal.png');
      expect(uploaded.status).toBe(201);
      expect(uploaded.body.data).toMatchObject({ widthPx: 200, heightPx: 100 });
      const assetId = uploaded.body.data.id as string;
      expect((await binary(call('get', `${assetUrl}/${assetId}`, viewer.token))).body).toEqual(seal);
      expect((await asB('get', `${assetUrl}/${assetId}`)).status).toBe(404);

      const textMark = { kind: 'TEXT', x: 25, y: 133.5, width: 160, height: 30, rotation: -45, opacity: 0.25, aboveText: false, hidden: false, locked: false, text: 'CONFIDENTIAL', fontFamily: 'courier', fontSizePt: 48, bold: true, italic: false, color: '#64748B', align: 'center' };
      const imageMark = { kind: 'IMAGE', x: 65, y: 128.5, width: 80, height: 40, rotation: 15, opacity: 0.5, aboveText: true, hidden: false, locked: true, imageId: assetId };
      const saved = await asA('put', url, letterheadInput({ elements: [textMark, imageMark, { ...imageMark, x: 100, hidden: true }] }));
      expect(saved.status).toBe(200);
      const elements = saved.body.data.elements as Record<string, unknown>[];
      expect(elements).toHaveLength(3);
      expect(elements[0]).toMatchObject({ ...textMark, color: '#64748b', imageId: null });
      expect(elements[1]).toMatchObject({ ...imageMark, text: null });
      // Saving without elements keeps them; reloading returns them in order.
      await asA('put', url, letterheadInput());
      expect(((await asA('get', url)).body.data.elements as { kind: string }[]).map((e) => e.kind)).toEqual(['TEXT', 'IMAGE', 'IMAGE']);

      // Refused: another workspace's image, an element off the page, a bad colour, too many elements.
      const foreign = (await asB('post', '/onboarding/letterheads', letterheadInput({ name: `Other ${SUFFIX}` }))).body.data.id as string;
      const foreignAsset = (await upload(b.token, `/onboarding/letterheads/${foreign}/assets`, makePng(10, 10))).body.data.id as string;
      const stolen = await asA('put', url, letterheadInput({ elements: [{ ...imageMark, imageId: foreignAsset }] }));
      expect([stolen.status, stolen.body.message]).toEqual([400, 'Element 1 shows an image that isn’t uploaded for this letterhead. Upload the image again.']);
      expect((await asA('put', url, letterheadInput({ elements: [{ ...textMark, x: 100 }] }))).body.message).toBe('Element 1 runs off the page. Make it smaller or move it in.');
      for (const bad of [{ ...textMark, color: 'red' }, { ...textMark, opacity: 1.5 }, { ...textMark, text: '  ' }, { ...textMark, fontFamily: 'comic' }, { ...textMark, rotation: 400 }, { ...imageMark, imageId: undefined }]) {
        expect((await asA('put', url, letterheadInput({ elements: [bad] }))).status).toBe(400);
      }
      expect((await asA('put', url, letterheadInput({ elements: Array.from({ length: 61 }, () => textMark) }))).status).toBe(400);
      expect(((await asA('get', url)).body.data.elements as unknown[]).length).toBe(3);

      // The sample prints the turned logo, the watermark behind the letter and the visible image in front; not the hidden ones.
      const preview = await binary(call('post', '/onboarding/letterheads/preview-pdf', writer.token, { ...letterheadInput(), letterheadId: ids.letterhead }));
      expect(preview.status).toBe(200);
      const [page] = inspectPdf(preview.body, 841.89);
      expect(page.texts.filter((t) => t.text === 'CONFIDENTIAL').map((t) => t.font)).toEqual(['Courier-Bold']);
      // The logo and one image watermark: the footer artwork and the hidden watermark are left out.
      expect(page.images).toHaveLength(2);
      const raw = preview.body.toString('latin1');
      expect(raw).toMatch(/\/ca 0\.25/);
      expect(raw).toMatch(/\/ca 0\.5/);

      // Back to a plain letterhead for the tests that follow.
      const reset = await asA('put', url, letterheadInput({ logoBox: { ...logoBox, rotation: 0 }, hiddenImages: [], lockedImages: [], elements: [] }));
      expect(reset.body.data).toMatchObject({ hiddenImages: [], lockedImages: [], elements: [] });
    });
  });

  describe('templates', () => {
    it('keep a layout per version, with a letterhead of their own workspace only', async () => {
      const foreign = (await asB('post', '/onboarding/letterheads', letterheadInput())).body.data.id as string;
      const refused = await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Standard', title: 'Offer: {{job_title}}', body: BODY, letterheadId: foreign });
      expect([refused.status, refused.body.message]).toEqual([400, 'Choose a letterhead of this workspace that is not archived.']);

      const marginsMm = { top: 0, right: 15, bottom: 18, left: 25 };
      const created = await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Standard', title: 'Offer: {{job_title}}', body: BODY, letterheadId: ids.letterhead, pageSize: 'A4', marginsMm, showPageNumbers: true });
      expect(created.status).toBe(201);
      ids.template = created.body.data.id;
      expect(created.body.data.versions[0].layout).toEqual({ letterheadId: ids.letterhead, letterheadName: 'Official', pageSize: 'A4', marginsMm, showPageNumbers: true });

      // Saving wording alone keeps the layout.
      const saved = await asA('put', `/onboarding/templates/${ids.template}/draft`, { title: 'Offer: {{job_title}}', body: BODY });
      expect(saved.body.data.versions[0].layout.letterheadId).toBe(ids.letterhead);
      for (const bad of [{ ...marginsMm, top: -1 }, { ...marginsMm, left: 61 }, { ...marginsMm, right: 1.5 }, { top: 10 }]) {
        expect((await asA('put', `/onboarding/templates/${ids.template}/draft`, { title: 'x', body: 'y', marginsMm: bad })).status).toBe(400);
      }
      expect((await asA('get', `/onboarding/templates/${ids.template}`)).body.data.versions[0].layout.marginsMm).toEqual(marginsMm);
      const approved = await asA('post', `/onboarding/templates/${ids.template}/approve`);
      ids.version = approved.body.data.versions[0].id;
    });

    it('preview the editor’s unsaved text and layout as a marked sample', async () => {
      const preview = await binary(
        call('post', '/onboarding/templates/preview-pdf', writer.token, { kind: 'OFFER_LETTER', title: 'Unsaved heading for {{candidate_name}}', body: BODY, letterheadId: ids.formal, marginsMm: { top: 25, right: 25, bottom: 25, left: 25 }, showPageNumbers: false }),
      );
      expect([preview.status, preview.headers['content-type']]).toEqual([200, 'application/pdf']);
      const words = text(preview.body);
      expect(words).toEqual(expect.arrayContaining(['Unsaved heading for Priya Rao', 'SAMPLE', 'Acme Technologies Pvt Ltd', 'Total (CTC)']));
      expect(words.some((w) => w.startsWith('Page '))).toBe(false);
      const bad = await call('post', '/onboarding/templates/preview-pdf', writer.token, { kind: 'OFFER_LETTER', title: 'x', body: 'Hello {{nobody}}' });
      expect([bad.status, bad.body.message]).toEqual([400, "These placeholders don't exist: {{nobody}}. Use only the ones listed."]);
      expect((await call('post', '/onboarding/templates/preview-pdf', viewer.token, { kind: 'OFFER_LETTER', title: 'x', body: 'y' })).status).toBe(403);
      // Previewing changed nothing.
      expect((await asA('get', `/onboarding/templates/${ids.template}`)).body.data.versions).toHaveLength(1);
    });
  });

  describe('offer letters', () => {
    it('show a draft offer as a marked preview, and save it only when a download is asked for, changing nothing', async () => {
      const candidate = await asA('post', '/onboarding/candidates', { fullName: 'Meera Iyer', email: `meera.${SUFFIX}@candidate.test`, appliedPosition: 'Payroll Analyst' });
      ids.candidate = candidate.body.data.id;
      await asA('post', `/onboarding/candidates/${ids.candidate}/override`, { status: 'SELECTED', reason: 'Selected in an earlier process' });
      const offer = await asA('post', `/onboarding/candidates/${ids.candidate}/offers`, offerInput());
      expect(offer.status).toBe(201);
      ids.offer = offer.body.data.id;

      const shown = await binary(call('get', `/onboarding/offers/${ids.offer}/pdf`, viewer.token));
      expect([shown.status, shown.headers['content-type']]).toEqual([200, 'application/pdf']);
      expect(shown.headers['content-disposition']).toMatch(/^inline;/);
      expect(text(shown.body)).toEqual(expect.arrayContaining(['PREVIEW', 'Acme Technologies Pvt Ltd', 'Offer: Payroll Analyst', 'Page 1 of 1']));
      // The letterhead prints as placed in its editor, from the template's margins (top 0 mm, left 25 mm).
      const [logo] = inspectPdf(shown.body, 841.89)[0].images;
      expect([logo.left, logo.top, logo.width, logo.height].map((n) => Math.round(n / (72 / 25.4)))).toEqual([35, 5, 40, 10]);
      const saved = await binary(asA('get', `/onboarding/offers/${ids.offer}/pdf?download=1`));
      expect(saved.headers['content-disposition']).toMatch(/^attachment;/);
      expect((await asB('get', `/onboarding/offers/${ids.offer}/pdf`)).status).toBe(404);

      const after = await asA('get', `/onboarding/offers/${ids.offer}`);
      expect(after.body.data).toMatchObject({ status: 'DRAFT', hasPdf: false, sentAt: null });
      expect(await prisma.rndtechnosoft_onboarding_notifications.count({ where: { tenant_id: a.tenantId } })).toBe(0);
    });

    it('preview an unsaved offer form with the candidate’s details, storing nothing', async () => {
      const preview = await binary(asA('post', '/onboarding/offers/preview-pdf', { candidateId: ids.candidate, ...offerInput({ jobTitle: 'Senior Payroll Analyst' }) }));
      expect(preview.status).toBe(200);
      const words = text(preview.body);
      expect(words).toEqual(expect.arrayContaining(['Offer: Senior Payroll Analyst', 'Dear Meera Iyer,', 'INR 8,40,000.00', 'PREVIEW']));
      expect((await asA('get', `/onboarding/offers/${ids.offer}`)).body.data.jobTitle).toBe('Payroll Analyst');
      expect(await prisma.rndtechnosoft_offers.count({ where: { tenant_id: a.tenantId } })).toBe(1);
      const invalid = await asA('post', '/onboarding/offers/preview-pdf', { candidateId: ids.candidate, ...offerInput({ joiningDate: date(5) }) });
      expect([invalid.status, invalid.body.message]).toEqual([400, 'The joining date must be on or after the last day to accept.']);
      expect((await asB('post', '/onboarding/offers/preview-pdf', { candidateId: ids.candidate, ...offerInput() })).status).toBe(404);
      expect((await call('post', '/onboarding/offers/preview-pdf', viewer.token, { candidateId: ids.candidate, ...offerInput() })).status).toBe(403);
    });

    it('send the same letter that was previewed, on the letterhead, without the preview marks', async () => {
      await asA('post', `/onboarding/offers/${ids.offer}/submit`, { approverMemberIds: [approver.memberId] });
      expect((await call('post', `/onboarding/offers/${ids.offer}/approve`, approver.token, {})).status).toBe(200);
      const preview = pdfTexts((await binary(asA('get', `/onboarding/offers/${ids.offer}/pdf`))).body);
      const before = smtp.messages.length;
      expect((await asA('post', `/onboarding/offers/${ids.offer}/send`)).body.data.offer.status).toBe('SENT');
      expect(smtp.messages.length).toBe(before + 1);
      const sent = pdfTexts((await binary(asA('get', `/onboarding/offers/${ids.offer}/pdf`))).body);

      const withoutMarks = (pages: string[][]) => pages.map((p) => p.filter((t) => t !== 'PREVIEW' && !t.startsWith('Preview:') && !t.startsWith('Offer OFR-')));
      expect(withoutMarks(sent)).toEqual(withoutMarks(preview));
      expect(sent.flat()).not.toContain('PREVIEW');
      expect(sent.flat()).toContain('Acme Technologies Pvt Ltd');
    });
  });

  describe('formatted templates', () => {
    const MM = 72 / 25.4;
    const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
    const style = (attrs: Record<string, unknown>) => ({ type: 'textStyle', attrs: { fontFamily: null, fontSize: null, color: null, backgroundColor: null, ...attrs } });
    const block = { textAlign: null, lineHeight: null, spaceBefore: null, spaceAfter: null, indent: null };
    const placeholder = (key: string, marks?: unknown[]) => ({ type: 'placeholder', attrs: { key }, ...(marks ? { marks } : {}) });
    const DOCUMENT = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, ...block, textAlign: 'center' }, content: [text('Offer of employment: ', [style({ fontFamily: 'times', fontSize: 24 })]), placeholder('job_title', [style({ fontFamily: 'times', fontSize: 24 })])] },
        { type: 'paragraph', attrs: { ...block, spaceAfter: 14 }, content: [text('Dear '), placeholder('candidate_name', [{ type: 'bold' }, style({ fontSize: 12 })]), text(',')] },
        { type: 'paragraph', attrs: { ...block, textAlign: 'justify', lineHeight: 1.5 }, content: [text('We are '), text('pleased to offer you', [{ type: 'bold' }, { type: 'italic' }, style({ fontSize: 13 })]), text(' the role.')] },
        { type: 'compensationTable' },
      ],
    };
    const fonts = (pdf: Buffer) => inspectPdf(pdf, 841.89).flatMap((p) => p.texts);

    it('start from the standard wording, and keep formatting and placeholders exactly as saved', async () => {
      const created = await asA('post', '/onboarding/templates', { kind: 'OFFER_LETTER', name: 'Formatted', letterheadId: ids.letterhead, pageSize: 'A4', marginsMm: { top: 20, right: 20, bottom: 20, left: 20 }, showPageNumbers: true });
      expect(created.status).toBe(201);
      ids.formatted = created.body.data.id;
      const first = created.body.data.versions[0];
      expect(first).toMatchObject({ format: 'FORMATTED', title: 'OFFER LETTER' });
      expect(first.document.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1, textAlign: 'center' } });
      expect(created.body.data.format.fonts.map((f: { key: string }) => f.key)).toEqual(['helvetica', 'times', 'courier']);

      const saved = await asA('put', `/onboarding/templates/${ids.formatted}/draft`, { document: DOCUMENT });
      expect(saved.status).toBe(200);
      const reloaded = (await asA('get', `/onboarding/templates/${ids.formatted}`)).body.data.versions[0];
      expect(reloaded.document).toEqual(DOCUMENT);
      expect(reloaded.title).toBe('Offer of employment: {{job_title}}');
      expect(reloaded.body).toContain('Dear {{candidate_name}},');

      const bad = await asA('put', `/onboarding/templates/${ids.formatted}/draft`, { document: { type: 'doc', content: [{ type: 'paragraph', content: [text('x', [style({ fontFamily: 'Papyrus' })])] }] } });
      expect([bad.status, bad.body.message]).toEqual([400, 'Choose one of the listed fonts; other fonts can’t be printed in the PDF.']);
      const unknown = await asA('put', `/onboarding/templates/${ids.formatted}/draft`, { document: { type: 'doc', content: [{ type: 'paragraph', content: [placeholder('salary_bank_account')] }] } });
      expect(unknown.status).toBe(400);
      expect((await asA('get', `/onboarding/templates/${ids.formatted}`)).body.data.versions[0].document).toEqual(DOCUMENT);
    });

    it('preview the document as it prints, filled with sample values', async () => {
      const preview = await binary(call('post', '/onboarding/templates/preview-pdf', writer.token, { kind: 'OFFER_LETTER', document: DOCUMENT, letterheadId: ids.letterhead, marginsMm: { top: 25, right: 25, bottom: 25, left: 25 }, showPageNumbers: true }));
      expect(preview.status).toBe(200);
      const texts = fonts(preview.body);
      // Headings are bold unless changed; this one wraps onto a second line.
      expect(texts.find((t) => t.text.startsWith('Senior Backend'))).toMatchObject({ font: 'Times-Bold', size: 24 });
      expect(texts.find((t) => t.text === 'Priya Rao')).toMatchObject({ font: 'Helvetica-Bold', size: 12 });
      expect(texts.find((t) => t.text === 'pleased to offer you')).toMatchObject({ font: 'Helvetica-BoldOblique', size: 13 });
      expect(texts.find((t) => t.text === 'Dear ')?.x).toBeCloseTo(25 * MM, 1);
      expect(texts.map((t) => t.text)).toEqual(expect.arrayContaining(['Annual compensation', 'SAMPLE', 'Page 1 of 1']));
      // Nothing was saved.
      expect((await asA('get', `/onboarding/templates/${ids.formatted}`)).body.data.versions).toHaveLength(1);
    });

    it('fix the approved version: edits go to a new draft, and offers print the version they were made from', async () => {
      const approved = await asA('post', `/onboarding/templates/${ids.formatted}/approve`);
      const v1 = approved.body.data.versions[0];
      expect(v1).toMatchObject({ number: 1, status: 'APPROVED', document: DOCUMENT });

      const candidate = await asA('post', '/onboarding/candidates', { fullName: 'Rohan Mehta', email: `rohan.${SUFFIX}@candidate.test`, appliedPosition: 'Payroll Analyst' });
      await asA('post', `/onboarding/candidates/${candidate.body.data.id}/override`, { status: 'SELECTED', reason: 'Selected in an earlier process' });
      const offer = await asA('post', `/onboarding/candidates/${candidate.body.data.id}/offers`, offerInput({ templateVersionId: v1.id, jobTitle: 'Data Engineer' }));
      expect(offer.status).toBe(201);
      await asA('post', `/onboarding/offers/${offer.body.data.id}/submit`, { approverMemberIds: [approver.memberId] });

      // A new draft changes the wording; the approved version and the submitted offer don't change.
      const changed = { ...DOCUMENT, content: [{ type: 'paragraph', attrs: block, content: [text('Completely rewritten '), placeholder('candidate_name')] }] };
      const drafted = await asA('put', `/onboarding/templates/${ids.formatted}/draft`, { document: changed });
      expect(drafted.body.data.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'DRAFT'], [1, 'APPROVED']]);
      expect(drafted.body.data.versions[1].document).toEqual(DOCUMENT);
      await asA('post', `/onboarding/templates/${ids.formatted}/approve`);

      const pdf = await binary(asA('get', `/onboarding/offers/${offer.body.data.id}/pdf`));
      const texts = fonts(pdf.body);
      expect(texts.find((t) => t.text === 'Data Engineer')).toMatchObject({ font: 'Times-Bold', size: 24 });
      expect(texts.find((t) => t.text === 'Rohan Mehta')).toMatchObject({ font: 'Helvetica-Bold', size: 12 });
      expect(texts.some((t) => t.text.startsWith('Completely rewritten'))).toBe(false);
      const row = await prisma.rndtechnosoft_offers.findFirstOrThrow({ where: { id: offer.body.data.id } });
      expect(JSON.stringify(row.rendered_document)).toContain('Rohan Mehta');
      expect(row.rendered_body).toContain('Dear Rohan Mehta,');
    });

    it('still show plain-text versions as they were, and keep them printing as before', async () => {
      const legacy = (await asA('get', `/onboarding/templates/${ids.template}`)).body.data.versions.find((v: { status: string }) => v.status === 'APPROVED');
      expect(legacy.format).toBe('PLAIN');
      expect(legacy.document.content[1]).toMatchObject({ type: 'heading' });
      expect(JSON.stringify(legacy.document)).toContain('"key":"candidate_name"');
      const row = await prisma.rndtechnosoft_document_template_versions.findFirstOrThrow({ where: { id: legacy.id } });
      expect(row.body_document).toBeNull();
    });

    it('belong to their workspace only', async () => {
      expect((await asB('get', `/onboarding/templates/${ids.formatted}`)).status).toBe(404);
      expect((await asB('put', `/onboarding/templates/${ids.formatted}/draft`, { document: DOCUMENT })).status).toBe(404);
      expect((await asB('post', '/onboarding/templates/preview-pdf', { kind: 'OFFER_LETTER', document: DOCUMENT, letterheadId: ids.letterhead })).status).toBe(404);
      expect((await call('put', `/onboarding/templates/${ids.formatted}/draft`, viewer.token, { document: DOCUMENT })).status).toBe(403);
      expect((await call('post', `/onboarding/templates/${ids.formatted}/approve`, writer.token)).status).toBe(403);
    });
  });
});
