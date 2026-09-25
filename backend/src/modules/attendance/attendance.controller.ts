import {
  Controller,
  Post,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  AttendanceService,
  SaveAttendanceRecordDto,
  UpdateAttendanceRecordDto,
  RecordPunchInput,
  BulkMarkMonthDto,
  RequestAdjustmentDto,
} from './attendance.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * CREATE or UPSERT daily attendance record
   * POST /attendance/records
   */
  @Post('records')
  @RequirePermissions('attendance.adjust')
  async saveRecord(
    @CurrentTenant() tenantId: string,
    @Body() body: SaveAttendanceRecordDto,
  ) {
    return this.attendanceService.saveRecord(tenantId, body);
  }

  /**
   * READ: Daily records with filters
   * GET /attendance/records?employeeId=&startDate=&endDate=&status=&page=&limit=
   */
  @Get('records')
  @RequirePermissions('attendance.view')
  async getRecords(
    @CurrentTenant() tenantId: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.attendanceService.getDailyRecords(
      tenantId,
      employeeId,
      startDate,
      endDate,
      status,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 100,
    );
  }

  /**
   * READ: Monthly summary per employee
   * GET /attendance/summary?month=2026-10&employeeId=
   */
  @Get('summary')
  @RequirePermissions('attendance.view')
  async getSummary(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    return this.attendanceService.getAttendanceSummary(tenantId, targetMonth, employeeId);
  }

  /**
   * READ: Department-level and overall attendance summary with 7-day trend
   * GET /attendance/department-summary?date=2026-10-15
   */
  @Get('department-summary')
  @RequirePermissions('attendance.view')
  async getDepartmentSummary(
    @CurrentTenant() tenantId: string,
    @Query('date') date?: string,
  ) {
    const targetDate = date || new Date().toISOString().substring(0, 10);
    return this.attendanceService.getDepartmentSummary(tenantId, targetDate);
  }

  /**
   * READ: Paginated employee list for selected date with month strip & 14-day trends
   * GET /attendance/employee-day-list?date=2026-10-15&departmentId=&search=&page=1&limit=50
   */
  @Get('employee-day-list')
  @RequirePermissions('attendance.view')
  async getEmployeeDayList(
    @CurrentTenant() tenantId: string,
    @Query('date') date?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const targetDate = date || new Date().toISOString().substring(0, 10);
    return this.attendanceService.getEmployeeDayList(
      tenantId,
      targetDate,
      departmentId,
      search,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  /**
   * READ: Roster matrix of employees x days of month with status glyphs and department leaderboard
   * GET /attendance/roster-matrix?month=2026-10&departmentId=&search=&selectedDate=2026-10-15
   */
  @Get('roster-matrix')
  @RequirePermissions('attendance.view')
  async getRosterMatrix(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
    @Query('search') search?: string,
    @Query('selectedDate') selectedDate?: string,
  ) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    return this.attendanceService.getRosterMatrix(
      tenantId,
      targetMonth,
      departmentId,
      search,
      selectedDate,
    );
  }

  /**
   * READ: Comprehensive monthly attendance records, punches, and stats for an employee
   * GET /attendance/employee-month?employeeId=...&month=2026-10
   */
  @Get('employee-month')
  @RequirePermissions('attendance.view')
  async getEmployeeMonth(
    @CurrentTenant() tenantId: string,
    @Query('employeeId') employeeId: string,
    @Query('month') month?: string,
  ) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    return this.attendanceService.getEmployeeMonth(tenantId, employeeId, targetMonth);
  }

  /**
   * READ: 12 months array for Year at a Glance
   * GET /attendance/employee-year?employeeId=...&year=2026
   */
  @Get('employee-year')
  @RequirePermissions('attendance.view')
  async getEmployeeYear(
    @CurrentTenant() tenantId: string,
    @Query('employeeId') employeeId: string,
    @Query('year') year?: string,
  ) {
    const targetYear = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.attendanceService.getEmployeeYear(tenantId, employeeId, targetYear);
  }

  /**
   * READ: Active shifts configured for tenant
   * GET /attendance/shifts
   */
  @Get('shifts')
  @RequirePermissions('attendance.view')
  async getShifts(@CurrentTenant() tenantId: string) {
    return this.attendanceService.getShifts(tenantId);
  }

  /**
   * READ: Single record by ID
   * GET /attendance/records/:id
   */
  @Get('records/:id')
  @RequirePermissions('attendance.view')
  async getRecordById(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendanceService.getRecordById(tenantId, id);
  }

  /**
   * UPDATE: Specific record by ID
   * PUT / PATCH /attendance/records/:id
   */
  @Put('records/:id')
  @RequirePermissions('attendance.adjust')
  async updateRecord(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAttendanceRecordDto,
  ) {
    return this.attendanceService.updateRecord(tenantId, id, body);
  }

  @Patch('records/:id')
  @RequirePermissions('attendance.adjust')
  async patchRecord(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAttendanceRecordDto,
  ) {
    return this.attendanceService.updateRecord(tenantId, id, body);
  }

  /**
   * DELETE: Unfinalized record by ID
   * DELETE /attendance/records/:id
   */
  @Delete('records/:id')
  @RequirePermissions('attendance.delete')
  async deleteRecord(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendanceService.deleteRecord(tenantId, id);
  }

  /**
   * BULK MARK / INITIALIZE MONTH
   * POST /attendance/bulk-mark
   */
  @Post('bulk-mark')
  @RequirePermissions('attendance.adjust')
  async bulkMark(
    @CurrentTenant() tenantId: string,
    @Body() body: BulkMarkMonthDto,
  ) {
    return this.attendanceService.bulkMarkMonth(tenantId, body);
  }

  /**
   * PUNCH: Clock In / Clock Out
   * POST /attendance/punch
   */
  @Post('punch')
  @RequirePermissions('attendance.create')
  async punch(
    @CurrentTenant() tenantId: string,
    @Body() body: RecordPunchInput,
  ) {
    return this.attendanceService.recordPunch(tenantId, body);
  }

  /**
   * PUNCHES: Punch history
   * GET /attendance/punches?employeeId=&date=
   */
  @Get('punches')
  @RequirePermissions('attendance.view')
  async getPunches(
    @CurrentTenant() tenantId: string,
    @Query('employeeId') employeeId?: string,
    @Query('date') date?: string,
  ) {
    return this.attendanceService.getPunches(tenantId, employeeId, date);
  }

  /**
   * ADJUSTMENT: Request Regularization
   * POST /attendance/adjustments
   */
  @Post('adjustments')
  @RequirePermissions('attendance.update')
  async requestAdjustment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: RequestAdjustmentDto,
  ) {
    // The requester is whoever is signed in; a member id in the body is ignored.
    return this.attendanceService.requestAdjustment(tenantId, {
      ...body,
      requestedByTenantMemberId: actor.tenantMemberId,
    });
  }

  /**
   * ADJUSTMENT: Approve Regularization
   * POST /attendance/adjustments/:id/approve
   */
  @Post('adjustments/:id/approve')
  @RequirePermissions('attendance.approve')
  async approveAdjustment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    // The approval is recorded against the signed-in member, never a member id from the body.
    return this.attendanceService.approveAdjustment(tenantId, id, actor.tenantMemberId);
  }

  /**
   * SEED: Seed realistic attendance for tenant
   * POST /attendance/seed
   */
  @Post('seed')
  @RequirePermissions('attendance.adjust', 'attendance.delete')
  async seed(
    @CurrentTenant() tenantId: string,
    @Body('month') month?: string,
  ) {
    return this.attendanceService.seedTenantAttendance(tenantId, month || '2026-10');
  }
}
