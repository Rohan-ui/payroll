import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Body,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { RequirePermissions } from '@/common/decorators/access.decorators';
import { CurrentUser, PublicRoute } from '@/common/decorators/auth.decorators';
import { CurrentTenant } from '@/common/decorators/tenant.decorator';
import { AuthenticatedTenantUser } from '@/common/interfaces/authenticated-user.interface';
import {
  GmailInboxQueryDto,
  GmailMailboxQueryDto,
  GmailOAuthCallbackDto,
  GmailReplyDto,
  GmailSendMessageDto,
  GmailTemplateDto,
  GmailTemplatesQueryDto,
} from './dto/gmail.dto';
import { GmailService } from './gmail.service';

@Controller('gmail')
export class GmailController {
  constructor(private readonly gmail: GmailService) {}

  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('marketing.view')
  connect(@CurrentTenant() tenantId: string, @CurrentUser() user: AuthenticatedTenantUser) {
    return this.gmail.beginOAuth(tenantId, user.userId);
  }

  @Get('oauth/callback')
  @PublicRoute()
  async callback(@Query() query: GmailOAuthCallbackDto, @Res() response: Response): Promise<void> {
    const target = await this.gmail.handleOAuthCallback(query);
    response.redirect(HttpStatus.FOUND, target);
  }

  @Get('status')
  @RequirePermissions('marketing.view')
  status(@CurrentTenant() tenantId: string, @CurrentUser() user: AuthenticatedTenantUser) {
    return this.gmail.status(tenantId, user.userId);
  }

  @Delete('connection')
  @RequirePermissions('marketing.view')
  disconnect(@CurrentTenant() tenantId: string, @CurrentUser() user: AuthenticatedTenantUser) {
    return this.gmail.disconnect(tenantId, user);
  }

  @Get('messages')
  @RequirePermissions('marketing.view')
  listInbox(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Query() query: GmailInboxQueryDto,
  ) {
    return this.gmail.listMessages(tenantId, user.userId, query.folder, query.page, query.limit);
  }

  @Post('messages/send')
  @RequirePermissions('marketing.manage')
  sendMessage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Body() body: GmailSendMessageDto,
  ) {
    return this.gmail.sendMessage(tenantId, user, body);
  }

  @Post('messages/:uid/reply')
  @RequirePermissions('marketing.manage')
  reply(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Param('uid', ParseIntPipe) uid: number,
    @Body() body: GmailReplyDto,
  ) {
    return this.gmail.reply(tenantId, user, uid, body);
  }

  @Get('messages/:uid')
  @RequirePermissions('marketing.view')
  getMessage(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Param('uid', ParseIntPipe) uid: number,
    @Query() query: GmailMailboxQueryDto,
  ) {
    return this.gmail.getMessage(tenantId, user.userId, uid, query.folder);
  }

  @Get('messages/:uid/attachments/:part')
  @RequirePermissions('marketing.view')
  async downloadAttachment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Param('uid', ParseIntPipe) uid: number,
    @Param('part') part: string,
    @Query() query: GmailMailboxQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const attachment = await this.gmail.downloadAttachment(tenantId, user.userId, uid, part, query.folder);
    response.setHeader('Content-Type', attachment.contentType);
    response.setHeader('Content-Length', String(attachment.content.length));
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    );
    response.send(attachment.content);
  }

  @Get('templates')
  @RequirePermissions('marketing.view')
  listTemplates(@CurrentTenant() tenantId: string, @Query() query: GmailTemplatesQueryDto) {
    return this.gmail.listTemplates(tenantId, query.page, query.limit);
  }

  @Post('templates')
  @RequirePermissions('marketing.manage')
  createTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Body() body: GmailTemplateDto,
  ) {
    return this.gmail.createTemplate(tenantId, user, body);
  }

  @Put('templates/:id')
  @RequirePermissions('marketing.manage')
  updateTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GmailTemplateDto,
  ) {
    return this.gmail.updateTemplate(tenantId, user, id, body);
  }

  @Delete('templates/:id')
  @RequirePermissions('marketing.manage')
  deleteTemplate(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: AuthenticatedTenantUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gmail.deleteTemplate(tenantId, user, id);
  }
}
