import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, UserSession } from '../api/auth.api';

export type TenantInfo = UserSession['tenants'][0];

interface AuthContextType {
  token: string | null;
  user: UserSession['user'] | null;
  tenants: TenantInfo[];
  activeTenant: TenantInfo | null;
  activeRole: string;
  setActiveRole: (role: string) => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password?: string) => Promise<void>;
  registerTenant: (data: {
    companyName: string;
    tenantCode: string;
    email: string;
    password?: string;
    adminName?: string;
  }) => Promise<void>;
  seedDemo: () => Promise<void>;
  switchTenant: (tenantId: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('rnd_auth_token'));
  const [user, setUser] = useState<UserSession['user'] | null>(() => {
    const cached = localStorage.getItem('rnd_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [tenants, setTenants] = useState<TenantInfo[]>(() => {
    const cached = localStorage.getItem('rnd_tenants');
    return cached ? JSON.parse(cached) : [];
  });
  const [activeTenant, setActiveTenant] = useState<TenantInfo | null>(() => {
    const cachedTenantId = localStorage.getItem('rnd_active_tenant_id');
    const cachedTenants = localStorage.getItem('rnd_tenants');
    if (cachedTenants && cachedTenantId) {
      const parsed: TenantInfo[] = JSON.parse(cachedTenants);
      return parsed.find((t) => t.tenantId === cachedTenantId) || parsed[0] || null;
    }
    return null;
  });
  const [activeRole, setActiveRole] = useState<string>(() => {
    return activeTenant?.roles?.[0] || 'ADMIN';
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTenant?.roles?.[0]) {
      setActiveRole(activeTenant.roles[0]);
    }
  }, [activeTenant]);

  const handleSessionSuccess = (session: UserSession) => {
    const effectiveToken = session.token || `auth-token-${session.user.id}-${Date.now()}`;
    setToken(effectiveToken);
    setUser(session.user);
    setTenants(session.tenants || []);

    const firstTenant = session.tenants?.[0] || null;
    setActiveTenant(firstTenant);
    if (firstTenant?.roles?.[0]) {
      setActiveRole(firstTenant.roles[0]);
    }

    localStorage.setItem('rnd_auth_token', effectiveToken);
    localStorage.setItem('rnd_user', JSON.stringify(session.user));
    localStorage.setItem('rnd_tenants', JSON.stringify(session.tenants || []));
    if (firstTenant) {
      localStorage.setItem('rnd_active_tenant_id', firstTenant.tenantId);
    }
    setError(null);
  };

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authApi.login(email, password);
      handleSessionSuccess(session);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const registerTenant = async (data: {
    companyName: string;
    tenantCode: string;
    email: string;
    password?: string;
    adminName?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authApi.registerTenant(data);
      handleSessionSuccess(session);
    } catch (err: any) {
      setError(err.message || 'Tenant registration failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const seedDemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await authApi.seedDemo();
      handleSessionSuccess(session);
    } catch (err: any) {
      setError(err.message || 'Demo initialization failed');
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const switchTenant = (tenantId: string) => {
    const target = tenants.find((t) => t.tenantId === tenantId);
    if (target) {
      setActiveTenant(target);
      localStorage.setItem('rnd_active_tenant_id', target.tenantId);
      if (target.roles?.[0]) {
        setActiveRole(target.roles[0]);
      }
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setTenants([]);
    setActiveTenant(null);
    localStorage.removeItem('rnd_auth_token');
    localStorage.removeItem('rnd_user');
    localStorage.removeItem('rnd_tenants');
    localStorage.removeItem('rnd_active_tenant_id');
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        tenants,
        activeTenant,
        activeRole,
        setActiveRole,
        isAuthenticated: !!user && !!activeTenant,
        isLoading,
        error,
        login,
        registerTenant,
        seedDemo,
        switchTenant,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
