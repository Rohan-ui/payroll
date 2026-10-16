import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { fileResponse } from '@/modules/onboarding/file-response';
import { TemplatesService } from './templates.service';
import { LetterheadsService, MAX_LETTERHEAD_IMAGE_BYTES } from './letterheads.service';
import { CreateTemplateDto, LetterheadInputDto, LetterheadPreviewDto, TemplateDraftDto, TemplatePreviewDto } from './dto/documents.dto';

/**
 * Documents & letterheads: the workspace's document templates (offer letters,
 * quotations, appraisal letters) and the letterheads they print on. Each
 * module that makes documents uses only approved versions; wording is edited
 * in a draft and approved separately.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly templates: TemplatesService, private readonly letterheads: LetterheadsService) {}

  // ── Templates ───────────────────────────────────────────────

  @Get('templates')
  @RequirePermissions('documents.view')
  async listTemplates(@CurrentTenant() tenantId: string, @Query('kind') kind?: string) {
    return { success: true, data: await this.templates.list(tenantId, typeof kind === 'string' ? kind : undefined) };
  }

  @Get('templates/placeholders')
  @RequirePermissions('documents.view')
  placeholders() {
    return { success: true, data: this.templates.placeholders() };
  }

  /** The editor's current template, saved or not, as a sample PDF. Nothing is stored. */
  @Post('templates/preview-pdf')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.manage')
  @Header('Cache-Control', 'private, no-store')
  async previewTemplatePdf(@CurrentTenant() tenantId: string, @Body() body: TemplatePreviewDto) {
    return fileResponse(await this.templates.previewPdf(tenantId, body), 'application/pdf', 'template-sample.pdf');
  }

  @Get('templates/:id')
  @RequirePermissions('documents.view')
  async getTemplate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.templates.get(tenantId, id) };
  }

  @Post('templates')
  @RequirePermissions('documents.templates.manage')
  async createTemplate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreateTemplateDto) {
    return { success: true, data: await this.templates.create(tenantId, body, actor), message: 'Template created as a draft' };
  }

  @Put('templates/:id/draft')
  @RequirePermissions('documents.templates.manage')
  async saveTemplateDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: TemplateDraftDto) {
    return { success: true, data: await this.templates.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Post('templates/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.approve')
  async approveTemplate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.templates.approveDraft(tenantId, id, actor), message: 'Template approved for use' };
  }

  @Post('templates/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.manage')
  async archiveTemplate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.templates.setArchived(tenantId, id, true), message: 'Template archived' };
  }

  @Post('templates/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.manage')
  async restoreTemplate(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.templates.setArchived(tenantId, id, false), message: 'Template restored' };
  }

  // ── Letterheads ─────────────────────────────────────────────
  // Managed with the template approval permission: a letterhead change shows on documents from approved templates.

  @Get('letterheads')
  @RequirePermissions('documents.view')
  async listLetterheads(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.letterheads.list(tenantId) };
  }

  /** A letterhead's details, unsaved or not, on a sample letter. Nothing is stored. */
  @Post('letterheads/preview-pdf')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.manage')
  @Header('Cache-Control', 'private, no-store')
  async previewLetterhead(@CurrentTenant() tenantId: string, @Body() body: LetterheadPreviewDto) {
    const { letterheadId, ...input } = body;
    return fileResponse(await this.templates.letterheadSamplePdf(tenantId, await this.letterheads.previewLetterhead(tenantId, input, letterheadId)), 'application/pdf', 'letterhead-sample.pdf');
  }

  @Get('letterheads/:id')
  @RequirePermissions('documents.view')
  async getLetterhead(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return { success: true, data: await this.letterheads.get(tenantId, id) };
  }

  @Post('letterheads')
  @RequirePermissions('documents.templates.approve')
  async createLetterhead(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: LetterheadInputDto) {
    return { success: true, data: await this.letterheads.create(tenantId, body, actor), message: 'Letterhead created' };
  }

  @Put('letterheads/:id')
  @RequirePermissions('documents.templates.approve')
  async updateLetterhead(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Body() body: LetterheadInputDto) {
    return { success: true, data: await this.letterheads.update(tenantId, id, body, actor), message: 'Letterhead saved' };
  }

  @Post('letterheads/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.approve')
  async archiveLetterhead(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.letterheads.setArchived(tenantId, id, true, actor), message: 'Letterhead archived' };
  }

  @Post('letterheads/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('documents.templates.approve')
  async restoreLetterhead(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string) {
    return { success: true, data: await this.letterheads.setArchived(tenantId, id, false, actor), message: 'Letterhead restored' };
  }

  @Get('letterheads/:id/images/:slot')
  @RequirePermissions('documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async letterheadImage(@CurrentTenant() tenantId: string, @Param('id') id: string, @Param('slot') slot: string) {
    const image = await this.letterheads.image(tenantId, id, slot);
    return fileResponse(image.bytes, image.contentType, `${slot}.${image.contentType === 'image/png' ? 'png' : 'jpg'}`);
  }

  @Post('letterheads/:id/images/:slot')
  @RequirePermissions('documents.templates.approve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LETTERHEAD_IMAGE_BYTES, files: 1, fields: 0 } }))
  async uploadLetterheadImage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Param('slot') slot: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return { success: true, data: await this.letterheads.setImage(tenantId, id, slot, file, actor), message: 'Image uploaded' };
  }

  @Delete('letterheads/:id/images/:slot')
  @RequirePermissions('documents.templates.approve')
  async removeLetterheadImage(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id') id: string, @Param('slot') slot: string) {
    return { success: true, data: await this.letterheads.removeImage(tenantId, id, slot, actor), message: 'Image removed' };
  }

  /** An image for the letterhead's elements, such as an image watermark; placed when the letterhead is saved with an element that shows it. */
  @Post('letterheads/:id/assets')
  @RequirePermissions('documents.templates.approve')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_LETTERHEAD_IMAGE_BYTES, files: 1, fields: 0 } }))
  async uploadLetterheadAsset(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    return { success: true, data: await this.letterheads.addAsset(tenantId, id, file, actor), message: 'Image uploaded' };
  }

  @Get('letterheads/:id/assets/:assetId')
  @RequirePermissions('documents.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async letterheadAsset(@CurrentTenant() tenantId: string, @Param('id') id: string, @Param('assetId') assetId: string) {
    const image = await this.letterheads.asset(tenantId, id, assetId);
    return fileResponse(image.bytes, image.contentType, `image.${image.contentType === 'image/png' ? 'png' : 'jpg'}`);
  }
}
