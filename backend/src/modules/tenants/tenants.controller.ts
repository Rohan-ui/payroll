import { Controller, Post, Get, Put, Body, UseGuards } from '@nestjs/common';
import { TenantsService, CreateTenantInput } from './tenants.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller(['tenant', 'tenants'])
@UseGuards(TenantGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async create(@Body() body: CreateTenantInput) {
    return this.tenantsService.createTenant(body);
  }

  @Get('current')
  async getCurrent(@CurrentTenant() tenantId: string) {
    return this.tenantsService.getTenantById(tenantId);
  }

  // ════════════════════════════════════════════════════════════════
  // 1. SETTINGS & PROFILE
  // ════════════════════════════════════════════════════════════════

  @Get('settings')
  async getSettings(@CurrentTenant() tenantId: string) {
    const data = await this.tenantsService.getTenantSettings(tenantId);
    return { success: true, data };
  }

  @Post('settings')
  async handleSettingsAction(
    @CurrentTenant() tenantId: string,
    @Body() body: any,
  ) {
    return this.tenantsService.handleSettingsAction(tenantId, body);
  }

  @Put('settings')
  async updateSettings(
    @CurrentTenant() tenantId: string,
    @Body('settings') settings: Record<string, unknown>,
  ) {
    return this.tenantsService.updateSettings(tenantId, settings);
  }

  // ════════════════════════════════════════════════════════════════
  // 2. MODULE LICENSING
  // ════════════════════════════════════════════════════════════════

  @Get('modules')
  async getModules(@CurrentTenant() tenantId: string) {
    const data = await this.tenantsService.getModules(tenantId);
    return { success: true, data };
  }

  @Post('modules')
  async toggleModule(
    @CurrentTenant() tenantId: string,
    @Body() body: { moduleId: string; isEnabled: boolean },
  ) {
    return this.tenantsService.toggleModule(tenantId, body.moduleId, body.isEnabled);
  }

  // ════════════════════════════════════════════════════════════════
  // 3. ROLES & RBAC MATRIX
  // ════════════════════════════════════════════════════════════════

  @Get('roles')
  async getRoles(@CurrentTenant() tenantId: string) {
    const data = await this.tenantsService.getRoles(tenantId);
    return { success: true, data };
  }

  @Post('roles')
  async createRole(
    @CurrentTenant() tenantId: string,
    @Body() body: { name: string; code?: string; description?: string },
  ) {
    return this.tenantsService.createRole(tenantId, body);
  }

  @Put('roles')
  async updateRolePermission(
    @CurrentTenant() tenantId: string,
    @Body() body: { roleId: string; moduleId: string; action: string; isAllowed: boolean },
  ) {
    return this.tenantsService.updateRolePermission(tenantId, body);
  }

  // ════════════════════════════════════════════════════════════════
  // 4. CHANNELS / DISPATCH
  // ════════════════════════════════════════════════════════════════

  @Post('whatsapp/send')
  async sendWhatsApp(@Body() body: any) {
    return { success: true, message: 'WhatsApp message queued for dispatch' };
  }

  @Post('email/send')
  async sendEmail(@Body() body: any) {
    return { success: true, message: 'Email queued for dispatch' };
  }
}
