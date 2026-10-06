import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { CrmLeadImportService } from './crm-lead-import.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { MailModule } from '@/modules/mail/mail.module';
import { CrmOutreachEmailService } from './crm-outreach-email.service';
import { CrmOutreachChannelService } from './crm-outreach-channel.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [CrmController],
  providers: [CrmService, CrmLeadAssignmentService, CrmLeadImportService, CrmOutreachEmailService, CrmOutreachChannelService],
  exports: [CrmService, CrmLeadAssignmentService],
})
export class CrmModule {}
