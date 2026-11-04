import { BadRequestException, Injectable } from '@nestjs/common';
import { SendTemplateMessagePayload } from './whatsapp-provider.service';

export interface MappingConfig {
  whatsapp_template_name: string;
  whatsapp_template_language?: string;
  body_mapping?: Record<string, string> | null;
  header_mapping?: Record<string, string> | null;
  media_type?: string | null;
  media_mapping?: Record<string, string> | null;
  button_mapping?: Record<string, string> | null;
}

export interface PayloadBuildInput {
  mapping: MappingConfig;
  resolvedVariables: Record<string, string>;
  recipientPhone: string;
  fromPhoneNumberId?: string | null;
  overrides?: {
    header_image?: string;
    header_video?: string;
    header_document?: string;
    header_document_name?: string;
    button_0?: string;
    button_1?: string;
    copy_code?: string;
  };
}

@Injectable()
export class WhatsAppPayloadBuilderService {
  /**
   * Sanitizes phone number by removing spaces, brackets, dashes, leading pluses.
   * Ensures format suitable for international WhatsApp dialing (e.g. 919876543210).
   */
  sanitizePhoneNumber(phone: string): string {
    if (!phone) return '';
    let digits = phone.replace(/[^0-9]/g, '');
    // If user entered 0-prefixed 10-digit number like 09825012345 in India, strip 0 and default 91
    if (digits.startsWith('0') && digits.length === 11) {
      digits = '91' + digits.substring(1);
    } else if (digits.length === 10) {
      // Default to 91 (India) if 10 digits
      digits = '91' + digits;
    }
    return digits;
  }

  /**
   * Builds the external WhatsApp API payload from template mapping and resolved variables.
   */
  buildPayload(input: PayloadBuildInput): SendTemplateMessagePayload {
    const { mapping, resolvedVariables, recipientPhone, fromPhoneNumberId, overrides } = input;

    const sanitizedPhone = this.sanitizePhoneNumber(recipientPhone);
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      throw new BadRequestException(`Invalid recipient phone number "${recipientPhone}". Please provide a valid phone number with country code.`);
    }

    if (!mapping.whatsapp_template_name) {
      throw new BadRequestException('Template mapping must specify an external WhatsApp template name.');
    }

    const payload: SendTemplateMessagePayload = {
      phone_number: sanitizedPhone,
      template_name: mapping.whatsapp_template_name.trim(),
      template_language: (mapping.whatsapp_template_language || 'en').trim(),
    };

    if (fromPhoneNumberId) {
      payload.from_phone_number_id = fromPhoneNumberId.trim();
    }

    // 1. Resolve Body Variables: field_1, field_2, ...
    const bodyMapping = mapping.body_mapping || {};
    for (const [providerField, crmVarName] of Object.entries(bodyMapping)) {
      if (!crmVarName) continue;
      const cleanVar = String(crmVarName).replace(/^\{\{|\}\}$/g, '').trim();
      const val = resolvedVariables[cleanVar] !== undefined ? resolvedVariables[cleanVar] : '';
      payload[providerField] = String(val);
    }

    // 2. Resolve Header Variable: header_field_1
    const headerMapping = mapping.header_mapping || {};
    if (headerMapping.header_field_1) {
      const cleanVar = String(headerMapping.header_field_1).replace(/^\{\{|\}\}$/g, '').trim();
      const val = resolvedVariables[cleanVar] !== undefined ? resolvedVariables[cleanVar] : '';
      payload.header_field_1 = String(val);
    }

    // 3. Resolve Media: header_image, header_video, header_document, header_document_name
    const mediaType = (mapping.media_type || 'NONE').toUpperCase();
    const mediaMapping = mapping.media_mapping || {};

    const resolveMediaField = (fieldKey: string, overrideVal?: string): string => {
      if (overrideVal && overrideVal.trim()) return overrideVal.trim();
      const mapped = mediaMapping[fieldKey];
      if (!mapped) return '';
      // Check if it's a template placeholder {{var}}
      if (/^\{\{([a-zA-Z0-9_\-\.]+)\}\}$/.test(mapped.trim())) {
        const cleanVar = mapped.replace(/^\{\{|\}\}$/g, '').trim();
        return resolvedVariables[cleanVar] || '';
      }
      return mapped.trim();
    };

    if (mediaType === 'IMAGE') {
      const img = resolveMediaField('header_image', overrides?.header_image);
      if (img) payload.header_image = img;
    } else if (mediaType === 'VIDEO') {
      const vid = resolveMediaField('header_video', overrides?.header_video);
      if (vid) payload.header_video = vid;
    } else if (mediaType === 'DOCUMENT') {
      const doc = resolveMediaField('header_document', overrides?.header_document);
      const docName = resolveMediaField('header_document_name', overrides?.header_document_name);
      if (doc) payload.header_document = doc;
      if (docName) payload.header_document_name = docName;
    }

    // 4. Resolve Dynamic Buttons: button_0, button_1, copy_code
    const buttonMapping = mapping.button_mapping || {};

    const resolveButtonField = (btnKey: string, overrideVal?: string): string => {
      if (overrideVal && overrideVal.trim()) return overrideVal.trim();
      const mapped = buttonMapping[btnKey];
      if (!mapped) return '';
      if (/^\{\{([a-zA-Z0-9_\-\.]+)\}\}$/.test(mapped.trim())) {
        const cleanVar = mapped.replace(/^\{\{|\}\}$/g, '').trim();
        return resolvedVariables[cleanVar] || '';
      }
      return mapped.trim();
    };

    const b0 = resolveButtonField('button_0', overrides?.button_0);
    if (b0) payload.button_0 = b0;

    const b1 = resolveButtonField('button_1', overrides?.button_1);
    if (b1) payload.button_1 = b1;

    const code = resolveButtonField('copy_code', overrides?.copy_code);
    if (code) payload.copy_code = code;

    return payload;
  }
}

