import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { CrmLeadImportService } from './crm-lead-import.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { MailModule } from '@/modules/mail/mail.module';
import { CrmOutreachEmailService } from './crm-outreach-email.service';
import { CrmOutreachChannelService } from './crm-outreach-channel.service';
import { QuotationDocumentsService } from './quotation-documents.service';
import { DocumentsModule } from '@/modules/documents/documents.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';
import { CrmReportsService } from './crm-reports.service';

@Module({
  imports: [PrismaModule, MailModule, DocumentsModule, WhatsAppModule],
  controllers: [CrmController],
  providers: [
    CrmService,
    CrmReportsService,
    CrmLeadAssignmentService,
    CrmLeadImportService,
    CrmOutreachEmailService,
    CrmOutreachChannelService,
    QuotationDocumentsService,
  ],
  exports: [CrmService, CrmLeadAssignmentService, WhatsAppModule],
})
export class CrmModule {}
