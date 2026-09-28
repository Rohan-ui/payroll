import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthenticatedSuperAdmin,
  RequestWithSuperAdmin,
} from '@/common/interfaces/request-with-super-admin.interface';

export const IS_PLATFORM_PUBLIC = 'isPlatformPublic';
export const ALLOWS_MFA_PENDING = 'allowsMfaPending';

/** Opts a platform route out of SuperAdminAuthGuard (sign-in only). */
export const PlatformPublic = () => SetMetadata(IS_PLATFORM_PUBLIC, true);

/**
 * Marks a route reachable with a half-finished sign-in, where the password has
 * been accepted but the second factor has not. Only the challenge endpoints
 * carry this; every other route requires a fully authenticated session.
 */
export const AllowsMfaPending = () => SetMetadata(ALLOWS_MFA_PENDING, true);

/**
 * Injects the authenticated platform identity. Never accepts an identity from
 * a client-supplied header: it is only ever set by SuperAdminAuthGuard.
 */
export const CurrentSuperAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedSuperAdmin => {
    const request = ctx.switchToHttp().getRequest<RequestWithSuperAdmin>();

    if (!request.superAdmin) {
      throw new UnauthorizedException('Platform authentication is required.');
    }

    return request.superAdmin;
  },
);
