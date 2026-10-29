import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CandidateLetterDocumentsService } from '@/modules/onboarding/candidate-letter-documents.service';
import { OffersService } from '@/modules/onboarding/offers.service';
import { TemplatesService } from '@/modules/documents/templates.service';
import { DocumentPdfService } from '@/modules/documents/document-pdf.service';
import { DocumentDocxService } from '@/modules/documents/document-docx.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { AuditService } from '@/modules/audit/audit.service';
import { CandidatesService } from '@/modules/onboarding/candidates.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

describe('Offers and Onboarding Documents Integration Spec', () => {
  const prisma = new PrismaClient();
  let letterDocsService: CandidateLetterDocumentsService;
  let offersService: OffersService;
  let audit: AuditService;
  let templates: TemplatesService;
  let pdf: DocumentPdfService;
  let docx: DocumentDocxService;
  let letterheads: LetterheadsService;
  let candidates: CandidatesService;

  const tenantId = '74f9eb2a-25b2-48a6-972d-16359e24a85c';
  const harshitCandidateId = '958fe1ae-4acf-420c-8250-94dd71ea0556';
  let actor: AuthenticatedTenantUser;
  let testTemplateId: string;

  beforeAll(async () => {
    await prisma.$connect();

    const member = await prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, membership_status: 'ACTIVE' },
      include: { rndtechnosoft_users: true },
    });
    if (!member) throw new Error('Active tenant member not found.');

    actor = {
      userId: member.user_id,
      email: member.rndtechnosoft_users.email,
      displayName: member.rndtechnosoft_users.display_name,
      sessionId: randomUUID(),
      tenantId: member.tenant_id,
      tenantMemberId: member.id,
      roles: ['ADMIN'],
      mustChangePassword: false,
    };

    audit = new AuditService(prisma as any);
    pdf = new DocumentPdfService();
    docx = new DocumentDocxService();
    letterheads = new LetterheadsService(prisma as any, audit, { read: async () => Buffer.from('') } as any);
    templates = new TemplatesService(prisma as any, audit, letterheads, pdf);

    const mockMailer = {
      send: async (opts: any) => ({
        recipient: opts.to,
        status: 'SENT',
        duplicate: false,
        error: null,
      }),
    };

    const mockStorage = {
      save: async () => ({ key: 'test-key', sha256: 'test-hash' }),
      read: async () => Buffer.from('test-bytes'),
    };

    candidates = new CandidatesService(prisma as any, audit);
    const mockAccess = {
      assertHoldsAll: async () => undefined,
      getMemberPermissions: async () => ['onboarding.candidates.override', 'onboarding.view'],
    };

    letterDocsService = new CandidateLetterDocumentsService(
      prisma as any,
      audit,
      mockAccess as any,
      templates,
      pdf,
      docx,
      letterheads,
      mockMailer as any,
    );

    const mockDomains = {
      primaryFor: async () => ({ subdomain: 'app', fullDomain: 'app.localhost' }),
    };

    offersService = new OffersService(
      prisma as any,
      audit,
      mockAccess as any,
      candidates,
      mockMailer as any,
      pdf,
      mockStorage as any,
      mockDomains as any,
      letterheads,
    );

    // Pick an existing approved template
    const template = await prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, is_archived: false },
    });
    if (!template) throw new Error('No template found.');
    testTemplateId = template.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Requirement 1 & 4: Harshit Dhodi existing offers remain intact and untouched', async () => {
    const offers = await prisma.rndtechnosoft_offers.findMany({
      where: { candidate_id: harshitCandidateId, tenant_id: tenantId },
      orderBy: { offer_code: 'asc' },
    });

    expect(offers.length).toBe(2);

    const offer316 = offers.find((o) => o.offer_code === 'OFR-2026-316053');
    expect(offer316).toBeDefined();
    expect(offer316?.offer_status).toBe('WITHDRAWN');
    expect(offer316?.annual_ctc.toNumber()).toBe(400000);

    const offer504 = offers.find((o) => o.offer_code === 'OFR-2026-504320');
    expect(offer504).toBeDefined();
    expect(offer504?.offer_status).toBe('EXPIRED');
    expect(offer504?.job_title).toBe('Frontend Developer');
    expect(offer504?.annual_ctc.toNumber()).toBe(765000);
  });

  it('Requirement 7 & 8: Central Documents view lists all onboarding letters, while NDAs and appointment letters do not appear in Offers', async () => {
    // List all letter documents across workspace
    const docs = await letterDocsService.listAll(tenantId, { limit: 50, page: 1 }, actor);
    expect(docs.items.length).toBeGreaterThan(0);
    expect(docs.statusCounts).toBeDefined();
    expect(docs.typeCounts).toBeDefined();

    // Check that Harshit's NDA and appointment letters are present in Central Documents
    const harshitDocs = docs.items.filter((d) => d.candidate?.id === harshitCandidateId);
    expect(harshitDocs.length).toBeGreaterThanOrEqual(2);

    const appointmentDoc = harshitDocs.find((d) => d.documentType === 'CUSTOM_HR' || d.documentType === 'APPOINTMENT_LETTER');
    expect(appointmentDoc).toBeDefined();

    const ndaDoc = harshitDocs.find((d) => d.documentType === 'NDA');
    expect(ndaDoc).toBeDefined();

    // Verify Offers list does NOT contain NDA or Appointment letter documents
    const offersList = await offersService.list(tenantId, { limit: 50, page: 1 }, actor);
    expect(offersList.statusCounts).toBeDefined();
    expect(offersList.statusCounts.ALL).toBeGreaterThanOrEqual(2);
    expect(offersList.statusCounts.EXPIRED).toBeGreaterThanOrEqual(1);
    expect(offersList.statusCounts.WITHDRAWN).toBeGreaterThanOrEqual(1);

    for (const item of offersList.items) {
      if (item.document) {
        expect(item.document.type).toBe('OFFER_LETTER');
      }
    }
  });

  it('Requirement 2 & 5: When an offer letter is generated through Candidate Documents, an offer is created and linked without duplicates', async () => {
    // Generate a new test candidate to test live generation and syncing
    const newCandidate = await prisma.rndtechnosoft_candidates.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        candidate_code: `CAN-TEST-${Date.now().toString().slice(-6)}`,
        full_name: 'Test Candidate For Offer Sync',
        email: `test-offer-${Date.now()}@candidate.test`,
        candidate_status: 'SELECTED',
        applied_position: 'Full Stack Engineer',
        expected_salary: 850000,
      },
    });

    try {
      // 1. Generate & save OFFER_LETTER document for candidate
      const savedDoc = await letterDocsService.saveDocument(
        tenantId,
        newCandidate.id,
        {
          templateId: testTemplateId,
          documentTitle: 'Test Candidate - Offer Letter v1',
          documentType: 'OFFER_LETTER',
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Dear Test Candidate, we offer you INR 8,50,000 per year.' }],
              },
            ],
          },
        },
        actor,
      );

      expect(savedDoc.id).toBeDefined();
      expect(savedDoc.versionNumber).toBe(1);

      // 2. Verify that an offer was automatically created and linked to this document
      const linkedOffer = await prisma.rndtechnosoft_offers.findFirst({
        where: { tenant_id: tenantId, candidate_id: newCandidate.id },
      });
      expect(linkedOffer).toBeDefined();
      expect(linkedOffer?.candidate_document_id).toBe(savedDoc.id);
      expect(linkedOffer?.offer_status).toBe('DRAFT');
      expect(linkedOffer?.job_title).toBe('Full Stack Engineer');

      // 3. Requirement 3: Saving an updated version of the document updates the same offer without duplicating
      const updatedDoc = await letterDocsService.saveDocument(
        tenantId,
        newCandidate.id,
        {
          documentId: savedDoc.id,
          documentTitle: 'Test Candidate - Offer Letter v2',
          documentType: 'OFFER_LETTER',
          changelogNote: 'Updated benefits wording',
          document: {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Dear Test Candidate, updated compensation terms.' }],
              },
            ],
          },
        },
        actor,
      );

      expect(updatedDoc.versionNumber).toBe(2);

      // Verify no duplicate offer was created
      const allCandidateOffers = await prisma.rndtechnosoft_offers.findMany({
        where: { tenant_id: tenantId, candidate_id: newCandidate.id },
      });
      expect(allCandidateOffers.length).toBe(1);
      expect(allCandidateOffers[0].id).toBe(linkedOffer?.id);
      expect(allCandidateOffers[0].candidate_document_id).toBe(savedDoc.id);

      // 4. Verify Offers page listing returns the new offer with document preview
      const offersPage = await offersService.list(tenantId, { search: newCandidate.candidate_code, page: 1, limit: 10 }, actor);
      expect(offersPage.items.length).toBe(1);
      expect(offersPage.items[0].offerCode).toBe(linkedOffer?.offer_code);
      expect(offersPage.items[0].candidateDocumentId).toBe(savedDoc.id);
      expect(offersPage.items[0].document?.version).toBe(2);

      // 5. Verify Offer details view returns document version history and timeline
      const offerDetail = await offersService.get(tenantId, linkedOffer!.id, actor);
      expect(offerDetail.id).toBe(linkedOffer?.id);
      expect(offerDetail.candidateDocumentId).toBe(savedDoc.id);
      expect(offerDetail.document).toBeDefined();
      expect(offerDetail.document?.versions.length).toBe(2);

    } finally {
      const o = await prisma.rndtechnosoft_offers.findFirst({ where: { tenant_id: tenantId, candidate_id: newCandidate.id } });
      if (o) {
        await prisma.rndtechnosoft_offer_components.deleteMany({ where: { tenant_id: tenantId, offer_id: o.id } });
        await prisma.rndtechnosoft_offers.deleteMany({ where: { tenant_id: tenantId, id: o.id } });
      }
      const docs = await prisma.rndtechnosoft_candidate_documents.findMany({ where: { tenant_id: tenantId, candidate_id: newCandidate.id } });
      for (const d of docs) {
        await prisma.rndtechnosoft_candidate_document_versions.deleteMany({ where: { tenant_id: tenantId, document_id: d.id } });
      }
      await prisma.rndtechnosoft_candidate_documents.deleteMany({ where: { tenant_id: tenantId, candidate_id: newCandidate.id } });
      await prisma.rndtechnosoft_candidate_events.deleteMany({ where: { tenant_id: tenantId, candidate_id: newCandidate.id } });
      await prisma.rndtechnosoft_candidates.deleteMany({ where: { tenant_id: tenantId, id: newCandidate.id } });
    }
  });

  it('Requirement 4: Status filters return accurate counts and filtered records', async () => {
    const all = await offersService.list(tenantId, { page: 1, limit: 20 }, actor);
    expect(all.statusCounts).toBeDefined();
    expect(all.statusCounts.ALL).toBeGreaterThanOrEqual(2);

    const expired = await offersService.list(tenantId, { status: 'EXPIRED', page: 1, limit: 20 }, actor);
    expect(expired.items.every((o) => o.status === 'EXPIRED')).toBe(true);
    expect(expired.items.some((o) => o.offerCode === 'OFR-2026-504320')).toBe(true);

    const withdrawn = await offersService.list(tenantId, { status: 'WITHDRAWN', page: 1, limit: 20 }, actor);
    expect(withdrawn.items.every((o) => o.status === 'WITHDRAWN')).toBe(true);
    expect(withdrawn.items.some((o) => o.offerCode === 'OFR-2026-316053')).toBe(true);
  });
});
