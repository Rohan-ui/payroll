import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Approving leave takes it off the balance people see, in the same step as the
 * ledger entry, and a request can be approved only once, so leave is never
 * deducted twice.
 */

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

describe('Leave balances', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const email = `leave-${SUFFIX}@rnd.test`;
  let tenantId = '';
  let token = '';
  const employeeId = randomUUID();
  const leaveTypeId = randomUUID();

  const call = (method: 'get' | 'post', url: string, body?: object) => {
    const req = request(app.getHttpServer())[method](`${API}${url}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

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
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Leave ${SUFFIX}`, tenantCode: `LEAVE${SUFFIX.toUpperCase()}`, email, password: 'Leave-Tests-1' });
    expect(r.status).toBe(201);
    tenantId = r.body.activeTenant.tenantId;
    token = r.body.token;
    await prisma.rndtechnosoft_employees.create({ data: { id: employeeId, tenant_id: tenantId, employee_code: `LV-${SUFFIX}`, first_name: 'Asha' } });
    await prisma.rndtechnosoft_leave_types.create({ data: { id: leaveTypeId, tenant_id: tenantId, leave_type_code: 'CL', leave_type_name: 'Casual leave' } });
    await prisma.rndtechnosoft_leave_balance_summaries.create({ data: { id: randomUUID(), tenant_id: tenantId, employee_id: employeeId, leave_type_id: leaveTypeId, balance_days: '10', as_of_date: new Date('2026-01-01') } });
  });

  afterAll(async () => {
    if (prisma && tenantId) {
      const scope = { tenant_id: tenantId };
      const userIds = (await prisma.rndtechnosoft_users.findMany({ where: { email }, select: { id: true } })).map((u) => u.id);
      await prisma.rndtechnosoft_leave_balance_transactions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_balance_summaries.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_approvals.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_request_days.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_requests.deleteMany({ where: scope });
      await prisma.rndtechnosoft_leave_types.deleteMany({ where: scope });
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
    await app?.close();
    if (previous.base === undefined) delete process.env.PLATFORM_BASE_DOMAIN;
    else process.env.PLATFORM_BASE_DOMAIN = previous.base;
  });

  it('takes approved leave off the balance once, even when approved twice', async () => {
    const submitted = await call('post', '/leave/requests', { employeeId, leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', requestedDays: '2', reason: 'Family function' });
    expect((await call('post', '/leave/requests', { employeeId, leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', requestedDays: '2', tenantId: randomUUID() })).status).toBe(400);
    expect((await call('post', '/leave/requests', { employeeId: 'x', leaveTypeId, startDate: '2026-12-01', endDate: '2026-12-02', requestedDays: '2' })).status).toBe(400);
    expect(submitted.status).toBe(201);
    const requestId = (submitted.body.data ?? submitted.body).id as string;

    const [first, second] = await Promise.all([call('post', `/leave/requests/${requestId}/approve`), call('post', `/leave/requests/${requestId}/approve`)]);
    expect([first.status, second.status].sort()).toEqual([201, 409]);

    const balance = await prisma.rndtechnosoft_leave_balance_summaries.findFirstOrThrow({ where: { employee_id: employeeId, leave_type_id: leaveTypeId } });
    expect(balance.balance_days.toFixed()).toBe('8');
    expect(await prisma.rndtechnosoft_leave_balance_transactions.count({ where: { employee_id: employeeId, transaction_type: 'USAGE' } })).toBe(1);
  });
});
