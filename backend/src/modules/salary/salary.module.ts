import { Module } from '@nestjs/common';
import { PayrollPoliciesModule } from '../payroll/policies/payroll-policies.module';
import { PayrollModule } from '../payroll/payroll.module';
import { SalaryController } from './salary.controller';
import { SalaryComponentsService } from './salary-components.service';
import { SalaryStructuresService } from './salary-structures.service';
import { SalaryAssignmentsService } from './salary-assignments.service';
import { SalaryImportService } from './salary-import.service';

@Module({
  imports: [PayrollPoliciesModule, PayrollModule],
  controllers: [SalaryController],
  providers: [SalaryComponentsService, SalaryStructuresService, SalaryAssignmentsService, SalaryImportService],
  exports: [SalaryStructuresService, SalaryAssignmentsService],
})
export class SalaryModule {}
