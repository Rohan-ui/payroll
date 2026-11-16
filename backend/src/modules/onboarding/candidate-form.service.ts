import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AccessService } from '@/common/access/access.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { formatLetterDate } from '@/modules/documents/document-templates';
import { CandidatesService } from './candidates.service';
import { CandidateDocumentsService, UploadedDocument } from './candidate-documents.service';
import { OffersService, ResponseMeta } from './offers.service';
import { OnboardingMailerService, OnboardingSendOutcome, escapeHtml } from './onboarding-mailer.service';
import { ONBOARDING_WHATSAPP_TEMPLATES, OnboardingWhatsAppService } from './onboarding-whatsapp.service';
import { CANDIDATE_STATUS_LABELS, CandidateStatus, ELIGIBILITY_FROM, FORM_SENDABLE_FROM } from './onboarding-workflow';
import { EligibilityDecisionDto, FormAddressDto, SendCandidateFormDto, SubmitCandidateFormDto } from './dto/candidate-form.dto';

type Actor = AuthenticatedTenantUser;

/** How long a form link works after it is sent. */
const FORM_LINK_DAYS = 14;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const date = (value: string | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const text = (value: string | undefined) => value?.trim() || null;

/**
 * The candidate information form: HR sends a one-time link, the candidate
 * fills in their details without signing in, and HR reviews them and records
 * an eligibility decision. Only the link token's digest is stored; it is
 * cleared once the form is submitted, so a link works exactly once.
 */
@Injectable()
export class CandidateFormService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
    private readonly domains: TenantDomainsService,
    private readonly candidates: CandidatesService,
    private readonly offers: OffersService,
    private readonly mailer: OnboardingMailerService,
    private readonly whatsapp: OnboardingWhatsAppService,
    private readonly documents: CandidateDocumentsService,
  ) {}

  /**
   * Sends the candidate a new link to the form by email, WhatsApp or both,
   * replacing any earlier link. Sent again after submission, it reopens the
   * form to ask for more, with the message shown at the top. Every send makes
   * a new link, so sending again is also how a failed delivery is retried;
   * the same link is never emailed twice.
   */
  async send(tenantId: string, candidateId: string, input: SendCandidateFormDto, actor: Actor) {
    const id = this.candidates.idOr404(candidateId);
    const channels = new Set(input.channels?.length ? input.channels : ['EMAIL']);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({ where: { tenant_id: tenantId, id } });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    if (candidate.archived_at) throw new ConflictException('Restore the candidate before sending them the form.');
    const status = candidate.candidate_status as CandidateStatus;
    if (!FORM_SENDABLE_FROM.includes(status)) {
      throw new ConflictException(`The form can't be sent to a candidate who is ${CANDIDATE_STATUS_LABELS[status].toLowerCase()}.`);
    }
    if (channels.has('WHATSAPP') && !candidate.phone) throw new BadRequestException('The candidate has no mobile number for WhatsApp. Add one, or send by email.');
    const base = await this.offers.responseBaseUrl(tenantId);
    if (!base) throw new ConflictException('The form can’t be sent yet: this workspace has no web address. Ask your platform administrator to set one up.');
    const company = await this.offers.companyName(tenantId);
    const message = text(input.message);

    // A new link, claimed by its number so two senders at once cannot both issue one.
    const number = candidate.form_link_number + 1;
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + FORM_LINK_DAYS * 24 * 3600 * 1000);
    const claimed = await this.prisma.rndtechnosoft_candidates.updateMany({
      where: { tenant_id: tenantId, id, form_link_number: candidate.form_link_number },
      data: { form_link_number: number, form_token_hash: hashToken(token), form_link_expires_at: expires, form_request_message: message, updated_at: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException('Someone else sent the form at the same moment. Refresh and check before sending again.');

    // The documents asked for with the application are uploaded on the same form.
    await this.documents.applyChecklist(tenantId, id, 'APPLICATION', actor);

    const url = `${base}/candidate-form?token=${encodeURIComponent(token)}`;
    const until = formatLetterDate(new Date(expires.toISOString().slice(0, 10)));
    const reopening = status === 'FORM_SUBMITTED' || status === 'SCREENING';
    const notifications: OnboardingSendOutcome[] = [];

    if (channels.has('EMAIL')) {
      const intro = reopening
        ? `Dear ${candidate.full_name}, thank you for your details. We need a little more information for your application to ${company}.`
        : `Dear ${candidate.full_name}, thank you for your interest in the ${candidate.applied_position} role at ${company}. Please share your details using your personal form.`;
      const note = `The link works until ${until} and can be submitted once. It is for you only; please don't forward it.`;
      notifications.push(await this.mailer.send({
        tenantId,
        idempotencyKey: this.linkKey(id, number),
        templateCode: 'CANDIDATE_FORM_INVITATION',
        initiatedBy: actor,
        to: candidate.email,
        subject: `Your application to ${company}: please complete your details`,
        text: [intro, ...(message ? ['', message] : []), '', url, '', note, '', company].join('\n'),
        html: `<p>${escapeHtml(intro)}</p>${message ? `<p>${escapeHtml(message)}</p>` : ''}<p><a href="${escapeHtml(url)}">Complete your details</a></p><p>${escapeHtml(note)}</p><p>${escapeHtml(company)}</p>`,
        candidateId: id,
      }));
    }
    if (channels.has('WHATSAPP')) {
      notifications.push(await this.whatsapp.send(tenantId, {
        templateCode: ONBOARDING_WHATSAPP_TEMPLATES.FORM_INVITATION,
        phone: candidate.phone,
        variables: { candidate_name: candidate.full_name, company_name: company, position: candidate.applied_position, form_link: url, expiry_date: until },
        memberId: actor.tenantMemberId,
        secret: token,
      }));
    }

    const delivered = notifications.filter((n) => n.status === 'SENT');
    if (delivered.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const current = await this.candidates.lockCandidate(tx, tenantId, id);
        await tx.rndtechnosoft_candidates.update({ where: { tenant_id_id: { tenant_id: tenantId, id } }, data: { form_link_sent_at: new Date(), updated_at: new Date() } });
        const from = current.candidate_status as CandidateStatus;
        const event = { type: 'FORM_SENT', summary: `Candidate form sent by ${delivered.map((n) => (n.recipient.startsWith('WhatsApp') ? 'WhatsApp' : 'email')).join(' and ')}`, actorMemberId: actor.tenantMemberId, notes: message ?? undefined };
        if (from !== 'FORM_SENT') await this.candidates.setStatus(tx, tenantId, id, from, 'FORM_SENT', event);
        else await this.candidates.recordEvent(tx, tenantId, id, event);
      });
    }
    await this.log(tenantId, actor, 'ONBOARDING_FORM_SENT', id, {
      link_number: number,
      reopened: reopening,
      deliveries: notifications.map((n) => ({ channel: n.recipient.startsWith('WhatsApp') ? 'WHATSAPP' : 'EMAIL', status: n.status })),
    });
    return { candidate: await this.candidates.get(tenantId, id, actor.tenantMemberId), notifications };
  }

  /** What the candidate sees: their own name and contact details, any earlier answers, and HR's note. */
  async publicView(token: string, meta: ResponseMeta) {
    const candidate = await this.byToken(token, meta);
    const details = await this.details(candidate.tenant_id, candidate.id);
    return {
      companyName: await this.offers.companyName(candidate.tenant_id),
      position: candidate.applied_position,
      linkExpiresAt: candidate.form_link_expires_at,
      message: candidate.form_request_message,
      // Earlier answers, so a reopened form starts filled in. Nothing internal (remarks, decisions, salary offered) is included.
      details: { ...details.personal, currentAddress: details.addresses.CURRENT, permanentAddress: details.addresses.PERMANENT, education: details.education, experience: details.experience, references: details.references },
      documents: await this.candidateDocuments(candidate.tenant_id, candidate.id),
    };
  }

  /**
   * Saves the candidate's answers and closes the link. Answers replace any
   * earlier ones (a reopened form is filled in again in full). The same link
   * cannot submit twice: the token is cleared in the same transaction.
   */
  async submit(token: string, input: SubmitCandidateFormDto, meta: ResponseMeta) {
    const found = await this.byToken(token, meta);
    const tenantId = found.tenant_id;
    const id = found.id;
    if (input.dateOfBirth >= new Date().toISOString().slice(0, 10)) throw new BadRequestException('Enter your real date of birth.');
    for (const job of input.experience) {
      if (job.startDate && job.endDate && job.endDate < job.startDate) throw new BadRequestException(`The end date at ${job.companyName} is before its start date.`);
    }
    for (const ref of input.references) {
      if (!ref.phone && !ref.email) throw new BadRequestException(`Give a phone number or email for ${ref.name}.`);
    }

    await this.prisma.$transaction(async (tx) => {
      const candidate = await this.candidates.lockCandidate(tx, tenantId, id);
      // Checked again under the lock: a second submission of the same link finds the token gone.
      if (candidate.form_token_hash !== hashToken(token) || candidate.candidate_status !== 'FORM_SENT') {
        throw new ConflictException('This form has already been submitted. If something needs changing, contact the company.');
      }
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          full_name: input.fullName.trim(),
          phone: input.phone.trim(),
          alternate_phone: text(input.alternatePhone),
          date_of_birth: date(input.dateOfBirth),
          gender_code: input.genderCode ?? null,
          experience_years: input.totalExperienceYears ? new Prisma.Decimal(input.totalExperienceYears) : null,
          expected_salary: input.expectedSalary ? new Prisma.Decimal(input.expectedSalary) : null,
          notice_period_days: input.noticePeriodDays ?? null,
          last_working_date: date(input.lastWorkingDate),
          skills: text(input.skills),
          emergency_contact_name: input.emergencyContactName.trim(),
          emergency_contact_relationship: text(input.emergencyContactRelationship),
          emergency_contact_phone: input.emergencyContactPhone.trim(),
          additional_information: text(input.additionalInformation),
          form_token_hash: null,
          form_submitted_at: new Date(),
          updated_at: new Date(),
        },
      });
      const scope = { tenant_id: tenantId, candidate_id: id };
      await tx.rndtechnosoft_candidate_addresses.deleteMany({ where: scope });
      await tx.rndtechnosoft_candidate_education.deleteMany({ where: scope });
      await tx.rndtechnosoft_candidate_experience.deleteMany({ where: scope });
      await tx.rndtechnosoft_candidate_references.deleteMany({ where: scope });
      const addresses: [string, FormAddressDto | undefined][] = [['CURRENT', input.currentAddress], ['PERMANENT', input.permanentAddress]];
      await tx.rndtechnosoft_candidate_addresses.createMany({
        data: addresses.filter((entry): entry is [string, FormAddressDto] => Boolean(entry[1])).map(([type, a]) => ({
          id: randomUUID(), ...scope, address_type: type, address_line_1: a.addressLine1.trim(), address_line_2: text(a.addressLine2),
          city: a.city.trim(), state_region: text(a.stateRegion), postal_code: text(a.postalCode), country_code: a.countryCode,
        })),
      });
      await tx.rndtechnosoft_candidate_education.createMany({
        data: input.education.map((e, i) => ({
          id: randomUUID(), ...scope, qualification: e.qualification.trim(), institution: e.institution.trim(), university: text(e.university),
          passing_year: e.passingYear ?? null, score: text(e.score), sort_order: i,
        })),
      });
      await tx.rndtechnosoft_candidate_experience.createMany({
        data: input.experience.map((x, i) => ({
          id: randomUUID(), ...scope, company_name: x.companyName.trim(), designation: x.designation.trim(), start_date: date(x.startDate),
          end_date: x.isCurrent ? null : date(x.endDate), is_current: x.isCurrent ?? false,
          last_salary: x.lastSalary ? new Prisma.Decimal(x.lastSalary) : null, responsibilities: text(x.responsibilities), sort_order: i,
        })),
      });
      await tx.rndtechnosoft_candidate_references.createMany({
        data: input.references.map((r) => ({
          id: randomUUID(), ...scope, reference_name: r.name.trim(), relationship: text(r.relationship), company_name: text(r.companyName),
          phone: text(r.phone), email: r.email?.trim().toLowerCase() || null,
        })),
      });
      await this.candidates.setStatus(tx, tenantId, id, 'FORM_SENT', 'FORM_SUBMITTED', {
        type: 'FORM_SUBMITTED',
        summary: 'The candidate submitted their details',
        metadata: { education: input.education.length, experience: input.experience.length, references: input.references.length },
      });
    });
    // The values are personal data: the audit records only that, and from where, it was submitted.
    await this.audit.log({ tenantId, actionCode: 'ONBOARDING_FORM_SUBMITTED', entityType: 'CANDIDATE', entityId: id, ipAddress: meta.ip, userAgent: meta.userAgent?.slice(0, 500) });
    return { submitted: true };
  }

  /** Everything the candidate submitted, for HR's review. */
  async review(tenantId: string, candidateId: string) {
    const id = this.candidates.idOr404(candidateId);
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({
      where: { tenant_id: tenantId, id },
      include: { eligibility_decided_by: { select: { rndtechnosoft_users: { select: { display_name: true, email: true } } } } },
    });
    if (!candidate) throw new NotFoundException('Candidate not found.');
    const details = await this.details(tenantId, id);
    const decidedBy = candidate.eligibility_decided_by?.rndtechnosoft_users;
    return {
      form: {
        linkNumber: candidate.form_link_number,
        sentAt: candidate.form_link_sent_at,
        expiresAt: candidate.form_link_expires_at,
        isOpen: Boolean(candidate.form_token_hash) && candidate.candidate_status === 'FORM_SENT',
        submittedAt: candidate.form_submitted_at,
        requestMessage: candidate.form_request_message,
      },
      ...details,
      eligibility: candidate.eligibility_decision
        ? {
            decision: candidate.eligibility_decision,
            decidedAt: candidate.eligibility_decided_at,
            decidedBy: decidedBy ? decidedBy.display_name || decidedBy.email : null,
            remarks: candidate.eligibility_remarks,
            reason: candidate.eligibility_reason,
          }
        : null,
    };
  }

  /**
   * Records whether the candidate may go on to interviews. Not eligible ends
   * their application with a reason kept internally; the candidate may be
   * told by a polite email that does not state the reason.
   */
  async decide(tenantId: string, candidateId: string, input: EligibilityDecisionDto, actor: Actor) {
    const id = this.candidates.idOr404(candidateId);
    const candidate = await this.prisma.$transaction(async (tx) => {
      const current = await this.candidates.lockCandidate(tx, tenantId, id);
      if (current.archived_at) throw new ConflictException('Restore the candidate before deciding on them.');
      const from = current.candidate_status as CandidateStatus;
      if (!ELIGIBILITY_FROM.includes(from)) {
        throw new ConflictException(
          from === 'FORM_SENT'
            ? 'The candidate hasn’t submitted their form yet. Wait for it, or decide without it after they are moved to review.'
            : `Eligibility can't be decided for a candidate who is ${CANDIDATE_STATUS_LABELS[from].toLowerCase()}.`,
        );
      }
      await tx.rndtechnosoft_candidates.update({
        where: { tenant_id_id: { tenant_id: tenantId, id } },
        data: {
          eligibility_decision: input.decision,
          eligibility_decided_at: new Date(),
          eligibility_decided_by_tenant_member_id: actor.tenantMemberId,
          eligibility_remarks: text(input.remarks),
          eligibility_reason: input.decision === 'NOT_ELIGIBLE' ? text(input.reason) : null,
          updated_at: new Date(),
        },
      });
      await this.candidates.setStatus(tx, tenantId, id, from, input.decision, {
        type: 'ELIGIBILITY_DECIDED',
        summary: input.decision === 'ELIGIBLE' ? 'Marked eligible for interviews' : `Marked not eligible: ${text(input.reason)}`,
        notes: text(input.remarks) ?? undefined,
        actorMemberId: actor.tenantMemberId,
      });
      return current;
    });
    await this.log(tenantId, actor, 'ONBOARDING_ELIGIBILITY_DECIDED', id, {
      decision: input.decision, ...(input.decision === 'NOT_ELIGIBLE' ? { reason: text(input.reason) } : {}), notified: Boolean(input.notifyCandidate), notified_whatsapp: Boolean(input.notifyWhatsApp),
    });

    const notifications: OnboardingSendOutcome[] = [];
    if (input.decision === 'NOT_ELIGIBLE' && input.notifyCandidate) {
      const company = await this.offers.companyName(tenantId);
      const body = `Dear ${candidate.full_name}, thank you for your interest in the ${candidate.applied_position} role at ${company} and for the time you took to apply. After careful review, we will not be moving forward with your application at this time. We appreciate your interest and wish you every success.`;
      notifications.push(await this.mailer.send({
        tenantId,
        idempotencyKey: `candidate-not-eligible:${id}`,
        templateCode: 'CANDIDATE_NOT_ELIGIBLE',
        initiatedBy: actor,
        to: candidate.email,
        subject: `Your application to ${company}`,
        text: [body, '', company].join('\n'),
        html: `<p>${escapeHtml(body)}</p><p>${escapeHtml(company)}</p>`,
        candidateId: id,
      }));
    }
    if (input.decision === 'NOT_ELIGIBLE' && input.notifyWhatsApp) {
      notifications.push(await this.whatsapp.send(tenantId, {
        templateCode: ONBOARDING_WHATSAPP_TEMPLATES.NOT_ELIGIBLE,
        phone: candidate.phone,
        variables: { candidate_name: candidate.full_name, company_name: await this.offers.companyName(tenantId), position: candidate.applied_position },
        memberId: actor.tenantMemberId,
      }));
    }
    return { candidate: await this.candidates.get(tenantId, id, actor.tenantMemberId), notifications };
  }

  /**
   * Uploads a document the form asks for. Only while the form is open on this
   * link; files are checked by their bytes and stored privately, exactly as
   * the document upload link does.
   */
  async upload(token: string, requestId: string, files: UploadedDocument[], meta: ResponseMeta) {
    const candidate = await this.byToken(token, meta);
    if (files.length === 0) throw new BadRequestException('Choose a file to upload.');
    await this.documents.storeBatch(
      candidate.tenant_id,
      candidate.id,
      requestId,
      files,
      { via: 'CANDIDATE', ip: meta.ip?.slice(0, 64) ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null },
      undefined,
      (locked) => {
        if (locked.archived_at || locked.candidate_status !== 'FORM_SENT' || locked.form_token_hash !== hashToken(token)) {
          throw new GoneException('This form is no longer open.');
        }
      },
    );
    return this.candidateDocuments(candidate.tenant_id, candidate.id);
  }

  /** True when a token belongs to an open form, so uploads for made-up links are refused before their bodies are read. */
  async isKnownLink(token: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return false;
    return Boolean(await this.prisma.rndtechnosoft_candidates.findFirst({ where: { form_token_hash: hashToken(token) }, select: { id: true } }));
  }

  /** The candidate's view of what they were asked for: never other people's files, reviewers or internal notes. */
  private async candidateDocuments(tenantId: string, candidateId: string) {
    const documents = await this.documents.list(tenantId, candidateId);
    return documents.requests.map((r) => ({
      id: r.id,
      label: r.label,
      isRequired: r.isRequired,
      state: r.state,
      minFiles: r.minFiles,
      maxFiles: r.maxFiles,
      slots: r.slots,
      files: r.files.filter((f) => f.isActive).map((f) => ({ filename: f.filename, reviewStatus: f.reviewStatus, rejectionReason: f.rejectionReason, slotName: f.slotName ?? null })),
    }));
  }

  private async details(tenantId: string, id: string) {
    const scope = { tenant_id: tenantId, candidate_id: id };
    const [candidate, addresses, education, experience, references] = await Promise.all([
      this.prisma.rndtechnosoft_candidates.findFirstOrThrow({ where: { tenant_id: tenantId, id } }),
      this.prisma.rndtechnosoft_candidate_addresses.findMany({ where: scope }),
      this.prisma.rndtechnosoft_candidate_education.findMany({ where: scope, orderBy: { sort_order: 'asc' } }),
      this.prisma.rndtechnosoft_candidate_experience.findMany({ where: scope, orderBy: { sort_order: 'asc' } }),
      this.prisma.rndtechnosoft_candidate_references.findMany({ where: scope, orderBy: { created_at: 'asc' } }),
    ]);
    const address = (type: string) => {
      const a = addresses.find((row) => row.address_type === type);
      return a ? { addressLine1: a.address_line_1, addressLine2: a.address_line_2, city: a.city, stateRegion: a.state_region, postalCode: a.postal_code, countryCode: a.country_code } : null;
    };
    return {
      personal: {
        fullName: candidate.full_name,
        email: candidate.email,
        phone: candidate.phone,
        alternatePhone: candidate.alternate_phone,
        dateOfBirth: day(candidate.date_of_birth),
        genderCode: candidate.gender_code,
        totalExperienceYears: candidate.experience_years?.toString() ?? null,
        expectedSalary: candidate.expected_salary?.toString() ?? null,
        noticePeriodDays: candidate.notice_period_days,
        lastWorkingDate: day(candidate.last_working_date),
        skills: candidate.skills,
        emergencyContactName: candidate.emergency_contact_name,
        emergencyContactRelationship: candidate.emergency_contact_relationship,
        emergencyContactPhone: candidate.emergency_contact_phone,
        additionalInformation: candidate.additional_information,
      },
      addresses: { CURRENT: address('CURRENT'), PERMANENT: address('PERMANENT') },
      education: education.map((e) => ({ qualification: e.qualification, institution: e.institution, university: e.university, passingYear: e.passing_year, score: e.score })),
      experience: experience.map((x) => ({
        companyName: x.company_name, designation: x.designation, startDate: day(x.start_date), endDate: day(x.end_date), isCurrent: x.is_current,
        lastSalary: x.last_salary?.toString() ?? null, responsibilities: x.responsibilities,
      })),
      references: references.map((r) => ({ name: r.reference_name, relationship: r.relationship, companyName: r.company_name, phone: r.phone, email: r.email })),
    };
  }

  private async byToken(token: string, meta: ResponseMeta) {
    const invalid = new NotFoundException('This form link is not valid.');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) throw invalid;
    const candidate = await this.prisma.rndtechnosoft_candidates.findFirst({ where: { form_token_hash: hashToken(token) } });
    if (!candidate) throw new GoneException('This form link has been used or replaced. If you need to change something, contact the company.');
    const host = await this.domains.resolveHost(meta.host);
    if (host.kind === 'foreign' || host.kind === 'unknown' || (host.kind === 'tenant' && host.tenantId !== candidate.tenant_id)) throw invalid;
    if (!(await this.access.getModuleStates(candidate.tenant_id)).HRMS) throw invalid;
    if (candidate.archived_at || candidate.candidate_status !== 'FORM_SENT') throw new GoneException('This form is no longer open. Contact the company if you need help.');
    if (!candidate.form_link_expires_at || candidate.form_link_expires_at < new Date()) {
      throw new GoneException('This form link has expired. Ask the company to send you a new one.');
    }
    return candidate;
  }

  private linkKey(candidateId: string, number: number) {
    return `candidate-form:${candidateId}:${number}`;
  }

  private log(tenantId: string, actor: Actor, actionCode: string, candidateId: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'CANDIDATE', entityId: candidateId, metadata });
  }
}
