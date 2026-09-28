import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { TenantRolesService } from './tenant-roles.service';

/** The permission catalog the Roles page renders, grouped by sidebar section. */
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly rolesService: TenantRolesService) {}

  @Get()
  @RequirePermissions('permissions.view')
  getPermissionCatalog() {
    return { success: true, data: this.rolesService.getPermissionCatalog() };
  }
}
