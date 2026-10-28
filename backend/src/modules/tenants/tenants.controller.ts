import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OrganizationSettingsService } from './organization-settings.service';
import { TenantRolesService } from './tenant-roles.service';
import { EmploymentTypesService } from './employment-types.service';
import {
  SaveSmtpSettingsDto,
  SaveWhatsAppSettingsDto,
  SetModuleStateDto,
  TestSmtpSettingsDto,
  TestWhatsAppSettingsDto,
  UpdateOrganizationProfileDto,
} from './dto/organization-settings.dto';
import { CreateRoleDto, SetRolePermissionDto, UpdateRoleDto } from './dto/access-management.dto';
import {
  CreateEmploymentTypeDto,
  ListEmploymentTypesQueryDto,
  SetEmploymentTypeStatusDto,
  UpdateEmploymentTypeDto,
} from './dto/employment-type.dto';

/**
 * Settings of the workspace the session is pinned to. No route takes a tenant
 * id: it always comes from the session via @CurrentTenant().
 */
@Controller(['tenant', 'tenants'])
export class TenantsController {
  constructor(
    private readonly settingsService: OrganizationSettingsService,
    private readonly rolesService: TenantRolesService,
    private readonly employmentTypesService: EmploymentTypesService,
  ) {}

  @Get('current')
  async getCurrent(@CurrentTenant() tenantId: string) {
    return this.settingsService.getCurrentTenant(tenantId);
  }

  // ── Organization profile, SMTP and WhatsApp ───────────────────

  @Get('settings')
  @RequirePermissions('organization.view')
  async getSettings(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.settingsService.getSettings(tenantId) };
  }

  @Put('settings/profile')
  @RequirePermissions('organization.update')
  async updateProfile(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: UpdateOrganizationProfileDto,
  ) {
    return this.settingsService.updateProfile(tenantId, body, actor);
  }

  @Put('settings/smtp')
  @RequirePermissions('organization.update')
  async saveSmtp(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: SaveSmtpSettingsDto,
  ) {
    return this.settingsService.saveSmtp(tenantId, body, actor);
  }

  @Post('settings/smtp/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('organization.update')
  async testSmtp(@CurrentTenant() tenantId: string, @Body() body: TestSmtpSettingsDto) {
    return this.settingsService.testSmtp(tenantId, body);
  }

  @Put('settings/whatsapp')
  @RequirePermissions('organization.update')
  async saveWhatsApp(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: SaveWhatsAppSettingsDto,
  ) {
    return this.settingsService.saveWhatsApp(tenantId, body, actor);
  }

  @Post('settings/whatsapp/test')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('organization.update')
  async testWhatsApp(@CurrentTenant() tenantId: string, @Body() body: TestWhatsAppSettingsDto) {
    return this.settingsService.testWhatsApp(tenantId, body);
  }

  // ── Modules ──────────────────────────────────────────────────

  @Get('modules')
  @RequirePermissions('modules.view')
  async getModules(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.settingsService.getModules(tenantId) };
  }

  @Put('modules/:moduleCode')
  @RequirePermissions('modules.update')
  async setModuleState(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('moduleCode') moduleCode: string,
    @Body() body: SetModuleStateDto,
  ) {
    return this.settingsService.setModuleEnabled(tenantId, moduleCode, body.enabled, actor);
  }

  // ── Roles and permissions ────────────────────────────────────

  @Get('roles')
  @RequirePermissions('roles.view')
  async getRoles(@CurrentTenant() tenantId: string) {
    return { success: true, data: { roles: await this.rolesService.listRoles(tenantId) } };
  }

  @Post('roles')
  @RequirePermissions('roles.create')
  async createRole(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateRoleDto,
  ) {
    return this.rolesService.createRole(tenantId, body, actor);
  }

  @Patch('roles/:roleId')
  @RequirePermissions('roles.update')
  async updateRole(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(tenantId, roleId, body, actor);
  }

  @Delete('roles/:roleId')
  @RequirePermissions('roles.delete')
  async deleteRole(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
  ) {
    return this.rolesService.deleteRole(tenantId, roleId, actor);
  }

  @Put('roles/:roleId/permissions')
  @RequirePermissions('roles.update')
  async setRolePermission(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() body: SetRolePermissionDto,
  ) {
    return this.rolesService.setRolePermission(tenantId, roleId, body, actor);
  }

  // ── Employment types ────────────────────────────────────────

  @Get('employment-types')
  @RequirePermissions('organization.view')
  async listEmploymentTypes(
    @CurrentTenant() tenantId: string,
    @Query() query: ListEmploymentTypesQueryDto,
  ) {
    return { success: true, data: await this.employmentTypesService.list(tenantId, query) };
  }

  @Post('employment-types')
  @RequirePermissions('organization.update')
  async createEmploymentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateEmploymentTypeDto,
  ) {
    const data = await this.employmentTypesService.create(tenantId, body, actor);
    return { success: true, data, message: `Employment type "${data.name}" added` };
  }

  @Get('employment-types/:id')
  @RequirePermissions('organization.view')
  async getEmploymentType(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return { success: true, data: await this.employmentTypesService.get(tenantId, id) };
  }

  @Put('employment-types/:id')
  @RequirePermissions('organization.update')
  async updateEmploymentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEmploymentTypeDto,
  ) {
    const data = await this.employmentTypesService.update(tenantId, id, body, actor);
    return { success: true, data, message: `Employment type "${data.name}" updated` };
  }

  @Patch('employment-types/:id/status')
  @RequirePermissions('organization.update')
  async setEmploymentTypeStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetEmploymentTypeStatusDto,
  ) {
    const data = await this.employmentTypesService.setStatus(tenantId, id, body.status, actor);
    return { success: true, data, message: `Employment type "${data.name}" set to ${data.status}` };
  }

  @Delete('employment-types/:id')
  @RequirePermissions('organization.update')
  async deleteEmploymentType(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employmentTypesService.delete(tenantId, id, actor);
  }

  // ── Outbound dispatch ────────────────────────────────────────

  /**
   * Sending is not built yet. These used to answer "queued" without sending
   * anything, which told users their message had gone when it had not.
   */
  @Post('whatsapp/send')
  sendWhatsApp() {
    throw new NotImplementedException('Sending WhatsApp messages from the CRM is not available yet. Nothing was sent.');
  }

  @Post('email/send')
  sendEmail() {
    throw new NotImplementedException('Sending email from the CRM is not available yet. Nothing was sent.');
  }
}
