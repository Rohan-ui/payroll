import {
  BadRequestException, ConflictException, Injectable, InternalServerErrorException, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { MailSendError, MailSenderService } from '@/modules/mail/mail-sender.service';
import { CrmService } from './crm.service';
import { CadenceChannelAction, CadenceState, interpolateText, nextCadenceStep } from './crm-cadence.helper';
import { SendOutreachEmailDto } from './dto/outreach-email.dto';
import { LeadVisibility, visibleLeads } from './lead-visibility';

export const ORGANIZATION_EMAIL_MISSING =
  "Organization email is not configured. Please contact your workspace administrator to configure the organization's email settings.";
export const ORGANIZATION_EMAIL_FAILED =
  "The organization's email service could not send this message. Please check the organization email configuration.";

/** A send still "in flight" after this long is treated as interrupted, so it can be tried again. */
const SENDING_TIMEOUT_MS = 5 * 60 * 1000;

/** Text kept in the audit log for an edited message: enough to see the change, never unbounded. */
const clip = (text: string) => (text.length > 4000 ? `${text.slice(0, 4000)}…` : text);

type Tx = Prisma.TransactionClient;
type Cadence = CadenceState & { channelActions?: NonNullable<CadenceState['channelActions']> };

/**
 * Client Outreach email. Whoever executes the touchpoint, the email always
 * goes out from the workspace's organization account (Organization &
 * Settings), never from the member's own Gmail or SMTP account, whatever the
 * workspace's personal-account policy; the member is recorded as the one who
 * executed it.
 *
 * The touchpoint's email state lives on the lead's cadence
 * (`channelActions[day].EMAIL`), separate from the day's completion: SENDING
 * while the email is in flight (claimed under a row lock, so a second click
 * or a second member cannot send it twice), then SENT only once the mail
 * server accepted it, or FAILED. The state, the lead activity and the audit
 * record are written together. Every attempt is its own activity and audit
 * record; sending a sent email again needs an explicit resend.
 */
@Injectable()
export class CrmOutreachEmailService {
  private readonly logger = new Logger(CrmOutreachEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly mailSender: MailSenderService,
  ) {}

  /** The organization sender the composer shows: name and addresses only, never account details. */
  async sender(tenantId: string) {
    const sender = await this.mailSender.organization(tenantId);
    if (sender.kind !== 'ORGANIZATION') return { configured: false as const, name: null, email: null, replyTo: null };
    return { configured: true as const, name: sender.name, email: sender.email, replyTo: sender.replyTo };
  }

  /**
   * The lead and its current email touchpoint, refusing anything that can't be
   * emailed now. With `lock`, the lead's row is locked until the transaction ends.
   */
  private async target(db: Tx, tenantId: string, visibility: LeadVisibility, leadId: string, lock: boolean) {
    if (lock) {
      await db.$queryRaw`SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${leadId}::uuid FOR UPDATE`;
    }
    const lead = await db.rndtechnosoft_crm_leads.findFirst({
      where: { tenant_id: tenantId, id: leadId, ...visibleLeads(visibility) },
      include: { rndtechnosoft_tenant_members: { select: { rndtechnosoft_users: { select: { display_name: true } } } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    const attributes = (lead.custom_attributes as Record<string, unknown> | null) ?? {};
    const cadence = attributes.cadence as Cadence | undefined;
    if (!cadence || cadence.status !== 'ACTIVE' || cadence.convertedToOpportunity) {
      throw new ConflictException(`${lead.company_name} is not active in Client Outreach, so there is no touchpoint to email.`);
    }
    const steps = await this.crm.getCadenceSteps(lead.tenant_id);
    const step = nextCadenceStep(steps, cadence);
    if (!step) throw new ConflictException(`${lead.company_name} has finished every touchpoint of the cadence.`);
    if (!step.channels.includes('EMAIL')) throw new BadRequestException(`Day ${step.dayNumber} (${step.title}) has no email touchpoint.`);
    return { lead, attributes, cadence, step, stepIndex: steps.indexOf(step), day: String(step.dayNumber) };
  }

  /** Saves one channel action of a touchpoint on the lead's cadence, keeping everything else on it. */
  private async saveAction(db: Tx, tenantId: string, target: { lead: { id: string }; attributes: Record<string, unknown>; cadence: Cadence; day: string }, action: CadenceChannelAction | undefined) {
    const forDay = { ...(target.cadence.channelActions?.[target.day] ?? {}) };
    if (action) forDay.EMAIL = action;
    else delete forDay.EMAIL;
    const cadence: Cadence = { ...target.cadence, channelActions: { ...(target.cadence.channelActions ?? {}), [target.day]: forDay } };
    await db.rndtechnosoft_crm_leads.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: target.lead.id } },
      data: { custom_attributes: { ...target.attributes, cadence } as unknown as Prisma.InputJsonObject },
    });
    return forDay;
  }

  async send(tenantId: string, actorMemberId: string, visibility: LeadVisibility, dto: SendOutreachEmailDto) {
    const subject = dto.subject.trim();
    const body = dto.body.replace(/\s+$/, '');
    const executor = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, id: actorMemberId },
      select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const executedBy = { memberId: actorMemberId, name: executor?.rndtechnosoft_users.display_name || executor?.rndtechnosoft_users.email || 'A team member' };
    const sender = await this.mailSender.organization(tenantId);

    // 1. Claim the touchpoint's email: refused if already sent (without an explicit resend) or being sent.
    const claim = await this.prisma.$transaction(async (tx) => {
      const target = await this.target(tx, tenantId, visibility, dto.leadId, true);
      const previous = target.cadence.channelActions?.[target.day]?.EMAIL;
      const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '');
      if (previous?.status === 'SENT' && !dto.resend) {
        throw new ConflictException(`The Day ${target.day} email was already sent to ${previous.to} on ${when(previous.sentAt)} by ${previous.executedBy.name}. Use Resend to send it again.`);
      }
      if (previous?.status === 'SENDING' && Date.now() - Date.parse(previous.startedAt) < SENDING_TIMEOUT_MS) {
        throw new ConflictException(`The Day ${target.day} email is being sent by ${previous.executedBy.name}. Wait a moment, then reload.`);
      }
      const attempt = (await tx.rndtechnosoft_crm_audit_logs.count({
        where: {
          tenant_id: tenantId,
          entity_id: target.lead.id,
          action_type: { in: ['OUTREACH_EMAIL_SENT', 'OUTREACH_EMAIL_FAILED'] },
          changes_diff: { path: ['touchpoint', 'step_index'], equals: target.stepIndex },
        },
      })) + 1;
      if (sender.kind === 'ORGANIZATION') {
        await this.saveAction(tx, tenantId, target, { status: 'SENDING', attempt, executedBy, startedAt: new Date().toISOString() });
      }
      return { target, previous, attempt };
    });
    const { target, previous, attempt } = claim;
    const { lead, cadence, step, stepIndex, day } = target;

    // Edits are judged against the touchpoint's template as the composer fills it in.
    const vars = {
      firstName: lead.first_name ?? undefined,
      lastName: lead.last_name ?? undefined,
      companyName: lead.company_name,
      designation: lead.designation ?? undefined,
      industry: cadence.industry || lead.industry || 'general',
      assigneeName: lead.rndtechnosoft_tenant_members?.rndtechnosoft_users.display_name ?? undefined,
    };
    const edited: Record<string, { before: string; after: string }> = {};
    if (step.templates.email) {
      const templateSubject = interpolateText(step.templates.email.subject, vars);
      const templateBody = interpolateText(step.templates.email.body, vars).replace(/\s+$/, '');
      if (templateSubject !== subject) edited.subject = { before: templateSubject, after: subject };
      if (templateBody !== body) edited.body = { before: clip(templateBody), after: clip(body) };
    }
    const touchpointLabel = `Day ${step.dayNumber} — ${step.title}`;
    const context = {
      channel: 'EMAIL',
      touchpoint: { day: step.dayNumber, title: step.title, step_index: stepIndex },
      funnel: cadence.funnelName ?? null,
      recipient: lead.email,
      subject,
      executed_by: { member_id: actorMemberId, name: executedBy.name },
      attempt,
      ...(dto.resend ? { resend: true } : {}),
      ...(Object.keys(edited).length ? { edited } : {}),
    };

    // 2. Send through the organization's account only.
    if (sender.kind !== 'ORGANIZATION') {
      await this.recordFailure(tenantId, dto.leadId, visibility, actorMemberId, executedBy, attempt, previous, { ...context, sender_email: null, failure: 'ORGANIZATION_EMAIL_NOT_CONFIGURED' }, subject, touchpointLabel);
      throw new ConflictException(ORGANIZATION_EMAIL_MISSING);
    }
    let messageId: string | null;
    try {
      ({ messageId } = await this.mailSender.sendSmtp(sender, { to: lead.email, subject, text: body }));
    } catch (error) {
      // The SMTP reason is already free of account details; it is kept for administrators, not shown to the sender.
      const failure = error instanceof MailSendError ? error.safeReason : 'UNEXPECTED_ERROR';
      if (!(error instanceof MailSendError)) this.logger.error(`Outreach email failed: tenant=${tenantId} lead=${lead.id} error=${error instanceof Error ? error.name : 'unknown'}`);
      await this.recordFailure(tenantId, dto.leadId, visibility, actorMemberId, executedBy, attempt, previous, { ...context, sender_email: sender.email, failure }, subject, touchpointLabel);
      throw new ServiceUnavailableException(ORGANIZATION_EMAIL_FAILED);
    }

    // 3. Accepted by the mail server: the email state, the activity and the audit record, together.
    const sentAt = new Date();
    const activityId = randomUUID();
    const from = { name: sender.name, email: sender.email };
    let dayActions: Partial<Record<string, CadenceChannelAction>>;
    try {
      dayActions = await this.prisma.$transaction(async (tx) => {
        const fresh = await this.lockedState(tx, tenantId, lead.id, day);
        await tx.rndtechnosoft_crm_lead_activities.create({
          data: {
            id: activityId,
            tenant_id: tenantId,
            lead_id: lead.id,
            performed_by_tenant_member_id: actorMemberId,
            activity_type: 'EMAIL',
            title: `Email sent: ${subject}`.slice(0, 200),
            description: [
              `From: ${sender.name ? `${sender.name} <${sender.email}>` : sender.email}`,
              `To: ${lead.email}`,
              `Touchpoint: ${touchpointLabel}`,
              `Executed by: ${executedBy.name}`,
              `Attempt: ${attempt}`,
            ].join('\n'),
            created_at: sentAt,
          },
        });
        await tx.rndtechnosoft_crm_audit_logs.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            action_type: 'OUTREACH_EMAIL_SENT',
            entity_type: 'LEAD',
            entity_id: lead.id,
            actor_id: actorMemberId,
            actor_name: executedBy.name.slice(0, 120),
            changes_diff: {
              ...context, sender_email: sender.email, sender_name: sender.name, reply_to: sender.replyTo, message_id: messageId,
              status: 'SENT', sent_at: sentAt.toISOString(), activity_id: activityId,
            } as Prisma.InputJsonObject,
            created_at: sentAt,
          },
        });
        await tx.rndtechnosoft_crm_leads.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: lead.id } },
          data: { last_contacted_at: sentAt, touchpoints_count: { increment: 1 } },
        });
        return this.saveAction(tx, tenantId, fresh, {
          status: 'SENT', attempt, executedBy, startedAt: fresh.cadence.channelActions?.[day]?.EMAIL?.startedAt ?? sentAt.toISOString(),
          sentAt: sentAt.toISOString(), from, to: lead.email, subject, messageId, activityId,
        });
      });
    } catch (error) {
      // The email went out; only recording it failed. Say so, so nobody sends it again.
      this.logger.error(`Outreach email sent but not recorded: tenant=${tenantId} lead=${lead.id} error=${error instanceof Error ? error.name : 'unknown'}`);
      throw new InternalServerErrorException(`The email was sent to ${lead.email}, but recording it failed. Do not send it again; reload the page, and contact support if it does not show as sent.`);
    }

    // Only now, with the email sent, may the day move on (when asked).
    let touchpointCompleted = false;
    if (dto.completeTouchpoint) {
      await this.crm.executeCadenceAction(tenantId, visibility, {
        action: 'COMPLETE_STEP', leadId: lead.id, channel: 'EMAIL', notes: `Email "${subject}" sent from ${sender.email} to ${lead.email}`,
      }, actorMemberId);
      touchpointCompleted = true;
    }

    const email = { status: 'SENT' as const, sentAt: sentAt.toISOString(), executedBy, from, to: lead.email, subject, messageId, attempt, activityId };
    return {
      sent: true,
      email,
      touchpoint: { day: step.dayNumber, title: step.title, channel: 'EMAIL', status: touchpointCompleted ? 'COMPLETED' : 'IN_PROGRESS' },
      channelActions: dayActions,
      from,
      to: lead.email,
      attempt,
      touchpointCompleted,
      message: `Email sent to ${lead.email} from ${sender.email}${touchpointCompleted ? `; Day ${step.dayNumber} is complete` : ''}`,
    };
  }

  /** The lead's cadence as it is now, with the row locked; its touchpoint state may have moved since the claim. */
  private async lockedState(tx: Tx, tenantId: string, leadId: string, day: string) {
    await tx.$queryRaw`SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${leadId}::uuid FOR UPDATE`;
    const lead = await tx.rndtechnosoft_crm_leads.findFirstOrThrow({ where: { tenant_id: tenantId, id: leadId }, select: { id: true, custom_attributes: true } });
    const attributes = (lead.custom_attributes as Record<string, unknown> | null) ?? {};
    return { lead, attributes, cadence: (attributes.cadence ?? {}) as Cadence, day };
  }

  /**
   * A failed attempt: kept on the lead's activity and in the audit log, and the
   * touchpoint's email is not sent. A failed resend leaves the earlier send as it was.
   */
  private async recordFailure(
    tenantId: string, leadId: string, _visibility: LeadVisibility, actorMemberId: string, executedBy: { memberId: string; name: string },
    attempt: number, previous: CadenceChannelAction | undefined, details: Record<string, unknown>, subject: string, touchpointLabel: string,
  ) {
    const day = String((details.touchpoint as { day: number }).day);
    const failedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const fresh = await this.lockedState(tx, tenantId, leadId, day);
      await tx.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          lead_id: leadId,
          performed_by_tenant_member_id: actorMemberId,
          activity_type: 'EMAIL_FAILED',
          title: `Email not sent: ${subject}`.slice(0, 200),
          description: `Touchpoint: ${touchpointLabel}\nThe organization email could not send it; it has not been marked as sent.`,
          created_at: failedAt,
        },
      });
      await tx.rndtechnosoft_crm_audit_logs.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          action_type: 'OUTREACH_EMAIL_FAILED',
          entity_type: 'LEAD',
          entity_id: leadId,
          actor_id: actorMemberId,
          actor_name: executedBy.name.slice(0, 120),
          changes_diff: { ...details, status: 'FAILED', failed_at: failedAt.toISOString() } as Prisma.InputJsonObject,
          created_at: failedAt,
        },
      });
      const failure = typeof details.failure === 'string' ? details.failure : 'UNEXPECTED_ERROR';
      await this.saveAction(tx, tenantId, fresh, previous?.status === 'SENT'
        ? previous
        : { status: 'FAILED', attempt, executedBy, startedAt: failedAt.toISOString(), failedAt: failedAt.toISOString(), failure });
    });
  }
}
