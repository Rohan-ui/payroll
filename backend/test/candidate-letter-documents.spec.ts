import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { CandidateLetterDocumentsService } from '@/modules/onboarding/candidate-letter-documents.service';
import { TemplatesService } from '@/modules/documents/templates.service';
import { DocumentPdfService } from '@/modules/documents/document-pdf.service';
import { DocumentDocxService } from '@/modules/documents/document-docx.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { DocNode } from '@/modules/documents/rich-document';

describe('Candidate Letter Documents System', () => {
  const prisma = new PrismaClient();
  let service: CandidateLetterDocumentsService;
  let audit: AuditService;
  let templates: TemplatesService;
  let pdf: DocumentPdfService;
  let docx: DocumentDocxService;
  let letterheads: LetterheadsService;

  const tenantId = '74f9eb2a-25b2-48a6-972d-16359e24a85c';
  const harshitCandidateId = '958fe1ae-4acf-420c-8250-94dd71ea0556';
  let actor: AuthenticatedTenantUser;
  let testTemplateId: string;
  let createdDocId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Find an active tenant member to act as the actor
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
        sentFrom: 'hr@rndtechnosoft.com',
      }),
    };

    const mockAccess = {
      assertHoldsAll: async () => undefined,
      getMemberPermissions: async () => ['onboarding.candidates.override'],
    };

    service = new CandidateLetterDocumentsService(
      prisma as any,
      audit,
      mockAccess as any,
      templates,
      pdf,
      docx,
      letterheads,
      mockMailer as any,
    );

    // Create a test appointment letter template if none exists
    const existing = await prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, template_kind: 'APPOINTMENT_LETTER' },
    });

    if (existing) {
      testTemplateId = existing.id;
    } else {
      const templateId = randomUUID();
      const versionId = randomUUID();
      await prisma.rndtechnosoft_document_templates.create({
        data: {
          id: templateId,
          tenant_id: tenantId,
          template_name: 'Standard Appointment Letter',
          template_kind: 'APPOINTMENT_LETTER',
          rndtechnosoft_document_template_versions: {
            create: {
              id: versionId,
              version_number: 1,
              version_status: 'APPROVED',
              approved_by_tenant_member_id: member.id,
              approved_at: new Date(),
              title: 'Appointment as {{designation}}',
              body: 'Dear {{candidate_name}}, we are pleased to appoint you as {{designation}}.',
              body_document: {
                type: 'doc',
                content: [
                  {
                    type: 'heading',
                    attrs: { level: 1 },
                    content: [{ type: 'text', text: 'Appointment Letter' }],
                  },
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'Dear ' },
                      { type: 'placeholder', attrs: { key: 'candidate_name' } },
                      { type: 'text', text: ' (ID: ' },
                      { type: 'placeholder', attrs: { key: 'candidate_id' } },
                      { type: 'text', text: '), you are appointed as ' },
                      { type: 'placeholder', attrs: { key: 'designation' } },
                      { type: 'text', text: ' in the ' },
                      { type: 'placeholder', attrs: { key: 'department' } },
                      { type: 'text', text: ' department.' },
                    ],
                  },
                ],
              },
              page_size: 'A4',
              margin_top_mm: 20,
              margin_right_mm: 20,
              margin_bottom_mm: 20,
              margin_left_mm: 20,
              show_page_numbers: true,
              created_by_tenant_member_id: member.id,
            },
          },
        },
      });
      testTemplateId = templateId;
    }
  });

  afterAll(async () => {
    if (createdDocId) {
      await prisma.rndtechnosoft_candidate_document_emails.deleteMany({
        where: { tenant_id: tenantId, document_id: createdDocId },
      });
      await prisma.rndtechnosoft_candidate_document_status_history.deleteMany({
        where: { tenant_id: tenantId, document_id: createdDocId },
      });
      await prisma.rndtechnosoft_candidate_document_versions.deleteMany({
        where: { tenant_id: tenantId, document_id: createdDocId },
      });
      await prisma.rndtechnosoft_candidate_documents.deleteMany({
        where: { tenant_id: tenantId, id: createdDocId },
      });
    }
    await prisma.$disconnect();
  });

  it('Requirement 1: lists all available templates dynamically across multiple document kinds', async () => {
    const list = await service.listAvailableTemplates(tenantId);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    // Verify properties
    const sample = list[0];
    expect(sample).toHaveProperty('id');
    expect(sample).toHaveProperty('name');
    expect(sample).toHaveProperty('kind');
    expect(sample).toHaveProperty('kindLabel');
    expect(sample).toHaveProperty('category');
    expect(sample).toHaveProperty('hasWording');
  });

  it('Requirement 2: resolves candidate placeholders and detects missing fields gracefully', async () => {
    const info = await service.getCandidatePlaceholderValues(tenantId, harshitCandidateId);
    expect(info).toHaveProperty('placeholders');
    expect(info).toHaveProperty('missingFields');

    // Harshit Dhodi data verification
    expect(info.placeholders.candidate_name).toBe('Harshit Dhodi');
    expect(info.placeholders.candidate_id).toBe('CAN-2026-243723');
    expect(info.placeholders.candidate_email).toBe('harshit@rndtechnosoft.com');
    expect(info.placeholders.candidate_phone).toBe('1234567890');
    expect(info.placeholders.department).toBe('TECH');
    expect(info.placeholders.designation).toBe('Frontend Developer');
  });

  it('Requirement 2: generates candidate document with replaced placeholders', async () => {
    const generated = await service.generateDocument(tenantId, harshitCandidateId, {
      templateId: testTemplateId,
    });

    expect(generated).toHaveProperty('documentTitle');
    expect(generated).toHaveProperty('document');
    expect(generated.document).toHaveProperty('type', 'doc');

    // Verify document contains Harshit's name in replaced text
    const docString = JSON.stringify(generated.document);
    expect(docString).toContain('Harshit Dhodi');
    expect(docString).toContain('CAN-2026-243723');
  });

  it('Requirement 4: saves the edited document permanently in the database', async () => {
    const generated = await service.generateDocument(tenantId, harshitCandidateId, {
      templateId: testTemplateId,
    });

    // Simulate rich-text edits by user
    const editedDoc: DocNode = JSON.parse(JSON.stringify(generated.document));
    editedDoc.content = [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: 'Official Appointment Letter - Harshit Dhodi' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Dear Harshit Dhodi, welcome to Rndtechnosoft as Lead Full Stack Engineer. We are thrilled to have you.' },
        ],
      },
    ];

    const saved = await service.saveDocument(
      tenantId,
      harshitCandidateId,
      {
        templateId: generated.templateId,
        templateVersionId: generated.templateVersionId,
        documentTitle: 'Harshit Dhodi - Appointment Letter',
        documentType: generated.documentType,
        document: editedDoc as any,
        documentStatus: 'DRAFT',
      },
      actor,
    );

    expect(saved).toHaveProperty('id');
    expect(saved.documentTitle).toBe('Harshit Dhodi - Appointment Letter');
    expect(saved.versionNumber).toBe(1);
    createdDocId = saved.id;

    // Verify persistence in database
    const inDb = await prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { id: createdDocId, tenant_id: tenantId },
    });
    expect(inDb).not.toBeNull();
    expect(inDb?.document_title).toBe('Harshit Dhodi - Appointment Letter');
    expect(inDb?.candidate_id).toBe(harshitCandidateId);
  });

  it('Requirement 4: reopening a saved document loads the latest saved edits, not the template', async () => {
    const retrieved = await service.get(tenantId, harshitCandidateId, createdDocId);
    expect(retrieved.id).toBe(createdDocId);
    expect(retrieved.documentTitle).toBe('Harshit Dhodi - Appointment Letter');

    const docString = JSON.stringify(retrieved.document);
    expect(docString).toContain('Official Appointment Letter - Harshit Dhodi');
    expect(docString).toContain('We are thrilled to have you');
  });

  it('Requirement 4: updating the saved document increments version and preserves history without creating duplicate documents', async () => {
    const updatedDoc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Official Appointment Letter - Harshit Dhodi (Revised)' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Updated terms: reporting date confirmed.' }],
        },
      ],
    };

    const updated = await service.updateDocument(
      tenantId,
      harshitCandidateId,
      createdDocId,
      {
        documentTitle: 'Harshit Dhodi - Appointment Letter (Revised)',
        document: updatedDoc as any,
        changelogNote: 'Revised appointment letter',
      },
      actor,
    );

    expect(updated.id).toBe(createdDocId); // Same document ID (no duplicate created!)
    expect(updated.versionNumber).toBe(2);

    // Verify version snapshot was created
    const versions = await prisma.rndtechnosoft_candidate_document_versions.findMany({
      where: { document_id: createdDocId, tenant_id: tenantId },
    });
    expect(versions.length).toBeGreaterThanOrEqual(1);

    // Verify doc count for candidate did not increase
    const docs = await service.listForCandidate(tenantId, harshitCandidateId);
    const matches = docs.filter((d) => d.id === createdDocId);
    expect(matches.length).toBe(1);
  });

  it('Requirement 3: duplicate version suppression when saving unchanged content', async () => {
    const current = await service.get(tenantId, harshitCandidateId, createdDocId);
    const versionCountBefore = (await service.listVersions(tenantId, harshitCandidateId, createdDocId)).length;

    // Save identical content without changes
    const updated = await service.updateDocument(
      tenantId,
      harshitCandidateId,
      createdDocId,
      {
        documentTitle: current.documentTitle,
        document: current.document as any,
        expectedVersionNumber: current.versionNumber,
      },
      actor,
    );

    expect(updated.versionNumber).toBe(current.versionNumber); // Not incremented!
    const versionCountAfter = (await service.listVersions(tenantId, harshitCandidateId, createdDocId)).length;
    expect(versionCountAfter).toBe(versionCountBefore);
  });

  it('Requirement 3: optimistic concurrency protection against stale edits', async () => {
    const current = await service.get(tenantId, harshitCandidateId, createdDocId);
    // Provide a stale expectedVersionNumber (e.g. 999)
    await expect(
      service.updateDocument(
        tenantId,
        harshitCandidateId,
        createdDocId,
        {
          documentTitle: 'Conflicting Edit',
          document: { type: 'doc', content: [] } as any,
          expectedVersionNumber: 999,
        },
        actor,
      ),
    ).rejects.toThrow();
  });

  it('Requirement 2: status management enforces valid transitions and audit history', async () => {
    // Current status is DRAFT -> transition to IN_REVIEW
    const res1 = await service.changeStatus(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { toStatus: 'IN_REVIEW', reason: 'Review requested by HR' },
      actor,
    );
    expect(res1.currentStatus).toBe('IN_REVIEW');

    // IN_REVIEW -> APPROVED
    const res2 = await service.changeStatus(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { toStatus: 'APPROVED', reason: 'Approved by hiring manager' },
      actor,
    );
    expect(res2.currentStatus).toBe('APPROVED');

    // Attempt invalid transition directly from APPROVED to DRAFT (forbidden)
    await expect(
      service.changeStatus(
        tenantId,
        harshitCandidateId,
        createdDocId,
        { toStatus: 'DRAFT' },
        actor,
      ),
    ).rejects.toThrow();

    // Transition to REJECTED requires a reason
    await expect(
      service.changeStatus(
        tenantId,
        harshitCandidateId,
        createdDocId,
        { toStatus: 'REJECTED' }, // no reason
        actor,
      ),
    ).rejects.toThrow();

    // Transition to REJECTED with reason succeeds
    const res3 = await service.changeStatus(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { toStatus: 'REJECTED', reason: 'Salary expectations mismatch' },
      actor,
    );
    expect(res3.currentStatus).toBe('REJECTED');

    // Verify status audit history
    const history = await service.getStatusHistory(tenantId, harshitCandidateId, createdDocId);
    expect(history.length).toBeGreaterThanOrEqual(3);
    const latest = history[0];
    expect(latest.toStatus).toBe('REJECTED');
    expect(latest.reason).toBe('Salary expectations mismatch');
  });

  it('Requirement 3: non-destructive version restoration creates a new version', async () => {
    const versions = await service.listVersions(tenantId, harshitCandidateId, createdDocId);
    expect(versions.length).toBeGreaterThanOrEqual(1);

    const oldest = versions[versions.length - 1]; // Version 1
    const restoreResult = await service.restoreVersion(
      tenantId,
      harshitCandidateId,
      createdDocId,
      oldest.id,
      actor,
      { note: 'Restoring back to initial appointment draft' },
    );

    expect(restoreResult.versionNumber).toBeGreaterThan(oldest.versionNumber);
    // Historical version remains intact
    const historicalVer = await service.getVersion(tenantId, harshitCandidateId, createdDocId, oldest.id);
    expect(historicalVer.id).toBe(oldest.id);
  });

  it('Requirement 5 & 6: email templates management and dynamic placeholder preview', async () => {
    // Ensure default email templates exist
    await service.ensureDefaultEmailTemplates(tenantId);
    const emailTemplates = await service.listEmailTemplates(tenantId);
    expect(emailTemplates.length).toBeGreaterThan(0);

    const offerEmailTpl = emailTemplates.find((t) => t.document_kind === 'OFFER_LETTER') || emailTemplates[0];
    expect(offerEmailTpl).toBeDefined();

    // Dynamic preview resolves candidate and document tokens
    const preview = await service.previewEmail(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { templateId: offerEmailTpl.id },
    );

    expect(preview.subject).toContain('Harshit Dhodi');
    expect(preview.bodyHtml).toContain('Harshit Dhodi');
    expect(preview.recipientEmail).toBe('harshit@rndtechnosoft.com');
    expect(preview.unresolvedPlaceholders.length).toBe(0);
    expect(preview.hasUnresolvedPlaceholders).toBe(false);
  });

  it('Requirement 4: sending email attaches PDF snapshot and records delivery audit', async () => {
    // Put document into APPROVED status so sending is permitted
    await service.changeStatus(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { toStatus: 'DRAFT', reason: 'Reset for sending test' },
      actor,
    );
    await service.changeStatus(
      tenantId,
      harshitCandidateId,
      createdDocId,
      { toStatus: 'APPROVED', reason: 'Approved for sending' },
      actor,
    );

    const emailTemplates = await service.listEmailTemplates(tenantId);
    const tpl = emailTemplates[0];

    // Ensure preview yields valid version ID and sendEmail succeeds with it
    const emailPreview = await service.previewEmail(tenantId, harshitCandidateId, createdDocId);
    expect(emailPreview.versionId).toBeDefined();

    const sendResult = await service.sendEmail(
      tenantId,
      harshitCandidateId,
      createdDocId,
      {
        emailTemplateId: tpl.id,
        recipientEmail: 'harshit@rndtechnosoft.com',
        subject: 'Your Official Letter',
        bodyHtml: '<p>Dear Harshit Dhodi, please find your letter attached.</p>',
        versionId: emailPreview.versionId,
      },
      actor,
    );

    expect(sendResult).toHaveProperty('emailId');
    expect(sendResult.deliveryStatus).toBe('SENT');
    expect(sendResult.documentStatus).toBe('SENT');
    expect(sendResult.attachmentFilename).toContain('.pdf');

    // Verify email history
    const emailHistory = await service.listEmails(tenantId, harshitCandidateId, createdDocId);
    expect(emailHistory.length).toBeGreaterThanOrEqual(1);
    expect(emailHistory[0].id).toBe(sendResult.emailId);
    expect(emailHistory[0].recipientEmail).toBe('harshit@rndtechnosoft.com');
  });

  it('Requirement 5: exports real Microsoft Word .docx file with valid Word header', async () => {
    const result = await service.exportDocx(tenantId, harshitCandidateId, createdDocId);
    expect(result).toHaveProperty('bytes');
    expect(result).toHaveProperty('filename');
    expect(result.filename).toContain('Harshit_Dhodi');
    expect(result.filename.endsWith('.docx')).toBe(true);

    // Valid DOCX is a zip archive starting with PK\x03\x04
    expect(result.bytes.length).toBeGreaterThan(100);
    expect(result.bytes[0]).toBe(0x50); // 'P'
    expect(result.bytes[1]).toBe(0x4b); // 'K'
    expect(result.bytes[2]).toBe(0x03);
    expect(result.bytes[3]).toBe(0x04);
  });

  it('Requirement 5: exports high-fidelity PDF with %PDF header', async () => {
    const result = await service.exportPdf(tenantId, harshitCandidateId, createdDocId);
    expect(result).toHaveProperty('bytes');
    expect(result).toHaveProperty('filename');
    expect(result.filename).toContain('Harshit_Dhodi');
    expect(result.filename.endsWith('.pdf')).toBe(true);

    // Valid PDF starts with %PDF-
    const header = result.bytes.subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  it('Requirement 6: candidate existing offers remain intact and untouched', async () => {
    const offers = await prisma.rndtechnosoft_offers.findMany({
      where: { candidate_id: harshitCandidateId, tenant_id: tenantId },
      orderBy: { offer_code: 'asc' },
    });

    expect(offers.length).toBe(2);

    const offer316 = offers.find((o) => o.offer_code === 'OFR-2026-316053');
    expect(offer316).toBeDefined();
    expect(offer316?.offer_status).toBe('WITHDRAWN');

    const offer504 = offers.find((o) => o.offer_code === 'OFR-2026-504320');
    expect(offer504).toBeDefined();
    expect(offer504?.offer_status).toBe('EXPIRED');
  });

  it('Tenant Isolation: cannot read or update candidate document from another tenant', async () => {
    const otherTenantId = randomUUID();
    await expect(
      service.get(otherTenantId, harshitCandidateId, createdDocId),
    ).rejects.toThrow();
  });
});
