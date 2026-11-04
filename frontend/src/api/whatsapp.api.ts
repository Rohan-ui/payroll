import { apiClient } from './client';

export interface CrmMessageTemplate {
  id: string;
  tenant_id: string;
  template_code: string;
  template_name: string;
  category: string;
  channel: string;
  message_body: string;
  detected_variables: string[];
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rndtechnosoft_crm_whatsapp_mappings?: {
    id: string;
    whatsapp_template_name: string;
    whatsapp_template_language: string;
    is_active: boolean;
    updated_at: string;
  }[];
}

export interface WhatsAppTemplateMapping {
  id: string;
  tenant_id: string;
  crm_template_id: string;
  whatsapp_template_name: string;
  whatsapp_template_language: string;
  whatsapp_config_id: string | null;
  body_mapping: Record<string, string>;
  header_mapping: Record<string, string> | null;
  media_type: 'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null;
  media_mapping: Record<string, string> | null;
  button_mapping: Record<string, string> | null;
  sample_preview_values: Record<string, string> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  rndtechnosoft_crm_message_templates?: {
    id: string;
    template_code: string;
    template_name: string;
    category: string;
    message_body: string;
    detected_variables: string[];
  };
}

export interface WhatsAppProviderConfig {
  id?: string;
  is_configured: boolean;
  account_name: string;
  api_base_url: string;
  vendor_uid: string;
  bearer_token_masked?: string;
  from_phone_number_id?: string;
  is_active: boolean;
  updated_at?: string;
}

export interface WhatsAppProviderTemplate {
  id: string;
  name: string;
  language: string;
  status: string;
  category?: string;
  body_text?: string;
  header_type?: string;
  buttons_count?: number;
}

export interface WhatsAppMessageLog {
  id: string;
  tenant_id: string;
  crm_template_id?: string | null;
  whatsapp_mapping_id?: string | null;
  lead_id?: string | null;
  client_id?: string | null;
  recipient_phone: string;
  template_name: string;
  template_language: string;
  resolved_variables: Record<string, any>;
  payload_sent: Record<string, any>;
  provider_response: any;
  provider_message_id: string | null;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  error_message: string | null;
  created_at: string;
  updated_at: string;
  rndtechnosoft_crm_message_templates?: {
    template_name: string;
    template_code: string;
  };
  rndtechnosoft_crm_leads?: {
    id: string;
    company_name: string;
    first_name: string | null;
    last_name: string | null;
    lead_code: string;
  };
}

export interface SendWhatsAppTemplateInput {
  template_id: string;
  recipient: string;
  variables?: Record<string, any>;
  lead_id?: string;
  client_id?: string;
  header_image?: string;
  header_video?: string;
  header_document?: string;
  header_document_name?: string;
  button_0?: string;
  button_1?: string;
  copy_code?: string;
}

export interface PreviewMappingInput {
  crm_template_id?: string;
  template_code?: string;
  whatsapp_template_name?: string;
  whatsapp_template_language?: string;
  body_mapping?: Record<string, string>;
  header_mapping?: Record<string, string>;
  media_type?: string;
  media_mapping?: Record<string, string>;
  button_mapping?: Record<string, string>;
  variables?: Record<string, any>;
  recipient?: string;
  lead_id?: string;
}

export const whatsAppApi = {
  // CRM Message Templates
  listCrmTemplates: () =>
    apiClient.get<{ success: boolean; data: CrmMessageTemplate[] }>('/crm/whatsapp/templates'),

  getCrmTemplate: (id: string) =>
    apiClient.get<{ success: boolean; data: CrmMessageTemplate }>(`/crm/whatsapp/templates/${id}`),

  createCrmTemplate: (data: Partial<CrmMessageTemplate>) =>
    apiClient.post<{ success: boolean; data: CrmMessageTemplate; message: string }>('/crm/whatsapp/templates', data),

  updateCrmTemplate: (id: string, data: Partial<CrmMessageTemplate>) =>
    apiClient.put<{ success: boolean; data: CrmMessageTemplate; message: string }>(`/crm/whatsapp/templates/${id}`, data),

  deleteCrmTemplate: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/crm/whatsapp/templates/${id}`),

  // Provider Templates & Config
  listProviderTemplates: (search?: string) =>
    apiClient.get<{ success: boolean; data: WhatsAppProviderTemplate[] }>(
      `/crm/whatsapp/provider-templates${search ? `?search=${encodeURIComponent(search)}` : ''}`
    ),

  getConfig: () =>
    apiClient.get<{ success: boolean; data: WhatsAppProviderConfig }>('/crm/whatsapp/config'),

  saveConfig: (data: Partial<WhatsAppProviderConfig> & { bearer_token?: string }) =>
    apiClient.post<{ success: boolean; data: any; message: string }>('/crm/whatsapp/config', data),

  testConnection: (data?: Partial<WhatsAppProviderConfig> & { bearer_token?: string }) =>
    apiClient.post<{ success: boolean; connected: boolean; templateCount?: number; message: string }>(
      '/crm/whatsapp/config/test',
      data || {}
    ),

  // Template Mappings
  listMappings: () =>
    apiClient.get<{ success: boolean; data: WhatsAppTemplateMapping[] }>('/crm/whatsapp/mappings'),

  getMapping: (id: string) =>
    apiClient.get<{ success: boolean; data: WhatsAppTemplateMapping }>(`/crm/whatsapp/mappings/${id}`),

  getMappingByCrm: (crmTemplateId: string) =>
    apiClient.get<{ success: boolean; data: WhatsAppTemplateMapping | null }>(`/crm/whatsapp/mappings/crm/${crmTemplateId}`),

  saveMapping: (data: any) =>
    apiClient.post<{ success: boolean; data: WhatsAppTemplateMapping; message: string }>('/crm/whatsapp/mappings', data),

  updateMapping: (id: string, data: any) =>
    apiClient.put<{ success: boolean; data: WhatsAppTemplateMapping; message: string }>(`/crm/whatsapp/mappings/${id}`, data),

  deleteMapping: (id: string) =>
    apiClient.delete<{ success: boolean; message: string }>(`/crm/whatsapp/mappings/${id}`),

  previewMapping: (data: PreviewMappingInput) =>
    apiClient.post<{
      success: boolean;
      data: {
        crmMessage: string;
        resolvedVariables: Record<string, string>;
        missingVariables: string[];
        providerPayload: Record<string, any>;
      };
    }>('/crm/whatsapp/mappings/preview', data),

  // Dynamic Sending
  sendMessage: (data: SendWhatsAppTemplateInput) =>
    apiClient.post<{
      success: boolean;
      data: {
        status: string;
        messageId?: string;
        logId: string;
        recipient: string;
        templateName: string;
        resolvedVariables: Record<string, string>;
        missingVariables?: string[];
        payloadSent: Record<string, any>;
        providerResponse: any;
      };
      message: string;
    }>('/crm/whatsapp/send', data),

  // Logs & Status Tracking
  listLogs: (params?: { page?: number; limit?: number; status?: string; search?: string; leadId?: string }) => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set('page', String(params.page));
    if (params?.limit) sp.set('limit', String(params.limit));
    if (params?.status && params.status !== 'ALL') sp.set('status', params.status);
    if (params?.search) sp.set('search', params.search);
    if (params?.leadId) sp.set('leadId', params.leadId);
    return apiClient.get<{
      success: boolean;
      data: {
        rows: WhatsAppMessageLog[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      };
    }>(`/crm/whatsapp/logs?${sp.toString()}`);
  },

  getLog: (id: string) =>
    apiClient.get<{ success: boolean; data: WhatsAppMessageLog }>(`/crm/whatsapp/logs/${id}`),

  refreshLogStatus: (id: string) =>
    apiClient.post<{ success: boolean; data: WhatsAppMessageLog; message: string }>(`/crm/whatsapp/logs/${id}/status`, {}),
};

