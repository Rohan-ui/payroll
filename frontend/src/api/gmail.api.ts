import { apiClient, apiFetch, ApiError } from './client';

export interface GmailAddress {
  name: string;
  email: string;
}

export interface GmailConnectionStatus {
  connected: boolean;
  email: string | null;
  status: 'PENDING' | 'CONNECTED' | 'OAUTH_FAILED' | 'REAUTH_REQUIRED' | 'DISCONNECTED';
  connectedAt: string | null;
  requiresReconnect: boolean;
}

export interface GmailInboxMessage {
  id: string;
  uid: number;
  from: GmailAddress;
  to: GmailAddress[];
  subject: string;
  date: string | null;
  preview: string;
  isRead: boolean;
  hasAttachments: boolean;
}

export interface GmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface GmailMessage extends Omit<GmailInboxMessage, 'preview' | 'hasAttachments'> {
  to: GmailAddress[];
  cc: GmailAddress[];
  plainText: string | null;
  html: string | null;
  attachments: GmailAttachment[];
}

export interface GmailInboxPage {
  items: GmailInboxMessage[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface GmailTemplate {
  id: string;
  title: string;
  category: string;
  subject: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface GmailTemplateInput {
  title: string;
  category: string;
  subject: string;
  description?: string;
  body: string;
}

export interface GmailTemplatePage {
  items: GmailTemplate[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface GmailSendInput {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
}

export type GmailFolder = 'inbox' | 'sent';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export const gmailApi = {
  status: () => apiClient.get<GmailConnectionStatus>('/gmail/status'),
  connect: () => apiClient.post<{ authorizationUrl: string }>('/gmail/connect'),
  disconnect: () => apiClient.delete<{ success: true }>('/gmail/connection'),
  listMessages: (folder: GmailFolder, page = 1, limit = 25) =>
    apiClient.get<GmailInboxPage>(`/gmail/messages?folder=${folder}&page=${page}&limit=${limit}`),
  getMessage: (folder: GmailFolder, uid: number) => apiClient.get<GmailMessage>(`/gmail/messages/${uid}?folder=${folder}`),
  sendMessage: (body: GmailSendInput) => apiClient.post<{ success: true; messageId: string }>('/gmail/messages/send', body),
  reply: (uid: number, text: string, replyAll = false) =>
    apiClient.post<{ success: true; messageId: string }>(`/gmail/messages/${uid}/reply`, { text, replyAll }),
  listTemplates: (page = 1, limit = 100) => apiClient.get<GmailTemplatePage>(`/gmail/templates?page=${page}&limit=${limit}`),
  createTemplate: (body: GmailTemplateInput) => apiClient.post<GmailTemplate>('/gmail/templates', body),
  updateTemplate: (id: string, body: GmailTemplateInput) => apiClient.put<GmailTemplate>(`/gmail/templates/${id}`, body),
  deleteTemplate: (id: string) => apiClient.delete<{ success: true }>(`/gmail/templates/${id}`),
  async downloadAttachment(folder: GmailFolder, uid: number, attachment: GmailAttachment): Promise<void> {
    const response = await apiFetch(
      `${API_BASE_URL}/gmail/messages/${uid}/attachments/${encodeURIComponent(attachment.id)}?folder=${folder}`,
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new ApiError(payload?.message || 'The attachment could not be downloaded.', response.status, payload);
    }

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = attachment.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
