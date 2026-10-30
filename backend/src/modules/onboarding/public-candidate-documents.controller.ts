import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { CandidateDocumentsService, UploadedDocument } from './candidate-documents.service';
import { MAX_FILE_BYTES } from './candidate-documents';
import { ResponseMeta } from './offers.service';
import { UploadFileMetaDto } from './dto/onboarding.dto';

const metaOf = (req: Request): ResponseMeta => ({
  host: req.headers.host,
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

/**
 * Refuses an upload for a link that does not exist before any of the file is
 * read, so made-up links can't be used to push large bodies at the server.
 * The service checks the link fully (address, expiry, status) afterwards.
 */
@Injectable()
class KnownDocumentLinkGuard implements CanActivate {
  constructor(private readonly documents: CandidateDocumentsService) {}

  async canActivate(context: ExecutionContext) {
    const token = context.switchToHttp().getRequest<Request>().params.token;
    if (typeof token !== 'string' || !(await this.documents.isKnownLink(token))) {
      throw new NotFoundException('This upload link is not valid.');
    }
    return true;
  }
}

/**
 * The candidate's document upload link: no sign-in, only the token emailed to
 * them. Lists requested documents and handles single and multi-file uploads
 * with slot assignment and replacement tracking.
 */
@Controller('public/candidate-documents')
export class PublicCandidateDocumentsController {
  constructor(private readonly documents: CandidateDocumentsService) {}

  @Get(':token')
  @PublicRoute()
  async view(@Param('token') token: string, @Req() req: Request) {
    return { success: true, data: await this.documents.publicView(token, metaOf(req)) };
  }

  @Post(':token/requests/:requestId/file')
  @PublicRoute()
  @UseGuards(KnownDocumentLinkGuard)
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_BYTES, files: 10 } }))
  async uploadSingleOrBatch(
    @Param('token') token: string,
    @Param('requestId') requestId: string,
    @UploadedFiles() files: UploadedDocument[] | undefined,
    @Body() body: UploadFileMetaDto,
    @Req() req: Request,
  ) {
    const list = files && files.length > 0 ? files : [];
    return {
      success: true,
      data: await this.documents.publicUpload(token, requestId, list, metaOf(req), body),
      message: list.length > 1 ? `${list.length} documents uploaded` : 'Document uploaded',
    };
  }

  @Post(':token/requests/:requestId/files')
  @PublicRoute()
  @UseGuards(KnownDocumentLinkGuard)
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_BYTES, files: 20 } }))
  async uploadBatch(
    @Param('token') token: string,
    @Param('requestId') requestId: string,
    @UploadedFiles() files: UploadedDocument[] | undefined,
    @Body() body: UploadFileMetaDto,
    @Req() req: Request,
  ) {
    const list = files && files.length > 0 ? files : [];
    return {
      success: true,
      data: await this.documents.publicUpload(token, requestId, list, metaOf(req), body),
      message: `${list.length} file(s) uploaded`,
    };
  }
}
