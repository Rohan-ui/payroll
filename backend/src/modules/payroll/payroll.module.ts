import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PayrollController } from './payroll.controller';
import { PayrollAdjustmentsController } from './payroll-adjustments.controller';
import { BookkeepingModule } from '../bookkeeping/bookkeeping.module';
import { PayrollPoliciesModule } from './policies/payroll-policies.module';
import { PayrollCalculationService } from './calculation/payroll-calculation.service';
import { PayrollInputsService } from './inputs/payroll-inputs.service';
import { OvertimeService } from './overtime/overtime.service';
import { LoansService } from './loans/loans.service';
import { PayrollDashboardService } from './dashboard/payroll-dashboard.service';

@Module({
  imports: [BookkeepingModule, PayrollPoliciesModule],
  controllers: [PayrollController, PayrollAdjustmentsController],
  providers: [PayrollService, PayrollCalculationService, PayrollInputsService, OvertimeService, LoansService, PayrollDashboardService],
  exports: [PayrollService, PayrollCalculationService],
})
export class PayrollModule {}
