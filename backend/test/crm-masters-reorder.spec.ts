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
 * Reordering in CRM Masters over HTTP: the order a person drags pipeline
 * stages (or pipelines) into is saved, and the sales pipeline board's data
 * comes back in that order. Only this workspace's records, all or nothing,
 * and a list that cannot be reordered is refused instead of reported saved.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Masters-Reorder-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

describe('CRM Masters reordering', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `reorder-a-${SUFFIX}@masters.test` };
  const b = { tenantId: '', token: '', email: `reorder-b-${SUFFIX}@masters.test` };
  const viewer = { token: '', email: `reorder-viewer-${SUFFIX}@masters.test` };
  const ids = { sales: '', funnel: '', stages: [] as string[], otherStage: '' };

  const call = (method: 'get' | 'post', url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const reorder = (token: string, masterType: string, orderedIds: unknown) => call('post', '/crm/masters/reorder', token, { masterType, orderedIds });
  /** The stage order the sales pipeline board receives for one pipeline. */
  const boardStages = async (pipelineId: string) =>
    ((await call('get', '/crm/leads?page=1&limit=1', a.token)).body.data.stages as { id: string; pipeline_id: string }[])
      .filter((s) => s.pipeline_id === pipelineId).map((s) => s.id);

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Reorder ${label} ${SUFFIX}`, tenantCode: `REO${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
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

    ids.sales = (await call('post', '/crm/masters/pipelines', a.token, { name: 'Sales', code: `SALES_${SUFFIX}` })).body.data.id;
    ids.funnel = (await call('post', '/crm/masters/pipelines', a.token, { name: 'Cold Funnel', code: `FUNNEL_${SUFFIX}` })).body.data.id;
    for (const [i, name] of ['New', 'Contacted', 'Proposal', 'Won'].entries()) {
      const stage = await call('post', '/crm/masters/stages', a.token, { pipeline_id: ids.sales, name, sort_order: i + 1, ...(name === 'Won' ? { is_won: 1 } : {}) });
      expect(stage.status).toBe(201);
      ids.stages.push(stage.body.data.id);
    }
    const otherPipeline = (await call('post', '/crm/masters/pipelines', b.token, { name: 'B Sales', code: `BSALES_${SUFFIX}` })).body.data.id;
    ids.otherStage = (await call('post', '/crm/masters/stages', b.token, { pipeline_id: otherPipeline, name: 'B New', sort_order: 1 })).body.data.id;

    // A member who may see pipelines but not change them.
    userEmails.push(viewer.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: viewer.email, display_name: 'Viewer', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: 'R_VIEWER', role_name: 'Pipeline viewer', is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: ['pipelines.view', 'leads.view'] } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: viewer.email, password: PASSWORD, tenantId: a.tenantId });
    viewer.token = login.body.token;
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

  it('saves the dragged stage order, and the sales pipeline board gets its columns in that order', async () => {
    const [newStage, contacted, proposal, won] = ids.stages;
    const dragged = [proposal, newStage, won, contacted];
    const saved = await reorder(a.token, 'stages', dragged);
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ success: true, data: { saved: 4 }, message: 'New order saved' });
    expect(await boardStages(ids.sales)).toEqual(dragged);
    const masters = (await call('get', '/crm/masters/stages', a.token)).body.data as { id: string }[];
    expect(masters.map((s) => s.id).filter((id) => dragged.includes(id))).toEqual(dragged);
    const audit = await prisma.rndtechnosoft_crm_audit_logs.findFirstOrThrow({ where: { tenant_id: a.tenantId, action_type: 'REORDER', entity_type: 'PIPELINE_STAGE' } });
    expect(audit.changes_diff).toEqual({ ordered_ids: dragged });
  });

  it('saves the dragged pipeline order', async () => {
    expect((await reorder(a.token, 'pipelines', [ids.funnel, ids.sales])).status).toBe(200);
    const pipelines = (await call('get', '/crm/leads?page=1&limit=1', a.token)).body.data.pipelines as { id: string }[];
    expect(pipelines.map((p) => p.id)).toEqual([ids.funnel, ids.sales]);
  });

  it('changes nothing when a record is from another workspace, and says so', async () => {
    const before = await boardStages(ids.sales);
    const refused = await reorder(a.token, 'stages', [ids.otherStage, ...[...before].reverse()]);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toBe('Some of these records no longer exist. Reload the page and try again.');
    expect(await boardStages(ids.sales)).toEqual(before);
    const otherStage = await prisma.rndtechnosoft_crm_stages.findUniqueOrThrow({ where: { id: ids.otherStage } });
    expect(otherStage.sort_order).toBe(1);
  });

  it('refuses lists that cannot be reordered and orders it cannot read, instead of reporting them saved', async () => {
    expect((await reorder(a.token, 'sources', ids.stages)).status).toBe(400);
    expect((await reorder(a.token, 'stages', [])).status).toBe(400);
    expect((await reorder(a.token, 'stages', ['not-an-id'])).status).toBe(400);
    expect((await reorder(a.token, 'stages', [ids.stages[0], ids.stages[0]])).status).toBe(400);
  });

  it('needs permission to change pipelines', async () => {
    expect((await reorder(viewer.token, 'stages', ids.stages)).status).toBe(403);
  });
});
