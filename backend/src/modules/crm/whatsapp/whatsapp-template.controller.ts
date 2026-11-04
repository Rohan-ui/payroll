import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { WhatsAppTemplateMappingService } from './whatsapp-template-mapping.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import {
  CreateCrmTemplateDto,
  CreateWhatsAppMappingDto,
  PreviewTemplateDto,
  SaveWhatsAppConfigDto,
  SendWhatsAppTemplateMessageDto,
  UpdateCrmTemplateDto,
  UpdateWhatsAppMappingDto,
} from './dto/whatsapp-template.dto';

@Controller('crm/whatsapp')
export class WhatsAppTemplateController {
  constructor(
    private readonly mappingService: WhatsAppTemplateMappingService,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly providerService: WhatsAppProviderService,
  ) {}

  // ==========================================
  // 1. CRM MESSAGE TEMPLATES
  // ==========================================

  @Get('templates')
  @RequirePermissions('outreach.view')
  async listCrmTemplates(@CurrentTenant() tenantId: string) {
    const data = await this.mappingService.listCrmTemplates(tenantId);
    return { success: true, data };
  }

  @Get('templates/:id')
  @RequirePermissions('outreach.view')
  async getCrmTemplate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.mappingService.getCrmTemplate(tenantId, id);
    return { success: true, data };
  }

  @Post('templates')
  @RequirePermissions('outreach.update')
  async createCrmTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateCrmTemplateDto,
  ) {
    const data = await this.mappingService.createCrmTemplate(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'CRM template created' };
  }

  @Put('templates/:id')
  @RequirePermissions('outreach.update')
  async updateCrmTemplate(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: UpdateCrmTemplateDto,
  ) {
    const data = await this.mappingService.updateCrmTemplate(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'CRM template updated' };
  }

  @Delete('templates/:id')
  @RequirePermissions('outreach.update')
  async deleteCrmTemplate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const res = await this.mappingService.deleteCrmTemplate(tenantId, id);
    return { success: true, message: res.message };
  }

  // ==========================================
  // 2. WHATSAPP PROVIDER TEMPLATES & CONFIG
  // ==========================================

  @Get('provider-templates')
  @RequirePermissions('outreach.view')
  async getProviderTemplates(
    @CurrentTenant() tenantId: string,
    @Query('search') search?: string,
  ) {
    const creds = await this.mappingService.getRawCredentials(tenantId);
    const data = await this.providerService.getTemplateList(creds, { searchTerm: search });
    return { success: true, data };
  }

  @Get('config')
  @RequirePermissions('outreach.view')
  async getConfig(@CurrentTenant() tenantId: string) {
    const data = await this.mappingService.getConfig(tenantId);
    return { success: true, data };
  }

  @Post('config')
  @RequirePermissions('outreach.update')
  async saveConfig(
    @CurrentTenant() tenantId: string,
    @Body() body: SaveWhatsAppConfigDto,
  ) {
    const data = await this.mappingService.saveConfig(tenantId, body);
    return { success: true, data, message: 'WhatsApp provider settings saved' };
  }

  @Post('config/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('outreach.update')
  async testConnection(
    @CurrentTenant() tenantId: string,
    @Body() body?: Partial<SaveWhatsAppConfigDto>,
  ) {
    let creds: any;
    if (body?.vendor_uid && body?.bearer_token) {
      creds = {
        apiBaseUrl: body.api_base_url || 'https://api.whatsapp-hub.com',
        vendorUid: body.vendor_uid,
        bearerToken: body.bearer_token,
      };
    } else {
      creds = await this.mappingService.getRawCredentials(tenantId);
    }

    try {
      const templates = await this.providerService.getTemplateList(creds, { pageSize: 5 });
      return {
        success: true,
        connected: true,
        templateCount: templates.length,
        message: `Connection successful. Provider returned ${templates.length} template(s).`,
      };
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        message: err.message || 'Failed to connect to external WhatsApp API.',
      };
    }
  }

  // ==========================================
  // 3. WHATSAPP TEMPLATE MAPPINGS
  // ==========================================

  @Get('mappings')
  @RequirePermissions('outreach.view')
  async listMappings(@CurrentTenant() tenantId: string) {
    const data = await this.mappingService.listMappings(tenantId);
    return { success: true, data };
  }

  @Get('mappings/:id')
  @RequirePermissions('outreach.view')
  async getMapping(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.mappingService.getMapping(tenantId, id);
    return { success: true, data };
  }

  @Get('mappings/crm/:crmTemplateId')
  @RequirePermissions('outreach.view')
  async getMappingByCrmTemplate(
    @CurrentTenant() tenantId: string,
    @Param('crmTemplateId') crmTemplateId: string,
  ) {
    const data = await this.mappingService.getMappingByCrmTemplate(tenantId, crmTemplateId);
    return { success: true, data };
  }

  @Post('mappings')
  @RequirePermissions('outreach.update')
  async saveMapping(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateWhatsAppMappingDto,
  ) {
    const data = await this.mappingService.saveMapping(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Template mapping saved' };
  }

  @Put('mappings/:id')
  @RequirePermissions('outreach.update')
  async updateMapping(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: UpdateWhatsAppMappingDto,
  ) {
    const data = await this.mappingService.updateMapping(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'Template mapping updated' };
  }

  @Delete('mappings/:id')
  @RequirePermissions('outreach.update')
  async deleteMapping(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const res = await this.mappingService.deleteMapping(tenantId, id);
    return { success: true, message: res.message };
  }

  @Post('mappings/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('outreach.view')
  async previewMapping(
    @CurrentTenant() tenantId: string,
    @Body() body: PreviewTemplateDto,
  ) {
    const data = await this.mappingService.previewMapping(tenantId, body);
    return { success: true, data };
  }

  // ==========================================
  // 4. DYNAMIC MESSAGING & DISPATCH
  // ==========================================

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('outreach.update')
  async sendTemplateMessage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: SendWhatsAppTemplateMessageDto,
  ) {
    const data = await this.messagingService.sendMappedTemplateMessage(
      tenantId,
      body,
      actor.tenantMemberId,
    );
    return { success: data.success, data, message: data.success ? 'WhatsApp message dispatched' : 'Failed to dispatch message' };
  }

  // ==========================================
  // 5. MESSAGE LOGS & STATUS TRACKING
  // ==========================================

  @Get('logs')
  @RequirePermissions('outreach.view')
  async listLogs(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('leadId') leadId?: string,
  ) {
    const data = await this.messagingService.listLogs(tenantId, {
      page,
      limit,
      status,
      search,
      leadId,
    });
    return { success: true, data };
  }

  @Get('logs/:id')
  @RequirePermissions('outreach.view')
  async getLog(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.messagingService.getLog(tenantId, id);
    return { success: true, data };
  }

  @Post('logs/:id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('outreach.view')
  async refreshLogStatus(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.messagingService.refreshMessageStatus(tenantId, id);
    return { success: true, data, message: 'Message delivery status refreshed' };
  }
}

