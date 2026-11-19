import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OffboardingService } from './offboarding.service';
import {
  CancelSeparationDto, ClearanceItemDto, ClearanceUpdateDto, EmployeeSearchQueryDto, ExitInterviewDto, LastWorkingDateDto,
  ListSeparationsQueryDto, ResignDto, StartSeparationDto, WithdrawDto,
  NoticeDecisionDto, ReassignReportsDto, NotificationSettingsDto, ManagerFeedbackDto, ScheduleInterviewDto, OffboardingReportQueryDto, ExitReasonsDto, ClearanceDetailsDto, ChecklistTemplateDto, ChecklistOwnersQueryDto, TeamChecklistUpdateDto, TeamCommentDto,
} from './dto/offboarding.dto';
import { OffboardingNotificationsService } from './offboarding-notifications.service';
import { TeamExitsService } from './team-exits.service';
import { ExitChecklistService } from './exit-checklist.service';
import { ExitReasonsService } from './exit-reasons.service';
import { OffboardingReportsService } from './offboarding-reports.service';
import { EmployeeAssetsService } from '@/modules/employees/employee-assets.service';
import { RecordAssetReturnDto } from '@/modules/employees/dto/employee-assets.dto';

type Actor = AuthenticatedTenantUser;

/**
 * HRMS offboarding. `my/…` routes act only on the signed-in member's own
 * employee record, found from the session; there is no employee id to pass.
 * Every other route needs its own offboarding permission.
 */
@Controller('offboarding')
export class OffboardingController {
  constructor(private readonly offboarding: OffboardingService, private readonly team: TeamExitsService, private readonly notifications: OffboardingNotificationsService, private readonly checklist: ExitChecklistService, private readonly assets: EmployeeAssetsService, private readonly reasons: ExitReasonsService, private readonly reports: OffboardingReportsService) {}

  // ── A manager's direct reports (who reports to whom decides what they see) ──

  @Get('team')
  @RequirePermissions('offboarding.team.view')
  async teamList(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.team.list(tenantId, actor) };
  }

  @Get('team/:id')
  @RequirePermissions('offboarding.team.view')
  async teamDetail(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.team.detail(tenantId, id, actor) };
  }

  @Post('team/:id/comments')
  @RequirePermissions('offboarding.team.view')
  async teamComment(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: TeamCommentDto) {
    return { success: true, data: await this.team.addComment(tenantId, id, body, actor), message: body.kind === 'HANDOVER' ? 'Handover note added' : 'Comment added' };
  }

  @Put('team/:id/feedback')
  @RequirePermissions('offboarding.team.view')
  async teamFeedback(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ManagerFeedbackDto) {
    return { success: true, data: await this.team.giveFeedback(tenantId, id, body, actor), message: 'Feedback saved' };
  }

  @Put('team/:id/checklist/:itemId')
  @RequirePermissions('offboarding.team.view')
  async teamItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: TeamChecklistUpdateDto) {
    return { success: true, data: await this.team.updateItem(tenantId, id, itemId, body, actor), message: 'Checklist updated' };
  }

  // ── Exit-checklist owners ──

  /**
   * Open items this member's team owns. Everyone holds `offboarding.my.view`;
   * what they see is decided by their team permissions (none, for most).
   */
  @Get('checklist/mine')
  @RequirePermissions('offboarding.my.view')
  async myChecklist(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.checklist.mine(tenantId, actor) };
  }

  @Put('checklist/items/:itemId')
  @RequirePermissions('offboarding.my.view')
  async myChecklistItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: ClearanceUpdateDto) {
    return { success: true, data: await this.offboarding.updateChecklistItemById(tenantId, itemId, body, actor), message: body.status === 'WAIVED' ? 'Item waived' : body.status === 'CLEARED' ? 'Item cleared' : 'Item reopened' };
  }

  /** Assets still out with people who are leaving, for the teams this member looks after (none, for most). */
  @Get('checklist/assets')
  @RequirePermissions('offboarding.my.view')
  async leaversAssets(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.assets.outstandingForLeavers(tenantId, actor) };
  }

  @Put('checklist/assets/:assetId/return')
  @RequirePermissions('offboarding.my.view')
  async leaverAssetReturn(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: RecordAssetReturnDto) {
    await this.assets.recordReturn(tenantId, assetId, body, actor);
    return { success: true, data: await this.assets.outstandingForLeavers(tenantId, actor), message: 'Return recorded' };
  }

  @Get('separations/:id/assets')
  @RequirePermissions('offboarding.view')
  async separationAssets(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.assets.forSeparation(tenantId, id, actor) };
  }

  @Get('checklist/owners')
  @RequirePermissions('offboarding.manage')
  async checklistOwners(@CurrentTenant() tenantId: string, @Query() query: ChecklistOwnersQueryDto) {
    return { success: true, data: await this.checklist.owners(tenantId, query.team) };
  }

  @Get('exit-reasons')
  @RequirePermissions('offboarding.view')
  async exitReasons(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.reasons.list(tenantId) };
  }

  @Put('exit-reasons')
  @RequirePermissions('offboarding.manage')
  async saveExitReasons(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: ExitReasonsDto) {
    return { success: true, data: await this.reasons.save(tenantId, body.reasons, actor), message: 'Exit reasons saved' };
  }

  @Get('interviewers')
  @RequirePermissions('offboarding.manage')
  async interviewers(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.offboarding.interviewers(tenantId) };
  }

  @Get('checklist-template')
  @RequirePermissions('offboarding.view')
  async checklistTemplate(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.checklist.template(tenantId) };
  }

  @Put('checklist-template')
  @RequirePermissions('offboarding.manage')
  async saveChecklistTemplate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: ChecklistTemplateDto) {
    return { success: true, data: await this.checklist.setTemplate(tenantId, body, actor), message: 'Checklist saved' };
  }

  // ── Emails ──

  @Get('notification-settings')
  @RequirePermissions('offboarding.view')
  async notificationSettings(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.notifications.settings(tenantId) };
  }

  @Put('notification-settings')
  @RequirePermissions('offboarding.manage')
  async saveNotificationSettings(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: NotificationSettingsDto) {
    return { success: true, data: await this.notifications.setSettings(tenantId, body, actor), message: 'Email settings saved' };
  }

  @Get('separations/:id/notifications')
  @RequirePermissions('offboarding.view')
  async separationNotifications(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.notifications.list(tenantId, id) };
  }

  @Get('my')
  @RequirePermissions('offboarding.my.view')
  async mine(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.offboarding.mine(tenantId, actor) };
  }

  @Post('my/resignation')
  @RequirePermissions('offboarding.my.view')
  async resign(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: ResignDto) {
    return { success: true, data: await this.offboarding.resign(tenantId, body, actor), message: 'Resignation submitted to HR' };
  }

  @Post('my/resignation/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.my.view')
  async withdraw(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: WithdrawDto) {
    return { success: true, data: await this.offboarding.withdraw(tenantId, body, actor), message: 'Resignation withdrawn' };
  }

  /** The dashboard and reports; settlement money only for those who may see settlements. */
  @Get('reports')
  @RequirePermissions('offboarding.view')
  async report(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Query() query: OffboardingReportQueryDto) {
    return { success: true, data: await this.reports.report(tenantId, query, actor) };
  }

  @Get('summary')
  @RequirePermissions('offboarding.view')
  async summary(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.offboarding.summary(tenantId) };
  }

  @Get('separations')
  @RequirePermissions('offboarding.view')
  async list(@CurrentTenant() tenantId: string, @Query() query: ListSeparationsQueryDto) {
    const result = await this.offboarding.list(tenantId, query);
    return { success: true, data: result.items, pagination: result.pagination };
  }

  @Get('separations/:id')
  @RequirePermissions('offboarding.view')
  async detail(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.offboarding.detail(tenantId, id, actor) };
  }

  @Get('employees')
  @RequirePermissions('offboarding.manage')
  async employees(@CurrentTenant() tenantId: string, @Query() query: EmployeeSearchQueryDto) {
    return { success: true, data: await this.offboarding.searchEmployees(tenantId, query.search) };
  }

  @Post('separations')
  @RequirePermissions('offboarding.manage')
  async start(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: StartSeparationDto) {
    return { success: true, data: await this.offboarding.start(tenantId, body, actor), message: 'Exit started' };
  }

  @Post('separations/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage')
  async approve(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LastWorkingDateDto) {
    return { success: true, data: await this.offboarding.approve(tenantId, id, body, actor), message: 'Resignation accepted' };
  }

  @Put('separations/:id/last-working-date')
  @RequirePermissions('offboarding.manage')
  async lastWorkingDate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LastWorkingDateDto) {
    return { success: true, data: await this.offboarding.changeLastWorkingDate(tenantId, id, body, actor), message: 'Last working day changed' };
  }

  @Put('separations/:id/exit-interview/schedule')
  @RequirePermissions('offboarding.manage')
  async scheduleInterview(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ScheduleInterviewDto) {
    return { success: true, data: await this.offboarding.scheduleInterview(tenantId, id, body, actor), message: 'Exit interview booked' };
  }

  @Post('separations/:id/exit-interview/cancel-booking')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage')
  async cancelInterviewBooking(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.offboarding.cancelInterviewBooking(tenantId, id, actor), message: 'Exit interview booking cancelled' };
  }

  @Put('separations/:id/exit-interview')
  @RequirePermissions('offboarding.manage')
  async exitInterview(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ExitInterviewDto) {
    return { success: true, data: await this.offboarding.recordInterview(tenantId, id, body, actor), message: 'Exit interview saved' };
  }

  @Post('separations/:id/checklist')
  @RequirePermissions('offboarding.manage')
  async addItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ClearanceItemDto) {
    return { success: true, data: await this.offboarding.addChecklistItem(tenantId, id, body, actor), message: 'Checklist item added' };
  }

  @Put('separations/:id/checklist/:itemId/details')
  @RequirePermissions('offboarding.manage')
  async itemDetails(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: ClearanceDetailsDto) {
    return { success: true, data: await this.offboarding.updateChecklistDetails(tenantId, id, itemId, body, actor), message: 'Checklist item saved' };
  }

  /** Who may clear which team's item is decided per item: the team's own permission, or HR's override. */
  @Put('separations/:id/checklist/:itemId')
  @RequirePermissions('offboarding.view')
  async updateItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: ClearanceUpdateDto) {
    return { success: true, data: await this.offboarding.updateChecklistItem(tenantId, id, itemId, body, actor), message: 'Checklist updated' };
  }

  @Put('separations/:id/notice-decision')
  @RequirePermissions('offboarding.manage')
  async noticeDecision(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: NoticeDecisionDto) {
    return { success: true, data: await this.offboarding.decideNotice(tenantId, id, body, actor), message: 'Notice decision recorded' };
  }

  /** Changing someone's manager is a People change, so it needs that permission too. */
  @Post('separations/:id/reassign-reports')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage', 'people.update')
  async reassignReports(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ReassignReportsDto) {
    const result = await this.offboarding.reassignReports(tenantId, id, body, actor);
    return { success: true, data: result.exit, failed: result.failed, message: result.failed.length ? 'Some reports could not be moved' : 'Reports reassigned' };
  }

  @Post('separations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelSeparationDto) {
    return { success: true, data: await this.offboarding.cancel(tenantId, id, body, actor), message: 'Exit cancelled' };
  }

  @Post('separations/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.complete')
  async complete(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.offboarding.complete(tenantId, id, actor), message: 'Exit completed' };
  }
}
