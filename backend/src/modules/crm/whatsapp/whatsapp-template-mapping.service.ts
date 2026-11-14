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
import { ProviderTemplateItem, WhatsAppProviderService } from './whatsapp-provider.service';
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
    private readonly providerService: WhatsAppProviderService,
  ) {}

  // ==========================================
  // 1. CRM MESSAGE TEMPLATES
  // ==========================================

  async listCrmTemplates(tenantId: string) {
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
  // 2. WHATSAPP CANONICAL CONFIGURATION
  // ==========================================

  async getConfig(tenantId: string) {
    const config = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
      where: { tenant_id: tenantId, is_default: true },
    });

    if (!config) {
      // Fallback check to Organization Settings if configured there
      try {
        const tenantSettings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
          where: { tenant_id: tenantId },
        });
        const wa = (tenantSettings?.settings as any)?.whatsapp;
        if (wa && (wa.vendorUid || wa.phoneNumberId)) {
          return {
            id: 'org-settings-whatsapp',
            is_configured: true,
            account_name: 'WhatsApp Business Account',
            api_base_url: wa.apiBaseUrl || 'https://otomat.in/api',
            vendor_uid: wa.vendorUid || wa.phoneNumberId || '',
            bearer_token_masked: (wa.accessTokenEncrypted || wa.accessToken) ? '••••••••' : '',
            from_phone_number_id: wa.phoneNumberId || '',
            sender_phone_number: wa.senderPhoneNumber || '',
            waba_id: wa.wabaId || '',
            provider: wa.provider || 'OTOMAT',
            webhook_verify_token_masked: wa.webhookVerifyTokenEncrypted ? '••••••••' : '',
            last_synced_at: null,
            last_sync_error: null,
            is_active: wa.isActive !== false,
          };
        }
      } catch {
        // Fall through
      }

      return {
        is_configured: false,
        account_name: 'WhatsApp Business Account',
        api_base_url: 'https://otomat.in/api',
        vendor_uid: '',
        bearer_token_masked: '',
        from_phone_number_id: '',
        sender_phone_number: '',
        waba_id: '',
        provider: 'OTOMAT',
        webhook_verify_token_masked: '',
        last_synced_at: null,
        last_sync_error: null,
        is_active: false,
      };
    }

    return {
      id: config.id,
      is_configured: Boolean(config.vendor_uid && config.bearer_token_encrypted),
      account_name: config.account_name,
      api_base_url: config.api_base_url || 'https://otomat.in/api',
      vendor_uid: config.vendor_uid,
      bearer_token_masked: config.bearer_token_encrypted ? '••••••••' : '',
      from_phone_number_id: config.from_phone_number_id || '',
      sender_phone_number: config.sender_phone_number || '',
      waba_id: config.waba_id || '',
      provider: config.provider || 'OTOMAT',
      webhook_verify_token_masked: config.webhook_verify_token_encrypted ? '••••••••' : '',
      last_synced_at: config.last_synced_at,
      last_sync_error: config.last_sync_error,
      is_active: config.is_active,
      updated_at: config.updated_at,
    };
  }

  async getRawCredentials(tenantId: string) {
    const config = await this.prisma.rndtechnosoft_crm_whatsapp_configs.findFirst({
      where: { tenant_id: tenantId, is_default: true, is_active: true },
    });

    if (!config) {
      // Fallback check to Organization Settings if configured there
      try {
        const tenantSettings = await this.prisma.rndtechnosoft_tenant_settings.findUnique({
          where: { tenant_id: tenantId },
        });
        const wa = (tenantSettings?.settings as any)?.whatsapp;
        if (wa && (wa.vendorUid || wa.phoneNumberId) && wa.isActive !== false) {
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
          let verifyToken = '';
          if (wa.webhookVerifyTokenEncrypted) {
            try {
              verifyToken = wa.webhookVerifyTokenEncrypted.startsWith('v1.') && isPlatformEncryptionConfigured()
                ? decryptPlatformSecret(wa.webhookVerifyTokenEncrypted)
                : wa.webhookVerifyTokenEncrypted;
            } catch {
              verifyToken = wa.webhookVerifyTokenEncrypted;
            }
          }
          return {
            apiBaseUrl: (wa.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, ''),
            vendorUid: (wa.vendorUid || wa.phoneNumberId || '').trim(),
            bearerToken: (token || wa.accessToken || '').trim(),
            fromPhoneNumberId: (wa.phoneNumberId || '').trim() || undefined,
            senderPhoneNumber: (wa.senderPhoneNumber || '').trim() || undefined,
            wabaId: (wa.wabaId || '').trim() || undefined,
            provider: (wa.provider || 'OTOMAT').trim(),
            webhookVerifyToken: verifyToken || undefined,
          };
        }
      } catch {
        // Fall through
      }

      throw new BadRequestException('WhatsApp provider is not configured for this tenant. Please configure credentials in Gateway Settings.');
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

    let decryptedVerifyToken = '';
    if (config.webhook_verify_token_encrypted) {
      try {
        if (config.webhook_verify_token_encrypted.startsWith('v1.') && isPlatformEncryptionConfigured()) {
          decryptedVerifyToken = decryptPlatformSecret(config.webhook_verify_token_encrypted);
        } else {
          decryptedVerifyToken = config.webhook_verify_token_encrypted;
        }
      } catch {
        decryptedVerifyToken = config.webhook_verify_token_encrypted;
      }
    }

    return {
      apiBaseUrl: (config.api_base_url || 'https://otomat.in/api').replace(/\/+$/, ''),
      vendorUid: config.vendor_uid.trim(),
      bearerToken: decryptedToken.trim(),
      fromPhoneNumberId: config.from_phone_number_id || undefined,
      senderPhoneNumber: config.sender_phone_number || undefined,
      wabaId: config.waba_id || undefined,
      provider: config.provider || 'OTOMAT',
      webhookVerifyToken: decryptedVerifyToken || undefined,
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

    let encryptedVerifyToken = existing?.webhook_verify_token_encrypted || null;
    if (dto.webhook_verify_token && dto.webhook_verify_token.trim() && !dto.webhook_verify_token.includes('•••')) {
      if (isPlatformEncryptionConfigured()) {
        encryptedVerifyToken = encryptPlatformSecret(dto.webhook_verify_token.trim());
      } else {
        encryptedVerifyToken = dto.webhook_verify_token.trim();
      }
    }

    let encryptedAppSecret = existing?.app_secret_encrypted || null;
    if (dto.app_secret && dto.app_secret.trim() && !dto.app_secret.includes('•••')) {
      if (isPlatformEncryptionConfigured()) {
        encryptedAppSecret = encryptPlatformSecret(dto.app_secret.trim());
      } else {
        encryptedAppSecret = dto.app_secret.trim();
      }
    }

    const configData = {
      account_name: dto.account_name.trim(),
      api_base_url: dto.api_base_url?.trim() || 'https://otomat.in/api',
      vendor_uid: dto.vendor_uid.trim(),
      bearer_token_encrypted: encryptedToken,
      from_phone_number_id: dto.from_phone_number_id?.trim() || null,
      sender_phone_number: dto.sender_phone_number?.trim() || null,
      waba_id: dto.waba_id?.trim() || null,
      provider: dto.provider?.trim() || 'OTOMAT',
      webhook_verify_token_encrypted: encryptedVerifyToken,
      app_secret_encrypted: encryptedAppSecret,
      is_active: dto.is_default !== undefined ? dto.is_default : true,
    };

    let savedConfig: any;
    if (existing) {
      savedConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.update({
        where: { tenant_id_id: { tenant_id: tenantId, id: existing.id } },
        data: configData,
      });
    } else {
      savedConfig = await this.prisma.rndtechnosoft_crm_whatsapp_configs.create({
        data: {
          ...configData,
          id: randomUUID(),
          tenant_id: tenantId,
          is_default: true,
        },
      });
    }

    // Unify: Automatically sync with tenant_settings.settings.whatsapp
    try {
      const waSettingsObj = {
        provider: configData.provider,
        apiBaseUrl: configData.api_base_url,
        vendorUid: configData.vendor_uid,
        phoneNumberId: configData.from_phone_number_id,
        senderPhoneNumber: configData.sender_phone_number,
        wabaId: configData.waba_id,
        accessTokenEncrypted: encryptedToken,
        webhookVerifyTokenEncrypted: encryptedVerifyToken,
        isActive: configData.is_active,
      };

      await this.prisma.$executeRaw`
        UPDATE rndtechnosoft_tenant_settings
        SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{whatsapp}', ${JSON.stringify(waSettingsObj)}::jsonb),
            updated_at = CURRENT_TIMESTAMP(6)
        WHERE tenant_id = ${tenantId}::uuid
      `;
    } catch {
      // Non-fatal synchronization
    }

    return savedConfig;
  }

  // ==========================================
  // 3. PROVIDER TEMPLATES (PERSISTENCE & SYNC)
  // ==========================================

  /**
   * Synchronizes approved templates from the external WhatsApp provider into PostgreSQL.
   * Real templates, real statuses, real errors. Zero mock fallbacks.
   */
  async syncProviderTemplates(tenantId: string, searchTerm?: string) {
    const creds = await this.getRawCredentials(tenantId);
    let items: ProviderTemplateItem[];

    try {
      items = await this.providerService.getTemplateList(creds, { searchTerm });
    } catch (err: any) {
      // Record failure timestamp on config
      await this.prisma.rndtechnosoft_crm_whatsapp_configs.updateMany({
        where: { tenant_id: tenantId, is_default: true },
        data: { last_sync_error: err.message },
      });
      throw err;
    }

    const now = new Date();

    // Upsert each template into database
    for (const item of items) {
      await this.prisma.rndtechnosoft_crm_whatsapp_provider_templates.upsert({
        where: {
          tenant_id_template_name_template_language: {
            tenant_id: tenantId,
            template_name: item.name,
            template_language: item.language,
          },
        },
        update: {
          category: item.category || 'UTILITY',
          status: item.status || 'APPROVED',
          header_type: item.header_type || 'NONE',
          body_text: item.body_text || '',
          buttons_count: item.buttons_count || 0,
          raw_components: item.components || [],
          synced_at: now,
          updated_at: now,
        },
        create: {
          id: randomUUID(),
          tenant_id: tenantId,
          template_name: item.name,
          template_language: item.language,
          category: item.category || 'UTILITY',
          status: item.status || 'APPROVED',
          header_type: item.header_type || 'NONE',
          body_text: item.body_text || '',
          buttons_count: item.buttons_count || 0,
          raw_components: item.components || [],
          synced_at: now,
          created_at: now,
          updated_at: now,
        },
      });
    }

    // Update config with last synced timestamp
    await this.prisma.rndtechnosoft_crm_whatsapp_configs.updateMany({
      where: { tenant_id: tenantId, is_default: true },
      data: { last_synced_at: now, last_sync_error: null },
    });

    return {
      success: true,
      syncedCount: items.length,
      lastSyncedAt: now.toISOString(),
      templates: items,
    };
  }

  /**
   * Retrieves provider templates stored in PostgreSQL.
   * If table is empty but credentials exist, attempts an automatic initial sync.
   */
  async listProviderTemplates(tenantId: string, search?: string) {
    const where: any = { tenant_id: tenantId };
    if (search && search.trim()) {
      where.OR = [
        { template_name: { contains: search.trim(), mode: 'insensitive' } },
        { body_text: { contains: search.trim(), mode: 'insensitive' } },
        { category: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }

    let rows = await this.prisma.rndtechnosoft_crm_whatsapp_provider_templates.findMany({
      where,
      orderBy: { template_name: 'asc' },
    });

    // If no templates cached in database, try initial sync if configured
    if (rows.length === 0 && !search) {
      try {
        const syncRes = await this.syncProviderTemplates(tenantId);
        if (syncRes.syncedCount > 0) {
          rows = await this.prisma.rndtechnosoft_crm_whatsapp_provider_templates.findMany({
            where: { tenant_id: tenantId },
            orderBy: { template_name: 'asc' },
          });
        }
      } catch {
        // Return empty array if not yet configured
      }
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.template_name,
      language: r.template_language,
      category: r.category,
      status: r.status,
      header_type: r.header_type,
      body_text: r.body_text,
      buttons_count: r.buttons_count,
      components: r.raw_components,
      synced_at: r.synced_at,
    }));
  }

  // ==========================================
  // 4. WHATSAPP TEMPLATE MAPPINGS
  // ==========================================

  async listMappings(tenantId: string) {
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
}
