import { Module } from '@nestjs/common';
import { DocumentsModule } from '@/modules/documents/documents.module';
import { ExitDocumentsController } from './exit-documents.controller';
import { ExitDocumentsService } from './exit-documents.service';
import { EmployeesModule } from '@/modules/employees/employees.module';
import { SalaryModule } from '@/modules/salary/salary.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';
import { OffboardingController } from './offboarding.controller';
import { OffboardingService } from './offboarding.service';

@Module({
  imports: [DocumentsModule, EmployeesModule, SalaryModule],
  controllers: [OffboardingController, SettlementsController, ExitDocumentsController],
  providers: [OffboardingService, SettlementsService, ExitDocumentsService],
})
export class OffboardingModule {}