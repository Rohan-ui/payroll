import { Module } from '@nestjs/common';
import { PrismaModule } from '@/prisma/prisma.module';
import { WhatsAppTemplateController } from './whatsapp-template.controller';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppProviderService } from './whatsapp-provider.service';
import { WhatsAppVariableResolverService } from './whatsapp-variable-resolver.service';
import { WhatsAppPayloadBuilderService } from './whatsapp-payload-builder.service';
import { WhatsAppTemplateMappingService } from './whatsapp-template-mapping.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppWebhookService } from './whatsapp-webhook.service';

@Module({
  imports: [PrismaModule],
  controllers: [WhatsAppTemplateController, WhatsAppWebhookController],
  providers: [
    WhatsAppProviderService,
    WhatsAppVariableResolverService,
    WhatsAppPayloadBuilderService,
    WhatsAppTemplateMappingService,
    WhatsAppMessagingService,
    WhatsAppWebhookService,
  ],
  exports: [
    WhatsAppMessagingService,
    WhatsAppTemplateMappingService,
    WhatsAppWebhookService,
    WhatsAppProviderService,
    WhatsAppVariableResolverService,
    WhatsAppPayloadBuilderService,
  ],
})
export class WhatsAppModule {}
