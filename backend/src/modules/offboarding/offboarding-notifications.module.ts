import { Module } from '@nestjs/common';
import { MailModule } from '@/modules/mail/mail.module';
import { GmailModule } from '@/modules/gmail/gmail.module';
import { OnboardingMailerService } from '@/modules/onboarding/onboarding-mailer.service';
import { OffboardingNotificationsService } from './offboarding-notifications.service';

/** Offboarding's emails on their own, so the background worker can send reminders without the web modules. */
@Module({
  imports: [MailModule, GmailModule],
  providers: [OnboardingMailerService, OffboardingNotificationsService],
  exports: [OffboardingNotificationsService],
})
export class OffboardingNotificationsModule {}
