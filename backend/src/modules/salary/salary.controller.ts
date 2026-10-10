import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { SalaryComponentsService } from './salary-components.service';
import { SalaryStructuresService } from './salary-structures.service';
import { SalaryAssignmentsService } from './salary-assignments.service';
import { SalaryImportService } from './salary-import.service';
import { ImportCommitDto, ImportPreviewDto } from './dto/salary-import.dto';
import {
  CancelRevisionDto, ComponentSettingsDto, CreateComponentDto, CreateStructureDto, RenameStructureDto, SalaryRevisionDto, StructureDraftDto, StructurePreviewDto,
} from './dto/salary.dto';

/**
 * Salary setup (Payroll → Setup) and employee salaries. The workspace comes
 * from the signed-in member, never the request; amounts are decimal strings.
 */
@Controller('salary')
export class SalaryController {
  constructor(
    private readonly components: SalaryComponentsService,
    private readonly structures: SalaryStructuresService,
    private readonly assignments: SalaryAssignmentsService,
    private readonly imports: SalaryImportService,
  ) {}

  @Get('formula-reference')
  @RequirePermissions('salary.view')
  formulaReference() {
    return { success: true, data: this.structures.formulaReference() };
  }

  @Get('components')
  @RequirePermissions('salary.view')
  async listComponents(@CurrentTenant() tenantId: string, @Query('archived') archived?: string) {
    return { success: true, data: await this.components.list(tenantId, archived === 'true') };
  }

  @Post('components')
  @RequirePermissions('salary.configure')
  async createComponent(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreateComponentDto) {
    return { success: true, data: await this.components.create(tenantId, body, actor), message: 'Component created' };
  }

  @Put('components/:id')
  @RequirePermissions('salary.configure')
  async updateComponent(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: ComponentSettingsDto) {
    return { success: true, data: await this.components.update(tenantId, id, body, actor), message: 'Component saved' };
  }

  @Post('components/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.configure')
  async archiveComponent(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.components.setArchived(tenantId, id, true, actor), message: 'Component archived' };
  }

  @Post('components/:id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.configure')
  async restoreComponent(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.components.setArchived(tenantId, id, false, actor), message: 'Component restored' };
  }

  @Get('structures')
  @RequirePermissions('salary.view')
  async listStructures(@CurrentTenant() tenantId: string, @Query('archived') archived?: string) {
    return { success: true, data: await this.structures.list(tenantId, archived === 'true') };
  }

  @Post('structures/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.view')
  async preview(@CurrentTenant() tenantId: string, @Body() body: StructurePreviewDto) {
    return { success: true, data: await this.structures.preview(tenantId, body) };
  }

  @Get('structures/:id')
  @RequirePermissions('salary.view')
  async getStructure(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.structures.get(tenantId, id) };
  }

  @Post('structures')
  @RequirePermissions('salary.configure')
  async createStructure(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: CreateStructureDto) {
    return { success: true, data: await this.structures.create(tenantId, body, actor), message: 'Structure created as a draft' };
  }

  @Put('structures/:id')
  @RequirePermissions('salary.configure')
  async renameStructure(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: RenameStructureDto) {
    return { success: true, data: await this.structures.rename(tenantId, id, body.structureName, actor), message: 'Structure renamed' };
  }

  @Put('structures/:id/draft')
  @RequirePermissions('salary.configure')
  async saveDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: StructureDraftDto) {
    return { success: true, data: await this.structures.saveDraft(tenantId, id, body, actor), message: 'Draft saved' };
  }

  @Post('structures/:id/draft/discard')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.configure')
  async discardDraft(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.structures.discardDraft(tenantId, id, actor), message: 'Draft discarded' };
  }

  @Post('structures/:id/draft/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.configure')
  async publish(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.structures.publish(tenantId, id, actor), message: 'New structure version published' };
  }

  @Post('structures/:id/archive')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.configure')
  async archiveStructure(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.structures.archive(tenantId, id, actor), message: 'Structure archived' };
  }

  @Get('employees/:employeeId')
  @RequirePermissions('salary.view')
  async employeeSalary(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.assignments.employeeSalary(tenantId, employeeId) };
  }

  @Post('employees/:employeeId/revisions')
  @RequirePermissions('salary.assign')
  async revise(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: SalaryRevisionDto) {
    return { success: true, data: await this.assignments.revise(tenantId, employeeId, body, actor), message: 'Salary revision recorded' };
  }

  @Post('assignments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.assign')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: CancelRevisionDto) {
    return { success: true, data: await this.assignments.cancel(tenantId, id, body.reason, actor), message: 'Salary revision cancelled' };
  }

  /** Reads an exported salary sheet against this workspace's employees and structures; saves nothing. */
  @Post('imports/preview')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.assign', 'salary.configure')
  async importPreview(@CurrentTenant() tenantId: string, @Body() body: ImportPreviewDto) {
    return { success: true, data: await this.imports.preview(tenantId, body) };
  }

  @Post('imports/commit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('salary.assign', 'salary.configure')
  async importCommit(@CurrentTenant() tenantId: string, @CurrentUser() actor: AuthenticatedTenantUser, @Body() body: ImportCommitDto) {
    const data = await this.imports.commit(tenantId, body, actor);
    return { success: true, data, message: `${data.imported} salar${data.imported === 1 ? 'y' : 'ies'} imported` };
  }
}
