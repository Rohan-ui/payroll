import {
  Controller,
  ForbiddenException,
  Post,
  Get,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService, RegisterUserInput } from './auth.service';
import { TenantSessionService } from './session/tenant-session.service';
import { AccountSetupService } from './account-setup.service';
import { TenantDomainsService, platformBaseDomain } from '@/modules/tenancy/tenant-domains.service';
import { PublicRoute, CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  LoginDto,
  RegisterTenantDto,
  SwitchTenantDto,
  ChangePasswordDto,
  AddMembershipDto,
  SubdomainAvailabilityQueryDto,
  AccountSetupTokenDto,
  CompleteAccountSetupDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: TenantSessionService,
    private readonly domains: TenantDomainsService,
    private readonly accountSetup: AccountSetupService,
  ) {}

  /** The caller's address; X-Forwarded-For counts only from a trusted proxy (see main.ts). */
  private clientIp(req: Request): string | undefined {
    return req.ip;
  }

  private requestContext(req: Request) {
    return { hostHeader: req.headers.host, ipAddress: this.clientIp(req), userAgent: req.headers['user-agent'] };
  }

  @Post('register')
  @PublicRoute()
  async register(@Body() body: RegisterUserInput) {
    return this.authService.registerUser(body);
  }

  /**
   * Creates a workspace and signs its first administrator in. A password is
   * required: an account without one could never sign in, since sign-in now
   * refuses accounts that have no password set.
   */
  @Post('register-tenant')
  @PublicRoute()
  async registerTenant(@Body() body: RegisterTenantDto, @Req() req: Request) {
    this.domains.assertCanRegisterHere(await this.domains.resolveHost(req.headers.host));
    const created = await this.authService.registerTenant(body);

    return this.sessionService.login(
      created.email,
      body.password,
      { ipAddress: this.clientIp(req), userAgent: req.headers['user-agent'] },
      created.tenantId,
    );
  }

  @Post('login')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: LoginDto, @Req() req: Request) {
    // On a workspace's address, sign-in opens that workspace and nothing else;
    // the account must still be one of its members.
    const tenantId = this.domains.tenantForSignIn(await this.domains.resolveHost(req.headers.host), body.tenantId);
    return this.sessionService.login(
      body.email,
      body.password,
      { ipAddress: this.clientIp(req), userAgent: req.headers['user-agent'] },
      tenantId,
    );
  }

  /** What this address is: the base domain, and the workspace it belongs to, if any. */
  @Get('host')
  @PublicRoute()
  async getHost(@Req() req: Request) {
    const host = await this.domains.resolveHost(req.headers.host);
    const workspace = host.kind === 'tenant' ? await this.authService.workspaceSummary(host.tenantId) : null;
    return { baseDomain: platformBaseDomain(), kind: host.kind, workspace };
  }

  /** Whether a workspace address can be used, for the sign-up form. The server checks again on submit. */
  @Get('subdomain-availability')
  @PublicRoute()
  async subdomainAvailability(@Query() query: SubdomainAvailabilityQueryDto) {
    return this.domains.availability(query.subdomain);
  }

  /** Who a first-password link is for. POST so the token never appears in a URL or access log. */
  @Post('account-setup/inspect')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  async inspectAccountSetup(@Body() body: AccountSetupTokenDto, @Req() req: Request) {
    return this.accountSetup.inspect(body.token, this.requestContext(req));
  }

  /** Sets the first password from a one-time link. The person then signs in normally. */
  @Post('account-setup')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  async completeAccountSetup(@Body() body: CompleteAccountSetupDto, @Req() req: Request) {
    const result = await this.accountSetup.complete(body.token, body.password, this.requestContext(req));
    return { success: true, message: 'Password set. You can sign in now.', data: result };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser() user: AuthenticatedTenantUser) {
    await this.sessionService.logout(user);
    return { success: true, message: 'Signed out.' };
  }

  /** Identity comes from the session; there is no user id parameter to forge. */
  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedTenantUser) {
    return this.sessionService.getProfile(user);
  }

  /** Re-checks membership and issues a session pinned to the new tenant. */
  @Post('switch-tenant')
  @HttpCode(HttpStatus.OK)
  async switchTenant(
    @Body() body: SwitchTenantDto,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Req() req: Request,
  ) {
    const host = await this.domains.resolveHost(req.headers.host);
    if (host.kind === 'tenant' && host.tenantId !== body.tenantId) {
      throw new ForbiddenException('Open that workspace at its own address to switch to it.');
    }
    return this.sessionService.switchTenant(user, body.tenantId, {
      ipAddress: this.clientIp(req),
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedTenantUser,
  ) {
    await this.sessionService.changePassword(user, body.currentPassword, body.newPassword);
    return { success: true, message: 'Password updated. Other sessions were signed out.' };
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedTenantUser) {
    const revoked = await this.sessionService.revokeOtherSessions(user);
    return { success: true, data: { revoked } };
  }

  /**
   * Adds a user to the caller's own tenant. The tenant is taken from the
   * session, so a member cannot add people to a tenant they do not belong to.
   */
  @Post('membership')
  @RequirePermissions('users.create')
  @HttpCode(HttpStatus.CREATED)
  async addMembership(
    @Body() body: AddMembershipDto,
    @CurrentUser() user: AuthenticatedTenantUser,
  ) {
    return this.authService.addMemberToTenant(user, body.userId, body.roleCode);
  }
}
