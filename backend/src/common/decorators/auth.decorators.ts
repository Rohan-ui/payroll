import { SetMetadata, createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticatedTenantUser,
  RequestWithUser,
} from '../interfaces/authenticated-user.interface';

export const IS_PUBLIC_ROUTE = 'isPublicRoute';
export const SKIPS_TENANT_AUTH = 'skipsTenantAuth';

/**
 * Marks a route as reachable without a session. Use only for sign-in,
 * registration and health checks: anything that returns tenant data must not
 * carry this.
 */
export const PublicRoute = () => SetMetadata(IS_PUBLIC_ROUTE, true);

/**
 * Marks a controller as outside the tenant authentication scheme because it is
 * protected by a different one. Only the platform (super admin) controller
 * carries this, and a test asserts that stays true.
 */
export const SkipsTenantAuth = () => SetMetadata(SKIPS_TENANT_AUTH, true);

/**
 * Injects the authenticated tenant identity. The value is placed on the
 * request by TenantAuthGuard after a stored session is validated, so it can
 * never be influenced by the caller.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedTenantUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();

    if (!request.user) {
      throw new UnauthorizedException('Authentication is required.');
    }

    return request.user;
  },
);
