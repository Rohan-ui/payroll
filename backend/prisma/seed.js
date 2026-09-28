const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
// Role default permissions are defined once, in TypeScript; load that definition rather than copy it.
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
const { grantDefaultRolePermissions } = require('../src/common/access/role-defaults');

const prisma = new PrismaClient();

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('--- Seeding Indian SME Payroll Database ---');

  const demoTenantCode = 'ACME_IN';
  const adminEmail = 'admin@rndtechnosoft.com';
  const employeeEmail = 'employee@rndtechnosoft.com';

  let tenant = await prisma.rndtechnosoft_tenants.findUnique({
    where: { tenant_code: demoTenantCode },
  });

  const tenantId = tenant ? tenant.id : crypto.randomUUID();
  const adminUserId = crypto.randomUUID();
  const empUserId = crypto.randomUUID();

  // 1. Tenant
  if (!tenant) {
    tenant = await prisma.rndtechnosoft_tenants.create({
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

    await prisma.rndtechnosoft_tenant_settings.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        settings: {
          payroll: { payFrequency: 'MONTHLY', currency: 'INR', workingDaysPerMonth: 31 },
          compliance: { epfWageCeiling: 15000, esicThreshold: 21000, ptState: 'Maharashtra' },
          timezone: 'Asia/Kolkata',
        },
      },
    });
    console.log('✓ Tenant created: Acme Technologies India Pvt Ltd');
  } else {
    console.log('✓ Tenant already exists:', tenant.id);
  }

  // 2. Users: Admin and Employee
  let adminUser = await prisma.rndtechnosoft_users.findUnique({
    where: { email: adminEmail },
  });

  if (!adminUser) {
    adminUser = await prisma.rndtechnosoft_users.create({
      data: {
        id: adminUserId,
        email: adminEmail,
        password_hash: hashPassword('password123'),
        display_name: 'Rohan Mehta (Admin)',
        mobile_number: '+919876543210',
        user_status: 'ACTIVE',
      },
    });
    console.log('✓ Admin user created: admin@rndtechnosoft.com / password123');
  } else {
    console.log('✓ Admin user already exists:', adminUser.id);
  }

  let empUser = await prisma.rndtechnosoft_users.findUnique({
    where: { email: employeeEmail },
  });

  if (!empUser) {
    empUser = await prisma.rndtechnosoft_users.create({
      data: {
        id: empUserId,
        email: employeeEmail,
        password_hash: hashPassword('password123'),
        display_name: 'Rajesh Sharma (Employee)',
        mobile_number: '+919876543211',
        user_status: 'ACTIVE',
      },
    });
    console.log('✓ Employee user created: employee@rndtechnosoft.com / password123');
  }

  // 3. Roles: ADMIN, HR_ACCOUNTANT, EMPLOYEE
  const rolesToCreate = [
    { code: 'ADMIN', name: 'Company Administrator' },
    { code: 'HR_ACCOUNTANT', name: 'HR & Accountant' },
    { code: 'EMPLOYEE', name: 'Staff Employee' },
  ];

  const roleMap = {};
  for (const r of rolesToCreate) {
    let existingRole = await prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: r.code },
    });
    if (!existingRole) {
      existingRole = await prisma.rndtechnosoft_roles.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          role_code: r.code,
          role_name: r.name,
          is_system_role: true,
          role_status: 'ACTIVE',
        },
      });
    }
    // Permissions come only from role_permissions rows, so seeded roles need their grants too.
    await grantDefaultRolePermissions(prisma, tenantId, existingRole.id, r.code);
    roleMap[r.code] = existingRole.id;
  }

  // 4. Admin Membership
  const existingAdminMember = await prisma.rndtechnosoft_tenant_members.findFirst({
    where: { tenant_id: tenantId, user_id: adminUser.id },
  });
  if (!existingAdminMember) {
    const adminMemberId = crypto.randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: adminMemberId,
        tenant_id: tenantId,
        user_id: adminUser.id,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        tenant_member_id: adminMemberId,
        role_id: roleMap['ADMIN'],
      },
    });
    console.log('✓ Admin membership linked');
  }

  // 5. Employee Membership
  const existingEmpMember = await prisma.rndtechnosoft_tenant_members.findFirst({
    where: { tenant_id: tenantId, user_id: empUser.id },
  });
  if (!existingEmpMember) {
    const empMemberId = crypto.randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: empMemberId,
        tenant_id: tenantId,
        user_id: empUser.id,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });
    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        tenant_member_id: empMemberId,
        role_id: roleMap['EMPLOYEE'],
      },
    });
    console.log('✓ Employee membership linked');
  }

  // 6. Salary Components
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
    const existing = await prisma.rndtechnosoft_salary_components.findFirst({
      where: { tenant_id: tenantId, component_code: comp.code },
    });
    if (!existing) {
      await prisma.rndtechnosoft_salary_components.create({
        data: {
          id: crypto.randomUUID(),
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
  console.log('✓ Salary components created');

  // 7. Branch & Departments
  let branch = await prisma.rndtechnosoft_branches.findFirst({
    where: { tenant_id: tenantId, branch_code: 'HQ_MUMBAI' },
  });
  if (!branch) {
    branch = await prisma.rndtechnosoft_branches.create({
      data: {
        id: crypto.randomUUID(),
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
  const deptMap = {};
  for (const d of departments) {
    const code = d.toUpperCase().replace(/\s+/g, '_');
    let dept = await prisma.rndtechnosoft_departments.findFirst({
      where: { tenant_id: tenantId, department_code: code },
    });
    if (!dept) {
      dept = await prisma.rndtechnosoft_departments.create({
        data: {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          department_code: code,
          department_name: d,
          department_status: 'ACTIVE',
        },
      });
    }
    deptMap[d] = dept.id;
  }

  // 8. 5 Seed Employees
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
    let emp = await prisma.rndtechnosoft_employees.findFirst({
      where: { tenant_id: tenantId, employee_code: empData.code },
    });

    if (!emp) {
      const empId = crypto.randomUUID();
      emp = await prisma.rndtechnosoft_employees.create({
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
      await prisma.rndtechnosoft_employee_employments.create({
        data: {
          id: crypto.randomUUID(),
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
      await prisma.rndtechnosoft_employee_bank_accounts.create({
        data: {
          id: crypto.randomUUID(),
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
      console.log(`✓ Employee created: ${empData.code} - ${empData.first} ${empData.last}`);
    }
  }

  // 9. October 2026 Payroll Period
  const existingPeriod = await prisma.rndtechnosoft_payroll_periods.findFirst({
    where: { tenant_id: tenantId, period_code: '2026-10' },
  });
  if (!existingPeriod) {
    await prisma.rndtechnosoft_payroll_periods.create({
      data: {
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        period_code: '2026-10',
        pay_frequency: 'MONTHLY',
        period_start: new Date('2026-10-01T00:00:00Z'),
        period_end: new Date('2026-10-31T23:59:59Z'),
        payment_date: new Date('2026-11-05T00:00:00Z'),
        period_status: 'OPEN',
      },
    });
    console.log('✓ October 2026 payroll period created');
  }

  console.log('=== SEED COMPLETED SUCCESSFULLY ===');
}

main()
  .catch((e) => {
    console.error('Seed Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
