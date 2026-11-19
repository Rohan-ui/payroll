import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { EmployeeAssetsService } from './employee-assets.service';
import { AssetReasonDto, AssignAssetDto, RecordAssetReturnDto } from './dto/employee-assets.dto';

type Actor = AuthenticatedTenantUser;

/**
 * An employee's company assets. Seeing them needs `assets.view`; giving one
 * out or recording its return also needs the owning team's permission
 * (`assets.it.manage` or `assets.admin.manage`), checked per asset in the service.
 */
@Controller('employees/:employeeId/assets')
export class EmployeeAssetsController {
  constructor(private readonly assets: EmployeeAssetsService) {}

  @Get()
  @RequirePermissions('assets.view')
  async list(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.assets.list(tenantId, employeeId, actor) };
  }

  @Post()
  @RequirePermissions('assets.view')
  async assign(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: AssignAssetDto) {
    return { success: true, data: await this.assets.assign(tenantId, employeeId, body, actor), message: 'Asset recorded' };
  }

  @Put(':assetId/return')
  @RequirePermissions('assets.view')
  async recordReturn(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: RecordAssetReturnDto) {
    return { success: true, data: await this.assets.recordReturn(tenantId, assetId, body, actor, employeeId), message: 'Return recorded' };
  }

  @Post(':assetId/reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assets.view')
  async reopen(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: AssetReasonDto) {
    return { success: true, data: await this.assets.reopen(tenantId, assetId, body.reason, actor, employeeId), message: 'Asset reopened' };
  }

  @Post(':assetId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('assets.view')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('assetId', ParseUUIDPipe) assetId: string, @Body() body: AssetReasonDto) {
    return { success: true, data: await this.assets.cancel(tenantId, assetId, body.reason, actor, employeeId), message: 'Asset cancelled' };
  }
}
