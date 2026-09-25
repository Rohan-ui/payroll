import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { LeaveService, CreateLeaveTypeInput, SubmitLeaveRequestInput } from './leave.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  @RequirePermissions('leave.view')
  async listTypes(@CurrentTenant() tenantId: string) {
    return this.leaveService.listLeaveTypes(tenantId);
  }

  @Post('types')
  @RequirePermissions('leave.configure')
  async createType(@CurrentTenant() tenantId: string, @Body() body: CreateLeaveTypeInput) {
    return this.leaveService.createLeaveType(tenantId, body);
  }

  @Post('requests')
  @RequirePermissions('leave.create')
  async submitRequest(@CurrentTenant() tenantId: string, @Body() body: SubmitLeaveRequestInput) {
    return this.leaveService.submitLeaveRequest(tenantId, body);
  }

  /** The approval is recorded against the signed-in member, never a member id from the body. */
  @Post('requests/:id/approve')
  @RequirePermissions('leave.approve')
  async approveRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') requestId: string,
  ) {
    return this.leaveService.approveLeaveRequest(tenantId, requestId, actor.tenantMemberId);
  }

  @Get('balances/:employeeId')
  @RequirePermissions('leave.view')
  async getBalances(@CurrentTenant() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.leaveService.getLeaveBalances(tenantId, employeeId);
  }
}
