import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OrganizationSettingsService } from '@/modules/tenants/organization-settings.service';
import { UserMailAccountsService } from './user-mail-accounts.service';
import { EmailPolicyDto, TestEmailDto, UserMailAccountDto } from './dto/mail-account.dto';

/**
 * Mail accounts. The `me` routes act on the signed-in member's own account in
 * the session's workspace; none takes a member or user id, so no one can read
 * or change another member's account through them. Administrators set the
 * workspace policy and see who has connected, never a credential.
 */
@Controller('mail-accounts')
export class MailAccountsController {
  constructor(
    private readonly accounts: UserMailAccountsService,
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  @Get('me')
  async mine(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    return { success: true, data: await this.accounts.get(tenantId, actor) };
  }

  @Put('me')
  async saveMine(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: UserMailAccountDto) {
    return { success: true, data: await this.accounts.save(tenantId, actor, body), message: 'Mail account saved' };
  }

  @Delete('me')
  async disconnectMine(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    return { success: true, data: await this.accounts.disconnect(tenantId, actor), message: 'Mail account disconnected' };
  }

  @Post('me/test-smtp')
  @HttpCode(HttpStatus.OK)
  async testSmtp(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    return { success: true, data: await this.accounts.testSmtp(tenantId, actor) };
  }

  @Post('me/test-imap')
  @HttpCode(HttpStatus.OK)
  async testImap(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    return { success: true, data: await this.accounts.testImap(tenantId, actor) };
  }

  @Post('me/test-email')
  @HttpCode(HttpStatus.OK)
  async testEmail(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: TestEmailDto) {
    return { success: true, data: await this.accounts.sendTestEmail(tenantId, actor, body.recipient) };
  }

  @Get('members')
  @RequirePermissions('users.view')
  async members(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.accounts.memberStatuses(tenantId) };
  }

  @Put('policy')
  @RequirePermissions('organization.update')
  async policy(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: EmailPolicyDto) {
    return { success: true, data: await this.organizationSettings.saveEmailPolicy(tenantId, body.personalAccounts, actor), message: 'Email policy saved' };
  }
}
