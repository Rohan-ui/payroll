// import { PrismaClient } from '@prisma/client';
// import { randomUUID } from 'crypto';
// import {
//   hashPassword,
//   PASSWORD_ALGORITHM_SCRYPT,
// } from '../src/common/security/password.util';

// const prisma = new PrismaClient();

// // Helper to create a future date from now
// function futureDate(days: number): Date {
//   const d = new Date();
//   d.setDate(d.getDate() + days);
//   return d;
// }

// function pastDate(days: number): Date {
//   const d = new Date();
//   d.setDate(d.getDate() - days);
//   return d;
// }

// async function main() {
//   console.log('--- Seeding Voogyo Super Admin HQ & CRM Enterprise Data ---');

//   // // ═══════════════════════════════════════════════════════════════
//   // // 1. SUPER ADMIN
//   // // ═══════════════════════════════════════════════════════════════
//   const superAdminEmail = 'superadmin@voogyo.com';
//   let superAdmin = await prisma.rndtechnosoft_super_admins.findUnique({
//     where: { email: superAdminEmail },
//   });

//   if (!superAdmin) {
//     // Development seed credential only. Rotate before any shared environment:
//     //   npm run platform:admin -- reset-password superadmin@voogyo.com
//     const seedPassword = process.env.SUPER_ADMIN_SEED_PASSWORD || 'Voogyo@2026!';

//     superAdmin = await prisma.rndtechnosoft_super_admins.create({
//       data: {
//         id: randomUUID(),
//         email: superAdminEmail,
//         password_hash: await hashPassword(seedPassword),
//         password_algorithm: PASSWORD_ALGORITHM_SCRYPT,
//         display_name: 'Ravi Shah (Chief Architect)',
//         role: 'SUPER_ADMIN',
//         is_active: true,
//       },
//     });
//     console.log('✓ Created Super Admin:', superAdmin.email);
//   }

//   // ═══════════════════════════════════════════════════════════════
//   // 2. PLATFORM SETTINGS
//   // ═══════════════════════════════════════════════════════════════
//   const defaultSettings = [
//     {
//       category: 'GENERAL',
//       key: 'platform_branding',
//       value: {
//         platformName: 'Voogyo Operating System',
//         supportEmail: 'support@voogyo.com',
//         websiteUrl: 'https://voogyo.com',
//         currency: 'INR',
//       },
//       description: 'Global SaaS branding and default contact information',
//     },
//     {
//       category: 'BILLING',
//       key: 'saas_packages',
//       value: [
//         { tier: 'STARTER', name: 'Starter Cloud', priceMonthlyInr: 4999, userSeats: 5, branches: 1, storageMb: 5120, aiTokens: 50000 },
//         { tier: 'GROWTH', name: 'Growth Enterprise', priceMonthlyInr: 14999, userSeats: 25, branches: 3, storageMb: 25600, aiTokens: 250000 },
//         { tier: 'SCALE', name: 'Scale Unlimited', priceMonthlyInr: 34999, userSeats: 100, branches: 10, storageMb: 102400, aiTokens: 1000000 },
//       ],
//       description: 'Standard Voogyo SaaS subscription tier packages',
//     },
//   ];

//   for (const s of defaultSettings) {
//     await prisma.rndtechnosoft_platform_settings.upsert({
//       where: { setting_key: s.key },
//       update: { setting_value: s.value },
//       create: {
//         id: randomUUID(),
//         setting_category: s.category,
//         setting_key: s.key,
//         setting_value: s.value,
//         description: s.description,
//         is_public: true,
//       },
//     });
//   }
//   console.log('✓ Platform settings synced.');

//   // ═══════════════════════════════════════════════════════════════
//   // 3. RESOLVE TENANT
//   // ═══════════════════════════════════════════════════════════════
//   // let tenant = await prisma.rndtechnosoft_tenants.findUnique({
//   //   where: { tenant_code: 'ACME_IN' },
//   // });

//   // if (!tenant) {
//   //   tenant = await prisma.rndtechnosoft_tenants.findFirst();
//   // }

//   // if (!tenant) {
//   //   console.error('No tenant found to seed CRM. Run standard seed first (seed.ts).');
//   //   return;
//   // }

//   // const tenantId = tenant.id;
//   // console.log(`✓ Using tenant: ${tenant.display_name} (${tenantId})`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 4. TENANT QUOTAS
//   // // ═══════════════════════════════════════════════════════════════
//   // await prisma.rndtechnosoft_tenant_quotas.upsert({
//   //   where: { tenant_id: tenantId },
//   //   update: {
//   //     user_seats_limit: 50,
//   //     branch_limit: 5,
//   //     storage_limit_mb: 51200,
//   //     monthly_ai_tokens: 500000,
//   //     monthly_whatsapp_credits: 2500,
//   //   },
//   //   create: {
//   //     id: randomUUID(),
//   //     tenant_id: tenantId,
//   //     user_seats_limit: 50,
//   //     branch_limit: 5,
//   //     storage_limit_mb: 51200,
//   //     monthly_ai_tokens: 500000,
//   //     monthly_whatsapp_credits: 2500,
//   //   },
//   // });
//   // console.log('✓ Tenant quotas configured.');

//   // ═══════════════════════════════════════════════════════════════
//   // 5. CRM PIPELINES & STAGES
//   // ═══════════════════════════════════════════════════════════════

//   const pipelinesConfig = [
//     {
//       name: 'Enterprise IT & Software Services',
//       code: 'SOFTWARE_SERVICES',
//       isDefault: true,
//       sort: 1,
//       stages: [
//         { name: 'New Lead / Prospect', color: '#3b82f6', prob: 10, sla: 24, sort: 1, won: false, lost: false },
//         { name: 'Discovery & Requirement Brief', color: '#8b5cf6', prob: 25, sla: 48, sort: 2, won: false, lost: false },
//         { name: 'Solution Design & Estimation', color: '#a855f7', prob: 40, sla: 72, sort: 3, won: false, lost: false },
//         { name: 'Proposal / Quotation Sent', color: '#f59e0b', prob: 60, sla: 72, sort: 4, won: false, lost: false },
//         { name: 'Commercial Negotiation', color: '#ec4899', prob: 75, sla: 48, sort: 5, won: false, lost: false },
//         { name: 'Contract & SOW Review', color: '#06b6d4', prob: 90, sla: 48, sort: 6, won: false, lost: false },
//         { name: 'Deal Won — Hand-off to Ops', color: '#10b981', prob: 100, sla: 24, sort: 7, won: true, lost: false },
//         { name: 'Lost / Closed', color: '#ef4444', prob: 0, sla: 24, sort: 8, won: false, lost: true },
//       ],
//     },
//     {
//       name: 'Digital Marketing Monthly Retainers',
//       code: 'DIGITAL_MARKETING',
//       isDefault: false,
//       sort: 2,
//       stages: [
//         { name: 'Inbound Inquiry', color: '#3b82f6', prob: 10, sla: 12, sort: 1, won: false, lost: false },
//         { name: 'Audit & Strategy Call', color: '#8b5cf6', prob: 30, sla: 48, sort: 2, won: false, lost: false },
//         { name: 'Proposal Sent', color: '#f59e0b', prob: 55, sla: 72, sort: 3, won: false, lost: false },
//         { name: 'Budget Approval', color: '#ec4899', prob: 80, sla: 48, sort: 4, won: false, lost: false },
//         { name: 'Retainer Signed', color: '#10b981', prob: 100, sla: 24, sort: 5, won: true, lost: false },
//         { name: 'Not Interested', color: '#ef4444', prob: 0, sla: 24, sort: 6, won: false, lost: true },
//       ],
//     },
//     {
//       name: 'Annual Maintenance Contracts (AMC)',
//       code: 'AMC_RENEWALS',
//       isDefault: false,
//       sort: 3,
//       stages: [
//         { name: 'Renewal Due', color: '#f59e0b', prob: 20, sla: 168, sort: 1, won: false, lost: false },
//         { name: 'Contact Initiated', color: '#3b82f6', prob: 40, sla: 72, sort: 2, won: false, lost: false },
//         { name: 'Revised Quote Sent', color: '#8b5cf6', prob: 65, sla: 72, sort: 3, won: false, lost: false },
//         { name: 'Renewal Confirmed', color: '#10b981', prob: 100, sla: 24, sort: 4, won: true, lost: false },
//         { name: 'Churned', color: '#ef4444', prob: 0, sla: 24, sort: 5, won: false, lost: true },
//       ],
//     },
//     {
//       name: 'Enterprise Custom ERP & SaaS',
//       code: 'ENTERPRISE_ERP',
//       isDefault: false,
//       sort: 4,
//       stages: [
//         { name: 'Executive Inquiry', color: '#3b82f6', prob: 5, sla: 24, sort: 1, won: false, lost: false },
//         { name: 'Stakeholder Discovery', color: '#8b5cf6', prob: 15, sla: 96, sort: 2, won: false, lost: false },
//         { name: 'Technical POC / Demo', color: '#a855f7', prob: 35, sla: 168, sort: 3, won: false, lost: false },
//         { name: 'RFP Response & Pricing', color: '#f59e0b', prob: 55, sla: 120, sort: 4, won: false, lost: false },
//         { name: 'Procurement & Legal Review', color: '#ec4899', prob: 75, sla: 240, sort: 5, won: false, lost: false },
//         { name: 'Contract Signed', color: '#10b981', prob: 100, sla: 48, sort: 6, won: true, lost: false },
//         { name: 'Deal Lost', color: '#ef4444', prob: 0, sla: 24, sort: 7, won: false, lost: true },
//       ],
//     },
//   ];
//   // const tenantId = '97fce59b-86b8-484d-8be9-8aeb2922f9f7'

//   // const pipelineMap: Record<string, string> = {};
//   // const stageMap: Record<string, { id: string; isWon: boolean; isLost: boolean }[]> = {};

//   // for (const pc of pipelinesConfig) {
//   //   let pipeline = await prisma.rndtechnosoft_crm_pipelines.findFirst({
//   //     where: { tenant_id: tenantId, code: pc.code },
//   //   });

//   //   if (!pipeline) {
//   //     pipeline = await prisma.rndtechnosoft_crm_pipelines.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         name: pc.name,
//   //         code: pc.code,
//   //         is_default: pc.isDefault,
//   //         sort_order: pc.sort,
//   //         is_active: true,
//   //       },
//   //     });
//   //   }

//   //   pipelineMap[pc.code] = pipeline.id;
//   //   stageMap[pc.code] = [];

//   //   // Seed stages for this pipeline
//   //   const existingStages = await prisma.rndtechnosoft_crm_stages.findMany({
//   //     where: { tenant_id: tenantId, pipeline_id: pipeline.id },
//   //     orderBy: { sort_order: 'asc' },
//   //   });

//   //   if (existingStages.length === 0) {
//   //     for (const stg of pc.stages) {
//   //       const stage = await prisma.rndtechnosoft_crm_stages.create({
//   //         data: {
//   //           id: randomUUID(),
//   //           tenant_id: tenantId,
//   //           pipeline_id: pipeline.id,
//   //           name: stg.name,
//   //           color: stg.color,
//   //           stage_probability: stg.prob,
//   //           sla_duration_hours: stg.sla,
//   //           sort_order: stg.sort,
//   //           is_won: stg.won,
//   //           is_lost: stg.lost,
//   //         },
//   //       });
//   //       stageMap[pc.code].push({ id: stage.id, isWon: stg.won, isLost: stg.lost });
//   //     }
//   //   } else {
//   //     for (const es of existingStages) {
//   //       stageMap[pc.code].push({ id: es.id, isWon: es.is_won, isLost: es.is_lost });
//   //     }
//   //   }
//   // }

//   // console.log(`✓ ${Object.keys(pipelineMap).length} pipelines with stages seeded.`);

//   // ═══════════════════════════════════════════════════════════════
//   // 6. LEAD SOURCES (12 industry-standard channels)
//   // ═══════════════════════════════════════════════════════════════
//   // const leadSources = [
//   //   { name: 'Inbound Website Contact Form', channel: 'INBOUND_WEB', sort: 1 },
//   //   { name: 'Meta Lead Ads (Facebook/Instagram)', channel: 'PAID_ADS', sort: 2 },
//   //   { name: 'Google Search Ads (PPC)', channel: 'PAID_ADS', sort: 3 },
//   //   { name: 'Google Organic / SEO', channel: 'ORGANIC', sort: 4 },
//   //   { name: 'LinkedIn Executive Outbound', channel: 'OUTBOUND', sort: 5 },
//   //   { name: 'LinkedIn Ads (Sponsored InMail)', channel: 'PAID_ADS', sort: 6 },
//   //   { name: 'IndiaMART Lead Inbox', channel: 'MARKETPLACE', sort: 7 },
//   //   { name: 'JustDial Premium Leads', channel: 'MARKETPLACE', sort: 8 },
//   //   { name: 'Clutch / GoodFirms / DesignRush', channel: 'DIRECTORY', sort: 9 },
//   //   { name: 'Client Referral & Word of Mouth', channel: 'REFERRAL', sort: 10 },
//   //   { name: 'Trade Show / Conference / Event', channel: 'EVENT', sort: 11 },
//   //   { name: 'Cold Outreach (Email/Phone)', channel: 'OUTBOUND', sort: 12 },
//   // ];

//   // const sourceMap: Record<string, string> = {};
//   // for (const src of leadSources) {
//   //   let existing = await prisma.rndtechnosoft_crm_lead_sources.findFirst({
//   //     where: { tenant_id: tenantId, name: src.name },
//   //   });
//   //   if (!existing) {
//   //     existing = await prisma.rndtechnosoft_crm_lead_sources.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         name: src.name,
//   //         channel: src.channel,
//   //         sort_order: src.sort,
//   //       },
//   //     });
//   //   }
//   //   sourceMap[src.channel + '_' + src.sort] = existing.id;
//   // }
//   // console.log(`✓ ${leadSources.length} lead sources seeded.`);

//   // ═══════════════════════════════════════════════════════════════
//   // 7. SERVICES MASTER (10 services with SAC codes)
//   // ═══════════════════════════════════════════════════════════════
//   const services = [
//     { name: 'Custom Full-Stack Web Application / SaaS MVP', category: 'Software Development', sac: '998314', rate: 350000, unit: 'MILESTONE', sort: 1 },
//     { name: 'Dedicated React / Next.js Developer Pod (2-4 devs)', category: 'Staff Augmentation', sac: '998313', rate: 250000, unit: 'MONTHLY', sort: 2 },
//     { name: 'Mobile App Development (React Native / Flutter)', category: 'Software Development', sac: '998314', rate: 400000, unit: 'MILESTONE', sort: 3 },
//     { name: 'B2B GST E-Commerce Platform Build (Shopify/Custom)', category: 'Web Development', sac: '998314', rate: 180000, unit: 'PROJECT', sort: 4 },
//     { name: 'SEO — High-Intent 20 Keyword Monthly Scaling', category: 'Digital Marketing', sac: '998361', rate: 45000, unit: 'MONTHLY', sort: 5 },
//     { name: 'Meta & Google Performance Marketing Campaign', category: 'Digital Marketing', sac: '998361', rate: 75000, unit: 'MONTHLY', sort: 6 },
//     { name: 'UI/UX Design — Complete Product Design System', category: 'Design', sac: '998314', rate: 120000, unit: 'PROJECT', sort: 7 },
//     { name: 'Cloud DevOps & 24/7 AMC Support (AWS/GCP)', category: 'Infrastructure', sac: '998315', rate: 55000, unit: 'MONTHLY', sort: 8 },
//     { name: 'Enterprise ERP / CRM Custom Implementation', category: 'Enterprise Software', sac: '998313', rate: 1200000, unit: 'MILESTONE', sort: 9 },
//     { name: 'AI/ML Integration & Data Analytics Dashboard', category: 'AI & Data', sac: '998314', rate: 500000, unit: 'MILESTONE', sort: 10 },
//   ];

//   const serviceMap: Record<string, string> = {};
//   for (const srv of services) {
//     let existing = await prisma.rndtechnosoft_crm_services_master.findFirst({
//       where: { tenant_id: tenantId, name: srv.name },
//     });
//     if (!existing) {
//       existing = await prisma.rndtechnosoft_crm_services_master.create({
//         data: {
//           id: randomUUID(),
//           tenant_id: tenantId,
//           name: srv.name,
//           category: srv.category,
//           sac_code: srv.sac,
//           default_rate: srv.rate,
//           billing_unit: srv.unit,
//           sort_order: srv.sort,
//         },
//       });
//     }
//     serviceMap[srv.sort.toString()] = existing.id;
//   }
//   console.log(`✓ ${services.length} services master seeded.`);

//   // ═══════════════════════════════════════════════════════════════
//   // 8. LOST REASONS MASTER (8 industry-standard reasons)
//   // ═══════════════════════════════════════════════════════════════
//   const lostReasons = [
//     { reason: 'Pricing Too High / Budget Exceeded', sort: 1 },
//     { reason: 'Competitor Chosen (Lower Price)', sort: 2 },
//     { reason: 'Competitor Chosen (Better Features)', sort: 3 },
//     { reason: 'Project Canceled / Budget Frozen', sort: 4 },
//     { reason: 'Went with In-House Team', sort: 5 },
//     { reason: 'No Response / Ghosted After Proposal', sort: 6 },
//     { reason: 'Timing Not Right — Revisit Later', sort: 7 },
//     { reason: 'Scope / Technology Mismatch', sort: 8 },
//   ];

//   const lostReasonMap: Record<number, string> = {};
//   for (const lr of lostReasons) {
//     let existing = await prisma.rndtechnosoft_crm_lost_reasons_master.findFirst({
//       where: { tenant_id: tenantId, reason_name: lr.reason },
//     });
//     if (!existing) {
//       existing = await prisma.rndtechnosoft_crm_lost_reasons_master.create({
//         data: {
//           id: randomUUID(),
//           tenant_id: tenantId,
//           reason_name: lr.reason,
//           sort_order: lr.sort,
//         },
//       });
//     }
//     lostReasonMap[lr.sort] = existing.id;
//   }
//   console.log(`✓ ${lostReasons.length} lost reasons seeded.`);

//   // ═══════════════════════════════════════════════════════════════
//   // 9. 30-DAY SOP STEPS: none seeded. A workspace starts on the default
//   //    outreach playbook and owns its own copy once it edits it in Masters.
//   // ═══════════════════════════════════════════════════════════════

//   // ═══════════════════════════════════════════════════════════════
//   // 10. OBJECTION STRATEGIES: none seeded. A workspace starts on the default
//   //     strategies and owns its own copy once it edits them in Masters.
//   // ═══════════════════════════════════════════════════════════════

//   // ═══════════════════════════════════════════════════════════════
//   // 11. INDUSTRY VERTICALS MASTER (5 verticals from spec)
//   // ═══════════════════════════════════════════════════════════════
//   // const industries = [
//   //   {
//   //     key: 'IT_SOFTWARE',
//   //     name: 'IT & Software Development',
//   //     tagline: 'Ship faster with dedicated offshore engineering pods',
//   //     portfolio: 'Built 40+ SaaS platforms, B2B portals, and mobile apps using React, Next.js, Node, and Flutter with CI/CD pipelines and NDA guarantees.',
//   //     tip: 'IT firms care about code quality, Git workflows, sprint velocity, and long-term maintainability — lead with engineering culture.',
//   //     audit: 'Offer a free codebase health audit: test coverage, bundle size, Lighthouse score, and dependency vulnerability scan.',
//   //   },
//   //   {
//   //     key: 'DIGITAL_MARKETING',
//   //     name: 'Digital Marketing & Creative Agencies',
//   //     tagline: 'Scale ROAS and reduce CPL with data-driven performance marketing',
//   //     portfolio: 'Managed ₹5Cr+ in annual ad spend across Meta, Google, and LinkedIn for 60+ agency clients with average 3.2x ROAS.',
//   //     tip: 'Agencies care about ROAS, creative variations, GTM/GA4 tracking accuracy, and CPL optimization — lead with numbers.',
//   //     audit: 'Offer a free GTM/GA4 tracking audit + competitor ad creative benchmarking report for their top 3 clients.',
//   //   },
//   //   {
//   //     key: 'HEALTHCARE',
//   //     name: 'Healthcare, Clinics & Hospitals',
//   //     tagline: 'Patient booking funnels and tele-consultation platforms built for compliance',
//   //     portfolio: 'Delivered NABH-aware patient management systems, doctor booking platforms, and tele-consultation video portals for 15+ healthcare groups.',
//   //     tip: 'Healthcare buyers need HIPAA/NABH compliance assurance, patient data privacy, and doctor personal branding solutions.',
//   //     audit: 'Offer a free website accessibility audit (WCAG 2.2 AA) + patient booking funnel conversion analysis.',
//   //   },
//   //   {
//   //     key: 'REAL_ESTATE',
//   //     name: 'Real Estate, Builders & Construction',
//   //     tagline: 'Convert inquiries to site visits with automated lead nurturing',
//   //     portfolio: 'Built lead management portals for 20+ real estate developers — automated WhatsApp follow-ups, virtual tour integrations, and broker commission trackers.',
//   //     tip: 'Real estate leads are high-volume, low-intent — emphasize speed-to-contact, WhatsApp automation, and site visit booking rates.',
//   //     audit: 'Offer a free landing page conversion audit + Google Ads quality score review for their active project campaigns.',
//   //   },
//   //   {
//   //     key: 'ECOMMERCE_D2C',
//   //     name: 'E-Commerce & D2C Brands',
//   //     tagline: 'Recover abandoned carts and scale beyond marketplace dependency',
//   //     portfolio: 'Built and scaled 30+ Shopify Plus, WooCommerce, and custom e-commerce stores with checkout optimization, abandoned cart recovery (avg 18% recovery rate), and performance marketing integration.',
//   //     tip: 'D2C founders care about AOV, LTV/CAC ratios, checkout conversion rates, and reducing dependency on Amazon/Flipkart — lead with unit economics.',
//   //     audit: 'Offer a free Shopify store speed audit + checkout abandonment funnel analysis with heatmap recommendations.',
//   //   },
//   // ];

//   // for (const ind of industries) {
//   //   const existing = await prisma.rndtechnosoft_crm_sop_industries_master.findFirst({
//   //     where: { tenant_id: tenantId, industry_key: ind.key },
//   //   });
//   //   if (!existing) {
//   //     await prisma.rndtechnosoft_crm_sop_industries_master.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         industry_key: ind.key,
//   //         name: ind.name,
//   //         tagline: ind.tagline,
//   //         portfolio_highlight: ind.portfolio,
//   //         value_tip: ind.tip,
//   //         audit_hook: ind.audit,
//   //       },
//   //     });
//   //   }
//   // }
//   // console.log(`✓ ${industries.length} industry verticals seeded.`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 12. RESOLVE TENANT MEMBER FOR ASSIGNMENTS
//   // // ═══════════════════════════════════════════════════════════════
//   // const members = await prisma.rndtechnosoft_tenant_members.findMany({
//   //   where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
//   //   take: 5,
//   // });

//   // const defaultMemberId = members.length > 0 ? members[0].id : undefined;
//   // const allSourceIds = Object.values(sourceMap);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 13. CRM LEADS (12 realistic leads across pipelines and stages)
//   // // ═══════════════════════════════════════════════════════════════

//   // // Helper to pick a source deterministically
//   // const pickSource = (idx: number) => allSourceIds[idx % allSourceIds.length];

//   // const softwareStages = stageMap['SOFTWARE_SERVICES'] || [];
//   // const dmStages = stageMap['DIGITAL_MARKETING'] || [];
//   // const amcStages = stageMap['AMC_RENEWALS'] || [];
//   // const erpStages = stageMap['ENTERPRISE_ERP'] || [];

//   // // const demoLeads = [
//   // //   // Pipeline: SOFTWARE_SERVICES
//   // //   {
//   // //     code: 'LEAD-2026-001', company: 'Zenith Logistics Ltd', first: 'Aarav', last: 'Sharma',
//   // //     email: 'aarav.sharma@zenithlogistics.in', phone: '+919820112233', whatsapp: '+919820112233',
//   // //     website: 'https://zenithlogistics.in', linkedin: 'https://linkedin.com/in/aaravsharma',
//   // //     designation: 'CTO', city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Logistics & Supply Chain', budget: 450000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 0, sourceIndex: 0,
//   // //     temp: 'HOT', score: 88, step: 1, urgency: 'IMMEDIATE',
//   // //     brief: 'Custom B2B dispatch management dashboard with real-time GPS driver tracking, automated route optimization, GST freight billing with e-way bill integration, and a driver mobile app.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-002', company: 'OmniHealth Clinics Pvt Ltd', first: 'Dr. Priya', last: 'Nair',
//   // //     email: 'priya.nair@omnihealth.org', phone: '+919711445566', whatsapp: '+919711445566',
//   // //     website: 'https://omnihealth.org', linkedin: 'https://linkedin.com/in/drpriyanair',
//   // //     designation: 'Managing Director', city: 'Bengaluru', state: 'Karnataka', country: 'IN',
//   // //     industry: 'Healthcare', budget: 280000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 2, sourceIndex: 1,
//   // //     temp: 'HOT', score: 92, step: 3, urgency: 'IMMEDIATE',
//   // //     brief: 'Multi-branch patient appointment scheduling with tele-consultation video portal, prescription management, and lab report integration. Must be NABH-aware with patient data encryption.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-003', company: 'Apex Digital Capital', first: 'Karan', last: 'Deshmukh',
//   // //     email: 'karan@apexdigital.co', phone: '+919988776655', whatsapp: '+919988776655',
//   // //     website: 'https://apexdigital.co', linkedin: 'https://linkedin.com/in/karandeshmukh',
//   // //     designation: 'Founder & CEO', city: 'Pune', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Fintech', budget: 750000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 3, sourceIndex: 4,
//   // //     temp: 'WARM', score: 74, step: 4, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Fintech compliance portal for invoice factoring platform — NBFC credit scoring engine, KYC/eKYC workflow, RBI regulatory reporting, and merchant onboarding self-serve dashboard.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-004', company: 'Skyline Architects & Interiors', first: 'Sunita', last: 'Verma',
//   // //     email: 'sunita@skylinearchitects.com', phone: '+919655443322', whatsapp: '+919655443322',
//   // //     website: 'https://skylinearchitects.com', designation: 'Partner',
//   // //     city: 'Ahmedabad', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Architecture & Design', budget: 180000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 4, sourceIndex: 9,
//   // //     temp: 'WARM', score: 81, step: 5, urgency: 'WITHIN_30_DAYS',
//   // //     brief: '3D portfolio showcase website with client milestone review portal, CAD/BIM file attachments, project timeline Gantt viewer, and automated invoice generation.',
//   // //     serviceSort: 7,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-005', company: 'GreenBasket Organics', first: 'Meera', last: 'Iyer',
//   // //     email: 'meera@greenbasket.in', phone: '+919876001122', whatsapp: '+919876001122',
//   // //     website: 'https://greenbasket.in', designation: 'Co-Founder',
//   // //     city: 'Chennai', state: 'Tamil Nadu', country: 'IN',
//   // //     industry: 'E-Commerce & D2C', budget: 220000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 1, sourceIndex: 3,
//   // //     temp: 'HOT', score: 85, step: 2, urgency: 'IMMEDIATE',
//   // //     brief: 'Shopify Plus migration from WooCommerce with custom subscription box module, abandoned cart WhatsApp recovery, and integration with Shiprocket + Razorpay.',
//   // //     serviceSort: 4,
//   // //   },
//   // //   // Pipeline: SOFTWARE_SERVICES — WON DEAL
//   // //   {
//   // //     code: 'LEAD-2026-006', company: 'Pinnacle EdTech Solutions', first: 'Rohit', last: 'Gupta',
//   // //     email: 'rohit@pinnacleedtech.com', phone: '+919123456789', whatsapp: '+919123456789',
//   // //     website: 'https://pinnacleedtech.com', designation: 'CEO',
//   // //     city: 'Delhi', state: 'Delhi', country: 'IN',
//   // //     industry: 'EdTech', budget: 550000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 6, sourceIndex: 4,
//   // //     temp: 'HOT', score: 98, step: 8, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: 'Full-stack LMS platform with live video classes, automated quiz grading, student performance analytics, parent dashboard, and Razorpay subscription billing.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   // Pipeline: SOFTWARE_SERVICES — LOST DEAL
//   // //   {
//   // //     code: 'LEAD-2026-007', company: 'QuickServe Restaurants', first: 'Ankit', last: 'Jain',
//   // //     email: 'ankit@quickserve.in', phone: '+919345678901',
//   // //     city: 'Jaipur', state: 'Rajasthan', country: 'IN',
//   // //     industry: 'Food & Beverage', budget: 120000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 7, sourceIndex: 6,
//   // //     temp: 'COLD', score: 32, step: 5, urgency: 'EXPLORATORY', isLost: true, lostReasonSort: 1,
//   // //     brief: 'QR-code based digital menu and table ordering system with kitchen display integration.',
//   // //     serviceSort: 4,
//   // //   },

//   // //   // Pipeline: DIGITAL_MARKETING
//   // //   {
//   // //     code: 'LEAD-2026-008', company: 'Luxe Furnishings India', first: 'Neha', last: 'Kapoor',
//   // //     email: 'neha@luxefurnishings.in', phone: '+919876112233', whatsapp: '+919876112233',
//   // //     website: 'https://luxefurnishings.in', designation: 'Marketing Director',
//   // //     city: 'Gurugram', state: 'Haryana', country: 'IN',
//   // //     industry: 'Home Furnishings & D2C', budget: 95000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 1, sourceIndex: 1,
//   // //     temp: 'HOT', score: 79, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Monthly SEO + Meta Ads retainer for luxury furniture D2C brand. Need to improve organic rankings for 25 high-intent keywords and reduce Meta CPL from ₹380 to under ₹180.',
//   // //     serviceSort: 5,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-009', company: 'ClearView Eye Hospital', first: 'Dr. Sanjay', last: 'Mehta',
//   // //     email: 'sanjay@clearvieweye.com', phone: '+919812345678',
//   // //     website: 'https://clearvieweye.com', designation: 'Chief Medical Director',
//   // //     city: 'Lucknow', state: 'Uttar Pradesh', country: 'IN',
//   // //     industry: 'Healthcare', budget: 65000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 2, sourceIndex: 7,
//   // //     temp: 'WARM', score: 68, step: 3, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Google Ads + SEO for LASIK and cataract surgery keywords in Lucknow region. Need patient booking funnel with WhatsApp follow-up automation.',
//   // //     serviceSort: 6,
//   // //   },

//   // //   // Pipeline: AMC_RENEWALS
//   // //   {
//   // //     code: 'LEAD-2026-010', company: 'Sterling Textile Mills', first: 'Vijay', last: 'Patel',
//   // //     email: 'vijay@sterlingtextiles.co.in', phone: '+919898776655',
//   // //     website: 'https://sterlingtextiles.co.in', designation: 'IT Manager',
//   // //     city: 'Surat', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Manufacturing & Textiles', budget: 55000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 1, sourceIndex: 9,
//   // //     temp: 'WARM', score: 60, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Annual maintenance contract renewal for their existing ERP portal and e-commerce B2B platform. Requires 24/7 uptime SLA, monthly security patches, and priority bug fixes.',
//   // //     serviceSort: 8,
//   // //   },

//   // //   // Pipeline: ENTERPRISE_ERP
//   // //   {
//   // //     code: 'LEAD-2026-011', company: 'NovaPharma India Ltd', first: 'Deepak', last: 'Rajput',
//   // //     email: 'deepak.rajput@novapharma.in', phone: '+919567890123', whatsapp: '+919567890123',
//   // //     website: 'https://novapharma.in', linkedin: 'https://linkedin.com/in/deepakrajput',
//   // //     designation: 'VP of Technology', city: 'Hyderabad', state: 'Telangana', country: 'IN',
//   // //     industry: 'Pharmaceutical', budget: 2500000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 2, sourceIndex: 10,
//   // //     temp: 'HOT', score: 71, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Enterprise pharmaceutical ERP — batch manufacturing, quality control (QC/QA), GMP compliance tracking, inventory management with expiry alerts, and multi-warehouse dispatch with e-invoicing.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-012', company: 'Bharat Construction Corp', first: 'Rajesh', last: 'Tiwari',
//   // //     email: 'rajesh@bharatconstruction.com', phone: '+919012345678',
//   // //     website: 'https://bharatconstruction.com', designation: 'General Manager',
//   // //     city: 'Nagpur', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Real Estate & Construction', budget: 1800000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 3, sourceIndex: 10,
//   // //     temp: 'WARM', score: 65, step: 3, urgency: 'EXPLORATORY',
//   // //     brief: 'Construction project management ERP with resource allocation, subcontractor billing, site progress tracking with photo evidence, and material procurement with PO/GRN workflows.',
//   // //     serviceSort: 9,
//   // //   },

//   // //   // ─── EXPANSION BATCH: full funnel coverage across all 26 stages ───
//   // //   // Pipeline: SOFTWARE_SERVICES (11 more leads)
//   // //   {
//   // //     code: 'LEAD-2026-013', company: 'Vertex Analytics Pvt Ltd', first: 'Rahul', last: 'Bansal',
//   // //     email: 'rahul@vertexanalytics.in', phone: '+919820556677', whatsapp: '+919820556677',
//   // //     website: 'https://vertexanalytics.in', designation: 'CTO',
//   // //     city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Data Analytics & AI', budget: 320000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 0, sourceIndex: 2,
//   // //     temp: 'WARM', score: 55, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Real-time business intelligence dashboard with predictive analytics for retail inventory forecasting, integrating with existing POS and ERP data sources.',
//   // //     serviceSort: 10,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-014', company: 'Coastal Seafood Exports', first: 'Thomas', last: 'Varghese',
//   // //     email: 'thomas@coastalseafood.in', phone: '+919846112200',
//   // //     website: 'https://coastalseafood.in', designation: 'Owner',
//   // //     city: 'Kochi', state: 'Kerala', country: 'IN',
//   // //     industry: 'Food Export & Trading', budget: 210000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 0, sourceIndex: 5,
//   // //     temp: 'COLD', score: 40, step: 1, urgency: 'EXPLORATORY',
//   // //     brief: 'B2B export order management portal with buyer catalog, HACCP compliance document repository, and shipment tracking for seafood export operations.',
//   // //     serviceSort: 4,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-015', company: 'Bright Minds Academy', first: 'Anjali', last: 'Rao',
//   // //     email: 'anjali.rao@brightminds.edu.in', phone: '+919755223344',
//   // //     website: 'https://brightminds.edu.in', designation: 'Director',
//   // //     city: 'Bhopal', state: 'Madhya Pradesh', country: 'IN',
//   // //     industry: 'Education & School Chain', budget: 275000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 0, sourceIndex: 7,
//   // //     temp: 'WARM', score: 58, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Multi-campus school management system with admissions workflow, fee collection with payment gateway, and parent-teacher communication app.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-016', company: 'Quantum Robotics Labs', first: 'Aditya', last: 'Kulkarni',
//   // //     email: 'aditya@quantumrobotics.in', phone: '+919822334455', whatsapp: '+919822334455',
//   // //     website: 'https://quantumrobotics.in', linkedin: 'https://linkedin.com/in/adityakulkarni',
//   // //     designation: 'Founder', city: 'Pune', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Robotics & Automation', budget: 620000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 1, sourceIndex: 0,
//   // //     temp: 'HOT', score: 80, step: 2, urgency: 'IMMEDIATE',
//   // //     brief: 'Computer-vision based defect detection dashboard for factory assembly lines, with AI/ML model integration, live camera feed analytics, and alerting system.',
//   // //     serviceSort: 10,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-017', company: 'Urban Nest Realty', first: 'Farhan', last: 'Sheikh',
//   // //     email: 'farhan@urbannestrealty.com', phone: '+919911223344',
//   // //     website: 'https://urbannestrealty.com', designation: 'GM Sales',
//   // //     city: 'Noida', state: 'Uttar Pradesh', country: 'IN',
//   // //     industry: 'Real Estate & Construction', budget: 340000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 1, sourceIndex: 9,
//   // //     temp: 'WARM', score: 62, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Property listing portal with virtual tour embeds, WhatsApp-integrated site visit booking, and broker commission tracking dashboard.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-018', company: 'Sapphire Jewellers Group', first: 'Ritu', last: 'Choudhary',
//   // //     email: 'ritu@sapphirejewellers.co.in', phone: '+919829445566', whatsapp: '+919829445566',
//   // //     website: 'https://sapphirejewellers.co.in', designation: 'CEO',
//   // //     city: 'Jaipur', state: 'Rajasthan', country: 'IN',
//   // //     industry: 'Jewellery & Luxury Retail', budget: 410000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 2, sourceIndex: 3,
//   // //     temp: 'HOT', score: 76, step: 3, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Custom e-commerce platform for made-to-order jewellery with 360° product viewer, live gold-rate pricing engine, and BIS hallmark certificate uploads.',
//   // //     serviceSort: 4,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-019', company: 'MedixCare Diagnostics', first: 'Dr. Suresh', last: 'Pillai',
//   // //     email: 'suresh.pillai@medixcare.in', phone: '+919840112233',
//   // //     website: 'https://medixcare.in', designation: 'COO',
//   // //     city: 'Chennai', state: 'Tamil Nadu', country: 'IN',
//   // //     industry: 'Healthcare — Diagnostics', budget: 480000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 3, sourceIndex: 1,
//   // //     temp: 'HOT', score: 83, step: 4, urgency: 'IMMEDIATE',
//   // //     brief: 'Multi-lab diagnostic report portal with home sample collection scheduling, digital report delivery, and integration with LIS (Lab Information System).',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-020', company: 'TransGlobal Freight Forwarders', first: 'Manoj', last: 'Bhatia',
//   // //     email: 'manoj@transglobalfreight.com', phone: '+919833004455', whatsapp: '+919833004455',
//   // //     website: 'https://transglobalfreight.com', designation: 'VP Operations',
//   // //     city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Logistics & Supply Chain', budget: 560000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 4, sourceIndex: 4,
//   // //     temp: 'WARM', score: 70, step: 5, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Freight forwarding operations suite — bill of lading generation, container tracking, customs documentation workflow, and client billing automation.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-021', company: 'Everest Adventure Gear', first: 'Tenzing', last: 'Lepcha',
//   // //     email: 'tenzing@everestgear.in', phone: '+919412556677', whatsapp: '+919412556677',
//   // //     website: 'https://everestgear.in', designation: 'Founder',
//   // //     city: 'Dehradun', state: 'Uttarakhand', country: 'IN',
//   // //     industry: 'E-Commerce & D2C', budget: 300000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 5, sourceIndex: 3,
//   // //     temp: 'HOT', score: 87, step: 6, urgency: 'IMMEDIATE',
//   // //     brief: 'D2C outdoor gear storefront with size/fit configurator, trek itinerary content hub, and subscription gear-rental module. SOW under final legal review.',
//   // //     serviceSort: 4,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-022', company: 'Crestline Hospitality Group', first: 'Vikram', last: 'Ahluwalia',
//   // //     email: 'vikram@crestlinehospitality.com', phone: '+919822009988', whatsapp: '+919822009988',
//   // //     website: 'https://crestlinehospitality.com', linkedin: 'https://linkedin.com/in/vikramahluwalia',
//   // //     designation: 'CEO', city: 'Panaji', state: 'Goa', country: 'IN',
//   // //     industry: 'Hospitality & Hotels', budget: 620000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 6, sourceIndex: 0,
//   // //     temp: 'HOT', score: 95, step: 8, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: 'Direct hotel booking engine with dynamic rate management, channel manager sync (Booking.com/MMT), and guest loyalty program across their 6-property chain.',
//   // //     serviceSort: 1,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-023', company: 'PixelCraft Studios', first: 'Nikhil', last: 'Wadhwa',
//   // //     email: 'nikhil@pixelcraftstudios.in', phone: '+919826112200',
//   // //     city: 'Indore', state: 'Madhya Pradesh', country: 'IN',
//   // //     industry: 'Design & Creative Studio', budget: 90000, currency: 'INR',
//   // //     pipelineCode: 'SOFTWARE_SERVICES', stageIndex: 7, sourceIndex: 11,
//   // //     temp: 'COLD', score: 28, step: 5, urgency: 'EXPLORATORY', isLost: true, lostReasonSort: 6,
//   // //     brief: 'Portfolio and case-study showcase website with client testimonial carousel and Behance/Dribbble sync.',
//   // //     serviceSort: 7,
//   // //   },

//   // //   // Pipeline: DIGITAL_MARKETING (8 more leads)
//   // //   {
//   // //     code: 'LEAD-2026-024', company: 'Radiant Skin Clinic', first: 'Dr. Kavita', last: 'Menon',
//   // //     email: 'kavita@radiantskinclinic.in', phone: '+919825667788',
//   // //     website: 'https://radiantskinclinic.in', designation: 'Marketing Head',
//   // //     city: 'Ahmedabad', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Healthcare — Dermatology', budget: 55000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 0, sourceIndex: 1,
//   // //     temp: 'WARM', score: 50, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Local SEO + Google Ads for a 4-branch dermatology and cosmetology clinic chain. Target: acne, hair transplant, and skin-whitening keyword clusters.',
//   // //     serviceSort: 6,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-025', company: 'Zest Organic Foods', first: 'Pooja', last: 'Shetty',
//   // //     email: 'pooja@zestorganic.in', phone: '+919845112233', whatsapp: '+919845112233',
//   // //     website: 'https://zestorganic.in', designation: 'Growth Manager',
//   // //     city: 'Bengaluru', state: 'Karnataka', country: 'IN',
//   // //     industry: 'FMCG & Organic Food D2C', budget: 70000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 0, sourceIndex: 3,
//   // //     temp: 'HOT', score: 68, step: 1, urgency: 'IMMEDIATE',
//   // //     brief: 'Full-funnel Meta + Google performance marketing for organic snacks D2C brand. Current ROAS 1.4x, target 3x within 90 days.',
//   // //     serviceSort: 5,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-026', company: 'TrueNorth Financial Advisors', first: 'Arvind', last: 'Krishnan',
//   // //     email: 'arvind@truenorthfa.com', phone: '+919833556677',
//   // //     website: 'https://truenorthfa.com', designation: 'CMO',
//   // //     city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Wealth Management & Finance', budget: 60000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 1, sourceIndex: 2,
//   // //     temp: 'WARM', score: 55, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'SEBI-compliant content marketing and SEO for a wealth advisory firm. Needs LinkedIn thought-leadership + organic lead-gen for HNI clients.',
//   // //     serviceSort: 6,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-027', company: 'Wanderlust Travel Co', first: 'Ishaan', last: 'Malhotra',
//   // //     email: 'ishaan@wanderlusttravel.in', phone: '+919999112233', whatsapp: '+919999112233',
//   // //     website: 'https://wanderlusttravel.in', designation: 'Founder',
//   // //     city: 'New Delhi', state: 'Delhi', country: 'IN',
//   // //     industry: 'Travel & Tourism', budget: 85000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 2, sourceIndex: 1,
//   // //     temp: 'HOT', score: 72, step: 3, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Seasonal Google Ads + SEO push for international holiday packages. Target: honeymoon and family-package high-intent search terms.',
//   // //     serviceSort: 5,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-028', company: 'Hearth & Home Furniture', first: 'Simran', last: 'Kaur',
//   // //     email: 'simran@hearthandhome.in', phone: '+919888112233',
//   // //     website: 'https://hearthandhome.in', designation: 'Marketing Director',
//   // //     city: 'Chandigarh', state: 'Punjab', country: 'IN',
//   // //     industry: 'Furniture & Home Decor Retail', budget: 95000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 3, sourceIndex: 6,
//   // //     temp: 'HOT', score: 78, step: 4, urgency: 'WITHIN_30_DAYS',
//   // //     brief: '8-showroom furniture chain requesting omnichannel SEO + Meta Ads retainer with festive-season campaign calendar. Budget approval in final internal review.',
//   // //     serviceSort: 6,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-029', company: 'Nimbus Cloud Kitchens', first: 'Rakesh', last: 'Yadav',
//   // //     email: 'rakesh@nimbuskitchens.in', phone: '+919980112233', whatsapp: '+919980112233',
//   // //     website: 'https://nimbuskitchens.in', linkedin: 'https://linkedin.com/in/rakeshyadav',
//   // //     designation: 'Co-Founder', city: 'Bengaluru', state: 'Karnataka', country: 'IN',
//   // //     industry: 'Food & Beverage — Cloud Kitchens', budget: 120000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 4, sourceIndex: 1,
//   // //     temp: 'HOT', score: 90, step: 6, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: '12-month performance marketing retainer for a 9-brand cloud kitchen network across Swiggy/Zomato and direct-ordering app acquisition.',
//   // //     serviceSort: 6,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-030', company: 'Aroma Wellness Spa Chain', first: 'Devika', last: 'Joshi',
//   // //     email: 'devika@aromawellness.in', phone: '+919922334455',
//   // //     website: 'https://aromawellness.in', designation: 'Marketing Manager',
//   // //     city: 'Pune', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Wellness & Spa', budget: 75000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 4, sourceIndex: 8,
//   // //     temp: 'HOT', score: 88, step: 6, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: 'SEO + Meta Ads retainer signed for a 5-outlet spa and wellness chain, targeting local intent keywords and membership package promotions.',
//   // //     serviceSort: 5,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-031', company: 'Velocity Auto Detailing', first: 'Yash', last: 'Solanki',
//   // //     email: 'yash@velocityautodetail.in', phone: '+919725112200',
//   // //     city: 'Surat', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Automotive Services', budget: 40000, currency: 'INR',
//   // //     pipelineCode: 'DIGITAL_MARKETING', stageIndex: 5, sourceIndex: 10,
//   // //     temp: 'COLD', score: 22, step: 2, urgency: 'EXPLORATORY', isLost: true, lostReasonSort: 4,
//   // //     brief: 'Local SEO and Instagram ads for a 2-outlet car detailing chain — project shelved after owner paused expansion plans.',
//   // //     serviceSort: 6,
//   // //   },

//   // //   // Pipeline: AMC_RENEWALS (6 more leads)
//   // //   {
//   // //     code: 'LEAD-2026-032', company: 'Horizon Freight Logistics', first: 'Sanjeev', last: 'Rathi',
//   // //     email: 'sanjeev@horizonfreight.in', phone: '+919820667788',
//   // //     website: 'https://horizonfreight.in', designation: 'IT Head',
//   // //     city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Logistics & Supply Chain', budget: 48000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 0, sourceIndex: 9,
//   // //     temp: 'WARM', score: 52, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'AMC renewal due for their freight management portal and driver mobile app — current contract expires in 3 weeks.',
//   // //     serviceSort: 8,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-033', company: 'GreenLeaf Agro Exports', first: 'Bharat', last: 'Chavan',
//   // //     email: 'bharat@greenleafagro.in', phone: '+919922556677',
//   // //     website: 'https://greenleafagro.in', designation: 'Operations Manager',
//   // //     city: 'Nashik', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Agriculture & Export', budget: 42000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 0, sourceIndex: 7,
//   // //     temp: 'WARM', score: 48, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Annual support renewal for their export order tracking portal and grower payment dashboard.',
//   // //     serviceSort: 8,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-034', company: 'Silverline Pharma Distributors', first: 'Ketan', last: 'Doshi',
//   // //     email: 'ketan@silverlinepharma.in', phone: '+919725667788',
//   // //     website: 'https://silverlinepharma.in', designation: 'IT Manager',
//   // //     city: 'Vadodara', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Pharmaceutical Distribution', budget: 60000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 1, sourceIndex: 9,
//   // //     temp: 'WARM', score: 58, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'AMC contact initiated for their distributor billing and inventory-expiry alert system — negotiating renewed SLA terms.',
//   // //     serviceSort: 8,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-035', company: 'Metro Realty Developers', first: 'Anand', last: 'Subramaniam',
//   // //     email: 'anand@metrorealty.in', phone: '+919845667788', whatsapp: '+919845667788',
//   // //     website: 'https://metrorealty.in', designation: 'IT Head',
//   // //     city: 'Bengaluru', state: 'Karnataka', country: 'IN',
//   // //     industry: 'Real Estate & Construction', budget: 65000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 2, sourceIndex: 10,
//   // //     temp: 'WARM', score: 63, step: 3, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Revised AMC quote sent for their property CRM and site-visit booking portal — upgraded from 8x5 to 24/7 SLA.',
//   // //     serviceSort: 8,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-036', company: 'Precision Auto Components Ltd', first: 'Girish', last: 'Kamath',
//   // //     email: 'girish@precisionauto.in', phone: '+919822667788', whatsapp: '+919822667788',
//   // //     website: 'https://precisionauto.in', designation: 'IT Director',
//   // //     city: 'Pune', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Manufacturing — Auto Components', budget: 72000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 3, sourceIndex: 9,
//   // //     temp: 'HOT', score: 85, step: 4, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: 'AMC renewal confirmed for their manufacturing ERP and vendor portal — upgraded to priority support tier with quarterly security audits.',
//   // //     serviceSort: 8,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-037', company: 'Coral Bay Resorts', first: 'Melissa', last: "D'Souza",
//   // //     email: 'melissa@coralbayresorts.in', phone: '+919933112200',
//   // //     city: 'Port Blair', state: 'Andaman and Nicobar Islands', country: 'IN',
//   // //     industry: 'Hospitality & Hotels', budget: 38000, currency: 'INR',
//   // //     pipelineCode: 'AMC_RENEWALS', stageIndex: 4, sourceIndex: 6,
//   // //     temp: 'COLD', score: 25, step: 3, urgency: 'EXPLORATORY', isLost: true, lostReasonSort: 2,
//   // //     brief: 'AMC renewal churned — resort switched to a local Andaman-based vendor offering a lower annual support price.',
//   // //     serviceSort: 8,
//   // //   },

//   // //   // Pipeline: ENTERPRISE_ERP (8 more leads)
//   // //   {
//   // //     code: 'LEAD-2026-038', company: 'Continental Steel Industries', first: 'Pramod', last: 'Agarwal',
//   // //     email: 'pramod.agarwal@continentalsteel.in', phone: '+919431112233',
//   // //     website: 'https://continentalsteel.in', designation: 'VP IT',
//   // //     city: 'Jamshedpur', state: 'Jharkhand', country: 'IN',
//   // //     industry: 'Manufacturing — Steel', budget: 3200000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 0, sourceIndex: 10,
//   // //     temp: 'WARM', score: 55, step: 1, urgency: 'EXPLORATORY',
//   // //     brief: 'Executive inquiry for a plant-wide production planning and quality management ERP across 3 steel manufacturing units.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-039', company: 'Meridian Insurance Group', first: 'Nitin', last: 'Kohli',
//   // //     email: 'nitin.kohli@meridianinsurance.in', phone: '+919833778899', whatsapp: '+919833778899',
//   // //     website: 'https://meridianinsurance.in', linkedin: 'https://linkedin.com/in/nitinkohli',
//   // //     designation: 'CTO', city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Insurance & Financial Services', budget: 4500000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 0, sourceIndex: 4,
//   // //     temp: 'HOT', score: 68, step: 1, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Executive inquiry for a policy administration and claims management platform with IRDAI-compliant audit trails and agent commission engine.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-040', company: 'Orion Auto Manufacturing', first: 'Harish', last: 'Reddy',
//   // //     email: 'harish.reddy@orionauto.in', phone: '+919840778899',
//   // //     website: 'https://orionauto.in', designation: 'VP Operations',
//   // //     city: 'Chennai', state: 'Tamil Nadu', country: 'IN',
//   // //     industry: 'Manufacturing — Automotive', budget: 2800000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 1, sourceIndex: 10,
//   // //     temp: 'WARM', score: 60, step: 2, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Stakeholder discovery workshops in progress for shop-floor production planning, JIT inventory, and supplier quality tracking ERP.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-041', company: 'Zenith Retail Chain', first: 'Abhishek', last: 'Bose',
//   // //     email: 'abhishek.bose@zenithretail.in', phone: '+919903112233', whatsapp: '+919903112233',
//   // //     website: 'https://zenithretail.in', designation: 'Head of IT',
//   // //     city: 'Kolkata', state: 'West Bengal', country: 'IN',
//   // //     industry: 'Retail — Supermarket Chain', budget: 3500000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 2, sourceIndex: 7,
//   // //     temp: 'HOT', score: 74, step: 3, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'Technical POC in progress for unified POS + inventory + loyalty ERP across a 200-store supermarket chain, with central warehouse replenishment logic.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-042', company: 'National Dairy Cooperative', first: 'Mahesh', last: 'Solanki',
//   // //     email: 'mahesh.solanki@nationaldairy.coop', phone: '+919909112233',
//   // //     website: 'https://nationaldairy.coop', designation: 'Director IT',
//   // //     city: 'Anand', state: 'Gujarat', country: 'IN',
//   // //     industry: 'Dairy & Agriculture Cooperative', budget: 5200000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 3, sourceIndex: 10,
//   // //     temp: 'WARM', score: 66, step: 4, urgency: 'WITHIN_30_DAYS',
//   // //     brief: 'RFP response submitted for a milk-procurement-to-distribution supply chain ERP covering 8,000+ village collection centers.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-043', company: 'Skyward Airlines Cargo', first: 'Rajat', last: 'Malhotra',
//   // //     email: 'rajat.malhotra@skywardcargo.in', phone: '+919818112233', whatsapp: '+919818112233',
//   // //     website: 'https://skywardcargo.in', linkedin: 'https://linkedin.com/in/rajatmalhotra',
//   // //     designation: 'VP Technology', city: 'New Delhi', state: 'Delhi', country: 'IN',
//   // //     industry: 'Aviation & Air Cargo Logistics', budget: 4800000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 4, sourceIndex: 4,
//   // //     temp: 'HOT', score: 79, step: 5, urgency: 'IMMEDIATE',
//   // //     brief: 'Cargo booking, customs manifest, and warehouse ERP in procurement and legal review — MSA and data-residency clauses under negotiation.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-044', company: 'Meghdoot Shipping Corporation', first: 'Captain Arjun', last: 'Nair',
//   // //     email: 'arjun.nair@meghdootshipping.in', phone: '+919821998877', whatsapp: '+919821998877',
//   // //     website: 'https://meghdootshipping.in', linkedin: 'https://linkedin.com/in/arjunnair',
//   // //     designation: 'CEO', city: 'Mumbai', state: 'Maharashtra', country: 'IN',
//   // //     industry: 'Maritime & Port Logistics', budget: 6500000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 5, sourceIndex: 4,
//   // //     temp: 'HOT', score: 96, step: 8, urgency: 'IMMEDIATE', isWon: true,
//   // //     brief: 'Enterprise port and vessel logistics ERP contract signed — container yard management, customs e-filing, and multi-currency billing across 4 ports.',
//   // //     serviceSort: 9,
//   // //   },
//   // //   {
//   // //     code: 'LEAD-2026-045', company: 'Falcon Defense Electronics', first: 'Colonel (Retd.) Vivek', last: 'Rana',
//   // //     email: 'vivek.rana@falcondefense.in', phone: '+919886112233',
//   // //     city: 'Bengaluru', state: 'Karnataka', country: 'IN',
//   // //     industry: 'Defense & Aerospace Manufacturing', budget: 5800000, currency: 'INR',
//   // //     pipelineCode: 'ENTERPRISE_ERP', stageIndex: 6, sourceIndex: 10,
//   // //     temp: 'COLD', score: 30, step: 4, urgency: 'EXPLORATORY', isLost: true, lostReasonSort: 3,
//   // //     brief: 'Defense-grade manufacturing ERP evaluation — lost to a competitor with existing MeitY empanelment and on-premise air-gapped deployment experience.',
//   // //     serviceSort: 9,
//   // //   },
//   // // ];

//   // const leadIdMap: Record<string, string> = {};

//   // for (const dl of demoLeads) {
//   //   const existing = await prisma.rndtechnosoft_crm_leads.findFirst({
//   //     where: { tenant_id: tenantId, lead_code: dl.code },
//   //   });

//   //   if (existing) {
//   //     leadIdMap[dl.code] = existing.id;
//   //     continue;
//   //   }

//   //   const pipelineId = pipelineMap[dl.pipelineCode];
//   //   const stages = stageMap[dl.pipelineCode] || [];
//   //   const stageEntry = stages[dl.stageIndex];
//   //   if (!pipelineId || !stageEntry) continue;

//   //   const lead = await prisma.rndtechnosoft_crm_leads.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_code: dl.code,
//   //       company_name: dl.company,
//   //       first_name: dl.first,
//   //       last_name: dl.last,
//   //       email: dl.email,
//   //       phone: dl.phone,
//   //       whatsapp_number: dl.whatsapp ?? null,
//   //       website_url: dl.website ?? null,
//   //       linkedin_url: dl.linkedin ?? null,
//   //       designation: dl.designation ?? null,
//   //       city: dl.city,
//   //       state: dl.state,
//   //       country_code: dl.country,
//   //       industry: dl.industry,
//   //       budget_amount: dl.budget,
//   //       currency_code: dl.currency,
//   //       pipeline_id: pipelineId,
//   //       stage_id: stageEntry.id,
//   //       source_id: pickSource(dl.sourceIndex),
//   //       assigned_tenant_member_id: defaultMemberId,
//   //       primary_service_id: serviceMap[dl.serviceSort.toString()] ?? null,
//   //       temperature: dl.temp,
//   //       ai_score: dl.score,
//   //       cadence_step: dl.step,
//   //       urgency: dl.urgency,
//   //       requirement_brief: dl.brief,
//   //       is_won: (dl as any).isWon ?? false,
//   //       is_lost: (dl as any).isLost ?? false,
//   //       lost_reason_id: (dl as any).lostReasonSort ? lostReasonMap[(dl as any).lostReasonSort] : null,
//   //       closed_at: (dl as any).isWon || (dl as any).isLost ? pastDate(5) : null,
//   //       stage_entered_at: pastDate(Math.floor(Math.random() * 14) + 1),
//   //       touchpoints_count: dl.step,
//   //       last_contacted_at: pastDate(dl.step > 3 ? 2 : 5),
//   //       next_followup_at: (dl as any).isWon || (dl as any).isLost ? null : futureDate(3),
//   //     },
//   //   });

//   //   leadIdMap[dl.code] = lead.id;

//   //   // Add initial activity for every lead
//   //   await prisma.rndtechnosoft_crm_lead_activities.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_id: lead.id,
//   //       activity_type: 'NOTE',
//   //       title: 'Lead Ingested & Enrolled in 30-Day Cadence',
//   //       description: `Initial requirement captured from ${dl.company}. Assigned to sales representative. ${dl.brief}`,
//   //       performed_by_tenant_member_id: defaultMemberId,
//   //     },
//   //   });
//   // }
//   // console.log(`✓ ${Object.keys(leadIdMap).length} CRM leads with activities seeded.`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 14. LEAD ACTIVITIES (additional multi-channel touchpoints)
//   // // ═══════════════════════════════════════════════════════════════
//   // const additionalActivities = [
//   //   { leadCode: 'LEAD-2026-001', type: 'CALL', title: 'Introductory Discovery Call — 18 min', desc: 'Discussed fleet size (120 trucks), current pain with manual dispatch. Decision maker confirmed. Budget approved by CFO.', duration: 1080, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-001', type: 'WHATSAPP', title: 'Sent company portfolio & logistics case study', desc: 'Shared 2-page PDF with GPS tracking demo screenshots and client testimonial video.' },
//   //   { leadCode: 'LEAD-2026-002', type: 'CALL', title: 'Requirement Deep-Dive — 25 min', desc: 'Dr. Nair walked through 3-branch workflow. Key needs: appointment scheduling, video consultation, lab integration. Compliance: NABH guidelines mandatory.', duration: 1500, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-002', type: 'EMAIL', title: 'Sent healthcare portfolio & compliance checklist', desc: 'Shared HIPAA/NABH compliance matrix and 3 healthcare client case studies with before/after metrics.' },
//   //   { leadCode: 'LEAD-2026-003', type: 'EMAIL', title: 'Sent fintech capability deck + RBI compliance brief', desc: 'Shared regulatory compliance architecture document and fintech case study with 2 NBFC implementations.' },
//   //   { leadCode: 'LEAD-2026-003', type: 'CALL', title: 'Technical Architecture Discussion — 30 min', desc: 'Discussed KYC/eKYC workflow, credit scoring API integrations, and RBI data localization requirements. CTO join call scheduled.', duration: 1800, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-005', type: 'WHATSAPP', title: 'Shared Shopify Plus migration case study', desc: 'Sent migration timeline breakdown and checkout optimization results — 22% improvement in conversion rate post-migration.' },
//   //   { leadCode: 'LEAD-2026-008', type: 'CALL', title: 'Marketing Audit Presentation — 20 min', desc: 'Presented GTM/GA4 audit findings. Current Meta CPL is ₹380 — proposed strategy to bring to ₹180. Neha confirmed budget for 6-month retainer.', duration: 1200, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-011', type: 'DEMO', title: 'Enterprise ERP Technical Demo — 45 min', desc: 'Demonstrated batch manufacturing module, QC/QA workflow, and inventory management. VP Technology and 3 department heads attended. POC requested.', duration: 2700, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-007', type: 'CALL', title: 'Follow-up Call — No Progress', desc: 'Ankit mentioned they found a cheaper local vendor. Price was the primary factor. Offered phased approach but declined.', duration: 600, disposition: 'NOT_INTERESTED' },

//   //   // Expansion batch — activity history for new leads
//   //   { leadCode: 'LEAD-2026-016', type: 'CALL', title: 'Founder Discovery Call — 22 min', desc: 'Aditya walked through the defect-detection use case, camera hardware already installed on 4 lines. Wants a working POC before committing budget.', duration: 1320, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-018', type: 'WHATSAPP', title: 'Shared jewellery e-commerce case study', desc: 'Sent before/after conversion metrics from a similar luxury retail build with live gold-rate pricing widget.' },
//   //   { leadCode: 'LEAD-2026-019', type: 'CALL', title: 'Requirement Validation Call — 28 min', desc: 'Confirmed LIS vendor (CrelioHealth) for integration. Dr. Pillai requested formal proposal by end of week.', duration: 1680, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-020', type: 'EMAIL', title: 'Sent revised commercial terms', desc: 'Reduced Phase 1 scope by 15% per negotiation ask; total contract value adjusted to ₹5,60,000 across 3 milestones.' },
//   //   { leadCode: 'LEAD-2026-021', type: 'CALL', title: 'Legal Review Sync — 15 min', desc: 'Discussed IP ownership clause and payment milestone schedule with their legal counsel. Redlines expected by Monday.', duration: 900, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-022', type: 'DEMO', title: 'Channel Manager Integration Demo — 40 min', desc: 'Demonstrated live sync with Booking.com and MakeMyTrip rate parity engine across all 6 properties. Deal closed on the call.', duration: 2400, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-023', type: 'EMAIL', title: 'Final follow-up — no response', desc: 'Third follow-up email sent with no reply after initial proposal. Marked as ghosted after 21 days of silence.', disposition: 'NOT_INTERESTED' },
//   //   { leadCode: 'LEAD-2026-027', type: 'CALL', title: 'Campaign Strategy Walkthrough — 18 min', desc: 'Presented seasonal campaign calendar for honeymoon packages. Ishaan requested a discount on the setup fee.', duration: 1080, disposition: 'INTERESTED' },
//   //   { leadCode: 'LEAD-2026-028', type: 'WHATSAPP', title: 'Sent festive campaign creative samples', desc: 'Shared 6 ad creative mockups for the Diwali furniture sale campaign for internal marketing committee review.' },
//   //   { leadCode: 'LEAD-2026-029', type: 'CALL', title: 'Retainer Kickoff Call — 30 min', desc: 'Confirmed 12-month scope across 9 cloud kitchen brands. First campaign batch (3 brands) to go live within 5 business days.', duration: 1800, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-030', type: 'WHATSAPP', title: 'Retainer signed — welcome kit sent', desc: 'Shared onboarding checklist, access request for Meta Business Manager, and GA4 property setup instructions.' },
//   //   { leadCode: 'LEAD-2026-031', type: 'CALL', title: 'Final Check-in — Project Paused', desc: 'Yash confirmed expansion plans shelved for the quarter; no budget approved. Tagged for re-engagement next quarter.', duration: 480, disposition: 'NOT_INTERESTED' },
//   //   { leadCode: 'LEAD-2026-035', type: 'EMAIL', title: 'Sent revised 24/7 SLA quote', desc: 'Upgraded AMC quote from 8x5 to 24/7 coverage with 2-hour critical-issue response time, as requested by IT Head.' },
//   //   { leadCode: 'LEAD-2026-036', type: 'CALL', title: 'Renewal Confirmation Call — 12 min', desc: 'Girish confirmed renewal at the priority support tier with quarterly security audits included. PO to follow.', duration: 720, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-037', type: 'EMAIL', title: 'Renewal declined — churn confirmed', desc: 'Melissa confirmed the resort moved to a local vendor offering a 30% lower annual price. Requested final data export.', disposition: 'NOT_INTERESTED' },
//   //   { leadCode: 'LEAD-2026-041', type: 'DEMO', title: 'POS + Inventory POC Walkthrough — 50 min', desc: 'Live POC demo covering central warehouse replenishment logic and loyalty points engine to Head of IT and 4 store-ops leads.', duration: 3000, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-042', type: 'EMAIL', title: 'Submitted formal RFP response', desc: 'Delivered 40-page RFP response covering 8,000+ village collection center rollout plan, phased over 14 months.' },
//   //   { leadCode: 'LEAD-2026-043', type: 'CALL', title: 'MSA Redline Discussion — 35 min', desc: 'Legal teams aligned on data-residency clause; pending sign-off from Skyward\'s compliance officer.', duration: 2100, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-044', type: 'CALL', title: 'Contract Signing Call — 20 min', desc: 'Captain Nair confirmed signature on the MSA for the 4-port rollout. Kick-off scheduled for next Monday.', duration: 1200, disposition: 'MEETING_FIXED' },
//   //   { leadCode: 'LEAD-2026-045', type: 'EMAIL', title: 'Deal lost — competitor selected', desc: 'Falcon Defense selected a MeitY-empanelled vendor with existing air-gapped deployment track record. Requested to stay in touch for future non-classified projects.', disposition: 'NOT_INTERESTED' },
//   // ];

//   // let activitiesCreated = 0;
//   // for (const act of additionalActivities) {
//   //   const leadId = leadIdMap[act.leadCode];
//   //   if (!leadId) continue;

//   //   const existingActivity = await prisma.rndtechnosoft_crm_lead_activities.findFirst({
//   //     where: { tenant_id: tenantId, lead_id: leadId, title: act.title },
//   //   });
//   //   if (existingActivity) continue;

//   //   await prisma.rndtechnosoft_crm_lead_activities.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_id: leadId,
//   //       activity_type: act.type,
//   //       title: act.title,
//   //       description: act.desc,
//   //       duration_seconds: act.duration ?? null,
//   //       call_disposition: act.disposition ?? null,
//   //       performed_by_tenant_member_id: defaultMemberId,
//   //     },
//   //   });
//   //   activitiesCreated++;
//   // }
//   // console.log(`✓ ${activitiesCreated} new activities created (${additionalActivities.length} defined).`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 15. FOLLOW-UPS (scheduled tasks for active leads)
//   // // ═══════════════════════════════════════════════════════════════
//   // const followups = [
//   //   { leadCode: 'LEAD-2026-001', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Call Aarav to confirm SOW review date. Prepare pricing comparison vs their current vendor.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-002', type: 'WHATSAPP', priority: 'HIGH', scheduledDaysFromNow: 0, instructions: 'Send Dr. Priya the NABH compliance checklist and schedule technical architecture walkthrough.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-003', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: 2, instructions: 'Follow up on the CTO meeting request. Send preliminary architecture diagram for the credit scoring engine.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-004', type: 'CALL', priority: 'MEDIUM', scheduledDaysFromNow: 3, instructions: 'Call Sunita to discuss revised scope with CAD file viewer integration. Confirm budget for Phase 1.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-005', type: 'WHATSAPP', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Share Shopify Plus migration timeline. Meera wants a detailed week-by-week breakdown with Go-Live date.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-008', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 0, instructions: 'Call Neha to close the 6-month retainer. She confirmed budget — send final proposal today.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-010', type: 'EMAIL', priority: 'LOW', scheduledDaysFromNow: 5, instructions: 'Send AMC renewal proposal with updated SLA terms and pricing for FY 2026-27.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-011', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 2, instructions: 'Follow up on POC request. Prepare a 2-week POC scope document for batch manufacturing module.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-012', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: 4, instructions: 'Send detailed RFP response with phased implementation timeline. Include reference from similar construction ERP project.', status: 'PENDING' },
//   //   // Completed follow-ups (past)
//   //   { leadCode: 'LEAD-2026-001', type: 'EMAIL', priority: 'HIGH', scheduledDaysFromNow: -3, instructions: 'Send logistics portfolio and GPS tracking case study.', status: 'COMPLETED', outcomeNote: 'Portfolio sent. Aarav responded positively — requested a call to discuss budget and timeline.' },
//   //   { leadCode: 'LEAD-2026-006', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: -7, instructions: 'Final negotiation call for LMS platform project.', status: 'COMPLETED', outcomeNote: 'Deal closed! SOW signed. Project kick-off scheduled for next Monday. Total deal value: ₹5,50,000.' },
//   //   { leadCode: 'LEAD-2026-009', type: 'WHATSAPP', priority: 'MEDIUM', scheduledDaysFromNow: -2, instructions: 'Send Google Ads proposal for LASIK keywords.', status: 'COMPLETED', outcomeNote: 'Proposal sent. Dr. Sanjay is reviewing with his marketing team. Follow-up call scheduled.' },

//   //   // Expansion batch — pending follow-ups for new leads
//   //   { leadCode: 'LEAD-2026-013', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: 2, instructions: 'Send BI dashboard capability deck with retail forecasting case study to Rahul.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-015', type: 'CALL', priority: 'MEDIUM', scheduledDaysFromNow: 3, instructions: 'Call Anjali to scope out number of campuses and fee-collection gateway preference.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-016', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Follow up on POC scope for defect-detection model — confirm camera hardware specs.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-017', type: 'WHATSAPP', priority: 'MEDIUM', scheduledDaysFromNow: 2, instructions: 'Share property-portal demo video with virtual tour and WhatsApp booking flow.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-018', type: 'EMAIL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Send solution design document with live gold-rate pricing architecture for Ritu\'s review.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-019', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 0, instructions: 'Call Dr. Pillai to confirm proposal received and address LIS integration questions.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-020', type: 'EMAIL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Send revised commercial terms confirmation and updated milestone schedule to Manoj.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-021', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 0, instructions: 'Chase SOW redlines from Tenzing\'s legal counsel — target signature this week.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-026', type: 'EMAIL', priority: 'LOW', scheduledDaysFromNow: 4, instructions: 'Send SEBI-compliant content marketing case study to Arvind for the audit call.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-027', type: 'WHATSAPP', priority: 'MEDIUM', scheduledDaysFromNow: 2, instructions: 'Follow up on discount request for the honeymoon package campaign setup fee.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-028', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Call Simran once internal budget committee approves — close the retainer this week.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-032', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: 3, instructions: 'Send AMC renewal reminder — current contract expires in 3 weeks.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-034', type: 'CALL', priority: 'MEDIUM', scheduledDaysFromNow: 2, instructions: 'Discuss revised SLA terms with Ketan for the pharma distributor billing system AMC.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-038', type: 'EMAIL', priority: 'LOW', scheduledDaysFromNow: 6, instructions: 'Send capability overview for multi-plant production planning ERP to Pramod.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-039', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Schedule stakeholder discovery workshop with Meridian\'s claims and underwriting teams.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-040', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: 3, instructions: 'Send discovery workshop summary and next-steps roadmap to Harish.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-042', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: 2, instructions: 'Follow up on RFP submission — confirm evaluation committee timeline with Mahesh.', status: 'PENDING' },
//   //   { leadCode: 'LEAD-2026-043', type: 'EMAIL', priority: 'HIGH', scheduledDaysFromNow: 1, instructions: 'Chase compliance officer sign-off on the data-residency clause with Rajat.', status: 'PENDING' },
//   //   // Expansion batch — completed follow-ups (history)
//   //   { leadCode: 'LEAD-2026-022', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: -4, instructions: 'Final channel-manager demo and close call with Vikram.', status: 'COMPLETED', outcomeNote: 'Deal closed! Contract signed for ₹6,20,000 across the 6-property chain. Kick-off scheduled.' },
//   //   { leadCode: 'LEAD-2026-029', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: -6, instructions: 'Retainer kickoff call — confirm scope and Meta Business Manager access.', status: 'COMPLETED', outcomeNote: '12-month retainer signed. First campaign batch (3 brands) live within 5 business days.' },
//   //   { leadCode: 'LEAD-2026-036', type: 'CALL', priority: 'MEDIUM', scheduledDaysFromNow: -3, instructions: 'Confirm AMC renewal at priority support tier.', status: 'COMPLETED', outcomeNote: 'Renewal confirmed with quarterly security audits included. PO received.' },
//   //   { leadCode: 'LEAD-2026-044', type: 'CALL', priority: 'HIGH', scheduledDaysFromNow: -2, instructions: 'Contract signing call for the 4-port ERP rollout.', status: 'COMPLETED', outcomeNote: 'MSA signed for ₹65,00,000. Kick-off scheduled for next Monday.' },
//   //   { leadCode: 'LEAD-2026-023', type: 'EMAIL', priority: 'LOW', scheduledDaysFromNow: -10, instructions: 'Third and final follow-up email before marking file closed.', status: 'COMPLETED', outcomeNote: 'No response after 21 days. Marked as ghosted and moved to Lost.' },
//   //   { leadCode: 'LEAD-2026-045', type: 'EMAIL', priority: 'MEDIUM', scheduledDaysFromNow: -5, instructions: 'Confirm outcome of the defense ERP vendor evaluation with Falcon Defense.', status: 'COMPLETED', outcomeNote: 'Lost to a MeitY-empanelled competitor. Requested to stay in touch for future non-classified work.' },
//   // ];

//   // let followupsCreated = 0;
//   // for (const fu of followups) {
//   //   const leadId = leadIdMap[fu.leadCode];
//   //   if (!leadId) continue;

//   //   const existingFollowup = await prisma.rndtechnosoft_crm_lead_followups.findFirst({
//   //     where: { tenant_id: tenantId, lead_id: leadId, instructions: fu.instructions },
//   //   });
//   //   if (existingFollowup) continue;

//   //   await prisma.rndtechnosoft_crm_lead_followups.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_id: leadId,
//   //       scheduled_at: fu.scheduledDaysFromNow >= 0 ? futureDate(fu.scheduledDaysFromNow) : pastDate(Math.abs(fu.scheduledDaysFromNow)),
//   //       followup_type: fu.type,
//   //       priority: fu.priority,
//   //       instructions: fu.instructions,
//   //       status: fu.status,
//   //       assigned_to_tenant_member_id: defaultMemberId,
//   //       completed_at: fu.status === 'COMPLETED' ? pastDate(Math.abs(fu.scheduledDaysFromNow)) : null,
//   //       outcome_note: (fu as any).outcomeNote ?? null,
//   //     },
//   //   });
//   //   followupsCreated++;
//   // }
//   // console.log(`✓ ${followupsCreated} new follow-ups created (${followups.length} defined).`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 16. MEETINGS (scheduled & completed)
//   // // ═══════════════════════════════════════════════════════════════
//   // const meetings = [
//   //   {
//   //     leadCode: 'LEAD-2026-002',
//   //     title: 'OmniHealth — Technical Architecture Review',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: 2,
//   //     link: 'https://meet.google.com/abc-defg-hij',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-003',
//   //     title: 'Apex Digital — CTO Technical Deep-Dive',
//   //     type: 'ZOOM',
//   //     scheduledDaysFromNow: 4,
//   //     link: 'https://zoom.us/j/1234567890',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-011',
//   //     title: 'NovaPharma — Enterprise ERP POC Kickoff',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: 5,
//   //     link: 'https://meet.google.com/klm-nopq-rst',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-006',
//   //     title: 'Pinnacle EdTech — SOW Signing & Project Kickoff',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: -5,
//   //     link: 'https://meet.google.com/uvw-xyz-123',
//   //     status: 'COMPLETED',
//   //     mom: 'Attendees: Rohit Gupta (CEO), Ravi Shah (Chief Architect), Dev Lead.\n\nKey Decisions:\n1. SOW signed for ₹5,50,000 — 3 milestone payments\n2. Phase 1 (LMS core + video classes) — 8 weeks\n3. Phase 2 (Analytics + parent dashboard) — 4 weeks\n4. Tech stack: Next.js + Node.js + PostgreSQL\n5. Weekly sprint reviews every Friday 3 PM\n\nAction Items:\n- Ravi: Share Figma wireframes by Wednesday\n- Rohit: Provide existing curriculum content by Friday\n- Dev Lead: Set up CI/CD pipeline and staging environment',
//   //     aiItems: ['Share Figma wireframes by Wednesday', 'Client to provide curriculum content by Friday', 'Set up CI/CD pipeline and staging environment', 'Schedule weekly sprint reviews — Fridays 3 PM'],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-001',
//   //     title: 'Zenith Logistics — Demo of GPS Tracking Module',
//   //     type: 'IN_PERSON',
//   //     scheduledDaysFromNow: -2,
//   //     status: 'COMPLETED',
//   //     mom: 'Attendees: Aarav Sharma (CTO), Fleet Manager, IT Head.\n\nKey Findings:\n1. Current fleet: 120 trucks, 45 mini-vans\n2. Pain: Manual dispatch takes 2 hours daily\n3. Budget confirmed: ₹4.5L for Phase 1\n4. Must integrate with existing Tally ERP for billing\n5. Go-live target: 3 months\n\nAction Items:\n- Send SOW with Tally integration scope by Thursday\n- Prepare mobile app wireframes for driver app\n- Schedule follow-up with their IT Head for API discussion',
//   //     aiItems: ['Send SOW with Tally integration scope by Thursday', 'Prepare mobile app wireframes for driver app', 'Schedule API discussion with IT Head'],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-008',
//   //     title: 'Luxe Furnishings — SEO + Meta Ads Strategy Presentation',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: 1,
//   //     link: 'https://meet.google.com/def-ghi-jkl',
//   //     status: 'SCHEDULED',
//   //   },

//   //   // Expansion batch — meetings for new leads
//   //   {
//   //     leadCode: 'LEAD-2026-016',
//   //     title: 'Quantum Robotics — Defect Detection POC Scoping',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: 3,
//   //     link: 'https://meet.google.com/qrl-poc1-abc',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-019',
//   //     title: 'MedixCare — LIS Integration Requirements Review',
//   //     type: 'ZOOM',
//   //     scheduledDaysFromNow: 2,
//   //     link: 'https://zoom.us/j/9988776655',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-039',
//   //     title: 'Meridian Insurance — Stakeholder Discovery Workshop',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: 6,
//   //     link: 'https://meet.google.com/mer-disc-001',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-041',
//   //     title: 'Zenith Retail — POS + Inventory POC Walkthrough',
//   //     type: 'IN_PERSON',
//   //     scheduledDaysFromNow: -1,
//   //     status: 'COMPLETED',
//   //     mom: 'Attendees: Abhishek Bose (Head of IT), 4 Store-Ops Leads, Solutions Architect.\n\nKey Findings:\n1. 200-store chain, central warehouse in Kolkata\n2. Current POS is on-premise, no real-time inventory sync\n3. Loyalty points engine must support tiered rewards\n4. Target rollout: pilot in 10 stores before full chain\n\nAction Items:\n- Prepare pilot-store rollout plan (10 stores)\n- Share central-warehouse replenishment architecture diagram\n- Draft SLA for 200-store 24/7 support',
//   //     aiItems: ['Prepare pilot-store rollout plan for 10 stores', 'Share replenishment architecture diagram', 'Draft 24/7 SLA proposal for full chain'],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-043',
//   //     title: 'Skyward Airlines Cargo — MSA Legal Review Call',
//   //     type: 'ZOOM',
//   //     scheduledDaysFromNow: 2,
//   //     link: 'https://zoom.us/j/5544332211',
//   //     status: 'SCHEDULED',
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-044',
//   //     title: 'Meghdoot Shipping — Contract Signing & Kickoff',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: -2,
//   //     link: 'https://meet.google.com/msc-sign-004',
//   //     status: 'COMPLETED',
//   //     mom: 'Attendees: Captain Arjun Nair (CEO), Ravi Shah (Chief Architect), Port Operations Head.\n\nKey Decisions:\n1. MSA signed for ₹65,00,000 — 4 milestone payments across 4 ports\n2. Phase 1: Mumbai + JNPT ports (5 months)\n3. Phase 2: Kandla + Mundra ports (4 months)\n4. Multi-currency billing engine required for international shipping lines\n5. Kick-off with full project team next Monday\n\nAction Items:\n- Share detailed project charter and RACI matrix by Wednesday\n- Client to provide port-authority API credentials\n- Schedule weekly steering committee call — Mondays 11 AM',
//   //     aiItems: ['Share project charter and RACI matrix', 'Client to provide port-authority API credentials', 'Schedule weekly steering committee call'],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-029',
//   //     title: 'Nimbus Cloud Kitchens — Retainer Kickoff & Access Setup',
//   //     type: 'GOOGLE_MEET',
//   //     scheduledDaysFromNow: -6,
//   //     status: 'COMPLETED',
//   //     mom: 'Attendees: Rakesh Yadav (Co-Founder), Account Manager.\n\nKey Decisions:\n1. 12-month retainer confirmed across 9 cloud-kitchen brands\n2. First campaign batch: 3 brands live within 5 business days\n3. Meta Business Manager and GA4 access shared\n4. Monthly performance review — first Monday of each month\n\nAction Items:\n- Set up GA4 conversion tracking for all 9 brands\n- Launch first campaign batch\n- Schedule monthly performance review cadence',
//   //     aiItems: ['Set up GA4 conversion tracking for all 9 brands', 'Launch first campaign batch (3 brands)', 'Schedule monthly performance review'],
//   //   },
//   // ];

//   // let meetingsCreated = 0;
//   // for (const mtg of meetings) {
//   //   const leadId = leadIdMap[mtg.leadCode];
//   //   if (!leadId) continue;

//   //   const existingMeeting = await prisma.rndtechnosoft_crm_meetings.findFirst({
//   //     where: { tenant_id: tenantId, lead_id: leadId, title: mtg.title },
//   //   });
//   //   if (existingMeeting) continue;

//   //   await prisma.rndtechnosoft_crm_meetings.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_id: leadId,
//   //       title: mtg.title,
//   //       meeting_type: mtg.type,
//   //       scheduled_at: mtg.scheduledDaysFromNow >= 0 ? futureDate(mtg.scheduledDaysFromNow) : pastDate(Math.abs(mtg.scheduledDaysFromNow)),
//   //       meeting_link: mtg.link ?? null,
//   //       status: mtg.status,
//   //       minutes_of_meeting: (mtg as any).mom ?? null,
//   //       ai_action_items: (mtg as any).aiItems ?? null,
//   //     },
//   //   });
//   //   meetingsCreated++;
//   // }
//   // console.log(`✓ ${meetingsCreated} new meetings created (${meetings.length} defined).`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 17. QUOTATIONS + LINE ITEMS (GST-compliant proposals)
//   // // ═══════════════════════════════════════════════════════════════
//   // const quotations = [
//   //   {
//   //     leadCode: 'LEAD-2026-003',
//   //     number: 'VGY-Q-2026-001',
//   //     taxMode: 'INTRA_STATE', clientState: 'Maharashtra', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 30,
//   //     notes: 'Phase 1 MVP scope for invoice factoring compliance portal. Includes KYC workflow, credit scoring engine shell, and admin dashboard.',
//   //     items: [
//   //       { desc: 'Fintech Compliance Portal — Phase 1 MVP Development', sac: '998314', qty: 1, rate: 500000, tax: 18 },
//   //       { desc: 'KYC/eKYC Workflow Integration (DigiLocker + Aadhaar)', sac: '998314', qty: 1, rate: 150000, tax: 18 },
//   //       { desc: 'UI/UX Design — Complete Figma Design System', sac: '998314', qty: 1, rate: 100000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-004',
//   //     number: 'VGY-Q-2026-002',
//   //     taxMode: 'INTER_STATE', clientState: 'Gujarat', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 30,
//   //     notes: 'Portfolio website with project management features. Includes 3D viewer integration and CAD file upload system.',
//   //     items: [
//   //       { desc: 'Portfolio Showcase Website — Design & Development', sac: '998314', qty: 1, rate: 120000, tax: 18 },
//   //       { desc: 'Client Milestone Review Portal + Gantt Viewer', sac: '998314', qty: 1, rate: 60000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-006',
//   //     number: 'VGY-Q-2026-003',
//   //     taxMode: 'INTER_STATE', clientState: 'Delhi', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'Full-stack LMS platform — accepted by Pinnacle EdTech. SOW signed, project kicked off.',
//   //     items: [
//   //       { desc: 'LMS Core Platform — Student Dashboard, Courses, Enrollment', sac: '998314', qty: 1, rate: 250000, tax: 18 },
//   //       { desc: 'Live Video Classes Module (WebRTC + Recording)', sac: '998314', qty: 1, rate: 150000, tax: 18 },
//   //       { desc: 'Automated Quiz Engine + Performance Analytics', sac: '998314', qty: 1, rate: 100000, tax: 18 },
//   //       { desc: 'Parent Dashboard & Notification System', sac: '998314', qty: 1, rate: 50000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-008',
//   //     number: 'VGY-Q-2026-004',
//   //     taxMode: 'INTER_STATE', clientState: 'Haryana', branchState: 'Maharashtra',
//   //     status: 'DRAFT', validDays: 15,
//   //     notes: '6-month digital marketing retainer proposal. SEO + Meta Ads for luxury furniture D2C brand.',
//   //     items: [
//   //       { desc: 'SEO — 25 High-Intent Keywords Monthly Optimization', sac: '998361', qty: 6, rate: 45000, tax: 18 },
//   //       { desc: 'Meta Performance Marketing — Campaign Management', sac: '998361', qty: 6, rate: 50000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-011',
//   //     number: 'VGY-Q-2026-005',
//   //     taxMode: 'INTER_STATE', clientState: 'Telangana', branchState: 'Maharashtra',
//   //     status: 'DRAFT', validDays: 45,
//   //     notes: 'Enterprise pharmaceutical ERP — comprehensive implementation proposal. Phased delivery over 9 months.',
//   //     items: [
//   //       { desc: 'ERP Core — Batch Manufacturing & Production Planning', sac: '998313', qty: 1, rate: 800000, tax: 18 },
//   //       { desc: 'Quality Control (QC/QA) & GMP Compliance Module', sac: '998313', qty: 1, rate: 500000, tax: 18 },
//   //       { desc: 'Inventory Management + Multi-Warehouse Dispatch', sac: '998313', qty: 1, rate: 400000, tax: 18 },
//   //       { desc: 'E-Invoicing & GST Return Integration', sac: '998314', qty: 1, rate: 200000, tax: 18 },
//   //       { desc: 'Training, UAT & Go-Live Support (3 months)', sac: '998313', qty: 1, rate: 300000, tax: 18 },
//   //     ],
//   //   },

//   //   // Expansion batch — full quotation lifecycle coverage (DRAFT/SENT/ACCEPTED/REJECTED/EXPIRED)
//   //   {
//   //     leadCode: 'LEAD-2026-019',
//   //     number: 'VGY-Q-2026-006',
//   //     taxMode: 'INTER_STATE', clientState: 'Tamil Nadu', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 30,
//   //     notes: 'Multi-lab diagnostic report portal — Phase 1 proposal covering home sample collection and LIS integration.',
//   //     items: [
//   //       { desc: 'Diagnostic Report Portal — Core Platform', sac: '998314', qty: 1, rate: 300000, tax: 18 },
//   //       { desc: 'Home Sample Collection Scheduling Module', sac: '998314', qty: 1, rate: 90000, tax: 18 },
//   //       { desc: 'LIS (Lab Information System) Integration', sac: '998314', qty: 1, rate: 90000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-020',
//   //     number: 'VGY-Q-2026-007',
//   //     taxMode: 'INTRA_STATE', clientState: 'Maharashtra', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 21,
//   //     notes: 'Freight forwarding operations suite — revised commercial terms under active negotiation.',
//   //     items: [
//   //       { desc: 'Bill of Lading & Container Tracking Module', sac: '998314', qty: 1, rate: 280000, tax: 18 },
//   //       { desc: 'Customs Documentation Workflow Automation', sac: '998314', qty: 1, rate: 150000, tax: 18 },
//   //       { desc: 'Client Billing & Invoicing Automation', sac: '998314', qty: 1, rate: 130000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-021',
//   //     number: 'VGY-Q-2026-008',
//   //     taxMode: 'INTER_STATE', clientState: 'Uttarakhand', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'D2C outdoor gear storefront with rental subscription module — accepted, under final SOW/legal review.',
//   //     items: [
//   //       { desc: 'D2C Storefront with Size/Fit Configurator', sac: '998314', qty: 1, rate: 180000, tax: 18 },
//   //       { desc: 'Trek Itinerary Content Hub', sac: '998314', qty: 1, rate: 60000, tax: 18 },
//   //       { desc: 'Subscription Gear-Rental Module', sac: '998314', qty: 1, rate: 60000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-022',
//   //     number: 'VGY-Q-2026-009',
//   //     taxMode: 'INTER_STATE', clientState: 'Goa', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'Direct booking engine + channel manager for 6-property hotel chain — accepted, deal won.',
//   //     items: [
//   //       { desc: 'Direct Booking Engine with Dynamic Rate Management', sac: '998314', qty: 1, rate: 320000, tax: 18 },
//   //       { desc: 'Channel Manager Sync (Booking.com / MakeMyTrip)', sac: '998314', qty: 1, rate: 180000, tax: 18 },
//   //       { desc: 'Guest Loyalty Program — 6 Properties', sac: '998314', qty: 1, rate: 120000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-023',
//   //     number: 'VGY-Q-2026-010',
//   //     taxMode: 'INTRA_STATE', clientState: 'Madhya Pradesh', branchState: 'Maharashtra',
//   //     status: 'REJECTED', validDays: -5,
//   //     notes: 'Portfolio showcase website proposal — rejected after prospect went cold and stopped responding.',
//   //     items: [
//   //       { desc: 'Portfolio & Case-Study Showcase Website', sac: '998314', qty: 1, rate: 70000, tax: 18 },
//   //       { desc: 'Behance/Dribbble Sync Integration', sac: '998314', qty: 1, rate: 20000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-027',
//   //     number: 'VGY-Q-2026-011',
//   //     taxMode: 'INTER_STATE', clientState: 'Delhi', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 15,
//   //     notes: 'Seasonal Google Ads + SEO campaign proposal for international holiday packages.',
//   //     items: [
//   //       { desc: 'Google Ads Campaign Setup & Management (3 Months)', sac: '998361', qty: 3, rate: 20000, tax: 18 },
//   //       { desc: 'SEO — Honeymoon & Family Package Keyword Cluster', sac: '998361', qty: 3, rate: 15000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-028',
//   //     number: 'VGY-Q-2026-012',
//   //     taxMode: 'INTER_STATE', clientState: 'Punjab', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 20,
//   //     notes: 'Omnichannel SEO + Meta Ads retainer for 8-showroom furniture chain — awaiting internal budget approval.',
//   //     items: [
//   //       { desc: 'Omnichannel SEO — 8 Showroom Locations (Monthly)', sac: '998361', qty: 6, rate: 35000, tax: 18 },
//   //       { desc: 'Meta Ads Festive Campaign Management (Monthly)', sac: '998361', qty: 6, rate: 25000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-029',
//   //     number: 'VGY-Q-2026-013',
//   //     taxMode: 'INTRA_STATE', clientState: 'Karnataka', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: '12-month performance marketing retainer for 9-brand cloud kitchen network — accepted and signed.',
//   //     items: [
//   //       { desc: 'Meta & Google Performance Marketing — 9 Brands (Monthly)', sac: '998361', qty: 12, rate: 8000, tax: 18 },
//   //       { desc: 'Direct-Ordering App Acquisition Campaign Setup', sac: '998361', qty: 1, rate: 24000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-030',
//   //     number: 'VGY-Q-2026-014',
//   //     taxMode: 'INTRA_STATE', clientState: 'Maharashtra', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'SEO + Meta Ads retainer for 5-outlet spa and wellness chain — accepted and signed.',
//   //     items: [
//   //       { desc: 'SEO — Local Intent Keywords, 5 Outlets (Monthly)', sac: '998361', qty: 6, rate: 20000, tax: 18 },
//   //       { desc: 'Meta Ads — Membership Package Promotions (Monthly)', sac: '998361', qty: 6, rate: 22500, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-031',
//   //     number: 'VGY-Q-2026-015',
//   //     taxMode: 'INTER_STATE', clientState: 'Gujarat', branchState: 'Maharashtra',
//   //     status: 'EXPIRED', validDays: -10,
//   //     notes: 'Local SEO + Instagram Ads proposal for 2-outlet auto detailing chain — expired, no response after expansion plans were paused.',
//   //     items: [
//   //       { desc: 'Local SEO — 2 Outlet Locations (Monthly)', sac: '998361', qty: 3, rate: 10000, tax: 18 },
//   //       { desc: 'Instagram Ads Campaign Management (Monthly)', sac: '998361', qty: 3, rate: 3333.33, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-035',
//   //     number: 'VGY-Q-2026-016',
//   //     taxMode: 'INTRA_STATE', clientState: 'Karnataka', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 15,
//   //     notes: 'Revised 24/7 AMC quote for property CRM and site-visit booking portal — upgraded SLA terms.',
//   //     items: [
//   //       { desc: 'AMC — 24/7 Priority Support (Annual)', sac: '998315', qty: 1, rate: 65000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-036',
//   //     number: 'VGY-Q-2026-017',
//   //     taxMode: 'INTRA_STATE', clientState: 'Maharashtra', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'AMC renewal at priority support tier with quarterly security audits — accepted and confirmed.',
//   //     items: [
//   //       { desc: 'AMC — Priority Support Tier (Annual)', sac: '998315', qty: 1, rate: 54000, tax: 18 },
//   //       { desc: 'Quarterly Security Audit (4x per Year)', sac: '998315', qty: 4, rate: 4500, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-042',
//   //     number: 'VGY-Q-2026-018',
//   //     taxMode: 'INTER_STATE', clientState: 'Gujarat', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 45,
//   //     notes: 'Milk-procurement-to-distribution supply chain ERP — formal RFP response, phased over 14 months.',
//   //     items: [
//   //       { desc: 'Village Collection Center Procurement Module', sac: '998313', qty: 1, rate: 1800000, tax: 18 },
//   //       { desc: 'Cold-Chain Distribution & Route Planning', sac: '998313', qty: 1, rate: 1500000, tax: 18 },
//   //       { desc: 'Farmer Payment & Cooperative Ledger System', sac: '998313', qty: 1, rate: 1000000, tax: 18 },
//   //       { desc: 'Training, UAT & Phased Go-Live Support', sac: '998313', qty: 1, rate: 900000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-043',
//   //     number: 'VGY-Q-2026-019',
//   //     taxMode: 'INTER_STATE', clientState: 'Delhi', branchState: 'Maharashtra',
//   //     status: 'SENT', validDays: 60,
//   //     notes: 'Cargo booking, customs manifest, and warehouse ERP — proposal in procurement and legal review.',
//   //     items: [
//   //       { desc: 'Cargo Booking & Customs Manifest Module', sac: '998313', qty: 1, rate: 1800000, tax: 18 },
//   //       { desc: 'Warehouse Management & Dispatch System', sac: '998313', qty: 1, rate: 1500000, tax: 18 },
//   //       { desc: 'Data Residency & Security Compliance Package', sac: '998313', qty: 1, rate: 1500000, tax: 18 },
//   //     ],
//   //   },
//   //   {
//   //     leadCode: 'LEAD-2026-044',
//   //     number: 'VGY-Q-2026-020',
//   //     taxMode: 'INTRA_STATE', clientState: 'Maharashtra', branchState: 'Maharashtra',
//   //     status: 'ACCEPTED', validDays: 30,
//   //     notes: 'Port and vessel logistics ERP across 4 ports — MSA signed, accepted.',
//   //     items: [
//   //       { desc: 'Container Yard Management System — 4 Ports', sac: '998313', qty: 1, rate: 2500000, tax: 18 },
//   //       { desc: 'Customs E-Filing Integration', sac: '998313', qty: 1, rate: 1500000, tax: 18 },
//   //       { desc: 'Multi-Currency Billing Engine', sac: '998313', qty: 1, rate: 1500000, tax: 18 },
//   //       { desc: 'Training, UAT & Phased Go-Live Support — 4 Ports', sac: '998313', qty: 1, rate: 1000000, tax: 18 },
//   //     ],
//   //   },
//   // ];

//   // let quotationsCreated = 0;
//   // for (const q of quotations) {
//   //   const leadId = leadIdMap[q.leadCode];
//   //   if (!leadId) continue;

//   //   const existingQuotation = await prisma.rndtechnosoft_crm_quotations.findFirst({
//   //     where: { tenant_id: tenantId, quotation_number: q.number },
//   //   });
//   //   if (existingQuotation) continue;

//   //   // Calculate totals
//   //   let subtotal = 0;
//   //   for (const item of q.items) {
//   //     subtotal += item.qty * item.rate;
//   //   }

//   //   const totalTaxRate = 0.18;
//   //   const totalTax = Math.round(subtotal * totalTaxRate * 100) / 100;
//   //   let cgst = 0, sgst = 0, igst = 0;

//   //   if (q.taxMode === 'INTRA_STATE') {
//   //     cgst = Math.round(totalTax / 2 * 100) / 100;
//   //     sgst = cgst;
//   //   } else if (q.taxMode === 'INTER_STATE') {
//   //     igst = totalTax;
//   //   }

//   //   const totalAmount = subtotal + totalTax;

//   //   const quotation = await prisma.rndtechnosoft_crm_quotations.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       lead_id: leadId,
//   //       quotation_number: q.number,
//   //       tax_mode: q.taxMode,
//   //       client_state: q.clientState,
//   //       branch_state: q.branchState,
//   //       subtotal,
//   //       cgst_amount: cgst,
//   //       sgst_amount: sgst,
//   //       igst_amount: igst,
//   //       total_tax: totalTax,
//   //       total_amount: totalAmount,
//   //       quotation_status: q.status,
//   //       valid_until: futureDate(q.validDays),
//   //       notes: q.notes,
//   //     },
//   //   });

//   //   // Create line items
//   //   for (let i = 0; i < q.items.length; i++) {
//   //     const item = q.items[i];
//   //     const lineAmount = item.qty * item.rate;
//   //     await prisma.rndtechnosoft_crm_quotation_items.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         quotation_id: quotation.id,
//   //         description: item.desc,
//   //         sac_code: item.sac,
//   //         quantity: item.qty,
//   //         unit_rate: item.rate,
//   //         tax_rate: item.tax,
//   //         line_amount: lineAmount,
//   //         sort_order: i + 1,
//   //       },
//   //     });
//   //   }
//   //   quotationsCreated++;
//   // }
//   // console.log(`✓ ${quotationsCreated} new quotations created (${quotations.length} defined) — ${quotations.reduce((sum, q) => sum + q.items.length, 0)} total line items across all defined quotations.`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 18. QUOTATION TEMPLATES (reusable proposal packages)
//   // // ═══════════════════════════════════════════════════════════════
//   // const templates = [
//   //   {
//   //     name: 'Standard Full-Stack SaaS MVP Package',
//   //     category: 'Software Development',
//   //     description: 'Complete SaaS MVP build — includes UI/UX design, frontend (React/Next.js), backend (Node.js), database setup, CI/CD pipeline, and 1 month of post-launch support.',
//   //     items: [
//   //       { description: 'UI/UX Design — Complete Figma Design System', sac_code: '998314', quantity: 1, unit_rate: 80000, tax_rate: 18 },
//   //       { description: 'Full-Stack Web Application Development', sac_code: '998314', quantity: 1, unit_rate: 250000, tax_rate: 18 },
//   //       { description: 'Cloud Infrastructure Setup (AWS/GCP) + CI/CD', sac_code: '998315', quantity: 1, unit_rate: 40000, tax_rate: 18 },
//   //       { description: 'Post-Launch Support & Bug Fixes (1 Month)', sac_code: '998313', quantity: 1, unit_rate: 30000, tax_rate: 18 },
//   //     ],
//   //   },
//   //   {
//   //     name: 'SEO Monthly Retainer — 20 Keywords',
//   //     category: 'Digital Marketing',
//   //     description: 'Monthly SEO optimization for 20 high-intent keywords — includes technical SEO audit, on-page optimization, content strategy, link building, and monthly reporting.',
//   //     items: [
//   //       { description: 'Technical SEO Audit & Fixes', sac_code: '998361', quantity: 1, unit_rate: 15000, tax_rate: 18 },
//   //       { description: 'On-Page SEO Optimization (20 Keywords)', sac_code: '998361', quantity: 1, unit_rate: 20000, tax_rate: 18 },
//   //       { description: 'Content Strategy & Blog Writing (4 Articles)', sac_code: '998361', quantity: 1, unit_rate: 10000, tax_rate: 18 },
//   //     ],
//   //   },
//   //   {
//   //     name: 'Shopify Plus E-Commerce Store Build',
//   //     category: 'Web Development',
//   //     description: 'Complete Shopify Plus store setup with custom theme, payment integration, shipping configuration, and checkout optimization.',
//   //     items: [
//   //       { description: 'Shopify Plus Theme Design & Development', sac_code: '998314', quantity: 1, unit_rate: 120000, tax_rate: 18 },
//   //       { description: 'Payment Gateway Integration (Razorpay + COD)', sac_code: '998314', quantity: 1, unit_rate: 25000, tax_rate: 18 },
//   //       { description: 'Shipping Integration (Shiprocket/Delhivery)', sac_code: '998314', quantity: 1, unit_rate: 20000, tax_rate: 18 },
//   //       { description: 'Checkout Optimization & Abandoned Cart Recovery', sac_code: '998314', quantity: 1, unit_rate: 15000, tax_rate: 18 },
//   //     ],
//   //   },
//   //   {
//   //     name: 'Enterprise ERP RFP Response Package',
//   //     category: 'Enterprise Software',
//   //     description: 'Comprehensive enterprise ERP proposal package for RFP responses — production planning, quality control, inventory, and multi-month training/go-live support.',
//   //     items: [
//   //       { description: 'ERP Core — Production Planning & Manufacturing', sac_code: '998313', quantity: 1, unit_rate: 800000, tax_rate: 18 },
//   //       { description: 'Quality Control (QC/QA) & Compliance Module', sac_code: '998313', quantity: 1, unit_rate: 500000, tax_rate: 18 },
//   //       { description: 'Inventory Management + Multi-Warehouse Dispatch', sac_code: '998313', quantity: 1, unit_rate: 400000, tax_rate: 18 },
//   //       { description: 'Training, UAT & Go-Live Support (3 Months)', sac_code: '998313', quantity: 1, unit_rate: 300000, tax_rate: 18 },
//   //     ],
//   //   },
//   //   {
//   //     name: 'Annual Maintenance Contract — Priority Support',
//   //     category: 'Infrastructure',
//   //     description: 'Standard AMC package for existing clients — 24/7 priority support, quarterly security audits, and monthly patching for web/ERP platforms.',
//   //     items: [
//   //       { description: 'AMC — 24/7 Priority Support (Annual)', sac_code: '998315', quantity: 1, unit_rate: 60000, tax_rate: 18 },
//   //       { description: 'Quarterly Security Audit (4x per Year)', sac_code: '998315', quantity: 4, unit_rate: 4500, tax_rate: 18 },
//   //       { description: 'Monthly Patching & Dependency Updates (12 Months)', sac_code: '998315', quantity: 12, unit_rate: 2000, tax_rate: 18 },
//   //     ],
//   //   },
//   // ];

//   // for (const tpl of templates) {
//   //   const existing = await prisma.rndtechnosoft_crm_quotation_templates.findFirst({
//   //     where: { tenant_id: tenantId, template_name: tpl.name },
//   //   });
//   //   if (!existing) {
//   //     await prisma.rndtechnosoft_crm_quotation_templates.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         template_name: tpl.name,
//   //         category: tpl.category,
//   //         description: tpl.description,
//   //         items_json: tpl.items,
//   //       },
//   //     });
//   //   }
//   // }
//   // console.log(`✓ ${templates.length} quotation templates seeded.`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 19. CONVERTED CLIENTS (Deal Won → Client Account)
//   // // ═══════════════════════════════════════════════════════════════
//   // const clients = [
//   //   {
//   //     code: 'CLT-2026-001',
//   //     company: 'Pinnacle EdTech Solutions',
//   //     contact: 'Rohit Gupta',
//   //     email: 'rohit@pinnacleedtech.com',
//   //     phone: '+919123456789',
//   //     gstin: '07AABCP1234L1ZH',
//   //     pan: 'AABCP1234L',
//   //     address: '42, Nehru Place, South Delhi, New Delhi — 110019',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-006',
//   //   },
//   //   {
//   //     code: 'CLT-2026-002',
//   //     company: 'Crestline Hospitality Group',
//   //     contact: 'Vikram Ahluwalia',
//   //     email: 'vikram@crestlinehospitality.com',
//   //     phone: '+919822009988',
//   //     gstin: '30AAECR5678M1Z2',
//   //     pan: 'AAECR5678M',
//   //     address: 'Crestline Plaza, Miramar Circle, Panaji, Goa — 403001',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-022',
//   //   },
//   //   {
//   //     code: 'CLT-2026-003',
//   //     company: 'Nimbus Cloud Kitchens',
//   //     contact: 'Rakesh Yadav',
//   //     email: 'rakesh@nimbuskitchens.in',
//   //     phone: '+919980112233',
//   //     gstin: '29AAJCN2345P1Z9',
//   //     pan: 'AAJCN2345P',
//   //     address: '18th Cross, HSR Layout, Bengaluru, Karnataka — 560102',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-029',
//   //   },
//   //   {
//   //     code: 'CLT-2026-004',
//   //     company: 'Aroma Wellness Spa Chain',
//   //     contact: 'Devika Joshi',
//   //     email: 'devika@aromawellness.in',
//   //     phone: '+919922334455',
//   //     gstin: '27AAKCA3456Q1Z4',
//   //     pan: 'AAKCA3456Q',
//   //     address: 'Aroma House, Koregaon Park, Pune, Maharashtra — 411001',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-030',
//   //   },
//   //   {
//   //     code: 'CLT-2026-005',
//   //     company: 'Precision Auto Components Ltd',
//   //     contact: 'Girish Kamath',
//   //     email: 'girish@precisionauto.in',
//   //     phone: '+919822667788',
//   //     gstin: '27AABCP7890R1Z7',
//   //     pan: 'AABCP7890R',
//   //     address: 'Plot 45, Chakan MIDC, Pune, Maharashtra — 410501',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-036',
//   //   },
//   //   {
//   //     code: 'CLT-2026-006',
//   //     company: 'Meghdoot Shipping Corporation',
//   //     contact: 'Captain Arjun Nair',
//   //     email: 'arjun.nair@meghdootshipping.in',
//   //     phone: '+919821998877',
//   //     gstin: '27AAFCM8901S1Z1',
//   //     pan: 'AAFCM8901S',
//   //     address: 'Shipping House, Ballard Estate, Mumbai, Maharashtra — 400001',
//   //     status: 'ACTIVE',
//   //     fromLeadCode: 'LEAD-2026-044',
//   //   },
//   // ];

//   // for (const cl of clients) {
//   //   const existing = await prisma.rndtechnosoft_crm_clients.findFirst({
//   //     where: { tenant_id: tenantId, client_code: cl.code },
//   //   });
//   //   if (!existing) {
//   //     const client = await prisma.rndtechnosoft_crm_clients.create({
//   //       data: {
//   //         id: randomUUID(),
//   //         tenant_id: tenantId,
//   //         client_code: cl.code,
//   //         company_name: cl.company,
//   //         contact_person: cl.contact,
//   //         email: cl.email,
//   //         phone: cl.phone,
//   //         gstin: cl.gstin,
//   //         pan: cl.pan,
//   //         billing_address: cl.address,
//   //         client_status: cl.status,
//   //         created_from_lead_id: leadIdMap[cl.fromLeadCode] ?? null,
//   //       },
//   //     });

//   //     // Update the lead's converted_client_id
//   //     const leadId = leadIdMap[cl.fromLeadCode];
//   //     if (leadId) {
//   //       await prisma.rndtechnosoft_crm_leads.update({
//   //         where: { id: leadId },
//   //         data: { converted_client_id: client.id, client_id: client.id, is_existing_client: true },
//   //       });
//   //     }
//   //   }
//   // }
//   // console.log(`✓ ${clients.length} converted client accounts seeded.`);

//   // // ═══════════════════════════════════════════════════════════════
//   // // 20. CRM AUDIT LOGS (sample audit trail entries)
//   // // ═══════════════════════════════════════════════════════════════
//   // const memberName = members.length > 0
//   //   ? (await prisma.rndtechnosoft_users.findFirst({ where: { id: members[0].user_id } }))?.display_name ?? 'System'
//   //   : 'System';

//   // const auditEntries = [
//   //   {
//   //     action: 'ADD', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-001'],
//   //     actorName: memberName,
//   //     diff: { company_name: { old: null, new: 'Zenith Logistics Ltd' }, budget_amount: { old: null, new: '450000' }, temperature: { old: null, new: 'HOT' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-002'],
//   //     actorName: memberName,
//   //     diff: { stage_id: { old: 'New Lead / Prospect', new: 'Solution Design & Estimation' }, ai_score: { old: '75', new: '92' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'QUOTATION', entityId: leadIdMap['LEAD-2026-003'],
//   //     actorName: memberName,
//   //     diff: { quotation_number: { old: null, new: 'VGY-Q-2026-001' }, total_amount: { old: null, new: '885000' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-006'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Contract & SOW Review', new: 'Deal Won — Hand-off to Ops' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-006'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-001' }, company_name: { old: null, new: 'Pinnacle EdTech Solutions' }, converted_from: { old: null, new: 'LEAD-2026-006' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-007'],
//   //     actorName: memberName,
//   //     diff: { is_lost: { old: 'false', new: 'true' }, lost_reason: { old: null, new: 'Pricing Too High / Budget Exceeded' }, stage: { old: 'Commercial Negotiation', new: 'Lost / Closed' } },
//   //   },

//   //   // Expansion batch — won/lost/quotation events for new leads
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-022'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Commercial Negotiation', new: 'Deal Won — Hand-off to Ops' }, budget_amount: { old: '620000', new: '620000' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-022'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-002' }, company_name: { old: null, new: 'Crestline Hospitality Group' }, converted_from: { old: null, new: 'LEAD-2026-022' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-029'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Budget Approval', new: 'Retainer Signed' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-029'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-003' }, company_name: { old: null, new: 'Nimbus Cloud Kitchens' }, converted_from: { old: null, new: 'LEAD-2026-029' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-030'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Budget Approval', new: 'Retainer Signed' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-030'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-004' }, company_name: { old: null, new: 'Aroma Wellness Spa Chain' }, converted_from: { old: null, new: 'LEAD-2026-030' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-036'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Revised Quote Sent', new: 'Renewal Confirmed' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-036'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-005' }, company_name: { old: null, new: 'Precision Auto Components Ltd' }, converted_from: { old: null, new: 'LEAD-2026-036' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-044'],
//   //     actorName: memberName,
//   //     diff: { is_won: { old: 'false', new: 'true' }, stage: { old: 'Procurement & Legal Review', new: 'Contract Signed' }, budget_amount: { old: '6500000', new: '6500000' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'CLIENT', entityId: leadIdMap['LEAD-2026-044'],
//   //     actorName: memberName,
//   //     diff: { client_code: { old: null, new: 'CLT-2026-006' }, company_name: { old: null, new: 'Meghdoot Shipping Corporation' }, converted_from: { old: null, new: 'LEAD-2026-044' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-023'],
//   //     actorName: memberName,
//   //     diff: { is_lost: { old: 'false', new: 'true' }, lost_reason: { old: null, new: 'No Response / Ghosted After Proposal' }, stage: { old: 'Lost / Closed', new: 'Lost / Closed' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-031'],
//   //     actorName: memberName,
//   //     diff: { is_lost: { old: 'false', new: 'true' }, lost_reason: { old: null, new: 'Project Canceled / Budget Frozen' }, stage: { old: 'Not Interested', new: 'Not Interested' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-037'],
//   //     actorName: memberName,
//   //     diff: { is_lost: { old: 'false', new: 'true' }, lost_reason: { old: null, new: 'Competitor Chosen (Lower Price)' }, stage: { old: 'Contact Initiated', new: 'Churned' } },
//   //   },
//   //   {
//   //     action: 'UPDATE', entity: 'LEAD', entityId: leadIdMap['LEAD-2026-045'],
//   //     actorName: memberName,
//   //     diff: { is_lost: { old: 'false', new: 'true' }, lost_reason: { old: null, new: 'Competitor Chosen (Better Features)' }, stage: { old: 'Procurement & Legal Review', new: 'Deal Lost' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'QUOTATION', entityId: leadIdMap['LEAD-2026-042'],
//   //     actorName: memberName,
//   //     diff: { quotation_number: { old: null, new: 'VGY-Q-2026-018' }, total_amount: { old: null, new: '6136000' } },
//   //   },
//   //   {
//   //     action: 'ADD', entity: 'QUOTATION', entityId: leadIdMap['LEAD-2026-044'],
//   //     actorName: memberName,
//   //     diff: { quotation_number: { old: null, new: 'VGY-Q-2026-020' }, total_amount: { old: null, new: '7670000' } },
//   //   },
//   // ];

//   // let auditLogsCreated = 0;
//   // for (const ae of auditEntries) {
//   //   if (!ae.entityId) continue;

//   //   const existingAudit = await prisma.rndtechnosoft_crm_audit_logs.findFirst({
//   //     where: { tenant_id: tenantId, entity_type: ae.entity, entity_id: ae.entityId, action_type: ae.action },
//   //   });
//   //   if (existingAudit) continue;

//   //   await prisma.rndtechnosoft_crm_audit_logs.create({
//   //     data: {
//   //       id: randomUUID(),
//   //       tenant_id: tenantId,
//   //       action_type: ae.action,
//   //       entity_type: ae.entity,
//   //       entity_id: ae.entityId,
//   //       actor_id: defaultMemberId ?? null,
//   //       actor_name: ae.actorName,
//   //       changes_diff: ae.diff,
//   //       ip_address: '103.21.244.0',
//   //     },
//   //   });
//   //   auditLogsCreated++;
//   // }
//   // console.log(`✓ ${auditLogsCreated} new audit log entries created (${auditEntries.length} defined).`);

//   // ═══════════════════════════════════════════════════════════════
//   console.log('\n══════════════════════════════════════════════════');
//   console.log('✅ Voogyo CRM & Sales Enterprise Seed — COMPLETE');
//   console.log('══════════════════════════════════════════════════');
//   // console.log(`   Pipelines:           ${Object.keys(pipelineMap).length}`);
//   console.log(`   Lead Sources:        ${leadSources.length}`);
//   console.log(`   Services Master:     ${services.length}`);
//   console.log(`   Lost Reasons:        ${lostReasons.length}`);
//   // console.log(`   Industry Verticals:  ${industries.length}`);
//   // console.log(`   Leads:               ${Object.keys(leadIdMap).length}`);
//   // console.log(`   Activities:          ${additionalActivities.length + Object.keys(leadIdMap).length}`);
//   // console.log(`   Follow-ups:          ${followups.length}`);
//   // console.log(`   Meetings:            ${meetings.length}`);
//   // console.log(`   Quotations:          ${quotations.length}`);
//   // console.log(`   Quotation Templates: ${templates.length}`);
//   // console.log(`   Clients:             ${clients.length}`);
//   // console.log(`   Audit Logs:          ${auditEntries.length}`);
//   // console.log('══════════════════════════════════════════════════\n');
// }

// main()
//   .catch((e) => {
//     console.error(e);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
