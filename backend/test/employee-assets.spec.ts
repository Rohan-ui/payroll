import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { OffboardingNotificationsService } from '@/modules/offboarding/offboarding-notifications.service';

/**
 * Stage 6: company assets. IT gives out and takes back equipment, Admin cards
 * and keys, each only their own; nobody records their own. An exit can't be
 * completed, nor its settlement submitted, while an asset is still out, and
 * what a lost or damaged asset costs is recovered in the settlement.
 */

// Whole exits through many requests against a remote development database.
jest.setTimeout(120_000);

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Assets-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

describe('Employee assets', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  let tenantId = '';
  const emails: string[] = [];
  const tokens: Record<string, string> = {};
  const employees: Record<string, string> = {};
  const address = (key: string) => `asset-${key.toLowerCase()}-${SUFFIX}@rnd.test`;

  const server = () => app.getHttpServer();
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const get = (url: string, who: string) => request(server()).get(`${API}${url}`).set(as(who));
  const post = (url: string, who: string, body: object = {}) => request(server()).post(`${API}${url}`).set(as(who)).send(body);
  const put = (url: string, who: string, body: object) => request(server()).put(`${API}${url}`).set(as(who)).send(body);

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
      .send({ companyName: `Assets ${SUFFIX}`, tenantCode: `AST${SUFFIX.toUpperCase()}`, email: ownerEmail, password: PASSWORD });
    expect(r.status).toBe(201);
    tenantId = r.body.activeTenant.tenantId;
    tokens.Owner = r.body.token;

    await person('Ravi', await role('STAFF', ['offboarding.my.view']));
    await person('Ivan', await role('IT', ['offboarding.my.view', 'assets.view', 'assets.it.manage']));
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      await app.get(OffboardingNotificationsService).flush();
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } })).map((u) => u.id);
      const scope = { tenant_id: tenantId };
      await prisma.rndtechnosoft_final_settlement_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_final_settlements.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_assets.deleteMany({ where: scope });
      await prisma.rndtechnosoft_onboarding_notifications.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_clearance_items.deleteMany({ where: scope });
      await prisma.rndtechnosoft_separation_date_changes.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_separations.deleteMany({ where: scope });
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

  const laptop = { category: 'LAPTOP', name: 'Dell Latitude 5440', tag: 'LT-0042', assignedDate: '2025-02-01', returnDueDate: '2026-12-31' };
  let laptopId = '';
  let cardId = '';
  let exitId = '';

  it('lets each team give out only its own assets, never to themselves, one tag at a time', async () => {
    expect((await get(`/employees/${employees.Ravi}/assets`, 'Ravi')).status).toBe(403);
    expect((await post(`/employees/${employees.Ravi}/assets`, 'Ivan', { ...laptop, tenantId: randomUUID() })).status).toBe(400);
    expect((await post(`/employees/${employees.Ravi}/assets`, 'Ivan', { ...laptop, assignedDate: '2099-01-01' })).status).toBe(400);
    expect((await post(`/employees/${employees.Ivan}/assets`, 'Ivan', { ...laptop, tag: 'LT-SELF' })).status).toBe(403);
    expect((await post(`/employees/${employees.Ravi}/assets`, 'Ivan', { category: 'ID_CARD', name: 'Employee ID card', assignedDate: '2025-02-01' })).status).toBe(403);

    const given = await post(`/employees/${employees.Ravi}/assets`, 'Ivan', laptop);
    expect(given.status).toBe(201);
    expect(given.body.data.canAssign).toEqual({ IT: true, ADMIN: false });
    laptopId = given.body.data.items[0].id;
    expect(given.body.data.items[0]).toMatchObject({ team: 'IT', status: 'ISSUED', tag: 'LT-0042', assignedBy: 'Ivan', canManage: true });
    expect((await post(`/employees/${employees.Ravi}/assets`, 'Ivan', { ...laptop, tag: 'lt-0042' })).status).toBe(409);

    const card = await post(`/employees/${employees.Ravi}/assets`, 'Owner', { category: 'ID_CARD', name: 'Employee ID card', assignedDate: '2025-02-01' });
    expect(card.status).toBe(201);
    cardId = card.body.data.items.find((a: { category: string }) => a.category === 'ID_CARD').id;
    expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: tenantId, action_code: 'ASSET_ASSIGNED' } })).toBe(2);
  });

  it('holds back the exit and its settlement while assets are out, and lists them for IT', async () => {
    const started = await post('/offboarding/separations', 'Owner', { employeeId: employees.Ravi, type: 'RESIGNATION', reason: 'Moving cities', noticeDate: today, lastWorkingDate: today });
    expect(started.status).toBe(201);
    exitId = started.body.data.id;
    expect(started.body.data.blockers.join(' ')).toContain('2 company assets are not returned yet (Dell Latitude 5440, Employee ID card)');

    const assets = await get(`/offboarding/separations/${exitId}/assets`, 'Owner');
    expect(assets.body.data.items).toHaveLength(2);
    const settlement = await post(`/offboarding/separations/${exitId}/settlement`, 'Owner');
    expect(settlement.status).toBe(201);
    expect(settlement.body.data.current.problems.join(' ')).toContain('2 company assets are not returned yet');

    const mine = await get('/offboarding/checklist/assets', 'Ivan');
    expect(mine.body.data.map((a: { id: string }) => a.id)).toEqual([laptopId]);
    expect(mine.body.data[0]).toMatchObject({ separationId: exitId, employee: { name: 'Ravi' }, lastWorkingDate: today });
    expect((await get('/offboarding/checklist/assets', 'Ravi')).body.data).toEqual([]);
  });

  it('records returns with their outcome, and recovers a lost asset in the settlement', async () => {
    const back = (body: object, who = 'Ivan', id = laptopId) => put(`/offboarding/checklist/assets/${id}/return`, who, { returnDate: today, ...body });
    expect((await back({ status: 'RETURNED' })).status).toBe(400);
    expect((await back({ status: 'RETURNED', condition: 'GOOD', recoveryAmount: '100' })).status).toBe(400);
    expect((await back({ status: 'WAIVED' })).status).toBe(400);
    expect((await back({ status: 'LOST', recoveryAmount: '45000.505' })).status).toBe(400);
    expect((await back({ status: 'RETURNED', condition: 'GOOD' }, 'Ivan', cardId)).status).toBe(403);

    const lost = await back({ status: 'LOST', recoveryAmount: '45000.50', remarks: 'Stolen from the car' });
    expect(lost.status).toBe(200);
    expect(lost.body.data).toEqual([]);
    expect((await back({ status: 'LOST' })).status).toBe(409);
    expect((await put(`/employees/${employees.Ravi}/assets/${cardId}/return`, 'Owner', { status: 'RETURNED', condition: 'GOOD', returnDate: today })).status).toBe(200);

    const row = await prisma.rndtechnosoft_employee_assets.findUniqueOrThrow({ where: { id: laptopId } });
    expect([row.return_status, row.recovery_amount?.toFixed(2), row.separation_id]).toEqual(['LOST', '45000.50', exitId]);

    const detail = await get(`/offboarding/separations/${exitId}`, 'Owner');
    expect(detail.body.data.blockers.join(' ')).not.toContain('company asset');
    const settlementId = (await get(`/offboarding/separations/${exitId}/settlement`, 'Owner')).body.data.current.id;
    const recalculated = await post(`/offboarding/settlements/${settlementId}/recalculate`, 'Owner');
    expect(recalculated.body.data.current.problems.join(' ')).not.toContain('company asset');
    expect(recalculated.body.data.current.lines.find((l: { code: string }) => l.code === 'ASSET_RECOVERY')).toMatchObject({ kind: 'RECOVERY', label: 'Asset recovery: Dell Latitude 5440 (LT-0042)', amount: '45000.50' });
  });

  it('reopens a recorded return with a reason, and cancels an asset recorded by mistake', async () => {
    expect((await post(`/employees/${employees.Ravi}/assets/${laptopId}/reopen`, 'Ivan', {})).status).toBe(400);
    const reopened = await post(`/employees/${employees.Ravi}/assets/${laptopId}/reopen`, 'Ivan', { reason: 'Found in the office' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.items.find((a: { id: string }) => a.id === laptopId)).toMatchObject({ status: 'ISSUED', recoveryAmount: null });
    expect((await put(`/employees/${employees.Ravi}/assets/${laptopId}/return`, 'Ivan', { status: 'RETURNED', condition: 'GOOD', returnDate: today })).status).toBe(200);

    const extra = await post(`/employees/${employees.Ravi}/assets`, 'Ivan', { category: 'MONITOR', name: 'Duplicate monitor', assignedDate: '2025-02-01' });
    const monitorId = extra.body.data.items.find((a: { name: string }) => a.name === 'Duplicate monitor').id;
    const cancelled = await post(`/employees/${employees.Ravi}/assets/${monitorId}/cancel`, 'Ivan', { reason: 'Entered twice' });
    expect(cancelled.body.data.items.find((a: { id: string }) => a.id === monitorId)).toMatchObject({ status: 'CANCELLED', remarks: 'Entered twice' });
    expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: tenantId, action_code: { in: ['ASSET_RETURN_RECORDED', 'ASSET_RETURN_REOPENED', 'ASSET_CANCELLED'] } } })).toBe(5);
  });
});
