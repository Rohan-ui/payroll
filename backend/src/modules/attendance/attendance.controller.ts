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
  UseGuards,
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
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('attendance')
@UseGuards(TenantGuard)
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  /**
   * CREATE or UPSERT daily attendance record
   * POST /attendance/records
   */
  @Post('records')
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
  async getSummary(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    const targetMonth = month || new Date().toISOString().substring(0, 7);
    return this.attendanceService.getAttendanceSummary(tenantId, targetMonth, employeeId);
  }

  /**
   * READ: Single record by ID
   * GET /attendance/records/:id
   */
  @Get('records/:id')
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
  async updateRecord(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateAttendanceRecordDto,
  ) {
    return this.attendanceService.updateRecord(tenantId, id, body);
  }

  @Patch('records/:id')
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
  async requestAdjustment(
    @CurrentTenant() tenantId: string,
    @Body() body: RequestAdjustmentDto,
  ) {
    return this.attendanceService.requestAdjustment(tenantId, body);
  }

  /**
   * ADJUSTMENT: Approve Regularization
   * POST /attendance/adjustments/:id/approve
   */
  @Post('adjustments/:id/approve')
  async approveAdjustment(
    @CurrentTenant() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('approverTenantMemberId') approverTenantMemberId: string,
  ) {
    return this.attendanceService.approveAdjustment(tenantId, id, approverTenantMemberId);
  }

  /**
   * SEED: Seed realistic attendance for tenant
   * POST /attendance/seed
   */
  @Post('seed')
  async seed(
    @CurrentTenant() tenantId: string,
    @Body('month') month?: string,
  ) {
    return this.attendanceService.seedTenantAttendance(tenantId, month || '2026-10');
  }
}
