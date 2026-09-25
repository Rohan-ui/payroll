import { apiClient } from './client';

export interface TenantMembership {
  tenantId: string;
  tenantCode: string;
  legalName: string;
  displayName: string;
  roles: string[];
}

/** A workspace module code such as CRM, HRMS or FINANCE. Which modules exist comes from the server. */
export type WorkspaceModule = string;

/**
 * A sidebar item the member may open, as decided by the server from their
 * permissions. Its label, the group it sits under and its order come from the
 * server too; the client only draws it.
 */
export interface NavigationEntry {
  id: string;
  label: string;
  /** The group (a business module such as HRMS) this item sits under, or null at the top level. */
  parent: string | null;
  module: WorkspaceModule | null;
  moduleName: string | null;
  /** False when the workspace has switched the item's module off. */
  moduleEnabled: boolean;
}

/**
 * What the signed-in member may do in the active workspace. The UI uses it to
 * hide what cannot be used; the server enforces the same rules on every request.
 */
export interface WorkspaceAccess {
  permissions: string[];
  modules: Record<WorkspaceModule, boolean>;
  navigation: NavigationEntry[];
}

/**
 * A session returned by the API.
 *
 * `activeTenant` is chosen by the server from the user's memberships and is
 * pinned to the session. The client cannot change it by editing local state;
 * switching workspaces requires a request the server re-authorizes.
 */
export interface UserSession {
  token: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    /** Signed in with a temporary password: the server allows nothing but replacing it. */
    mustChangePassword: boolean;
  };
  activeTenant: TenantMembership;
  availableTenants: TenantMembership[];
  access: WorkspaceAccess;
}

export interface UserProfile {
  user: UserSession['user'];
  activeTenant: TenantMembership | null;
  availableTenants: TenantMembership[];
  roles: string[];
  access: WorkspaceAccess;
}

export const authApi = {
  login: (email: string, password: string, tenantId?: string) =>
    apiClient.post<UserSession>('/auth/login', { email, password, tenantId }),

  /** Creates a workspace and returns a session for its first administrator. */
  registerTenant: (data: {
    companyName: string;
    tenantCode: string;
    email: string;
    password: string;
    adminName?: string;
    displayName?: string;
  }) =>
    apiClient.post<UserSession>('/auth/register-tenant', {
      ...data,
      tenantCode: data.tenantCode.toUpperCase().trim(),
    }),

  /** Identity comes from the session; there is no user id to pass. */
  getMe: () => apiClient.get<UserProfile>('/auth/me'),

  /** Re-checks membership server-side and returns a session for the new tenant. */
  switchTenant: (tenantId: string) =>
    apiClient.post<UserSession>('/auth/switch-tenant', { tenantId }),

  logout: () => apiClient.post<{ success: boolean }>('/auth/logout'),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<{ success: boolean }>('/auth/change-password', {
      currentPassword,
      newPassword,
    }),

  revokeOtherSessions: () =>
    apiClient.post<{ data: { revoked: number } }>('/auth/sessions/revoke-others'),
};
