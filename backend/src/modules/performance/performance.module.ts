import { Module } from '@nestjs/common';
import { PerformanceLibraryController } from './performance-library.controller';
import { KrasService } from './kras.service';
import { KpisService } from './kpis.service';
import { RatingScalesService } from './rating-scales.service';
import { DepartmentHeadsService } from './department-heads.service';
import { PerformanceOptionsService } from './performance-options.service';
import { StarterLibraryService } from './starter-library.service';
import { PerformanceTemplatesController } from './performance-templates.controller';
import { PerformanceTemplatesService } from './templates.service';
import { PerformanceWorkflowsController } from './performance-workflows.controller';
import { PerformanceWorkflowsService } from './workflows.service';
import { ReviewerResolutionService } from './workflow/reviewer-resolution.service';
import { PerformanceCyclesController } from './performance-cycles.controller';
import { PerformanceMyController } from './performance-my.controller';
import { PerformanceCyclesService } from './cycles.service';
import { PerformanceAppraisalsService } from './appraisals.service';
import { PerformanceReviewsService } from './reviews.service';
import { AppraisalRuntimeService } from './appraisal/appraisal-runtime.service';
import { PrivateStorageService } from '@/common/storage/private-storage.service';

/** Performance (KRA & KPI) appraisals, under HRMS. */
@Module({
  controllers: [PerformanceLibraryController, PerformanceTemplatesController, PerformanceWorkflowsController, PerformanceCyclesController, PerformanceMyController],
  providers: [KrasService, KpisService, RatingScalesService, DepartmentHeadsService, PerformanceOptionsService, StarterLibraryService, PerformanceTemplatesService, PerformanceWorkflowsService, ReviewerResolutionService,
    AppraisalRuntimeService, PerformanceCyclesService, PerformanceAppraisalsService, PerformanceReviewsService, PrivateStorageService],
})
export class PerformanceModule {}
