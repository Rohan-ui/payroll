import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { EmailSuppressionService } from './email-suppression.service';

/**
 * The unsubscribe link in every sequence email: no sign-in, only the random
 * token of that one email (the database holds its hash). GET shows what it
 * would do and changes nothing, so link scanners can't unsubscribe anyone;
 * POST unsubscribes, from the page or as a one-click unsubscribe by the
 * recipient's mail app (RFC 8058: "List-Unsubscribe=One-Click"). The body is
 * not checked: whatever a mail app posts, the unsubscribe happens.
 */
@Controller('public/email/unsubscribe')
export class PublicUnsubscribeController {
  constructor(private readonly suppressions: EmailSuppressionService) {}

  @Get(':token')
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  async view(@Param('token') token: string, @Req() req: Request) {
    return { success: true, data: await this.suppressions.unsubscribeView(token, req.headers.host) };
  }

  @Post(':token')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  @Header('Cache-Control', 'no-store')
  async unsubscribe(@Param('token') token: string, @Req() req: Request) {
    const body = req.body as Record<string, unknown> | undefined;
    const source = body && body['List-Unsubscribe'] === 'One-Click' ? 'ONE_CLICK' : 'LINK';
    return { success: true, data: await this.suppressions.unsubscribe(token, req.headers.host, source), message: 'Unsubscribed' };
  }
}
