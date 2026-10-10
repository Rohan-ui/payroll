import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { PayrollInputsService } from './inputs/payroll-inputs.service';
import { CreateInputDto, InputMonthQuery, RejectInputDto, UpdateInputDto } from './inputs/payroll-inputs.dto';
import { OvertimeService } from './overtime/overtime.service';
import { OvertimeDecisionsDto } from './overtime/overtime.dto';
import { LoansService } from './loans/loans.service';
import { CreateLoanDto, LoanReasonDto } from './loans/loans.dto';

/**
 * What changes pay month to month: monthly entries (bonuses, incentives,
 * deductions), overtime decisions, and loans and advances. The workspace
 * comes from the signed-in member, never the request.
 */
@Controller('payroll')
export class PayrollAdjustmentsController {
  constructor(private readonly inputs: PayrollInputsService, private readonly overtime: OvertimeService, private readonly loans: LoansService) {}

  @Get('inputs/components')
  @RequirePermissions('payroll.view')
  async inputComponents(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.inputs.components(tenantId) };
  }

  @Get('inputs')
  @RequirePermissions('payroll.view')
  async listInputs(@CurrentTenant() tenantId: string, @Query() query: InputMonthQuery) {
    return { success: true, data: await this.inputs.list(tenantId, query.month) };
  }

  @Post('inputs')
  @RequirePermissions('payroll.inputs.manage')
  async createInput(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreateInputDto) {
    return { success: true, data: await this.inputs.create(tenantId, body, actor), message: 'Entry saved; it is paid once approved' };
  }

  @Put('inputs/:id')
  @RequirePermissions('payroll.inputs.manage')
  async updateInput(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateInputDto) {
    return { success: true, data: await this.inputs.update(tenantId, id, body, actor), message: 'Entry changed' };
  }

  @Post('inputs/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.inputs.approve')
  async approveInput(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.inputs.approve(tenantId, id, actor), message: 'Entry approved' };
  }

  @Post('inputs/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.inputs.approve')
  async rejectInput(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: RejectInputDto) {
    return { success: true, data: await this.inputs.reject(tenantId, id, body.reason, actor), message: 'Entry rejected' };
  }

  @Post('inputs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.inputs.manage')
  async cancelInput(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.inputs.cancel(tenantId, id, actor), message: 'Entry cancelled' };
  }

  @Get('overtime')
  @RequirePermissions('payroll.view')
  async listOvertime(@CurrentTenant() tenantId: string, @Query() query: InputMonthQuery) {
    return { success: true, data: await this.overtime.list(tenantId, query.month) };
  }

  @Post('overtime/decisions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.overtime.approve')
  async decideOvertime(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: OvertimeDecisionsDto) {
    const data = await this.overtime.decide(tenantId, body.decisions, actor);
    return { success: true, data, message: `${data.decided} overtime day${data.decided === 1 ? '' : 's'} decided` };
  }

  @Get('loans')
  @RequirePermissions('payroll.view')
  async listLoans(@CurrentTenant() tenantId: string, @Query('status') status?: string) {
    const valid = status && ['ACTIVE', 'CLOSED', 'CANCELLED'].includes(status) ? status : undefined;
    return { success: true, data: await this.loans.list(tenantId, valid) };
  }

  @Get('loans/:id')
  @RequirePermissions('payroll.view')
  async getLoan(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.loans.get(tenantId, id) };
  }

  @Post('loans')
  @RequirePermissions('payroll.loans.manage')
  async createLoan(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreateLoanDto) {
    return { success: true, data: await this.loans.create(tenantId, body, actor), message: 'Loan recorded; recovery starts with its first month’s payroll' };
  }

  @Post('loans/:id/installments/:installmentId/defer')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.loans.manage')
  async deferInstallment(
    @CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string, @Param('installmentId', ParseUUIDPipe) installmentId: string, @Body() body: LoanReasonDto,
  ) {
    return { success: true, data: await this.loans.defer(tenantId, id, installmentId, body.reason, actor), message: 'Instalment moved to the end of the plan' };
  }

  @Post('loans/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('payroll.loans.manage')
  async cancelLoan(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: LoanReasonDto) {
    return { success: true, data: await this.loans.cancel(tenantId, id, body.reason, actor), message: 'Loan cancelled' };
  }
}
