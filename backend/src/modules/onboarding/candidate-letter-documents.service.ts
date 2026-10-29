import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { TemplatesService } from '@/modules/documents/templates.service';
import { DocumentPdfService, LetterPdf, PageMargins, PdfLayout, uniformMargins } from '@/modules/documents/document-pdf.service';
import { DocumentDocxService } from '@/modules/documents/document-docx.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { OnboardingMailerService, escapeHtml } from './onboarding-mailer.service';
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
  ChangeDocumentStatusDto,
  CreateEmailTemplateDto,
  GenerateCandidateDocumentDto,
  RestoreDocumentVersionDto,
  SaveCandidateDocumentDto,
  SendCandidateDocumentEmailDto,
  UpdateCandidateDocumentDto,
  UpdateEmailTemplateDto,
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

export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  IN_REVIEW: ['DRAFT', 'APPROVED', 'REJECTED', 'WITHDRAWN'],
  APPROVED: ['SENT', 'IN_REVIEW', 'REJECTED', 'WITHDRAWN'],
  SENT: ['DELIVERED', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  DELIVERED: ['VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  VIEWED: ['ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN'],
  ACCEPTED: ['WITHDRAWN'],
  REJECTED: ['DRAFT'],
  EXPIRED: ['DRAFT', 'WITHDRAWN'],
  WITHDRAWN: ['DRAFT'],
};

export function sanitizeFilename(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_{2,}/g, '_');
}

export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class CandidateLetterDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly templates: TemplatesService,
    private readonly pdf: DocumentPdfService,
    private readonly docx: DocumentDocxService,
    private readonly letterheads: LetterheadsService,
    private readonly onboardingMailer: OnboardingMailerService,
  ) {}

  /**
   * Helper to compute a SHA-256 digest of document content and layout to prevent duplicate versions.
   */
  private computeContentHash(doc: unknown, title: string, layout: unknown): string {
    return createHash('sha256')
      .update(JSON.stringify({ doc, title: title.trim(), layout }))
      .digest('hex');
  }

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
          take: 1,
          select: {
            id: true,
            version_number: true,
            version_status: true,
            title: true,
            letterhead_id: true,
            page_size: true,
            margin_top_mm: true,
            margin_right_mm: true,
            margin_bottom_mm: true,
            margin_left_mm: true,
            show_page_numbers: true,
            approved_at: true,
          },
        },
      },
    });

    return rows.map((tpl) => {
      const latestVer = tpl.rndtechnosoft_document_template_versions[0] ?? null;
      return {
        id: tpl.id,
        name: tpl.template_name,
        kind: tpl.template_kind,
        kindLabel: KIND_DISPLAY_NAMES[tpl.template_kind] ?? tpl.template_kind.replace(/_/g, ' '),
        category: 'EMPLOYMENT_LETTERS',
        hasVersion: Boolean(latestVer),
        hasWording: Boolean(latestVer),
        latestVersionId: latestVer?.id ?? null,
        latestVersionNumber: latestVer?.version_number ?? null,
        isApproved: latestVer?.version_status === 'APPROVED',
        defaultEmailTemplateId: tpl.default_email_template_id,
        layout: latestVer
          ? {
              letterheadId: latestVer.letterhead_id,
              pageSize: latestVer.page_size,
              marginsMm: {
                top: latestVer.margin_top_mm,
                right: latestVer.margin_right_mm,
                bottom: latestVer.margin_bottom_mm,
                left: latestVer.margin_left_mm,
              },
              showPageNumbers: latestVer.show_page_numbers,
            }
          : null,
      };
    });
  }

  /**
   * Resolves all candidate-specific placeholders for review before document generation.
   */
  async getCandidatePlaceholders(tenantId: string, candidateId: string) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');

    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      include: {
        rndtechnosoft_departments: { select: { department_name: true } },
        rndtechnosoft_designations: { select: { designation_name: true } },
        rndtechnosoft_employment_types: { select: { employment_type_name: true } },
        recruiter: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        rndtechnosoft_offers: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            offer_code: true,
            annual_ctc: true,
            joining_date: true,
            job_title: true,
            rndtechnosoft_offer_components: {
              orderBy: { sort_order: 'asc' },
              select: { component_label: true, annual_amount: true },
            },
          },
        },
      },
    });

    if (!candidate) throw new NotFoundException('Candidate not found.');

    const tenant = await this.prisma.rndtechnosoft_tenants.findUnique({
      where: { id: tenantId },
      select: { display_name: true, legal_name: true },
    });

    const latestOffer = candidate.rndtechnosoft_offers[0] ?? null;
    const salaryValue = latestOffer?.annual_ctc ? formatInr(latestOffer.annual_ctc) : candidate.expected_salary ? formatInr(candidate.expected_salary) : null;
    const joiningDate = latestOffer?.joining_date ? formatLetterDate(latestOffer.joining_date) : candidate.expected_joining_date ? formatLetterDate(candidate.expected_joining_date) : null;
    const designation = latestOffer?.job_title || candidate.rndtechnosoft_designations?.designation_name || null;
    const department = candidate.rndtechnosoft_departments?.department_name || null;
    const companyName = tenant?.display_name || tenant?.legal_name || 'Company';
    const recruiterName = candidate.recruiter?.rndtechnosoft_users?.display_name || candidate.recruiter?.rndtechnosoft_users?.email || null;

    const values: Record<string, string | null> = {
      candidate_name: candidate.full_name,
      first_name: candidate.full_name.trim().split(/\s+/)[0] || candidate.full_name,
      candidate_email: candidate.email,
      candidate_phone: candidate.phone,
      candidate_address: candidate.address,
      candidate_code: candidate.candidate_code,
      candidate_id: candidate.candidate_code,
      job_title: designation,
      designation: designation,
      department: department,
      joining_date: joiningDate,
      annual_ctc: salaryValue,
      annual_salary: salaryValue,
      expected_salary: candidate.expected_salary ? formatInr(candidate.expected_salary) : null,
      experience_years: candidate.experience_years ? String(candidate.experience_years) : null,
      employment_type: candidate.rndtechnosoft_employment_types?.employment_type_name || null,
      recruiter_name: recruiterName,
      company_name: companyName,
      current_date: formatLetterDate(new Date()),
    };

    const missingFields: { key: string; label: string; current: string | null }[] = [];
    const checkKeys: [string, string][] = [
      ['designation', 'Designation / Job Title'],
      ['department', 'Department'],
      ['joining_date', 'Expected Joining Date'],
      ['annual_ctc', 'Annual Compensation / CTC'],
    ];

    for (const [k, lbl] of checkKeys) {
      if (!values[k]) {
        missingFields.push({ key: k, label: lbl, current: values[k] ?? null });
      }
    }

    return {
      candidate: {
        id: candidate.id,
        code: candidate.candidate_code,
        fullName: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        status: candidate.candidate_status,
      },
      resolvedPlaceholders: values,
      placeholders: values,
      missingFields,
      supportedPlaceholders: HR_COMMON_PLACEHOLDERS,
    };
  }

  async getCandidatePlaceholderValues(tenantId: string, candidateId: string) {
    return this.getCandidatePlaceholders(tenantId, candidateId);
  }

  /**
   * Generates a populated document for a candidate from a chosen template.
   */
  async generateDocument(tenantId: string, candidateId: string, dto: GenerateCandidateDocumentDto) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');
    if (!UUID_REGEX.test(dto.templateId)) throw new BadRequestException('Invalid template ID.');

    const tpl = await this.prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, id: dto.templateId, is_archived: false },
      include: {
        rndtechnosoft_document_template_versions: {
          orderBy: { version_number: 'desc' },
          take: 1,
        },
      },
    });

    if (!tpl) throw new NotFoundException('Document template not found.');
    const version = tpl.rndtechnosoft_document_template_versions[0];
    if (!version) {
      throw new BadRequestException('This template has no versions. Please configure it in Documents & Letterheads.');
    }

    const { resolvedPlaceholders } = await this.getCandidatePlaceholders(tenantId, candidateId);
    const combinedValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(resolvedPlaceholders)) {
      if (v !== null) combinedValues[k] = v;
    }
    if (dto.customValues) {
      for (const [k, v] of Object.entries(dto.customValues)) {
        if (v && v.trim()) combinedValues[k] = v.trim();
      }
    }

    const sourceDoc: DocNode = version.body_document
      ? parseDocument(tpl.template_kind, version.body_document)
      : legacyDocument(tpl.template_kind as TemplateKind, version.title, version.body);

    const filledDoc = fillDocument(sourceDoc, combinedValues);

    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { full_name: true },
    });

    const defaultTitle = `${candidate?.full_name || 'Candidate'} - ${tpl.template_name}`;

    return {
      templateId: tpl.id,
      templateName: tpl.template_name,
      templateKind: tpl.template_kind,
      templateVersionId: version.id,
      versionNumber: version.version_number,
      documentTitle: defaultTitle,
      documentType: tpl.template_kind,
      document: filledDoc,
      layout: {
        letterheadId: version.letterhead_id,
        pageSize: (version.page_size === 'LETTER' ? 'LETTER' : 'A4') as 'A4' | 'LETTER',
        marginsMm: {
          top: version.margin_top_mm,
          right: version.margin_right_mm,
          bottom: version.margin_bottom_mm,
          left: version.margin_left_mm,
        },
        showPageNumbers: version.show_page_numbers,
      },
    };
  }

  /**
   * Saves a new or modified document permanently for a candidate.
   * Handles optimistic concurrency, version incrementing, and prevents duplicate versions when content is unchanged.
   */
  async saveDocument(
    tenantId: string,
    candidateId: string,
    dto: SaveCandidateDocumentDto,
    actor: AuthenticatedTenantUser,
  ) {
    if (!UUID_REGEX.test(candidateId)) throw new NotFoundException('Candidate not found.');

    const parsedDoc = parseDocument(dto.documentType || 'OFFER_LETTER', dto.document);
    const text = documentText(parsedDoc);
    const renderedTitle = text.title || dto.documentTitle.trim();
    const renderedBody = text.body || '';

    const layout = dto.layout;
    const margins = layout?.marginsMm ?? { top: 20, right: 20, bottom: 20, left: 20 };
    const contentHash = this.computeContentHash(parsedDoc, dto.documentTitle, { layout, margins });

    // Updating existing document
    if (dto.documentId) {
      if (!UUID_REGEX.test(dto.documentId)) throw new BadRequestException('Invalid document ID.');

      const existing = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
        where: { tenant_id: tenantId, candidate_id: candidateId, id: dto.documentId },
      });
      if (!existing) throw new NotFoundException('Existing document not found.');

      // Optimistic concurrency check
      if (dto.expectedVersionNumber !== undefined && existing.version_number !== dto.expectedVersionNumber) {
        throw new ConflictException(
          `This document was modified by another user (current version is v${existing.version_number}). Please refresh to review the latest changes before saving.`,
        );
      }

      // Check if content actually changed compared to latest version
      const latestVersion = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
        where: { tenant_id: tenantId, document_id: existing.id },
        orderBy: { version_number: 'desc' },
      });

      const isUnchanged = latestVersion && latestVersion.content_hash === contentHash;

      if (isUnchanged) {
        // Content did not change: update metadata only without creating duplicate version
        const updated = await this.prisma.rndtechnosoft_candidate_documents.update({
          where: { id: existing.id },
          data: {
            document_title: dto.documentTitle.trim(),
            document_status: dto.documentStatus ?? existing.document_status,
            updated_by_tenant_member_id: actor.tenantMemberId,
            updated_at: new Date(),
          },
        });

        return {
          id: updated.id,
          documentTitle: updated.document_title,
          documentType: updated.document_type,
          documentStatus: updated.document_status,
          versionNumber: updated.version_number,
          updatedAt: updated.updated_at,
          document: updated.rendered_document,
          isDuplicateSuppressed: true,
        };
      }

      const newVersionNumber = existing.version_number + 1;

      const result = await this.prisma.$transaction(async (tx) => {
        // Create new immutable version record
        await tx.rndtechnosoft_candidate_document_versions.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            document_id: existing.id,
            version_number: newVersionNumber,
            title: renderedTitle || dto.documentTitle.trim(),
            body: renderedBody,
            document_data: parsedDoc as object,
            changelog_note: dto.changelogNote ?? `Edited ${dto.documentTitle.trim()}`,
            content_hash: contentHash,
            layout_data: layout ? (layout as object) : undefined,
            created_by_tenant_member_id: actor.tenantMemberId,
          },
        });

        // Update main document record
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
          document_status: dto.documentStatus ?? 'DRAFT',
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
          changelog_note: dto.changelogNote ?? 'Initial generation from template',
          content_hash: contentHash,
          layout_data: layout ? (layout as object) : undefined,
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
        last_sent_by: {
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
      lastSentAt: row.last_sent_at,
      lastSentByName: row.last_sent_by?.rndtechnosoft_users.display_name || row.last_sent_by?.rndtechnosoft_users.email || null,
      emailStatus: row.email_status,
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
        last_sent_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
        rndtechnosoft_candidate_document_versions: {
          orderBy: { version_number: 'desc' },
          take: 20,
          select: {
            id: true,
            version_number: true,
            title: true,
            changelog_note: true,
            created_at: true,
            created_by: {
              select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
            },
          },
        },
      },
    });

    if (!doc) throw new NotFoundException('Saved document not found.');

    const parsedDoc: DocNode = doc.rendered_document
      ? parseDocument(doc.document_type || 'OFFER_LETTER', doc.rendered_document)
      : ({ type: 'doc', content: [] } as DocNode);

    return {
      id: doc.id,
      documentTitle: doc.document_title,
      documentType: doc.document_type,
      typeLabel: KIND_DISPLAY_NAMES[doc.document_type] ?? doc.document_type.replace(/_/g, ' '),
      documentStatus: doc.document_status,
      versionNumber: doc.version_number,
      templateId: doc.template_id,
      templateName: doc.rndtechnosoft_document_templates?.template_name ?? null,
      templateVersionId: doc.template_version_id,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      createdByName: doc.created_by?.rndtechnosoft_users.display_name || doc.created_by?.rndtechnosoft_users.email || null,
      updatedByName: doc.updated_by?.rndtechnosoft_users.display_name || doc.updated_by?.rndtechnosoft_users.email || null,
      lastSentAt: doc.last_sent_at,
      lastSentByName: doc.last_sent_by?.rndtechnosoft_users.display_name || doc.last_sent_by?.rndtechnosoft_users.email || null,
      emailStatus: doc.email_status,
      document: parsedDoc,
      renderedTitle: doc.rendered_title,
      renderedBody: doc.rendered_body,
      layout: {
        letterheadId: doc.letterhead_id,
        letterheadName: doc.rndtechnosoft_letterheads?.letterhead_name ?? null,
        pageSize: (doc.page_size === 'LETTER' ? 'LETTER' : 'A4') as 'A4' | 'LETTER',
        marginsMm: {
          top: doc.margin_top_mm,
          right: doc.margin_right_mm,
          bottom: doc.margin_bottom_mm,
          left: doc.margin_left_mm,
        },
        showPageNumbers: doc.show_page_numbers,
      },
      versions: doc.rndtechnosoft_candidate_document_versions.map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        title: v.title,
        changelogNote: v.changelog_note,
        createdAt: v.created_at,
        createdByName: v.created_by?.rndtechnosoft_users.display_name || v.created_by?.rndtechnosoft_users.email || null,
      })),
    };
  }

  /**
   * Update an existing candidate document's title, body, status, or layout.
   */
  async updateDocument(
    tenantId: string,
    candidateId: string,
    documentId: string,
    dto: UpdateCandidateDocumentDto,
    actor: AuthenticatedTenantUser,
  ) {
    return this.saveDocument(
      tenantId,
      candidateId,
      {
        documentId,
        documentTitle: dto.documentTitle ?? 'Document',
        documentType: 'CUSTOM_HR',
        document: dto.document,
        documentStatus: dto.documentStatus,
        layout: dto.layout,
        changelogNote: dto.changelogNote,
        expectedVersionNumber: dto.expectedVersionNumber,
      },
      actor,
    );
  }

  /**
   * Manage document lifecycle status transitions with strict rules and audit recording.
   */
  async changeStatus(
    tenantId: string,
    candidateId: string,
    documentId: string,
    dto: ChangeDocumentStatusDto,
    actor: AuthenticatedTenantUser,
  ) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: documentId },
    });
    if (!doc) throw new NotFoundException('Candidate document not found.');

    const currentStatus = doc.document_status;
    const targetStatus = dto.newStatus || (dto as any).toStatus || (dto as any).status;

    if (currentStatus === targetStatus) {
      return { success: true, status: currentStatus, message: 'Status already set to ' + currentStatus };
    }

    const isOverride = Boolean(dto.isOverride);
    if (isOverride) {
      await this.access.assertHoldsAll(
        tenantId,
        actor.tenantMemberId,
        ['onboarding.candidates.override'],
        'You do not have permission to override document status.',
      );
      if (!dto.reason || dto.reason.trim().length < 10) {
        throw new BadRequestException('An override reason of at least 10 characters is required.');
      }
    } else {
      const allowed = VALID_STATUS_TRANSITIONS[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition: Cannot change status from ${currentStatus} to ${targetStatus}. Permitted next statuses: ${allowed.join(', ') || 'None'}`,
        );
      }

      if (['REJECTED', 'WITHDRAWN'].includes(targetStatus) && !dto.reason?.trim()) {
        throw new BadRequestException(`A reason is required when transitioning status to ${targetStatus}.`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Update document status
      const updatedDoc = await tx.rndtechnosoft_candidate_documents.update({
        where: { id: doc.id },
        data: {
          document_status: targetStatus,
          updated_by_tenant_member_id: actor.tenantMemberId,
          updated_at: new Date(),
        },
      });

      // 2. Record status history
      await tx.rndtechnosoft_candidate_document_status_history.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          document_id: doc.id,
          from_status: currentStatus,
          to_status: targetStatus,
          reason: dto.reason?.trim() ?? null,
          is_override: isOverride,
          changed_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      // 3. Record candidate timeline event
      // Candidate recruitment stage is NOT altered: from_status & to_status remain null.
      await tx.rndtechnosoft_candidate_events.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          candidate_id: candidateId,
          event_type: isOverride ? 'DOCUMENT_STATUS_OVERRIDDEN' : 'DOCUMENT_STATUS_CHANGED',
          from_status: null,
          to_status: null,
          is_override: isOverride,
          summary: isOverride
            ? `Document "${doc.document_title}" status overridden to ${targetStatus}`
            : `Document "${doc.document_title}" status changed to ${targetStatus}`,
          notes: dto.reason?.trim() ?? null,
          actor_tenant_member_id: actor.tenantMemberId,
          metadata: {
            documentId: doc.id,
            documentTitle: doc.document_title,
            fromStatus: currentStatus,
            toStatus: targetStatus,
            isOverride,
          },
        },
      });

      return updatedDoc;
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: isOverride ? 'CANDIDATE_DOCUMENT_STATUS_OVERRIDDEN' : 'CANDIDATE_DOCUMENT_STATUS_CHANGED',
      entityType: 'candidate_document',
      entityId: doc.id,
      oldValues: { document_status: currentStatus },
      newValues: { document_status: targetStatus, isOverride },
      metadata: {
        reason: dto.reason?.trim() ?? null,
        documentTitle: doc.document_title,
        candidateId,
      },
    });

    return {
      id: updated.id,
      documentStatus: updated.document_status,
      currentStatus: updated.document_status,
      status: updated.document_status,
      updatedAt: updated.updated_at,
    };
  }

  /**
   * Retrieve status transition history for a document.
   */
  async getStatusHistory(tenantId: string, candidateId: string, documentId: string) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const history = await this.prisma.rndtechnosoft_candidate_document_status_history.findMany({
      where: { tenant_id: tenantId, document_id: documentId },
      orderBy: { created_at: 'desc' },
      take: 50,
      include: {
        changed_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
      },
    });

    return history.map((h) => ({
      id: h.id,
      fromStatus: h.from_status,
      toStatus: h.to_status,
      reason: h.reason,
      isOverride: h.is_override ?? false,
      createdAt: h.created_at,
      changedAt: h.created_at,
      changedByName: h.changed_by?.rndtechnosoft_users.display_name || h.changed_by?.rndtechnosoft_users.email || 'System',
    }));
  }

  /**
   * List all versions of a document.
   */
  async listVersions(tenantId: string, candidateId: string, documentId: string) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: documentId },
      select: { version_number: true },
    });
    if (!doc) throw new NotFoundException('Document not found.');

    const versions = await this.prisma.rndtechnosoft_candidate_document_versions.findMany({
      where: { tenant_id: tenantId, document_id: documentId },
      orderBy: { version_number: 'desc' },
      include: {
        created_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
      },
    });

    return versions.map((v) => ({
      id: v.id,
      versionNumber: v.version_number,
      title: v.title,
      changelogNote: v.changelog_note,
      isCurrent: v.version_number === doc.version_number,
      createdAt: v.created_at,
      createdByName: v.created_by?.rndtechnosoft_users.display_name || v.created_by?.rndtechnosoft_users.email || null,
    }));
  }

  /**
   * Get a specific historical version of a candidate document.
   */
  async getVersion(tenantId: string, candidateId: string, documentId: string, versionId: string) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId) || !UUID_REGEX.test(versionId)) {
      throw new NotFoundException('Version not found.');
    }

    const version = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
      where: { tenant_id: tenantId, document_id: documentId, id: versionId },
      include: {
        created_by: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
      },
    });

    if (!version) throw new NotFoundException('Document version not found.');

    return {
      id: version.id,
      versionNumber: version.version_number,
      title: version.title,
      body: version.body,
      changelogNote: version.changelog_note,
      document: version.document_data ? parseDocument('CUSTOM_HR', version.document_data) : ({ type: 'doc', content: [] } as DocNode),
      layout: version.layout_data,
      createdAt: version.created_at,
      createdByName: version.created_by?.rndtechnosoft_users.display_name || version.created_by?.rndtechnosoft_users.email || null,
    };
  }

  /**
   * Restores an earlier version by creating a NEW version based on that historical content.
   * Never overwrites or mutates past version records.
   */
  async restoreVersion(
    tenantId: string,
    candidateId: string,
    documentId: string,
    versionId: string,
    actor: AuthenticatedTenantUser,
    dto?: RestoreDocumentVersionDto,
  ) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId) || !UUID_REGEX.test(versionId)) {
      throw new NotFoundException('Version not found.');
    }

    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found.');

    const historical = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
      where: { tenant_id: tenantId, document_id: documentId, id: versionId },
    });
    if (!historical) throw new NotFoundException('Historical version not found.');

    const newVersionNumber = doc.version_number + 1;
    const note = dto?.note?.trim() || `Restored from version v${historical.version_number}`;
    const parsedDoc = historical.document_data
      ? parseDocument(doc.document_type || 'OFFER_LETTER', historical.document_data)
      : ({ type: 'doc', content: [] } as DocNode);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create a brand new version snapshot
      await tx.rndtechnosoft_candidate_document_versions.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          document_id: doc.id,
          version_number: newVersionNumber,
          title: historical.title,
          body: historical.body,
          document_data: historical.document_data as object,
          changelog_note: note,
          content_hash: historical.content_hash,
          layout_data: historical.layout_data as object,
          created_by_tenant_member_id: actor.tenantMemberId,
        },
      });

      // 2. Update active document
      return await tx.rndtechnosoft_candidate_documents.update({
        where: { id: doc.id },
        data: {
          document_title: historical.title,
          rendered_title: historical.title,
          rendered_body: historical.body,
          rendered_document: historical.document_data as object,
          version_number: newVersionNumber,
          updated_by_tenant_member_id: actor.tenantMemberId,
          updated_at: new Date(),
        },
      });
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'CANDIDATE_DOCUMENT_VERSION_RESTORED',
      entityType: 'candidate_document',
      entityId: doc.id,
      newValues: {
        restoredFromVersion: historical.version_number,
        newVersionNumber,
        note,
      },
    });

    return {
      id: result.id,
      documentTitle: result.document_title,
      versionNumber: result.version_number,
      updatedAt: result.updated_at,
      message: `Document restored to v${historical.version_number} as new version v${newVersionNumber}`,
    };
  }

  /**
   * Export the latest saved document as a high-fidelity PDF file.
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
    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(docData.documentTitle)}_v${docData.versionNumber}.pdf`;

    return { bytes, filename };
  }

  /**
   * Export a specific historical version as PDF.
   */
  async exportVersionPdf(tenantId: string, candidateId: string, documentId: string, versionId: string) {
    const docData = await this.get(tenantId, candidateId, documentId);
    const ver = await this.getVersion(tenantId, candidateId, documentId, versionId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { full_name: true, candidate_code: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const layoutConfig = (ver.layout as { pageSize?: 'A4' | 'LETTER'; letterheadId?: string; marginsMm?: PageMargins; showPageNumbers?: boolean }) || docData.layout;

    const layout = await this.letterheads.layoutFor(tenantId, {
      letterhead_id: layoutConfig.letterheadId ?? null,
      page_size: layoutConfig.pageSize ?? 'A4',
      margin_top_mm: layoutConfig.marginsMm?.top ?? 20,
      margin_right_mm: layoutConfig.marginsMm?.right ?? 20,
      margin_bottom_mm: layoutConfig.marginsMm?.bottom ?? 20,
      margin_left_mm: layoutConfig.marginsMm?.left ?? 20,
      show_page_numbers: layoutConfig.showPageNumbers ?? false,
    });

    const letter: LetterPdf = {
      companyName: layout.letterhead?.companyName || 'Company',
      reference: candidate.candidate_code,
      dateText: formatLetterDate(ver.createdAt),
      title: ver.title,
      body: ver.body,
      document: ver.document,
    };

    const bytes = await this.pdf.render(letter, layout);
    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(ver.title)}_v${ver.versionNumber}.pdf`;

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

    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(docData.documentTitle)}_v${docData.versionNumber}.docx`;

    return { bytes, filename };
  }

  /**
   * Export a specific historical version as DOCX.
   */
  async exportVersionDocx(tenantId: string, candidateId: string, documentId: string, versionId: string) {
    const docData = await this.get(tenantId, candidateId, documentId);
    const ver = await this.getVersion(tenantId, candidateId, documentId, versionId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
      select: { full_name: true, candidate_code: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const layoutConfig = (ver.layout as { pageSize?: 'A4' | 'LETTER'; letterheadId?: string; marginsMm?: PageMargins; showPageNumbers?: boolean }) || docData.layout;

    const layout = await this.letterheads.layoutFor(tenantId, {
      letterhead_id: layoutConfig.letterheadId ?? null,
      page_size: layoutConfig.pageSize ?? 'A4',
      margin_top_mm: layoutConfig.marginsMm?.top ?? 20,
      margin_right_mm: layoutConfig.marginsMm?.right ?? 20,
      margin_bottom_mm: layoutConfig.marginsMm?.bottom ?? 20,
      margin_left_mm: layoutConfig.marginsMm?.left ?? 20,
      show_page_numbers: layoutConfig.showPageNumbers ?? false,
    });

    const bytes = await this.docx.render(ver.document, {
      title: ver.title,
      companyName: layout.letterhead?.companyName || 'Company',
      reference: candidate.candidate_code,
      layout: {
        pageSize: layoutConfig.pageSize ?? 'A4',
        marginsMm: layoutConfig.marginsMm ?? { top: 20, right: 20, bottom: 20, left: 20 },
        showPageNumbers: layoutConfig.showPageNumbers ?? false,
        companyName: layout.letterhead?.companyName,
      },
    });

    const filename = `${sanitizeFilename(candidate.full_name)}_${sanitizeFilename(ver.title)}_v${ver.versionNumber}.docx`;

    return { bytes, filename };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // REUSABLE EMAIL TEMPLATES MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Ensures default email templates exist for the workspace if none are found.
   */
  async ensureDefaultEmailTemplates(tenantId: string) {
    const count = await this.prisma.rndtechnosoft_email_templates.count({
      where: { tenant_id: tenantId },
    });

    if (count === 0) {
      const defaults = [
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'Standard Offer Letter Email',
          category: 'ONBOARDING',
          document_kind: 'OFFER_LETTER',
          subject: 'Job Offer: {{document_title}} — {{company_name}}',
          description: 'Standard template sent with candidate offer letters.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>We are delighted to extend this formal offer of employment for the position of <strong>{{designation}}</strong> in the <strong>{{department}}</strong> department at <strong>{{company_name}}</strong>.</p>
<p>Please find attached your official <strong>{{document_type}}</strong> (Version {{document_version}}). This document contains complete details regarding your compensation package of <strong>{{annual_salary}}</strong>, expected date of joining (<strong>{{joining_date}}</strong>), and key terms of employment.</p>
<p>Please review the attached document carefully. Should you have any questions, feel free to reach out to your recruiter, {{recruiter_name}}.</p>
<p>We look forward to welcoming you to the team!</p>
<p>Warm regards,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'Appointment Letter Email',
          category: 'ONBOARDING',
          document_kind: 'APPOINTMENT_LETTER',
          subject: 'Letter of Appointment — {{candidate_name}} | {{company_name}}',
          description: 'Sent when issuing formal appointment letters.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>Congratulations! Following your successful onboarding process, we are pleased to issue your formal <strong>{{document_title}}</strong> as <strong>{{designation}}</strong> with <strong>{{company_name}}</strong>.</p>
<p>Please review the attached PDF document for your official terms of employment, reporting structure, and guidelines starting from {{joining_date}}.</p>
<p>Please sign and return an acknowledged copy at your earliest convenience.</p>
<p>Sincerely,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'Employment Contract Email',
          category: 'ONBOARDING',
          document_kind: 'EMPLOYMENT_CONTRACT',
          subject: 'Employment Agreement & Contract — {{company_name}}',
          description: 'Sent with employment contracts or agreements.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>Please find attached your official <strong>{{document_title}}</strong> for your role as <strong>{{designation}}</strong> with <strong>{{company_name}}</strong>.</p>
<p>Kindly review the contract clauses, intellectual property guidelines, and confidentiality terms detailed in the attached document.</p>
<p>Best regards,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'Non-Disclosure Agreement Email',
          category: 'ONBOARDING',
          document_kind: 'NDA',
          subject: 'Non-Disclosure & Confidentiality Agreement — {{company_name}}',
          description: 'Sent when asking candidates to review and sign NDAs.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>As part of your onboarding at <strong>{{company_name}}</strong>, please find attached the <strong>Non-Disclosure Agreement</strong> for your review and signature.</p>
<p>This agreement outlines the confidentiality obligations and standards associated with your employment.</p>
<p>Regards,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'Joining & Welcome Instructions Email',
          category: 'ONBOARDING',
          document_kind: 'JOINING_LETTER',
          subject: 'Welcome to {{company_name}}! Joining Instructions',
          description: 'Sent before joining with first-day details and instructions.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>A very warm welcome to <strong>{{company_name}}</strong>! We are excited to have you join us on <strong>{{joining_date}}</strong> as <strong>{{designation}}</strong>.</p>
<p>Please find attached your <strong>{{document_title}}</strong> containing day-one orientation details, reporting timings, and office contacts.</p>
<p>See you soon!</p>
<p>Warm regards,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
        {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: 'General HR Document Email',
          category: 'GENERAL',
          document_kind: 'GENERAL',
          subject: '{{document_title}} — {{company_name}}',
          description: 'Fallback email template for generic HR letters and certificates.',
          body_text: `<p>Dear {{candidate_name}},</p>
<p>Please find attached your official document: <strong>{{document_title}}</strong> (Version {{document_version}}) from <strong>{{company_name}}</strong>.</p>
<p>If you have any questions or require clarifications, please reply to this email or contact the HR department.</p>
<p>Regards,<br/><strong>{{sender_name}}</strong><br/>{{company_name}}</p>`,
          is_active: true,
        },
      ];

      await this.prisma.rndtechnosoft_email_templates.createMany({
        data: defaults,
        skipDuplicates: true,
      });
    }

    // Ensure document templates have their default_email_template_id linked if currently unset
    const unassociatedDocTemplates = await this.prisma.rndtechnosoft_document_templates.findMany({
      where: { tenant_id: tenantId, default_email_template_id: null },
      select: { id: true, template_kind: true, template_name: true },
    });

    if (unassociatedDocTemplates.length > 0) {
      const activeEmailTpls = await this.prisma.rndtechnosoft_email_templates.findMany({
        where: { tenant_id: tenantId, is_active: true },
        select: { id: true, document_kind: true, template_name: true },
      });

      for (const docTpl of unassociatedDocTemplates) {
        const match =
          activeEmailTpls.find((e) => e.document_kind === docTpl.template_kind) ||
          activeEmailTpls.find((e) => e.document_kind === 'GENERAL') ||
          activeEmailTpls[0];
        if (match) {
          await this.prisma.rndtechnosoft_document_templates.update({
            where: { id: docTpl.id },
            data: { default_email_template_id: match.id },
          });
        }
      }
    }
  }

  /**
   * Update the email template associated with a document template.
   */
  async updateDocumentTemplateEmailAssociation(
    tenantId: string,
    templateId: string,
    emailTemplateId: string | null,
    actor: AuthenticatedTenantUser,
  ) {
    if (!UUID_REGEX.test(templateId)) throw new NotFoundException('Document template not found.');
    if (emailTemplateId && !UUID_REGEX.test(emailTemplateId)) {
      throw new BadRequestException('Invalid email template ID.');
    }

    const docTpl = await this.prisma.rndtechnosoft_document_templates.findFirst({
      where: { tenant_id: tenantId, id: templateId },
    });
    if (!docTpl) throw new NotFoundException('Document template not found.');

    if (emailTemplateId) {
      const emailTpl = await this.prisma.rndtechnosoft_email_templates.findFirst({
        where: { tenant_id: tenantId, id: emailTemplateId, is_active: true },
      });
      if (!emailTpl) throw new NotFoundException('Email template not found in this workspace.');
    }

    const updated = await this.prisma.rndtechnosoft_document_templates.update({
      where: { id: docTpl.id },
      data: {
        default_email_template_id: emailTemplateId,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_TEMPLATE_EMAIL_ASSOCIATION_UPDATED',
      entityType: 'document_template',
      entityId: docTpl.id,
      newValues: {
        templateName: docTpl.template_name,
        defaultEmailTemplateId: emailTemplateId,
      },
    });

    return {
      id: updated.id,
      templateName: updated.template_name,
      defaultEmailTemplateId: updated.default_email_template_id,
    };
  }

  /**
   * List reusable email templates.
   */
  async listEmailTemplates(tenantId: string, category?: string, documentKind?: string) {
    await this.ensureDefaultEmailTemplates(tenantId);

    const where: { tenant_id: string; is_active?: boolean; category?: string; document_kind?: string } = {
      tenant_id: tenantId,
      is_active: true,
    };
    if (category) where.category = category;
    if (documentKind) where.document_kind = documentKind;

    const list = await this.prisma.rndtechnosoft_email_templates.findMany({
      where,
      include: {
        rndtechnosoft_document_templates: {
          select: {
            id: true,
            template_name: true,
            template_kind: true,
          },
        },
      },
      orderBy: [{ category: 'asc' }, { template_name: 'asc' }],
    });

    return list.map((t) => ({
      ...t,
      templateName: t.template_name,
      documentKind: t.document_kind,
      bodyText: t.body_text,
      isActive: t.is_active,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      linkedDocumentTemplates: t.rndtechnosoft_document_templates.map((d) => ({
        id: d.id,
        name: d.template_name,
        kind: d.template_kind,
      })),
    }));
  }

  /**
   * Get single email template.
   */
  async getEmailTemplate(tenantId: string, id: string) {
    if (!UUID_REGEX.test(id)) throw new NotFoundException('Email template not found.');

    const tpl = await this.prisma.rndtechnosoft_email_templates.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!tpl) throw new NotFoundException('Email template not found.');
    return tpl;
  }

  /**
   * Create new reusable email template.
   */
  async createEmailTemplate(tenantId: string, dto: CreateEmailTemplateDto, actor: AuthenticatedTenantUser) {
    const created = await this.prisma.rndtechnosoft_email_templates.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        template_name: dto.templateName.trim(),
        category: dto.category.trim(),
        document_kind: dto.documentKind?.trim() || 'GENERAL',
        subject: dto.subject.trim(),
        description: dto.description?.trim() || null,
        body_text: dto.bodyText,
        is_active: dto.isActive ?? true,
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'EMAIL_TEMPLATE_CREATED',
      entityType: 'email_template',
      entityId: created.id,
      newValues: { templateName: created.template_name },
    });

    return created;
  }

  /**
   * Update existing email template.
   */
  async updateEmailTemplate(tenantId: string, id: string, dto: UpdateEmailTemplateDto, actor: AuthenticatedTenantUser) {
    if (!UUID_REGEX.test(id)) throw new NotFoundException('Email template not found.');

    const existing = await this.prisma.rndtechnosoft_email_templates.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Email template not found.');

    const updated = await this.prisma.rndtechnosoft_email_templates.update({
      where: { id: existing.id },
      data: {
        template_name: dto.templateName !== undefined ? dto.templateName.trim() : existing.template_name,
        category: dto.category !== undefined ? dto.category.trim() : existing.category,
        document_kind: dto.documentKind !== undefined ? dto.documentKind.trim() : existing.document_kind,
        subject: dto.subject !== undefined ? dto.subject.trim() : existing.subject,
        description: dto.description !== undefined ? dto.description?.trim() || null : existing.description,
        body_text: dto.bodyText !== undefined ? dto.bodyText : existing.body_text,
        is_active: dto.isActive !== undefined ? dto.isActive : existing.is_active,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'EMAIL_TEMPLATE_UPDATED',
      entityType: 'email_template',
      entityId: updated.id,
      newValues: { templateName: updated.template_name },
    });

    return updated;
  }

  /**
   * Duplicate existing email template.
   */
  async duplicateEmailTemplate(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    const existing = await this.getEmailTemplate(tenantId, id);

    const duplicated = await this.prisma.rndtechnosoft_email_templates.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        template_name: `${existing.template_name} (Copy)`,
        category: existing.category,
        document_kind: existing.document_kind,
        subject: existing.subject,
        description: existing.description,
        body_text: existing.body_text,
        is_active: true,
      },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'EMAIL_TEMPLATE_DUPLICATED',
      entityType: 'email_template',
      entityId: duplicated.id,
      newValues: { originalId: id, newName: duplicated.template_name },
    });

    return duplicated;
  }

  /**
   * Delete or deactivate email template.
   */
  async deleteEmailTemplate(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    if (!UUID_REGEX.test(id)) throw new NotFoundException('Email template not found.');

    const existing = await this.prisma.rndtechnosoft_email_templates.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Email template not found.');

    await this.prisma.rndtechnosoft_email_templates.update({
      where: { id: existing.id },
      data: { is_active: false, updated_at: new Date() },
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'EMAIL_TEMPLATE_DEACTIVATED',
      entityType: 'email_template',
      entityId: existing.id,
    });

    return { success: true, message: 'Email template deactivated successfully' };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DYNAMIC EMAIL PREVIEW AND SENDING
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dynamic placeholder resolution for email subject and body.
   */
  resolveEmailPlaceholders(text: string, values: Record<string, string>): { resolved: string; unresolvedPlaceholders: string[] } {
    const resolved = text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
      if (values[key] !== undefined && values[key] !== null) {
        return escapeHtml(values[key]);
      }
      return match;
    });

    const unresolved: string[] = [];
    const matches = resolved.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    for (const m of matches) {
      if (!unresolved.includes(m[1])) {
        unresolved.push(m[1]);
      }
    }

    return { resolved, unresolvedPlaceholders: unresolved };
  }

  /**
   * Previews an email composition for a candidate document with all placeholders evaluated.
   */
  async previewEmail(
    tenantId: string,
    candidateId: string,
    documentId: string,
    options?: { templateId?: string; versionId?: string },
  ) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    await this.ensureDefaultEmailTemplates(tenantId);

    const doc = await this.get(tenantId, candidateId, documentId);
    const candidateData = await this.getCandidatePlaceholders(tenantId, candidateId);

    // Pick target version: prefer the latest saved version record from rndtechnosoft_candidate_document_versions
    const latestVer = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
      where: { tenant_id: tenantId, document_id: doc.id },
      orderBy: { version_number: 'desc' },
    });

    let targetVersion = {
      id: latestVer?.id || doc.id,
      versionNumber: latestVer?.version_number || doc.versionNumber,
      title: latestVer?.title || doc.documentTitle,
    };
    if (options?.versionId && UUID_REGEX.test(options.versionId)) {
      const ver = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
        where: { tenant_id: tenantId, document_id: doc.id, id: options.versionId },
      });
      if (ver) {
        targetVersion = {
          id: ver.id,
          versionNumber: ver.version_number,
          title: ver.title,
        };
      }
    }

    // Determine email template
    let template = null;
    let associatedTemplateId: string | null = null;
    if (doc.templateId) {
      const docTpl = await this.prisma.rndtechnosoft_document_templates.findFirst({
        where: { tenant_id: tenantId, id: doc.templateId },
        select: { default_email_template_id: true },
      });
      associatedTemplateId = docTpl?.default_email_template_id ?? null;
    }

    if (options?.templateId && UUID_REGEX.test(options.templateId)) {
      template = await this.prisma.rndtechnosoft_email_templates.findFirst({
        where: { tenant_id: tenantId, id: options.templateId, is_active: true },
      });
    }

    if (!template && associatedTemplateId) {
      template = await this.prisma.rndtechnosoft_email_templates.findFirst({
        where: { tenant_id: tenantId, id: associatedTemplateId, is_active: true },
      });
    }

    if (!template) {
      // Find template matching document kind
      template = await this.prisma.rndtechnosoft_email_templates.findFirst({
        where: { tenant_id: tenantId, document_kind: doc.documentType, is_active: true },
      });
    }

    if (!template) {
      // Fallback to general template or first available template
      template = await this.prisma.rndtechnosoft_email_templates.findFirst({
        where: { tenant_id: tenantId, is_active: true },
        orderBy: { created_at: 'asc' },
      });
    }

    const availableTemplates = await this.listEmailTemplates(tenantId);

    // Build values dictionary
    const values: Record<string, string> = {};
    for (const [k, v] of Object.entries(candidateData.resolvedPlaceholders)) {
      if (v !== null) values[k] = v;
    }
    values.document_title = doc.documentTitle;
    values.document_type = doc.typeLabel;
    values.document_version = `v${targetVersion.versionNumber}`;
    values.document_status = doc.documentStatus;
    values.current_date = formatLetterDate(new Date());
    values.sender_name = values.sender_name || values.recruiter_name || 'HR Team';
    values.recruiter_name = values.recruiter_name || 'your recruiter';

    const subjectTemplate = template?.subject || `{{document_title}} — {{company_name}}`;
    const bodyTemplate = template?.body_text || `<p>Dear {{candidate_name}},</p><p>Please find attached your {{document_title}}.</p>`;

    const { resolved: resolvedSubject, unresolvedPlaceholders: subjUnresolved } = this.resolveEmailPlaceholders(subjectTemplate, values);
    const { resolved: resolvedBody, unresolvedPlaceholders: bodyUnresolved } = this.resolveEmailPlaceholders(bodyTemplate, values);

    const allUnresolved = Array.from(new Set([...subjUnresolved, ...bodyUnresolved]));
    const candidate = candidateData.candidate;
    const attachmentFilename = `${sanitizeFilename(candidate.fullName)}_${sanitizeFilename(doc.documentTitle)}_v${targetVersion.versionNumber}.pdf`;

    return {
      templateId: template?.id ?? null,
      templateName: template?.template_name ?? null,
      associatedTemplateId,
      documentTemplateId: doc.templateId ?? null,
      recipientEmail: candidate.email,
      candidateName: candidate.fullName,
      subject: resolvedSubject,
      bodyHtml: resolvedBody,
      attachmentFilename,
      versionNumber: targetVersion.versionNumber,
      versionId: targetVersion.id,
      unresolvedPlaceholders: allUnresolved,
      hasUnresolvedPlaceholders: allUnresolved.length > 0,
      availableTemplates: availableTemplates.map((t) => ({
        id: t.id,
        name: t.template_name,
        category: t.category,
        documentKind: t.document_kind,
      })),
      supportedPlaceholders: [
        'candidate_name',
        'candidate_email',
        'candidate_id',
        'designation',
        'department',
        'joining_date',
        'annual_salary',
        'company_name',
        'recruiter_name',
        'document_title',
        'document_type',
        'document_version',
        'document_status',
        'current_date',
        'sender_name',
      ],
    };
  }

  /**
   * Sends the candidate document as a high-fidelity PDF attachment via email.
   * Records sending history, snapshot attachment, and transitions document status to SENT.
   */
  async sendEmail(
    tenantId: string,
    candidateId: string,
    documentId: string,
    dto: SendCandidateDocumentEmailDto,
    actor: AuthenticatedTenantUser,
  ) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const doc = await this.prisma.rndtechnosoft_candidate_documents.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: documentId },
    });
    if (!doc) throw new NotFoundException('Candidate document not found.');

    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: candidateId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    // Workflow validation: Prevent sending a rejected, withdrawn, or in-review document
    if (['REJECTED', 'WITHDRAWN'].includes(doc.document_status)) {
      throw new BadRequestException(
        `Cannot send a document with status ${doc.document_status}. Please reopen or update the document first.`,
      );
    }
    if (doc.document_status === 'IN_REVIEW') {
      throw new BadRequestException(
        'Document is currently in review. It must be approved before sending it to the candidate.',
      );
    }

    // Determine target version
    let targetVersionId: string | null = null;
    let targetVersionNumber = doc.version_number;

    if (dto.versionId && UUID_REGEX.test(dto.versionId)) {
      const ver = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
        where: { tenant_id: tenantId, document_id: doc.id, id: dto.versionId },
      });
      if (ver) {
        targetVersionId = ver.id;
        targetVersionNumber = ver.version_number;
      }
    }

    if (!targetVersionId) {
      const latestVer = await this.prisma.rndtechnosoft_candidate_document_versions.findFirst({
        where: { tenant_id: tenantId, document_id: doc.id },
        orderBy: { version_number: 'desc' },
      });
      if (latestVer) {
        targetVersionId = latestVer.id;
        targetVersionNumber = latestVer.version_number;
      }
    }

    // Generate exact PDF snapshot for the version
    let pdfExport: { bytes: Buffer; filename: string };
    if (targetVersionId) {
      try {
        pdfExport = await this.exportVersionPdf(tenantId, candidateId, documentId, targetVersionId);
      } catch {
        pdfExport = await this.exportPdf(tenantId, candidateId, documentId);
      }
    } else {
      pdfExport = await this.exportPdf(tenantId, candidateId, documentId);
    }

    const idempotencyKey = dto.idempotencyKey?.trim() || `cand-doc-${doc.id}-v${targetVersionNumber}-${Date.now()}`;

    // Send email using OnboardingMailerService
    const outcome = await this.onboardingMailer.send({
      tenantId,
      idempotencyKey,
      templateCode: `CANDIDATE_DOC_${doc.document_type}`,
      to: dto.recipientEmail.trim().toLowerCase(),
      subject: dto.subject.trim(),
      text: stripHtml(dto.bodyHtml),
      html: dto.bodyHtml,
      candidateId,
      initiatedBy: {
        tenantMemberId: actor.tenantMemberId,
        userId: actor.userId,
      },
      attachments: [
        {
          filename: pdfExport.filename,
          content: Buffer.from(pdfExport.bytes),
          contentType: 'application/pdf',
        },
      ],
    });

    const isSuccess = outcome.status === 'SENT' || (outcome as any).success === true;

    const emailRecord = await this.prisma.$transaction(async (tx) => {
      // 1. Record sending in rndtechnosoft_candidate_document_emails
      const createdEmail = await tx.rndtechnosoft_candidate_document_emails.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          candidate_id: candidateId,
          document_id: doc.id,
          version_id: targetVersionId ?? null,
          version_number: targetVersionNumber,
          email_template_id: (dto.emailTemplateId || dto.templateId) ?? null,
          sender_tenant_member_id: actor.tenantMemberId,
          sender_email: outcome.sentFrom ?? null,
          recipient_email: dto.recipientEmail.trim().toLowerCase(),
          cc_emails: dto.ccEmails?.trim() || null,
          bcc_emails: dto.bccEmails?.trim() || null,
          subject: dto.subject.trim(),
          body_html: dto.bodyHtml,
          attachment_filename: pdfExport.filename,
          delivery_status: isSuccess ? 'SENT' : 'FAILED',
          error_message: outcome.error,
          idempotency_key: idempotencyKey,
        },
      });

      // 2. Update document metadata
      if (isSuccess) {
        await tx.rndtechnosoft_candidate_documents.update({
          where: { id: doc.id },
          data: {
            document_status: 'SENT',
            email_status: 'SENT',
            last_sent_at: new Date(),
            last_sent_by_tenant_member_id: actor.tenantMemberId,
            updated_at: new Date(),
          },
        });

        // 3. Status history entry
        if (doc.document_status !== 'SENT') {
          await tx.rndtechnosoft_candidate_document_status_history.create({
            data: {
              id: randomUUID(),
              tenant_id: tenantId,
              document_id: doc.id,
              from_status: doc.document_status,
              to_status: 'SENT',
              reason: `Document sent via email to ${dto.recipientEmail}`,
              changed_by_tenant_member_id: actor.tenantMemberId,
            },
          });
        }

        // 4. Candidate timeline event
        await tx.rndtechnosoft_candidate_events.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            candidate_id: candidateId,
            event_type: 'DOCUMENT_SENT',
            summary: `Document "${doc.document_title}" (v${targetVersionNumber}) sent to ${dto.recipientEmail}`,
            notes: `Subject: ${dto.subject}`,
            actor_tenant_member_id: actor.tenantMemberId,
            metadata: {
              documentId: doc.id,
              versionNumber: targetVersionNumber,
              recipient: dto.recipientEmail,
            },
          },
        });
      } else {
        await tx.rndtechnosoft_candidate_documents.update({
          where: { id: doc.id },
          data: {
            email_status: 'FAILED',
            updated_at: new Date(),
          },
        });
      }

      return createdEmail;
    });

    await this.audit.log({
      tenantId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: isSuccess ? 'CANDIDATE_DOCUMENT_EMAIL_SENT' : 'CANDIDATE_DOCUMENT_EMAIL_FAILED',
      entityType: 'candidate_document',
      entityId: doc.id,
      newValues: {
        recipient: dto.recipientEmail,
        versionNumber: targetVersionNumber,
        status: outcome.status,
        error: outcome.error,
      },
    });

    return {
      success: isSuccess,
      outcome,
      emailId: emailRecord.id,
      deliveryStatus: emailRecord.delivery_status,
      documentStatus: isSuccess ? 'SENT' : doc.document_status,
      attachmentFilename: emailRecord.attachment_filename,
    };
  }

  /**
   * Retrieve email sending history for a candidate document.
   */
  async listEmails(tenantId: string, candidateId: string, documentId: string) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId)) {
      throw new NotFoundException('Document not found.');
    }

    const emails = await this.prisma.rndtechnosoft_candidate_document_emails.findMany({
      where: { tenant_id: tenantId, document_id: documentId },
      orderBy: { sent_at: 'desc' },
      take: 50,
      include: {
        sender: {
          select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
        },
      },
    });

    return emails.map((e) => ({
      id: e.id,
      versionNumber: e.version_number,
      recipientEmail: e.recipient_email,
      ccEmails: e.cc_emails,
      bccEmails: e.bcc_emails,
      subject: e.subject,
      deliveryStatus: e.delivery_status,
      errorMessage: e.error_message,
      sentAt: e.sent_at,
      attachmentFilename: e.attachment_filename,
      senderName: e.sender?.rndtechnosoft_users.display_name || e.sender?.rndtechnosoft_users.email || e.sender_email || 'System',
      canRetry: e.delivery_status === 'FAILED',
    }));
  }

  /**
   * Retry sending a previously failed email.
   */
  async retryEmail(
    tenantId: string,
    candidateId: string,
    documentId: string,
    emailId: string,
    actor: AuthenticatedTenantUser,
  ) {
    if (!UUID_REGEX.test(candidateId) || !UUID_REGEX.test(documentId) || !UUID_REGEX.test(emailId)) {
      throw new NotFoundException('Email record not found.');
    }

    const email = await this.prisma.rndtechnosoft_candidate_document_emails.findFirst({
      where: { tenant_id: tenantId, id: emailId, document_id: documentId },
    });
    if (!email) throw new NotFoundException('Email delivery record not found.');

    return this.sendEmail(
      tenantId,
      candidateId,
      documentId,
      {
        versionId: email.version_id ?? undefined,
        recipientEmail: email.recipient_email,
        ccEmails: email.cc_emails ?? undefined,
        bccEmails: email.bcc_emails ?? undefined,
        subject: email.subject,
        bodyHtml: email.body_html,
        idempotencyKey: `retry-${email.id}-${Date.now()}`,
      },
      actor,
    );
  }
}
