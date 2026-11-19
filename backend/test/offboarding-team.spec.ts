import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OffboardingNotificationsService } from '@/modules/offboarding/offboarding-notifications.service';
import { jest } from '@jest/globals';

/**
 * Stage 4: a manager sees only their direct reports' exits, comments and
 * leaves handover notes on them, and clears only manager checklist items.
 * Each exit event emails the right people once, logged against the exit;
 * events can be switched off; daily reminders go once a day.
 */

// Each test walks a whole exit through 15 to 20 requests, each many database
// round trips; against a remote development database that runs past the
// default 30 seconds without anything being wrong.
jest.setTimeout(120_000);

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Offboarding-Team-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const HR_PERMISSIONS = ['offboarding.my.view', 'offboarding.view', 'offboarding.manage', 'offboarding.clearance.update', 'offboarding.complete'];
const STAFF_PERMISSIONS = ['offboarding.my.view', 'offboarding.team.view'];

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shift = (iso: string, days: number) => new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

describe('Offboarding: managers and emails', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  let tenantId = '';
  const emails: string[] = [];
  const tokens: Record<string, string> = {};
  const employees: Record<string, string> = {};
  const address = (key: string) => `offt-${key.toLowerCase()}-${SUFFIX}@rnd.test`;

  const server = () => app.getHttpServer();
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const get = (url: string, who: string) => request(server()).get(`${API}${url}`).set(as(who));
  const post = (url: string, who: string, body: object = {}) => request(server()).post(`${API}${url}`).set(as(who)).send(body);
  const put = (url: string, who: string, body: object) => request(server()).put(`${API}${url}`).set(as(who)).send(body);
  // Emails go in the background; wait for them before looking.
  const sent = async (separationId: string, event: string) => (await app.get(OffboardingNotificationsService).flush(), prisma.rndtechnosoft_onboarding_notifications.findMany({ where: { tenant_id: tenantId, separation_id: separationId, template_code: `OFFBOARDING_${event}` }, select: { recipient_email: true } })
      .then((rows) => rows.map((r) => r.recipient_email).sort()));

  async function role(code: string, permissions: string[]) {
    const id = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id, tenant_id: tenantId, role_code: `${code}_${SUFFIX.toUpperCase()}`, role_name: code, is_system_role: false } });
    const rows = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: permissions } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: rows.map((p) => ({ id: randomUUID(), tenant_id: tenantId, role_id: id, permission_id: p.id })) });
    return id;
  }

  async function person(key: string, roleId: string) {
    const email = address(key);
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: key, password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: tenantId, tenant_member_id: memberId, role_id: roleId } });
    employees[key] = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id: employees[key], tenant_id: tenantId, employee_code: `${key.toUpperCase()}-${SUFFIX}`, first_name: key, user_id: userId, hire_date: new Date('2025-01-01') } });
    const r = await request(server()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD, tenantId });
    expect(r.status).toBe(200);
    tokens[key] = r.body.token;
  }

  const reportsTo = (employee: string, manager: string) => prisma.rndtechnosoft_employee_reporting_lines.create({
    data: { id: randomUUID(), tenant_id: tenantId, employee_id: employees[employee], manager_employee_id: employees[manager], effective_from: new Date('2025-01-01') },
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
    const ownerEmail = address('owner');
    emails.push(ownerEmail);
    const r = await request(server()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Offboarding team ${SUFFIX}`, tenantCode: `OFT${SUFFIX.toUpperCase()}`, email: ownerEmail, password: PASSWORD });
    expect(r.status).toBe(201);
    tenantId = r.body.activeTenant.tenantId;
    tokens.Owner = r.body.token;

    const staff = await role('STAFF', STAFF_PERMISSIONS);
    await person('Mona', staff);
    await person('Ravi', staff);
    await person('Omar', staff);
    await person('Priya', await role('HR', HR_PERMISSIONS));
    await person('Ivan', await role('IT', ['offboarding.my.view', 'offboarding.clearance.it']));
    await person('Hana', await role('HR_NO_OVERRIDE', ['offboarding.my.view', 'offboarding.view', 'offboarding.manage']));
    await person('Zed', staff);
    await reportsTo('Ravi', 'Mona');
    await reportsTo('Omar', 'Priya');
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await app.get(OffboardingNotificationsService).flush();
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
      const scope = { tenant_id: tenantId };
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_comments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_clearance_items.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_date_changes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_separations.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_reporting_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_user_sessions.deleteMany({ where: { user_id: { in: userIds } } });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_platform_activity_logs.deleteMany({ where: { target_tenant_id: tenantId } });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: tenantId } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: userIds } } });
    }
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
    await app?.close();
  });

  let raviExit = '';
  let omarExit = '';

  it('emails the manager and HR when someone resigns, never the person resigning', async () => {
    const r = await post('/offboarding/my/resignation', 'Ravi', { reason: 'Moving cities', lastWorkingDate: shift(today, 2) });
    expect(r.status).toBe(201);
    raviExit = r.body.data.current.id;
    const to = await sent(raviExit, 'RESIGNATION_SUBMITTED');
    expect(to).toEqual(expect.arrayContaining([address('mona'), address('priya')]));
    expect(to).not.toContain(address('ravi'));
  });

  it('lets HR switch an event off, and then sends nothing for it', async () => {
    expect((await put('/offboarding/notification-settings', 'Ravi', { EXIT_STARTED: false })).status).toBe(403);
    expect((await put('/offboarding/notification-settings', 'Priya', { EXIT_STARTED: 'no' })).status).toBe(400);
    const saved = await put('/offboarding/notification-settings', 'Priya', { EXIT_STARTED: false });
    expect(saved.status).toBe(200);
    expect(saved.body.data).toMatchObject({ EXIT_STARTED: false, RESIGNATION_SUBMITTED: true });

    const started = await post('/offboarding/separations', 'Priya', { employeeId: employees.Omar, type: 'TERMINATION', reason: 'Role closed', noticeDate: today, lastWorkingDate: shift(today, 20) });
    expect(started.status).toBe(201);
    omarExit = started.body.data.id;
    expect(await sent(omarExit, 'EXIT_STARTED')).toEqual([]);
    // Priya started it, so she isn't told; the checklist still goes out.
    expect(await sent(omarExit, 'CHECKLIST_ASSIGNED')).not.toContain(address('priya'));
  });

  it('shows a manager only their direct reports’ exits, without HR’s confidential parts', async () => {
    const list = await get('/offboarding/team', 'Mona');
    expect(list.status).toBe(200);
    expect(list.body.data.map((e: { id: string }) => e.id)).toEqual([raviExit]);
    expect((await get(`/offboarding/team/${omarExit}`, 'Mona')).status).toBe(404);
    expect((await get('/offboarding/team', 'Ravi')).body.data).toEqual([]);

    const detail = await get(`/offboarding/team/${raviExit}`, 'Mona');
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ status: 'PENDING_APPROVAL', lastWorkingDate: shift(today, 2), canComment: true });
    expect(detail.body.data.reason).toBeUndefined();
    // Still HR's to accept.
    expect((await post(`/offboarding/separations/${raviExit}/approve`, 'Mona', { lastWorkingDate: shift(today, 2) })).status).toBe(403);
  });

  it('lets the manager add comments and handover notes that HR sees', async () => {
    expect((await post(`/offboarding/team/${raviExit}/comments`, 'Mona', { kind: 'HANDOVER', body: '  ' })).status).toBe(400);
    expect((await post(`/offboarding/team/${raviExit}/comments`, 'Mona', { kind: 'HANDOVER', body: 'x', tenantId: randomUUID() })).status).toBe(400);
    expect((await post(`/offboarding/team/${omarExit}/comments`, 'Mona', { kind: 'COMMENT', body: 'Not mine' })).status).toBe(404);
    const added = await post(`/offboarding/team/${raviExit}/comments`, 'Mona', { kind: 'HANDOVER', body: 'Billing service goes to Asha.' });
    expect(added.status).toBe(201);
    expect(added.body.data.comments).toEqual([expect.objectContaining({ kind: 'HANDOVER', body: 'Billing service goes to Asha.', isMine: true })]);

    const hr = await get(`/offboarding/separations/${raviExit}`, 'Priya');
    expect(hr.body.data.managerComments).toEqual([expect.objectContaining({ kind: 'HANDOVER', body: 'Billing service goes to Asha.', author: 'Mona' })]);
  });

  it('emails acceptance and lets the manager clear only manager items', async () => {
    expect((await post(`/offboarding/separations/${raviExit}/approve`, 'Priya', { lastWorkingDate: shift(today, 2) })).status).toBe(200);
    expect(await sent(raviExit, 'RESIGNATION_ACCEPTED')).toEqual([address('mona'), address('ravi')]);

    const detail = (await get(`/offboarding/team/${raviExit}`, 'Mona')).body.data;
    const managerItem = detail.checklist.find((i: { team: string }) => i.team === 'MANAGER');
    const itItem = detail.checklist.find((i: { team: string }) => i.team === 'IT');
    expect(itItem.canUpdate).toBe(false);
    expect((await put(`/offboarding/team/${raviExit}/checklist/${itItem.id}`, 'Mona', { status: 'CLEARED' })).status).toBe(403);
    expect((await put(`/offboarding/team/${raviExit}/checklist/${managerItem.id}`, 'Mona', { status: 'WAIVED' })).status).toBe(400);
    const cleared = await put(`/offboarding/team/${raviExit}/checklist/${managerItem.id}`, 'Mona', { status: 'CLEARED', note: 'Handover done' });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.checklist.find((i: { id: string }) => i.id === managerItem.id)).toMatchObject({ status: 'CLEARED', note: 'Handover done' });
  });

  it('sends the daily reminders once a day, and lists every email on the exit', async () => {
    const reminders = app.get(OffboardingNotificationsService);
    await reminders.sendReminders(today);
    const lastDay = await sent(raviExit, 'LAST_DAY_REMINDER');
    expect(lastDay).toEqual(expect.arrayContaining([address('mona'), address('ravi'), address('priya')]));
    // Mona cleared her item, so the reminder goes to the teams whose items are still open, not to her.
    const checklistReminder = await sent(raviExit, 'CHECKLIST_REMINDER');
    expect(checklistReminder).toContain(address('ivan'));
    expect(checklistReminder).not.toContain(address('mona'));
    await reminders.sendReminders(today);
    expect(await sent(raviExit, 'LAST_DAY_REMINDER')).toEqual(lastDay);
    // Omar's last day is weeks away.
    expect(await sent(omarExit, 'LAST_DAY_REMINDER')).toEqual([]);

    await reminders.flush();
    const log = await get(`/offboarding/separations/${raviExit}/notifications`, 'Priya');
    expect(log.status).toBe(200);
    // No mail account here, so nothing went out: the second run tried again, once, and counted it.
    const reminder = log.body.data.find((n: { event: string; recipient: string }) => n.event === 'LAST_DAY_REMINDER' && n.recipient === address('mona'));
    expect(reminder).toEqual(expect.objectContaining({ channel: 'EMAIL', status: 'NOT_SENT', attempts: 2, error: expect.stringContaining('SMTP') }));
    expect(log.body.data.map((n: { event: string }) => n.event)).toEqual(expect.arrayContaining(['RESIGNATION_SUBMITTED', 'RESIGNATION_ACCEPTED', 'LAST_DAY_REMINDER']));
    expect((await get(`/offboarding/separations/${raviExit}/notifications`, 'Mona')).status).toBe(403);
  });

  describe('checklist ownership', () => {
    const items = async (exitId: string) => (await get(`/offboarding/separations/${exitId}`, 'Priya')).body.data.checklist as { id: string; team: string; title: string; status: string; isRequired: boolean; dueDate: string; assignedTo: { id: string; name: string } | null; waiverReason: string | null; note: string | null }[];

    it('lets a team clear and waive only its own items, from its own list, and HR override any', async () => {
      const list = await get('/offboarding/checklist/mine', 'Ivan');
      expect(list.status).toBe(200);
      const mine = list.body.data.filter((i: { separationId: string }) => i.separationId === omarExit);
      expect(mine.map((i: { team: string }) => i.team)).toEqual(['IT', 'IT']);
      expect(mine[0]).toMatchObject({ employee: { name: 'Omar' }, dueDate: shift(today, 20), isRequired: true });
      expect((await get('/offboarding/checklist/mine', 'Mona')).body.data).toEqual([]);
      // IT doesn't see HR's side of the exit.
      expect((await get(`/offboarding/separations/${omarExit}`, 'Ivan')).status).toBe(403);

      const all = await items(omarExit);
      const finance = all.find((i) => i.team === 'FINANCE');
      const hr = all.find((i) => i.team === 'HR');
      expect((await put(`/offboarding/checklist/items/${finance?.id}`, 'Ivan', { status: 'CLEARED' })).status).toBe(403);
      expect((await put(`/offboarding/checklist/items/${mine[0].id}`, 'Ivan', { status: 'WAIVED' })).status).toBe(400);
      expect((await put(`/offboarding/checklist/items/${mine[0].id}`, 'Ivan', { status: 'WAIVED', waiverReason: 'Works on their own laptop', note: 'Checked with Omar' })).status).toBe(200);
      const cleared = await put(`/offboarding/checklist/items/${mine[1].id}`, 'Ivan', { status: 'CLEARED' });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.filter((i: { separationId: string }) => i.separationId === omarExit)).toEqual([]);

      const waived = (await items(omarExit)).find((i) => i.id === mine[0].id);
      expect(waived).toMatchObject({ status: 'WAIVED', waiverReason: 'Works on their own laptop', note: 'Checked with Omar' });
      expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: tenantId, action_code: 'SEPARATION_ITEM_WAIVED', entity_id: omarExit } })).toBe(1);

      // HR without the override can't clear another team's item; with it, they can.
      expect((await put(`/offboarding/separations/${omarExit}/checklist/${hr?.id}`, 'Hana', { status: 'CLEARED' })).status).toBe(403);
      const hanaView = (await get(`/offboarding/separations/${omarExit}`, 'Hana')).body.data.checklist;
      expect(hanaView.every((i: { canClear: boolean }) => !i.canClear)).toBe(true);
      expect((await put(`/offboarding/separations/${omarExit}/checklist/${hr?.id}`, 'Priya', { status: 'CLEARED' })).status).toBe(200);
    });

    it('gives an item to someone in the owning team only, with a due date, and emails them rather than the team', async () => {
      const all = await items(omarExit);
      const admin = all.find((i) => i.team === 'ADMIN');
      const ivanMember = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: tenantId, rndtechnosoft_users: { email: address('ivan') } } })).id;
      const owners = await get('/offboarding/checklist/owners?team=IT', 'Priya');
      expect(owners.body.data.map((o: { id: string }) => o.id)).toContain(ivanMember);

      expect((await put(`/offboarding/separations/${omarExit}/checklist/${admin?.id}/details`, 'Priya', { assignedMemberId: ivanMember })).status).toBe(400);
      const added = await post(`/offboarding/separations/${omarExit}/checklist`, 'Priya', { team: 'IT', title: 'Return the test phone', description: 'The Android device from QA', dueDate: shift(today, 5), assignedMemberId: ivanMember });
      expect(added.status).toBe(201);
      const phone = added.body.data.checklist.find((i: { title: string }) => i.title === 'Return the test phone');
      expect(phone).toMatchObject({ description: 'The Android device from QA', dueDate: shift(today, 5), hasOwnDueDate: true, isRequired: true, assignedTo: { id: ivanMember, name: 'Ivan' } });
      expect((await put(`/offboarding/separations/${omarExit}/checklist/${phone.id}/details`, 'Ivan', { dueDate: null })).status).toBe(403);
      const moved = await put(`/offboarding/separations/${omarExit}/checklist/${phone.id}/details`, 'Priya', { dueDate: null, assignedMemberId: null });
      expect(moved.body.data.checklist.find((i: { id: string }) => i.id === phone.id)).toMatchObject({ dueDate: shift(today, 20), hasOwnDueDate: false, assignedTo: null });
      await put(`/offboarding/separations/${omarExit}/checklist/${phone.id}/details`, 'Priya', { assignedMemberId: ivanMember });

      // Reminders for Omar's open items: Ivan has the phone, Finance's item goes to whoever holds Finance (here the override).
      await app.get(OffboardingNotificationsService).sendReminders(shift(today, 18));
      const to = await sent(omarExit, 'CHECKLIST_REMINDER');
      expect(to).toContain(address('ivan'));
      expect(to).not.toContain(address('hana'));
    });

    it('holds the exit back only for required items, and adds the workspace’s own items to every new exit', async () => {
      expect((await put('/offboarding/checklist-template', 'Ivan', { items: [] })).status).toBe(403);
      expect((await put('/offboarding/checklist-template', 'Priya', { items: [{ team: 'CEO', title: 'x' }] })).status).toBe(400);
      const saved = await put('/offboarding/checklist-template', 'Priya', { items: [{ team: 'IT', title: 'Badge photo removed from the wiki', isRequired: false }] });
      expect(saved.status).toBe(200);

      const started = await post('/offboarding/separations', 'Priya', { employeeId: employees.Zed, type: 'RETIREMENT', reason: 'Retiring', noticeDate: shift(today, -30), lastWorkingDate: today });
      expect(started.status).toBe(201);
      const zedExit = started.body.data.id;
      const checklist = started.body.data.checklist as { id: string; title: string; isRequired: boolean; team: string }[];
      expect(checklist).toHaveLength(7);
      expect(checklist[6]).toMatchObject({ title: 'Badge photo removed from the wiki', isRequired: false });

      for (const item of checklist.filter((i) => i.isRequired)) {
        expect((await put(`/offboarding/separations/${zedExit}/checklist/${item.id}`, 'Priya', { status: 'CLEARED' })).status).toBe(200);
      }
      const detail = (await get(`/offboarding/separations/${zedExit}`, 'Priya')).body.data;
      expect(detail.blockers.some((b: string) => b.includes('checklist'))).toBe(false);
    });
  });

  describe('structured exit interview', () => {
    it('keeps a workspace list of exit reasons that can be renamed, switched off and added to, never removed', async () => {
      const list = await get('/offboarding/exit-reasons', 'Priya');
      expect(list.body.data).toHaveLength(12);
      const reasons = list.body.data as { code: string; label: string; active: boolean }[];
      expect((await put('/offboarding/exit-reasons', 'Mona', { reasons })).status).toBe(403);
      expect((await put('/offboarding/exit-reasons', 'Priya', { reasons: reasons.slice(1) })).status).toBe(400);
      const edited = reasons.map((r) => (r.code === 'COMPENSATION' ? { ...r, label: 'Pay' } : r.code === 'RELOCATION' ? { ...r, active: false } : r));
      const saved = await put('/offboarding/exit-reasons', 'Priya', { reasons: [...edited, { label: 'Long commute', active: true }] });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toHaveLength(13);
      expect(saved.body.data.find((r: { code: string }) => r.code === 'COMPENSATION').label).toBe('Pay');
      expect(saved.body.data[12]).toMatchObject({ label: 'Long commute', active: true, code: expect.stringMatching(/^CUSTOM_/) });
    });

    it('books the interview in advance, emails the employee and the interviewer, and emails again when it moves or is cancelled', async () => {
      const ownerMember = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: tenantId, rndtechnosoft_users: { email: address('owner') } } })).id;
      const at = new Date(Date.now() + 3 * 86_400_000);
      at.setUTCHours(10, 0, 0, 0);
      const book = (who: string, body: object) => put(`/offboarding/separations/${raviExit}/exit-interview/schedule`, who, body);
      expect((await book('Mona', { scheduledAt: at.toISOString() })).status).toBe(403);
      expect((await book('Priya', { scheduledAt: new Date(Date.now() - 3_600_000).toISOString() })).status).toBe(400);
      expect((await book('Priya', { scheduledAt: at.toISOString(), interviewerMemberId: randomUUID() })).status).toBe(400);
      expect((await book('Priya', { scheduledAt: '2026-12-10' })).status).toBe(400);

      const booked = await book('Priya', { scheduledAt: at.toISOString(), interviewerMemberId: ownerMember, location: 'Room 4B' });
      expect(booked.status).toBe(200);
      expect(booked.body.data.interviewBooking).toMatchObject({ at: at.toISOString(), location: 'Room 4B', interviewer: { id: ownerMember } });
      expect(await sent(raviExit, 'INTERVIEW_SCHEDULED')).toEqual([address('owner'), address('ravi')].sort());
      expect((await get('/offboarding/my', 'Ravi')).body.data.current.exitInterviewBooking).toMatchObject({ at: at.toISOString(), location: 'Room 4B' });

      const moved = new Date(at.getTime() + 86_400_000);
      expect((await book('Priya', { scheduledAt: moved.toISOString(), interviewerMemberId: ownerMember, location: 'Room 4B' })).status).toBe(200);
      expect((await prisma.rndtechnosoft_onboarding_notifications.count({ where: { tenant_id: tenantId, separation_id: raviExit, template_code: 'OFFBOARDING_INTERVIEW_SCHEDULED', recipient_email: address('ravi') } }))).toBe(2);

      const cancelled = await post(`/offboarding/separations/${raviExit}/exit-interview/cancel-booking`, 'Priya');
      expect(cancelled.status).toBe(200);
      expect(cancelled.body.data.interviewBooking).toBeNull();
      expect(await sent(raviExit, 'INTERVIEW_CANCELLED')).toEqual([address('owner'), address('ravi')].sort());
      expect((await post(`/offboarding/separations/${raviExit}/exit-interview/cancel-booking`, 'Priya')).status).toBe(400);
    });

    it('records the structured interview, with confidential notes only for HR who may see them', async () => {
      const commute = ((await get('/offboarding/exit-reasons', 'Priya')).body.data as { code: string; label: string }[]).find((r) => r.label === 'Long commute')?.code;
      const base = { interviewDate: today, primaryReason: commute, secondaryReason: 'COMPENSATION', employeeFeedback: 'Two hours each way.', workplaceRating: 4, compensationRating: 2, growthRating: 3, rehireEligible: true, rehireRemarks: 'Would hire back for a remote role' };
      const record = (who: string, body: object) => put(`/offboarding/separations/${raviExit}/exit-interview`, who, body);
      expect((await record('Priya', { ...base, primaryReason: 'RELOCATION' })).status).toBe(400);
      expect((await record('Priya', { ...base, secondaryReason: commute })).status).toBe(400);
      expect((await record('Priya', { ...base, growthRating: 6 })).status).toBe(400);
      expect((await record('Priya', { ...base, interviewDate: shift(today, 1) })).status).toBe(400);
      expect((await record('Priya', { ...base, confidentialNotes: 'x' })).status).toBe(403);

      const saved = await record('Priya', base);
      expect(saved.status).toBe(200);
      expect(saved.body.data.exitInterview).toMatchObject({ primaryReason: commute, secondaryReason: 'COMPENSATION', ratings: { workplace: 4, compensation: 2, growth: 3 }, rehireEligible: true, conductedBy: { name: 'Priya' } });
      expect(saved.body.data.exitInterview.confidentialNotes).toBeUndefined();
      expect(saved.body.data.canSeeConfidential).toBe(false);

      expect((await record('Owner', { ...base, confidentialNotes: 'Asked for a counter-offer; declined.' })).status).toBe(200);
      // HR without the permission saves again: the confidential notes stay, and still aren't shown to them.
      expect((await record('Priya', { ...base, employeeFeedback: 'Two hours each way, every day.' })).status).toBe(200);
      expect((await get(`/offboarding/separations/${raviExit}`, 'Owner')).body.data.exitInterview).toMatchObject({ confidentialNotes: 'Asked for a counter-offer; declined.', employeeFeedback: 'Two hours each way, every day.' });
      expect(JSON.stringify((await get(`/offboarding/separations/${raviExit}`, 'Priya')).body.data)).not.toContain('counter-offer');
      // The employee sees none of it.
      expect(JSON.stringify((await get('/offboarding/my', 'Ravi')).body.data)).not.toMatch(/Two hours|counter-offer|Long commute/);
      const audit = await prisma.rndtechnosoft_audit_logs.findMany({ where: { tenant_id: tenantId, action_code: 'SEPARATION_INTERVIEW_RECORDED', entity_id: raviExit } });
      expect(audit).toHaveLength(3);
      expect(JSON.stringify(audit)).not.toMatch(/Two hours|counter-offer/);
    });

    it('takes the manager’s feedback from My team, for their own reports only', async () => {
      expect((await put(`/offboarding/team/${omarExit}/feedback`, 'Mona', { feedback: 'Not mine' })).status).toBe(404);
      const given = await put(`/offboarding/team/${raviExit}/feedback`, 'Mona', { feedback: 'Strong engineer; the billing work needs a new owner.' });
      expect(given.status).toBe(200);
      expect(given.body.data.managerFeedback).toMatchObject({ text: 'Strong engineer; the billing work needs a new owner.' });
      expect(given.body.data.exitInterview).toBeUndefined();
      expect((await get(`/offboarding/separations/${raviExit}`, 'Priya')).body.data.managerFeedback).toMatchObject({ text: 'Strong engineer; the billing work needs a new owner.', by: 'Mona' });
    });
  });

  describe('dashboard and reports', () => {
    const report = (who: string, query = '') => get(`/offboarding/reports${query}`, who);

    it('counts the workspace’s exits, groups them, and shows settlement money only to those who may see it', async () => {
      expect((await report('Mona')).status).toBe(403);
      expect((await report('Priya', `?from=${today}&to=${shift(today, -1)}`)).status).toBe(400);
      expect((await report('Priya', '?groupBy=week')).status).toBe(400);

      const hr = (await report('Priya')).body.data;
      expect(hr.summary).toMatchObject({ total: 3, accepted: 3, pendingResignations: 0, upcomingLastDays: 3, completed: 0 });
      expect(hr.summary.pendingChecklistItems).toBeGreaterThan(0);
      expect(hr.byType).toEqual(expect.arrayContaining([{ label: 'Voluntary resignation', value: 1 }, { label: 'Termination', value: 1 }, { label: 'Retirement', value: 1 }]));
      expect(hr.byReason).toEqual(expect.arrayContaining([{ label: 'Long commute', value: 1 }, { label: 'Interview not recorded', value: 2 }]));
      expect(hr.upcoming.map((u: { employee: { name: string } }) => u.employee.name)).toEqual(['Zed', 'Ravi', 'Omar']);
      expect(hr.trend.reduce((t: number, p: { value: number }) => t + p.value, 0)).toBe(3);
      expect(hr.settlements).toBeNull();
      expect(hr.options.managers.map((m: { name: string }) => m.name)).toEqual(['Mona', 'Priya']);

      const owner = (await report('Owner')).body.data;
      expect(owner.settlements).toMatchObject({ notStarted: 3, approvedUnpaid: 0, paid: 0, totalPaid: '0.00' });
    });

    it('filters by exit type, manager and quarter', async () => {
      expect((await report('Priya', '?type=TERMINATION')).body.data.summary.total).toBe(1);
      const mona = (await report('Priya', `?managerId=${employees.Mona}`)).body.data;
      expect(mona.upcoming.map((u: { employee: { name: string } }) => u.employee.name)).toEqual(['Ravi']);
      const quarters = (await report('Priya', `?groupBy=quarter&from=${today.slice(0, 4)}-01-01&to=${today.slice(0, 4)}-12-31`)).body.data.trend;
      expect(quarters.map((p: { period: string }) => p.period)).toEqual([1, 2, 3, 4].map((n) => `${today.slice(0, 4)}-Q${n}`));
    });
  });
});

