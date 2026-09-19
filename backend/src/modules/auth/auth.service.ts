import { Injectable, UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';

export interface RegisterUserInput {
  email: string;
  password?: string;
  displayName: string;
  mobileNumber?: string;
}

export interface RegisterTenantInput {
  companyName: string;
  tenantCode: string;
  displayName?: string;
  email: string;
  password?: string;
  adminName?: string;
  countryCode?: string;
  currency?: string;
}

export interface LoginInput {
  email: string;
  password?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashPassword(password: string): string {
    return createHash('sha256').update(password).digest('hex');
  }

  async registerUser(input: RegisterUserInput) {
    const existing = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    const userId = randomUUID();
    const user = await this.prisma.rndtechnosoft_users.create({
      data: {
        id: userId,
        email: input.email.toLowerCase(),
        password_hash: input.password ? this.hashPassword(input.password) : null,
        display_name: input.displayName,
        mobile_number: input.mobileNumber || null,
        user_status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        display_name: true,
        mobile_number: true,
        user_status: true,
        created_at: true,
      },
    });

    return user;
  }

  async registerTenant(input: RegisterTenantInput) {
    const code = input.tenantCode.toUpperCase().trim();
    const existingTenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { tenant_code: code },
    });

    if (existingTenant) {
      throw new ConflictException(`Company with code '${code}' already exists`);
    }

    let user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    const tenantId = randomUUID();
    const userId = user ? user.id : randomUUID();

    return this.prisma.$transaction(async (tx) => {
      if (!user) {
        user = await tx.rndtechnosoft_users.create({
          data: {
            id: userId,
            email: input.email.toLowerCase(),
            password_hash: input.password ? this.hashPassword(input.password) : null,
            display_name: input.adminName || input.email.split('@')[0],
            user_status: 'ACTIVE',
          },
        });
      }

      const tenant = await tx.rndtechnosoft_tenants.create({
        data: {
          id: tenantId,
          tenant_code: code,
          legal_name: input.companyName,
          display_name: input.displayName || input.companyName,
          country_code: input.countryCode || 'IN',
          default_currency_code: input.currency || 'INR',
          tenant_status: 'ACTIVE',
        },
      });

      // Settings
      await tx.rndtechnosoft_tenant_settings.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          settings: {
            payroll: {
              payFrequency: 'MONTHLY',
              currency: 'INR',
              workingDaysPerMonth: 30,
            },
            compliance: {
              epfWageCeiling: 15000,
              esicThreshold: 21000,
            },
            timezone: 'Asia/Kolkata',
          },
        },
      });

      // Role: ADMIN
      const roleId = randomUUID();
      const adminRole = await tx.rndtechnosoft_roles.create({
        data: {
          id: roleId,
          tenant_id: tenantId,
          role_code: 'ADMIN',
          role_name: 'Administrator',
          is_system_role: true,
          role_status: 'ACTIVE',
        },
      });

      // Member
      const memberId = randomUUID();
      await tx.rndtechnosoft_tenant_members.create({
        data: {
          id: memberId,
          tenant_id: tenantId,
          user_id: user.id,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });

      // Member Role
      await tx.rndtechnosoft_tenant_member_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          tenant_member_id: memberId,
          role_id: adminRole.id,
        },
      });

      return this.login({ email: input.email, password: input.password });
    });
  }

  async login(input: LoginInput) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: input.email.toLowerCase() },
      include: {
        rndtechnosoft_tenant_members: {
          where: { membership_status: 'ACTIVE' },
          include: {
            rndtechnosoft_tenants: true,
            rndtechnosoft_tenant_member_roles: {
              include: {
                rndtechnosoft_roles: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (input.password && user.password_hash) {
      const hashed = this.hashPassword(input.password);
      if (hashed !== user.password_hash) {
        throw new UnauthorizedException('Invalid email or password');
      }
    }

    // Touch last_login_at
    await this.prisma.rndtechnosoft_users.update({
      where: { id: user.id },
      data: { last_login_at: new Date() },
    });

    return {
      token: `demo-jwt-${user.id}-${Date.now()}`,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
      tenants: user.rndtechnosoft_tenant_members.map((member) => ({
        tenantMemberId: member.id,
        tenantId: member.tenant_id,
        tenantCode: member.rndtechnosoft_tenants.tenant_code,
        legalName: member.rndtechnosoft_tenants.legal_name,
        displayName: member.rndtechnosoft_tenants.display_name,
        roles: member.rndtechnosoft_tenant_member_roles.map((r) => r.rndtechnosoft_roles.role_code),
      })),
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
      include: {
        rndtechnosoft_tenant_members: {
          where: { membership_status: 'ACTIVE' },
          include: {
            rndtechnosoft_tenants: true,
            rndtechnosoft_tenant_member_roles: {
              include: {
                rndtechnosoft_roles: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
      },
      tenants: user.rndtechnosoft_tenant_members.map((member) => ({
        tenantMemberId: member.id,
        tenantId: member.tenant_id,
        tenantCode: member.rndtechnosoft_tenants.tenant_code,
        legalName: member.rndtechnosoft_tenants.legal_name,
        displayName: member.rndtechnosoft_tenants.display_name,
        roles: member.rndtechnosoft_tenant_member_roles.map((r) => r.rndtechnosoft_roles.role_code),
      })),
    };
  }

  async addMemberToTenant(tenantId: string, userId: string, roleCode = 'EMPLOYEE') {
    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const user = await this.prisma.rndtechnosoft_users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.prisma.rndtechnosoft_tenant_members.findUnique({
      where: {
        tenant_id_user_id: {
          tenant_id: tenantId,
          user_id: userId,
        },
      },
    });

    if (existingMember) {
      return existingMember;
    }

    return this.prisma.$transaction(async (tx) => {
      const memberId = randomUUID();
      const member = await tx.rndtechnosoft_tenant_members.create({
        data: {
          id: memberId,
          tenant_id: tenantId,
          user_id: userId,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });

      // Find or create role
      let role = await tx.rndtechnosoft_roles.findFirst({
        where: {
          tenant_id: tenantId,
          role_code: roleCode,
        },
      });

      if (!role) {
        role = await tx.rndtechnosoft_roles.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            role_code: roleCode,
            role_name: roleCode,
            is_system_role: true,
            role_status: 'ACTIVE',
          },
        });
      }

      await tx.rndtechnosoft_tenant_member_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          tenant_member_id: memberId,
          role_id: role.id,
        },
      });

      return member;
    });
  }

  /**
   * Seeds demo Indian company, 5 realistic employees, salary structures,
   * bank accounts, and returns a logged-in admin session.
   */
  async seedDemoData() {
    const adminEmail = 'admin@rndtechnosoft.com';
    const employeeEmail = 'employee@rndtechnosoft.com';
    const demoTenantCode = 'ACME_IN';

    let tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { tenant_code: demoTenantCode },
    });

    let adminUser = await this.prisma.rndtechnosoft_users.findUnique({
      where: { email: adminEmail },
    });

    if (tenant && adminUser) {
      // Already seeded, return login directly
      return this.login({ email: adminEmail, password: 'password123' });
    }

    const tenantId = tenant ? tenant.id : randomUUID();
    const adminUserId = adminUser ? adminUser.id : randomUUID();
    const empUserId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      if (!tenant) {
        tenant = await tx.rndtechnosoft_tenants.create({
          data: {
            id: tenantId,
            tenant_code: demoTenantCode,
            legal_name: 'Acme Technologies India Pvt Ltd',
            display_name: 'Acme Technologies India',
            country_code: 'IN',
            default_currency_code: 'INR',
            tenant_status: 'ACTIVE',
          },
        });

        await tx.rndtechnosoft_tenant_settings.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            settings: {
              payroll: {
                payFrequency: 'MONTHLY',
                currency: 'INR',
                workingDaysPerMonth: 31,
              },
              compliance: {
                epfWageCeiling: 15000,
                esicThreshold: 21000,
                ptState: 'Maharashtra',
              },
              timezone: 'Asia/Kolkata',
            },
          },
        });
      }

      // 2. Create Users
      if (!adminUser) {
        adminUser = await tx.rndtechnosoft_users.create({
          data: {
            id: adminUserId,
            email: adminEmail,
            password_hash: this.hashPassword('password123'),
            display_name: 'Rohan Mehta (Admin)',
            mobile_number: '+919876543210',
            user_status: 'ACTIVE',
          },
        });
      }

      const existingEmpUser = await tx.rndtechnosoft_users.findUnique({
        where: { email: employeeEmail },
      });
      if (!existingEmpUser) {
        await tx.rndtechnosoft_users.create({
          data: {
            id: empUserId,
            email: employeeEmail,
            password_hash: this.hashPassword('password123'),
            display_name: 'Rajesh Sharma (Employee)',
            mobile_number: '+919876543211',
            user_status: 'ACTIVE',
          },
        });
      }

      // 3. Roles: ADMIN, HR_ACCOUNTANT, EMPLOYEE
      const rolesToCreate = [
        { code: 'ADMIN', name: 'Company Administrator' },
        { code: 'HR_ACCOUNTANT', name: 'HR & Accountant' },
        { code: 'EMPLOYEE', name: 'Staff Employee' },
      ];

      const roleMap: Record<string, string> = {};
      for (const r of rolesToCreate) {
        let existingRole = await tx.rndtechnosoft_roles.findFirst({
          where: { tenant_id: tenantId, role_code: r.code },
        });
        if (!existingRole) {
          existingRole = await tx.rndtechnosoft_roles.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              role_code: r.code,
              role_name: r.name,
              is_system_role: true,
              role_status: 'ACTIVE',
            },
          });
        }
        roleMap[r.code] = existingRole.id;
      }

      // 4. Admin Membership
      const existingAdminMember = await tx.rndtechnosoft_tenant_members.findFirst({
        where: { tenant_id: tenantId, user_id: adminUserId },
      });
      if (!existingAdminMember) {
        const adminMemberId = randomUUID();
        await tx.rndtechnosoft_tenant_members.create({
          data: {
            id: adminMemberId,
            tenant_id: tenantId,
            user_id: adminUserId,
            membership_status: 'ACTIVE',
            joined_at: new Date(),
          },
        });
        await tx.rndtechnosoft_tenant_member_roles.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            tenant_member_id: adminMemberId,
            role_id: roleMap['ADMIN'],
          },
        });
      }

      // 5. Salary Components
      const salaryComponents = [
        { code: 'BASIC', name: 'Basic Salary', category: 'EARNING', type: 'FIXED', order: 1 },
        { code: 'HRA', name: 'House Rent Allowance', category: 'EARNING', type: 'FIXED', order: 2 },
        { code: 'SPECIAL_ALLOWANCE', name: 'Special Allowance', category: 'EARNING', type: 'FIXED', order: 3 },
        { code: 'EPF_EMPLOYEE', name: 'Provident Fund (Employee)', category: 'STATUTORY', type: 'SYSTEM_CALCULATED', order: 4 },
        { code: 'ESIC_EMPLOYEE', name: 'Health Insurance (ESIC)', category: 'STATUTORY', type: 'SYSTEM_CALCULATED', order: 5 },
        { code: 'PT', name: 'Professional Tax', category: 'STATUTORY', type: 'SYSTEM_CALCULATED', order: 6 },
        { code: 'TDS', name: 'Income Tax (TDS Sec 192)', category: 'DEDUCTION', type: 'SYSTEM_CALCULATED', order: 7 },
      ];

      for (const comp of salaryComponents) {
        const existing = await tx.rndtechnosoft_salary_components.findFirst({
          where: { tenant_id: tenantId, component_code: comp.code },
        });
        if (!existing) {
          await tx.rndtechnosoft_salary_components.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              component_code: comp.code,
              component_name: comp.name,
              component_category: comp.category,
              calculation_type: comp.type,
              is_taxable: comp.category === 'EARNING',
              is_recurring: true,
              is_variable: false,
              display_order: comp.order,
              component_status: 'ACTIVE',
            },
          });
        }
      }

      // 6. Branch & Departments
      let branch = await tx.rndtechnosoft_branches.findFirst({
        where: { tenant_id: tenantId, branch_code: 'HQ_MUMBAI' },
      });
      if (!branch) {
        branch = await tx.rndtechnosoft_branches.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            branch_code: 'HQ_MUMBAI',
            branch_name: 'Mumbai Head Office',
            state_code: 'MH',
            country_code: 'IN',
            branch_status: 'ACTIVE',
          },
        });
      }

      const departments = ['Engineering', 'Operations', 'Accounts', 'Human Resources', 'Production'];
      const deptMap: Record<string, string> = {};
      for (const d of departments) {
        const code = d.toUpperCase().replace(/\s+/g, '_');
        let dept = await tx.rndtechnosoft_departments.findFirst({
          where: { tenant_id: tenantId, department_code: code },
        });
        if (!dept) {
          dept = await tx.rndtechnosoft_departments.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              department_code: code,
              department_name: d,
              department_status: 'ACTIVE',
            },
          });
        }
        deptMap[d] = dept.id;
      }

      // 7. 5 Seed Employees
      const sampleEmployees = [
        {
          code: 'EMP001',
          first: 'Rajesh',
          last: 'Sharma',
          email: 'rajesh.sharma@acme.com',
          dept: 'Operations',
          joining: '2022-04-01',
          bank: 'HDFC Bank',
          acc: '50100456789123',
          ifsc: 'HDFC0000240',
        },
        {
          code: 'EMP002',
          first: 'Sunita',
          last: 'Patel',
          email: 'sunita.patel@acme.com',
          dept: 'Accounts',
          joining: '2023-01-15',
          bank: 'ICICI Bank',
          acc: '000105001234',
          ifsc: 'ICIC0000001',
        },
        {
          code: 'EMP003',
          first: 'Amit',
          last: 'Verma',
          email: 'amit.verma@acme.com',
          dept: 'Engineering',
          joining: '2021-08-10',
          bank: 'State Bank of India',
          acc: '20345678901',
          ifsc: 'SBIN0001234',
        },
        {
          code: 'EMP004',
          first: 'Priya',
          last: 'Nair',
          email: 'priya.nair@acme.com',
          dept: 'Human Resources',
          joining: '2024-02-01',
          bank: 'Axis Bank',
          acc: '915010012345678',
          ifsc: 'UTIB0000004',
        },
        {
          code: 'EMP005',
          first: 'Ramesh',
          last: 'Solanki',
          email: 'ramesh.solanki@acme.com',
          dept: 'Production',
          joining: '2023-06-01',
          bank: 'Bank of Baroda',
          acc: '12345678901234',
          ifsc: 'BARB0VADODA',
        },
      ];

      for (const empData of sampleEmployees) {
        let emp = await tx.rndtechnosoft_employees.findFirst({
          where: { tenant_id: tenantId, employee_code: empData.code },
        });

        if (!emp) {
          const empId = randomUUID();
          emp = await tx.rndtechnosoft_employees.create({
            data: {
              id: empId,
              tenant_id: tenantId,
              employee_code: empData.code,
              first_name: empData.first,
              last_name: empData.last,
              work_email: empData.email,
              hire_date: new Date(empData.joining),
              employee_status: 'ACTIVE',
            },
          });

          // Employment
          await tx.rndtechnosoft_employee_employments.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: empId,
              branch_id: branch.id,
              department_id: deptMap[empData.dept],
              joining_date: new Date(empData.joining),
              effective_from: new Date(empData.joining),
              employment_status: 'ACTIVE',
            },
          });

          // Bank Account
          await tx.rndtechnosoft_employee_bank_accounts.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              employee_id: empId,
              account_holder_name: `${empData.first} ${empData.last}`,
              bank_name: empData.bank,
              account_number_encrypted: empData.acc,
              account_number_last4: empData.acc.slice(-4),
              bank_code: empData.ifsc,
              bank_code_type: 'IFSC',
              effective_from: new Date(empData.joining),
              bank_account_status: 'ACTIVE',
            },
          });
        }
      }

      // 8. October 2026 Payroll Period
      const existingPeriod = await tx.rndtechnosoft_payroll_periods.findFirst({
        where: { tenant_id: tenantId, period_code: '2026-10' },
      });
      if (!existingPeriod) {
        await tx.rndtechnosoft_payroll_periods.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            period_code: '2026-10',
            pay_frequency: 'MONTHLY',
            period_start: new Date('2026-10-01T00:00:00Z'),
            period_end: new Date('2026-10-31T23:59:59Z'),
            payment_date: new Date('2026-11-05T00:00:00Z'),
            period_status: 'OPEN',
          },
        });
      }
    });

    return this.login({ email: adminEmail, password: 'password123' });
  }
}
