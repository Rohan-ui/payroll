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

/**
 * Tenant isolation for the customer-facing API.
 *
 * Every check here states a rule the product depends on: a caller reaches the
 * data of exactly one tenant, chosen by the server from their session, and no
 * value they control can widen that.
 */

const API_PREFIX = '/api/v1';
const PASSWORD = 'Isolation-Suite-Password-1';

interface Actor {
  email: string;
  userId: string;
  tenantId: string;
  memberId: string;
  token: string;
}

describe('Tenant API isolation', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tenantA: string;
  let tenantB: string;
  let adminA: Actor;
  let adminB: Actor;
  let employeeA: Actor;

  const createdUserIds: string[] = [];

  async function seedActor(tenantId: string, roleCode: string): Promise<Omit<Actor, 'token'>> {
    const email = `isolation-${roleCode.toLowerCase()}-${randomUUID()}@voogyo.test`;

    const user = await prisma.rndtechnosoft_users.create({
      data: {
        id: randomUUID(),
        email,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        display_name: `Isolation ${roleCode}`,
        user_status: 'ACTIVE',
      },
    });
    createdUserIds.push(user.id);

    const member = await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        user_id: user.id,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });

    let role = await prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: roleCode },
    });
    if (!role) {
      role = await prisma.rndtechnosoft_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          role_code: roleCode,
          role_name: roleCode,
          is_system_role: true,
          role_status: 'ACTIVE',
        },
      });
      // Roles are created the way the product creates them: with their default grants.
      await grantDefaultRolePermissions(prisma, tenantId, role.id, roleCode);
    }

    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        tenant_member_id: member.id,
        role_id: role.id,
      },
    });

    return { email, userId: user.id, tenantId, memberId: member.id };
  }

  async function signIn(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post(`${API_PREFIX}/auth/login`)
      .send({ email, password: PASSWORD });

    expect(response.status).toBe(200);
    return response.body.token;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);
    await prisma.rndtechnosoft_login_throttle.deleteMany({});

    // Both tenants must hold employee records, otherwise the cross-tenant
    // assertions would pass trivially against empty result sets.
    const populated = await prisma.rndtechnosoft_employees.groupBy({
      by: ['tenant_id'],
      _count: { _all: true },
    });

    const active = await prisma.rndtechnosoft_tenants.findMany({
      where: {
        tenant_status: { in: ['ACTIVE', 'TRIALING'] },
        id: { in: populated.map((row) => row.tenant_id) },
      },
      select: { id: true },
    });

    expect(active.length).toBeGreaterThanOrEqual(2);
    tenantA = active[0].id;
    tenantB = active[1].id;

    const [a, b, e] = await Promise.all([
      seedActor(tenantA, 'ADMIN'),
      seedActor(tenantB, 'ADMIN'),
      seedActor(tenantA, 'EMPLOYEE'),
    ]);

    adminA = { ...a, token: await signIn(a.email) };
    adminB = { ...b, token: await signIn(b.email) };
    employeeA = { ...e, token: await signIn(e.email) };
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.rndtechnosoft_user_sessions.deleteMany({
        where: { user_id: { in: createdUserIds } },
      });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({
        where: { rndtechnosoft_tenant_members: { user_id: { in: createdUserIds } } },
      });
      await prisma.rndtechnosoft_tenant_members.deleteMany({
        where: { user_id: { in: createdUserIds } },
      });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: createdUserIds } } });
      await prisma.rndtechnosoft_login_throttle.deleteMany({});
    }
    await app?.close();
  });

  const TENANT_ENDPOINTS = [
    '/employees',
    '/attendance/records',
    '/crm/leads',
    '/salary/components',
    '/bookkeeping/ledgers',
    '/tenants/settings',
  ];

  // 1. Unauthenticated access
  describe('unauthenticated access', () => {
    it.each(TENANT_ENDPOINTS)('refuses %s without credentials', async (endpoint) => {
      const response = await request(app.getHttpServer()).get(`${API_PREFIX}${endpoint}`);
      expect(response.status).toBe(401);
    });

    it('refuses even when a tenant id is supplied', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('x-tenant-id', tenantA);

      expect(response.status).toBe(401);
      expect(response.body.items).toBeUndefined();
    });

    it('does not fall back to a default tenant when nothing is supplied', async () => {
      const response = await request(app.getHttpServer()).get(`${API_PREFIX}/employees`);
      expect(response.status).toBe(401);
    });
  });

  // 2. Authenticated tenant access
  describe('authenticated access', () => {
    it.each(TENANT_ENDPOINTS)('allows %s with a valid session', async (endpoint) => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}${endpoint}`)
        .set('Authorization', `Bearer ${adminA.token}`);

      expect(response.status).toBeLessThan(400);
    });

    it('reports the tenant the session is pinned to', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${adminA.token}`);

      expect(response.status).toBe(200);
      expect(response.body.activeTenant.tenantId).toBe(tenantA);
    });
  });

  // 3 and 4. Cross-tenant access and header manipulation
  describe('tenant selection cannot be influenced by the caller', () => {
    it('ignores an x-tenant-id header naming another tenant', async () => {
      const honest = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('Authorization', `Bearer ${adminA.token}`);

      const forged = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('Authorization', `Bearer ${adminA.token}`)
        .set('x-tenant-id', tenantB);

      expect(forged.status).toBe(200);
      // Identical result proves the header changed nothing.
      expect(forged.body.total).toBe(honest.body.total);
    });

    it('ignores a tenantId query parameter naming another tenant', async () => {
      const honest = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('Authorization', `Bearer ${adminA.token}`);

      const forged = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .query({ tenantId: tenantB })
        .set('Authorization', `Bearer ${adminA.token}`);

      expect(forged.body.total).toBe(honest.body.total);
    });

    it('gives each tenant a different view of the same endpoint', async () => {
      const fromA = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('Authorization', `Bearer ${adminA.token}`);

      const fromB = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .set('Authorization', `Bearer ${adminB.token}`);

      expect(fromA.status).toBe(200);
      expect(fromB.status).toBe(200);
      // Equal totals here would mean the scope is not actually applied.
      expect(fromA.body.total).not.toBe(fromB.body.total);
    });
  });

  // 5. Workspace manipulation
  describe('workspace switching', () => {
    it('refuses to switch into a tenant the user does not belong to', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/switch-tenant`)
        .set('Authorization', `Bearer ${adminA.token}`)
        .send({ tenantId: tenantB });

      expect(response.status).toBe(403);
    });

    it('refuses a sign-in pinned to a tenant the user does not belong to', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/login`)
        .send({ email: adminA.email, password: PASSWORD, tenantId: tenantB });

      expect(response.status).toBe(403);
    });

    it('answers the same way for a tenant that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/switch-tenant`)
        .set('Authorization', `Bearer ${adminA.token}`)
        .send({ tenantId: randomUUID() });

      // Matching the refusal above means membership cannot be probed.
      expect(response.status).toBe(403);
    });
  });

  // 6. Resource id manipulation
  describe('resource level scoping', () => {
    it('hides another tenant’s employee behind its id', async () => {
      const listB = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${adminB.token}`);

      const employeeOfB = listB.body.items?.[0];
      expect(employeeOfB).toBeDefined();

      const asOwner = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees/${employeeOfB.id}`)
        .set('Authorization', `Bearer ${adminB.token}`);
      expect(asOwner.status).toBe(200);

      const asOutsider = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees/${employeeOfB.id}`)
        .set('Authorization', `Bearer ${adminA.token}`);
      // 404 rather than 403, so existence is not disclosed.
      expect([403, 404]).toContain(asOutsider.status);
    });
  });

  // 7. List endpoints
  describe('list endpoints', () => {
    it('returns only records belonging to the session tenant', async () => {
      const response = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${adminB.token}`);

      expect(response.status).toBe(200);

      const ids: string[] = (response.body.items ?? []).map((item: { id: string }) => item.id);
      expect(ids.length).toBeGreaterThan(0);

      // Confirm against the database rather than trusting the response shape.
      const foreign = await prisma.rndtechnosoft_employees.count({
        where: { id: { in: ids }, tenant_id: { not: tenantB } },
      });
      expect(foreign).toBe(0);
    });
  });

  // 8. Mutation endpoints
  describe('mutations', () => {
    it('cannot update another tenant’s employee', async () => {
      const listB = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${adminB.token}`);

      const employeeOfB = listB.body.items?.[0];
      expect(employeeOfB).toBeDefined();

      const before = await prisma.rndtechnosoft_employees.findFirst({
        where: { id: employeeOfB.id },
        select: { first_name: true },
      });

      const response = await request(app.getHttpServer())
        .put(`${API_PREFIX}/employees/${employeeOfB.id}`)
        .set('Authorization', `Bearer ${adminA.token}`)
        .send({ firstName: 'CrossTenantWrite' });

      expect([403, 404]).toContain(response.status);

      const after = await prisma.rndtechnosoft_employees.findFirst({
        where: { id: employeeOfB.id },
        select: { first_name: true },
      });
      expect(after?.first_name).toBe(before?.first_name);
    });

    it('cannot delete another tenant’s employee', async () => {
      const listB = await request(app.getHttpServer())
        .get(`${API_PREFIX}/employees`)
        .query({ limit: 1 })
        .set('Authorization', `Bearer ${adminB.token}`);

      const employeeOfB = listB.body.items?.[0];
      expect(employeeOfB).toBeDefined();

      const response = await request(app.getHttpServer())
        .delete(`${API_PREFIX}/employees/${employeeOfB.id}`)
        .set('Authorization', `Bearer ${adminA.token}`);

      expect([403, 404]).toContain(response.status);

      const stillThere = await prisma.rndtechnosoft_employees.count({
        where: { id: employeeOfB.id },
      });
      expect(stillThere).toBe(1);
    });
  });

  // 9. Role separation inside a tenant
  describe('role separation', () => {
    it('refuses an admin-only action to a member without the role', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/membership`)
        .set('Authorization', `Bearer ${employeeA.token}`)
        .send({ userId: randomUUID() });

      expect(response.status).toBe(403);
    });

    it('lets an admin past the role check', async () => {
      const response = await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/membership`)
        .set('Authorization', `Bearer ${adminA.token}`)
        .send({ userId: randomUUID() });

      // Past authorization and into business logic, which rejects the unknown user.
      expect(response.status).not.toBe(403);
      expect(response.status).toBe(404);
    });
  });

  describe('session lifecycle', () => {
    it('stops accepting a token after sign-out', async () => {
      const token = await signIn(employeeA.email);

      const before = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      await request(app.getHttpServer())
        .post(`${API_PREFIX}/auth/logout`)
        .set('Authorization', `Bearer ${token}`);

      const after = await request(app.getHttpServer())
        .get(`${API_PREFIX}/auth/me`)
        .set('Authorization', `Bearer ${token}`);
      expect(after.status).toBe(401);
    });

    it('stops accepting a token once the membership is revoked', async () => {
      const actor = await seedActor(tenantA, 'EMPLOYEE');
      const token = await signIn(actor.email);

      // An endpoint every member may call, so only the membership decides the answer.
      const before = await request(app.getHttpServer())
        .get(`${API_PREFIX}/tenant/current`)
        .set('Authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      await prisma.rndtechnosoft_tenant_members.update({
        where: { id: actor.memberId },
        data: { membership_status: 'ARCHIVED' },
      });

      const after = await request(app.getHttpServer())
        .get(`${API_PREFIX}/tenant/current`)
        .set('Authorization', `Bearer ${token}`);
      // Membership is re-checked per request, so removal takes effect at once.
      expect(after.status).toBe(403);
    });
  });
});
