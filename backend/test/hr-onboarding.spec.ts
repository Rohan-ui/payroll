import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { grantDefaultRolePermissions } from '@/common/access/role-defaults';
import { OnboardingMailerService } from '@/modules/onboarding/onboarding-mailer.service';

/**
 * HRMS onboarding end to end over HTTP: candidates and their workflow,
 * interviews with a panel, feedback and decisions, each action behind its own
 * permission, and nothing of workspace A visible or changeable from B.
 *
 * The test workspaces have no SMTP account, so no email can leave: every
 * notification is recorded as not sent, with the reason.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Hr-Onboarding-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const HOUR = 3600 * 1000;

type Ids = Record<string, string>;
type Method = 'get' | 'post' | 'put' | 'delete';

describe('HRMS onboarding in a tenant workspace', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previousBaseDomain = process.env.PLATFORM_BASE_DOMAIN;
  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  const a = { tenantId: '', token: '', email: `onb-a-${SUFFIX}@onboarding.test`, memberId: '' };
  const b = { tenantId: '', token: '', email: `onb-b-${SUFFIX}@onboarding.test`, memberId: '' };
  /** A member of A with no onboarding permissions. */
  const outsider = { token: '', email: `onb-outsider-${SUFFIX}@onboarding.test`, memberId: '' };
  /** A member of A who may view and give feedback, but not decide, override or schedule. */
  const interviewer = { token: '', email: `onb-interviewer-${SUFFIX}@onboarding.test`, memberId: '' };
  const ids: Ids = {};

  const call = (method: Method, path: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${path}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, path: string, body?: unknown) => call(method, path, a.token, body);
  const asB = (method: Method, path: string, body?: unknown) => call(method, path, b.token, body);
  const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
  const candidate = (label: string, extra: Record<string, unknown> = {}) => ({
    fullName: `Priya ${label}`,
    email: `priya.${label}.${SUFFIX}@candidate.test`,
    phone: '+91 90000 00000',
    appliedPosition: 'Backend Engineer',
    hiringSource: 'Referral',
    expectedSalary: '1200000.00',
    experienceYears: '4.5',
    ...extra,
  });
  const interview = (extra: Record<string, unknown> = {}) => ({
    interviewType: 'ONLINE',
    startsAt: inHours(24),
    durationMinutes: 45,
    timezone: 'Asia/Kolkata',
    meetingLink: 'https://meet.example.com/abc',
    interviewerMemberIds: [interviewer.memberId],
    ...extra,
  });
  /** Moves an interview's start into the past, as if it had been held. */
  const hold = (interviewId: string) =>
    prisma.rndtechnosoft_interviews.update({ where: { id: interviewId }, data: { scheduled_start: new Date(Date.now() - 2 * HOUR) } });

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({ companyName: `Onboarding ${label} ${SUFFIX}`, tenantCode: `ONB${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({
      where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } },
    });
    workspace.memberId = member.id;
  }

  async function addMember(person: typeof outsider, roleCode: string, permissionCodes: string[] | 'EMPLOYEE') {
    userEmails.push(person.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: { id: userId, email: person.email, display_name: roleCode, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: roleCode, role_name: roleCode, is_system_role: false } });
    if (permissionCodes === 'EMPLOYEE') {
      await grantDefaultRolePermissions(prisma, a.tenantId, roleId, 'EMPLOYEE');
    } else {
      const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissionCodes } } });
      expect(permissions).toHaveLength(permissionCodes.length);
      await prisma.rndtechnosoft_role_permissions.createMany({
        data: permissions.map((p) => ({ id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: p.id })),
      });
    }
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    person.token = login.body.token;
    person.memberId = memberId;
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
    await addMember(outsider, 'EMPLOYEE', 'EMPLOYEE');
    await addMember(interviewer, 'INTERVIEWER', ['onboarding.view', 'onboarding.interviews.feedback']);

    // No SMTP account in either workspace, so nothing can be emailed.
    const settings = await prisma.rndtechnosoft_tenant_settings.findMany({ where: { tenant_id: { in: tenantIds } } });
    for (const row of settings) expect((row.settings as Record<string, unknown> | null)?.smtp ?? null).toBeNull();

    const department = (tenantId: string, name: string) =>
      prisma.rndtechnosoft_departments.create({ data: { id: randomUUID(), tenant_id: tenantId, department_code: `ENG_${SUFFIX}`, department_name: name, department_status: 'ACTIVE' } });
    ids.departmentA = (await department(a.tenantId, 'Engineering')).id;
    ids.departmentB = (await department(b.tenantId, 'Engineering B')).id;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interview_panelists.deleteMany({ where: scope });
      await prisma.rndtechnosoft_interviews.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
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

  describe('candidates', () => {
    it('adds a candidate as New, with a code and a timeline entry', async () => {
      const created = await asA('post', '/onboarding/candidates', candidate('one', { departmentId: ids.departmentA, recruiterMemberId: a.memberId }));
      expect(created.status).toBe(201);
      ids.candidate = created.body.data.id;
      expect(created.body.data).toMatchObject({
        status: 'NEW',
        fullName: 'Priya one',
        departmentName: 'Engineering',
        expectedSalary: '1200000.00',
        experienceYears: '4.5',
        manualMoves: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
      });
      expect(created.body.data.candidateCode).toMatch(/^CAN-\d{4}-\d{6}$/);
      expect(created.body.data.timeline.map((e: { type: string }) => e.type)).toEqual(['CREATED']);
    });

    it('refuses bad or foreign details and a second active candidate with the same email', async () => {
      for (const [label, body, status] of [
        ['no name', candidate('x', { fullName: '' }), 400],
        ['bad salary', candidate('x', { expectedSalary: '12,00,000' }), 400],
        ['bad email', candidate('x', { email: 'not-an-email' }), 400],
        ['another workspace department', candidate('x', { departmentId: ids.departmentB }), 400],
        ['same email in any case', candidate('one', { email: `PRIYA.one.${SUFFIX}@candidate.test` }), 409],
      ] as const) {
        const refused = await asA('post', '/onboarding/candidates', body);
        expect([label, refused.status]).toEqual([label, status]);
      }
      // A different workspace may have the same person.
      expect((await asB('post', '/onboarding/candidates', candidate('one'))).status).toBe(201);
    });

    it('edits details, recording which fields changed but not their values', async () => {
      const updated = await asA('put', `/onboarding/candidates/${ids.candidate}`, candidate('one', { expectedSalary: '1300000', departmentId: ids.departmentA }));
      expect(updated.status).toBe(200);
      expect(updated.body.data.expectedSalary).toBe('1300000.00');
      const edit = updated.body.data.timeline.find((e: { type: string }) => e.type === 'UPDATED');
      expect(edit.metadata).toEqual({ fields: ['expected_salary', 'recruiter_tenant_member_id'] });
      expect(JSON.stringify(edit)).not.toContain('1300000');
    });

    it('lists, searches and filters on the server, one page at a time', async () => {
      const found = await asA('get', `/onboarding/candidates?search=${encodeURIComponent('priya one')}&status=NEW&page=1&limit=5`);
      expect(found.status).toBe(200);
      expect(found.body.data.map((c: { id: string }) => c.id)).toEqual([ids.candidate]);
      expect(found.body.pagination).toMatchObject({ page: 1, limit: 5, total: 1 });
      expect((await asA('get', '/onboarding/candidates?limit=500')).status).toBe(400);
      expect((await asA('get', `/onboarding/candidates?departmentId=${ids.departmentA}`)).body.data).toHaveLength(1);
    });

    it('is invisible to another workspace and to members without the permission', async () => {
      expect((await asB('get', `/onboarding/candidates/${ids.candidate}`)).status).toBe(404);
      expect((await asB('put', `/onboarding/candidates/${ids.candidate}`, candidate('one'))).status).toBe(404);
      expect((await asB('post', `/onboarding/candidates/${ids.candidate}/move`, { status: 'SCREENING' })).status).toBe(404);
      expect((await asB('get', '/onboarding/candidates')).body.data.map((c: { id: string }) => c.id)).not.toContain(ids.candidate);
      for (const [method, path] of [['get', '/onboarding/candidates'], ['get', '/onboarding/dashboard'], ['post', '/onboarding/candidates']] as const) {
        expect([path, (await call(method, path, outsider.token, candidate('z'))).status]).toEqual([path, 403]);
      }
      expect((await call('post', '/onboarding/candidates', interviewer.token, candidate('z'))).status).toBe(403);
    });
  });

  describe('workflow', () => {
    it('refuses skipping steps by hand, and allows the defined moves', async () => {
      const skip = await asA('post', `/onboarding/candidates/${ids.candidate}/move`, { status: 'SELECTED' });
      expect(skip.status).toBe(409);
      expect(skip.body.message).toMatch(/can't be moved to selected by hand/);
      const screen = await asA('post', `/onboarding/candidates/${ids.candidate}/move`, { status: 'SCREENING', notes: 'CV looks strong' });
      expect(screen.status).toBe(200);
      expect(screen.body.data.status).toBe('SCREENING');
      expect(screen.body.data.timeline[0]).toMatchObject({ type: 'STATUS_CHANGED', fromStatus: 'NEW', toStatus: 'SCREENING', notes: 'CV looks strong', isOverride: false });
    });

    it('overrides only with its permission and a reason, never into Joined, and records it', async () => {
      const other = await asA('post', '/onboarding/candidates', candidate('override'));
      ids.overridden = other.body.data.id;
      await asA('post', `/onboarding/candidates/${ids.overridden}/move`, { status: 'REJECTED' });

      expect((await call('post', `/onboarding/candidates/${ids.overridden}/override`, interviewer.token, { status: 'SCREENING', reason: 'Hiring manager asked to reconsider' })).status).toBe(403);
      expect((await asA('post', `/onboarding/candidates/${ids.overridden}/override`, { status: 'SCREENING', reason: 'short' })).status).toBe(400);
      expect((await asA('post', `/onboarding/candidates/${ids.overridden}/override`, { status: 'JOINED', reason: 'Skipping all the steps' })).status).toBe(409);

      const reopened = await asA('post', `/onboarding/candidates/${ids.overridden}/override`, { status: 'SCREENING', reason: 'Hiring manager asked to reconsider' });
      expect(reopened.status).toBe(200);
      expect(reopened.body.data.timeline[0]).toMatchObject({ type: 'STATUS_OVERRIDDEN', fromStatus: 'REJECTED', toStatus: 'SCREENING', isOverride: true, notes: 'Hiring manager asked to reconsider' });
      const audit = await prisma.rndtechnosoft_audit_logs.findFirst({ where: { tenant_id: a.tenantId, action_code: 'ONBOARDING_STATUS_OVERRIDDEN', entity_id: ids.overridden } });
      expect(audit).toMatchObject({ actor_tenant_member_id: a.memberId });
    });
  });

  describe('interviews', () => {
    it('is scheduled only after screening, with a valid place, time and panel from this workspace', async () => {
      const fresh = await asA('post', '/onboarding/candidates', candidate('fresh'));
      const tooEarly = await asA('post', `/onboarding/candidates/${fresh.body.data.id}/interviews`, interview());
      expect([tooEarly.status, tooEarly.body.message]).toEqual([409, 'Move the candidate to screening before scheduling an interview.']);

      const bMember = b.memberId;
      for (const [label, body] of [
        ['in person without a place', interview({ interviewType: 'IN_PERSON', meetingLink: undefined })],
        ['online without https', interview({ meetingLink: 'http://meet.example.com/x' })],
        ['in the past', interview({ startsAt: inHours(-3) })],
        ['unknown time zone', interview({ timezone: 'Mars/Olympus' })],
        ['interviewer from another workspace', interview({ interviewerMemberIds: [bMember] })],
        ['no interviewer', interview({ interviewerMemberIds: [] })],
      ] as const) {
        const refused = await asA('post', `/onboarding/candidates/${ids.candidate}/interviews`, body);
        expect([label, refused.status]).toEqual([label, 400]);
      }
      expect((await call('post', `/onboarding/candidates/${ids.candidate}/interviews`, interviewer.token, interview())).status).toBe(403);
      expect((await asB('post', `/onboarding/candidates/${ids.candidate}/interviews`, interview())).status).toBe(404);
    });

    it('schedules round 1, moves the candidate on, and records the unsent invitations with the reason', async () => {
      const scheduled = await asA('post', `/onboarding/candidates/${ids.candidate}/interviews`, interview({ instructions: 'Bring a laptop' }));
      expect(scheduled.status).toBe(201);
      ids.interview = scheduled.body.data.interviewId;
      expect(scheduled.body.data.candidate.status).toBe('INTERVIEW_SCHEDULED');
      expect(scheduled.body.data.candidate.interviews[0]).toMatchObject({ roundNumber: 1, status: 'SCHEDULED', panel: [{ memberId: interviewer.memberId }] });
      expect(scheduled.body.data.notifications).toEqual([
        expect.objectContaining({ recipient: `priya.one.${SUFFIX}@candidate.test`, status: 'NOT_SENT', duplicate: false, error: expect.stringMatching(/no active SMTP account/) }),
        expect.objectContaining({ recipient: interviewer.email, status: 'NOT_SENT' }),
      ]);
      expect(await prisma.rndtechnosoft_onboarding_notifications.count({ where: { tenant_id: a.tenantId, interview_id: ids.interview } })).toBe(2);

      const second = await asA('post', `/onboarding/candidates/${ids.candidate}/interviews`, interview());
      expect([second.status, second.body.message]).toEqual([409, 'Round 1 is already scheduled. Reschedule or cancel it instead of adding another.']);
    });

    it('lists interviews in a date range, and only the signed-in member’s when asked', async () => {
      const range = `from=${encodeURIComponent(inHours(-1))}&to=${encodeURIComponent(inHours(48))}`;
      const all = await asA('get', `/onboarding/interviews?${range}`);
      expect(all.body.data.map((i: { id: string }) => i.id)).toContain(ids.interview);
      expect((await asA('get', `/onboarding/interviews?${range}&mine=true`)).body.data).toEqual([]);
      const mine = await call('get', `/onboarding/interviews?${range}&mine=true`, interviewer.token);
      expect(mine.body.data).toEqual([expect.objectContaining({ id: ids.interview, isMine: true })]);
      expect((await asB('get', `/onboarding/interviews?${range}`)).body.data).toEqual([]);
    });

    it('reschedules with a reason, and cancelling returns the candidate to screening', async () => {
      const moved = await asA('post', `/onboarding/interviews/${ids.interview}/reschedule`, {
        startsAt: inHours(30), durationMinutes: 60, timezone: 'Asia/Kolkata', reason: 'Interviewer travelling',
      });
      expect(moved.status).toBe(200);
      expect(moved.body.data.candidate.timeline[0]).toMatchObject({ type: 'INTERVIEW_RESCHEDULED', notes: 'Interviewer travelling' });
      expect(moved.body.data.notifications).toHaveLength(2);

      const cancelled = await asA('post', `/onboarding/interviews/${ids.interview}/cancel`, { reason: 'Role on hold this week' });
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.candidate.status).toBe('SCREENING');
      expect((await asA('post', `/onboarding/interviews/${ids.interview}/cancel`, { reason: 'again' })).status).toBe(409);

      // A new round 1 can be booked once the first was cancelled.
      const rebooked = await asA('post', `/onboarding/candidates/${ids.candidate}/interviews`, interview());
      expect(rebooked.status).toBe(201);
      ids.interview = rebooked.body.data.interviewId;
      expect(rebooked.body.data.candidate.interviews.filter((i: { status: string }) => i.status === 'SCHEDULED')[0].roundNumber).toBe(1);
    });

    it('takes feedback only from the panel, after the start, and then the interview counts as held', async () => {
      const early = await call('post', `/onboarding/interviews/${ids.interview}/feedback`, interviewer.token, { rating: 4, recommendation: 'YES' });
      expect([early.status, early.body.message]).toEqual([409, 'This interview has not started yet.']);
      await hold(ids.interview);

      const notOnPanel = await asA('post', `/onboarding/interviews/${ids.interview}/feedback`, { rating: 4, recommendation: 'YES' });
      expect(notOnPanel.status).toBe(403);
      expect((await call('post', `/onboarding/interviews/${ids.interview}/feedback`, interviewer.token, { rating: 9, recommendation: 'YES' })).status).toBe(400);

      const given = await call('post', `/onboarding/interviews/${ids.interview}/feedback`, interviewer.token, { rating: 4, recommendation: 'YES', notes: 'Solid system design' });
      expect(given.status).toBe(200);
      expect(given.body.data.candidate.status).toBe('INTERVIEW_COMPLETED');
      const round = given.body.data.candidate.interviews.find((i: { id: string }) => i.id === ids.interview);
      expect(round).toMatchObject({ status: 'COMPLETED', panel: [{ rating: 4, recommendation: 'YES', notes: 'Solid system design' }] });
    });

    it('lets only members allowed to decide select a candidate, once', async () => {
      expect((await call('post', `/onboarding/interviews/${ids.interview}/decision`, interviewer.token, { decision: 'SELECT' })).status).toBe(403);
      const selected = await asA('post', `/onboarding/interviews/${ids.interview}/decision`, { decision: 'SELECT', notes: 'Strong fit' });
      expect(selected.status).toBe(200);
      expect(selected.body.data.candidate.status).toBe('SELECTED');
      expect((await asA('post', `/onboarding/interviews/${ids.interview}/decision`, { decision: 'REJECT' })).status).toBe(409);
      const late = await call('post', `/onboarding/interviews/${ids.interview}/feedback`, interviewer.token, { rating: 2, recommendation: 'NO' });
      expect(late.status).toBe(409);
    });

    it('supports more rounds: another round is numbered on from the last held one', async () => {
      const two = await asA('post', '/onboarding/candidates', candidate('rounds'));
      ids.rounds = two.body.data.id;
      await asA('post', `/onboarding/candidates/${ids.rounds}/move`, { status: 'SCREENING' });
      const first = await asA('post', `/onboarding/candidates/${ids.rounds}/interviews`, interview());
      await hold(first.body.data.interviewId);
      expect((await asA('post', `/onboarding/interviews/${first.body.data.interviewId}/complete`)).body.data.candidate.status).toBe('INTERVIEW_COMPLETED');
      const advance = await asA('post', `/onboarding/interviews/${first.body.data.interviewId}/decision`, { decision: 'ADVANCE' });
      expect(advance.body.data.candidate.status).toBe('INTERVIEW_COMPLETED');
      const second = await asA('post', `/onboarding/candidates/${ids.rounds}/interviews`, interview({ roundName: 'Culture fit', interviewType: 'PHONE', meetingLink: undefined }));
      expect(second.status).toBe(201);
      expect(second.body.data.candidate.interviews.map((i: { roundNumber: number; status: string }) => [i.roundNumber, i.status])).toEqual([[1, 'COMPLETED'], [2, 'SCHEDULED']]);
    });

    it('books one interview when two requests arrive together', async () => {
      const both = await asA('post', '/onboarding/candidates', candidate('race'));
      await asA('post', `/onboarding/candidates/${both.body.data.id}/move`, { status: 'SCREENING' });
      const results = await Promise.all([
        asA('post', `/onboarding/candidates/${both.body.data.id}/interviews`, interview()),
        asA('post', `/onboarding/candidates/${both.body.data.id}/interviews`, interview()),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.rndtechnosoft_interviews.count({ where: { candidate_id: both.body.data.id } })).toBe(1);
    });
  });

  describe('emails', () => {
    it('keeps one record per key, and tries again an email that could not go out', async () => {
      const mailer = app.get(OnboardingMailerService);
      const email = { tenantId: a.tenantId, idempotencyKey: `test:${SUFFIX}`, templateCode: 'TEST', to: 'someone@candidate.test', subject: 'Hello', text: 'Hi', html: '<p>Hi</p>' };
      const first = await mailer.send(email);
      const again = await mailer.send(email);
      // Nothing was sent (no SMTP account), so the second request is a retry, not a duplicate.
      expect([first.status, first.duplicate, again.status, again.duplicate]).toEqual(['NOT_SENT', false, 'NOT_SENT', false]);
      expect(await prisma.rndtechnosoft_onboarding_notifications.count({ where: { tenant_id: a.tenantId, idempotency_key: `test:${SUFFIX}` } })).toBe(1);
    });
  });

  describe('archiving', () => {
    it('keeps a candidate with a scheduled interview, and archives and restores otherwise', async () => {
      expect((await asA('post', `/onboarding/candidates/${ids.rounds}/archive`)).status).toBe(409);
      const archived = await asA('post', `/onboarding/candidates/${ids.overridden}/archive`);
      expect(archived.status).toBe(200);
      expect((await asA('get', '/onboarding/candidates?limit=100')).body.data.map((c: { id: string }) => c.id)).not.toContain(ids.overridden);
      expect((await asA('get', '/onboarding/candidates?archived=archived')).body.data.map((c: { id: string }) => c.id)).toEqual([ids.overridden]);
      expect((await asA('post', `/onboarding/candidates/${ids.overridden}/move`, { status: 'WITHDRAWN' })).status).toBe(409);

      // Its email is free again while it is archived; restoring then clashes.
      const reuse = await asA('post', '/onboarding/candidates', candidate('override'));
      expect(reuse.status).toBe(201);
      expect((await asA('post', `/onboarding/candidates/${ids.overridden}/restore`)).status).toBe(409);
      await asA('post', `/onboarding/candidates/${reuse.body.data.id}/archive`);
      expect((await asA('post', `/onboarding/candidates/${ids.overridden}/restore`)).status).toBe(200);
    });
  });

  describe('dashboard', () => {
    it('counts only this workspace’s records, today in the viewer’s time zone', async () => {
      const summary = await asA('get', '/onboarding/dashboard?timezone=Asia/Kolkata');
      expect(summary.status).toBe(200);
      const active = await prisma.rndtechnosoft_candidates.count({ where: { tenant_id: a.tenantId, archived_at: null } });
      expect(summary.body.data).toMatchObject({ timezone: 'Asia/Kolkata', totalCandidates: active });
      expect(summary.body.data.byStatus.SELECTED).toBe(1);
      const forInterviewer = await call('get', '/onboarding/dashboard', interviewer.token);
      expect(forInterviewer.body.data.timezone).toBe('UTC');
      expect((await asB('get', '/onboarding/dashboard')).body.data.totalCandidates).toBe(1);
    });
  });
});
