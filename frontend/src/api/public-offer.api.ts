/**
 * The candidate's offer page. There is no session here: the one-time token
 * from the email is the only authorization, sent only to these routes.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface PublicOffer {
  companyName: string;
  offerCode: string;
  candidateName: string;
  jobTitle: string;
  joiningDate: string;
  expiresOn: string;
  annualCtc: string;
  components: { label: string; annualAmount: string }[];
  letter: { title: string; body: string };
  status: 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN' | string;
  respondedAt: string | null;
  canRespond: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/public/offers/${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      credentials: 'omit',
    });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'Something went wrong. Try again.');
  }
  return body.data as T;
}

export const publicOfferApi = {
  view: (token: string) => call<PublicOffer>(encodeURIComponent(token)),
  /** Saves the letter (attachment); used by an explicit download link. */
  pdfDownloadUrl: (token: string) => `${API_BASE_URL}/public/offers/${encodeURIComponent(token)}/pdf?download=1`,
  /** The letter's bytes, to show in the page. */
  pdf: async (token: string): Promise<ArrayBuffer> => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/public/offers/${encodeURIComponent(token)}/pdf`, { credentials: 'omit' });
    } catch {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || 'The offer letter could not be loaded.');
    }
    return response.arrayBuffer();
  },
  accept: (token: string, typedName: string) => call<PublicOffer>(`${encodeURIComponent(token)}/accept`, { method: 'POST', body: JSON.stringify({ typedName, confirm: true }) }),
  decline: (token: string, reason?: string) => call<PublicOffer>(`${encodeURIComponent(token)}/decline`, { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) }),
};
