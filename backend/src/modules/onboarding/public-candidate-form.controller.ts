import { Body, CanActivate, Controller, ExecutionContext, Get, HttpCode, HttpStatus, Injectable, NotFoundException, Param, Post, Req, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { MAX_FILE_BYTES } from './candidate-documents';
import { UploadedDocument } from './candidate-documents.service';
import { Request } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { CandidateFormService } from './candidate-form.service';
import { ResponseMeta } from './offers.service';
import { SubmitCandidateFormDto } from './dto/candidate-form.dto';

const metaOf = (req: Request): ResponseMeta => ({
  host: req.headers.host,
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

/** Refuses uploads for links that do not exist before any of the body is read. */
@Injectable()
class KnownFormLinkGuard implements CanActivate {
  constructor(private readonly form: CandidateFormService) {}

  async canActivate(context: ExecutionContext) {
    const token = context.switchToHttp().getRequest<Request>().params.token;
    if (typeof token !== 'string' || !(await this.form.isKnownLink(token))) throw new NotFoundException('This form link is not valid.');
    return true;
  }
}

/**
 * The candidate's information form: no sign-in, only the token emailed to
 * them, which shows and changes that one candidate's own details and works
 * for a single submission.
 */
@Controller('public/candidate-form')
export class PublicCandidateFormController {
  constructor(private readonly form: CandidateFormService) {}

  @Get(':token')
  @PublicRoute()
  async view(@Param('token') token: string, @Req() req: Request) {
    return { success: true, data: await this.form.publicView(token, metaOf(req)) };
  }

  @Post(':token')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  async submit(@Param('token') token: string, @Body() body: SubmitCandidateFormDto, @Req() req: Request) {
    return { success: true, data: await this.form.submit(token, body, metaOf(req)), message: 'Thank you. Your details have been sent.' };
  }

  /** Uploads a document the form asks for (PDF, JPG or PNG, checked by content). */
  @Post(':token/documents/:requestId/files')
  @PublicRoute()
  @UseGuards(KnownFormLinkGuard)
  @UseInterceptors(AnyFilesInterceptor({ limits: { fileSize: MAX_FILE_BYTES, files: 10 } }))
  async upload(@Param('token') token: string, @Param('requestId') requestId: string, @UploadedFiles() files: UploadedDocument[] = [], @Req() req: Request) {
    return { success: true, data: await this.form.upload(token, requestId, files, metaOf(req)), message: 'Uploaded' };
  }
}
