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
 * Appraisal templates end to end: weights that must total (and the template
 * that shares them out instead), scoring methods and their checks, form
 * questions, publishing with the library copied in and scale versions pinned,
 * the database's guard on published versions, trying the scoring,
 * permissions and workspace isolation.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Templates-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = Person & { tenantId: string };

describe('Appraisal templates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `tpl-a-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Asha Admin' };
  const b: Workspace = { tenantId: '', token: '', email: `tpl-b-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Bala Admin' };
  const viewer: Person = { token: '', email: `tpl-view-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Vik Viewer' };
  const outsider: Person = { token: '', email: `tpl-out-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Oma Outsider' };
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);
  const created = async (response: request.Response) => {
    expect([200, 201]).toContain(response.status);
    return response.body.data;
  };

  const kpiLine = (kpiId: string, extra: Record<string, unknown> = {}) => ({
    kpiId, weightPercent: '50', maxMarks: null, scoringMethod: 'PERCENT_OF_TARGET', scoringConfig: {}, targetSource: 'TEMPLATE', target: '100', threshold: null, stretch: null,
    ratingScaleId: null, allowsExemption: false, ...extra,
  });
  const kraLine = (kraId: string, weightPercent: string, kpis: unknown[], extra: Record<string, unknown> = {}) => ({
    kraId, weightPercent, maxMarks: null, minMarks: null, scoringMethod: null, ratingScaleId: null, allowsExemption: false, kpis, ...extra,
  });
  /** The spec's example: Business results 40% (revenue 60%, new clients 40%), quality 25%, productivity 20%, teamwork 15%. */
  const draft = (extra: Record<string, unknown> = {}) => ({
    scoringModel: 'WEIGHTED', weightRule: 'MUST_TOTAL', totalMarks: null, missingRatingRule: 'BLOCK', scoreDecimals: 2, finalScaleId: ids.FIVE,
    kras: [
      kraLine(ids.BUSINESS, '40', [kpiLine(ids.REVENUE, { weightPercent: '60', target: '1000000' }), kpiLine(ids.CLIENTS, { weightPercent: '40', target: '10' })]),
      kraLine(ids.QUALITY, '25', [kpiLine(ids.DEFECTS, { weightPercent: '100', target: '2' })]),
      kraLine(ids.PRODUCTIVITY, '20', [], { scoringMethod: 'RATING_SCALE', ratingScaleId: ids.FIVE }),
      kraLine(ids.TEAMWORK, '15', [], { scoringMethod: 'RATING_SCALE', ratingScaleId: ids.FIVE }),
    ],
    fields: [
      { key: 'achievements', type: 'ACHIEVEMENTS', label: 'Key achievements', description: null, required: true, filledBy: 'SELF', visibility: 'ALWAYS', config: { maxLength: 2000 }, ratingScaleId: null, scored: false, weightPercent: null, maxMarks: null },
      { key: 'promotion', type: 'DROPDOWN', label: 'Ready for promotion?', description: null, required: false, filledBy: 'REVIEWERS', visibility: 'NEVER', config: { options: ['Now', 'In a year', 'Not yet'] }, ratingScaleId: null, scored: false, weightPercent: null, maxMarks: null },
    ] as Record<string, unknown>[],
    ...extra,
  });

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Templates ${label} ${SUFFIX}`, tenantCode: `TPL${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
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

  /** A five-point scale with final rating bands, KPIs and KRAs, through the API. */
  async function library(workspace: Workspace, as: typeof asA) {
    const levels = ['Unsatisfactory', 'Needs Improvement', 'Meets', 'Exceeds', 'Outstanding'].map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null }));
    const bands = [
      { label: 'Below expectations', description: null, minPercent: '0', maxPercent: '60' },
      { label: 'Meets expectations', description: null, minPercent: '60', maxPercent: '85' },
      { label: 'Exceeds expectations', description: null, minPercent: '85', maxPercent: '100' },
    ];
    const scale = await created(await as('post', '/performance/rating-scales', {
      scaleCode: 'FIVE', scaleName: 'Five-point', draft: { inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null, levels, bands },
    }));
    await created(await as('post', `/performance/rating-scales/${scale.id}/draft/publish`));
    const kpi = async (code: string, extra: Record<string, unknown>) => (await created(await as('post', '/performance/kpis', {
      kpiCode: code, kpiName: code, description: null, measurementType: 'NUMERIC', unitLabel: null, currencyCode: null, direction: 'HIGHER_IS_BETTER',
      defaultTarget: null, minimumExpected: null, stretchTarget: null, defaultMaxMarks: null, ratingScaleId: null, evidenceRequirement: 'NONE', evaluationInstructions: null, ...extra,
    }))).id as string;
    const kra = async (code: string) => (await created(await as('post', '/performance/kras', {
      kraCode: code, kraName: code, description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'OPTIONAL', defaultWeightPercent: null,
      defaultMaxMarks: null, defaultMinMarks: null, ratingScaleId: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [], employeeIds: [] }, kpis: [],
      effectiveFrom: '2026-01-01', effectiveTo: null,
    }))).id as string;
    return {
      FIVE: scale.id as string,
      REVENUE: await kpi('REVENUE', { kpiName: 'Revenue achievement', measurementType: 'CURRENCY', currencyCode: 'INR', unitLabel: '₹' }),
      CLIENTS: await kpi('NEW_CLIENTS', { kpiName: 'New clients', measurementType: 'COUNT' }),
      DEFECTS: await kpi('DEFECT_RATE', { kpiName: 'Defect rate', measurementType: 'PERCENTAGE', unitLabel: '%', direction: 'LOWER_IS_BETTER' }),
      BUSINESS: await kra('BUSINESS_RESULTS'),
      QUALITY: await kra('QUALITY'),
      PRODUCTIVITY: await kra('PRODUCTIVITY'),
      TEAMWORK: await kra('TEAMWORK'),
      workspace: workspace.tenantId,
    };
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
    Object.assign(ids, await library(a, asA));
    const bLibrary = await library(b, asB);
    ids.B_KRA = bLibrary.BUSINESS;
    ids.B_SCALE = bLibrary.FIVE;
    ids.SALES = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: ids.SALES, tenant_id: a.tenantId, department_code: `SALES-${SUFFIX}`, department_name: 'Sales' } });
    ids.SALES_B = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: ids.SALES_B, tenant_id: b.tenantId, department_code: `SALESB-${SUFFIX}`, department_name: 'Sales B' } });
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_performance_template_fields.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_template_kpis.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_template_kras.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_template_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_template_scopes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_templates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kra_kpis.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kra_scopes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kras.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_kpis.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_levels.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_bands.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scale_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_rating_scales.deleteMany({ where: scope });
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

  const settings = { templateName: 'Sales appraisal', description: null, appliesToAll: false, scopes: { departmentIds: [] as string[], designationIds: [] as string[] } };

  it('creates a template for a department, with an empty draft', async () => {
    expect((await asA('post', '/performance/templates', { ...settings, templateCode: 'SALES' })).status).toBe(400);
    const template = await created(await asA('post', '/performance/templates', { ...settings, templateCode: 'SALES', scopes: { departmentIds: [ids.SALES], designationIds: [] } }));
    ids.T = template.id;
    expect(template.scopes.departments).toEqual([{ id: ids.SALES, name: 'Sales' }]);
    expect(template.versions).toHaveLength(1);
    expect(template.versions[0]).toMatchObject({ number: 1, status: 'DRAFT', kras: [], problems: [{ path: 'kras', message: 'Add at least one KRA.' }] });
    const listed = (await asA('get', `/performance/templates?departmentId=${ids.SALES}`)).body.data.items;
    expect(listed.map((t: { templateCode: string }) => t.templateCode)).toEqual(['SALES']);
  });

  it('saves a draft whose weights don’t total and lists why it can’t be published, without changing them', async () => {
    const uneven = draft();
    uneven.kras[3] = kraLine(ids.TEAMWORK, '10', [], { scoringMethod: 'RATING_SCALE', ratingScaleId: ids.FIVE });
    const saved = await created(await asA('put', `/performance/templates/${ids.T}/draft`, uneven));
    const version = saved.versions[0];
    expect(version.kras[3].weightPercent).toBe('10');
    expect(version.problems.map((p: { message: string }) => p.message)).toEqual(['The KRAs weights add up to 95%, not 100%. Change them, or let weights be shared out in proportion.']);
    const refused = await asA('post', `/performance/templates/${ids.T}/draft/publish`);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('95%, not 100%');
  });

  it('refuses at saving what can’t be stored: a KPI twice, a scored text question, zero weights', async () => {
    const twice = draft();
    twice.kras[1] = kraLine(ids.QUALITY, '25', [kpiLine(ids.REVENUE, { weightPercent: '100' })]);
    expect((await asA('put', `/performance/templates/${ids.T}/draft`, twice)).status).toBe(400);
    const scoredText = draft();
    scoredText.fields[0] = { ...scoredText.fields[0], scored: true, weightPercent: '5' };
    expect((await asA('put', `/performance/templates/${ids.T}/draft`, scoredText)).status).toBe(400);
    const zero = draft();
    zero.kras[0] = kraLine(ids.BUSINESS, '0', []);
    expect((await asA('put', `/performance/templates/${ids.T}/draft`, zero)).status).toBe(400);
  });

  it('reports scoring problems: method not suited to the measure, bad slabs, missing targets', async () => {
    const bad = draft();
    bad.kras[0] = kraLine(ids.BUSINESS, '40', [
      kpiLine(ids.REVENUE, { weightPercent: '60', scoringMethod: 'YES_NO', scoringConfig: { yesScore: '100', noScore: '0' } }),
      kpiLine(ids.CLIENTS, { weightPercent: '40', scoringMethod: 'SLABS', scoringConfig: { basis: 'ACTUAL', slabs: [{ from: '0', to: '5', scorePercent: '0' }, { from: '6', to: null, scorePercent: '100' }] } }),
    ]);
    bad.kras[1] = kraLine(ids.QUALITY, '25', [kpiLine(ids.DEFECTS, { weightPercent: '100', target: null })]);
    const version = (await created(await asA('put', `/performance/templates/${ids.T}/draft`, bad))).versions[0];
    expect(version.problems.map((p: { path: string }) => p.path)).toEqual(['kras.0.kpis.0.method', 'kras.0.kpis.1.config', 'kras.1.kpis.0.target']);
  });

  it('publishes a draft that passes every rule, copying the library and pinning scale versions', async () => {
    const saved = await created(await asA('put', `/performance/templates/${ids.T}/draft`, draft({ changeNote: 'First version' })));
    expect(saved.versions[0].problems).toEqual([]);
    const published = await created(await asA('post', `/performance/templates/${ids.T}/draft/publish`));
    const v1 = published.versions[0];
    expect(v1).toMatchObject({ number: 1, status: 'PUBLISHED', policy: { scoringModel: 'WEIGHTED', finalScale: { scaleName: 'Five-point', versionNumber: 1 } } });
    expect(v1.kras[0].kpis.map((k: { kpiName: string; unitLabel: string }) => [k.kpiName, k.unitLabel])).toEqual([['Revenue achievement', '₹'], ['New clients', null]]);
    ids.V1 = v1.id;
    ids.V1_REVENUE = v1.kras[0].kpis[0].id;
    ids.V1_CLIENTS = v1.kras[0].kpis[1].id;
    ids.V1_DEFECTS = v1.kras[1].kpis[0].id;
    ids.V1_PRODUCTIVITY = v1.kras[2].id;
    ids.V1_TEAMWORK = v1.kras[3].id;
  });

  it('keeps a published version as it was when the library and scales change', async () => {
    const kpi = (await asA('get', `/performance/kpis/${ids.REVENUE}`)).body.data;
    const { id: _id, kpiCode: _c, ratingScale: _r, usedBy: _u, status: _s, revision, createdBy: _cb, updatedBy: _ub, updatedAt: _ua, ...rest } = kpi;
    expect((await asA('put', `/performance/kpis/${ids.REVENUE}`, { ...rest, kpiName: 'Revenue (renamed)', ratingScaleId: null, expectedRevision: revision })).status).toBe(200);
    const levels = ['Poor', 'Fair', 'Good', 'Great', 'Superb'].map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null }));
    await created(await asA('put', `/performance/rating-scales/${ids.FIVE}/draft`, { inputKind: 'LEVELS', conversionMethod: 'MIN_TO_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null, levels, bands: [] }));
    await created(await asA('post', `/performance/rating-scales/${ids.FIVE}/draft/publish`));

    const template = (await asA('get', `/performance/templates/${ids.T}`)).body.data;
    const v1 = template.versions.find((v: { id: string }) => v.id === ids.V1);
    expect(v1.kras[0].kpis[0].kpiName).toBe('Revenue achievement');
    expect(v1.kras[2].ratingScale).toMatchObject({ versionNumber: 1, levels: expect.arrayContaining([{ value: '1', label: 'Unsatisfactory' }]) });

    // A new draft takes the library and scales as they are now.
    const v2 = (await created(await asA('put', `/performance/templates/${ids.T}/draft`, draft()))).versions[0];
    expect(v2.number).toBe(2);
    expect(v2.kras[0].kpis[0].kpiName).toBe('Revenue (renamed)');
    expect(v2.kras[2].ratingScale.versionNumber).toBe(2);
    expect(v2.problems.map((p: { path: string }) => p.path)).toEqual(['policy.finalScale']);
    expect((await asA('delete', `/performance/templates/${ids.T}/draft`)).status).toBe(200);
  });

  it('is protected by the database: a published version and its lines never change', async () => {
    await expect(prisma.rndtechnosoft_performance_template_versions.update({ where: { id: ids.V1 }, data: { score_decimals: 0 } })).rejects.toThrow(/published appraisal template version cannot be changed/);
    await expect(prisma.rndtechnosoft_performance_template_kpis.update({ where: { id: ids.V1_REVENUE }, data: { weight_percent: '70' } })).rejects.toThrow(/cannot be changed/);
    await expect(prisma.rndtechnosoft_performance_template_fields.create({
      data: { id: randomUUID(), tenant_id: a.tenantId, template_version_id: ids.V1, field_key: 'sneaky', field_type: 'YES_NO', field_label: 'Sneaky', filled_by: 'SELF', employee_visibility: 'ALWAYS', field_config: {}, display_order: 9 },
    })).rejects.toThrow(/cannot be changed/);
  });

  it('tries the scoring of the published version, explaining every number', async () => {
    const response = await asA('post', `/performance/templates/${ids.T}/versions/${ids.V1}/preview`, {
      inputs: {
        [ids.V1_REVENUE]: { actual: '850000' }, [ids.V1_CLIENTS]: { actual: '12' }, [ids.V1_DEFECTS]: { actual: '2.5' },
        [ids.V1_PRODUCTIVITY]: { rating: '4' }, [ids.V1_TEAMWORK]: { rating: '5' }, unknown: { actual: '1' },
      },
    });
    expect(response.status).toBe(200);
    const score = response.body.data;
    expect(score).toMatchObject({ status: 'COMPLETE', scorePercent: '87.40', band: { label: 'Exceeds expectations' } });
    expect(score.kras.map((k: { scorePercent: string; contributionPercent: string }) => [k.scorePercent, k.contributionPercent])).toEqual([['91', '36.4'], ['80', '20'], ['80', '16'], ['100', '15']]);
    expect(score.kras[0].kpis[0].steps[0]).toBe('Achievement = actual 850000 ₹ ÷ target 1000000 ₹ × 100 = 85%');
    expect(score.kras[1].kpis[0].steps[0]).toContain('(lower is better)');

    const waiting = (await asA('post', `/performance/templates/${ids.T}/versions/${ids.V1}/preview`, { inputs: { [ids.V1_REVENUE]: { actual: '850000' } } })).body.data;
    expect(waiting).toMatchObject({ status: 'INCOMPLETE', scorePercent: null });
    const exempt = (await asA('post', `/performance/templates/${ids.T}/versions/${ids.V1}/preview`, { inputs: { [ids.V1_REVENUE]: { exempt: true } } })).body.data;
    expect(exempt.status).toBe('INVALID');
    expect(exempt.problems[0]).toContain('can’t be marked exempt');
  });

  it('scores in marks with a total, and refuses publishing when the marks don’t add up', async () => {
    const template = await created(await asA('post', '/performance/templates', { ...settings, templateName: 'Marks', templateCode: 'MARKS', appliesToAll: true }));
    const marks = (extra: Record<string, unknown>) => ({
      ...draft(), scoringModel: 'MARKS', totalMarks: '100', finalScaleId: null,
      kras: [
        kraLine(ids.BUSINESS, null as unknown as string, [kpiLine(ids.REVENUE, { weightPercent: null, maxMarks: '30', target: '1000000' }), kpiLine(ids.CLIENTS, { weightPercent: null, maxMarks: '20', target: '10' })], { weightPercent: null, maxMarks: '50' }),
        kraLine(ids.TEAMWORK, null as unknown as string, [], { weightPercent: null, maxMarks: '50', minMarks: '10', scoringMethod: 'DIRECT_MARKS' }),
      ],
      ...extra,
    });
    const off = (await created(await asA('put', `/performance/templates/${template.id}/draft`, marks({ totalMarks: '120' })))).versions[0];
    expect(off.problems[0].message).toBe('The KRAs add up to 100 marks, not the template’s 120. Change them, or let weights be shared out in proportion.');
    await created(await asA('put', `/performance/templates/${template.id}/draft`, marks({})));
    const v = (await created(await asA('post', `/performance/templates/${template.id}/draft/publish`))).versions[0];
    const score = (await asA('post', `/performance/templates/${template.id}/versions/${v.id}/preview`, {
      inputs: { [v.kras[0].kpis[0].id]: { actual: '800000' }, [v.kras[0].kpis[1].id]: { actual: '10' }, [v.kras[1].id]: { marks: '35' } },
    })).body.data;
    expect([score.kras[0].marks, score.kras[1].marks, score.scorePercent, score.marks]).toEqual(['44', '35', '79.00', '79.00']);
  });

  it('duplicates a template with its latest version as a new draft', async () => {
    const copy = await created(await asA('post', `/performance/templates/${ids.T}/duplicate`, { code: 'SALES_2027', name: 'Sales appraisal 2027' }));
    expect(copy.versions).toHaveLength(1);
    expect(copy.versions[0]).toMatchObject({ number: 1, status: 'DRAFT' });
    expect(copy.versions[0].kras.map((k: { kraCode: string }) => k.kraCode)).toEqual(['BUSINESS_RESULTS', 'QUALITY', 'PRODUCTIVITY', 'TEAMWORK']);
    expect(copy.scopes.departments).toEqual([{ id: ids.SALES, name: 'Sales' }]);
    expect((await asA('post', `/performance/templates/${ids.T}/duplicate`, { code: 'SALES', name: 'Clash' })).status).toBe(409);
  });

  it('does not let an archived KRA be newly added', async () => {
    const archived = await created(await asA('post', '/performance/kras', {
      kraCode: 'OLD_KRA', kraName: 'Old', description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'NONE', defaultWeightPercent: null,
      defaultMaxMarks: null, defaultMinMarks: null, ratingScaleId: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [], employeeIds: [] }, kpis: [],
      effectiveFrom: '2026-01-01', effectiveTo: null,
    }));
    await created(await asA('post', `/performance/kras/${archived.id}/archive`));
    const body = draft();
    body.kras.push(kraLine(archived.id, '5', [], { scoringMethod: 'MANUAL' }));
    const refused = await asA('put', `/performance/templates/${ids.T}/draft`, body);
    expect(refused.status).toBe(400);
    expect(refused.body.message).toContain('archived');
  });

  it('refuses to delete a KRA a template uses, and deletes a template with its versions', async () => {
    const used = await asA('delete', `/performance/kras/${ids.QUALITY}`);
    expect(used.status).toBe(409);
    expect(used.body.message).toContain('template SALES version 1');
    const spare = await created(await asA('post', '/performance/templates', { ...settings, templateCode: 'SPARE', appliesToAll: true }));
    await created(await asA('put', `/performance/templates/${spare.id}/draft`, draft()));
    expect((await asA('delete', `/performance/templates/${spare.id}`)).status).toBe(200);
    expect(await prisma.rndtechnosoft_performance_template_versions.count({ where: { template_id: spare.id } })).toBe(0);
    expect((await call('delete', `/performance/templates/${ids.T}`, viewer.token)).status).toBe(403);
    expect((await asB('delete', `/performance/templates/${ids.T}`)).status).toBe(404);
  });

  it('records what happened in the audit trail', async () => {
    const actions = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, entity_id: ids.T }, select: { action_code: true }, orderBy: { occurred_at: 'asc' } });
    expect(new Set(actions.map((x) => x.action_code))).toEqual(new Set(['PERFORMANCE_TEMPLATE_CREATED', 'PERFORMANCE_TEMPLATE_DRAFT_SAVED', 'PERFORMANCE_TEMPLATE_PUBLISHED', 'PERFORMANCE_TEMPLATE_DRAFT_DISCARDED']));
  });

  describe('permissions and workspaces', () => {
    it('lets a viewer read and try the scoring, but not change anything', async () => {
      expect((await call('get', `/performance/templates/${ids.T}`, viewer.token)).status).toBe(200);
      expect((await call('post', `/performance/templates/${ids.T}/versions/${ids.V1}/preview`, viewer.token, { inputs: {} })).status).toBe(200);
      expect((await call('put', `/performance/templates/${ids.T}/draft`, viewer.token, draft())).status).toBe(403);
      expect((await call('post', `/performance/templates/${ids.T}/draft/publish`, viewer.token)).status).toBe(403);
      expect((await call('get', '/performance/templates', outsider.token)).status).toBe(403);
    });

    it('keeps each workspace’s templates to itself', async () => {
      expect((await asB('get', `/performance/templates/${ids.T}`)).status).toBe(404);
      expect((await asB('post', `/performance/templates/${ids.T}/versions/${ids.V1}/preview`, { inputs: {} })).status).toBe(404);
      expect((await asB('put', `/performance/templates/${ids.T}/draft`, draft())).status).toBe(404);
      expect((await asB('post', `/performance/templates/${ids.T}/archive`)).status).toBe(404);
      expect((await asB('get', '/performance/templates?status=ALL')).body.data.total).toBe(0);

      const own = await created(await asB('post', '/performance/templates', { ...settings, templateCode: 'B_TPL', appliesToAll: true }));
      // A's KRAs and scales don't exist for B.
      const withA = await asB('put', `/performance/templates/${own.id}/draft`, { ...draft(), finalScaleId: null, kras: [kraLine(ids.BUSINESS, '100', [], { scoringMethod: 'MANUAL' })], fields: [] });
      expect(withA.status).toBe(400);
      expect(withA.body.message).toBe('A KRA was not found in this workspace.');
      const withScale = await asB('put', `/performance/templates/${own.id}/draft`, { ...draft(), finalScaleId: ids.FIVE, kras: [kraLine(ids.B_KRA, '100', [], { scoringMethod: 'MANUAL' })], fields: [] });
      expect(withScale.body.message).toBe('A rating scale was not found in this workspace.');
      expect((await asB('post', '/performance/templates', { ...settings, templateCode: 'B_SCOPED', scopes: { departmentIds: [ids.SALES], designationIds: [] } })).status).toBe(400);
    });
  });
});
