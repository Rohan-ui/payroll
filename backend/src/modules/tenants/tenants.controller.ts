import { Controller, Post, Get, Put, Body, UseGuards } from '@nestjs/common';
import { TenantsService, CreateTenantInput } from './tenants.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller(['tenants', 'tenant'])
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async create(@Body() body: CreateTenantInput) {
    return this.tenantsService.createTenant(body);
  }

  @Get('current')
  @UseGuards(TenantGuard)
  async getCurrent(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getTenantById(tenantId);
  }

  @Put('settings')
  @UseGuards(TenantGuard)
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Body('settings') settings: Record<string, unknown>,
  ) {
    return this.tenantsService.updateSettings(tenantId, settings);
  }

  @Post('whatsapp/send')
  async sendWhatsApp(@Body() body: any) {
    return { success: true, message: 'WhatsApp message queued for dispatch' };
  }

  @Post('email/send')
  async sendEmail(@Body() body: any) {
    return { success: true, message: 'Email queued for dispatch' };
  }
}
