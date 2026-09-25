import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service';

/** Platform email, available to every module (onboarding now; invitations, resets and alerts later). */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
