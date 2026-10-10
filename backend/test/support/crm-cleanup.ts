import { PrismaService } from '@/prisma/prisma.service';

/** Removes every CRM row of the given test workspaces, children first. */
export async function deleteCrmData(prisma: PrismaService, tenantIds: string[]) {
  if (tenantIds.length === 0) return;
  const scope = { where: { tenant_id: { in: tenantIds } } };
  // Drip sequences hang off leads, stages and the workspace: removed first.
  await prisma.rndtechnosoft_email_sequence_rule_events.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_rules.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_events.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_sends.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_enrollments.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_stop_stages.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequence_steps.deleteMany(scope);
  await prisma.rndtechnosoft_email_sequences.deleteMany(scope);
  await prisma.rndtechnosoft_email_suppressions.deleteMany(scope);
  await prisma.rndtechnosoft_email_mailbox_scans.deleteMany(scope);
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
