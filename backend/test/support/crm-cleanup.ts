import { PrismaService } from '@/prisma/prisma.service';

/** Removes every CRM row of the given test workspaces, children first. */
export async function deleteCrmData(prisma: PrismaService, tenantIds: string[]) {
  if (tenantIds.length === 0) return;
  const scope = { where: { tenant_id: { in: tenantIds } } };
  await prisma.rndtechnosoft_crm_quotation_items.deleteMany(scope);
  await prisma.rndtechnosoft_crm_quotations.deleteMany(scope);
  await prisma.rndtechnosoft_crm_meetings.deleteMany(scope);
  await prisma.rndtechnosoft_crm_lead_followups.deleteMany(scope);
  await prisma.rndtechnosoft_crm_lead_activities.deleteMany(scope);
  await prisma.rndtechnosoft_crm_clients.deleteMany(scope);
  await prisma.rndtechnosoft_crm_leads.deleteMany(scope);
  await prisma.rndtechnosoft_crm_audit_logs.deleteMany(scope);
  await prisma.rndtechnosoft_crm_quotation_templates.deleteMany(scope);
  await prisma.rndtechnosoft_crm_stages.deleteMany(scope);
  await prisma.rndtechnosoft_crm_pipelines.deleteMany(scope);
  await prisma.rndtechnosoft_crm_lead_sources.deleteMany(scope);
  await prisma.rndtechnosoft_crm_services_master.deleteMany(scope);
  await prisma.rndtechnosoft_crm_lost_reasons_master.deleteMany(scope);
  await prisma.rndtechnosoft_crm_sop_reply_branches_master.deleteMany(scope);
  await prisma.rndtechnosoft_crm_sop_steps_master.deleteMany(scope);
  await prisma.rndtechnosoft_crm_sop_industries_master.deleteMany(scope);
}
