/**
 * HTTP client for the platform (super admin) portal.
 *
 * This portal is a separate application from the tenant workspace: it keeps
 * its own session storage keys and never reads or writes the tenant app's
 * credentials, so the two sessions cannot be confused for one another.
 */

const PLATFORM_TOKEN_KEY = 'voogyo_platform_token';
const PLATFORM_ADMIN_KEY = 'voogyo_platform_admin';
const PLATFORM_EXPIRY_KEY = 'voogyo_platform_expires_at';

export interface PlatformAdmin {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

export class PlatformApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'PlatformApiError';
    this.status = status;
  }
}

/** Called when the server rejects the session so the app can show sign-in. */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

export const platformSession = {
  getToken(): string | null {
    try {
      const token = localStorage.getItem(PLATFORM_TOKEN_KEY);
      const expiresAt = localStorage.getItem(PLATFORM_EXPIRY_KEY);

      if (!token || !expiresAt) return null;

      // Drop a token the client already knows is stale rather than sending it.
      if (new Date(expiresAt).getTime() <= Date.now()) {
        platformSession.clear();
        return null;
      }

      return token;
    } catch {
      return null;
    }
  },

  getAdmin(): PlatformAdmin | null {
    try {
      const cached = localStorage.getItem(PLATFORM_ADMIN_KEY);
      return cached ? (JSON.parse(cached) as PlatformAdmin) : null;
    } catch {
      return null;
    }
  },

  save(token: string, expiresAt: string, admin: PlatformAdmin): void {
    try {
      localStorage.setItem(PLATFORM_TOKEN_KEY, token);
      localStorage.setItem(PLATFORM_EXPIRY_KEY, expiresAt);
      localStorage.setItem(PLATFORM_ADMIN_KEY, JSON.stringify(admin));
    } catch {
      // Private browsing or blocked storage: the session stays in memory only.
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(PLATFORM_TOKEN_KEY);
      localStorage.removeItem(PLATFORM_EXPIRY_KEY);
      localStorage.removeItem(PLATFORM_ADMIN_KEY);
    } catch {
      // Nothing to clean up.
    }
  },
};

/**
 * Drop-in replacement for `fetch` that attaches the platform bearer token and
 * surfaces an expired session once, centrally. Returns the raw Response so
 * callers keep their existing `await res.json()` handling.
 */
export async function platformFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = platformSession.getToken();

  const headers = new Headers(init.headers);

  // Let the browser set the Content-Type (and multipart boundary) for form and
  // binary bodies; only default JSON for plain string payloads.
  const needsJsonContentType =
    typeof init.body === 'string' && !headers.has('Content-Type');

  if (needsJsonContentType) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });

  if (response.status === 401) {
    platformSession.clear();
    onSessionExpired?.();
  }

  return response;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const message = body?.message ?? body?.error;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  } catch {
    // Fall through to the status-based message.
  }
  return `Request failed (${response.status}).`;
}

/** JSON helper for portal code that wants parsed data or a thrown error. */
export const platformApi = {
  async get<T>(path: string): Promise<T> {
    const response = await platformFetch(path);
    if (!response.ok) {
      throw new PlatformApiError(await readError(response), response.status);
    }
    const body = await response.json();
    return (body?.data ?? body) as T;
  },

  post<T>(path: string, payload?: unknown): Promise<T> {
    return send<T>('POST', path, payload);
  },

  put<T>(path: string, payload?: unknown): Promise<T> {
    return send<T>('PUT', path, payload);
  },

  delete<T>(path: string): Promise<T> {
    return send<T>('DELETE', path);
  },
};

async function send<T>(method: string, path: string, payload?: unknown): Promise<T> {
  const response = await platformFetch(path, {
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new PlatformApiError(await readError(response), response.status);
  }
  const body = await response.json();
  return (body?.data ?? body) as T;
}
