import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { MAX_FILE_BYTES } from '@/modules/onboarding/candidate-documents';
import { fileResponse } from '@/modules/onboarding/file-response';
import { PerformanceAppraisalsService } from './appraisals.service';
import { PerformanceReviewsService, UploadedFile as Upload } from './reviews.service';
import { PerformanceOptionsService } from './performance-options.service';
import { ColleagueQueryDto, DecideNominationDto, EvidenceQueryDto, NominateDto, ReasonDto, SaveReviewDto, SendBackDto } from './dto/performance-cycles.dto';

type Actor = AuthenticatedTenantUser;

/**
 * Everyone's own appraisals and review inbox. People only ever reach their
 * own appraisals and the reviews assigned to them: every route checks who is
 * asking, on the server, beyond the permission to open these screens.
 */
@Controller('performance/my')
export class PerformanceMyController {
  constructor(private readonly appraisals: PerformanceAppraisalsService, private readonly reviews: PerformanceReviewsService, private readonly access: AccessService, private readonly options: PerformanceOptionsService) {}

  private async holds(actor: Actor, permission: 'performance.reviews.view_all' | 'performance.cycles.manage') {
    return (await this.access.getMemberPermissions(actor.tenantId, actor.tenantMemberId)).includes(permission);
  }

  /** Colleagues to nominate or assign as reviewers: names and employee codes only, on a search. */
  @Get('colleagues')
  @RequirePermissions('performance.my.view')
  async colleagues(@CurrentTenant() tenantId: string, @Query() query: ColleagueQueryDto) {
    return { success: true, data: await this.options.colleagues(tenantId, query.search) };
  }

  @Get('appraisals')
  @RequirePermissions('performance.my.view')
  async mine(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.appraisals.mine(tenantId, actor) };
  }

  @Get('appraisals/:id')
  @RequirePermissions('performance.my.view')
  async myAppraisal(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.appraisals.myAppraisal(tenantId, id, actor) };
  }

  @Post('appraisals/:id/stages/:stageKey/nominations')
  @RequirePermissions('performance.my.view')
  async nominate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('stageKey') stageKey: string, @Body() body: NominateDto) {
    return { success: true, data: await this.appraisals.nominate(tenantId, id, stageKey, body, actor, false), message: 'Reviewers nominated' };
  }

  @Get('inbox')
  @RequirePermissions('performance.my.view')
  async inbox(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    const [tasks, nominations] = await Promise.all([this.reviews.inbox(tenantId, actor), this.appraisals.nominationsToDecide(tenantId, actor)]);
    return { success: true, data: { ...tasks, nominationsToDecide: nominations } };
  }

  @Post('nominations/:id/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.my.view')
  async decide(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: DecideNominationDto) {
    return { success: true, data: await this.appraisals.decide(tenantId, id, body, actor, await this.holds(actor, 'performance.cycles.manage')), message: body.approve ? 'Nomination approved' : 'Nomination rejected' };
  }

  @Get('reviews/:assignmentId')
  @RequirePermissions('performance.my.view')
  async form(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return { success: true, data: await this.reviews.form(tenantId, assignmentId, actor, false) };
  }

  /** A submitted review someone else wrote, read-only, if the visibility rules let the asker see it. */
  @Get('reviews/:assignmentId/read')
  @RequirePermissions('performance.my.view')
  async read(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return { success: true, data: await this.reviews.read(tenantId, assignmentId, actor, await this.holds(actor, 'performance.reviews.view_all')) };
  }

  @Put('reviews/:assignmentId')
  @RequirePermissions('performance.my.view')
  async save(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body: SaveReviewDto) {
    return { success: true, data: await this.reviews.save(tenantId, assignmentId, body, actor), message: 'Draft saved' };
  }

  @Post('reviews/:assignmentId/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.my.view')
  async submit(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string) {
    return { success: true, data: await this.reviews.submit(tenantId, assignmentId, actor), message: 'Submitted' };
  }

  @Post('reviews/:assignmentId/decline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.my.view')
  async decline(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body: ReasonDto) {
    return { success: true, data: await this.reviews.decline(tenantId, assignmentId, body.reason, actor), message: 'Review declined' };
  }

  @Post('reviews/:assignmentId/send-back')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('performance.my.view')
  async sendBack(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Body() body: SendBackDto) {
    return { success: true, data: await this.reviews.sendBack(tenantId, assignmentId, body.toStageKey, body.reason, actor), message: 'Sent back for correction' };
  }

  @Post('reviews/:assignmentId/files')
  @RequirePermissions('performance.my.view')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }))
  async upload(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Query() query: EvidenceQueryDto, @UploadedFile() file: Upload | undefined) {
    return { success: true, data: await this.reviews.upload(tenantId, assignmentId, query, file, actor), message: 'Evidence attached' };
  }

  @Delete('reviews/:assignmentId/files/:fileId')
  @RequirePermissions('performance.my.view')
  async removeFile(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assignmentId', ParseUUIDPipe) assignmentId: string, @Param('fileId', ParseUUIDPipe) fileId: string) {
    return { success: true, data: await this.reviews.removeFile(tenantId, assignmentId, fileId, actor), message: 'Evidence removed' };
  }

  /** An evidence file, to whoever may see the review it belongs to. */
  @Get('files/:fileId')
  @RequirePermissions('performance.my.view')
  async file(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('fileId', ParseUUIDPipe) fileId: string, @Query('download') download?: string) {
    const file = await this.reviews.file(tenantId, fileId, actor, await this.holds(actor, 'performance.reviews.view_all'));
    return fileResponse(file.bytes, file.contentType, file.name, download);
  }
}
