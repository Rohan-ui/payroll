/**
 * API HTTP Client for rndtechnosoft Payroll + HRMS
 * Attaches the session bearer token. No tenant identifier is sent: the server
 * derives the workspace from the session.
 */

/**
 * Same-origin by default: the dev server proxies /api to the backend and
 * production serves both behind one host. Keeping this relative avoids baking a
 * developer machine's URL into the build and lets Content-Security-Policy stay
 * at connect-src 'self'. Override only when the API is on another origin.
 */
import { crmPath, FeedbackOptions, NETWORK_ERROR, reportCrmResult } from './crm-feedback';
import { toast } from '../lib/toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

/** Called when the server rejects the session, so the app can show sign-in. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  endpoint: string,
  { feedback, ...options }: RequestInit & { feedback?: FeedbackOptions } = {},
): Promise<T> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('rnd_auth_token');
  } catch {
    // Storage can be unavailable in private browsing.
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // No tenant header is sent. The server derives the workspace from the
  // session, and anything the client supplied would be ignored anyway.

  const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    const crm = crmPath(url);
    if (crm) reportCrmResult(crm, options.method ?? 'GET', response.status, response.ok, data, feedback);

    if (!response.ok) {
      if (response.status === 401 && token) {
        // One place decides what an expired session means for the whole app.
        // A 401 on a request without a session (a failed sign-in) is just a refusal.
        onSessionExpired?.();
      }

      const errorMessage =
        (data && typeof data === 'object' && (data.message || data.error)) ||
        `Request failed with status ${response.status}`;
      throw new ApiError(
        Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage,
        response.status,
        data,
      );
    }

    return data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    if (crmPath(url) && feedback?.error !== false) toast.error(NETWORK_ERROR);
    throw new ApiError(err.message || 'Network connection failed. Ensure backend is running.', 0);
  }
}

/**
 * Drop-in replacement for `fetch` for calls that want the raw Response.
 *
 * Attaches the session bearer token and reports an expired session through the
 * same central handler as `apiClient`. Callers keep their existing
 * `await res.json()` handling.
 *
 * Without this, a component calling `fetch` directly sends no credentials and
 * the request is refused, because the tenant API now requires authentication.
 */
export async function apiFetch(
  input: string,
  { feedback, ...init }: RequestInit & { feedback?: FeedbackOptions } = {},
): Promise<Response> {
  let token: string | null = null;
  try {
    token = localStorage.getItem('rnd_auth_token');
  } catch {
    // Storage can be unavailable in private browsing.
  }

  const headers = new Headers(init.headers);

  // Let the browser set the type (and multipart boundary) for form and binary
  // bodies; only default JSON for plain string payloads.
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const crm = crmPath(input);
  let response: Response;
  try {
    response = await fetch(input, { ...init, headers });
  } catch (error) {
    if (crm && feedback?.error !== false) toast.error(NETWORK_ERROR);
    throw error;
  }

  if (response.status === 401 && token) {
    onSessionExpired?.();
  }

  // CRM requests report their own outcome as a toast; the caller still reads the body.
  if (crm) {
    const body = await response.clone().json().catch(() => null);
    reportCrmResult(crm, init.method ?? 'GET', response.status, response.ok, body, feedback);
  }

  return response;
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestInit) =>
    request<T>(endpoint, { ...options, method: 'DELETE' }),
};
