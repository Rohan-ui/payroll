import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import { WhatsAppTemplateMappingService } from './whatsapp-template-mapping.service';
import { WhatsAppVariableResolverService } from './whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import { SendWhatsAppTemplateMessageDto } from './dto/whatsapp-template.dto';

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
   * Complete automated workflow:
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

    // 2. Retrieve active WhatsApp template mapping
    const mapping = await this.mappingService.getMappingByCrmTemplate(tenantId, crmTemplate.id);
    if (!mapping) {
      throw new BadRequestException(
        `CRM template "${crmTemplate.template_name}" (${crmTemplate.template_code}) has no active WhatsApp mapping. Please configure mapping in CRM WhatsApp Templates before sending.`,
      );
    }

    // 3. Resolve dynamic variables
    // Collect all variable keys that might be mapped
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

        // If associated with a Lead, record CRM lead activity
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
   * Refreshes delivery status of a sent message by checking external provider status API.
   * GET {{apiBaseUrl}}/{{vendorUid}}/contact/message-status?wamid={{messageId}}
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
      return this.prisma.rndtechnosoft_crm_whatsapp_logs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: logId } },
        data: {
          status: statusResult.status,
          provider_response: statusResult.raw || log.provider_response,
        },
      });
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

    if (query?.search) {
      where.OR = [
        { recipient_phone: { contains: query.search } },
        { template_name: { contains: query.search } },
        { provider_message_id: { contains: query.search } },
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

