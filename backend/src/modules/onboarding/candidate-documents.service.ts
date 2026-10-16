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
  DOCUMENT_TYPE_LABELS,
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
import { DocumentRequestItemDto } from './dto/onboarding.dto';

type Tx = Prisma.TransactionClient;

/** The uploaded file as the upload handler hands it over. */
export interface UploadedDocument {
  buffer: Buffer;
  originalname: string;
  size: number;
}

type Uploader = { via: 'STAFF'; actor: AuthenticatedTenantUser } | { via: 'CANDIDATE'; ip: string | null; userAgent: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MEMBER = { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const nameOf = (m?: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) =>
  m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const FILES = { orderBy: { version_number: 'desc' }, include: { uploaded_by: MEMBER, reviewed_by: MEMBER } } as const;

/**
 * Documents asked of a candidate: HR requests them, the candidate (through a
 * link emailed to them) or HR uploads each, and HR verifies or rejects every
 * upload. Files are checked by their content, stored privately, and every
 * upload is kept as a version. While documents are being collected their
 * state moves the candidate between document collection, verification and
 * ready to join.
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

  // ── HR ───────────────────────────────────────────────────────

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
    const items = requests.map((r) => ({
      id: r.id,
      type: r.document_type,
      label: r.document_label,
      isRequired: r.is_required,
      state: requestState(r.rndtechnosoft_candidate_document_files),
      createdAt: r.created_at,
      files: r.rndtechnosoft_candidate_document_files.map((f) => ({
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
      })),
    }));
    return {
      candidateStatus: status,
      canChange: !candidate.archived_at && !DOCUMENTS_CLOSED.includes(status),
      canSendLink: !candidate.archived_at && COLLECTING_STATUSES.includes(status),
      link: { sentAt: candidate.document_link_sent_at, expiresAt: candidate.document_link_expires_at },
      counts: {
        required: items.filter((i) => i.isRequired).length,
        verified: items.filter((i) => i.isRequired && i.state === 'VERIFIED').length,
        toReview: items.filter((i) => i.state === 'PENDING_REVIEW').length,
      },
      types: Object.entries(DOCUMENT_TYPE_LABELS).map(([type, label]) => ({ type, label })),
      requests: items,
    };
  }

  /** Asks the candidate for documents. A document is asked for once. */
  async request(tenantId: string, candidateId: string, items: DocumentRequestItemDto[], actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const wanted = items.map((item) => ({
      type: item.type as DocumentType,
      label: (item.label?.trim() || DOCUMENT_TYPE_LABELS[item.type as DocumentType]).slice(0, 120),
      isRequired: item.isRequired,
    }));
    const labels = wanted.map((w) => w.label.toLowerCase());
    if (new Set(labels).size !== labels.length) throw new BadRequestException('Each document can be asked for only once. Give repeated documents different names.');

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const existing = await tx.rndtechnosoft_candidate_document_requests.findMany({ where: { tenant_id: tenantId, candidate_id: id }, select: { document_label: true } });
      const taken = wanted.filter((w) => existing.some((e) => e.document_label.toLowerCase() === w.label.toLowerCase()));
      if (taken.length > 0) throw new ConflictException(`Already asked for: ${taken.map((t) => t.label).join(', ')}.`);
      if (existing.length + wanted.length > MAX_REQUESTS_PER_CANDIDATE) throw new ConflictException(`A candidate can be asked for at most ${MAX_REQUESTS_PER_CANDIDATE} documents.`);
      // One millisecond apart, so the list keeps the order they were asked in.
      const now = Date.now();
      await tx.rndtechnosoft_candidate_document_requests.createMany({
        data: wanted.map((w, index) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          candidate_id: id,
          document_type: w.type,
          document_label: w.label,
          is_required: w.isRequired,
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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('One of these documents has just been asked for. Reload and try again.');
      throw error;
    });
    return this.list(tenantId, id);
  }

  /** Removes a document that was asked for by mistake. Once anything is uploaded for it, it stays on record. */
  async removeRequest(tenantId: string, candidateId: string, requestId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const request = await this.requestOf(tx, tenantId, id, requestId);
      const uploads = await tx.rndtechnosoft_candidate_document_files.count({ where: { tenant_id: tenantId, request_id: request.id } });
      if (uploads > 0) throw new ConflictException('This document already has an upload, so it stays on record. Reject the upload instead if it is not needed.');
      await tx.rndtechnosoft_candidate_document_requests.delete({ where: { tenant_id_id: { tenant_id: tenantId, id: request.id } } });
      await this.candidates.recordEvent(tx, tenantId, id, { type: 'DOCUMENT_REQUEST_REMOVED', summary: `No longer asked for: ${request.document_label}`, actorMemberId: actor.tenantMemberId });
      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });
    return this.list(tenantId, id);
  }

  async uploadByStaff(tenantId: string, candidateId: string, requestId: string, file: UploadedDocument | undefined, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.store(tenantId, id, requestId, file, { via: 'STAFF', actor }, (candidate) => {
      if (candidate.archived_at) throw new ConflictException('Restore the candidate before uploading documents.');
      if (DOCUMENTS_CLOSED.includes(candidate.candidate_status as CandidateStatus)) {
        throw new ConflictException(`The candidate is ${CANDIDATE_STATUS_LABELS[candidate.candidate_status as CandidateStatus].toLowerCase()}, so no more documents are collected.`);
      }
    });
    return this.list(tenantId, id);
  }

  /** The stored file, only when it belongs to this candidate of this workspace. Each viewing is audited. */
  async fileContent(tenantId: string, candidateId: string, fileId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    if (!UUID.test(fileId)) throw new NotFoundException('File not found.');
    const file = await this.prisma.rndtechnosoft_candidate_document_files.findFirst({ where: { tenant_id: tenantId, candidate_id: id, id: fileId } });
    if (!file) throw new NotFoundException('File not found.');
    const bytes = await this.storage.read(tenantId, file.storage_key);
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'ONBOARDING_DOCUMENT_VIEWED',
      entityType: 'CANDIDATE_DOCUMENT',
      entityId: file.id,
      metadata: { candidateId: id, requestId: file.request_id, version: file.version_number },
    });
    return { bytes, contentType: file.content_type, filename: file.original_filename };
  }

  async verify(tenantId: string, candidateId: string, fileId: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const file = await this.fileOf(tx, tenantId, id, fileId);
      if (file.review_status !== 'PENDING_REVIEW') throw new ConflictException(this.notReviewable(file.review_status));
      await tx.rndtechnosoft_candidate_document_files.update({
        where: { id: file.id },
        data: { review_status: 'VERIFIED', reviewed_by_tenant_member_id: actor.tenantMemberId, reviewed_at: new Date(), rejection_reason: null },
      });
      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_VERIFIED',
        summary: `${file.rndtechnosoft_candidate_document_requests.document_label} verified (version ${file.version_number})`,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: file.request_id, fileId: file.id },
      });
      await this.syncStage(tx, tenantId, id, candidate.candidate_status as CandidateStatus, actor.tenantMemberId);
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_DOCUMENT_VERIFIED', entityType: 'CANDIDATE_DOCUMENT', entityId: fileId, metadata: { candidateId: id } });
    return { documents: await this.list(tenantId, id), notifications: [] as OnboardingSendOutcome[] };
  }

  /**
   * Rejects an upload awaiting review, or one verified by mistake, with the
   * reason, and tells the candidate so they can upload another.
   */
  async reject(tenantId: string, candidateId: string, fileId: string, reason: string, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const why = reason.trim();
    if (why.length < 3) throw new BadRequestException('Say why the document is not accepted, so the candidate can fix it.');
    let label = '';
    let wasVerified = false;
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.lockOpenCandidate(tx, tenantId, id);
      const file = await this.fileOf(tx, tenantId, id, fileId);
      if (file.review_status !== 'PENDING_REVIEW' && file.review_status !== 'VERIFIED') throw new ConflictException(this.notReviewable(file.review_status));
      wasVerified = file.review_status === 'VERIFIED';
      label = file.rndtechnosoft_candidate_document_requests.document_label;
      await tx.rndtechnosoft_candidate_document_files.update({
        where: { id: file.id },
        data: { review_status: 'REJECTED', reviewed_by_tenant_member_id: actor.tenantMemberId, reviewed_at: new Date(), rejection_reason: why },
      });
      await this.candidates.recordEvent(tx, tenantId, id, {
        type: 'DOCUMENT_REJECTED',
        summary: `${label} rejected (version ${file.version_number})${wasVerified ? ', after being verified' : ''}`,
        notes: why,
        actorMemberId: actor.tenantMemberId,
        metadata: { requestId: file.request_id, fileId: file.id },
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

  /**
   * Emails the candidate a link to upload their documents. Sending again makes
   * a new link and the earlier one stops working. A link that could not be
   * sent can be sent again; the same link is never emailed twice.
   */
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
      select: { rndtechnosoft_candidate_document_files: { select: { version_number: true, review_status: true } } },
    });
    if (requests.length === 0) throw new ConflictException('Ask for at least one document before sending the link.');
    if (requests.every((r) => requestState(r.rndtechnosoft_candidate_document_files) === 'VERIFIED')) throw new ConflictException('Every document is already verified; there is nothing left to upload.');
    const base = await this.offers.responseBaseUrl(tenantId);
    if (!base) throw new ConflictException('The link can’t be sent yet: this workspace has no web address. Ask your platform administrator to set one up.');
    const company = await this.offers.companyName(tenantId);

    // The link number moves on only after its link was sent, so a failed send is retried with the same number.
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

  // ── The candidate's link ─────────────────────────────────────

  /** What the candidate sees: the documents asked of them and where each stands. No file contents. */
  async publicView(token: string, meta: ResponseMeta) {
    const candidate = await this.byToken(token, meta);
    const requests = await this.prisma.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: candidate.tenant_id, candidate_id: candidate.id },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      include: { rndtechnosoft_candidate_document_files: { orderBy: { version_number: 'desc' }, select: { version_number: true, review_status: true, original_filename: true, created_at: true, rejection_reason: true } } },
    });
    return {
      companyName: await this.offers.companyName(candidate.tenant_id),
      candidateName: candidate.full_name,
      linkExpiresAt: candidate.document_link_expires_at,
      maxFileBytes: MAX_FILE_BYTES,
      requests: requests.map((r) => {
        const files = r.rndtechnosoft_candidate_document_files;
        const state = requestState(files);
        const latest = files[0] ?? null;
        return {
          id: r.id,
          label: r.document_label,
          isRequired: r.is_required,
          state,
          canUpload: state !== 'VERIFIED' && files.length < MAX_VERSIONS_PER_REQUEST,
          lastFilename: latest?.original_filename ?? null,
          lastUploadedAt: latest?.created_at ?? null,
          rejectionReason: state === 'REJECTED' ? latest?.rejection_reason ?? null : null,
        };
      }),
    };
  }

  /** Whether a link exists at all: a cheap check made before an upload's body is read. */
  async isKnownLink(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
    return (await this.prisma.rndtechnosoft_candidates.count({ where: { document_token_hash: hashToken(token) } })) > 0;
  }

  async publicUpload(token: string, requestId: string, file: UploadedDocument | undefined, meta: ResponseMeta) {
    const candidate = await this.byToken(token, meta);
    await this.store(candidate.tenant_id, candidate.id, requestId, file, { via: 'CANDIDATE', ip: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null }, (locked) => {
      if (locked.archived_at || !COLLECTING_STATUSES.includes(locked.candidate_status as CandidateStatus) || locked.document_token_hash !== hashToken(token)) {
        throw new NotFoundException('This upload link is not valid.');
      }
    });
    return this.publicView(token, meta);
  }

  // ── Internals ────────────────────────────────────────────────

  /**
   * Checks and stores one upload for a requested document: its content must be
   * a PDF, JPG or PNG within the size limit. An upload still awaiting review is
   * replaced (kept as superseded); a verified document can't be replaced.
   */
  private async store(
    tenantId: string,
    candidateId: string,
    requestId: string,
    file: UploadedDocument | undefined,
    uploader: Uploader,
    allowed: (candidate: Awaited<ReturnType<CandidatesService['lockCandidate']>>) => void,
  ) {
    if (!file || !file.buffer || file.size === 0) throw new BadRequestException('Choose a file to upload.');
    if (file.size > MAX_FILE_BYTES) throw new BadRequestException('The file is larger than 10 MB. Upload a smaller copy.');
    const kind = sniffFileKind(file.buffer);
    if (!kind) throw new BadRequestException('Upload a PDF, JPG or PNG file.');

    let fileId = '';
    let label = '';
    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.candidates.lockCandidate(tx, tenantId, candidateId);
      allowed(candidate);
      const request = await this.requestOf(tx, tenantId, candidateId, requestId);
      label = request.document_label;
      const earlier = await tx.rndtechnosoft_candidate_document_files.findMany({
        where: { tenant_id: tenantId, request_id: request.id },
        select: { id: true, version_number: true, review_status: true },
      });
      if (earlier.some((f) => f.review_status === 'VERIFIED')) throw new ConflictException(`${request.document_label} is already verified.`);
      if (earlier.length >= MAX_VERSIONS_PER_REQUEST) throw new ConflictException(`${request.document_label} has reached the limit of ${MAX_VERSIONS_PER_REQUEST} uploads.`);
      await tx.rndtechnosoft_candidate_document_files.updateMany({
        where: { tenant_id: tenantId, request_id: request.id, review_status: 'PENDING_REVIEW' },
        data: { review_status: 'SUPERSEDED' },
      });
      const stored = await this.storage.save(tenantId, 'candidate-documents', file.buffer, kind.extension);
      fileId = randomUUID();
      const version = Math.max(0, ...earlier.map((f) => f.version_number)) + 1;
      await tx.rndtechnosoft_candidate_document_files.create({
        data: {
          id: fileId,
          tenant_id: tenantId,
          candidate_id: candidateId,
          request_id: request.id,
          version_number: version,
          original_filename: safeFilename(file.originalname, kind.extension, request.document_label),
          content_type: kind.contentType,
          file_size_bytes: stored.size,
          storage_key: stored.key,
          file_sha256: stored.sha256,
          uploaded_via: uploader.via,
          uploaded_by_tenant_member_id: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null,
          uploader_ip: uploader.via === 'CANDIDATE' ? uploader.ip : null,
        },
      });
      await this.candidates.recordEvent(tx, tenantId, candidateId, {
        type: 'DOCUMENT_UPLOADED',
        summary: `${request.document_label} uploaded${uploader.via === 'CANDIDATE' ? ' by the candidate' : ''} (version ${version})`,
        actorMemberId: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null,
        metadata: { requestId: request.id, fileId },
      });
      await this.syncStage(tx, tenantId, candidateId, candidate.candidate_status as CandidateStatus, uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : null);
    });
    await this.audit.log({
      tenantId,
      actorUserId: uploader.via === 'STAFF' ? uploader.actor.userId : undefined,
      actorTenantMemberId: uploader.via === 'STAFF' ? uploader.actor.tenantMemberId : undefined,
      actionCode: 'ONBOARDING_DOCUMENT_UPLOADED',
      entityType: 'CANDIDATE_DOCUMENT',
      entityId: fileId,
      metadata: { candidateId, requestId, document: label, via: uploader.via === 'CANDIDATE' ? 'candidate link' : 'HR' },
      ipAddress: uploader.via === 'CANDIDATE' ? uploader.ip ?? undefined : undefined,
      userAgent: uploader.via === 'CANDIDATE' ? uploader.userAgent ?? undefined : undefined,
    });
  }

  /** While documents are being collected, moves the candidate to where their required documents stand. */
  private async syncStage(tx: Tx, tenantId: string, candidateId: string, from: CandidateStatus, actorMemberId: string | null) {
    if (!COLLECTING_STATUSES.includes(from)) return;
    const requests = await tx.rndtechnosoft_candidate_document_requests.findMany({
      where: { tenant_id: tenantId, candidate_id: candidateId },
      select: { is_required: true, rndtechnosoft_candidate_document_files: { select: { version_number: true, review_status: true } } },
    });
    const to = documentStage(requests.map((r) => ({ isRequired: r.is_required, state: requestState(r.rndtechnosoft_candidate_document_files) }))) ?? 'OFFER_ACCEPTED';
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
    const request = await tx.rndtechnosoft_candidate_document_requests.findFirst({ where: { tenant_id: tenantId, candidate_id: candidateId, id: requestId } });
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

  /** The candidate a link belongs to, only on its own workspace's address, while HRMS is on and documents are being collected. */
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

  /** Tells the candidate a document was not accepted, when they have an upload link to replace it with. */
  private async notifyRejected(tenantId: string, candidateId: string, fileId: string, label: string, reason: string, initiatedBy: AuthenticatedTenantUser): Promise<OnboardingSendOutcome[]> {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: candidateId } });
    if (!candidate.document_link_sent_at || !COLLECTING_STATUSES.includes(candidate.candidate_status as CandidateStatus)) return [];
    const company = await this.offers.companyName(tenantId);
    const text = `Dear ${candidate.full_name}, the ${label} you uploaded could not be accepted: ${reason}. Please upload a new copy using the personal link from our earlier email.`;
    return [
      await this.mailer.send({
        tenantId,
        idempotencyKey: `documents:file:${fileId}:rejected`,
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
