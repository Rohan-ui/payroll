import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import {
  PayrollService,
  CreatePayrollPeriodInput,
  CreatePayrollRunInput,
} from './payroll.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

/**
 * Each payroll transition has its own permission, and whoever creates,
 * approves or finalizes a run is recorded from the session, never from the body.
 */
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('periods')
  @RequirePermissions('payroll.create')
  async createPeriod(@CurrentTenant() tenantId: string, @Body() body: CreatePayrollPeriodInput) {
    return this.payrollService.createPeriod(tenantId, body);
  }

  @Get('periods')
  @RequirePermissions('payroll.view')
  async listPeriods(@CurrentTenant() tenantId: string) {
    return this.payrollService.listPeriods(tenantId);
  }

  @Post('runs')
  @RequirePermissions('payroll.create')
  async createRun(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreatePayrollRunInput,
  ) {
    return this.payrollService.createRun(tenantId, { ...body, createdByTenantMemberId: actor.tenantMemberId });
  }

  @Post('runs/:id/calculate')
  @RequirePermissions('payroll.process')
  async calculateRun(@CurrentTenant() tenantId: string, @Param('id') runId: string) {
    return this.payrollService.calculateRun(tenantId, runId);
  }

  @Post('runs/:id/approve')
  @RequirePermissions('payroll.approve')
  async approveRun(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.approveRun(tenantId, runId, actor.tenantMemberId);
  }

  @Post('runs/:id/finalize')
  @RequirePermissions('payroll.finalize')
  async finalizeRun(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') runId: string,
  ) {
    return this.payrollService.finalizeRun(tenantId, runId, actor.tenantMemberId);
  }

  @Get('runs/:id')
  @RequirePermissions('payroll.view')
  async getRunDetails(@CurrentTenant() tenantId: string, @Param('id') runId: string) {
    return this.payrollService.getRunDetails(tenantId, runId);
  }
}
