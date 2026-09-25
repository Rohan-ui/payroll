import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from '../access/access.service';
import { PermissionKey } from '../access/access-catalog';
import { REQUIRED_PERMISSIONS } from '../decorators/access.decorators';
import { RequestWithUser } from '../interfaces/authenticated-user.interface';

/**
 * Enforces `@RequirePermissions`. Registered globally after TenantAuthGuard, so
 * the tenant and roles it checks come from the stored session.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !request.tenantId) {
      throw new ForbiddenException('You do not have permission to perform this action.');
    }

    const held = await this.accessService.getMemberPermissions(request.tenantId, user.tenantMemberId);
    const missing = required.filter((key) => !held.includes(key));

    if (missing.length > 0) {
      throw new ForbiddenException(
        `You do not have permission to do this (requires ${missing.join(', ')}). Ask a workspace administrator for access.`,
      );
    }

    return true;
  }
}
