import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { CurrentUser } from '@/common/decorators/auth.decorators';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import { SettlementsService } from './settlements.service';
import {
  AdjustSettlementLineDto, ManualSettlementLineDto, SettlementPaymentDto, SettlementPolicyDto, SettlementReasonDto, SettlementReviewDto,
} from './dto/settlement.dto';

type Actor = AuthenticatedTenantUser;

/** Full and final settlements. Every route is scoped to the session's workspace; each step needs its own permission. */
@Controller('offboarding')
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get('settlement-policy')
  @RequirePermissions('offboarding.settlement.view')
  async policy(@CurrentTenant() tenantId: string) {
    return { success: true, data: await this.settlements.policy(tenantId) };
  }

  @Put('settlement-policy')
  @RequirePermissions('offboarding.settlement.manage')
  async setPolicy(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Body() body: SettlementPolicyDto) {
    return { success: true, data: await this.settlements.setPolicy(tenantId, body, actor), message: 'Settlement rules saved' };
  }

  @Get('separations/:id/settlement')
  @RequirePermissions('offboarding.settlement.view')
  async forSeparation(@CurrentTenant() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.settlements.forSeparation(tenantId, id) };
  }

  @Post('separations/:id/settlement')
  @RequirePermissions('offboarding.settlement.manage')
  async prepare(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.settlements.prepare(tenantId, id, actor), message: 'Settlement prepared' };
  }

  @Post('settlements/:id/recalculate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.manage')
  async recalculate(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.settlements.recalculate(tenantId, id, actor), message: 'Settlement recalculated' };
  }

  @Post('settlements/:id/lines')
  @RequirePermissions('offboarding.settlement.manage')
  async addLine(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: ManualSettlementLineDto) {
    return { success: true, data: await this.settlements.addLine(tenantId, id, body, actor), message: 'Amount added' };
  }

  @Put('settlements/:id/lines/:lineId')
  @RequirePermissions('offboarding.settlement.manage')
  async adjustLine(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Param('lineId', ParseUUIDPipe) lineId: string, @Body() body: AdjustSettlementLineDto) {
    return { success: true, data: await this.settlements.adjustLine(tenantId, id, lineId, body, actor), message: 'Amount changed' };
  }

  @Post('settlements/:id/submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.manage')
  async submit(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.settlements.submit(tenantId, id, actor), message: 'Sent for review' };
  }

  @Post('settlements/:id/review')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.review')
  async review(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettlementReviewDto) {
    return { success: true, data: await this.settlements.review(tenantId, id, body.notes, actor), message: 'Reviewed' };
  }

  @Post('settlements/:id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.approve')
  async approve(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.settlements.approve(tenantId, id, actor), message: 'Settlement approved' };
  }

  @Post('settlements/:id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.approve')
  async reject(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettlementReasonDto) {
    return { success: true, data: await this.settlements.reject(tenantId, id, body.reason, actor), message: 'Settlement rejected' };
  }

  @Post('settlements/:id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.pay')
  async pay(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettlementPaymentDto) {
    return { success: true, data: await this.settlements.pay(tenantId, id, body, actor), message: 'Payment recorded' };
  }

  @Post('settlements/:id/revise')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.manage')
  async revise(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettlementReasonDto) {
    return { success: true, data: await this.settlements.revise(tenantId, id, body.reason, actor), message: 'New version started' };
  }

  @Post('settlements/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('offboarding.settlement.manage')
  async cancel(@CurrentTenant() tenantId: string, @CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() body: SettlementReasonDto) {
    return { success: true, data: await this.settlements.cancel(tenantId, id, body.reason, actor), message: 'Settlement cancelled' };
  }
}
