/**
 * The unsubscribe page a recipient opens from a sequence email. There is no
 * session here: the email's token is the only key, sent only to these routes.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface UnsubscribeState {
  company: string;
  /** The address, masked: p****@example.com. */
  email: string;
  unsubscribed: boolean;
}

async function call(token: string, method: 'GET' | 'POST'): Promise<UnsubscribeState> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/public/email/unsubscribe/${encodeURIComponent(token)}`, { method, credentials: 'omit' });
  } catch {
    throw new Error('Could not reach the server. Check your connection and try again.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message;
    throw new Error(Array.isArray(message) ? message.join(', ') : message || 'Something went wrong. Try again.');
  }
  return body.data as UnsubscribeState;
}

export const publicUnsubscribeApi = {
  view: (token: string) => call(token, 'GET'),
  unsubscribe: (token: string) => call(token, 'POST'),
};
