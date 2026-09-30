import { SetMetadata, createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import {
  AuthenticatedTenantUser,
  RequestWithUser,
} from '../interfaces/authenticated-user.interface';

export const IS_PUBLIC_ROUTE = 'isPublicRoute';
export const SKIPS_TENANT_AUTH = 'skipsTenantAuth';
export const ALLOWS_PASSWORD_CHANGE_PENDING = 'allowsPasswordChangePending';

/** The error code a session gets on any other route until its temporary password is replaced. */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';

/**
 * Marks a route as reachable without a session. Use only for sign-in,
 * registration, health checks, and a candidate's own one-time link (which
 * authorizes by its secret token and shows only that candidate's record).
 * Nothing else that returns tenant data may carry this.
 */
export const PublicRoute = () => SetMetadata(IS_PUBLIC_ROUTE, true);

/**
 * Marks a controller as outside the tenant authentication scheme because it is
 * protected by a different one. Only the platform (super admin) controller
 * carries this, and a test asserts that stays true.
 */
export const SkipsTenantAuth = () => SetMetadata(SKIPS_TENANT_AUTH, true);

/**
 * Marks a route that a session may use before its temporary password has been
 * replaced: only the password change itself, the profile and sign-out.
 */
export const AllowsPasswordChangePending = () => SetMetadata(ALLOWS_PASSWORD_CHANGE_PENDING, true);

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
