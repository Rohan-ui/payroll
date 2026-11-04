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
import { WhatsAppTemplateController } from './whatsapp/whatsapp-template.controller';
import { WhatsAppTemplateMappingService } from './whatsapp/whatsapp-template-mapping.service';
import { WhatsAppMessagingService } from './whatsapp/whatsapp-messaging.service';
import { WhatsAppProviderService } from './whatsapp/whatsapp-provider.service';
import { WhatsAppVariableResolverService } from './whatsapp/whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp/whatsapp-payload-builder.service';

@Module({
  imports: [PrismaModule, MailModule, DocumentsModule],
  controllers: [CrmController, WhatsAppTemplateController],
  providers: [
    CrmService,
    CrmLeadAssignmentService,
    CrmLeadImportService,
    CrmOutreachEmailService,
    CrmOutreachChannelService,
    QuotationDocumentsService,
    WhatsAppProviderService,
    WhatsAppVariableResolverService,
    WhatsAppPayloadBuilderService,
    WhatsAppTemplateMappingService,
    WhatsAppMessagingService,
  ],
  exports: [CrmService, CrmLeadAssignmentService, WhatsAppMessagingService, WhatsAppTemplateMappingService],
})
export class CrmModule {}
