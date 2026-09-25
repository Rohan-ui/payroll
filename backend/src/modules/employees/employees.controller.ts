import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  EmployeesService,
  CreateEmployeeInput,
  AddBankAccountInput,
  UpdateEmployeeInput,
} from './employees.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';

@Controller('employees')
export class EmployeesController {
  constructor(
    private readonly employeesService: EmployeesService,
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.employeesService.listEmployees(tenantId, page, limit, search);
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

  @Get('meta/ifsc/:code')
  @RequirePermissions('people.view')
  async verifyIfsc(@Param('code') code: string) {
    return this.employeesService.verifyIfsc(code);
  }

  @Get(':id')
  @RequirePermissions('people.view')
  async getOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.employeesService.getEmployeeById(tenantId, id);
  }

  @Post()
  @RequirePermissions('people.create')
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Body() body: CreateEmployeeInput,
  ) {
    await this.assertMayChangeBankDetails(actor, body?.bankDetails);
    return this.employeesService.createEmployee(tenantId, body);
  }

  @Put(':id')
  @RequirePermissions('people.update')
  async update(
    @CurrentTenant() tenantId: string,
    @CurrentUser() actor: AuthenticatedTenantUser,
    @Param('id') id: string,
    @Body() body: UpdateEmployeeInput,
  ) {
    await this.assertMayChangeBankDetails(actor, body?.bankDetails);
    return this.employeesService.updateEmployee(tenantId, id, body);
  }

  @Post(':id/bank-account')
  @RequirePermissions('people.bank.update')
  async addBankAccount(
    @CurrentTenant() tenantId: string,
    @Param('id') employeeId: string,
    @Body() body: AddBankAccountInput,
  ) {
    return this.employeesService.addBankAccount(tenantId, employeeId, body);
  }
}
