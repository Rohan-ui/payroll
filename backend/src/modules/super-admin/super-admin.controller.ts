import { Controller, Get, Post, Put, Body, Param, Query, Headers } from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Post('auth/login')
  async login(@Body() body: { email: string; password?: string }) {
    return this.superAdminService.login(body.email, body.password);
  }

  @Get('analytics/overview')
  async getAnalyticsOverview() {
    return this.superAdminService.getAnalyticsOverview();
  }

  @Get('tenants')
  async getTenants(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.superAdminService.getTenants(search, status);
  }

  @Get('tenants/:id')
  async getTenantById(@Param('id') id: string) {
    return this.superAdminService.getTenantById(id);
  }

  @Post('tenants')
  async createTenant(
    @Body() body: {
      legalName: string;
      displayName: string;
      tenantCode: string;
      adminEmail: string;
      adminName: string;
      currency?: string;
      countryCode?: string;
    },
  ) {
    return this.superAdminService.createTenant(body);
  }

  @Put('tenants/:id/status')
  async updateTenantStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.superAdminService.updateTenantStatus(id, status);
  }

  @Put('tenants/:id/quotas')
  async updateTenantQuotas(
    @Param('id') id: string,
    @Body() quotas: {
      userSeatsLimit?: number;
      branchLimit?: number;
      storageLimitMb?: number;
      monthlyAiTokens?: number;
      monthlyWhatsappCredits?: number;
    },
  ) {
    return this.superAdminService.updateTenantQuotas(id, quotas);
  }

  @Post('tenants/:id/impersonate')
  async impersonateTenant(
    @Param('id') id: string,
    @Headers('x-super-admin-id') adminId?: string,
  ) {
    return this.superAdminService.impersonateTenant(adminId || '00000000-0000-0000-0000-000000000000', id);
  }

  @Get('billing/packages')
  async getBillingPackages() {
    return this.superAdminService.getBillingPackages();
  }

  @Get('billing/invoices')
  async getInvoices() {
    return this.superAdminService.getPlatformInvoices();
  }

  @Get('billing/coupons')
  async getCoupons() {
    return this.superAdminService.getCoupons();
  }

  @Post('billing/coupons')
  async createCoupon(
    @Body() body: {
      couponCode: string;
      discountType?: string;
      discountValue: number;
      maxUses?: number;
      validUntil?: string;
    },
  ) {
    return this.superAdminService.createCoupon(body);
  }

  @Get('support/tickets')
  async getSupportTickets() {
    return this.superAdminService.getSupportTickets();
  }

  @Get('settings')
  async getSettings() {
    return this.superAdminService.getPlatformSettings();
  }
}
