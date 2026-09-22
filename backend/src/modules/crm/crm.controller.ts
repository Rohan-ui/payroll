import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { CrmService } from './crm.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('crm')
@UseGuards(TenantGuard)
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  // ==========================================
  // PIPELINES
  // ==========================================

  @Get('pipelines')
  async getPipelines(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getPipelines(tenantId);
    return { success: true, data };
  }

  @Post('pipelines')
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

  @Get('leads')
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
    });
    return { success: true, data };
  }

  @Get('leads/:id')
  async getLeadById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getLeadById(tenantId, id);
    return { success: true, data };
  }

  @Post('leads')
  async createLead(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.createLead(tenantId, body, memberId);
    return { success: true, data, message: 'Lead created successfully' };
  }

  @Put('leads/:id')
  async updateLead(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.updateLead(tenantId, id, body, memberId);
    return { success: true, data, message: 'Lead updated successfully' };
  }

  @Delete('leads/:id')
  async deleteLead(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    await this.crmService.deleteLead(tenantId, id, memberId);
    return { success: true, message: 'Lead deleted successfully' };
  }

  @Post('leads/bulk')
  async bulkLeadAction(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.bulkLeadAction(tenantId, body, memberId);
    return { success: true, data, message: 'Bulk action applied successfully' };
  }

  @Post('leads/import')
  async importLeads(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const leads = body.leads || body;
    const data = await this.crmService.importLeads(tenantId, leads, memberId);
    return { success: true, data, message: `Imported ${data.importedCount} leads` };
  }

  @Post('leads/:id/convert-won')
  async convertDealWon(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.convertDealWon(tenantId, id, memberId);
    return { success: true, data, message: 'Deal won converted successfully' };
  }

  // ==========================================
  // 30-DAY OUTBOUND CADENCE
  // ==========================================

  @Get('cadence')
  async getCadence(
    @CurrentTenant() tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.crmService.getCadenceMatrix(tenantId, leadId, status);
    return { success: true, data };
  }

  @Post('cadence')
  async executeCadenceAction(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.executeCadenceAction(tenantId, body, memberId);
    return { success: true, data, message: 'Cadence action recorded' };
  }

  @Post('cadence/seed')
  async seedCadence(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.seedCadenceDemoLeads(tenantId);
    return { success: true, message: 'Cadence demo prospects seeded successfully across all 30-Day SOP milestones', data };
  }

  // ==========================================
  // ACTIVITIES, FOLLOW-UPS & MEETINGS
  // ==========================================

  @Get('activities')
  async getActivities(@CurrentTenant() tenantId: string, @Query('leadId') leadId?: string) {
    const data = await this.crmService.getActivities(tenantId, leadId);
    return { success: true, data };
  }

  @Post('activities')
  async addActivity(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.addActivity(tenantId, body, memberId);
    return { success: true, data };
  }

  @Get('followups')
  async getFollowups(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getFollowups(tenantId);
    return { success: true, data };
  }

  @Post('followups')
  async createFollowup(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.createFollowup(tenantId, body, memberId);
    return { success: true, data, message: 'Follow-up scheduled' };
  }

  @Put('followups/:id')
  async updateFollowup(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.updateFollowup(tenantId, id, body, memberId);
    return { success: true, data, message: 'Follow-up updated' };
  }

  @Delete('followups/:id')
  async deleteFollowup(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteFollowup(tenantId, id);
    return { success: true, message: 'Follow-up deleted' };
  }

  @Get('meetings')
  async getMeetings(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getMeetings(tenantId);
    return { success: true, data };
  }

  @Post('meetings')
  async createMeeting(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.createMeeting(tenantId, body, memberId);
    return { success: true, data, message: 'Meeting scheduled' };
  }

  @Put('meetings/:id')
  async updateMeeting(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.updateMeeting(tenantId, id, body, memberId);
    return { success: true, data, message: 'Meeting updated' };
  }

  @Delete('meetings/:id')
  async deleteMeeting(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteMeeting(tenantId, id);
    return { success: true, message: 'Meeting deleted' };
  }

  // ==========================================
  // GST QUOTATIONS
  // ==========================================

  @Get('quotations')
  async getQuotations(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getQuotations(tenantId);
    return { success: true, data };
  }

  @Post('quotations')
  async createQuotation(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.createQuotation(tenantId, body, memberId);
    return { success: true, data, message: 'Quotation created' };
  }

  @Get('quotations/:id')
  async getQuotationById(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    const data = await this.crmService.getQuotationById(tenantId, id);
    return { success: true, data };
  }

  @Put('quotations/:id')
  async updateQuotation(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: any,
    @Headers('x-tenant-member-id') memberId?: string,
  ) {
    const data = await this.crmService.updateQuotation(tenantId, id, body, memberId);
    return { success: true, data, message: 'Quotation updated' };
  }

  @Delete('quotations/:id')
  async deleteQuotation(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    await this.crmService.deleteQuotation(tenantId, id);
    return { success: true, message: 'Quotation deleted' };
  }

  @Get('quotation-templates')
  async getQuotationTemplates(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getQuotationTemplates(tenantId);
    return { success: true, data };
  }

  // ==========================================
  // CLIENTS
  // ==========================================

  @Get('clients')
  async getClients(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getClients(tenantId);
    return { success: true, data };
  }

  @Post('clients')
  async createClient(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.createClient(tenantId, body);
    return { success: true, data };
  }

  @Put('clients/:id')
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

  @Post('masters/reorder')
  async reorderMasters(@CurrentTenant() tenantId: string, @Body() body: any) {
    const data = await this.crmService.reorderMasters(tenantId, body);
    return { success: true, data };
  }

  @Get('masters/:type')
  async getMasterByType(@CurrentTenant() tenantId: string, @Param('type') type: string) {
    const data = await this.crmService.getMasters(tenantId, type);
    return { success: true, data };
  }

  @Post('masters/:type')
  async createMaster(
    @CurrentTenant() tenantId: string,
    @Param('type') type: string,
    @Body() body: any,
  ) {
    const data = await this.crmService.createMaster(tenantId, type, body);
    return { success: true, data, message: 'Master record created' };
  }

  @Put('masters/:type')
  async updateMaster(
    @CurrentTenant() tenantId: string,
    @Param('type') type: string,
    @Body() body: any,
  ) {
    const id = body.id;
    const data = await this.crmService.updateMaster(tenantId, type, id, body);
    return { success: true, data, message: 'Master record updated' };
  }

  @Delete('masters/:type')
  async deleteMaster(
    @CurrentTenant() tenantId: string,
    @Param('type') type: string,
    @Query('id') id: string,
  ) {
    await this.crmService.deleteMaster(tenantId, type, id);
    return { success: true, message: 'Master record deleted' };
  }

  // ==========================================
  // AUDIT LOGS
  // ==========================================

  @Get('audit-logs')
  async getAuditLogs(
    @CurrentTenant() tenantId: string,
    @Query('leadId') leadId?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.crmService.getAuditLogs(tenantId, {
      leadId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return { success: true, data };
  }
}
