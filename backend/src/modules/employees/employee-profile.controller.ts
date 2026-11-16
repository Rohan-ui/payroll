import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseEnumPipe, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { AccessService } from '@/common/access/access.service';
import { EmployeeProfileService } from './employee-profile.service';
import {
  ActivityQueryDto, ChangeStatusDto, EmploymentChangeDto, SaveAddressDto, SaveEmergencyContactDto, UpdatePersonalDto,
} from './dto/employee-profile.dto';

type Actor = AuthenticatedTenantUser;
const ADDRESS_TYPE = { CURRENT: 'CURRENT', PERMANENT: 'PERMANENT' } as const;
type AddressType = keyof typeof ADDRESS_TYPE;

/**
 * Changes HR makes from an employee's page. Each one answers with the whole
 * profile as saved, so the page shows what the server holds.
 */
@Controller('employees/:employeeId')
export class EmployeeProfileController {
  constructor(private readonly profiles: EmployeeProfileService, private readonly access: AccessService) {}

  @Put('personal')
  @RequirePermissions('people.update')
  async personal(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: UpdatePersonalDto) {
    return { success: true, data: await this.profiles.updatePersonal(tenantId, employeeId, body, actor), message: 'Personal details saved' };
  }

  @Put('addresses/:addressType')
  @RequirePermissions('people.update')
  async address(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('addressType', new ParseEnumPipe(ADDRESS_TYPE)) addressType: AddressType, @Body() body: SaveAddressDto) {
    return { success: true, data: await this.profiles.saveAddress(tenantId, employeeId, addressType, body, actor), message: 'Address saved' };
  }

  @Post('emergency-contacts')
  @RequirePermissions('people.update')
  async addContact(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: SaveEmergencyContactDto) {
    return { success: true, data: await this.profiles.addEmergencyContact(tenantId, employeeId, body, actor), message: 'Emergency contact added' };
  }

  @Put('emergency-contacts/:contactId')
  @RequirePermissions('people.update')
  async updateContact(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('contactId', ParseUUIDPipe) contactId: string, @Body() body: SaveEmergencyContactDto) {
    return { success: true, data: await this.profiles.updateEmergencyContact(tenantId, employeeId, contactId, body, actor), message: 'Emergency contact saved' };
  }

  @Delete('emergency-contacts/:contactId')
  @RequirePermissions('people.update')
  async removeContact(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('contactId', ParseUUIDPipe) contactId: string) {
    return { success: true, data: await this.profiles.removeEmergencyContact(tenantId, employeeId, contactId, actor), message: 'Emergency contact removed' };
  }

  @Post('employment-changes')
  @RequirePermissions('people.update')
  async employment(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: EmploymentChangeDto) {
    return { success: true, data: await this.profiles.changeEmployment(tenantId, employeeId, body, actor), message: 'Job change recorded' };
  }

  @Post('status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('people.update')
  async status(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() body: ChangeStatusDto) {
    return { success: true, data: await this.profiles.changeStatus(tenantId, employeeId, body, actor), message: 'Status changed' };
  }

  /** Salary revisions appear only for people who may see pay. */
  @Get('activity')
  @RequirePermissions('people.view')
  async activity(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Query() query: ActivityQueryDto) {
    const held = await this.access.getMemberPermissions(tenantId, actor.tenantMemberId);
    return { success: true, data: await this.profiles.activity(tenantId, employeeId, query, held) };
  }
}
