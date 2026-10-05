import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmLeadAssignmentService } from './crm-lead-assignment.service';
import { CrmLeadImportService } from './crm-lead-import.service';
import { PrismaModule } from '@/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmController],
  providers: [CrmService, CrmLeadAssignmentService, CrmLeadImportService],
  exports: [CrmService, CrmLeadAssignmentService],
})
export class CrmModule {}
