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

/**
 * Lead ownership over HTTP: assigned-lead counts per team member, the Lead
 * Management table (server-side filters, sort, paging), and bulk assignment,
 * which is all or nothing, only to eligible members of the same workspace,
 * and only for members allowed to edit leads.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Lead-Assignment-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string };

describe('CRM lead assignment', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const ravi = { tenantId: '', token: '', email: `ravi-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const other = { tenantId: '', token: '', email: `other-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const neha: Person = { token: '', email: `neha-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const sagar: Person = { token: '', email: `sagar-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const viewer: Person = { token: '', email: `viewer-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const accountant: Person = { token: '', email: `accounts-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const suspended: Person = { token: '', email: `away-${SUFFIX}@lead.test`, memberId: '', userId: '' };
  const leads: string[] = [];
  let otherLead = '';

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const countsOf = async () => {
    const users = (await call('get', '/users', ravi.token)).body.data.users as { member_id: string; leads_count: number }[];
    return Object.fromEntries(users.map((u) => [u.member_id, u.leads_count]));
  };
  const ownerOf = async (leadId: string) => (await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: leadId } })).assigned_tenant_member_id;

  async function register(workspace: typeof ravi, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Leads ${label} ${SUFFIX}`, tenantCode: `LEAD${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, label: string, permissionCodes: string[], status = 'ACTIVE') {
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
    if (status === 'ACTIVE') {
      const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: ravi.tenantId });
      expect(login.status).toBe(200);
      person.token = login.body.token;
    } else {
      await prisma.rndtechnosoft_tenant_members.update({ where: { id: person.memberId }, data: { membership_status: status } });
    }
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
    await addMember(neha, 'Neha Mishra', ['leads.view', 'leads.update']);
    await addMember(sagar, 'Sagar Bhanushali', ['leads.view', 'leads.update']);
    await addMember(viewer, 'Lead Viewer', ['leads.view']);
    await addMember(accountant, 'Accountant', ['payslips.view']);
    await addMember(suspended, 'Away Member', ['leads.view', 'leads.update'], 'SUSPENDED');

    // Each workspace needs a pipeline with a stage before it can hold leads.
    for (const workspace of [ravi, other]) {
      const pipeline = await call('post', '/crm/pipelines', workspace.token, { name: 'Sales', code: `sales_${SUFFIX}`, isDefault: true });
      expect(pipeline.status).toBe(201);
      expect((await call('post', '/crm/masters/stages', workspace.token, { pipeline_id: pipeline.body.data.id, name: 'New', sort_order: 1 })).status).toBe(201);
    }

    const people = [['Asha', 'Alpha Traders'], ['Bala', 'Beta Foods'], ['Chirag', 'Gamma Steel'], ['Divya', 'Delta Labs'], ['Esha', 'Epsilon Tech']];
    for (const [first, company] of people) {
      const created = await call('post', '/crm/leads', ravi.token, { companyName: `${company} ${SUFFIX}`, firstName: first, email: `${first.toLowerCase()}-${SUFFIX}@client.test`, phone: '+91 98200 00000' });
      expect(created.status).toBe(201);
      leads.push(created.body.data.id);
    }
    // New leads are given to their creator; start from unassigned leads.
    await prisma.rndtechnosoft_crm_leads.updateMany({ where: { id: { in: leads } }, data: { assigned_tenant_member_id: null } });
    otherLead = (await call('post', '/crm/leads', other.token, { companyName: `Other ${SUFFIX}`, firstName: 'Omar', email: `omar-${SUFFIX}@client.test` })).body.data.id;
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

  describe('counts', () => {
    it('shows 0 leads for members with none', async () => {
      const counts = await countsOf();
      expect([counts[neha.memberId], counts[sagar.memberId], counts[ravi.memberId]]).toEqual([0, 0, 0]);
    });
  });

  describe('bulk assignment', () => {
    it('assigns unassigned leads to one member and counts them at once', async () => {
      const assigned = await call('post', '/crm/leads/assign', ravi.token, { leadIds: leads.slice(0, 3), assigneeMemberId: neha.memberId });
      expect(assigned.status).toBe(200);
      expect(assigned.body.data).toEqual({ updated: 3, unchanged: 0, replaced: 0, assignee: { id: neha.memberId, name: 'Neha Mishra' } });
      expect(assigned.body.message).toBe('3 leads assigned to Neha Mishra');
      expect((await countsOf())[neha.memberId]).toBe(3);
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: leads[0], activity_type: 'ASSIGNMENT' } });
      expect(activity).toMatchObject({ title: 'Assigned to Neha Mishra', description: 'Previously unassigned', performed_by_tenant_member_id: ravi.memberId });
    });

    it('reassigns from one member to another, moving the counts, and leaves leads already there alone', async () => {
      const moved = await call('post', '/crm/leads/assign', neha.token, { leadIds: [leads[1], leads[2], leads[3]], assigneeMemberId: sagar.memberId });
      expect(moved.body.data).toMatchObject({ updated: 3, replaced: 2, unchanged: 0 });
      const again = await call('post', '/crm/leads/assign', neha.token, { leadIds: [leads[1], leads[2]], assigneeMemberId: sagar.memberId });
      expect(again.body.data).toMatchObject({ updated: 0, unchanged: 2, replaced: 0 });
      const counts = await countsOf();
      expect([counts[neha.memberId], counts[sagar.memberId]]).toEqual([1, 3]);
      expect(await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: leads[1], activity_type: 'ASSIGNMENT' } })).toBe(2);
      const history = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: leads[1], title: 'Assigned to Sagar Bhanushali' } });
      expect(history.description).toBe('Previously assigned to Neha Mishra');
    });

    it('unassigns leads', async () => {
      const cleared = await call('post', '/crm/leads/assign', ravi.token, { leadIds: [leads[3]], assigneeMemberId: null });
      expect(cleared.body).toMatchObject({ data: { updated: 1, assignee: null }, message: '1 lead unassigned' });
      expect(await ownerOf(leads[3])).toBeNull();
      expect((await countsOf())[sagar.memberId]).toBe(2);
    });

    it('changes nothing when any selected lead is not in this workspace, and names it', async () => {
      const unknown = randomUUID();
      const before = await Promise.all(leads.map(ownerOf));
      for (const stray of [unknown, otherLead]) {
        const refused = await call('post', '/crm/leads/assign', ravi.token, { leadIds: [leads[4], stray], assigneeMemberId: neha.memberId });
        expect(refused.status).toBe(400);
        expect(refused.body.message).toBe('1 of the selected leads is not in this workspace or no longer exists. Nothing was changed; refresh the list and try again.');
        expect(refused.body.errors).toEqual({ failedLeadIds: [stray] });
      }
      expect(await Promise.all(leads.map(ownerOf))).toEqual(before);
      expect(await ownerOf(otherLead)).toBe(other.memberId);
      expect((await call('post', '/crm/leads/assign', ravi.token, { leadIds: ['not-a-lead'], assigneeMemberId: neha.memberId })).status).toBe(400);
      expect((await call('post', '/crm/leads/assign', ravi.token, { leadIds: [], assigneeMemberId: neha.memberId })).status).toBe(400);
      expect((await call('post', '/crm/leads/assign', ravi.token, { leadIds: [leads[4], leads[4]], assigneeMemberId: neha.memberId })).status).toBe(400);
    });

    it('refuses members who are inactive, can’t see leads, or belong to another workspace', async () => {
      const cases: [string, string][] = [
        [suspended.memberId, 'Away Member is not an active member of this workspace, so leads can\'t be assigned to them.'],
        [accountant.memberId, 'Accountant\'s role can\'t view leads, so leads can\'t be assigned to them. Give their role the "View leads" permission first.'],
        [other.memberId, 'That team member is not in this workspace.'],
        [randomUUID(), 'That team member is not in this workspace.'],
      ];
      for (const [memberId, message] of cases) {
        const refused = await call('post', '/crm/leads/assign', ravi.token, { leadIds: [leads[4]], assigneeMemberId: memberId });
        expect([refused.status, refused.body.message]).toEqual([400, message]);
      }
      expect(await ownerOf(leads[4])).toBeNull();
    });

    it('is refused to members who may not edit leads, and from another workspace', async () => {
      expect((await call('post', '/crm/leads/assign', viewer.token, { leadIds: [leads[4]], assigneeMemberId: neha.memberId })).status).toBe(403);
      expect((await call('post', '/crm/leads/bulk', viewer.token, { action: 'reassign', leadIds: [leads[4]], assignedUserId: neha.memberId })).status).toBe(403);
      const cross = await call('post', '/crm/leads/assign', other.token, { leadIds: [leads[4]], assigneeMemberId: other.memberId });
      expect(cross.status).toBe(400);
      expect(await ownerOf(leads[4])).toBeNull();
    });

    it('checks the older bulk "reassign" and single-lead edits the same way', async () => {
      const legacy = await call('post', '/crm/leads/bulk', ravi.token, { action: 'reassign', leadIds: [leads[4]], assignedUserId: accountant.memberId });
      expect(legacy.status).toBe(400);
      const ok = await call('post', '/crm/leads/bulk', ravi.token, { action: 'reassign', leadIds: [leads[4]], assignedUserId: neha.memberId });
      expect(ok.body.data).toMatchObject({ count: 1, updated: 1 });
      const edit = await call('put', `/crm/leads/${leads[4]}`, ravi.token, { assignedUserId: suspended.memberId });
      expect(edit.status).toBe(400);
      expect((await call('put', `/crm/leads/${leads[4]}`, ravi.token, { assignedUserId: sagar.memberId })).status).toBe(200);
      expect(await ownerOf(leads[4])).toBe(sagar.memberId);
      // A bulk action the server doesn't have is refused, never reported as done.
      const unknown = await call('post', '/crm/leads/bulk', ravi.token, { action: 'change_temperature', leadIds: [leads[4]], temperature: 'HOT' });
      expect(unknown.status).toBe(400);
    });

    it('shows the new owner everywhere the lead appears', async () => {
      const detail = await call('get', `/crm/leads/${leads[4]}`, ravi.token);
      expect(detail.body.data).toMatchObject({ assigned_user_id: sagar.memberId, assigned_user_name: 'Sagar Bhanushali' });
      const board = await call('get', '/crm/leads?page=1&limit=100', ravi.token);
      expect(board.body.data.leads.find((l: { id: string }) => l.id === leads[4])).toMatchObject({ assigned_user_id: sagar.memberId });
      const counts = await countsOf();
      expect([counts[neha.memberId], counts[sagar.memberId]]).toEqual([1, 3]);
      const assignees = (await call('get', '/crm/assignees', viewer.token)).body.data as { id: string; leadsCount: number; eligible: boolean }[];
      expect(assignees.find((a) => a.id === sagar.memberId)).toMatchObject({ leadsCount: 3, eligible: true });
      expect(assignees.find((a) => a.id === accountant.memberId)).toMatchObject({ leadsCount: 0, eligible: false });
      expect(assignees.some((a) => a.id === suspended.memberId)).toBe(false);
      expect(assignees.some((a) => a.id === other.memberId)).toBe(false);
    });

    it('counts a deleted lead no more', async () => {
      const extra = (await call('post', '/crm/leads', ravi.token, { companyName: `Temp ${SUFFIX}`, firstName: 'Tara', email: `tara-${SUFFIX}@client.test` })).body.data.id;
      await call('post', '/crm/leads/assign', ravi.token, { leadIds: [extra], assigneeMemberId: neha.memberId });
      expect((await countsOf())[neha.memberId]).toBe(2);
      expect((await call('delete', `/crm/leads/${extra}`, ravi.token)).status).toBe(200);
      expect((await countsOf())[neha.memberId]).toBe(1);
    });
  });

  describe('the Lead Management table', () => {
    const table = (token: string, query = '') => call('get', `/crm/lead-management${query}`, token);

    it('lists only this workspace’s leads, with their stage, source, owner and status', async () => {
      const all = await table(viewer.token);
      expect(all.status).toBe(200);
      expect(all.body.pagination.total).toBe(5);
      expect(all.body.data.map((l: { id: string }) => l.id)).not.toContain(otherLead);
      const row = all.body.data.find((l: { id: string }) => l.id === leads[4]);
      expect(row).toMatchObject({ companyName: `Epsilon Tech ${SUFFIX}`, name: 'Esha', status: 'OPEN', assignee: { id: sagar.memberId, name: 'Sagar Bhanushali' } });
      expect(row.stage.name).toEqual(expect.any(String));
      expect(all.body.filters.stages.length).toBeGreaterThan(0);
      expect((await table(other.token)).body.pagination.total).toBe(1);
      expect((await table(accountant.token)).status).toBe(403);
    });

    it('filters, searches, sorts and pages on the server', async () => {
      const bySagar = await table(ravi.token, `?assigneeId=${sagar.memberId}`);
      expect(bySagar.body.data.map((l: { id: string }) => l.id).sort()).toEqual([leads[1], leads[2], leads[4]].sort());
      const unassigned = await table(ravi.token, '?assigneeId=unassigned');
      expect(unassigned.body.data.map((l: { id: string }) => l.id)).toEqual([leads[3]]);
      expect((await table(ravi.token, `?search=gamma%20steel`)).body.data.map((l: { id: string }) => l.id)).toEqual([leads[2]]);
      expect((await table(ravi.token, `?search=divya-${SUFFIX}`)).body.data.map((l: { id: string }) => l.id)).toEqual([leads[3]]);
      expect((await table(ravi.token, '?status=WON')).body.pagination.total).toBe(0);
      const sorted = await table(ravi.token, '?sort=company_name&direction=asc');
      expect(sorted.body.data.map((l: { companyName: string }) => l.companyName[0])).toEqual(['A', 'B', 'D', 'E', 'G']);
      const pageTwo = await table(ravi.token, '?sort=company_name&direction=asc&limit=2&page=2');
      expect(pageTwo.body.data.map((l: { companyName: string }) => l.companyName[0])).toEqual(['D', 'E']);
      expect(pageTwo.body.pagination).toEqual({ page: 2, limit: 2, total: 5, totalPages: 3 });
      expect((await table(ravi.token, '?assigneeId=everyone')).status).toBe(400);
      expect((await table(ravi.token, '?sort=password')).status).toBe(400);
      expect((await table(ravi.token, '?limit=1000')).status).toBe(400);
    });
  });
});
