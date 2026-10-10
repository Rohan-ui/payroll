import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { UserMailAccountsService } from './user-mail-accounts.service';
import { SmtpCredentials, transportFor } from './mail-connections';
import { describeSmtpFailure } from './mail-errors';

/** The signed-in member who started an email, from the server-side session. */
export interface MailInitiator {
  userId: string;
  tenantMemberId: string;
}

/** The account an email goes out from. */
export type MailSender =
  | { kind: 'PERSONAL'; email: string; name: string | null; replyTo: string | null; smtp: SmtpCredentials }
  | { kind: 'GMAIL'; email: string; userId: string }
  | { kind: 'ORGANIZATION'; email: string; name: string | null; replyTo: string | null; smtp: SmtpCredentials }
  | { kind: 'NONE'; reason: string };

export type SendableSender = Exclude<MailSender, { kind: 'NONE' | 'GMAIL' }>;

export interface MailMessage {
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
  /** A Message-ID chosen by the sender, so what comes back can be matched to this email. */
  messageId?: string;
  headers?: Record<string, string>;
}

/** A send the mail server refused, with a reason safe to show: it names no credential. */
export class MailSendError extends Error {
  /** `cause` keeps the server's error code and stage (never shown) so callers can tell whether anything was sent. */
  readonly cause?: unknown;

  constructor(readonly safeReason: string, options?: { cause?: unknown }) {
    super(safeReason);
    this.name = 'MailSendError';
    this.cause = options?.cause;
  }
}

const NO_ACCOUNT = 'The workspace has no active SMTP account. Set one up in Organization Settings to send email.';

/**
 * Chooses which account an email goes out from, and sends through SMTP.
 *
 * - An email a member starts goes from their own account when the workspace
 *   allows personal accounts and they have one: their connected Gmail, else
 *   their SMTP account. Otherwise it goes from the organization's account.
 * - An automatic email (no member started it) always goes from the
 *   organization's account.
 *
 * The member is always the one in the server-side session, never an id from
 * the request, and one member's account is never used for another's email.
 * A personal account that fails is reported, never silently replaced by
 * another account. Each send opens its own connection and closes it, so no
 * connection or credential outlives a change of settings.
 */
@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly accounts: UserMailAccountsService,
  ) {}

  async resolve(tenantId: string, initiator: MailInitiator | null): Promise<MailSender> {
    if (initiator && (await this.organizationSettings.emailPolicy(tenantId)) === 'ALLOWED') {
      const gmail = await this.prisma.rndtechnosoft_gmail_connections.findFirst({
        where: { tenant_id: tenantId, user_id: initiator.userId, connection_status: 'CONNECTED', gmail_email: { not: null }, refresh_token_encrypted: { not: null } },
        select: { gmail_email: true },
      });
      if (gmail?.gmail_email) return { kind: 'GMAIL', email: gmail.gmail_email, userId: initiator.userId };
      const personal = await this.accounts.smtpFor(tenantId, initiator.userId);
      if (personal) return { kind: 'PERSONAL', email: personal.senderEmail, name: personal.senderName, replyTo: personal.replyToEmail, smtp: personal.smtp };
    }
    return this.organization(tenantId);
  }

  /** The organization's account, for automatic emails and as the allowed fallback. */
  async organization(tenantId: string): Promise<MailSender> {
    let saved: Awaited<ReturnType<OrganizationSettingsService['workspaceSmtp']>>;
    try {
      saved = await this.organizationSettings.workspaceSmtp(tenantId);
    } catch (error) {
      return { kind: 'NONE', reason: error instanceof Error ? error.message : NO_ACCOUNT };
    }
    if (!saved) return { kind: 'NONE', reason: NO_ACCOUNT };
    return {
      kind: 'ORGANIZATION',
      email: saved.senderEmail,
      name: saved.senderName,
      replyTo: saved.replyToEmail,
      smtp: {
        host: saved.host,
        port: saved.port,
        username: saved.username,
        password: saved.password,
        // The organization account keeps its own modes: SSL, TLS (STARTTLS) or NONE.
        security: saved.port === 465 || saved.encryption === 'SSL' ? 'SSL' : saved.encryption === 'NONE' ? 'NONE' : 'STARTTLS',
      },
    };
  }

  /** Sends through an SMTP account; throws MailSendError with a safe reason when the server refuses. */
  async sendSmtp(sender: SendableSender, message: MailMessage): Promise<{ messageId: string | null }> {
    const transport = transportFor(sender.smtp);
    try {
      const info = await transport.sendMail({
        from: { name: sender.name ?? sender.email, address: sender.email },
        replyTo: sender.replyTo ?? undefined,
        ...message,
      });
      return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
    } catch (error) {
      const code = error && typeof error === 'object' ? String((error as { code?: unknown }).code ?? 'none') : 'none';
      // Codes only: a server's reply can echo account details.
      this.logger.warn(`Email send failed sender=${sender.kind} code=${code}`);
      throw new MailSendError(describeSmtpFailure(error, sender.smtp.host, sender.smtp.port, [sender.smtp.username, sender.smtp.password]), { cause: error });
    } finally {
      transport.close();
    }
  }
}
