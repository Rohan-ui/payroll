import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { TemplatesService } from '@/modules/documents/templates.service';
import { DocumentPdfService, LetterPdf, PageMargins, PdfLayout, uniformMargins } from '@/modules/documents/document-pdf.service';
import { DocumentDocxService } from '@/modules/documents/document-docx.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import {
  formatInr,
  formatLetterDate,
  HR_COMMON_PLACEHOLDERS,
  PLACEHOLDERS,
  TemplateKind,
} from '@/modules/documents/document-templates';
import {
  defaultDocument,
  DocNode,
  documentText,
  fillDocument,
  legacyDocument,
  parseDocument,
} from '@/modules/documents/rich-document';
import {
  GenerateCandidateDocumentDto,
  SaveCandidateDocumentDto,
  UpdateCandidateDocumentDto,
} from './dto/onboarding.dto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_DISPLAY_NAMES: Record<string, string> = {
  OFFER_LETTER: 'Offer Letter',
  APPOINTMENT_LETTER: 'Appointment Letter',
  EMPLOYMENT_CONTRACT: 'Employment Contract',
  EMPLOYMENT_AGREEMENT: 'Employment Agreement',
  JOINING_LETTER: 'Joining Letter',
  WELCOME_LETTER: 'Welcome Letter',
  NDA: 'NDA / Confidentiality Agreement',
  SALARY_REVISION: 'Salary Revision Letter',
  EXPERIENCE_LETTER: 'Experience Letter',
  RELIEVING_LETTER: 'Relieving Letter',
  CERTIFICATE: 'Certificate',
  CUSTOM_HR: 'Custom HR Document',
  QUOTATION: 'Quotation',
  APPRAISAL_LETTER: 'Appraisal Letter',
};

export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

@Injectable()
export class CandidateLetterDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly templates: TemplatesService,
    private readonly pdf: DocumentPdfService,
    private readonly docx: DocumentDocxService,
    private readonly letterheads: LetterheadsService,
  ) {}

  /**
   * List all available document templates in the workspace for onboarding document generation.
   * Dynamically loads from the database and template management system.
   */
  async listAvailableTemplates(tenantId: string) {
    const rows = await this.prisma.rndtechnosoft_document_templates.findMany({
      where: { tenant_id: tenantId, is_archived: false },
      orderBy: [{ template_kind: 'asc' }, { template_name: 'asc' }],
      take: 200,
      include: {
        rndtechnosoft_document_template_versions: {
          orderBy: { version_number: 'desc' },
          select: {
            id: true,
            version_number: true,
            version_status: true,
            title: true,
            page_size: true,
            letterhead_id: true,
            margin_top_mm: true,
            margin_right_mm: true,
            margin_bottom_mm: true,
            margin_left_mm: true,
            show_page_numbers: true,
            updated_at: true,
          },
        },
      },
    });

    return rows.map((row) => {
      const approved = row.rndtechnosoft_document_template_versions.find((v) => v.version_status === 'APPROVED');
      const draft = row.rndtechnosoft_document_template_versions.find((v) => v.version_status === 'DRAFT');
      const activeVersion = approved ?? draft ?? row.rndtechnosoft_document_template_versions[0] ?? null;

      const label = KIND_DISPLAY_NAMES[row.template_kind] ?? row.template_kind.replace(/_/g, ' ');

      return {
        id: row.id,
        kind: row.template_kind,
        kindLabel: label,
        category: label,
        description: `Template for generating ${label}`,
        name: row.template_name,
        status: approved ? 'APPROVED' : draft ? 'DRAFT' : 'NO_VERSION',
        hasApprovedVersion: Boolean(approved),
        versionNumber: activeVersion?.version_number ?? 1,
        hasWording: true,
        updatedAt: activeVersion?.updated_at ? activeVersion.updated_at.toISOString() : row.updated_at.toISOString(),
        letterheadId: activeVersion?.letterhead_id ?? null,
        pageSize: activeVersion?.page_size ?? 'A4',
        marginsMm: activeVersion
          ? {
              top: activeVersion.margin_top_mm,
              right: activeVersion.margin_right_mm,
              bottom: activeVersion.margin_bottom_mm,
              left: activeVersion.margin_left_mm,
            }
          : { top: 20, right: 20, bottom: 20, left: 20 },
        showPageNumbers: activeVersion?.show_page_numbers ?? false,
        activeVersion: activeVersion
          ? {
              id: activeVersion.id,
              number: activeVersion.version_number,
              title: activeVersion.title,
              status: activeVersion.version_status,
              layout: {
                letterheadId: activeVersion.letterhead_id,
                pageSize: activeVersion.page_size,
                marginsMm: {
                  top: activeVersion.margin_top_mm,
                  right: activeVersion.margin_right_mm,
                  bottom: activeVersion.margin_bottom_mm,
                  left: activeVersion.margin_left_mm,
                },
                showPageNumbers: activeVersion.show_page_numbers,
              },
            }
          : null,
      };
    });
  }

  /**
   * Resolve placeholder values from candidate, tenant, and recruiter records.
   */
  async getCandidatePlaceholders(tenantId: string, candidateId: string) {
    return this.getCandidatePlaceholderValues(tenantId, candidateId);
  }

  async getCandidatePlaceholderValues(tenantId: string, candidateId: string) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');

    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      include: {
        rndtechnosoft_departments: true,
        rndtechnosoft_designations: true,
        rndtechnosoft_employment_types: true,
        recruiter: {
          include: {
            rndtechnosoft_users: { select: { display_name: true, email: true } },
          },
        },
        rndtechnosoft_offers: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: { rndtechnosoft_offer_components: true },
        },
      },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { id: true, legal_name: true, display_name: true },
    });

    const defaultLetterhead = await this.prisma.rndtechnosoft_letterheads.findFirst({
      where: { tenant_id: tenantId, is_default: true, is_archived: false },
      select: {
        company_name: true,
        address_text: true,
        phone: true,
        email: true,
        website: true,
      },
    });

    const companyName = defaultLetterhead?.company_name || tenant?.display_name || tenant?.legal_name || 'RND Technosoft';
    const recruiterName =
      candidate.recruiter?.rndtechnosoft_users?.display_name ||
      candidate.recruiter?.rndtechnosoft_users?.email ||
      '';

    const latestOffer = candidate.rndtechnosoft_offers[0];
    const annualSalary = latestOffer
      ? formatInr(latestOffer.annual_ctc)
      : candidate.expected_salary
        ? formatInr(candidate.expected_salary)
        : '';

    const joiningDate = candidate.expected_joining_date
      ? formatLetterDate(candidate.expected_joining_date)
      : '';

    const designation =
      candidate.rndtechnosoft_designations?.designation_name || candidate.applied_position || '';
    const department = candidate.rndtechnosoft_departments?.department_name || '';
    const employmentType = candidate.rndtechnosoft_employment_types?.employment_type_name || '';

    const values: Record<string, string> = {
      candidate_name: candidate.full_name,
      candidate_id: candidate.candidate_code,
      candidate_code: candidate.candidate_code,
      candidate_email: candidate.email,
      email: candidate.email,
      candidate_phone: candidate.phone ?? '',
      phone: candidate.phone ?? '',
      address: candidate.address ?? '',
      candidate_address: candidate.address ?? '',
      designation,
      job_title: designation,
      department,
      employment_type: employmentType,
      annual_salary: annualSalary,
      salary: annualSalary,
      expected_salary: candidate.expected_salary ? formatInr(candidate.expected_salary) : '',
      joining_date: joiningDate,
      expected_joining_date: joiningDate,
      company_name: companyName,
      company_address: defaultLetterhead?.address_text ?? '',
      company_phone: defaultLetterhead?.phone ?? '',
      company_email: defaultLetterhead?.email ?? '',
      company_website: defaultLetterhead?.website ?? '',
      recruiter: recruiterName,
      recruiter_name: recruiterName,
      reporting_manager: recruiterName,
      work_location: defaultLetterhead?.address_text ? defaultLetterhead.address_text.split(',')[0] : 'Head Office',
      probation_period: '3 months',
      experience: candidate.experience_years ? `${candidate.experience_years} years` : '',
      experience_years: candidate.experience_years ? String(candidate.experience_years) : '',
      hiring_source: candidate.hiring_source ?? '',
      special_terms: 'This offer is subject to satisfactory verification of educational and employment credentials.',
      offer_reference: `DOC-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      offer_expiry_date: formatLetterDate(new Date(Date.now() + 14 * 24 * 3600 * 1000)),
      employee_name: candidate.full_name,
      employee_code: candidate.candidate_code,
      today: formatLetterDate(new Date()),
      date: formatLetterDate(new Date()),
    };

    const missingFields: { key: string; label: string; description: string }[] = [];
    if (!values.designation) {
      missingFields.push({ key: 'designation', label: 'Designation / Job Title', description: 'Designation or role title' });
    }
    if (!values.department) {
      missingFields.push({ key: 'department', label: 'Department', description: 'Assigned department' });
    }
    if (!values.annual_salary) {
      missingFields.push({ key: 'annual_salary', label: 'Annual Salary / CTC', description: 'Annual compensation amount' });
    }
    if (!values.joining_date) {
      missingFields.push({ key: 'joining_date', label: 'Joining Date', description: 'Expected date of joining' });
    }
    if (!values.employment_type) {
      missingFields.push({ key: 'employment_type', label: 'Employment Type', description: 'Full-time, Part-time, Contract, etc.' });
    }
    if (!values.recruiter) {
      missingFields.push({ key: 'recruiter', label: 'Recruiter / Manager', description: 'Recruiter or reporting manager name' });
    }

    return { candidate, values, placeholders: values, missingFields };
  }

  /**
   * Generate an editable rich-text document from a selected template and candidate info.
   */
  async generateDocument(tenantId: string, candidateId: string, dto: GenerateCandidateDocumentDto) {
    const { candidate, values: defaultValues } = await this.getCandidatePlaceholderValues(tenantId, candidateId);

    const templateData = await this.templates.get(tenantId, dto.templateId);
    if (!templateData) throw new NotFoundException('Template not found.');

    const version = dto.templateVersionId
      ? templateData.versions.find((v) => v.id === dto.templateVersionId)
      : templateData.versions.find((v) => v.status === 'APPROVED') ?? templateData.versions[0];

    if (!version) throw new BadRequestException('The selected template has no available versions.');

    const mergedValues = { ...defaultValues, ...(dto.customValues ?? {}) };

    // Source document: either formatted doc or converted legacy doc
    const sourceDoc: DocNode =
      (version.document as DocNode) ??
      legacyDocument(templateData.kind as TemplateKind, version.title, version.body);

    // Replace all placeholders while preserving all formatting
    const populatedDoc = fillDocument(sourceDoc, mergedValues);
    const { title: renderedTitle, body: renderedBody } = documentText(populatedDoc);

    // Identify placeholders that exist in the template but were left blank
    const templateText = `${version.title}\n${version.body}`;
    const tokenRegex = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
    const templatePlaceholders = [...new Set([...templateText.matchAll(tokenRegex)].map((m) => m[1]))];
    const missingFields = templatePlaceholders.filter((key) => !mergedValues[key] || mergedValues[key].trim() === '');

    return {
      candidateId: candidate.id,
      candidateName: candidate.full_name,
      candidateCode: candidate.candidate_code,
      templateId: templateData.id,
      templateVersionId: version.id,
      templateName: templateData.name,
      documentType: templateData.kind,
      documentTitle: `${candidate.full_name} - ${templateData.name}`,
      document: populatedDoc,
      layout: version.layout,
      resolvedValues: mergedValues,
      missingFields,
      renderedTitle,
      renderedBody,
    };
  }

  /**
   * Save an edited document permanently against the candidate, recording revision history.
   */
  async saveDocument(tenantId: string, candidateId: string, dto: SaveCandidateDocumentDto, actor: AuthenticatedTenantUser) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');

    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { id: true, full_name: true, candidate_code: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    // Parse and validate document structure
    const parsedDoc = parseDocument(dto.documentType as TemplateKind, dto.document);
    const { title: renderedTitle, body: renderedBody } = documentText(parsedDoc);

    const layout = dto.layout;
    const margins = layout?.marginsMm ?? uniformMargins(20);

    // Update existing document if documentId is provided
    if (dto.documentId) {
      if (!UUID_REGEX.test(dto.documentId)) throw new BadRequestException('Invalid document ID.');

      const existing = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
        where: { tenant_id: tenantId, candidate_id: candidateId, id: dto.documentId },
      });
      if (!existing) throw new NotFoundException('Existing document not found.');

      const newVersionNumber = existing.version_number + 1;

      const result = await this.prisma.$transaction(async (tx) => {
        // Record updated version in history table
        await tx.rndtechnosoft_candidate_document_versions.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            document_id: existing.id,
            version_number: newVersionNumber,
            title: renderedTitle || dto.documentTitle.trim(),
            body: renderedBody,
            document_data: parsedDoc as object,
            created_by_tenant_member_id: actor.tenantMemberId,
          },
        });

        // Update main document
        return await tx.rndtechnosoft_candidate_documents.update({
          where: { id: existing.id },
          data: {
            document_title: dto.documentTitle.trim(),
            document_type: dto.documentType,
            document_status: dto.documentStatus ?? existing.document_status,
            rendered_title: renderedTitle || dto.documentTitle.trim(),
            rendered_body: renderedBody,
            rendered_document: parsedDoc as object,
            version_number: newVersionNumber,
            letterhead_id: layout?.letterheadId !== undefined ? layout.letterheadId : existing.letterhead_id,
            page_size: layout?.pageSize ?? existing.page_size,
            margin_top_mm: margins.top,
            margin_right_mm: margins.right,
            margin_bottom_mm: margins.bottom,
            margin_left_mm: margins.left,
            show_page_numbers: layout?.showPageNumbers !== undefined ? layout.showPageNumbers : existing.show_page_numbers,
            updated_by_tenant_member_id: actor.tenantMemberId,
            updated_at: new Date(),
          },
        });
      });

      await this.audit.log({
        tenantId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'CANDIDATE_DOCUMENT_UPDATED',
        entityType: 'candidate_document',
        entityId: result.id,
        newValues: {
          documentTitle: result.document_title,
          versionNumber: result.version_number,
          candidateId,
          changelogNote: dto.changelogNote,
        },
      });

      return {
        id: result.id,
        documentTitle: result.document_title,
        documentType: result.document_type,
        documentStatus: result.document_status,
        versionNumber: result.version_number,
        updatedAt: result.updated_at,
        document: result.rendered_document,
      };
    }

    // Creating a brand-new document
    const newDocId = randomUUID();
    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rndtechnosoft_candidate_documents.create({
        data: {
          id: newDocId,
          tenant_id: tenantId,
          candidate_id: candidateId,
          template_id: dto.templateId ?? null,
          template_version_id: dto.templateVersionId ?? null,
          document_title: dto.documentTitle.trim(),
          document_type: dto.documentType,
          document_status: dto.documentStatus ?? 'SAVED',
          rendered_title: renderedTitle || dto.documentTitle.trim(),
          rendered_body: renderedBody,
          rendered_document: parsedDoc as object,
          version_number: 1,
          letterhead_id: layout?.letterheadId ?? null,
          page_size: layout?.pageSize ?? 'A4',
          margin_top_mm: margins.top,
          margin_right_mm: margins.right,
          margin_bottom_mm: margins.bottom,
          margin_left_mm: margins.left,
          show_page_numbers: layout?.showPageNumbers ?? false,
          created_by_tenant_member_id: actor.tenantMemberId,
          updated_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      await tx.rndtechnosoft_candidate_document_versions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          document_id: newDocId,
          version_number: 1,
          title: renderedTitle || dto.documentTitle.trim(),
          body: renderedBody,
          document_data: parsedDoc as object,
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      return created;
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'CANDIDATE_DOCUMENT_CREATED',
      entityType: 'candidate_document',
      entityId: result.id,
      newValues: {
        documentTitle: result.document_title,
        documentType: result.document_type,
        candidateId,
      },
    });

    return {
      id: result.id,
      documentTitle: result.document_title,
      documentType: result.document_type,
      documentStatus: result.document_status,
      versionNumber: result.version_number,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      document: result.rendered_document,
    };
  }

  /**
   * List saved generated documents belonging to a candidate.
   */
  async listForCandidate(tenantId: string, candidateId: string) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');

    const rows = await this.prisma.rndtechnosoft_candidate_documents.findMany({
      where: { tenant_id: tenantId, candidate_id: candidateId },
      orderBy: { updated_at: 'desc' },
      take: 100,
      include: {
        rndtechnosoft_document_templates: { select: { template_name: true } },
        created_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        updated_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        _count: { select: { rndtechnosoft_candidate_document_versions: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      documentTitle: row.document_title,
      documentType: row.document_type,
      typeLabel: KIND_DISPLAY_NAMES[row.document_type] ?? row.document_type.replace(/_/g, ' '),
      documentStatus: row.document_status,
      versionNumber: row.version_number,
      versionCount: row._count.rndtechnosoft_candidate_document_versions,
      templateId: row.template_id,
      templateName: row.rndtechnosoft_document_templates?.template_name ?? null,
      createdByName: row.created_by?.rndtechnosoft_users.display_name || row.created_by?.rndtechnosoft_users.email || null,
      updatedByName: row.updated_by?.rndtechnosoft_users.display_name || row.updated_by?.rndtechnosoft_users.email || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Retrieve a single saved document with its full content and layout for editing or viewing.
   */
  async get(tenantId: string, candidateId: string, documentId: string) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: documentId },
      include: {
        rndtechnosoft_document_templates: { select: { id: true, template_name: true, template_kind: true } },
        rndtechnosoft_letterheads: { select: { id: true, letterhead_name: true, company_name: true } },
        created_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        updated_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        rndtechnosoft_candidate_document_versions: {
          orderBy: { version_number: 'desc' },
          take: 20,
          select: {
            id: true,
            version_number: true,
            title: true,
            created_at: true,
            created_by: {
              select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!doc) throw new NotFoundException('Document not found.');

    return {
      id: doc.id,
      candidateId: doc.candidate_id,
      templateId: doc.template_id,
      templateVersionId: doc.template_version_id,
      templateName: doc.rndtechnosoft_document_templates?.template_name ?? null,
      documentTitle: doc.document_title,
      documentType: doc.document_type,
      typeLabel: KIND_DISPLAY_NAMES[doc.document_type] ?? doc.document_type.replace(/_/g, ' '),
      documentStatus: doc.document_status,
      versionNumber: doc.version_number,
      document: (doc.rendered_document as unknown) as DocNode,
      renderedTitle: doc.rendered_title,
      renderedBody: doc.rendered_body,
      layout: {
        letterheadId: doc.letterhead_id,
        letterheadName: doc.rndtechnosoft_letterheads?.letterhead_name ?? null,
        pageSize: doc.page_size as 'A4' | 'LETTER',
        marginsMm: {
          top: doc.margin_top_mm,
          right: doc.margin_right_mm,
          bottom: doc.margin_bottom_mm,
          left: doc.margin_left_mm,
        },
        showPageNumbers: doc.show_page_numbers,
      },
      createdByName: doc.created_by?.rndtechnosoft_users.display_name || doc.created_by?.rndtechnosoft_users.email || null,
      updatedByName: doc.updated_by?.rndtechnosoft_users.display_name || doc.updated_by?.rndtechnosoft_users.email || null,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      versions: doc.rndtechnosoft_candidate_document_versions.map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        title: v.title,
        createdAt: v.created_at,
        createdByName: v.created_by?.rndtechnosoft_users.display_name || v.created_by?.rndtechnosoft_users.email || null,
      })),
    };
  }

  /**
   * Update an existing document, creating a version snapshot.
   */
  async updateDocument(
    tenantId: string,
    candidateId: string,
    documentId: string,
    dto: UpdateCandidateDocumentDto,
    actor: AuthenticatedTenantUser,
  ) {
    const existing = await this.get(tenantId, candidateId, documentId);
    return this.saveDocument(
      tenantId,
      candidateId,
      {
        documentId,
        templateId: existing.templateId ?? undefined,
        templateVersionId: existing.templateVersionId ?? undefined,
        documentTitle: dto.documentTitle ?? existing.documentTitle,
        documentType: existing.documentType,
        document: dto.document,
        documentStatus: dto.documentStatus ?? existing.documentStatus,
        layout: dto.layout,
        changelogNote: dto.changelogNote,
      },
      actor,
    );
  }

  /**
   * Export the latest saved document as a high-fidelity PDF.
   */
  async exportPdf(tenantId: string, candidateId: string, documentId: string) {
    const docData = await this.get(tenantId, candidateId, documentId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { full_name: true, candidate_code: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const layout = await this.letterheads.layoutFor(tenantId, {
      letterhead_id: docData.layout.letterheadId,
      page_size: docData.layout.pageSize,
      margin_top_mm: docData.layout.marginsMm.top,
      margin_right_mm: docData.layout.marginsMm.right,
      margin_bottom_mm: docData.layout.marginsMm.bottom,
      margin_left_mm: docData.layout.marginsMm.left,
      show_page_numbers: docData.layout.showPageNumbers ?? false,
    });

    const letter: LetterPdf = {
      companyName: layout.letterhead?.companyName || 'Company',
      reference: candidate.candidate_code,
      dateText: formatLetterDate(docData.updatedAt),
      title: docData.documentTitle,
      body: docData.renderedBody || '',
      document: docData.document,
    };

    const bytes = await this.pdf.render(letter, layout);
    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(docData.documentTitle)}.pdf`;

    return { bytes, filename };
  }

  /**
   * Export the latest saved document as a real Microsoft Word .docx file.
   */
  async exportDocx(tenantId: string, candidateId: string, documentId: string) {
    const docData = await this.get(tenantId, candidateId, documentId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { full_name: true, candidate_code: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const layout = await this.letterheads.layoutFor(tenantId, {
      letterhead_id: docData.layout.letterheadId,
      page_size: docData.layout.pageSize,
      margin_top_mm: docData.layout.marginsMm.top,
      margin_right_mm: docData.layout.marginsMm.right,
      margin_bottom_mm: docData.layout.marginsMm.bottom,
      margin_left_mm: docData.layout.marginsMm.left,
      show_page_numbers: docData.layout.showPageNumbers ?? false,
    });

    const bytes = await this.docx.render(docData.document, {
      title: docData.documentTitle,
      companyName: layout.letterhead?.companyName || 'Company',
      reference: candidate.candidate_code,
      layout: {
        pageSize: docData.layout.pageSize,
        marginsMm: docData.layout.marginsMm,
        showPageNumbers: docData.layout.showPageNumbers,
        companyName: layout.letterhead?.companyName,
      },
    });

    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(docData.documentTitle)}.docx`;

    return { bytes, filename };
  }
}
