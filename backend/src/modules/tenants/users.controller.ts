import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('users')
@UseGuards(TenantGuard)
export class UsersController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  async getUsers(
    @CurrentTenant() tenantId: string,
    @Query('role') roleCode?: string,
  ) {
    let users = await this.tenantsService.getUsers(tenantId);
    if (roleCode) {
      users = users.filter((u) => u.role_code === roleCode);
    }
    const rolesData = await this.tenantsService.getRoles(tenantId);

    return {
      success: true,
      data: {
        users,
        roles: rolesData.roles,
      },
    };
  }

  @Post()
  async createUser(@CurrentTenant() tenantId: string, @Body() body: any) {
    return this.tenantsService.createUser(tenantId, body);
  }

  @Put()
  async updateUser(@CurrentTenant() tenantId: string, @Body() body: any) {
    const { id, ...rest } = body;
    return this.tenantsService.updateUser(tenantId, id, rest);
  }

  @Delete()
  async deleteUser(@CurrentTenant() tenantId: string, @Query('id') id: string) {
    return this.tenantsService.deleteUser(tenantId, id);
  }
}
