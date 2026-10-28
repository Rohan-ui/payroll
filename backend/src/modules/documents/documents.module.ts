import { Module } from '@nestjs/common';
import { PrivateStorageService } from '@/common/storage/private-storage.service';
import { DocumentsController } from './documents.controller';
import { DocumentPdfService } from './document-pdf.service';
import { LetterheadsService } from './letterheads.service';
import { TemplatesService } from './templates.service';

import { DocumentDocxService } from './document-docx.service';

/** Document templates and letterheads, shared by every module that makes documents (offers, quotations, appraisal letters). */
@Module({
  controllers: [DocumentsController],
  providers: [TemplatesService, LetterheadsService, DocumentPdfService, DocumentDocxService, PrivateStorageService],
  exports: [TemplatesService, LetterheadsService, DocumentPdfService, DocumentDocxService],
})
export class DocumentsModule {}
