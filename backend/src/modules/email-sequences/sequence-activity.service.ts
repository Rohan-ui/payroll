import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CrmService } from '@/modules/crm/crm.service';
import { LeadVisibility, visibleLeads } from '@/modules/crm/lead-visibility';
import { scheduleOf, STOP_REASONS } from './sequence-context';
import { EnrollVia, SequenceEnrollmentService } from './sequence-enrollment.service';
import { SequenceSenderService } from './sequence-sender.service';
import { EmailSequencesService } from './email-sequences.service';
import { earliestSendTime } from './sequence-schedule';
import { EnrollmentsQueryDto, SendsQueryDto } from './dto/email-sequences.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEAD = { select: { id: true, company_name: true, first_name: true, last_name: true, email: true } } as const;
const leadName = (l: { first_name: string | null; last_name: string | null }) => [l.first_name, l.last_name].filter(Boolean).join(' ');

/**
 * Leads in sequences, and the emails sent to them: adding leads (one, many,
 * or a preview of who could join), stopping them (optionally moving them to
 * Client Outreach), what a lead's sequences are, the sending log, and putting
 * right an email that failed or may not have gone. Members see only the leads
 * they may see.
 */
@Injectable()
export class SequenceActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
    private readonly enrollments: SequenceEnrollmentService,
    private readonly sender: SequenceSenderService,
    private readonly sequences: EmailSequencesService,
  ) {}

  async list(tenantId: string, sequenceId: string, visibility: LeadVisibility, query: EnrollmentsQueryDto) {
    await this.sequences.sequence(tenantId, sequenceId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const search = query.search?.trim();
    const where: Prisma.rndtechnosoft_email_sequence_enrollmentsWhereInput = {
      tenant_id: tenantId, sequence_id: sequenceId,
      ...(query.status ? { enrollment_status: query.status } : {}),
      rndtechnosoft_crm_leads: {
        ...visibleLeads(visibility),
        ...(search ? { OR: [{ company_name: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }, { first_name: { contains: search, mode: 'insensitive' } }] } : {}),
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequence_enrollments.findMany({
        where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit,
        include: {
          rndtechnosoft_crm_leads: LEAD,
          rndtechnosoft_email_sequence_sends: {
            orderBy: { created_at: 'desc' },
            select: { id: true, send_status: true, scheduled_at: true, sent_at: true, replied_at: true, failure_code: true, failure_reason: true, rndtechnosoft_email_sequence_steps: { select: { step_name: true, step_order: true } } },
          },
        },
      }),
      this.prisma.rndtechnosoft_email_sequence_enrollments.count({ where }),
    ]);
    return {
      items: rows.map((e) => {
        const sends = e.rndtechnosoft_email_sequence_sends;
        const next = sends.find((s) => ['SCHEDULED', 'SENDING', 'FAILED', 'UNCERTAIN'].includes(s.send_status));
        return {
          id: e.id, status: e.enrollment_status, enrolledVia: e.enrolled_via, enrolledAt: e.created_at, stopReason: e.stop_reason, stopReasonText: e.stop_reason ? STOP_REASONS[e.stop_reason] ?? e.stop_reason : null,
          stopDetail: e.stop_detail, stoppedAt: e.stopped_at, completedAt: e.completed_at,
          lead: { id: e.rndtechnosoft_crm_leads.id, company: e.rndtechnosoft_crm_leads.company_name, name: leadName(e.rndtechnosoft_crm_leads), email: e.rndtechnosoft_crm_leads.email },
          sent: sends.filter((s) => s.send_status === 'SENT' || s.send_status === 'BOUNCED').length,
          replied: sends.some((s) => s.replied_at),
          next: next ? { sendId: next.id, status: next.send_status, at: next.scheduled_at, step: next.rndtechnosoft_email_sequence_steps.step_name, problem: next.failure_reason, problemCode: next.failure_code } : null,
        };
      }),
      page, limit, total,
    };
  }

  /** Who of the chosen leads could join, and when the first email would go: every check, nothing saved. */
  async preview(tenantId: string, sequenceId: string, leadIds: string[], visibility: LeadVisibility, moveFromOutreach = false) {
    const sequence = await this.sequences.sequence(tenantId, sequenceId);
    const leads = await this.visible(tenantId, leadIds, visibility);
    const calendar = await this.enrollments.calendar(tenantId);
    const results = [];
    for (const lead of leads) {
      const r = await this.enrollments.enroll(tenantId, sequenceId, lead.id, 'MANUAL', { memberId: null, calendar, dryRun: true, moveFromOutreach });
      results.push({ leadId: lead.id, company: lead.company_name, name: leadName(lead), email: lead.email, eligible: r.ok, reason: r.ok ? null : r.reason, code: r.ok ? null : r.code, firstSendAt: r.ok ? r.firstSendAt : null });
    }
    const [first] = await this.enrollments.liveSteps(this.prisma, tenantId, sequenceId);
    const sample = results.find((r) => r.eligible);
    const firstEmail = first && sample ? await this.sequences.preview(tenantId, visibility, { subject: first.subject, body: first.body_text, leadId: sample.leadId }) : null;
    return { sequence: { id: sequence.id, name: sequence.sequence_name, status: sequence.sequence_status }, eligible: results.filter((r) => r.eligible).length, leads: results, firstEmail, firstStep: first?.step_name ?? null, timeZone: calendar.timeZone };
  }

  async enroll(tenantId: string, sequenceId: string, leadIds: string[], via: EnrollVia, visibility: LeadVisibility, actor: AuthenticatedTenantUser, moveFromOutreach = false) {
    const sequence = await this.sequences.sequence(tenantId, sequenceId);
    const leads = await this.visible(tenantId, leadIds, visibility);
    const calendar = await this.enrollments.calendar(tenantId);
    const enrolled: { leadId: string; firstSendAt: Date }[] = [];
    const skipped: { leadId: string; company: string; reason: string }[] = [];
    for (const lead of leads) {
      const r = await this.enrollments.enroll(tenantId, sequenceId, lead.id, via, { memberId: actor.tenantMemberId, calendar, moveFromOutreach });
      if (r.ok) enrolled.push({ leadId: lead.id, firstSendAt: r.firstSendAt });
      else skipped.push({ leadId: lead.id, company: lead.company_name, reason: r.reason });
    }
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: via === 'BULK' ? 'EMAIL_SEQUENCE_BULK_ENROLLED' : 'EMAIL_SEQUENCE_ENROLLED',
      entityType: 'EMAIL_SEQUENCE', entityId: sequenceId, metadata: { sequence: sequence.sequence_name, enrolled: enrolled.map((e) => e.leadId), skipped: skipped.length, moved_from_outreach: moveFromOutreach },
    });
    return { enrolled: enrolled.length, skipped, firstSendAt: enrolled[0]?.firstSendAt ?? null };
  }

  /** Stops a lead's enrollment by hand; with moveToOutreach, the lead then joins Client Outreach. */
  async stop(tenantId: string, enrollmentId: string, visibility: LeadVisibility, actor: AuthenticatedTenantUser, note?: string, moveToOutreach = false) {
    const enrollment = await this.enrollment(tenantId, enrollmentId, visibility);
    if (enrollment.enrollment_status !== 'ACTIVE') throw new ConflictException('This enrollment has already ended.');
    await this.prisma.$transaction((tx) => this.enrollments.stop(tx, tenantId, enrollment.id, moveToOutreach ? 'MOVED_TO_OUTREACH' : 'MANUAL', note?.trim() || null, actor.tenantMemberId));
    if (moveToOutreach) await this.crm.executeCadenceAction(tenantId, visibility, { action: 'ENROLL', leadId: enrollment.lead_id }, actor.tenantMemberId);
    await this.audit.log({
      tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: moveToOutreach ? 'EMAIL_SEQUENCE_MOVED_TO_OUTREACH' : 'EMAIL_SEQUENCE_ENROLLMENT_STOPPED',
      entityType: 'EMAIL_SEQUENCE_ENROLLMENT', entityId: enrollment.id, metadata: { lead_id: enrollment.lead_id, sequence_id: enrollment.sequence_id, before: 'ACTIVE', after: 'STOPPED', note: note?.trim() || null },
    });
    return { stopped: true, movedToOutreach: moveToOutreach };
  }

  /** A lead's sequences, past and present, and the sequences it could join. */
  async forLead(tenantId: string, leadId: string, visibility: LeadVisibility) {
    if (!UUID.test(leadId) || !(await this.prisma.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) }, select: { id: true } }))) {
      throw new NotFoundException('Lead not found.');
    }
    const [rows, available] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequence_enrollments.findMany({
        where: { tenant_id: tenantId, lead_id: leadId }, orderBy: { created_at: 'desc' }, take: 20,
        include: {
          rndtechnosoft_email_sequences: { select: { id: true, sequence_name: true, sequence_status: true } },
          rndtechnosoft_email_sequence_sends: { orderBy: { created_at: 'desc' }, select: { id: true, send_status: true, scheduled_at: true, sent_at: true, subject: true, failure_reason: true, rndtechnosoft_email_sequence_steps: { select: { step_name: true } } } },
        },
      }),
      this.prisma.rndtechnosoft_email_sequences.findMany({ where: { tenant_id: tenantId, sequence_status: { in: ['ACTIVE', 'PAUSED'] } }, select: { id: true, sequence_name: true, sequence_status: true }, orderBy: { sequence_name: 'asc' } }),
    ]);
    return {
      enrollments: rows.map((e) => ({
        id: e.id, status: e.enrollment_status, sequence: { id: e.rndtechnosoft_email_sequences.id, name: e.rndtechnosoft_email_sequences.sequence_name, status: e.rndtechnosoft_email_sequences.sequence_status },
        enrolledAt: e.created_at, stopReason: e.stop_reason ? STOP_REASONS[e.stop_reason] ?? e.stop_reason : null, stoppedAt: e.stopped_at, completedAt: e.completed_at,
        emails: e.rndtechnosoft_email_sequence_sends.map((s) => ({ id: s.id, status: s.send_status, step: s.rndtechnosoft_email_sequence_steps.step_name, scheduledAt: s.scheduled_at, sentAt: s.sent_at, subject: s.subject, problem: s.failure_reason })),
      })),
      available: available.map((s) => ({ id: s.id, name: s.sequence_name, status: s.sequence_status })),
    };
  }

  /** The sending log: every sequence email, newest first. Bodies only for those who may read them. */
  async sends(tenantId: string, visibility: LeadVisibility, query: SendsQueryDto, withBodies: boolean) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const status = query.status;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const and: Prisma.rndtechnosoft_email_sequence_sendsWhereInput[] = [];
    if (status === 'ATTENTION') {
      and.push({ OR: [{ send_status: { in: ['FAILED', 'UNCERTAIN'] } }, { send_status: 'SCHEDULED', failure_code: 'SENDER_UNAVAILABLE' }] }, { rndtechnosoft_email_sequence_enrollments: { enrollment_status: 'ACTIVE' } });
    } else if (status === 'REPLIED') {
      and.push({ replied_at: { not: null } });
    } else if (status) {
      and.push({ send_status: status });
    }
    // Sent emails by when they were sent; the rest by when they are (or were) due.
    if (from || to) and.push({ OR: [{ sent_at: { gte: from, lt: to } }, { sent_at: null, scheduled_at: { gte: from, lt: to } }] });
    const where: Prisma.rndtechnosoft_email_sequence_sendsWhereInput = {
      tenant_id: tenantId,
      ...(query.sequenceId ? { sequence_id: query.sequenceId } : {}),
      rndtechnosoft_crm_leads: visibleLeads(visibility),
      AND: and,
    };
    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_email_sequence_sends.findMany({
        where, orderBy: [{ updated_at: 'desc' }], skip: (page - 1) * limit, take: limit,
        include: {
          rndtechnosoft_crm_leads: LEAD,
          rndtechnosoft_email_sequences: { select: { id: true, sequence_name: true } },
          rndtechnosoft_email_sequence_steps: { select: { step_name: true, step_order: true } },
          rndtechnosoft_email_sequence_events: { select: { event_kind: true, from_email: true, subject: true, received_at: true, bounce_kind: true, detail: true }, orderBy: { received_at: 'asc' } },
        },
      }),
      this.prisma.rndtechnosoft_email_sequence_sends.count({ where }),
    ]);
    return {
      items: rows.map((s) => ({
        id: s.id, status: s.send_status, scheduledAt: s.scheduled_at, sentAt: s.sent_at, failedAt: s.failed_at, cancelledAt: s.cancelled_at, repliedAt: s.replied_at, bouncedAt: s.bounced_at,
        attempts: s.attempt_count, problemCode: s.failure_code, problem: s.failure_reason, cancelReason: s.cancel_reason, bounceKind: s.bounce_kind,
        sequence: { id: s.rndtechnosoft_email_sequences.id, name: s.rndtechnosoft_email_sequences.sequence_name }, step: s.rndtechnosoft_email_sequence_steps.step_name,
        lead: { id: s.rndtechnosoft_crm_leads.id, company: s.rndtechnosoft_crm_leads.company_name, name: leadName(s.rndtechnosoft_crm_leads) },
        recipient: s.recipient_email, sender: s.sender_email, senderKind: s.sender_kind, subject: s.subject, messageId: s.message_id,
        body: withBodies ? s.body_text : null,
        events: s.rndtechnosoft_email_sequence_events.map((e) => ({ kind: e.event_kind, from: e.from_email, subject: e.subject, at: e.received_at, bounceKind: e.bounce_kind, detail: e.detail })),
      })),
      page, limit, total,
    };
  }

  /**
   * Tries a failed email again (or one that may not have gone, when the person
   * decided it didn't), at the next sending window. The lead must still be in
   * the sequence. A new Message-ID and unsubscribe link are made at sending.
   */
  async retry(tenantId: string, sendId: string, visibility: LeadVisibility, actor: AuthenticatedTenantUser) {
    const send = await this.send(tenantId, sendId, visibility);
    if (!['FAILED', 'UNCERTAIN'].includes(send.send_status)) throw new ConflictException('Only a failed email, or one that may not have been sent, can be sent again.');
    if (send.rndtechnosoft_email_sequence_enrollments.enrollment_status !== 'ACTIVE') throw new ConflictException('The lead is no longer in the sequence.');
    const calendar = await this.enrollments.calendar(tenantId);
    const at = earliestSendTime(new Date(), scheduleOf(send.rndtechnosoft_email_sequences, calendar)) ?? new Date();
    await this.prisma.rndtechnosoft_email_sequence_sends.update({
      where: { id: send.id },
      data: { send_status: 'SCHEDULED', scheduled_at: at, attempt_count: 0, claimed_at: null, failure_code: null, failure_reason: null, failed_at: null, message_id: null, unsubscribe_token_hash: null, updated_at: new Date() },
    });
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'EMAIL_SEQUENCE_SEND_RETRIED', entityType: 'EMAIL_SEQUENCE_SEND', entityId: send.id, metadata: { before: send.send_status, after: 'SCHEDULED', scheduled_at: at.toISOString() } });
    return { scheduledAt: at };
  }

  /** Every failed email of a sequence tried again, after its sender or the leads were fixed. */
  async retryFailed(tenantId: string, sequenceId: string, visibility: LeadVisibility, actor: AuthenticatedTenantUser) {
    const failed = await this.prisma.rndtechnosoft_email_sequence_sends.findMany({
      where: { tenant_id: tenantId, sequence_id: sequenceId, send_status: 'FAILED', rndtechnosoft_email_sequence_enrollments: { enrollment_status: 'ACTIVE' }, rndtechnosoft_crm_leads: visibleLeads(visibility) },
      select: { id: true }, take: 500,
    });
    for (const f of failed) await this.retry(tenantId, f.id, visibility, actor);
    return { retried: failed.length };
  }

  /** An email that may not have gone, confirmed sent by a person (they found it in the Sent folder): the lead moves on. */
  async markSent(tenantId: string, sendId: string, visibility: LeadVisibility, actor: AuthenticatedTenantUser) {
    const send = await this.send(tenantId, sendId, visibility);
    if (send.send_status !== 'UNCERTAIN' || !send.message_id) throw new ConflictException('Only an email that may not have been sent can be marked as sent.');
    const calendar = await this.enrollments.calendar(tenantId);
    await this.sender.recordSent(send, calendar, send.claimed_at ?? send.updated_at, null, actor.tenantMemberId);
    await this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode: 'EMAIL_SEQUENCE_SEND_MARKED_SENT', entityType: 'EMAIL_SEQUENCE_SEND', entityId: send.id, metadata: { before: 'UNCERTAIN', after: 'SENT' } });
    return { marked: true };
  }

  private async visible(tenantId: string, leadIds: string[], visibility: LeadVisibility) {
    const leads = await this.prisma.rndtechnosoft_crm_leads.findMany({ where: { tenant_id: tenantId, id: { in: leadIds }, ...visibleLeads(visibility) }, select: { id: true, company_name: true, first_name: true, last_name: true, email: true } });
    if (leads.length !== new Set(leadIds).size) throw new NotFoundException('Some of the chosen leads were not found.');
    return leadIds.map((id) => leads.find((l) => l.id === id)).filter((l): l is (typeof leads)[number] => Boolean(l));
  }

  private async enrollment(tenantId: string, id: string, visibility: LeadVisibility) {
    if (!UUID.test(id)) throw new NotFoundException('Enrollment not found.');
    const row = await this.prisma.rndtechnosoft_email_sequence_enrollments.findFirst({ where: { tenant_id: tenantId, id, rndtechnosoft_crm_leads: visibleLeads(visibility) } });
    if (!row) throw new NotFoundException('Enrollment not found.');
    return row;
  }

  private async send(tenantId: string, id: string, visibility: LeadVisibility) {
    if (!UUID.test(id)) throw new NotFoundException('Email not found.');
    const row = await this.prisma.rndtechnosoft_email_sequence_sends.findFirst({
      where: { tenant_id: tenantId, id, rndtechnosoft_crm_leads: visibleLeads(visibility) },
      include: { rndtechnosoft_email_sequences: true, rndtechnosoft_email_sequence_enrollments: true, rndtechnosoft_email_sequence_steps: true },
    });
    if (!row) throw new NotFoundException('Email not found.');
    return row;
  }
}
