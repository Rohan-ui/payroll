/**
 * The candidate's document upload page. There is no session here: the token
 * from the email is the only authorization, sent only to these routes.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface PublicDocumentRequest {
  id: string;
  label: string;
  isRequired: boolean;
  state: 'MISSING' | 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  canUpload: boolean;
  lastFilename: string | null;
  lastUploadedAt: string | null;
  rejectionReason: string | null;
}

export interface PublicDocuments {
  companyName: string;
  candidateName: string;
  linkExpiresAt: string | null;
  maxFileBytes: number;
  requests: PublicDocumentRequest[];
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/public/candidate-documents/${path}`, { ...init, credentials: 'omit' });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 413 ? 'The file is larger than 10 MB. Upload a smaller copy.' : body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'Something went wrong. Try again.');
  }
  return body.data as T;
}

export const publicDocumentsApi = {
  view: (token: string) => call<PublicDocuments>(encodeURIComponent(token)),
  upload: (token: string, requestId: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return call<PublicDocuments>(`${encodeURIComponent(token)}/requests/${encodeURIComponent(requestId)}/file`, { method: 'POST', body: form });
  },
};
