import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { BookkeepingService } from './bookkeeping.service';
import { FinancialYearsService } from './financial-years.service';
import { CreateFinancialYearDto } from './bookkeeping.types';

@Controller('bookkeeping')
@UseGuards(TenantGuard)
export class BookkeepingController {
  constructor(
    private readonly bookkeepingService: BookkeepingService,
    private readonly financialYearsService: FinancialYearsService,
  ) {}

  /**
   * Retrieves all Financial Years for the authenticated tenant.
   */
  @Get('financial-years')
  async getFinancialYears(@CurrentTenant() tenantId: string) {
    return this.financialYearsService.listFinancialYears(tenantId);
  }

  /**
   * Retrieves or auto-provisions the active Financial Year for today.
   */
  @Get('financial-years/current')
  async getCurrentFinancialYear(@CurrentTenant() tenantId: string) {
    return this.financialYearsService.getCurrentFinancialYear(tenantId);
  }

  /**
   * Manually creates a new Financial Year.
   */
  @Post('financial-years')
  async createFinancialYear(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateFinancialYearDto,
  ) {
    return this.financialYearsService.createFinancialYear(tenantId, dto);
  }

  /**
   * Closes a Financial Year.
   */
  @Post('financial-years/:id/close')
  @HttpCode(HttpStatus.OK)
  async closeFinancialYear(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.financialYearsService.closeFinancialYear(tenantId, id);
  }

  /**
   * Retrieves the Chart of Accounts / Ledgers for the tenant.
   */
  @Get('ledgers')
  async getLedgers(@CurrentTenant() tenantId: string) {
    return this.bookkeepingService.getLedgers(tenantId);
  }

  /**
   * Generates the Trial Balance verifying that Total Debits == Total Credits.
   */
  @Get('trial-balance')
  async getTrialBalance(
    @CurrentTenant() tenantId: string,
    @Query('financialYearId') financialYearId?: string,
  ) {
    return this.bookkeepingService.getTrialBalance(tenantId, financialYearId);
  }

  /**
   * Retrieves Journal Vouchers (entries) with line items.
   */
  @Get('entries')
  async getJournalEntries(
    @CurrentTenant() tenantId: string,
    @Query('financialYearId') financialYearId?: string,
    @Query('runId') runId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bookkeepingService.getJournalEntries(tenantId, {
      financialYearId,
      runId,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  /**
   * Retroactive "Do it all over" Sync:
   * Scans all historical payroll periods and finalized payroll runs, assigns financial years,
   * ensures chart of accounts, and automatically posts balanced journal vouchers.
   */
  @Post('sync-all')
  @HttpCode(HttpStatus.OK)
  async syncAllHistoricalAccounting(@CurrentTenant() tenantId: string) {
    return this.bookkeepingService.syncAllHistoricalAccounting(tenantId);
  }

  /**
   * Manually triggers journal posting for a specific finalized payroll run.
   */
  @Post('post-run/:runId')
  @HttpCode(HttpStatus.OK)
  async postPayrollRun(
    @CurrentTenant() tenantId: string,
    @Param('runId') runId: string,
  ) {
    return this.bookkeepingService.postPayrollRunAccrual(tenantId, runId);
  }
}
