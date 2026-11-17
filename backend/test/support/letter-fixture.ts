import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

/**
 * A workspace of its own for the letter and offer suites, so they never depend
 * on what happens to be in a developer's database: an active admin member,
 * the candidate Harshit Dhodi, an offer-letter template, two earlier offers
 * (one withdrawn, one expired), and an NDA and an appointment letter for him.
 * Everything is removed again by `cleanup`.
 */
export async function createLetterFixture(prisma: PrismaClient) {
  await removeLeftoverLetterFixtures(prisma);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const tenantId = randomUUID();
  const userId = randomUUID();
  const memberId = randomUUID();
  const candidateId = randomUUID();
  const templateId = randomUUID();
  const versionId = randomUUID();

  const cleanup = () => cleanupTenant(prisma, tenantId);
  try {
    await prisma.rndtechnosoft_tenants.create({ data: { id: tenantId, tenant_code: `LTR${suffix.toUpperCase()}`, legal_name: 'Rndtechnosoft Test Pvt Ltd', display_name: 'Rndtechnosoft' } });
    await prisma.rndtechnosoft_users.create({ data: { id: userId, email: `letters-${suffix}@rnd.test`, display_name: 'Letters Admin', user_status: 'ACTIVE' } });
    await prisma.rndtechnosoft_tenant_members.create({ data: { id: memberId, tenant_id: tenantId, user_id: userId, membership_status: 'ACTIVE', joined_at: new Date() } });
    const departmentId = randomUUID();
    await prisma.rndtechnosoft_departments.create({ data: { id: departmentId, tenant_id: tenantId, department_code: 'TECH', department_name: 'TECH' } });
    await prisma.rndtechnosoft_candidates.create({
      data: {
        id: candidateId, tenant_id: tenantId, candidate_code: 'CAN-2026-243723', full_name: 'Harshit Dhodi', email: 'harshit@rndtechnosoft.com', phone: '1234567890', department_id: departmentId,
        applied_position: 'Lead Full Stack Engineer', candidate_status: 'OFFER_SENT', created_by_tenant_member_id: memberId,
      },
    });
    await prisma.rndtechnosoft_document_templates.create({ data: { id: templateId, tenant_id: tenantId, template_name: 'Standard Offer Letter', template_kind: 'OFFER_LETTER' } });
    await prisma.rndtechnosoft_document_template_versions.create({
      data: {
        id: versionId, tenant_id: tenantId, template_id: templateId, version_number: 1, version_status: 'APPROVED', approved_by_tenant_member_id: memberId, approved_at: new Date(),
        title: 'Offer for {{candidate_name}}', body: 'Dear {{candidate_name}}, we offer you the role of {{job_title}}.', created_by_tenant_member_id: memberId,
      },
    });
    const offer = (code: string, status: string, title: string, ctc: number, createdAt: string) => ({
      id: randomUUID(), tenant_id: tenantId, candidate_id: candidateId, offer_code: code, template_version_id: versionId, job_title: title, annual_ctc: ctc,
      joining_date: new Date('2026-09-01'), expires_on: new Date('2026-08-15'), offer_status: status, created_at: new Date(createdAt),
    });
    await prisma.rndtechnosoft_offers.createMany({ data: [offer('OFR-2026-316053', 'WITHDRAWN', 'Full Stack Developer', 400000, '2026-07-01T00:00:00Z'), offer('OFR-2026-504320', 'EXPIRED', 'Frontend Developer', 765000, '2026-07-20T00:00:00Z')] });
    const letter = (type: string, title: string) => ({
      id: randomUUID(), tenant_id: tenantId, candidate_id: candidateId, document_title: title, document_type: type, document_status: 'DRAFT', version_number: 1,
      rendered_title: title, rendered_body: title, rendered_document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: title }] }] }, created_by_tenant_member_id: memberId,
    });
    await prisma.rndtechnosoft_candidate_documents.createMany({ data: [letter('NDA', 'Harshit Dhodi - NDA'), letter('APPOINTMENT_LETTER', 'Harshit Dhodi - Appointment')] });
  } catch (error) {
    // A half-made workspace is removed rather than left behind.
    await cleanup().catch(() => undefined);
    throw error;
  }

  return { tenantId, candidateId, memberId, cleanup };
}

/**
 * Removes workspaces left by runs that stopped before cleaning up. Only ones
 * over an hour old, so a suite running alongside keeps its own.
 */
export async function removeLeftoverLetterFixtures(prisma: PrismaClient) {
  const stale = new Date(Date.now() - 60 * 60 * 1000);
  const leftovers = await prisma.rndtechnosoft_tenants.findMany({ where: { tenant_code: { startsWith: 'LTR' }, legal_name: 'Rndtechnosoft Test Pvt Ltd', created_at: { lt: stale } }, select: { id: true } });
  for (const t of leftovers) await cleanupTenant(prisma, t.id);
}

async function cleanupTenant(prisma: PrismaClient, tenantId: string) {
  const scope = { tenant_id: tenantId };
  const users = await prisma.rndtechnosoft_tenant_members.findMany({ where: scope, select: { user_id: true } });
  await prisma.rndtechnosoft_offers.updateMany({ where: scope, data: { candidate_document_id: null } });
  await prisma.rndtechnosoft_candidate_document_emails.deleteMany({ where: scope });
  await prisma.rndtechnosoft_candidate_document_status_history.deleteMany({ where: scope });
  await prisma.rndtechnosoft_candidate_document_versions.deleteMany({ where: scope });
  await prisma.rndtechnosoft_candidate_documents.deleteMany({ where: scope });
  await prisma.rndtechnosoft_offer_components.deleteMany({ where: scope });
  await prisma.rndtechnosoft_offer_approvals.deleteMany({ where: scope });
  await prisma.rndtechnosoft_offers.deleteMany({ where: scope });
  await prisma.rndtechnosoft_candidate_events.deleteMany({ where: scope });
  await prisma.rndtechnosoft_candidates.deleteMany({ where: scope });
  await prisma.rndtechnosoft_departments.deleteMany({ where: scope });
  await prisma.rndtechnosoft_document_template_versions.deleteMany({ where: scope });
  await prisma.rndtechnosoft_document_templates.deleteMany({ where: scope });
  await prisma.rndtechnosoft_email_templates.deleteMany({ where: scope });
  await prisma.rndtechnosoft_audit_logs.deleteMany({ where: scope });
  await prisma.rndtechnosoft_tenant_members.deleteMany({ where: scope });
  await prisma.rndtechnosoft_tenants.deleteMany({ where: { id: tenantId } });
  await prisma.rndtechnosoft_users.deleteMany({ where: { id: { in: users.map((m) => m.user_id) }, email: { startsWith: 'letters-' } } });
}
