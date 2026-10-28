import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { OffboardingService } from './offboarding.service';
import {
  CancelSeparationDto, ClearanceItemDto, ClearanceUpdateDto, EmployeeSearchQueryDto, ExitInterviewDto, LastWorkingDateDto,
  ListSeparationsQueryDto, ResignDto, StartSeparationDto, WithdrawDto,
} from './dto/offboarding.dto';

type Actor = AuthenticatedTenantUser;

/**
 * HRMS offboarding. `my/…` routes act only on the signed-in member's own
 * employee record, found from the session; there is no employee id to pass.
 * Every other route needs its own offboarding permission.
 */
@Controller('offboarding')
export class OffboardingController {
  constructor(private readonly offboarding: OffboardingService) {}

  @Get('my')
  @RequirePermissions('offboarding.my.view')
  async mine(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor) {
    return { success: true, data: await this.offboarding.mine(tenantId, actor) };
  }

  @Post('my/resignation')
  @RequirePermissions('offboarding.my.view')
  async resign(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: ResignDto) {
    return { success: true, data: await this.offboarding.resign(tenantId, body, actor), message: 'Resignation submitted to HR' };
  }

  @Post('my/resignation/withdraw')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.my.view')
  async withdraw(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: WithdrawDto) {
    return { success: true, data: await this.offboarding.withdraw(tenantId, body, actor), message: 'Resignation withdrawn' };
  }

  @Get('summary')
  @RequirePermissions('offboarding.view')
  async summary(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.offboarding.summary(tenantId) };
  }

  @Get('separations')
  @RequirePermissions('offboarding.view')
  async list(@CurrentTenant() tenantId: string, @Query() query: ListSeparationsQueryDto) {
    const result = await this.offboarding.list(tenantId, query);
    return { success: true, data: result.items, pagination: result.pagination };
  }

  @Get('separations/:id')
  @RequirePermissions('offboarding.view')
  async detail(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.offboarding.detail(tenantId, id) };
  }

  @Get('employees')
  @RequirePermissions('offboarding.manage')
  async employees(@CurrentTenant() tenantId: string, @Query() query: EmployeeSearchQueryDto) {
    return { success: true, data: await this.offboarding.searchEmployees(tenantId, query.search) };
  }

  @Post('separations')
  @RequirePermissions('offboarding.manage')
  async start(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: StartSeparationDto) {
    return { success: true, data: await this.offboarding.start(tenantId, body, actor), message: 'Exit started' };
  }

  @Post('separations/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage')
  async approve(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LastWorkingDateDto) {
    return { success: true, data: await this.offboarding.approve(tenantId, id, body.lastWorkingDate, actor), message: 'Resignation accepted' };
  }

  @Put('separations/:id/last-working-date')
  @RequirePermissions('offboarding.manage')
  async lastWorkingDate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: LastWorkingDateDto) {
    return { success: true, data: await this.offboarding.changeLastWorkingDate(tenantId, id, body.lastWorkingDate, actor), message: 'Last working day changed' };
  }

  @Put('separations/:id/exit-interview')
  @RequirePermissions('offboarding.manage')
  async exitInterview(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ExitInterviewDto) {
    return { success: true, data: await this.offboarding.recordInterview(tenantId, id, body, actor), message: 'Exit interview saved' };
  }

  @Post('separations/:id/checklist')
  @RequirePermissions('offboarding.manage')
  async addItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ClearanceItemDto) {
    return { success: true, data: await this.offboarding.addChecklistItem(tenantId, id, body, actor), message: 'Checklist item added' };
  }

  @Put('separations/:id/checklist/:itemId')
  @RequirePermissions('offboarding.clearance.update')
  async updateItem(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() body: ClearanceUpdateDto) {
    return { success: true, data: await this.offboarding.updateChecklistItem(tenantId, id, itemId, body, actor), message: 'Checklist updated' };
  }

  @Post('separations/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.manage')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelSeparationDto) {
    return { success: true, data: await this.offboarding.cancel(tenantId, id, body, actor), message: 'Exit cancelled' };
  }

  @Post('separations/:id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.complete')
  async complete(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.offboarding.complete(tenantId, id, actor), message: 'Exit completed' };
  }
}
