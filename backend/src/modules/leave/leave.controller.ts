import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { EmployeeLeaveQueryDto } from './dto/employee-leave-query.dto';
import { LeaveService } from './leave.service';
import { CreateLeaveTypeDto, SubmitLeaveRequestDto } from './dto/leave-input.dto';
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
  async createType(@CurrentTenant() tenantId: string, @Body() body: CreateLeaveTypeDto) {
    return this.leaveService.createLeaveType(tenantId, body);
  }

  @Post('requests')
  @RequirePermissions('leave.create')
  async submitRequest(@CurrentTenant() tenantId: string, @Body() body: SubmitLeaveRequestDto) {
    return this.leaveService.submitLeaveRequest(tenantId, body);
  }

  /** The approval is recorded against the signed-in member, never a member id from the body. */
  @Post('requests/:id/approve')
  @RequirePermissions('leave.approve')
  async approveRequest(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) requestId: string,
  ) {
    return this.leaveService.approveLeaveRequest(tenantId, requestId, actor.tenantMemberId);
  }

  @Get('employees/:employeeId/requests')
  @RequirePermissions('leave.view')
  async employeeRequests(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Query() query: EmployeeLeaveQueryDto) {
    return { success: true, data: await this.leaveService.listEmployeeRequests(tenantId, employeeId, query) };
  }

  @Get('balances/:employeeId')
  @RequirePermissions('leave.view')
  async getBalances(@CurrentTenant() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.leaveService.getLeaveBalances(tenantId, employeeId);
  }
}
