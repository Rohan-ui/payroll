import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { EmployeesService, CreateEmployeeInput, AddBankAccountInput } from './employees.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('employees')
@UseGuards(TenantGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async list(
    @CurrentTenant() tenantId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.employeesService.listEmployees(tenantId, page, limit, search);
  }

  @Get(':id')
  async getOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.employeesService.getEmployeeById(tenantId, id);
  }

  @Post()
  async create(@CurrentTenant() tenantId: string, @Body() body: CreateEmployeeInput) {
    return this.employeesService.createEmployee(tenantId, body);
  }

  @Post(':id/bank-account')
  async addBankAccount(
    @CurrentTenant() tenantId: string,
    @Param('id') employeeId: string,
    @Body() body: AddBankAccountInput,
  ) {
    return this.employeesService.addBankAccount(tenantId, employeeId, body);
  }
}
