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
 * Who reviews whom, end to end: reporting managers as effective-dated
 * history, linking employees to sign-in accounts, review workflows with
 * their rules, finding each stage's reviewers from the workspace's records,
 * the database's guards, permissions and workspace isolation.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Workflow-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'delete';
type Person = { token: string; email: string; memberId: string; userId: string; name: string };
type Workspace = Person & { tenantId: string };

describe('Review workflows', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a: Workspace = { tenantId: '', token: '', email: `wf-a-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Asha Admin' };
  const b: Workspace = { tenantId: '', token: '', email: `wf-b-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Bala Admin' };
  const viewer: Person = { token: '', email: `wf-view-${SUFFIX}@rnd.test`, memberId: '', userId: '', name: 'Vik Viewer' };
  const ids: Record<string, string> = {};
  const members: Record<string, string> = {};

  const call = (method: Method, url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, url: string, body?: unknown) => call(method, url, a.token, body);
  const asB = (method: Method, url: string, body?: unknown) => call(method, url, b.token, body);
  const ok = async (response: request.Response) => {
    if (![200, 201].includes(response.status)) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);
    return response.body.data;
  };

  const stage = (key: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    key, name: key, step: 1, source: 'REPORTING_MANAGER', mode: 'EACH', action: 'RATE', minReviewers: 1, maxReviewers: 1, completion: 'ALL', minCompleted: null,
    aggregation: 'AVERAGE', scoreWeightPercent: null, ratedScope: 'ALL', kraIds: [], memberIds: [], roleId: null, nominatedBy: null, nominationNeedsApproval: false,
    allowsDecline: false, allowsReplacement: true, returnRule: 'NONE', dueDays: 14, reminderDays: [], escalateAfterDays: null, escalateTo: 'NONE', escalationRoleId: null,
    employeeSees: 'INDIVIDUAL_AFTER_FINALIZATION', identity: 'VISIBLE', laterStagesSee: 'INDIVIDUAL', ...extra,
  });
  /** Self → manager, department head and peers side by side → HR approval. */
  const draft = (extra: Record<string, unknown> = {}) => ({
    reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false,
    stages: [
      stage('self', { name: 'Self-assessment', source: 'SELF', scoreWeightPercent: '10' }),
      stage('manager', { name: 'Manager review', step: 2, scoreWeightPercent: '60', returnRule: 'SELF_ASSESSMENT', reminderDays: [1, 3], escalateTo: 'DEPARTMENT_HEAD', escalateAfterDays: 2 }),
      stage('head', { name: 'Department head review', step: 2, source: 'DEPARTMENT_HEAD', scoreWeightPercent: '10' }),
      stage('peers', {
        name: 'Peer review', step: 2, source: 'NOMINATED', nominatedBy: 'EMPLOYEE', nominationNeedsApproval: true, minReviewers: 2, maxReviewers: 5, completion: 'AT_LEAST', minCompleted: 2,
        scoreWeightPercent: '20', identity: 'HIDDEN_FROM_EMPLOYEE', employeeSees: 'AGGREGATE_AFTER_FINALIZATION', allowsDecline: true,
      }),
      stage('hr', { name: 'HR approval', step: 3, source: 'ROLE_MEMBERS', roleId: ids.HR_ROLE, mode: 'POOL', maxReviewers: 3, completion: 'AT_LEAST', minCompleted: 1, action: 'APPROVE', returnRule: 'ANY_EARLIER' }),
    ],
    ...extra,
  });

  async function register(workspace: Workspace, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Workflows ${label} ${SUFFIX}`, tenantCode: `WF${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  /** A workspace member (a sign-in) with a role of the given permissions. */
  async function member(tenantId: string, key: string, roleId: string | null = null) {
    const email = `wf-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    userEmails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    if (roleId) await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId } });
    members[key] = memberId;
    return { userId, memberId, email };
  }

  async function role(tenantId: string, code: string, permissionCodes: string[] = []) {
    const id = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id, tenant_id: tenantId, role_code: `${code}_${SUFFIX.toUpperCase()}`, role_name: code, is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
    if (permissions.length) await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: tenantId, role_id: id, permission_id: p.id })) });
    return id;
  }

  async function employee(tenantId: string, code: string, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: `${code}-${SUFFIX}`, first_name: code, ...extra } });
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

    // A viewer: sees people and performance setup, changes nothing.
    const viewerRole = await role(a.tenantId, 'VIEWER', ['people.view', 'performance.library.view']);
    const v = await member(a.tenantId, 'Viewer', viewerRole);
    viewer.memberId = v.memberId;
    viewer.token = (await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: v.email, password: PASSWORD, tenantId: a.tenantId })).body.token;

    ids.HR_ROLE = await role(a.tenantId, 'HR');
    ids.SALES = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: ids.SALES, tenant_id: a.tenantId, department_code: `SALES-${SUFFIX}`, department_name: 'Sales' } });

    // Priya is appraised; Mira manages her; Dev heads Sales; Hana and Hari are HR; Ravi reports to Priya.
    const priya = await member(a.tenantId, 'Priya', ids.HR_ROLE);
    ids.PRIYA_USER = priya.userId;
    ids.PRIYA = await employee(a.tenantId, 'PRIYA', { work_email: priya.email.toUpperCase() });
    ids.MIRA = await employee(a.tenantId, 'MIRA', { user_id: (await member(a.tenantId, 'Mira')).userId });
    ids.DEV = await employee(a.tenantId, 'DEV', { user_id: (await member(a.tenantId, 'Dev')).userId });
    ids.RAVI = await employee(a.tenantId, 'RAVI', { user_id: (await member(a.tenantId, 'Ravi')).userId });
    ids.NOLOGIN = await employee(a.tenantId, 'NOLOGIN');
    ids.GONE = await employee(a.tenantId, 'GONE', { employee_status: 'TERMINATED' });
    await member(a.tenantId, 'Hana', ids.HR_ROLE);
    await member(a.tenantId, 'Hari', ids.HR_ROLE);
    await prisma.rndtechnosoft_employee_employments.create({
      data: { id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.PRIYA, department_id: ids.SALES, joining_date: new Date('2025-01-01'), effective_from: new Date('2025-01-01'), employment_status: 'ACTIVE' },
    });
    ids.EB = await employee(b.tenantId, 'EB');
    ids.B_ROLE = await role(b.tenantId, 'BHR');
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_performance_workflow_stage_kras.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_workflow_stage_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_workflow_stages.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_workflow_versions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_workflow_scopes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_performance_workflows.deleteMany({ where: scope });
      await prisma.rndtechnosoft_department_heads.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_reporting_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
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

  describe('reporting managers', () => {
    it('keeps history: a new manager closes the old line the day before', async () => {
      await ok(await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.DEV, effectiveFrom: '2026-01-01' }));
      const data = await ok(await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.MIRA, effectiveFrom: '2026-07-01', reason: 'Team change' }));
      expect(data.history.map((l: { manager: { id: string }; effectiveFrom: string; effectiveTo: string | null }) => [l.manager.id, l.effectiveFrom, l.effectiveTo]))
        .toEqual([[ids.MIRA, '2026-07-01', null], [ids.DEV, '2026-01-01', '2026-06-30']]);
      await ok(await asA('post', `/employees/${ids.RAVI}/reporting`, { managerEmployeeId: ids.PRIYA, effectiveFrom: '2026-01-01' }));
    });

    it('refuses reporting to oneself, an inactive manager, a loop and a date before the latest line', async () => {
      expect((await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.PRIYA, effectiveFrom: '2026-09-01' })).status).toBe(400);
      expect((await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.GONE, effectiveFrom: '2026-09-01' })).status).toBe(400);
      const loop = await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.RAVI, effectiveFrom: '2026-09-01' });
      expect(loop.status).toBe(400);
      expect(loop.body.message).toContain('loop');
      expect((await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.DEV, effectiveFrom: '2026-03-01' })).status).toBe(400);
    });

    it('is protected by the database: one primary manager at a time, and a line is never edited', async () => {
      await expect(prisma.rndtechnosoft_employee_reporting_lines.create({
        data: { id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.PRIYA, manager_employee_id: ids.DEV, effective_from: new Date('2026-08-01') },
      })).rejects.toThrow(/ex_employee_reporting_lines_primary_overlap|exclusion/);
      const line = await prisma.rndtechnosoft_employee_reporting_lines.findFirstOrThrow({ where: { tenant_id: a.tenantId, employee_id: ids.PRIYA, manager_employee_id: ids.MIRA } });
      await expect(prisma.rndtechnosoft_employee_reporting_lines.update({ where: { id: line.id }, data: { manager_employee_id: ids.DEV } })).rejects.toThrow(/cannot be edited/);
      await expect(prisma.rndtechnosoft_employee_reporting_lines.create({
        data: { id: randomUUID(), tenant_id: a.tenantId, employee_id: ids.DEV, manager_employee_id: ids.DEV, effective_from: new Date('2026-01-01') },
      })).rejects.toThrow(/ck_employee_reporting_lines_not_self|check constraint/);
    });

    it('cancels a mistaken latest line, reopening the one it closed, and records it', async () => {
      const wrong = await ok(await asA('post', `/employees/${ids.PRIYA}/reporting`, { managerEmployeeId: ids.DEV, effectiveFrom: '2026-10-01' }));
      const lineId = wrong.history[0].lineId;
      const after = await ok(await asA('post', `/employees/${ids.PRIYA}/reporting/${lineId}/cancel`, { reason: 'Wrong person' }));
      expect(after.history.map((l: { status: string; effectiveTo: string | null; manager: { id: string } }) => [l.manager.id, l.status, l.effectiveTo]))
        .toEqual([[ids.DEV, 'CANCELLED', null], [ids.MIRA, 'ACTIVE', null], [ids.DEV, 'ACTIVE', '2026-06-30']]);
      const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: a.tenantId, entity_id: ids.PRIYA }, select: { action_code: true } });
      expect(audit.map((x) => x.action_code)).toEqual(expect.arrayContaining(['EMPLOYEE_MANAGER_SET', 'EMPLOYEE_MANAGER_CANCELLED']));
    });

    it('shows today’s manager on the employee record', async () => {
      const record = (await asA('get', `/employees/${ids.PRIYA}`)).body;
      const lines = (record.data ?? record).rndtechnosoft_employee_reporting_lines_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees;
      expect(lines.map((l: { manager_employee_id: string }) => l.manager_employee_id)).toEqual([ids.MIRA]);
    });
  });

  describe('sign-in accounts', () => {
    it('suggests the member with the same work email, links only when asked, once per account', async () => {
      const before = await ok(await asA('get', `/employees/${ids.PRIYA}/login`));
      expect(before.linked).toBeNull();
      expect(before.suggestions.map((s: { tenantMemberId: string }) => s.tenantMemberId)).toEqual([members.Priya]);
      expect((await prisma.rndtechnosoft_employees.findUniqueOrThrow({ where: { id: ids.PRIYA } })).user_id).toBeNull();

      const linked = await ok(await asA('put', `/employees/${ids.PRIYA}/login`, { tenantMemberId: members.Priya }));
      expect(linked.linked).toMatchObject({ tenantMemberId: members.Priya, name: 'Priya' });
      const candidates = (await ok(await asA('get', `/employees/${ids.NOLOGIN}/login/candidates?search=wf-`))).map((c: { id: string }) => c.id);
      expect(candidates).toContain(members.Hana);
      expect(candidates).not.toContain(members.Priya);
      const clash = await asA('put', `/employees/${ids.NOLOGIN}/login`, { tenantMemberId: members.Priya });
      expect(clash.status).toBe(409);
      expect(clash.body.message).toContain('already linked to PRIYA');
    });

    it('shows a viewer who is linked, without the email or suggestions, and lets only the right people change it', async () => {
      const seen = await ok(await call('get', `/employees/${ids.PRIYA}/login`, viewer.token));
      expect(seen.linked).toMatchObject({ name: 'Priya', email: null });
      expect((await call('put', `/employees/${ids.NOLOGIN}/login`, viewer.token, { tenantMemberId: members.Hana })).status).toBe(403);
      expect((await call('post', `/employees/${ids.NOLOGIN}/reporting`, viewer.token, { managerEmployeeId: ids.MIRA, effectiveFrom: '2026-01-01' })).status).toBe(403);
      expect((await call('get', `/employees/${ids.PRIYA}/reporting`, viewer.token)).status).toBe(200);
    });
  });

  describe('workflows', () => {
    it('creates a workflow and publishes a draft that passes every rule', async () => {
      const workflow = await ok(await asA('post', '/performance/workflows', { workflowCode: 'STANDARD', workflowName: 'Standard review', description: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [] } }));
      ids.W = workflow.id;
      expect(workflow.versions[0]).toMatchObject({ number: 1, status: 'DRAFT', stages: [], problems: [{ path: 'stages', message: 'Add at least one stage.' }] });
      const saved = await ok(await asA('put', `/performance/workflows/${ids.W}/draft`, draft()));
      expect(saved.versions[0].problems).toEqual([]);
      expect(saved.versions[0].stages.find((s: { key: string }) => s.key === 'manager').reminderDays).toEqual([3, 1]);
      expect(saved.versions[0].stages.find((s: { key: string }) => s.key === 'hr').role).toEqual({ id: ids.HR_ROLE, name: 'HR' });
      const published = await ok(await asA('post', `/performance/workflows/${ids.W}/draft/publish`));
      ids.WV1 = published.versions[0].id;
      expect(published.versions[0].status).toBe('PUBLISHED');
    });

    it('lists what stops a draft being published, and refuses what can’t be stored', async () => {
      const uneven = draft();
      uneven.stages[1].scoreWeightPercent = '50';
      const version = (await ok(await asA('put', `/performance/workflows/${ids.W}/draft`, uneven))).versions[0];
      expect(version.problems.map((p: { message: string }) => p.message)).toEqual(['The stages that count toward the final score add up to 90%, not 100%.']);
      expect((await asA('post', `/performance/workflows/${ids.W}/draft/publish`)).status).toBe(400);

      const bad = draft();
      bad.stages[3].minCompleted = null;
      const refused = await asA('put', `/performance/workflows/${ids.W}/draft`, bad);
      expect(refused.status).toBe(400);
      expect(refused.body.message).toBe('Peer review: the reviews needed must be from 1 to its most reviewers.');
      expect((await asA('delete', `/performance/workflows/${ids.W}/draft`)).status).toBe(200);
    });

    it('is protected by the database: a published version and its stages never change', async () => {
      await expect(prisma.rndtechnosoft_performance_workflow_versions.update({ where: { id: ids.WV1 }, data: { allows_repeat_reviewers: true } })).rejects.toThrow(/published review workflow version cannot be changed/);
      await expect(prisma.rndtechnosoft_performance_workflow_stages.updateMany({ where: { workflow_version_id: ids.WV1 }, data: { due_days: 3 } })).rejects.toThrow(/cannot be changed/);
    });

    it('finds each stage’s reviewers from the records, and flags what it can’t fill instead of skipping it', async () => {
      // No department head yet; Priya holds the HR role herself.
      const result = await ok(await asA('post', `/performance/workflows/${ids.W}/versions/${ids.WV1}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' }));
      const byKey = Object.fromEntries(result.stages.map((s: { stageKey: string }) => [s.stageKey, s]));
      expect(byKey.self).toMatchObject({ status: 'RESOLVED', reviewers: [{ tenantMemberId: members.Priya, via: 'The employee' }] });
      expect(byKey.manager).toMatchObject({ status: 'RESOLVED', reviewers: [{ tenantMemberId: members.Mira, via: 'Reporting manager' }] });
      expect(byKey.head).toMatchObject({ status: 'NEEDS_ASSIGNMENT', leftOut: [{ reason: 'the department has no head on that date' }] });
      expect(byKey.peers.status).toBe('NEEDS_NOMINATION');
      expect(byKey.hr.status).toBe('RESOLVED');
      expect(byKey.hr.reviewers.map((r: { tenantMemberId: string }) => r.tenantMemberId).sort()).toEqual([members.Hana, members.Hari].sort());
      expect(byKey.hr.leftOut).toEqual([{ name: 'Priya', reason: 'can’t review their own appraisal' }]);

      // Earlier in the year Dev was her manager; on that date the manager stage finds him.
      const january = await ok(await asA('post', `/performance/workflows/${ids.W}/versions/${ids.WV1}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-02-01' }));
      expect(january.stages.find((s: { stageKey: string }) => s.stageKey === 'manager').reviewers[0].tenantMemberId).toBe(members.Dev);
    });

    it('does not let one person review twice unless the workflow allows it', async () => {
      // Mira now also heads Sales: she reviews as manager, so the head stage needs someone else.
      await ok(await asA('post', '/performance/department-heads', { departmentId: ids.SALES, employeeId: ids.MIRA, effectiveFrom: '2026-01-01' }));
      const result = await ok(await asA('post', `/performance/workflows/${ids.W}/versions/${ids.WV1}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' }));
      const head = result.stages.find((s: { stageKey: string }) => s.stageKey === 'head');
      expect(head).toMatchObject({ status: 'NEEDS_ASSIGNMENT', leftOut: [{ name: 'Mira', reason: 'already reviews in Manager review' }] });

      await ok(await asA('put', `/performance/workflows/${ids.W}/draft`, draft({ allowsRepeatReviewers: true })));
      const v2 = (await ok(await asA('post', `/performance/workflows/${ids.W}/draft/publish`))).versions[0];
      const again = await ok(await asA('post', `/performance/workflows/${ids.W}/versions/${v2.id}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' }));
      expect(again.stages.find((s: { stageKey: string }) => s.stageKey === 'head')).toMatchObject({ status: 'RESOLVED', reviewers: [{ tenantMemberId: members.Mira }] });
    });

    it('finds people who report to the employee, and says why someone without a sign-in can’t review', async () => {
      await ok(await asA('post', `/employees/${ids.NOLOGIN}/reporting`, { managerEmployeeId: ids.PRIYA, effectiveFrom: '2026-01-01' }));
      const workflow = await ok(await asA('post', '/performance/workflows', { workflowCode: 'UPWARD', workflowName: 'Upward feedback', description: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [] } }));
      const saved = await ok(await asA('put', `/performance/workflows/${workflow.id}/draft`, {
        reviewerResolution: 'AT_STAGE_START', allowsRepeatReviewers: false,
        stages: [stage('reports', { name: 'Team feedback', source: 'DIRECT_REPORTS', maxReviewers: 10, scoreWeightPercent: '100' })],
      }));
      const result = await ok(await asA('post', `/performance/workflows/${workflow.id}/versions/${saved.versions[0].id}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' }));
      expect(result.resolvedAt).toBe('AT_STAGE_START');
      expect(result.stages[0]).toMatchObject({
        status: 'RESOLVED', reviewers: [{ tenantMemberId: members.Ravi, via: 'Reports to the employee' }],
        leftOut: [{ name: 'NOLOGIN', reason: 'has no linked sign-in account in this workspace' }],
      });
    });
  });

  describe('permissions and workspaces', () => {
    it('lets a viewer read and look up reviewers, but not change workflows', async () => {
      expect((await call('get', `/performance/workflows/${ids.W}`, viewer.token)).status).toBe(200);
      expect((await call('post', `/performance/workflows/${ids.W}/versions/${ids.WV1}/resolve`, viewer.token, { employeeId: ids.PRIYA, onDate: '2026-10-14' })).status).toBe(200);
      expect((await call('put', `/performance/workflows/${ids.W}/draft`, viewer.token, draft())).status).toBe(403);
    });

    it('keeps each workspace’s workflows, people and roles to itself', async () => {
      expect((await asB('get', `/performance/workflows/${ids.W}`)).status).toBe(404);
      expect((await asB('post', `/performance/workflows/${ids.W}/versions/${ids.WV1}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' })).status).toBe(404);
      expect((await asB('get', `/employees/${ids.PRIYA}/reporting`)).status).toBe(404);
      expect((await asB('put', `/employees/${ids.EB}/login`, { tenantMemberId: members.Hana })).status).toBe(400);
      expect((await asB('post', `/employees/${ids.EB}/reporting`, { managerEmployeeId: ids.MIRA, effectiveFrom: '2026-01-01' })).status).toBe(400);

      const own = await ok(await asB('post', '/performance/workflows', { workflowCode: 'B_WF', workflowName: 'B', description: null, appliesToAll: true, scopes: { departmentIds: [], designationIds: [] } }));
      const withARole = await asB('put', `/performance/workflows/${own.id}/draft`, { reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false, stages: [stage('hr', { source: 'ROLE_MEMBERS', roleId: ids.HR_ROLE, scoreWeightPercent: '100' })] });
      expect(withARole.body.message).toBe('A role was not found in this workspace.');
      const withAMember = await asB('put', `/performance/workflows/${own.id}/draft`, { reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false, stages: [stage('chosen', { source: 'SPECIFIC_MEMBERS', memberIds: [members.Hana], scoreWeightPercent: '100' })] });
      expect(withAMember.body.message).toBe('A member was not found in this workspace.');
      const bVersion = (await ok(await asB('put', `/performance/workflows/${own.id}/draft`, { reviewerResolution: 'AT_LAUNCH', allowsRepeatReviewers: false, stages: [stage('hr', { source: 'ROLE_MEMBERS', roleId: ids.B_ROLE, scoreWeightPercent: '100' })] }))).versions[0];
      expect((await asB('post', `/performance/workflows/${own.id}/versions/${bVersion.id}/resolve`, { employeeId: ids.PRIYA, onDate: '2026-10-14' })).status).toBe(404);
      const roles = (await ok(await asB('get', '/performance/options/roles'))).map((r: { id: string }) => r.id);
      expect(roles).toContain(ids.B_ROLE);
      expect(roles).not.toContain(ids.HR_ROLE);
    });
  });
});
