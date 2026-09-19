import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { randomUUID } from 'crypto';

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
  designationId?: string;
}

export interface AddBankAccountInput {
  accountHolderName: string;
  bankName: string;
  branchName?: string;
  accountNumber: string;
  bankCode?: string;
  bankCodeType?: string;
  accountType?: string;
  effectiveFrom: string;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async listEmployees(tenantId: string, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
    };

    if (search) {
      where.OR = [
        { employee_code: { contains: search, mode: 'insensitive' } },
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { work_email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.rndtechnosoft_employees.count({ where }),
      this.prisma.rndtechnosoft_employees.findMany({
        where,
        skip,
        take: limit,
        orderBy: { employee_code: 'asc' },
        include: {
          rndtechnosoft_employee_employments: {
            where: { effective_to: null },
            include: {
              rndtechnosoft_branches: true,
              rndtechnosoft_departments: true,
              rndtechnosoft_designations: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      items: items.map((emp) => ({
        id: emp.id,
        employeeCode: emp.employee_code,
        firstName: emp.first_name,
        lastName: emp.last_name,
        workEmail: emp.work_email,
        workMobile: emp.work_mobile,
        employeeStatus: emp.employee_status,
        hireDate: emp.hire_date,
        currentEmployment: emp.rndtechnosoft_employee_employments[0]
          ? {
              branch: emp.rndtechnosoft_employee_employments[0].rndtechnosoft_branches?.branch_name,
              department: emp.rndtechnosoft_employee_employments[0].rndtechnosoft_departments?.department_name,
              designation: emp.rndtechnosoft_employee_employments[0].rndtechnosoft_designations?.designation_name,
              joiningDate: emp.rndtechnosoft_employee_employments[0].joining_date,
            }
          : null,
      })),
    };
  }

  async getEmployeeById(tenantId: string, id: string) {
    const employee = await this.prisma.rndtechnosoft_employees.findFirst({
      where: {
        id,
        tenant_id: tenantId,
      },
      include: {
        rndtechnosoft_employee_employments: {
          orderBy: { effective_from: 'desc' },
          include: {
            rndtechnosoft_branches: true,
            rndtechnosoft_departments: true,
            rndtechnosoft_designations: true,
          },
        },
        rndtechnosoft_employee_bank_accounts: {
          where: { effective_to: null },
          select: {
            id: true,
            account_holder_name: true,
            bank_name: true,
            branch_name: true,
            account_number_last4: true, // Only mask/last4 exposed
            bank_code: true,
            bank_code_type: true,
            account_type: true,
            effective_from: true,
            bank_account_status: true,
          },
        },
        rndtechnosoft_employee_reporting_lines_rndtechnosoft_employee_reporting_lines_tenant_id_employee_idTorndtechnosoft_employees: {
          where: { effective_to: null },
          include: {
            rndtechnosoft_employees_rndtechnosoft_employee_reporting_lines_tenant_id_manager_employee_idTorndtechnosoft_employees: {
              select: {
                id: true,
                employee_code: true,
                first_name: true,
                last_name: true,
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found in tenant');
    }

    return employee;
  }

  async createEmployee(tenantId: string, input: CreateEmployeeInput) {
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

    return this.prisma.$transaction(async (tx) => {
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

      await tx.rndtechnosoft_employee_employments.create({
        data: {
          id: employmentId,
          tenant_id: tenantId,
          employee_id: employeeId,
          branch_id: input.branchId || null,
          department_id: input.departmentId || null,
          designation_id: input.designationId || null,
          joining_date: joiningDate,
          effective_from: joiningDate,
          employment_status: 'CONFIRMED',
        },
      });

      return employee;
    });
  }

  async addBankAccount(tenantId: string, employeeId: string, input: AddBankAccountInput) {
    await this.getEmployeeById(tenantId, employeeId);

    const last4 = input.accountNumber.slice(-4);
    // In production encrypt using KMS / vault. For schema persistence, store string representation
    const encrypted = `ENC[${input.accountNumber}]`;

    return this.prisma.$transaction(async (tx) => {
      // Close previous bank accounts
      await tx.rndtechnosoft_employee_bank_accounts.updateMany({
        where: {
          tenant_id: tenantId,
          employee_id: employeeId,
          effective_to: null,
        },
        data: {
          effective_to: new Date(input.effectiveFrom),
        },
      });

      return tx.rndtechnosoft_employee_bank_accounts.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          employee_id: employeeId,
          account_holder_name: input.accountHolderName,
          bank_name: input.bankName,
          branch_name: input.branchName || null,
          account_number_encrypted: encrypted,
          account_number_last4: last4,
          bank_code_type: input.bankCodeType || 'IFSC',
          bank_code: input.bankCode || null,
          account_type: input.accountType || 'SAVINGS',
          effective_from: new Date(input.effectiveFrom),
          bank_account_status: 'ACTIVE',
        },
      });
    });
  }
}
