import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PerformanceTemplatesService } from './templates.service';
import { DuplicateDto, LibraryListQueryDto } from './dto/performance-library.dto';
import { CreateTemplateDto, TemplateDraftDto, TemplatePreviewDto, TemplateSettingsDto } from './dto/performance-templates.dto';

type Actor = AuthenticatedTenantUser;

/** Appraisal templates. The workspace comes from the signed-in member, never the request. */
@Controller('performance/templates')
export class PerformanceTemplatesController {
  constructor(private readonly templates: PerformanceTemplatesService) {}

  @Get()
  @RequirePermissions('performance.library.view')
  async list(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.templates.list(tenantId, query) };
  }

  @Get(':id')
  @RequirePermissions('performance.library.view')
  async get(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.get(tenantId, id) };
  }

  @Post()
  @RequirePermissions('performance.templates.manage')
  async create(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateTemplateDto) {
    return { success: true, data: await this.templates.create(tenantId, body, actor), message: 'Template created with an empty draft' };
  }

  @Put(':id')
  @RequirePermissions('performance.templates.manage')
  async update(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: TemplateSettingsDto) {
    return { success: true, data: await this.templates.update(tenantId, id, body, actor), message: 'Template saved' };
  }

  @Put(':id/draft')
  @RequirePermissions('performance.templates.manage')
  async saveDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: TemplateDraftDto) {
    return { success: true, data: await this.templates.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Delete(':id/draft')
  @RequirePermissions('performance.templates.manage')
  async discardDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.discardDraft(tenantId, id, actor), message: 'Draft discarded' };
  }

  @Post(':id/draft/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.templates.manage')
  async publish(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.publish(tenantId, id, actor), message: 'New template version published' };
  }

  /** Tries the scoring with sample results; nothing is stored. */
  @Post(':id/versions/:versionId/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.view')
  async preview(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('versionId', ParseUUIDPipe) versionId: string, @Body() body: TemplatePreviewDto) {
    return { success: true, data: await this.templates.preview(tenantId, id, versionId, body.inputs) };
  }

  @Post(':id/duplicate')
  @RequirePermissions('performance.templates.manage')
  async duplicate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DuplicateDto) {
    return { success: true, data: await this.templates.duplicate(tenantId, id, body, actor), message: 'Template copied as a draft' };
  }

  @Delete(':id')
  @RequirePermissions('performance.templates.manage')
  async remove(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.remove(tenantId, id, actor), message: 'Template deleted' };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.templates.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.archive(tenantId, id, actor), message: 'Template archived' };
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.templates.manage')
  async restore(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.templates.restore(tenantId, id, actor), message: 'Template restored' };
  }
}
