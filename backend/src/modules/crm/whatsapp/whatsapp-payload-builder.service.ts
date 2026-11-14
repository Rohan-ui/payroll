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
  defaultCountryCode?: string;
  fromPhoneNumberId?: string | null;
  contact?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    country?: string;
    language_code?: string;
    groups?: string;
    custom_fields?: Record<string, any>;
  };
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
   * Sanitizes phone number by removing spaces, brackets, dashes.
   * Supports full international E.164 numbers (starting with +).
   * Only prepends defaultCountryCode when the number lacks an international prefix.
   */
  sanitizePhoneNumber(phone: string, defaultCountryCode = '91'): string {
    if (!phone) return '';
    const trimmed = phone.trim();

    // If starts with +, it already has an international dial code
    if (trimmed.startsWith('+')) {
      return trimmed.replace(/[^0-9]/g, '');
    }

    // Strip leading 00 international prefix
    let digits = trimmed.replace(/[^0-9]/g, '');
    if (digits.startsWith('00') && digits.length > 11) {
      return digits.substring(2);
    }

    const cleanDefaultCode = defaultCountryCode.replace(/[^0-9]/g, '') || '91';

    // 10-digit number without country code (e.g. 9825012345)
    if (digits.length === 10) {
      return cleanDefaultCode + digits;
    }

    // 11-digit number with local leading 0 (e.g. 09825012345 in India or UK)
    if (digits.length === 11 && digits.startsWith('0')) {
      return cleanDefaultCode + digits.substring(1);
    }

    return digits;
  }

  /**
   * WhatsApp rejects a template whose parameter holds a new line, a tab or more
   * than four spaces in a row, so a lead's multi-line address or note would fail
   * the whole message. Collapses them to single spaces.
   */
  sanitizeTemplateParam(value: string): string {
    return value.replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  }

  /**
   * Helper to resolve variable from map case-insensitively.
   */
  private getResolvedValue(key: string, resolvedVariables: Record<string, string>): string | undefined {
    if (!key) return undefined;
    const cleanKey = key.replace(/^\{\{|\}\}$/g, '').trim();
    if (resolvedVariables[cleanKey] !== undefined) {
      return resolvedVariables[cleanKey];
    }
    const norm = cleanKey.toLowerCase().replace(/[\-_]/g, '');
    for (const [k, v] of Object.entries(resolvedVariables)) {
      if (k.toLowerCase().replace(/[\-_]/g, '') === norm) {
        return v;
      }
    }
    return undefined;
  }

  /**
   * Builds the external WhatsApp API payload from template mapping and resolved variables.
   */
  buildPayload(input: PayloadBuildInput): SendTemplateMessagePayload {
    const { mapping, resolvedVariables, recipientPhone, defaultCountryCode, fromPhoneNumberId, contact, overrides } = input;

    const sanitizedPhone = this.sanitizePhoneNumber(recipientPhone, defaultCountryCode);
    if (!sanitizedPhone || sanitizedPhone.length < 10) {
      throw new BadRequestException(`Invalid recipient phone number "${recipientPhone}". Please provide a valid phone number with country code.`);
    }

    if (!mapping.whatsapp_template_name || !mapping.whatsapp_template_name.trim()) {
      throw new BadRequestException('Template mapping must specify an external WhatsApp template name.');
    }

    const payload: SendTemplateMessagePayload = {
      phone_number: sanitizedPhone,
      template_name: mapping.whatsapp_template_name.trim(),
      template_language: (mapping.whatsapp_template_language || 'en').trim(),
    };

    if (fromPhoneNumberId && fromPhoneNumberId.trim()) {
      payload.from_phone_number_id = fromPhoneNumberId.trim();
    }

    if (contact && typeof contact === 'object') {
      payload.contact = contact;
    }

    // 1. Resolve Body Variables: field_1, field_2, ...
    const bodyMapping = mapping.body_mapping || {};
    for (const [providerField, crmVarName] of Object.entries(bodyMapping)) {
      if (!crmVarName) continue;
      const val = this.getResolvedValue(crmVarName, resolvedVariables);
      if (val !== undefined && val !== null && val.trim() !== '') {
        payload[providerField] = this.sanitizeTemplateParam(val);
      } else {
        // If unresolved, log warning or leave empty
        payload[providerField] = '';
      }
    }

    // 2. Resolve Header Variable: header_field_1
    const headerMapping = mapping.header_mapping || {};
    if (headerMapping.header_field_1) {
      const val = this.getResolvedValue(headerMapping.header_field_1, resolvedVariables);
      if (val !== undefined && val !== null && val.trim() !== '') {
        payload.header_field_1 = this.sanitizeTemplateParam(val);
      }
    }

    // 3. Resolve Media: header_image, header_video, header_document, header_document_name
    const mediaType = (mapping.media_type || 'NONE').toUpperCase();
    const mediaMapping = mapping.media_mapping || {};

    const resolveMediaField = (fieldKey: string, overrideVal?: string): string => {
      if (overrideVal && overrideVal.trim()) return overrideVal.trim();
      const mapped = mediaMapping[fieldKey];
      if (!mapped || !mapped.trim()) return '';

      const raw = mapped.trim();
      // Check if it resolves from a variable (supports both bare 'invoice_url' and '{{invoice_url}}')
      const resolved = this.getResolvedValue(raw, resolvedVariables);
      if (resolved && resolved.trim()) {
        return resolved.trim();
      }

      // If mapped value is already a static URL, return it
      if (/^https?:\/\//i.test(raw)) {
        return raw;
      }

      // If it cannot be resolved and is not a URL, return empty string so invalid variable names aren't dispatched
      return '';
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
      if (!mapped || !mapped.trim()) return '';

      const raw = mapped.trim();
      const resolved = this.getResolvedValue(raw, resolvedVariables);
      if (resolved && resolved.trim()) {
        return resolved.trim();
      }

      // If not a variable, treat as static button payload/url
      return raw;
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
