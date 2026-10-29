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

import { CandidateLetterDocumentsService } from './candidate-letter-documents.service';
import { OnboardingWorkflowBuilderService } from './onboarding-workflow-builder.service';
import { OnboardingWorkflowsController } from './onboarding-workflows.controller';

/** HRMS onboarding: candidates, interviews, offers, visual onboarding workflow builder, documents and emails. */
@Module({
  imports: [TenantsModule, MailModule, GmailModule, DocumentsModule],
  controllers: [
    OnboardingController,
    OnboardingWorkflowsController,
    PublicOffersController,
    PublicCandidateDocumentsController,
  ],
  providers: [
    CandidatesService,
    CandidateDocumentsService,
    CandidateLetterDocumentsService,
    InterviewsService,
    OnboardingDashboardService,
    OnboardingMailerService,
    OffersService,
    OnboardingWorkflowBuilderService,
    PrivateStorageService,
  ],
  exports: [CandidateLetterDocumentsService, OnboardingWorkflowBuilderService],
})
export class OnboardingModule {}
