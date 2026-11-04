import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCrmTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'Template code is required (e.g. crm_order_dispatch).' })
  @MaxLength(80)
  template_code!: string;

  @IsString()
  @IsNotEmpty({ message: 'Template name is required.' })
  @MaxLength(160)
  template_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  @IsIn(['WHATSAPP', 'SMS', 'EMAIL', 'ALL'])
  channel?: string;

  @IsString()
  @IsNotEmpty({ message: 'Message body is required.' })
  message_body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateCrmTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  template_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsString()
  message_body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class SaveWhatsAppConfigDto {
  @IsString()
  @IsNotEmpty({ message: 'Account name is required.' })
  @MaxLength(120)
  account_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  api_base_url?: string;

  @IsString()
  @IsNotEmpty({ message: 'Vendor UID is required.' })
  @MaxLength(120)
  vendor_uid!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  bearer_token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  from_phone_number_id?: string;

  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}

export class CreateWhatsAppMappingDto {
  @IsUUID('all', { message: 'A valid CRM template ID is required.' })
  crm_template_id!: string;

  @IsString()
  @IsNotEmpty({ message: 'WhatsApp template name is required.' })
  @MaxLength(160)
  whatsapp_template_name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsapp_template_language?: string;

  @IsOptional()
  @IsUUID()
  whatsapp_config_id?: string;

  @IsOptional()
  @IsObject()
  body_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  header_mapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  @IsIn(['NONE', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  media_type?: string;

  @IsOptional()
  @IsObject()
  media_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  button_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  sample_preview_values?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateWhatsAppMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  whatsapp_template_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  whatsapp_template_language?: string;

  @IsOptional()
  @IsUUID()
  whatsapp_config_id?: string;

  @IsOptional()
  @IsObject()
  body_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  header_mapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  @IsIn(['NONE', 'IMAGE', 'VIDEO', 'DOCUMENT'])
  media_type?: string;

  @IsOptional()
  @IsObject()
  media_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  button_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  sample_preview_values?: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class PreviewTemplateDto {
  @IsOptional()
  @IsString()
  crm_template_id?: string;

  @IsOptional()
  @IsString()
  template_code?: string;

  @IsOptional()
  @IsString()
  whatsapp_template_name?: string;

  @IsOptional()
  @IsString()
  whatsapp_template_language?: string;

  @IsOptional()
  @IsObject()
  body_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  header_mapping?: Record<string, string>;

  @IsOptional()
  @IsString()
  media_type?: string;

  @IsOptional()
  @IsObject()
  media_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  button_mapping?: Record<string, string>;

  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  @IsOptional()
  @IsString()
  recipient?: string;

  @IsOptional()
  @IsUUID()
  lead_id?: string;
}

export class SendWhatsAppTemplateMessageDto {
  /** Internal CRM template ID (UUID) or template_code (e.g. crm_order_dispatch) */
  @IsString()
  @IsNotEmpty({ message: 'Provide template_id or template_code.' })
  template_id!: string;

  /** Recipient phone number (digits with country code, e.g. 919876543210) */
  @IsString()
  @IsNotEmpty({ message: 'Recipient phone number is required.' })
  recipient!: string;

  /** Dynamic key-value variables passed by caller to interpolate CRM variables */
  @IsOptional()
  @IsObject()
  variables?: Record<string, any>;

  /** Optional lead association for CRM tracking */
  @IsOptional()
  @IsUUID()
  lead_id?: string;

  /** Optional client association */
  @IsOptional()
  @IsUUID()
  client_id?: string;

  /** Optional overrides for header media */
  @IsOptional()
  @IsString()
  header_image?: string;

  @IsOptional()
  @IsString()
  header_video?: string;

  @IsOptional()
  @IsString()
  header_document?: string;

  @IsOptional()
  @IsString()
  header_document_name?: string;

  /** Optional button overrides */
  @IsOptional()
  @IsString()
  button_0?: string;

  @IsOptional()
  @IsString()
  button_1?: string;

  @IsOptional()
  @IsString()
  copy_code?: string;
}

