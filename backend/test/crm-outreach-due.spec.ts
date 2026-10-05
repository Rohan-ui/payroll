import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { addDays, addWorkingDays, dueInstant, localDate } from '@/modules/crm/crm-outreach-schedule';
import { deleteCrmData } from './support/crm-cleanup';

/**
 * When Client Outreach touchpoints are due, over HTTP: every lead has its own
 * due date in the workspace's dates; the board can show only what is due on a
 * day (overdue first) or only the member's leads; the next touchpoint is
 * counted in working days from when the last was done; a touchpoint can be
 * moved to another date, on record; and the month calendar counts what falls
 * due each day.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Outreach-Due-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const TZ = 'Asia/Kolkata';
const noHolidays = { timeZone: TZ, holidays: new Set<string>() };

describe('Client Outreach due dates', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const admin = { tenantId: '', token: '', email: `due-admin-${SUFFIX}@due.test`, memberId: '' };
  const neha = { token: '', email: `due-neha-${SUFFIX}@due.test`, memberId: '' };
  const lead = { today: '', tomorrow: '', overdue: '', later: '', nehas: '' };
  let today = '';

  const call = (method: 'get' | 'post', url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const board = async (query: string, token = admin.token) => (await call('get', `/crm/cadence?limit=50&${query}`, token)).body.data;
  const ids = (data: { radar: { allActive: { id: string }[] } }) => data.radar.allActive.map((l) => l.id);
  const cadenceOf = async (id: string) => ((await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id } })).custom_attributes as { cadence: Record<string, any> }).cadence;
  async function setDue(id: string, date: string) {
    const row = await prisma.rndtechnosoft_crm_leads.findUniqueOrThrow({ where: { id } });
    const attrs = row.custom_attributes as { cadence: Record<string, unknown> };
    await prisma.rndtechnosoft_crm_leads.update({ where: { id }, data: { custom_attributes: { ...attrs, cadence: { ...attrs.cadence, nextDueAt: dueInstant(date, TZ).toISOString() } } } });
  }
  async function coldLead(name: string, assignee?: string) {
    const created = await call('post', '/crm/leads', admin.token, { companyName: `${name} ${SUFFIX}`, firstName: name, email: `${name.toLowerCase()}-${SUFFIX}@client.test`, temperature: 'COLD', ...(assignee ? { assignedTenantMemberId: assignee } : {}) });
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
    userEmails.push(admin.email, neha.email);
    const registered = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Due ${SUFFIX}`, tenantCode: `DUE${SUFFIX.toUpperCase()}`, email: admin.email, password: PASSWORD });
    expect(registered.status).toBe(201);
    admin.tenantId = registered.body.activeTenant.tenantId;
    admin.token = registered.body.token;
    tenantIds.push(admin.tenantId);
    admin.memberId = (await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: admin.tenantId } })).id;

    // A sales member who sees only her own leads.
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: neha.email, display_name: 'Neha Mishra', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: admin.tenantId, role_code: 'R_BDM', role_name: 'BDM', is_system_role: false } });
    const permissions = await prisma.rndtechnosoft_permissions.findMany({ where: { permission_code: { in: ['leads.view', 'outreach.view', 'outreach.update'] } } });
    await prisma.rndtechnosoft_role_permissions.createMany({ data: permissions.map((p) => ({ id: randomUUID(), tenant_id: admin.tenantId, role_id: roleId, permission_id: p.id })) });
    neha.memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: neha.memberId, tenant_id: admin.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: admin.tenantId, tenant_member_id: neha.memberId, role_id: roleId } });
    neha.token = (await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: neha.email, password: PASSWORD, tenantId: admin.tenantId })).body.token;

    const pipeline = (await call('post', '/crm/masters/pipelines', admin.token, { name: 'Sales', code: `SALES_${SUFFIX}`, is_default: true })).body.data.id;
    await call('post', '/crm/masters/stages', admin.token, { pipeline_id: pipeline, name: 'New', sort_order: 1 });

    today = localDate(new Date(), TZ);
    lead.today = await coldLead('Today');
    lead.tomorrow = await coldLead('Tomorrow');
    lead.overdue = await coldLead('Overdue');
    lead.later = await coldLead('Later');
    lead.nehas = await coldLead('Nehas', neha.memberId);
    await setDue(lead.today, today);
    await setDue(lead.tomorrow, addDays(today, 1));
    await setDue(lead.overdue, addDays(today, -2));
    await setDue(lead.later, addDays(today, 5));
    await setDue(lead.nehas, today);
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await deleteCrmData(prisma, tenantIds);
      await prisma.rndtechnosoft_holidays.deleteMany({ where: scope });
      await prisma.rndtechnosoft_holiday_calendars.deleteMany({ where: scope });
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

  it('shows what is due today, overdue first, with each lead’s own date, and counts per milestone', async () => {
    const data = await board('due=TODAY');
    expect(data.schedule).toMatchObject({ today, timeZone: TZ, due: { filter: 'TODAY', from: today, to: today, withOverdue: true } });
    // Overdue first; two due at the same time come newest first.
    expect(ids(data)).toEqual([lead.overdue, lead.nehas, lead.today]);
    const overdue = data.radar.allActive[0].currentStep;
    expect(overdue).toMatchObject({ dueOn: addDays(today, -2), dueStatus: 'OVERDUE', overdueDays: 2 });
    expect(data.radar.allActive[2].currentStep).toMatchObject({ dueOn: today, dueStatus: 'DUE_TODAY', overdueDays: 0 });
    const step = data.masterSteps[0].id;
    expect(data.facets.milestoneCounts[step]).toBe(5);
    expect(data.facets.milestoneDueCounts[step]).toBe(3);
    expect(data.stats).toMatchObject({ dueTodayCount: 2, overdueCount: 1 });
  });

  it('shows tomorrow, the coming week, a past date, or every lead, soonest first', async () => {
    expect(ids(await board('due=TOMORROW'))).toEqual([lead.overdue, lead.tomorrow]);
    expect(ids(await board('due=WEEK'))).toEqual([lead.overdue, lead.nehas, lead.today, lead.tomorrow, lead.later]);
    expect(ids(await board(`due=DATE&dueDate=${addDays(today, -2)}`))).toEqual([lead.overdue]);
    expect(ids(await board('due=ALL'))).toEqual([lead.overdue, lead.nehas, lead.today, lead.tomorrow, lead.later]);
    expect((await call('get', '/crm/cadence?due=DATE&dueDate=tomorrow', admin.token)).status).toBe(400);
  });

  it('shows only the member’s own leads when asked', async () => {
    // The admin's own leads are the ones the admin added; Neha's is not among them.
    expect(ids(await board('due=TODAY&mine=true'))).toEqual([lead.overdue, lead.today]);
    expect(ids(await board('due=TODAY&mine=true', neha.token))).toEqual([lead.nehas]);
    // Neha sees only her own leads anyway.
    expect(ids(await board('due=ALL', neha.token))).toEqual([lead.nehas]);
  });

  it('counts the next touchpoint in working days from when the last was done, skipping holidays', async () => {
    const steps = (await board('due=ALL')).masterSteps as { dayNumber: number }[];
    const gap = steps[1].dayNumber - steps[0].dayNumber;
    const firstWorking = addWorkingDays(today, 1, noHolidays);
    const calendarId = randomUUID();
    await prisma.rndtechnosoft_holiday_calendars.create({ data: { id: calendarId, tenant_id: admin.tenantId, calendar_code: 'IN', calendar_name: 'India' } });
    await prisma.rndtechnosoft_holidays.create({ data: { id: randomUUID(), tenant_id: admin.tenantId, holiday_calendar_id: calendarId, holiday_date: new Date(`${firstWorking}T00:00:00Z`), holiday_name: 'Company holiday' } });
    expect((await call('post', '/crm/cadence', admin.token, { action: 'COMPLETE_STEP', leadId: lead.today, notes: 'Done' })).status).toBe(201);
    const holidays = { timeZone: TZ, holidays: new Set([firstWorking]) };
    const expected = dueInstant(addWorkingDays(today, gap, holidays), TZ).toISOString();
    expect((await cadenceOf(lead.today)).nextDueAt).toBe(expected);
    expect(expected).not.toBe(dueInstant(addDays(today, gap), TZ).toISOString());
  });

  it('moves a touchpoint to another date on request, on record, and only forward', async () => {
    const target = addDays(today, 10);
    const moved = await call('post', '/crm/cadence', neha.token, { action: 'RESCHEDULE', leadId: lead.nehas, dueDate: target, notes: 'Call me next week' });
    expect(moved.status).toBe(201);
    expect(moved.body.data).toMatchObject({ dueOn: target });
    expect((await cadenceOf(lead.nehas)).nextDueAt).toBe(dueInstant(target, TZ).toISOString());
    const audit = await prisma.rndtechnosoft_crm_audit_logs.findFirstOrThrow({ where: { entity_id: lead.nehas, action_type: 'TOUCHPOINT_RESCHEDULED' } });
    expect(audit).toMatchObject({ actor_id: neha.memberId });
    expect(audit.changes_diff).toMatchObject({ notes: 'Call me next week', changes: { due_on: { before: today, after: target } } });
    const activity = await prisma.rndtechnosoft_crm_lead_activities.findFirstOrThrow({ where: { lead_id: lead.nehas, title: 'Touchpoint rescheduled' } });
    expect(activity.description).toContain(`to ${target}`);

    expect((await call('post', '/crm/cadence', neha.token, { action: 'RESCHEDULE', leadId: lead.nehas, dueDate: addDays(today, -1) })).status).toBe(400);
    expect((await call('post', '/crm/cadence', neha.token, { action: 'RESCHEDULE', leadId: lead.later, dueDate: target })).status).toBe(404);
  });

  it('counts what falls due each day of a month, and what is overdue', async () => {
    const month = addDays(today, 10).slice(0, 7);
    const data = (await call('get', `/crm/cadence/calendar?month=${month}`, admin.token)).body.data;
    expect(data).toMatchObject({ month, today, timeZone: TZ, overdue: 1 });
    expect(data.days[addDays(today, 10)]).toBe(1);
    expect((await call('get', `/crm/cadence/calendar?month=${month}&mine=true`, neha.token)).body.data.days[addDays(today, 10)]).toBe(1);
    expect((await call('get', '/crm/cadence/calendar?month=2026-13', admin.token)).status).toBe(400);
  });
});
