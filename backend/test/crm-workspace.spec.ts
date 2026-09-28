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

    it('edits a draft quotation with totals recalculated, and keeps issued ones as they were (Quotations)', async () => {
      // Bad input is refused clearly instead of failing inside the server.
      expect((await asA('post', '/crm/quotations', { leadId: ids.lead, items: [{ description: 'X', quantity: 'two', unitRate: 10 }] })).body.message).toBe('Line 1: enter the quantity as a number.');
      expect((await asA('post', '/crm/quotations', { leadId: ids.lead, validDays: 0, items: [{ description: 'X', quantity: 1, unitRate: 10 }] })).status).toBe(400);

      const draft = await asA('post', '/crm/quotations', {
        leadId: ids.lead,
        validDays: 15,
        notes: 'Phase 1 only',
        items: [{ description: 'Audit', quantity: 1, unitRate: '500' }],
      });
      expect(draft.status).toBe(201);
      const id = draft.body.data.id as string;
      expect(await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id } })).toMatchObject({ notes: 'Phase 1 only', quotation_status: 'DRAFT' });

      // New lines and inter-state tax: 3 × 250.50 = 751.50; IGST 18 % = 135.27; total 886.77.
      const edited = await asA('put', `/crm/quotations/${id}`, {
        taxMode: 'INTER_STATE',
        items: [{ description: 'Audit and report', quantity: '3', unitRate: '250.50', sacCode: '998314' }],
      });
      expect(edited.status).toBe(200);
      const stored = await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id } });
      expect([stored.tax_mode, stored.subtotal.toFixed(2), stored.cgst_amount.toFixed(2), stored.igst_amount.toFixed(2), stored.total_amount.toFixed(2)]).toEqual([
        'INTER_STATE', '751.50', '0.00', '135.27', '886.77',
      ]);
      const lines = await prisma.rndtechnosoft_crm_quotation_items.findMany({ where: { quotation_id: id } });
      expect(lines.map((line) => [line.description, line.line_amount.toFixed(2), line.sac_code])).toEqual([['Audit and report', '751.50', '998314']]);

      // Changing only the tax type recalculates from the saved lines.
      await asA('put', `/crm/quotations/${id}`, { taxMode: 'INTRA_STATE' });
      const back = await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id } });
      expect([back.cgst_amount.toFixed(2), back.sgst_amount.toFixed(2), back.igst_amount.toFixed(2), back.total_amount.toFixed(2)]).toEqual(['67.64', '67.64', '0.00', '886.78']);

      expect((await asA('put', `/crm/quotations/${id}`, { status: 'LOST' })).status).toBe(400);
      expect((await asB('put', `/crm/quotations/${id}`, { items: [{ description: 'Hijacked', quantity: 1, unitRate: 1 }] })).status).toBe(404);

      // Once sent, its lines and amounts stay as issued.
      expect((await asA('put', `/crm/quotations/${id}`, { status: 'SENT' })).status).toBe(200);
      const locked = await asA('put', `/crm/quotations/${id}`, { items: [{ description: 'Changed', quantity: 1, unitRate: 1 }] });
      expect([locked.status, locked.body.message]).toEqual([409, `Only draft quotations can be edited. ${stored.quotation_number} is sent; change it back to draft first.`]);
      expect((await prisma.rndtechnosoft_crm_quotations.findUniqueOrThrow({ where: { id } })).total_amount.toFixed(2)).toBe('886.78');
      expect((await asA('delete', `/crm/quotations/${id}`)).status).toBe(200);
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
      expect(response.body.message).toMatch(/Cold Funnel, where converted leads go by default, is not set up/);
      const after = await row(conv.lead);
      expect([after.pipeline_id, after.stage_id]).toEqual([before.pipeline_id, before.stage_id]);
      expect(cadenceOf(after)).toMatchObject({ status: 'ACTIVE' });
    });

    it('refuses a Cold Funnel that has no open stage', async () => {
      const funnel = await asA('post', '/crm/masters/pipelines', { name: 'Cold Funnel' });
      expect(funnel.status).toBe(201);
      conv.funnel = funnel.body.data.id;
      expect(funnel.body.data.code).toBe('COLD_FUNNEL');
      const won = await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'Won', sort_order: 0, is_won: 1 });
      expect(won.status).toBe(201);
      conv.wonStage = won.body.data.id;
      const response = await convert(a.token, conv.lead);
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/has no open stage/);
      expect(cadenceOf(await row(conv.lead))).toMatchObject({ status: 'ACTIVE' });
    });

    it('is refused for a member without outreach and lead rights, and for another workspace', async () => {
      const first = await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'First touch', sort_order: 1 });
      conv.firstStage = first.body.data.id;
      conv.qualified = (await asA('post', '/crm/masters/stages', { pipeline_id: conv.funnel, name: 'Qualified', sort_order: 2 })).body.data.id;

      expect((await convert(restricted.token, conv.lead)).status).toBe(403);
      // Workspace B, with a Cold Funnel of its own, cannot tell the lead exists.
      const bFunnel = await asB('post', '/crm/masters/pipelines', { name: 'Cold Funnel' });
      const bStage = await asB('post', '/crm/masters/stages', { pipeline_id: bFunnel.body.data.id, name: 'B first', sort_order: 1 });
      expect(bStage.status).toBe(201);
      conv.bStage = bStage.body.data.id;
      conv.bFunnel = bFunnel.body.data.id;
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

    it('starts in the chosen Cold Funnel stage, and only an open stage of this workspace\'s Cold Funnel', async () => {
      const four = await coldLead('four');
      for (const [label, stageId] of [['won', conv.wonStage], ['other pipeline', ids.stage], ['other workspace', conv.bStage]]) {
        const refused = await convert(a.token, four, { stageId });
        expect([label, refused.status]).toEqual([label, 400]);
        expect(refused.body.message).toMatch(/not an open stage of the Cold Funnel pipeline/);
      }
      expect(cadenceOf(await row(four))).toMatchObject({ status: 'ACTIVE' });

      const response = await convert(a.token, four, { stageId: conv.qualified });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Outreach four is now in Cold Funnel › Qualified');
      expect(await row(four)).toMatchObject({ pipeline_id: conv.funnel, stage_id: conv.qualified });
    });

    it('goes to another pipeline when one is chosen, only an active pipeline of this workspace and one of its open stages', async () => {
      const five = await coldLead('five');
      for (const [label, extra, message] of [
        ['other workspace pipeline', { pipelineId: conv.bFunnel }, /not an active pipeline in this workspace/],
        ['not an id', { pipelineId: 'sales' }, /Choose the pipeline/],
        ['Cold Funnel stage in Sales', { pipelineId: ids.pipeline, stageId: conv.qualified }, /not an open stage of the Sales pipeline/],
      ] as const) {
        const refused = await convert(a.token, five, extra);
        expect([label, refused.status]).toEqual([label, 400]);
        expect(refused.body.message).toMatch(message);
      }
      expect(cadenceOf(await row(five))).toMatchObject({ status: 'ACTIVE' });

      const response = await convert(a.token, five, { pipelineId: ids.pipeline });
      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Outreach five is now in Sales › Fresh');
      expect(await row(five)).toMatchObject({ pipeline_id: ids.pipeline, stage_id: ids.stage });
      expect(cadenceOf(await row(five))).toMatchObject({ status: 'CONVERTED' });
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

  describe('outreach playbook (30-Day SOP steps)', () => {
    type Step = { id: string; day_number: number; day_offset: number; title: string; goal: string; channels: string[]; templates: Record<string, unknown> };
    const steps = async (as: typeof asA) => (await as('get', '/crm/masters/sop-steps')).body.data as Step[];
    const newStep = (day: number, extra: Record<string, unknown> = {}) => ({
      day_number: day,
      title: `Day ${day} check-in`,
      goal: 'Keep the conversation warm',
      channels: ['WHATSAPP', 'EMAIL'],
      timing_guide: 'WhatsApp (11:00 AM)',
      role_note: 'Friendly nudge',
      templates: { whatsapp: { message: 'Hi {{First Name}},\n\nJust checking in.' }, email: { subject: 'Quick check-in', body: 'Dear {{First Name}},' } },
      is_active: 1,
      ...extra,
    });
    const playbook: Ids = {};
    const current = async (leadId: string) => {
      const matrix = await asA('get', '/crm/cadence');
      return matrix.body.data.radar.allActive.find((l: { id: string }) => l.id === leadId)?.currentStep as { dayNumber: number; title: string };
    };

    it('starts on the default playbook, which a workspace can still edit', async () => {
      const defaults = await steps(asA);
      expect(defaults.map((st) => st.day_number)).toEqual([1, 5, 10, 15, 20, 25, 30]);
      expect(defaults[0]).toMatchObject({ id: 'default-day-1', day_offset: 0, title: 'Triple Platform Launch', goal: 'Make the First Impression' });
      expect(await prisma.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: a.tenantId } })).toBe(0);
    });

    it('is refused to a member without the playbook permission', async () => {
      expect((await call('post', '/crm/masters/sop-steps', restricted.token, newStep(3))).status).toBe(403);
      expect(await prisma.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: a.tenantId } })).toBe(0);
    });

    it('adds a step in day order, keeping its messages, and only in this workspace', async () => {
      const lead = await asA('post', '/crm/leads', { companyName: 'Playbook Co', firstName: 'Priya', email: `priya.${SUFFIX}@playbook.test`, temperature: 'COLD' });
      expect(lead.status).toBe(201);
      playbook.lead = lead.body.data.id;
      expect((await current(playbook.lead)).dayNumber).toBe(1);

      const added = await asA('post', '/crm/masters/sop-steps', newStep(3));
      expect(added.status).toBe(201);
      expect(added.body.message).toBe('Day 3 step added to the outreach playbook');
      playbook.day3 = added.body.data.id;

      const saved = await steps(asA);
      expect(saved.map((st) => st.day_number)).toEqual([1, 3, 5, 10, 15, 20, 25, 30]);
      // The defaults were copied in, messages and all, so the workspace owns them now.
      expect(saved[0]).toMatchObject({ title: 'Triple Platform Launch' });
      expect(saved[0].id).toMatch(/^[0-9a-f-]{36}$/);
      expect((saved[0].templates as { whatsapp?: { message: string } }).whatsapp?.message).toContain('{{First Name}}');
      expect(saved[1]).toMatchObject({ id: playbook.day3, day_offset: 2, title: 'Day 3 check-in', channels: ['WHATSAPP', 'EMAIL'] });
      expect((saved[1].templates as { whatsapp: { message: string } }).whatsapp.message).toBe('Hi {{First Name}},\n\nJust checking in.');
      const audit = await prisma.rndtechnosoft_crm_audit_logs.findFirst({ where: { tenant_id: a.tenantId, entity_type: 'SOP_STEP', action_type: 'CREATE' } });
      expect(audit?.entity_id).toBe(playbook.day3);

      expect((await steps(asB)).map((st) => st.day_number)).toEqual([1, 5, 10, 15, 20, 25, 30]);
    });

    it('refuses a second step on the same day, and steps that are not complete', async () => {
      const again = await asA('post', '/crm/masters/sop-steps', newStep(3, { title: 'Another' }));
      expect([again.status, again.body.message]).toEqual([409, 'Day 3 already has a step ("Day 3 check-in"). Choose another day, or edit that step.']);
      for (const [label, body, message] of [
        ['no channel', newStep(4, { channels: [] }), /at least one channel/],
        ['day 0', newStep(0), /from 1 to 60/],
        ['day 61', newStep(61), /from 1 to 60/],
        ['no title', newStep(4, { title: '  ' }), /Enter the step title/],
        ['no goal', newStep(4, { goal: '' }), /Enter the strategic goal/],
      ] as const) {
        const refused = await asA('post', '/crm/masters/sop-steps', body);
        expect([label, refused.status]).toEqual([label, 400]);
        expect(refused.body.message).toMatch(message);
      }
      expect(await prisma.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: a.tenantId } })).toBe(8);
    });

    it('edits a step, and another workspace cannot touch it', async () => {
      const edited = await asA('put', '/crm/masters/sop-steps', { ...newStep(3), id: playbook.day3, title: 'Day 3 value share' });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ id: playbook.day3, day_number: 3, title: 'Day 3 value share' });

      expect((await asB('put', '/crm/masters/sop-steps', { ...newStep(3), id: playbook.day3, title: 'Hijacked' })).status).toBe(404);
      expect((await asB('delete', `/crm/masters/sop-steps?id=${playbook.day3}`)).status).toBe(404);
      expect(await prisma.rndtechnosoft_crm_sop_steps_master.findFirst({ where: { id: playbook.day3 } })).toMatchObject({ tenant_id: a.tenantId, title: 'Day 3 value share' });
      expect(await prisma.rndtechnosoft_crm_sop_steps_master.count({ where: { tenant_id: b.tenantId } })).toBe(0);
    });

    it('drives Client Outreach: leads meet new steps in day order and never skip one that is removed', async () => {
      const done = await call('post', '/crm/cadence', a.token, { action: 'COMPLETE_STEP', leadId: playbook.lead, channel: 'WHATSAPP' });
      expect(done.status).toBe(201);
      expect(await current(playbook.lead)).toMatchObject({ dayNumber: 3, title: 'Day 3 value share' });

      expect((await asA('delete', `/crm/masters/sop-steps?id=${playbook.day3}`)).status).toBe(200);
      expect((await current(playbook.lead)).dayNumber).toBe(5);
      await call('post', '/crm/cadence', a.token, { action: 'COMPLETE_STEP', leadId: playbook.lead });
      const lead = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: playbook.lead } });
      const cadence = (lead.custom_attributes as { cadence: { completedSteps: { dayNumber: number }[] } }).cadence;
      expect(cadence.completedSteps.map((st) => st.dayNumber)).toEqual([1, 5]);
      expect((await current(playbook.lead)).dayNumber).toBe(10);
    });

    it('copies the defaults once when two changes arrive together, and keeps at least one step', async () => {
      const both = await Promise.all([asB('post', '/crm/masters/sop-steps', newStep(2)), asB('post', '/crm/masters/sop-steps', newStep(3))]);
      expect(both.map((r) => r.status)).toEqual([201, 201]);
      const saved = await steps(asB);
      expect(saved.map((st) => st.day_number)).toEqual([1, 2, 3, 5, 10, 15, 20, 25, 30]);

      for (const step of saved.slice(1)) expect((await asB('delete', `/crm/masters/sop-steps?id=${step.id}`)).status).toBe(200);
      const last = await asB('delete', `/crm/masters/sop-steps?id=${saved[0].id}`);
      expect(last.status).toBe(409);
      expect(last.body.message).toMatch(/needs at least one step/);
      expect((await steps(asB)).map((st) => st.day_number)).toEqual([1]);
    });
  });

  describe('objection strategies (reply branches)', () => {
    type Branch = { id: string; branch_key: string; label: string; next_lead_temperature: string; whatsapp_message: string; email_subject: string };
    const branches = async (as: typeof asA) => (await as('get', '/crm/masters/sop-branches')).body.data as Branch[];
    const strategy = (extra: Record<string, unknown> = {}) => ({
      label: 'Pricing too high',
      next_lead_temperature: 'WARM',
      trigger_condition: 'Prospect says: "Too expensive"',
      suggested_action: 'Offer a phased plan',
      whatsapp_message: 'Understood {{First Name}}! We can phase it.',
      email_subject: 'A phased plan',
      email_body: 'Dear {{First Name}},',
      is_active: 1,
      ...extra,
    });
    const found: Ids = {};

    it('starts on the default strategies, and is refused to a member without the playbook permission', async () => {
      const defaults = await branches(asA);
      expect(defaults.map((br) => br.branch_key)).toEqual(['already_have_website', 'send_details', 'call_me_later', 'interested_in_seo', 'not_interested']);
      expect(defaults[0].id).toBe('default-branch-already_have_website');
      expect(defaults[0].whatsapp_message).toContain('{{First Name}}');
      expect((await call('post', '/crm/masters/sop-branches', restricted.token, strategy())).status).toBe(403);
      expect(await prisma.rndtechnosoft_crm_sop_reply_branches_master.count({ where: { tenant_id: a.tenantId } })).toBe(0);
    });

    it('adds a strategy with its messages, only in this workspace', async () => {
      const added = await asA('post', '/crm/masters/sop-branches', strategy());
      expect(added.status).toBe(201);
      expect(added.body.message).toBe('Objection strategy "Pricing too high" added');
      found.pricing = added.body.data.id;
      expect(added.body.data).toMatchObject({ branch_key: 'pricing_too_high', next_lead_temperature: 'WARM', email_subject: 'A phased plan' });

      const saved = await branches(asA);
      expect(saved.map((br) => br.branch_key)).toEqual(['already_have_website', 'send_details', 'call_me_later', 'interested_in_seo', 'not_interested', 'pricing_too_high']);
      expect(saved[0].id).toMatch(/^[0-9a-f-]{36}$/);
      // The same label again gets its own key.
      const twin = await asA('post', '/crm/masters/sop-branches', strategy());
      expect(twin.body.data.branch_key).toBe('pricing_too_high_2');
      expect((await asA('delete', `/crm/masters/sop-branches?id=${twin.body.data.id}`)).status).toBe(200);

      expect((await branches(asB)).length).toBe(5);
      expect(await prisma.rndtechnosoft_crm_audit_logs.count({ where: { tenant_id: a.tenantId, entity_type: 'SOP_BRANCH', entity_id: found.pricing } })).toBe(1);
    });

    it('refuses incomplete strategies', async () => {
      for (const [label, body, message] of [
        ['no label', strategy({ label: '' }), /Enter the objection label/],
        ['no WhatsApp script', strategy({ whatsapp_message: '   ' }), /Enter the whatsapp response script/],
        ['bad temperature', strategy({ next_lead_temperature: 'BOILING' }), /HOT, WARM, COLD or LOST/],
      ] as const) {
        const refused = await asA('post', '/crm/masters/sop-branches', body);
        expect([label, refused.status]).toEqual([label, 400]);
        expect(refused.body.message).toMatch(message);
      }
    });

    it('edits a strategy without changing its key, and another workspace cannot touch it', async () => {
      const edited = await asA('put', '/crm/masters/sop-branches', { ...strategy({ label: 'Budget is tight', next_lead_temperature: 'COLD' }), id: found.pricing });
      expect(edited.status).toBe(200);
      expect(edited.body.data).toMatchObject({ id: found.pricing, branch_key: 'pricing_too_high', label: 'Budget is tight', next_lead_temperature: 'COLD' });
      expect((await asB('put', '/crm/masters/sop-branches', { ...strategy(), id: found.pricing })).status).toBe(404);
      expect((await asB('delete', `/crm/masters/sop-branches?id=${found.pricing}`)).status).toBe(404);
      expect(await prisma.rndtechnosoft_crm_sop_reply_branches_master.findFirst({ where: { id: found.pricing } })).toMatchObject({ tenant_id: a.tenantId, label: 'Budget is tight' });
    });

    it("drives Client Outreach: a reply takes this workspace's strategy, and unknown ones are refused", async () => {
      const lead = await asA('post', '/crm/leads', { companyName: 'Objection Co', firstName: 'Ravi', email: `ravi.${SUFFIX}@objection.test`, temperature: 'COLD' });
      found.lead = lead.body.data.id;
      const matrix = await asA('get', '/crm/cadence');
      expect(Object.keys(matrix.body.data.replyBranches)).toContain('pricing_too_high');

      const reply = await call('post', '/crm/cadence', a.token, { action: 'BRANCH_REPLY', leadId: found.lead, branchKey: 'pricing_too_high', feedbackNotes: 'Too pricey' });
      expect(reply.status).toBe(201);
      expect(await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: found.lead } })).toMatchObject({ temperature: 'COLD' });

      for (const branchKey of ['no_such_strategy', '__proto__']) {
        const unknown = await call('post', '/crm/cadence', a.token, { action: 'BRANCH_REPLY', leadId: found.lead, branchKey });
        expect([branchKey, unknown.status]).toEqual([branchKey, 400]);
      }
      // Lead 360 gets the same strategies.
      expect(Object.keys((await asA('get', `/crm/leads/${found.lead}`)).body.data.reply_branches)).toContain('pricing_too_high');
    });

    it('removes strategies but keeps at least one', async () => {
      const list = await branches(asB);
      for (const br of list.slice(1)) expect((await asB('delete', `/crm/masters/sop-branches?id=${br.id}`)).status).toBe(200);
      const last = await asB('delete', `/crm/masters/sop-branches?id=${list[0].id}`);
      expect([last.status, last.body.message]).toEqual([409, 'Keep at least one objection strategy. Add another before removing this one.']);
    });
  });

  describe('deleting masters that are in use', () => {
    it('refuses a stage or pipeline that has leads, saying how many, and changes nothing', async () => {
      const inStage = await prisma.rndtechnosoft_crm_leads.findMany({ where: { stage_id: ids.stage }, select: { id: true } });
      expect(inStage.length).toBeGreaterThan(0);
      const stage = await asA('delete', `/crm/masters/stages?id=${ids.stage}`);
      expect(stage.status).toBe(409);
      expect(stage.body.message).toMatch(/^\d+ leads? (is|are) in "Fresh"\. Move them to another stage on the Sales Pipeline board, then delete it\.$/);
      const pipeline = await asA('delete', `/crm/masters/pipelines?id=${ids.pipeline}`);
      expect(pipeline.status).toBe(409);
      expect(pipeline.body.message).toMatch(/are in the "Sales" pipeline\. Move them to another pipeline, then delete it\./);
      expect(await prisma.rndtechnosoft_crm_stages.count({ where: { id: ids.stage } })).toBe(1);
      expect(stage.body.message.startsWith(`${inStage.length} lead`)).toBe(true);
      expect(await prisma.rndtechnosoft_crm_leads.findMany({ where: { stage_id: ids.stage }, select: { id: true } })).toEqual(inStage);
    });

    it('deletes an empty stage', async () => {
      const empty = await asA('post', '/crm/masters/stages', { pipeline_id: ids.pipeline, name: 'Unused', sort_order: 9 });
      expect((await asA('delete', `/crm/masters/stages?id=${empty.body.data.id}`)).status).toBe(200);
      expect(await prisma.rndtechnosoft_crm_stages.count({ where: { id: empty.body.data.id } })).toBe(0);
    });

    it('refuses a source, service or lost reason that leads use', async () => {
      const lead = await asA('post', '/crm/leads', { companyName: 'Sourced Co', firstName: 'Anu', email: `anu.${SUFFIX}@sourced.test`, sourceId: ids.source, primaryServiceId: ids.service });
      expect(lead.status).toBe(201);
      const source = await asA('delete', `/crm/masters/sources?id=${ids.source}`);
      expect([source.status, source.body.message]).toEqual([409, `"Referral ${SUFFIX}" is the source of 1 lead, so it can't be deleted. Change their source first.`]);
      const service = await asA('delete', `/crm/masters/services?id=${ids.service}`);
      expect(service.status).toBe(409);
      expect(service.body.message).toMatch(new RegExp(`^"Audit\\+ ${SUFFIX}" is the service on 1 lead( and \\d+ quotation lines?)?, so it can't be deleted\\. Change their service first\\.$`));

      // Added from Masters, only by members allowed to.
      expect((await call('post', '/crm/masters/lost-reasons', restricted.token, { reason_name: 'x' })).status).toBe(403);
      expect((await asA('post', '/crm/masters/lost-reasons', { reason_name: '  ' })).status).toBe(400);
      const added = await asA('post', '/crm/masters/lost-reasons', { reason_name: '  Went with a competitor ', is_active: 1 });
      expect([added.status, added.body.message]).toEqual([201, 'Lost reason added']);
      const reason = await prisma.rndtechnosoft_crm_lost_reasons_master.findUniqueOrThrow({ where: { id: added.body.data.id } });
      expect(reason).toMatchObject({ tenant_id: a.tenantId, reason_name: 'Went with a competitor', is_active: true });
      await prisma.rndtechnosoft_crm_leads.update({ where: { id: lead.body.data.id }, data: { lost_reason_id: reason.id } });
      expect((await call('delete', `/crm/masters/lost-reasons?id=${reason.id}`, restricted.token)).status).toBe(403);
      const inUse = await asA('delete', `/crm/masters/lost-reasons?id=${reason.id}`);
      expect([inUse.status, inUse.body.message]).toEqual([409, `"Went with a competitor" is the lost reason of 1 lead, so it can't be deleted.`]);

      // Renaming one keeps it on the lead; only members allowed to, and only in its workspace.
      const renamed = await asA('put', '/crm/masters/lost-reasons', { id: reason.id, reason_name: 'Chose a competitor', is_active: 0 });
      expect([renamed.status, renamed.body.message]).toEqual([200, 'Lost reason updated']);
      expect(await prisma.rndtechnosoft_crm_lost_reasons_master.findUniqueOrThrow({ where: { id: reason.id } })).toMatchObject({ reason_name: 'Chose a competitor', is_active: false });
      expect(await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.body.data.id } })).toMatchObject({ lost_reason_id: reason.id });
      expect((await asA('put', '/crm/masters/lost-reasons', { id: reason.id, reason_name: '' })).status).toBe(400);
      expect((await call('put', '/crm/masters/lost-reasons', restricted.token, { id: reason.id, reason_name: 'x' })).status).toBe(403);
      expect((await asB('put', '/crm/masters/lost-reasons', { id: reason.id, reason_name: 'Hijacked' })).status).toBe(404);

      // Once nothing uses them, they go.
      expect((await asA('delete', `/crm/leads/${lead.body.data.id}`)).status).toBe(200);
      expect((await asA('delete', `/crm/masters/lost-reasons?id=${reason.id}`)).status).toBe(200);
    });

    it('deletes a quotation template, only in its own workspace, and reports a missing record', async () => {
      const template = await prisma.rndtechnosoft_crm_quotation_templates.create({ data: { id: randomUUID(), tenant_id: a.tenantId, template_name: 'Starter', items_json: [] } });
      expect((await asB('delete', `/crm/quotation-templates?id=${template.id}`)).status).toBe(404);
      expect((await asA('delete', `/crm/quotation-templates?id=${template.id}`)).status).toBe(200);
      expect((await asA('delete', `/crm/quotation-templates?id=${template.id}`)).status).toBe(404);
      expect((await asA('delete', '/crm/masters/stages?id=not-an-id')).status).toBe(404);
    });
  });

  describe('editing pipelines and moving stages', () => {
    const edit: Ids = {};

    it('renames a pipeline, changes its code, and makes it the only default', async () => {
      const created = await asA('post', '/crm/masters/pipelines', { name: 'Retainers' });
      edit.pipeline = created.body.data.id;
      const updated = await asA('put', '/crm/masters/pipelines', { id: edit.pipeline, name: 'Monthly retainers', code: 'RETAINERS', is_default: 1, is_active: 1 });
      expect(updated.status).toBe(200);
      expect(updated.body.data).toMatchObject({ name: 'Monthly retainers', code: 'RETAINERS', is_default: true });
      const defaults = await prisma.rndtechnosoft_crm_pipelines.findMany({ where: { tenant_id: a.tenantId, is_default: true }, select: { id: true } });
      expect(defaults).toEqual([{ id: edit.pipeline }]);
    });

    it('refuses a code another pipeline uses in any case, a blank name, and another workspace', async () => {
      const clash = await asA('put', '/crm/masters/pipelines', { id: edit.pipeline, name: 'Monthly retainers', code: 'cold_funnel' });
      expect([clash.status, clash.body.message]).toEqual([409, 'The "Cold Funnel" pipeline already uses the code cold_funnel. Choose another code.']);
      expect((await asA('put', '/crm/masters/pipelines', { id: edit.pipeline, name: '  ' })).status).toBe(400);
      expect((await asB('put', '/crm/masters/pipelines', { id: edit.pipeline, name: 'Hijacked' })).status).toBe(404);
      expect(await prisma.rndtechnosoft_crm_pipelines.findUniqueOrThrow({ where: { id: edit.pipeline } })).toMatchObject({ name: 'Monthly retainers', code: 'RETAINERS' });
    });

    it('moves an empty stage to another pipeline, but not one with leads in it', async () => {
      const inUse = await asA('put', '/crm/masters/stages', { id: ids.stage, name: 'Fresh', pipeline_id: edit.pipeline });
      expect(inUse.status).toBe(409);
      expect(inUse.body.message).toMatch(/leads? (is|are) in "Fresh", so it can't move to another pipeline\. Move them to another stage on the Sales Pipeline board first\.$/);
      expect(await prisma.rndtechnosoft_crm_stages.findUniqueOrThrow({ where: { id: ids.stage } })).toMatchObject({ pipeline_id: ids.pipeline });

      const empty = await asA('post', '/crm/masters/stages', { pipeline_id: ids.pipeline, name: 'Proposal', sort_order: 5 });
      const moved = await asA('put', '/crm/masters/stages', { id: empty.body.data.id, name: 'Proposal sent', pipeline_id: edit.pipeline });
      expect(moved.status).toBe(200);
      expect(await prisma.rndtechnosoft_crm_stages.findUniqueOrThrow({ where: { id: empty.body.data.id } })).toMatchObject({ pipeline_id: edit.pipeline, name: 'Proposal sent' });

      const bPipeline = await prisma.rndtechnosoft_crm_pipelines.findFirstOrThrow({ where: { tenant_id: b.tenantId } });
      expect((await asA('put', '/crm/masters/stages', { id: empty.body.data.id, name: 'Proposal sent', pipeline_id: bPipeline.id })).status).toBe(404);
      expect(await prisma.rndtechnosoft_crm_stages.findUniqueOrThrow({ where: { id: empty.body.data.id } })).toMatchObject({ pipeline_id: edit.pipeline });
    });

    it('lists each pipeline with its real number of stages and deals', async () => {
      const listed = (await asA('get', '/crm/masters/pipelines')).body.data as { id: string; stages_count: number; leads_count: number }[];
      expect(listed.find((p) => p.id === edit.pipeline)).toMatchObject({ stages_count: 1, leads_count: 0 });
      const sales = listed.find((p) => p.id === ids.pipeline);
      expect(sales).toMatchObject({
        stages_count: await prisma.rndtechnosoft_crm_stages.count({ where: { pipeline_id: ids.pipeline } }),
        leads_count: await prisma.rndtechnosoft_crm_leads.count({ where: { pipeline_id: ids.pipeline } }),
      });
      expect(sales!.leads_count).toBeGreaterThan(0);
    });
  });

  describe('editing lead sources', () => {
    it('renames a source and changes its channel and status, only for members allowed to and only in its workspace', async () => {
      const updated = await asA('put', '/crm/masters/sources', { id: ids.source, name: `Partner referral ${SUFFIX}`, channel: 'Referral', is_active: 0 });
      expect([updated.status, updated.body.message]).toEqual([200, 'Lead source updated']);
      expect(await prisma.rndtechnosoft_crm_lead_sources.findUniqueOrThrow({ where: { id: ids.source } })).toMatchObject({
        name: `Partner referral ${SUFFIX}`, channel: 'Referral', is_active: false,
      });

      expect((await asA('put', '/crm/masters/sources', { id: ids.source, name: ' ' })).status).toBe(400);
      expect((await call('put', '/crm/masters/sources', restricted.token, { id: ids.source, name: 'x' })).status).toBe(403);
      expect((await asB('put', '/crm/masters/sources', { id: ids.source, name: 'Hijacked' })).status).toBe(404);
      expect((await asA('put', '/crm/masters/sources', { id: randomUUID(), name: 'Nobody' })).status).toBe(404);
      expect(await prisma.rndtechnosoft_crm_lead_sources.findUniqueOrThrow({ where: { id: ids.source } })).toMatchObject({ name: `Partner referral ${SUFFIX}` });
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
