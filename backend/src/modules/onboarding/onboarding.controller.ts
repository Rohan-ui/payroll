import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
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
import { CandidateLetterDocumentsService } from './candidate-letter-documents.service';
import { MAX_FILE_BYTES } from './candidate-documents';
import { fileResponse } from './file-response';
import {
  CancelInterviewDto,
  CandidateInputDto,
  CandidateNoteDto,
  ConvertToEmployeeDto,
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
  GenerateCandidateDocumentDto,
  SaveCandidateDocumentDto,
  UpdateCandidateDocumentDto,
  CreateDocumentTypeDto,
  UpdateDocumentTypeDto,
  UploadFileMetaDto,
  ChangeDocumentStatusDto,
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  SendCandidateDocumentEmailDto,
  RestoreDocumentVersionDto,
  UpdateDocumentTemplateEmailAssociationDto,
  ListAllDocumentsQueryDto,
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
    private readonly letterDocs: CandidateLetterDocumentsService,
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

  @Get('candidates/:id/conversion-defaults')
  @RequirePermissions('onboarding.candidates.manage')
  async getConversionDefaults(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.candidates.getConversionDefaults(tenantId, id) };
  }

  @Post('candidates/:id/convert-to-employee')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.candidates.manage')
  async convertToEmployee(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: ConvertToEmployeeDto,
  ) {
    const result = await this.candidates.convertToEmployee(tenantId, id, body, actor);
    return { success: true, data: result, message: 'Candidate converted to employee successfully' };
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
    return { success: true, data: result.items, pagination: result.pagination, statusCounts: result.statusCounts };
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

  @Post('offers/:id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.offers.manage')
  async changeOfferStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: ChangeDocumentStatusDto,
  ) {
    return { success: true, data: await this.offers.changeStatus(tenantId, id, body, actor), message: 'Offer status updated' };
  }

  // ── Document Templates (managed in Documents & Letterheads) ──

  /** Document templates available for onboarding (offer letters, contracts, agreements, etc.) */
  @Get('templates')
  @RequirePermissions('onboarding.view')
  async listTemplates(@CurrentTenant() tenantId: string, @Query('kind') kind?: string) {
    if (kind && kind !== 'ALL') {
      return { success: true, data: await this.templates.list(tenantId, kind) };
    }
    return { success: true, data: await this.letterDocs.listAvailableTemplates(tenantId) };
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
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_BYTES, files: 20 } }))
  async uploadDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @UploadedFiles() files: UploadedDocument[] = [],
    @Body() body?: UploadFileMetaDto,
  ) {
    return {
      success: true,
      data: await this.documents.uploadByStaff(tenantId, id, requestId, files, actor, body),
      message: 'Document uploaded',
    };
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
    return { success: true, data: await this.documents.verify(tenantId, id, fileId, actor), message: 'Document file verified' };
  }

  @Post('candidates/:id/documents/files/:fileId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.verify')
  async rejectDocument(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('fileId') fileId: string, @Body() body: RejectDocumentDto) {
    return { success: true, data: await this.documents.reject(tenantId, id, fileId, body.reason, actor), message: 'Document file rejected' };
  }

  @Post('candidates/:id/documents/:requestId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.verify')
  async verifyDocumentRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
  ) {
    const result = await this.documents.verifyRequest(tenantId, id, requestId, actor);
    return { success: true, data: result.documents, notifications: result.notifications, message: 'Document verified' };
  }

  @Post('candidates/:id/documents/:requestId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.verify')
  async rejectDocumentRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body() body: RejectDocumentDto,
  ) {
    const result = await this.documents.rejectRequest(tenantId, id, requestId, body.reason, actor);
    return { success: true, data: result.documents, notifications: result.notifications, message: 'Document rejected' };
  }

  @Delete('candidates/:id/documents/:requestId/files/:fileId')
  @RequirePermissions('onboarding.documents.manage')
  async removeDocumentFile(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Param('fileId') fileId: string,
  ) {
    return {
      success: true,
      data: await this.documents.removeFile(tenantId, id, requestId, fileId, actor),
      message: 'File removed',
    };
  }

  @Post('candidates/:id/documents/link')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.manage')
  async sendDocumentLink(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.documents.sendLink(tenantId, id, actor) };
  }

  // ── Document Types Master ───────────────────────────────────

  @Get('document-types')
  @RequirePermissions('onboarding.view')
  async listDocumentTypes(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.documents.listDocumentTypes(tenantId) };
  }

  @Post('document-types')
  @RequirePermissions('onboarding.documents.manage')
  async createDocumentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateDocumentTypeDto,
  ) {
    return { success: true, data: await this.documents.createDocumentType(tenantId, body, actor), message: 'Document type created' };
  }

  @Put('document-types/:id')
  @RequirePermissions('onboarding.documents.manage')
  async updateDocumentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: UpdateDocumentTypeDto,
  ) {
    return { success: true, data: await this.documents.updateDocumentType(tenantId, id, body, actor), message: 'Document type updated' };
  }

  @Delete('document-types/:id')
  @RequirePermissions('onboarding.documents.manage')
  async deleteDocumentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
  ) {
    return { success: true, data: await this.documents.deleteDocumentType(tenantId, id, actor), message: 'Document type deleted' };
  }

  // ── Candidate Letter & Onboarding Generated Documents ────────

  @Get('candidates/:id/letter-placeholders')
  @RequirePermissions('onboarding.view')
  async candidateLetterPlaceholders(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.letterDocs.getCandidatePlaceholders(tenantId, id) };
  }

  @Post('candidates/:id/letter-documents/generate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('onboarding.documents.manage')
  async generateLetterDocument(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() body: GenerateCandidateDocumentDto,
  ) {
    return { success: true, data: await this.letterDocs.generateDocument(tenantId, id, body) };
  }

  // ── Central Generated Onboarding Documents ───────────────────

  @Get('letter-documents')
  @RequirePermissions('onboarding.documents.view')
  async listAllLetterDocuments(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Query() query: ListAllDocumentsQueryDto,
  ) {
    const result = await this.letterDocs.listAll(tenantId, query, actor);
    return {
      success: true,
      data: result.items,
      pagination: result.pagination,
      statusCounts: result.statusCounts,
      typeCounts: result.typeCounts,
    };
  }

  @Get('candidates/:id/letter-documents')
  @RequirePermissions('onboarding.documents.view')
  async listCandidateLetterDocuments(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.letterDocs.listForCandidate(tenantId, id) };
  }

  @Post('candidates/:id/letter-documents')
  @RequirePermissions('onboarding.documents.manage')
  async saveCandidateLetterDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: SaveCandidateDocumentDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.saveDocument(tenantId, id, body, actor),
      message: 'Document saved successfully',
    };
  }

  @Get('candidates/:id/letter-documents/:docId')
  @RequirePermissions('onboarding.documents.view')
  async getCandidateLetterDocument(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return { success: true, data: await this.letterDocs.get(tenantId, id, docId) };
  }

  @Put('candidates/:id/letter-documents/:docId')
  @RequirePermissions('onboarding.documents.manage')
  async updateCandidateLetterDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: UpdateCandidateDocumentDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.updateDocument(tenantId, id, docId, body, actor),
      message: 'Document updated successfully',
    };
  }

  @Get('candidates/:id/letter-documents/:docId/pdf')
  @RequirePermissions('onboarding.documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async downloadLetterPdf(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Query('download') download?: string,
  ) {
    const file = await this.letterDocs.exportPdf(tenantId, id, docId);
    return fileResponse(file.bytes, 'application/pdf', file.filename, download ?? '1');
  }

  @Get('candidates/:id/letter-documents/:docId/docx')
  @RequirePermissions('onboarding.documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async downloadLetterDocx(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    const file = await this.letterDocs.exportDocx(tenantId, id, docId);
    return fileResponse(
      file.bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file.filename,
      '1',
    );
  }

  // ── Status Management & History ──────────────────────────────────────────

  @Post('candidates/:id/letter-documents/:docId/status')
  @RequirePermissions('onboarding.documents.manage')
  async changeCandidateDocumentStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: ChangeDocumentStatusDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.changeStatus(tenantId, id, docId, body, actor),
      message: 'Document status changed successfully',
    };
  }

  @Get('candidates/:id/letter-documents/:docId/status-history')
  @RequirePermissions('onboarding.documents.view')
  async getCandidateDocumentStatusHistory(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.getStatusHistory(tenantId, id, docId),
    };
  }

  // ── Version History & Restoration ────────────────────────────────────────

  @Get('candidates/:id/letter-documents/:docId/versions')
  @RequirePermissions('onboarding.documents.view')
  async listCandidateDocumentVersions(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.listVersions(tenantId, id, docId),
    };
  }

  @Get('candidates/:id/letter-documents/:docId/versions/:verId')
  @RequirePermissions('onboarding.documents.view')
  async getCandidateDocumentVersion(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('verId') verId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.getVersion(tenantId, id, docId, verId),
    };
  }

  @Post('candidates/:id/letter-documents/:docId/versions/:verId/restore')
  @RequirePermissions('onboarding.documents.manage')
  async restoreCandidateDocumentVersion(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('verId') verId: string,
    @Body() body: RestoreDocumentVersionDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.restoreVersion(tenantId, id, docId, verId, actor, body),
      message: 'Document version restored successfully',
    };
  }

  @Get('candidates/:id/letter-documents/:docId/versions/:verId/pdf')
  @RequirePermissions('onboarding.documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async downloadVersionPdf(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('verId') verId: string,
    @Query('download') download?: string,
  ) {
    const file = await this.letterDocs.exportVersionPdf(tenantId, id, docId, verId);
    return fileResponse(file.bytes, 'application/pdf', file.filename, download ?? '1');
  }

  @Get('candidates/:id/letter-documents/:docId/versions/:verId/docx')
  @RequirePermissions('onboarding.documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async downloadVersionDocx(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('verId') verId: string,
  ) {
    const file = await this.letterDocs.exportVersionDocx(tenantId, id, docId, verId);
    return fileResponse(
      file.bytes,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      file.filename,
      '1',
    );
  }

  // ── PDF Email Delivery & History ─────────────────────────────────────────

  @Get('candidates/:id/letter-documents/:docId/email/preview')
  @RequirePermissions('onboarding.documents.view')
  async previewCandidateDocumentEmail(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Query('templateId') templateId?: string,
    @Query('versionId') versionId?: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.previewEmail(tenantId, id, docId, { templateId, versionId }),
    };
  }

  @Get('candidates/:id/letter-documents/:docId/email-preview')
  @RequirePermissions('onboarding.documents.view')
  async previewCandidateDocumentEmailAlias(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Query('templateId') templateId?: string,
    @Query('versionId') versionId?: string,
  ) {
    return this.previewCandidateDocumentEmail(tenantId, id, docId, templateId, versionId);
  }

  @Post('candidates/:id/letter-documents/:docId/email/send')
  @RequirePermissions('onboarding.documents.manage')
  async sendCandidateDocumentEmail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: SendCandidateDocumentEmailDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.sendEmail(tenantId, id, docId, body, actor),
      message: 'Document email sent to candidate successfully',
    };
  }

  @Post('candidates/:id/letter-documents/:docId/send-email')
  @RequirePermissions('onboarding.documents.manage')
  async sendCandidateDocumentEmailAlias(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Body() body: SendCandidateDocumentEmailDto,
  ) {
    return this.sendCandidateDocumentEmail(tenantId, actor, id, docId, body);
  }

  @Put('document-templates/:tplId/email-template')
  @RequirePermissions('onboarding.documents.manage')
  async updateDocumentTemplateEmailAssociation(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('tplId') tplId: string,
    @Body() body: UpdateDocumentTemplateEmailAssociationDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.updateDocumentTemplateEmailAssociation(
        tenantId,
        tplId,
        body.emailTemplateId ?? null,
        actor,
      ),
      message: 'Document template email association updated successfully',
    };
  }

  @Get('candidates/:id/letter-documents/:docId/emails')
  @RequirePermissions('onboarding.documents.view')
  async listCandidateDocumentEmails(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Param('docId') docId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.listEmails(tenantId, id, docId),
    };
  }

  @Post('candidates/:id/letter-documents/:docId/emails/:emailId/retry')
  @RequirePermissions('onboarding.documents.manage')
  async retryCandidateDocumentEmail(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('docId') docId: string,
    @Param('emailId') emailId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.retryEmail(tenantId, id, docId, emailId, actor),
      message: 'Email retry dispatched',
    };
  }

  // ── Reusable Email Templates CRUD ────────────────────────────────────────

  @Get('email-templates')
  @RequirePermissions('onboarding.documents.view')
  async listEmailTemplates(
    @CurrentTenant() tenantId: string,
    @Query('category') category?: string,
    @Query('documentKind') documentKind?: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.listEmailTemplates(tenantId, category, documentKind),
    };
  }

  @Get('email-templates/:tplId')
  @RequirePermissions('onboarding.documents.view')
  async getEmailTemplate(
    @CurrentTenant() tenantId: string,
    @Param('tplId') tplId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.getEmailTemplate(tenantId, tplId),
    };
  }

  @Post('email-templates')
  @RequirePermissions('onboarding.documents.manage')
  async createEmailTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateEmailTemplateDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.createEmailTemplate(tenantId, body, actor),
      message: 'Email template created successfully',
    };
  }

  @Put('email-templates/:tplId')
  @RequirePermissions('onboarding.documents.manage')
  async updateEmailTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('tplId') tplId: string,
    @Body() body: UpdateEmailTemplateDto,
  ) {
    return {
      success: true,
      data: await this.letterDocs.updateEmailTemplate(tenantId, tplId, body, actor),
      message: 'Email template updated successfully',
    };
  }

  @Post('email-templates/:tplId/duplicate')
  @RequirePermissions('onboarding.documents.manage')
  async duplicateEmailTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('tplId') tplId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.duplicateEmailTemplate(tenantId, tplId, actor),
      message: 'Email template duplicated successfully',
    };
  }

  @Delete('email-templates/:tplId')
  @RequirePermissions('onboarding.documents.manage')
  async deleteEmailTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('tplId') tplId: string,
  ) {
    return {
      success: true,
      data: await this.letterDocs.deleteEmailTemplate(tenantId, tplId, actor),
      message: 'Email template deactivated successfully',
    };
  }
}
