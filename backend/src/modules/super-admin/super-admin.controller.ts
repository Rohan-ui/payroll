import {
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { SuperAdminService } from './super-admin.service';
import { PlatformDirectoryService } from './platform-directory.service';
import { PlatformCommandCentreService } from './platform-command-centre.service';
import { PlatformGovernanceService } from './platform-governance.service';
import { platformBaseDomain } from '@/modules/tenancy/tenant-domains.service';
import { SuperAdminAuthService } from './auth/super-admin-auth.service';
import { SuperAdminMfaService } from './auth/super-admin-mfa.service';
import { SuperAdminAuthGuard } from './auth/super-admin-auth.guard';
import {
  CurrentSuperAdmin,
  PlatformPublic,
  AllowsMfaPending,
} from './auth/super-admin.decorators';
import { AuthenticatedSuperAdmin } from '@/common/interfaces/request-with-super-admin.interface';
import { SkipsTenantAuth } from '@/common/decorators/auth.decorators';
import {
  SuperAdminChangePasswordDto,
  SuperAdminLoginDto,
  SuperAdminMfaCodeDto,
  SuperAdminDisableMfaDto,
} from './dto/super-admin-auth.dto';
import {
  DomainListQueryDto,
  PageQueryDto,
  RoleOptionsQueryDto,
  TenantListQueryDto,
  UserListQueryDto,
} from './dto/platform-directory.dto';
import {
  ChangeSubdomainDto,
  ProvisioningCheckQueryDto,
  ProvisionTenantDto,
  TenantQuotasDto,
} from './dto/provision-tenant.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { EmailService, PlatformActor } from '@/modules/email/email.service';
import { PlatformSmtpSettingsDto, SmtpTestDto } from '@/modules/email/dto/platform-smtp.dto';
import { PlatformDnsService } from '@/modules/dns/platform-dns.service';
import { CreateDnsRecordDto, DnsRecordKeyDto, ReplaceDnsRecordsDto } from '@/modules/dns/dto/dns-record.dto';
import {
  ActivityQueryDto,
  BrandingDto,
  CreateCouponDto,
  StatusPageQueryDto,
  WebsiteSettingsDto,
} from './dto/platform-settings.dto';

/**
 * Platform (super admin) API. Served under its own /super-admin namespace and
 * consumed only by the separate platform portal front end. Every route is
 * guarded server-side; tenant sessions can never reach it.
 */
@Controller('super-admin')
@SkipsTenantAuth()
@UseGuards(SuperAdminAuthGuard)
export class SuperAdminController {
  constructor(
    private readonly superAdminService: SuperAdminService,
    private readonly directory: PlatformDirectoryService,
    private readonly commandCentre: PlatformCommandCentreService,
    private readonly governance: PlatformGovernanceService,
    private readonly authService: SuperAdminAuthService,
    private readonly mfaService: SuperAdminMfaService,
    private readonly provisioning: TenantProvisioningService,
    private readonly email: EmailService,
    private readonly dns: PlatformDnsService,
  ) {}

  private context(req: Request) {
    return { ipAddress: this.clientIp(req), userAgent: req.headers['user-agent'] };
  }

  private actor(admin: AuthenticatedSuperAdmin, req: Request): PlatformActor {
    return { superAdminId: admin.superAdminId, ...this.context(req) };
  }

  /** The caller's address; X-Forwarded-For counts only from a trusted proxy (see main.ts). */
  private clientIp(req: Request): string | undefined {
    return req.ip;
  }

  // ══════════════════════════════════════════
  // AUTHENTICATION
  // ══════════════════════════════════════════

  @Post('auth/login')
  @PlatformPublic()
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: SuperAdminLoginDto, @Req() req: Request) {
    const data = await this.authService.login(body.email, body.password, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { success: true, data };
  }

  @Post('auth/logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    await this.authService.logout(admin.sessionId, admin.superAdminId);
    return { success: true, message: 'Signed out of the platform portal.' };
  }

  @Get('auth/me')
  async getMe(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.superAdminService.getMe(admin.superAdminId);
    return { success: true, data };
  }

  @Get('auth/sessions')
  async listSessions(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.authService.listSessions(admin.superAdminId, admin.sessionId);
    return { success: true, data };
  }

  @Post('auth/sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const revoked = await this.authService.revokeOtherSessions(
      admin.superAdminId,
      admin.sessionId,
    );
    return { success: true, data: { revoked } };
  }

  @Post('auth/change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: SuperAdminChangePasswordDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
  ) {
    await this.authService.changePassword(
      admin.superAdminId,
      body.currentPassword,
      body.newPassword,
      admin.sessionId,
    );
    return { success: true, message: 'Password updated. Other sessions were signed out.' };
  }

  // ══════════════════════════════════════════
  // TWO-FACTOR AUTHENTICATION
  // ══════════════════════════════════════════

  /** Completes a sign-in that is waiting on a second factor. */
  @Post('auth/mfa/challenge')
  @AllowsMfaPending()
  @HttpCode(HttpStatus.OK)
  async completeMfaChallenge(
    @Body() body: SuperAdminMfaCodeDto,
    @Req() req: Request,
  ) {
    const header = req.headers.authorization || '';
    const data = await this.authService.completeMfaChallenge(
      header.slice(7).trim(),
      body.code,
      { ipAddress: this.clientIp(req), userAgent: req.headers['user-agent'] },
    );
    return { success: true, data };
  }

  @Get('auth/mfa')
  async getMfaStatus(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.mfaService.getStatus(admin.superAdminId);
    return { success: true, data };
  }

  @Post('auth/mfa/setup')
  @HttpCode(HttpStatus.OK)
  async beginMfaEnrollment(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.mfaService.beginEnrollment(admin.superAdminId);
    return { success: true, data };
  }

  @Post('auth/mfa/enable')
  @HttpCode(HttpStatus.OK)
  async confirmMfaEnrollment(
    @Body() body: SuperAdminMfaCodeDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
  ) {
    const recoveryCodes = await this.mfaService.confirmEnrollment(
      admin.superAdminId,
      body.code,
    );
    return { success: true, data: { recoveryCodes } };
  }

  @Post('auth/mfa/recovery-codes')
  @HttpCode(HttpStatus.OK)
  async regenerateRecoveryCodes(
    @Body() body: SuperAdminMfaCodeDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
  ) {
    const recoveryCodes = await this.mfaService.regenerateRecoveryCodes(
      admin.superAdminId,
      body.code,
    );
    return { success: true, data: { recoveryCodes } };
  }

  @Post('auth/mfa/disable')
  @HttpCode(HttpStatus.OK)
  async disableMfa(
    @Body() body: SuperAdminDisableMfaDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
  ) {
    await this.mfaService.disable(admin.superAdminId, body.password, body.code);
    return { success: true, message: 'Two-factor authentication disabled.' };
  }

  // ══════════════════════════════════════════
  // COMMAND CENTRE
  // ══════════════════════════════════════════

  /** Platform governance figures, all counted from stored records. */
  @Get('command-centre')
  async getCommandCentre() {
    const data = await this.commandCentre.overview();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // TENANTS & WORKSPACES
  // ══════════════════════════════════════════

  @Get('tenants')
  async listTenants(@Query() query: TenantListQueryDto) {
    const data = await this.directory.listTenants(query);
    return { success: true, data };
  }

  @Get('tenants/filter-options')
  async getTenantFilterOptions() {
    const data = await this.directory.tenantFilterOptions();
    return { success: true, data };
  }

  @Get('tenants/:id')
  async getTenant(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.directory.getTenant(id);
    return { success: true, data };
  }

  @Get('tenants/:id/activity')
  async getTenantActivity(@Param('id', ParseUUIDPipe) id: string, @Query() query: PageQueryDto) {
    const data = await this.directory.listTenantActivity(id, query);
    return { success: true, data };
  }

  /** Catalog, plans and settings the provisioning form offers. */
  @Get('provisioning/options')
  async provisioningOptions() {
    const data = await this.provisioning.options();
    return { success: true, data };
  }

  /** Whether a tenant code and subdomain are free. Provisioning checks again. */
  @Get('provisioning/check')
  async provisioningCheck(@Query() query: ProvisioningCheckQueryDto) {
    const data = await this.provisioning.check(query);
    return { success: true, data };
  }

  /**
   * Creates a workspace, its owner, modules and optional subscription in one
   * transaction, then sends the onboarding email. A repeated submission (same
   * idempotency key) returns the workspace it already created.
   */
  @Post('tenants')
  async provisionTenant(@Body() body: ProvisionTenantDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.provisioning.provision(body, this.actor(admin, req));
    return { success: true, data };
  }

  @Get('tenants/:id/onboarding')
  async tenantOnboarding(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.provisioning.onboardingStatus(id);
    return { success: true, data };
  }

  @Post('tenants/:id/onboarding/resend-email')
  @HttpCode(HttpStatus.OK)
  async resendOnboardingEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.provisioning.resendOnboardingEmail(id, this.actor(admin, req));
    return { success: true, data };
  }

  /** Every member loses access at once: tenant sessions are refused while the workspace is suspended. */
  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.suspendTenant(id, admin, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { success: true, data };
  }

  @Post('tenants/:id/reactivate')
  @HttpCode(HttpStatus.OK)
  async reactivateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.reactivateTenant(id, admin, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { success: true, data };
  }

  /** Moves a workspace to a new address; its old address stops working at once. */
  @Put('tenants/:id/subdomain')
  async changeSubdomain(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ChangeSubdomainDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.changeSubdomain(id, body.subdomain, admin, this.context(req));
    return { success: true, data };
  }

  @Put('tenants/:id/quotas')
  async updateTenantQuotas(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() quotas: TenantQuotasDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.superAdminService.updateTenantQuotas(id, quotas, admin.superAdminId, this.context(req));
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // USERS
  // ══════════════════════════════════════════

  @Get('users')
  async listUsers(@Query() query: UserListQueryDto) {
    const data = await this.directory.listUsers(query);
    return { success: true, data };
  }

  @Get('users/role-options')
  async getUserRoleOptions(@Query() query: RoleOptionsQueryDto) {
    const data = await this.directory.roleOptions(query);
    return { success: true, data };
  }

  @Get('users/:id')
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    const data = await this.directory.getUser(id);
    return { success: true, data };
  }

  /** The global account, on every workspace. Workspace memberships are left to each workspace. */
  @Post('users/:id/disable')
  @HttpCode(HttpStatus.OK)
  async disableUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.disableUser(id, admin, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { success: true, data };
  }

  @Post('users/:id/enable')
  @HttpCode(HttpStatus.OK)
  async enableUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.enableUser(id, admin, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { success: true, data };
  }

  @Get('workspace-admins')
  async getWorkspaceAdmins(@Query() query: PageQueryDto) {
    const data = await this.superAdminService.getWorkspaceAdmins(query);
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // DOMAINS
  // ══════════════════════════════════════════

  @Get('domains')
  async listDomains(@Query() query: DomainListQueryDto) {
    const data = await this.directory.listDomains(query);
    return { success: true, data: { baseDomain: platformBaseDomain(), ...data } };
  }

  /** Checks DNS and HTTPS for one workspace address now. Never changes infrastructure. */
  @Post('domains/:id/verify')
  @HttpCode(HttpStatus.OK)
  async verifyDomain(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.directory.verifyDomain(id, admin, this.context(req));
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // COMMERCIALS
  // ══════════════════════════════════════════

  @Get('billing')
  async getBillingSummary() {
    const data = await this.governance.billingSummary();
    return { success: true, data };
  }

  @Get('subscriptions')
  async listSubscriptions(@Query() query: PageQueryDto) {
    const data = await this.governance.listSubscriptions(query);
    return { success: true, data };
  }

  @Get('packages')
  async getPackages() {
    const data = await this.superAdminService.getPackages();
    return { success: true, data };
  }

  @Get('invoices')
  async getInvoices(@Query() query: StatusPageQueryDto) {
    const data = await this.superAdminService.getPlatformInvoices(query);
    return { success: true, data };
  }

  @Get('coupons')
  async getCoupons(@Query() query: PageQueryDto) {
    const data = await this.superAdminService.getCoupons(query);
    return { success: true, data };
  }

  @Post('coupons')
  async createCoupon(@Body() body: CreateCouponDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.superAdminService.createCoupon(body, admin.superAdminId);
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // GOVERNANCE: ACTIVITY, SUPPORT, SECURITY, ROLE TEMPLATES
  // ══════════════════════════════════════════

  @Get('activity')
  async getActivityLogs(@Query() query: ActivityQueryDto) {
    const data = await this.superAdminService.getActivityLogs(query);
    return { success: true, data };
  }

  @Get('support')
  async getSupportTickets(@Query() query: StatusPageQueryDto) {
    const data = await this.superAdminService.getSupportTickets(query);
    return { success: true, data };
  }

  @Get('security')
  async getSecurity() {
    const data = await this.governance.securityOverview();
    return { success: true, data };
  }

  @Get('roles-templates')
  async getRoleTemplates() {
    const data = await this.governance.roleTemplates();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // SETTINGS AND PROFILE
  // ══════════════════════════════════════════

  @Get('settings/branding')
  async getBranding() {
    const data = await this.governance.getBranding();
    return { success: true, data };
  }

  @Put('settings/branding')
  async saveBranding(@Body() body: BrandingDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.governance.saveBranding(body, admin, this.context(req));
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // EMAIL (SMTP)
  // ══════════════════════════════════════════

  /** The saved mail server. The password is never returned, only whether one is stored. */
  @Get('settings/smtp')
  async getSmtpSettings() {
    const data = await this.email.getSmtpSettings();
    return { success: true, data };
  }

  @Put('settings/smtp')
  async saveSmtpSettings(@Body() body: PlatformSmtpSettingsDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.email.saveSmtpSettings(body, this.actor(admin, req));
    return { success: true, data };
  }

  /** Sends a real message and reports the server's answer: SENT, FAILED or NOT_SENT. */
  @Post('settings/smtp/test')
  @HttpCode(HttpStatus.OK)
  async sendSmtpTest(@Body() body: SmtpTestDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.email.sendTestEmail(body.recipient, this.actor(admin, req));
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // PLATFORM DNS
  // ══════════════════════════════════════════

  @Get('dns')
  async dnsOverview() {
    const data = await this.dns.overview();
    return { success: true, data };
  }

  @Get('dns/records')
  async dnsRecords() {
    const data = await this.dns.records();
    return { success: true, data };
  }

  @Post('dns/records')
  async createDnsRecord(@Body() body: CreateDnsRecordDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.dns.createRecord(body, this.actor(admin, req));
    return { success: true, data };
  }

  @Put('dns/records/:type/:name')
  async replaceDnsRecords(
    @Param() key: DnsRecordKeyDto,
    @Body() body: ReplaceDnsRecordsDto,
    @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin,
    @Req() req: Request,
  ) {
    const data = await this.dns.replaceRecords(key.type, key.name, body.values, this.actor(admin, req));
    return { success: true, data };
  }

  @Delete('dns/records/:type/:name')
  async deleteDnsRecords(@Param() key: DnsRecordKeyDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.dns.deleteRecords(key.type, key.name, this.actor(admin, req));
    return { success: true, data };
  }

  /** Points *.<domain> at PLATFORM_PUBLIC_IPS. */
  @Put('dns/wildcard')
  async configureWildcard(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.dns.configureWildcard(this.actor(admin, req));
    return { success: true, data };
  }

  @Post('dns/verify')
  @HttpCode(HttpStatus.OK)
  async verifyDns(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin, @Req() req: Request) {
    const data = await this.dns.verify(this.actor(admin, req));
    return { success: true, data };
  }

  @Get('settings/website')
  async getWebsiteSettings() {
    const data = await this.superAdminService.getWebsiteSettings();
    return { success: true, data };
  }

  @Put('settings/website')
  async saveWebsiteSettings(@Body() body: WebsiteSettingsDto, @CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.superAdminService.saveWebsiteSettings(body, admin.superAdminId);
    return { success: true, data };
  }

  @Get('profile')
  async getProfile(@CurrentSuperAdmin() admin: AuthenticatedSuperAdmin) {
    const data = await this.superAdminService.getMe(admin.superAdminId);
    return { success: true, data };
  }
}
