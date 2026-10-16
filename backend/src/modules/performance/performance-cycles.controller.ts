import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PerformanceCyclesService } from './cycles.service';
import { PerformanceAppraisalsService } from './appraisals.service';
import { PerformanceReviewsService } from './reviews.service';
import { LibraryListQueryDto } from './dto/performance-library.dto';
import { AppraisalListQueryDto, AssignReviewerDto, CreateCycleDto, CycleSettingsDto, LaunchDto, NominateDto, ReasonDto, TargetsDto } from './dto/performance-cycles.dto';

type Actor = AuthenticatedTenantUser;

/** Appraisal cycles and the appraisals in them, for the people who run them. The workspace comes from the signed-in member. */
@Controller('performance')
export class PerformanceCyclesController {
  constructor(
    private readonly cycles: PerformanceCyclesService,
    private readonly appraisals: PerformanceAppraisalsService,
    private readonly reviews: PerformanceReviewsService,
  ) {}

  @Get('cycles')
  @RequirePermissions('performance.cycles.view')
  async list(@CurrentTenant() tenantId: string, @Query() query: LibraryListQueryDto) {
    return { success: true, data: await this.cycles.list(tenantId, query) };
  }

  @Get('cycles/:id')
  @RequirePermissions('performance.cycles.view')
  async get(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.cycles.get(tenantId, id) };
  }

  @Post('cycles')
  @RequirePermissions('performance.cycles.manage')
  async create(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: CreateCycleDto) {
    return { success: true, data: await this.cycles.create(tenantId, body, actor), message: 'Cycle created as a draft' };
  }

  @Put('cycles/:id')
  @RequirePermissions('performance.cycles.manage')
  async update(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: CycleSettingsDto) {
    return { success: true, data: await this.cycles.update(tenantId, id, body, actor), message: 'Cycle saved' };
  }

  /** Who would be appraised, with what, if the cycle launched now. Nothing is stored. Names reviewers, so it needs people.view too. */
  @Post('cycles/:id/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.cycles.manage', 'people.view')
  async preview(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.cycles.preview(tenantId, id) };
  }

  @Post('cycles/:id/launch')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.cycles.manage')
  async launch(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LaunchDto) {
    const data = await this.cycles.launch(tenantId, id, body, actor);
    return { success: true, data, message: `${data.started} appraisal${data.started === 1 ? '' : 's'} started` };
  }

  @Post('cycles/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.cycles.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.cycles.archive(tenantId, id, actor), message: 'Cycle archived' };
  }

  @Post('cycles/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.cycles.manage')
  async restore(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.cycles.restore(tenantId, id, actor), message: 'Cycle restored' };
  }

  @Delete('cycles/:id')
  @RequirePermissions('performance.cycles.manage')
  async remove(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.cycles.remove(tenantId, id, actor), message: 'Cycle deleted' };
  }

  @Get('cycles/:id/appraisals')
  @RequirePermissions('performance.cycles.view')
  async appraisalsOf(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Query() query: AppraisalListQueryDto) {
    return { success: true, data: await this.cycles.appraisals(tenantId, id, query) };
  }

  @Get('appraisals/:id')
  @RequirePermissions('performance.cycles.view')
  async detail(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.appraisals.detail(tenantId, id) };
  }

  @Put('appraisals/:id/targets')
  @RequirePermissions('performance.cycles.manage')
  async targets(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: TargetsDto) {
    return { success: true, data: await this.appraisals.setTargets(tenantId, id, body, actor), message: 'Targets saved' };
  }

  @Post('appraisals/:id/stages/:stageKey/assignments')
  @RequirePermissions('performance.cycles.manage')
  async assign(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('stageKey') stageKey: string, @Body() body: AssignReviewerDto) {
    return { success: true, data: await this.appraisals.assign(tenantId, id, stageKey, body, actor), message: body.replacesAssignmentId ? 'Reviewer replaced' : 'Reviewer assigned' };
  }

  @Post('appraisals/:id/stages/:stageKey/nominations')
  @RequirePermissions('performance.cycles.manage')
  async nominate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('stageKey') stageKey: string, @Body() body: NominateDto) {
    return { success: true, data: await this.appraisals.nominate(tenantId, id, stageKey, body, actor, true), message: 'Reviewers nominated' };
  }

  @Post('appraisals/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.cycles.manage')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto) {
    return { success: true, data: await this.appraisals.cancel(tenantId, id, body.reason, actor), message: 'Appraisal cancelled' };
  }

  /** Any review, read-only, with names: for people who may read every review. */
  @Get('appraisals/reviews/:assignmentId')
  @RequirePermissions('performance.reviews.view_all')
  async review(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return { success: true, data: await this.reviews.form(tenantId, assignmentId, actor, true) };
  }
}
