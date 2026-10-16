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
 * The starter KRA and KPI library: loaded through the normal checks, scoped
 * to the workspace's own departments by name, everyone's KRAs for everyone,
 * nothing loaded twice, and only for people who may manage the library.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Starter-Library-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

describe('Starter KRA and KPI library', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const a = { tenantId: '', token: '' };
  const viewer = { token: '' };
  const departments: Record<string, string> = {};

  const call = (method: 'get' | 'post', url: string, token: string) => request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);

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

    const email = `starter-a-${SUFFIX}@starter.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Starter ${SUFFIX}`, tenantCode: `STA${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    a.tenantId = r.body.activeTenant.tenantId;
    a.token = r.body.token;
    tenantIds.push(a.tenantId);

    for (const name of ['Engineering', 'TECH', 'Sales & Marketing', 'Department-1']) {
      departments[name] = randomUUID();
      await prisma.rndtechnosoft_departments.create({ data: { id: departments[name], tenant_id: a.tenantId, department_code: `D${Object.keys(departments).length}-${SUFFIX}`, department_name: name } });
    }

    const viewerEmail = `starter-v-${SUFFIX}@starter.test`;
    emails.push(viewerEmail);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: viewerEmail, display_name: 'Viewer', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: 'LIB_EDITOR', role_name: 'Library editor', is_system_role: false } });
    // Managing the library without managing rating scales isn't enough: the starter set includes a scale.
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: ['performance.library.view', 'performance.library.manage'] } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: viewerEmail, password: PASSWORD, tenantId: a.tenantId });
    viewer.token = login.body.token;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      for (const model of [
        'rndtechnosoft_performance_kra_kpis', 'rndtechnosoft_performance_kra_scopes', 'rndtechnosoft_performance_kras', 'rndtechnosoft_performance_kpis',
        'rndtechnosoft_performance_rating_scale_levels', 'rndtechnosoft_performance_rating_scale_bands', 'rndtechnosoft_performance_rating_scale_versions', 'rndtechnosoft_performance_rating_scales',
        'rndtechnosoft_departments',
      ] as const) {
        await (prisma[model] as unknown as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({ where: scope });
      }
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

  it('is refused to someone who may not also manage rating scales', async () => {
    expect((await call('post', '/performance/starter-library', viewer.token)).status).toBe(403);
  });

  it('loads KRAs for the departments the workspace has, company-wide KRAs, their KPIs and a published scale', async () => {
    const loaded = await call('post', '/performance/starter-library', a.token);
    expect(loaded.status).toBe(200);
    expect(loaded.body.data).toMatchObject({ kpisCreated: 38, krasCreated: 9, alreadyThere: 0 });
    expect(loaded.body.data.departmentsNotFound.sort()).toEqual(['Accounts & Finance', 'Human Resources', 'Operations', 'Product & Design', 'Quality Assurance']);

    const kra = await prisma.rndtechnosoft_performance_kras.findFirstOrThrow({
      where: { tenant_id: a.tenantId, kra_code: 'ENG_DELIVERY' },
      include: { rndtechnosoft_performance_kra_scopes: true, rndtechnosoft_performance_kra_kpis: { orderBy: { display_order: 'asc' }, include: { rndtechnosoft_performance_kpis: { select: { kpi_code: true } } } } },
    });
    expect(kra.rndtechnosoft_performance_kra_scopes.map((s) => s.department_id).sort()).toEqual([departments.Engineering, departments.TECH].sort());
    expect(kra.rndtechnosoft_performance_kra_kpis.map((k) => [k.rndtechnosoft_performance_kpis.kpi_code, k.default_weight_percent?.toString()])).toEqual([['ENG_ON_TIME_DELIVERY', '60'], ['ENG_PROD_DEFECTS', '40']]);
    const core = await prisma.rndtechnosoft_performance_kras.findFirstOrThrow({ where: { tenant_id: a.tenantId, kra_code: 'CORE_BEHAVIOURS' } });
    expect(core.applies_to_all).toBe(true);
    const scale = await prisma.rndtechnosoft_performance_rating_scales.findFirstOrThrow({ where: { tenant_id: a.tenantId, scale_code: 'FIVE_POINT' }, include: { rndtechnosoft_performance_rating_scale_versions: true } });
    expect(core.rating_scale_id).toBe(scale.id);
    expect(scale.rndtechnosoft_performance_rating_scale_versions.map((v) => v.version_status)).toEqual(['PUBLISHED']);
    const revenue = await prisma.rndtechnosoft_performance_kpis.findFirstOrThrow({ where: { tenant_id: a.tenantId, kpi_code: 'SALES_REVENUE' } });
    expect(revenue).toMatchObject({ measurement_type: 'CURRENCY', currency_code: 'INR', default_target: null, evidence_requirement: 'REQUIRED' });
    const audit = await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: a.tenantId, action_code: { in: ['PERFORMANCE_KRA_CREATED', 'PERFORMANCE_KPI_CREATED'] } } });
    expect(audit).toBe(47);
  });

  it('adds only what is missing when loaded again', async () => {
    const again = await call('post', '/performance/starter-library', a.token);
    expect(again.body.data).toMatchObject({ kpisCreated: 0, krasCreated: 0, alreadyThere: 47 });
    expect(await prisma.rndtechnosoft_performance_rating_scales.count({ where: { tenant_id: a.tenantId } })).toBe(1);
  });
});
