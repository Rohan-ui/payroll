import { Controller, Get, Post, Body, Param, ParseUUIDPipe, Query, BadRequestException } from '@nestjs/common';
import {
  PayrollService,
  CreatePayrollPeriodInput,
  CreatePayrollRunInput,
} from './payroll.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PayrollCalculationService } from './calculation/payroll-calculation.service';
import { CalculationMonthQuery, CalculationPreviewQuery, monthRange, StartMonthDto } from './calculation/dto/calculation.dto';
import { PayrollDashboardService } from './dashboard/payroll-dashboard.service';
import { DashboardEmployeesQuery, DashboardQuery } from './dashboard/payroll-dashboard.dto';

/**
 * Each payroll transition has its own permission, and whoever creates,
 * approves or finalizes a run is recorded from the session, never from the body.
 */
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly calculation: PayrollCalculationService,
    private readonly dashboard: PayrollDashboardService,
  ) {}

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

  /** Who can be paid for a month: everyone active or with a salary in it. */
  @Get('calculation/employees')
  @RequirePermissions('payroll.view', 'salary.view')
  async calculationEmployees(@CurrentTenant() tenantId: string, @Query() query: CalculationMonthQuery) {
    const { start, end } = monthRange(query.month);
    return { success: true, data: await this.payrollService.payableEmployees(tenantId, start, end) };
  }

  /** One employee's pay for a month, worked out and explained, without saving anything. */
  @Get('calculation/preview')
  @RequirePermissions('payroll.view', 'salary.view')
  async calculationPreview(@CurrentTenant() tenantId: string, @Query() query: CalculationPreviewQuery) {
    const { start, end } = monthRange(query.month);
    return { success: true, data: await this.calculation.calculate(tenantId, query.employeeId, start, end) };
  }

  /** The month's payroll at a glance: totals, change from last month, the year's cost and readiness. */
  @Get('dashboard')
  @RequirePermissions('payroll.view')
  async dashboardOverview(@CurrentTenant() tenantId: string, @Query() query: DashboardQuery) {
    return { success: true, data: await this.dashboard.overview(tenantId, query.month) };
  }

  /** The month's employees in its payroll run, paged, searched and filtered on the server. */
  @Get('dashboard/employees')
  @RequirePermissions('payroll.view')
  async dashboardEmployees(@CurrentTenant() tenantId: string, @Query() query: DashboardEmployeesQuery) {
    return { success: true, data: await this.dashboard.employees(tenantId, query) };
  }

  /** Starts a month's payroll: its pay period and run, ready to calculate (or the open run if there is one). */
  @Post('months/:month/start')
  @RequirePermissions('payroll.create')
  async startMonth(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('month') month: string, @Body() body: StartMonthDto) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a month (YYYY-MM).');
    return { success: true, data: await this.payrollService.startMonth(tenantId, month, body.paymentDate ?? null, actor.tenantMemberId) };
  }

  /** One employee's pay in a run, line by line with how each was worked out. */
  @Get('runs/:id/employees/:employeeId')
  @RequirePermissions('payroll.view', 'salary.view')
  async runEmployee(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) runId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.payrollService.runEmployee(tenantId, runId, employeeId) };
  }

  /** An employee's issued payslips, newest first. */
  @Get('employees/:employeeId/payslips')
  @RequirePermissions('payroll.view', 'salary.view')
  async employeePayslips(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.payrollService.employeePayslips(tenantId, employeeId) };
  }
}
