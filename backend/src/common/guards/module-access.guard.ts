import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessService } from '../access/access.service';
import { MODULES, ModuleCode, PermissionKey, permissionModule } from '../access/access-catalog';
import { REQUIRED_PERMISSIONS } from '../decorators/access.decorators';
import { RequestWithUser } from '../interfaces/authenticated-user.interface';

/**
 * A module a tenant has turned off is unreachable through the API, not just
 * hidden from the navigation. A route belongs to the modules that own its
 * `@RequirePermissions` keys in the access catalog, the same data the sidebar,
 * Roles page and Modules page are built from, so there is no second mapping.
 */
@Injectable()
export class ModuleAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessService: AccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissions =
      this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const required = [
      ...new Set(permissions.map(permissionModule).filter((code): code is ModuleCode => code !== null)),
    ];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (!request.tenantId) {
      throw new ForbiddenException('This workspace module is not available.');
    }

    const states = await this.accessService.getModuleStates(request.tenantId);
    const off = required.find((code) => !states[code]);

    if (off) {
      const name = MODULES.find((m) => m.code === off)?.name ?? off;
      throw new ForbiddenException(
        `${name} is turned off for this workspace. An administrator can turn it on in Organization & Settings → Modules & Apps.`,
      );
    }

    return true;
  }
}
