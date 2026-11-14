import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WebhookChallengeQueryDto {
  @IsOptional()
  @IsString()
  'hub.mode'?: string;

  @IsOptional()
  @IsString()
  'hub.challenge'?: string;

  @IsOptional()
  @IsString()
  'hub.verify_token'?: string;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  challenge?: string;
}

export interface WhatsAppWebhookStatusItem {
  id: string; // wamid
  status: 'sent' | 'delivered' | 'read' | 'failed' | string;
  timestamp: string | number;
  recipient_id?: string;
  conversation?: {
    id: string;
    origin?: { type: string };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: { details: string };
  }>;
}

export interface WhatsAppWebhookMessageItem {
  from: string;
  id: string;
  timestamp: string | number;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'interactive' | 'button' | string;
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  button?: { text: string; payload?: string };
}
