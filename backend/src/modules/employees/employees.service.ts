import { sealAccountNumber } from '@/common/security/bank-account.util';
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { randomUUID } from 'crypto';
import type { EmployeeSortField, ListEmployeesQueryDto } from './dto/list-employees-query.dto';

export type EmployeeListQuery = Partial<ListEmployeesQueryDto>;

/** Rows in one export; beyond this the filters must narrow it. */
const MAX_EXPORT_ROWS = 10_000;

/** "Recently joined" on the People page: joined within this many days up to today. */
const RECENT_JOINER_DAYS = 30;

/**
 * Each employee with their current employment (the row in effect today, or for
 * someone not yet started the row they start with) and current primary manager.
 */
const DIRECTORY_FROM = Prisma.sql`
  FROM rndtechnosoft_employees e
  LEFT JOIN LATERAL (
    SELECT ee.joining_date, ee.probation_end_date, ee.department_id, ee.designation_id, ee.branch_id, ee.employment_type_id
    FROM rndtechnosoft_employee_employments ee
    WHERE ee.tenant_id = e.tenant_id AND ee.employee_id = e.id AND (ee.effective_to IS NULL OR ee.effective_to >= CURRENT_DATE)
    ORDER BY (ee.effective_from <= CURRENT_DATE) DESC, ee.effective_from DESC
    LIMIT 1
  ) cur ON TRUE
  LEFT JOIN rndtechnosoft_departments d ON d.tenant_id = e.tenant_id AND d.id = cur.department_id
  LEFT JOIN rndtechnosoft_designations g ON g.tenant_id = e.tenant_id AND g.id = cur.designation_id
  LEFT JOIN rndtechnosoft_branches b ON b.tenant_id = e.tenant_id AND b.id = cur.branch_id
  LEFT JOIN rndtechnosoft_employment_types t ON t.tenant_id = e.tenant_id AND t.id = cur.employment_type_id
  LEFT JOIN LATERAL (
    SELECT rl.manager_employee_id
    FROM rndtechnosoft_employee_reporting_lines rl
    WHERE rl.tenant_id = e.tenant_id AND rl.employee_id = e.id
      AND rl.relationship_type = 'PRIMARY' AND rl.line_status = 'ACTIVE'
      AND rl.effective_from <= CURRENT_DATE AND (rl.effective_to IS NULL OR rl.effective_to >= CURRENT_DATE)
    ORDER BY rl.effective_from DESC
    LIMIT 1
  ) mgr ON TRUE
  LEFT JOIN rndtechnosoft_employees m ON m.tenant_id = e.tenant_id AND m.id = mgr.manager_employee_id`;

/** Fixed column expressions per sort key; the request only ever picks a key, never SQL. */
const SORT_COLUMNS: Record<EmployeeSortField, string[]> = {
  name: ['lower(e.first_name)', "lower(coalesce(e.last_name, ''))"],
  code: ['e.employee_code'],
  joiningDate: ['cur.joining_date'],
  department: ['lower(d.department_name)'],
  designation: ['lower(g.designation_name)'],
  status: ['e.employee_status'],
};

interface DirectoryRow {
  id: string;
  employee_code: string;
  first_name: string;
  middle_name: string | null;
  last_name: string | null;
  work_email: string | null;
  work_mobile: string | null;
  employee_status: string;
  hire_date: Date | null;
  joining_date: Date | null;
  probation_end_date: Date | null;
  department_id: string | null;
  department_name: string | null;
  designation_id: string | null;
  designation_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  employment_type_id: string | null;
  employment_type_name: string | null;
  manager_id: string | null;
  manager_code: string | null;
  manager_first_name: string | null;
  manager_last_name: string | null;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  middleName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  workMobile?: string;
  dateOfBirth?: string;
  genderCode?: string;
  hireDate?: string;
  joiningDate: string;
  branchId?: string;
  departmentId?: string;
  departmentName?: string;
  designationId?: string;
  designationName?: string;
  bankDetails?: {
    bankName: string;
    branchName?: string;
    accountNumber: string;
    ifsc: string;
    accountHolderName?: string;
  };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /**
   * The People directory: every filter, the sort and the page are applied in
   * the database against each employee's current employment (the open row)
   * and current primary manager, so nothing is filtered in the browser.
   */
  async listEmployees(tenantId: string, query: EmployeeListQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [total, rows] = await Promise.all([this.directoryCount(tenantId, query), this.directoryRows(tenantId, query, limit, (page - 1) * limit)]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasMore: (page - 1) * limit + rows.length < total,
      items: rows.map((row) => ({
        id: row.id,
        employeeCode: row.employee_code,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        workEmail: row.work_email,
        workMobile: row.work_mobile,
        employeeStatus: row.employee_status,
        hireDate: row.hire_date,
        currentEmployment: row.joining_date
          ? {
              branch: row.branch_name,
              branchId: row.branch_id,
              department: row.department_name,
              departmentId: row.department_id,
              designation: row.designation_name,
              designationId: row.designation_id,
              employmentType: row.employment_type_name,
              employmentTypeId: row.employment_type_id,
              joiningDate: row.joining_date,
              probationEndDate: row.probation_end_date,
            }
          : null,
        manager: row.manager_id
          ? { id: row.manager_id, employeeCode: row.manager_code, name: [row.manager_first_name, row.manager_last_name].filter(Boolean).join(' ') }
          : null,
      })),
    };
  }

  /**
   * The directory as a spreadsheet, with exactly the filters and order on
   * screen. Work contact details and job only: no personal, pay or bank data.
   */
  async exportDirectory(tenantId: string, query: EmployeeListQuery, actor: AuthenticatedTenantUser) {
    const total = await this.directoryCount(tenantId, query);
    if (total > MAX_EXPORT_ROWS) {
      throw new BadRequestException(`That is ${total} employees; an export holds at most ${MAX_EXPORT_ROWS}. Narrow the filters and export in parts.`);
    }
    const rows = await this.directoryRows(tenantId, query, MAX_EXPORT_ROWS, 0);

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Employee ID', key: 'code', width: 16 },
      { header: 'First name', key: 'first', width: 18 },
      { header: 'Middle name', key: 'middle', width: 16 },
      { header: 'Last name', key: 'last', width: 18 },
      { header: 'Work email', key: 'email', width: 30 },
      { header: 'Work phone', key: 'phone', width: 18 },
      { header: 'Department', key: 'department', width: 22 },
      { header: 'Designation', key: 'designation', width: 24 },
      { header: 'Reporting manager', key: 'manager', width: 26 },
      { header: 'Employment type', key: 'type', width: 18 },
      { header: 'Joining date', key: 'joined', width: 14, style: { numFmt: 'dd-mmm-yyyy' } },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Work location', key: 'location', width: 20 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow({
        code: row.employee_code,
        first: row.first_name,
        middle: row.middle_name,
        last: row.last_name,
        email: row.work_email,
        phone: row.work_mobile,
        department: row.department_name,
        designation: row.designation_name,
        manager: row.manager_id ? `${[row.manager_first_name, row.manager_last_name].filter(Boolean).join(' ')} (${row.manager_code})` : null,
        type: row.employment_type_name,
        joined: row.joining_date,
        status: row.employee_status,
        location: row.branch_name,
      });
    }
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    // A bulk read of personal data is recorded: who exported, how many, with which filters.
    const { page: _page, limit: _limit, ...filters } = query;
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'EMPLOYEE_DIRECTORY_EXPORTED', entityType: 'EMPLOYEE_DIRECTORY', metadata: { rows: rows.length, filters },
    });
    return buffer;
  }

  /** Headline counts for the People page, from the same current-employment rows the directory uses. */
  async directorySummary(tenantId: string) {
    const [row] = await this.prisma.$queryRaw<{ total: number; active: number; on_notice: number; inactive: number; on_probation: number; recently_joined: number }[]>`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE e.employee_status IN ('ACTIVE', 'ON_NOTICE'))::int AS active,
             COUNT(*) FILTER (WHERE e.employee_status = 'ON_NOTICE')::int AS on_notice,
             COUNT(*) FILTER (WHERE e.employee_status NOT IN ('ACTIVE', 'ON_NOTICE'))::int AS inactive,
             COUNT(*) FILTER (WHERE e.employee_status IN ('ACTIVE', 'ON_NOTICE') AND cur.probation_end_date >= CURRENT_DATE)::int AS on_probation,
             COUNT(*) FILTER (WHERE cur.joining_date > CURRENT_DATE - ${RECENT_JOINER_DAYS}::int AND cur.joining_date <= CURRENT_DATE)::int AS recently_joined
      ${DIRECTORY_FROM}
      WHERE e.tenant_id = ${tenantId}::uuid`;
    return {
      total: row.total,
      active: row.active,
      onNotice: row.on_notice,
      inactive: row.inactive,
      onProbation: row.on_probation,
      recentlyJoined: row.recently_joined,
      recentJoinerDays: RECENT_JOINER_DAYS,
    };
  }

  /** The choices the directory's filters offer: this workspace's own records only. */
  async directoryFilters(tenantId: string) {
    const [departments, designations, employmentTypes, branches, statuses] = await Promise.all([
      this.getDepartments(tenantId),
      this.getDesignations(tenantId),
      this.getEmploymentTypes(tenantId),
      this.prisma.rndtechnosoft_branches.findMany({
        where: { tenant_id: tenantId, branch_status: 'ACTIVE' },
        select: { id: true, branch_code: true, branch_name: true },
        orderBy: { branch_name: 'asc' },
      }),
      this.prisma.rndtechnosoft_employees.groupBy({
        by: ['employee_status'],
        where: { tenant_id: tenantId },
        orderBy: { employee_status: 'asc' },
      }),
    ]);
    return { departments, designations, employmentTypes, branches, statuses: statuses.map((s) => s.employee_status) };
  }

  private async directoryCount(tenantId: string, query: EmployeeListQuery) {
    const rows = await this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total ${DIRECTORY_FROM} ${this.directoryWhere(tenantId, query)}`;
    return rows[0]?.total ?? 0;
  }

  private async directoryRows(tenantId: string, query: EmployeeListQuery, limit: number, offset: number) {
    const direction = Prisma.raw(query.sortOrder === 'desc' ? 'DESC' : 'ASC');
    const sortColumns = SORT_COLUMNS[query.sortBy ?? 'code'].map((column) => Prisma.sql`${Prisma.raw(column)} ${direction} NULLS LAST`);
    return this.prisma.$queryRaw<DirectoryRow[]>`
      SELECT e.id, e.employee_code, e.first_name, e.middle_name, e.last_name, e.work_email, e.work_mobile,
             e.employee_status, e.hire_date,
             cur.joining_date, cur.probation_end_date,
             d.id AS department_id, d.department_name, g.id AS designation_id, g.designation_name,
             b.id AS branch_id, b.branch_name, t.id AS employment_type_id, t.employment_type_name,
             m.id AS manager_id, m.employee_code AS manager_code, m.first_name AS manager_first_name, m.last_name AS manager_last_name
      ${DIRECTORY_FROM} ${this.directoryWhere(tenantId, query)}
      ORDER BY ${Prisma.join(sortColumns)}, e.employee_code ASC, e.id ASC
      LIMIT ${limit} OFFSET ${offset}`;
  }

  private directoryWhere(tenantId: string, query: EmployeeListQuery): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`e.tenant_id = ${tenantId}::uuid`];

    const search = query.search?.trim();
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const digits = search.replace(/\D/g, '');
      conditions.push(Prisma.sql`(
        concat_ws(' ', e.first_name, e.middle_name, e.last_name) ILIKE ${pattern}
        OR concat_ws(' ', e.first_name, e.last_name) ILIKE ${pattern}
        OR e.employee_code ILIKE ${pattern}
        OR e.work_email ILIKE ${pattern}
        OR e.personal_email ILIKE ${pattern}
        OR e.work_mobile ILIKE ${pattern}
        ${digits.length >= 3 ? Prisma.sql`OR regexp_replace(coalesce(e.work_mobile, ''), '\\D', '', 'g') LIKE ${`%${digits}%`}` : Prisma.empty}
      )`);
    }
    if (query.departmentId) conditions.push(Prisma.sql`cur.department_id = ${query.departmentId}::uuid`);
    if (query.designationId) conditions.push(Prisma.sql`cur.designation_id = ${query.designationId}::uuid`);
    if (query.employmentTypeId) conditions.push(Prisma.sql`cur.employment_type_id = ${query.employmentTypeId}::uuid`);
    if (query.branchId) conditions.push(Prisma.sql`cur.branch_id = ${query.branchId}::uuid`);
    if (query.managerId) conditions.push(Prisma.sql`mgr.manager_employee_id = ${query.managerId}::uuid`);
    if (query.status) conditions.push(Prisma.sql`e.employee_status = ${query.status}`);
    if (query.joinedFrom && query.joinedTo && query.joinedFrom > query.joinedTo) {
      throw new BadRequestException('"Joined from" must be on or before "Joined to".');
    }
    if (query.joinedFrom) conditions.push(Prisma.sql`cur.joining_date >= ${query.joinedFrom}::date`);
    if (query.joinedTo) conditions.push(Prisma.sql`cur.joining_date <= ${query.joinedTo}::date`);

    return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
  }

  async createEmployee(tenantId: string, input: CreateEmployeeInput, actor: AuthenticatedTenantUser) {
    const existing = await this.prisma.rndtechnosoft_employees.findFirst({
      where: {
        tenant_id: tenantId,
        employee_code: input.employeeCode,
      },
    });

    if (existing) {
      throw new ConflictException(`Employee code '${input.employeeCode}' already exists in this tenant`);
    }

    const employeeId = randomUUID();
    const employmentId = randomUUID();
    const joiningDate = new Date(input.joiningDate);
    const hireDate = input.hireDate ? new Date(input.hireDate) : joiningDate;

    const created = await this.prisma.$transaction(async (tx) => {
      const employee = await tx.rndtechnosoft_employees.create({
        data: {
          id: employeeId,
          tenant_id: tenantId,
          employee_code: input.employeeCode,
          first_name: input.firstName,
          middle_name: input.middleName || null,
          last_name: input.lastName || null,
          work_email: input.workEmail || null,
          personal_email: input.personalEmail || null,
          work_mobile: input.workMobile || null,
          date_of_birth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
          gender_code: input.genderCode || null,
          employee_status: 'ACTIVE',
          hire_date: hireDate,
        },
      });

      // Dynamic Department resolution or auto-creation
      let departmentId = input.departmentId || null;
      if (!departmentId && input.departmentName?.trim()) {
        const deptName = input.departmentName.trim();
        let dept = await tx.rndtechnosoft_departments.findFirst({
          where: {
            tenant_id: tenantId,
            department_name: { equals: deptName, mode: 'insensitive' },
          },
        });
        if (!dept) {
          const deptCode = deptName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32) || `DEPT_${Date.now()}`;
          dept = await tx.rndtechnosoft_departments.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              department_name: deptName,
              department_code: deptCode,
              department_status: 'ACTIVE',
            },
          });
        }
        departmentId = dept.id;
      }

      // Dynamic Designation resolution or auto-creation
      let designationId = input.designationId || null;
      if (!designationId && input.designationName?.trim()) {
        const desigName = input.designationName.trim();
        let desig = await tx.rndtechnosoft_designations.findFirst({
          where: {
            tenant_id: tenantId,
            designation_name: { equals: desigName, mode: 'insensitive' },
          },
        });
        if (!desig) {
          const desigCode = desigName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 32) || `DESIG_${Date.now()}`;
          desig = await tx.rndtechnosoft_designations.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              designation_name: desigName,
              designation_code: desigCode,
              designation_status: 'ACTIVE',
            },
          });
        }
        designationId = desig.id;
      }

      await tx.rndtechnosoft_employee_employments.create({
        data: {
          id: employmentId,
          tenant_id: tenantId,
          employee_id: employeeId,
          branch_id: input.branchId || null,
          department_id: departmentId,
          designation_id: designationId,
          joining_date: joiningDate,
          effective_from: joiningDate,
          employment_status: 'CONFIRMED',
        },
      });

      // Automatically create bank account if details provided
      if (input.bankDetails && input.bankDetails.accountNumber && input.bankDetails.ifsc) {
        await tx.rndtechnosoft_employee_bank_accounts.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            employee_id: employeeId,
            account_holder_name:
              input.bankDetails.accountHolderName ||
              `${input.firstName} ${input.lastName || ''}`.trim(),
            bank_name: input.bankDetails.bankName,
            branch_name: input.bankDetails.branchName || null,
            ...sealAccountNumber(input.bankDetails.accountNumber),
            bank_code_type: 'IFSC',
            bank_code: input.bankDetails.ifsc.toUpperCase(),
            account_type: 'SAVINGS',
            effective_from: joiningDate,
            bank_account_status: 'ACTIVE',
          },
        });
      }

      return employee;
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'EMPLOYEE_CREATED', entityType: 'EMPLOYEE', entityId: created.id, metadata: { employee_code: created.employee_code } });
    return created;
  }

  async getDepartments(tenantId: string) {
    return this.prisma.rndtechnosoft_departments.findMany({
      where: { tenant_id: tenantId, department_status: 'ACTIVE' },
      select: { id: true, department_code: true, department_name: true },
      orderBy: { department_name: 'asc' },
    });
  }

  async getDesignations(tenantId: string) {
    return this.prisma.rndtechnosoft_designations.findMany({
      where: { tenant_id: tenantId, designation_status: 'ACTIVE' },
      select: { id: true, designation_code: true, designation_name: true },
      orderBy: { designation_name: 'asc' },
    });
  }

  async getEmploymentTypes(tenantId: string) {
    return this.prisma.rndtechnosoft_employment_types.findMany({
      where: { tenant_id: tenantId, employment_type_status: 'ACTIVE' },
      select: { id: true, employment_type_code: true, employment_type_name: true, description: true },
      orderBy: { employment_type_name: 'asc' },
    });
  }

  async verifyIfsc(code: string) {
    try {
      const ifscClean = code.trim().toUpperCase();
      const res = await fetch(`https://ifsc.razorpay.com/${ifscClean}`);
      if (!res.ok) {
        return { valid: false, message: 'Invalid IFSC code' };
      }
      const data = await res.json();
      return {
        valid: true,
        bank: data.BANK,
        branch: data.BRANCH,
        address: data.ADDRESS,
        city: data.CITY,
        state: data.STATE,
        ifsc: data.IFSC,
        micr: data.MICR,
      };
    } catch {
      return { valid: false, message: 'IFSC verification service unreachable' };
    }
  }
}
