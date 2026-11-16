import {
  Controller,
  Get,
  Header,
  Post,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { EmployeesService, CreateEmployeeInput } from './employees.service';
import { EmployeeProfileService } from './employee-profile.service';
import { ReplaceBankAccountDto } from './dto/employee-profile.dto';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { ListEmployeesQueryDto } from './dto/list-employees-query.dto';
import { fileResponse } from '@/modules/onboarding/file-response';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly profiles: EmployeeProfileService,
    private readonly accessService: AccessService,
  ) {}

  /** Bank details are sensitive, so changing them needs its own permission wherever they are sent. */
  private async assertMayChangeBankDetails(actor: AuthenticatedTenantUser, bankDetails: unknown) {
    if (!bankDetails) return;
    await this.accessService.assertHoldsAll(
      actor.tenantId,
      actor.tenantMemberId,
      ['people.bank.update'],
      'You do not have permission to add or change bank details (requires people.bank.update).',
    );
  }

  @Get()
  @RequirePermissions('people.view')
  async list(
    @CurrentTenant() tenantId: string,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.employeesService.listEmployees(tenantId, query);
  }

  /** The filtered directory as an Excel file. A bulk copy of personal data, so it has its own permission. */
  @Get('export')
  @RequirePermissions('people.export')
  @Header('Cache-Control', 'private, no-store')
  async export(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Query() query: ListEmployeesQueryDto) {
    const bytes = await this.employeesService.exportDirectory(tenantId, query, actor);
    return fileResponse(bytes, XLSX, `employees-${new Date().toISOString().slice(0, 10)}.xlsx`, '1');
  }

  @Get('meta/summary')
  @RequirePermissions('people.view')
  async summary(@CurrentTenant() tenantId: string) {
    return this.employeesService.directorySummary(tenantId);
  }

  @Get('meta/filters')
  @RequirePermissions('people.view')
  async filters(@CurrentTenant() tenantId: string) {
    return this.employeesService.directoryFilters(tenantId);
  }

  @Get('meta/departments')
  @RequirePermissions('people.view')
  async getDepartments(@CurrentTenant() tenantId: string) {
    return this.employeesService.getDepartments(tenantId);
  }

  @Get('meta/designations')
  @RequirePermissions('people.view')
  async getDesignations(@CurrentTenant() tenantId: string) {
    return this.employeesService.getDesignations(tenantId);
  }

  @Get('meta/employment-types')
  @RequirePermissions('people.view')
  async getEmploymentTypes(@CurrentTenant() tenantId: string) {
    return this.employeesService.getEmploymentTypes(tenantId);
  }

  @Get('meta/ifsc/:code')
  @RequirePermissions('people.view')
  async verifyIfsc(@Param('code') code: string) {
    return this.employeesService.verifyIfsc(code);
  }

  /** The whole profile; bank details only for people who may see pay. */
  @Get(':id')
  @RequirePermissions('people.view')
  async getOne(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    const held = await this.accessService.getMemberPermissions(tenantId, actor.tenantMemberId);
    return { success: true, data: await this.profiles.profile(tenantId, id, held) };
  }

  @Post()
  @RequirePermissions('people.create')
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateEmployeeInput,
  ) {
    await this.assertMayChangeBankDetails(actor, body?.bankDetails);
    return this.employeesService.createEmployee(tenantId, body, actor);
  }

  /** A new account from a date; the current one ends the day before. */
  @Post(':id/bank-account')
  @RequirePermissions('people.bank.update')
  async replaceBankAccount(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) employeeId: string,
    @Body() body: ReplaceBankAccountDto,
  ) {
    return { success: true, data: await this.profiles.replaceBankAccount(tenantId, employeeId, body, actor), message: 'Bank account changed' };
  }
}
