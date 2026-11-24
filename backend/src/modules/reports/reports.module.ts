import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsOverviewService } from './reports-overview.service';

@Module({ controllers: [ReportsController], providers: [ReportsService, ReportsOverviewService] })
export class ReportsModule {}
