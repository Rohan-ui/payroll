import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { MailInitiator, MailSendError, MailSenderService } from '@/modules/mail/mail-sender.service';
import { GmailService } from '@/modules/gmail/gmail.service';

export interface OnboardingEmail {
  tenantId: string;
  /** The same key never sends twice, so a retried request cannot duplicate an email. */
  idempotencyKey: string;
  templateCode: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  candidateId?: string;
  interviewId?: string;
  /**
   * The member whose action sends this email, from the session. When the
   * workspace allows personal accounts it goes from their own account;
   * without one (an automatic email) it goes from the organization's.
   */
  initiatedBy?: MailInitiator | null;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  /**
   * Builds the content only once this request holds the key, for emails whose
   * content must be created exactly once (such as a one-time link). Its result
   * replaces subject, text, html and attachments.
   */
  build?: () => Promise<{ subject: string; text: string; html: string; attachments?: OnboardingEmail['attachments'] }>;
}

export interface OnboardingSendOutcome {
  recipient: string;
  status: 'SENT' | 'FAILED' | 'NOT_SENT' | 'SENDING';
  /** True when this key was already sent, or is being sent, and nothing was sent now. */
  duplicate: boolean;
  error: string | null;
  /** The address it went out (or would have gone out) from, when an account was chosen. */
  sentFrom?: string | null;
}

/** A claim older than this is taken to have died with its process, and may be retried. */
const STALE_CLAIM_MS = 10 * 60 * 1000;

/**
 * Sends onboarding emails and records each outcome, with the account it went
 * from and the member who started it. An email a member's action sends goes
 * from their own account when the workspace allows it; automatic emails go
 * from the organization's account (see MailSenderService). An idempotency key is sent at most once: while its email is on
 * the way the key is claimed (SENDING), and once SENT it is never sent again,
 * so a retried or doubled request cannot duplicate an email. A key whose
 * email failed or could not be sent may be tried again. Emails carry no
 * passwords, identity numbers or private file links.
 */
@Injectable()
export class OnboardingMailerService {
  private readonly logger = new Logger(OnboardingMailerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailSender: MailSenderService,
    private readonly gmail: GmailService,
  ) {}

  async send(email: OnboardingEmail): Promise<OnboardingSendOutcome> {
    const recipient = email.to.trim().toLowerCase();
    const key = email.idempotencyKey.slice(0, 200);
    let id: string = randomUUID();
    try {
      await this.prisma.rndtechnosoft_onboarding_notifications.create({
        data: {
          id,
          tenant_id: email.tenantId,
          idempotency_key: key,
          template_code: email.templateCode,
          recipient_email: recipient,
          candidate_id: email.candidateId ?? null,
          interview_id: email.interviewId ?? null,
          delivery_status: 'SENDING',
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
      // Taken before: retry only an email that did not go out, or a claim abandoned long ago.
      const reclaimed = await this.prisma.rndtechnosoft_onboarding_notifications.updateMany({
        where: {
          tenant_id: email.tenantId,
          idempotency_key: key,
          OR: [
            { delivery_status: { in: ['FAILED', 'NOT_SENT'] } },
            { delivery_status: 'SENDING', updated_at: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
          ],
        },
        data: { delivery_status: 'SENDING', error_message: null, recipient_email: recipient, updated_at: new Date() },
      });
      const earlier = await this.prisma.rndtechnosoft_onboarding_notifications.findFirstOrThrow({
        where: { tenant_id: email.tenantId, idempotency_key: key },
        select: { id: true, delivery_status: true, error_message: true },
      });
      if (reclaimed.count === 0) {
        return { recipient, status: earlier.delivery_status as OnboardingSendOutcome['status'], duplicate: true, error: earlier.error_message };
      }
      id = earlier.id;
    }

    // The account is chosen by the server from the session's member, never from the request.
    const sender = await this.mailSender.resolve(email.tenantId, email.initiatedBy ?? null);
    const senderEmail = sender.kind === 'NONE' ? null : sender.email;
    const record = (status: OnboardingSendOutcome['status'], error: string | null) =>
      this.prisma.rndtechnosoft_onboarding_notifications.update({
        where: { id },
        data: {
          delivery_status: status,
          error_message: error?.slice(0, 500) ?? null,
          sent_at: status === 'SENT' ? new Date() : null,
          sender_kind: sender.kind === 'NONE' ? null : sender.kind,
          sender_email: senderEmail,
          initiated_by_tenant_member_id: email.initiatedBy?.tenantMemberId ?? null,
          updated_at: new Date(),
        },
      });

    if (sender.kind === 'NONE') {
      await record('NOT_SENT', sender.reason);
      return { recipient, status: 'NOT_SENT', duplicate: false, error: sender.reason, sentFrom: null };
    }

    // Built only once the email can actually be sent.
    let content = { subject: email.subject, text: email.text, html: email.html, attachments: email.attachments };
    if (email.build) {
      try {
        content = { ...content, ...(await email.build()) };
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'The email could not be prepared.';
        await record('FAILED', reason);
        return { recipient, status: 'FAILED', duplicate: false, error: reason, sentFrom: senderEmail };
      }
    }

    const message = { to: recipient, subject: content.subject, text: content.text, html: content.html, attachments: content.attachments };
    try {
      if (sender.kind === 'GMAIL') await this.gmail.sendAsGmail(email.tenantId, sender.userId, message);
      else await this.mailSender.sendSmtp(sender, message);
      await record('SENT', null);
      return { recipient, status: 'SENT', duplicate: false, error: null, sentFrom: senderEmail };
    } catch (error) {
      // Safe reasons only: MailSendError and Gmail's HTTP errors never carry a credential.
      const reason =
        error instanceof MailSendError
          ? `${error.safeReason} ${sender.kind === 'ORGANIZATION' ? 'Check the SMTP settings in Organization Settings.' : 'Check your account in My email settings.'}`
          : error instanceof HttpException
            ? error.message
            : 'The email could not be sent.';
      this.logger.warn(`Onboarding email failed tenant=${email.tenantId} template=${email.templateCode} sender=${sender.kind}`);
      await record('FAILED', reason);
      return { recipient, status: 'FAILED', duplicate: false, error: reason, sentFrom: senderEmail };
    }
  }
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ENTITIES[c]);
