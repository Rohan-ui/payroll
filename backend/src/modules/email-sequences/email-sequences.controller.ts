import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { leadVisibility } from '@/modules/crm/lead-visibility';
import { EmailSequencesService } from './email-sequences.service';
import { SequenceActivityService } from './sequence-activity.service';
import { EmailSuppressionService } from './email-suppression.service';
import {
  AddSuppressionsDto, EnrollLeadsDto, EnrollmentsQueryDto, PreviewEmailDto, ReportQueryDto, SendsQueryDto, SequenceInputDto, SequenceRuleDto, StopEnrollmentDto,
  SuppressionQueryDto, TestEmailDto,
} from './dto/email-sequences.dto';

/**
 * Drip sequences (CRM → Email & Marketing). Every route is the signed-in
 * member's workspace only, checked on the server by permission; lead lists
 * show only the leads the member may see.
 */
@Controller('email-sequences')
export class EmailSequencesController {
  constructor(
    private readonly sequences: EmailSequencesService,
    private readonly activity: SequenceActivityService,
    private readonly suppressions: EmailSuppressionService,
    private readonly access: AccessService,
  ) {}

  private async visibility(tenantId: string, actor: AuthenticatedTenantUser) {
    return leadVisibility(await this.access.getMemberPermissions(tenantId, actor.tenantMemberId), actor.tenantMemberId);
  }

  @Get('overview')
  @RequirePermissions('sequences.view')
  async overview(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.sequences.overview(tenantId) };
  }

  /** Pipelines, stages, sources and templates to choose from in the editor. */
  @Get('options')
  @RequirePermissions('sequences.view')
  async options(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.sequences.options(tenantId) };
  }

  @Get()
  @RequirePermissions('sequences.view')
  async list(@CurrentTenant() tenantId: string, @Query('status') status?: string) {
    return { success: true, data: await this.sequences.list(tenantId, status) };
  }

  @Post()
  @RequirePermissions('sequences.manage')
  async create(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: SequenceInputDto) {
    return { success: true, data: await this.sequences.create(tenantId, body, actor), message: 'Sequence saved as a draft' };
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.view')
  async preview(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: PreviewEmailDto) {
    return { success: true, data: await this.sequences.preview(tenantId, await this.visibility(tenantId, actor), body) };
  }

  // ── The sending log and its fixes ────────────────────────────

  @Get('sends')
  @RequirePermissions('sequences.view')
  async sends(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() query: SendsQueryDto) {
    const permissions = await this.access.getMemberPermissions(tenantId, actor.tenantMemberId);
    return { success: true, data: await this.activity.sends(tenantId, leadVisibility(permissions, actor.tenantMemberId), query, permissions.includes('sequences.logs.view')) };
  }

  @Post('sends/:id/retry')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async retry(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.activity.retry(tenantId, id, await this.visibility(tenantId, actor), actor), message: 'Email scheduled again' };
  }

  @Post('sends/:id/mark-sent')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async markSent(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.activity.markSent(tenantId, id, await this.visibility(tenantId, actor), actor), message: 'Marked as sent' };
  }

  // ── Leads ───────────────────────────────────────────────────

  @Get('leads/:leadId')
  @RequirePermissions('sequences.view')
  async forLead(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('leadId') leadId: string) {
    return { success: true, data: await this.activity.forLead(tenantId, leadId, await this.visibility(tenantId, actor)) };
  }

  @Post('enrollments/:id/stop')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.enroll')
  async stop(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: StopEnrollmentDto) {
    return { success: true, data: await this.activity.stop(tenantId, id, await this.visibility(tenantId, actor), actor, body.note, body.moveToOutreach), message: 'Enrollment stopped' };
  }

  // ── The do-not-email list ───────────────────────────────────

  @Get('suppressions')
  @RequirePermissions('sequences.view')
  async suppressionList(@CurrentTenant() tenantId: string, @Query() query: SuppressionQueryDto) {
    return { success: true, data: await this.suppressions.list(tenantId, query) };
  }

  @Post('suppressions')
  @RequirePermissions('sequences.suppression.manage')
  async addSuppressions(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: AddSuppressionsDto) {
    return { success: true, data: await this.suppressions.addManual(tenantId, body.emails, body.note, actor), message: 'Added to the do-not-email list' };
  }

  @Delete('suppressions/:id')
  @RequirePermissions('sequences.suppression.manage')
  async removeSuppression(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.suppressions.remove(tenantId, id, actor), message: 'Removed from the do-not-email list' };
  }

  // ── One sequence ────────────────────────────────────────────

  @Get(':id')
  @RequirePermissions('sequences.view')
  async get(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.sequences.get(tenantId, id) };
  }

  @Put(':id')
  @RequirePermissions('sequences.manage')
  async update(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: SequenceInputDto) {
    return { success: true, data: await this.sequences.update(tenantId, id, body, actor), message: 'Sequence saved' };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async activate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.sequences.activate(tenantId, id, actor), message: 'Sequence active' };
  }

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async pause(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.sequences.pause(tenantId, id, actor), message: 'Sequence paused' };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.sequences.archive(tenantId, id, actor), message: 'Sequence archived' };
  }

  @Post(':id/test-email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async testEmail(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: TestEmailDto) {
    return { success: true, data: await this.sequences.testEmail(tenantId, id, body.stepId, actor), message: 'Test email sent' };
  }

  @Get(':id/report')
  @RequirePermissions('sequences.view')
  async report(@CurrentTenant() tenantId: string, @Param('id') id: string, @Query() query: ReportQueryDto) {
    return { success: true, data: await this.sequences.report(tenantId, id, query) };
  }

  @Post(':id/retry-failed')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async retryFailed(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.activity.retryFailed(tenantId, id, await this.visibility(tenantId, actor), actor), message: 'Failed emails scheduled again' };
  }

  @Get(':id/enrollments')
  @RequirePermissions('sequences.view')
  async enrollments(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Query() query: EnrollmentsQueryDto) {
    return { success: true, data: await this.activity.list(tenantId, id, await this.visibility(tenantId, actor), query) };
  }

  @Post(':id/enrollments/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.enroll')
  async enrollPreview(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: EnrollLeadsDto) {
    return { success: true, data: await this.activity.preview(tenantId, id, body.leadIds, await this.visibility(tenantId, actor), body.moveFromOutreach) };
  }

  /** One lead, by hand. */
  @Post(':id/enrollments')
  @RequirePermissions('sequences.enroll')
  async enroll(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: EnrollLeadsDto) {
    if (body.leadIds.length > 1) throw new BadRequestException('Add several leads at once with bulk enrollment.');
    return { success: true, data: await this.activity.enroll(tenantId, id, body.leadIds, 'MANUAL', await this.visibility(tenantId, actor), actor, body.moveFromOutreach) };
  }

  /** Many leads at once: its own permission. */
  @Post(':id/enrollments/bulk')
  @RequirePermissions('sequences.enroll_bulk')
  async enrollBulk(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: EnrollLeadsDto) {
    return { success: true, data: await this.activity.enroll(tenantId, id, body.leadIds, 'BULK', await this.visibility(tenantId, actor), actor, body.moveFromOutreach) };
  }

  @Post(':id/rules')
  @RequirePermissions('sequences.manage')
  async createRule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: SequenceRuleDto) {
    return { success: true, data: await this.sequences.saveRule(tenantId, id, null, body, actor), message: 'Rule saved, switched off' };
  }

  @Put(':id/rules/:ruleId')
  @RequirePermissions('sequences.manage')
  async updateRule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('ruleId') ruleId: string, @Body() body: SequenceRuleDto) {
    return { success: true, data: await this.sequences.saveRule(tenantId, id, ruleId, body, actor), message: 'Rule saved' };
  }

  @Post(':id/rules/:ruleId/enable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async enableRule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return { success: true, data: await this.sequences.setRuleEnabled(tenantId, id, ruleId, true, actor), message: 'Rule switched on' };
  }

  @Post(':id/rules/:ruleId/disable')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async disableRule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return { success: true, data: await this.sequences.setRuleEnabled(tenantId, id, ruleId, false, actor), message: 'Rule switched off' };
  }

  @Delete(':id/rules/:ruleId')
  @RequirePermissions('sequences.manage')
  async deleteRule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return { success: true, data: await this.sequences.deleteRule(tenantId, id, ruleId, actor), message: 'Rule deleted' };
  }

  @Post(':id/rules/:ruleId/dry-run')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sequences.manage')
  async dryRun(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('ruleId') ruleId: string) {
    return { success: true, data: await this.sequences.dryRunRule(tenantId, id, ruleId, await this.visibility(tenantId, actor)) };
  }
}
