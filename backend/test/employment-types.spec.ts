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

const API = '/api/v1';
const BASE = 'voogyo.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Emp-Types-Suite-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

describe('Employment Types System (E2E & Multi-Tenant)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const tenantIds: string[] = [];
  const userEmails: string[] = [];

  const a = { tenantId: '', token: '', email: `et-admin-a-${SUFFIX}@payroll.test`, memberId: '' };
  const b = { tenantId: '', token: '', email: `et-admin-b-${SUFFIX}@payroll.test`, memberId: '' };
  const memberWithoutPerms = { token: '', email: `et-employee-${SUFFIX}@payroll.test`, memberId: '' };

  const call = (method: Method, path: string, token: string, body?: unknown) => {
    const req = request(app.getHttpServer())[method](`${API}${path}`).set('Host', LOCAL).set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body as object);
  };
  const asA = (method: Method, path: string, body?: unknown) => call(method, path, a.token, body);
  const asB = (method: Method, path: string, body?: unknown) => call(method, path, b.token, body);

  async function register(workspace: typeof a, label: string) {
    userEmails.push(workspace.email);
    const response = await request(app.getHttpServer())
      .post(`${API}/auth/register-tenant`)
      .set('Host', BASE)
      .send({
        companyName: `Employment Types Org ${label} ${SUFFIX}`,
        tenantCode: `ET${label}${SUFFIX.toUpperCase()}`,
        email: workspace.email,
        password: PASSWORD,
      });
    expect(response.status).toBe(201);
    workspace.tenantId = response.body.activeTenant.tenantId;
    workspace.token = response.body.token;
    tenantIds.push(workspace.tenantId);
    const member = await prisma.rndtechnosoft_tenant_members.findFirstOrThrow({
      where: { tenant_id: workspace.tenantId, rndtechnosoft_users: { email: workspace.email } },
    });
    workspace.memberId = member.id;
  }

  async function addMember(person: typeof memberWithoutPerms, roleCode: string) {
    userEmails.push(person.email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({
      data: {
        id: userId,
        email: person.email,
        display_name: roleCode,
        password_hash: await hashPassword(PASSWORD),
        password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
        user_status: 'ACTIVE',
      },
    });
    const roleId = randomUUID();
    await prisma.rndtechnosoft_roles.create({
      data: {
        id: roleId,
        tenant_id: a.tenantId,
        role_code: roleCode,
        role_name: roleCode,
        is_system_role: false,
      },
    });
    // Grant minimal employee permissions without organization.update
    await grantDefaultRolePermissions(prisma, a.tenantId, roleId, 'EMPLOYEE');

    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: memberId,
        tenant_id: a.tenantId,
        user_id: userId,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: a.tenantId,
        tenant_member_id: memberId,
        role_id: roleId,
      },
    });
    const login = await request(app.getHttpServer())
      .post(`${API}/auth/login`)
      .set('Host', LOCAL)
      .send({ email: person.email, password: PASSWORD, tenantId: a.tenantId });
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

    await register(a, 'A');
    await register(b, 'B');
    await addMember(memberWithoutPerms, 'REGULAR_EMPLOYEE');
  });

  afterAll(async () => {
    if (prisma) {
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
      await prisma.rndtechnosoft_offers.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employment_types.deleteMany({ where: scope });
      await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_member_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_role_permissions.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
      await prisma.rndtechnosoft_roles.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_settings.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_domains.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenant_quotas.deleteMany({ where: scope });
      await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: { in: tenantIds } } });
      const users = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: userEmails } }, select: { id: true } });
      await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
      await prisma.$disconnect();
    }
    if (app) {
      await app.close();
    }
  });

  describe('CRUD and Validation', () => {
    let createdId: string;

    it('creates a new employment type with name and description', async () => {
      const res = await asA('post', '/tenant/employment-types', {
        name: 'Full-time Permanent',
        description: 'Standard 40 hour per week contract',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      createdId = res.body.data.id;
      expect(createdId).toBeDefined();
      expect(res.body.data.name).toBe('Full-time Permanent');
      expect(res.body.data.description).toBe('Standard 40 hour per week contract');
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.isActive).toBe(true);
    });

    it('rejects creation when name is empty or missing', async () => {
      const res = await asA('post', '/tenant/employment-types', {
        name: '',
      });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate name in the same tenant (case-insensitive)', async () => {
      const res = await asA('post', '/tenant/employment-types', {
        name: 'full-time permanent',
        description: 'Duplicate attempt with different casing',
      });
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('allows a different tenant to create an employment type with the same name', async () => {
      const res = await asB('post', '/tenant/employment-types', {
        name: 'Full-time Permanent',
        description: 'Tenant B copy',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Full-time Permanent');
    });

    it('lists employment types with count and active status', async () => {
      const res = await asA('get', '/tenant/employment-types');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((t: any) => t.id === createdId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Full-time Permanent');
    });

    it('searches employment types by query parameter', async () => {
      const res = await asA('get', '/tenant/employment-types?search=Permanent');
      expect(res.status).toBe(200);
      expect(res.body.data.some((t: any) => t.id === createdId)).toBe(true);

      const emptyRes = await asA('get', '/tenant/employment-types?search=NonExistentQueryXYZ');
      expect(emptyRes.status).toBe(200);
      expect(emptyRes.body.data).toHaveLength(0);
    });

    it('updates employment type name and description', async () => {
      const res = await asA('put', `/tenant/employment-types/${createdId}`, {
        name: 'Full-time Regular',
        description: 'Updated description for regular staff',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Full-time Regular');
      expect(res.body.data.description).toBe('Updated description for regular staff');
    });

    it('allows updating an employment type to its own name without duplicate error', async () => {
      const res = await asA('put', `/tenant/employment-types/${createdId}`, {
        name: 'full-time regular',
        description: 'Case shift only',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('full-time regular');
    });

    it('deactivates an employment type', async () => {
      const res = await asA('patch', `/tenant/employment-types/${createdId}/status`, {
        status: 'INACTIVE',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Filtering by active status should not include it
      const activeOnly = await asA('get', '/tenant/employment-types?status=active');
      expect(activeOnly.body.data.some((t: any) => t.id === createdId)).toBe(false);

      // Filtering by inactive status should include it
      const inactiveOnly = await asA('get', '/tenant/employment-types?status=inactive');
      expect(inactiveOnly.body.data.some((t: any) => t.id === createdId)).toBe(true);
    });

    it('reactivates an employment type', async () => {
      const res = await asA('patch', `/tenant/employment-types/${createdId}/status`, {
        status: 'ACTIVE',
      });
      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);
    });
  });

  describe('Security and Tenant Isolation', () => {
    let typeAId: string;

    beforeAll(async () => {
      const res = await asA('post', '/tenant/employment-types', {
        name: 'Contractor A',
        description: 'Isolated test type',
      });
      typeAId = res.body.data.id;
    });

    it('prevents cross-tenant access to get employment type', async () => {
      const res = await asB('get', `/tenant/employment-types/${typeAId}`);
      expect(res.status).toBe(404);
    });

    it('prevents cross-tenant modification of employment type', async () => {
      const res = await asB('put', `/tenant/employment-types/${typeAId}`, {
        name: 'Hacked Name',
      });
      expect(res.status).toBe(404);
    });

    it('prevents cross-tenant status change', async () => {
      const res = await asB('patch', `/tenant/employment-types/${typeAId}/status`, {
        status: 'INACTIVE',
      });
      expect(res.status).toBe(404);
    });

    it('prevents cross-tenant deletion', async () => {
      const res = await asB('delete', `/tenant/employment-types/${typeAId}`);
      expect(res.status).toBe(404);
    });

    it('rejects unauthorized members from creating or managing employment types', async () => {
      const res = await call('post', '/tenant/employment-types', memberWithoutPerms.token, {
        name: 'Unauthorized Type',
      });
      expect(res.status).toBe(403);
    });
  });

  describe('Integration with Candidates and Onboarding', () => {
    let activeTypeId: string;
    let inactiveTypeId: string;
    let candidateId: string;

    beforeAll(async () => {
      const activeRes = await asA('post', '/tenant/employment-types', {
        name: 'Internship Program',
        description: 'Summer interns',
      });
      activeTypeId = activeRes.body.data.id;

      const inactiveRes = await asA('post', '/tenant/employment-types', {
        name: 'Obsolete Freelance',
        description: 'Deactivated type',
      });
      inactiveTypeId = inactiveRes.body.data.id;
      await asA('patch', `/tenant/employment-types/${inactiveTypeId}/status`, { status: 'INACTIVE' });
    });

    it('returns only active employment types in onboarding meta', async () => {
      const res = await asA('get', '/onboarding/meta');
      expect(res.status).toBe(200);
      expect(res.body.data.employmentTypes).toBeDefined();
      const ids = res.body.data.employmentTypes.map((t: any) => t.id);
      expect(ids).toContain(activeTypeId);
      expect(ids).not.toContain(inactiveTypeId);
    });

    it('saves a candidate with an active employment type', async () => {
      const res = await asA('post', '/onboarding/candidates', {
        fullName: 'Rahul Sharma',
        email: `rahul.${SUFFIX}@candidate.test`,
        appliedPosition: 'Software Engineer',
        employmentTypeId: activeTypeId,
      });
      expect(res.status).toBe(201);
      expect(res.body.data.employmentTypeId).toBe(activeTypeId);
      expect(res.body.data.employmentTypeName).toBe('Internship Program');
      candidateId = res.body.data.id;
    });

    it('rejects assigning an inactive employment type to a new candidate', async () => {
      const res = await asA('post', '/onboarding/candidates', {
        fullName: 'Anita Verma',
        email: `anita.${SUFFIX}@candidate.test`,
        appliedPosition: 'QA Analyst',
        employmentTypeId: inactiveTypeId,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('active');
    });

    it('blocks deletion of an employment type that is in use by a candidate', async () => {
      const res = await asA('delete', `/tenant/employment-types/${activeTypeId}`);
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('referenced');
    });

    it('allows candidate update to preserve their existing employment type even if it gets deactivated', async () => {
      // Deactivate the activeTypeId
      await asA('patch', `/tenant/employment-types/${activeTypeId}/status`, { status: 'INACTIVE' });

      // Update candidate details while keeping the same employmentTypeId
      const res = await asA('put', `/onboarding/candidates/${candidateId}`, {
        fullName: 'Rahul Sharma Updated',
        email: `rahul.${SUFFIX}@candidate.test`,
        appliedPosition: 'Software Engineer',
        employmentTypeId: activeTypeId,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.fullName).toBe('Rahul Sharma Updated');
      expect(res.body.data.employmentTypeId).toBe(activeTypeId);
    });

    it('successfully deletes an employment type that is not in use', async () => {
      const unusedRes = await asA('post', '/tenant/employment-types', {
        name: 'Temporary To Delete',
      });
      const unusedId = unusedRes.body.data.id;

      const deleteRes = await asA('delete', `/tenant/employment-types/${unusedId}`);
      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const checkRes = await asA('get', `/tenant/employment-types/${unusedId}`);
      expect(checkRes.status).toBe(404);
    });
  });
});
