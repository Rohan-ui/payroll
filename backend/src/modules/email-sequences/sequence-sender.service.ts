import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { MailMessage, MailSenderService, MailSendError, SendableSender } from '@/modules/mail/mail-sender.service';
import { UserMailAccountsService } from '@/modules/mail/user-mail-accounts.service';
import { GmailService } from '@/modules/gmail/gmail.service';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { OutreachCalendar } from '@/modules/crm/crm-outreach-schedule';
import { leadActivity, normalizeEmail, scheduleOf } from './sequence-context';
import { SequenceEnrollmentService } from './sequence-enrollment.service';
import { hashToken } from './email-suppression.service';
import { classifySendFailure, newMessageId, RETRY_DELAYS_MS } from './sequence-mail';
import { leadValues, PlaceholderValues, renderPlaceholders } from './sequence-placeholders';
import { earliestSendTime, inWindow, nextDayWindow, todayRange } from './sequence-schedule';

/** How long a claimed send may stay "sending" before it is treated as interrupted. */
export const STALE_CLAIM_MS = 10 * 60_000;
/** At most this many emails from one mailbox per worker round (a minute): overdue emails go out gradually, never in a burst. */
export const PER_MAILBOX_PER_ROUND = 5;
/** How long a send waits when its sender can't be used, before it is tried again. */
const SENDER_RETRY_MS = 60 * 60_000;

export type ResolvedSender =
  | { ok: true; kind: 'ORGANIZATION' | 'PERSONAL'; email: string; name: string | null; memberId: string | null; account: SendableSender }
  | { ok: true; kind: 'GMAIL'; email: string; name: string | null; memberId: string; userId: string }
  | { ok: false; reason: string };

/** The links an email carries to unsubscribe: a page for people, a URL for one-click unsubscribing by mail apps. */
export interface UnsubscribeLinks { page: string; oneClick: string }

type Claimed = Prisma.rndtechnosoft_email_sequence_sendsGetPayload<{
  include: {
    rndtechnosoft_email_sequences: true;
    rndtechnosoft_email_sequence_steps: true;
    rndtechnosoft_email_sequence_enrollments: true;
    rndtechnosoft_crm_leads: { include: { rndtechnosoft_tenant_members: { select: { id: true; user_id: true; rndtechnosoft_users: { select: { display_name: true; email: true } } } } } };
  };
}>;

/**
 * Sends sequence emails that are due. Each email is claimed (SCHEDULED to
 * SENDING, with SKIP LOCKED) so two workers never take the same one; it is
 * marked SENT only once the mail server has taken it. A failure that certainly
 * sent nothing is retried; a refusal waits for a person; a connection lost
 * while handing the email over is UNCERTAIN and never sent again by itself.
 * A failed step never moves the lead on to the next email.
 */
@Injectable()
export class SequenceSenderService {
  private readonly logger = new Logger('SequenceSender');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSender: MailSenderService,
    private readonly accounts: UserMailAccountsService,
    private readonly gmail: GmailService,
    private readonly settings: OrganizationSettingsService,
    private readonly domains: TenantDomainsService,
    private readonly enrollments: SequenceEnrollmentService,
  ) {}

  /**
   * Claims a worker left behind (it stopped). Before the email was handed to
   * the mail server (no Message-ID recorded yet), nothing went out: scheduled
   * again. After, the server may have taken it, so a person decides.
   */
  async recoverStale(now = new Date()) {
    const before = new Date(now.getTime() - STALE_CLAIM_MS);
    const untried = await this.prisma.rndtechnosoft_email_sequence_sends.updateMany({
      where: { send_status: 'SENDING', claimed_at: { lt: before }, message_id: null },
      data: { send_status: 'SCHEDULED', claimed_at: null, updated_at: now },
    });
    const stale = await this.prisma.rndtechnosoft_email_sequence_sends.updateMany({
      where: { send_status: 'SENDING', claimed_at: { lt: before }, message_id: { not: null } },
      data: {
        send_status: 'UNCERTAIN', failure_code: 'INTERRUPTED', updated_at: now,
        failure_reason: 'Sending was interrupted, so the email may or may not have been sent. Check the sender’s Sent folder, then mark it sent or send it again.',
      },
    });
    return { rescheduled: untried.count, uncertain: stale.count };
  }

  /** Claims up to `limit` due emails of active sequences. */
  async claimDue(limit = 50, now = new Date()): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE rndtechnosoft_email_sequence_sends s
      SET send_status = 'SENDING', claimed_at = ${now}, updated_at = ${now}
      WHERE s.id IN (
        SELECT d.id FROM rndtechnosoft_email_sequence_sends d
        JOIN rndtechnosoft_email_sequences q ON q.tenant_id = d.tenant_id AND q.id = d.sequence_id
        WHERE d.send_status = 'SCHEDULED' AND d.scheduled_at <= ${now} AND q.sequence_status = 'ACTIVE'
        ORDER BY d.scheduled_at
        LIMIT ${limit}
        FOR UPDATE OF d SKIP LOCKED
      )
      RETURNING s.id`;
    return rows.map((r) => r.id);
  }

  /** Every due email once: claimed, then sent one by one; one failing never stops the others. */
  async sendDue(now = new Date()) {
    const ids = await this.claimDue(50, now);
    const perMailbox = new Map<string, number>();
    const calendars = new Map<string, OutreachCalendar>();
    let sent = 0;
    for (const id of ids) {
      try {
        if ((await this.process(id, perMailbox, calendars)) === 'SENT') sent += 1;
      } catch (error) {
        // Not a send failure (those are recorded): put it back and log, without the details.
        this.logger.error(`Sequence send ${id} could not be processed: ${error instanceof Error ? error.name : 'unknown'}`);
        await this.prisma.rndtechnosoft_email_sequence_sends.updateMany({ where: { id, send_status: 'SENDING', sent_at: null, message_id: null }, data: { send_status: 'SCHEDULED', claimed_at: null, scheduled_at: new Date(Date.now() + 5 * 60_000) } });
      }
    }
    return { claimed: ids.length, sent };
  }

  /** One claimed email: checked again, then sent, deferred, cancelled or failed. */
  async process(id: string, perMailbox = new Map<string, number>(), calendars = new Map<string, OutreachCalendar>()): Promise<string> {
    const send = await this.prisma.rndtechnosoft_email_sequence_sends.findUnique({
      where: { id },
      include: {
        rndtechnosoft_email_sequences: true,
        rndtechnosoft_email_sequence_steps: true,
        rndtechnosoft_email_sequence_enrollments: true,
        rndtechnosoft_crm_leads: { include: { rndtechnosoft_tenant_members: { select: { id: true, user_id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } } } } },
      },
    });
    if (!send || send.send_status !== 'SENDING') return 'GONE';
    const tenantId = send.tenant_id;
    const sequence = send.rndtechnosoft_email_sequences;
    const step = send.rndtechnosoft_email_sequence_steps;
    const enrollment = send.rndtechnosoft_email_sequence_enrollments;
    const lead = send.rndtechnosoft_crm_leads;
    if (!calendars.has(tenantId)) calendars.set(tenantId, await this.enrollments.calendar(tenantId));
    const calendar = calendars.get(tenantId)!;
    const schedule = scheduleOf(sequence, calendar);
    const now = new Date();

    if (enrollment.enrollment_status !== 'ACTIVE') return this.cancel(send, 'ENROLLMENT_ENDED');
    if (sequence.sequence_status !== 'ACTIVE') return this.release(send.id, send.scheduled_at);
    if (lead.is_won || lead.is_lost) {
      await this.prisma.$transaction((tx) => this.enrollments.stop(tx, tenantId, enrollment.id, lead.is_won ? 'WON' : 'LOST', null, null));
      return 'STOPPED';
    }
    // A step removed or switched off since it was scheduled: skipped, and the next one scheduled.
    if (step.removed_at || !step.is_enabled) {
      await this.prisma.$transaction(async (tx) => {
        await tx.rndtechnosoft_email_sequence_sends.update({ where: { id: send.id }, data: { send_status: 'CANCELLED', cancel_reason: 'STEP_REMOVED', cancelled_at: now, updated_at: now } });
        await this.enrollments.advance(tx, tenantId, enrollment.id, step.step_order, now, calendar);
      });
      return 'SKIPPED';
    }
    // Outside the window (the worker was down, or the schedule changed): to the next window, never sent late at night.
    if (!inWindow(now, schedule)) return this.release(send.id, earliestSendTime(now, schedule) ?? new Date(now.getTime() + 24 * 3600_000));

    const recipient = normalizeEmail(lead.email);
    if (await this.prisma.rndtechnosoft_email_suppressions.findFirst({ where: { tenant_id: tenantId, email: recipient }, select: { id: true } })) {
      await this.prisma.$transaction((tx) => this.enrollments.stop(tx, tenantId, enrollment.id, 'SUPPRESSED', `${recipient} is on the do-not-email list.`, null));
      return 'STOPPED';
    }

    const sender = await this.resolveSender(tenantId, sequence.sender_mode, lead.rndtechnosoft_tenant_members);
    if (!sender.ok) return this.defer(send.id, now, 'SENDER_UNAVAILABLE', sender.reason);

    // The day's limit for this sequence from this mailbox.
    const today = todayRange(now, calendar.timeZone);
    const sentToday = await this.prisma.rndtechnosoft_email_sequence_sends.count({
      where: { tenant_id: tenantId, sequence_id: sequence.id, sender_email: sender.email, send_status: { in: ['SENT', 'BOUNCED'] }, sent_at: { gte: today.start, lt: today.end } },
    });
    if (sentToday >= sequence.daily_limit) return this.release(send.id, nextDayWindow(now, schedule) ?? new Date(now.getTime() + 24 * 3600_000));
    const mailboxKey = `${tenantId}:${sender.email}`;
    if ((perMailbox.get(mailboxKey) ?? 0) >= PER_MAILBOX_PER_ROUND) return this.release(send.id, send.scheduled_at);

    const links = await this.unsubscribeLinksFor(tenantId);
    if (!links) {
      return this.fail(send, 'NO_UNSUBSCRIBE_ADDRESS', 'This workspace has no web address for the unsubscribe link, so no sequence email can be sent. Ask your platform administrator to set one up.');
    }

    const workspace = await this.workspaceName(tenantId);
    const owner = lead.rndtechnosoft_tenant_members?.rndtechnosoft_users;
    const values: PlaceholderValues = leadValues(lead, { owner: owner ? owner.display_name || owner.email : null, sender: sender.name ?? sender.email, workspace });
    const subject = renderPlaceholders(step.subject, values);
    const body = renderPlaceholders(step.body_text, values);
    const missing = [...new Set([...subject.missing, ...body.missing])];
    if (missing.length) {
      return this.fail(send, 'MISSING_DATA', `The lead has no ${missing.join(', ')} for this email, and the placeholder has no fallback. Fill it in on the lead (or add a fallback such as {{${missing[0]}|there}}), then retry.`);
    }

    const token = randomBytes(32).toString('base64url');
    const urls = { page: `${links.page}?token=${token}`, oneClick: `${links.oneClick}/${token}` };
    const messageId = newMessageId(sender.email);
    const text = `${body.text.replace(/\s+$/, '')}\n\n--\n${workspace}\nTo stop receiving these emails, unsubscribe here: ${urls.page}\n`;
    const message: MailMessage = {
      to: recipient,
      subject: subject.text.slice(0, 300),
      text,
      messageId,
      headers: { 'List-Unsubscribe': `<${urls.oneClick}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    };
    // What is about to go, recorded first: if the worker stops mid-send, the email is known and isn't sent twice.
    await this.prisma.rndtechnosoft_email_sequence_sends.update({
      where: { id: send.id },
      data: {
        attempt_count: { increment: 1 }, recipient_email: recipient, sender_kind: sender.kind, sender_email: sender.email, sender_member_id: sender.memberId,
        subject: message.subject, body_text: text, message_id: messageId, unsubscribe_token_hash: hashToken(token), definition_version: sequence.definition_version, updated_at: now,
      },
    });
    perMailbox.set(mailboxKey, (perMailbox.get(mailboxKey) ?? 0) + 1);

    let providerId: string | null;
    try {
      providerId = sender.kind === 'GMAIL'
        ? ((await this.gmail.sendAsGmail(tenantId, sender.userId, message)).messageId as string | undefined) ?? null
        : (await this.mailSender.sendSmtp(sender.account, message)).messageId;
    } catch (error) {
      return this.failed(send, error, now);
    }
    await this.recordSent(send, calendar, new Date(), providerId);
    return 'SENT';
  }

  /** The email went: SENT, on the lead's timeline, and the next step scheduled. */
  async recordSent(send: Pick<Claimed, 'id' | 'tenant_id' | 'enrollment_id' | 'lead_id'> & { rndtechnosoft_email_sequence_steps: { step_order: number; step_name: string }; rndtechnosoft_email_sequences: { sequence_name: string } }, calendar: OutreachCalendar, sentAt: Date, providerId: string | null, memberId: string | null = null) {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.rndtechnosoft_email_sequence_sends.update({
        where: { id: send.id },
        data: { send_status: 'SENT', sent_at: sentAt, provider_message_id: providerId, failure_code: null, failure_reason: null, claimed_at: null, updated_at: new Date() },
      });
      await leadActivity(tx, send.tenant_id, send.lead_id, 'EMAIL', `Email sent: ${row.subject ?? ''}`,
        [`From: ${row.sender_email}`, `To: ${row.recipient_email}`, `Drip sequence: ${send.rndtechnosoft_email_sequences.sequence_name} — ${send.rndtechnosoft_email_sequence_steps.step_name}`].join('\n'), memberId, sentAt);
      await tx.rndtechnosoft_crm_leads.update({ where: { tenant_id_id: { tenant_id: send.tenant_id, id: send.lead_id } }, data: { last_contacted_at: sentAt, touchpoints_count: { increment: 1 } } });
      await this.enrollments.advance(tx, send.tenant_id, send.enrollment_id, send.rndtechnosoft_email_sequence_steps.step_order, sentAt, calendar);
    });
  }

  /** A failed send, by what the failure means. */
  private async failed(send: Claimed, error: unknown, now: Date) {
    // A refusal before any mail server was reached (Gmail disconnected since the sender was chosen): nothing went out.
    const failure = error instanceof HttpException && !(error as { cause?: unknown }).cause
      ? { kind: 'TRANSIENT' as const, code: 'SENDER_UNAVAILABLE', reason: error.message }
      : classifySendFailure(error, error instanceof MailSendError ? error.safeReason : error instanceof HttpException ? error.message : undefined);
    const attempts = send.attempt_count + 1;
    if (failure.kind === 'UNCERTAIN') {
      await this.prisma.rndtechnosoft_email_sequence_sends.update({ where: { id: send.id }, data: { send_status: 'UNCERTAIN', failure_code: failure.code, failure_reason: failure.reason, updated_at: now } });
      return 'UNCERTAIN';
    }
    if (failure.kind === 'TRANSIENT' && attempts <= RETRY_DELAYS_MS.length) {
      // Retried with the same row: a new Message-ID and unsubscribe link are made then.
      await this.prisma.rndtechnosoft_email_sequence_sends.update({
        where: { id: send.id },
        data: { send_status: 'SCHEDULED', claimed_at: null, scheduled_at: new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]), failure_code: failure.code, failure_reason: failure.reason, message_id: null, unsubscribe_token_hash: null, updated_at: now },
      });
      return 'RETRYING';
    }
    return this.fail(send, failure.code, failure.reason);
  }

  /** Waits for a person: the lead stays on this step. */
  private async fail(send: Claimed, code: string, reason: string) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_email_sequence_sends.update({
        where: { id: send.id },
        data: { send_status: 'FAILED', failure_code: code, failure_reason: reason.slice(0, 500), failed_at: now, claimed_at: null, message_id: null, unsubscribe_token_hash: null, updated_at: now },
      });
      await leadActivity(tx, send.tenant_id, send.lead_id, 'EMAIL_FAILED', `Email not sent: ${send.rndtechnosoft_email_sequence_steps.step_name}`,
        `Drip sequence: ${send.rndtechnosoft_email_sequences.sequence_name}\n${reason}`, null, now);
    });
    return 'FAILED';
  }

  private async cancel(send: Claimed, reason: string) {
    await this.prisma.rndtechnosoft_email_sequence_sends.update({ where: { id: send.id }, data: { send_status: 'CANCELLED', cancel_reason: reason, cancelled_at: new Date(), claimed_at: null, updated_at: new Date() } });
    return 'CANCELLED';
  }

  /** Back to scheduled, for later; nothing was tried. */
  private async release(id: string, at: Date) {
    await this.prisma.rndtechnosoft_email_sequence_sends.update({ where: { id }, data: { send_status: 'SCHEDULED', claimed_at: null, scheduled_at: at, updated_at: new Date() } });
    return 'DEFERRED';
  }

  /** Back to scheduled an hour later, saying why, for a problem a person must fix (a disconnected mailbox). Never sent from another account. */
  private async defer(id: string, now: Date, code: string, reason: string) {
    await this.prisma.rndtechnosoft_email_sequence_sends.update({
      where: { id },
      data: { send_status: 'SCHEDULED', claimed_at: null, scheduled_at: new Date(now.getTime() + SENDER_RETRY_MS), failure_code: code, failure_reason: reason.slice(0, 500), updated_at: now },
    });
    return 'DEFERRED';
  }

  /**
   * The account a sequence sends from, never another: the organization's, or
   * the lead owner's own (Gmail when connected, else their SMTP account) when
   * the workspace allows personal accounts. Unusable: why, to show and retry later.
   */
  async resolveSender(tenantId: string, mode: string, owner: { id: string; user_id: string; rndtechnosoft_users: { display_name: string | null; email: string } } | null): Promise<ResolvedSender> {
    if (mode === 'ORGANIZATION') {
      const account = await this.mailSender.organization(tenantId);
      if (account.kind !== 'ORGANIZATION') return { ok: false, reason: account.kind === 'NONE' ? account.reason : 'The organization account is not available.' };
      return { ok: true, kind: 'ORGANIZATION', email: account.email, name: account.name, memberId: null, account };
    }
    if ((await this.settings.emailPolicy(tenantId)) !== 'ALLOWED') return { ok: false, reason: 'The workspace sends from the organization account only, so emails can’t go from the lead owner’s account. Change the sequence’s sender, or allow personal accounts in Organization Settings.' };
    if (!owner) return { ok: false, reason: 'The lead has no owner, so there is no account to send from. Assign the lead to a team member.' };
    const name = owner.rndtechnosoft_users.display_name || null;
    const gmail = await this.prisma.rndtechnosoft_gmail_connections.findFirst({
      where: { tenant_id: tenantId, user_id: owner.user_id, connection_status: 'CONNECTED', gmail_email: { not: null }, refresh_token_encrypted: { not: null } },
      select: { gmail_email: true },
    });
    if (gmail?.gmail_email) return { ok: true, kind: 'GMAIL', email: gmail.gmail_email, name, memberId: owner.id, userId: owner.user_id };
    const personal = await this.accounts.smtpFor(tenantId, owner.user_id);
    if (personal) {
      return { ok: true, kind: 'PERSONAL', email: personal.senderEmail, name: personal.senderName ?? name, memberId: owner.id, account: { kind: 'PERSONAL', email: personal.senderEmail, name: personal.senderName ?? name, replyTo: personal.replyToEmail, smtp: personal.smtp } };
    }
    return { ok: false, reason: `${name ?? owner.rndtechnosoft_users.email} has no connected Gmail or email account to send from. Ask them to connect one in My email settings.` };
  }

  /** The workspace's unsubscribe links, or null when it has no web address (and so can't send). */
  async unsubscribeLinksFor(tenantId: string): Promise<UnsubscribeLinks | null> {
    const subdomain = (await this.domains.primarySubdomains([tenantId])).get(tenantId)?.subdomain;
    const base = subdomain ? this.domains.workspaceUrl(subdomain) : this.domains.addressOf('x') ? null : this.domains.workspaceUrl('x');
    if (!base) return null;
    return { page: `${base}/unsubscribe`, oneClick: `${base}/api/v1/public/email/unsubscribe` };
  }

  async workspaceName(tenantId: string) {
    return (await this.prisma.rndtechnosoft_tenants.findUnique({ where: { id: tenantId }, select: { legal_name: true } }))?.legal_name ?? '';
  }
}
