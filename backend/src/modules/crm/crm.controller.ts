import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { CrmService } from './crm.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';

/**
 * The acting member comes from the session (@CurrentUser), never from a
 * request header, so activity and audit attribution cannot be forged.
 */
@Controller('crm')
export class CrmController {
  constructor(
    private readonly crmService: CrmService,
    private readonly accessService: AccessService,
  ) {}

  private collection<T>(result: { items: T[]; total: number; page: number; limit: number; totalPages: number; hasMore: boolean }) {
    const { items: data, ...pagination } = result;
    return { success: true, data, pagination };
  }

  // ==========================================
  // PIPELINES
  // ==========================================

  @Get('pipelines')
  @RequirePermissions('pipelines.view')
  async getPipelines(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getPipelines(tenantId);
    return { success: true, data };
  }

  @Post('pipelines')
  @RequirePermissions('pipelines.create')
  async createPipeline(
    @CurrentTenant() tenantId: string,
    @Body() body: { name: string; code: string; isDefault?: boolean },
  ) {
    const data = await this.crmService.createPipeline(tenantId, body);
    return { success: true, data };
  }

  // ==========================================
  // LEADS
  // ==========================================

  @Get('leads/import/template')
  @RequirePermissions('leads.create')
  async downloadLeadImportTemplate(
    @CurrentTenant() tenantId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.crmService.generateLeadImportTemplate(tenantId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="Voogyo_Leads_Import_Template.xlsx"',
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(buffer);
  }

  @Get('leads/export')
  @RequirePermissions('leads.export')
  async exportLeads(
    @CurrentTenant() tenantId: string,
    @Query() query: any,
    @Res() res: Response,
  ) {
    const buffer = await this.crmService.exportLeads(tenantId, query);
    const dateStr = new Date().toISOString().slice(0, 10);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Voogyo_CRM_Leads_Export_${dateStr}.xlsx"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });
    res.end(buffer);
  }

  @Post('leads/webhook')
  @RequirePermissions('leads.create')
  async handleLeadWebhook(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
  ) {
    const data = await this.crmService.handleInboundWebhook(tenantId, body);
    return { success: true, data, message: 'Lead received successfully' };
  }

  @Get('leads')
  @RequirePermissions('leads.view')
  async getLeads(
    @CurrentTenant() tenantId: string,
    @Query('pipelineId') pipelineId?: string,
    @Query('stageId') stageId?: string,
    @Query('temperature') temperature?: string,
    @Query('sourceId') sourceId?: string,
    @Query('assignedUserId') assignedUserId?: string,
    @Query('industry') industry?: string,
    @Query('subIndustry') subIndustry?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.crmService.getLeads(tenantId, {
      pipelineId,
      stageId,
      temperature,
      sourceId,
      assignedUserId,
      industry,
      subIndustry,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { success: true, data };
  }

  @Get('leads/:id')
  @RequirePermissions('leads.view')
  async getLeadById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getLeadById(tenantId, id);
    return { success: true, data };
  }

  @Post('leads')
  @RequirePermissions('leads.create')
  async createLead(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.createLead(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Lead created successfully' };
  }

  @Put('leads/:id')
  @RequirePermissions('leads.update')
  async updateLead(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.updateLead(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'Lead updated successfully' };
  }

  @Delete('leads/:id')
  @RequirePermissions('leads.delete')
  async deleteLead(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    await this.crmService.deleteLead(tenantId, id, actor.tenantMemberId);
    return { success: true, message: 'Lead deleted successfully' };
  }

  @Post('leads/bulk')
  @RequirePermissions('leads.update')
  async bulkLeadAction(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    if (body?.action === 'delete') {
      await this.accessService.assertHoldsAll(
        tenantId,
        actor.tenantMemberId,
        ['leads.delete'],
        'You do not have permission to delete leads (requires leads.delete).',
      );
    }
    const data = await this.crmService.bulkLeadAction(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Bulk action applied successfully' };
  }

  @Post('leads/import')
  @RequirePermissions('leads.create')
  async importLeads(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const leads = body.leads || body;
    const data = await this.crmService.importLeads(tenantId, leads, actor.tenantMemberId);
    const skipped = data.skipped.length > 0 ? `; ${data.skipped.length} rows skipped` : '';
    return { success: true, data, message: `Imported ${data.importedCount} leads${skipped}` };
  }

  @Post('leads/:id/convert-won')
  @RequirePermissions('leads.update')
  async convertDealWon(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.convertDealWon(tenantId, id, actor.tenantMemberId);
    return { success: true, data, message: 'Deal won converted successfully' };
  }

  // ==========================================
  // 30-DAY OUTBOUND CADENCE
  // ==========================================

  @Get('cadence')
  @RequirePermissions('outreach.view')
  async getCadence(
    @CurrentTenant() tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.crmService.getCadenceMatrix(tenantId, leadId, status);
    return { success: true, data };
  }

  @Post('cadence')
  @RequirePermissions('outreach.view')
  async executeCadenceAction(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    // Enrolling leads starts outreach; every other action works an existing cadence.
    const required = body?.action === 'ENROLL' ? 'outreach.create' : 'outreach.update';
    await this.accessService.assertHoldsAll(
      tenantId,
      actor.tenantMemberId,
      [required],
      `You do not have permission to do this (requires ${required}).`,
    );
    const data = await this.crmService.executeCadenceAction(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Cadence action recorded' };
  }

  @Post('cadence/seed')
  @RequirePermissions('outreach.create', 'leads.create')
  async seedCadence(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.seedCadenceDemoLeads(tenantId);
    return { success: true, message: 'Cadence demo prospects seeded successfully across all 30-Day SOP milestones', data };
  }

  // ==========================================
  // ACTIVITIES, FOLLOW-UPS & MEETINGS
  // ==========================================

  @Get('activities')
  @RequirePermissions('leads.view')
  async getActivities(
    @CurrentTenant() tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.collection(await this.crmService.getActivities(tenantId, leadId, Number(page), Number(limit)));
  }

  @Post('activities')
  @RequirePermissions('leads.update')
  async addActivity(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.addActivity(tenantId, body, actor.tenantMemberId);
    return { success: true, data };
  }

  @Get('followups')
  @RequirePermissions('followups.view')
  async getFollowups(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.collection(await this.crmService.getFollowups(tenantId, Number(page), Number(limit)));
  }

  @Post('followups')
  @RequirePermissions('followups.create')
  async createFollowup(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.createFollowup(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Follow-up scheduled' };
  }

  @Put('followups/:id')
  @RequirePermissions('followups.update')
  async updateFollowup(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.updateFollowup(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'Follow-up updated' };
  }

  @Delete('followups/:id')
  @RequirePermissions('followups.delete')
  async deleteFollowup(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteFollowup(tenantId, id);
    return { success: true, message: 'Follow-up deleted' };
  }

  @Get('meetings')
  @RequirePermissions('meetings.view')
  async getMeetings(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.collection(await this.crmService.getMeetings(tenantId, Number(page), Number(limit)));
  }

  @Post('meetings')
  @RequirePermissions('meetings.create')
  async createMeeting(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.createMeeting(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Meeting scheduled' };
  }

  @Put('meetings/:id')
  @RequirePermissions('meetings.update')
  async updateMeeting(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.updateMeeting(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'Meeting updated' };
  }

  @Delete('meetings/:id')
  @RequirePermissions('meetings.delete')
  async deleteMeeting(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteMeeting(tenantId, id);
    return { success: true, message: 'Meeting deleted' };
  }

  // ==========================================
  // GST QUOTATIONS
  // ==========================================

  @Get('quotations')
  @RequirePermissions('quotations.view')
  async getQuotations(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.collection(await this.crmService.getQuotations(tenantId, Number(page), Number(limit)));
  }

  @Post('quotations')
  @RequirePermissions('quotations.create')
  async createQuotation(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.createQuotation(tenantId, body, actor.tenantMemberId);
    return { success: true, data, message: 'Quotation created' };
  }

  @Get('quotations/:id')
  @RequirePermissions('quotations.view')
  async getQuotationById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getQuotationById(tenantId, id);
    return { success: true, data };
  }

  @Put('quotations/:id')
  @RequirePermissions('quotations.update')
  async updateQuotation(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() actor: AuthenticatedTenantUser,
  ) {
    const data = await this.crmService.updateQuotation(tenantId, id, body, actor.tenantMemberId);
    return { success: true, data, message: 'Quotation updated' };
  }

  @Delete('quotations/:id')
  @RequirePermissions('quotations.delete')
  async deleteQuotation(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteQuotation(tenantId, id);
    return { success: true, message: 'Quotation deleted' };
  }

  @Get('quotation-templates')
  @RequirePermissions('quotations.view')
  async getQuotationTemplates(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getQuotationTemplates(tenantId);
    return { success: true, data };
  }

  // ==========================================
  // CLIENTS
  // ==========================================

  @Get('clients')
  @RequirePermissions('clients.view')
  async getClients(
    @CurrentTenant() tenantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.collection(await this.crmService.getClients(tenantId, Number(page), Number(limit)));
  }

  @Post('clients')
  @RequirePermissions('clients.create')
  async createClient(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createClient(tenantId, body);
    return { success: true, data };
  }

  @Put('clients/:id')
  @RequirePermissions('clients.update')
  async updateClient(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    const data = await this.crmService.updateClient(tenantId, id, body);
    return { success: true, data };
  }

  // ==========================================
  // MASTERS & TAXONOMY
  // ==========================================

  /** Only pipeline stages can be reordered, so this is a pipeline change. */
  @Post('masters/reorder')
  @RequirePermissions('pipelines.update')
  async reorderMasters(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.reorderMasters(tenantId, body);
    return { success: true, data };
  }

  // Specific Industry Taxonomy endpoints
  @Get('masters/industries')
  @RequirePermissions('masters.industries.view')
  async getIndustriesMaster(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getIndustriesMaster(tenantId);
    return { success: true, data };
  }

  @Post('masters/industries')
  @RequirePermissions('masters.industries.create')
  async createIndustry(
    @CurrentTenant() tenantId: string,
    @Body('name') name: string,
  ) {
    const data = await this.crmService.createIndustry(tenantId, name);
    return { success: true, data, message: 'Industry created successfully' };
  }

  @Put('masters/industries')
  @RequirePermissions('masters.industries.update')
  async updateIndustry(
    @CurrentTenant() tenantId: string,
    @Body() body: { id: string; name: string },
  ) {
    const data = await this.crmService.updateIndustry(tenantId, body.id, body.name);
    return { success: true, data, message: 'Industry updated' };
  }

  @Delete('masters/industries')
  @RequirePermissions('masters.industries.delete')
  async deleteIndustry(
    @CurrentTenant() tenantId: string,
    @Query('id') id: string,
  ) {
    await this.crmService.deleteIndustry(tenantId, id);
    return { success: true, message: 'Industry and its sub-industries deleted' };
  }

  @Post('masters/industries/sub')
  @RequirePermissions('masters.industries.create')
  async createSubIndustry(
    @CurrentTenant() tenantId: string,
    @Body() body: { industry_id: string; name: string },
  ) {
    const data = await this.crmService.createSubIndustry(tenantId, body.industry_id, body.name);
    return { success: true, data, message: 'Sub-industry created successfully' };
  }

  @Put('masters/industries/sub')
  @RequirePermissions('masters.industries.update')
  async updateSubIndustry(
    @CurrentTenant() tenantId: string,
    @Body() body: { id: string; name: string },
  ) {
    const data = await this.crmService.updateSubIndustry(tenantId, body.id, body.name);
    return { success: true, data, message: 'Sub-industry updated' };
  }

  @Delete('masters/industries/sub')
  @RequirePermissions('masters.industries.delete')
  async deleteSubIndustry(
    @CurrentTenant() tenantId: string,
    @Query('id') id: string,
  ) {
    await this.crmService.deleteSubIndustry(tenantId, id);
    return { success: true, message: 'Sub-industry deleted' };
  }

  // One route per master resource and supported action, so each carries its own
  // permission. Pipelines and stages are pipeline configuration. A type or
  // action the backend does not implement has no route and returns 404.

  @Get('masters/services')
  @RequirePermissions('masters.services.view')
  async getServicesMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'services') };
  }

  @Post('masters/services')
  @RequirePermissions('masters.services.create')
  async createService(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createMaster(tenantId, 'services', body);
    return { success: true, data, message: 'Service created' };
  }

  @Put('masters/services')
  @RequirePermissions('masters.services.update')
  async updateService(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.updateMaster(tenantId, 'services', body.id, body);
    return { success: true, data, message: 'Service updated' };
  }

  @Delete('masters/services')
  @RequirePermissions('masters.services.delete')
  async deleteService(@CurrentTenant() tenantId: string, @Query('id') id: string) {
    await this.crmService.deleteMaster(tenantId, 'services', id);
    return { success: true, message: 'Service deleted' };
  }

  @Get('masters/stages')
  @RequirePermissions('pipelines.view')
  async getStagesMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'stages') };
  }

  @Post('masters/stages')
  @RequirePermissions('pipelines.update')
  async createStage(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createMaster(tenantId, 'stages', body);
    return { success: true, data, message: 'Stage created' };
  }

  @Put('masters/stages')
  @RequirePermissions('pipelines.update')
  async updateStage(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.updateMaster(tenantId, 'stages', body.id, body);
    return { success: true, data, message: 'Stage updated' };
  }

  @Delete('masters/stages')
  @RequirePermissions('pipelines.update')
  async deleteStage(@CurrentTenant() tenantId: string, @Query('id') id: string) {
    await this.crmService.deleteMaster(tenantId, 'stages', id);
    return { success: true, message: 'Stage deleted' };
  }

  @Get('masters/pipelines')
  @RequirePermissions('pipelines.view')
  async getPipelinesMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'pipelines') };
  }

  @Post('masters/pipelines')
  @RequirePermissions('pipelines.create')
  async createPipelineMaster(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createMaster(tenantId, 'pipelines', body);
    return { success: true, data, message: 'Pipeline created' };
  }

  @Delete('masters/pipelines')
  @RequirePermissions('pipelines.delete')
  async deletePipeline(@CurrentTenant() tenantId: string, @Query('id') id: string) {
    await this.crmService.deleteMaster(tenantId, 'pipelines', id);
    return { success: true, message: 'Pipeline deleted' };
  }

  @Get('masters/sources')
  @RequirePermissions('masters.sources.view')
  async getSourcesMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'sources') };
  }

  @Post('masters/sources')
  @RequirePermissions('masters.sources.create')
  async createSource(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createMaster(tenantId, 'sources', body);
    return { success: true, data, message: 'Lead source created' };
  }

  @Delete('masters/sources')
  @RequirePermissions('masters.sources.delete')
  async deleteSource(@CurrentTenant() tenantId: string, @Query('id') id: string) {
    await this.crmService.deleteMaster(tenantId, 'sources', id);
    return { success: true, message: 'Lead source deleted' };
  }

  @Get('masters/lost-reasons')
  @RequirePermissions('masters.lost_reasons.view')
  async getLostReasonsMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'lost-reasons') };
  }

  @Get('masters/sop-steps')
  @RequirePermissions('masters.sop.view')
  async getSopStepsMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'sop-steps') };
  }

  @Get('masters/sop-branches')
  @RequirePermissions('masters.sop.view')
  async getSopBranchesMaster(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.crmService.getMasters(tenantId, 'sop-branches') };
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  @Get('audit-logs')
  @RequirePermissions('audit.view')
  async getAuditLogs(
    @CurrentTenant() tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('actionType') actionType?: string,
    @Query('actorId') actorId?: string,
    @Query('entityType') entityType?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.crmService.getAuditLogs(tenantId, {
      leadId,
      actionType,
      actorId,
      entityType,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return this.collection(data);
  }
}
