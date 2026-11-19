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
import { makePng } from './support/png';

/**
 * Employee documents: files are checked by their bytes and kept in private
 * storage, read back only through the API by the employee's own workspace;
 * replacing or removing keeps what was there; review is its own permission;
 * every change is in the employee's activity.
 */

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Documents-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe('Employee documents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const storageDir = path.join(os.tmpdir(), `employee-documents-${SUFFIX}`);
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN, storage: process.env.PRIVATE_STORAGE_DIR };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const tenants: Record<'A' | 'B', string> = { A: '', B: '' };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const get = (url: string, who: string) => request(app.getHttpServer()).get(`${API}${url}`).set(auth(who));
  const post = (url: string, who: string, body: object = {}) => request(app.getHttpServer()).post(`${API}${url}`).set(auth(who)).send(body);
  const upload = (url: string, who: string, file: Buffer, filename: string, fields: Record<string, string> = {}) => {
    const r = request(app.getHttpServer()).post(`${API}${url}`).set(auth(who)).attach('file', file, { filename });
    for (const [k, v] of Object.entries(fields)) r.field(k, v);
    return r;
  };
  const docs = (employee = ids.Asha) => `/employees/${employee}/documents`;

  async function register(key: 'A' | 'B') {
    const email = `docs-owner-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Docs ${key} ${SUFFIX}`, tenantCode: `DOC${key}${SUFFIX.toUpperCase()}`, email, password: PASSWORD, adminName: `Owner ${key}` });
    expect(r.status).toBe(201);
    tenants[key] = r.body.activeTenant.tenantId;
    tenantIds.push(tenants[key]);
    tokens[`Owner${key}`] = r.body.token;
  }

  async function member(key: string, permissions: string[]) {
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: tenants.A, role_code: `${key}_${SUFFIX}`.toUpperCase(), role_name: key } });
    const rows = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissions } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: rows.map((p) => ({ id: randomUUID(), tenant_id: tenants.A, role_id: roleId, permission_id: p.id })) });
    const email = `docs-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenants.A, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenants.A, tenant_member_id: memberId, role_id: roleId } });
    const r = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD });
    expect(r.status).toBe(200);
    tokens[key] = r.body.token;
  }

  async function employee(tenantId: string, key: string) {
    ids[key] = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id: ids[key], tenant_id: tenantId, employee_code: `${key.toUpperCase()}-${SUFFIX}`, first_name: key } });
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    process.env.PRIVATE_STORAGE_DIR = storageDir;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});
    await register('A');
    await register('B');
    await member('Clerk', ['people.view', 'people.documents.manage']);
    await member('Checker', ['people.view', 'people.documents.verify']);
    await member('Viewer', ['people.view']);
    await employee(tenants.A, 'Asha');
    await employee(tenants.A, 'Bala');
    await employee(tenants.B, 'Other');
  });

  afterAll(async () => {
    if (prisma) {
      const userRows = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = userRows.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      // Replacement links point at newer rows, so clear them before deleting.
      await prisma.rndtechnosoft_employee_documents.updateMany({ where: scope, data: { replaced_by_document_id: null } });
      await prisma.rndtechnosoft_employee_documents.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
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
  });

  let passport = '';

  it('uploads a document checked by its bytes, listed as pending verification', async () => {
    expect((await upload(docs(), 'Clerk', Buffer.from('MZ not a document'), 'virus.pdf', { category: 'IDENTITY', title: 'Passport' })).body.message).toMatch(/PDF, JPG or PNG/);
    expect((await upload(docs(), 'Clerk', PDF, 'passport.pdf', { category: 'PAYSLIP', title: 'Passport' })).status).toBe(400);
    expect((await upload(docs(), 'Clerk', PDF, 'passport.pdf', { category: 'IDENTITY' })).status).toBe(400);
    expect((await upload(docs(), 'Clerk', PDF, 'passport.pdf', { category: 'IDENTITY', title: 'Passport', issuedOn: '2025-01-01', expiresOn: '2024-01-01' })).status).toBe(400);
    expect((await post(docs(), 'Clerk', { category: 'IDENTITY', title: 'No file' })).body.message).toMatch(/Choose a file/);

    const r = await upload(docs(), 'Clerk', PDF, '../../etc/Passport scan.pdf', { category: 'IDENTITY', title: 'Passport', expiresOn: day(-1), description: 'Scanned copy' });
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject([{ category: 'IDENTITY', title: 'Passport', description: 'Scanned copy', status: 'PENDING_VERIFICATION', isExpired: true, filename: 'Passport scan.pdf', contentType: 'application/pdf', uploadedBy: 'Clerk' }]);
    passport = r.body.data[0].id;

    const row = await prisma.rndtechnosoft_employee_documents.findUniqueOrThrow({ where: { id: passport } });
    expect(row.storage_key.startsWith(`${tenants.A}/employee-documents/`)).toBe(true);
    expect(row.file_sha256).toHaveLength(64);
  });

  it('serves the file only to people who may see the employee, in this workspace', async () => {
    const asViewer = await get(`${docs()}/${passport}/file?download=1`, 'Viewer').buffer(true);
    expect(asViewer.status).toBe(200);
    expect(asViewer.headers['content-type']).toBe('application/pdf');
    expect(asViewer.headers['content-disposition']).toContain('attachment');
    expect(asViewer.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(asViewer.body as Buffer, PDF)).toBe(0);

    // Another employee's path, another workspace, a bad id: nothing.
    expect((await get(`${docs(ids.Bala)}/${passport}/file`, 'Viewer')).status).toBe(404);
    expect((await get(`${docs()}/${passport}/file`, 'OwnerB')).status).toBe(404);
    expect((await get(`${docs(ids.Other)}`, 'OwnerA')).status).toBe(404);
    expect((await get(`${docs()}/not-a-uuid/file`, 'Viewer')).status).toBe(400);
  });

  it('needs its own permissions to upload and to review', async () => {
    expect((await upload(docs(), 'Viewer', PDF, 'x.pdf', { category: 'OTHER', title: 'x' })).status).toBe(403);
    expect((await upload(docs(), 'Checker', PDF, 'x.pdf', { category: 'OTHER', title: 'x' })).status).toBe(403);
    expect((await post(`${docs()}/${passport}/verify`, 'Clerk')).status).toBe(403);
    expect((await post(`${docs()}/${passport}/remove`, 'Viewer', { reason: 'Mine now' })).status).toBe(403);
  });

  it('rejects with a reason, then verifies only a fresh upload', async () => {
    expect((await post(`${docs()}/${passport}/reject`, 'Checker', {})).status).toBe(400);
    const rejected = await post(`${docs()}/${passport}/reject`, 'Checker', { reason: 'The photo page is cut off' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'The photo page is cut off', reviewedBy: 'Checker' });
    expect((await post(`${docs()}/${passport}/verify`, 'Checker')).status).toBe(409);

    const replaced = await upload(`${docs()}/${passport}/replace`, 'Clerk', makePng(4, 4), 'passport-full.png');
    expect(replaced.status).toBe(201);
    expect(replaced.body.data).toHaveLength(1);
    const fresh = replaced.body.data[0];
    expect(fresh).toMatchObject({ title: 'Passport', category: 'IDENTITY', status: 'PENDING_VERIFICATION', contentType: 'image/png', filename: 'passport-full.png' });
    expect(fresh.id).not.toBe(passport);

    // The old file is still on record, pointing at its replacement, and can no longer be acted on.
    const old = await prisma.rndtechnosoft_employee_documents.findUniqueOrThrow({ where: { id: passport } });
    expect(old).toMatchObject({ replaced_by_document_id: fresh.id, document_status: 'REJECTED' });
    expect((await post(`${docs()}/${passport}/verify`, 'Checker')).status).toBe(404);

    const verified = await post(`${docs()}/${fresh.id}/verify`, 'Checker');
    expect(verified.body.data[0]).toMatchObject({ status: 'VERIFIED', reviewedBy: 'Checker', rejectionReason: null });
    passport = fresh.id;
  });

  it('removes a document with a reason, keeping its row and file', async () => {
    expect((await post(`${docs()}/${passport}/remove`, 'Clerk', { reason: 'x' })).status).toBe(400);
    const removed = await post(`${docs()}/${passport}/remove`, 'Clerk', { reason: 'Uploaded to the wrong employee' });
    expect(removed.status).toBe(200);
    expect(removed.body.data).toEqual([]);
    const row = await prisma.rndtechnosoft_employee_documents.findUniqueOrThrow({ where: { id: passport } });
    expect(row).toMatchObject({ removal_reason: 'Uploaded to the wrong employee' });
    expect(row.removed_at).not.toBeNull();
    expect((await get(`${docs()}/${passport}/file`, 'Viewer')).status).toBe(404);
  });

  it('records every step in the employee’s activity without file contents', async () => {
    const activity = await get(`/employees/${ids.Asha}/activity`, 'OwnerA');
    expect(activity.body.data.items.map((i: { label: string }) => i.label)).toEqual([
      'Document removed', 'Document verified', 'Document replaced', 'Document rejected', 'Document uploaded',
    ]);
    expect(activity.body.data.items[0].detail).toBe('Passport · Uploaded to the wrong employee');
    expect(activity.body.data.items[3].detail).toBe('Passport · The photo page is cut off');
  });
});
