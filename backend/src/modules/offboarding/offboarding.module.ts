import { Module } from '@nestjs/common';
import { OnboardingModule } from '@/modules/onboarding/onboarding.module';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';

@Module({
  imports: [OnboardingModule],
  controllers: [OffboardingController],
  providers: [OffboardingService],
})
export class OffboardingModule {}