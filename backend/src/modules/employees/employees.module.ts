import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeRelationsController } from './employee-relations.controller';
import { EmployeeRelationsService } from './employee-relations.service';

@Module({
  controllers: [EmployeesController, EmployeeRelationsController],
  providers: [EmployeesService, EmployeeRelationsService],
  exports: [EmployeesService, EmployeeRelationsService],
})
export class EmployeesModule {}
