import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Headers,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';

@Controller('super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  // ══════════════════════════════════════════
  // AUTHENTICATION
  // ══════════════════════════════════════════

  @Post('auth/login')
  async login(@Body() body: { email: string; password?: string }) {
    const data = await this.superAdminService.login(body.email, body.password);
    return { success: true, data };
  }

  @Post('auth/logout')
  async logout() {
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('auth/me')
  async getMe(@Headers('x-super-admin-id') adminId?: string) {
    const admin = await this.superAdminService.getMe(adminId || '00000000-0000-0000-0000-000000000000');
    return { success: true, data: admin };
  }

  // ══════════════════════════════════════════
  // EXECUTIVE DASHBOARD & OVERVIEW
  // ══════════════════════════════════════════

  @Get('dashboard')
  async getDashboard() {
    const data = await this.superAdminService.getDashboard();
    return { success: true, data };
  }

  @Get('analytics/overview')
  async getAnalyticsOverview() {
    const data = await this.superAdminService.getAnalyticsOverview();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // TENANTS & WORKSPACES
  // ══════════════════════════════════════════

  @Get('tenants')
  async getTenants(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.superAdminService.getTenants(search, status);
    return { success: true, data };
  }

  @Get('tenants/:id')
  async getTenantById(@Param('id') id: string) {
    const data = await this.superAdminService.getTenantById(id);
    return { success: true, data };
  }

  @Post('tenants')
  async createTenant(
    @Body()
    body: {
      legalName: string;
      displayName: string;
      tenantCode: string;
      adminEmail: string;
      adminName: string;
      currency?: string;
      countryCode?: string;
    },
  ) {
    const data = await this.superAdminService.createTenant(body);
    return { success: true, data };
  }

  @Put('tenants/:id/status')
  async updateTenantStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    const data = await this.superAdminService.updateTenantStatus(id, status);
    return { success: true, data };
  }

  @Put('tenants/:id/quotas')
  async updateTenantQuotas(
    @Param('id') id: string,
    @Body()
    quotas: {
      userSeatsLimit?: number;
      branchLimit?: number;
      storageLimitMb?: number;
      monthlyAiTokens?: number;
      monthlyWhatsappCredits?: number;
    },
  ) {
    const data = await this.superAdminService.updateTenantQuotas(id, quotas);
    return { success: true, data };
  }

  @Post('tenants/:id/impersonate')
  async impersonateTenant(
    @Param('id') id: string,
    @Headers('x-super-admin-id') adminId?: string,
  ) {
    const data = await this.superAdminService.impersonateTenant(
      adminId || '00000000-0000-0000-0000-000000000000',
      id,
    );
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // USERS & INVITED MEMBERS
  // ══════════════════════════════════════════

  @Get('registered-users')
  async getRegisteredUsers(
    @Query('q') q?: string,
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
  ) {
    const data = await this.superAdminService.getRegisteredUsers({ q, tenantId, status });
    return { success: true, data };
  }

  @Get('invited-users')
  async getInvitedUsers(@Query('q') q?: string, @Query('status') status?: string) {
    const data = await this.superAdminService.getInvitedUsers({ q, status });
    return { success: true, data };
  }

  @Get('workspace-admins')
  async getWorkspaceAdmins() {
    const data = await this.superAdminService.getWorkspaceAdmins();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // DOMAINS & NETWORKING
  // ══════════════════════════════════════════

  @Get('domains')
  async getDomains() {
    const data = await this.superAdminService.getDomains();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // SUBSCRIPTIONS, PACKAGES & TIERS
  // ══════════════════════════════════════════

  @Get('subscriptions')
  async getSubscriptions(@Query('q') q?: string, @Query('status') status?: string) {
    const data = await this.superAdminService.getSubscriptions({ q, status });
    return { success: true, data };
  }

  @Get(['packages', 'billing/packages'])
  async getPackages() {
    const data = await this.superAdminService.getPackages();
    return { success: true, data };
  }

  @Post('packages')
  async createPackage(@Body() body: any) {
    const current = await this.superAdminService.getPackages();
    const plans = [...current.plans, { id: `plan_${Date.now().toString(36)}`, ...body }];
    await this.superAdminService.savePackages(plans);
    return { success: true, message: 'Package created successfully' };
  }

  @Put('packages')
  async updatePackage(@Body() body: any) {
    const current = await this.superAdminService.getPackages();
    const updated = current.plans.map((p: any) => (p.id === body.id ? { ...p, ...body } : p));
    await this.superAdminService.savePackages(updated);
    return { success: true, message: 'Package updated successfully' };
  }

  @Delete('packages')
  async deletePackage(@Query('id') id: string) {
    const current = await this.superAdminService.getPackages();
    const filtered = current.plans.filter((p: any) => p.id !== id);
    await this.superAdminService.savePackages(filtered);
    return { success: true, message: 'Package deleted successfully' };
  }

  // ══════════════════════════════════════════
  // INVOICES & TRANSACTIONS
  // ══════════════════════════════════════════

  @Get(['invoices', 'billing/invoices'])
  async getInvoices() {
    const data = await this.superAdminService.getPlatformInvoices();
    return { success: true, data };
  }

  @Get('transactions')
  async getTransactions() {
    const data = await this.superAdminService.getTransactions();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // COUPONS
  // ══════════════════════════════════════════

  @Get(['coupons', 'billing/coupons'])
  async getCoupons() {
    const data = await this.superAdminService.getCoupons();
    return { success: true, data };
  }

  @Post(['coupons', 'billing/coupons'])
  async createCoupon(
    @Body()
    body: {
      couponCode: string;
      discountType?: string;
      discountValue: number;
      maxUses?: number;
      validUntil?: string;
    },
  ) {
    const data = await this.superAdminService.createCoupon(body);
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // GOVERNANCE: ACTIVITY, SUPPORT, SECURITY
  // ══════════════════════════════════════════

  @Get('activity')
  async getActivityLogs(
    @Query('category') category?: string,
    @Query('severity') severity?: string,
    @Query('q') q?: string,
  ) {
    const data = await this.superAdminService.getActivityLogs(category, severity, q);
    return { success: true, data };
  }

  @Get(['support', 'support/tickets'])
  async getSupportTickets() {
    const data = await this.superAdminService.getSupportTickets();
    return { success: true, data };
  }

  @Get('security')
  async getSecurity() {
    const data = await this.superAdminService.getSecurityOverview();
    return { success: true, data };
  }

  @Get('roles-templates')
  async getRoleTemplates() {
    const data = await this.superAdminService.getRoleTemplates();
    return { success: true, data };
  }

  // ══════════════════════════════════════════
  // SETTINGS (GATEWAYS, WEBSITE, PROFILE)
  // ══════════════════════════════════════════

  @Get('settings')
  async getSettings() {
    const data = await this.superAdminService.getPlatformSettings();
    return { success: true, data };
  }

  @Get('settings/razorpay')
  async getRazorpaySettings() {
    const data = await this.superAdminService.getRazorpaySettings();
    return { success: true, data };
  }

  @Post('settings/razorpay')
  async saveRazorpaySettings(@Body() body: any) {
    await this.superAdminService.saveRazorpaySettings(body);
    return { success: true, message: 'Razorpay configuration saved successfully' };
  }

  @Get('settings/website')
  async getWebsiteSettings() {
    const data = await this.superAdminService.getWebsiteSettings();
    return { success: true, data };
  }

  @Post('settings/website')
  async saveWebsiteSettings(@Body() body: any) {
    await this.superAdminService.saveWebsiteSettings(body);
    return { success: true, message: 'Website settings saved successfully' };
  }

  @Get('forms')
  async getForms() {
    const data = await this.superAdminService.getWebsiteForms();
    return { success: true, data };
  }

  @Get('profile')
  async getProfile(@Headers('x-super-admin-id') adminId?: string) {
    const admin = await this.superAdminService.getMe(adminId || '00000000-0000-0000-0000-000000000000');
    return { success: true, data: admin };
  }

  @Post('ai-assistant')
  async askAiAssistant(@Body('prompt') prompt: string, @Body('message') message?: string) {
    const query = prompt || message || 'What is our platform MRR and tenant status?';
    const data = await this.superAdminService.askAiAssistant(query);
    return { success: true, data };
  }
}

