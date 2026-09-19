import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  PayrollService,
  CreatePayrollPeriodInput,
  CreatePayrollRunInput,
} from './payroll.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('payroll')
@UseGuards(TenantGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('periods')
  async createPeriod(@CurrentTenant() tenantId: string, @Body() body: CreatePayrollPeriodInput) {
    return this.payrollService.createPeriod(tenantId, body);
  }

  @Get('periods')
  async listPeriods(@CurrentTenant() tenantId: string) {
    return this.payrollService.listPeriods(tenantId);
  }

  @Post('runs')
  async createRun(@CurrentTenant() tenantId: string, @Body() body: CreatePayrollRunInput) {
    return this.payrollService.createRun(tenantId, body);
  }

  @Post('runs/:id/calculate')
  async calculateRun(@CurrentTenant() tenantId: string, @Param('id') runId: string) {
    return this.payrollService.calculateRun(tenantId, runId);
  }

  @Post('runs/:id/approve')
  async approveRun(
    @CurrentTenant() tenantId: string,
    @Param('id') runId: string,
    @Body('approverTenantMemberId') approverTenantMemberId?: string,
  ) {
    return this.payrollService.approveRun(tenantId, runId, approverTenantMemberId);
  }

  @Post('runs/:id/finalize')
  async finalizeRun(
    @CurrentTenant() tenantId: string,
    @Param('id') runId: string,
    @Body('finalizerTenantMemberId') finalizerTenantMemberId?: string,
  ) {
    return this.payrollService.finalizeRun(tenantId, runId, finalizerTenantMemberId);
  }

  @Get('runs/:id')
  async getRunDetails(@CurrentTenant() tenantId: string, @Param('id') runId: string) {
    return this.payrollService.getRunDetails(tenantId, runId);
  }
}
