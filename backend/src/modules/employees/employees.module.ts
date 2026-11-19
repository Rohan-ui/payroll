import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { EmployeeRelationsController } from './employee-relations.controller';
import { EmployeeRelationsService } from './employee-relations.service';
import { EmployeeProfileController } from './employee-profile.controller';
import { EmployeeProfileService } from './employee-profile.service';
import { EmployeeDocumentsController } from './employee-documents.controller';
import { EmployeeDocumentsService } from './employee-documents.service';
import { PrivateStorageService } from '@/common/storage/private-storage.service';

@Module({
  controllers: [EmployeesController, EmployeeRelationsController, EmployeeProfileController, EmployeeDocumentsController],
  providers: [EmployeesService, EmployeeRelationsService, EmployeeProfileService, EmployeeDocumentsService, PrivateStorageService],
  exports: [EmployeesService, EmployeeRelationsService],
})
export class EmployeesModule {}
