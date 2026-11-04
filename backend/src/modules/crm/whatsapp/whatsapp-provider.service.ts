import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

export interface WhatsAppProviderCredentials {
  apiBaseUrl?: string | null;
  vendorUid: string;
  bearerToken: string;
  fromPhoneNumberId?: string | null;
}

export interface SendTemplateMessagePayload {
  from_phone_number_id?: string;
  phone_number: string;
  template_name: string;
  template_language: string;
  header_image?: string;
  header_video?: string;
  header_document?: string;
  header_document_name?: string;
  header_field_1?: string;
  location_latitude?: string;
  location_longitude?: string;
  location_name?: string;
  location_address?: string;
  field_1?: string;
  field_2?: string;
  field_3?: string;
  field_4?: string;
  field_5?: string;
  field_6?: string;
  field_7?: string;
  field_8?: string;
  field_9?: string;
  field_10?: string;
  button_0?: string;
  button_1?: string;
  copy_code?: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    country?: string;
    language_code?: string;
    groups?: string;
  };
  [key: string]: any;
}

export interface WhatsAppProviderSendResult {
  success: boolean;
  messageId?: string;
  rawResponse: any;
  error?: string;
}

export interface ProviderTemplateItem {
  id?: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  components?: any[];
  body_text?: string;
  header_type?: string;
  buttons_count?: number;
}

@Injectable()
export class WhatsAppProviderService {
  private readonly logger = new Logger(WhatsAppProviderService.name);

  /**
   * Resolves effective credentials from tenant configuration or system environment defaults.
   */
  resolveCredentials(custom?: Partial<WhatsAppProviderCredentials> | null): WhatsAppProviderCredentials {
    const apiBaseUrl = (custom?.apiBaseUrl || process.env.WHATSAPP_API_BASE_URL || 'https://otomat.in/api').replace(/\/+$/, '');
    const vendorUid = (custom?.vendorUid || process.env.WHATSAPP_VENDOR_UID || '').trim();
    let bearerToken = custom?.bearerToken !== undefined
      ? custom.bearerToken.trim()
      : (process.env.WHATSAPP_BEARER_TOKEN || '').trim();

    // If bearerToken was not specified at all, allow vendorUid as fallback token
    if (!bearerToken && vendorUid && custom?.bearerToken === undefined) {
      bearerToken = vendorUid;
    }
    const fromPhoneNumberId = (custom?.fromPhoneNumberId || process.env.WHATSAPP_DEFAULT_PHONE_NUMBER_ID || '').trim();

    return {
      apiBaseUrl,
      vendorUid,
      bearerToken,
      fromPhoneNumberId: fromPhoneNumberId || undefined,
    };
  }

  /**
   * Helper to construct Otomat endpoint URL with Vendor ID and query token.
   * e.g. https://otomat.in/api/{{vendorUid}}/contact/send-message?token=...
   */
  buildUrl(creds: WhatsAppProviderCredentials, endpointPath: string, queryParams?: Record<string, string>): string {
    const base = (creds.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, '');
    const vendor = encodeURIComponent(creds.vendorUid);
    const cleanPath = endpointPath.replace(/^\/+/, '');
    const params = new URLSearchParams(queryParams || {});
    if (creds.bearerToken && !params.has('token')) {
      params.set('token', creds.bearerToken);
    }
    const qs = params.toString();
    return `${base}/${vendor}/${cleanPath}${qs ? `?${qs}` : ''}`;
  }

  /**
   * Sends an approved template message to a recipient using the external WhatsApp provider API.
   * POST {{apiBaseUrl}}/{{vendorUid}}/contact/send-template-message?token=...
   */
  async sendTemplateMessage(
    payload: SendTemplateMessagePayload,
    credentialsInput?: Partial<WhatsAppProviderCredentials> | null,
  ): Promise<WhatsAppProviderSendResult> {
    const creds = this.resolveCredentials(credentialsInput);

    if (!creds.vendorUid) {
      throw new BadRequestException('WhatsApp Vendor UID is missing in configuration.');
    }
    if (!creds.bearerToken) {
      throw new UnauthorizedException('WhatsApp Bearer Token is missing in configuration.');
    }
    if (!payload.phone_number) {
      throw new BadRequestException('Recipient phone number is required.');
    }
    if (!payload.template_name) {
      throw new BadRequestException('WhatsApp template name is required.');
    }

    const url = this.buildUrl(creds, 'contact/send-template-message');

    const requestBody: Record<string, any> = {
      from_phone_number_id: payload.from_phone_number_id || creds.fromPhoneNumberId || '',
      phone_number: payload.phone_number,
      template_name: payload.template_name,
      template_language: payload.template_language || 'en',
    };

    // Copy optional fields only if they have values
    const optionalKeys = [
      'header_image', 'header_video', 'header_document', 'header_document_name', 'header_field_1',
      'location_latitude', 'location_longitude', 'location_name', 'location_address',
      'button_0', 'button_1', 'copy_code', 'contact'
    ];

    for (const key of optionalKeys) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '') {
        requestBody[key] = payload[key];
      }
    }

    // Dynamic field_1 ... field_N
    for (const key of Object.keys(payload)) {
      if (/^field_\d+$/.test(key) && payload[key] !== undefined && payload[key] !== null) {
        requestBody[key] = String(payload[key]);
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      this.logger.log(`Dispatching WhatsApp template "${payload.template_name}" to ${payload.phone_number}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${creds.bearerToken}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseText = await response.text();
      let responseData: any = {};
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { raw: responseText };
      }

      if (!response.ok) {
        const errorMsg = responseData?.message || responseData?.error || `Provider HTTP ${response.status}: ${response.statusText}`;
        if (response.status === 401) {
          throw new UnauthorizedException(`WhatsApp authentication failed: ${errorMsg}`);
        }
        if (response.status === 400) {
          throw new BadRequestException(`WhatsApp template error: ${errorMsg}`);
        }
        return {
          success: false,
          error: errorMsg,
          rawResponse: responseData,
        };
      }

      // Extract message ID (wamid) defensively from common provider response structures
      const messageId =
        responseData?.message_id ||
        responseData?.data?.message_id ||
        responseData?.data?.messages?.[0]?.id ||
        responseData?.messages?.[0]?.id ||
        responseData?.wamid ||
        responseData?.id ||
        null;

      return {
        success: true,
        messageId: messageId || undefined,
        rawResponse: responseData,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        this.logger.error(`WhatsApp API call timed out after 12s: ${url}`);
        return {
          success: false,
          error: 'External WhatsApp provider request timed out (12s).',
          rawResponse: { error: 'TIMEOUT' },
        };
      }
      this.logger.error(`Failed to send WhatsApp template message: ${err.message}`);
      throw err;
    }
  }

  /**
   * Fetches the list of approved WhatsApp templates from the provider.
   * GET {{apiBaseUrl}}/{{vendorUid}}/contact/template-list
   */
  async getTemplateList(
    credentialsInput?: Partial<WhatsAppProviderCredentials> | null,
    query?: { page?: number; pageSize?: number; searchTerm?: string },
  ): Promise<ProviderTemplateItem[]> {
    const creds = this.resolveCredentials(credentialsInput);

    if (!creds.vendorUid || !creds.bearerToken) {
      return this.getFallbackTemplates();
    }

    const queryParams: Record<string, string> = {
      page_size: String(query?.pageSize || 50),
    };
    if (query?.page) queryParams.page = String(query.page);
    if (query?.searchTerm) queryParams.search_term = query.searchTerm;

    const url = this.buildUrl(creds, 'contact/template-list', queryParams);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${creds.bearerToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`WhatsApp provider returned HTTP ${response.status} when listing templates. Using cached templates.`);
        return this.getFallbackTemplates();
      }

      const data: any = await response.json();
      const rawList = Array.isArray(data?.data) ? data.data : Array.isArray(data?.templates) ? data.templates : Array.isArray(data) ? data : [];

      if (!rawList.length) {
        return this.getFallbackTemplates();
      }

      return rawList.map((item: any) => ({
        id: item.id || item.template_id || item.name,
        name: item.name || item.template_name || '',
        language: item.language || item.template_language || 'en',
        status: item.status || 'APPROVED',
        category: item.category || 'UTILITY',
        body_text: item.body_text || item.message_body || item.components?.find((c: any) => c.type === 'BODY')?.text || '',
        header_type: item.header_type || item.components?.find((c: any) => c.type === 'HEADER')?.format || 'NONE',
        buttons_count: item.buttons_count || (Array.isArray(item.components?.find((c: any) => c.type === 'BUTTONS')?.buttons) ? item.components.find((c: any) => c.type === 'BUTTONS').buttons.length : 0),
      }));
    } catch (err: any) {
      clearTimeout(timeoutId);
      this.logger.warn(`Could not fetch templates from provider: ${err.message}. Returning standard templates.`);
      return this.getFallbackTemplates();
    }
  }

  /**
   * Queries delivery status of a sent message by provider message ID (wamid).
   * GET {{apiBaseUrl}}/{{vendorUid}}/contact/message-status?wamid={{messageId}}
   */
  async getMessageStatus(
    wamid: string,
    credentialsInput?: Partial<WhatsAppProviderCredentials> | null,
  ): Promise<{ status: string; timestamp?: string; raw: any }> {
    const creds = this.resolveCredentials(credentialsInput);

    if (!creds.vendorUid || !creds.bearerToken) {
      return { status: 'SENT', raw: { message: 'Provider config not available for status check' } };
    }

    const url = this.buildUrl(creds, 'contact/message-status', { wamid });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${creds.bearerToken}`,
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { status: 'SENT', raw: { error: `HTTP ${response.status}` } };
      }

      const data: any = await response.json();
      const statusRaw = String(data?.status || data?.data?.status || data?.message_status || 'SENT').toUpperCase();

      let normalized = 'SENT';
      if (['DELIVERED', 'READ', 'FAILED', 'SENT', 'PENDING'].includes(statusRaw)) {
        normalized = statusRaw;
      }

      return {
        status: normalized,
        timestamp: data?.timestamp || data?.data?.timestamp,
        raw: data,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      return { status: 'SENT', raw: { error: err.message } };
    }
  }

  /**
   * Fallback library of standard approved WhatsApp templates when offline or testing without live API keys.
   */
  getFallbackTemplates(): ProviderTemplateItem[] {
    return [
      {
        name: 'rnd_digital_services_outreach',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        body_text: 'Hello {{1}},\n\nI’m {{2}} from RND Technosoft. I came across your company and noticed a few opportunities where your online presence could be made more professional and impactful.\n\nWe would be happy to support your business with our IT and digital solutions.\n\nOur services include:\n\n• Website & App Development\n• SEO & Google Ads\n• Social Media Marketing\n• Branding & Graphic Design\n• IT Solutions & Support\n\nPlease let me know if you have any upcoming requirements where we can assist.\n\nRegards,\n{{3}}\nBDM – RND Technosoft\nWebsite: https://www.rndtechnosoft.com',
        header_type: 'NONE',
        buttons_count: 1,
      },
      {
        name: 'order_dispatch',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        body_text: 'Hello {{1}},\nYour order {{2}} has been dispatched.\nVehicle: {{3}}\nExpected delivery: {{4}}',
        header_type: 'IMAGE',
        buttons_count: 2,
      },
      {
        name: 'lead_welcome_v1',
        language: 'en',
        status: 'APPROVED',
        category: 'MARKETING',
        body_text: 'Hi {{1}},\nWelcome to {{2}}! We received your request regarding {{3}}. Our team will reach out shortly.\nReference ID: {{4}}',
        header_type: 'NONE',
        buttons_count: 1,
      },
      {
        name: 'quotation_ready',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        body_text: 'Dear {{1}},\nYour quotation {{2}} for {{3}} is ready. The total amount is {{4}}. Please find the document attached.',
        header_type: 'DOCUMENT',
        buttons_count: 2,
      },
      {
        name: 'meeting_confirmation',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        body_text: 'Hello {{1}},\nYour meeting "{{2}}" with {{3}} is confirmed for {{4}}.\nMeeting link: {{5}}',
        header_type: 'NONE',
        buttons_count: 1,
      },
      {
        name: 'payment_reminder_v2',
        language: 'en',
        status: 'APPROVED',
        category: 'UTILITY',
        body_text: 'Dear {{1}},\nThis is a friendly reminder that invoice {{2}} of amount {{3}} is due on {{4}}. Kindly proceed with payment.',
        header_type: 'NONE',
        buttons_count: 1,
      },
      {
        name: 'account_setup_template',
        language: 'en_US',
        status: 'APPROVED',
        category: 'AUTHENTICATION',
        body_text: 'Welcome {{1}}! Your account has been created for {{2}}. Click the button below to verify.',
        header_type: 'IMAGE',
        buttons_count: 2,
      },
    ];
  }
}

