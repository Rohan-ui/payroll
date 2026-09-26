import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { ADMIN_ROLE_CODE } from '@/common/access/access-catalog';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * CRM & Sales inside a tenant workspace, end to end over HTTP: every CRM route
 * as workspace A, the same records invisible and untouchable from workspace B,
 * a member without CRM permissions refused, and switching workspaces.
 *
 * Requests are sent as the development proxy sends them (Host: localhost:4000)
 * with workspace addresses configured, which used to answer 421.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Crm-Workspace-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Ids = Record<string, string>;

describe('CRM & Sales in a tenant workspace', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousBaseDomain = process.env.PLATFORM_BASE_DOMAIN;
  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  const a = { tenantId: '', token: '', email: `crm-a-${SUFFIX}@crm.test` };
  const b = { tenantId: '', token: '', email: `crm-b-${SUFFIX}@crm.test` };
  const restricted = { token: '', email: `crm-viewer-${SUFFIX}@crm.test` };
  const ids: Ids = {};

  const call = (method: 'get' | 'post' | 'put' | 'delete', path: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${path}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown) => call(method, path, a.token, body);
  const asB = (method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown) => call(method, path, b.token, body);
  /** Ids in a list response; the leads list nests its rows under `leads`. */
  const listIds = (response: { body: { data?: unknown } }) => {
    const data = response.body.data as { leads?: unknown } | unknown[] | undefined;
    const rows = Array.isArray(data) ? data : Array.isArray((data as { leads?: unknown })?.leads) ? (data as { leads: unknown[] }).leads : [];
    return rows.map((row) => (row as { id?: string }).id);
  };

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `CRM ${label} ${SUFFIX}`, tenantCode: `CRM${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
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

    // A member of A whose role has no CRM permissions.
    userEmails.push(restricted.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: userId, email: restricted.email, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: 'EMPLOYEE', role_name: 'Employee', is_system_role: true } });
    await grantDefaultRolePermissions(prisma, a.tenantId, roleId, 'EMPLOYEE');
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: restricted.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    restricted.token = login.body.token;
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
    if (previousBaseDomain === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previousBaseDomain;
    await app?.close();
  });

  describe('workspace A: every CRM screen', () => {
    it('explains that a pipeline is needed before the first lead', async () => {
      const response = await asA('post', '/crm/leads', { companyName: 'Early Co', firstName: 'Ann', email: 'ann@early.test' });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Create a sales pipeline with at least one stage/);
    });

    it('creates pipelines and stages (Pipelines, Masters)', async () => {
      const pipeline = await asA('post', '/crm/pipelines', { name: 'Sales', code: `sales_${SUFFIX}`, isDefault: true });
      expect(pipeline.status).toBe(201);
      ids.pipeline = pipeline.body.data.id;
      const stage = await asA('post', '/crm/masters/stages', { pipeline_id: ids.pipeline, name: 'New', sort_order: 1 });
      expect(stage.status).toBe(201);
      ids.stage = stage.body.data.id;
      const won = await asA('post', '/crm/masters/stages', { pipeline_id: ids.pipeline, name: 'Won', sort_order: 2, is_won: 1 });
      expect(won.status).toBe(201);

      const updated = await asA('put', '/crm/masters/stages', { id: ids.stage, name: 'Fresh' });
      expect(updated.status).toBe(200);
      expect(listIds(await asA('get', '/crm/masters/stages'))).toContain(ids.stage);
      const pipelines = await asA('get', '/crm/pipelines');
      expect(pipelines.status).toBe(200);
      expect(listIds(pipelines)).toContain(ids.pipeline);
    });

    it('validates leads and stores only what was given (Leads)', async () => {
      const cases: [Record<string, unknown>, RegExp][] = [
        [{ firstName: 'Ann', email: 'ann@acme.test' }, /needs a company name/],
        [{ companyName: 'Acme', email: 'ann@acme.test' }, /needs a first name/],
        [{ companyName: 'Acme', firstName: 'Ann' }, /needs a email/],
        [{ companyName: 'Acme', firstName: 'Ann', email: 'not-an-email' }, /valid email/],
        [{ companyName: 'Acme', firstName: 'Ann', email: 'ann@acme.test', pipelineId: randomUUID() }, /pipeline does not exist/],
      ];
      for (const [body, message] of cases) {
        const response = await asA('post', '/crm/leads', body);
        expect([response.status, response.body.message]).toEqual([400, expect.stringMatching(message)]);
      }

      const created = await asA('post', '/crm/leads', { companyName: `Acme ${SUFFIX}`, firstName: 'Ann', email: 'Ann@Acme.test' });
      expect(created.status).toBe(201);
      expect(created.body.message).toBe('Lead created successfully');
      ids.lead = created.body.data.id;
      const stored = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: ids.lead } });
      expect(stored).toMatchObject({ tenant_id: a.tenantId, email: 'ann@acme.test', phone: null, industry: null, pipeline_id: ids.pipeline, stage_id: ids.stage });
      expect(stored.lead_code).toMatch(/^LD-\d{4}-\d{6}$/);
    });

    it('lists, searches, reads and updates leads', async () => {
      const search = await asA('get', `/crm/leads?search=${encodeURIComponent(`Acme ${SUFFIX}`)}`);
      expect(search.status).toBe(200);
      expect(listIds(search)).toEqual([ids.lead]);
      expect(listIds(await asA('get', '/crm/leads?search=no-such-company'))).toEqual([]);
      expect((await asA('get', `/crm/leads/${ids.lead}`)).body.data.id).toBe(ids.lead);

      const updated = await asA('put', `/crm/leads/${ids.lead}`, { companyName: `Acme Renamed ${SUFFIX}`, phone: '+91 98765 43210' });
      expect(updated.status).toBe(200);
      expect(await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: ids.lead } })).toMatchObject({
        company_name: `Acme Renamed ${SUFFIX}`,
        phone: '+91 98765 43210',
      });
      expect((await asA('get', '/crm/leads/export')).status).toBe(200);
    });

    it('records activities, follow-ups and meetings (Follow-ups & Meetings)', async () => {
      const activity = await asA('post', '/crm/activities', { leadId: ids.lead, activityType: 'NOTE', title: 'Called' });
      expect(activity.status).toBe(201);
      expect(listIds(await asA('get', `/crm/activities?leadId=${ids.lead}`))).toContain(activity.body.data.id);

      const followup = await asA('post', '/crm/followups', { leadId: ids.lead, scheduledAt: '2026-10-01T10:00:00.000Z', instructions: 'Send deck' });
      expect(followup.status).toBe(201);
      ids.followup = followup.body.data.id;
      expect((await asA('put', `/crm/followups/${ids.followup}`, { status: 'COMPLETED', outcomeNote: 'Done' })).status).toBe(200);
      expect(listIds(await asA('get', '/crm/followups'))).toContain(ids.followup);

      const meeting = await asA('post', '/crm/meetings', { leadId: ids.lead, title: 'Discovery', scheduledAt: '2026-10-02T10:00:00.000Z' });
      expect(meeting.status).toBe(201);
      ids.meeting = meeting.body.data.id;
      expect((await asA('put', `/crm/meetings/${ids.meeting}`, { minutesOfMeeting: 'Agreed scope' })).status).toBe(200);
      expect(listIds(await asA('get', '/crm/meetings'))).toContain(ids.meeting);
    });

    it('builds quotations with decimal totals, all or nothing (Quotations)', async () => {
      expect((await asA('post', '/crm/quotations', { leadId: ids.lead, items: [] })).status).toBe(400);
      expect((await asA('post', '/crm/quotations', { leadId: ids.lead, items: [{ description: 'X', quantity: 0, unitRate: 10 }] })).status).toBe(400);

      const quotation = await asA('post', '/crm/quotations', {
        leadId: ids.lead,
        items: [
          { description: 'Implementation', quantity: 2, unitRate: '1000.10' },
          { description: 'Support', quantity: 1, unitRate: '0.33' },
        ],
      });
      expect(quotation.status).toBe(201);
      ids.quotation = quotation.body.data.id;
      const stored = await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id: ids.quotation } });
      // 2 × 1000.10 + 0.33 = 2000.53; CGST and SGST 9 % each = 180.05 (180.0477); total 2360.63.
      expect([stored.subtotal.toFixed(2), stored.cgst_amount.toFixed(2), stored.sgst_amount.toFixed(2), stored.total_amount.toFixed(2)]).toEqual([
        '2000.53',
        '180.05',
        '180.05',
        '2360.63',
      ]);
      expect(await prisma.rndtechnosoft_crm_quotation_items.count({ where: { quotation_id: ids.quotation } })).toBe(2);
      expect((await asA('get', `/crm/quotations/${ids.quotation}`)).status).toBe(200);
      expect((await asA('put', `/crm/quotations/${ids.quotation}`, { status: 'SENT' })).status).toBe(200);
      expect(listIds(await asA('get', '/crm/quotations'))).toContain(ids.quotation);
      expect((await asA('get', '/crm/quotation-templates')).status).toBe(200);
    });

    it('creates and updates clients, and converts a won lead (Clients)', async () => {
      expect((await asA('post', '/crm/clients', { companyName: 'No Contact Ltd' })).status).toBe(400);
      const client = await asA('post', '/crm/clients', { companyName: `Client ${SUFFIX}`, contactPerson: 'Bo', email: 'bo@client.test' });
      expect(client.status).toBe(201);
      ids.client = client.body.data.id;
      expect(client.body.data).toMatchObject({ tenant_id: a.tenantId, phone: null });
      expect((await asA('put', `/crm/clients/${ids.client}`, { phone: '+91 90000 11111' })).status).toBe(200);
      expect(listIds(await asA('get', '/crm/clients'))).toContain(ids.client);

      const won = await asA('post', `/crm/leads/${ids.lead}/convert-won`);
      expect(won.status).toBeLessThan(300);
      expect(await prisma.rndtechnosoft_crm_clients.count({ where: { tenant_id: a.tenantId, created_from_lead_id: ids.lead } })).toBe(1);
    });

    it('manages the services, sources and industries masters and reads the others', async () => {
      const service = await asA('post', '/crm/masters/services', { name: `Audit ${SUFFIX}`, default_rate: 5000 });
      expect(service.status).toBe(201);
      ids.service = service.body.data.id;
      expect((await asA('put', '/crm/masters/services', { id: ids.service, name: `Audit+ ${SUFFIX}` })).status).toBe(200);

      const source = await asA('post', '/crm/masters/sources', { name: `Referral ${SUFFIX}` });
      expect(source.status).toBe(201);
      ids.source = source.body.data.id;
      expect(listIds(await asA('get', '/crm/masters/sources'))).toContain(ids.source);

      const industry = await asA('post', '/crm/masters/industries', { name: `Space ${SUFFIX}` });
      expect(industry.status).toBe(201);
      ids.industry = industry.body.data.id;
      expect((await asA('put', '/crm/masters/industries', { id: ids.industry, name: `Space+ ${SUFFIX}` })).status).toBe(200);
      const industries = await asA('get', '/crm/masters/industries');
      expect(JSON.stringify(industries.body)).toContain(`Space+ ${SUFFIX}`);
      // Saving industries touches only that settings section.
      const settings = await prisma.rndtechnosoft_tenant_settings.findUniqueOrThrow({ where: { tenant_id: a.tenantId } });
      expect(Object.keys(settings.settings as object)).toEqual(expect.arrayContaining(['industries']));

      for (const path of ['/crm/masters/lost-reasons', '/crm/masters/sop-steps', '/crm/masters/sop-branches', '/crm/masters/pipelines', '/crm/cadence', '/crm/audit-logs']) {
        expect([path, (await asA('get', path)).status]).toEqual([path, 200]);
      }
      expect((await asA('get', '/crm/audit-logs')).body.data.length).toBeGreaterThan(0);
    });
  });

  describe('workspace B cannot see or touch workspace A', () => {
    it('lists none of A’s records', async () => {
      for (const [path, id] of [
        ['/crm/leads', 'lead'],
        ['/crm/followups', 'followup'],
        ['/crm/meetings', 'meeting'],
        ['/crm/quotations', 'quotation'],
        ['/crm/clients', 'client'],
        ['/crm/pipelines', 'pipeline'],
        ['/crm/masters/stages', 'stage'],
        ['/crm/masters/services', 'service'],
        ['/crm/masters/sources', 'source'],
        ['/crm/activities', 'lead'],
      ] as const) {
        const response = await asB('get', path);
        expect([path, response.status]).toEqual([path, 200]);
        expect([path, JSON.stringify(response.body).includes(ids[id])]).toEqual([path, false]);
      }
      expect(JSON.stringify((await asB('get', '/crm/masters/industries')).body)).not.toContain(SUFFIX);
      expect(JSON.stringify((await asB('get', '/crm/audit-logs')).body)).not.toContain(ids.lead);
    });

    it('gets 404 for A’s records by id, and changes nothing', async () => {
      const before = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: ids.lead } });
      const attempts: [string, () => request.Test][] = [
        ['read lead', () => asB('get', `/crm/leads/${ids.lead}`)],
        ['update lead', () => asB('put', `/crm/leads/${ids.lead}`, { companyName: 'Hijacked' })],
        ['delete lead', () => asB('delete', `/crm/leads/${ids.lead}`)],
        ['convert lead', () => asB('post', `/crm/leads/${ids.lead}/convert-won`)],
        ['update follow-up', () => asB('put', `/crm/followups/${ids.followup}`, { status: 'COMPLETED' })],
        ['delete follow-up', () => asB('delete', `/crm/followups/${ids.followup}`)],
        ['update meeting', () => asB('put', `/crm/meetings/${ids.meeting}`, { title: 'Hijacked' })],
        ['delete meeting', () => asB('delete', `/crm/meetings/${ids.meeting}`)],
        ['read quotation', () => asB('get', `/crm/quotations/${ids.quotation}`)],
        ['update quotation', () => asB('put', `/crm/quotations/${ids.quotation}`, { status: 'ACCEPTED' })],
        ['delete quotation', () => asB('delete', `/crm/quotations/${ids.quotation}`)],
        ['update client', () => asB('put', `/crm/clients/${ids.client}`, { companyName: 'Hijacked' })],
        ['update service', () => asB('put', '/crm/masters/services', { id: ids.service, name: 'Hijacked' })],
        ['delete service', () => asB('delete', `/crm/masters/services?id=${ids.service}`)],
        ['delete source', () => asB('delete', `/crm/masters/sources?id=${ids.source}`)],
        ['delete stage', () => asB('delete', `/crm/masters/stages?id=${ids.stage}`)],
      ];
      for (const [label, attempt] of attempts) {
        expect([label, (await attempt()).status]).toEqual([label, 404]);
      }
      expect(await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: ids.lead } })).toEqual(before);
      expect(await prisma.rndtechnosoft_crm_quotations.count({ where: { id: ids.quotation } })).toBe(1);
      expect(await prisma.rndtechnosoft_crm_services_master.findUniqueOrThrow({ where: { id: ids.service } })).toMatchObject({ name: `Audit+ ${SUFFIX}` });
    });

    it('cannot attach its records to A’s lead or pipeline', async () => {
      const lead = await asB('post', '/crm/leads', { companyName: 'B Co', firstName: 'Bea', email: 'bea@b.test', pipelineId: ids.pipeline });
      expect([lead.status, lead.body.message]).toEqual([400, 'That pipeline does not exist in this workspace.']);
      expect((await asB('post', '/crm/followups', { leadId: ids.lead, scheduledAt: '2026-10-01T10:00:00.000Z' })).status).toBe(400);
      expect((await asB('post', '/crm/meetings', { leadId: ids.lead, scheduledAt: '2026-10-01T10:00:00.000Z' })).status).toBe(400);
      expect((await asB('post', '/crm/quotations', { leadId: ids.lead, items: [{ description: 'X', quantity: 1, unitRate: 1 }] })).status).toBe(404);
      expect((await asB('post', '/crm/activities', { leadId: ids.lead, activityType: 'NOTE', title: 'X' })).status).toBe(400);
      for (const table of ['rndtechnosoft_crm_lead_followups', 'rndtechnosoft_crm_meetings', 'rndtechnosoft_crm_quotations', 'rndtechnosoft_crm_lead_activities'] as const) {
        expect([table, await (prisma[table] as unknown as { count: (args: object) => Promise<number> }).count({ where: { tenant_id: b.tenantId } })]).toEqual([table, 0]);
      }
    });

    it('sees only its own data after switching workspaces', async () => {
      // A's owner is also given a membership in B.
      const owner = await prisma.rndtechnosoft_users.findUniqueOrThrow({ where: { email: a.email } });
      const bAdmin = await prisma.rndtechnosoft_roles.findFirstOrThrow({ where: { tenant_id: b.tenantId, role_code: ADMIN_ROLE_CODE } });
      const memberId = randomUUID();
      await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: b.tenantId, user_id: owner.id, membership_status: 'ACTIVE', joined_at: new Date() } });
      await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: b.tenantId, tenant_member_id: memberId, role_id: bAdmin.id } });

      const switched = await asA('post', '/auth/switch-tenant', { tenantId: b.tenantId });
      expect(switched.status).toBe(200);
      const inB = switched.body.token as string;
      const leadsInB = await call('get', '/crm/leads', inB);
      expect(leadsInB.status).toBe(200);
      expect(listIds(leadsInB)).not.toContain(ids.lead);
      const created = await call('post', '/crm/clients', inB, { companyName: 'Made in B', contactPerson: 'Cy', email: 'cy@b.test' });
      expect(created.body.data.tenant_id).toBe(b.tenantId);
      // Switching replaced A's session; sign in to A again for the tests that follow.
      const again = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: a.email, password: PASSWORD, tenantId: a.tenantId });
      a.token = again.body.token;
      expect(listIds(await asA('get', '/crm/clients'))).not.toContain(created.body.data.id);
    });
  });

  describe('permissions', () => {
    it('refuses a member whose role has no CRM permissions, and anonymous callers', async () => {
      const routes: ['get' | 'post' | 'put' | 'delete', string][] = [
        ['get', '/crm/leads'],
        ['post', '/crm/leads'],
        ['put', `/crm/leads/${ids.lead}`],
        ['delete', `/crm/leads/${ids.lead}`],
        ['get', '/crm/pipelines'],
        ['get', '/crm/followups'],
        ['get', '/crm/meetings'],
        ['get', '/crm/quotations'],
        ['post', '/crm/quotations'],
        ['get', '/crm/clients'],
        ['get', '/crm/masters/services'],
        ['get', '/crm/masters/industries'],
        ['get', '/crm/cadence'],
        ['get', '/crm/audit-logs'],
      ];
      for (const [method, path] of routes) {
        const denied = await call(method, path, restricted.token, method === 'get' ? undefined : {});
        const anonymous = await request(app.getHttpServer())[method](`${API}${path}`).set('Host', LOCAL);
        expect([method, path, denied.status, anonymous.status]).toEqual([method, path, 403, 401]);
      }
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { id: ids.lead } })).toBe(1);
    });
  });

  describe('converting from Client Outreach', () => {
    const conv: Ids = {};
    const convert = (token: string, leadId: string, extra: Record<string, unknown> = {}) =>
      call('post', '/crm/cadence', token, { action: 'CONVERT_OPPORTUNITY', leadId, ...extra });
    const row = (id: string) => prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id } });
    const cadenceOf = (lead: { custom_attributes: unknown }) => (lead.custom_attributes as { cadence?: Record<string, unknown> } | null)?.cadence;
    const coldLead = async (label: string) => {
      const created = await asA('post', '/crm/leads', { companyName: `Outreach ${label}`, firstName: 'Omar', email: `omar.${label}.${SUFFIX}@outreach.test`, temperature: 'COLD', phone: '+91 90000 11111' });
      expect(created.status).toBe(201);
      expect(cadenceOf(created.body.data)).toMatchObject({ status: 'ACTIVE' });
      return created.body.data.id as string;
    };

    beforeAll(async () => {
      conv.lead = await coldLead('one');
    });

    it('refuses with a clear message when the workspace has no Cold Funnel, changing nothing', async () => {
      const before = await row(conv.lead);
      const response = await convert(a.token, conv.lead);
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/Cold Funnel is not set up/);
      const after = await row(conv.lead);
      expect([after.pipeline_id, after.stage_id]).toEqual([before.pipeline_id, before.stage_id]);
      expect(cadenceOf(after)).toMatchObject({ status: 'ACTIVE' });
    });

    it('refuses a Cold Funnel that has no open stage', async () => {
      const funnel = await asA('post', '/crm/masters/pipelines', { name: 'Cold Funnel' });
      expect(funnel.status).toBe(201);
      conv.funnel = funnel.body.data.id;
      expect(funnel.body.data.code).toBe('COLD_FUNNEL');
      expect((await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'Won', sort_order: 0, is_won: 1 })).status).toBe(201);
      const response = await convert(a.token, conv.lead);
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/has no open stage/);
      expect(cadenceOf(await row(conv.lead))).toMatchObject({ status: 'ACTIVE' });
    });

    it('is refused for a member without outreach and lead rights, and for another workspace', async () => {
      const first = await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'First touch', sort_order: 1 });
      conv.firstStage = first.body.data.id;
      await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'Qualified', sort_order: 2 });

      expect((await convert(restricted.token, conv.lead)).status).toBe(403);
      // Workspace B, with a Cold Funnel of its own, cannot tell the lead exists.
      const bFunnel = await asB('post', '/crm/masters/pipelines', { name: 'Cold Funnel' });
      expect((await asB('post', '/crm/masters/stages', { pipeline_id: bFunnel.body.data.id, name: 'B first', sort_order: 1 })).status).toBe(201);
      const fromB = await convert(b.token, conv.lead);
      expect([fromB.status, fromB.body.message]).toEqual([404, 'Lead not found']);
      expect(cadenceOf(await row(conv.lead))).toMatchObject({ status: 'ACTIVE' });
    });

    it('moves the same lead into the Cold Funnel first open stage, keeping its details', async () => {
      const response = await convert(a.token, conv.lead, { budgetAmount: '150000.50', temperature: 'HOT', notes: 'Wants a demo next week' });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe(`Outreach one is now in Cold Funnel › First touch`);
      expect(response.body.data.lead).toMatchObject({ id: conv.lead, pipeline_id: conv.funnel, stage_id: conv.firstStage, pipeline_name: 'Cold Funnel', stage_name: 'First touch' });

      const saved = await row(conv.lead);
      expect(saved).toMatchObject({ tenant_id: a.tenantId, pipeline_id: conv.funnel, stage_id: conv.firstStage, temperature: 'HOT', company_name: 'Outreach one', phone: '+91 90000 11111' });
      expect(saved.budget_amount?.toString()).toBe('150000.5');
      expect(cadenceOf(saved)).toMatchObject({ status: 'CONVERTED', convertedToOpportunity: true });
      // Opportunities are leads: nothing was duplicated.
      expect(await prisma.rndtechnosoft_crm_leads.count({ where: { tenant_id: a.tenantId, email: `omar.one.${SUFFIX}@outreach.test` } })).toBe(1);
      const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirst({ where: { lead_id: conv.lead, title: { startsWith: 'Converted from Client Outreach' } } });
      expect(activity).toMatchObject({ tenant_id: a.tenantId, description: 'Wants a demo next week' });
    });

    it('appears in the Sales Pipeline list and the Cold Funnel, and under Converted in outreach', async () => {
      const all = await asA('get', '/crm/leads?page=1&limit=100');
      const listed = all.body.data.leads.find((l: { id: string }) => l.id === conv.lead);
      expect(listed).toMatchObject({ pipeline_id: conv.funnel, stage_id: conv.firstStage, pipeline_name: 'Cold Funnel' });
      expect(listIds(await asA('get', `/crm/leads?pipelineId=${conv.funnel}`))).toContain(conv.lead);
      expect(listIds(await asB('get', '/crm/leads'))).not.toContain(conv.lead);

      const outreach = await asA('get', '/crm/cadence');
      expect(outreach.body.data.radar.converted.map((l: { id: string }) => l.id)).toContain(conv.lead);
    });

    it('converts a lead once, even when asked twice at the same time', async () => {
      expect((await convert(a.token, conv.lead)).status).toBe(409);

      const twice = await coldLead('two');
      const results = await Promise.all([convert(a.token, twice), convert(a.token, twice)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      const activities = await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: twice, title: { startsWith: 'Converted from Client Outreach' } } });
      expect(activities).toBe(1);
    });

    it('rejects a negative deal value and unknown actions instead of reporting success', async () => {
      const three = await coldLead('three');
      expect((await convert(a.token, three, { budgetAmount: -5 })).status).toBe(400);
      expect(cadenceOf(await row(three))).toMatchObject({ status: 'ACTIVE' });
      const unknown = await call('post', '/crm/cadence', a.token, { action: 'NOT_AN_ACTION', leadId: three });
      expect(unknown.status).toBe(400);
      // Reply branches sent by the screens as BRANCH_REPLY are recorded.
      const branch = await call('post', '/crm/cadence', a.token, { action: 'BRANCH_REPLY', leadId: three, branchKey: 'already_have_website', feedbackNotes: 'Call me' });
      expect(branch.status).toBe(201);
      expect(cadenceOf(await row(three))).toMatchObject({ status: 'BRANCHED', branchReply: { branchKey: 'already_have_website', leadFeedback: 'Call me' } });
    });
  });

  describe('deleting', () => {
    it('deletes follow-ups, meetings, quotations, masters and leads in A', async () => {
      for (const [label, path] of [
        ['follow-up', `/crm/followups/${ids.followup}`],
        ['meeting', `/crm/meetings/${ids.meeting}`],
        ['quotation', `/crm/quotations/${ids.quotation}`],
        ['service', `/crm/masters/services?id=${ids.service}`],
        ['source', `/crm/masters/sources?id=${ids.source}`],
        ['industry', `/crm/masters/industries?id=${ids.industry}`],
      ]) {
        expect([label, (await asA('delete', path)).status]).toEqual([label, 200]);
      }
      expect(await prisma.rndtechnosoft_crm_quotation_items.count({ where: { quotation_id: ids.quotation } })).toBe(0);

      const deleted = await asA('delete', `/crm/leads/${ids.lead}`);
      expect(deleted.status).toBe(200);
      expect((await asA('get', `/crm/leads/${ids.lead}`)).status).toBe(404);
    });
  });
});
