import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma/prisma.service';
import {
  CreateCrmTemplateDto,
  CreateWhatsAppMappingDto,
  PreviewTemplateDto,
  SaveWhatsAppConfigDto,
  UpdateCrmTemplateDto,
  UpdateWhatsAppMappingDto,
} from './dto/whatsapp-template.dto';
import { WhatsAppVariableResolverService } from './whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';
import {
  decryptPlatformSecret,
  encryptPlatformSecret,
  isPlatformEncryptionConfigured,
} from '@/modules/super-admin/auth/platform-crypto.util';

@Injectable()
export class WhatsAppTemplateMappingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly variableResolver: WhatsAppVariableResolverService,
    private readonly payloadBuilder: WhatsAppPayloadBuilderService,
  ) {}

  // ==========================================
  // 1. CRM MESSAGE TEMPLATES
  // ==========================================

  async listCrmTemplates(tenantId: string) {
    // await this.seedDefaultTemplatesIfEmpty(tenantId);
    return this.prisma.rndtechnosoft_crm_message_templates.findMany({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_crm_whatsapp_mappings: {
          select: {
            id: true,
            whatsapp_template_name: true,
            whatsapp_template_language: true,
            is_active: true,
            updated_at: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async getCrmTemplate(tenantId: string, idOrCode: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
    const template = await this.prisma.rndtechnosoft_crm_message_templates.findFirst({
      where: {
        tenant_id: tenantId,
        ...(isUuid ? { id: idOrCode } : { template_code: idOrCode }),
      },
      include: {
        rndtechnosoft_crm_whatsapp_mappings: true,
      },
    });

    if (!template) {
      throw new NotFoundException(`CRM Message Template "${idOrCode}" not found.`);
    }

    return template;
  }

  async createCrmTemplate(tenantId: string, dto: CreateCrmTemplateDto, memberId?: string) {
    const existing = await this.prisma.rndtechnosoft_crm_message_templates.findFirst({
      where: { tenant_id: tenantId, template_code: dto.template_code.trim() },
    });
    if (existing) {
      throw new ConflictException(`Template with code "${dto.template_code}" already exists.`);
    }

    const detected = this.variableResolver.extractVariables(dto.message_body);

    return this.prisma.rndtechnosoft_crm_message_templates.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        template_code: dto.template_code.trim(),
        template_name: dto.template_name.trim(),
        category: (dto.category || 'GENERAL').trim(),
        channel: (dto.channel || 'WHATSAPP').trim(),
        message_body: dto.message_body,
        detected_variables: detected,
        description: dto.description?.trim() || null,
        is_active: dto.is_active !== undefined ? dto.is_active : true,
        created_by_tenant_member_id: memberId || null,
        updated_by_tenant_member_id: memberId || null,
      },
    });
  }

  async updateCrmTemplate(tenantId: string, id: string, dto: UpdateCrmTemplateDto, memberId?: string) {
    const template = await this.getCrmTemplate(tenantId, id);

    const data: any = {
      updated_by_tenant_member_id: memberId || null,
    };

    if (dto.template_name !== undefined) data.template_name = dto.template_name.trim();
    if (dto.category !== undefined) data.category = dto.category.trim();
    if (dto.description !== undefined) data.description = dto.description.trim() || null;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;

    if (dto.message_body !== undefined) {
      data.message_body = dto.message_body;
      data.detected_variables = this.variableResolver.extractVariables(dto.message_body);
    }

    return this.prisma.rndtechnosoft_crm_message_templates.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: template.id } },
      data,
    });
  }

  async deleteCrmTemplate(tenantId: string, id: string) {
    const template = await this.getCrmTemplate(tenantId, id);
    await this.prisma.rndtechnosoft_crm_message_templates.delete({
      where: { tenant_id_id: { tenant_id: tenantId, id: template.id } },
    });
    return { success: true, message: `Template "${template.template_name}" deleted.` };
  }

  // ==========================================
  // 2. WHATSAPP PROVIDER CONFIGURATION
  // ==========================================

  async getConfig(tenantId: string) {
    const config = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
      where: { tenant_id: tenantId, is_default: true },
    });

    if (!config) {
      // Check if tenant organization settings has whatsapp configured
      try {
        const tenantSettings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
          where: { tenant_id: tenantId },
        });
        const wa = (tenantSettings?.settings as any)?.whatsapp;
        if (wa && (wa.vendorUid || wa.phoneNumberId)) {
          return {
            id: 'org-settings-whatsapp',
            is_configured: true,
            account_name: 'Organization Otomat Gateway',
            api_base_url: wa.apiBaseUrl || 'https://otomat.in/api',
            vendor_uid: wa.vendorUid || wa.phoneNumberId || '',
            bearer_token_masked: (wa.accessTokenEncrypted || wa.accessToken) ? '••••••••' : '',
            from_phone_number_id: wa.phoneNumberId || '',
            is_active: wa.isActive !== false,
          };
        }
      } catch {
        // Fall through
      }

      return {
        is_configured: false,
        account_name: 'Default WhatsApp Account',
        api_base_url: process.env.WHATSAPP_API_BASE_URL || 'https://otomat.in/api',
        vendor_uid: process.env.WHATSAPP_VENDOR_UID || '',
        bearer_token_masked: process.env.WHATSAPP_BEARER_TOKEN ? '••••••••' : '',
        from_phone_number_id: process.env.WHATSAPP_DEFAULT_PHONE_NUMBER_ID || '',
        is_active: true,
      };
    }

    let tokenMasked = '';
    if (config.bearer_token_encrypted) {
      tokenMasked = '••••••••';
    }

    return {
      id: config.id,
      is_configured: true,
      account_name: config.account_name,
      api_base_url: config.api_base_url || 'https://otomat.in/api',
      vendor_uid: config.vendor_uid,
      bearer_token_masked: tokenMasked,
      from_phone_number_id: config.from_phone_number_id || '',
      is_active: config.is_active,
      updated_at: config.updated_at,
    };
  }

  async getRawCredentials(tenantId: string) {
    const config = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
      where: { tenant_id: tenantId, is_default: true, is_active: true },
    });

    if (!config) {
      // Fallback to Organization Settings if configured there
      try {
        const tenantSettings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
          where: { tenant_id: tenantId },
        });
        const wa = (tenantSettings?.settings as any)?.whatsapp;
        if (wa && (wa.vendorUid || wa.phoneNumberId)) {
          let token = '';
          if (wa.accessTokenEncrypted) {
            try {
              token = wa.accessTokenEncrypted.startsWith('v1.') && isPlatformEncryptionConfigured()
                ? decryptPlatformSecret(wa.accessTokenEncrypted)
                : wa.accessTokenEncrypted;
            } catch {
              token = wa.accessTokenEncrypted;
            }
          }
          return {
            apiBaseUrl: (wa.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, ''),
            vendorUid: (wa.vendorUid || wa.phoneNumberId || '').trim(),
            bearerToken: (token || wa.accessToken || wa.vendorUid || '').trim(),
            fromPhoneNumberId: (wa.phoneNumberId || '').trim() || undefined,
          };
        }
      } catch {
        // Fall through
      }

      return {
        apiBaseUrl: (process.env.WHATSAPP_API_BASE_URL || 'https://otomat.in/api').replace(/\/+$/, ''),
        vendorUid: process.env.WHATSAPP_VENDOR_UID || '',
        bearerToken: process.env.WHATSAPP_BEARER_TOKEN || '',
        fromPhoneNumberId: process.env.WHATSAPP_DEFAULT_PHONE_NUMBER_ID || '',
      };
    }

    let decryptedToken = '';
    if (config.bearer_token_encrypted) {
      try {
        if (config.bearer_token_encrypted.startsWith('v1.') && isPlatformEncryptionConfigured()) {
          decryptedToken = decryptPlatformSecret(config.bearer_token_encrypted);
        } else {
          decryptedToken = config.bearer_token_encrypted;
        }
      } catch {
        decryptedToken = config.bearer_token_encrypted;
      }
    }

    return {
      apiBaseUrl: (config.api_base_url || 'https://otomat.in/api').replace(/\/+$/, ''),
      vendorUid: config.vendor_uid.trim(),
      bearerToken: (decryptedToken || config.vendor_uid).trim(),
      fromPhoneNumberId: config.from_phone_number_id || undefined,
    };
  }

  async saveConfig(tenantId: string, dto: SaveWhatsAppConfigDto) {
    const existing = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
      where: { tenant_id: tenantId, is_default: true },
    });

    let encryptedToken = existing?.bearer_token_encrypted || '';
    if (dto.bearer_token && dto.bearer_token.trim() && !dto.bearer_token.includes('•••')) {
      if (isPlatformEncryptionConfigured()) {
        encryptedToken = encryptPlatformSecret(dto.bearer_token.trim());
      } else {
        encryptedToken = dto.bearer_token.trim();
      }
    }

    if (!encryptedToken && dto.vendor_uid) {
      if (isPlatformEncryptionConfigured()) {
        encryptedToken = encryptPlatformSecret(dto.vendor_uid.trim());
      } else {
        encryptedToken = dto.vendor_uid.trim();
      }
    }

    if (!encryptedToken && !process.env.WHATSAPP_BEARER_TOKEN) {
      throw new BadRequestException('Bearer Token or Vendor ID is required to connect to WhatsApp external API.');
    }

    if (existing) {
      return this.prisma.rndtechnosoft_crm_whatsapp_configs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } },
        data: {
          account_name: dto.account_name.trim(),
          api_base_url: dto.api_base_url?.trim() || null,
          vendor_uid: dto.vendor_uid.trim(),
          bearer_token_encrypted: encryptedToken,
          from_phone_number_id: dto.from_phone_number_id?.trim() || null,
          is_active: dto.is_default !== undefined ? dto.is_default : true,
        },
      });
    }

    return this.prisma.rndtechnosoft_crm_whatsapp_configs.create({
      data: {
        id: randomUUID(),
        tenant_id: tenantId,
        account_name: dto.account_name.trim(),
        api_base_url: dto.api_base_url?.trim() || null,
        vendor_uid: dto.vendor_uid.trim(),
        bearer_token_encrypted: encryptedToken,
        from_phone_number_id: dto.from_phone_number_id?.trim() || null,
        is_default: true,
        is_active: true,
      },
    });
  }

  // ==========================================
  // 3. WHATSAPP TEMPLATE MAPPINGS
  // ==========================================

  async listMappings(tenantId: string) {
    // await this.seedDefaultTemplatesIfEmpty(tenantId);
    return this.prisma.rndtechnosoft_crm_whatsapp_mappings.findMany({
      where: { tenant_id: tenantId },
      include: {
        rndtechnosoft_crm_message_templates: {
          select: {
            id: true,
            template_code: true,
            template_name: true,
            category: true,
            message_body: true,
            detected_variables: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async getMapping(tenantId: string, id: string) {
    const mapping = await this.prisma.rndtechnosoft_crm_whatsapp_mappings.findFirst({
      where: { tenant_id: tenantId, id },
      include: {
        rndtechnosoft_crm_message_templates: true,
      },
    });

    if (!mapping) {
      throw new NotFoundException(`WhatsApp template mapping "${id}" not found.`);
    }

    return mapping;
  }

  async getMappingByCrmTemplate(tenantId: string, crmTemplateIdOrCode: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(crmTemplateIdOrCode);

    let templateId = crmTemplateIdOrCode;
    if (!isUuid) {
      const t = await this.prisma.rndtechnosoft_crm_message_templates.findFirst({
        where: { tenant_id: tenantId, template_code: crmTemplateIdOrCode },
        select: { id: true },
      });
      if (!t) return null;
      templateId = t.id;
    }

    return this.prisma.rndtechnosoft_crm_whatsapp_mappings.findFirst({
      where: {
        tenant_id: tenantId,
        crm_template_id: templateId,
        is_active: true,
      },
      include: {
        rndtechnosoft_crm_message_templates: true,
      },
    });
  }

  async saveMapping(tenantId: string, dto: CreateWhatsAppMappingDto, memberId?: string) {
    // 1. Verify CRM template exists in this tenant
    const crmTemplate = await this.prisma.rndtechnosoft_crm_message_templates.findFirst({
      where: { tenant_id: tenantId, id: dto.crm_template_id },
    });
    if (!crmTemplate) {
      throw new NotFoundException(`CRM template with ID "${dto.crm_template_id}" not found.`);
    }

    // 2. Check if a mapping already exists for this CRM template in this tenant
    const existing = await this.prisma.rndtechnosoft_crm_whatsapp_mappings.findFirst({
      where: { tenant_id: tenantId, crm_template_id: dto.crm_template_id },
    });

    const data: any = {
      whatsapp_template_name: dto.whatsapp_template_name.trim(),
      whatsapp_template_language: (dto.whatsapp_template_language || 'en').trim(),
      whatsapp_config_id: dto.whatsapp_config_id || null,
      body_mapping: dto.body_mapping || {},
      header_mapping: dto.header_mapping || null,
      media_type: dto.media_type || 'NONE',
      media_mapping: dto.media_mapping || null,
      button_mapping: dto.button_mapping || null,
      sample_preview_values: dto.sample_preview_values || null,
      is_active: dto.is_active !== undefined ? dto.is_active : true,
      updated_by_tenant_member_id: memberId || null,
    };

    if (existing) {
      return this.prisma.rndtechnosoft_crm_whatsapp_mappings.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } },
        data,
        include: { rndtechnosoft_crm_message_templates: true },
      });
    }

    return this.prisma.rndtechnosoft_crm_whatsapp_mappings.create({
      data: {
        ...data,
        id: randomUUID(),
        tenant_id: tenantId,
        crm_template_id: dto.crm_template_id,
        created_by_tenant_member_id: memberId || null,
      },
      include: { rndtechnosoft_crm_message_templates: true },
    });
  }

  async updateMapping(tenantId: string, id: string, dto: UpdateWhatsAppMappingDto, memberId?: string) {
    const mapping = await this.getMapping(tenantId, id);

    const data: any = {
      updated_by_tenant_member_id: memberId || null,
    };

    if (dto.whatsapp_template_name !== undefined) data.whatsapp_template_name = dto.whatsapp_template_name.trim();
    if (dto.whatsapp_template_language !== undefined) data.whatsapp_template_language = dto.whatsapp_template_language.trim();
    if (dto.whatsapp_config_id !== undefined) data.whatsapp_config_id = dto.whatsapp_config_id || null;
    if (dto.body_mapping !== undefined) data.body_mapping = dto.body_mapping;
    if (dto.header_mapping !== undefined) data.header_mapping = dto.header_mapping;
    if (dto.media_type !== undefined) data.media_type = dto.media_type;
    if (dto.media_mapping !== undefined) data.media_mapping = dto.media_mapping;
    if (dto.button_mapping !== undefined) data.button_mapping = dto.button_mapping;
    if (dto.sample_preview_values !== undefined) data.sample_preview_values = dto.sample_preview_values;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;

    return this.prisma.rndtechnosoft_crm_whatsapp_mappings.update({
      where: { tenant_id_id: { tenant_id: tenantId, id: mapping.id } },
      data,
      include: { rndtechnosoft_crm_message_templates: true },
    });
  }

  async deleteMapping(tenantId: string, id: string) {
    const mapping = await this.getMapping(tenantId, id);
    await this.prisma.rndtechnosoft_crm_whatsapp_mappings.delete({
      where: { tenant_id_id: { tenant_id: tenantId, id: mapping.id } },
    });
    return { success: true, message: 'WhatsApp template mapping deleted.' };
  }

  /**
   * Previews variable resolution and the exact provider payload that would be generated.
   */
  async previewMapping(tenantId: string, dto: PreviewTemplateDto) {
    let crmTemplate: any = null;
    if (dto.crm_template_id || dto.template_code) {
      crmTemplate = await this.prisma.rndtechnosoft_crm_message_templates.findFirst({
        where: {
          tenant_id: tenantId,
          ...(dto.crm_template_id ? { id: dto.crm_template_id } : { template_code: dto.template_code }),
        },
      });
    }

    const testVars = dto.variables || {};
    const neededKeys = new Set<string>();

    if (crmTemplate) {
      const keys = this.variableResolver.extractVariables(crmTemplate.message_body);
      keys.forEach((k) => neededKeys.add(k));
    }
    if (dto.body_mapping) {
      Object.values(dto.body_mapping).forEach((v) => {
        if (v) neededKeys.add(String(v).replace(/^\{\{|\}\}$/g, '').trim());
      });
    }

    const resolution = await this.variableResolver.resolveVariables(Array.from(neededKeys), {
      tenantId,
      leadId: dto.lead_id || null,
      explicitVariables: testVars,
    });

    const mappingConfig = {
      whatsapp_template_name: dto.whatsapp_template_name || 'sample_template',
      whatsapp_template_language: dto.whatsapp_template_language || 'en',
      body_mapping: dto.body_mapping || {},
      header_mapping: dto.header_mapping || {},
      media_type: dto.media_type || 'NONE',
      media_mapping: dto.media_mapping || {},
      button_mapping: dto.button_mapping || {},
    };

    const recipient = dto.recipient || '919876543210';
    const payload = this.payloadBuilder.buildPayload({
      mapping: mappingConfig,
      resolvedVariables: resolution.resolved,
      recipientPhone: recipient,
    });

    const crmMessageInterpolated = crmTemplate
      ? this.variableResolver.interpolate(crmTemplate.message_body, resolution.resolved)
      : '';

    return {
      crmMessage: crmMessageInterpolated,
      resolvedVariables: resolution.resolved,
      missingVariables: resolution.missing,
      providerPayload: payload,
    };
  }

  /**
   * Automatically seeds initial standard CRM message templates and an initial Order Dispatch mapping if none exist.
   */
  // async seedDefaultTemplatesIfEmpty(tenantId: string) {
  //   const count = await this.prisma.rndtechnosoft_crm_message_templates.count({
  //     where: { tenant_id: tenantId },
  //   });
  //   if (count > 0) return;

  //   const initialTemplates = [
  //     {
  //       code: 'crm_order_dispatch',
  //       name: 'Order Dispatch',
  //       category: 'ORDERS',
  //       channel: 'WHATSAPP',
  //       body: 'Hello {{customer_name}},\n\nYour order {{order_id}} has been dispatched.\nVehicle: {{vehicle_number}}\nExpected delivery: {{delivery_date}}\n\nThank you for choosing us!',
  //       description: 'Sent automatically when an order or consignment is dispatched to the client.',
  //       waName: 'order_dispatch',
  //       mapping: {
  //         field_1: 'customer_name',
  //         field_2: 'order_id',
  //         field_3: 'vehicle_number',
  //         field_4: 'delivery_date',
  //       },
  //       headerMapping: { header_field_1: 'customer_name' },
  //       mediaType: 'IMAGE',
  //       mediaMapping: { header_image: 'https://cdn.pixabay.com/photo/2015/01/07/15/51/woman-591576_1280.jpg' },
  //       buttonMapping: { button_0: '{{email}}', button_1: '{{phone}}', copy_code: 'DISPATCH10' },
  //     },
  //     {
  //       code: 'crm_lead_welcome',
  //       name: 'Welcome Lead Inquiry',
  //       category: 'SALES',
  //       channel: 'WHATSAPP',
  //       body: 'Hi {{first_name}},\n\nThank you for your interest in {{company_name}}! We received your inquiry for {{primary_service}}.\nReference ID: {{lead_code}}.\n\nOur team will contact you shortly.',
  //       description: 'Automated greeting sent when a new lead enters the pipeline.',
  //       waName: 'lead_welcome_v1',
  //       mapping: {
  //         field_1: 'first_name',
  //         field_2: 'company_name',
  //         field_3: 'primary_service',
  //         field_4: 'lead_code',
  //       },
  //     },
  //     {
  //       code: 'crm_quote_ready',
  //       name: 'Quotation Proposal Ready',
  //       category: 'SALES',
  //       channel: 'WHATSAPP',
  //       body: 'Dear {{customer_name}},\n\nYour quotation {{quotation_number}} for {{primary_service}} is ready for review. Amount: {{total_amount}}.\n\nPlease check the attached document.',
  //       description: 'Notifies client when a commercial quotation has been generated.',
  //       waName: 'quotation_ready',
  //       mapping: {
  //         field_1: 'customer_name',
  //         field_2: 'quotation_number',
  //         field_3: 'primary_service',
  //         field_4: 'total_amount',
  //       },
  //       mediaType: 'DOCUMENT',
  //       mediaMapping: { header_document: 'https://images.pexels.com/photos/276267/pexels-photo-276267.jpeg', header_document_name: 'Quotation.pdf' },
  //     },
  //     {
  //       code: 'crm_meeting_reminder',
  //       name: 'Client Meeting Reminder',
  //       category: 'ACTIVITIES',
  //       channel: 'WHATSAPP',
  //       body: 'Hello {{customer_name}},\n\nFriendly reminder regarding our upcoming meeting "{{meeting_title}}" with {{assignee_name}} on {{meeting_time}}.\nMeeting link: {{meeting_link}}',
  //       description: 'Meeting reminder touchpoint.',
  //       waName: 'meeting_confirmation',
  //       mapping: {
  //         field_1: 'customer_name',
  //         field_2: 'meeting_title',
  //         field_3: 'assignee_name',
  //         field_4: 'meeting_time',
  //         field_5: 'meeting_link',
  //       },
  //     },
  //   ];

  //   for (const item of initialTemplates) {
  //     const templateId = randomUUID();
  //     const detected = this.variableResolver.extractVariables(item.body);

  //     await this.prisma.rndtechnosoft_crm_message_templates.create({
  //       data: {
  //         id: templateId,
  //         tenant_id: tenantId,
  //         template_code: item.code,
  //         template_name: item.name,
  //         category: item.category,
  //         channel: item.channel,
  //         message_body: item.body,
  //         detected_variables: detected,
  //         description: item.description,
  //         is_active: true,
  //       },
  //     });

  //     if (item.waName && item.mapping) {
  //       await this.prisma.rndtechnosoft_crm_whatsapp_mappings.create({
  //         data: {
  //           id: randomUUID(),
  //           tenant_id: tenantId,
  //           crm_template_id: templateId,
  //           whatsapp_template_name: item.waName,
  //           whatsapp_template_language: 'en',
  //           body_mapping: item.mapping,
  //           header_mapping: (item as any).headerMapping || null,
  //           media_type: (item as any).mediaType || 'NONE',
  //           media_mapping: (item as any).mediaMapping || null,
  //           button_mapping: (item as any).buttonMapping || null,
  //           sample_preview_values: {
  //             customer_name: 'Rohan',
  //             order_id: 'ORD-10025',
  //             vehicle_number: 'GJ-15-AB-1234',
  //             delivery_date: '5 November 2026',
  //           },
  //           is_active: true,
  //         },
  //       });
  //     }
  //   }
  // }
}

