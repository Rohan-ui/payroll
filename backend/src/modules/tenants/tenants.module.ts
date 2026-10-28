import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { UsersController } from './users.controller';
import { PermissionsController } from './permissions.controller';
import { OrganizationSettingsService } from './organization-settings.service';
import { TenantRolesService } from './tenant-roles.service';
import { TeamMembersService } from './team-members.service';

import { EmploymentTypesService } from './employment-types.service';

@Module({
  controllers: [TenantsController, UsersController, PermissionsController],
  providers: [TenantsService, OrganizationSettingsService, TenantRolesService, TeamMembersService, EmploymentTypesService],
  // The platform console shows a workspace's organization profile through the same service.
  exports: [TenantsService, OrganizationSettingsService, EmploymentTypesService],
})
export class TenantsModule {}
