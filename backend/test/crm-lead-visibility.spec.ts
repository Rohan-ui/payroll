import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * Lead visibility over HTTP: a member sees and works on only the leads
 * assigned to them; unassigned leads and other members' leads are visible only
 * with leads.view_all, which the workspace owner holds and can grant to any
 * role. A hidden lead answers exactly like one that does not exist, on every
 * CRM screen that shows leads or their follow-ups, meetings, quotations and
 * activity, and the grant takes effect on the next request.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Lead-Visibility-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; roleId: string };

const REP_PERMISSIONS = [
  'leads.view', 'leads.create', 'leads.update', 'leads.delete', 'leads.export', 'pipelines.view',
  'outreach.view', 'outreach.create', 'outreach.update', 'followups.view', 'followups.create', 'followups.update', 'followups.delete',
  'meetings.view', 'meetings.create', 'meetings.update', 'quotations.view', 'quotations.create', 'quotations.update',
];

describe('CRM lead visibility', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const admin = { tenantId: '', token: '', email: `vis-admin-${SUFFIX}@vis.test`, memberId: '' };
  const neha: Person = { token: '', email: `vis-neha-${SUFFIX}@vis.test`, memberId: '', roleId: '' };
  const sagar: Person = { token: '', email: `vis-sagar-${SUFFIX}@vis.test`, memberId: '', roleId: '' };
  const manager: Person = { token: '', email: `vis-manager-${SUFFIX}@vis.test`, memberId: '', roleId: '' };
  const lead = { neha: '', nehaCold: '', sagar: '', unassigned: '' };
  let pipelineId = '';
  let stageId = '';
  let wonStageId = '';

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const leadIds = async (token: string, query = '') => ((await call('get', `/crm/leads?limit=100${query}`, token)).body.data.leads as { id: string }[]).map((l) => l.id).sort();
  const managedIds = async (token: string, query = '') => ((await call('get', `/crm/lead-management?limit=100${query}`, token)).body.data as { id: string }[]).map((l) => l.id).sort();
  const sorted = (...ids: string[]) => [...ids].sort();
  /** The answer for a lead that does not exist, which a hidden lead must give too. */
  const notFound = (response: request.Response) => {
    expect(response.status).toBe(404);
    expect(response.body.message).toMatch(/^Lead (opportunity )?not found$/);
  };

  async function addMember(person: Person, label: string, permissionCodes: string[]) {
    userEmails.push(person.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: userId, email: person.email, display_name: label, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    person.roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: person.roleId, tenant_id: admin.tenantId, role_code: `R_${label.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${label}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: admin.tenantId, role_id: person.roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: admin.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: admin.tenantId, tenant_member_id: person.memberId, role_id: person.roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: admin.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  async function setViewAll(person: Person, granted: boolean) {
    const permission = await prisma.rndtechnosoft_permissions.findUniqueOrThrow({ where: { permission_code: 'leads.view_all' } });
    if (granted) await prisma.rndtechnosoft_role_permissions.create({ data: { id: randomUUID(), tenant_id: admin.tenantId, role_id: person.roleId, permission_id: permission.id } });
    else await prisma.rndtechnosoft_role_permissions.deleteMany({ where: { role_id: person.roleId, permission_id: permission.id } });
  }

  async function newLead(name: string, assignee: string | null, extra: Record<string, unknown> = {}) {
    const created = await call('post', '/crm/leads', admin.token, { companyName: `${name} Co ${SUFFIX}`, firstName: name, email: `${name.toLowerCase()}-${SUFFIX}@client.test`, pipelineId, stageId, ...extra });
    expect(created.status).toBe(201);
    await prisma.rndtechnosoft_crm_leads.update({ where: { id: created.body.data.id }, data: { assigned_tenant_member_id: assignee } });
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

    userEmails.push(admin.email);
    const registered = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Visibility ${SUFFIX}`, tenantCode: `VIS${SUFFIX.toUpperCase()}`, email: admin.email, password: PASSWORD });
    expect(registered.status).toBe(201);
    admin.tenantId = registered.body.activeTenant.tenantId;
    admin.token = registered.body.token;
    tenantIds.push(admin.tenantId);
    admin.memberId = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: admin.tenantId } })).id;

    await addMember(neha, 'Neha Mishra', REP_PERMISSIONS);
    await addMember(sagar, 'Sagar Bhanushali', REP_PERMISSIONS);
    await addMember(manager, 'Sales Manager', [...REP_PERMISSIONS, 'leads.view_all']);

    pipelineId = (await call('post', '/crm/masters/pipelines', admin.token, { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true })).body.data.id;
    stageId = (await call('post', '/crm/masters/stages', admin.token, { pipeline_id: pipelineId, name: 'New', sort_order: 1 })).body.data.id;
    wonStageId = (await call('post', '/crm/masters/stages', admin.token, { pipeline_id: pipelineId, name: 'Proposal', sort_order: 2 })).body.data.id;

    lead.neha = await newLead('Asha', neha.memberId);
    lead.nehaCold = await newLead('Bala', neha.memberId, { temperature: 'COLD' });
    lead.sagar = await newLead('Chirag', sagar.memberId);
    lead.unassigned = await newLead('Divya', null);
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

  describe('lists', () => {
    it('shows each member only the leads assigned to them; the owner and members with leads.view_all see every lead', async () => {
      expect(await leadIds(neha.token)).toEqual(sorted(lead.neha, lead.nehaCold));
      expect(await leadIds(sagar.token)).toEqual([lead.sagar]);
      const everything = sorted(lead.neha, lead.nehaCold, lead.sagar, lead.unassigned);
      expect(await leadIds(admin.token)).toEqual(everything);
      expect(await leadIds(manager.token)).toEqual(everything);
      const page = await call('get', '/crm/leads?limit=1', neha.token);
      expect(page.body.data.pagination.total).toBe(2);
    });

    it('does not widen a member’s view through the assignee filter', async () => {
      expect(await leadIds(neha.token, `&assignedUserId=${sagar.memberId}`)).toEqual([]);
      expect(await managedIds(neha.token, '&assigneeId=unassigned')).toEqual([]);
      expect(await managedIds(neha.token)).toEqual(sorted(lead.neha, lead.nehaCold));
      expect(await managedIds(admin.token, '&assigneeId=unassigned')).toEqual([lead.unassigned]);
    });

    it('counts only visible leads in the outreach cadence and the pipeline totals', async () => {
      expect((await call('get', '/crm/cadence', neha.token)).body.data.stats.totalEnrolled).toBe(1);
      expect((await call('get', '/crm/cadence', sagar.token)).body.data.stats.totalEnrolled).toBe(0);
      const stageCount = async (token: string) => {
        const pipelines = (await call('get', '/crm/pipelines', token)).body.data as { id: string; stages: { id: string; leadCount: number }[] }[];
        return pipelines.find((p) => p.id === pipelineId)!.stages.find((s) => s.id === stageId)!.leadCount;
      };
      expect(await stageCount(neha.token)).toBe(2);
      expect(await stageCount(admin.token)).toBe(4);
    });

    it('exports only visible leads', async () => {
      const response = await call('get', '/crm/leads/export', neha.token).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });
      expect(response.status).toBe(200);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(response.body);
      const emails: string[] = [];
      workbook.worksheets[0].eachRow((row, n) => { if (n > 1) emails.push(String(row.getCell(6).value)); });
      expect(emails.sort()).toEqual([`asha-${SUFFIX}@client.test`, `bala-${SUFFIX}@client.test`]);
    });
  });

  describe('a lead the member may not see', () => {
    it('answers as not found when opened, edited, deleted, won or worked in outreach', async () => {
      notFound(await call('get', `/crm/leads/${lead.sagar}`, neha.token));
      notFound(await call('get', `/crm/leads/${lead.unassigned}`, neha.token));
      const missing = await call('get', `/crm/leads/${randomUUID()}`, neha.token);
      notFound(missing);
      expect((await call('get', `/crm/leads/${lead.sagar}`, neha.token)).body.message).toBe(missing.body.message);
      notFound(await call('put', `/crm/leads/${lead.sagar}`, neha.token, { companyName: 'Taken over' }));
      notFound(await call('delete', `/crm/leads/${lead.sagar}`, neha.token));
      notFound(await call('post', `/crm/leads/${lead.sagar}/convert-won`, neha.token));
      notFound(await call('post', '/crm/cadence', neha.token, { action: 'COMPLETE_STEP', leadId: lead.sagar }));
      notFound(await call('post', '/crm/cadence', neha.token, { action: 'CONVERT_OPPORTUNITY', leadId: lead.sagar, pipelineId, stageId }));
      notFound(await call('get', `/crm/cadence?leadId=${lead.sagar}`, neha.token));
      const untouched = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.sagar } });
      expect(untouched).toMatchObject({ company_name: `Chirag Co ${SUFFIX}`, is_won: false });
      expect((await call('get', `/crm/leads/${lead.neha}`, neha.token)).status).toBe(200);
    });

    it('cannot be changed in bulk or assigned, and nothing in the batch changes', async () => {
      const bulk = await call('post', '/crm/leads/bulk', neha.token, { action: 'stage_change', leadIds: [lead.neha, lead.sagar], stageId: wonStageId });
      expect(bulk.status).toBe(404);
      expect((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.neha } })).stage_id).toBe(stageId);
      const assign = await call('post', '/crm/leads/assign', neha.token, { leadIds: [lead.sagar], assigneeMemberId: neha.memberId });
      expect(assign.status).toBe(400);
      expect((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.sagar } })).assigned_tenant_member_id).toBe(sagar.memberId);
    });

    it('hides its activity, follow-ups, meetings and quotations, and refuses new ones', async () => {
      const followup = await call('post', '/crm/followups', admin.token, { leadId: lead.sagar, scheduledAt: '2026-11-01T10:00:00Z' });
      const meeting = await call('post', '/crm/meetings', admin.token, { leadId: lead.sagar, scheduledAt: '2026-11-02T10:00:00Z', title: 'Demo' });
      const quote = await call('post', '/crm/quotations', admin.token, { leadId: lead.sagar, items: [{ description: 'Website', quantity: 1, unitRate: 50000 }] });
      expect([followup.status, meeting.status, quote.status]).toEqual([201, 201, 201]);

      const listed = async (path: string) => ((await call('get', path, neha.token)).body.data as { lead_id: string }[]).map((r) => r.lead_id);
      expect(await listed('/crm/followups')).not.toContain(lead.sagar);
      expect(await listed('/crm/meetings')).not.toContain(lead.sagar);
      expect(await listed('/crm/quotations')).not.toContain(lead.sagar);
      expect(await listed(`/crm/activities?leadId=${lead.sagar}`)).toEqual([]);
      expect(await listed('/crm/followups?limit=100')).toEqual([]);
      expect((await call('get', '/crm/followups', sagar.token)).body.data.map((r: { lead_id: string }) => r.lead_id)).toContain(lead.sagar);

      expect((await call('get', `/crm/quotations/${quote.body.data.id}`, neha.token)).status).toBe(404);
      expect((await call('put', `/crm/followups/${followup.body.data.id}`, neha.token, { status: 'COMPLETED' })).status).toBe(404);
      expect((await call('put', `/crm/meetings/${meeting.body.data.id}`, neha.token, { status: 'COMPLETED' })).status).toBe(404);
      expect((await call('put', `/crm/quotations/${quote.body.data.id}`, neha.token, { status: 'SENT' })).status).toBe(404);
      notFound(await call('post', '/crm/followups', neha.token, { leadId: lead.sagar, scheduledAt: '2026-11-03T10:00:00Z' }));
      notFound(await call('post', '/crm/meetings', neha.token, { leadId: lead.sagar, scheduledAt: '2026-11-03T10:00:00Z', title: 'X' }));
      notFound(await call('post', '/crm/quotations', neha.token, { leadId: lead.sagar, items: [{ description: 'X', quantity: 1, unitRate: 1 }] }));
      notFound(await call('post', '/crm/activities', neha.token, { leadId: lead.sagar, activityType: 'NOTE', title: 'Peek' }));
      expect((await prisma.rndtechnosoft_crm_lead_followups.findUniqueOrThrow({ where: { id: followup.body.data.id } })).status).toBe('PENDING');
      expect((await prisma.rndtechnosoft_crm_meetings.findUniqueOrThrow({ where: { id: meeting.body.data.id } })).status).toBe('SCHEDULED');
    });

    it('is still a duplicate on import, without naming the lead', async () => {
      const imported = await call('post', '/crm/leads/import', neha.token, {
        destination: 'SALES_PIPELINE', pipelineId, stageId,
        rows: [{ rowNumber: 2, companyName: 'Copy', firstName: 'Copy', email: `chirag-${SUFFIX}@client.test`, phone: '9820012345' }, { rowNumber: 3, companyName: 'Mine', firstName: 'Mine', email: `asha-${SUFFIX}@client.test`, phone: '9820012345' }],
      });
      expect(imported.body.data.rows[0]).toMatchObject({ outcome: 'DUPLICATE', reasons: ['A lead with this email already exists in this workspace.'] });
      expect(imported.body.data.rows[1].reasons[0]).toMatch(/^A lead with this email already exists \(LD-/);
    });
  });

  describe('changes take effect at once', () => {
    it('moves a lead out of a member’s view when it is reassigned, and into the new owner’s', async () => {
      await call('post', '/crm/leads/assign', admin.token, { leadIds: [lead.neha], assigneeMemberId: sagar.memberId });
      expect(await leadIds(neha.token)).toEqual([lead.nehaCold]);
      expect(await leadIds(sagar.token)).toEqual(sorted(lead.neha, lead.sagar));
      notFound(await call('get', `/crm/leads/${lead.neha}`, neha.token));
      const back = await call('post', '/crm/leads/assign', admin.token, { leadIds: [lead.neha], assigneeMemberId: neha.memberId });
      expect(back.status).toBe(200);
      expect(await leadIds(neha.token)).toEqual(sorted(lead.neha, lead.nehaCold));
    });

    it('applies leads.view_all granted to or removed from a role on the next request', async () => {
      await setViewAll(sagar, true);
      expect(await leadIds(sagar.token)).toEqual(sorted(lead.neha, lead.nehaCold, lead.sagar, lead.unassigned));
      expect((await call('get', `/crm/leads/${lead.unassigned}`, sagar.token)).status).toBe(200);
      await setViewAll(sagar, false);
      expect(await leadIds(sagar.token)).toEqual([lead.sagar]);
    });

    it('lists the permission for roles, and the workspace owner holds it', async () => {
      const owner = await prisma.rndtechnosoft_role_permissions.count({
        where: { tenant_id: admin.tenantId, rndtechnosoft_roles: { role_code: 'ADMIN' }, rndtechnosoft_permissions: { permission_code: 'leads.view_all' } },
      });
      expect(owner).toBe(1);
    });
  });
});
