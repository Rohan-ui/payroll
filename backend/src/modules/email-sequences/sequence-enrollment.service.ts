import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { OutreachCalendar } from '@/modules/crm/crm-outreach-schedule';
import { loadOutreachCalendar } from '@/modules/crm/outreach-calendar';
import { Db, EMAIL_PATTERN, inClientOutreach, leadActivity, normalizeEmail, outreachStatus, scheduleOf, STOP_REASONS } from './sequence-context';
import { DelayUnit, stepDueAt } from './sequence-schedule';

export type EnrollVia = 'MANUAL' | 'BULK' | 'RULE';
export type EnrollResult = { ok: true; enrollmentId: string; firstSendAt: Date } | { ok: false; reason: string; code: string };

/** Rolls back a dry run once every check has passed. */
class DryRun extends Error {
  constructor(readonly firstSendAt: Date) {
    super('dry run');
  }
}

type SequenceRow = Prisma.rndtechnosoft_email_sequencesGetPayload<object>;

/**
 * Who is in which sequence, and when their next email goes. Every rule that
 * keeps a lead from getting conflicting or unwanted email is checked here,
 * inside one transaction holding the lead's row lock, so two enrollments (or
 * an enrollment and a Client Outreach enrollment) can't race past each other:
 *
 * - the sequence is active (or paused, for a person adding leads by hand);
 * - the lead is open, has a valid email address that isn't on the do-not-email list;
 * - the lead isn't in another sequence (also a partial unique index);
 * - the lead isn't in Client Outreach, unless the person explicitly moves it.
 */
@Injectable()
export class SequenceEnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  calendar(tenantId: string): Promise<OutreachCalendar> {
    return loadOutreachCalendar(this.prisma, tenantId);
  }

  /** The sequence's steps that still send, in order. */
  liveSteps(db: Db | PrismaService, tenantId: string, sequenceId: string) {
    return db.rndtechnosoft_email_sequence_steps.findMany({
      where: { tenant_id: tenantId, sequence_id: sequenceId, removed_at: null, is_enabled: true },
      orderBy: { step_order: 'asc' },
    });
  }

  async enroll(
    tenantId: string,
    sequenceId: string,
    leadId: string,
    via: EnrollVia,
    by: { memberId: string | null; ruleId?: string | null; moveFromOutreach?: boolean; calendar?: OutreachCalendar; dryRun?: boolean },
  ): Promise<EnrollResult> {
    const calendar = by.calendar ?? (await this.calendar(tenantId));
    const refuse = (code: string, reason: string): EnrollResult => ({ ok: false, code, reason });
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${leadId}::uuid FOR UPDATE`;
        const [sequence, lead] = await Promise.all([
          tx.rndtechnosoft_email_sequences.findFirst({ where: { tenant_id: tenantId, id: sequenceId } }),
          tx.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: leadId }, select: { id: true, email: true, is_won: true, is_lost: true, company_name: true, custom_attributes: true, stage_id: true } }),
        ]);
        if (!sequence) return refuse('SEQUENCE_NOT_FOUND', 'Sequence not found.');
        if (!lead) return refuse('LEAD_NOT_FOUND', 'Lead not found.');
        const usable = sequence.sequence_status === 'ACTIVE' || (sequence.sequence_status === 'PAUSED' && via !== 'RULE');
        if (!usable) return refuse('SEQUENCE_NOT_ACTIVE', sequence.sequence_status === 'DRAFT' ? 'Activate the sequence before adding leads.' : `The sequence is ${sequence.sequence_status.toLowerCase()}.`);
        if (lead.is_won || lead.is_lost) return refuse('LEAD_CLOSED', `${lead.company_name} is already marked ${lead.is_won ? 'won' : 'lost'}.`);
        if (await tx.rndtechnosoft_email_sequence_stop_stages.findFirst({ where: { tenant_id: tenantId, sequence_id: sequenceId, stage_id: lead.stage_id }, select: { stage_id: true } })) {
          return refuse('STOP_STAGE', `${lead.company_name} is in a stage that ends this sequence.`);
        }
        const email = normalizeEmail(lead.email);
        if (!EMAIL_PATTERN.test(email)) return refuse('NO_EMAIL', `${lead.company_name} has no valid email address.`);
        if (await tx.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: tenantId, email }, select: { id: true } })) {
          return refuse('SUPPRESSED', `${email} is on the do-not-email list.`);
        }
        const current = await tx.rndtechnosoft_email_sequence_enrollments.findFirst({
          where: { tenant_id: tenantId, lead_id: leadId, enrollment_status: 'ACTIVE' },
          select: { rndtechnosoft_email_sequences: { select: { sequence_name: true } } },
        });
        if (current) return refuse('ALREADY_ENROLLED', `${lead.company_name} is already in the sequence “${current.rndtechnosoft_email_sequences.sequence_name}”.`);
        if (inClientOutreach(lead.custom_attributes)) {
          if (!by.moveFromOutreach || via === 'RULE') {
            return refuse('IN_CLIENT_OUTREACH', `${lead.company_name} is in Client Outreach. Stop its outreach first, or choose to move it to this sequence.`);
          }
          await this.endOutreach(tx, tenantId, lead.id, lead.custom_attributes, sequence.sequence_name, by.memberId);
        }
        const [first] = await this.liveSteps(tx, tenantId, sequenceId);
        if (!first) return refuse('NO_STEPS', 'The sequence has no email to send.');
        const now = new Date();
        const firstSendAt = stepDueAt(now, first.delay_amount, first.delay_unit as DelayUnit, calendar, scheduleOf(sequence, calendar));
        if (!firstSendAt) return refuse('NO_SENDING_DAYS', 'The sequence has no day it may send on.');
        // A preview: every check made, nothing kept.
        if (by.dryRun) throw new DryRun(firstSendAt);

        const enrollmentId = randomUUID();
        await tx.rndtechnosoft_email_sequence_enrollments.create({
          data: {
            id: enrollmentId, tenant_id: tenantId, sequence_id: sequenceId, lead_id: leadId, enrollment_status: 'ACTIVE', recipient_email: email,
            enrolled_via: via, rule_id: by.ruleId ?? null, enrolled_by_tenant_member_id: by.memberId,
          },
        });
        await this.scheduleStep(tx, sequence, enrollmentId, leadId, email, first.id, firstSendAt);
        await leadActivity(tx, tenantId, leadId, 'EMAIL_SEQUENCE', `Added to drip sequence: ${sequence.sequence_name}`,
          `${via === 'RULE' ? 'Added automatically by an enrollment rule.' : via === 'BULK' ? 'Added with other leads.' : 'Added by a team member.'} First email: ${first.step_name}.`, by.memberId, now);
        return { ok: true as const, enrollmentId, firstSendAt };
      });
    } catch (error) {
      if (error instanceof DryRun) return { ok: true, enrollmentId: '', firstSendAt: error.firstSendAt };
      // Two enrollments of the same lead at once: the partial unique index lets only one through.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return refuse('ALREADY_ENROLLED', 'The lead is already in a sequence.');
      throw error;
    }
  }

  /** A step's email, scheduled. One per enrollment and step: scheduling it twice does nothing. */
  async scheduleStep(tx: Db, sequence: Pick<SequenceRow, 'tenant_id' | 'id' | 'definition_version'>, enrollmentId: string, leadId: string, email: string, stepId: string, at: Date) {
    await tx.rndtechnosoft_email_sequence_sends.createMany({
      data: [{
        id: randomUUID(), tenant_id: sequence.tenant_id, sequence_id: sequence.id, step_id: stepId, enrollment_id: enrollmentId, lead_id: leadId,
        send_status: 'SCHEDULED', scheduled_at: at, definition_version: sequence.definition_version, recipient_email: email,
      }],
      skipDuplicates: true,
    });
  }

  /**
   * After a step went out (or was skipped): the next live step, scheduled its
   * delay after `from`; or, with none left, the enrollment completes.
   */
  async advance(tx: Db, tenantId: string, enrollmentId: string, afterStepOrder: number, from: Date, calendar: OutreachCalendar) {
    const enrollment = await tx.rndtechnosoft_email_sequence_enrollments.findFirst({
      where: { tenant_id: tenantId, id: enrollmentId }, include: { rndtechnosoft_email_sequences: true },
    });
    if (!enrollment || enrollment.enrollment_status !== 'ACTIVE') return;
    const sequence = enrollment.rndtechnosoft_email_sequences;
    const next = (await this.liveSteps(tx, tenantId, sequence.id)).find((s) => s.step_order > afterStepOrder);
    const at = next ? stepDueAt(from, next.delay_amount, next.delay_unit as DelayUnit, calendar, scheduleOf(sequence, calendar)) : null;
    if (next && at) {
      const lead = await tx.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: enrollment.lead_id }, select: { email: true } });
      await this.scheduleStep(tx, sequence, enrollmentId, enrollment.lead_id, normalizeEmail(lead?.email ?? enrollment.recipient_email), next.id, at);
      return;
    }
    await tx.rndtechnosoft_email_sequence_enrollments.update({ where: { id: enrollmentId }, data: { enrollment_status: 'COMPLETED', completed_at: new Date(), updated_at: new Date() } });
    await leadActivity(tx, tenantId, enrollment.lead_id, 'EMAIL_SEQUENCE', `Finished drip sequence: ${sequence.sequence_name}`, 'Every email of the sequence was sent.');
  }

  /**
   * Ends an active enrollment: its scheduled emails are cancelled (an email
   * already sent stays on record), with the reason on the enrollment and the
   * lead's timeline. Does nothing to an enrollment that already ended.
   */
  async stop(tx: Db, tenantId: string, enrollmentId: string, reason: keyof typeof STOP_REASONS, detail: string | null, memberId: string | null) {
    const now = new Date();
    const ended = await tx.rndtechnosoft_email_sequence_enrollments.updateMany({
      where: { tenant_id: tenantId, id: enrollmentId, enrollment_status: 'ACTIVE' },
      data: { enrollment_status: 'STOPPED', stop_reason: reason, stop_detail: detail?.slice(0, 500) ?? null, stopped_at: now, stopped_by_tenant_member_id: memberId, updated_at: now },
    });
    if (!ended.count) return false;
    await tx.rndtechnosoft_email_sequence_sends.updateMany({
      where: { tenant_id: tenantId, enrollment_id: enrollmentId, send_status: 'SCHEDULED' },
      data: { send_status: 'CANCELLED', cancel_reason: reason, cancelled_at: now, updated_at: now },
    });
    const enrollment = await tx.rndtechnosoft_email_sequence_enrollments.findFirstOrThrow({
      where: { id: enrollmentId }, select: { lead_id: true, rndtechnosoft_email_sequences: { select: { sequence_name: true } } },
    });
    await leadActivity(tx, tenantId, enrollment.lead_id, 'EMAIL_SEQUENCE', `Drip sequence stopped: ${enrollment.rndtechnosoft_email_sequences.sequence_name}`,
      [STOP_REASONS[reason], detail].filter(Boolean).join('. '), memberId, now);
    return true;
  }

  /** Stops every active enrollment sending to an address (it unsubscribed, bounced or was listed). */
  async stopByEmail(tx: Db, tenantId: string, email: string, reason: keyof typeof STOP_REASONS) {
    const active = await tx.rndtechnosoft_email_sequence_enrollments.findMany({
      where: { tenant_id: tenantId, enrollment_status: 'ACTIVE', OR: [{ recipient_email: normalizeEmail(email) }, { rndtechnosoft_crm_leads: { email: { equals: normalizeEmail(email), mode: 'insensitive' } } }] },
      select: { id: true },
    });
    for (const e of active) await this.stop(tx, tenantId, e.id, reason, null, null);
    return active.length;
  }

  /** Ends a lead's Client Outreach so it can move to a sequence: kept in its history, never deleted. */
  private async endOutreach(tx: Db, tenantId: string, leadId: string, customAttributes: unknown, sequenceName: string, memberId: string | null) {
    const attributes = (customAttributes as Record<string, unknown>) ?? {};
    const cadence = (attributes.cadence as Record<string, unknown>) ?? {};
    const now = new Date();
    await tx.rndtechnosoft_crm_leads.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: leadId } },
      data: { custom_attributes: { ...attributes, cadence: { ...cadence, status: 'COMPLETED', nextDueAt: '', endedReason: 'MOVED_TO_DRIP_SEQUENCE', endedAt: now.toISOString() } } as Prisma.InputJsonObject },
    });
    await tx.rndtechnosoft_crm_audit_logs.create({
      data: {
        id: randomUUID(), tenant_id: tenantId, action_type: 'CADENCE_MOVED_TO_SEQUENCE', entity_type: 'LEAD', entity_id: leadId, actor_id: memberId,
        changes_diff: { cadence_status: { before: outreachStatus(customAttributes), after: 'COMPLETED' }, sequence: sequenceName } as Prisma.InputJsonObject, created_at: now,
      },
    });
    await leadActivity(tx, tenantId, leadId, 'NOTE', 'Moved from Client Outreach to a drip sequence', `Client Outreach ended so the lead could join “${sequenceName}”.`, memberId, now);
  }
}
