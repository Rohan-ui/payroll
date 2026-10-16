import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { deleteCrmData } from './support/crm-cleanup';
import { inspectPdf } from './support/pdf-content';

/**
 * Documents & letterheads, shared by the organization: quotation and
 * appraisal letter templates beside offer letters, each with only its own
 * placeholders; offers choosing only offer letters; and quotations printed
 * with an approved quotation template, to people who may see the quotation.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Shared-Documents-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';

describe('Documents & letterheads', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const a = { tenantId: '', token: '' };
  const b = { tenantId: '', token: '' };
  const rep = { token: '' };
  const onboarder = { token: '' };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const binary = (req: request.Test) =>
    req.buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  const pdfText = (pdf: Buffer) => inspectPdf(pdf, 841.89).flatMap((p) => p.texts.map((t) => t.text)).join('\n');

  async function register(target: typeof a, label: string) {
    const email = `docs-${label.toLowerCase()}-${SUFFIX}@docs.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Docs ${label} ${SUFFIX}`, tenantCode: `DOC${label}${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    target.tenantId = r.body.activeTenant.tenantId;
    target.token = r.body.token;
    tenantIds.push(target.tenantId);
  }

  async function member(target: { token: string }, label: string, permissionCodes: string[]) {
    const email = `docs-${label.toLowerCase()}-${SUFFIX}@docs.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: label, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `R_${label.toUpperCase()}`, role_name: label, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    target.token = login.body.token;
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
    await register(a, 'A');
    await register(b, 'B');
    await member(rep, 'Rep', ['quotations.view', 'leads.view', 'leads.view_all']);
    await member(onboarder, 'Onboarder', ['onboarding.view']);

    const pipeline = (await asA('post', '/crm/masters/pipelines', { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true })).body.data.id;
    const stage = (await asA('post', '/crm/masters/stages', { pipeline_id: pipeline, name: 'New', sort_order: 1 })).body.data.id;
    const lead = await asA('post', '/crm/leads', { companyName: `Northwind ${SUFFIX}`, firstName: 'Anil', lastName: 'Mehta', email: `anil-${SUFFIX}@client.test`, pipelineId: pipeline, stageId: stage, state: 'Maharashtra', gstin: '27AAACN1234F1Z5' });
    expect(lead.status).toBe(201);
    ids.lead = lead.body.data.id;
    const quote = await asA('post', '/crm/quotations', { leadId: ids.lead, items: [{ description: 'Website design', quantity: 1, unitRate: '100000' }, { description: 'Annual maintenance', quantity: 2, unitRate: '25000.50' }], notes: 'Includes one year of support.' });
    expect(quote.status).toBe(201);
    ids.quotation = quote.body.data.id;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_document_template_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_document_templates.deleteMany({ where: scope });
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

  it('offers quotation and appraisal letter templates, each with only its own placeholders', async () => {
    const kinds = (await asA('get', '/documents/templates/placeholders')).body.data as { kind: string; available: boolean; placeholders: { key: string }[] }[];
    expect(kinds.filter((k) => k.available).map((k) => k.kind)).toEqual(['OFFER_LETTER', 'QUOTATION', 'APPRAISAL_LETTER']);
    expect(kinds.find((k) => k.kind === 'QUOTATION')?.placeholders.map((p) => p.key)).toContain('total_amount');

    const quotation = await asA('post', '/documents/templates', { kind: 'QUOTATION', name: 'Standard quotation' });
    expect(quotation.status).toBe(201);
    ids.quotationTemplate = quotation.body.data.id;
    const document = quotation.body.data.versions[0].document;
    expect(JSON.stringify(document)).toContain('compensationTable');
    expect(JSON.stringify(document)).toContain('"key":"quotation_number"');

    // An offer letter's placeholder means nothing on a quotation; an appraisal letter has no table.
    const wrong = await asA('put', `/documents/templates/${ids.quotationTemplate}/draft`, { title: 'Quote', body: 'Dear {{candidate_name}}' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.message).toContain('{{candidate_name}}');
    const appraisal = await asA('post', '/documents/templates', { kind: 'APPRAISAL_LETTER', name: 'Annual appraisal' });
    expect(appraisal.status).toBe(201);
    const table = await asA('put', `/documents/templates/${appraisal.body.data.id}/draft`, { document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }, { type: 'compensationTable' }] } });
    expect(table.status).toBe(400);
    expect(table.body.message).toContain('Only offer letters and quotations have a table');

    const sample = await binary(call('post', '/documents/templates/preview-pdf', a.token, { kind: 'QUOTATION', document }));
    expect(sample.status).toBe(200);
    const text = pdfText(sample.body);
    expect(text).toContain('Website design and development');
    expect(text).toContain('INR 1,77,000.00');
  });

  it('keeps document templates to people allowed, and offers to offer letters', async () => {
    expect((await call('get', '/documents/templates', onboarder.token)).status).toBe(403);
    expect((await call('post', '/documents/templates', rep.token, { kind: 'QUOTATION', name: 'x' })).status).toBe(403);
    // Drafting an offer lists offer letter templates only.
    const offerTemplates = await call('get', '/onboarding/templates', onboarder.token);
    expect(offerTemplates.status).toBe(200);
    expect(offerTemplates.body.data.every((t: { kind: string }) => t.kind === 'OFFER_LETTER')).toBe(true);
    expect((await call('get', `/documents/templates/${ids.quotationTemplate}`, b.token)).status).toBe(404);
    expect((await call('get', '/onboarding/letterheads', a.token)).status).toBe(404);
  });

  it('prints a quotation with its approved template (the standard wording before one), from the stored amounts', async () => {
    // Until a template is approved, it prints with the standard quotation wording.
    const before = await binary(call('get', `/crm/quotations/${ids.quotation}/pdf`, rep.token));
    expect(before.status).toBe(200);
    expect(before.headers['content-disposition']).toMatch(/^inline;/);
    expect(pdfText(before.body)).toContain('QUOTATION');
    expect(pdfText(before.body)).toContain('INR 1,77,001.18');

    await asA('post', `/documents/templates/${ids.quotationTemplate}/approve`);
    const choices = (await call('get', '/crm/quotations/document-templates', rep.token)).body.data;
    expect(choices).toEqual([expect.objectContaining({ id: ids.quotationTemplate, name: 'Standard quotation', versionNumber: 1 })]);

    const pdf = await binary(call('get', `/crm/quotations/${ids.quotation}/pdf?download=1`, rep.token));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''.+\.pdf$/);
    const text = pdfText(pdf.body);
    const stored = await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id: ids.quotation } });
    expect(text).toContain(stored.quotation_number);
    expect(text).toContain(`Northwind ${SUFFIX}`);
    expect(text).toContain('Anil Mehta');
    expect(text).toContain('Annual maintenance');
    // 100000 + 2 × 25000.50 = 150001.00; 9% + 9% GST = 27000.18; total 177001.18.
    expect(text).toContain('INR 1,50,001.00');
    expect(text).toContain('INR 1,77,001.18');
    expect(text).toContain('Includes one year of support.');

    expect((await call('get', `/crm/quotations/${ids.quotation}/pdf?templateId=${randomUUID()}`, rep.token)).status).toBe(400);
    expect((await call('get', `/crm/quotations/${ids.quotation}/pdf`, b.token)).status).toBe(404);
    expect((await call('get', `/crm/quotations/${ids.quotation}/pdf`, onboarder.token)).status).toBe(403);
  });

  it('records approvals as document template approvals', async () => {
    const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, entity_id: ids.quotationTemplate }, select: { action_code: true } });
    expect(audit.map((x) => x.action_code)).toEqual(['DOCUMENT_TEMPLATE_APPROVED']);
  });
});
