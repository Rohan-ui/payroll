import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';

export interface WhatsAppProviderCredentials {
  apiBaseUrl?: string | null;
  vendorUid: string;
  bearerToken: string;
  fromPhoneNumberId?: string | null;
  provider?: string | null;
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
    custom_fields?: Record<string, any>;
  };
  [key: string]: any;
}

export interface SendTextMessagePayload {
  from_phone_number_id?: string;
  phone_number: string;
  message_body: string;
  contact?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    country?: string;
    language_code?: string;
    groups?: string;
    custom_fields?: Record<string, any>;
  };
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
   * Resolves effective credentials from tenant-specific configuration.
   * Multi-tenant safety: Never falls back to global environment variables.
   */
  resolveCredentials(custom?: Partial<WhatsAppProviderCredentials> | null): WhatsAppProviderCredentials {
    const apiBaseUrl = (custom?.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, '');
    const vendorUid = (custom?.vendorUid || '').trim();
    const bearerToken = (custom?.bearerToken || '').trim();
    const fromPhoneNumberId = (custom?.fromPhoneNumberId || '').trim();
    const provider = (custom?.provider || 'OTOMAT').trim();

    return {
      apiBaseUrl,
      vendorUid,
      bearerToken,
      fromPhoneNumberId: fromPhoneNumberId || undefined,
      provider,
    };
  }

  /**
   * Constructs the API endpoint URL without leaking authentication tokens in query strings.
   * Authentication is exclusively sent in the HTTP Authorization header.
   */
  buildUrl(creds: WhatsAppProviderCredentials, endpointPath: string, queryParams?: Record<string, string>): string {
    const base = (creds.apiBaseUrl || 'https://otomat.in/api').replace(/\/+$/, '');
    const vendor = encodeURIComponent(creds.vendorUid);
    const cleanPath = endpointPath.replace(/^\/+/, '');
    const params = new URLSearchParams(queryParams || {});
    // Notice: Bearer token is NEVER appended to the URL query string.
    const qs = params.toString();
    return `${base}/${vendor}/${cleanPath}${qs ? `?${qs}` : ''}`;
  }

  /**
   * Sends an approved template message to a recipient using the external WhatsApp provider API.
   * POST {{apiBaseUrl}}/{{vendorUid}}/contact/send-template-message
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
      if (/^field_\d+$/.test(key) && payload[key] !== undefined && payload[key] !== null && String(payload[key]).trim() !== '') {
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
          'Accept': 'application/json',
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

      if (this.isRejected(responseData)) {
        const errorMsg = responseData?.message || responseData?.error || 'Provider rejected template dispatch';
        return {
          success: false,
          error: errorMsg,
          rawResponse: responseData,
        };
      }

      return {
        success: true,
        messageId: this.messageIdOf(responseData),
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
   * Sends a free-form / text message to a recipient (Postman: contact/send-message).
   * Applicable within 24h customer window or for transactional notifications.
   * POST {{apiBaseUrl}}/{{vendorUid}}/contact/send-message
   */
  async sendMessage(
    payload: SendTextMessagePayload,
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
    if (!payload.message_body || !payload.message_body.trim()) {
      throw new BadRequestException('Message content is required.');
    }

    const url = this.buildUrl(creds, 'contact/send-message');

    const requestBody: Record<string, any> = {
      from_phone_number_id: payload.from_phone_number_id || creds.fromPhoneNumberId || '',
      phone_number: payload.phone_number,
      message_body: payload.message_body.trim(),
    };

    if (payload.contact && typeof payload.contact === 'object') {
      requestBody.contact = payload.contact;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      this.logger.log(`Dispatching WhatsApp text message to ${payload.phone_number}`);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${creds.bearerToken}`,
          'Accept': 'application/json',
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
        return {
          success: false,
          error: errorMsg,
          rawResponse: responseData,
        };
      }

      if (this.isRejected(responseData)) {
        const errorMsg = responseData?.message || responseData?.error || 'Provider rejected message dispatch';
        return {
          success: false,
          error: errorMsg,
          rawResponse: responseData,
        };
      }

      return {
        success: true,
        messageId: this.messageIdOf(responseData),
        rawResponse: responseData,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: 'External WhatsApp provider request timed out (12s).',
          rawResponse: { error: 'TIMEOUT' },
        };
      }
      throw err;
    }
  }

  /**
   * The provider answers HTTP 200 even when it refuses a message, and says so in
   * the body: `{ result: 'failed', message }` (other shapes: status 'error', success false).
   */
  private isRejected(responseData: any): boolean {
    return (
      responseData?.result === 'failed' ||
      responseData?.result === 'error' ||
      responseData?.status === 'error' ||
      responseData?.success === false
    );
  }

  /** The WhatsApp message id (wamid), needed to match delivery updates; the provider returns it at `data.wamid`. */
  private messageIdOf(responseData: any): string | undefined {
    return (
      responseData?.data?.wamid ||
      responseData?.message_id ||
      responseData?.data?.message_id ||
      responseData?.data?.messages?.[0]?.id ||
      responseData?.messages?.[0]?.id ||
      responseData?.wamid ||
      responseData?.id ||
      undefined
    );
  }

  /**
   * Fetches the real list of approved WhatsApp templates from the external provider.
   * GET {{apiBaseUrl}}/{{vendorUid}}/contact/template-list
   * Notice: All mock template fallbacks removed. Surfaces true provider errors.
   */
  async getTemplateList(
    credentialsInput?: Partial<WhatsAppProviderCredentials> | null,
    query?: { page?: number; pageSize?: number; searchTerm?: string },
  ): Promise<ProviderTemplateItem[]> {
    const creds = this.resolveCredentials(credentialsInput);

    if (!creds.vendorUid || !creds.bearerToken) {
      throw new BadRequestException('WhatsApp API credentials are missing. Please configure your Vendor UID and Bearer Token in Gateway Settings.');
    }

    const queryParams: Record<string, string> = {
      page_size: String(query?.pageSize || 100),
    };
    if (query?.page) queryParams.page = String(query.page);
    if (query?.searchTerm) queryParams.search_term = query.searchTerm;

    const url = this.buildUrl(creds, 'contact/template-list', queryParams);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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

      const responseText = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { raw: responseText };
      }

      if (!response.ok || this.isRejected(data)) {
        const errorMsg = data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`;
        this.logger.error(`Failed to fetch templates from provider: ${errorMsg}`);
        throw new BadRequestException(`WhatsApp provider rejected template fetch: ${errorMsg}`);
      }

      // Otomat answers `{ result, data: { templateList: { data: [...], current_page, last_page, total } } }`.
      // shortcut: reads only the first page (page_size, default 100); loop over last_page if an account ever holds more.
      const rawList = Array.isArray(data?.data?.templateList?.data)
        ? data.data.templateList.data
        : Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.templates)
        ? data.templates
        : Array.isArray(data)
        ? data
        : [];

      return rawList.map((item: any) => {
        const components = Array.isArray(item.components) ? item.components : [];
        const bodyComp = components.find((c: any) => c.type === 'BODY' || c.type === 'body');
        const headerComp = components.find((c: any) => c.type === 'HEADER' || c.type === 'header');
        const buttonsComp = components.find((c: any) => c.type === 'BUTTONS' || c.type === 'buttons');

        return {
          id: item.id || item.template_id || item.name,
          name: item.name || item.template_name || '',
          language: item.language || item.template_language || 'en',
          status: (item.status || 'APPROVED').toUpperCase(),
          category: item.category || 'UTILITY',
          body_text: item.body_text || item.message_body || bodyComp?.text || '',
          header_type: item.header_type || headerComp?.format || 'NONE',
          buttons_count: item.buttons_count || (Array.isArray(buttonsComp?.buttons) ? buttonsComp.buttons.length : 0),
          components,
        };
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err instanceof BadRequestException || err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.error(`Could not reach WhatsApp provider: ${err.message}`);
      throw new BadRequestException(`Could not connect to WhatsApp provider: ${err.message}`);
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
      return { status: 'PENDING', raw: { message: 'Provider credentials not configured' } };
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
   * Tests the connection to the external provider API with given credentials.
   */
  async testConnection(
    credentialsInput: WhatsAppProviderCredentials,
  ): Promise<{ success: boolean; connected: boolean; templateCount?: number; message: string }> {
    const creds = this.resolveCredentials(credentialsInput);

    if (!creds.vendorUid) {
      return { success: false, connected: false, message: 'Vendor UID is required.' };
    }
    if (!creds.bearerToken) {
      return { success: false, connected: false, message: 'Bearer Token is required.' };
    }

    try {
      const templates = await this.getTemplateList(creds, { pageSize: 5 });
      return {
        success: true,
        connected: true,
        templateCount: templates.length,
        message: `Connection successful. Provider returned ${templates.length} template(s).`,
      };
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        message: err.message || 'Failed to connect to external WhatsApp API.',
      };
    }
  }
}
