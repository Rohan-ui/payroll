import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as ExcelJS from 'exceljs';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { registerBodyParsers } from '@/common/http/body-parsers';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Spreadsheet lead import over HTTP: the destination is chosen explicitly;
 * Client Outreach imports are enrolled in the cadence and stay off the sales
 * board until converted; sales imports land in the chosen pipeline and stage;
 * every row is checked by the server, duplicates are skipped, and pipelines,
 * stages and permissions are enforced per workspace.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Lead-Import-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put';
type Person = { token: string; email: string; memberId: string; userId: string };

describe('CRM lead import', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const ravi = { tenantId: '', token: '', email: `ravi-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const other = { tenantId: '', token: '', email: `other-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const neha: Person = { token: '', email: `neha-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const salesOnly: Person = { token: '', email: `sales-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const viewer: Person = { token: '', email: `viewer-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const accountant: Person = { token: '', email: `accountant-${SUFFIX}@import.test`, memberId: '', userId: '' };
  const ids = { sales: '', salesNew: '', salesQualified: '', salesWon: '', outreach: '', outreachStage: '', otherSales: '', otherSalesStage: '', otherOutreach: '', sourceId: '' };

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const email = (name: string) => `${name}-${SUFFIX}@client.test`;
  const row = (rowNumber: number, name: string, extra: Record<string, string> = {}) => ({
    rowNumber, companyName: `${name} Industries ${SUFFIX}`, firstName: name, email: email(name.toLowerCase()), phone: '98200 12345', ...extra,
  });
  const importInto = (token: string, body: Record<string, unknown>) => call('post', '/crm/leads/import', token, body);

  async function register(workspace: typeof ravi, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Import ${label} ${SUFFIX}`, tenantCode: `IMP${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, label: string, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: person.userId, email: person.email, display_name: label, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: ravi.tenantId, role_code: `R_${label.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${label}`, is_system_role: false } });
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

  async function salesPipeline(token: string, name: string) {
    const pipeline = await call('post', '/crm/masters/pipelines', token, { name, code: `${name.replace(/\W/g, '_')}_${SUFFIX}`, pipeline_kind: 'SALES' });
    expect(pipeline.status).toBe(201);
    return pipeline.body.data.id as string;
  }
  async function stage(token: string, pipelineId: string, name: string, sortOrder: number, extra: Record<string, unknown> = {}) {
    const created = await call('post', '/crm/masters/stages', token, { pipeline_id: pipelineId, name, sort_order: sortOrder, ...extra });
    expect(created.status).toBe(201);
    return created.body.data.id as string;
  }
  async function outreachPipeline(token: string, name: string) {
    const pipeline = await call('post', '/crm/masters/pipelines', token, { name, code: `${name.replace(/\W/g, '_')}_${SUFFIX}`, pipeline_kind: 'OUTREACH' });
    expect(pipeline.status).toBe(201);
    return pipeline.body.data.id as string;
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    // The body parsers main.ts registers, so the import route's larger limit is what is tested.
    const nest = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    registerBodyParsers(nest);
    app = nest;
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    await register(ravi, 'A');
    await register(other, 'B');
    await addMember(neha, 'Neha Mishra', ['leads.view', 'leads.create', 'outreach.view', 'outreach.create']);
    await addMember(salesOnly, 'Sales Only', ['leads.view', 'leads.create']);
    await addMember(viewer, 'Lead Viewer', ['leads.view', 'outreach.view']);
    await addMember(accountant, 'Accountant', ['payslips.view']);

    ids.sales = await salesPipeline(ravi.token, 'Sales');
    await call('put', '/crm/masters/pipelines', ravi.token, { id: ids.sales, name: 'Sales', code: `Sales_${SUFFIX}`, is_default: 1 });
    ids.salesNew = await stage(ravi.token, ids.sales, 'New', 1);
    ids.salesQualified = await stage(ravi.token, ids.sales, 'Qualified', 2);
    ids.salesWon = await stage(ravi.token, ids.sales, 'Won', 3, { is_won: 1 });
    ids.outreach = await outreachPipeline(ravi.token, 'Manufacturing Outreach');
    ids.outreachStage = (await prisma.rndtechnosoft_crm_stages.findFirstOrThrow({ where: { pipeline_id: ids.outreach } })).id;
    ids.otherSales = await salesPipeline(other.token, 'Other Sales');
    ids.otherSalesStage = await stage(other.token, ids.otherSales, 'New', 1);
    ids.otherOutreach = await outreachPipeline(other.token, 'Other Outreach');
    const source = await call('post', '/crm/masters/sources', ravi.token, { name: 'LinkedIn' });
    expect(source.status).toBe(201);
    ids.sourceId = source.body.data.id;
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

  describe('Client Outreach pipelines in CRM Masters', () => {
    it('gives a new outreach pipeline its one stage and never makes it the default', async () => {
      const stages = await prisma.rndtechnosoft_crm_stages.findMany({ where: { pipeline_id: ids.outreach } });
      expect(stages.map((s) => s.name)).toEqual(['In cadence']);
      const asDefault = await call('post', '/crm/masters/pipelines', ravi.token, { name: 'Default Outreach', code: `DEF_${SUFFIX}`, pipeline_kind: 'OUTREACH', is_default: true });
      expect(asDefault.status).toBe(400);
      const madeDefault = await call('put', '/crm/masters/pipelines', ravi.token, { id: ids.outreach, name: 'Manufacturing Outreach', is_default: 1 });
      expect(madeDefault.status).toBe(400);
      expect(madeDefault.body.message).toContain('cannot be the default');
      const badKind = await call('post', '/crm/masters/pipelines', ravi.token, { name: 'Odd', pipeline_kind: 'MARKETING' });
      expect(badKind.status).toBe(400);
    });

    it('places a lead added without a pipeline in the default sales pipeline, never an outreach one', async () => {
      await prisma.rndtechnosoft_crm_pipelines.update({ where: { id: ids.sales }, data: { is_default: false } });
      try {
        const lead = await call('post', '/crm/leads', ravi.token, { companyName: `Manual ${SUFFIX}`, firstName: 'Manu', email: email('manual') });
        expect(lead.status).toBe(201);
        expect(lead.body.data.pipeline_id).toBe(ids.sales);
      } finally {
        await prisma.rndtechnosoft_crm_pipelines.update({ where: { id: ids.sales }, data: { is_default: true } });
      }
    });
  });

  describe('import options', () => {
    it('lists this workspace’s pipelines by type with their open stages, and whether the member may use Client Outreach', async () => {
      const options = await call('get', '/crm/leads/import/options', ravi.token);
      expect(options.status).toBe(200);
      const byId = Object.fromEntries(options.body.data.pipelines.map((p: { id: string }) => [p.id, p]));
      expect(Object.keys(byId).sort()).toEqual([ids.sales, ids.outreach].sort());
      expect(byId[ids.sales]).toMatchObject({ name: 'Sales', kind: 'SALES', isDefault: true, stages: [{ id: ids.salesNew, name: 'New' }, { id: ids.salesQualified, name: 'Qualified' }] });
      expect(byId[ids.outreach]).toMatchObject({ kind: 'OUTREACH', isDefault: false, stages: [{ id: ids.outreachStage, name: 'In cadence' }] });
      expect(options.body.data.cadence).toMatchObject({ name: '30-Day Multi-Touch SOP', days: 30 });
      expect(options.body.data.cadence.steps).toBeGreaterThan(0);
      expect(options.body.data.canImportToOutreach).toBe(true);
      expect((await call('get', '/crm/leads/import/options', salesOnly.token)).body.data.canImportToOutreach).toBe(false);
      expect((await call('get', '/crm/leads/import/options', viewer.token)).status).toBe(403);
    });
  });

  describe('into Client Outreach', () => {
    const rows = [
      row(2, 'Asha', {
        lastName: 'Kulkarni', designation: 'Director', phone: '9820012345', alternatePhone: '9820099999', whatsappNumber: '9820012345',
        alternateEmail: 'asha.alt@client.test', industry: 'Packaging', subIndustry: 'Corrugated Boxes', city: 'Pune', state: 'Maharashtra',
        country: '+91 (🇮🇳 India)', address: 'Plot 4, MIDC Bhosari', postalCode: '411026', websiteUrl: 'https://asha.example',
        websiteStatus: 'Outdated', linkedinUrl: 'https://linkedin.com/in/asha', linkedinCompanyUrl: 'https://linkedin.com/company/asha',
        leadSource: 'linkedin', assignedTo: `neha-${SUFFIX}@import.test`, budgetAmount: '₹1,50,000.50', requirementBrief: 'New website',
        internalNotes: 'Met at expo\nDate: 15-09-2026',
      }),
      row(3, 'Bala', { country: 'United Arab Emirates', phone: '501234567', leadSource: 'Cold Call', assignedTo: 'Nobody Here', budgetAmount: 'about 2 lakh' }),
      { rowNumber: 4, companyName: `No Name Co ${SUFFIX}`, email: email('noname') },
      { ...row(5, 'Asha'), companyName: 'Repeat of row 2' },
      row(6, 'Chirag', { email: 'not-an-email' }),
    ];

    it('previews without saving anything', async () => {
      const preview = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, dryRun: true, fileName: 'BDM.xlsx', rows });
      expect(preview.status).toBe(200);
      expect(preview.body.data.summary).toEqual({ processed: 5, ready: 2, imported: 0, duplicates: 1, failed: 2, enrolled: 0, withWarnings: 1 });
      expect(preview.body.data.pipeline).toEqual({ id: ids.outreach, name: 'Manufacturing Outreach' });
      expect(preview.body.data.cadence).toMatchObject({ name: 'Manufacturing Outreach' });
      expect(preview.body.data.cadence.steps).toBeGreaterThan(0);
      const byRow = Object.fromEntries(preview.body.data.rows.map((r: { rowNumber: number }) => [r.rowNumber, r]));
      expect(byRow[4]).toMatchObject({ outcome: 'FAILED', reasons: ['Missing phone.'] });
      expect(byRow[5]).toMatchObject({ outcome: 'DUPLICATE', reasons: ['Same email as row 2 of this file.'] });
      expect(byRow[6]).toMatchObject({ outcome: 'FAILED', reasons: ['"not-an-email" is not a valid email address.'] });
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { tenant_id: ravi.tenantId, pipeline_id: ids.outreach } })).toBe(0);
    });

    it('imports the valid rows enrolled in the cadence, with every mapped value stored', async () => {
      const imported = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, fileName: 'BDM.xlsx', rows });
      expect(imported.status).toBe(200);
      expect(imported.body.data.summary).toEqual({ processed: 5, ready: 0, imported: 2, duplicates: 1, failed: 2, enrolled: 2, withWarnings: 1 });
      expect(imported.body.message).toBe('Imported 2 leads; 1 duplicate skipped; 2 rows failed');

      const asha = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, email: email('asha') } });
      expect(asha).toMatchObject({
        pipeline_id: ids.outreach, stage_id: ids.outreachStage, temperature: 'COLD',
        last_name: 'Kulkarni', designation: 'Director', phone: '+91 9820012345', alternate_phone: '+91 9820099999', whatsapp_number: '+91 9820012345',
        alternate_email: 'asha.alt@client.test', industry: 'Packaging', sub_industry: 'Corrugated Boxes', city: 'Pune', state: 'Maharashtra',
        country_code: 'IN', address: 'Plot 4, MIDC Bhosari', postal_code: '411026', website_url: 'https://asha.example', website_status: 'Outdated',
        linkedin_url: 'https://linkedin.com/in/asha', linkedin_company_url: 'https://linkedin.com/company/asha', source_id: ids.sourceId,
        assigned_tenant_member_id: neha.memberId, requirement_brief: 'New website', internal_notes: 'Met at expo\nDate: 15-09-2026',
      });
      expect(asha.budget_amount.toString()).toBe('150000.5');
      expect((asha.custom_attributes as { cadence: Record<string, unknown> }).cadence).toMatchObject({ status: 'ACTIVE', funnelName: 'Manufacturing Outreach', completedSteps: [] });

      const bala = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, email: email('bala') } });
      expect(bala).toMatchObject({ country_code: 'AE', phone: '+971 501234567', source_id: null, assigned_tenant_member_id: ravi.memberId });
      expect(bala.budget_amount.toString()).toBe('0');
      const balaRow = imported.body.data.rows.find((r: { rowNumber: number }) => r.rowNumber === 3);
      expect(balaRow.warnings).toEqual([
        'Budget "about 2 lakh" is not an amount, so it was not imported.',
        'Lead source "Cold Call" is not in CRM Masters → Lead Sources, so it was left blank.',
        '"Nobody Here" is not a team member, so the lead was assigned to you.',
      ]);

      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: asha.id, title: 'Lead Created' } });
      expect(activity.description).toBe('Lead account created via spreadsheet import (BDM.xlsx) into Client Outreach: Manufacturing Outreach');
      const audit = await prisma.rndtechnosoft_crm_audit_logs.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, action_type: 'IMPORT_LEADS' } });
      expect(audit.changes_diff).toMatchObject({ destination: 'CLIENT_OUTREACH', pipeline_id: ids.outreach, imported: 2, duplicates: 1, failed: 2 });
    });

    it('keeps outreach imports off the sales board and counts them in Client Outreach from the database', async () => {
      const board = await call('get', '/crm/leads?excludeOutreach=true&limit=100', ravi.token);
      const boardEmails = board.body.data.leads.map((l: { email: string }) => l.email);
      expect(boardEmails).not.toContain(email('asha'));
      expect(boardEmails).not.toContain(email('bala'));
      const cadence = await call('get', '/crm/cadence', ravi.token);
      expect(cadence.status).toBe(200);
      expect(cadence.body.data.stats.activeCount).toBe(2);
    });

    it('skips rows whose email is already a lead, whatever its letter case', async () => {
      const again = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, rows: [row(2, 'ASHA', { email: email('asha').toUpperCase() })] });
      expect(again.body.data.summary).toMatchObject({ imported: 0, duplicates: 1 });
      expect(again.body.data.rows[0].reasons[0]).toMatch(/^A lead with this email already exists \(LD-/);
    });

    it('moves an outreach lead to sales only through Convert Opp, and only into a sales pipeline', async () => {
      const asha = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, email: email('asha') } });
      const intoOutreach = await call('post', '/crm/cadence', ravi.token, { action: 'CONVERT_OPPORTUNITY', leadId: asha.id, pipelineId: ids.outreach });
      expect(intoOutreach.status).toBe(400);
      const converted = await call('post', '/crm/cadence', ravi.token, { action: 'CONVERT_OPPORTUNITY', leadId: asha.id, pipelineId: ids.sales, stageId: ids.salesQualified });
      expect(converted.status).toBe(201);
      const moved = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: asha.id } });
      expect(moved).toMatchObject({ pipeline_id: ids.sales, stage_id: ids.salesQualified });
      const board = await call('get', '/crm/leads?excludeOutreach=true&limit=100', ravi.token);
      expect(board.body.data.leads.map((l: { email: string }) => l.email)).toContain(email('asha'));
    });

    it('imports into the 30-day SOP itself, enrolled like every other Client Outreach lead, with no outreach pipeline needed', async () => {
      const preview = await importInto(neha.token, { destination: 'CLIENT_OUTREACH', dryRun: true, rows: [row(2, 'Mona')] });
      expect(preview.status).toBe(200);
      expect(preview.body.data.cadence).toMatchObject({ name: '30-Day Multi-Touch SOP' });
      const imported = await importInto(neha.token, { destination: 'CLIENT_OUTREACH', fileName: 'BDM.xlsx', rows: [row(2, 'Mona')] });
      expect(imported.body.data.summary).toMatchObject({ imported: 1, enrolled: 1 });
      const mona = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, email: email('mona') } });
      // Where leads added to Client Outreach have always waited: the default sales pipeline's first stage, kept off the board by the cadence.
      expect(mona).toMatchObject({ pipeline_id: ids.sales, stage_id: ids.salesNew, temperature: 'COLD' });
      expect((mona.custom_attributes as { cadence: Record<string, unknown> }).cadence).toMatchObject({ status: 'ACTIVE', funnelName: 'RND Gold Funnel' });
      const board = await call('get', '/crm/leads?excludeOutreach=true&limit=100', ravi.token);
      expect(board.body.data.leads.map((l: { email: string }) => l.email)).not.toContain(email('mona'));
      const cadence = await call('get', `/crm/cadence?search=${encodeURIComponent(email('mona'))}`, ravi.token);
      expect(cadence.body.data.stats).toMatchObject({ totalEnrolled: 1, activeCount: 1 });
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: mona.id, title: 'Lead Created' } });
      expect(activity.description).toBe('Lead account created via spreadsheet import (BDM.xlsx) into Client Outreach: 30-Day Multi-Touch SOP');
    });

    it('still needs outreach.create to import into the SOP', async () => {
      expect((await importInto(salesOnly.token, { destination: 'CLIENT_OUTREACH', rows: [row(2, 'Nina')] })).status).toBe(403);
    });

    it('does not change the type of a pipeline that holds leads', async () => {
      const changed = await call('put', '/crm/masters/pipelines', ravi.token, { id: ids.outreach, name: 'Manufacturing Outreach', pipeline_kind: 'SALES' });
      expect(changed.status).toBe(409);
    });
  });

  describe('who the leads are assigned to', () => {
    it('offers the team members leads can go to, with the person importing chosen by default', async () => {
      const options = (await call('get', '/crm/leads/import/options', ravi.token)).body.data;
      expect(options.currentMemberId).toBe(ravi.memberId);
      const byId = Object.fromEntries(options.assignees.map((a: { id: string; eligible: boolean }) => [a.id, a.eligible]));
      // Every active member is listed; those who can't view leads can't be chosen.
      expect(byId).toEqual({ [ravi.memberId]: true, [neha.memberId]: true, [salesOnly.memberId]: true, [viewer.memberId]: true, [accountant.memberId]: false });
    });

    it('assigns to the person importing when no one is chosen', async () => {
      const imported = await importInto(salesOnly.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, dryRun: true, rows: [row(2, 'Omar')] });
      expect(imported.body.data.assignee).toEqual({ id: salesOnly.memberId, name: 'Sales Only' });
    });

    it('assigns to the chosen member, unless a row names another eligible member', async () => {
      const imported = await importInto(ravi.token, {
        destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, assigneeMemberId: neha.memberId,
        rows: [row(2, 'Pia'), row(3, 'Quinn', { assignedTo: 'Sales Only' }), row(4, 'Rhea', { assignedTo: 'Somebody Else' })],
      });
      expect(imported.body.data.assignee).toEqual({ id: neha.memberId, name: 'Neha Mishra' });
      expect(imported.body.data.summary).toMatchObject({ imported: 3 });
      expect(imported.body.data.rows[2].warnings).toEqual(['"Somebody Else" is not a team member, so the lead was assigned to Neha Mishra.']);
      const owners = Object.fromEntries((await prisma.rndtechnosoft_crm_leads.findMany({
        where: { email: { in: [email('pia'), email('quinn'), email('rhea')] } }, select: { email: true, assigned_tenant_member_id: true },
      })).map((l) => [l.email, l.assigned_tenant_member_id]));
      expect(owners).toEqual({ [email('pia')]: neha.memberId, [email('quinn')]: salesOnly.memberId, [email('rhea')]: neha.memberId });
    });

    it('refuses a member of another workspace, and saves nothing', async () => {
      const refused = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, assigneeMemberId: other.memberId, rows: [row(2, 'Sana')] });
      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe('That team member is not in this workspace.');
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { email: email('sana') } })).toBe(0);
      const cannotView = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, assigneeMemberId: accountant.memberId, rows: [row(2, 'Sana')] });
      expect(cannotView.status).toBe(400);
      expect(cannotView.body.message).toBe('Accountant\'s role can\'t view leads, so leads can\'t be assigned to them. Give their role the "View leads" permission first.');
    });
  });

  describe('what a row needs', () => {
    it('imports a row with a company, email and phone and no contact name, with its phone numbers normalised', async () => {
      const imported = await importInto(ravi.token, {
        destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew,
        rows: [
          { rowNumber: 2, companyName: `Nameless ${SUFFIX}`, email: email('nameless'), phone: '919825012345', alternatePhone: '079 2650 1234' },
          { rowNumber: 3, companyName: `Two Numbers ${SUFFIX}`, email: email('twonumbers'), phone: '097277 06665 / 097277 06666 (office)' },
          { rowNumber: 4, companyName: `No Phone ${SUFFIX}`, email: email('nophone'), phone: 'No wp' },
        ],
      });
      expect(imported.body.data.summary).toMatchObject({ imported: 2, failed: 1 });
      expect(imported.body.data.rows[2]).toMatchObject({ outcome: 'FAILED', reasons: ['"No wp" is not a phone number.'] });
      const nameless = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { email: email('nameless') } });
      expect(nameless).toMatchObject({ first_name: null, phone: '+91 9825012345', alternate_phone: '+91 7926501234', whatsapp_number: '+91 9825012345' });
      const two = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { email: email('twonumbers') } });
      expect(two).toMatchObject({ phone: '+91 9727706665', alternate_phone: '+91 9727706666', internal_notes: 'Phone: 097277 06665 / 097277 06666 (office)' });
      // A nameless lead still opens and can be marked won (its email is the client's contact).
      expect((await call('get', `/crm/leads/${nameless.id}`, ravi.token)).status).toBe(200);
      const won = await call('post', `/crm/leads/${nameless.id}/convert-won`, ravi.token);
      expect(won.status).toBe(201);
      const client = await prisma.rndtechnosoft_crm_clients.findFirstOrThrow({ where: { created_from_lead_id: nameless.id } });
      expect(client.contact_person).toBe(email('nameless'));
    });

    it('still needs a first name for a lead added by hand', async () => {
      const response = await call('post', '/crm/leads', ravi.token, { companyName: `Manual Nameless ${SUFFIX}`, email: email('manualnameless') });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('A lead needs a first name.');
    });

    it('exports the lead’s own values, including secondary email, alternate phone and personal LinkedIn', async () => {
      const response = await call('get', `/crm/leads/export?search=${encodeURIComponent(email('asha'))}`, ravi.token).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const sheet = workbook.worksheets[0];
      const headers = (sheet.getRow(1).values as unknown[]).slice(1);
      const rows: Record<string, unknown>[] = [];
      sheet.eachRow((r, n) => { if (n > 1) rows.push(Object.fromEntries(headers.map((h, i) => [String(h), r.getCell(i + 1).value ?? '']))); });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        'Company Name *': `Asha Industries ${SUFFIX}`, 'Email *': email('asha'), 'Secondary Email': 'asha.alt@client.test',
        'Country Code *': '+91', Phone: '9820012345', 'Alternate Phone': '9820099999', 'Personal LinkedIn URL': 'https://linkedin.com/in/asha',
        'LinkedIn Company URL': 'https://linkedin.com/company/asha', Country: 'India', 'Website Status': 'Outdated',
        'Assigned To': 'Neha Mishra', 'Lead Source': 'LinkedIn', Designation: 'Director', 'Industry *': 'Packaging',
      });
    });
  });

  describe('into a sales pipeline', () => {
    it('puts the rows in the chosen pipeline and stage without enrolling them', async () => {
      const imported = await importInto(salesOnly.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesQualified, rows: [row(2, 'Divya'), row(3, 'Esha')] });
      expect(imported.status).toBe(200);
      expect(imported.body.data.summary).toMatchObject({ imported: 2, enrolled: 0 });
      expect(imported.body.data.cadence).toBeNull();
      const divya = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: ravi.tenantId, email: email('divya') } });
      expect(divya).toMatchObject({ pipeline_id: ids.sales, stage_id: ids.salesQualified, temperature: 'WARM', custom_attributes: null, assigned_tenant_member_id: salesOnly.memberId });
      const board = await call('get', '/crm/leads?excludeOutreach=true&limit=100', ravi.token);
      expect(board.body.data.leads.map((l: { email: string }) => l.email)).toContain(email('divya'));
      const cadence = await call('get', `/crm/cadence?search=${encodeURIComponent(email('divya'))}`, ravi.token);
      expect(cadence.body.data.stats.totalEnrolled).toBe(0);
    });

    it('finds the assignee by name with a role in brackets, or by a first name only one member has', async () => {
      const imported = await importInto(ravi.token, {
        destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew,
        rows: [row(2, 'Kiran', { assignedTo: 'Neha Mishra (BDM – Packaging)' }), row(3, 'Lata', { assignedTo: 'neha' })],
      });
      expect(imported.body.data.summary).toMatchObject({ imported: 2, withWarnings: 0 });
      const owners = await prisma.rndtechnosoft_crm_leads.findMany({ where: { email: { in: [email('kiran'), email('lata')] } }, select: { assigned_tenant_member_id: true } });
      expect(owners.map((o) => o.assigned_tenant_member_id)).toEqual([neha.memberId, neha.memberId]);
    });

    it('refuses a stage outside the pipeline, a closing stage, or no stage', async () => {
      const base = { destination: 'SALES_PIPELINE', pipelineId: ids.sales, rows: [row(2, 'Farah')] };
      expect((await importInto(ravi.token, { ...base, stageId: ids.outreachStage })).status).toBe(400);
      const won = await importInto(ravi.token, { ...base, stageId: ids.salesWon });
      expect(won.status).toBe(400);
      expect(won.body.message).toContain('not an open stage');
      expect((await importInto(ravi.token, base)).status).toBe(400);
    });
  });

  describe('destination and pipeline checks', () => {
    it('needs an explicit destination', async () => {
      const response = await importInto(ravi.token, { pipelineId: ids.outreach, rows: [row(2, 'Gita')] });
      expect(response.status).toBe(400);
      const salesWithoutPipeline = await importInto(ravi.token, { destination: 'SALES_PIPELINE', stageId: ids.salesNew, rows: [row(2, 'Gita')] });
      expect(salesWithoutPipeline.status).toBe(400);
    });

    it('refuses a pipeline of the other kind', async () => {
      const salesAsOutreach = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.sales, rows: [row(2, 'Gita')] });
      expect(salesAsOutreach.status).toBe(400);
      expect(salesAsOutreach.body.message).toContain('is a sales pipeline');
      const outreachAsSales = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.outreach, stageId: ids.outreachStage, rows: [row(2, 'Gita')] });
      expect(outreachAsSales.status).toBe(400);
      expect(outreachAsSales.body.message).toContain('is a Client Outreach pipeline');
    });

    it('treats another workspace’s pipeline or stage as not existing', async () => {
      const unknown = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: randomUUID(), rows: [row(2, 'Gita')] });
      const foreignOutreach = await importInto(ravi.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.otherOutreach, rows: [row(2, 'Gita')] });
      const foreignSales = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.otherSales, stageId: ids.otherSalesStage, rows: [row(2, 'Gita')] });
      const foreignStage = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.otherSalesStage, rows: [row(2, 'Gita')] });
      for (const response of [unknown, foreignOutreach, foreignSales]) {
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(unknown.body.message);
      }
      expect(foreignStage.status).toBe(400);
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { email: email('gita') } })).toBe(0);
    });

    it('does not assign leads to a member of another workspace', async () => {
      const imported = await importInto(ravi.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, rows: [row(2, 'Hari', { assignedTo: other.email })] });
      expect(imported.body.data.rows[0].warnings).toEqual([`"${other.email}" is not a team member, so the lead was assigned to you.`]);
      const hari = await prisma.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { email: email('hari') } });
      expect(hari).toMatchObject({ tenant_id: ravi.tenantId, assigned_tenant_member_id: ravi.memberId });
    });
  });

  describe('permissions', () => {
    it('needs outreach.create to import into Client Outreach', async () => {
      const refused = await importInto(salesOnly.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, rows: [row(2, 'Indu')] });
      expect(refused.status).toBe(403);
      const allowed = await importInto(neha.token, { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, rows: [row(2, 'Indu')] });
      expect(allowed.status).toBe(200);
      expect(allowed.body.data.summary.imported).toBe(1);
    });

    it('needs leads.create to import at all', async () => {
      const refused = await importInto(viewer.token, { destination: 'SALES_PIPELINE', pipelineId: ids.sales, stageId: ids.salesNew, rows: [row(2, 'Jaya')] });
      expect(refused.status).toBe(403);
    });
  });

  describe('request size', () => {
    it('accepts a 1000-row file on the import route, and no more rows than that', async () => {
      const rows = Array.from({ length: 1000 }, (_, i) =>
        row(i + 2, `Bulk${i}`, { designation: 'Purchase Manager', phone: '9820012345', city: 'Mumbai', address: 'Industrial Estate, Andheri East', internalNotes: 'Imported from the BDM sheet' }));
      const body = { destination: 'CLIENT_OUTREACH', pipelineId: ids.outreach, dryRun: true, rows };
      expect(JSON.stringify(body).length).toBeGreaterThan(100 * 1024);
      const preview = await importInto(ravi.token, body);
      expect(preview.status).toBe(200);
      expect(preview.body.data.summary.ready).toBe(1000);
      const tooMany = await importInto(ravi.token, { ...body, rows: [...rows, row(1002, 'Extra')] });
      expect(tooMany.status).toBe(400);
    });

    it('keeps the 100 kB limit on every other route', async () => {
      const response = await call('post', '/crm/leads', ravi.token, { companyName: 'Big', firstName: 'Big', email: email('big'), internalNotes: 'x'.repeat(110 * 1024) });
      expect(response.status).toBe(413);
      expect(response.body.message).toBe('The request is too large. Send less data at a time.');
    });
  });
});
