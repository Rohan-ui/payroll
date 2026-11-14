import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { WebhookChallengeQueryDto } from './dto/whatsapp-webhook.dto';
import {
  decryptPlatformSecret,
  isPlatformEncryptionConfigured,
} from '@/modules/super-admin/auth/platform-crypto.util';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 1,
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 0,
};

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify Webhook challenge handshake from Meta / Otomat.
   * Standard Meta query parameters: hub.mode, hub.challenge, hub.verify_token.
   */
  async verifyChallenge(query: WebhookChallengeQueryDto): Promise<string> {
    const mode = query['hub.mode'] || 'subscribe';
    const token = query['hub.verify_token'] || query.token;
    const challenge = query['hub.challenge'] || query.challenge;

    if (mode !== 'subscribe' || !token) {
      throw new UnauthorizedException('Invalid webhook handshake parameters');
    }

    // Match against active tenant WhatsApp configs
    const configs = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findMany({
      where: { is_active: true },
      select: { id: true, tenant_id: true, webhook_verify_token_encrypted: true },
    });

    let matched = false;
    for (const cfg of configs) {
      if (!cfg.webhook_verify_token_encrypted) continue;
      let decrypted = cfg.webhook_verify_token_encrypted;
      try {
        if (decrypted.startsWith('v1.') && isPlatformEncryptionConfigured()) {
          decrypted = decryptPlatformSecret(decrypted);
        }
      } catch {
        // Fall back to stored literal
      }

      if (decrypted === token) {
        matched = true;
        this.logger.log(`Webhook handshake verified for tenant ${cfg.tenant_id}`);
        break;
      }
    }

    // Also check global fallback env if defined
    if (!matched && process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      matched = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN === token;
    }

    if (!matched) {
      this.logger.warn(`Webhook handshake rejected: token mismatch`);
      throw new UnauthorizedException('Verification token mismatch');
    }

    return challenge || 'OK';
  }

  /**
   * Process incoming Webhook event payload (status callbacks or incoming messages).
   */
  async handleWebhookPayload(payload: any, signatureHeader?: string): Promise<{ received: boolean; processed: boolean; duplicate?: boolean }> {
    if (!payload || typeof payload !== 'object') {
      return { received: false, processed: false };
    }

    // 1. Idempotency check via payload SHA-256 hash
    const rawString = JSON.stringify(payload);
    const hash = crypto.createHash('sha256').update(rawString).digest('hex');

    const existingEvent = await this.prisma.rndtechnosoft_crm_whatsapp_webhook_events.findFirst({
      where: { payload_hash: hash },
    });
    if (existingEvent) {
      return { received: true, processed: true, duplicate: true };
    }

    // 2. Identify sender hardware metadata / identifiers to resolve tenant
    const { phoneNumberId, vendorUid, displayPhoneNumber } = this.extractIdentifiers(payload);

    let matchingConfig: any = null;
    if (phoneNumberId) {
      matchingConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
        where: { from_phone_number_id: phoneNumberId, is_active: true },
      });
    }
    if (!matchingConfig && vendorUid) {
      matchingConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
        where: { vendor_uid: vendorUid, is_active: true },
      });
    }
    if (!matchingConfig && displayPhoneNumber) {
      matchingConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
        where: { sender_phone_number: displayPhoneNumber, is_active: true },
      });
    }

    const tenantId = matchingConfig?.tenant_id || null;
    const provider = matchingConfig?.provider || 'OTOMAT';

    if (!matchingConfig || !tenantId) {
      this.logger.warn('Webhook payload rejected: No active tenant matching provider identifiers found.');
      throw new UnauthorizedException('Unrecognized WhatsApp webhook origin or unconfigured tenant.');
    }

    // 3. Signature verification if app_secret is configured
    if (matchingConfig.app_secret_encrypted) {
      if (!signatureHeader) {
        throw new UnauthorizedException('Missing X-Hub-Signature-256 header.');
      }
      let appSecret = matchingConfig.app_secret_encrypted;
      try {
        if (appSecret.startsWith('v1.') && isPlatformEncryptionConfigured()) {
          appSecret = decryptPlatformSecret(appSecret);
        }
      } catch {
        // fallback
      }
      if (appSecret) {
        const expectedSig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawString).digest('hex');
        const expectedBuf = Buffer.from(expectedSig, 'utf8');
        const providedBuf = Buffer.from(signatureHeader, 'utf8');
        if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
          this.logger.warn(`Webhook signature mismatch for tenant ${tenantId}`);
          throw new UnauthorizedException('Invalid webhook signature.');
        }
      }
    }

    // 4. Record the raw webhook event and process within database transaction
    const eventId = randomUUID();
    const eventType = this.determineEventType(payload);

    await this.prisma.$transaction(async (tx) => {
      await tx.rndtechnosoft_crm_whatsapp_webhook_events.create({
        data: {
          id: eventId,
          tenant_id: tenantId,
          provider,
          event_type: eventType,
          event_payload: payload,
          payload_hash: hash,
          processed: true,
        },
      });

      // 5. Ingest Status Updates
      await this.processStatusUpdates(tx, payload, tenantId);

      // 6. Ingest Incoming Messages
      await this.processIncomingMessages(tx, payload, tenantId);
    });

    return { received: true, processed: true };
  }

  private extractIdentifiers(payload: any): { phoneNumberId?: string; vendorUid?: string; displayPhoneNumber?: string } {
    let phoneNumberId: string | undefined;
    let vendorUid: string | undefined;
    let displayPhoneNumber: string | undefined;

    // Standard Meta Cloud API
    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (value?.metadata) {
      phoneNumberId = value.metadata.phone_number_id;
      displayPhoneNumber = value.metadata.display_phone_number;
    }

    // Otomat payload variants
    if (payload.vendor_uid || payload.vendorUid) {
      vendorUid = payload.vendor_uid || payload.vendorUid;
    }
    if (payload.phone_number_id || payload.phoneNumberId) {
      phoneNumberId = payload.phone_number_id || payload.phoneNumberId;
    }
    if (payload.sender_phone_number || payload.senderPhone) {
      displayPhoneNumber = payload.sender_phone_number || payload.senderPhone;
    }

    return { phoneNumberId, vendorUid, displayPhoneNumber };
  }

  private determineEventType(payload: any): string {
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    if (value?.statuses && value.statuses.length > 0) return 'STATUS_UPDATE';
    if (value?.messages && value.messages.length > 0) return 'MESSAGE_RECEIVED';
    if (payload.statuses && payload.statuses.length > 0) return 'STATUS_UPDATE';
    if (payload.messages && payload.messages.length > 0) return 'MESSAGE_RECEIVED';
    return payload.event || payload.type || 'WHATSAPP_EVENT';
  }

  private async processStatusUpdates(client: any, payload: any, tenantId: string | null) {
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const statuses: any[] = value?.statuses || payload.statuses || [];

    for (const item of statuses) {
      const wamid = item.id;
      if (!wamid) continue;

      const rawStatus = (item.status || '').toUpperCase();
      let targetStatus = 'SENT';
      if (rawStatus === 'DELIVERED') targetStatus = 'DELIVERED';
      else if (rawStatus === 'READ') targetStatus = 'READ';
      else if (rawStatus === 'FAILED') targetStatus = 'FAILED';
      else if (rawStatus === 'SENT') targetStatus = 'SENT';

      // Find the log
      const queryWhere: any = { provider_message_id: wamid };
      if (tenantId) queryWhere.tenant_id = tenantId;

      const log = await client.rndtechnosoft_crm_whatsapp_logs.findFirst({
        where: queryWhere,
      });

      if (!log) {
        continue;
      }

      // Respect STATUS_PRIORITY — never downgrade from READ to DELIVERED or SENT
      const currentPriority = STATUS_PRIORITY[log.status] ?? 0;
      const newPriority = STATUS_PRIORITY[targetStatus] ?? 0;

      if (newPriority >= currentPriority || targetStatus === 'FAILED') {
        const errorMsg = item.errors?.[0]?.message || item.errors?.[0]?.title || null;
        await client.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: log.tenant_id, id: log.id } },
          data: {
            status: targetStatus,
            error_message: errorMsg || log.error_message,
            provider_response: {
              ...(typeof log.provider_response === 'object' && log.provider_response !== null ? log.provider_response : {}),
              latest_status_update: item,
            },
            updated_at: new Date(),
          },
        });
        this.logger.log(`WhatsApp log ${log.id} status updated to ${targetStatus} via webhook`);
      }
    }
  }

  private async processIncomingMessages(client: any, payload: any, tenantId: string | null) {
    if (!tenantId) return;

    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const messages: any[] = value?.messages || payload.messages || [];

    for (const msg of messages) {
      const from = msg.from; // customer phone number
      const textBody = msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || '[Media/Attachment]';

      if (!from) continue;

      // Clean phone number for lead lookup
      const digitsOnly = from.replace(/\D/g, '');
      const last10 = digitsOnly.slice(-10);

      // Look up lead in this tenant
      const lead = await client.rndtechnosoft_crm_leads.findFirst({
        where: {
          tenant_id: tenantId,
          phone: { contains: last10 },
        },
        select: { id: true, first_name: true, last_name: true },
      });

      if (lead) {
        // Record activity in lead history
        await client.rndtechnosoft_crm_lead_activities.create({
          data: {
            id: randomUUID(),
            tenant_id: tenantId,
            lead_id: lead.id,
            activity_type: 'OUTREACH_WHATSAPP_REPLY',
            title: 'WhatsApp Reply Received',
            description: `Customer replied: "${textBody.length > 200 ? textBody.slice(0, 197) + '...' : textBody}"`,
            created_at: new Date(),
          },
        }).catch((err: any) => {
          this.logger.warn(`Failed to record lead activity for incoming WhatsApp: ${err.message}`);
        });
      }
    }
  }
}
