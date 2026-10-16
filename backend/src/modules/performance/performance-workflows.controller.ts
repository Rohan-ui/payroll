import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PerformanceWorkflowsService } from './workflows.service';
import { DuplicateDto, LibraryListQueryDto } from './dto/performance-library.dto';
import { CreateWorkflowDto, ResolveReviewersDto, WorkflowDraftDto, WorkflowSettingsDto } from './dto/performance-workflows.dto';

type Actor = AuthenticatedTenantUser;

/** Review workflows. The workspace comes from the signed-in member, never the request. */
@Controller('performance/workflows')
export class PerformanceWorkflowsController {
  constructor(private readonly workflows: PerformanceWorkflowsService) {}

  @Get()
  @RequirePermissions('performance.library.view')
  async list(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.workflows.list(tenantId, query) };
  }

  @Get(':id')
  @RequirePermissions('performance.library.view')
  async get(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.get(tenantId, id) };
  }

  @Post()
  @RequirePermissions('performance.workflows.manage')
  async create(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateWorkflowDto) {
    return { success: true, data: await this.workflows.create(tenantId, body, actor), message: 'Workflow created with an empty draft' };
  }

  @Put(':id')
  @RequirePermissions('performance.workflows.manage')
  async update(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: WorkflowSettingsDto) {
    return { success: true, data: await this.workflows.update(tenantId, id, body, actor), message: 'Workflow saved' };
  }

  @Put(':id/draft')
  @RequirePermissions('performance.workflows.manage')
  async saveDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: WorkflowDraftDto) {
    return { success: true, data: await this.workflows.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Delete(':id/draft')
  @RequirePermissions('performance.workflows.manage')
  async discardDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.discardDraft(tenantId, id, actor), message: 'Draft discarded' };
  }

  @Post(':id/draft/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.workflows.manage')
  async publish(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.publish(tenantId, id, actor), message: 'New workflow version published' };
  }

  /** Who would review an employee at each stage; nothing is stored. Names reviewers, so it needs people.view too. */
  @Post(':id/versions/:versionId/resolve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.view', 'people.view')
  async resolve(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('versionId', ParseUUIDPipe) versionId: string, @Body() body: ResolveReviewersDto) {
    return { success: true, data: await this.workflows.resolve(tenantId, id, versionId, body) };
  }

  @Post(':id/duplicate')
  @RequirePermissions('performance.workflows.manage')
  async duplicate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DuplicateDto) {
    return { success: true, data: await this.workflows.duplicate(tenantId, id, body, actor), message: 'Workflow copied as a draft' };
  }

  @Delete(':id')
  @RequirePermissions('performance.workflows.manage')
  async remove(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.remove(tenantId, id, actor), message: 'Workflow deleted' };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.workflows.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.archive(tenantId, id, actor), message: 'Workflow archived' };
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.workflows.manage')
  async restore(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.workflows.restore(tenantId, id, actor), message: 'Workflow restored' };
  }
}
