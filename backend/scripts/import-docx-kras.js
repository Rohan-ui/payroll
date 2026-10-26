const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function importKrasForTenant(tenantId, seedData) {
  const tenant = await prisma.rndtechnosoft_tenants.findUnique({
    where: { id: tenantId },
    select: { id: true, display_name: true },
  });
  if (!tenant) {
    console.error(`Tenant ${tenantId} not found.`);
    return;
  }
  console.log(`\nImporting KRA/KPI data for tenant: ${tenant.display_name} (${tenant.id})`);

  const member = await prisma.rndtechnosoft_tenant_members.findFirst({
    where: { tenant_id: tenantId },
    select: { id: true },
  });
  const memberId = member ? member.id : null;

  // Load existing departments
  const departments = await prisma.rndtechnosoft_departments.findMany({
    where: { tenant_id: tenantId, archived_at: null },
    select: { id: true, department_name: true },
  });
  const deptMap = new Map();
  for (const d of departments) {
    deptMap.set(d.department_name.toLowerCase(), d.id);
  }

  // Helper to find department ID
  const findDeptId = (targetName) => {
    const lower = targetName.toLowerCase();
    if (deptMap.has(lower)) return deptMap.get(lower);
    if (lower === 'tech') {
      if (deptMap.has('engineering')) return deptMap.get('engineering');
    }
    // Partial search
    for (const [name, id] of deptMap.entries()) {
      if (name.includes(lower) || lower.includes(name)) return id;
    }
    return null;
  };

  let rolesCreated = 0;
  let krasCreated = 0;
  let kpisCreated = 0;
  let scopesCreated = 0;
  let linksCreated = 0;

  for (const roleItem of seedData) {
    // 1. Ensure Designation exists
    let desig = await prisma.rndtechnosoft_designations.findFirst({
      where: {
        tenant_id: tenantId,
        designation_name: { equals: roleItem.role_name, mode: 'insensitive' },
      },
    });

    if (!desig) {
      let code = roleItem.role_code;
      // Ensure unique designation code
      const existingCode = await prisma.rndtechnosoft_designations.findFirst({
        where: { tenant_id: tenantId, designation_code: code },
      });
      if (existingCode) {
        code = `${code.substring(0, 40)}_${randomUUID().substring(0, 8).toUpperCase()}`;
      }

      desig = await prisma.rndtechnosoft_designations.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          designation_code: code,
          designation_name: roleItem.role_name,
          designation_status: 'ACTIVE',
        },
      });
      rolesCreated++;
    }

    const deptId = findDeptId(roleItem.department);
    const kraWeight = (100.0 / Math.max(1, roleItem.kras.length)).toFixed(4);

    // 2. Process KRAs
    for (const kraItem of roleItem.kras) {
      let kra = await prisma.rndtechnosoft_performance_kras.findFirst({
        where: { tenant_id: tenantId, kra_code: kraItem.code },
      });

      if (!kra) {
        kra = await prisma.rndtechnosoft_performance_kras.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            kra_code: kraItem.code,
            kra_name: kraItem.name,
            kra_description: kraItem.description,
            evidence_requirement: 'OPTIONAL',
            default_weight_percent: kraWeight,
            applies_to_all: false,
            effective_from: new Date('2026-10-26'),
            effective_to: null,
            kra_status: 'ACTIVE',
            revision_number: 1,
            created_by_tenant_member_id: memberId,
            updated_by_tenant_member_id: memberId,
          },
        });
        krasCreated++;

        // Create scopes: one target per row per ck_performance_kra_scopes_one_target
        await prisma.rndtechnosoft_performance_kra_scopes.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            kra_id: kra.id,
            designation_id: desig.id,
          },
        });
        scopesCreated++;

        if (deptId) {
          await prisma.rndtechnosoft_performance_kra_scopes.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              kra_id: kra.id,
              department_id: deptId,
            },
          });
          scopesCreated++;
        }
      }

      // 3. Process KPIs
      const kpiWeight = (100.0 / Math.max(1, kraItem.kpis.length)).toFixed(4);
      for (let idx = 0; idx < kraItem.kpis.length; idx++) {
        const kpiItem = kraItem.kpis[idx];

        let kpi = await prisma.rndtechnosoft_performance_kpis.findFirst({
          where: { tenant_id: tenantId, kpi_code: kpiItem.code },
        });

        if (!kpi) {
          kpi = await prisma.rndtechnosoft_performance_kpis.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              kpi_code: kpiItem.code,
              kpi_name: kpiItem.name,
              kpi_description: kpiItem.description,
              measurement_type: kpiItem.type,
              unit_label: kpiItem.unit,
              direction: kpiItem.direction,
              evidence_requirement: 'NONE',
              kpi_status: 'ACTIVE',
              revision_number: 1,
              created_by_tenant_member_id: memberId,
              updated_by_tenant_member_id: memberId,
            },
          });
          kpisCreated++;
        }

        // Link KPI to KRA
        const existingLink = await prisma.rndtechnosoft_performance_kra_kpis.findFirst({
          where: { tenant_id: tenantId, kra_id: kra.id, kpi_id: kpi.id },
        });

        if (!existingLink) {
          await prisma.rndtechnosoft_performance_kra_kpis.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              kra_id: kra.id,
              kpi_id: kpi.id,
              default_weight_percent: kpiWeight,
              display_order: idx + 1,
            },
          });
          linksCreated++;
        }
      }
    }
  }

  console.log(`Results for ${tenant.display_name}:`);
  console.log(`  Roles (Designations) created: ${rolesCreated}`);
  console.log(`  KRAs created: ${krasCreated}`);
  console.log(`  KPIs created: ${kpisCreated}`);
  console.log(`  Scopes created: ${scopesCreated}`);
  console.log(`  KRA-KPI links created: ${linksCreated}`);
}

async function main() {
  const seedFile = '/tmp/kras_seed_data.json';
  if (!fs.existsSync(seedFile)) {
    console.error(`Seed file ${seedFile} not found.`);
    process.exit(1);
  }

  const raw = fs.readFileSync(seedFile, 'utf8');
  const seedData = json = JSON.parse(raw);
  console.log(`Loaded ${seedData.length} roles from ${seedFile}`);

  // Seed user tenant (RND TECHNOSOFT)
  await importKrasForTenant('97fce59b-86b8-484d-8be9-8aeb2922f9f7', seedData);

  // Also seed Acme Technologies India so all workspaces have access
 
}

main()
  .catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
