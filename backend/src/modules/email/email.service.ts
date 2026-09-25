import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '@/prisma/prisma.service';
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
  isPlatformEncryptionConfigured,
} from '@/modules/super-admin/auth/platform-crypto.util';
import { PlatformSmtpSettingsDto, SmtpEncryption } from './dto/platform-smtp.dto';
import { RenderedEmail, smtpTestEmail, tenantOnboardingEmail, TenantOnboardingContent } from './email-templates';

export const SMTP_SETTINGS_KEY = 'platform_smtp';

/** Who asked for an operation, for the platform activity log. */
export interface PlatformActor {
  superAdminId: string;
  ipAddress?: string;
  userAgent?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  passwordEncrypted: string | null;
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
}

export interface OutgoingEmail extends RenderedEmail {
  templateCode: string;
  to: string;
  tenantId?: string | null;
  requestedBySuperAdminId?: string | null;
}

/**
 * The outcome of one send. NOT_SENT means nothing was attempted (no mail
 * server configured); SENT means the server accepted the message; FAILED
 * carries a reason that is safe to show.
 */
export type SendOutcome =
  | { status: 'SENT'; deliveryId: string; error: null }
  | { status: 'FAILED'; deliveryId: string; error: string }
  | { status: 'NOT_SENT'; deliveryId: null; error: string };

const NOT_CONFIGURED = 'Outgoing email is not configured. Set up SMTP in HQ → Global settings.';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);

/** A reason for a failed send that names no credential and no internal detail. */
export function describeSmtpFailure(error: unknown, host: string, port: number, secrets: (string | null)[] = []): string {
  const e = asRecord(error);
  const code = text(e.code);
  const reply = serverReply(e.response, secrets);
  const responseCode = reply
    ? ` (server replied: ${reply})`
    : typeof e.responseCode === 'number'
      ? ` (server replied ${e.responseCode})`
      : '';
  const message = text(e.message) ?? '';

  if (code === 'EAUTH') {
    return `${host} rejected the SMTP username or password${responseCode}. Most providers (Zoho, Gmail, Microsoft 365) need the full email address as the username, and an app-specific password when two-factor sign-in is on.`;
  }
  if (code === 'EDNS') return `The SMTP host ${host} could not be found.`;
  if (code === 'ETIMEDOUT') return `Timed out connecting to ${host}:${port}.`;
  if (/certificate|ssl|tls|wrong version number/i.test(message)) {
    return `The secure connection to ${host}:${port} failed. Check the security mode: SSL/TLS for port 465, STARTTLS for 587.`;
  }
  if (code === 'ECONNECTION' || code === 'ESOCKET' || /ECONNREFUSED|ECONNRESET|EHOSTUNREACH/.test(message)) {
    return `Could not connect to ${host}:${port}. Check the host, port and security mode.`;
  }
  if (code === 'EENVELOPE') return `The SMTP server refused the sender or recipient address${responseCode}.`;
  return `The SMTP server did not accept the message${responseCode}.`;
}

/**
 * The server's own reply line, safe to show: one line, at most 200 characters,
 * with the account name and password removed should the server echo them.
 */
function serverReply(response: unknown, secrets: (string | null)[]): string | null {
  let reply = text(response)?.split(/\r?\n/)[0] ?? null;
  if (!reply) return null;
  for (const secret of secrets) {
    if (secret) reply = reply.split(secret).join('[redacted]');
  }
  return reply.replace(/[^\x20-\x7E]/g, '').slice(0, 200);
}

/**
 * Outgoing platform email. Every attempt is recorded in email_deliveries
 * (QUEUED → SENT or FAILED) and reported as it happened; the SMTP password
 * is encrypted at rest and never leaves this service.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Settings ─────────────────────────────────────────────────

  async getSmtpSettings() {
    const row = await this.prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: SMTP_SETTINGS_KEY } });
    const config = this.parse(row?.setting_value);
    return {
      configured: config !== null,
      host: config?.host ?? null,
      port: config?.port ?? null,
      encryption: config?.encryption ?? null,
      username: config?.username ?? null,
      hasPassword: Boolean(config?.passwordEncrypted),
      fromEmail: config?.fromEmail ?? null,
      fromName: config?.fromName ?? null,
      replyToEmail: config?.replyToEmail ?? null,
      updatedAt: row?.updated_at ?? null,
    };
  }

  async saveSmtpSettings(input: PlatformSmtpSettingsDto, actor: PlatformActor) {
    const current = this.parse(
      (await this.prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: SMTP_SETTINGS_KEY } }))?.setting_value,
    );
    const username = input.username || null;
    // A server without sign-in keeps no password; otherwise a new one replaces the stored one.
    const passwordEncrypted = !username
      ? null
      : input.password
        ? this.encrypt(input.password)
        : current?.passwordEncrypted ?? null;
    if (passwordEncrypted && input.encryption === 'NONE') {
      throw new BadRequestException('Choose STARTTLS or SSL/TLS: the password would otherwise be sent unencrypted.');
    }

    const value: SmtpConfig = {
      host: input.host.toLowerCase(),
      port: input.port,
      encryption: input.encryption,
      username,
      passwordEncrypted,
      fromEmail: input.fromEmail.toLowerCase(),
      fromName: input.fromName,
      replyToEmail: input.replyToEmail?.toLowerCase() || null,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_platform_settings.upsert({
        where: { setting_key: SMTP_SETTINGS_KEY },
        update: { setting_value: value as unknown as Prisma.InputJsonObject, updated_at: new Date() },
        create: {
          id: randomUUID(),
          setting_category: 'EMAIL',
          setting_key: SMTP_SETTINGS_KEY,
          setting_value: value as unknown as Prisma.InputJsonObject,
          description: 'Outgoing mail server for platform email (the password is encrypted)',
        },
      });
      await this.log(tx, actor, {
        category: 'SETTINGS',
        action: 'SMTP_SETTINGS_UPDATED',
        description: `Updated outgoing email settings (${value.host}:${value.port})`,
        metadata: {
          host: value.host,
          port: value.port,
          encryption: value.encryption,
          signsIn: Boolean(username),
          passwordReplaced: Boolean(username && input.password),
        },
      });
    });
    return this.getSmtpSettings();
  }

  /** Sends a real message through the saved settings and reports what the server said. */
  async sendTestEmail(recipient: string, actor: PlatformActor) {
    const outcome = await this.send({
      ...smtpTestEmail(await this.platformName(), new Date()),
      templateCode: 'SMTP_TEST',
      to: recipient,
      requestedBySuperAdminId: actor.superAdminId,
    });
    await this.log(this.prisma, actor, {
      category: 'SETTINGS',
      action: outcome.status === 'SENT' ? 'SMTP_TEST_SENT' : 'SMTP_TEST_FAILED',
      description: outcome.status === 'SENT' ? 'Sent an SMTP test email' : `SMTP test email not delivered: ${outcome.error}`,
      metadata: { deliveryId: outcome.deliveryId, status: outcome.status },
    });
    return outcome;
  }

  // ── Sending ──────────────────────────────────────────────────

  async sendTenantOnboardingEmail(
    content: Omit<TenantOnboardingContent, 'platformName' | 'supportEmail'>,
    meta: { tenantId: string; requestedBySuperAdminId: string | null },
  ): Promise<SendOutcome> {
    const branding = await this.branding();
    return this.send({
      ...tenantOnboardingEmail({ ...content, platformName: branding.platformName, supportEmail: branding.supportEmail }),
      templateCode: 'TENANT_ONBOARDING',
      to: content.ownerEmail,
      tenantId: meta.tenantId,
      requestedBySuperAdminId: meta.requestedBySuperAdminId,
    });
  }

  /**
   * One attempt: recorded as QUEUED before connecting, then SENT or FAILED
   * from the server's answer. The message body is not stored.
   */
  async send(email: OutgoingEmail): Promise<SendOutcome> {
    const config = this.parse(
      (await this.prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: SMTP_SETTINGS_KEY } }))?.setting_value,
    );
    if (!config) return { status: 'NOT_SENT', deliveryId: null, error: NOT_CONFIGURED };

    let transport: nodemailer.Transporter;
    try {
      transport = this.transport(config);
    } catch (error) {
      // The stored password is unreadable: nothing is attempted.
      return { status: 'NOT_SENT', deliveryId: null, error: error instanceof Error ? error.message : NOT_CONFIGURED };
    }

    const delivery = await this.prisma.rndtechnosoft_email_deliveries.create({
      data: {
        id: randomUUID(),
        tenant_id: email.tenantId ?? null,
        template_code: email.templateCode,
        recipient_email: email.to.toLowerCase(),
        subject: email.subject.slice(0, 300),
        delivery_status: 'QUEUED',
        requested_by_super_admin_id: email.requestedBySuperAdminId ?? null,
      },
    });

    try {
      const info = await transport.sendMail({
        from: { name: config.fromName, address: config.fromEmail },
        replyTo: config.replyToEmail ?? undefined,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: email.html,
      });
      await this.prisma.rndtechnosoft_email_deliveries.update({
        where: { id: delivery.id },
        data: {
          delivery_status: 'SENT',
          sent_at: new Date(),
          provider_message_id: text(info.messageId)?.slice(0, 255) ?? null,
          updated_at: new Date(),
        },
      });
      return { status: 'SENT', deliveryId: delivery.id, error: null };
    } catch (error) {
      const reason = describeSmtpFailure(error, config.host, config.port, [config.username, this.passwordFor(config)]);
      const e = asRecord(error);
      // Codes only: the server's reply text can echo the account name.
      this.logger.warn(
        `Email delivery failed deliveryId=${delivery.id} template=${email.templateCode} code=${text(e.code) ?? 'none'} responseCode=${String(e.responseCode ?? 'none')} command=${text(e.command) ?? 'none'}`,
      );
      await this.prisma.rndtechnosoft_email_deliveries.update({
        where: { id: delivery.id },
        data: { delivery_status: 'FAILED', failed_at: new Date(), error_message: reason.slice(0, 500), updated_at: new Date() },
      });
      return { status: 'FAILED', deliveryId: delivery.id, error: reason };
    }
  }

  // ── Internals ────────────────────────────────────────────────

  private passwordFor(config: SmtpConfig): string | null {
    return config.passwordEncrypted ? this.decrypt(config.passwordEncrypted) : null;
  }

  private transport(config: SmtpConfig) {
    const password = this.passwordFor(config);
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.encryption === 'SSL',
      requireTLS: config.encryption === 'TLS',
      ignoreTLS: config.encryption === 'NONE',
      auth: config.username && password ? { user: config.username, pass: password } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  private parse(raw: unknown): SmtpConfig | null {
    const value = asRecord(raw);
    const host = text(value.host);
    const fromEmail = text(value.fromEmail);
    if (!host || !fromEmail || typeof value.port !== 'number') return null;
    const encryption = value.encryption === 'SSL' || value.encryption === 'NONE' ? value.encryption : 'TLS';
    return {
      host,
      port: value.port,
      encryption,
      username: text(value.username),
      passwordEncrypted: text(value.passwordEncrypted),
      fromEmail,
      fromName: text(value.fromName) ?? fromEmail,
      replyToEmail: text(value.replyToEmail),
    };
  }

  private encrypt(plaintext: string): string {
    if (!isPlatformEncryptionConfigured()) {
      this.logger.error('Refusing to store the SMTP password: PLATFORM_ENCRYPTION_KEY is not configured.');
      throw new ServiceUnavailableException('The SMTP password cannot be stored securely on this server right now. Nothing was saved.');
    }
    return encryptPlatformSecret(plaintext);
  }

  private decrypt(stored: string): string {
    try {
      return decryptPlatformSecret(stored);
    } catch {
      this.logger.error('The stored SMTP password could not be decrypted.');
      throw new ServiceUnavailableException('The saved SMTP password can no longer be read. Enter it again in Global settings.');
    }
  }

  private async branding() {
    const row = await this.prisma.rndtechnosoft_platform_settings.findUnique({ where: { setting_key: 'platform_branding' } });
    const value = asRecord(row?.setting_value);
    return { platformName: text(value.platformName) ?? 'Voogyo', supportEmail: text(value.supportEmail) };
  }

  private async platformName() {
    return (await this.branding()).platformName;
  }

  private async log(
    db: Pick<Prisma.TransactionClient, 'rndtechnosoft_platform_activity_logs'>,
    actor: PlatformActor,
    entry: { category: string; action: string; description: string; metadata: Record<string, unknown> },
  ) {
    await db.rndtechnosoft_platform_activity_logs.create({
      data: {
        id: randomUUID(),
        super_admin_id: actor.superAdminId,
        category: entry.category,
        action: entry.action,
        description: entry.description.slice(0, 500),
        metadata: entry.metadata as Prisma.InputJsonValue,
        ip_address: actor.ipAddress ? actor.ipAddress.slice(0, 64) : null,
        user_agent: actor.userAgent ? actor.userAgent.slice(0, 255) : null,
      },
    });
  }
}
