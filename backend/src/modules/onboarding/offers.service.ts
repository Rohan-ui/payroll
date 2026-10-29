import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { CandidatesService } from './candidates.service';
import { OnboardingMailerService, OnboardingSendOutcome, escapeHtml } from './onboarding-mailer.service';
import { DocumentPdfService } from '@/modules/documents/document-pdf.service';
import { LetterheadsService } from '@/modules/documents/letterheads.service';
import { CandidateStatus } from './onboarding-workflow';
import { formatInr, formatLetterDate, renderTemplate } from '@/modules/documents/document-templates';
import { DocNode, fillDocument } from '@/modules/documents/rich-document';
import { ListOffersQueryDto, OfferInputDto, OfferPreviewDto, SubmitOfferDto } from './dto/onboarding.dto';

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT'];
const MEMBER = { select: { id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } as const;
const nameOf = (m?: { rndtechnosoft_users: { display_name: string | null; email: string } } | null) =>
  m ? m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email : null;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
/** Today's calendar date, at UTC midnight like date columns. */
const todayDate = () => new Date(new Date().toISOString().slice(0, 10));

export interface ResponseMeta {
  host: string | undefined;
  ip: string | undefined;
  userAgent: string | undefined;
}

/**
 * Job offers: drafted from an approved template, approved step by step by the
 * approvers chosen at submission (never by the person who submitted it), sent
 * once approved with the letter as a PDF and a one-time response link, and
 * answered by the candidate. The letter text is fixed when the offer is
 * submitted, so what was approved is exactly what is sent. Every step moves
 * the candidate along the workflow and is on their timeline.
 */
@Injectable()
export class OffersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly candidates: CandidatesService,
    private readonly mailer: OnboardingMailerService,
    private readonly pdf: DocumentPdfService,
    private readonly storage: PrivateStorageService,
    private readonly domains: TenantDomainsService,
    private readonly letterheads: LetterheadsService,
  ) {}

  // ── Reading ──────────────────────────────────────────────────

  async list(tenantId: string, query: ListOffersQueryDto, actor: AuthenticatedTenantUser) {
    await this.expireDue(tenantId);
    const where: Prisma.rndtechnosoft_offersWhereInput = { tenant_id: tenantId, ...(query.status ? { offer_status: query.status } : {}) };
    if (query.awaitingMyApproval === 'true') {
      const mine = await this.offersAwaitingApprovalBy(tenantId, actor.tenantMemberId);
      where.id = { in: mine };
    }
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_offers.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          rndtechnosoft_candidates: { select: { id: true, full_name: true, candidate_code: true } },
          rndtechnosoft_offer_approvals: { include: { rndtechnosoft_tenant_members: MEMBER }, orderBy: { step_number: 'asc' } },
        },
      }),
      this.prisma.rndtechnosoft_offers.count({ where }),
    ]);
    return {
      items: rows.map((row) => {
        const current = this.currentStep(row.rndtechnosoft_offer_approvals, row.submission_number, row.offer_status);
        return {
          id: row.id,
          offerCode: row.offer_code,
          status: row.offer_status,
          candidate: { id: row.rndtechnosoft_candidates.id, name: row.rndtechnosoft_candidates.full_name, code: row.rndtechnosoft_candidates.candidate_code },
          jobTitle: row.job_title,
          annualCtc: row.annual_ctc.toFixed(2),
          joiningDate: row.joining_date.toISOString().slice(0, 10),
          expiresOn: row.expires_on.toISOString().slice(0, 10),
          awaitingApprovalFrom: current ? nameOf(current.rndtechnosoft_tenant_members) : null,
          awaitingMe: current?.approver_tenant_member_id === actor.tenantMemberId,
          updatedAt: row.updated_at,
        };
      }),
      pagination: { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) },
    };
  }

  async get(tenantId: string, offerId: string, actor: AuthenticatedTenantUser) {
    await this.expireDue(tenantId);
    const offer = await this.load(this.prisma, tenantId, offerId);
    const current = this.currentStep(offer.rndtechnosoft_offer_approvals, offer.submission_number, offer.offer_status);
    const letter = offer.rendered_body !== null ? { title: offer.rendered_title ?? '', body: offer.rendered_body } : await this.renderLetter(this.prisma, tenantId, offer);
    return {
      id: offer.id,
      offerCode: offer.offer_code,
      status: offer.offer_status,
      candidate: {
        id: offer.rndtechnosoft_candidates.id,
        name: offer.rndtechnosoft_candidates.full_name,
        code: offer.rndtechnosoft_candidates.candidate_code,
        email: offer.rndtechnosoft_candidates.email,
        status: offer.rndtechnosoft_candidates.candidate_status,
      },
      templateVersionId: offer.template_version_id,
      templateName: offer.rndtechnosoft_document_template_versions.rndtechnosoft_document_templates.template_name,
      templateVersion: offer.rndtechnosoft_document_template_versions.version_number,
      jobTitle: offer.job_title,
      departmentId: offer.department_id,
      designationId: offer.designation_id,
      employmentTypeId: offer.employment_type_id,
      reportingManagerEmployeeId: offer.reporting_manager_employee_id,
      reportingManagerName: offer.reporting_manager ? [offer.reporting_manager.first_name, offer.reporting_manager.last_name].filter(Boolean).join(' ') : null,
      workLocation: offer.work_location,
      components: offer.rndtechnosoft_offer_components.map((c) => ({ label: c.component_label, annualAmount: c.annual_amount.toFixed(2) })),
      annualCtc: offer.annual_ctc.toFixed(2),
      probationMonths: offer.probation_months,
      joiningDate: offer.joining_date.toISOString().slice(0, 10),
      expiresOn: offer.expires_on.toISOString().slice(0, 10),
      specialTerms: offer.special_terms,
      letter,
      letterIsFinal: offer.rendered_body !== null,
      approvals: offer.rndtechnosoft_offer_approvals.map((a) => ({
        submission: a.submission_number,
        step: a.step_number,
        approverMemberId: a.approver_tenant_member_id,
        approverName: nameOf(a.rndtechnosoft_tenant_members),
        status: a.approval_status,
        comment: a.approval_comment,
        decidedAt: a.decided_at,
      })),
      submissionNumber: offer.submission_number,
      awaitingMe: current?.approver_tenant_member_id === actor.tenantMemberId,
      submittedAt: offer.submitted_at,
      approvedAt: offer.approved_at,
      sentAt: offer.sent_at,
      sentBy: nameOf(offer.sent_by),
      respondedAt: offer.responded_at,
      acceptedName: offer.accepted_name,
      declineReason: offer.decline_reason,
      withdrawnReason: offer.withdrawn_reason,
      hasPdf: Boolean(offer.pdf_storage_key),
    };
  }

  /** The letter as a PDF: the one sent, or a preview of the current wording marked as such. */
  async pdfFile(tenantId: string, offerId: string) {
    const offer = await this.load(this.prisma, tenantId, offerId);
    if (offer.pdf_storage_key && offer.offer_status !== 'APPROVED') {
      return { bytes: await this.storage.read(tenantId, offer.pdf_storage_key), filename: `${offer.offer_code}.pdf` };
    }
    return { bytes: await this.buildPdf(this.prisma, tenantId, offer, { footer: 'Preview: not sent to the candidate.', watermark: 'PREVIEW' }), filename: `${offer.offer_code}-preview.pdf` };
  }

  /**
   * The letter of an offer form that has not been saved, to check it before
   * saving. It is checked like a save, but nothing is stored or sent.
   */
  async previewDraft(tenantId: string, input: OfferPreviewDto) {
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({ where: { tenant_id: tenantId, id: this.candidates.idOr404(input.candidateId) }, select: { id: true } });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    const data = await this.offerData(tenantId, input);
    const draft = { offer_code: 'Draft (not saved)', candidate_id: candidate.id, ...data.offer };
    const [letter, version] = await Promise.all([
      this.renderLetter(this.prisma, tenantId, draft),
      this.prisma.rndtechnosoft_document_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: data.offer.template_version_id } }),
    ]);
    return this.pdf.render(
      {
        companyName: await this.companyName(tenantId),
        reference: draft.offer_code,
        dateText: formatLetterDate(todayDate()),
        title: letter.title,
        body: letter.body,
        document: letter.document,
        table: {
          heading: 'Annual compensation',
          rows: data.components.map((c) => [c.component_label, formatInr(c.annual_amount)] as [string, string]),
          total: ['Total (CTC)', formatInr(data.offer.annual_ctc)],
        },
        footer: 'Preview of an unsaved draft: not saved, approved or sent.',
        watermark: 'PREVIEW',
      },
      await this.letterheads.layoutFor(tenantId, version),
    );
  }

  // ── Drafting ─────────────────────────────────────────────────

  async create(tenantId: string, candidateId: string, input: OfferInputDto, actor: AuthenticatedTenantUser) {
    const id = this.candidates.idOr404(candidateId);
    const data = await this.offerData(tenantId, input);
    const offerId = randomUUID();
    await this.withOfferCode((code) =>
      this.prisma.$transaction(async (tx) => {
        const candidate = await this.candidates.lockCandidate(tx, tenantId, id);
        if (candidate.archived_at) throw new ConflictException('Restore the candidate before making an offer.');
        if (candidate.candidate_status !== 'SELECTED') {
          throw new ConflictException('An offer is made to a selected candidate. Record a "select" decision on their interview first.');
        }
        const open = await tx.rndtechnosoft_offers.findFirst({ where: { tenant_id: tenantId, candidate_id: id, offer_status: { in: OPEN_STATUSES } }, select: { offer_code: true } });
        if (open) throw new ConflictException(`${open.offer_code} is still open for this candidate. Withdraw it before starting another.`);
        await tx.rndtechnosoft_offers.create({
          data: { id: offerId, tenant_id: tenantId, candidate_id: id, offer_code: code, offer_status: 'DRAFT', created_by_tenant_member_id: actor.tenantMemberId, ...data.offer },
        });
        await tx.rndtechnosoft_offer_components.createMany({ data: data.components.map((c) => ({ ...c, id: randomUUID(), tenant_id: tenantId, offer_id: offerId })) });
        await this.candidates.recordEvent(tx, tenantId, id, { type: 'OFFER_DRAFTED', summary: `Offer ${code} drafted for ${data.offer.job_title}`, actorMemberId: actor.tenantMemberId, metadata: { offerId } });
      }),
    );
    return this.get(tenantId, offerId, actor);
  }

  async update(tenantId: string, offerId: string, input: OfferInputDto, actor: AuthenticatedTenantUser) {
    const data = await this.offerData(tenantId, input, offerId);
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, tenantId, offerId);
      if (offer.offer_status !== 'DRAFT') throw new ConflictException('Only a draft offer can be edited. Withdraw it from approval first if it needs changes.');
      await tx.rndtechnosoft_offers.update({ where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } }, data: { ...data.offer, updated_at: new Date() } });
      await tx.rndtechnosoft_offer_components.deleteMany({ where: { tenant_id: tenantId, offer_id: offer.id } });
      await tx.rndtechnosoft_offer_components.createMany({ data: data.components.map((c) => ({ ...c, id: randomUUID(), tenant_id: tenantId, offer_id: offer.id })) });
    });
    return this.get(tenantId, offerId, actor);
  }

  // ── Approval ─────────────────────────────────────────────────

  /** Fixes the letter text and asks the chosen approvers, in order. */
  async submit(tenantId: string, offerId: string, input: SubmitOfferDto, actor: AuthenticatedTenantUser) {
    if (input.approverMemberIds.includes(actor.tenantMemberId)) throw new BadRequestException('You can’t approve an offer you submit. Choose other approvers.');
    const approvers = await this.prisma.rndtechnosoft_tenant_members.findMany({
      where: { tenant_id: tenantId, id: { in: input.approverMemberIds }, membership_status: 'ACTIVE', archived_at: null },
      select: { id: true },
    });
    if (approvers.length !== input.approverMemberIds.length) throw new BadRequestException('Every approver must be an active member of this workspace.');
    for (const memberId of input.approverMemberIds) {
      const permissions = await this.access.getMemberPermissions(tenantId, memberId);
      if (!permissions.includes('onboarding.offers.approve')) throw new BadRequestException('Every approver must be allowed to approve offers.');
    }

    let firstApprover = '';
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, tenantId, offerId);
      if (offer.offer_status !== 'DRAFT') throw new ConflictException('Only a draft offer can be submitted for approval.');
      const template = await tx.rndtechnosoft_document_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: offer.template_version_id } });
      if (template.version_status !== 'APPROVED') throw new ConflictException('The template version of this offer is no longer approved. Choose the current approved template and save the draft again.');
      const letter = await this.renderLetter(tx, tenantId, offer);
      const submission = offer.submission_number + 1;
      await tx.rndtechnosoft_offers.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
        data: { offer_status: 'PENDING_APPROVAL', submission_number: submission, rendered_title: letter.title, rendered_body: letter.body, rendered_document: (letter.document ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull, submitted_at: new Date(), updated_at: new Date() },
      });
      await tx.rndtechnosoft_offer_approvals.createMany({
        data: input.approverMemberIds.map((memberId, index) => ({
          id: randomUUID(),
          tenant_id: tenantId,
          offer_id: offer.id,
          submission_number: submission,
          step_number: index + 1,
          approver_tenant_member_id: memberId,
        })),
      });
      await this.candidates.recordEvent(tx, tenantId, offer.candidate_id, {
        type: 'OFFER_SUBMITTED',
        summary: `Offer ${offer.offer_code} sent for approval`,
        actorMemberId: actor.tenantMemberId,
        metadata: { offerId: offer.id, approvers: input.approverMemberIds.length },
      });
      firstApprover = input.approverMemberIds[0];
    });
    const notifications = await this.notifyApprover(tenantId, offerId, firstApprover, actor);
    return { offer: await this.get(tenantId, offerId, actor), notifications };
  }

  /** The current step's approver approves; the last approval approves the offer. */
  async approve(tenantId: string, offerId: string, comment: string | undefined, actor: AuthenticatedTenantUser) {
    let nextApprover: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const { offer, step } = await this.lockMyStep(tx, tenantId, offerId, actor);
      await tx.rndtechnosoft_offer_approvals.update({ where: { id: step.id }, data: { approval_status: 'APPROVED', approval_comment: comment?.trim() || null, decided_at: new Date() } });
      const next = await tx.rndtechnosoft_offer_approvals.findFirst({
        where: { tenant_id: tenantId, offer_id: offer.id, submission_number: offer.submission_number, approval_status: 'PENDING' },
        orderBy: { step_number: 'asc' },
      });
      if (!next) {
        await tx.rndtechnosoft_offers.update({ where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } }, data: { offer_status: 'APPROVED', approved_at: new Date(), updated_at: new Date() } });
      } else {
        nextApprover = next.approver_tenant_member_id;
      }
      await this.candidates.recordEvent(tx, tenantId, offer.candidate_id, {
        type: 'OFFER_APPROVAL',
        summary: next ? `Offer ${offer.offer_code}: step ${step.step_number} approved` : `Offer ${offer.offer_code} approved`,
        notes: comment?.trim() || null,
        actorMemberId: actor.tenantMemberId,
        metadata: { offerId: offer.id, step: step.step_number },
      });
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_OFFER_APPROVED', entityType: 'OFFER', entityId: offerId, metadata: { comment: comment?.trim() || null } });
    const notifications = nextApprover ? await this.notifyApprover(tenantId, offerId, nextApprover, actor) : [];
    return { offer: await this.get(tenantId, offerId, actor), notifications };
  }

  /** The current step's approver sends it back: the offer returns to draft, with the reason on record. */
  async reject(tenantId: string, offerId: string, comment: string | undefined, actor: AuthenticatedTenantUser) {
    const reason = comment?.trim();
    if (!reason || reason.length < 3) throw new BadRequestException('Say why the offer is being sent back.');
    await this.prisma.$transaction(async (tx) => {
      const { offer, step } = await this.lockMyStep(tx, tenantId, offerId, actor);
      await tx.rndtechnosoft_offer_approvals.update({ where: { id: step.id }, data: { approval_status: 'REJECTED', approval_comment: reason, decided_at: new Date() } });
      await tx.rndtechnosoft_offer_approvals.updateMany({
        where: { tenant_id: tenantId, offer_id: offer.id, submission_number: offer.submission_number, approval_status: 'PENDING' },
        data: { approval_status: 'CANCELLED' },
      });
      // Back to draft: the fixed text is released so the draft can be corrected.
      await tx.rndtechnosoft_offers.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
        data: { offer_status: 'DRAFT', rendered_title: null, rendered_body: null, rendered_document: Prisma.DbNull, updated_at: new Date() },
      });
      await this.candidates.recordEvent(tx, tenantId, offer.candidate_id, {
        type: 'OFFER_APPROVAL',
        summary: `Offer ${offer.offer_code} sent back at step ${step.step_number}`,
        notes: reason,
        actorMemberId: actor.tenantMemberId,
        metadata: { offerId: offer.id, step: step.step_number },
      });
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_OFFER_REJECTED', entityType: 'OFFER', entityId: offerId, metadata: { reason } });
    return { offer: await this.get(tenantId, offerId, actor), notifications: [] as OnboardingSendOutcome[] };
  }

  // ── Sending and withdrawing ──────────────────────────────────

  /**
   * Emails the approved offer: the letter as a PDF and a one-time link to
   * respond. The offer counts as sent only once the mail server accepted it;
   * until then it stays approved and sending can be tried again. The link and
   * PDF are made only by the request that holds the email's claim, so two
   * clicks can never send two emails or invalidate each other's link.
   */
  async send(tenantId: string, offerId: string, actor: AuthenticatedTenantUser) {
    const offer = await this.load(this.prisma, tenantId, offerId);
    if (offer.offer_status !== 'APPROVED') throw new ConflictException(offer.offer_status === 'SENT' ? 'This offer has already been sent.' : 'Only an approved offer can be sent.');
    if (offer.rndtechnosoft_candidates.archived_at) throw new ConflictException('Restore the candidate before sending the offer.');
    if (offer.rndtechnosoft_candidates.candidate_status !== 'SELECTED') throw new ConflictException('The candidate is no longer selected, so the offer can’t be sent.');
    const link = await this.responseBaseUrl(tenantId);
    if (!link) throw new ConflictException('Offers can’t be sent yet: this workspace has no web address for the candidate’s response link. Ask your platform administrator to set one up.');
    const company = await this.companyName(tenantId);

    const outcome = await this.mailer.send({
      tenantId,
      idempotencyKey: `offer:${offer.id}:submission:${offer.submission_number}:send`,
      templateCode: 'OFFER_LETTER',
      initiatedBy: actor,
      to: offer.rndtechnosoft_candidates.email,
      subject: '',
      text: '',
      html: '',
      candidateId: offer.candidate_id,
      build: async () => {
        const token = randomBytes(32).toString('base64url');
        const bytes = await this.buildPdf(this.prisma, tenantId, offer);
        const stored = await this.storage.save(tenantId, 'offers', bytes, 'pdf');
        await this.prisma.rndtechnosoft_offers.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
          data: { response_token_hash: hashToken(token), pdf_storage_key: stored.key, pdf_sha256: stored.sha256, updated_at: new Date() },
        });
        const url = `${link}/offer?token=${encodeURIComponent(token)}`;
        const intro = `Dear ${offer.rndtechnosoft_candidates.full_name}, we are pleased to offer you the position of ${offer.job_title} at ${company}. Your offer letter (${offer.offer_code}) is attached.`;
        const respond = `Please review it and accept or decline by ${formatLetterDate(offer.expires_on)} using your personal link. The link is for you only; please don't forward it.`;
        return {
          subject: `Your offer from ${company}: ${offer.job_title}`,
          text: [intro, '', respond, url, '', company].join('\n'),
          html: `<p>${escapeHtml(intro)}</p><p>${escapeHtml(respond)}</p><p><a href="${escapeHtml(url)}">Review and respond to your offer</a></p><p>${escapeHtml(company)}</p>`,
          attachments: [{ filename: `${offer.offer_code}.pdf`, content: bytes, contentType: 'application/pdf' }],
        };
      },
    });

    // Sent now, or by an earlier attempt whose status change did not complete: record it as sent.
    if (outcome.status === 'SENT') {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.lockOffer(tx, tenantId, offer.id);
        if (current.offer_status !== 'APPROVED') return;
        await tx.rndtechnosoft_offers.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
          data: { offer_status: 'SENT', sent_at: new Date(), sent_by_tenant_member_id: actor.tenantMemberId, updated_at: new Date() },
        });
        const candidate = await this.candidates.lockCandidate(tx, tenantId, offer.candidate_id);
        await this.candidates.setStatus(tx, tenantId, offer.candidate_id, candidate.candidate_status as CandidateStatus, candidate.candidate_status === 'SELECTED' ? 'OFFER_SENT' : (candidate.candidate_status as CandidateStatus), {
          type: 'OFFER_SENT',
          summary: `Offer ${offer.offer_code} sent to ${offer.rndtechnosoft_candidates.email}`,
          actorMemberId: actor.tenantMemberId,
          metadata: { offerId: offer.id },
        });
      });
      await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_OFFER_SENT', entityType: 'OFFER', entityId: offer.id });
    }
    return { offer: await this.get(tenantId, offerId, actor), notifications: [outcome] };
  }

  /** Withdraws an open offer. A sent offer's link then shows it as withdrawn, and the candidate returns to selected. */
  async withdraw(tenantId: string, offerId: string, reason: string, actor: AuthenticatedTenantUser) {
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, tenantId, offerId);
      if (!OPEN_STATUSES.includes(offer.offer_status)) throw new ConflictException('Only an open offer can be withdrawn.');
      await tx.rndtechnosoft_offers.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
        data: { offer_status: 'WITHDRAWN', withdrawn_reason: reason.trim(), updated_at: new Date() },
      });
      await tx.rndtechnosoft_offer_approvals.updateMany({
        where: { tenant_id: tenantId, offer_id: offer.id, approval_status: 'PENDING' },
        data: { approval_status: 'CANCELLED' },
      });
      const candidate = await this.candidates.lockCandidate(tx, tenantId, offer.candidate_id);
      const from = candidate.candidate_status as CandidateStatus;
      await this.candidates.setStatus(tx, tenantId, offer.candidate_id, from, from === 'OFFER_SENT' ? 'SELECTED' : from, {
        type: 'OFFER_WITHDRAWN',
        summary: `Offer ${offer.offer_code} withdrawn`,
        notes: reason.trim(),
        actorMemberId: actor.tenantMemberId,
        metadata: { offerId: offer.id },
      });
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'ONBOARDING_OFFER_WITHDRAWN', entityType: 'OFFER', entityId: offerId, metadata: { reason: reason.trim() } });
    return { offer: await this.get(tenantId, offerId, actor), notifications: [] as OnboardingSendOutcome[] };
  }

  /** Explicitly changes or administratively overrides the status of an offer. */
  async changeStatus(
    tenantId: string,
    offerId: string,
    dto: { newStatus?: string; toStatus?: string; status?: string; reason?: string; isOverride?: boolean },
    actor: AuthenticatedTenantUser,
  ) {
    const offer = await this.lockOffer(this.prisma, tenantId, offerId);
    const currentStatus = offer.offer_status;
    const targetStatus = dto.newStatus || dto.toStatus || dto.status;
    if (!targetStatus) {
      throw new BadRequestException('Choose a valid offer status.');
    }
    if (currentStatus === targetStatus) {
      return { offer: await this.get(tenantId, offerId, actor), notifications: [] as OnboardingSendOutcome[] };
    }

    const isOverride = Boolean(dto.isOverride);
    if (isOverride) {
      await this.access.assertHoldsAll(
        tenantId,
        actor.tenantMemberId,
        ['onboarding.candidates.override'],
        'You do not have permission to override offer status.',
      );
      if (!dto.reason || dto.reason.trim().length < 10) {
        throw new BadRequestException('An override reason of at least 10 characters is required.');
      }
    } else {
      const allowedTransitions: Record<string, string[]> = {
        DRAFT: ['PENDING_APPROVAL', 'APPROVED', 'WITHDRAWN'],
        PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'WITHDRAWN'],
        APPROVED: ['SENT', 'WITHDRAWN'],
        SENT: ['ACCEPTED', 'DECLINED', 'EXPIRED', 'WITHDRAWN'],
        ACCEPTED: ['WITHDRAWN'],
        DECLINED: ['DRAFT', 'WITHDRAWN'],
        EXPIRED: ['DRAFT', 'WITHDRAWN'],
        WITHDRAWN: ['DRAFT'],
      };
      const allowed = allowedTransitions[currentStatus] || [];
      if (!allowed.includes(targetStatus)) {
        throw new BadRequestException(
          `Invalid status transition: Cannot change status from ${currentStatus} to ${targetStatus}. Permitted next statuses: ${allowed.join(', ') || 'None'}`,
        );
      }
      if (['DECLINED', 'WITHDRAWN'].includes(targetStatus) && !dto.reason?.trim()) {
        throw new BadRequestException(`A reason is required when transitioning status to ${targetStatus}.`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_offers.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: offerId } },
        data: {
          offer_status: targetStatus,
          ...(targetStatus === 'ACCEPTED' ? { responded_at: new Date(), accepted_name: 'Manual Acceptance' } : {}),
          ...(targetStatus === 'WITHDRAWN' ? { withdrawn_reason: dto.reason?.trim() ?? null } : {}),
          ...(targetStatus === 'DECLINED' ? { decline_reason: dto.reason?.trim() ?? null, responded_at: new Date() } : {}),
          updated_at: new Date(),
        },
      });

      // Record candidate timeline event without mutating candidate stage
      await tx.rndtechnosoft_candidate_events.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          candidate_id: offer.candidate_id,
          event_type: isOverride ? 'OFFER_STATUS_OVERRIDDEN' : 'OFFER_STATUS_CHANGED',
          from_status: null,
          to_status: null,
          is_override: isOverride,
          summary: isOverride
            ? `Offer ${offer.offer_code} status overridden to ${targetStatus}`
            : `Offer ${offer.offer_code} status changed to ${targetStatus}`,
          notes: dto.reason?.trim() ?? null,
          actor_tenant_member_id: actor.tenantMemberId,
          metadata: { offerId: offer.id, fromStatus: currentStatus, toStatus: targetStatus, isOverride },
        },
      });
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: isOverride ? 'ONBOARDING_OFFER_STATUS_OVERRIDDEN' : 'ONBOARDING_OFFER_STATUS_CHANGED',
      entityType: 'OFFER',
      entityId: offer.id,
      oldValues: { status: currentStatus },
      newValues: { status: targetStatus, isOverride },
      metadata: { reason: dto.reason?.trim() ?? null },
    });

    return { offer: await this.get(tenantId, offerId, actor), notifications: [] as OnboardingSendOutcome[] };
  }

  /** Sent offers past their last day become expired, and their candidates return to selected for a new offer. */
  async expireDue(tenantId: string) {
    const due = await this.prisma.rndtechnosoft_offers.findMany({
      where: { tenant_id: tenantId, offer_status: 'SENT', expires_on: { lt: todayDate() } },
      select: { id: true },
      take: 100,
    });
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const offer = await this.lockOffer(tx, tenantId, id);
        if (offer.offer_status !== 'SENT' || offer.expires_on >= todayDate()) return;
        await tx.rndtechnosoft_offers.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { offer_status: 'EXPIRED', updated_at: new Date() } });
        const candidate = await this.candidates.lockCandidate(tx, tenantId, offer.candidate_id);
        const from = candidate.candidate_status as CandidateStatus;
        await this.candidates.setStatus(tx, tenantId, offer.candidate_id, from, from === 'OFFER_SENT' ? 'SELECTED' : from, {
          type: 'OFFER_EXPIRED',
          summary: `Offer ${offer.offer_code} expired unanswered`,
          metadata: { offerId: id },
        });
      });
    }
  }

  async offersAwaitingApprovalBy(tenantId: string, memberId: string): Promise<string[]> {
    const pending = await this.prisma.rndtechnosoft_offers.findMany({
      where: { tenant_id: tenantId, offer_status: 'PENDING_APPROVAL' },
      select: { id: true, submission_number: true, offer_status: true, rndtechnosoft_offer_approvals: { select: { approver_tenant_member_id: true, approval_status: true, step_number: true, submission_number: true } } },
    });
    return pending.filter((o) => this.currentStep(o.rndtechnosoft_offer_approvals, o.submission_number, o.offer_status)?.approver_tenant_member_id === memberId).map((o) => o.id);
  }

  // ── The candidate's link ─────────────────────────────────────

  /** What the candidate sees through their link: the offer's terms and letter, nothing internal. */
  async publicView(token: string, meta: ResponseMeta) {
    const offer = await this.byToken(token, meta);
    return this.publicShape(offer);
  }

  async publicPdf(token: string, meta: ResponseMeta) {
    const offer = await this.byToken(token, meta);
    if (!offer.pdf_storage_key) throw new NotFoundException('This offer link is not valid.');
    return { bytes: await this.storage.read(offer.tenant_id, offer.pdf_storage_key), filename: `${offer.offer_code}.pdf` };
  }

  /**
   * The candidate's explicit acceptance, with the name they typed, the time,
   * and where it came from. The typed name is a confirmation, not a verified
   * electronic signature.
   */
  async accept(token: string, typedName: string, meta: ResponseMeta) {
    return this.respond(token, meta, 'ACCEPTED', { accepted_name: typedName.trim().slice(0, 200) });
  }

  async decline(token: string, reason: string | undefined, meta: ResponseMeta) {
    return this.respond(token, meta, 'DECLINED', { decline_reason: reason?.trim() || null });
  }

  // ── Internals ────────────────────────────────────────────────

  private async respond(token: string, meta: ResponseMeta, outcome: 'ACCEPTED' | 'DECLINED', fields: { accepted_name?: string; decline_reason?: string | null }) {
    const found = await this.byToken(token, meta);
    const tenantId = found.tenant_id;
    await this.prisma.$transaction(async (tx) => {
      const offer = await this.lockOffer(tx, tenantId, found.id);
      if (offer.offer_status !== 'SENT') throw new ConflictException(`This offer is ${offer.offer_status.toLowerCase().replace('_', ' ')}, so it can no longer be answered.`);
      if (offer.expires_on < todayDate()) throw new ConflictException('This offer has expired.');
      await tx.rndtechnosoft_offers.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: offer.id } },
        data: {
          offer_status: outcome,
          responded_at: new Date(),
          response_ip: meta.ip?.slice(0, 64) ?? null,
          response_user_agent: meta.userAgent?.slice(0, 300) ?? null,
          ...fields,
          updated_at: new Date(),
        },
      });
      const candidate = await this.candidates.lockCandidate(tx, tenantId, offer.candidate_id);
      const from = candidate.candidate_status as CandidateStatus;
      const to: CandidateStatus = from === 'OFFER_SENT' ? (outcome === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED') : from;
      await this.candidates.setStatus(tx, tenantId, offer.candidate_id, from, to, {
        type: outcome === 'ACCEPTED' ? 'OFFER_ACCEPTED' : 'OFFER_DECLINED',
        summary: outcome === 'ACCEPTED' ? `Offer ${offer.offer_code} accepted by the candidate (typed name: ${fields.accepted_name})` : `Offer ${offer.offer_code} declined by the candidate`,
        notes: outcome === 'DECLINED' ? fields.decline_reason ?? null : null,
        metadata: { offerId: offer.id, ip: meta.ip?.slice(0, 64) ?? null },
      });
    });
    await this.audit.log({
      tenantId,
      actionCode: outcome === 'ACCEPTED' ? 'ONBOARDING_OFFER_ACCEPTED' : 'ONBOARDING_OFFER_DECLINED',
      entityType: 'OFFER',
      entityId: found.id,
      metadata: { via: 'candidate link' },
      ipAddress: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 300),
    });
    await this.notifyResponse(tenantId, found.id, outcome);
    return this.publicShape(await this.byToken(token, meta));
  }

  /** The offer a link belongs to, answering only on its own workspace's address and while HRMS is on. */
  private async byToken(token: string, meta: ResponseMeta) {
    const invalid = new NotFoundException('This offer link is not valid.');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw invalid;
    const offer = await this.prisma.rndtechnosoft_offers.findFirst({
      where: { response_token_hash: hashToken(token) },
      include: {
        rndtechnosoft_candidates: { select: { full_name: true } },
        rndtechnosoft_offer_components: { orderBy: { sort_order: 'asc' } },
      },
    });
    if (!offer) throw invalid;
    // A workspace's address answers only for its own offers.
    const host = await this.domains.resolveHost(meta.host);
    if (host.kind === 'foreign' || host.kind === 'unknown' || (host.kind === 'tenant' && host.tenantId !== offer.tenant_id)) throw invalid;
    const modules = await this.access.getModuleStates(offer.tenant_id);
    if (!modules.HRMS) throw invalid;
    if (offer.offer_status === 'SENT' && offer.expires_on < todayDate()) {
      await this.expireDue(offer.tenant_id);
      return { ...offer, offer_status: 'EXPIRED' };
    }
    return offer;
  }

  private async publicShape(offer: Awaited<ReturnType<OffersService['byToken']>>) {
    return {
      companyName: await this.companyName(offer.tenant_id),
      offerCode: offer.offer_code,
      candidateName: offer.rndtechnosoft_candidates.full_name,
      jobTitle: offer.job_title,
      joiningDate: offer.joining_date.toISOString().slice(0, 10),
      expiresOn: offer.expires_on.toISOString().slice(0, 10),
      annualCtc: offer.annual_ctc.toFixed(2),
      components: offer.rndtechnosoft_offer_components.map((c) => ({ label: c.component_label, annualAmount: c.annual_amount.toFixed(2) })),
      letter: { title: offer.rendered_title ?? '', body: offer.rendered_body ?? '' },
      status: offer.offer_status,
      respondedAt: offer.responded_at,
      canRespond: offer.offer_status === 'SENT',
    };
  }

  private async load(db: Db, tenantId: string, offerId: string) {
    if (!UUID.test(offerId)) throw new NotFoundException('Offer not found.');
    const offer = await db.rndtechnosoft_offers.findFirst({
      where: { tenant_id: tenantId, id: offerId },
      include: {
        rndtechnosoft_candidates: true,
        rndtechnosoft_document_template_versions: { include: { rndtechnosoft_document_templates: { select: { template_name: true } } } },
        rndtechnosoft_offer_components: { orderBy: { sort_order: 'asc' } },
        rndtechnosoft_offer_approvals: { include: { rndtechnosoft_tenant_members: MEMBER }, orderBy: [{ submission_number: 'desc' }, { step_number: 'asc' }] },
        sent_by: MEMBER,
        reporting_manager: { select: { first_name: true, last_name: true, employee_code: true } },
      },
    });
    if (!offer) throw new NotFoundException('Offer not found.');
    return offer;
  }

  private async lockOffer(tx: Tx, tenantId: string, offerId: string) {
    if (!UUID.test(offerId)) throw new NotFoundException('Offer not found.');
    const rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM rndtechnosoft_offers WHERE tenant_id = ${tenantId}::uuid AND id = ${offerId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new NotFoundException('Offer not found.');
    return tx.rndtechnosoft_offers.findFirstOrThrow({ where: { tenant_id: tenantId, id: offerId } });
  }

  /** The offer, locked, and its current approval step, which must be the actor's. */
  private async lockMyStep(tx: Tx, tenantId: string, offerId: string, actor: AuthenticatedTenantUser) {
    const offer = await this.lockOffer(tx, tenantId, offerId);
    if (offer.offer_status !== 'PENDING_APPROVAL') throw new ConflictException('This offer is not waiting for approval.');
    const step = await tx.rndtechnosoft_offer_approvals.findFirst({
      where: { tenant_id: tenantId, offer_id: offer.id, submission_number: offer.submission_number, approval_status: 'PENDING' },
      orderBy: { step_number: 'asc' },
    });
    if (!step || step.approver_tenant_member_id !== actor.tenantMemberId) throw new ForbiddenException('This offer is waiting for another approver.');
    return { offer, step };
  }

  private currentStep<T extends { approver_tenant_member_id: string; approval_status: string; step_number: number; submission_number: number }>(steps: T[], submission: number, status: string) {
    if (status !== 'PENDING_APPROVAL') return null;
    return steps.filter((s) => s.submission_number === submission && s.approval_status === 'PENDING').sort((a, b) => a.step_number - b.step_number)[0] ?? null;
  }

  /** Validated column values; every referenced record is checked to be in this workspace. */
  private async offerData(tenantId: string, input: OfferInputDto, currentOfferId?: string) {
    const [version, department, designation, employmentType, manager] = await Promise.all([
      this.prisma.rndtechnosoft_document_template_versions.findFirst({
        where: { tenant_id: tenantId, id: input.templateVersionId, version_status: 'APPROVED', rndtechnosoft_document_templates: { template_kind: 'OFFER_LETTER', is_archived: false } },
        select: { id: true },
      }),
      input.departmentId ? this.prisma.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: input.departmentId }, select: { id: true } }) : null,
      input.designationId ? this.prisma.rndtechnosoft_designations.findFirst({ where: { tenant_id: tenantId, id: input.designationId }, select: { id: true } }) : null,
      input.employmentTypeId
        ? this.prisma.rndtechnosoft_employment_types.findFirst({
            where: { tenant_id: tenantId, id: input.employmentTypeId },
            select: { id: true, employment_type_status: true },
          })
        : null,
      input.reportingManagerEmployeeId
        ? this.prisma.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: input.reportingManagerEmployeeId, employee_status: 'ACTIVE', archived_at: null }, select: { id: true } })
        : null,
    ]);
    if (!version) throw new BadRequestException('Choose an approved offer letter template.');
    if (input.departmentId && !department) throw new BadRequestException('That department is not in this workspace.');
    if (input.designationId && !designation) throw new BadRequestException('That designation is not in this workspace.');
    if (input.employmentTypeId && !employmentType) throw new BadRequestException('That employment type is not in this workspace.');
    if (employmentType && employmentType.employment_type_status !== 'ACTIVE') {
      let isExisting = false;
      if (currentOfferId) {
        const existing = await this.prisma.rndtechnosoft_offers.findFirst({
          where: { tenant_id: tenantId, id: currentOfferId },
          select: { employment_type_id: true },
        });
        if (existing?.employment_type_id === input.employmentTypeId) {
          isExisting = true;
        }
      }
      if (!isExisting) {
        throw new BadRequestException('The selected employment type is inactive. Please choose an active employment type.');
      }
    }
    if (input.reportingManagerEmployeeId && !manager) throw new BadRequestException('The reporting manager must be an active employee of this workspace.');

    const joining = new Date(input.joiningDate);
    const expires = new Date(input.expiresOn);
    const today = todayDate();
    if (expires < today) throw new BadRequestException('The last day to accept can’t be in the past.');
    if (joining < expires) throw new BadRequestException('The joining date must be on or after the last day to accept.');

    const components = input.components.map((c, index) => {
      const label = c.label.trim();
      if (!label) throw new BadRequestException(`Pay line ${index + 1} needs a name.`);
      return { component_label: label, annual_amount: new Prisma.Decimal(c.annualAmount), sort_order: index + 1 };
    });
    const total = components.reduce((sum, c) => sum.add(c.annual_amount), new Prisma.Decimal(0));
    return {
      offer: {
        template_version_id: version.id,
        job_title: input.jobTitle.trim(),
        department_id: input.departmentId ?? null,
        designation_id: input.designationId ?? null,
        employment_type_id: input.employmentTypeId ?? null,
        reporting_manager_employee_id: input.reportingManagerEmployeeId ?? null,
        work_location: input.workLocation?.trim() || null,
        annual_ctc: total,
        probation_months: input.probationMonths ?? null,
        joining_date: joining,
        expires_on: expires,
        special_terms: input.specialTerms?.trim() || null,
      },
      components,
    };
  }

  /** The letter from the offer's template version and its current data. */
  private async renderLetter(
    db: Db,
    tenantId: string,
    offer: { offer_code: string; candidate_id: string; template_version_id: string; job_title: string; department_id: string | null; designation_id: string | null; employment_type_id: string | null; reporting_manager_employee_id: string | null; work_location: string | null; annual_ctc: Prisma.Decimal; probation_months: number | null; joining_date: Date; expires_on: Date; special_terms: string | null },
  ) {
    const [version, candidate, department, designation, employmentType, manager, company] = await Promise.all([
      db.rndtechnosoft_document_template_versions.findFirstOrThrow({ where: { tenant_id: tenantId, id: offer.template_version_id }, select: { title: true, body: true, body_document: true } }),
      db.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id: offer.candidate_id }, select: { full_name: true } }),
      offer.department_id ? db.rndtechnosoft_departments.findFirst({ where: { tenant_id: tenantId, id: offer.department_id }, select: { department_name: true } }) : null,
      offer.designation_id ? db.rndtechnosoft_designations.findFirst({ where: { tenant_id: tenantId, id: offer.designation_id }, select: { designation_name: true } }) : null,
      offer.employment_type_id ? db.rndtechnosoft_employment_types.findFirst({ where: { tenant_id: tenantId, id: offer.employment_type_id }, select: { employment_type_name: true } }) : null,
      offer.reporting_manager_employee_id
        ? db.rndtechnosoft_employees.findFirst({ where: { tenant_id: tenantId, id: offer.reporting_manager_employee_id }, select: { first_name: true, last_name: true } })
        : null,
      this.companyName(tenantId),
    ]);
    const values: Record<string, string> = {
      candidate_name: candidate.full_name,
      company_name: company,
      job_title: offer.job_title,
      department: department?.department_name ?? '',
      designation: designation?.designation_name ?? '',
      reporting_manager: manager ? [manager.first_name, manager.last_name].filter(Boolean).join(' ') : '',
      employment_type: employmentType?.employment_type_name ?? '',
      work_location: offer.work_location ?? '',
      salary: formatInr(offer.annual_ctc),
      joining_date: formatLetterDate(offer.joining_date),
      probation_period: offer.probation_months ? `${offer.probation_months} month${offer.probation_months === 1 ? '' : 's'}` : 'None',
      offer_expiry_date: formatLetterDate(offer.expires_on),
      special_terms: offer.special_terms ?? 'None',
      offer_reference: offer.offer_code,
      today: formatLetterDate(todayDate()),
    };
    // A formatted version is filled as a document, keeping each placeholder's formatting.
    const document = version.body_document ? fillDocument(version.body_document as unknown as DocNode, values) : undefined;
    return { title: renderTemplate(version.title, values), body: renderTemplate(version.body, values), document };
  }

  /** The offer's letter as a PDF, laid out as its template version says (letterhead, page, margins). */
  private async buildPdf(db: Db, tenantId: string, offer: Awaited<ReturnType<OffersService['load']>>, marks: { footer?: string; watermark?: string } = {}) {
    const footer = marks.footer;
    // A submitted offer prints the letter fixed at submission; a draft, its letter as it would be now.
    const letter =
      offer.rendered_body !== null
        ? { title: offer.rendered_title ?? '', body: offer.rendered_body, document: (offer.rendered_document as unknown as DocNode | null) ?? undefined }
        : await this.renderLetter(db, tenantId, offer);
    return this.pdf.render({
      companyName: await this.companyName(tenantId),
      reference: offer.offer_code,
      dateText: formatLetterDate(offer.submitted_at ? new Date(offer.submitted_at.toISOString().slice(0, 10)) : todayDate()),
      title: letter.title,
      body: letter.body,
      document: letter.document,
      table: {
        heading: 'Annual compensation',
        rows: offer.rndtechnosoft_offer_components.map((c) => [c.component_label, formatInr(c.annual_amount)] as [string, string]),
        total: ['Total (CTC)', formatInr(offer.annual_ctc)],
      },
      footer: footer ?? `Offer ${offer.offer_code}. Please respond by ${formatLetterDate(offer.expires_on)}.`,
      watermark: marks.watermark,
    }, await this.letterheads.layoutFor(tenantId, offer.rndtechnosoft_document_template_versions));
  }

  async companyName(tenantId: string) {
    return (await this.prisma.rndtechnosoft_tenants.findUniqueOrThrow({ where: { id: tenantId }, select: { legal_name: true } })).legal_name;
  }

  /** The workspace's own web address, where a candidate's link opens; null when it has none. */
  async responseBaseUrl(tenantId: string) {
    const subdomain = (await this.domains.primarySubdomains([tenantId])).get(tenantId)?.subdomain;
    if (subdomain) return this.domains.workspaceUrl(subdomain);
    // Without workspace addresses (development) the app has one address.
    return this.domains.addressOf('x') ? null : this.domains.workspaceUrl('x');
  }

  private async notifyApprover(tenantId: string, offerId: string, memberId: string, initiatedBy: AuthenticatedTenantUser): Promise<OnboardingSendOutcome[]> {
    const [offer, member, company] = await Promise.all([
      this.prisma.rndtechnosoft_offers.findFirstOrThrow({ where: { tenant_id: tenantId, id: offerId }, include: { rndtechnosoft_candidates: { select: { full_name: true } } } }),
      this.prisma.rndtechnosoft_tenant_members.findFirstOrThrow({ where: { tenant_id: tenantId, id: memberId }, select: { rndtechnosoft_users: { select: { email: true } } } }),
      this.companyName(tenantId),
    ]);
    const text = `Offer ${offer.offer_code} for ${offer.rndtechnosoft_candidates.full_name} (${offer.job_title}) is waiting for your approval in Onboarding.`;
    return [
      await this.mailer.send({
        tenantId,
        idempotencyKey: `offer:${offerId}:submission:${offer.submission_number}:approver:${memberId}`,
        templateCode: 'OFFER_APPROVAL_REQUEST',
        initiatedBy,
        to: member.rndtechnosoft_users.email,
        subject: `Offer awaiting your approval: ${offer.rndtechnosoft_candidates.full_name}`,
        text: `${text}\n\n${company}`,
        html: `<p>${escapeHtml(text)}</p><p>${escapeHtml(company)}</p>`,
        candidateId: offer.candidate_id,
      }),
    ];
  }

  private async notifyResponse(tenantId: string, offerId: string, outcome: 'ACCEPTED' | 'DECLINED') {
    const offer = await this.prisma.rndtechnosoft_offers.findFirstOrThrow({
      where: { tenant_id: tenantId, id: offerId },
      include: { rndtechnosoft_candidates: { select: { full_name: true, email: true } }, sent_by: { select: { rndtechnosoft_users: { select: { email: true } } } } },
    });
    const company = await this.companyName(tenantId);
    const candidateName = offer.rndtechnosoft_candidates.full_name;
    if (outcome === 'ACCEPTED') {
      const text = `Dear ${candidateName}, thank you for accepting our offer for ${offer.job_title}. We look forward to you joining ${company} on ${formatLetterDate(offer.joining_date)}. We will be in touch about the next steps.`;
      await this.mailer.send({
        tenantId,
        idempotencyKey: `offer:${offerId}:accepted:candidate`,
        templateCode: 'OFFER_ACCEPTED_CONFIRMATION',
        to: offer.rndtechnosoft_candidates.email,
        subject: `Offer accepted: ${offer.job_title} at ${company}`,
        text: `${text}\n\n${company}`,
        html: `<p>${escapeHtml(text)}</p><p>${escapeHtml(company)}</p>`,
        candidateId: offer.candidate_id,
      });
    }
    const hrEmail = offer.sent_by?.rndtechnosoft_users.email;
    if (hrEmail) {
      const text = `${candidateName} has ${outcome === 'ACCEPTED' ? 'accepted' : 'declined'} offer ${offer.offer_code} (${offer.job_title}).`;
      await this.mailer.send({
        tenantId,
        idempotencyKey: `offer:${offerId}:${outcome.toLowerCase()}:hr`,
        templateCode: outcome === 'ACCEPTED' ? 'OFFER_ACCEPTED_NOTICE' : 'OFFER_DECLINED_NOTICE',
        to: hrEmail,
        subject: `Offer ${outcome === 'ACCEPTED' ? 'accepted' : 'declined'}: ${candidateName}`,
        text,
        html: `<p>${escapeHtml(text)}</p>`,
        candidateId: offer.candidate_id,
      });
    }
  }

  private async withOfferCode<T>(create: (code: string) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const code = `OFR-${new Date().getFullYear()}-${randomInt(100000, 1000000)}`;
      try {
        return await create(code);
      } catch (error) {
        const target = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' ? JSON.stringify(error.meta?.target ?? '') : '';
        if (/offer_code|uq_offers_code/.test(target) && attempt < 4) continue;
        if (/uq_offers_one_open|candidate_id/.test(target)) throw new ConflictException('This candidate already has an open offer.');
        throw error;
      }
    }
  }
}
