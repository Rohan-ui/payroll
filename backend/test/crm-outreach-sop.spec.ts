import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { deleteCrmData } from './support/crm-cleanup';
import { CADENCE_STEPS_MASTER } from '@/modules/crm/crm-cadence.helper';

/**
 * Client Outreach follows the playbook in CRM Masters over HTTP: its steps,
 * their order, titles, channels and templates; adding, removing and
 * reordering steps changes what Client Outreach shows and where leads go
 * next, without rewriting what leads already did. Replies and conversions are
 * states of a lead, not playbook steps. Each workspace has its own playbook.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Outreach-Sop-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Step = { id: string; day_number: number; title: string; goal: string; channels: string[]; timing_guide: string; role_note: string; templates: Record<string, any> };
type MasterStep = { id: string; dayNumber: number; title: string; channels: string[]; templates: Record<string, any> };

describe('Client Outreach follows the CRM Masters playbook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `sop-a-${SUFFIX}@sop.test` };
  const b = { tenantId: '', token: '', email: `sop-b-${SUFFIX}@sop.test` };
  const lead = { first: '', second: '', branched: '', converted: '' };
  let salesPipeline = '';
  let salesStage = '';

  const call = (method: 'get' | 'post' | 'put' | 'delete', url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const outreach = async (token = a.token) => (await call('get', '/crm/cadence?limit=50', token)).body.data;
  const masterSteps = async (token = a.token) => (await outreach(token)).masterSteps as MasterStep[];
  const steps = async (token = a.token) => (await call('get', '/crm/masters/sop-steps', token)).body.data as Step[];
  const stepByDay = async (day: number) => (await steps()).find((s) => s.day_number === day)!;
  const save = (step: Step, changes: Partial<Step>) => call('put', '/crm/masters/sop-steps', a.token, { ...step, ...changes });
  const leadAt = async (leadId: string) => (await call('get', `/crm/leads/${leadId}`, a.token)).body.data.cadence_current_step_id as string | null;
  const complete = (leadId: string) => call('post', '/crm/cadence', a.token, { action: 'COMPLETE_STEP', leadId, notes: 'Done' });

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Sop ${label} ${SUFFIX}`, tenantCode: `SOP${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
  }
  async function coldLead(name: string) {
    const created = await call('post', '/crm/leads', a.token, { companyName: `${name} ${SUFFIX}`, firstName: name, email: `${name.toLowerCase()}-${SUFFIX}@client.test`, temperature: 'COLD' });
    expect(created.status).toBe(201);
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
    await register(a, 'A');
    await register(b, 'B');
    salesPipeline = (await call('post', '/crm/masters/pipelines', a.token, { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true })).body.data.id;
    salesStage = (await call('post', '/crm/masters/stages', a.token, { pipeline_id: salesPipeline, name: 'New', sort_order: 1 })).body.data.id;
    lead.first = await coldLead('Asha');
    lead.second = await coldLead('Bala');
    lead.branched = await coldLead('Chirag');
    lead.converted = await coldLead('Divya');
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

  it('shows the playbook’s 7 milestones, counted from every enrolled lead, and nothing else as a milestone', async () => {
    const data = await outreach();
    expect(data.sop).toEqual({ name: '30-Day Multi-Touch SOP', milestones: 7, days: 30 });
    expect(data.masterSteps.map((s: MasterStep) => s.dayNumber)).toEqual([1, 5, 10, 15, 20, 25, 30]);
    expect(data.masterSteps.map((s: MasterStep) => s.title)).not.toContain('Branched / Responded');
    expect(data.facets.milestoneCounts).toEqual({ [data.masterSteps[0].id]: 4 });
  });

  it('shows a renamed milestone with its new channels and templates at once, in its workspace only', async () => {
    const day5 = await stepByDay(5);
    const saved = await save(day5, {
      title: 'Day 5: Customer Success Story', channels: ['EMAIL', 'LINKEDIN'],
      templates: { ...day5.templates, email: { subject: 'How we helped {{Company Name}}', body: 'A short story.' } },
    });
    expect(saved.status).toBe(200);
    const shown = (await masterSteps()).find((s) => s.dayNumber === 5)!;
    expect(shown).toMatchObject({ title: 'Day 5: Customer Success Story', channels: ['EMAIL', 'LINKEDIN'] });
    expect(shown.templates.email.subject).toBe('How we helped {{Company Name}}');
    expect((await masterSteps()).map((s) => s.title)).not.toContain(CADENCE_STEPS_MASTER[1].title);
    expect((await masterSteps(b.token)).find((s) => s.dayNumber === 5)!.title).toBe(CADENCE_STEPS_MASTER[1].title);
  });

  it('adds a milestone in its place in the sequence, and removes it again', async () => {
    const day12 = { ...(await stepByDay(10)), id: undefined, day_number: 12, title: 'Day 12: Industry Insight', channels: ['EMAIL'] };
    const added = await call('post', '/crm/masters/sop-steps', a.token, day12);
    expect(added.status).toBe(201);
    let data = await outreach();
    expect(data.sop.milestones).toBe(8);
    expect(data.masterSteps.map((s: MasterStep) => s.dayNumber)).toEqual([1, 5, 10, 12, 15, 20, 25, 30]);
    expect((await call('delete', `/crm/masters/sop-steps?id=${added.body.data.id}`, a.token)).status).toBe(200);
    data = await outreach();
    expect(data.sop.milestones).toBe(7);
    expect(data.masterSteps.map((s: MasterStep) => s.dayNumber)).toEqual([1, 5, 10, 15, 20, 25, 30]);
  });

  it('follows the order dragged in Masters, for display and for where a lead goes next', async () => {
    const ordered = await steps();
    const [d1, d5, d10, ...rest] = ordered;
    const reordered = await call('post', '/crm/masters/reorder', a.token, { masterType: 'sop_steps', orderedIds: [d1.id, d10.id, d5.id, ...rest.map((s) => s.id)] });
    expect(reordered.status).toBe(200);
    expect((await masterSteps()).map((s) => s.dayNumber)).toEqual([1, 10, 5, 15, 20, 25, 30]);
    expect((await steps()).map((s) => s.day_number)).toEqual([1, 10, 5, 15, 20, 25, 30]);

    expect(await leadAt(lead.first)).toBe(d1.id);
    expect((await complete(lead.first)).status).toBe(201);
    expect(await leadAt(lead.first)).toBe(d10.id);
    expect((await complete(lead.first)).status).toBe(201);
    expect(await leadAt(lead.first)).toBe(d5.id);
    // Day 5 comes after Day 10 here, so it is due at once rather than in the past.
    const cadence = ((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.first } })).custom_attributes as { cadence: { nextDueAt: string; completedSteps: { stepId: string; dayNumber: number }[] } }).cadence;
    expect(Date.parse(cadence.nextDueAt)).toBeGreaterThan(Date.now() - 86_400_000);
    expect(cadence.completedSteps.map((s) => [s.stepId, s.dayNumber])).toEqual([[d1.id, 1], [d10.id, 10]]);

    const counts = (await outreach()).facets.milestoneCounts;
    expect(counts[d5.id]).toBe(1);
  });

  it('refuses an order that is not the whole playbook, or names another workspace’s step', async () => {
    const ordered = await steps();
    expect((await call('post', '/crm/masters/reorder', a.token, { masterType: 'sop_steps', orderedIds: ordered.slice(1).map((s) => s.id) })).status).toBe(400);
    expect((await call('post', '/crm/masters/reorder', a.token, { masterType: 'sop_steps', orderedIds: [randomUUID(), ...ordered.slice(1).map((s) => s.id)] })).status).toBe(404);
    const otherWorkspace = (await steps(b.token)).map((s) => s.id);
    expect((await call('post', '/crm/masters/reorder', b.token, { masterType: 'sop_steps', orderedIds: ordered.map((s) => s.id) })).status).toBe(404);
    expect((await steps(b.token)).map((s) => s.id)).toEqual(otherWorkspace);
  });

  it('moves a lead on when its milestone is removed, keeping what it already did', async () => {
    expect((await complete(lead.second)).status).toBe(201);
    const at = await leadAt(lead.second);
    const atStep = (await steps()).find((s) => s.id === at)!;
    const activitiesBefore = await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: lead.second } });
    expect((await call('delete', `/crm/masters/sop-steps?id=${at}`, a.token)).status).toBe(200);
    const now = await leadAt(lead.second);
    expect(now).not.toBe(at);
    const order = (await steps()).map((s) => s.id);
    expect(order.includes(now!)).toBe(true);
    const cadence = ((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id: lead.second } })).custom_attributes as { cadence: { completedSteps: { dayNumber: number }[] } }).cadence;
    expect(cadence.completedSteps.map((s) => s.dayNumber)).toEqual([1]);
    expect(await prisma.rndtechnosoft_crm_lead_activities.count({ where: { lead_id: lead.second } })).toBe(activitiesBefore);
    expect(atStep.day_number).toBe(10);
  });

  it('keeps replies and conversions as lead states, outside the milestones', async () => {
    const branches = Object.keys((await call('get', `/crm/cadence?leadId=${lead.branched}`, a.token)).body.data.replyBranches);
    expect((await call('post', '/crm/cadence', a.token, { action: 'BRANCH_REPLY', leadId: lead.branched, branchKey: branches[0], feedbackNotes: 'Replied' })).status).toBe(201);
    const converted = await call('post', '/crm/cadence', a.token, { action: 'CONVERT_OPPORTUNITY', leadId: lead.converted, pipelineId: salesPipeline, stageId: salesStage });
    expect(converted.status).toBe(201);

    const data = await outreach();
    expect(data.stats).toMatchObject({ branchedCount: 1, convertedCount: 1 });
    expect(data.sop.milestones).toBe(data.masterSteps.length);
    const counted = Object.values(data.facets.milestoneCounts as Record<string, number>).reduce((sum, n) => sum + n, 0);
    expect(counted).toBe(2); // Only the two leads still working through the playbook.
    expect(data.radar.branched.map((l: { id: string }) => l.id)).toEqual([lead.branched]);
    expect(data.radar.converted.map((l: { id: string }) => l.id)).toEqual([lead.converted]);
  });
});
