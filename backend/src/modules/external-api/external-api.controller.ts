import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ExternalApiService, CosecApiSettings } from './external-api.service';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '@/common/decorators/access.decorators';

@Controller('external-api')
export class ExternalApiController {
  constructor(private readonly externalApiService: ExternalApiService) {}

  /**
   * GET /external-api/cosec/config
   * Returns the currently saved COSEC config (password masked).
   */
  @Get('cosec/config')
  @RequirePermissions('attendance.integration.view')
  async getCosecConfig(@CurrentTenant() tenantId: string) {
    return this.externalApiService.getCosecConfigPublic(tenantId);
  }

  /**
   * PUT /external-api/cosec/config
   * Save COSEC connection settings for this tenant.
   * Body: { baseUrl, username, password }
   */
  @Put('cosec/config')
  @RequirePermissions('attendance.integration.update')
  async saveCosecConfig(
    @CurrentTenant() tenantId: string,
    @Body() body: CosecApiSettings,
  ) {
    return this.externalApiService.saveCosecConfig(tenantId, {
      baseUrl: body.baseUrl,
      username: body.username,
      password: body.password,
    });
  }

  /**
   * POST /external-api/cosec/test-connection
   * Test connectivity with the saved credentials.
   * Optionally accepts override credentials in body for pre-save testing.
   */
  @Post('cosec/test-connection')
  @RequirePermissions('attendance.integration.update')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @CurrentTenant() tenantId: string,
    @Body() body?: Partial<CosecApiSettings>,
  ) {
    // If caller passed full override credentials (e.g. pre-save test), use those
    if (body?.baseUrl && body?.username && body?.password) {
      return this.externalApiService.testConnectionWithConfig({
        baseUrl: body.baseUrl,
        username: body.username,
        password: body.password,
      });
    }
    // Otherwise use saved config
    return this.externalApiService.testConnection(tenantId);
  }

  /**
   * GET /external-api/cosec/users
   * Fetch all active users from COSEC, serialized to internal format.
   */
  @Get('cosec/users')
  @RequirePermissions('attendance.integration.view')
  async getUsers(@CurrentTenant() tenantId: string) {
    const users = await this.externalApiService.getUsers(tenantId);
    return { total: users.length, data: users };
  }

  /**
   * GET /external-api/cosec/attendance-monthly?month=YYYY-MM&range=all&rangeId=
   * Fetch monthly attendance from COSEC for the given month, serialized.
   *
   * Query params:
   *   month   — YYYY-MM (required)
   *   range   — "all" | "organization" | "department" | "branch" (default: "all")
   *   rangeId — ID of the selected range group (required if range != "all")
   */
  @Get('cosec/attendance-monthly')
  @RequirePermissions('attendance.integration.view')
  async getMonthlyAttendance(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
    @Query('range') range?: string,
    @Query('rangeId') rangeId?: string,
  ) {
    const targetMonth = month ?? new Date().toISOString().substring(0, 7);
    const records = await this.externalApiService.getMonthlyAttendance(
      tenantId,
      targetMonth,
      range ?? 'all',
      rangeId,
    );
    return { month: targetMonth, total: records.length, data: records };
  }

  /**
   * GET /external-api/cosec/attendance-daily?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&range=all&rangeId=
   * Fetch daily attendance from COSEC with punch in / out timestamps.
   */
  @Get('cosec/attendance-daily')
  @RequirePermissions('attendance.integration.view')
  async getDailyAttendance(
    @CurrentTenant() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('range') range?: string,
    @Query('rangeId') rangeId?: string,
  ) {
    const records = await this.externalApiService.getDailyAttendance(
      tenantId,
      startDate,
      endDate,
      range ?? 'all',
      rangeId,
    );
    return { total: records.length, data: records };
  }

  /**
   * POST /external-api/cosec/sync-users
   * Import all users from COSEC into internal employee database and remove mock employees.
   */
  @Post('cosec/sync-users')
  @RequirePermissions('attendance.sync', 'people.create', 'people.update')
  @HttpCode(HttpStatus.OK)
  async syncUsers(@CurrentTenant() tenantId: string) {
    return this.externalApiService.syncUsers(tenantId);
  }

  /**
   * POST /external-api/cosec/sync-daily-attendance?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * Import daily attendance with real punch IN/OUT timestamps into internal attendance records.
   */
  @Post('cosec/sync-daily-attendance')
  @RequirePermissions('attendance.sync')
  @HttpCode(HttpStatus.OK)
  async syncDailyAttendance(
    @CurrentTenant() tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.externalApiService.syncDailyAttendance(tenantId, startDate, endDate);
  }

  /**
   * POST /external-api/cosec/sync-attendance?month=YYYY-MM
   * Import monthly attendance from COSEC into attendance records.
   */
  @Post('cosec/sync-attendance')
  @RequirePermissions('attendance.sync')
  @HttpCode(HttpStatus.OK)
  async syncAttendance(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
  ) {
    const targetMonth = month ?? new Date().toISOString().substring(0, 7);
    return this.externalApiService.syncAttendance(tenantId, targetMonth);
  }

  /**
   * POST /external-api/cosec/sync-all?month=YYYY-MM
   * Master sync: users + daily attendance & punches + monthly attendance summary.
   */
  @Post('cosec/sync-all')
  @RequirePermissions('attendance.sync', 'people.create', 'people.update')
  @HttpCode(HttpStatus.OK)
  async syncAll(
    @CurrentTenant() tenantId: string,
    @Query('month') month?: string,
  ) {
    return this.externalApiService.syncAll(tenantId, month);
  }
}
