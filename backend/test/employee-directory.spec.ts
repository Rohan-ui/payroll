import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter } from '@/common/filters/all-exceptions.filter';
import { PrismaService } from '@/prisma/prisma.service';
import { hashPassword, PASSWORD_ALGORITHM_SCRYPT } from '@/common/security/password.util';
import * as ExcelJS from 'exceljs';

/**
 * The People directory: search, filters, sorting and paging all happen on the
 * server against each employee's current employment and manager, filters
 * combine, the summary counts come from the same rows, and nothing from
 * another workspace is ever listed, counted or offered as a filter choice.
 */

const API = '/api/v1';
const BASE = 'nder.test';
const LOCAL = 'localhost:4000';
const PASSWORD = 'Directory-Tests-1';
const SUFFIX = randomUUID().replace(/-/g, '').slice(0, 8);

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const date = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('People directory', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const previous = { base: process.env.PLATFORM_BASE_DOMAIN };
  const tenantIds: string[] = [];
  const emails: string[] = [];
  const tenants: Record<'A' | 'B', string> = { A: '', B: '' };
  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const list = (who: string, query: Record<string, string | number> = {}) =>
    request(app.getHttpServer()).get(`${API}/employees`).query(query).set({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const get = (url: string, who: string) =>
    request(app.getHttpServer()).get(`${API}${url}`).set({ Authorization: `Bearer ${tokens[who]}`, Host: LOCAL });
  const codes = (body: { items: { employeeCode: string }[] }) => body.items.map((item) => item.employeeCode);

  async function register(key: 'A' | 'B') {
    const email = `dir-owner-${key.toLowerCase()}-${SUFFIX}@rnd.test`;
    emails.push(email);
    const r = await request(app.getHttpServer()).post(`${API}/auth/register-tenant`).set('Host', BASE)
      .send({ companyName: `Directory ${key} ${SUFFIX}`, tenantCode: `DIR${key}${SUFFIX.toUpperCase()}`, email, password: PASSWORD });
    expect(r.status).toBe(201);
    tenants[key] = r.body.activeTenant.tenantId;
    tenantIds.push(tenants[key]);
    tokens[`Owner${key}`] = r.body.token;
  }

  /** A sign-in in workspace A holding no permission at all. */
  async function outsider() {
    const email = `dir-nobody-${SUFFIX}@rnd.test`;
    emails.push(email);
    const userId = randomUUID();
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email, display_name: 'Nobody', password_hash: await hashPassword(PASSWORD), password_algorithm: PASSWORD_ALGORITHM_SCRYPT, user_status: 'ACTIVE' } });
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: randomUUID(), tenant_id: tenants.A, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    const r = await request(app.getHttpServer()).post(`${API}/auth/login`).set('Host', LOCAL).send({ email, password: PASSWORD });
    expect(r.status).toBe(200);
    tokens.Nobody = r.body.token;
  }

  async function master(tenantId: string, key: string, name: string) {
    const id = randomUUID();
    const code = `${key}_${SUFFIX}`.toUpperCase();
    if (key.startsWith('DEPT')) await prisma.rndtechnosoft_departments.create({ data: { id, tenant_id: tenantId, department_code: code, department_name: name } });
    if (key.startsWith('DESIG')) await prisma.rndtechnosoft_designations.create({ data: { id, tenant_id: tenantId, designation_code: code, designation_name: name } });
    if (key.startsWith('BR')) await prisma.rndtechnosoft_branches.create({ data: { id, tenant_id: tenantId, branch_code: code, branch_name: name } });
    if (key.startsWith('TYPE')) await prisma.rndtechnosoft_employment_types.create({ data: { id, tenant_id: tenantId, employment_type_code: code, employment_type_name: name } });
    ids[key] = id;
  }

  async function employee(
    tenantId: string,
    key: string,
    person: { code: string; first: string; last: string; status?: string; mobile?: string; email?: string },
    job?: { dept?: string; desig?: string; branch?: string; type?: string; joined: string; probationEnd?: string },
  ) {
    const id = randomUUID();
    await prisma.rndtechnosoft_employees.create({
      data: {
        id, tenant_id: tenantId, employee_code: `${person.code}-${SUFFIX}`, first_name: person.first, last_name: person.last,
        employee_status: person.status ?? 'ACTIVE', work_mobile: person.mobile ?? null, work_email: person.email ?? null,
      },
    });
    if (job) {
      // A closed earlier row in another department: only the open row may count.
      await prisma.rndtechnosoft_employee_employments.create({
        data: { id: randomUUID(), tenant_id: tenantId, employee_id: id, department_id: tenantId === tenants.A ? ids.DEPT_OLD_A : null, joining_date: date('2020-01-01'), effective_from: date('2020-01-01'), effective_to: date(job.joined), employment_status: 'CONFIRMED' },
      });
      await prisma.rndtechnosoft_employee_employments.create({
        data: {
          id: randomUUID(), tenant_id: tenantId, employee_id: id,
          department_id: job.dept ? ids[job.dept] : null, designation_id: job.desig ? ids[job.desig] : null,
          branch_id: job.branch ? ids[job.branch] : null, employment_type_id: job.type ? ids[job.type] : null,
          joining_date: date(job.joined), effective_from: date(job.joined), probation_end_date: job.probationEnd ? date(job.probationEnd) : null,
          employment_status: 'CONFIRMED',
        },
      });
    }
    ids[key] = id;
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
    await register('A');
    await register('B');
    await outsider();

    await master(tenants.A, 'DEPT_OLD_A', 'Archive Desk');
    await master(tenants.A, 'DEPT_ENG_A', 'Engineering');
    await master(tenants.A, 'DEPT_SALES_A', 'Sales');
    await master(tenants.A, 'DESIG_DEV_A', 'Developer');
    await master(tenants.A, 'BR_PUNE_A', 'Pune Office');
    await master(tenants.A, 'TYPE_FT_A', 'Full-time');
    await master(tenants.B, 'DEPT_ENG_B', 'Engineering');

    await employee(tenants.A, 'Asha', { code: 'D1', first: 'Asha', last: 'Rao', mobile: '+91 98111 22233', email: `asha-${SUFFIX}@acme.test` },
      { dept: 'DEPT_ENG_A', desig: 'DESIG_DEV_A', branch: 'BR_PUNE_A', type: 'TYPE_FT_A', joined: '2024-01-10' });
    await employee(tenants.A, 'Bala', { code: 'D2', first: 'Bala', last: 'Iyer' },
      { dept: 'DEPT_SALES_A', joined: day(-10), probationEnd: day(60) });
    await employee(tenants.A, 'Chitra', { code: 'D3', first: 'Chitra', last: 'Das', status: 'EXITED' },
      { dept: 'DEPT_ENG_A', joined: '2023-05-01' });
    await employee(tenants.A, 'Dev', { code: 'D4', first: 'Dev', last: 'Kumar', status: 'ON_NOTICE' });
    await employee(tenants.B, 'AshaB', { code: 'D1', first: 'Asha', last: 'Rao', mobile: '+91 98111 22233' },
      { dept: 'DEPT_ENG_B', joined: '2024-01-10' });

    await prisma.rndtechnosoft_employee_reporting_lines.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Bala, manager_employee_id: ids.Asha, effective_from: date(day(-10)) },
    });
    // A cancelled line is not a manager.
    await prisma.rndtechnosoft_employee_reporting_lines.create({
      data: { id: randomUUID(), tenant_id: tenants.A, employee_id: ids.Chitra, manager_employee_id: ids.Asha, effective_from: date('2023-05-01'), line_status: 'CANCELLED', cancelled_at: new Date(), cancellation_reason: 'Entered by mistake' },
    });
  });

  afterAll(async () => {
    if (prisma) {
      const userRows = await prisma.rndtechnosoft_users.findMany({ where: { email: { in: emails } }, select: { id: true } });
      const userIds = userRows.map((u) => u.id);
      const scope = { tenant_id: { in: tenantIds } };
      await prisma.rndtechnosoft_employee_reporting_lines.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employee_employments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employees.deleteMany({ where: scope });
      await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
      await prisma.rndtechnosoft_designations.deleteMany({ where: scope });
      await prisma.rndtechnosoft_branches.deleteMany({ where: scope });
      await prisma.rndtechnosoft_employment_types.deleteMany({ where: scope });
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

  it('lists only this workspace, with the current employment and manager, paged on the server', async () => {
    const all = await list('OwnerA');
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 4, page: 1, totalPages: 1, hasMore: false });
    expect(codes(all.body)).toEqual(['D1', 'D2', 'D3', 'D4'].map((c) => `${c}-${SUFFIX}`));

    const bala = all.body.items.find((item: { id: string }) => item.id === ids.Bala);
    expect(bala.currentEmployment).toMatchObject({ department: 'Sales', departmentId: ids.DEPT_SALES_A, joiningDate: `${day(-10)}T00:00:00.000Z` });
    expect(bala.manager).toEqual({ id: ids.Asha, employeeCode: `D1-${SUFFIX}`, name: 'Asha Rao' });
    const chitra = all.body.items.find((item: { id: string }) => item.id === ids.Chitra);
    expect(chitra.manager).toBeNull();
    expect(chitra.currentEmployment.department).toBe('Engineering');

    const second = await list('OwnerA', { limit: 3, page: 2 });
    expect(second.body).toMatchObject({ total: 4, totalPages: 2, hasMore: false });
    expect(codes(second.body)).toEqual([`D4-${SUFFIX}`]);
  });

  it('searches name, employee ID, email and phone, digits ignoring spaces', async () => {
    expect(codes((await list('OwnerA', { search: 'asha rao' })).body)).toEqual([`D1-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { search: `d3-${SUFFIX}` })).body)).toEqual([`D3-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { search: `asha-${SUFFIX}@acme` })).body)).toEqual([`D1-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { search: '9811122233' })).body)).toEqual([`D1-${SUFFIX}`]);
    // Wildcards are searched for literally.
    expect((await list('OwnerA', { search: '%' })).body.total).toBe(0);
  });

  it('combines filters instead of letting one replace another', async () => {
    expect(codes((await list('OwnerA', { departmentId: ids.DEPT_ENG_A })).body)).toEqual([`D1-${SUFFIX}`, `D3-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { departmentId: ids.DEPT_ENG_A, status: 'ACTIVE' })).body)).toEqual([`D1-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { departmentId: ids.DEPT_ENG_A, search: 'chitra' })).body)).toEqual([`D3-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { designationId: ids.DESIG_DEV_A, branchId: ids.BR_PUNE_A, employmentTypeId: ids.TYPE_FT_A })).body)).toEqual([`D1-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { managerId: ids.Asha })).body)).toEqual([`D2-${SUFFIX}`]);
    // A closed employment row no longer places anyone in its department.
    expect((await list('OwnerA', { departmentId: ids.DEPT_OLD_A })).body.total).toBe(0);
  });

  it('filters by joining date range and refuses an inverted one', async () => {
    expect(codes((await list('OwnerA', { joinedFrom: '2023-01-01', joinedTo: '2024-12-31' })).body)).toEqual([`D1-${SUFFIX}`, `D3-${SUFFIX}`]);
    expect(codes((await list('OwnerA', { joinedFrom: day(-30) })).body)).toEqual([`D2-${SUFFIX}`]);
    expect((await list('OwnerA', { joinedFrom: '2024-12-31', joinedTo: '2023-01-01' })).status).toBe(400);
  });

  it('sorts by the requested column, with blanks last either way', async () => {
    expect(codes((await list('OwnerA', { sortBy: 'name', sortOrder: 'desc' })).body)).toEqual(['D4', 'D3', 'D2', 'D1'].map((c) => `${c}-${SUFFIX}`));
    expect(codes((await list('OwnerA', { sortBy: 'joiningDate' })).body)).toEqual(['D3', 'D1', 'D2', 'D4'].map((c) => `${c}-${SUFFIX}`));
    expect(codes((await list('OwnerA', { sortBy: 'department' })).body)).toEqual(['D1', 'D3', 'D2', 'D4'].map((c) => `${c}-${SUFFIX}`));
    expect(codes((await list('OwnerA', { sortBy: 'department', sortOrder: 'desc' })).body)).toEqual(['D2', 'D1', 'D3', 'D4'].map((c) => `${c}-${SUFFIX}`));
    expect(codes((await list('OwnerA', { sortBy: 'status' })).body)).toEqual(['D1', 'D2', 'D3', 'D4'].map((c) => `${c}-${SUFFIX}`));
  });

  it('refuses values the API does not accept', async () => {
    expect((await list('OwnerA', { sortBy: 'e.id; DROP TABLE x' })).status).toBe(400);
    expect((await list('OwnerA', { departmentId: 'engineering' })).status).toBe(400);
    expect((await list('OwnerA', { status: "ACTIVE' OR '1'='1" })).status).toBe(400);
    expect((await list('OwnerA', { joinedFrom: '10/01/2024' })).status).toBe(400);
  });

  it('never lists, counts or offers another workspace’s records', async () => {
    // B's own department id, used from A, matches nothing.
    expect((await list('OwnerA', { departmentId: ids.DEPT_ENG_B })).body.total).toBe(0);
    expect(codes((await list('OwnerB', { search: 'asha' })).body)).toEqual([`D1-${SUFFIX}`]);
    expect((await list('OwnerB', { search: 'asha' })).body.items[0].id).toBe(ids.AshaB);

    const filters = await get('/employees/meta/filters', 'OwnerA');
    expect(filters.status).toBe(200);
    expect(filters.body.departments.map((d: { id: string }) => d.id)).not.toContain(ids.DEPT_ENG_B);
    expect(filters.body.departments.map((d: { id: string }) => d.id)).toEqual(expect.arrayContaining([ids.DEPT_ENG_A, ids.DEPT_SALES_A]));
    expect(filters.body.branches).toEqual([{ id: ids.BR_PUNE_A, branch_code: `BR_PUNE_A_${SUFFIX}`.toUpperCase(), branch_name: 'Pune Office' }]);
    expect(filters.body.statuses).toEqual(['ACTIVE', 'EXITED', 'ON_NOTICE']);
  });

  it('summarises the workspace from the same rows', async () => {
    const summary = await get('/employees/meta/summary', 'OwnerA');
    expect(summary.status).toBe(200);
    expect(summary.body).toEqual({ total: 4, active: 3, onNotice: 1, inactive: 1, onProbation: 1, recentlyJoined: 1, recentJoinerDays: 30 });
    expect((await get('/employees/meta/summary', 'OwnerB')).body).toMatchObject({ total: 1, active: 1 });
  });

  it('exports the filtered directory to Excel, without personal or bank data, and records who did', async () => {
    const exported = await request(app.getHttpServer()).get(`${API}/employees/export`).query({ departmentId: ids.DEPT_ENG_A, sortBy: 'name' })
      .set({ Authorization: `Bearer ${tokens.OwnerA}`, Host: LOCAL })
      .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); });
    expect(exported.status).toBe(200);
    expect(exported.headers['content-type']).toContain('spreadsheetml');
    expect(exported.headers['content-disposition']).toMatch(/attachment; filename\*=UTF-8''employees-\d{4}-\d{2}-\d{2}\.xlsx/);

    const book = new ExcelJS.Workbook();
    await book.xlsx.load(new Uint8Array(exported.body as Buffer).buffer);
    const sheet = book.getWorksheet('Employees')!;
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    expect(header).toEqual(['Employee ID', 'First name', 'Middle name', 'Last name', 'Work email', 'Work phone', 'Department', 'Designation', 'Reporting manager', 'Employment type', 'Joining date', 'Status', 'Work location']);
    const codesOut = [2, 3].map((r) => sheet.getRow(r).getCell(1).value);
    expect(codesOut).toEqual([`D1-${SUFFIX}`, `D3-${SUFFIX}`]);
    expect(sheet.rowCount).toBe(3);
    expect(sheet.getRow(2).getCell(6).value).toBe('+91 98111 22233');
    expect(sheet.getRow(3).getCell(12).value).toBe('EXITED');

    const audit = await prisma.rndtechnosoft_audit_logs.findFirst({ where: { tenant_id: tenants.A, action_code: 'EMPLOYEE_DIRECTORY_EXPORTED' } });
    expect(audit?.metadata).toEqual({ rows: 2, filters: { departmentId: ids.DEPT_ENG_A, sortBy: 'name', sortOrder: 'asc' } });

    // Another workspace's filter matches nothing; the permission is required.
    const foreign = await request(app.getHttpServer()).get(`${API}/employees/export`).query({ departmentId: ids.DEPT_ENG_B }).set({ Authorization: `Bearer ${tokens.OwnerA}`, Host: LOCAL })
      .buffer(true).parse((res, done) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => done(null, Buffer.concat(chunks))); });
    const empty = new ExcelJS.Workbook();
    await empty.xlsx.load(new Uint8Array(foreign.body as Buffer).buffer);
    expect(empty.getWorksheet('Employees')!.rowCount).toBe(1);
    expect((await get('/employees/export', 'Nobody')).status).toBe(403);
  });

  it('needs people.view for the directory, its summary and its filters', async () => {
    expect((await list('Nobody')).status).toBe(403);
    expect((await get('/employees/meta/summary', 'Nobody')).status).toBe(403);
    expect((await get('/employees/meta/filters', 'Nobody')).status).toBe(403);
  });
});
