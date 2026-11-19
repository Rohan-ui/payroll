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
import { OffboardingNotificationsModule } from './offboarding-notifications.module';
import { TeamExitsService } from './team-exits.service';
import { ExitChecklistService } from './exit-checklist.service';
import { ExitReasonsService } from './exit-reasons.service';
import { OffboardingReportsService } from './offboarding-reports.service';

@Module({
  imports: [DocumentsModule, EmployeesModule, SalaryModule, OffboardingNotificationsModule],
  controllers: [OffboardingController, SettlementsController, ExitDocumentsController],
  providers: [OffboardingService, SettlementsService, ExitDocumentsService, TeamExitsService, ExitChecklistService, ExitReasonsService, OffboardingReportsService],
})
export class OffboardingModule {}