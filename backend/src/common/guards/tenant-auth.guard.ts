import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantSessionService } from '@/modules/auth/session/tenant-session.service';
import { TenantDomainsService } from '@/modules/tenancy/tenant-domains.service';
import { RequestWithUser } from '../interfaces/authenticated-user.interface';
import {
  ALLOWS_PASSWORD_CHANGE_PENDING,
  IS_PUBLIC_ROUTE,
  PASSWORD_CHANGE_REQUIRED,
  SKIPS_TENANT_AUTH,
} from '../decorators/auth.decorators';

/**
 * Authentication and tenant scoping for every tenant API route.
 *
 * Registered globally, so a new controller or route is protected by default
 * and has to opt out explicitly. On success it sets both `request.user` and
 * `request.tenantId` from the stored session, which is what makes
 * `@CurrentTenant()` safe to authorize against. On a workspace's own address
 * (kpmg.<base domain>) a session for any other workspace is refused. A
 * session whose account still has a temporary password reaches only the
 * routes that let it replace that password.
 */
@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: TenantSessionService,
    private readonly domains: TenantDomainsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    // The platform control plane authenticates super admins instead.
    if (this.reflector.getAllAndOverride<boolean>(SKIPS_TENANT_AUTH, targets)) {
      return true;
    }

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Authentication is required.');
    }

    const identity = await this.sessionService.resolveSession(header.slice(7).trim());

    // On a workspace's own address only that workspace's sessions are accepted.
    // The host narrows access; it never grants it.
    this.domains.assertSessionFitsHost(await this.domains.resolveHost(request.headers.host), identity.tenantId);

    if (identity.mustChangePassword && !this.reflector.getAllAndOverride<boolean>(ALLOWS_PASSWORD_CHANGE_PENDING, targets)) {
      throw new ForbiddenException({ code: PASSWORD_CHANGE_REQUIRED, message: 'Choose a new password to replace your temporary one before continuing.' });
    }

    request.user = identity;
    // Anything the caller sent as a tenant hint is discarded here. The tenant
    // for this request is the one stored on the session.
    request.tenantId = identity.tenantId;

    return true;
  }
}
