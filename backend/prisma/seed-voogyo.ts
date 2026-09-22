import { PrismaClient } from '@prisma/client';
import { randomUUID, createHash } from 'crypto';

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('--- Seeding Voogyo Super Admin HQ & CRM Enterprise Data ---');

  // 1. Seed Super Admin
  const superAdminEmail = 'superadmin@voogyo.com';
  let superAdmin = await prisma.rndtechnosoft_super_admins.findUnique({
    where: { email: superAdminEmail },
  });

  if (!superAdmin) {
    superAdmin = await prisma.rndtechnosoft_super_admins.create({
      data: {
        id: randomUUID(),
        email: superAdminEmail,
        password_hash: hashPassword('Voogyo@2026!'),
        display_name: 'Ravi Shah (Chief Architect)',
        role: 'SUPER_ADMIN',
        is_active: true,
      },
    });
    console.log('Created Super Admin:', superAdmin.email);
  }

  // 2. Seed Platform Settings
  const defaultSettings = [
    {
      category: 'GENERAL',
      key: 'platform_branding',
      value: {
        platformName: 'Voogyo Operating System',
        supportEmail: 'support@voogyo.com',
        websiteUrl: 'https://voogyo.com',
        currency: 'INR',
      },
      description: 'Global SaaS branding and default contact information',
    },
    {
      category: 'BILLING',
      key: 'saas_packages',
      value: [
        {
          tier: 'STARTER',
          name: 'Starter Cloud',
          priceMonthlyInr: 4999,
          userSeats: 5,
          branches: 1,
          storageMb: 5120,
          aiTokens: 50000,
        },
        {
          tier: 'GROWTH',
          name: 'Growth Enterprise',
          priceMonthlyInr: 14999,
          userSeats: 25,
          branches: 3,
          storageMb: 25600,
          aiTokens: 250000,
        },
        {
          tier: 'SCALE',
          name: 'Scale Unlimited',
          priceMonthlyInr: 34999,
          userSeats: 100,
          branches: 10,
          storageMb: 102400,
          aiTokens: 1000000,
        },
      ],
      description: 'Standard Voogyo SaaS subscription tier packages',
    },
  ];

  for (const s of defaultSettings) {
    await prisma.rndtechnosoft_platform_settings.upsert({
      where: { setting_key: s.key },
      update: { setting_value: s.value },
      create: {
        id: randomUUID(),
        setting_category: s.category,
        setting_key: s.key,
        setting_value: s.value,
        description: s.description,
        is_public: true,
      },
    });
  }
  console.log('Platform settings synced.');

  // 3. Find default tenant (ACME_IN)
  let tenant = await prisma.rndtechnosoft_tenants.findUnique({
    where: { tenant_code: 'ACME_IN' },
  });

  if (!tenant) {
    tenant = await prisma.rndtechnosoft_tenants.findFirst();
  }

  if (!tenant) {
    console.error('No tenant found to seed CRM. Run standard seed first.');
    return;
  }

  const tenantId = tenant.id;

  // 4. Seed Tenant Quotas
  await prisma.rndtechnosoft_tenant_quotas.upsert({
    where: { tenant_id: tenantId },
    update: {
      user_seats_limit: 50,
      branch_limit: 5,
      storage_limit_mb: 51200,
      monthly_ai_tokens: 500000,
      monthly_whatsapp_credits: 2500,
    },
    create: {
      id: randomUUID(),
      tenant_id: tenantId,
      user_seats_limit: 50,
      branch_limit: 5,
      storage_limit_mb: 51200,
      monthly_ai_tokens: 500000,
      monthly_whatsapp_credits: 2500,
    },
  });

  // 5. Seed CRM Pipeline & Stages
  let pipeline = await prisma.rndtechnosoft_crm_pipelines.findFirst({
    where: { tenant_id: tenantId, code: 'SOFTWARE_SERVICES' },
  });

  if (!pipeline) {
    pipeline = await prisma.rndtechnosoft_crm_pipelines.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        name: 'Enterprise IT & Software Services',
        code: 'SOFTWARE_SERVICES',
        is_default: true,
        sort_order: 1,
        is_active: true,
      },
    });

    const stages = [
      { name: 'Lead Inbound / Prospect', color: '#3b82f6', prob: 10, sla: 24, sort: 1, won: false, lost: false },
      { name: 'Discovery & Requirement Brief', color: '#8b5cf6', prob: 30, sla: 48, sort: 2, won: false, lost: false },
      { name: 'GST Proposal / Quote Sent', color: '#f59e0b', prob: 60, sla: 72, sort: 3, won: false, lost: false },
      { name: 'Commercial Negotiation', color: '#ec4899', prob: 80, sla: 48, sort: 4, won: false, lost: false },
      { name: 'Deal Won / Hand-off', color: '#10b981', prob: 100, sla: 24, sort: 5, won: true, lost: false },
      { name: 'Lost / Closed', color: '#ef4444', prob: 0, sla: 24, sort: 6, won: false, lost: true },
    ];

    for (const stg of stages) {
      await prisma.rndtechnosoft_crm_stages.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          pipeline_id: pipeline.id,
          name: stg.name,
          color: stg.color,
          stage_probability: stg.prob,
          sla_duration_hours: stg.sla,
          sort_order: stg.sort,
          is_won: stg.won,
          is_lost: stg.lost,
        },
      });
    }
  }

  // 6. Seed Lead Sources
  const leadSources = [
    { name: 'Inbound Website Form', channel: 'INBOUND_WEB', sort: 1 },
    { name: 'Meta Lead Ads (WhatsApp)', channel: 'PAID_ADS', sort: 2 },
    { name: 'Google Search Ads (SAC 998314)', channel: 'SEARCH', sort: 3 },
    { name: 'LinkedIn Executive Outbound', channel: 'OUTBOUND', sort: 4 },
    { name: 'Client Referral & Partner', channel: 'REFERRAL', sort: 5 },
  ];

  for (const src of leadSources) {
    const existing = await prisma.rndtechnosoft_crm_lead_sources.findFirst({
      where: { tenant_id: tenantId, name: src.name },
    });
    if (!existing) {
      await prisma.rndtechnosoft_crm_lead_sources.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          name: src.name,
          channel: src.channel,
          sort_order: src.sort,
        },
      });
    }
  }

  // 7. Seed Services Master with SAC Codes
  const services = [
    { name: 'Custom Full-Stack Web / SaaS MVP', category: 'Software Development', sac: '998314', rate: 250000, unit: 'MILESTONE' },
    { name: 'Dedicated React / Next.js Developer Pod', category: 'Staff Augmentation', sac: '998313', rate: 125000, unit: 'MONTHLY' },
    { name: 'B2B GST E-Commerce Platform Build', category: 'Web Development', sac: '998314', rate: 180000, unit: 'PROJECT' },
    { name: 'SEO High-Intent Keyword Scaling (20 Keywords)', category: 'Digital Marketing', sac: '998361', rate: 45000, unit: 'MONTHLY' },
    { name: 'Cloud DevOps & 24/7 AMC Support', category: 'Infrastructure', sac: '998315', rate: 35000, unit: 'MONTHLY' },
  ];

  for (const srv of services) {
    const existing = await prisma.rndtechnosoft_crm_services_master.findFirst({
      where: { tenant_id: tenantId, name: srv.name },
    });
    if (!existing) {
      await prisma.rndtechnosoft_crm_services_master.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          name: srv.name,
          category: srv.category,
          sac_code: srv.sac,
          default_rate: srv.rate,
          billing_unit: srv.unit,
        },
      });
    }
  }

  // 8. Seed 30-Day "RND Gold Funnel" SOP Steps Master
  const sopSteps = [
    { idx: 1, day: 1, title: 'Day 1: Immediate Hook & Audit Offer', channels: ['WHATSAPP', 'EMAIL', 'LINKEDIN', 'PHONE'], obj: 'Introduce firm, cite relevant client wins, send connect request, offer free UI/code audit.' },
    { idx: 2, day: 5, title: 'Day 5: Metric-Driven Case Study', channels: ['EMAIL', 'WHATSAPP'], obj: 'Share verifiable client case study (+140% organic leads in 90 days).' },
    { idx: 3, day: 10, title: 'Day 10: Technical / UX Teardown', channels: ['WHATSAPP', 'EMAIL'], obj: 'Highlight 2-3 specific bugs, speed lags, or UX gaps identified on their website.' },
    { idx: 4, day: 15, title: 'Day 15: Loom Video Demo Walkthrough', channels: ['EMAIL', 'WHATSAPP'], obj: '60-second personalized screencast showing how Voogyo transforms their agency.' },
    { idx: 5, day: 20, title: 'Day 20: Social Proof & Testimonial Video', channels: ['WHATSAPP', 'EMAIL'], obj: 'Customer founder testimonial video highlighting ROI and time savings.' },
    { idx: 6, day: 25, title: 'Day 25: Soft Urgency Roadmap Session', channels: ['PHONE', 'WHATSAPP'], obj: 'Offer complimentary 20-minute architecture roadmap session for upcoming quarter.' },
    { idx: 7, day: 28, title: 'Day 28: Executive Founder Check-In', channels: ['WHATSAPP', 'EMAIL'], obj: 'Direct personal message from Chief Architect / Founder inquiring on blockers.' },
    { idx: 8, day: 30, title: 'Day 30: Respectful Breakup / File Closure', channels: ['EMAIL', 'LINKEDIN', 'WHATSAPP'], obj: 'Permission to close your file? We will not reach out again unless you initiate.' },
  ];

  for (const step of sopSteps) {
    const existing = await prisma.rndtechnosoft_crm_sop_steps_master.findFirst({
      where: { tenant_id: tenantId, step_index: step.idx },
    });
    if (!existing) {
      await prisma.rndtechnosoft_crm_sop_steps_master.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          step_index: step.idx,
          day_number: step.day,
          title: step.title,
          channels: step.channels,
          primary_objective: step.obj,
          sort_order: step.idx,
        },
      });
    }
  }

  // 9. Seed Objection Handling Battlecards
  const battlecards = [
    { key: 'PRICE_HIGH', label: 'Pricing Too High', trigger: 'Prospect remarks proposal is over budget', action: 'Propose phased scope with monthly milestones', script: 'We understand cash flow pacing is paramount. Let us split Deliverable 1 into a Phase 1 MVP at 60% budget, validating ROI before Phase 2.' },
    { key: 'IN_HOUSE', label: 'Already Have In-House Team', trigger: 'Prospect mentions internal engineers exist', action: 'Position as high-velocity specialized backup sprint pod', script: 'Most of our clients have capable teams. We plug in as an accelerator pod for specialized sprints (e.g., GST integration or mobile app) without recruitment overhead.' },
    { key: 'SEND_EMAIL', label: 'Send Info On Email', trigger: 'Gatekeeper or prospect asks for deck', action: 'Send 1-page executive PDF lookbook with interactive link', script: 'Sending our verified case studies and executive deck directly to your inbox now. Would 3 PM Thursday work for a 10-minute briefing?' },
  ];

  for (const bc of battlecards) {
    const existing = await prisma.rndtechnosoft_crm_sop_reply_branches_master.findFirst({
      where: { tenant_id: tenantId, branch_key: bc.key },
    });
    if (!existing) {
      await prisma.rndtechnosoft_crm_sop_reply_branches_master.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          branch_key: bc.key,
          label: bc.label,
          trigger_condition: bc.trigger,
          suggested_action: bc.action,
          recommended_response_script: bc.script,
        },
      });
    }
  }

  // 10. Seed Sample CRM Leads
  const pipelineStages = await prisma.rndtechnosoft_crm_stages.findMany({
    where: { tenant_id: tenantId, pipeline_id: pipeline.id },
    orderBy: { sort_order: 'asc' },
  });

  const member = await prisma.rndtechnosoft_tenant_members.findFirst({
    where: { tenant_id: tenantId },
  });

  const demoLeads = [
    {
      code: 'LEAD-2026-001',
      company: 'Zenith Logistics Ltd',
      first: 'Aarav',
      last: 'Sharma',
      email: 'aarav@zenithlogistics.in',
      phone: '+919820112233',
      city: 'Mumbai',
      state: 'Maharashtra',
      budget: 350000,
      stageIndex: 0,
      temp: 'HOT',
      score: 88,
      step: 1,
      brief: 'Requires custom B2B dispatch dispatch & driver GPS tracking dashboard with GST freight billing.',
    },
    {
      code: 'LEAD-2026-002',
      company: 'OmniHealth Clinics',
      first: 'Dr. Priya',
      last: 'Nair',
      email: 'priya@omnihealth.org',
      phone: '+919711445566',
      city: 'Bengaluru',
      state: 'Karnataka',
      budget: 180000,
      stageIndex: 1,
      temp: 'HOT',
      score: 92,
      step: 2,
      brief: 'Multi-branch patient appointment scheduling and tele-consultation video portal.',
    },
    {
      code: 'LEAD-2026-003',
      company: 'Apex Digital Capital',
      first: 'Karan',
      last: 'Deshmukh',
      email: 'karan@apexdigital.co',
      phone: '+919988776655',
      city: 'Pune',
      state: 'Maharashtra',
      budget: 500000,
      stageIndex: 2,
      temp: 'WARM',
      score: 74,
      step: 3,
      brief: 'Fintech compliance portal for invoice factoring and NBFC credit scoring.',
    },
    {
      code: 'LEAD-2026-004',
      company: 'Skyline Architects',
      first: 'Sunita',
      last: 'Verma',
      email: 'sunita@skylinearchitects.com',
      phone: '+919655443322',
      city: 'Ahmedabad',
      state: 'Gujarat',
      budget: 220000,
      stageIndex: 3,
      temp: 'WARM',
      score: 81,
      step: 4,
      brief: '3D Portfolio showcase and client milestone review portal with CAD file attachments.',
    },
  ];

  for (const dl of demoLeads) {
    const existing = await prisma.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, lead_code: dl.code },
    });
    if (!existing && pipelineStages[dl.stageIndex]) {
      const lead = await prisma.rndtechnosoft_crm_leads.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          lead_code: dl.code,
          company_name: dl.company,
          first_name: dl.first,
          last_name: dl.last,
          email: dl.email,
          phone: dl.phone,
          city: dl.city,
          state: dl.state,
          country_code: 'IN',
          budget_amount: dl.budget,
          currency_code: 'INR',
          pipeline_id: pipeline.id,
          stage_id: pipelineStages[dl.stageIndex].id,
          assigned_tenant_member_id: member?.id,
          temperature: dl.temp,
          ai_score: dl.score,
          cadence_step: dl.step,
          requirement_brief: dl.brief,
        },
      });

      // Add initial activity
      await prisma.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          lead_id: lead.id,
          activity_type: 'NOTE',
          title: 'Lead Ingested & Enrolled in 30-Day Funnel',
          description: 'Initial requirement captured. Assigned to sales representative.',
          performed_by_tenant_member_id: member?.id,
        },
      });
    }
  }

  console.log('Voogyo Super Admin HQ and CRM Data Seeded Successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
