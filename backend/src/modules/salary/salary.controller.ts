import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  SalaryService,
  CreateSalaryComponentInput,
  CreateSalaryStructureInput,
  AssignSalaryInput,
} from './salary.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { TenantGuard } from '@/common/guards/tenant.guard';

@Controller('salary')
@UseGuards(TenantGuard)
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Get('components')
  async listComponents(@CurrentTenant() tenantId: string) {
    return this.salaryService.listComponents(tenantId);
  }

  @Post('components')
  async createComponent(@CurrentTenant() tenantId: string, @Body() body: CreateSalaryComponentInput) {
    return this.salaryService.createComponent(tenantId, body);
  }

  @Get('structures')
  async listStructures(@CurrentTenant() tenantId: string) {
    return this.salaryService.listStructures(tenantId);
  }

  @Post('structures')
  async createStructure(@CurrentTenant() tenantId: string, @Body() body: CreateSalaryStructureInput) {
    return this.salaryService.createStructure(tenantId, body);
  }

  @Post('assign')
  async assignSalary(@CurrentTenant() tenantId: string, @Body() body: AssignSalaryInput) {
    return this.salaryService.assignSalary(tenantId, body);
  }

  @Get('employee/:employeeId')
  async getEmployeeSalary(@CurrentTenant() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.salaryService.getEmployeeSalary(tenantId, employeeId);
  }
}
