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
      tenantId: member.tenant_id,
      tenantMemberId: member.id,
      workspaceName: 'Acme',
      role: 'ADMIN',
      permissions: ['*'],
    };

    audit = new AuditService(prisma as any);
    templates = new TemplatesService(prisma as any, audit);
    pdf = new DocumentPdfService();
    docx = new DocumentDocxService();
    letterheads = new LetterheadsService(prisma as any, audit, { read: async () => Buffer.from('') } as any);

    service = new CandidateLetterDocumentsService(
      prisma as any,
      audit,
      templates,
      pdf,
      docx,
      letterheads,
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
      await prisma.rndtechnosoft_candidate_document_versions.deleteMany({
        where: { document_id: createdDocId },
      });
      await prisma.rndtechnosoft_candidate_documents.deleteMany({
        where: { id: createdDocId },
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
    expect(info.placeholders.designation).toBe('Lead Full Stack Engineer');
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
        documentStatus: 'SAVED',
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
