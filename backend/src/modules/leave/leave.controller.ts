import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { LeaveService, CreateLeaveTypeInput, SubmitLeaveRequestInput } from './leave.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('leave')
@UseGuards(TenantGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get('types')
  async listTypes(@CurrentTenant() tenantId: string) {
    return this.leaveService.listLeaveTypes(tenantId);
  }

  @Post('types')
  async createType(@CurrentTenant() tenantId: string, @Body() body: CreateLeaveTypeInput) {
    return this.leaveService.createLeaveType(tenantId, body);
  }

  @Post('requests')
  async submitRequest(@CurrentTenant() tenantId: string, @Body() body: SubmitLeaveRequestInput) {
    return this.leaveService.submitLeaveRequest(tenantId, body);
  }

  @Post('requests/:id/approve')
  async approveRequest(
    @CurrentTenant() tenantId: string,
    @Param('id') requestId: string,
    @Body('approverTenantMemberId') approverTenantMemberId: string,
  ) {
    return this.leaveService.approveLeaveRequest(tenantId, requestId, approverTenantMemberId);
  }

  @Get('balances/:employeeId')
  async getBalances(@CurrentTenant() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.leaveService.getLeaveBalances(tenantId, employeeId);
  }
}
