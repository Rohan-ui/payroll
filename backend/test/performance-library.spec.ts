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
 * Performance setup end to end: rating scales and their versions, the KPI and
 * KRA libraries, department heads, the database's own history guards,
 * permissions and workspace isolation.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Performance-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = Person & { tenantId: string };

describe('Performance setup', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `perf-a-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Asha Admin' };
  const b: Workspace = { tenantId: '', token: '', email: `perf-b-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Bala Admin' };
  const viewer: Person = { token: '', email: `perf-view-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Vik Viewer' };
  const outsider: Person = { token: '', email: `perf-out-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Oma Outsider' };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);

  const levels = (...labels: string[]) => labels.map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null }));
  const fivePoint = (extra: Record<string, unknown> = {}) => ({
    inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null,
    levels: levels('Unsatisfactory', 'Needs Improvement', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding'),
    bands: [
      { label: 'Below expectations', description: null, minPercent: '0', maxPercent: '50' },
      { label: 'Meets expectations', description: null, minPercent: '50', maxPercent: '80' },
      { label: 'Exceeds expectations', description: null, minPercent: '80', maxPercent: '100' },
    ],
    ...extra,
  });
  const kpi = (kpiCode: string, extra: Record<string, unknown> = {}) => ({
    kpiCode, kpiName: kpiCode, description: null, measurementType: 'NUMERIC', unitLabel: null, currencyCode: null, direction: 'HIGHER_IS_BETTER',
    defaultTarget: null, minimumExpected: null, stretchTarget: null, defaultMaxMarks: null, ratingScaleId: null, evidenceRequirement: 'NONE', evaluationInstructions: null, ...extra,
  });
  const kra = (kraCode: string, extra: Record<string, unknown> = {}) => ({
    kraCode, kraName: kraCode, description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'OPTIONAL',
    defaultWeightPercent: '40', defaultMaxMarks: '100', defaultMinMarks: null, ratingScaleId: null, appliesToAll: true,
    scopes: { departmentIds: [], designationIds: [], employeeIds: [] }, kpis: [], effectiveFrom: '2026-01-01', effectiveTo: null, ...extra,
  });

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Performance ${label} ${SUFFIX}`, tenantCode: `PERF${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function addMember(person: Person, permissionCodes: string[]) {
    userEmails.push(person.email);
    person.userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: person.userId, email: person.email, display_name: person.name, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `R_${person.name.replace(/\W/g, '').toUpperCase()}`, role_name: `Role ${person.name}`, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })) });
    person.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: person.memberId, tenant_id: a.tenantId, user_id: person.userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: person.memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
  }

  async function employee(tenantId: string, code: string, status = 'ACTIVE') {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: `${code}-${SUFFIX}`, first_name: code, employee_status: status } });
    return id;
  }

  async function department(tenantId: string, code: string) {
    const id = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id, tenant_id: tenantId, department_code: `${code}-${SUFFIX}`, department_name: code } });
    return id;
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
    await addMember(viewer, ['performance.library.view']);
    await addMember(outsider, ['dashboard.view']);
    ids.SALES = await department(a.tenantId, 'Sales');
    ids.ENG = await department(a.tenantId, 'Engineering');
    ids.SALES_B = await department(b.tenantId, 'SalesB');
    ids.E1 = await employee(a.tenantId, 'E1');
    ids.E2 = await employee(a.tenantId, 'E2');
    ids.GONE = await employee(a.tenantId, 'GONE', 'TERMINATED');
    ids.EB = await employee(b.tenantId, 'EB');
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_performance_kra_kpis.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kra_scopes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kras.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kpis.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_levels.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_bands.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scales.deleteMany({ where: scope });
      await prisma.rndtechnosoft_department_heads.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
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

  describe('rating scales', () => {
    it('refuses a scale whose bands leave a gap, naming the problem', async () => {
      const response = await asA('post', '/performance/rating-scales', {
        scaleCode: 'GAPPY', scaleName: 'Gappy',
        draft: fivePoint({ bands: [{ label: 'Low', description: null, minPercent: '0', maxPercent: '40' }, { label: 'High', description: null, minPercent: '50', maxPercent: '100' }] }),
      });
      expect(response.status).toBe(400);
      expect(response.body.errors?.[0]?.path ?? response.body.data?.errors?.[0]?.path ?? JSON.stringify(response.body)).toContain('bands.1.minPercent');
    });

    it('creates a scale as a draft, publishes it and shows what each level scores', async () => {
      const created = await asA('post', '/performance/rating-scales', { scaleCode: 'FIVE_POINT', scaleName: 'Five-point', description: 'Standard', draft: fivePoint() });
      expect(created.status).toBe(201);
      ids.FIVE = created.body.data.id;
      expect(created.body.data.versions).toHaveLength(1);
      expect(created.body.data.versions[0]).toMatchObject({ number: 1, status: 'DRAFT', minValue: '1', maxValue: '5' });

      const published = await asA('post', `/performance/rating-scales/${ids.FIVE}/draft/publish`);
      expect(published.status).toBe(200);
      const v1 = published.body.data.versions[0];
      expect(v1.status).toBe('PUBLISHED');
      expect(v1.conversion.map((c: { percent: string }) => c.percent)).toEqual(['20', '40', '60', '80', '100']);
      ids.FIVE_V1 = v1.id;
    });

    it('keeps a published version as it was when a new version is published', async () => {
      const levelsWithScores = levels('Poor', 'Fair', 'Good', 'Very good', 'Excellent').map((l, i) => ({ ...l, scorePercent: ['0', '25', '60', '85', '100'][i] }));
      const draft = await asA('put', `/performance/rating-scales/${ids.FIVE}/draft`, fivePoint({ conversionMethod: 'LEVEL_PERCENT', levels: levelsWithScores, changeNote: 'Calibrated' }));
      expect(draft.status).toBe(200);
      expect((await asA('post', `/performance/rating-scales/${ids.FIVE}/draft/publish`)).status).toBe(200);
      const scale = (await asA('get', `/performance/rating-scales/${ids.FIVE}`)).body.data;
      expect(scale.versions.map((v: { number: number; status: string }) => [v.number, v.status])).toEqual([[2, 'PUBLISHED'], [1, 'PUBLISHED']]);
      expect(scale.versions[0].conversion.map((c: { percent: string }) => c.percent)).toEqual(['0', '25', '60', '85', '100']);
      expect(scale.versions[1].levels.map((l: { label: string }) => l.label)).toEqual(['Unsatisfactory', 'Needs Improvement', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding']);
    });

    it('is protected by the database: published versions, levels and bands never change, and bands never overlap', async () => {
      await expect(prisma.rndtechnosoft_performance_rating_scale_versions.update({ where: { id: ids.FIVE_V1 }, data: { unit_label: 'pts' } }))
        .rejects.toThrow(/published rating scale version cannot be changed/);
      await expect(prisma.rndtechnosoft_performance_rating_scale_levels.updateMany({ where: { rating_scale_version_id: ids.FIVE_V1 }, data: { level_label: 'Changed' } }))
        .rejects.toThrow(/cannot be changed/);
      await expect(prisma.rndtechnosoft_performance_rating_scale_levels.create({
        data: { id: randomUUID(), tenant_id: a.tenantId, rating_scale_version_id: ids.FIVE_V1, level_value: '6', level_label: 'Six', display_order: 6 },
      })).rejects.toThrow(/cannot be changed/);

      const draft = (await asA('put', `/performance/rating-scales/${ids.FIVE}/draft`, fivePoint({ bands: [] }))).body.data.versions[0];
      await expect(prisma.rndtechnosoft_performance_rating_scale_bands.createMany({
        data: [
          { id: randomUUID(), tenant_id: a.tenantId, rating_scale_version_id: draft.id, band_label: 'A', min_percent: '0', max_percent: '60', display_order: 1 },
          { id: randomUUID(), tenant_id: a.tenantId, rating_scale_version_id: draft.id, band_label: 'B', min_percent: '50', max_percent: '100', display_order: 2 },
        ],
      })).rejects.toThrow(/ex_performance_rating_scale_bands_overlap|exclusion/);
      expect((await asA('delete', `/performance/rating-scales/${ids.FIVE}/draft`)).status).toBe(200);
    });

    it('supports range and marks scales', async () => {
      const percentScale = await asA('post', '/performance/rating-scales', {
        scaleCode: 'PERCENT', scaleName: 'Percentage',
        draft: { ...fivePoint(), inputKind: 'RANGE', minValue: '0', maxValue: '100', stepValue: '0.5', unitLabel: '%', levels: [], bands: [] },
      });
      expect(percentScale.status).toBe(201);
      const marks = await asA('post', '/performance/rating-scales', {
        scaleCode: 'MARKS', scaleName: 'Marks', draft: { ...fivePoint(), inputKind: 'MARKS', stepValue: '1', levels: [], bands: [] },
      });
      expect(marks.status).toBe(201);
      ids.UNPUBLISHED = marks.body.data.id;
    });
  });

  describe('KPIs', () => {
    it('creates a currency KPI with targets in order and refuses them out of order', async () => {
      const ok = await asA('post', '/performance/kpis', kpi('REVENUE', {
        kpiName: 'Revenue achievement', measurementType: 'CURRENCY', currencyCode: 'INR', unitLabel: '₹',
        minimumExpected: '700000', defaultTarget: '1000000', stretchTarget: '1200000', defaultMaxMarks: '60', evidenceRequirement: 'REQUIRED',
      }));
      expect(ok.status).toBe(201);
      expect(ok.body.data).toMatchObject({ kpiCode: 'REVENUE', defaultTarget: '1000000', currencyCode: 'INR', revision: 1 });
      ids.REVENUE = ok.body.data.id;

      const backwards = await asA('post', '/performance/kpis', kpi('BAD_ORDER', { minimumExpected: '100', defaultTarget: '50' }));
      expect(backwards.status).toBe(400);
      const lowerIsBetter = await asA('post', '/performance/kpis', kpi('DEFECTS', {
        kpiName: 'Defect rate', measurementType: 'PERCENTAGE', unitLabel: '%', direction: 'LOWER_IS_BETTER', minimumExpected: '5', defaultTarget: '2', stretchTarget: '1',
      }));
      expect(lowerIsBetter.status).toBe(201);
      ids.DEFECTS = lowerIsBetter.body.data.id;
    });

    it('needs a published scale for rated KPIs, and no target or direction for them', async () => {
      expect((await asA('post', '/performance/kpis', kpi('TEAMWORK', { measurementType: 'RATING', direction: 'NOT_APPLICABLE' }))).status).toBe(400);
      expect((await asA('post', '/performance/kpis', kpi('TEAMWORK', { measurementType: 'RATING', direction: 'NOT_APPLICABLE', ratingScaleId: ids.UNPUBLISHED }))).status).toBe(400);
      expect((await asA('post', '/performance/kpis', kpi('TEAMWORK', { measurementType: 'RATING', direction: 'HIGHER_IS_BETTER', ratingScaleId: ids.FIVE }))).status).toBe(400);
      const rated = await asA('post', '/performance/kpis', kpi('TEAMWORK', { kpiName: 'Teamwork', measurementType: 'RATING', direction: 'NOT_APPLICABLE', ratingScaleId: ids.FIVE }));
      expect(rated.status).toBe(201);
      ids.TEAMWORK = rated.body.data.id;
      expect((await asA('post', '/performance/kpis', kpi('REVENUE', { measurementType: 'COUNT' }))).status).toBe(409);
    });
  });

  describe('KRAs', () => {
    it('creates a department KRA with weighted KPIs and finds it by department', async () => {
      const created = await asA('post', '/performance/kras', kra('BUSINESS_RESULTS', {
        kraName: 'Business results', appliesToAll: false, ratingScaleId: ids.FIVE,
        scopes: { departmentIds: [ids.SALES], designationIds: [], employeeIds: [] },
        kpis: [{ kpiId: ids.REVENUE, defaultWeightPercent: '60' }, { kpiId: ids.TEAMWORK, defaultWeightPercent: '40' }],
      }));
      expect(created.status).toBe(201);
      ids.BR = created.body.data.id;
      expect(created.body.data.kpis.map((k: { kpiCode: string; defaultWeightPercent: string }) => [k.kpiCode, k.defaultWeightPercent])).toEqual([['REVENUE', '60'], ['TEAMWORK', '40']]);
      expect(created.body.data.scopes.departments).toEqual([{ id: ids.SALES, name: 'Sales' }]);

      const shared = await asA('post', '/performance/kras', kra('QUALITY', { kraName: 'Quality', kpis: [{ kpiId: ids.DEFECTS, defaultWeightPercent: null }] }));
      expect(shared.status).toBe(201);
      ids.QUALITY = shared.body.data.id;

      const sales = (await asA('get', `/performance/kras?departmentId=${ids.SALES}`)).body.data;
      expect(sales.items.map((k: { kraCode: string }) => k.kraCode).sort()).toEqual(['BUSINESS_RESULTS', 'QUALITY']);
      const engineering = (await asA('get', `/performance/kras?departmentId=${ids.ENG}`)).body.data;
      expect(engineering.items.map((k: { kraCode: string }) => k.kraCode)).toEqual(['QUALITY']);
    });

    it('refuses inconsistent applicability, marks and repeated KPIs', async () => {
      expect((await asA('post', '/performance/kras', kra('X1', { appliesToAll: false }))).status).toBe(400);
      expect((await asA('post', '/performance/kras', kra('X2', { scopes: { departmentIds: [ids.SALES], designationIds: [], employeeIds: [] } }))).status).toBe(400);
      expect((await asA('post', '/performance/kras', kra('X3', { defaultMinMarks: '100', defaultMaxMarks: '50' }))).status).toBe(400);
      expect((await asA('post', '/performance/kras', kra('X4', { kpis: [{ kpiId: ids.REVENUE, defaultWeightPercent: null }, { kpiId: ids.REVENUE, defaultWeightPercent: null }] }))).status).toBe(400);
      expect((await asA('post', '/performance/kras', kra('X5', { defaultWeightPercent: '120' }))).status).toBe(400);
    });

    it('refuses an edit made from an older revision, and audits what changed', async () => {
      const current = (await asA('get', `/performance/kras/${ids.BR}`)).body.data;
      const body = { ...kra('IGNORED'), kraName: 'Business results 2026', appliesToAll: false, ratingScaleId: ids.FIVE,
        scopes: { departmentIds: [ids.SALES], designationIds: [], employeeIds: [ids.E1] },
        kpis: [{ kpiId: ids.REVENUE, defaultWeightPercent: '70' }, { kpiId: ids.TEAMWORK, defaultWeightPercent: '30' }] };
      delete (body as { kraCode?: string }).kraCode;
      const saved = await asA('put', `/performance/kras/${ids.BR}`, { ...body, expectedRevision: current.revision });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toMatchObject({ kraName: 'Business results 2026', revision: 2 });
      expect(saved.body.data.scopes.employees).toEqual([{ id: ids.E1, name: 'E1', code: `E1-${SUFFIX}` }]);

      const stale = await asA('put', `/performance/kras/${ids.BR}`, { ...body, kraName: 'Lost update', expectedRevision: current.revision });
      expect(stale.status).toBe(409);
      expect((await asA('get', `/performance/kras/${ids.BR}`)).body.data.kraName).toBe('Business results 2026');

      const audit = await prisma.rndtechnosoft_audit_logs.findFirstOrThrow({ where: { tenant_id: a.tenantId, entity_id: ids.BR, action_code: 'PERFORMANCE_KRA_UPDATED' } });
      expect(audit.old_values).toMatchObject({ name: 'Business results', kpis: [{ kpi_id: ids.REVENUE, default_weight_percent: '60' }, { kpi_id: ids.TEAMWORK, default_weight_percent: '40' }] });
      expect(audit.new_values).toMatchObject({ name: 'Business results 2026', employee_ids: [ids.E1] });
      expect(Object.keys(audit.new_values as object)).not.toContain('evidence_requirement');
    });

    it('duplicates a KRA with its scopes and KPIs, and archives it out of the default list', async () => {
      const copy = await asA('post', `/performance/kras/${ids.BR}/duplicate`, { code: 'BUSINESS_RESULTS_HQ', name: 'Business results (HQ)' });
      expect(copy.status).toBe(201);
      expect(copy.body.data.kpis).toHaveLength(2);
      expect(copy.body.data.scopes.departments).toEqual([{ id: ids.SALES, name: 'Sales' }]);
      expect((await asA('post', `/performance/kras/${ids.BR}/duplicate`, { code: 'QUALITY', name: 'Clash' })).status).toBe(409);

      expect((await asA('post', `/performance/kras/${copy.body.data.id}/archive`)).status).toBe(200);
      const active = (await asA('get', '/performance/kras')).body.data.items.map((k: { kraCode: string }) => k.kraCode);
      expect(active).not.toContain('BUSINESS_RESULTS_HQ');
      const all = (await asA('get', '/performance/kras?status=ALL')).body.data.items.map((k: { kraCode: string }) => k.kraCode);
      expect(all).toContain('BUSINESS_RESULTS_HQ');
      expect((await asA('put', `/performance/kras/${copy.body.data.id}`, { ...kra('X'), expectedRevision: 2 })).status).toBe(400);
    });

    it('does not let an archived KPI be newly added, but keeps it where it already is', async () => {
      expect((await asA('post', `/performance/kpis/${ids.TEAMWORK}/archive`)).status).toBe(200);
      expect((await asA('post', '/performance/kras', kra('NEW_ONE', { kpis: [{ kpiId: ids.TEAMWORK, defaultWeightPercent: null }] }))).status).toBe(400);
      const current = (await asA('get', `/performance/kras/${ids.BR}`)).body.data;
      const keep = await asA('put', `/performance/kras/${ids.BR}`, {
        kraName: current.kraName, description: null, measurementMethod: null, evaluationInstructions: 'Use CRM figures', evidenceRequirement: 'OPTIONAL',
        defaultWeightPercent: '40', defaultMaxMarks: '100', defaultMinMarks: null, ratingScaleId: ids.FIVE, appliesToAll: false,
        scopes: { departmentIds: [ids.SALES], designationIds: [], employeeIds: [] },
        kpis: [{ kpiId: ids.REVENUE, defaultWeightPercent: '70' }, { kpiId: ids.TEAMWORK, defaultWeightPercent: '30' }],
        effectiveFrom: '2026-01-01', effectiveTo: null, expectedRevision: current.revision,
      });
      expect(keep.status).toBe(200);
      expect(keep.body.data.kpis.find((k: { kpiCode: string }) => k.kpiCode === 'TEAMWORK').status).toBe('ARCHIVED');
      expect((await asA('post', `/performance/kpis/${ids.TEAMWORK}/restore`)).status).toBe(200);
    });

    it('does not archive a scale active KRAs or KPIs use', async () => {
      expect((await asA('post', `/performance/rating-scales/${ids.FIVE}/archive`)).status).toBe(400);
    });
  });

  describe('deleting and archived items', () => {
    it('counts active and archived items for the tabs', async () => {
      const kras = (await asA('get', '/performance/kras')).body.data;
      expect(kras.counts).toEqual({ active: 2, archived: 1 });
    });

    it('deletes only what nothing uses, and says what uses the rest', async () => {
      const suggested = await asA('delete', `/performance/kpis/${ids.REVENUE}`);
      expect(suggested.status).toBe(409);
      expect(suggested.body.message).toMatch(/^REVENUE can’t be deleted because it is used by .*KRA BUSINESS_RESULTS.*Archive it instead/);
      const scale = await asA('delete', `/performance/rating-scales/${ids.FIVE}`);
      expect(scale.status).toBe(409);
      expect(scale.body.message).toContain('KRA BUSINESS_RESULTS');

      const spare = (await asA('post', '/performance/kpis', kpi('SPARE'))).body.data;
      expect((await asA('delete', `/performance/kpis/${spare.id}`)).status).toBe(200);
      expect((await asA('get', `/performance/kpis/${spare.id}`)).status).toBe(404);
      expect((await asA('delete', `/performance/rating-scales/${ids.UNPUBLISHED}`)).status).toBe(200);
      const audit = await prisma.rndtechnosoft_audit_logs.findFirstOrThrow({ where: { tenant_id: a.tenantId, entity_id: spare.id, action_code: 'PERFORMANCE_KPI_DELETED' } });
      expect(audit.old_values).toEqual({ code: 'SPARE', name: 'SPARE' });
    });

    it('lets only managers delete, within their own workspace', async () => {
      const spare = (await asA('post', '/performance/kras', kra('SPARE_KRA'))).body.data;
      expect((await call('delete', `/performance/kras/${spare.id}`, viewer.token)).status).toBe(403);
      expect((await asB('delete', `/performance/kras/${spare.id}`)).status).toBe(404);
      expect((await asA('delete', `/performance/kras/${spare.id}`)).status).toBe(200);
    });
  });

  describe('department heads', () => {
    it('closes the current head the day before the next one starts', async () => {
      expect((await asA('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.E1, effectiveFrom: '2026-01-01' })).status).toBe(201);
      const second = await asA('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.E2, effectiveFrom: '2026-07-01', reason: 'Promotion' });
      expect(second.status).toBe(201);
      const history = (await asA('get', `/performance/department-heads/departments/${ids.SALES}`)).body.data.appointments;
      expect(history.map((h: { employee: { id: string }; effectiveFrom: string; effectiveTo: string | null }) => [h.employee.id, h.effectiveFrom, h.effectiveTo]))
        .toEqual([[ids.E2, '2026-07-01', null], [ids.E1, '2026-01-01', '2026-06-30']]);
    });

    it('refuses a start before the latest appointment, an inactive employee and the same head again', async () => {
      expect((await asA('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.E1, effectiveFrom: '2026-03-01' })).status).toBe(400);
      expect((await asA('post', '/performance/department-heads', { departmentId: ids.ENG, employeeId: ids.GONE, effectiveFrom: '2026-03-01' })).status).toBe(400);
      expect((await asA('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.E2, effectiveFrom: '2026-09-01' })).status).toBe(400);
    });

    it('is protected by the database: no overlapping heads, and an appointment’s head and start never change', async () => {
      await expect(prisma.rndtechnosoft_department_heads.create({
        data: { id: randomUUID(), tenant_id: a.tenantId, department_id: ids.SALES, head_employee_id: ids.E1, effective_from: new Date('2026-08-01') },
      })).rejects.toThrow(/ex_department_heads_overlap|exclusion/);
      const row = await prisma.rndtechnosoft_department_heads.findFirstOrThrow({ where: { tenant_id: a.tenantId, department_id: ids.SALES, head_employee_id: ids.E2 } });
      await expect(prisma.rndtechnosoft_department_heads.update({ where: { id: row.id }, data: { head_employee_id: ids.E1 } })).rejects.toThrow(/cannot be edited/);
    });

    it('cancels the latest appointment and reopens the one it closed; ends an open one', async () => {
      const latest = await prisma.rndtechnosoft_department_heads.findFirstOrThrow({ where: { tenant_id: a.tenantId, department_id: ids.SALES, head_employee_id: ids.E2 } });
      const first = await prisma.rndtechnosoft_department_heads.findFirstOrThrow({ where: { tenant_id: a.tenantId, department_id: ids.SALES, head_employee_id: ids.E1 } });
      expect((await asA('post', `/performance/department-heads/${first.id}/cancel`, { reason: 'Wrong one' })).status).toBe(400);
      expect((await asA('post', `/performance/department-heads/${latest.id}/cancel`, { reason: 'Appointed by mistake' })).status).toBe(200);
      const reopened = await prisma.rndtechnosoft_department_heads.findUniqueOrThrow({ where: { id: first.id } });
      expect(reopened.effective_to).toBeNull();

      expect((await asA('post', `/performance/department-heads/${first.id}/end`, { effectiveTo: '2025-12-31' })).status).toBe(400);
      expect((await asA('post', `/performance/department-heads/${first.id}/end`, { effectiveTo: '2026-12-31' })).status).toBe(200);
      const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, entity_type: 'DEPARTMENT_HEAD' }, select: { action_code: true } });
      expect(audit.map((x) => x.action_code).sort()).toEqual(['DEPARTMENT_HEAD_APPOINTED', 'DEPARTMENT_HEAD_APPOINTED', 'DEPARTMENT_HEAD_CANCELLED', 'DEPARTMENT_HEAD_ENDED']);
    });
  });

  describe('permissions and workspaces', () => {
    it('lets a viewer read but not change, and refuses members without access', async () => {
      expect((await call('get', '/performance/kras', viewer.token)).status).toBe(200);
      expect((await call('get', `/performance/rating-scales/${ids.FIVE}`, viewer.token)).status).toBe(200);
      expect((await call('post', '/performance/kpis', viewer.token, kpi('VIEWER_KPI'))).status).toBe(403);
      expect((await call('post', '/performance/department-heads', viewer.token, { departmentId: ids.ENG, employeeId: ids.E1, effectiveFrom: '2026-01-01' })).status).toBe(403);
      expect((await call('get', '/performance/kras', outsider.token)).status).toBe(403);
      expect((await call('get', '/performance/options/employees', outsider.token)).status).toBe(403);
    });

    it('keeps each workspace’s library to itself', async () => {
      expect((await asB('get', `/performance/kras/${ids.BR}`)).status).toBe(404);
      expect((await asB('get', `/performance/kpis/${ids.REVENUE}`)).status).toBe(404);
      expect((await asB('get', `/performance/rating-scales/${ids.FIVE}`)).status).toBe(404);
      expect((await asB('post', `/performance/kras/${ids.BR}/archive`)).status).toBe(404);
      const { kpiCode: _code, ...kpiSettings } = kpi('X');
      expect((await asB('put', `/performance/kpis/${ids.REVENUE}`, { ...kpiSettings, expectedRevision: 1 })).status).toBe(404);
      expect((await asB('get', '/performance/kras?status=ALL')).body.data.total).toBe(0);
      expect((await asB('get', `/performance/department-heads/departments/${ids.SALES}`)).status).toBe(404);

      // References to another workspace's records are refused as if they did not exist.
      expect((await asB('post', '/performance/kras', kra('B_KRA', { appliesToAll: false, scopes: { departmentIds: [ids.SALES], designationIds: [], employeeIds: [] } }))).status).toBe(400);
      expect((await asB('post', '/performance/kras', kra('B_KRA', { kpis: [{ kpiId: ids.REVENUE, defaultWeightPercent: null }] }))).status).toBe(400);
      expect((await asB('post', '/performance/kras', kra('B_KRA', { ratingScaleId: ids.FIVE }))).status).toBe(400);
      expect((await asB('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.EB, effectiveFrom: '2026-01-01' })).status).toBe(400);
      expect((await asB('post', '/performance/department-heads', { departmentId: ids.SALES_B, employeeId: ids.E1, effectiveFrom: '2026-01-01' })).status).toBe(400);
      const employees = (await asB('get', '/performance/options/employees?search=E')).body.data.map((e: { id: string }) => e.id);
      expect(employees).toEqual([ids.EB]);
    });
  });
});
