import { Module } from '@nestjs/common';
import { PayrollPoliciesController } from './payroll-policies.controller';
import { PayrollPoliciesService } from './payroll-policies.service';

@Module({
  controllers: [PayrollPoliciesController],
  providers: [PayrollPoliciesService],
  exports: [PayrollPoliciesService],
})
export class PayrollPoliciesModule {}
