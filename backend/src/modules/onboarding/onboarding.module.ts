import { Module } from '@nestjs/common';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { MailModule } from '@/modules/mail/mail.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { CandidatesService } from './candidates.service';
import { InterviewsService } from './interviews.service';
import { OnboardingController } from './onboarding.controller';
import { OnboardingDashboardService } from './onboarding-dashboard.service';
import { OnboardingMailerService } from './onboarding-mailer.service';
import { OffersService } from './offers.service';
import { PublicOffersController } from './public-offers.controller';
import { PublicCandidateDocumentsController } from './public-candidate-documents.controller';
import { CandidateDocumentsService } from './candidate-documents.service';
import { DocumentsModule } from '@/modules/documents/documents.module';
import { PrivateStorageService } from '@/common/storage/private-storage.service';

/** HRMS onboarding: candidates, interviews, offers (on templates from Documents & letterheads), candidates' documents, and the emails about them. */
@Module({
  imports: [TenantsModule, MailModule, GmailModule, DocumentsModule],
  controllers: [OnboardingController, PublicOffersController, PublicCandidateDocumentsController],
  providers: [
    CandidatesService,
    CandidateDocumentsService,
    InterviewsService,
    OnboardingDashboardService,
    OnboardingMailerService,
    OffersService,
    PrivateStorageService,
  ],
})
export class OnboardingModule {}
