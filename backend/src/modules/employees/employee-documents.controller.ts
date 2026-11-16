import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { MAX_FILE_BYTES } from '@/modules/onboarding/candidate-documents';
import { fileResponse } from '@/modules/onboarding/file-response';
import { EmployeeDocumentsService, UploadedFile as Upload } from './employee-documents.service';
import { DocumentReasonDto, UploadEmployeeDocumentDto } from './dto/employee-documents.dto';

type Actor = AuthenticatedTenantUser;
/** One file per request, refused by the parser itself beyond the size limit. */
const ONE_FILE = FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1 } });

/** An employee's documents. Every answer that changes something returns the list as saved. */
@Controller('employees/:employeeId/documents')
export class EmployeeDocumentsController {
  constructor(private readonly documents: EmployeeDocumentsService) {}

  @Get()
  @RequirePermissions('people.view')
  async list(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.documents.list(tenantId, employeeId) };
  }

  @Post()
  @RequirePermissions('people.documents.manage')
  @UseInterceptors(ONE_FILE)
  async upload(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @UploadedFile() file: Upload | undefined, @Body() body: UploadEmployeeDocumentDto) {
    return { success: true, data: await this.documents.upload(tenantId, employeeId, file, body, actor), message: 'Document uploaded' };
  }

  /** Only through this route: files are never served directly. */
  @Get(':documentId/file')
  @RequirePermissions('people.view')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async file(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Query('download') download?: string) {
    const file = await this.documents.file(tenantId, employeeId, documentId);
    return fileResponse(file.bytes, file.contentType, file.filename, download);
  }

  @Post(':documentId/replace')
  @RequirePermissions('people.documents.manage')
  @UseInterceptors(ONE_FILE)
  async replace(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @UploadedFile() file: Upload | undefined) {
    return { success: true, data: await this.documents.replace(tenantId, employeeId, documentId, file, actor), message: 'Document replaced' };
  }

  @Post(':documentId/remove')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.documents.manage')
  async remove(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Body() body: DocumentReasonDto) {
    return { success: true, data: await this.documents.remove(tenantId, employeeId, documentId, body.reason, actor), message: 'Document removed' };
  }

  @Post(':documentId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.documents.verify')
  async verify(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('documentId', ParseUUIDPipe) documentId: string) {
    return { success: true, data: await this.documents.verify(tenantId, employeeId, documentId, actor), message: 'Document verified' };
  }

  @Post(':documentId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.documents.verify')
  async reject(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Body() body: DocumentReasonDto) {
    return { success: true, data: await this.documents.reject(tenantId, employeeId, documentId, body.reason, actor), message: 'Document rejected' };
  }
}
