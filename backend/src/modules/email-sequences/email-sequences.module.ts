import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { MailModule } from '@/modules/mail/mail.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { TenancyModule } from '@/modules/tenancy/tenancy.module';
import { CrmModule } from '@/modules/crm/crm.module';
import { EmailSequencesController } from './email-sequences.controller';
import { PublicUnsubscribeController } from './public-unsubscribe.controller';
import { EmailSequencesService } from './email-sequences.service';
import { SequenceActivityService } from './sequence-activity.service';
import { SequenceEnrollmentService } from './sequence-enrollment.service';
import { SequenceSenderService } from './sequence-sender.service';
import { SequenceAutomationService } from './sequence-automation.service';
import { EmailSuppressionService } from './email-suppression.service';
import { ImapInboxReader, INBOX_READER, SequenceInboxService } from './sequence-inbox.service';

/** Everything drip sequences need, for the API and for the sequence worker. */
@Module({
  imports: [PrismaModule, AuditModule, MailModule, GmailModule, TenantsModule, TenancyModule, CrmModule],
  controllers: [EmailSequencesController, PublicUnsubscribeController],
  providers: [
    EmailSequencesService, SequenceActivityService, SequenceEnrollmentService, SequenceSenderService, SequenceAutomationService, EmailSuppressionService, SequenceInboxService,
    { provide: INBOX_READER, useClass: ImapInboxReader },
  ],
  exports: [SequenceSenderService, SequenceAutomationService, SequenceInboxService, EmailSuppressionService],
})
export class EmailSequencesModule {}
