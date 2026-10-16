import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CandidatesService } from './candidates.service';
import { InterviewsService } from './interviews.service';
import { OnboardingDashboardService } from './onboarding-dashboard.service';
import { OffersService } from './offers.service';
import { TemplatesService } from '@/modules/documents/templates.service';
import { CandidateDocumentsService, UploadedDocument } from './candidate-documents.service';
import { MAX_FILE_BYTES } from './candidate-documents';
import { fileResponse } from './file-response';
import {
  CancelInterviewDto,
  CandidateInputDto,
  CandidateNoteDto,
  DashboardQueryDto,
  InterviewDecisionDto,
  InterviewFeedbackDto,
  ListCandidatesQueryDto,
  ListOffersQueryDto,
  OfferApprovalDto,
  OfferInputDto,
  SubmitOfferDto,
  WithdrawOfferDto,
  ListInterviewsQueryDto,
  MoveCandidateDto,
  OverrideCandidateStatusDto,
  RescheduleInterviewDto,
  ScheduleInterviewDto,
  RequestDocumentsDto,
  RejectDocumentDto,
  OfferPreviewDto,
} from './dto/onboarding.dto';

/**
 * HRMS onboarding: candidates, their workflow and interviews. The workspace is
 * always the session's; every action needs its own permission.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(
    private readonly candidates: CandidatesService,
    private readonly interviews: InterviewsService,
    private readonly dashboard: OnboardingDashboardService,
    private readonly offers: OffersService,
    private readonly templates: TemplatesService,
    private readonly documents: CandidateDocumentsService,
  ) {}

  @Get('dashboard')
  @RequirePermissions('onboarding.view')
  async summary(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() query: DashboardQueryDto) {
    return { success: true, data: await this.dashboard.summary(tenantId, actor, query.timezone) };
  }

  @Get('meta')
  @RequirePermissions('onboarding.view')
  async meta(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.candidates.meta(tenantId) };
  }

  /** Active employees to choose a reporting manager from: at most 20 matches. */
  @Get('employees')
  @RequirePermissions('onboarding.view')
  async employees(@CurrentTenant() tenantId: string, @Query('search') search?: string) {
    return { success: true, data: await this.candidates.searchEmployees(tenantId, typeof search === 'string' ? search.slice(0, 100) : '') };
  }

  // ── Candidates ──────────────────────────────────────────────

  @Get('candidates')
  @RequirePermissions('onboarding.view')
  async listCandidates(@CurrentTenant() tenantId: string, @Query() query: ListCandidatesQueryDto) {
    const result = await this.candidates.list(tenantId, query);
    return { success: true, data: result.items, pagination: result.pagination };
  }

  @Post('candidates')
  @RequirePermissions('onboarding.candidates.manage')
  async createCandidate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CandidateInputDto) {
    return { success: true, data: await this.candidates.create(tenantId, body, actor), message: 'Candidate added' };
  }

  @Get('candidates/:id')
  @RequirePermissions('onboarding.view')
  async getCandidate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.candidates.get(tenantId, id, actor.tenantMemberId) };
  }

  @Put('candidates/:id')
  @RequirePermissions('onboarding.candidates.manage')
  async updateCandidate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: CandidateInputDto) {
    return { success: true, data: await this.candidates.update(tenantId, id, body, actor), message: 'Candidate updated' };
  }

  @Post('candidates/:id/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.manage')
  async moveCandidate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: MoveCandidateDto) {
    return { success: true, data: await this.candidates.move(tenantId, id, body, actor), message: 'Status changed' };
  }

  @Post('candidates/:id/override')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.override')
  async overrideCandidate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: OverrideCandidateStatusDto) {
    return { success: true, data: await this.candidates.override(tenantId, id, body, actor), message: 'Status overridden' };
  }

  @Post('candidates/:id/notes')
  @RequirePermissions('onboarding.candidates.manage')
  async addNote(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: CandidateNoteDto) {
    return { success: true, data: await this.candidates.addNote(tenantId, id, body.note, actor), message: 'Note added' };
  }

  @Post('candidates/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.candidates.setArchived(tenantId, id, true, actor), message: 'Candidate archived' };
  }

  @Post('candidates/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.manage')
  async restore(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.candidates.setArchived(tenantId, id, false, actor), message: 'Candidate restored' };
  }

  // ── Interviews ──────────────────────────────────────────────

  @Post('candidates/:id/interviews')
  @RequirePermissions('onboarding.interviews.schedule')
  async schedule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: ScheduleInterviewDto) {
    return { success: true, data: await this.interviews.schedule(tenantId, id, body, actor), message: 'Interview scheduled' };
  }

  @Get('interviews')
  @RequirePermissions('onboarding.view')
  async listInterviews(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() query: ListInterviewsQueryDto) {
    return { success: true, data: await this.interviews.list(tenantId, query, actor) };
  }

  @Post('interviews/:id/reschedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.interviews.schedule')
  async reschedule(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: RescheduleInterviewDto) {
    return { success: true, data: await this.interviews.reschedule(tenantId, id, body, actor), message: 'Interview rescheduled' };
  }

  @Post('interviews/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.interviews.schedule')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: CancelInterviewDto) {
    return { success: true, data: await this.interviews.cancel(tenantId, id, body, actor), message: 'Interview cancelled' };
  }

  @Post('interviews/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.interviews.schedule')
  async complete(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.interviews.complete(tenantId, id, actor), message: 'Interview marked completed' };
  }

  @Post('interviews/:id/feedback')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.interviews.feedback')
  async feedback(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: InterviewFeedbackDto) {
    return { success: true, data: await this.interviews.feedback(tenantId, id, body, actor), message: 'Feedback recorded' };
  }

  @Post('interviews/:id/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.decide')
  async decide(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: InterviewDecisionDto) {
    return { success: true, data: await this.interviews.decide(tenantId, id, body, actor), message: 'Decision recorded' };
  }
  // ── Offers ──────────────────────────────────────────────────

  @Get('offers')
  @RequirePermissions('onboarding.view')
  async listOffers(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() query: ListOffersQueryDto) {
    const result = await this.offers.list(tenantId, query, actor);
    return { success: true, data: result.items, pagination: result.pagination };
  }

  @Post('candidates/:id/offers')
  @RequirePermissions('onboarding.offers.manage')
  async createOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: OfferInputDto) {
    return { success: true, data: await this.offers.create(tenantId, id, body, actor), message: 'Offer drafted' };
  }

  @Get('offers/:id')
  @RequirePermissions('onboarding.view')
  async getOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.offers.get(tenantId, id, actor) };
  }

  /** The letter as sent, or a marked preview before that. Nothing about the offer changes. */
  @Get('offers/:id/pdf')
  @RequirePermissions('onboarding.view')
  @Header('Cache-Control', 'private, no-store')
  async offerPdf(@CurrentTenant() tenantId: string, @Param('id') id: string, @Query('download') download?: string) {
    const file = await this.offers.pdfFile(tenantId, id);
    return fileResponse(file.bytes, 'application/pdf', file.filename, download);
  }

  /** The letter of an unsaved offer form: checked like a save, but nothing is stored or sent. */
  @Post('offers/preview-pdf')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.manage')
  @Header('Cache-Control', 'private, no-store')
  async previewOfferPdf(@CurrentTenant() tenantId: string, @Body() body: OfferPreviewDto) {
    return fileResponse(await this.offers.previewDraft(tenantId, body), 'application/pdf', 'offer-preview.pdf');
  }

  @Put('offers/:id')
  @RequirePermissions('onboarding.offers.manage')
  async updateOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: OfferInputDto) {
    return { success: true, data: await this.offers.update(tenantId, id, body, actor), message: 'Offer saved' };
  }

  @Post('offers/:id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.manage')
  async submitOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: SubmitOfferDto) {
    return { success: true, data: await this.offers.submit(tenantId, id, body, actor), message: 'Offer sent for approval' };
  }

  @Post('offers/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.approve')
  async approveOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: OfferApprovalDto) {
    return { success: true, data: await this.offers.approve(tenantId, id, body.comment, actor), message: 'Offer approved' };
  }

  @Post('offers/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.approve')
  async rejectOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: OfferApprovalDto) {
    return { success: true, data: await this.offers.reject(tenantId, id, body.comment, actor), message: 'Offer sent back' };
  }

  @Post('offers/:id/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.send')
  async sendOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.offers.send(tenantId, id, actor) };
  }

  @Post('offers/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.manage')
  async withdrawOffer(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: WithdrawOfferDto) {
    return { success: true, data: await this.offers.withdraw(tenantId, id, body.reason, actor), message: 'Offer withdrawn' };
  }

  // ── Offer letter templates (managed in Documents & letterheads) ──

  /** Offer letter templates to choose from when drafting an offer. */
  @Get('templates')
  @RequirePermissions('onboarding.view')
  async listTemplates(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.templates.list(tenantId, 'OFFER_LETTER') };
  }

  // ── Documents ───────────────────────────────────────────────

  @Get('candidates/:id/documents')
  @RequirePermissions('onboarding.documents.view')
  async listDocuments(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.documents.list(tenantId, id) };
  }

  @Post('candidates/:id/documents')
  @RequirePermissions('onboarding.documents.manage')
  async requestDocuments(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: RequestDocumentsDto) {
    return { success: true, data: await this.documents.request(tenantId, id, body.items, actor), message: 'Documents requested' };
  }

  @Delete('candidates/:id/documents/:requestId')
  @RequirePermissions('onboarding.documents.manage')
  async removeDocumentRequest(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('requestId') requestId: string) {
    return { success: true, data: await this.documents.removeRequest(tenantId, id, requestId, actor), message: 'Document removed from the list' };
  }

  @Post('candidates/:id/documents/:requestId/files')
  @RequirePermissions('onboarding.documents.manage')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }))
  async uploadDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @UploadedFile() file: UploadedDocument | undefined,
  ) {
    return { success: true, data: await this.documents.uploadByStaff(tenantId, id, requestId, file, actor), message: 'Document uploaded' };
  }

  /** One uploaded file, to view or save. Only through this route: files are never served directly. */
  @Get('candidates/:id/documents/files/:fileId')
  @RequirePermissions('onboarding.documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async documentFile(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('fileId') fileId: string, @Query('download') download?: string) {
    const file = await this.documents.fileContent(tenantId, id, fileId, actor);
    return fileResponse(file.bytes, file.contentType, file.filename, download);
  }

  @Post('candidates/:id/documents/files/:fileId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.verify')
  async verifyDocument(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('fileId') fileId: string) {
    return { success: true, data: await this.documents.verify(tenantId, id, fileId, actor), message: 'Document verified' };
  }

  @Post('candidates/:id/documents/files/:fileId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.verify')
  async rejectDocument(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('fileId') fileId: string, @Body() body: RejectDocumentDto) {
    return { success: true, data: await this.documents.reject(tenantId, id, fileId, body.reason, actor), message: 'Document rejected' };
  }

  @Post('candidates/:id/documents/link')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.manage')
  async sendDocumentLink(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.documents.sendLink(tenantId, id, actor) };
  }
}
