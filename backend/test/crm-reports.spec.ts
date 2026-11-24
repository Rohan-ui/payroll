import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * CRM reports are worked out on the server from every lead in the sales
 * pipelines, not from the first page the browser happens to hold: open,
 * won and lost, the weighted forecast, stages, sources, assignees and wins by
 * month. A member who sees only their own leads gets only their own figures,
 * and another workspace's leads never count.
 */

jest.setTimeout(120_000);

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Crm-Reports-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Person = { token: string; email: string; memberId: string; userId: string };

describe('CRM reports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const owner = { tenantId: '', token: '', email: `rep-owner-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const other = { tenantId: '', token: '', email: `rep-other-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const seller: Person = { token: '', email: `rep-seller-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const staff: Person = { token: '', email: `rep-staff-${SUFFIX}@lead.test`, memberId: '', userId: '' };

  const call = (url: string, token: string) => request(app.getHttpServer()).get(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
  const post = (url: string, token: string, body: object) => request(app.getHttpServer()).post(`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`).send(body);

  async function register(workspace: typeof owner, label: string) {
    userEmails.push(workspace.email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Reports ${label} ${SUFFIX}`, tenantCode: `REP${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(r.status).toBe(201);
    workspace.tenantId = r.body.activeTenant.tenantId;
    workspace.token = r.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, label: string, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: person.userId, email: person.email, display_name: label, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: owner.tenantId, role_code: `R_${label.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${label}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: owner.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: owner.tenantId, user_id: person.userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: owner.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: owner.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
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

    await register(owner, 'A');
    await register(other, 'B');
    await addMember(seller, 'Sana Seller', ['leads.view', 'analytics.view']);
    await addMember(staff, 'Stan Staff', ['leads.view']);

    for (const workspace of [owner, other]) {
      const pipeline = await post('/crm/pipelines', workspace.token, { name: 'Sales', code: `sales_${SUFFIX}`, isDefault: true });
      expect(pipeline.status).toBe(201);
      const stage = await post('/crm/masters/stages', workspace.token, { pipeline_id: pipeline.body.data.id, name: 'New', sort_order: 1 });
      expect(stage.status).toBe(201);
      await prisma.rndtechnosoft_crm_stages.update({ where: { id: stage.body.data.id }, data: { stage_probability: 40 } });
    }

    const lead = async (token: string, company: string, data: Record<string, unknown>) => {
      const created = await post('/crm/leads', token, { companyName: `${company} ${SUFFIX}`, firstName: 'Asha', email: `${company.toLowerCase().replace(/\W/g, '')}-${SUFFIX}@client.test` });
      expect(created.status).toBe(201);
      await prisma.rndtechnosoft_crm_leads.update({ where: { id: created.body.data.id }, data });
    };
    await lead(owner.token, 'Open Seller', { budget_amount: '100000', assigned_tenant_member_id: seller.memberId });
    await lead(owner.token, 'Open Owner', { budget_amount: '50000' });
    await lead(owner.token, 'Won Owner', { budget_amount: '200000', is_won: true, closed_at: new Date() });
    await lead(owner.token, 'Lost Owner', { budget_amount: '10000', is_lost: true, closed_at: new Date() });
    await lead(other.token, 'Other Workspace', { budget_amount: '999999' });
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } })).map((u) => u.id);
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
    }
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
    await app?.close();
  });

  it('totals every lead of the workspace on the server', async () => {
    const r = await call('/crm/reports/summary', owner.token);
    expect([r.status, r.body.message]).toEqual([200, undefined]);
    expect(r.body.data.totals).toEqual({
      totalLeads: 4, newThisMonth: 4, newLastMonth: 0, averageDaysToWin: 0,
      openCount: 2, openValue: '150000.00', weightedForecast: '60000.00',
      wonCount: 1, wonValue: '200000.00', lostCount: 1, winRate: 50, averageWon: '200000.00',
    });
    expect(r.body.data.stages).toEqual([expect.objectContaining({ name: 'New', pipelineName: 'Sales', count: 2, value: '150000.00' })]);
    expect(r.body.data.sources).toEqual([{ name: 'No source', leads: 4, won: 1, value: '360000.00' }]);
    expect(r.body.data.assignees).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Sana Seller', open: 1, openValue: '100000.00', won: 0 })]));
    expect(r.body.data.wonByMonth).toHaveLength(12);
    expect(r.body.data.wonByMonth[11]).toMatchObject({ won: 1, value: '200000.00', created: 4 });
  });

  it('gives a member who sees only their own leads only their own figures, and nothing to someone without reports', async () => {
    const mine = (await call('/crm/reports/summary', seller.token)).body.data;
    expect(mine.totals).toMatchObject({ openCount: 1, openValue: '100000.00', wonCount: 0, lostCount: 0, winRate: null, averageWon: null });
    expect(mine.stages[0]).toMatchObject({ count: 1, value: '100000.00' });
    expect((await call('/crm/reports/summary', staff.token)).status).toBe(403);
    expect((await call('/crm/reports/summary', other.token)).body.data.totals).toMatchObject({ openCount: 1, openValue: '999999.00' });
  });

  it('exports the same figures as a workbook, the member’s own only, and audits it', async () => {
    const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); };
    const r = await call('/crm/reports/export', seller.token).buffer(true).parse(binary);
    expect(r.status).toBe(200);
    expect(r.headers['content-disposition']).toContain('crm-report-');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(r.body as unknown as ArrayBuffer);
    expect(book.worksheets.map((w) => w.name)).toEqual(['Summary', 'Open deals by stage', 'By source', 'By assignee', 'By month']);
    const summary = book.getWorksheet('Summary');
    expect(summary?.getRow(2).values).toEqual([undefined, 'Leads', 1]);
    expect(summary?.getRow(6).values).toEqual([undefined, 'Open deals', 1]);
    expect(summary?.getRow(7).values).toEqual([undefined, 'Open pipeline value (₹)', 100000]);
    expect((await call('/crm/reports/export', staff.token)).status).toBe(403);
    expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: owner.tenantId, action_code: 'CRM_REPORT_EXPORTED' } })).toBe(1);
  });
});
