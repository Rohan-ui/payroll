import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { CrmService } from './crm.service';
import { CadenceChannelAction, CadenceState, channelsStillToDo, nextCadenceStep } from './crm-cadence.helper';
import { OutreachChannelActionDto } from './dto/outreach-channel.dto';
import { LeadVisibility, visibleLeads } from './lead-visibility';
import { LINKEDIN_INVALID, LINKEDIN_MISSING, normalizeLinkedInUrl, whatsAppDigits } from './outreach-channels';

type Cadence = CadenceState & { channelActions?: NonNullable<CadenceState['channelActions']> };

const LABELS = {
  WHATSAPP_OPENED: { audit: 'OUTREACH_WHATSAPP_OPENED', title: 'Opened WhatsApp' },
  LINKEDIN_OPENED: { audit: 'OUTREACH_LINKEDIN_OPENED', title: 'Opened LinkedIn' },
  LINKEDIN_MESSAGE_COPIED: { audit: 'OUTREACH_LINKEDIN_MESSAGE_COPIED', title: 'LinkedIn message copied' },
  WHATSAPP_MARKED_SENT: { audit: 'OUTREACH_WHATSAPP_SENT', title: 'WhatsApp message sent' },
  LINKEDIN_MARKED_SENT: { audit: 'OUTREACH_LINKEDIN_SENT', title: 'LinkedIn message sent' },
  WHATSAPP_NOT_AVAILABLE: { audit: 'OUTREACH_WHATSAPP_NOT_AVAILABLE', title: 'No WhatsApp number' },
  LINKEDIN_NOT_AVAILABLE: { audit: 'OUTREACH_LINKEDIN_NOT_AVAILABLE', title: 'Not on LinkedIn' },
} as const;

/** Text kept with a record: enough to see what was sent, never unbounded. */
const clip = (text: string) => (text.length > 4000 ? `${text.slice(0, 4000)}…` : text);

/**
 * Client Outreach touchpoints done by hand in WhatsApp or LinkedIn. The CRM
 * opens the lead's chat or profile; the member sends the message there. What
 * the CRM sees happen is recorded as such (WhatsApp opened, LinkedIn opened,
 * the LinkedIn message copied); a message is recorded as sent only when the
 * member confirms sending it, and the record says it was their confirmation.
 * A sent message is then tracked like an outreach email: its text, who sent
 * it and when, its attempt number, the lead's last contact, and (when asked)
 * the day's completion. The number or profile recorded is the lead's own,
 * read here, not what the browser says it opened.
 *
 * Each record goes, together, on the touchpoint (`channelActions[day]`), the
 * lead's activity and the audit log.
 */
@Injectable()
export class CrmOutreachChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
  ) {}

  async record(tenantId: string, actorMemberId: string, visibility: LeadVisibility, dto: OutreachChannelActionDto) {
    if (dto.channel === 'WHATSAPP' && dto.action === 'MESSAGE_COPIED') throw new BadRequestException('Copying a WhatsApp message is not recorded.');
    if (dto.action === 'NOT_AVAILABLE') return this.notAvailable(tenantId, actorMemberId, visibility, dto);
    if (dto.reason !== undefined) throw new BadRequestException('Only marking the lead as not there has a reason.');
    const sending = dto.action === 'MARKED_SENT';
    if (!sending && (dto.message !== undefined || dto.resend || dto.completeTouchpoint)) throw new BadRequestException('Only a sent message has a text, a resend or a completion.');
    const executor = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, id: actorMemberId },
      select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const executedBy = { memberId: actorMemberId, name: executor?.rndtechnosoft_users.display_name || executor?.rndtechnosoft_users.email || 'A team member' };
    const steps = await this.crm.getCadenceSteps(tenantId);

    const recorded = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${dto.leadId}::uuid FOR UPDATE`;
      const lead = await tx.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: dto.leadId, ...visibleLeads(visibility) } });
      if (!lead) throw new NotFoundException('Lead not found');
      const attributes = (lead.custom_attributes as Record<string, unknown> | null) ?? {};
      const cadence = attributes.cadence as Cadence | undefined;
      if (!cadence || cadence.status !== 'ACTIVE' || cadence.convertedToOpportunity) {
        throw new ConflictException(`${lead.company_name} is not active in Client Outreach, so there is no touchpoint to execute.`);
      }
      const step = nextCadenceStep(steps, cadence);
      if (!step) throw new ConflictException(`${lead.company_name} has finished every touchpoint of the cadence.`);
      const channelName = dto.channel === 'WHATSAPP' ? 'WhatsApp' : 'LinkedIn';
      if (!step.channels.includes(dto.channel)) throw new BadRequestException(`Day ${step.dayNumber} (${step.title}) has no ${channelName} touchpoint.`);
      // A LinkedIn action with no message (engaging with or sharing a post) is recorded as done, without a text.
      const linkedInAction = dto.channel === 'LINKEDIN' && !step.templates?.linkedin?.message ? step.templates?.linkedin?.actionType ?? 'ACTION' : null;
      if (sending && !dto.message && !linkedInAction) throw new BadRequestException('Write the message that was sent.');

      // Where it opens: the lead's own number or LinkedIn address.
      let to: string;
      let destination: string | null = null;
      if (dto.channel === 'WHATSAPP') {
        const phone = whatsAppDigits(lead.whatsapp_number || lead.phone);
        if ('problem' in phone) throw new BadRequestException(phone.problem);
        to = `+${phone.digits}`;
      } else {
        if (!lead.linkedin_url?.trim()) throw new BadRequestException(LINKEDIN_MISSING);
        const linkedIn = normalizeLinkedInUrl(lead.linkedin_url);
        if (!linkedIn) throw new BadRequestException(LINKEDIN_INVALID);
        to = linkedIn.url;
        destination = linkedIn.kind;
      }

      const at = new Date();
      const kind = `${dto.channel}_${dto.action}` as keyof typeof LABELS;
      const label = LABELS[kind];
      const title = kind === 'LINKEDIN_OPENED' ? (destination === 'CONVERSATION' ? 'Opened LinkedIn conversation' : 'Opened LinkedIn profile') : label.title;
      const day = String(step.dayNumber);
      const stepIndex = steps.indexOf(step);
      const touchpointLabel = `Day ${step.dayNumber} — ${step.title}`;
      const activityId = randomUUID();
      const previous = cadence.channelActions?.[day]?.[dto.channel];
      const when = (iso?: string) => (iso ? new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '');
      // A sent message is recorded once; recording it again needs an explicit resend, as with email.
      if (sending && previous?.status === 'SENT' && !dto.resend) {
        throw new ConflictException(`The Day ${day} ${channelName} message was already marked sent by ${previous.executedBy.name} on ${when(previous.sentAt)}. Use "Mark sent again" to record another send.`);
      }
      const attempt = sending
        ? (await tx.rndtechnosoft_crm_audit_logs.count({
            where: { tenant_id: tenantId, entity_id: lead.id, action_type: label.audit, changes_diff: { path: ['touchpoint', 'step_index'], equals: stepIndex } },
          })) + 1
        : null;
      const message = sending ? dto.message?.replace(/\s+$/, '') || `LinkedIn action done (${linkedInAction}); no message for this day.` : null;
      await tx.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: activityId,
          tenant_id: tenantId,
          lead_id: lead.id,
          performed_by_tenant_member_id: actorMemberId,
          activity_type: dto.channel,
          title,
          description: [
            `Channel: ${channelName}`,
            `${dto.channel === 'WHATSAPP' ? 'Phone' : 'LinkedIn URL'}: ${to}`,
            `Touchpoint: ${touchpointLabel}`,
            `Executed by: ${executedBy.name}`,
            ...(sending
              ? [`Attempt: ${attempt}`, `Sent by hand in ${channelName}; marked sent by ${executedBy.name}.`, '', clip(message!)]
              // Opening a chat is not sending: the message is sent (or not) in WhatsApp or LinkedIn itself.
              : ['The message is sent by hand there; the CRM has not sent it.']),
          ].join('\n'),
          created_at: at,
        },
      });
      await tx.rndtechnosoft_crm_audit_logs.create({
        data: {
          id: randomUUID(),
          tenant_id: tenantId,
          action_type: label.audit,
          entity_type: 'LEAD',
          entity_id: lead.id,
          actor_id: actorMemberId,
          actor_name: executedBy.name.slice(0, 120),
          changes_diff: {
            channel: dto.channel,
            action: dto.action,
            touchpoint: { day: step.dayNumber, title: step.title, step_index: stepIndex },
            funnel: cadence.funnelName ?? null,
            ...(dto.channel === 'WHATSAPP' ? { phone: to } : { linkedin_url: to, destination }),
            executed_by: { member_id: actorMemberId, name: executedBy.name },
            at: at.toISOString(),
            activity_id: activityId,
            ...(sending ? { status: 'SENT', sent_at: at.toISOString(), confirmation: 'USER', attempt, message: clip(message!), ...(dto.resend ? { resend: true } : {}) } : {}),
          } as Prisma.InputJsonObject,
          created_at: at,
        },
      });

      // The touchpoint keeps when it was opened, copied and sent; opening or copying again never undoes a send.
      const wasSent = previous?.status === 'SENT';
      const action: CadenceChannelAction = sending
        ? {
            status: 'SENT', attempt: attempt!, executedBy, startedAt: previous?.startedAt ?? at.toISOString(), sentAt: at.toISOString(),
            confirmation: 'USER', to, message: clip(message!), activityId,
            ...(previous?.openedAt ? { openedAt: previous.openedAt } : {}),
            ...(previous?.copiedAt ? { copiedAt: previous.copiedAt } : {}),
            ...(destination ? { destination: destination as CadenceChannelAction['destination'] } : {}),
          }
        : {
            ...(wasSent ? previous : {}),
            status: wasSent ? 'SENT' : dto.action === 'OPENED' || previous?.status === 'OPENED' ? 'OPENED' : 'COPIED',
            attempt: wasSent ? previous!.attempt : 0,
            executedBy: wasSent ? previous!.executedBy : executedBy,
            startedAt: previous?.startedAt ?? at.toISOString(),
            to,
            activityId: wasSent ? previous!.activityId : activityId,
            ...(previous?.openedAt ? { openedAt: previous.openedAt } : {}),
            ...(previous?.copiedAt ? { copiedAt: previous.copiedAt } : {}),
            ...(dto.action === 'OPENED' ? { openedAt: at.toISOString() } : { copiedAt: at.toISOString() }),
            ...(destination ? { destination: destination as CadenceChannelAction['destination'] } : {}),
          };
      const forDay = { ...(cadence.channelActions?.[day] ?? {}), [dto.channel]: action };
      const updated: Cadence = { ...cadence, channelActions: { ...(cadence.channelActions ?? {}), [day]: forDay } };
      await tx.rndtechnosoft_crm_leads.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: lead.id } },
        data: {
          custom_attributes: { ...attributes, cadence: updated } as unknown as Prisma.InputJsonObject,
          // A sent message is contact with the lead, as a sent email is.
          ...(sending ? { last_contacted_at: at, touchpoints_count: { increment: 1 } } : {}),
        },
      });
      return { channel: dto.channel, action: dto.action, to, destination, channelActions: forDay, state: action, day: step.dayNumber, title, channelName, touchpointLabel, stillToDo: channelsStillToDo(step, forDay) };
    });

    // Only now, with the message recorded as sent, may the day move on (when asked),
    // and only when nothing else of the day is still to send.
    let touchpointCompleted = false;
    if (sending && dto.completeTouchpoint && !recorded.stillToDo.length) {
      await this.crm.executeCadenceAction(tenantId, visibility, {
        action: 'COMPLETE_STEP', leadId: dto.leadId, channel: dto.channel, notes: `${recorded.channelName} message sent to ${recorded.to} (marked sent by ${executedBy.name})`,
      }, actorMemberId);
      touchpointCompleted = true;
    }
    const { state, title, touchpointLabel, channelName: _name, ...result } = recorded;
    return {
      ...result,
      state,
      touchpointCompleted,
      message: sending
        ? `${title}: recorded for ${touchpointLabel}${touchpointCompleted ? `; Day ${recorded.day} is complete` : ''}`
        : `${title} recorded for ${touchpointLabel}`,
    };
  }

  /**
   * Marks that the lead isn't on LinkedIn, or has no WhatsApp number, for this
   * touchpoint, so the day can be completed without that message. WhatsApp
   * can be marked so only when the lead has no usable number; a message
   * already sent there can't be undone by it.
   */
  private async notAvailable(tenantId: string, actorMemberId: string, visibility: LeadVisibility, dto: OutreachChannelActionDto) {
    if (dto.message !== undefined || dto.resend || dto.completeTouchpoint) throw new BadRequestException('Only a sent message has a text, a resend or a completion.');
    const executor = await this.prisma.rndtechnosoft_tenant_members.findFirst({
      where: { tenant_id: tenantId, id: actorMemberId },
      select: { rndtechnosoft_users: { select: { display_name: true, email: true } } },
    });
    const executedBy = { memberId: actorMemberId, name: executor?.rndtechnosoft_users.display_name || executor?.rndtechnosoft_users.email || 'A team member' };
    const steps = await this.crm.getCadenceSteps(tenantId);
    const reason = dto.reason?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM rndtechnosoft_crm_leads WHERE tenant_id = ${tenantId}::uuid AND id = ${dto.leadId}::uuid FOR UPDATE`;
      const lead = await tx.rndtechnosoft_crm_leads.findFirst({ where: { tenant_id: tenantId, id: dto.leadId, ...visibleLeads(visibility) } });
      if (!lead) throw new NotFoundException('Lead not found');
      const attributes = (lead.custom_attributes as Record<string, unknown> | null) ?? {};
      const cadence = attributes.cadence as Cadence | undefined;
      if (!cadence || cadence.status !== 'ACTIVE' || cadence.convertedToOpportunity) {
        throw new ConflictException(`${lead.company_name} is not active in Client Outreach, so there is no touchpoint to execute.`);
      }
      const step = nextCadenceStep(steps, cadence);
      if (!step) throw new ConflictException(`${lead.company_name} has finished every touchpoint of the cadence.`);
      const channelName = dto.channel === 'WHATSAPP' ? 'WhatsApp' : 'LinkedIn';
      if (!step.channels.includes(dto.channel)) throw new BadRequestException(`Day ${step.dayNumber} (${step.title}) has no ${channelName} touchpoint.`);
      if (dto.channel === 'WHATSAPP' && !('problem' in whatsAppDigits(lead.whatsapp_number || lead.phone))) {
        throw new BadRequestException('This lead has a WhatsApp number. Send the message and mark it sent, or correct the number on the lead first.');
      }
      const day = String(step.dayNumber);
      const previous = cadence.channelActions?.[day]?.[dto.channel];
      if (previous?.status === 'SENT') throw new ConflictException(`The Day ${day} ${channelName} message was already marked sent, so it can’t be marked as not available.`);

      const at = new Date();
      const label = LABELS[`${dto.channel}_NOT_AVAILABLE`];
      const touchpointLabel = `Day ${step.dayNumber} — ${step.title}`;
      const activityId = randomUUID();
      await tx.rndtechnosoft_crm_lead_activities.create({
        data: {
          id: activityId, tenant_id: tenantId, lead_id: lead.id, performed_by_tenant_member_id: actorMemberId, activity_type: dto.channel, title: label.title,
          description: [
            `Channel: ${channelName}`,
            `Touchpoint: ${touchpointLabel}`,
            `Marked by: ${executedBy.name}`,
            dto.channel === 'LINKEDIN' ? 'The lead has no LinkedIn profile, so no LinkedIn message is sent for this day.' : 'The lead has no WhatsApp number, so no WhatsApp message is sent for this day.',
            ...(reason ? ['', reason] : []),
          ].join('\n'),
          created_at: at,
        },
      });
      await tx.rndtechnosoft_crm_audit_logs.create({
        data: {
          id: randomUUID(), tenant_id: tenantId, action_type: label.audit, entity_type: 'LEAD', entity_id: lead.id, actor_id: actorMemberId, actor_name: executedBy.name.slice(0, 120),
          changes_diff: {
            channel: dto.channel, action: dto.action, touchpoint: { day: step.dayNumber, title: step.title, step_index: steps.indexOf(step) },
            funnel: cadence.funnelName ?? null, executed_by: { member_id: actorMemberId, name: executedBy.name }, at: at.toISOString(), activity_id: activityId, reason,
          } as Prisma.InputJsonObject,
          created_at: at,
        },
      });
      const action: CadenceChannelAction = {
        status: 'NOT_AVAILABLE', attempt: 0, executedBy, startedAt: previous?.startedAt ?? at.toISOString(), markedAt: at.toISOString(), activityId,
        ...(reason ? { reason } : {}),
        ...(previous?.openedAt ? { openedAt: previous.openedAt } : {}),
      };
      const forDay = { ...(cadence.channelActions?.[day] ?? {}), [dto.channel]: action };
      const updated: Cadence = { ...cadence, channelActions: { ...(cadence.channelActions ?? {}), [day]: forDay } };
      await tx.rndtechnosoft_crm_leads.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: lead.id } },
        data: { custom_attributes: { ...attributes, cadence: updated } as unknown as Prisma.InputJsonObject },
      });
      return {
        channel: dto.channel, action: dto.action, day: step.dayNumber, channelActions: forDay, state: action, touchpointCompleted: false,
        stillToDo: channelsStillToDo(step, forDay), message: `${label.title}: recorded for ${touchpointLabel}`,
      };
    });
  }
}
