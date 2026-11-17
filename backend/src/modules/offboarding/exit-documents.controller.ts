import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { fileResponse } from '@/modules/onboarding/file-response';
import { EXIT_DOCUMENT_TYPES, ExitDocumentsService, ExitDocumentType } from './exit-documents.service';

class GenerateExitDocumentDto {
  @IsIn(EXIT_DOCUMENT_TYPES, { message: 'Choose which document to make.' })
  documentType!: ExitDocumentType;

  /** A letter template of that kind; the newest one (or the standard wording) when left out. */
  @IsOptional()
  @IsUUID('4')
  templateId?: string;

  /** The letterhead for the settlement statement. */
  @IsOptional()
  @IsUUID('4')
  letterheadId?: string;
}

/** Exit letters and the settlement statement for one exit. Files are served only through the session, never from a public address. */
@Controller('offboarding/separations/:id/documents')
export class ExitDocumentsController {
  constructor(private readonly documents: ExitDocumentsService) {}

  @Get()
  @RequirePermissions('offboarding.view')
  async list(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.documents.list(tenantId, id) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.documents.manage')
  async generate(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: GenerateExitDocumentDto) {
    return { success: true, data: await this.documents.generate(tenantId, id, body, actor), message: 'Document generated' };
  }

  @Post(':documentId/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.documents.issue')
  async issue(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return { success: true, data: await this.documents.issue(tenantId, id, documentId, actor), message: 'Document issued' };
  }

  @Get(':documentId/versions')
  @RequirePermissions('offboarding.view')
  async versions(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return { success: true, data: await this.documents.versions(tenantId, id, documentId) };
  }

  @Get(':documentId/pdf')
  @RequirePermissions('offboarding.view')
  async pdf(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('version') version?: string,
    @Query('download') download?: string,
  ) {
    const number = version !== undefined ? Number(version) : undefined;
    const file = await this.documents.pdfFile(tenantId, id, documentId, number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined);
    return fileResponse(file.bytes, 'application/pdf', file.filename, download);
  }
}
