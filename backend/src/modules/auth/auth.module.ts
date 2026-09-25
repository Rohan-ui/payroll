import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantSessionService } from './session/tenant-session.service';
import { LoginThrottleService } from '@/common/security/login-throttle.service';
import { AccountSetupService } from './account-setup.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TenantSessionService, LoginThrottleService, AccountSetupService],
  // The global TenantAuthGuard resolves sessions, so this must be exported.
  exports: [AuthService, TenantSessionService],
})
export class AuthModule {}
