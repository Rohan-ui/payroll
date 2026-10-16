import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { KrasService } from './kras.service';
import { KpisService } from './kpis.service';
import { RatingScalesService } from './rating-scales.service';
import { DepartmentHeadsService } from './department-heads.service';
import { PerformanceOptionsService } from './performance-options.service';
import { StarterLibraryService } from './starter-library.service';
import {
  AppointHeadDto, CancelHeadDto, CreateKpiDto, CreateKraDto, CreateScaleDto, DuplicateDto, EmployeeSearchQueryDto, EndHeadDto,
  LibraryListQueryDto, ScaleDraftDto, UpdateKpiDto, UpdateKraDto, UpdateScaleDto,
} from './dto/performance-library.dto';
import { MemberSearchQueryDto } from './dto/performance-workflows.dto';

type Actor = AuthenticatedTenantUser;

/**
 * Performance setup: the KRA and KPI libraries, rating scales and department
 * heads. The workspace comes from the signed-in member, never the request.
 */
@Controller('performance')
export class PerformanceLibraryController {
  constructor(
    private readonly kras: KrasService,
    private readonly kpis: KpisService,
    private readonly scales: RatingScalesService,
    private readonly heads: DepartmentHeadsService,
    private readonly lookups: PerformanceOptionsService,
    private readonly starter: StarterLibraryService,
  ) {}

  @Get('options')
  @RequirePermissions('performance.library.view')
  async options(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.lookups.options(tenantId) };
  }

  @Get('options/employees')
  @RequirePermissions('performance.library.view')
  async employees(@CurrentTenant() tenantId: string, @Query() query: EmployeeSearchQueryDto) {
    return { success: true, data: await this.lookups.employees(tenantId, query.search) };
  }

  @Get('options/members')
  @RequirePermissions('performance.library.view')
  async members(@CurrentTenant() tenantId: string, @Query() query: MemberSearchQueryDto) {
    return { success: true, data: await this.lookups.members(tenantId, query.search) };
  }

  @Get('options/roles')
  @RequirePermissions('performance.library.view')
  async roles(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.lookups.roles(tenantId) };
  }

  /* ── KRAs ── */

  @Get('kras')
  @RequirePermissions('performance.library.view')
  async listKras(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.kras.list(tenantId, query) };
  }

  @Get('kras/:id')
  @RequirePermissions('performance.library.view')
  async getKra(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kras.get(tenantId, id) };
  }

  /** Loads the starter KRA and KPI library (and its rating scale); what already exists is left alone. */
  @Post('starter-library')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.manage', 'performance.scales.manage')
  async loadStarter(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.starter.load(tenantId, actor), message: 'Starter library loaded' };
  }

  @Post('kras')
  @RequirePermissions('performance.library.manage')
  async createKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateKraDto) {
    return { success: true, data: await this.kras.create(tenantId, body, actor), message: 'KRA created' };
  }

  @Put('kras/:id')
  @RequirePermissions('performance.library.manage')
  async updateKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateKraDto) {
    return { success: true, data: await this.kras.update(tenantId, id, body, actor), message: 'KRA saved' };
  }

  @Post('kras/:id/duplicate')
  @RequirePermissions('performance.library.manage')
  async duplicateKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DuplicateDto) {
    return { success: true, data: await this.kras.duplicate(tenantId, id, body, actor), message: 'KRA copied' };
  }

  @Delete('kras/:id')
  @RequirePermissions('performance.library.manage')
  async deleteKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kras.remove(tenantId, id, actor), message: 'KRA deleted' };
  }

  @Post('kras/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.manage')
  async archiveKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kras.archive(tenantId, id, actor), message: 'KRA archived' };
  }

  @Post('kras/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.manage')
  async restoreKra(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kras.restore(tenantId, id, actor), message: 'KRA restored' };
  }

  /* ── KPIs ── */

  @Get('kpis')
  @RequirePermissions('performance.library.view')
  async listKpis(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.kpis.list(tenantId, query) };
  }

  @Get('kpis/:id')
  @RequirePermissions('performance.library.view')
  async getKpi(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kpis.get(tenantId, id) };
  }

  @Post('kpis')
  @RequirePermissions('performance.library.manage')
  async createKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateKpiDto) {
    return { success: true, data: await this.kpis.create(tenantId, body, actor), message: 'KPI created' };
  }

  @Put('kpis/:id')
  @RequirePermissions('performance.library.manage')
  async updateKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateKpiDto) {
    return { success: true, data: await this.kpis.update(tenantId, id, body, actor), message: 'KPI saved' };
  }

  @Post('kpis/:id/duplicate')
  @RequirePermissions('performance.library.manage')
  async duplicateKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DuplicateDto) {
    return { success: true, data: await this.kpis.duplicate(tenantId, id, body, actor), message: 'KPI copied' };
  }

  @Delete('kpis/:id')
  @RequirePermissions('performance.library.manage')
  async deleteKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kpis.remove(tenantId, id, actor), message: 'KPI deleted' };
  }

  @Post('kpis/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.manage')
  async archiveKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kpis.archive(tenantId, id, actor), message: 'KPI archived' };
  }

  @Post('kpis/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.library.manage')
  async restoreKpi(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.kpis.restore(tenantId, id, actor), message: 'KPI restored' };
  }

  /* ── Rating scales ── */

  @Get('rating-scales')
  @RequirePermissions('performance.library.view')
  async listScales(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.scales.list(tenantId, query) };
  }

  @Get('rating-scales/:id')
  @RequirePermissions('performance.library.view')
  async getScale(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.get(tenantId, id) };
  }

  @Post('rating-scales')
  @RequirePermissions('performance.scales.manage')
  async createScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateScaleDto) {
    return { success: true, data: await this.scales.create(tenantId, body, actor), message: 'Rating scale created as a draft' };
  }

  @Put('rating-scales/:id')
  @RequirePermissions('performance.scales.manage')
  async updateScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateScaleDto) {
    return { success: true, data: await this.scales.update(tenantId, id, body, actor), message: 'Rating scale saved' };
  }

  @Put('rating-scales/:id/draft')
  @RequirePermissions('performance.scales.manage')
  async saveScaleDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ScaleDraftDto) {
    return { success: true, data: await this.scales.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Delete('rating-scales/:id/draft')
  @RequirePermissions('performance.scales.manage')
  async discardScaleDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.discardDraft(tenantId, id, actor), message: 'Draft discarded' };
  }

  @Post('rating-scales/:id/draft/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.scales.manage')
  async publishScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.publish(tenantId, id, actor), message: 'New rating scale version published' };
  }

  @Delete('rating-scales/:id')
  @RequirePermissions('performance.scales.manage')
  async deleteScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.remove(tenantId, id, actor), message: 'Rating scale deleted' };
  }

  @Post('rating-scales/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.scales.manage')
  async archiveScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.archive(tenantId, id, actor), message: 'Rating scale archived' };
  }

  @Post('rating-scales/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.scales.manage')
  async restoreScale(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.scales.restore(tenantId, id, actor), message: 'Rating scale restored' };
  }

  /* ── Department heads ── */

  @Get('department-heads')
  @RequirePermissions('performance.library.view')
  async listHeads(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.heads.list(tenantId) };
  }

  @Get('department-heads/departments/:departmentId')
  @RequirePermissions('performance.library.view')
  async headHistory(@CurrentTenant() tenantId: string, @Param('departmentId', ParseUUIDPipe) departmentId: string) {
    return { success: true, data: await this.heads.history(tenantId, departmentId) };
  }

  @Post('department-heads')
  @RequirePermissions('performance.department_heads.manage')
  async appointHead(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: AppointHeadDto) {
    return { success: true, data: await this.heads.appoint(tenantId, body, actor), message: 'Department head appointed' };
  }

  @Post('department-heads/:id/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.department_heads.manage')
  async endHead(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: EndHeadDto) {
    return { success: true, data: await this.heads.end(tenantId, id, body, actor), message: 'Appointment end date set' };
  }

  @Post('department-heads/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.department_heads.manage')
  async cancelHead(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelHeadDto) {
    return { success: true, data: await this.heads.cancel(tenantId, id, body, actor), message: 'Appointment cancelled' };
  }
}
