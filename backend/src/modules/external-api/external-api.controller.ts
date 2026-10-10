import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ExternalApiService, CosecApiSettings } from './external-api.service';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { CosecSyncService } from './cosec-sync.service';
import { CosecAutoSyncDto, CosecRefreshEmployeeDto, CosecRefreshMonthDto } from './dto/cosec-sync.dto';

@Controller('external-api')
export class ExternalApiController {
  constructor(
    private readonly externalApiService: ExternalApiService,
    private readonly cosecSync: CosecSyncService,
  ) {}

  /**
   * GET /external-api/cosec/sync-status
   * Whether the every-minute sync is on, how its last run went, and whether the worker is running.
   */
  @Get('cosec/sync-status')
  @RequirePermissions('attendance.integration.view')
  async getSyncStatus(@CurrentTenant() tenantId: string) {
    return this.cosecSync.status(tenantId);
  }

  /** PUT /external-api/cosec/auto-sync — switch the every-minute sync on or off. */
  @Put('cosec/auto-sync')
  @RequirePermissions('attendance.integration.update')
  async setAutoSync(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CosecAutoSyncDto) {
    return this.cosecSync.setAutoSync(tenantId, body.enabled, { userId: actor.userId, tenantMemberId: actor.tenantMemberId });
  }

  /**
   * POST /external-api/cosec/refresh-month
   * Fetches the whole workspace's month from COSEC (called when the attendance page opens).
   * Only changed days are written; finalized or corrected days are left alone.
   */
  @Post('cosec/refresh-month')
  @RequirePermissions('attendance.view')
  @HttpCode(HttpStatus.OK)
  async refreshMonth(@CurrentTenant() tenantId: string, @Body() body: CosecRefreshMonthDto) {
    return this.cosecSync.refreshMonth(tenantId, body.month);
  }

  /**
   * POST /external-api/cosec/refresh-employee
   * Fetches one employee's month from COSEC into their attendance (called when it is opened).
   * Only changed days are written; finalized or corrected days are left alone.
   */
  @Post('cosec/refresh-employee')
  @RequirePermissions('attendance.view')
  @HttpCode(HttpStatus.OK)
  async refreshEmployee(@CurrentTenant() tenantId: string, @Body() body: CosecRefreshEmployeeDto) {
    return this.cosecSync.refreshEmployee(tenantId, body.employeeId, body.month);
  }

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
    // The address and username as typed (before saving); without a new password, with the saved one.
    if (body?.baseUrl && body?.username) {
      const password = body.password || (await this.externalApiService.getCosecConfig(tenantId).catch(() => null))?.password;
      if (!password) throw new BadRequestException('Enter the COSEC password to test the connection.');
      return this.externalApiService.testConnectionWithConfig({
        baseUrl: body.baseUrl,
        username: body.username,
        password,
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
  async getUsers(
    @CurrentTenant() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) requestedPage: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) requestedLimit: number,
  ) {
    const users = await this.externalApiService.getUsers(tenantId);
    return this.paginate(users, requestedPage, requestedLimit);
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) requestedPage?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) requestedLimit?: number,
  ) {
    const targetMonth = month ?? new Date().toISOString().substring(0, 7);
    const records = await this.externalApiService.getMonthlyAttendance(
      tenantId,
      targetMonth,
      range ?? 'all',
      rangeId,
    );
    return { month: targetMonth, ...this.paginate(records, requestedPage, requestedLimit) };
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) requestedPage?: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) requestedLimit?: number,
  ) {
    const records = await this.externalApiService.getDailyAttendance(
      tenantId,
      startDate,
      endDate,
      range ?? 'all',
      rangeId,
    );
    return this.paginate(records, requestedPage, requestedLimit);
  }

  private paginate<T>(items: T[], requestedPage = 1, requestedLimit = 25) {
    const page = Math.max(1, requestedPage);
    const limit = Math.min(100, Math.max(1, requestedLimit));
    const offset = (page - 1) * limit;
    return {
      data: items.slice(offset, offset + limit),
      total: items.length,
      page,
      limit,
      totalPages: Math.ceil(items.length / limit),
      hasMore: offset + limit < items.length,
    };
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
