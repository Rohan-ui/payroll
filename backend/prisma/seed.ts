import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';
import { grantDefaultRolePermissions } from '../src/common/access/role-defaults';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('Seeding rndtechnosoft Indian Payroll database...');

  const demoTenantCode = 'ACME_IN';
  const adminEmail = 'admin@rndtechnosoft.com';

  let tenant = await prisma.rndtechnosoft_tenants.findUnique({
    where: { tenant_code: demoTenantCode },
  });

  const tenantId = tenant ? tenant.id : randomUUID();
  const adminUserId = randomUUID();

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
        id: randomUUID(),
        tenant_id: tenantId,
        settings: {
          payroll: { payFrequency: 'MONTHLY', currency: 'INR', workingDaysPerMonth: 31 },
          compliance: { epfWageCeiling: 15000, esicThreshold: 21000, ptState: 'Maharashtra' },
          timezone: 'Asia/Kolkata',
        },
      },
    });
  }

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

    let role = await prisma.rndtechnosoft_roles.findFirst({
      where: { tenant_id: tenantId, role_code: 'ADMIN' },
    });

    if (!role) {
      role = await prisma.rndtechnosoft_roles.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          role_code: 'ADMIN',
          role_name: 'Administrator',
          is_system_role: true,
          role_status: 'ACTIVE',
        },
      });
    }
    // Permissions come only from role_permissions rows, so seeded roles need their grants too.
    await grantDefaultRolePermissions(prisma, tenantId, role.id, role.role_code);

    const memberId = randomUUID();
    await prisma.rndtechnosoft_tenant_members.create({
      data: {
        id: memberId,
        tenant_id: tenantId,
        user_id: adminUser.id,
        membership_status: 'ACTIVE',
        joined_at: new Date(),
      },
    });

    await prisma.rndtechnosoft_tenant_member_roles.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        tenant_member_id: memberId,
        role_id: role.id,
      },
    });
  }

  console.log('Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
