import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { TeamMembersService } from './team-members.service';
import { TenantRolesService } from './tenant-roles.service';
import { CreateTeamMemberDto, UpdateTeamMemberDto } from './dto/access-management.dto';

/** Team members of the session's workspace. The workspace is never taken from the request. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly membersService: TeamMembersService,
    private readonly rolesService: TenantRolesService,
  ) {}

  @Get()
  @RequirePermissions('users.view')
  async getUsers(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    const [users, roles] = await Promise.all([
      this.membersService.listMembers(tenantId),
      // Role names for the assignment picker, with the server's answer on who may assign each.
      this.rolesService.listRoleOptions(tenantId, actor),
    ]);

    return { success: true, data: { users, roles } };
  }

  @Post()
  @RequirePermissions('users.create')
  async createUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateTeamMemberDto,
  ) {
    return this.membersService.createMember(tenantId, body, actor);
  }

  @Patch(':userId')
  @RequirePermissions('users.update')
  async updateUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: UpdateTeamMemberDto,
  ) {
    return this.membersService.updateMember(tenantId, userId, body, actor);
  }

  @Delete(':userId')
  @RequirePermissions('users.delete')
  async deleteUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.membersService.removeMember(tenantId, userId, actor);
  }
}
