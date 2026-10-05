import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured } from '@/modules/super-admin/auth/platform-crypto.util';
import { UserMailAccountDto } from './dto/mail-account.dto';
import { describeImapFailure, describeSmtpFailure } from './mail-errors';
import { MailProvider, PROVIDER_PRESETS } from './mail-providers';
import { ImapCredentials, imapClient, SmtpCredentials, transportFor } from './mail-connections';


type Row = NonNullable<Awaited<ReturnType<PrismaService['rndtechnosoft_user_mail_accounts']['findFirst']>>>;

const ZOHO_PERSONAL_DOMAINS = new Set(['zoho.com', 'zohomail.com']);
const ZOHO_PAID_HOSTS: Record<string, string> = {
  'smtp.zoho.com': 'smtppro.zoho.com',
  'imap.zoho.com': 'imappro.zoho.com',
  'smtp.zoho.in': 'smtppro.zoho.in',
  'imap.zoho.in': 'imappro.zoho.in',
  'smtp.zoho.eu': 'smtppro.zoho.eu',
  'imap.zoho.eu': 'imappro.zoho.eu',
};

/**
 * Members' own mail accounts, one per member per workspace: SMTP to send as
 * themselves and, optionally, IMAP to read their inbox in the CRM. Every
 * operation acts on the signed-in member's own account; there is no way to
 * name another member's. Passwords are encrypted with the platform key,
 * never returned, and a saved password is only ever sent to the server it
 * was saved for: changing the server or username needs the password again.
 */
@Injectable()
export class UserMailAccountsService {
  private readonly logger = new Logger(UserMailAccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  // ── The member's own account ─────────────────────────────────

  async get(tenantId: string, actor: AuthenticatedTenantUser) {
    const [row, policy, gmail] = await Promise.all([
      this.row(tenantId, actor.userId),
      this.organizationSettings.emailPolicy(tenantId),
      this.prisma.rndtechnosoft_gmail_connections.findFirst({
        where: { tenant_id: tenantId, user_id: actor.userId },
        select: { gmail_email: true, connection_status: true },
      }),
    ]);
    const gmailConnected = gmail?.connection_status === 'CONNECTED' && Boolean(gmail.gmail_email);
    const personalReady = Boolean(row?.is_enabled && row.smtp_password_encrypted);
    return {
      policy: { personalAccounts: policy },
      gmail: { connected: gmailConnected, email: gmailConnected ? gmail?.gmail_email ?? null : null },
      // What an email this member starts goes out from, under the current policy.
      sendsFrom: policy !== 'ALLOWED' ? 'ORGANIZATION' : gmailConnected ? 'GMAIL' : personalReady ? 'PERSONAL' : 'ORGANIZATION',
      account: row ? this.shape(row) : null,
      providers: Object.entries(PROVIDER_PRESETS).map(([code, preset]) => ({ code, ...preset })),
    };
  }

  async save(tenantId: string, actor: AuthenticatedTenantUser, input: UserMailAccountDto) {
    const provider = input.provider as MailProvider;
    const preset = PROVIDER_PRESETS[provider];
    const smtpUsername = input.smtpUsername.trim();
    const smtpHost = this.normalizeZohoHost(provider, smtpUsername, input.smtpHost);
    const senderEmail = input.senderEmail.trim().toLowerCase();
    const imapUsername = input.imapEnabled ? input.imapUsername?.trim() || smtpUsername : null;
    const imapPasswordForSameMailbox = input.imapPassword && imapUsername?.toLowerCase() === smtpUsername.toLowerCase() ? input.imapPassword : undefined;
    if (preset.senderMustMatchUsername && senderEmail !== smtpUsername.toLowerCase()) {
      throw new BadRequestException(`${preset.label} only sends as the address you sign in with. Use ${smtpUsername.toLowerCase()} as the sender email, or choose "Another mail server" if your provider allows other addresses.`);
    }

    const current = await this.row(tenantId, actor.userId);
    // A saved password is only reused for the same server and username.
    const smtpSame = current !== null && current.smtp_host === smtpHost && current.smtp_port === input.smtpPort && current.smtp_username === smtpUsername;
    let smtpPasswordEncrypted: string | null;
    if (input.smtpPassword || imapPasswordForSameMailbox) smtpPasswordEncrypted = this.encrypt(input.smtpPassword ?? imapPasswordForSameMailbox!);
    else if (smtpSame && current?.smtp_password_encrypted) smtpPasswordEncrypted = current.smtp_password_encrypted;
    else throw new BadRequestException(current?.smtp_password_encrypted ? 'You changed the SMTP server or username: enter the password again.' : 'Enter the SMTP password or app password.');

    let imap: { host: string; port: number; security: string; username: string; passwordEncrypted: string | null } | null = null;
    if (input.imapEnabled) {
      if (!input.imapHost || !input.imapPort || !input.imapSecurity) throw new BadRequestException('Enter the IMAP host, port and security, or turn off reading your inbox.');
      const username = imapUsername!;
      const host = this.normalizeZohoHost(provider, username, input.imapHost);
      const usesSmtpPassword = input.imapUsesSmtpPassword !== false;
      const imapSame = current !== null && current.imap_enabled && current.imap_host === host && current.imap_port === input.imapPort && current.imap_username === username;
      let passwordEncrypted: string | null = null;
      if (usesSmtpPassword) {
        if (!input.smtpPassword && !current?.smtp_password_encrypted) throw new BadRequestException('Enter the password again to use it for reading your inbox on this server.');
      } else if (input.imapPassword) {
        passwordEncrypted = this.encrypt(input.imapPassword);
      } else if (imapSame && current?.imap_password_encrypted) {
        passwordEncrypted = current.imap_password_encrypted;
      } else {
        throw new BadRequestException('Enter the IMAP password.');
      }
      imap = { host, port: input.imapPort, security: input.imapSecurity, username, passwordEncrypted };
    }

    const smtpChanged = !current || !smtpSame || current.smtp_security !== input.smtpSecurity || Boolean(input.smtpPassword || imapPasswordForSameMailbox);
    const imapFieldsChanged =
      !current ||
      current.imap_enabled !== Boolean(imap) ||
      current.imap_host !== (imap?.host ?? null) ||
      current.imap_port !== (imap?.port ?? null) ||
      current.imap_security !== (imap?.security ?? null) ||
      current.imap_username !== (imap?.username ?? null);
    const imapPasswordChanged = Boolean(input.imapPassword) || (Boolean(imap) && !imap?.passwordEncrypted && Boolean(input.smtpPassword));
    const imapChanged = imapFieldsChanged || imapPasswordChanged;
    const data = {
      provider,
      smtp_host: smtpHost,
      smtp_port: input.smtpPort,
      smtp_security: input.smtpSecurity,
      smtp_username: smtpUsername,
      smtp_password_encrypted: smtpPasswordEncrypted,
      sender_email: senderEmail,
      sender_name: input.senderName?.trim() || null,
      reply_to_email: input.replyToEmail?.trim().toLowerCase() || null,
      imap_enabled: Boolean(imap),
      imap_host: imap?.host ?? null,
      imap_port: imap?.port ?? null,
      imap_security: imap?.security ?? null,
      imap_username: imap?.username ?? null,
      imap_password_encrypted: imap?.passwordEncrypted ?? null,
      is_enabled: true,
      ...(smtpChanged ? { smtp_status: 'UNTESTED', smtp_last_error: null } : {}),
      ...(imapChanged ? { imap_status: imap ? 'UNTESTED' : 'DISCONNECTED', imap_last_error: null } : {}),
      updated_at: new Date(),
    };
    await this.prisma.rndtechnosoft_user_mail_accounts.upsert({
      where: { tenant_id_user_id: { tenant_id: tenantId, user_id: actor.userId } },
      create: { id: randomUUID(), tenant_id: tenantId, user_id: actor.userId, ...data },
      update: { ...data, credential_version: { increment: 1 } },
    });
    await this.log(tenantId, actor, current ? 'MAIL_ACCOUNT_UPDATED' : 'MAIL_ACCOUNT_CONNECTED', {
      provider,
      smtpHost,
      smtpPort: input.smtpPort,
      senderEmail,
      imapEnabled: Boolean(imap),
      passwordReplaced: Boolean(input.smtpPassword || input.imapPassword || imapPasswordForSameMailbox),
    });
    return this.get(tenantId, actor);
  }

  /** Forgets the passwords and stops using the account. Settings stay so reconnecting is quick. */
  async disconnect(tenantId: string, actor: AuthenticatedTenantUser) {
    const current = await this.row(tenantId, actor.userId);
    if (!current) throw new NotFoundException('You have no mail account to disconnect.');
    await this.prisma.rndtechnosoft_user_mail_accounts.update({
      where: { tenant_id_user_id: { tenant_id: tenantId, user_id: actor.userId } },
      data: {
        is_enabled: false,
        smtp_password_encrypted: null,
        imap_password_encrypted: null,
        imap_enabled: false,
        smtp_status: 'DISCONNECTED',
        imap_status: 'DISCONNECTED',
        smtp_last_error: null,
        imap_last_error: null,
        credential_version: { increment: 1 },
        updated_at: new Date(),
      },
    });
    await this.log(tenantId, actor, 'MAIL_ACCOUNT_DISCONNECTED', { senderEmail: current.sender_email });
    return this.get(tenantId, actor);
  }

  /** Signs in to the saved SMTP server without sending anything. */
  async testSmtp(tenantId: string, actor: AuthenticatedTenantUser) {
    const row = await this.enabledRow(tenantId, actor.userId);
    const smtp = this.smtpOf(row);
    const started = Date.now();
    const transport = transportFor(smtp, { connection: 8_000, greeting: 6_000, socket: 10_000 });
    try {
      await transport.verify();
      await this.record(row, 'smtp', null);
      return { ok: true, message: `Connected to ${smtp.host}:${smtp.port} and signed in (${Date.now() - started} ms).` };
    } catch (error) {
      const reason = describeSmtpFailure(error, smtp.host, smtp.port, [smtp.username, smtp.password]);
      await this.record(row, 'smtp', reason);
      return { ok: false, message: reason };
    } finally {
      transport.close();
    }
  }

  /** Signs in to the saved IMAP server without reading any mail. */
  async testImap(tenantId: string, actor: AuthenticatedTenantUser) {
    const row = await this.enabledRow(tenantId, actor.userId);
    const imap = this.imapOf(row);
    if (!imap) throw new ConflictException('Turn on reading your inbox and save the IMAP settings first.');
    const client = imapClient(imap, { verifyOnly: true });
    try {
      await client.connect();
      await this.record(row, 'imap', null);
      return { ok: true, message: `Connected to ${imap.host}:${imap.port} and signed in.` };
    } catch (error) {
      const reason = describeImapFailure(error, imap.host, imap.port);
      await this.record(row, 'imap', reason);
      return { ok: false, message: reason };
    } finally {
      client.close();
    }
  }

  /** Sends one email the member asked for, to the address they typed, through their own account. */
  async sendTestEmail(tenantId: string, actor: AuthenticatedTenantUser, recipient: string) {
    const row = await this.enabledRow(tenantId, actor.userId);
    const smtp = this.smtpOf(row);
    const transport = transportFor(smtp);
    const to = recipient.trim().toLowerCase();
    try {
      await transport.sendMail({
        from: { name: row.sender_name ?? row.sender_email, address: row.sender_email },
        replyTo: row.reply_to_email ?? undefined,
        to,
        subject: 'Test email from Voogyo',
        text: `This is a test email you sent from Voogyo through your mail account (${row.sender_email}). If it arrived, Voogyo can send email as you.`,
      });
      await this.record(row, 'smtp', null);
      await this.log(tenantId, actor, 'MAIL_ACCOUNT_TEST_EMAIL_SENT', { recipient: to, senderEmail: row.sender_email });
      return { ok: true, message: `The test email was accepted by ${smtp.host} for delivery to ${to}.` };
    } catch (error) {
      const reason = describeSmtpFailure(error, smtp.host, smtp.port, [smtp.username, smtp.password]);
      await this.record(row, 'smtp', reason);
      await this.log(tenantId, actor, 'MAIL_ACCOUNT_TEST_EMAIL_FAILED', { recipient: to, senderEmail: row.sender_email, reason });
      return { ok: false, message: reason };
    } finally {
      transport.close();
    }
  }

  // ── For administrators ───────────────────────────────────────

  /** Which members have connected a mail account, and its state. Never a credential. */
  async memberStatuses(tenantId: string) {
    const [members, accounts, gmail] = await Promise.all([
      this.prisma.rndtechnosoft_tenant_members.findMany({
        where: { tenant_id: tenantId, membership_status: 'ACTIVE', archived_at: null },
        select: { user_id: true, rndtechnosoft_users: { select: { display_name: true, email: true } } },
        take: 1000,
      }),
      this.prisma.rndtechnosoft_user_mail_accounts.findMany({ where: { tenant_id: tenantId } }),
      this.prisma.rndtechnosoft_gmail_connections.findMany({ where: { tenant_id: tenantId, connection_status: 'CONNECTED' }, select: { user_id: true, gmail_email: true } }),
    ]);
    return members
      .map((m) => {
        const account = accounts.find((a) => a.user_id === m.user_id);
        const google = gmail.find((g) => g.user_id === m.user_id);
        return {
          name: m.rndtechnosoft_users.display_name || m.rndtechnosoft_users.email,
          loginEmail: m.rndtechnosoft_users.email,
          gmail: google?.gmail_email ?? null,
          account: account
            ? {
                provider: account.provider,
                senderEmail: account.sender_email,
                enabled: account.is_enabled,
                smtpStatus: account.smtp_status,
                smtpLastSuccessAt: account.smtp_last_success_at,
                imapEnabled: account.imap_enabled,
                imapStatus: account.imap_status,
              }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // ── For the senders ──────────────────────────────────────────

  /** The member's enabled account, ready to send as them. For server-side senders only. */
  async smtpFor(tenantId: string, userId: string) {
    const row = await this.row(tenantId, userId);
    if (!row?.is_enabled || !row.smtp_password_encrypted) return null;
    return { senderEmail: row.sender_email, senderName: row.sender_name, replyToEmail: row.reply_to_email, smtp: this.smtpOf(row) };
  }

  /** The member's enabled inbox, for reading it. For server-side readers only. */
  async imapFor(tenantId: string, userId: string) {
    const row = await this.row(tenantId, userId);
    if (!row?.is_enabled || !row.imap_enabled) return null;
    const imap = this.imapOf(row);
    return imap ? { accountId: row.id, email: row.sender_email, imap } : null;
  }

  /** Records a failed inbox sign-in, so the member sees it in their settings. */
  async recordImapFailure(accountId: string, reason: string) {
    await this.prisma.rndtechnosoft_user_mail_accounts.updateMany({
      where: { id: accountId },
      data: { imap_status: 'FAILED', imap_last_tested_at: new Date(), imap_last_error: reason.slice(0, 500), updated_at: new Date() },
    });
  }

  // ── Internals ────────────────────────────────────────────────

  private row(tenantId: string, userId: string) {
    return this.prisma.rndtechnosoft_user_mail_accounts.findFirst({ where: { tenant_id: tenantId, user_id: userId } });
  }

  private async enabledRow(tenantId: string, userId: string) {
    const row = await this.row(tenantId, userId);
    if (!row || !row.is_enabled || !row.smtp_password_encrypted) throw new ConflictException('Save your mail account first.');
    return row;
  }

  private smtpOf(row: Row): SmtpCredentials {
    return {
      host: row.smtp_host,
      port: row.smtp_port,
      username: row.smtp_username,
      password: this.decrypt(row.smtp_password_encrypted),
      security: row.smtp_security === 'SSL' ? 'SSL' : 'STARTTLS',
    };
  }

  private imapOf(row: Row): ImapCredentials | null {
    if (!row.imap_enabled || !row.imap_host || !row.imap_port || !row.imap_username) return null;
    const password = this.decrypt(row.imap_password_encrypted ?? row.smtp_password_encrypted);
    if (!password) return null;
    return { host: row.imap_host, port: row.imap_port, security: row.imap_security === 'STARTTLS' ? 'STARTTLS' : 'SSL', username: row.imap_username, password };
  }

  private async record(row: Row, kind: 'smtp' | 'imap', failure: string | null) {
    const now = new Date();
    await this.prisma.rndtechnosoft_user_mail_accounts.updateMany({
      // Only the version that was tested: a test racing a change of settings doesn't mark the new ones.
      where: { id: row.id, credential_version: row.credential_version },
      data:
        kind === 'smtp'
          ? { smtp_status: failure ? 'FAILED' : 'CONNECTED', smtp_last_tested_at: now, ...(failure ? { smtp_last_error: failure.slice(0, 500) } : { smtp_last_success_at: now, smtp_last_error: null }) }
          : { imap_status: failure ? 'FAILED' : 'CONNECTED', imap_last_tested_at: now, ...(failure ? { imap_last_error: failure.slice(0, 500) } : { imap_last_success_at: now, imap_last_error: null }) },
    });
  }

  private shape(row: Row) {
    return {
      provider: row.provider,
      smtpHost: row.smtp_host,
      smtpPort: row.smtp_port,
      smtpSecurity: row.smtp_security,
      smtpUsername: row.smtp_username,
      hasSmtpPassword: Boolean(row.smtp_password_encrypted),
      senderEmail: row.sender_email,
      senderName: row.sender_name,
      replyToEmail: row.reply_to_email,
      imapEnabled: row.imap_enabled,
      imapHost: row.imap_host,
      imapPort: row.imap_port,
      imapSecurity: row.imap_security,
      imapUsername: row.imap_username,
      imapUsesSmtpPassword: row.imap_enabled && !row.imap_password_encrypted,
      hasImapPassword: Boolean(row.imap_password_encrypted),
      enabled: row.is_enabled,
      smtpStatus: row.smtp_status,
      smtpLastTestedAt: row.smtp_last_tested_at,
      smtpLastSuccessAt: row.smtp_last_success_at,
      smtpLastError: row.smtp_last_error,
      imapStatus: row.imap_status,
      imapLastTestedAt: row.imap_last_tested_at,
      imapLastSuccessAt: row.imap_last_success_at,
      imapLastError: row.imap_last_error,
      updatedAt: row.updated_at,
    };
  }

  private encrypt(plaintext: string) {
    if (!isPlatformEncryptionConfigured()) {
      this.logger.error('Refusing to store a mail password: PLATFORM_ENCRYPTION_KEY is not configured.');
      throw new ServiceUnavailableException('Passwords cannot be stored securely on this server right now. Nothing was saved; contact support.');
    }
    return encryptPlatformSecret(plaintext);
  }

  private decrypt(stored: string | null): string | null {
    if (!stored) return null;
    try {
      return decryptPlatformSecret(stored);
    } catch {
      this.logger.error('A saved mail password could not be decrypted.');
      throw new ConflictException('Your saved mail password can no longer be read. Enter it again in My email settings.');
    }
  }

  private normalizeZohoHost(provider: MailProvider, username: string, host: string): string {
    const value = host.trim().toLowerCase();
    if (provider !== 'ZOHO') return value;
    const domain = username.toLowerCase().split('@').at(1);
    if (!domain || ZOHO_PERSONAL_DOMAINS.has(domain)) return value;
    return ZOHO_PAID_HOSTS[value] ?? value;
  }

  private log(tenantId: string, actor: AuthenticatedTenantUser, actionCode: string, metadata: Record<string, unknown>) {
    return this.audit.log({ tenantId, actorUserId: actor.userId, actorTenantMemberId: actor.tenantMemberId, actionCode, entityType: 'USER_MAIL_ACCOUNT', metadata });
  }
}
