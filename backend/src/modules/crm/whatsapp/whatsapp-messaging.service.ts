import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { WhatsAppTemplateMappingService } from './whatsapp-template-mapping.service';
import { WhatsAppVariableResolverService } from './whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import { SendWhatsAppTemplateMessageDto, SendWhatsAppTextMessageDto } from './dto/whatsapp-template.dto';

const STATUS_PRIORITY: Record<string, number> = {
  PENDING: 1,
  SENT: 2,
  DELIVERED: 3,
  READ: 4,
  FAILED: 0,
};

@Injectable()
export class WhatsAppMessagingService {
  private readonly logger = new Logger(WhatsAppMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mappingService: WhatsAppTemplateMappingService,
    private readonly variableResolver: WhatsAppVariableResolverService,
    private readonly payloadBuilder: WhatsAppPayloadBuilderService,
    private readonly provider: WhatsAppProviderService,
  ) {}

  /**
   * Complete automated workflow for Template messages:
   * 1. Identify CRM template
   * 2. Retrieve WhatsApp template mapping
   * 3. Resolve dynamic variables from CRM context / inputs
   * 4. Construct external WhatsApp API payload
   * 5. Send request to WhatsApp provider
   * 6. Store sending result, log and status details
   */
  async sendMappedTemplateMessage(
    tenantId: string,
    dto: SendWhatsAppTemplateMessageDto,
    memberId?: string,
  ) {
    // 1. Identify CRM template
    const crmTemplate = await this.mappingService.getCrmTemplate(tenantId, dto.template_id);

    // Validate optional lead or client belongs to this tenant
    if (dto.lead_id) {
      const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
        where: { id: dto.lead_id, tenant_id: tenantId },
      });
      if (!lead) {
        throw new NotFoundException(`Lead "${dto.lead_id}" not found.`);
      }
    }
    if (dto.client_id) {
      const client = await this.prisma.rndtechnosoft_crm_clients.findFirst({
        where: { id: dto.client_id, tenant_id: tenantId },
      });
      if (!client) {
        throw new NotFoundException(`Client "${dto.client_id}" not found.`);
      }
    }

    // 2. Retrieve active WhatsApp template mapping
    const mapping = await this.mappingService.getMappingByCrmTemplate(tenantId, crmTemplate.id);
    if (!mapping) {
      throw new BadRequestException(
        `CRM template "${crmTemplate.template_name}" (${crmTemplate.template_code}) has no active WhatsApp mapping. Please configure mapping in CRM WhatsApp Templates before sending.`,
      );
    }

    // 3. Resolve dynamic variables
    const neededKeys = new Set<string>();

    const templateVarKeys = this.variableResolver.extractVariables(crmTemplate.message_body);
    templateVarKeys.forEach((k) => neededKeys.add(k));

    if (mapping.body_mapping && typeof mapping.body_mapping === 'object') {
      Object.values(mapping.body_mapping).forEach((val) => {
        if (val) neededKeys.add(String(val).replace(/^\{\{|\}\}$/g, '').trim());
      });
    }

    if (mapping.header_mapping && typeof mapping.header_mapping === 'object') {
      Object.values(mapping.header_mapping).forEach((val) => {
        if (val) neededKeys.add(String(val).replace(/^\{\{|\}\}$/g, '').trim());
      });
    }

    // Also include any keys passed in explicit variables
    if (dto.variables && typeof dto.variables === 'object') {
      Object.keys(dto.variables).forEach((k) => neededKeys.add(k));
    }

    const resolution = await this.variableResolver.resolveVariables(Array.from(neededKeys), {
      tenantId,
      leadId: dto.lead_id || null,
      clientId: dto.client_id || null,
      explicitVariables: dto.variables || {},
    });

    // 4. Construct external WhatsApp API payload
    const recipientPhone = dto.recipient;
    const creds = await this.mappingService.getRawCredentials(tenantId);

    // Derive optional contact info from Lead if present
    let contactInfo: any = undefined;
    if (resolution.usedLead) {
      contactInfo = {
        first_name: resolution.usedLead.first_name || '',
        last_name: resolution.usedLead.last_name || '',
        email: resolution.usedLead.email || '',
        country: 'india',
        language_code: mapping.whatsapp_template_language || 'en',
      };
    }

    const payload = this.payloadBuilder.buildPayload({
      mapping: {
        whatsapp_template_name: mapping.whatsapp_template_name,
        whatsapp_template_language: mapping.whatsapp_template_language,
        body_mapping: mapping.body_mapping as any,
        header_mapping: mapping.header_mapping as any,
        media_type: mapping.media_type,
        media_mapping: mapping.media_mapping as any,
        button_mapping: mapping.button_mapping as any,
      },
      resolvedVariables: resolution.resolved,
      recipientPhone,
      fromPhoneNumberId: creds.fromPhoneNumberId,
      contact: contactInfo,
      overrides: {
        header_image: dto.header_image,
        header_video: dto.header_video,
        header_document: dto.header_document,
        header_document_name: dto.header_document_name,
        button_0: dto.button_0,
        button_1: dto.button_1,
        copy_code: dto.copy_code,
      },
    });

    // Create log record with status PENDING
    const logId = randomUUID();
    await this.prisma.rndtechnosoft_crm_whatsapp_logs.create({
      data: {
        id: logId,
        tenant_id: tenantId,
        crm_template_id: crmTemplate.id,
        whatsapp_mapping_id: mapping.id,
        lead_id: dto.lead_id || null,
        client_id: dto.client_id || null,
        recipient_phone: payload.phone_number,
        template_name: payload.template_name,
        template_language: payload.template_language,
        resolved_variables: resolution.resolved,
        payload_sent: payload,
        status: 'PENDING',
        sent_by_tenant_member_id: memberId || null,
      },
    });

    // 5. Send request to WhatsApp provider
    try {
      const result = await this.provider.sendTemplateMessage(payload, creds);

      if (result.success) {
        // Update log to SENT
        await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
          data: {
            status: 'SENT',
            provider_message_id: result.messageId || null,
            provider_response: result.rawResponse || null,
          },
        });

        // Record CRM lead activity
        if (dto.lead_id) {
          try {
            await this.prisma.rndtechnosoft_crm_lead_activities.create({
              data: {
                id: randomUUID(),
                tenant_id: tenantId,
                lead_id: dto.lead_id,
                activity_type: 'WHATSAPP_SENT',
                title: `Sent WhatsApp template: ${mapping.whatsapp_template_name}`,
                description: `Sent to ${payload.phone_number} using template "${crmTemplate.template_name}". Message ID: ${result.messageId || 'N/A'}`,
                performed_by_tenant_member_id: memberId || null,
              },
            });
          } catch (e: any) {
            this.logger.warn(`Could not log CRM activity: ${e.message}`);
          }
        }

        return {
          success: true,
          status: 'SENT',
          messageId: result.messageId,
          logId,
          recipient: payload.phone_number,
          templateName: payload.template_name,
          resolvedVariables: resolution.resolved,
          missingVariables: resolution.missing,
          payloadSent: payload,
          providerResponse: result.rawResponse,
        };
      } else {
        // Update log to FAILED
        await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
          data: {
            status: 'FAILED',
            error_message: result.error || 'Provider rejected message',
            provider_response: result.rawResponse || null,
          },
        });

        return {
          success: false,
          status: 'FAILED',
          error: result.error || 'Message sending failed',
          logId,
          recipient: payload.phone_number,
          payloadSent: payload,
          providerResponse: result.rawResponse,
        };
      }
    } catch (err: any) {
      await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
        data: {
          status: 'FAILED',
          error_message: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Dispatches a free-form plain text message (Postman: contact/send-message).
   */
  async sendTextMessage(
    tenantId: string,
    dto: SendWhatsAppTextMessageDto,
    memberId?: string,
  ) {
    const creds = await this.mappingService.getRawCredentials(tenantId);

    const rawRecipient = dto.recipient || dto.recipient_phone || dto.recipientPhone || '';
    if (!rawRecipient) {
      throw new BadRequestException('Recipient phone number is required.');
    }
    const sanitizedPhone = this.payloadBuilder.sanitizePhoneNumber(rawRecipient);
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      throw new BadRequestException(`Invalid recipient phone number "${dto.recipient}".`);
    }

    // Validate optional lead or client belongs to this tenant
    if (dto.lead_id) {
      const lead = await this.prisma.rndtechnosoft_crm_leads.findFirst({
        where: { id: dto.lead_id, tenant_id: tenantId },
      });
      if (!lead) {
        throw new NotFoundException(`Lead "${dto.lead_id}" not found.`);
      }
    }
    if (dto.client_id) {
      const client = await this.prisma.rndtechnosoft_crm_clients.findFirst({
        where: { id: dto.client_id, tenant_id: tenantId },
      });
      if (!client) {
        throw new NotFoundException(`Client "${dto.client_id}" not found.`);
      }
    }

    const logId = randomUUID();
    await this.prisma.rndtechnosoft_crm_whatsapp_logs.create({
      data: {
        id: logId,
        tenant_id: tenantId,
        lead_id: dto.lead_id || null,
        client_id: dto.client_id || null,
        recipient_phone: sanitizedPhone,
        template_name: '__text_message__',
        template_language: 'plain',
        resolved_variables: {},
        payload_sent: { message_body: dto.message, phone_number: sanitizedPhone },
        status: 'PENDING',
        sent_by_tenant_member_id: memberId || null,
      },
    });

    try {
      const result = await this.provider.sendMessage(
        {
          phone_number: sanitizedPhone,
          message_body: dto.message,
          from_phone_number_id: creds.fromPhoneNumberId,
        },
        creds,
      );

      if (result.success) {
        await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
          data: {
            status: 'SENT',
            provider_message_id: result.messageId || null,
            provider_response: result.rawResponse || null,
          },
        });

        if (dto.lead_id) {
          try {
            await this.prisma.rndtechnosoft_crm_lead_activities.create({
              data: {
                id: randomUUID(),
                tenant_id: tenantId,
                lead_id: dto.lead_id,
                activity_type: 'WHATSAPP_SENT',
                title: 'Sent WhatsApp text message',
                description: `Sent to ${sanitizedPhone}: "${dto.message.slice(0, 80)}..."`,
                performed_by_tenant_member_id: memberId || null,
              },
            });
          } catch {
            // Non-fatal activity log
          }
        }

        return {
          success: true,
          status: 'SENT',
          messageId: result.messageId,
          logId,
          recipient: sanitizedPhone,
        };
      } else {
        await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
          data: {
            status: 'FAILED',
            error_message: result.error || 'Provider rejected message',
            provider_response: result.rawResponse || null,
          },
        });

        return {
          success: false,
          status: 'FAILED',
          error: result.error,
          logId,
        };
      }
    } catch (err: any) {
      await this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
        data: {
          status: 'FAILED',
          error_message: err.message,
        },
      });
      throw err;
    }
  }

  /**
   * Re-attempts sending a previously failed message.
   */
  async retryMessage(tenantId: string, logId: string, memberId?: string) {
    const log = await this.prisma.rndtechnosoft_crm_whatsapp_logs.findFirst({
      where: { tenant_id: tenantId, id: logId },
    });

    if (!log) {
      throw new NotFoundException(`Message log "${logId}" not found.`);
    }

    const creds = await this.mappingService.getRawCredentials(tenantId);
    const payload = log.payload_sent as any;

    let result: any;
    if (log.template_name === '__text_message__') {
      result = await this.provider.sendMessage(
        {
          phone_number: log.recipient_phone,
          message_body: payload?.message_body || '',
          from_phone_number_id: creds.fromPhoneNumberId,
        },
        creds,
      );
    } else {
      result = await this.provider.sendTemplateMessage(payload, creds);
    }

    if (result.success) {
      return this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
        data: {
          status: 'SENT',
          provider_message_id: result.messageId || log.provider_message_id,
          provider_response: result.rawResponse || null,
          error_message: null,
          updated_at: new Date(),
        },
      });
    } else {
      return this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
        data: {
          status: 'FAILED',
          error_message: result.error || 'Retry rejected by provider',
          provider_response: result.rawResponse || null,
          updated_at: new Date(),
        },
      });
    }
  }

  /**
   * Refreshes delivery status of a sent message by checking external provider status API.
   * Safeguard: Never downgrades READ status to DELIVERED or SENT.
   */
  async refreshMessageStatus(tenantId: string, logId: string) {
    const log = await this.prisma.rndtechnosoft_crm_whatsapp_logs.findFirst({
      where: { tenant_id: tenantId, id: logId },
    });

    if (!log) {
      throw new NotFoundException(`Message log "${logId}" not found.`);
    }

    if (!log.provider_message_id) {
      return log;
    }

    const creds = await this.mappingService.getRawCredentials(tenantId);
    const statusResult = await this.provider.getMessageStatus(log.provider_message_id, creds);

    if (statusResult.status && statusResult.status !== log.status) {
      const currentPriority = STATUS_PRIORITY[log.status] || 0;
      const newPriority = STATUS_PRIORITY[statusResult.status] || 0;

      // Do not downgrade status (e.g. READ -> DELIVERED)
      if (newPriority >= currentPriority || statusResult.status === 'FAILED') {
        return this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
          where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
          data: {
            status: statusResult.status,
            provider_response: statusResult.raw || log.provider_response,
          },
        });
      }
    }

    return log;
  }

  /**
   * Retrieves message logs with pagination and filters.
   */
  async listLogs(
    tenantId: string,
    query?: { page?: number; limit?: number; status?: string; search?: string; leadId?: string },
  ) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query?.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {
      tenant_id: tenantId,
    };

    if (query?.status && query.status !== 'ALL') {
      where.status = query.status.toUpperCase();
    }

    if (query?.leadId) {
      where.lead_id = query.leadId;
    }

    if (query?.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { recipient_phone: { contains: term, mode: 'insensitive' } },
        { template_name: { contains: term, mode: 'insensitive' } },
        { provider_message_id: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.rndtechnosoft_crm_whatsapp_logs.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          rndtechnosoft_crm_message_templates: {
            select: { template_name: true, template_code: true },
          },
          rndtechnosoft_crm_leads: {
            select: { id: true, company_name: true, first_name: true, last_name: true, lead_code: true },
          },
        },
      }),
      this.prisma.rndtechnosoft_crm_whatsapp_logs.count({ where }),
    ]);

    return {
      rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getLog(tenantId: string, id: string) {
    const log = await this.prisma.rndtechnosoft_crm_whatsapp_logs.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_crm_message_templates: true,
        rndtechnosoft_crm_whatsapp_mappings: true,
        rndtechnosoft_crm_leads: true,
      },
    });

    if (!log) {
      throw new NotFoundException(`WhatsApp log "${id}" not found.`);
    }

    return log;
  }
}
