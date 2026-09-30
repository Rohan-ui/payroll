import { Module } from '@nestjs/common';
import { TenantsModule } from '@/modules/tenants/tenants.module';
import { LoginThrottleService } from '@/common/security/login-throttle.service';
import { MailAccountsController } from './mail-accounts.controller';
import { MailSenderService } from './mail-sender.service';
import { UserMailAccountsService } from './user-mail-accounts.service';

/** Members' own mail accounts, the workspace email policy, and choosing which account each email goes out from. */
@Module({
  imports: [TenantsModule],
  controllers: [MailAccountsController],
  providers: [UserMailAccountsService, MailSenderService, LoginThrottleService],
  exports: [UserMailAccountsService, MailSenderService],
})
export class MailModule {}
