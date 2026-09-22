import { Controller, Get, UseGuards } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('users')
@UseGuards(TenantGuard)
export class UsersController {
  constructor(private readonly crmService: CrmService) {}

  @Get()
  async getUsers(@CurrentTenant() tenantId: string) {
    const data = await this.crmService.getSalesPersons(tenantId);
    return { success: true, data };
  }
}
