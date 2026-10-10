import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PayrollPoliciesService } from './payroll-policies.service';
import { CreatePolicyDto, PolicyDraftDto, PolicyScopesDto, UpdatePolicyDto } from './dto/payroll-policies.dto';

/** Payroll policies (Payroll → Setup). The workspace comes from the signed-in member, never the request. */
@Controller('payroll/policies')
export class PayrollPoliciesController {
  constructor(private readonly policies: PayrollPoliciesService) {}

  @Get()
  @RequirePermissions('payroll.policies.view')
  async list(@CurrentTenant() tenantId: string, @Query('archived') archived?: string) {
    return { success: true, data: await this.policies.list(tenantId, archived === 'true') };
  }

  @Get('template')
  @RequirePermissions('payroll.policies.view')
  template() {
    return { success: true, data: this.policies.template() };
  }

  @Get('scope-options')
  @RequirePermissions('payroll.policies.view')
  async scopeOptions(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.policies.scopeOptions(tenantId) };
  }

  @Get(':id')
  @RequirePermissions('payroll.policies.view')
  async get(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.policies.get(tenantId, id) };
  }

  @Post()
  @RequirePermissions('payroll.policies.manage')
  async create(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreatePolicyDto) {
    return { success: true, data: await this.policies.create(tenantId, body, actor), message: 'Policy created with a draft of its rules' };
  }

  @Put(':id')
  @RequirePermissions('payroll.policies.manage')
  async update(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePolicyDto) {
    return { success: true, data: await this.policies.update(tenantId, id, body, actor), message: 'Policy saved' };
  }

  @Put(':id/scopes')
  @RequirePermissions('payroll.policies.manage')
  async scopes(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PolicyScopesDto) {
    return { success: true, data: await this.policies.setScopes(tenantId, id, body, actor), message: 'Who the policy covers was saved' };
  }

  @Put(':id/draft')
  @RequirePermissions('payroll.policies.manage')
  async saveDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: PolicyDraftDto) {
    return { success: true, data: await this.policies.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Delete(':id/draft')
  @RequirePermissions('payroll.policies.manage')
  async discardDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.policies.discardDraft(tenantId, id, actor), message: 'Draft discarded' };
  }

  @Post(':id/draft/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.policies.manage')
  async publish(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.policies.publish(tenantId, id, actor), message: 'New policy version published' };
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.policies.manage')
  async archive(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.policies.archive(tenantId, id, actor), message: 'Policy archived' };
  }
}
