import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { ImapFlow, MessageAddressObject, MessageStructureObject, SearchObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as nodemailer from 'nodemailer';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditService } from '@/modules/audit/audit.service';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
  isPlatformEncryptionConfigured,
} from '@/modules/super-admin/auth/platform-crypto.util';
import {
  GmailOAuthCallbackDto,
  GmailInboxQueryDto,
  GmailReplyDto,
  GmailSendMessageDto,
  GmailTemplateDto,
} from './dto/gmail.dto';
import {
  emailTextPreview,
  extractTextFromHtml,
  inspectBodyStructure,
} from './gmail-mailbox.util';

const GMAIL_HOST = 'imap.gmail.com';
const GMAIL_PORT = 993;
const GMAIL_SMTP_HOST = 'smtp.gmail.com';
const GMAIL_SMTP_PORT = 465;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const PREVIEW_SOURCE_BYTES = 12 * 1024;
const MAX_BODY_PART_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 26 * 1024 * 1024;

interface StoredConnection {
  id: string;
  tenant_id: string;
  user_id: string;
  gmail_email: string | null;
  refresh_token_encrypted: string | null;
  connection_status: string;
  connected_at: Date | null;
  oauth_state_expires_at?: Date | null;
}

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface StoredTemplate {
  id: string;
  template_name: string;
  category: string;
  subject: string;
  description: string | null;
  body_text: string;
  created_at: Date;
  updated_at: Date;
}

type JsonRecord = Record<string, unknown>;
type GmailFolder = 'inbox' | 'sent';

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async beginOAuth(tenantId: string, userId: string) {
    const oauth = this.oauthConfig();
    this.assertEncryptionConfigured();

    const state = randomBytes(32).toString('base64url');
    const stateHash = this.hashState(state);
    const stateExpiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);

    await this.prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO rndtechnosoft_gmail_connections
          (id, tenant_id, user_id, connection_status, oauth_state_hash, oauth_state_expires_at)
        VALUES
          (${randomUUID()}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'PENDING', ${stateHash}, ${stateExpiresAt})
        ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET oauth_state_hash = EXCLUDED.oauth_state_hash,
            oauth_state_expires_at = EXCLUDED.oauth_state_expires_at,
            updated_at = CURRENT_TIMESTAMP(6)
      `,
    );

    const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authorization.search = new URLSearchParams({
      client_id: oauth.clientId,
      redirect_uri: oauth.redirectUri,
      response_type: 'code',
      scope: ['openid', 'email', 'https://mail.google.com/'].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();

    return { authorizationUrl: authorization.toString() };
  }

  async handleOAuthCallback(query: GmailOAuthCallbackDto): Promise<string> {
    try {
      if (!query.state) throw new BadRequestException('OAuth state is missing.');
      if (query.error) {
        await this.failPendingOAuth(query.state, 'OAUTH_DENIED');
        return this.returnUrl('error');
      }
      if (!query.code) throw new BadRequestException('Authorization code is missing.');

      await this.completeOAuth(query.state, query.code);
      return this.returnUrl('connected');
    } catch (error) {
      this.logger.warn(`Gmail OAuth callback failed code=${this.safeErrorCode(error)}`);
      return this.returnUrl('error');
    }
  }

  async status(tenantId: string, userId: string) {
    const [connection] = await this.prisma.$queryRaw<
      Array<{ gmail_email: string | null; connection_status: string; connected_at: Date | null }>
    >(
      Prisma.sql`
        SELECT gmail_email, connection_status, connected_at
        FROM rndtechnosoft_gmail_connections
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
        LIMIT 1
      `,
    );

    return {
      connected: connection?.connection_status === 'CONNECTED',
      email: connection?.gmail_email ?? null,
      status: connection?.connection_status ?? 'DISCONNECTED',
      connectedAt: connection?.connected_at ?? null,
      requiresReconnect: connection?.connection_status === 'REAUTH_REQUIRED',
    };
  }

  async disconnect(tenantId: string, actor: AuthenticatedTenantUser) {
    const changed = await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE rndtechnosoft_gmail_connections
        SET refresh_token_encrypted = NULL,
            gmail_email = NULL,
            connection_status = 'DISCONNECTED',
            oauth_state_hash = NULL,
            oauth_state_expires_at = NULL,
            connected_at = NULL,
            disconnected_at = CURRENT_TIMESTAMP(6),
            last_error_code = NULL,
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${actor.userId}::uuid
      `,
    );

    if (changed > 0) {
      await this.audit.log({
        tenantId,
        actorUserId: actor.userId,
        actorTenantMemberId: actor.tenantMemberId,
        actionCode: 'GMAIL_DISCONNECTED',
        entityType: 'GMAIL_CONNECTION',
      });
    }

    return { success: true };
  }

  async listMessages(tenantId: string, userId: string, query: GmailInboxQueryDto) {
    const connection = await this.connection(tenantId, userId);
    const { folder, page, limit } = query;

    return this.withClient(connection, async (client) => {
      const lock = await client.getMailboxLock(await this.mailboxPath(client, folder), { readOnly: true });
      try {
        const criteria = this.searchCriteria(query);
        const filtered = Object.keys(criteria).length > 0;
        // ponytail: filtered searches materialize matching UIDs; move to ESEARCH PARTIAL if large mailboxes show latency.
        const matches = filtered ? (await client.search(criteria, { uid: true })) || [] : [];
        const total = filtered ? matches.length : (client.mailbox ? client.mailbox.exists : 0);
        const newestIndex = total - (page - 1) * limit;
        if (newestIndex < 1) return { items: [], page, limit, total, hasMore: false };

        const oldestIndex = Math.max(0, newestIndex - limit);
        const range = filtered ? matches.slice(oldestIndex, newestIndex) : `${oldestIndex + 1}:${newestIndex}`;
        const items = [];
        for await (const message of client.fetch(
          range,
          {
            uid: true,
            flags: true,
            envelope: true,
            internalDate: true,
            bodyStructure: true,
            source: { maxLength: PREVIEW_SOURCE_BYTES },
          },
          filtered ? { uid: true } : undefined,
        )) {
          const parsed = message.source
            ? await simpleParser(message.source, {
                skipTextToHtml: true,
                keepCidLinks: true,
                maxHtmlLengthToParse: PREVIEW_SOURCE_BYTES,
              }).catch(() => null)
            : null;
          const sender = message.envelope?.from?.[0];
          const preview = emailTextPreview(parsed?.text || (typeof parsed?.html === 'string' ? parsed.html : ''));
          items.push({
            id: message.envelope?.messageId || message.emailId || String(message.uid),
            uid: message.uid,
            from: this.address(sender),
            to: (message.envelope?.to ?? []).map((address) => this.address(address)),
            subject: message.envelope?.subject || '(No subject)',
            date: this.isoDate(message.internalDate || message.envelope?.date),
            preview,
            isRead: message.flags?.has('\\Seen') ?? false,
            hasAttachments: inspectBodyStructure(message.bodyStructure).attachments.length > 0,
          });
        }

        items.reverse();
        return { items, page, limit, total, hasMore: oldestIndex > 0 };
      } finally {
        lock.release();
      }
    });
  }

  async getMessage(tenantId: string, userId: string, uid: number, folder: GmailFolder = 'inbox') {
    const connection = await this.connection(tenantId, userId);

    return this.withClient(connection, async (client) => {
      const lock = await client.getMailboxLock(await this.mailboxPath(client, folder), { readOnly: folder === 'sent' });
      try {
        const message = await client.fetchOne(
          uid,
          { uid: true, flags: true, envelope: true, internalDate: true, bodyStructure: true },
          { uid: true },
        );
        if (!message) throw new NotFoundException('Email not found in this Gmail folder.');

        const parts = inspectBodyStructure(message.bodyStructure);
        const [plainText, html] = await Promise.all([
          this.downloadTextParts(client, uid, parts.plain, message.bodyStructure),
          this.downloadTextParts(client, uid, parts.html, message.bodyStructure),
        ]);

        if (folder === 'inbox' && !message.flags?.has('\\Seen')) {
          await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        }

        return {
          id: message.envelope?.messageId || message.emailId || String(message.uid),
          uid: message.uid,
          from: this.address(message.envelope?.from?.[0]),
          to: (message.envelope?.to ?? []).map((address) => this.address(address)),
          cc: (message.envelope?.cc ?? []).map((address) => this.address(address)),
          subject: message.envelope?.subject || '(No subject)',
          date: this.isoDate(message.internalDate || message.envelope?.date),
          plainText: plainText || (html ? extractTextFromHtml(html) : null),
          html,
          isRead: true,
          attachments: parts.attachments,
        };
      } finally {
        lock.release();
      }
    });
  }

  async downloadAttachment(tenantId: string, userId: string, uid: number, part: string, folder: GmailFolder = 'inbox') {
    if (!/^\d+(?:\.\d+)*$/.test(part)) throw new BadRequestException('Invalid attachment identifier.');
    const connection = await this.connection(tenantId, userId);

    return this.withClient(connection, async (client) => {
      const lock = await client.getMailboxLock(await this.mailboxPath(client, folder), { readOnly: true });
      try {
        const message = await client.fetchOne(uid, { bodyStructure: true }, { uid: true });
        if (!message) throw new NotFoundException('Email not found in this Gmail folder.');

        const attachment = inspectBodyStructure(message.bodyStructure).attachments.find((item) => item.id === part);
        if (!attachment) throw new NotFoundException('Attachment not found on this email.');
        if (attachment.size > MAX_ATTACHMENT_BYTES) {
          throw new PayloadTooLargeException('This attachment is larger than the 26 MB download limit.');
        }

        const downloaded = await client.download(uid, part, { uid: true, maxBytes: MAX_ATTACHMENT_BYTES + 1 });
        const content = await this.readStream(downloaded.content, MAX_ATTACHMENT_BYTES);
        return {
          filename: attachment.filename,
          contentType: downloaded.meta.contentType || attachment.contentType,
          content,
        };
      } finally {
        lock.release();
      }
    });
  }

  async sendMessage(tenantId: string, actor: AuthenticatedTenantUser, body: GmailSendMessageDto) {
    const connection = await this.connection(tenantId, actor.userId);
    const result = await this.sendViaGmail(connection, {
      to: body.to,
      cc: body.cc,
      bcc: body.bcc,
      subject: body.subject.trim(),
      text: body.text,
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: 'GMAIL_MESSAGE_SENT',
      entityType: 'GMAIL_CONNECTION',
      entityId: connection.id,
      metadata: { messageId: result.messageId, recipientCount: body.to.length + (body.cc?.length ?? 0) + (body.bcc?.length ?? 0) },
    });
    return { success: true, messageId: result.messageId };
  }

  async reply(tenantId: string, actor: AuthenticatedTenantUser, uid: number, body: GmailReplyDto) {
    const connection = await this.connection(tenantId, actor.userId);
    const original = await this.withClient(connection, async (client) => {
      const lock = await client.getMailboxLock('INBOX');
      try {
        const message = await client.fetchOne(uid, { envelope: true, flags: true }, { uid: true });
        if (!message || !message.envelope) throw new NotFoundException('Email not found in this Gmail inbox.');
        if (!message.flags?.has('\\Seen')) await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
        return message.envelope;
      } finally {
        lock.release();
      }
    });

    const ownEmail = connection.gmail_email!.toLowerCase();
    const primary = original.replyTo?.length ? original.replyTo : original.from;
    const to = this.uniqueEmails(primary ?? [], ownEmail);
    const cc = body.replyAll
      ? this.uniqueEmails([...(original.to ?? []), ...(original.cc ?? [])], ownEmail, new Set(to.map((email) => email.toLowerCase())))
      : [];
    if (to.length === 0) throw new BadRequestException('This message has no reply address.');

    const messageId = original.messageId?.trim();
    const result = await this.sendViaGmail(connection, {
      to,
      cc,
      subject: /^\s*re:/i.test(original.subject ?? '') ? original.subject : `Re: ${original.subject || '(No subject)'}`,
      text: body.text,
      inReplyTo: messageId,
      references: messageId,
    });

    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode: body.replyAll ? 'GMAIL_REPLY_ALL_SENT' : 'GMAIL_REPLY_SENT',
      entityType: 'GMAIL_MESSAGE',
      entityId: String(uid),
      metadata: { messageId: result.messageId, recipientCount: to.length + cc.length },
    });
    return { success: true, messageId: result.messageId };
  }

  async listTemplates(tenantId: string, page: number, limit: number, search?: string) {
    const offset = (page - 1) * limit;
    const pattern = search?.trim() ? `%${search.trim()}%` : null;
    const [items, counts] = await Promise.all([
      this.prisma.$queryRaw<StoredTemplate[]>(
        Prisma.sql`
          SELECT id, template_name, category, subject, description, body_text, created_at, updated_at
          FROM rndtechnosoft_email_templates
          WHERE tenant_id = ${tenantId}::uuid
            AND (${pattern}::text IS NULL
              OR template_name ILIKE ${pattern}
              OR category ILIKE ${pattern}
              OR subject ILIKE ${pattern})
          ORDER BY updated_at DESC, id DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      ),
      this.prisma.$queryRaw<Array<{ count: bigint }>>(
        Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM rndtechnosoft_email_templates
          WHERE tenant_id = ${tenantId}::uuid
            AND (${pattern}::text IS NULL
              OR template_name ILIKE ${pattern}
              OR category ILIKE ${pattern}
              OR subject ILIKE ${pattern})
        `,
      ),
    ]);
    const total = Number(counts[0]?.count ?? 0);
    return {
      items: items.map((item) => this.template(item)),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: offset + items.length < total,
    };
  }

  async createTemplate(tenantId: string, actor: AuthenticatedTenantUser, body: GmailTemplateDto) {
    const id = randomUUID();
    const [created] = await this.prisma.$queryRaw<StoredTemplate[]>(
      Prisma.sql`
        INSERT INTO rndtechnosoft_email_templates
          (id, tenant_id, template_name, category, subject, description, body_text)
        VALUES
          (${id}::uuid, ${tenantId}::uuid, ${body.title.trim()}, ${body.category.trim()}, ${body.subject.trim()}, ${text(body.description)}, ${body.body})
        RETURNING id, template_name, category, subject, description, body_text, created_at, updated_at
      `,
    );
    await this.auditTemplate(tenantId, actor, 'EMAIL_TEMPLATE_CREATED', id);
    return this.template(created);
  }

  async updateTemplate(tenantId: string, actor: AuthenticatedTenantUser, id: string, body: GmailTemplateDto) {
    const [updated] = await this.prisma.$queryRaw<StoredTemplate[]>(
      Prisma.sql`
        UPDATE rndtechnosoft_email_templates
        SET template_name = ${body.title.trim()},
            category = ${body.category.trim()},
            subject = ${body.subject.trim()},
            description = ${text(body.description)},
            body_text = ${body.body},
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid
        RETURNING id, template_name, category, subject, description, body_text, created_at, updated_at
      `,
    );
    if (!updated) throw new NotFoundException('Email template not found.');
    await this.auditTemplate(tenantId, actor, 'EMAIL_TEMPLATE_UPDATED', id);
    return this.template(updated);
  }

  async deleteTemplate(tenantId: string, actor: AuthenticatedTenantUser, id: string) {
    const deleted = await this.prisma.$executeRaw(
      Prisma.sql`DELETE FROM rndtechnosoft_email_templates WHERE tenant_id = ${tenantId}::uuid AND id = ${id}::uuid`,
    );
    if (deleted === 0) throw new NotFoundException('Email template not found.');
    await this.auditTemplate(tenantId, actor, 'EMAIL_TEMPLATE_DELETED', id);
    return { success: true };
  }

  private async sendViaGmail(connection: StoredConnection, options: nodemailer.SendMailOptions) {
    const accessToken = await this.refreshAccessToken(connection);
    const transport = nodemailer.createTransport({
      host: GMAIL_SMTP_HOST,
      port: GMAIL_SMTP_PORT,
      secure: true,
      auth: { type: 'OAuth2', user: connection.gmail_email!, accessToken },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      tls: { rejectUnauthorized: true, servername: GMAIL_SMTP_HOST },
    });

    try {
      return await transport.sendMail({ ...options, from: connection.gmail_email! });
    } catch (error) {
      if (this.isSmtpAuthenticationError(error)) {
        await this.markReauthRequired(connection.id, 'SMTP_AUTH_FAILED');
        throw new ConflictException('Gmail authorization expired or was revoked. Reconnect Gmail and try again.');
      }
      this.logger.warn(`Gmail SMTP operation failed connectionId=${connection.id} code=${this.safeErrorCode(error)}`);
      throw new ServiceUnavailableException('Gmail could not send this message. Try again shortly.');
    } finally {
      transport.close();
    }
  }

  private uniqueEmails(addresses: MessageAddressObject[], ownEmail: string, already = new Set<string>()): string[] {
    const emails: string[] = [];
    for (const address of addresses) {
      const email = address.address?.trim().toLowerCase();
      if (!email || email === ownEmail || already.has(email)) continue;
      already.add(email);
      emails.push(email);
    }
    return emails;
  }

  private template(row: StoredTemplate) {
    return {
      id: row.id,
      title: row.template_name,
      category: row.category,
      subject: row.subject,
      description: row.description ?? '',
      body: row.body_text,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  private async auditTemplate(
    tenantId: string,
    actor: AuthenticatedTenantUser,
    actionCode: string,
    templateId: string,
  ): Promise<void> {
    await this.audit.log({
      tenantId,
      actorUserId: actor.userId,
      actorTenantMemberId: actor.tenantMemberId,
      actionCode,
      entityType: 'EMAIL_TEMPLATE',
      entityId: templateId,
    });
  }

  private async completeOAuth(state: string, code: string): Promise<void> {
    const stateHash = this.hashState(state);
    const [connection] = await this.prisma.$queryRaw<StoredConnection[]>(
      Prisma.sql`
        UPDATE rndtechnosoft_gmail_connections
        SET oauth_state_hash = NULL,
            oauth_state_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE oauth_state_hash = ${stateHash}
          AND oauth_state_expires_at > CURRENT_TIMESTAMP(6)
        RETURNING id, tenant_id, user_id, gmail_email, refresh_token_encrypted,
                  connection_status, connected_at
      `,
    );
    if (!connection) throw new BadRequestException('OAuth state is invalid, expired, or already used.');

    try {
      const tokens = await this.exchangeAuthorizationCode(code);
      const accessToken = text(tokens.access_token);
      const refreshToken = text(tokens.refresh_token);
      if (!accessToken || !refreshToken) throw new BadRequestException('Google did not issue the required OAuth tokens.');

      const gmailEmail = await this.googleEmail(accessToken);
      await this.verifyImap(gmailEmail, accessToken);
      this.assertEncryptionConfigured();

      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE rndtechnosoft_gmail_connections
          SET gmail_email = ${gmailEmail},
              refresh_token_encrypted = ${encryptPlatformSecret(refreshToken)},
              connection_status = 'CONNECTED',
              connected_at = CURRENT_TIMESTAMP(6),
              disconnected_at = NULL,
              last_error_code = NULL,
              updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ${connection.id}::uuid
        `,
      );

      await this.audit.log({
        tenantId: connection.tenant_id,
        actorUserId: connection.user_id,
        actionCode: 'GMAIL_CONNECTED',
        entityType: 'GMAIL_CONNECTION',
        entityId: connection.id,
      });
    } catch (error) {
      await this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE rndtechnosoft_gmail_connections
          SET connection_status = ${connection.refresh_token_encrypted ? connection.connection_status : 'OAUTH_FAILED'},
              last_error_code = ${this.safeErrorCode(error)},
              updated_at = CURRENT_TIMESTAMP(6)
          WHERE id = ${connection.id}::uuid
        `,
      );
      throw error;
    }
  }

  private async failPendingOAuth(state: string, errorCode: string): Promise<void> {
    const stateHash = this.hashState(state);
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE rndtechnosoft_gmail_connections
        SET oauth_state_hash = NULL,
            oauth_state_expires_at = NULL,
            connection_status = CASE
              WHEN refresh_token_encrypted IS NULL THEN 'OAUTH_FAILED'
              ELSE connection_status
            END,
            last_error_code = ${errorCode},
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE oauth_state_hash = ${stateHash}
      `,
    );
  }

  private async connection(tenantId: string, userId: string): Promise<StoredConnection> {
    const [connection] = await this.prisma.$queryRaw<StoredConnection[]>(
      Prisma.sql`
        SELECT id, tenant_id, user_id, gmail_email, refresh_token_encrypted,
               connection_status, connected_at
        FROM rndtechnosoft_gmail_connections
        WHERE tenant_id = ${tenantId}::uuid AND user_id = ${userId}::uuid
        LIMIT 1
      `,
    );
    if (!connection || connection.connection_status !== 'CONNECTED' || !connection.gmail_email || !connection.refresh_token_encrypted) {
      throw new ConflictException('Connect Gmail before loading messages.');
    }
    return connection;
  }

  private async withClient<T>(connection: StoredConnection, action: (client: ImapFlow) => Promise<T>): Promise<T> {
    const accessToken = await this.refreshAccessToken(connection);
    const client = this.imapClient(connection.gmail_email!, accessToken);

    try {
      await client.connect();
      return await action(client);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (this.isImapAuthenticationError(error)) {
        await this.markReauthRequired(connection.id, 'IMAP_AUTH_FAILED');
        throw new ConflictException('Gmail authorization expired or was revoked. Reconnect Gmail and try again.');
      }
      this.logger.warn(`Gmail IMAP operation failed connectionId=${connection.id} code=${this.safeErrorCode(error)}`);
      throw new ServiceUnavailableException('Gmail could not be reached. Try again shortly.');
    } finally {
      client.close();
    }
  }

  private searchCriteria(query: GmailInboxQueryDto, now = new Date()): SearchObject {
    const criteria: SearchObject = {};
    if (text(query.search)) criteria.text = query.search!.trim();
    if (text(query.from)) criteria.from = query.from!.trim();
    if (text(query.to)) criteria.to = query.to!.trim();
    if (text(query.subject)) criteria.subject = query.subject!.trim();
    if (text(query.exclude)) criteria.not = { text: query.exclude!.trim() };
    if (query.unread) criteria.seen = false;
    if (query.sizeMb && query.sizeOperator) {
      criteria[query.sizeOperator] = Math.round(query.sizeMb * 1024 * 1024);
    }

    const relativeDays = { any: 0, '1d': 1, '7d': 7, '30d': 30, '1y': 365 }[query.dateRange ?? 'any'];
    if (relativeDays) criteria.since = new Date(now.getTime() - relativeDays * 86_400_000);

    if (query.date) {
      const [year, month, day] = query.date.split('-').map(Number);
      const center = new Date(Date.UTC(year, month - 1, day));
      if (
        center.getUTCFullYear() !== year ||
        center.getUTCMonth() !== month - 1 ||
        center.getUTCDate() !== day
      ) {
        throw new BadRequestException('Search date is invalid.');
      }
      const within = query.dateWithinDays ?? 0;
      criteria.since = new Date(center.getTime() - within * 86_400_000);
      criteria.before = new Date(center.getTime() + (within + 1) * 86_400_000);
    }

    const gmailTerms = [query.hasAttachment ? 'has:attachment' : '', query.excludePromotions ? '-category:promotions' : ''].filter(Boolean);
    if (gmailTerms.length) criteria.gmailraw = gmailTerms.join(' ');
    return criteria;
  }

  private async mailboxPath(client: ImapFlow, folder: GmailFolder): Promise<string> {
    if (folder === 'inbox') return 'INBOX';
    const sent = (await client.list()).find((mailbox) => mailbox.specialUse === '\\Sent');
    if (!sent) throw new NotFoundException('Gmail Sent mailbox is not available for this account.');
    return sent.path;
  }

  private imapClient(email: string, accessToken: string): ImapFlow {
    return new ImapFlow({
      host: GMAIL_HOST,
      port: GMAIL_PORT,
      secure: true,
      auth: { user: email, accessToken },
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
      maxLiteralSize: MAX_ATTACHMENT_BYTES + 1024 * 1024,
      maxResponseSize: MAX_ATTACHMENT_BYTES + 2 * 1024 * 1024,
      tls: { rejectUnauthorized: true, servername: GMAIL_HOST },
    });
  }

  private async verifyImap(email: string, accessToken: string): Promise<void> {
    const client = new ImapFlow({
      host: GMAIL_HOST,
      port: GMAIL_PORT,
      secure: true,
      auth: { user: email, accessToken },
      verifyOnly: true,
      logger: false,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      tls: { rejectUnauthorized: true, servername: GMAIL_HOST },
    });
    try {
      await client.connect();
    } finally {
      client.close();
    }
  }

  private async refreshAccessToken(connection: StoredConnection): Promise<string> {
    let refreshToken: string;
    try {
      refreshToken = decryptPlatformSecret(connection.refresh_token_encrypted!);
    } catch {
      throw new ServiceUnavailableException('The saved Gmail connection cannot be decrypted. Reconnect Gmail.');
    }

    const oauth = this.oauthConfig();
    const response = await this.googleRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const payload = asRecord(await response.json().catch(() => ({})));
    const accessToken = text(payload.access_token);
    if (!response.ok || !accessToken) {
      if (payload.error === 'invalid_grant') {
        await this.markReauthRequired(connection.id, 'TOKEN_REVOKED');
        throw new ConflictException('Gmail authorization expired or was revoked. Reconnect Gmail and try again.');
      }
      throw new ServiceUnavailableException('Google could not refresh the Gmail connection. Try again shortly.');
    }
    return accessToken;
  }

  private async exchangeAuthorizationCode(code: string): Promise<JsonRecord> {
    const oauth = this.oauthConfig();
    const response = await this.googleRequest('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: oauth.clientId,
        client_secret: oauth.clientSecret,
        redirect_uri: oauth.redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const payload = asRecord(await response.json().catch(() => ({})));
    if (!response.ok) throw new BadRequestException('Google rejected the OAuth authorization response.');
    return payload;
  }

  private async googleEmail(accessToken: string): Promise<string> {
    const response = await this.googleRequest('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = asRecord(await response.json().catch(() => ({})));
    const email = text(payload.email)?.toLowerCase();
    if (!response.ok || !email) throw new BadRequestException('Google did not return a Gmail email address.');
    return email;
  }

  private async googleRequest(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new ServiceUnavailableException('Google OAuth could not be reached. Try again shortly.');
    }
  }

  private async markReauthRequired(id: string, errorCode: string): Promise<void> {
    await this.prisma.$executeRaw(
      Prisma.sql`
        UPDATE rndtechnosoft_gmail_connections
        SET connection_status = 'REAUTH_REQUIRED',
            last_error_code = ${errorCode},
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE id = ${id}::uuid
      `,
    );
  }

  private async downloadTextParts(
    client: ImapFlow,
    uid: number,
    partIds: string[],
    structure?: MessageStructureObject,
  ): Promise<string | null> {
    const chunks: string[] = [];
    for (const partId of partIds) {
      const downloaded = await client.download(uid, partId, { uid: true, maxBytes: MAX_BODY_PART_BYTES });
      const buffer = await this.readStream(downloaded.content, MAX_BODY_PART_BYTES);
      const node = this.findPart(structure, partId);
      chunks.push(this.decodeText(buffer, downloaded.meta.charset || node?.parameters?.charset));
    }
    return chunks.length ? chunks.join('\n') : null;
  }

  private findPart(node: MessageStructureObject | undefined, partId: string): MessageStructureObject | undefined {
    if (!node) return undefined;
    if (node.part === partId) return node;
    for (const child of node.childNodes ?? []) {
      const found = this.findPart(child, partId);
      if (found) return found;
    }
    return undefined;
  }

  private async readStream(stream: NodeJS.ReadableStream, maxBytes: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      size += buffer.length;
      if (size > maxBytes) throw new PayloadTooLargeException('Downloaded email content exceeds the allowed size.');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  private decodeText(buffer: Buffer, charset?: string): string {
    try {
      return new TextDecoder(charset || 'utf-8').decode(buffer);
    } catch {
      return buffer.toString('utf8');
    }
  }

  private address(address?: MessageAddressObject) {
    return { name: address?.name || '', email: address?.address || '' };
  }

  private isoDate(value?: Date | string): string | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private oauthConfig(): OAuthConfig {
    const clientId = this.config.get<string>('GOOGLE_GMAIL_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('GOOGLE_GMAIL_CLIENT_SECRET')?.trim();
    const redirectUri = this.config.get<string>('GOOGLE_GMAIL_REDIRECT_URI')?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException('Gmail OAuth is not configured on this server.');
    }
    this.assertSafeUrl(redirectUri, 'Gmail OAuth callback');
    return { clientId, clientSecret, redirectUri };
  }

  private returnUrl(result: 'connected' | 'error'): string {
    const configured = this.config.get<string>('GMAIL_OAUTH_RETURN_URL')?.trim() || 'http://localhost:3000/emails';
    this.assertSafeUrl(configured, 'Gmail OAuth return');
    const url = new URL(configured);
    url.searchParams.set('gmail', result);
    return url.toString();
  }

  private assertSafeUrl(value: string, label: string): void {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ServiceUnavailableException(`${label} URL is invalid.`);
    }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const localDevelopment = local && this.config.get<string>('NODE_ENV') !== 'production';
    if (url.protocol !== 'https:' && !localDevelopment) {
      throw new ServiceUnavailableException(`${label} URL must use HTTPS outside local development.`);
    }
  }

  private assertEncryptionConfigured(): void {
    if (!isPlatformEncryptionConfigured()) {
      throw new ServiceUnavailableException('Encrypted secret storage is not configured on this server.');
    }
  }

  private hashState(state: string): string {
    return createHash('sha256').update(state).digest('hex');
  }

  private safeErrorCode(error: unknown): string {
    if (error instanceof HttpException) return `HTTP_${error.getStatus()}`;
    const value = asRecord(error);
    return text(value.code)?.replace(/[^A-Z0-9_-]/gi, '').slice(0, 64) || 'UNKNOWN';
  }

  private isImapAuthenticationError(error: unknown): boolean {
    const value = asRecord(error);
    const combined = `${text(value.code) || ''} ${text(value.message) || ''} ${text(value.responseText) || ''}`;
    return /AUTHENTICATIONFAILED|AUTHENTICATE|Invalid credentials|Authentication failed/i.test(combined);
  }

  private isSmtpAuthenticationError(error: unknown): boolean {
    const value = asRecord(error);
    const combined = `${text(value.code) || ''} ${text(value.message) || ''} ${text(value.response) || ''}`;
    return /EAUTH|Invalid credentials|Authentication failed|BadCredentials/i.test(combined);
  }
}
