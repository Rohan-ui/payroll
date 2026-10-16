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
 * An appraisal from launch to its last review, end to end: the cycle and its
 * launch preview, the self-assessment with its evidence, sending back,
 * nominations with approval, a decline and its replacement, the HR approval
 * pool, what each person may see, and the database's guards.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Cycle-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

type Method = 'get' | 'post' | 'put' | 'delete';
interface Person { token: string; memberId: string; userId: string; employeeId?: string }

describe('Appraisal cycles', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const admin: Person & { tenantId: string } = { token: '', memberId: '', userId: '', tenantId: '' };
  const other: Person & { tenantId: string } = { token: '', memberId: '', userId: '', tenantId: '' };
  const people: Record<string, Person> = {};
  const ids: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const as = (who: Person) => (method: Method, url: string, body?: unknown) => call(method, url, who.token, body);
  const asAdmin = (method: Method, url: string, body?: unknown) => call(method, url, admin.token, body);
  const ok = async (response: request.Response) => {
    if (![200, 201].includes(response.status)) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data;
  };

  async function register(target: typeof admin, label: string) {
    const email = `cyc-${label.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Cycles ${label} ${SUFFIX}`, tenantCode: `CYC${label}${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    target.tenantId = r.body.activeTenant.tenantId;
    target.token = r.body.token;
    tenantIds.push(target.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: target.tenantId, rndtechnosoft_users: { email } } });
    target.memberId = member.id;
    target.userId = member.user_id;
  }

  async function role(code: string, permissionCodes: string[]) {
    const id = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id, tenant_id: admin.tenantId, role_code: `${code}_${SUFFIX.toUpperCase()}`, role_name: code, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    expect(permissions).toHaveLength(permissionCodes.length);
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: admin.tenantId, role_id: id, permission_id: p.id })) });
    return id;
  }

  /** A person with a sign-in and an employee record, optionally in a department. */
  async function person(key: string, roleIds: string[], departmentId: string | null, withLogin = true) {
    const employeeId = randomUUID();
    let userId: string | null = null;
    let memberId = '';
    let token = '';
    if (withLogin) {
      const email = `cyc-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
      emails.push(email);
      userId = randomUUID();
      await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
      memberId = randomUUID();
      await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: admin.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
      for (const roleId of roleIds) await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: admin.tenantId, tenant_member_id: memberId, role_id: roleId } });
      const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD, tenantId: admin.tenantId });
      expect(login.status).toBe(200);
      token = login.body.token;
    }
    await prisma.rndtechnosoft_employees.create({ data: { id: employeeId, tenant_id: admin.tenantId, employee_code: `${key.toUpperCase()}-${SUFFIX}`, first_name: key, user_id: userId, hire_date: new Date('2025-01-01') } });
    if (departmentId) {
      await prisma.rndtechnosoft_employee_employments.create({
        data: { id: randomUUID(), tenant_id: admin.tenantId, employee_id: employeeId, department_id: departmentId, joining_date: new Date('2025-01-01'), effective_from: new Date('2025-01-01'), employment_status: 'ACTIVE' },
      });
    }
    people[key] = { token, memberId, userId: userId ?? '', employeeId };
    return people[key];
  }

  const stage = (key: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    key, name: key, step: 1, source: 'REPORTING_MANAGER', mode: 'EACH', action: 'RATE', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null,
    aggregation: 'AVERAGE', scoreWeightPercent: null, ratedScope: 'ALL', kraIds: [], memberIds: [], roleId: null, nominatedBy: null, nominationNeedsApproval: false,
    allowsDecline: false, allowsReplacement: true, returnRule: 'NONE', dueDays: 14, reminderDays: [], escalateAfterDays: null, escalateTo: 'NONE', escalationRoleId: null,
    employeeSees: 'INDIVIDUAL_AFTER_FINALIZATION', identity: 'VISIBLE', laterStagesSee: 'INDIVIDUAL', ...extra,
  });

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
    await register(admin, 'A');
    await register(other, 'B');

    ids.SALES = randomUUID();
    ids.MARKETING = randomUUID();
    await prisma.rndtechnosoft_departments.createMany({ data: [
      { id: ids.SALES, tenant_id: admin.tenantId, department_code: `SALES-${SUFFIX}`, department_name: 'Sales' },
      { id: ids.MARKETING, tenant_id: admin.tenantId, department_code: `MKT-${SUFFIX}`, department_name: 'Marketing' },
    ] });
    const staff = await role('STAFF', ['performance.my.view']);
    ids.HR_ROLE = await role('HR', ['performance.my.view']);
    await person('Priya', [staff], ids.SALES);
    await person('Mira', [staff], null);
    await person('Ravi', [staff], null);
    await person('Pia', [staff], null);
    await person('Quinn', [staff], null);
    await person('Hana', [ids.HR_ROLE], null);
    await person('Hari', [ids.HR_ROLE], null);
    await person('Noel', [], ids.SALES, false);
    await person('Mark', [], ids.MARKETING, false);
    for (const report of ['Priya', 'Noel']) {
      await prisma.rndtechnosoft_employee_reporting_lines.create({
        data: { id: randomUUID(), tenant_id: admin.tenantId, employee_id: people[report].employeeId as string, manager_employee_id: people.Mira.employeeId as string, effective_from: new Date('2025-01-01') },
      });
    }

    // Library, template and workflow, through the API.
    const levels = ['Poor', 'Fair', 'Good', 'Great', 'Superb'].map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null }));
    const scale = await ok(await asAdmin('post', '/performance/rating-scales', { scaleCode: 'FIVE', scaleName: 'Five', draft: { inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null, levels, bands: [] } }));
    await ok(await asAdmin('post', `/performance/rating-scales/${scale.id}/draft/publish`));
    const revenue = await ok(await asAdmin('post', '/performance/kpis', {
      kpiCode: 'REVENUE', kpiName: 'Revenue', description: null, measurementType: 'CURRENCY', unitLabel: '₹', currencyCode: 'INR', direction: 'HIGHER_IS_BETTER',
      defaultTarget: null, minimumExpected: null, stretchTarget: null, defaultMaxMarks: null, ratingScaleId: null, evidenceRequirement: 'REQUIRED', evaluationInstructions: null,
    }));
    const kra = (code: string) => asAdmin('post', '/performance/kras', {
      kraCode: code, kraName: code, description: null, measurementMethod: null, evaluationInstructions: null, evidenceRequirement: 'NONE', defaultWeightPercent: null,
      defaultMaxMarks: null, defaultMinMarks: null, ratingScaleId: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [], employeeIds: [] }, kpis: [], effectiveFrom: '2026-01-01', effectiveTo: null,
    });
    const business = await ok(await kra('BUSINESS'));
    const teamwork = await ok(await kra('TEAMWORK'));
    ids.TEAMWORK = teamwork.id;
    const template = await ok(await asAdmin('post', '/performance/templates', { templateCode: 'SALES', templateName: 'Sales', description: null, appliesToAll: false, scopes: { departmentIds: [ids.SALES], designationIds: [] } }));
    ids.T = template.id;
    await ok(await asAdmin('put', `/performance/templates/${template.id}/draft`, {
      scoringModel: 'WEIGHTED', weightRule: 'MUST_TOTAL', totalMarks: null, missingRatingRule: 'BLOCK', scoreDecimals: 2, finalScaleId: null,
      kras: [
        { kraId: business.id, weightPercent: '70', maxMarks: null, minMarks: null, scoringMethod: null, ratingScaleId: null, allowsExemption: false, kpis: [
          { kpiId: revenue.id, weightPercent: '100', maxMarks: null, scoringMethod: 'PERCENT_OF_TARGET', scoringConfig: {}, targetSource: 'PER_EMPLOYEE', target: null, threshold: null, stretch: null, ratingScaleId: null, allowsExemption: false },
        ] },
        { kraId: teamwork.id, weightPercent: '30', maxMarks: null, minMarks: null, scoringMethod: 'RATING_SCALE', ratingScaleId: scale.id, allowsExemption: false, kpis: [] },
      ],
      fields: [{ key: 'achievements', type: 'ACHIEVEMENTS', label: 'Key achievements', description: null, required: true, filledBy: 'SELF', visibility: 'ALWAYS', config: { maxLength: 2000 }, ratingScaleId: null, scored: false, weightPercent: null, maxMarks: null }],
    }));
    const published = await ok(await asAdmin('post', `/performance/templates/${template.id}/draft/publish`));
    ids.REVENUE_LINE = published.versions[0].kras[0].kpis[0].id;
    ids.TEAMWORK_LINE = published.versions[0].kras[1].id;
    ids.ACHIEVEMENTS_LINE = published.versions[0].fields[0].id;

    const workflow = await ok(await asAdmin('post', '/performance/workflows', { workflowCode: 'STANDARD', workflowName: 'Standard', description: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [] } }));
    ids.W = workflow.id;
    await ok(await asAdmin('put', `/performance/workflows/${workflow.id}/draft`, {
      reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false,
      stages: [
        stage('self', { name: 'Self-assessment', source: 'SELF', scoreWeightPercent: '10' }),
        stage('manager', { name: 'Manager review', step: 2, scoreWeightPercent: '60', returnRule: 'SELF_ASSESSMENT', employeeSees: 'INDIVIDUAL_AFTER_STAGE' }),
        stage('peers', {
          name: 'Peer review', step: 2, source: 'NOMINATED', nominatedBy: 'EMPLOYEE', nominationNeedsApproval: true, minReviewers: 2, maxReviewers: 3, completion: 'AT_LEAST', minCompleted: 2,
          scoreWeightPercent: '30', ratedScope: 'SELECTED_KRAS', kraIds: [teamwork.id], allowsDecline: true, identity: 'HIDDEN_FROM_EMPLOYEE', employeeSees: 'AGGREGATE_AFTER_FINALIZATION', laterStagesSee: 'AGGREGATE',
        }),
        stage('hr', { name: 'HR approval', step: 3, source: 'ROLE_MEMBERS', roleId: ids.HR_ROLE, mode: 'POOL', maxReviewers: 3, completion: 'AT_LEAST', minCompleted: 1, action: 'APPROVE', returnRule: 'ANY_EARLIER' }),
      ],
    }));
    await ok(await asAdmin('post', `/performance/workflows/${workflow.id}/draft/publish`));
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      for (const model of [
        'rndtechnosoft_performance_review_files', 'rndtechnosoft_performance_review_items', 'rndtechnosoft_performance_reviews', 'rndtechnosoft_performance_nominations',
        'rndtechnosoft_performance_reviewer_assignments', 'rndtechnosoft_performance_appraisal_stages', 'rndtechnosoft_performance_appraisal_targets', 'rndtechnosoft_performance_appraisals',
        'rndtechnosoft_performance_cycle_scopes', 'rndtechnosoft_performance_cycle_templates', 'rndtechnosoft_performance_cycle_workflows', 'rndtechnosoft_performance_cycles',
        'rndtechnosoft_performance_workflow_stage_kras', 'rndtechnosoft_performance_workflow_stage_members', 'rndtechnosoft_performance_workflow_stages', 'rndtechnosoft_performance_workflow_versions',
        'rndtechnosoft_performance_workflow_scopes', 'rndtechnosoft_performance_workflows', 'rndtechnosoft_performance_template_fields', 'rndtechnosoft_performance_template_kpis',
        'rndtechnosoft_performance_template_kras', 'rndtechnosoft_performance_template_versions', 'rndtechnosoft_performance_template_scopes', 'rndtechnosoft_performance_templates',
        'rndtechnosoft_performance_kra_kpis', 'rndtechnosoft_performance_kra_scopes', 'rndtechnosoft_performance_kras', 'rndtechnosoft_performance_kpis',
        'rndtechnosoft_performance_rating_scale_levels', 'rndtechnosoft_performance_rating_scale_bands', 'rndtechnosoft_performance_rating_scale_versions', 'rndtechnosoft_performance_rating_scales',
        'rndtechnosoft_employee_reporting_lines', 'rndtechnosoft_employee_employments', 'rndtechnosoft_employees', 'rndtechnosoft_departments',
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

  const cycleBody = (extra: Record<string, unknown> = {}) => ({
    cycleName: 'H2 2026 review', description: null, cycleKind: 'HALF_YEARLY', periodStart: '2026-07-01', periodEnd: '2026-12-31', appliesToAll: false,
    scopes: { departmentIds: [ids.SALES], designationIds: [] }, joinedOnOrBefore: '2026-06-30', allowsOverlap: false, templateIds: [ids.T], workflowIds: [ids.W], ...extra,
  });
  const selfOf = async (who: Person) => (await ok(await as(who)('get', '/performance/my/inbox'))).toDo.find((t: { isSelf: boolean }) => t.isSelf);
  const taskOf = async (who: Person, stage: string) => (await ok(await as(who)('get', '/performance/my/inbox'))).toDo.find((t: { stage: string }) => t.stage === stage);

  it('previews who would be appraised, with what, before launching', async () => {
    const cycle = await ok(await asAdmin('post', '/performance/cycles', { ...cycleBody(), cycleCode: 'H2_2026' }));
    ids.C = cycle.id;
    const preview = await ok(await asAdmin('post', `/performance/cycles/${ids.C}/preview`));
    expect(preview.rows.map((r: { employee: { name: string } }) => r.employee.name)).toEqual(['Noel', 'Priya']);
    const priya = preview.rows.find((r: { employee: { name: string } }) => r.employee.name === 'Priya');
    expect(priya).toMatchObject({ template: { code: 'SALES' }, templateReason: 'Meant for their department or designation', workflow: { code: 'STANDARD' }, problems: [] });
    expect(priya.reviewers.map((s: { stage: string; status: string }) => [s.stage, s.status])).toEqual([
      ['Self-assessment', 'RESOLVED'], ['Manager review', 'RESOLVED'], ['Peer review', 'NEEDS_NOMINATION'], ['HR approval', 'RESOLVED'],
    ]);
    const noel = preview.rows.find((r: { employee: { name: string } }) => r.employee.name === 'Noel');
    expect(noel.reviewers[0]).toMatchObject({ stage: 'Self-assessment', status: 'NEEDS_ASSIGNMENT' });
    expect(preview.summary).toMatchObject({ eligible: 2, ready: 2, needingReviewers: 2 });
  });

  it('launches only when confirmed, once, without Noel when left out', async () => {
    expect((await asAdmin('post', `/performance/cycles/${ids.C}/launch`, { confirm: false, excludeEmployeeIds: [], choices: [] })).status).toBe(400);
    const launched = await ok(await asAdmin('post', `/performance/cycles/${ids.C}/launch`, { confirm: true, excludeEmployeeIds: [people.Noel.employeeId], choices: [] }));
    expect(launched).toMatchObject({ started: 1, skipped: [], cycle: { status: 'ACTIVE', progress: { inProgress: 1 } } });
    expect((await asAdmin('post', `/performance/cycles/${ids.C}/launch`, { confirm: true, excludeEmployeeIds: [], choices: [] })).status).toBe(400);
    // People are added to a running cycle by name, and nobody twice.
    const again = await asAdmin('post', `/performance/cycles/${ids.C}/launch`, { confirm: true, excludeEmployeeIds: [], choices: [], onlyEmployeeIds: [people.Priya.employeeId] });
    expect(again.status).toBe(400);
    const list = await ok(await asAdmin('get', `/performance/cycles/${ids.C}/appraisals`));
    expect(list.items).toHaveLength(1);
    ids.A = list.items[0].id;
    expect(list.items[0].currentStages).toEqual([expect.objectContaining({ name: 'Self-assessment', status: 'OPEN', overdue: false })]);
  });

  it('is protected by the database: one appraisal per cycle, published versions only, nobody reviews themselves', async () => {
    const appraisal = await prisma.rndtechnosoft_performance_appraisals.findUniqueOrThrow({ where: { id: ids.A } });
    await expect(prisma.rndtechnosoft_performance_appraisals.create({ data: { ...appraisal, id: randomUUID() } })).rejects.toThrow(/uq_performance_appraisals_employee|Unique constraint/);
    const manager = await prisma.rndtechnosoft_performance_appraisal_stages.findFirstOrThrow({ where: { appraisal_id: ids.A, stage_key: 'manager' } });
    await expect(prisma.rndtechnosoft_performance_reviewer_assignments.create({
      data: { id: randomUUID(), tenant_id: admin.tenantId, appraisal_id: ids.A, appraisal_stage_id: manager.id, reviewer_tenant_member_id: people.Priya.memberId, found_via: 'test' },
    })).rejects.toThrow(/only theirs/);
    const selfReview = await asAdmin('post', `/performance/appraisals/${ids.A}/stages/manager/assignments`, { tenantMemberId: people.Priya.memberId, replacesAssignmentId: null, reason: 'Test self review' });
    expect(selfReview.status).toBe(400);
    expect(selfReview.body.message).toContain('outside the self-assessment');
    expect((await asAdmin('delete', `/performance/templates/${ids.T}`)).body.message).toContain('1 appraisal in cycle H2_2026');
    expect((await asAdmin('delete', `/performance/cycles/${ids.C}`)).status).toBe(409);
  });

  it('takes a self-assessment only when complete, with evidence and the employee’s own target', async () => {
    const task = await selfOf(people.Priya);
    expect(task).toMatchObject({ employee: { name: 'Priya' }, stage: 'Self-assessment', isSelf: true });
    ids.SELF = task.assignmentId;
    const form = await ok(await as(people.Priya)('get', `/performance/my/reviews/${ids.SELF}`));
    expect(form.lines.map((l: { name: string }) => l.name)).toEqual(['Revenue', 'TEAMWORK', 'Key achievements']);
    expect(form.canEdit).toBe(true);
    await ok(await as(people.Priya)('put', `/performance/my/reviews/${ids.SELF}`, {
      overallComment: 'A strong half',
      items: [
        { lineId: ids.REVENUE_LINE, kind: 'KPI', actual: '850000' },
        { lineId: ids.TEAMWORK_LINE, kind: 'KRA', rating: '4' },
        { lineId: ids.ACHIEVEMENTS_LINE, kind: 'FIELD', text: 'Closed three new accounts' },
      ],
    }));
    const refused = await as(people.Priya)('post', `/performance/my/reviews/${ids.SELF}/submit`);
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain('There is no target above 0');
    expect(JSON.stringify(refused.body)).toContain('attach the evidence it asks for');

    // HR sets her own target; she attaches evidence.
    await ok(await asAdmin('put', `/performance/appraisals/${ids.A}/targets`, { targets: [{ templateKpiId: ids.REVENUE_LINE, target: '1000000', threshold: null, stretch: null }] }));
    const upload = await request(app.getHttpServer()).post(`${API}/performance/my/reviews/${ids.SELF}/files?lineId=${ids.REVENUE_LINE}&kind=KPI`)
      .set('Host', LOCAL).set('Authorization', `Bearer ${people.Priya.token}`).attach('file', PDF, 'sales-report.pdf');
    expect(upload.status).toBe(201);
    const fake = await request(app.getHttpServer()).post(`${API}/performance/my/reviews/${ids.SELF}/files`)
      .set('Host', LOCAL).set('Authorization', `Bearer ${people.Priya.token}`).attach('file', Buffer.from('not a pdf'), 'report.pdf');
    expect(fake.status).toBe(400);
    const preview = await ok(await as(people.Priya)('get', `/performance/my/reviews/${ids.SELF}`));
    expect(preview.preview.lines.find((l: { lineId: string }) => l.lineId === ids.REVENUE_LINE).scorePercent).toBe('85');
    ids.EVIDENCE = preview.review.files[0].id;

    await ok(await as(people.Priya)('post', `/performance/my/reviews/${ids.SELF}/submit`));
    expect((await as(people.Priya)('post', `/performance/my/reviews/${ids.SELF}/submit`)).status).toBe(403);
    const review = await prisma.rndtechnosoft_performance_reviews.findFirstOrThrow({ where: { assignment_id: ids.SELF } });
    await expect(prisma.rndtechnosoft_performance_reviews.update({ where: { id: review.id }, data: { overall_comment: 'changed' } })).rejects.toThrow(/submitted review cannot be changed/);
    expect((await asAdmin('put', `/performance/appraisals/${ids.A}/targets`, { targets: [{ templateKpiId: ids.REVENUE_LINE, target: '2', threshold: null, stretch: null }] })).status).toBe(409);
  });

  it('opens the next step: the manager sees the self-assessment; the peer stage waits for nominations', async () => {
    const detail = await ok(await asAdmin('get', `/performance/appraisals/${ids.A}`));
    expect(detail.stages.map((s: { key: string; status: string }) => [s.key, s.status])).toEqual([['self', 'COMPLETE'], ['manager', 'OPEN'], ['peers', 'NEEDS_REVIEWERS'], ['hr', 'WAITING']]);
    const task = await taskOf(people.Mira, 'Manager review');
    ids.MANAGER = task.assignmentId;
    const form = await ok(await as(people.Mira)('get', `/performance/my/reviews/${ids.MANAGER}`));
    expect(form.earlier).toEqual([expect.objectContaining({ stage: 'Self-assessment', mode: 'INDIVIDUAL', reviews: [expect.objectContaining({ reviewer: 'Priya', overallComment: 'A strong half' })] })]);
    const evidence = await call('get', `/performance/my/files/${ids.EVIDENCE}`, people.Mira.token);
    expect(evidence.status).toBe(200);
    expect((await call('get', `/performance/my/files/${ids.EVIDENCE}`, people.Ravi.token)).status).toBe(404);
  });

  it('sends the appraisal back to the self-assessment, keeping what was submitted', async () => {
    await ok(await as(people.Mira)('post', `/performance/my/reviews/${ids.MANAGER}/send-back`, { toStageKey: 'self', reason: 'Add the Q4 numbers' }));
    const history = await prisma.rndtechnosoft_performance_reviewer_assignments.findMany({ where: { appraisal_id: ids.A, reviewer_tenant_member_id: people.Priya.memberId }, orderBy: { created_at: 'asc' } });
    expect(history.map((h) => h.assignment_status)).toEqual(['RETURNED', 'ASSIGNED']);
    const again = await selfOf(people.Priya);
    expect(again).toMatchObject({ draftSaved: true, reason: 'Sent back for correction: Add the Q4 numbers' });
    const form = await ok(await as(people.Priya)('get', `/performance/my/reviews/${again.assignmentId}`));
    expect(form.review.items.find((i: { lineId: string }) => i.lineId === ids.REVENUE_LINE).actual).toBe('850000');
    expect(form.review.files).toHaveLength(1);
    await ok(await as(people.Priya)('put', `/performance/my/reviews/${again.assignmentId}`, {
      overallComment: 'A strong half, with Q4', items: [
        { lineId: ids.REVENUE_LINE, kind: 'KPI', actual: '900000' }, { lineId: ids.TEAMWORK_LINE, kind: 'KRA', rating: '4' }, { lineId: ids.ACHIEVEMENTS_LINE, kind: 'FIELD', text: 'Closed three new accounts' },
      ],
    }));
    await ok(await as(people.Priya)('post', `/performance/my/reviews/${again.assignmentId}/submit`));
    expect((await taskOf(people.Mira, 'Manager review')).assignmentId).toBe(ids.MANAGER);
  });

  it('takes nominations, approved by the manager, refusing someone already reviewing', async () => {
    const hrPerson = await as(people.Priya)('post', `/performance/my/appraisals/${ids.A}/stages/peers/nominations`, { tenantMemberIds: [people.Hana.memberId] });
    expect(hrPerson.status).toBe(201);
    await ok(await as(people.Priya)('post', `/performance/my/appraisals/${ids.A}/stages/peers/nominations`, { tenantMemberIds: [people.Ravi.memberId, people.Pia.memberId] }));
    expect((await as(people.Ravi)('post', `/performance/my/appraisals/${ids.A}/stages/peers/nominations`, { tenantMemberIds: [people.Quinn.memberId] })).status).toBe(403);
    const waiting = (await ok(await as(people.Mira)('get', '/performance/my/inbox'))).nominationsToDecide;
    expect(waiting.map((n: { nominee: string }) => n.nominee).sort()).toEqual(['Hana', 'Pia', 'Ravi']);
    // Hana already reviews in HR approval, so she can't also be a peer.
    const hana = waiting.find((n: { nominee: string }) => n.nominee === 'Hana');
    expect((await as(people.Mira)('post', `/performance/my/nominations/${hana.id}/decision`, { approve: true })).status).toBe(409);
    await ok(await as(people.Mira)('post', `/performance/my/nominations/${hana.id}/decision`, { approve: false, note: 'Already reviewing as HR' }));
    const approve = waiting.filter((x: { nominee: string }) => x.nominee !== 'Hana').sort((a: { nominee: string }, b: { nominee: string }) => b.nominee.localeCompare(a.nominee));
    for (const n of approve) await ok(await as(people.Mira)('post', `/performance/my/nominations/${n.id}/decision`, { approve: true }));
    expect((await as(people.Ravi)('post', `/performance/my/nominations/${hana.id}/decision`, { approve: true })).status).toBe(404);
    const detail = await ok(await asAdmin('get', `/performance/appraisals/${ids.A}`));
    expect(detail.stages.find((s: { key: string }) => s.key === 'peers')).toMatchObject({ status: 'OPEN' });
  });

  it('keeps side-by-side reviews apart, and a decline asks for a replacement', async () => {
    const ravi = await taskOf(people.Ravi, 'Peer review');
    const raviForm = await ok(await as(people.Ravi)('get', `/performance/my/reviews/${ravi.assignmentId}`));
    expect(raviForm.lines.map((l: { name: string }) => l.name)).toEqual(['TEAMWORK']);
    // Earlier reviews are read against every line, not only the ones this stage rates.
    expect(raviForm.allLines).toHaveLength(3);
    expect(raviForm.earlier.map((e: { stage: string }) => e.stage)).toEqual(['Self-assessment']);
    await ok(await as(people.Mira)('put', `/performance/my/reviews/${ids.MANAGER}`, { overallComment: 'Agreed', items: [{ lineId: ids.REVENUE_LINE, kind: 'KPI', actual: '900000' }, { lineId: ids.TEAMWORK_LINE, kind: 'KRA', rating: '5' }] }));
    await ok(await as(people.Mira)('post', `/performance/my/reviews/${ids.MANAGER}/submit`));
    // Ravi still can't see the manager's review: it runs beside his.
    expect((await ok(await as(people.Ravi)('get', `/performance/my/reviews/${ravi.assignmentId}`))).earlier.map((e: { stage: string }) => e.stage)).toEqual(['Self-assessment']);
    expect((await as(people.Ravi)('get', `/performance/my/reviews/${ids.MANAGER}`)).status).toBe(404);

    await ok(await as(people.Ravi)('put', `/performance/my/reviews/${ravi.assignmentId}`, { overallComment: 'Great teammate', items: [{ lineId: ids.TEAMWORK_LINE, kind: 'KRA', rating: '5' }] }));
    await ok(await as(people.Ravi)('post', `/performance/my/reviews/${ravi.assignmentId}/submit`));
    const pia = await taskOf(people.Pia, 'Peer review');
    await ok(await as(people.Pia)('post', `/performance/my/reviews/${pia.assignmentId}/decline`, { reason: 'Never worked with Priya' }));
    let detail = await ok(await asAdmin('get', `/performance/appraisals/${ids.A}`));
    expect(detail.stages.find((s: { key: string }) => s.key === 'peers').status).toBe('NEEDS_REVIEWERS');
    expect(detail.currentStep).toBe(2);

    await ok(await asAdmin('post', `/performance/appraisals/${ids.A}/stages/peers/assignments`, { tenantMemberId: people.Quinn.memberId, replacesAssignmentId: null, reason: 'Pia declined' }));
    const quinn = await taskOf(people.Quinn, 'Peer review');
    await ok(await as(people.Quinn)('put', `/performance/my/reviews/${quinn.assignmentId}`, { overallComment: null, items: [{ lineId: ids.TEAMWORK_LINE, kind: 'KRA', rating: '3' }] }));
    await ok(await as(people.Quinn)('post', `/performance/my/reviews/${quinn.assignmentId}/submit`));
    detail = await ok(await asAdmin('get', `/performance/appraisals/${ids.A}`));
    expect(detail.stages.map((s: { key: string; status: string }) => [s.key, s.status])).toEqual([['self', 'COMPLETE'], ['manager', 'COMPLETE'], ['peers', 'COMPLETE'], ['hr', 'OPEN']]);
    expect(detail.stages.find((s: { key: string }) => s.key === 'peers').assignments.map((a: { reviewer: { name: string }; status: string }) => [a.reviewer.name, a.status]))
      .toEqual([['Ravi', 'SUBMITTED'], ['Pia', 'DECLINED'], ['Quinn', 'SUBMITTED']]);
  });

  it('shows the HR pool peers only combined and nameless, and completes when one of them approves', async () => {
    const hari = await taskOf(people.Hari, 'HR approval');
    const form = await ok(await as(people.Hari)('get', `/performance/my/reviews/${hari.assignmentId}`));
    const peers = form.earlier.find((e: { stage: string }) => e.stage === 'Peer review');
    expect(peers).toMatchObject({ mode: 'AGGREGATE', reviews: [] });
    expect(peers.combined).toEqual([expect.objectContaining({ lineId: ids.TEAMWORK_LINE, scorePercent: '80', reviews: 2 })]);
    expect(form.earlier.find((e: { stage: string }) => e.stage === 'Manager review').reviews[0].reviewer).toBe('Mira');
    await ok(await as(people.Hari)('post', `/performance/my/reviews/${hari.assignmentId}/submit`));
    const detail = await ok(await asAdmin('get', `/performance/appraisals/${ids.A}`));
    expect(detail.status).toBe('REVIEWS_COMPLETE');
    expect(detail.stages.find((s: { key: string }) => s.key === 'hr').assignments.map((a: { reviewer: { name: string }; status: string }) => [a.reviewer.name, a.status]).sort())
      .toEqual([['Hana', 'CANCELLED'], ['Hari', 'SUBMITTED']]);
  });

  it('shows the employee only what the workflow lets her see', async () => {
    const mine = await ok(await as(people.Priya)('get', `/performance/my/appraisals/${ids.A}`));
    expect(mine.stages.map((s: { status: string }) => s.status)).toEqual(['COMPLETE', 'COMPLETE', 'COMPLETE', 'COMPLETE']);
    // The manager's review is shown once that stage is done; the peers' only combined after finalization (phase 5), so not yet.
    expect(mine.readable.map((r: { stage: string }) => r.stage)).toEqual(['Manager review', 'HR approval'].filter((s) => s === 'Manager review'));
    const managerReview = await ok(await as(people.Priya)('get', `/performance/my/reviews/${mine.readable[0].assignmentId}/read`));
    expect(managerReview).toMatchObject({ stage: 'Manager review', reviewer: 'Mira', overallComment: 'Agreed' });
    const raviAssignment = (await prisma.rndtechnosoft_performance_reviewer_assignments.findFirstOrThrow({ where: { appraisal_id: ids.A, reviewer_tenant_member_id: people.Ravi.memberId } })).id;
    expect((await as(people.Priya)('get', `/performance/my/reviews/${raviAssignment}/read`)).status).toBe(404);
    expect((await as(people.Priya)('get', `/performance/my/reviews/${raviAssignment}`)).status).toBe(404);
    expect((await as(people.Ravi)('get', `/performance/my/appraisals/${ids.A}`)).status).toBe(404);
  });

  it('keeps cycles and appraisals to their workspace and to people allowed', async () => {
    expect((await call('get', `/performance/cycles/${ids.C}`, other.token)).status).toBe(404);
    expect((await call('get', `/performance/appraisals/${ids.A}`, other.token)).status).toBe(404);
    expect((await call('get', `/performance/my/reviews/${ids.MANAGER}`, other.token)).status).toBe(404);
    const found = await ok(await as(people.Priya)('get', '/performance/my/colleagues?search=rav'));
    expect(found).toEqual([{ id: people.Ravi.memberId, name: 'Ravi', code: `RAVI-${SUFFIX}` }]);
    expect(await ok(await as(people.Priya)('get', '/performance/my/colleagues?search=r'))).toEqual([]);
    expect(await ok(await call('get', '/performance/my/colleagues?search=rav', other.token))).toEqual([]);
    expect((await call('get', '/performance/cycles', people.Ravi.token)).status).toBe(403);
    expect((await call('get', `/performance/appraisals/reviews/${ids.MANAGER}`, people.Ravi.token)).status).toBe(403);
    const asHr = await ok(await asAdmin('get', `/performance/appraisals/reviews/${ids.MANAGER}`));
    expect(asHr.review.status).toBe('SUBMITTED');
    const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: admin.tenantId, entity_id: ids.A }, select: { action_code: true, metadata: true } });
    expect(new Set(audit.map((a) => a.action_code))).toEqual(new Set([
      'PERFORMANCE_TARGETS_SET', 'PERFORMANCE_REVIEW_SUBMITTED', 'PERFORMANCE_APPRAISAL_SENT_BACK', 'PERFORMANCE_REVIEWERS_NOMINATED',
      'PERFORMANCE_NOMINATION_APPROVED', 'PERFORMANCE_NOMINATION_REJECTED', 'PERFORMANCE_REVIEW_DECLINED', 'PERFORMANCE_REVIEWER_ASSIGNED',
    ]));
    expect(JSON.stringify(audit)).not.toContain('Great teammate');
  });
});
