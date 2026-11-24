import { Controller, Get, Header, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { fileResponse } from '@/modules/onboarding/file-response';
import { ReportMonthQuery, ReportPeriodQuery, ReportRangeQuery } from './reports.dto';
import { ReportFile, ReportsService } from './reports.service';
import { ReportsOverviewService } from './reports-overview.service';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const send = (file: ReportFile) => fileResponse(file.bytes, XLSX, file.filename, '1');

/** Report downloads: reports.view plus the permission to see the area's data. */
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly overviewService: ReportsOverviewService,
  ) {}

  /** Each area's current figures, only for the areas whose reports the member may run. */
  @Get('overview')
  @RequirePermissions('reports.view')
  async overview(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser) {
    return { success: true, data: await this.overviewService.overview(tenantId, actor.tenantMemberId) };
  }

  @Get('attendance')
  @RequirePermissions('reports.view', 'attendance.view')
  @Header('Cache-Control', 'private, no-store')
  async attendance(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() q: ReportMonthQuery) {
    return send(await this.reports.attendance(tenantId, q.month, actor));
  }

  @Get('leave')
  @RequirePermissions('reports.view', 'leave.view')
  @Header('Cache-Control', 'private, no-store')
  async leave(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() q: ReportRangeQuery) {
    return send(await this.reports.leave(tenantId, q.from, q.to, actor));
  }

  @Get('payroll-register')
  @RequirePermissions('reports.view', 'payroll.view', 'salary.view')
  @Header('Cache-Control', 'private, no-store')
  async payrollRegister(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() q: ReportPeriodQuery) {
    return send(await this.reports.payrollRegister(tenantId, q.periodId, actor));
  }

  @Get('exits')
  @RequirePermissions('reports.view', 'offboarding.view')
  @Header('Cache-Control', 'private, no-store')
  async exits(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() q: ReportRangeQuery) {
    return send(await this.reports.exits(tenantId, q.from, q.to, actor));
  }
}
