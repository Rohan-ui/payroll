import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TenantSessionService } from './session/tenant-session.service';
import { LoginThrottleService } from '@/common/security/login-throttle.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, TenantSessionService, LoginThrottleService],
  // The global TenantAuthGuard resolves sessions, so this must be exported.
  exports: [AuthService, TenantSessionService],
})
export class AuthModule {}
