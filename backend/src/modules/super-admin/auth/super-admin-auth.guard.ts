import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SuperAdminAuthService } from './super-admin-auth.service';
import { RequestWithSuperAdmin } from '@/common/interfaces/request-with-super-admin.interface';
import { IS_PLATFORM_PUBLIC, ALLOWS_MFA_PENDING } from './super-admin.decorators';

/** The platform role allowed to use the console. */
export const PLATFORM_CONSOLE_ROLE = 'SUPER_ADMIN';

/**
 * Server-side gate for the platform portal. Every super admin route is denied
 * unless a live session token of a SUPER_ADMIN platform account is presented,
 * except routes explicitly marked with @PlatformPublic() (sign-in). Tenant
 * sessions live in a different store and never resolve here.
 */
@Injectable()
export class SuperAdminAuthGuard implements CanActivate {
  constructor(
    private readonly authService: SuperAdminAuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PLATFORM_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithSuperAdmin>();
    const header = request.headers.authorization;

    if (!header || !header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Platform authentication is required.');
    }

    const identity = await this.authService.resolveSession(header.slice(7).trim());

    if (identity.isMfaPending) {
      const allowsPending = this.reflector.getAllAndOverride<boolean>(ALLOWS_MFA_PENDING, [
        context.getHandler(),
        context.getClass(),
      ]);

      if (!allowsPending) {
        // The password was accepted but the second factor was not supplied,
        // so this token grants nothing beyond completing the challenge.
        throw new UnauthorizedException(
          'Two-factor verification is required to continue signing in.',
        );
      }
    }

    // The role comes from the stored account, never from the request.
    if (identity.role !== PLATFORM_CONSOLE_ROLE) {
      throw new ForbiddenException('This platform account is not permitted to use the platform console.');
    }

    request.superAdmin = identity;
    return true;
  }
}
