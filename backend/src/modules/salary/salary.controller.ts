import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import {
  SalaryService,
  CreateSalaryComponentInput,
  CreateSalaryStructureInput,
  AssignSalaryInput,
} from './salary.service';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { RequirePermissions } from '@/common/decorators/access.decorators';

@Controller('salary')
export class SalaryController {
  constructor(private readonly salaryService: SalaryService) {}

  @Get('components')
  @RequirePermissions('salary.view')
  async listComponents(@CurrentTenant() tenantId: string) {
    return this.salaryService.listComponents(tenantId);
  }

  @Post('components')
  @RequirePermissions('salary.configure')
  async createComponent(@CurrentTenant() tenantId: string, @Body() body: CreateSalaryComponentInput) {
    return this.salaryService.createComponent(tenantId, body);
  }

  @Get('structures')
  @RequirePermissions('salary.view')
  async listStructures(@CurrentTenant() tenantId: string) {
    return this.salaryService.listStructures(tenantId);
  }

  @Post('structures')
  @RequirePermissions('salary.configure')
  async createStructure(@CurrentTenant() tenantId: string, @Body() body: CreateSalaryStructureInput) {
    return this.salaryService.createStructure(tenantId, body);
  }

  @Post('assign')
  @RequirePermissions('salary.assign')
  async assignSalary(@CurrentTenant() tenantId: string, @Body() body: AssignSalaryInput) {
    return this.salaryService.assignSalary(tenantId, body);
  }

  @Get('employee/:employeeId')
  @RequirePermissions('salary.view')
  async getEmployeeSalary(@CurrentTenant() tenantId: string, @Param('employeeId') employeeId: string) {
    return this.salaryService.getEmployeeSalary(tenantId, employeeId);
  }
}
