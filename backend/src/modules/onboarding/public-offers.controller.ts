import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { OffersService, ResponseMeta } from './offers.service';
import { AcceptOfferDto, DeclineOfferDto } from './dto/onboarding.dto';
import { fileResponse } from './file-response';

const metaOf = (req: Request): ResponseMeta => ({
  host: req.headers.host,
  ip: req.ip,
  userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
});

/**
 * The candidate's offer link: no sign-in, only the one-time token emailed to
 * them. It shows that one offer's terms and letter and records their answer;
 * a link answers only on its own workspace's address and while HRMS is on.
 */
@Controller('public/offers')
export class PublicOffersController {
  constructor(private readonly offers: OffersService) {}

  @Get(':token')
  @PublicRoute()
  async view(@Param('token') token: string, @Req() req: Request) {
    return { success: true, data: await this.offers.publicView(token, metaOf(req)) };
  }

  /** The letter as sent: shown in the page, or saved when ?download=1. */
  @Get(':token/pdf')
  @PublicRoute()
  @Header('Cache-Control', 'private, no-store')
  async pdf(@Param('token') token: string, @Req() req: Request, @Query('download') download?: string) {
    const file = await this.offers.publicPdf(token, metaOf(req));
    return fileResponse(file.bytes, 'application/pdf', file.filename, download);
  }

  @Post(':token/accept')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  async accept(@Param('token') token: string, @Body() body: AcceptOfferDto, @Req() req: Request) {
    return { success: true, data: await this.offers.accept(token, body.typedName, metaOf(req)), message: 'Offer accepted' };
  }

  @Post(':token/decline')
  @HttpCode(HttpStatus.OK)
  @PublicRoute()
  async decline(@Param('token') token: string, @Body() body: DeclineOfferDto, @Req() req: Request) {
    return { success: true, data: await this.offers.decline(token, body.reason, metaOf(req)), message: 'Offer declined' };
  }
}
