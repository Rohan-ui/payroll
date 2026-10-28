import { Module } from '@nestjs/common';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';

/** HRMS offboarding: resignations and other exits, the exit checklist and exit interview, and completing the exit. */
@Module({
  controllers: [OffboardingController],
  providers: [OffboardingService],
})
export class OffboardingModule {}
