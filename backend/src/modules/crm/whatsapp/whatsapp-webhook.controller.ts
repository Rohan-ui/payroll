import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { PublicRoute } from '@/common/decorators/auth.decorators';
import { WebhookChallengeQueryDto } from './dto/whatsapp-webhook.dto';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

/**
 * Public Webhook controller for WhatsApp provider events (Meta Cloud API / Otomat).
 * Supports both challenge verification handshake (GET) and status/incoming event processing (POST).
 */
@Controller(['whatsapp/webhook', 'crm/whatsapp/webhook'])
@PublicRoute()
export class WhatsAppWebhookController {
  constructor(private readonly webhookService: WhatsAppWebhookService) {}

  /**
   * Webhook verification challenge (GET).
   * Meta sends hub.mode, hub.challenge, hub.verify_token.
   * Expects exact challenge echoed back with HTTP 200.
   */
  @Get()
  async verifyChallenge(
    @Query() query: WebhookChallengeQueryDto,
    @Res() res: Response,
  ) {
    const challenge = await this.webhookService.verifyChallenge(query);
    // Meta requires raw text response of the challenge
    res.status(HttpStatus.OK).type('text/plain').send(challenge);
  }

  /**
   * Webhook event delivery (POST).
   * Ingests delivery statuses and incoming customer messages.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature?: string,
  ) {
    const result = await this.webhookService.handleWebhookPayload(payload, signature);
    return {
      success: true,
      data: result,
      message: 'Webhook processed',
    };
  }
}
