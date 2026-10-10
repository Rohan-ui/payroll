import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import { CosecSyncService } from '@/modules/external-api/cosec-sync.service';
import { cosecToday } from '@/modules/external-api/external-api.service';

/**
 * COSEC attendance sync against a fake COSEC server on 127.0.0.1: the
 * every-minute sync writes only days that changed (new or moved punches), never
 * finalized or corrected days, places night-shift punches on their own date,
 * and holds each workspace for one worker at a time; opening an employee's
 * attendance refreshes their month; and all of it stays inside its workspace.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Cosec-Sync-Tests-1';
const COSEC_PASSWORD = 'Cosec-Api-Secret-9x';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Row = Record<string, string>;
/** dd/mm/yyyy for a YYYY-MM-DD date. */
const dmy = (date: string) => date.split('-').reverse().join('/');
const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
/** A COSEC daily row: punches as [date, time] pairs, IN/OUT alternating. */
const day = (userid: string, date: string, punches: [string, string][], halves: [string, string] = ['PR', 'PR']): Row => {
  const row: Row = { userid, username: userid, processdate: dmy(date), firsthalf: halves[0], secondhalf: halves[1], worktime_hhmm: punches.length > 1 ? '08:00' : '00:00' };
  punches.forEach(([d, t], i) => { row[`punch${i + 1}_date`] = dmy(d); row[`punch${i + 1}_time`] = t; });
  return row;
};

describe('COSEC attendance sync', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sync: CosecSyncService;
  let cosec: Server;
  let cosecUrl = '';
  /** What the fake COSEC returns, and what it was asked. */
  let rows: Row[] = [];
  let failWith: string | null = null;
  const asked: { path: string; args: Record<string, string>; auth: string | undefined }[] = [];

  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const userEmails: string[] = [];
  const a = { tenantId: '', token: '', email: `cosec-a-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const b = { tenantId: '', token: '', email: `cosec-b-${SUFFIX}@rnd.test`, memberId: '', userId: '' };
  const blind = { token: '', email: `cosec-blind-${SUFFIX}@rnd.test` };
  const emp = { asha: '', ravi: '', other: '' };
  const today = cosecToday();
  const yesterday = addDays(today, -1);

  const call = (method: 'get' | 'post' | 'put', url: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const record = (employeeId: string, date: string) =>
    prisma.rndtechnosoft_attendance_records.findFirst({ where: { employee_id: employeeId, attendance_date: new Date(`${date}T00:00:00.000Z`) } });
  const punches = (employeeId: string) =>
    prisma.rndtechnosoft_attendance_punches.findMany({ where: { employee_id: employeeId }, orderBy: { punch_at: 'asc' } });
  const state = (tenantId: string) => prisma.rndtechnosoft_cosec_sync_states.findUnique({ where: { tenant_id: tenantId } });

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Cosec ${label} ${SUFFIX}`, tenantCode: `CSC${label}${SUFFIX.toUpperCase()}`, email: workspace.email, password: PASSWORD });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } } });
    workspace.memberId = member.id;
    workspace.userId = member.user_id;
  }

  async function employee(tenantId: string, code: string, name: string) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({ data: { id, tenant_id: tenantId, employee_code: code, first_name: name } });
    return id;
  }

  beforeAll(async () => {
    process.env.PLATFORM_BASE_DOMAIN = BASE;
    // The fake COSEC: Basic auth, COSEC's ";"-separated arguments, JSON lists.
    cosec = createServer((req: IncomingMessage, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      const args = Object.fromEntries(url.search.slice(1).split(';').filter(Boolean).map((p) => p.split('=').map(decodeURIComponent)));
      asked.push({ path: url.pathname, args, auth: req.headers.authorization });
      if (req.headers.authorization !== `Basic ${Buffer.from(`api-user:${COSEC_PASSWORD}`).toString('base64')}`) {
        res.writeHead(401).end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      if (failWith) return res.end(JSON.stringify({ response: `failed: 0010101001 : ${failWith}` }));
      const wanted = args.range === 'user' ? rows.filter((r) => r.userid === args.id) : rows;
      res.end(JSON.stringify({ 'attendance-daily': wanted }));
    });
    await new Promise<void>((resolve) => cosec.listen(0, '127.0.0.1', resolve));
    cosecUrl = `http://127.0.0.1:${(cosec.address() as AddressInfo).port}/cosec`;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = app.get(PrismaService);
    sync = app.get(CosecSyncService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    await register(a, 'A');
    await register(b, 'B');
    emp.asha = await employee(a.tenantId, 'EMP001', 'Asha');
    emp.ravi = await employee(a.tenantId, 'EMP002', 'Ravi');
    emp.other = await employee(b.tenantId, 'EMP001', 'Divya');

    // A member who may not see attendance.
    userEmails.push(blind.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: blind.email, display_name: 'Blind', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({ data: { id: roleId, tenant_id: a.tenantId, role_code: `NOATT_${SUFFIX}`, role_name: 'No attendance', is_system_role: false } });
    const perm = await prisma.rndtechnosoft_permissions.findFirstOrThrow({ where: { permission_code: 'employees.view' } }).catch(() => null);
    if (perm) await prisma.rndtechnosoft_role_permissions.create({ data: { id: randomUUID(), tenant_id: a.tenantId, role_id: roleId, permission_id: perm.id } });
    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: a.tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    await prisma.rndtechnosoft_tenant_member_roles.create({ data: { id: randomUUID(), tenant_id: a.tenantId, tenant_member_id: memberId, role_id: roleId } });
    const login = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email: blind.email, password: PASSWORD, tenantId: a.tenantId });
    expect(login.status).toBe(200);
    blind.token = login.body.token;
  });

  afterAll(async () => {
    if (prisma) {
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      const userIds = users.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_attendance_punches.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_adjustments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_attendance_records.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_cosec_sync_states.deleteMany({ where: scope });
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
    await new Promise((resolve) => cosec?.close(resolve));
  });

  it('keeps the COSEC password encrypted, never in the settings as written', async () => {
    const saved = await call('put', '/external-api/cosec/config', a.token, { baseUrl: cosecUrl, username: 'api-user', password: COSEC_PASSWORD });
    expect(saved.status).toBe(200);
    const settings = (await prisma.rndtechnosoft_tenant_settings.findUniqueOrThrow({ where: { tenant_id: a.tenantId } })).settings as { cosecApi: Record<string, string> };
    expect(settings.cosecApi.password).toBeUndefined();
    expect(settings.cosecApi.passwordEncrypted).toBeDefined();
    expect(JSON.stringify(settings)).not.toContain(COSEC_PASSWORD);
    expect((await call('get', '/external-api/cosec/config', a.token)).body).toEqual({ baseUrl: cosecUrl, username: 'api-user', passwordSet: true });
  });

  it('keeps the saved password when saved or tested with the password left blank, and replaces it only with a new one', async () => {
    // Blank password: the saved one is kept (it is re-encrypted, and still works).
    expect((await call('put', '/external-api/cosec/config', a.token, { baseUrl: cosecUrl, username: 'api-user' })).status).toBe(200);
    expect((await call('post', '/external-api/cosec/test-connection', a.token, { baseUrl: cosecUrl, username: 'api-user' })).body).toEqual({ ok: true, message: 'Connection successful' });
    // The typed username is what is tested, with the saved password.
    expect((await call('post', '/external-api/cosec/test-connection', a.token, { baseUrl: cosecUrl, username: 'someone-else' })).body.ok).toBe(false);
    // A wrong new password replaces the saved one; the right one puts it back.
    await call('put', '/external-api/cosec/config', a.token, { baseUrl: cosecUrl, username: 'api-user', password: '12345678' });
    expect((await call('post', '/external-api/cosec/test-connection', a.token, { baseUrl: cosecUrl, username: 'api-user' })).body.ok).toBe(false);
    await call('put', '/external-api/cosec/config', a.token, { baseUrl: cosecUrl, username: 'api-user', password: COSEC_PASSWORD });
    expect((await call('post', '/external-api/cosec/test-connection', a.token, { baseUrl: cosecUrl, username: 'api-user' })).body.ok).toBe(true);
    expect((await call('post', '/external-api/cosec/test-connection', b.token, { baseUrl: cosecUrl, username: 'api-user' })).status).toBe(400);
  });

  it('syncs yesterday and today every run, matching COSEC users to Employee Codes', async () => {
    rows = [
      day('EMP001', yesterday, [[yesterday, '09:05'], [yesterday, '18:10']]),
      day('EMP001', today, [[today, '09:30']]),
      day('EMP002', today, [[today, '10:00'], [today, '19:00']]),
      day('GHOST7', today, [[today, '09:00']]),
    ];
    asked.length = 0;
    expect(await sync.dueTenants()).toContain(a.tenantId);
    expect(await sync.dueTenants()).not.toContain(b.tenantId);
    expect(await sync.runTenant(a.tenantId)).toBe(true);

    expect(asked[0].path).toBe('/cosec/api.svc/v2/attendance-daily');
    expect(asked[0].args).toMatchObject({ action: 'get', range: 'all', 'date-range': `${dmy(yesterday).replace(/\//g, '')}-${dmy(today).replace(/\//g, '')}`, format: 'json' });
    expect(asked[0].args['field-name']).toContain('processdate');

    const asha = await record(emp.asha, today);
    expect(asha).toMatchObject({ attendance_status: 'PRESENT', source: 'COSEC_SYNC', last_check_out_at: null });
    expect(asha!.first_check_in_at!.toISOString()).toBe(new Date(`${today}T09:30:00+05:30`).toISOString());
    expect((await record(emp.asha, yesterday))!.last_check_out_at!.toISOString()).toBe(new Date(`${yesterday}T18:10:00+05:30`).toISOString());
    expect((await punches(emp.ravi)).map((p) => [p.punch_type, p.punch_at.toISOString()])).toEqual([
      ['CHECK_IN', new Date(`${today}T10:00:00+05:30`).toISOString()],
      ['CHECK_OUT', new Date(`${today}T19:00:00+05:30`).toISOString()],
    ]);
    expect(await state(a.tenantId)).toMatchObject({ last_sync_status: 'SUCCEEDED', last_changed_records: 3, last_unmatched_users: 1, claimed_until: null });
  });

  it('writes nothing when nothing changed, and only the moved punch when one did', async () => {
    const before = await punches(emp.ravi);
    await sync.runTenant(a.tenantId);
    expect((await state(a.tenantId))!.last_changed_records).toBe(0);
    expect((await punches(emp.ravi)).map((p) => p.id)).toEqual(before.map((p) => p.id));

    // Asha punches out; Ravi's check-in is corrected in COSEC.
    rows[1] = day('EMP001', today, [[today, '09:30'], [today, '18:45']]);
    rows[2] = day('EMP002', today, [[today, '09:50'], [today, '19:00']]);
    await sync.runTenant(a.tenantId);
    expect((await state(a.tenantId))!.last_changed_records).toBe(2);
    expect((await record(emp.asha, today))!.last_check_out_at!.toISOString()).toBe(new Date(`${today}T18:45:00+05:30`).toISOString());
    expect((await record(emp.ravi, today))!.first_check_in_at!.toISOString()).toBe(new Date(`${today}T09:50:00+05:30`).toISOString());
    expect((await punches(emp.ravi)).map((p) => p.punch_at.toISOString())).toEqual([new Date(`${today}T09:50:00+05:30`).toISOString(), new Date(`${today}T19:00:00+05:30`).toISOString()]);
  });

  it('never overwrites a day locked by payroll or corrected by an approved adjustment', async () => {
    const ravi = (await record(emp.ravi, today))!;
    await prisma.rndtechnosoft_attendance_records.update({ where: { id: ravi.id }, data: { finalized_at: new Date() } });
    const asha = (await record(emp.asha, yesterday))!;
    await prisma.rndtechnosoft_attendance_adjustments.create({
      data: { id: randomUUID(), tenant_id: a.tenantId, attendance_record_id: asha.id, requested_by_tenant_member_id: a.memberId, adjustment_reason: 'Forgot to punch', requested_values: {}, adjustment_status: 'APPROVED' },
    });
    rows[0] = day('EMP001', yesterday, [[yesterday, '07:00'], [yesterday, '20:00']]);
    rows[2] = day('EMP002', today, [[today, '08:00'], [today, '20:00']]);
    await sync.runTenant(a.tenantId);
    expect((await record(emp.ravi, today))!.first_check_in_at!.toISOString()).toBe(new Date(`${today}T09:50:00+05:30`).toISOString());
    expect((await record(emp.asha, yesterday))!.first_check_in_at!.toISOString()).toBe(new Date(`${yesterday}T09:05:00+05:30`).toISOString());
    expect((await state(a.tenantId))!.last_changed_records).toBe(0);
  });

  it('puts a night shift’s after-midnight punch on its own date', async () => {
    // (Asha's yesterday is corrected and Ravi's today finalized, above: Ravi's yesterday is free.)
    rows = [day('EMP002', yesterday, [[yesterday, '22:00'], [today, '06:00']])];
    await sync.runTenant(a.tenantId);
    const night = (await record(emp.ravi, yesterday))!;
    expect(night.first_check_in_at!.toISOString()).toBe(new Date(`${yesterday}T22:00:00+05:30`).toISOString());
    expect(night.last_check_out_at!.toISOString()).toBe(new Date(`${today}T06:00:00+05:30`).toISOString());
  });

  it('runs a workspace on one worker at a time, honours the off switch, and records failures without stopping', async () => {
    const [first, second] = await Promise.all([sync.runTenant(a.tenantId), sync.runTenant(a.tenantId)]);
    expect([first, second].sort()).toEqual([false, true]);

    failWith = 'Invalid command';
    expect(await sync.runTenant(a.tenantId)).toBe(true);
    expect(await state(a.tenantId)).toMatchObject({ last_sync_status: 'FAILED', claimed_until: null });
    expect((await state(a.tenantId))!.last_sync_error).toContain('Invalid command');
    failWith = null;

    const off = await call('put', '/external-api/cosec/auto-sync', a.token, { enabled: false });
    expect(off.status).toBe(200);
    expect(off.body.autoSyncEnabled).toBe(false);
    expect(await sync.dueTenants()).not.toContain(a.tenantId);
    expect(await sync.runTenant(a.tenantId)).toBe(false);
    expect(await prisma.rndtechnosoft_audit_logs.count({ where: { tenant_id: a.tenantId, action_code: 'COSEC_AUTO_SYNC_DISABLED' } })).toBe(1);
    expect((await call('put', '/external-api/cosec/auto-sync', a.token, { enabled: 'yes' })).status).toBe(400);
    await call('put', '/external-api/cosec/auto-sync', a.token, { enabled: true });
    await sync.runTenant(a.tenantId);

    const status = await call('get', '/external-api/cosec/sync-status', a.token);
    expect(status.body).toMatchObject({ configured: true, autoSyncEnabled: true, lastStatus: 'SUCCEEDED', workerSilent: false });
    expect((await call('get', '/external-api/cosec/sync-status', b.token)).body).toMatchObject({ configured: false, workerSilent: false });
  });

  describe('opening the attendance page', () => {
    it('refreshes everyone’s month from COSEC in one request, and reuses or shares a refresh already made', async () => {
      const month = addDays(today, -70).slice(0, 7);
      const first = `${month}-01`;
      rows = [day('EMP001', first, [[first, '09:00'], [first, '18:00']]), day('EMP002', first, [], ['AB', 'AB'])];
      asked.length = 0;
      // Two pages opening together: one COSEC request.
      const [one, two] = await Promise.all([
        call('post', '/external-api/cosec/refresh-month', a.token, { month }),
        call('post', '/external-api/cosec/refresh-month', a.token, { month }),
      ]);
      expect([one.status, two.status]).toEqual([200, 200]);
      expect(one.body).toMatchObject({ status: 'SYNCED' });
      expect(two.body).toEqual(one.body);
      expect(asked).toHaveLength(1);
      expect(asked[0].args).toMatchObject({ range: 'all' });
      expect((await record(emp.asha, first))!.attendance_status).toBe('PRESENT');
      expect((await record(emp.ravi, first))!.attendance_status).toBe('ABSENT');

      const again = await call('post', '/external-api/cosec/refresh-month', a.token, { month });
      expect(again.body.status).toBe('RECENT');
      expect(asked).toHaveLength(1);
    });

    it('only for members who may see attendance, in workspaces with COSEC, and reports failures', async () => {
      const month = addDays(today, -100).slice(0, 7);
      expect((await call('post', '/external-api/cosec/refresh-month', b.token, { month })).body).toEqual({ status: 'NOT_CONFIGURED' });
      expect((await call('post', '/external-api/cosec/refresh-month', blind.token, { month })).status).toBe(403);
      expect((await call('post', '/external-api/cosec/refresh-month', a.token, { month: '2026-13' })).status).toBe(400);
      failWith = 'License not available';
      const failed = await call('post', '/external-api/cosec/refresh-month', a.token, { month });
      failWith = null;
      expect(failed.status).toBe(503);
      expect(failed.body.message).toContain('The latest punches could not be fetched from COSEC');
    });
  });

  describe('opening an employee’s attendance', () => {
    it('refreshes that employee’s month from COSEC, and placed absent days on their own dates', async () => {
      const month = today.slice(0, 7);
      const first = `${month}-01`;
      rows = [
        day('EMP002', first, [], ['AB', 'AB']),
        day('EMP002', today, [[today, '09:15'], [today, '18:00']]),
      ];
      asked.length = 0;
      const refreshed = await call('post', '/external-api/cosec/refresh-employee', a.token, { employeeId: emp.ravi, month });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body).toMatchObject({ status: 'SYNCED', matched: true });
      expect(asked[0].args).toMatchObject({ range: 'user', id: 'EMP002', 'date-range': `${dmy(first).replace(/\//g, '')}-${dmy(today).replace(/\//g, '')}` });
      if (first !== today) expect((await record(emp.ravi, first))!.attendance_status).toBe('ABSENT');

      // Again straight away: the refresh just made is reused.
      const again = await call('post', '/external-api/cosec/refresh-employee', a.token, { employeeId: 'EMP002', month });
      expect(again.body.status).toBe('RECENT');
      expect(asked).toHaveLength(1);
    });

    it('says when COSEC knows no such user, and when the workspace has no COSEC', async () => {
      rows = [];
      const month = today.slice(0, 7);
      expect((await call('post', '/external-api/cosec/refresh-employee', a.token, { employeeId: emp.asha, month })).body).toMatchObject({ status: 'SYNCED', matched: false });
      expect((await call('post', '/external-api/cosec/refresh-employee', b.token, { employeeId: emp.other, month })).body).toEqual({ status: 'NOT_CONFIGURED' });
    });

    it('only for the workspace’s own employees, by members who may see attendance', async () => {
      const month = today.slice(0, 7);
      expect((await call('post', '/external-api/cosec/refresh-employee', b.token, { employeeId: emp.asha, month })).status).toBe(404);
      expect((await call('post', '/external-api/cosec/refresh-employee', blind.token, { employeeId: emp.asha, month })).status).toBe(403);
      expect((await call('post', '/external-api/cosec/refresh-employee', a.token, { employeeId: emp.asha, month: '2026-13' })).status).toBe(400);
      expect(await prisma.rndtechnosoft_attendance_records.count({ where: { employee_id: emp.other } })).toBe(0);
    });

    it('reports a COSEC failure instead of hiding it', async () => {
      failWith = 'License not available';
      const failed = await call('post', '/external-api/cosec/refresh-employee', a.token, { employeeId: 'EMP001', month: addDays(today, -40).slice(0, 7) });
      failWith = null;
      expect(failed.status).toBe(503);
      expect(failed.body.message).toContain('The latest punches could not be fetched from COSEC');
    });
  });
});
