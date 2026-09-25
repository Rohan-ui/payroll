import { platformApi, platformFetch, PlatformAdmin, PlatformApiError } from './platform-client';

const BASE = '/api/v1/super-admin';

export interface PlatformLoginResult {
  token: string;
  expiresAt: string;
  /** True when the password was accepted but a second factor is still needed. */
  mfaRequired: boolean;
  superAdmin: PlatformAdmin;
}

export interface PlatformMfaStatus {
  isEnabled: boolean;
  enrolledAt: string | null;
  unusedRecoveryCodeCount: number;
}

export interface PlatformMfaEnrollment {
  secret: string;
  secretFormatted: string;
  otpauthUri: string;
}

export interface PlatformSessionSummary {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const platformAuthApi = {
  /** Sign in. Uses the raw client so a 401 here is a credential error, not an expired session. */
  async login(email: string, password: string): Promise<PlatformLoginResult> {
    const response = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message = Array.isArray(body?.message)
        ? body.message.join(', ')
        : body?.message || 'Unable to sign in. Try again.';
      throw new PlatformApiError(message, response.status);
    }

    return body.data as PlatformLoginResult;
  },

  async logout(): Promise<void> {
    await platformFetch(`${BASE}/auth/logout`, { method: 'POST' });
  },

  me: () => platformApi.get<Record<string, unknown>>(`${BASE}/auth/me`),

  listSessions: () => platformApi.get<PlatformSessionSummary[]>(`${BASE}/auth/sessions`),

  revokeOtherSessions: () =>
    platformApi.post<{ revoked: number }>(`${BASE}/auth/sessions/revoke-others`),

  changePassword: (currentPassword: string, newPassword: string) =>
    platformApi.post<unknown>(`${BASE}/auth/change-password`, { currentPassword, newPassword }),

  /** Completes a sign-in that is waiting on a second factor. */
  completeMfaChallenge: (code: string) =>
    platformApi.post<PlatformLoginResult>(`${BASE}/auth/mfa/challenge`, { code }),

  getMfaStatus: () => platformApi.get<PlatformMfaStatus>(`${BASE}/auth/mfa`),

  beginMfaEnrollment: () => platformApi.post<PlatformMfaEnrollment>(`${BASE}/auth/mfa/setup`),

  confirmMfaEnrollment: (code: string) =>
    platformApi.post<{ recoveryCodes: string[] }>(`${BASE}/auth/mfa/enable`, { code }),

  regenerateRecoveryCodes: (code: string) =>
    platformApi.post<{ recoveryCodes: string[] }>(`${BASE}/auth/mfa/recovery-codes`, { code }),

  disableMfa: (password: string, code: string) =>
    platformApi.post<unknown>(`${BASE}/auth/mfa/disable`, { password, code }),
};
