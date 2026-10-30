import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { CandidatesService } from './candidates.service';
import { OnboardingMailerService, OnboardingSendOutcome, escapeHtml } from './onboarding-mailer.service';
import { OffersService, ResponseMeta } from './offers.service';
import { CANDIDATE_STATUS_LABELS, CandidateStatus } from './onboarding-workflow';
import { formatLetterDate } from '@/modules/documents/document-templates';
import {
  COLLECTING_STATUSES,
  DEFAULT_DOCUMENT_DEFINITIONS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPES,
  DOCUMENTS_CLOSED,
  DocumentType,
  LINK_DAYS,
  MAX_FILE_BYTES,
  MAX_REQUESTS_PER_CANDIDATE,
  MAX_VERSIONS_PER_REQUEST,
  documentStage,
  requestState,
  safeFilename,
  sniffFileKind,
} from './candidate-documents';
import {
  CreateDocumentTypeDto,
  DocumentRequestItemDto,
  UpdateDocumentTypeDto,
  UploadFileMetaDto,
} from './dto/onboarding.dto';

type Tx = Prisma.TransactionClient;

/** The uploaded file as the upload handler hands it over. */
export interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
  size: number;
}

type Uploader =
  | { via: 'STAFF'; actor: AuthenticatedTenantUser }
  | { via: 'CANDIDATE'; ip: string | null; userAgent: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER = { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const nameOf = (m?: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) =>
  m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const FILES = {
  orderBy: { version_number: 'desc' },
  include: { uploaded_by: MEMBER, reviewed_by: MEMBER },
} as const;

/**
 * Documents asked of a candidate: HR requests them, the candidate (through a
 * link emailed to them) or HR uploads them, and HR verifies or rejects every
 * upload. Supports multiple files per document requirement with dynamic limits
 * and named upload slots (e.g. Front Side, Back Side).
 */
@Injectable()
export class CandidateDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly candidates: CandidatesService,
    private readonly mailer: OnboardingMailerService,
    private readonly offers: OffersService,
    private readonly storage: PrivateStorageService,
    private readonly domains: TenantDomainsService,
  ) {}

  // ── Document Types Master (HR Settings) ──────────────────────

  /** Lists configured document types for this workspace, seeding standard defaults if none exist. */
  async listDocumentTypes(tenantId: string) {
    let types = await this.prisma.rndtechnosoft_document_types.findMany({
      where: { tenant_id: tenantId },
      orderBy: [{ is_required: 'desc' }, { name: 'asc' }],
    });

    if (types.length === 0) {
      await this.seedDefaultDocumentTypes(tenantId);
      types = await this.prisma.rndtechnosoft_document_types.findMany({
        where: { tenant_id: tenantId },
        orderBy: [{ is_required: 'desc' }, { name: 'asc' }],
      });
    }

    return types.map((t) => this.mapDocumentType(t));
  }

  async createDocumentType(tenantId: string, dto: CreateDocumentTypeDto, actor: AuthenticatedTenantUser) {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.prisma.rndtechnosoft_document_types.findFirst({
      where: { tenant_id: tenantId, code },
    });
    if (existing) {
      throw new ConflictException(`A document type with code ${code} already exists.`);
    }

    const minFiles = Math.max(1, dto.minFiles ?? 1);
    const maxFiles = Math.max(minFiles, dto.maxFiles ?? minFiles);
    const slots = Array.isArray(dto.slots)
      ? dto.slots.map((s) => String(s).trim()).filter(Boolean)
      : dto.requiresFrontBack
        ? ['Front Side', 'Back Side']
        : null;

    const docType = await this.prisma.rndtechnosoft_document_types.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        is_required: dto.isRequired ?? true,
        min_files: minFiles,
        max_files: maxFiles,
        allowed_formats: dto.allowedFormats ? (dto.allowedFormats as any) : ['application/pdf', 'image/jpeg', 'image/png'],
        max_file_size_bytes: dto.maxFileSizeBytes ?? MAX_FILE_BYTES,
        allow_images: dto.allowImages ?? true,
        allow_pdf: dto.allowPdf ?? true,
        requires_front_back: dto.requiresFrontBack ?? Boolean(slots && slots.length === 2),
        allow_multiple_pages: dto.allowMultiplePages ?? maxFiles > 1,
        requires_verification: dto.requiresVerification ?? true,
        can_reupload_rejected: dto.canReuploadRejected ?? true,
        slots: slots ? (slots as any) : Prisma.JsonNull,
        is_active: dto.isActive ?? true,
        created_by_tenant_member_id: actor.tenantMemberId,
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_TYPE_CREATED',
      entityType: 'DOCUMENT_TYPE',
      entityId: docType.id,
      newValues: { code: docType.code, name: docType.name, minFiles: docType.min_files, maxFiles: docType.max_files },
    });

    return this.mapDocumentType(docType);
  }

  async updateDocumentType(tenantId: string, id: string, dto: UpdateDocumentTypeDto, actor: AuthenticatedTenantUser) {
    if (!UUID.test(id)) throw new NotFoundException('Document type not found.');
    const existing = await this.prisma.rndtechnosoft_document_types.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Document type not found.');

    const minFiles = dto.minFiles !== undefined ? Math.max(1, dto.minFiles) : existing.min_files;
    const maxFiles = dto.maxFiles !== undefined ? Math.max(minFiles, dto.maxFiles) : Math.max(minFiles, existing.max_files);
    const slots = dto.slots !== undefined
      ? (Array.isArray(dto.slots) ? dto.slots.map((s) => String(s).trim()).filter(Boolean) : null)
      : dto.requiresFrontBack
        ? ['Front Side', 'Back Side']
        : (existing.slots as string[] | null);

    const updated = await this.prisma.rndtechnosoft_document_types.update({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
      data: {
        name: dto.name !== undefined ? dto.name.trim() : undefined,
        description: dto.description !== undefined ? dto.description.trim() || null : undefined,
        is_required: dto.isRequired !== undefined ? dto.isRequired : undefined,
        min_files: minFiles,
        max_files: maxFiles,
        allowed_formats: dto.allowedFormats !== undefined ? (dto.allowedFormats as any) : undefined,
        max_file_size_bytes: dto.maxFileSizeBytes !== undefined ? dto.maxFileSizeBytes : undefined,
        allow_images: dto.allowImages !== undefined ? dto.allowImages : undefined,
        allow_pdf: dto.allowPdf !== undefined ? dto.allowPdf : undefined,
        requires_front_back: dto.requiresFrontBack !== undefined ? dto.requiresFrontBack : undefined,
        allow_multiple_pages: dto.allowMultiplePages !== undefined ? dto.allowMultiplePages : undefined,
        requires_verification: dto.requiresVerification !== undefined ? dto.requiresVerification : undefined,
        can_reupload_rejected: dto.canReuploadRejected !== undefined ? dto.canReuploadRejected : undefined,
        slots: slots ? (slots as any) : Prisma.JsonNull,
        is_active: dto.isActive !== undefined ? dto.isActive : undefined,
        updated_at: new Date(),
      },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_TYPE_UPDATED',
      entityType: 'DOCUMENT_TYPE',
      entityId: id,
      newValues: { name: updated.name, minFiles: updated.min_files, maxFiles: updated.max_files },
    });

    return this.mapDocumentType(updated);
  }

  async deleteDocumentType(tenantId: string, id: string, actor: AuthenticatedTenantUser) {
    if (!UUID.test(id)) throw new NotFoundException('Document type not found.');
    const existing = await this.prisma.rndtechnosoft_document_types.findFirst({
      where: { tenant_id: tenantId, id },
    });
    if (!existing) throw new NotFoundException('Document type not found.');

    const usageCount = await this.prisma.rndtechnosoft_candidate_document_requests.count({
      where: { tenant_id: tenantId, document_type_id: id },
    });

    if (usageCount > 0) {
      // In use: soft-deactivate rather than breaking active candidate references
      await this.prisma.rndtechnosoft_document_types.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: { is_active: false, updated_at: new Date() },
      });
      return { message: 'Document type is referenced by candidate requests, so it has been deactivated.' };
    }

    await this.prisma.rndtechnosoft_document_types.delete({
      where: { tenant_id_id: { tenant_id: tenantId, id } },
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'DOCUMENT_TYPE_DELETED',
      entityType: 'DOCUMENT_TYPE',
      entityId: id,
    });

    return { message: 'Document type deleted.' };
  }

  private async seedDefaultDocumentTypes(tenantId: string) {
    for (const def of DEFAULT_DOCUMENT_DEFINITIONS) {
      await this.prisma.rndtechnosoft_document_types.upsert({
        where: { tenant_id_code: { tenant_id: tenantId, code: def.code } },
        create: {
          id: randomUUID(),
          tenant_id: tenantId,
          code: def.code,
          name: def.name,
          description: def.description ?? null,
          is_required: def.isRequired,
          min_files: def.minFiles,
          max_files: def.maxFiles,
          allowed_formats: def.allowedFormats ? (def.allowedFormats as any) : ['application/pdf', 'image/jpeg', 'image/png'],
          max_file_size_bytes: def.maxFileSizeBytes,
          allow_images: def.allowImages,
          allow_pdf: def.allowPdf,
          requires_front_back: def.requiresFrontBack,
          allow_multiple_pages: def.allowMultiplePages,
          requires_verification: def.requiresVerification,
          can_reupload_rejected: def.canReuploadRejected,
          slots: def.slots ? (def.slots as any) : Prisma.JsonNull,
          is_active: def.isActive,
        },
        update: {},
      });
    }
  }

  private mapDocumentType(t: any) {
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      description: t.description,
      isRequired: t.is_required,
      minFiles: t.min_files,
      maxFiles: t.max_files,
      allowedFormats: (t.allowed_formats as string[] | null) || ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: t.max_file_size_bytes,
      allowImages: t.allow_images,
      allowPdf: t.allow_pdf,
      requiresFrontBack: t.requires_front_back,
      allowMultiplePages: t.allow_multiple_pages,
      requiresVerification: t.requires_verification,
      canReuploadRejected: t.can_reupload_rejected,
      slots: (t.slots as string[] | null) || null,
      isActive: t.is_active,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }

  // ── HR Candidate Documents ───────────────────────────────────

  async list(tenantId: string, candidateId: string) {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id: this.candidates.idOr404(candidateId) },
      select: { candidate_status: true, archived_at: true, document_link_sent_at: true, document_link_expires_at: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');

    const requests = await this.prisma.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: tenantId, candidate_id: candidateId },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: { rndtechnosoft_candidate_document_files: FILES },
    });

    const status = candidate.candidate_status as CandidateStatus;

    const items = requests.map((r) => {
      const allFiles = r.rndtechnosoft_candidate_document_files;
      const rawSlots = r.slots as string[] | null;
      const configuredSlots = Array.isArray(rawSlots) && rawSlots.length > 0
        ? rawSlots.map((s) => String(s).trim()).filter(Boolean)
        : null;

      const state = requestState(allFiles, {
        minFiles: r.min_files,
        maxFiles: r.max_files,
        slots: configuredSlots,
        requiresFrontBack: r.requires_front_back,
      });

      // Split into active unreplaced files vs historical replaced files
      const replacedIds = new Set(allFiles.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
      const activeFiles = allFiles.filter((f) => !replacedIds.has(f.id) && f.review_status !== 'SUPERSEDED');
      const historicalFiles = allFiles.filter((f) => replacedIds.has(f.id) || f.review_status === 'SUPERSEDED');

      // Map slots if slotted document
      const slotsStatus = configuredSlots
        ? configuredSlots.map((slot) => {
            const slotFiles = activeFiles
              .filter((f) => (f.slot_name || '').toLowerCase() === slot.toLowerCase())
              .sort((a, b) => b.version_number - a.version_number);
            const activeSlotFile = slotFiles[0] ?? null;
            return {
              slotName: slot,
              isUploaded: Boolean(activeSlotFile),
              file: activeSlotFile
                ? {
                    id: activeSlotFile.id,
                    version: activeSlotFile.version_number,
                    filename: activeSlotFile.original_filename,
                    contentType: activeSlotFile.content_type,
                    sizeBytes: activeSlotFile.file_size_bytes,
                    uploadedVia: activeSlotFile.uploaded_via,
                    uploadedBy: activeSlotFile.uploaded_via === 'STAFF' ? nameOf(activeSlotFile.uploaded_by) : 'The candidate',
                    uploadedAt: activeSlotFile.created_at,
                    reviewStatus: activeSlotFile.review_status,
                    reviewedBy: nameOf(activeSlotFile.reviewed_by),
                    reviewedAt: activeSlotFile.reviewed_at,
                    rejectionReason: activeSlotFile.rejection_reason,
                    slotName: activeSlotFile.slot_name,
                  }
                : null,
            };
          })
        : null;

      const mappedFiles = allFiles.map((f) => ({
        id: f.id,
        version: f.version_number,
        filename: f.original_filename,
        contentType: f.content_type,
        sizeBytes: f.file_size_bytes,
        uploadedVia: f.uploaded_via,
        uploadedBy: f.uploaded_via === 'STAFF' ? nameOf(f.uploaded_by) : 'The candidate',
        uploadedAt: f.created_at,
        reviewStatus: f.review_status,
        reviewedBy: nameOf(f.reviewed_by),
        reviewedAt: f.reviewed_at,
        rejectionReason: f.rejection_reason,
        slotName: f.slot_name,
        replacedFileId: f.replaced_file_id,
        isActive: !replacedIds.has(f.id) && f.review_status !== 'SUPERSEDED',
      }));

      return {
        id: r.id,
        type: r.document_type,
        label: r.document_label,
        isRequired: r.is_required,
        documentTypeId: r.document_type_id,
        minFiles: r.min_files,
        maxFiles: r.max_files,
        slots: configuredSlots,
        requiresFrontBack: r.requires_front_back,
        allowMultiplePages: r.allow_multiple_pages,
        requiresVerification: r.requires_verification,
        canReuploadRejected: r.can_reupload_rejected,
        allowedFormats: (r.allowed_formats as string[] | null) || ['application/pdf', 'image/jpeg', 'image/png'],
        maxFileSizeBytes: r.max_file_size_bytes,
        state,
        status: state, // Alias for clear domain naming
        createdAt: r.created_at,
        activeFilesCount: activeFiles.length,
        slotsStatus,
        files: mappedFiles,
        historicalCount: historicalFiles.length,
      };
    });

    const activeDocTypes = await this.listDocumentTypes(tenantId);

    return {
      candidateStatus: status,
      canChange: !candidate.archived_at && !DOCUMENTS_CLOSED.includes(status),
      canSendLink: !candidate.archived_at && COLLECTING_STATUSES.includes(status),
      link: { sentAt: candidate.document_link_sent_at, expiresAt: candidate.document_link_expires_at },
      counts: {
        required: items.filter((i) => i.isRequired).length,
        verified: items.filter((i) => i.isRequired && i.state === 'VERIFIED').length,
        toReview: items.reduce((acc, i) => acc + i.files.filter((f) => f.isActive && f.reviewStatus === 'PENDING_REVIEW').length, 0),
      },
      types: activeDocTypes.map((t) => ({
        type: t.code,
        label: t.name,
        documentTypeId: t.id,
        minFiles: t.minFiles,
        maxFiles: t.maxFiles,
        slots: t.slots,
        isRequired: t.isRequired,
        requiresFrontBack: t.requiresFrontBack,
        allowMultiplePages: t.allowMultiplePages,
      })),
      requests: items,
    };
  }

  /** Asks the candidate for documents. Inherits dynamic limits and slots from document types. */
  async request(tenantId: string, candidateId: string, items: DocumentRequestItemDto[], actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);

    // Fetch existing document types to resolve metadata
    let docTypes = await this.prisma.rndtechnosoft_document_types.findMany({
      where: { tenant_id: tenantId },
    });
    if (docTypes.length === 0) {
      await this.seedDefaultDocumentTypes(tenantId);
      docTypes = await this.prisma.rndtechnosoft_document_types.findMany({
        where: { tenant_id: tenantId },
      });
    }

    const wanted = items.map((item) => {
      const matched = docTypes.find((d) => d.id === item.documentTypeId || d.code.toUpperCase() === item.type.toUpperCase());
      if (!matched && !DOCUMENT_TYPES.includes(item.type as any)) {
        throw new BadRequestException(`Unknown document type: ${item.type}`);
      }
      const label = (item.label?.trim() || matched?.name || DOCUMENT_TYPE_LABELS[item.type] || item.type).slice(0, 120);
      const minFiles = item.minFiles ?? matched?.min_files ?? 1;
      const maxFiles = item.maxFiles ?? matched?.max_files ?? minFiles;
      const slots = item.slots ?? (matched?.slots as string[] | null) ?? null;

      return {
        type: item.type as DocumentType,
        documentTypeId: matched?.id ?? null,
        label,
        isRequired: item.isRequired,
        minFiles: Math.max(1, minFiles),
        maxFiles: Math.max(minFiles, maxFiles),
        slots: slots ? (slots as any) : Prisma.JsonNull,
        requiresFrontBack: matched?.requires_front_back ?? Boolean(slots && slots.length === 2),
        allowMultiplePages: matched?.allow_multiple_pages ?? maxFiles > 1,
        requiresVerification: matched?.requires_verification ?? true,
        canReuploadRejected: matched?.can_reupload_rejected ?? true,
        allowedFormats: matched?.allowed_formats ? (matched.allowed_formats as any) : ['application/pdf', 'image/jpeg', 'image/png'],
        maxFileSizeBytes: matched?.max_file_size_bytes ?? MAX_FILE_BYTES,
      };
    });

    const labels = wanted.map((w) => w.label.toLowerCase());
    if (new Set(labels).size !== labels.length) {
      throw new BadRequestException('Each document can be asked for only once. Give repeated documents different names.');
    }

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const existing = await tx.rndtechnosoft_candidate_document_requests.findMany({
        where: { tenant_id: tenantId, candidate_id: id },
        select: { document_label: true },
      });
      const taken = wanted.filter((w) => existing.some((e) => e.document_label.toLowerCase() === w.label.toLowerCase()));
      if (taken.length > 0) throw new ConflictException(`Already asked for: ${taken.map((t) => t.label).join(', ')}.`);
      if (existing.length + wanted.length > MAX_REQUESTS_PER_CANDIDATE) {
        throw new ConflictException(`A candidate can be asked for at most ${MAX_REQUESTS_PER_CANDIDATE} documents.`);
      }

      const now = Date.now();
      await tx.rndtechnosoft_candidate_document_requests.createMany({
        data: wanted.map((w, index) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          candidate_id: id,
          document_type: String(w.type).slice(0, 50),
          document_label: w.label,
          is_required: w.isRequired,
          document_type_id: w.documentTypeId,
          min_files: w.minFiles,
          max_files: w.maxFiles,
          slots: w.slots,
          requires_front_back: w.requiresFrontBack,
          allow_multiple_pages: w.allowMultiplePages,
          requires_verification: w.requiresVerification,
          can_reupload_rejected: w.canReuploadRejected,
          allowed_formats: w.allowedFormats,
          max_file_size_bytes: w.maxFileSizeBytes,
          created_by_tenant_member_id: actor.tenantMemberId,
          created_at: new Date(now + index),
          updated_at: new Date(now + index),
        })),
      });

      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENTS_REQUESTED',
        summary: `Documents requested: ${wanted.map((w) => w.label).join(', ')}`,
        actorMemberId: actor.tenantMemberId,
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('One of these documents has just been asked for. Reload and try again.');
      }
      throw error;
    });

    return this.list(tenantId, id);
  }

  async removeRequest(tenantId: string, candidateId: string, requestId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const request = await this.requestOf(tx, tenantId, id, requestId);
      const uploads = await tx.rndtechnosoft_candidate_document_files.count({
        where: { tenant_id: tenantId, request_id: request.id },
      });
      if (uploads > 0) {
        throw new ConflictException('This document already has an upload, so it stays on record. Reject the upload instead if it is not needed.');
      }
      await tx.rndtechnosoft_candidate_document_requests.delete({
        where: { tenant_id_id: { tenant_id: tenantId, id: request.id } },
      });
      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_REQUEST_REMOVED',
        summary: `No longer asked for: ${request.document_label}`,
        actorMemberId: actor.tenantMemberId,
      });
      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });
    return this.list(tenantId, id);
  }

  /** Staff upload of one or multiple files, with optional slotName and replacedFileId. */
  async uploadByStaff(
    tenantId: string,
    candidateId: string,
    requestId: string,
    fileOrFiles: UploadedDocument | UploadedDocument[] | undefined,
    actor: AuthenticatedTenantUser,
    meta?: UploadFileMetaDto,
  ) {
    const id = this.candidates.idOr404(candidateId);
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : [];
    if (files.length === 0) throw new BadRequestException('Choose a file to upload.');

    await this.storeBatch(tenantId, id, requestId, files, { via: 'STAFF', actor }, meta, (candidate) => {
      if (candidate.archived_at) throw new ConflictException('Restore the candidate before uploading documents.');
      if (DOCUMENTS_CLOSED.includes(candidate.candidate_status as CandidateStatus)) {
        throw new ConflictException(`The candidate is ${CANDIDATE_STATUS_LABELS[candidate.candidate_status as CandidateStatus].toLowerCase()}, so no more documents are collected.`);
      }
    });

    return this.list(tenantId, id);
  }

  async fileContent(tenantId: string, candidateId: string, fileId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    if (!UUID.test(fileId)) throw new NotFoundException('File not found.');
    const file = await this.prisma.rndtechnosoft_candidate_document_files.findFirst({
      where: { tenant_id: tenantId, candidate_id: id, id: fileId },
    });
    if (!file) throw new NotFoundException('File not found.');
    const bytes = await this.storage.read(tenantId, file.storage_key);
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_VIEWED',
      entityType: 'CANDIDATE_DOCUMENT',
      entityId: file.id,
      metadata: { candidateId: id, requestId: file.request_id, version: file.version_number, slotName: file.slot_name },
    });
    return { bytes, contentType: file.content_type, filename: file.original_filename };
  }

  /** Individual file verification. */
  async verify(tenantId: string, candidateId: string, fileId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const file = await this.fileOf(tx, tenantId, id, fileId);
      if (file.review_status !== 'PENDING_REVIEW') throw new ConflictException(this.notReviewable(file.review_status));

      await tx.rndtechnosoft_candidate_document_files.update({
        where: { id: file.id },
        data: {
          review_status: 'VERIFIED',
          reviewed_by_tenant_member_id: actor.tenantMemberId,
          reviewed_at: new Date(),
          rejection_reason: null,
          updated_at: new Date(),
        },
      });

      const slotSuffix = file.slot_name ? ` (${file.slot_name})` : '';
      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_VERIFIED',
        summary: `${file.rndtechnosoft_candidate_document_requests.document_label}${slotSuffix} verified (version ${file.version_number})`,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: file.request_id, fileId: file.id, slotName: file.slot_name },
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_VERIFIED',
      entityType: 'CANDIDATE_DOCUMENT',
      entityId: fileId,
      metadata: { candidateId: id },
    });

    return { documents: await this.list(tenantId, id), notifications: [] as OnboardingSendOutcome[] };
  }

  /** Individual file rejection with reason. */
  async reject(tenantId: string, candidateId: string, fileId: string, reason: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const why = reason.trim();
    if (why.length < 3) throw new BadRequestException('Say why the document is not accepted, so the candidate can fix it.');
    let label = '';
    let wasVerified = false;

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const file = await this.fileOf(tx, tenantId, id, fileId);
      if (file.review_status !== 'PENDING_REVIEW' && file.review_status !== 'VERIFIED') {
        throw new ConflictException(this.notReviewable(file.review_status));
      }
      wasVerified = file.review_status === 'VERIFIED';
      label = file.rndtechnosoft_candidate_document_requests.document_label;
      const slotSuffix = file.slot_name ? ` (${file.slot_name})` : '';

      await tx.rndtechnosoft_candidate_document_files.update({
        where: { id: file.id },
        data: {
          review_status: 'REJECTED',
          reviewed_by_tenant_member_id: actor.tenantMemberId,
          reviewed_at: new Date(),
          rejection_reason: why,
          updated_at: new Date(),
        },
      });

      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_REJECTED',
        summary: `${label}${slotSuffix} rejected (version ${file.version_number})${wasVerified ? ', after being verified' : ''}`,
        notes: why,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: file.request_id, fileId: file.id, slotName: file.slot_name },
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_REJECTED',
      entityType: 'CANDIDATE_DOCUMENT',
      entityId: fileId,
      oldValues: { reviewStatus: wasVerified ? 'VERIFIED' : 'PENDING_REVIEW' },
      metadata: { candidateId: id, reason: why },
    });

    const notifications = await this.notifyRejected(tenantId, id, fileId, label, why, actor);
    return { documents: await this.list(tenantId, id), notifications };
  }

  /** Document-level verification: approves all pending files for the request once required files/slots are fulfilled. */
  async verifyRequest(tenantId: string, candidateId: string, requestId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const request = await this.requestOf(tx, tenantId, id, requestId);
      const files = await tx.rndtechnosoft_candidate_document_files.findMany({
        where: { tenant_id: tenantId, request_id: request.id },
      });

      const state = requestState(files, {
        minFiles: request.min_files,
        maxFiles: request.max_files,
        slots: request.slots as string[] | null,
        requiresFrontBack: request.requires_front_back,
      });

      if (state === 'MISSING' || state === 'INCOMPLETE') {
        throw new BadRequestException('Cannot verify document before all required files or sides are uploaded.');
      }
      if (state === 'REJECTED') {
        throw new BadRequestException('Cannot verify document while any required file is rejected. A replacement must be uploaded first.');
      }

      // Mark all pending active files as verified
      const replacedIds = new Set(files.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
      const pendingFiles = files.filter((f) => !replacedIds.has(f.id) && f.review_status === 'PENDING_REVIEW');

      if (pendingFiles.length === 0 && state === 'VERIFIED') {
        return; // Already verified
      }

      await tx.rndtechnosoft_candidate_document_files.updateMany({
        where: { id: { in: pendingFiles.map((f) => f.id) } },
        data: {
          review_status: 'VERIFIED',
          reviewed_by_tenant_member_id: actor.tenantMemberId,
          reviewed_at: new Date(),
          rejection_reason: null,
          updated_at: new Date(),
        },
      });

      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_VERIFIED',
        summary: `${request.document_label} completely verified (${pendingFiles.length} file(s) approved)`,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: request.id },
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_REQUEST_VERIFIED',
      entityType: 'CANDIDATE_DOCUMENT_REQUEST',
      entityId: requestId,
      metadata: { candidateId: id },
    });

    return { documents: await this.list(tenantId, id), notifications: [] as OnboardingSendOutcome[] };
  }

  /** Document-level rejection: rejects all pending files of the request with a rejection reason. */
  async rejectRequest(tenantId: string, candidateId: string, requestId: string, reason: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const why = reason.trim();
    if (why.length < 3) throw new BadRequestException('Say why the document is not accepted, so the candidate can fix it.');

    let requestLabel = '';
    const rejectedFileIds: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const request = await this.requestOf(tx, tenantId, id, requestId);
      requestLabel = request.document_label;

      const files = await tx.rndtechnosoft_candidate_document_files.findMany({
        where: { tenant_id: tenantId, request_id: request.id },
      });

      const replacedIds = new Set(files.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
      const pendingFiles = files.filter((f) => !replacedIds.has(f.id) && f.review_status === 'PENDING_REVIEW');

      if (pendingFiles.length === 0) {
        throw new BadRequestException('No pending files to reject for this document.');
      }

      for (const pf of pendingFiles) {
        rejectedFileIds.push(pf.id);
        await tx.rndtechnosoft_candidate_document_files.update({
          where: { id: pf.id },
          data: {
            review_status: 'REJECTED',
            reviewed_by_tenant_member_id: actor.tenantMemberId,
            reviewed_at: new Date(),
            rejection_reason: why,
            updated_at: new Date(),
          },
        });
      }

      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_REJECTED',
        summary: `${request.document_label} rejected (${pendingFiles.length} file(s) rejected)`,
        notes: why,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: request.id },
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_REQUEST_REJECTED',
      entityType: 'CANDIDATE_DOCUMENT_REQUEST',
      entityId: requestId,
      metadata: { candidateId: id, reason: why },
    });

    const notifications = await this.notifyRejected(tenantId, id, rejectedFileIds[0] || requestId, requestLabel, why, actor);
    return { documents: await this.list(tenantId, id), notifications };
  }

  /** Removes a specific uploaded file (if unverified) */
  async removeFile(tenantId: string, candidateId: string, requestId: string, fileId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const file = await this.fileOf(tx, tenantId, id, fileId);
      if (file.request_id !== requestId) throw new BadRequestException('File does not belong to this document.');
      if (file.review_status === 'VERIFIED') throw new ConflictException('Verified files cannot be deleted.');

      await tx.rndtechnosoft_candidate_document_files.delete({
        where: { id: file.id },
      });

      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_FILE_REMOVED',
        summary: `${file.original_filename} removed from ${file.rndtechnosoft_candidate_document_requests.document_label}`,
        actorMemberId: actor.tenantMemberId,
      });

      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });

    return this.list(tenantId, id);
  }

  /** Emails candidate an upload link. */
  async sendLink(tenantId: string, candidateId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({ where: { tenant_id: tenantId, id } });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    if (candidate.archived_at) throw new ConflictException('Restore the candidate before sending them a link.');
    if (!COLLECTING_STATUSES.includes(candidate.candidate_status as CandidateStatus)) {
      throw new ConflictException('The upload link is sent once the candidate has accepted their offer.');
    }
    const requests = await this.prisma.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: tenantId, candidate_id: id },
      include: { rndtechnosoft_candidate_document_files: { select: { id: true, version_number: true, review_status: true, slot_name: true, replaced_file_id: true } } },
    });
    if (requests.length === 0) throw new ConflictException('Ask for at least one document before sending the link.');
    if (requests.every((r) => requestState(r.rndtechnosoft_candidate_document_files, { minFiles: r.min_files, maxFiles: r.max_files, slots: r.slots as string[] }) === 'VERIFIED')) {
      throw new ConflictException('Every document is already verified; there is nothing left to upload.');
    }
    const base = await this.offers.responseBaseUrl(tenantId);
    if (!base) throw new ConflictException('The link can’t be sent yet: this workspace has no web address. Ask your platform administrator to set one up.');
    const company = await this.offers.companyName(tenantId);

    let number = candidate.document_link_number;
    const previous = number > 0 ? await this.prisma.rndtechnosoft_onboarding_notifications.findFirst({ where: { tenant_id: tenantId, idempotency_key: this.linkKey(id, number) }, select: { delivery_status: true } }) : null;
    if (number === 0 || previous?.delivery_status === 'SENT') {
      await this.prisma.rndtechnosoft_candidates.updateMany({ where: { tenant_id: tenantId, id, document_link_number: number }, data: { document_link_number: number + 1 } });
      number += 1;
    }

    const outcome = await this.mailer.send({
      tenantId,
      idempotencyKey: this.linkKey(id, number),
      templateCode: 'DOCUMENT_UPLOAD_LINK',
      initiatedBy: actor,
      to: candidate.email,
      subject: '',
      text: '',
      html: '',
      candidateId: id,
      build: async () => {
        const token = randomBytes(32).toString('base64url');
        const expires = new Date(Date.now() + LINK_DAYS * 24 * 3600 * 1000);
        const updated = await this.prisma.rndtechnosoft_candidates.updateMany({
          where: { tenant_id: tenantId, id, document_link_number: number },
          data: { document_token_hash: hashToken(token), document_link_expires_at: expires, updated_at: new Date() },
        });
        if (updated.count === 0) throw new Error('A newer link was sent at the same moment.');
        const url = `${base}/documents?token=${encodeURIComponent(token)}`;
        const intro = `Dear ${candidate.full_name}, to complete your joining formalities with ${company}, please upload the documents we need using your personal link.`;
        const note = `The link works until ${formatLetterDate(new Date(expires.toISOString().slice(0, 10)))}. It is for you only; please don't forward it. PDF, JPG and PNG files up to 10 MB are accepted.`;
        return {
          subject: `Documents needed for joining ${company}`,
          text: [intro, '', url, '', note, '', company].join('\n'),
          html: `<p>${escapeHtml(intro)}</p><p><a href="${escapeHtml(url)}">Upload your documents</a></p><p>${escapeHtml(note)}</p><p>${escapeHtml(company)}</p>`,
        };
      },
    });

    if (outcome.status === 'SENT' && !outcome.duplicate) {
      await this.prisma.$transaction(async (tx) => {
        await this.candidates.lockCandidate(tx, tenantId, id);
        await tx.rndtechnosoft_candidates.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { document_link_sent_at: new Date(), updated_at: new Date() } });
        await this.candidates.recordEvent(tx, tenantId, id, { type: 'DOCUMENT_LINK_SENT', summary: `Document upload link sent to ${candidate.email}`, actorMemberId: actor.tenantMemberId });
      });
      await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_DOCUMENT_LINK_SENT', entityType: 'CANDIDATE', entityId: id });
    }
    return { documents: await this.list(tenantId, id), notifications: [outcome] };
  }

  // ── Candidate Secure Portal ──────────────────────────────────

  /** What candidate sees: dynamic slots, min/max file limits, uploaded file states and progress. */
  async publicView(token: string, meta: ResponseMeta) {
    const candidate = await this.byToken(token, meta);
    const requests = await this.prisma.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: candidate.tenant_id, candidate_id: candidate.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: {
        rndtechnosoft_candidate_document_files: {
          orderBy: { version_number: 'desc' },
          select: {
            id: true,
            version_number: true,
            review_status: true,
            original_filename: true,
            file_size_bytes: true,
            created_at: true,
            rejection_reason: true,
            slot_name: true,
            replaced_file_id: true,
          },
        },
      },
    });

    return {
      companyName: await this.offers.companyName(candidate.tenant_id),
      candidateName: candidate.full_name,
      linkExpiresAt: candidate.document_link_expires_at,
      maxFileBytes: MAX_FILE_BYTES,
      requests: requests.map((r) => {
        const allFiles = r.rndtechnosoft_candidate_document_files;
        const rawSlots = r.slots as string[] | null;
        const configuredSlots = Array.isArray(rawSlots) && rawSlots.length > 0
          ? rawSlots.map((s) => String(s).trim()).filter(Boolean)
          : null;

        const state = requestState(allFiles, {
          minFiles: r.min_files,
          maxFiles: r.max_files,
          slots: configuredSlots,
          requiresFrontBack: r.requires_front_back,
        });

        const replacedIds = new Set(allFiles.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
        const activeFiles = allFiles.filter((f) => !replacedIds.has(f.id) && f.review_status !== 'SUPERSEDED');
        const latest = activeFiles[0] ?? allFiles[0] ?? null;

        const slotsStatus = configuredSlots
          ? configuredSlots.map((slot) => {
              const sf = activeFiles
                .filter((f) => (f.slot_name || '').toLowerCase() === slot.toLowerCase())
                .sort((a, b) => b.version_number - a.version_number)[0] ?? null;
              return {
                slotName: slot,
                isUploaded: Boolean(sf),
                file: sf
                  ? {
                      id: sf.id,
                      version: sf.version_number,
                      filename: sf.original_filename,
                      sizeBytes: sf.file_size_bytes,
                      reviewStatus: sf.review_status,
                      uploadedAt: sf.created_at,
                      rejectionReason: sf.rejection_reason,
                    }
                  : null,
              };
            })
          : null;

        const rejectedFile = activeFiles.find((f) => f.review_status === 'REJECTED') ?? null;
        const missingSlots = slotsStatus ? slotsStatus.filter((s) => !s.isUploaded).map((s) => s.slotName) : [];

        const canUpload = state !== 'VERIFIED' && allFiles.length < MAX_VERSIONS_PER_REQUEST;

        return {
          id: r.id,
          label: r.document_label,
          isRequired: r.is_required,
          documentType: r.document_type,
          minFiles: r.min_files,
          maxFiles: r.max_files,
          slots: configuredSlots,
          slotsStatus,
          missingSlots,
          activeFilesCount: activeFiles.length,
          allowedFormats: (r.allowed_formats as string[] | null) || ['application/pdf', 'image/jpeg', 'image/png'],
          maxFileSizeBytes: r.max_file_size_bytes,
          state,
          status: state,
          canUpload,
          lastFilename: latest?.original_filename ?? null,
          lastUploadedAt: latest?.created_at ?? null,
          rejectionReason: rejectedFile?.rejection_reason ?? (state === 'REJECTED' ? latest?.rejection_reason ?? null : null),
          activeFiles: activeFiles.map((f) => ({
            id: f.id,
            version: f.version_number,
            filename: f.original_filename,
            sizeBytes: f.file_size_bytes,
            reviewStatus: f.review_status,
            uploadedAt: f.created_at,
            rejectionReason: f.rejection_reason,
            slotName: f.slot_name,
          })),
        };
      }),
    };
  }

  async isKnownLink(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
    return (await this.prisma.rndtechnosoft_candidates.count({ where: { document_token_hash: hashToken(token) } })) > 0;
  }

  /** Public candidate upload of 1 or multiple files with optional slotName or replacedFileId. */
  async publicUpload(
    token: string,
    requestId: string,
    fileOrFiles: UploadedDocument | UploadedDocument[] | undefined,
    meta: ResponseMeta,
    uploadMeta?: UploadFileMetaDto,
  ) {
    const candidate = await this.byToken(token, meta);
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : fileOrFiles ? [fileOrFiles] : [];
    if (files.length === 0) throw new BadRequestException('Choose a file to upload.');

    await this.storeBatch(
      candidate.tenant_id,
      candidate.id,
      requestId,
      files,
      { via: 'CANDIDATE', ip: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
      uploadMeta,
      (locked) => {
        if (locked.archived_at || !COLLECTING_STATUSES.includes(locked.candidate_status as CandidateStatus) || locked.document_token_hash !== hashToken(token)) {
          throw new NotFoundException('This upload link is not valid.');
        }
      },
    );

    return this.publicView(token, meta);
  }

  // ── Core Storage Engine ──────────────────────────────────────

  /** Checks and stores one or multiple uploads for a requested document with slot tracking and dynamic limits. */
  private async storeBatch(
    tenantId: string,
    candidateId: string,
    requestId: string,
    files: UploadedDocument[],
    uploader: Uploader,
    meta?: UploadFileMetaDto,
    allowed?: (candidate: Awaited<ReturnType<CandidatesService['lockCandidate']>>) => void,
  ) {
    if (files.length === 0) throw new BadRequestException('Choose a file to upload.');

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.candidates.lockCandidate(tx, tenantId, candidateId);
      if (allowed) allowed(candidate);

      const request = await this.requestOf(tx, tenantId, candidateId, requestId);
      const label = request.document_label;

      const earlier = await tx.rndtechnosoft_candidate_document_files.findMany({
        where: { tenant_id: tenantId, request_id: request.id },
        select: {
          id: true,
          version_number: true,
          review_status: true,
          slot_name: true,
          replaced_file_id: true,
        },
      });

      if (earlier.length + files.length > MAX_VERSIONS_PER_REQUEST) {
        throw new ConflictException(`${label} has reached the limit of ${MAX_VERSIONS_PER_REQUEST} uploads.`);
      }

      const replacedIds = new Set(earlier.filter((f) => f.replaced_file_id).map((f) => f.replaced_file_id!));
      const activeFiles = earlier.filter((f) => !replacedIds.has(f.id) && f.review_status !== 'SUPERSEDED');

      const rawSlots = request.slots as string[] | null;
      const configuredSlots = Array.isArray(rawSlots) && rawSlots.length > 0
        ? rawSlots.map((s) => String(s).trim()).filter(Boolean)
        : null;

      // Validate format and size for each file
      const preparedFiles: {
        file: UploadedDocument;
        kind: { contentType: string; extension: string };
        slotName: string | null;
        replacedFileId: string | null;
      }[] = [];

      const allowedFormats = (request.allowed_formats as string[] | null) || ['application/pdf', 'image/jpeg', 'image/png'];
      const maxSizeBytes = request.max_file_size_bytes || MAX_FILE_BYTES;

      // Handle replacement target
      let targetReplacedId: string | null = meta?.replacedFileId ?? null;
      let targetSlotName: string | null = meta?.slotName?.trim() || null;

      if (targetReplacedId) {
        const targetFile = earlier.find((f) => f.id === targetReplacedId);
        if (!targetFile) throw new NotFoundException('File to replace not found.');
        if (targetFile.review_status === 'VERIFIED') throw new ConflictException('Verified files cannot be replaced.');
        if (!targetSlotName && targetFile.slot_name) {
          targetSlotName = targetFile.slot_name;
        }
      }

      // Check slot requirements
      if (configuredSlots && configuredSlots.length > 0) {
        if (files.length === 1 && targetSlotName) {
          // Uploading for a specific named slot
          const slotExists = configuredSlots.some((s) => s.toLowerCase() === targetSlotName!.toLowerCase());
          if (!slotExists) {
            throw new BadRequestException(`Invalid slot "${targetSlotName}". Available slots: ${configuredSlots.join(', ')}.`);
          }
        }
      }

      // Determine slots / targets for incoming files
      let nextVersion = Math.max(0, ...earlier.map((f) => f.version_number));

      // Available slots that need a file
      const missingOrRejectedSlots: string[] = [];
      if (configuredSlots) {
        for (const slot of configuredSlots) {
          const sf = activeFiles
            .filter((f) => (f.slot_name || '').toLowerCase() === slot.toLowerCase())
            .sort((a, b) => b.version_number - a.version_number)[0];
          if (!sf || sf.review_status === 'REJECTED') {
            missingOrRejectedSlots.push(slot);
          }
        }
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || !file.buffer || file.size === 0) throw new BadRequestException('Choose a non-empty file to upload.');
        if (file.size > maxSizeBytes) {
          const maxMb = Math.round(maxSizeBytes / (1024 * 1024));
          throw new BadRequestException(`The file is larger than ${maxMb} MB. Upload a smaller copy.`);
        }

        const kind = sniffFileKind(file.buffer);
        if (!kind) throw new BadRequestException('Upload a PDF, JPG or PNG file.');

        const acceptsImages = allowedFormats.some((f) => f.startsWith('image/'));
        const acceptsPdf = allowedFormats.includes('application/pdf');
        if (!acceptsImages && (kind.contentType === 'image/jpeg' || kind.contentType === 'image/png')) {
          throw new BadRequestException(`${label} accepts PDF files only.`);
        }
        if (!acceptsPdf && kind.contentType === 'application/pdf') {
          throw new BadRequestException(`${label} accepts image files only.`);
        }
        if (allowedFormats.length > 0 && !allowedFormats.includes(kind.contentType)) {
          throw new BadRequestException(`File format ${kind.contentType} is not accepted for ${label}.`);
        }

        let assignedSlot: string | null = null;
        let assignedReplacedId: string | null = null;

        if (files.length === 1 && targetSlotName) {
          assignedSlot = targetSlotName;
          assignedReplacedId = targetReplacedId;
        } else if (configuredSlots && configuredSlots.length > 0) {
          // If candidate/staff uploaded multiple or didn't pass slot, assign to available slots
          assignedSlot = missingOrRejectedSlots[i] ?? configuredSlots[i % configuredSlots.length];
        }

        // If assigning to a slot, verify slot is not already verified
        if (assignedSlot) {
          const slotActive = activeFiles
            .filter((f) => (f.slot_name || '').toLowerCase() === assignedSlot!.toLowerCase())
            .sort((a, b) => b.version_number - a.version_number)[0];
          if (slotActive && slotActive.review_status === 'VERIFIED') {
            throw new ConflictException(`${label} (${assignedSlot}) is already verified.`);
          }
          if (slotActive && !assignedReplacedId) {
            assignedReplacedId = slotActive.id;
          }
        } else if (request.max_files === 1 && activeFiles.length > 0) {
          const existingActive = activeFiles[0];
          if (existingActive.review_status === 'VERIFIED') {
            throw new ConflictException(`${label} is already verified.`);
          }
          assignedReplacedId = existingActive.id;
        } else if (!assignedReplacedId && activeFiles.length + i >= request.max_files) {
          if (activeFiles.every((f) => f.review_status === 'VERIFIED')) {
            throw new ConflictException(`${label} is already verified.`);
          }
          throw new ConflictException(`${label} already has the maximum allowed files (${request.max_files}).`);
        }

        preparedFiles.push({
          file,
          kind,
          slotName: assignedSlot,
          replacedFileId: assignedReplacedId,
        });
      }

      // Store files and insert records
      for (const item of preparedFiles) {
        nextVersion += 1;
        const stored = await this.storage.save(tenantId, 'candidate-documents', item.file.buffer, item.kind.extension);
        const fileId = randomUUID();

        // If replacing an existing unverified file in pending review, mark it superseded
        if (item.replacedFileId) {
          await tx.rndtechnosoft_candidate_document_files.updateMany({
            where: {
              tenant_id: tenantId,
              id: item.replacedFileId,
              review_status: 'PENDING_REVIEW',
            },
            data: { review_status: 'SUPERSEDED', updated_at: new Date() },
          });
        }

        // If slot name exists, ensure any existing pending review in that slot is superseded
        if (item.slotName) {
          await tx.rndtechnosoft_candidate_document_files.updateMany({
            where: {
              tenant_id: tenantId,
              request_id: request.id,
              slot_name: item.slotName,
              review_status: 'PENDING_REVIEW',
            },
            data: { review_status: 'SUPERSEDED', updated_at: new Date() },
          });
        }

        await tx.rndtechnosoft_candidate_document_files.create({
          data: {
            id: fileId,
            tenant_id: tenantId,
            candidate_id: candidateId,
            request_id: request.id,
            version_number: nextVersion,
            original_filename: safeFilename(item.file.originalname, item.kind.extension, request.document_label),
            content_type: item.kind.contentType,
            file_size_bytes: stored.size,
            storage_key: stored.key,
            file_sha256: stored.sha256,
            uploaded_via: uploader.via,
            uploaded_by_tenant_member_id: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null,
            uploader_ip: uploader.via === 'CANDIDATE' ? uploader.ip : null,
            slot_name: item.slotName,
            replaced_file_id: item.replacedFileId,
            review_status: 'PENDING_REVIEW',
          },
        });

        const slotSuffix = item.slotName ? ` (${item.slotName})` : '';
        await this.candidates.recordEvent(tx, tenantId, candidateId, {
          type: 'DOCUMENT_UPLOADED',
          summary: `${label}${slotSuffix} uploaded${uploader.via === 'CANDIDATE' ? ' by the candidate' : ''} (version ${nextVersion})`,
          actorMemberId: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null,
          metadata: { requestId: request.id, fileId, slotName: item.slotName },
        });

        await this.audit.log({
          tenantId,
          actorUserId: uploader.via === 'STAFF' ? uploader.actor.userId : undefined,
          actorTenantMemberId: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : undefined,
          actionCode: 'ONBOARDING_DOCUMENT_UPLOADED',
          entityType: 'CANDIDATE_DOCUMENT',
          entityId: fileId,
          metadata: { candidateId, requestId, document: label, slotName: item.slotName, via: uploader.via === 'CANDIDATE' ? 'candidate link' : 'HR' },
          ipAddress: uploader.via === 'CANDIDATE' ? uploader.ip ?? undefined : undefined,
          userAgent: uploader.via === 'CANDIDATE' ? uploader.userAgent ?? undefined : undefined,
        });
      }

      await this.syncStage(tx, tenantId, candidateId, candidate.candidate_status as CandidateStatus, uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null);
    });
  }

  /** While documents are being collected, moves the candidate to where their required documents stand. */
  private async syncStage(tx: Tx, tenantId: string, candidateId: string, from: CandidateStatus, actorMemberId: string | null) {
    if (!COLLECTING_STATUSES.includes(from)) return;
    const requests = await tx.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: tenantId, candidate_id: candidateId },
      select: {
        is_required: true,
        min_files: true,
        max_files: true,
        slots: true,
        requires_front_back: true,
        rndtechnosoft_candidate_document_files: {
          select: { id: true, version_number: true, review_status: true, slot_name: true, replaced_file_id: true },
        },
      },
    });

    const to = documentStage(
      requests.map((r) => ({
        isRequired: r.is_required,
        state: requestState(r.rndtechnosoft_candidate_document_files, {
          minFiles: r.min_files,
          maxFiles: r.max_files,
          slots: r.slots as string[] | null,
          requiresFrontBack: r.requires_front_back,
        }),
      })),
    ) ?? 'OFFER_ACCEPTED';

    if (to === from) return;
    await this.candidates.setStatus(tx, tenantId, candidateId, from, to, {
      type: 'DOCUMENT_STAGE',
      summary: to === 'READY_TO_JOIN' ? 'All required documents verified' : `Moved to ${CANDIDATE_STATUS_LABELS[to]} by the state of the documents`,
      actorMemberId,
    });
  }

  private async lockOpenCandidate(tx: Tx, tenantId: string, candidateId: string) {
    const candidate = await this.candidates.lockCandidate(tx, tenantId, candidateId);
    if (candidate.archived_at) throw new ConflictException('Restore the candidate before changing their documents.');
    const status = candidate.candidate_status as CandidateStatus;
    if (DOCUMENTS_CLOSED.includes(status)) throw new ConflictException(`The candidate is ${CANDIDATE_STATUS_LABELS[status].toLowerCase()}, so their documents can no longer change.`);
    return candidate;
  }

  private async requestOf(tx: Tx, tenantId: string, candidateId: string, requestId: string) {
    if (!UUID.test(requestId)) throw new NotFoundException('Document not found.');
    const request = await tx.rndtechnosoft_candidate_document_requests.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: requestId },
    });
    if (!request) throw new NotFoundException('Document not found.');
    return request;
  }

  private async fileOf(tx: Tx, tenantId: string, candidateId: string, fileId: string) {
    if (!UUID.test(fileId)) throw new NotFoundException('File not found.');
    const file = await tx.rndtechnosoft_candidate_document_files.findFirst({
      where: { tenant_id: tenantId, candidate_id: candidateId, id: fileId },
      include: { rndtechnosoft_candidate_document_requests: { select: { document_label: true } } },
    });
    if (!file) throw new NotFoundException('File not found.');
    return file;
  }

  private notReviewable(status: string) {
    if (status === 'SUPERSEDED') return 'A newer upload replaced this one. Review the newest upload instead.';
    if (status === 'REJECTED') return 'This upload has already been rejected.';
    return 'This upload has already been verified.';
  }

  private linkKey(candidateId: string, number: number) {
    return `documents:${candidateId}:link:${number}`;
  }

  private async byToken(token: string, meta: ResponseMeta) {
    const invalid = new NotFoundException('This upload link is not valid.');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw invalid;
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({ where: { document_token_hash: hashToken(token) } });
    if (!candidate) throw invalid;
    const host = await this.domains.resolveHost(meta.host);
    if (host.kind === 'foreign' || host.kind === 'unknown' || (host.kind === 'tenant' && host.tenantId !== candidate.tenant_id)) throw invalid;
    const modules = await this.access.getModuleStates(candidate.tenant_id);
    if (!modules.HRMS) throw invalid;
    if (candidate.archived_at || !COLLECTING_STATUSES.includes(candidate.candidate_status as CandidateStatus)) throw invalid;
    if (!candidate.document_link_expires_at || candidate.document_link_expires_at < new Date()) {
      throw new NotFoundException('This upload link has expired. Ask the company to send you a new one.');
    }
    return candidate;
  }

  private async notifyRejected(tenantId: string, candidateId: string, fileId: string, label: string, reason: string, initiatedBy: AuthenticatedTenantUser): Promise<OnboardingSendOutcome[]> {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: candidateId } });
    if (!candidate.document_link_sent_at || !COLLECTING_STATUSES.includes(candidate.candidate_status as CandidateStatus)) return [];
    const company = await this.offers.companyName(tenantId);
    const text = `Dear ${candidate.full_name}, the ${label} you uploaded could not be accepted: ${reason}. Please upload a new copy using the personal link from our earlier email.`;
    return [
      await this.mailer.send({
        tenantId,
        idempotencyKey: `documents:file:${fileId}:rejected:${Date.now()}`,
        templateCode: 'DOCUMENT_REJECTED',
        initiatedBy,
        to: candidate.email,
        subject: `Please upload your ${label} again`,
        text: `${text}\n\n${company}`,
        html: `<p>${escapeHtml(text)}</p><p>${escapeHtml(company)}</p>`,
        candidateId,
      }),
    ];
  }
}
