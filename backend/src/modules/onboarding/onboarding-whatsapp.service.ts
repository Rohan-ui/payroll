import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { WhatsAppMessagingService } from '@/modules/crm/whatsapp/whatsapp-messaging.service';
import { OnboardingSendOutcome } from './onboarding-mailer.service';

/** The CRM message templates onboarding sends; each is mapped to an approved WhatsApp template in CRM → WhatsApp Templates. */
export const ONBOARDING_WHATSAPP_TEMPLATES = {
  FORM_INVITATION: 'ONBOARDING_FORM_INVITATION',
  NOT_ELIGIBLE: 'ONBOARDING_NOT_ELIGIBLE',
} as const;

const REDACTED = '[link removed]';

/**
 * Onboarding's WhatsApp messages, through the workspace's existing WhatsApp
 * integration (no second provider). The outcome uses the same shape as an
 * email's. A secret link sent in a message is removed from the stored
 * message log afterwards, so the log never holds a usable link.
 */
@Injectable()
export class OnboardingWhatsAppService {
  private readonly logger = new Logger(OnboardingWhatsAppService.name);

  constructor(private readonly prisma: PrismaService, private readonly messaging: WhatsAppMessagingService) {}

  async send(
    tenantId: string,
    input: { templateCode: string; phone: string | null; variables: Record<string, string>; memberId?: string; secret?: string },
  ): Promise<OnboardingSendOutcome> {
    const recipient = `WhatsApp ${input.phone ?? '(no number)'}`;
    if (!input.phone) return { recipient, status: 'NOT_SENT', duplicate: false, error: 'The candidate has no mobile number on record.' };

    let logId: string | undefined;
    try {
      const result = await this.messaging.sendMappedTemplateMessage(
        tenantId,
        { template_id: input.templateCode, recipient: input.phone, variables: input.variables },
        input.memberId,
      );
      logId = result.logId;
      return result.success
        ? { recipient, status: 'SENT', duplicate: false, error: null }
        : { recipient, status: 'FAILED', duplicate: false, error: result.error ?? 'WhatsApp did not accept the message.' };
    } catch (error) {
      // Not set up (no template mapped, no credentials) or refused by the provider: reported, never thrown.
      const message = error instanceof HttpException || error instanceof Error ? error.message : 'WhatsApp could not be reached.';
      const notConfigured = /not found|no active WhatsApp mapping|not configured|credentials/i.test(message);
      return {
        recipient,
        status: notConfigured ? 'NOT_SENT' : 'FAILED',
        duplicate: false,
        error: notConfigured
          ? `WhatsApp isn’t set up for this message. In CRM → WhatsApp Templates, create a template with the code ${input.templateCode} and map it to an approved WhatsApp template.`
          : message,
      };
    } finally {
      if (input.secret) await this.redact(tenantId, input.phone, input.secret, logId);
    }
  }

  /** Removes a secret link from the message log rows this send created. */
  private async redact(tenantId: string, phone: string, secret: string, logId: string | undefined) {
    try {
      const rows = await this.prisma.rndtechnosoft_crm_whatsapp_logs.findMany({
        where: logId ? { tenant_id: tenantId, id: logId } : { tenant_id: tenantId, created_at: { gte: new Date(Date.now() - 60_000) } },
        select: { id: true, resolved_variables: true, payload_sent: true, provider_response: true },
      });
      for (const row of rows) {
        const clean = (value: Prisma.JsonValue | null) =>
          value === null ? undefined : (JSON.parse(JSON.stringify(value).split(secret).join(REDACTED)) as Prisma.InputJsonValue);
        if (![row.resolved_variables, row.payload_sent, row.provider_response].some((v) => v !== null && JSON.stringify(v).includes(secret))) continue;
        await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: row.id } },
          data: { resolved_variables: clean(row.resolved_variables), payload_sent: clean(row.payload_sent), provider_response: clean(row.provider_response) },
        });
      }
    } catch (error) {
      this.logger.error(`Could not remove a link from the WhatsApp log for ${phone.slice(-4).padStart(phone.length, '*')}: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }
}
