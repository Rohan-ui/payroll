import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { EmployeeRelationsService } from './employee-relations.service';
import { CancelManagerDto, EndManagerDto, LinkLoginDto, MemberSearchQueryDto, SetManagerDto } from './dto/employee-relations.dto';

type Actor = AuthenticatedTenantUser;

/** An employee's reporting manager (effective-dated) and linked sign-in account. */
@Controller('employees/:employeeId')
export class EmployeeRelationsController {
  constructor(private readonly relations: EmployeeRelationsService, private readonly access: AccessService) {}

  @Get('reporting')
  @RequirePermissions('people.view')
  async reporting(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.relations.reporting(tenantId, employeeId) };
  }

  @Post('reporting')
  @RequirePermissions('people.update')
  async setManager(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: SetManagerDto) {
    return { success: true, data: await this.relations.setManager(tenantId, employeeId, body, actor), message: 'Reporting manager set' };
  }

  @Post('reporting/:lineId/end')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.update')
  async endManager(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() body: EndManagerDto) {
    return { success: true, data: await this.relations.endManager(tenantId, employeeId, lineId, body, actor), message: 'Last day set' };
  }

  @Post('reporting/:lineId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.update')
  async cancelManager(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() body: CancelManagerDto) {
    return { success: true, data: await this.relations.cancelManager(tenantId, employeeId, lineId, body, actor), message: 'Reporting line cancelled' };
  }

  /** Suggestions and the linked account's email go only to people who may link logins. */
  @Get('login')
  @RequirePermissions('people.view')
  async login(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    const held = await this.access.getMemberPermissions(tenantId, actor.tenantMemberId);
    return { success: true, data: await this.relations.login(tenantId, employeeId, held.includes('people.login.manage')) };
  }

  @Get('login/candidates')
  @RequirePermissions('people.login.manage')
  async loginCandidates(@CurrentTenant() tenantId: string, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Query() query: MemberSearchQueryDto) {
    return { success: true, data: await this.relations.loginCandidates(tenantId, employeeId, query.search) };
  }

  @Put('login')
  @RequirePermissions('people.login.manage')
  async linkLogin(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: LinkLoginDto) {
    return { success: true, data: await this.relations.linkLogin(tenantId, employeeId, body.tenantMemberId, actor), message: 'Sign-in account linked' };
  }

  @Delete('login')
  @RequirePermissions('people.login.manage')
  async unlinkLogin(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return { success: true, data: await this.relations.unlinkLogin(tenantId, employeeId, actor), message: 'Sign-in account unlinked' };
  }
}
