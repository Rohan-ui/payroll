import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, UserSession, TenantMembership, WorkspaceAccess, WorkspaceModule, NavigationEntry } from '../api/auth.api';
import { setSessionExpiredHandler } from '../api/client';

export type TenantInfo = TenantMembership;

interface AuthContextType {
  token: string | null;
  user: UserSession['user'] | null;
  tenants: TenantInfo[];
  activeTenant: TenantInfo | null;
  activeRole: string;
  setActiveRole: (role: string) => void;
  isAuthenticated: boolean;
  /** Restoring a stored session on page load; the app shows its loading screen meanwhile. */
  isLoading: boolean;
  /** A sign-in or registration request is in flight; the form stays on screen with its values. */
  isSubmitting: boolean;
  error: string | null;
  notice: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerTenant: (data: {
    companyName: string;
    tenantCode: string;
    email: string;
    password: string;
    adminName?: string;
  }) => Promise<void>;
  switchTenant: (tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Replaces the signed-in user's password. The current password is needed for
   * a voluntary change, not to replace a temporary one (the session proves it).
   */
  completePasswordChange: (newPassword: string, currentPassword?: string) => Promise<void>;
  /** Presentation only: the server enforces every permission itself. */
  can: (permission: string) => boolean;
  /** False until the server has reported this member's permissions for the workspace. */
  accessLoaded: boolean;
  isModuleEnabled: (module: WorkspaceModule) => boolean;
  /** The sidebar items this member may open, in order, as the server reported them. */
  navigation: NavigationEntry[];
  /** The sidebar item if the server says this member may open it (its module may still be off). */
  navigationEntry: (navId: string) => NavigationEntry | undefined;
  /** True when the member may open the item and its module is on: what the sidebar shows. */
  canOpen: (navId: string) => boolean;
  /** Re-reads permissions and module switches after they change. */
  refreshAccess: () => Promise<void>;
}

const TOKEN_KEY = 'rnd_auth_token';
const EXPIRY_KEY = 'rnd_auth_expires_at';
const USER_KEY = 'rnd_user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const NO_NAVIGATION: NavigationEntry[] = [];

/** Access from an API version that predates navigation reporting (or its labels) counts as unknown, not as "nothing allowed". */
function completeAccess(access: WorkspaceAccess | undefined): WorkspaceAccess | null {
  return access &&
    Array.isArray(access.permissions) &&
    Array.isArray(access.navigation) &&
    access.navigation.every((entry) => typeof entry.label === 'string')
    ? access
    : null;
}

function readStoredToken(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiresAt = localStorage.getItem(EXPIRY_KEY);
    if (!token || !expiresAt) return null;
    if (new Date(expiresAt).getTime() <= Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(readStoredToken);
  const [user, setUser] = useState<UserSession['user'] | null>(null);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [activeTenant, setActiveTenant] = useState<TenantInfo | null>(null);
  const [activeRole, setActiveRole] = useState<string>('EMPLOYEE');
  const [access, setAccess] = useState<WorkspaceAccess | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(readStoredToken()));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const clearSession = useCallback((message: string | null) => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(EXPIRY_KEY);
      localStorage.removeItem(USER_KEY);
      // Removed: the active tenant is no longer a client-side choice.
      localStorage.removeItem('rnd_active_tenant_id');
      localStorage.removeItem('rnd_tenants');
    } catch {
      // Storage may be unavailable; in-memory state is cleared regardless.
    }
    setToken(null);
    setUser(null);
    setTenants([]);
    setActiveTenant(null);
    setAccess(null);
    setNotice(message);
  }, []);

  // Any 401 from anywhere in the app returns the user to sign-in.
  useEffect(() => {
    setSessionExpiredHandler(() => {
      clearSession('Your session ended. Sign in again to continue.');
    });
    return () => setSessionExpiredHandler(null);
  }, [clearSession]);

  const applySession = useCallback((session: UserSession) => {
    try {
      localStorage.setItem(TOKEN_KEY, session.token);
      localStorage.setItem(EXPIRY_KEY, session.expiresAt);
      localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    } catch {
      // Session still works for this tab without persistence.
    }

    setToken(session.token);
    setUser(session.user);
    setTenants(session.availableTenants);
    setActiveTenant(session.activeTenant);
    setActiveRole(session.activeTenant.roles?.[0] || 'EMPLOYEE');
    // An API that predates access reporting sends none; permissions then count as unknown, not denied.
    setAccess(completeAccess(session.access));
    setError(null);
    setNotice(null);
  }, []);

  // Confirm a restored token is still valid before showing the workspace.
  useEffect(() => {
    let cancelled = false;

    if (!readStoredToken()) {
      setIsLoading(false);
      return;
    }

    authApi
      .getMe()
      .then((profile) => {
        if (cancelled) return;
        setUser(profile.user);
        setTenants(profile.availableTenants);
        setActiveTenant(profile.activeTenant);
        setActiveRole(profile.roles?.[0] || 'EMPLOYEE');
        setAccess(completeAccess(profile.access));
        setIsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        clearSession(null);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      setIsSubmitting(true);
      setError(null);
      try {
        applySession(await authApi.login(email, password));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [applySession],
  );

  const registerTenant = useCallback(
    async (data: {
      companyName: string;
      tenantCode: string;
      email: string;
      password: string;
      adminName?: string;
    }) => {
      setIsSubmitting(true);
      setError(null);
      try {
        applySession(await authApi.registerTenant(data));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Workspace registration failed');
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [applySession],
  );

  /**
   * Switching is a server call: the API re-checks membership and issues a
   * session pinned to the new workspace. Changing local state alone grants
   * nothing, because the tenant lives on the session.
   */
  const switchTenant = useCallback(
    async (tenantId: string) => {
      setError(null);
      try {
        applySession(await authApi.switchTenant(tenantId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not switch workspace');
        throw err;
      }
    },
    [applySession],
  );

  const completePasswordChange = useCallback(async (newPassword: string, currentPassword?: string) => {
    await authApi.changePassword(newPassword, currentPassword);
    setUser((current) => (current ? { ...current, mustChangePassword: false } : current));
  }, []);

  const refreshAccess = useCallback(async () => {
    const profile = await authApi.getMe();
    setAccess(completeAccess(profile.access));
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(access?.permissions.includes(permission)),
    [access],
  );

  // Until the server has answered, a module counts as enabled; the API refuses
  // anything that is actually switched off.
  const isModuleEnabled = useCallback(
    (module: WorkspaceModule) => access?.modules[module] !== false,
    [access],
  );

  const navigationEntry = useCallback(
    (navId: string) => access?.navigation?.find((entry) => entry.id === navId),
    [access],
  );

  const canOpen = useCallback(
    (navId: string) => Boolean(navigationEntry(navId)?.moduleEnabled),
    [navigationEntry],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // The local session is dropped either way.
    }
    clearSession('You have been signed out.');
  }, [clearSession]);

  const value = useMemo<AuthContextType>(
    () => ({
      token,
      user,
      tenants,
      activeTenant,
      activeRole,
      setActiveRole,
      isAuthenticated: Boolean(user && activeTenant),
      isLoading,
      isSubmitting,
      error,
      notice,
      login,
      registerTenant,
      switchTenant,
      logout,
      completePasswordChange,
      can,
      accessLoaded: access !== null,
      isModuleEnabled,
      navigation: access?.navigation ?? NO_NAVIGATION,
      navigationEntry,
      canOpen,
      refreshAccess,
    }),
    [
      token,
      user,
      tenants,
      activeTenant,
      activeRole,
      isLoading,
      isSubmitting,
      error,
      notice,
      login,
      registerTenant,
      switchTenant,
      logout,
      completePasswordChange,
      can,
      access,
      isModuleEnabled,
      navigationEntry,
      canOpen,
      refreshAccess,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
