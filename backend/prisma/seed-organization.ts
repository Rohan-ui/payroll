import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { grantDefaultRolePermissions } from '../src/common/access/role-defaults';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏛️  Seeding Voogyo Organization & Tenant Settings from Prior ERP');
  console.log('═══════════════════════════════════════════════════════════════');

  const tenantId = 'cd1e0cac-3656-41e8-bfc4-5fb8d7bfa6fb';
  const tenant = await prisma.rndtechnosoft_tenants.findUnique({
    where: { id: tenantId },
  });

  if (!tenant) {
    console.error('Tenant cd1e0cac-3656-41e8-bfc4-5fb8d7bfa6fb not found!');
    return;
  }

  console.log(`✓ Target Tenant: ${tenant.display_name} (${tenant.id})`);

  // 1. UPDATE TENANT CORE
  await prisma.rndtechnosoft_tenants.update({
    where: { id: tenantId },
    data: {
      tenant_code: 'RND',
      legal_name: 'RND Technosoft Private Limited',
      display_name: 'RND Technosoft',
      country_code: 'IN',
      default_currency_code: 'INR',
      tenant_status: 'ACTIVE',
    },
  });

  // 2. TENANT SETTINGS (Full Organization, SMTP, WhatsApp, Modules, Integrations)
  const fullSettingsPayload = {
    profile: {
      company_name: 'RND Technosoft',
      legal_name: 'RND Technosoft Private Limited',
      subdomain: 'rnd',
      custom_domain: 'erp.rndtechnosoft.com',
      is_custom_domain_verified: true,
      primary_contact_name: 'Ravi Shah',
      primary_contact_email: 'ravi@rndtechnosoft.com',
      primary_contact_phone: '+919876543210',
      industry_type: 'DIGITAL_AGENCY',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      tax_gstin: '27AABCU9603R1ZM',
      pan: 'AABCU9603R',
      company_address: 'BKC Tech Park, Bandra East, Mumbai, Maharashtra — 400051',
      website_url: 'https://rndtechnosoft.com',
      brand_logo_url: '/voogyo-logo.svg',
      primary_color: '#2563EB',
      secondary_color: '#1E40AF',
      cin_number: 'U72900MH2022PTC123456',
      founded_year: '2020',
      tagline: 'Autonomous Enterprise Software & Digital Transformation OS',
    },
    smtp: {
      host: 'smtp.gmail.com',
      port: 587,
      username: 'outreach@rndtechnosoft.com',
      password: 'enc_app_password_vault_2026',
      hasPassword: true,
      senderName: 'RND Technosoft Growth Team',
      senderEmail: 'outreach@rndtechnosoft.com',
      replyToEmail: 'ravi@rndtechnosoft.com',
      encryption: 'TLS',
      isActive: true,
    },
    whatsapp: {
      provider: 'META_CLOUD_API',
      wabaId: '108922345678901',
      phoneNumberId: '103456789012345',
      senderPhoneNumber: '+919876543210',
      accessToken: 'EAABwzLIXs...vault_secured_meta_token',
      hasAccessToken: true,
      webhookVerifyToken: 'rnd_voogyo_verify_token_2026',
      isActive: true,
    },
    quotas: {
      user_seats_limit: 50,
      branch_limit: 5,
      storage_limit_mb: 51200,
      monthly_ai_tokens: 2000000,
      monthly_whatsapp_credits: 10000,
    },
    modules: [
      { id: 'CRM', name: 'CRM & Sales Automation Suite', category: 'Sales', description: '30-Day Multi-Channel Cadence, Pipelines, GST Proposals, Objection Battlecards', is_core: true, is_enabled: true, sort_order: 1 },
      { id: 'HRMS', name: 'HRMS, Attendance & Recruitment', category: 'Human Resources', description: 'Employee Directory, biometric clock-in, leave workflows, lifecycle onboarding', is_core: true, is_enabled: true, sort_order: 2 },
      { id: 'PAYROLL', name: 'Statutory Indian Payroll & Payslips', category: 'Payroll & Compliance', description: 'EPF, ESIC, Professional Tax, TDS compliance, payslips generator', is_core: true, is_enabled: true, sort_order: 3 },
      { id: 'PROJECTS', name: 'Agile Projects, Sprints & Tasks', category: 'Engineering Delivery', description: 'Kanban boards, milestone tracking, sprint planning, timesheets', is_core: true, is_enabled: true, sort_order: 4 },
      { id: 'OPERATIONS', name: 'Client Credentials Vault & Ops Suite', category: 'Operations', description: 'Secure encrypted credential vault, SEO keyword radar, branch telemetry', is_core: true, is_enabled: true, sort_order: 5 },
      { id: 'FINANCE', name: 'GST Invoicing & General Ledger', category: 'Finance', description: 'Indian GST compliant invoicing, payments reconciliation, expense vouchers', is_core: true, is_enabled: true, sort_order: 6 },
      { id: 'AI', name: 'AI Business Copilot & Automation Brain', category: 'Intelligence', description: 'Autonomous sales assistant, AI score predictor, contract summarizer', is_core: true, is_enabled: true, sort_order: 7 },
    ],
    integrations: {
      webhookUrl: 'https://api.rndtechnosoft.com/api/v1/crm/leads/webhook',
      metaAdsActive: true,
      googleAdsActive: true,
      zapierActive: true,
      indiaMartActive: true,
      justDialActive: true,
    },
  };

  await prisma.rndtechnosoft_tenant_settings.upsert({
    where: { tenant_id: tenantId },
    update: {
      settings: fullSettingsPayload,
    },
    create: {
      id: randomUUID(),
      tenant_id: tenantId,
      settings: fullSettingsPayload,
    },
  });
  console.log('✓ Organization Profile, SMTP & WhatsApp settings synced in tenant_settings.');

  // 3. TENANT QUOTAS
  await prisma.rndtechnosoft_tenant_quotas.upsert({
    where: { tenant_id: tenantId },
    update: {
      user_seats_limit: 50,
      branch_limit: 5,
      storage_limit_mb: 51200,
      monthly_ai_tokens: 2000000,
      monthly_whatsapp_credits: 10000,
    },
    create: {
      id: randomUUID(),
      tenant_id: tenantId,
      user_seats_limit: 50,
      branch_limit: 5,
      storage_limit_mb: 51200,
      monthly_ai_tokens: 2000000,
      monthly_whatsapp_credits: 10000,
    },
  });
  console.log('✓ Tenant Enterprise Quotas updated (50 seats, 5 branches, 51.2 GB, 2M AI tokens, 10K WhatsApp credits).');

  // 4. BRANCHES (Headquarters + Regional Center)
  const branches = [
    {
      code: 'MUM_HQ',
      name: 'Mumbai Corporate Headquarters',
      isHq: true,
      address: 'BKC Tech Park, Bandra East',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400051',
      gstin: '27AABCU9603R1ZM',
    },
    {
      code: 'SRT_DEV',
      name: 'Surat Engineering & Delivery Center',
      isHq: false,
      address: 'Ring Road Business Hub',
      city: 'Surat',
      state: 'Gujarat',
      pincode: '395002',
      gstin: '24AABCU9603R1Z7',
    },
    {
      code: 'VAPI_OPS',
      name: 'Vapi Operations & Client Support Hub',
      isHq: false,
      address: 'GIDC Industrial Area',
      city: 'Vapi',
      state: 'Gujarat',
      pincode: '396195',
      gstin: '24AABCU9603R1Z7',
    },
  ];

  for (const b of branches) {
    const existingBranch = await prisma.rndtechnosoft_branches.findFirst({
      where: { tenant_id: tenantId, branch_code: b.code },
    });
    if (!existingBranch) {
      await prisma.rndtechnosoft_branches.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          branch_code: b.code,
          branch_name: b.name,
          address_line_1: b.address,
          city: b.city,
          state_code: b.state,
          country_code: 'IN',
          postal_code: b.pincode,
          timezone: 'Asia/Kolkata',
          branch_status: 'ACTIVE',
        },
      });
    }
  }
  console.log(`✓ ${branches.length} branches seeded.`);

  // 5. ROLES (Standard SME & Enterprise RBAC)
  const roles = [
    { code: 'ADMIN', name: 'Administrator', desc: 'Full unrestricted system access across all modules and settings', isSystem: true },
    { code: 'MANAGER', name: 'Project & Operations Manager', desc: 'Project management, task delegation, and client communications', isSystem: false },
    { code: 'DEVELOPER', name: 'Software Developer', desc: 'Sprint delivery, timesheet logging, and task execution', isSystem: false },
    { code: 'SALES_REP', name: 'Sales & Growth Specialist', desc: 'Outbound prospecting, lead pipeline management, and proposal generation', isSystem: false },
    { code: 'HR_PAYROLL', name: 'HR & Payroll Officer', desc: 'Employee lifecycle, attendance verification, and salary processing', isSystem: false },
    { code: 'VIEW_ONLY', name: 'Auditor / Executive View Only', desc: 'Read-only visibility for reporting, compliance, and auditing', isSystem: false },
  ];

  const roleMap: Record<string, string> = {};
  for (const r of roles) {
    let role = await prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: r.code },
    });
    if (!role) {
      role = await prisma.rndtechnosoft_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          role_code: r.code,
          role_name: r.name,
          description: r.desc,
          is_system_role: r.isSystem,
          role_status: 'ACTIVE',
        },
      });
    }
    // Permissions come only from role_permissions rows, so seeded roles need their grants too.
    await grantDefaultRolePermissions(prisma, tenantId, role.id, r.code);
    roleMap[r.code] = role.id;
  }
  console.log(`✓ ${roles.length} roles verified and synced.`);

  // 6. PERMISSIONS & ROLE PERMISSION MAPPINGS
  const modulesList = ['CRM', 'HRMS', 'PAYROLL', 'PROJECTS', 'OPERATIONS', 'FINANCE', 'AI'];
  const actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'EXPORT'];

  for (const mod of modulesList) {
    for (const act of actions) {
      const permCode = `${mod}_${act}`;
      let perm = await prisma.rndtechnosoft_permissions.findUnique({
        where: { permission_code: permCode },
      });
      if (!perm) {
        perm = await prisma.rndtechnosoft_permissions.create({
          data: {
            id: randomUUID(),
            permission_code: permCode,
            module_code: mod,
            permission_name: `${act} ${mod}`,
            description: `Allows user to ${act.toLowerCase()} records in ${mod} module`,
          },
        });
      }

      // Assign to ADMIN (all permissions)
      const adminRoleId = roleMap['ADMIN'];
      if (adminRoleId) {
        const existingRp = await prisma.rndtechnosoft_role_permissions.findFirst({
          where: { tenant_id: tenantId, role_id: adminRoleId, permission_id: perm.id },
        });
        if (!existingRp) {
          await prisma.rndtechnosoft_role_permissions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              role_id: adminRoleId,
              permission_id: perm.id,
            },
          });
        }
      }

      // Assign to MANAGER (VIEW, CREATE, EDIT on all)
      const mgrRoleId = roleMap['MANAGER'];
      if (mgrRoleId && ['VIEW', 'CREATE', 'EDIT'].includes(act)) {
        const existingRp = await prisma.rndtechnosoft_role_permissions.findFirst({
          where: { tenant_id: tenantId, role_id: mgrRoleId, permission_id: perm.id },
        });
        if (!existingRp) {
          await prisma.rndtechnosoft_role_permissions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              role_id: mgrRoleId,
              permission_id: perm.id,
            },
          });
        }
      }

      // Assign to SALES_REP (All CRM and AI actions, VIEW on others)
      const salesRoleId = roleMap['SALES_REP'];
      if (salesRoleId && (mod === 'CRM' || mod === 'AI' || act === 'VIEW')) {
        const existingRp = await prisma.rndtechnosoft_role_permissions.findFirst({
          where: { tenant_id: tenantId, role_id: salesRoleId, permission_id: perm.id },
        });
        if (!existingRp) {
          await prisma.rndtechnosoft_role_permissions.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              role_id: salesRoleId,
              permission_id: perm.id,
            },
          });
        }
      }
    }
  }
  console.log('✓ Master permissions and RBAC matrix configured.');

  // 7. USERS & WORKSPACE MEMBERS
  const workspaceUsers = [
    {
      email: 'ravi@rndtechnosoft.com',
      firstName: 'Ravi',
      lastName: 'Shah',
      displayName: 'Ravi Shah',
      phone: '+919876543210',
      roleCode: 'ADMIN',
      designation: 'Founder & Chief Architect',
    },
    {
      email: 'rahul@rndtechnosoft.com',
      firstName: 'Rahul',
      lastName: 'Verma',
      displayName: 'Rahul Verma',
      phone: '+919876543211',
      roleCode: 'MANAGER',
      designation: 'Lead Full-Stack Engineer',
    },
    {
      email: 'sneha@rndtechnosoft.com',
      firstName: 'Sneha',
      lastName: 'Rao',
      displayName: 'Sneha Rao',
      phone: '+919876543212',
      roleCode: 'DEVELOPER',
      designation: 'Lead UI/UX Designer',
    },
    {
      email: 'amit@rndtechnosoft.com',
      firstName: 'Amit',
      lastName: 'Patel',
      displayName: 'Amit Patel',
      phone: '+919876543213',
      roleCode: 'DEVELOPER',
      designation: 'SEO & Performance Marketing Lead',
    },
    {
      email: 'saloni@rndtechnosoft.com',
      firstName: 'Saloni',
      lastName: 'Shah',
      displayName: 'Saloni Shah',
      phone: '+919876543214',
      roleCode: 'SALES_REP',
      designation: 'Head of Sales & Client Success',
    },
    {
      email: 'pooja.nair@rndtechnosoft.com',
      firstName: 'Pooja',
      lastName: 'Nair',
      displayName: 'Pooja Nair',
      phone: '+919876543215',
      roleCode: 'HR_PAYROLL',
      designation: 'Senior HR Operations Specialist',
    },
  ];

  for (const u of workspaceUsers) {
    let user = await prisma.rndtechnosoft_users.findUnique({
      where: { email: u.email },
    });

    if (!user) {
      user = await prisma.rndtechnosoft_users.create({
        data: {
          id: randomUUID(),
          email: u.email,
          password_hash: hashPassword('Voogyo@2026!'),
          display_name: u.displayName,
          mobile_number: u.phone,
          user_status: 'ACTIVE',
        },
      });
    }

    let member = await prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, user_id: user.id },
    });

    if (!member) {
      member = await prisma.rndtechnosoft_tenant_members.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          user_id: user.id,
          membership_status: 'ACTIVE',
          joined_at: new Date(),
        },
      });
    }

    // Role assignment
    const roleId = roleMap[u.roleCode];
    if (roleId) {
      const existingTmRole = await prisma.rndtechnosoft_tenant_member_roles.findFirst({
        where: { tenant_id: tenantId, tenant_member_id: member.id, role_id: roleId },
      });
      if (!existingTmRole) {
        await prisma.rndtechnosoft_tenant_member_roles.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            tenant_member_id: member.id,
            role_id: roleId,
          },
        });
      }
    }
  }
  console.log(`✓ ${workspaceUsers.length} workspace users and member roles seeded.`);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ Voogyo Organization & Tenant Settings Seed — COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
