import { CanActivate, Controller, ExecutionContext, Get, Injectable, NotFoundException, Param, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { CandidateDocumentsService, UploadedDocument } from './candidate-documents.service';
import { MAX_FILE_BYTES } from './candidate-documents';
import { ResponseMeta } from './offers.service';

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
    if (typeof token !== 'string' || !(await this.documents.isKnownLink(token))) throw new NotFoundException('This upload link is not valid.');
    return true;
  }
}

/**
 * The candidate's document upload link: no sign-in, only the token emailed to
 * them. It lists the documents asked of them and takes their uploads; it never
 * returns a stored file. A link works only on its own workspace's address,
 * while HRMS is on, until it expires or a newer link is sent.
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }))
  async upload(@Param('token') token: string, @Param('requestId') requestId: string, @UploadedFile() file: UploadedDocument | undefined, @Req() req: Request) {
    return { success: true, data: await this.documents.publicUpload(token, requestId, file, metaOf(req)), message: 'Document uploaded' };
  }
}
