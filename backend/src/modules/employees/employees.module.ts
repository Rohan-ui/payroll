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
import { EmployeeAssetsController } from './employee-assets.controller';
import { EmployeeAssetsService } from './employee-assets.service';

@Module({
  controllers: [EmployeesController, EmployeeRelationsController, EmployeeProfileController, EmployeeDocumentsController, EmployeeAssetsController],
  providers: [EmployeesService, EmployeeRelationsService, EmployeeProfileService, EmployeeDocumentsService, PrivateStorageService, EmployeeAssetsService],
  exports: [EmployeesService, EmployeeRelationsService, EmployeeAssetsService],
})
export class EmployeesModule {}
