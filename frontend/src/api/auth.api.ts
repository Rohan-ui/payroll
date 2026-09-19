import { apiClient } from './client';

export interface UserSession {
  token?: string;
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  tenants: {
    tenantMemberId: string;
    tenantId: string;
    tenantCode: string;
    legalName: string;
    displayName: string;
    roles: string[];
  }[];
}

export const authApi = {
  login: async (email: string, password?: string): Promise<UserSession> => {
    const res = await apiClient.post<any>('/auth/login', { email, password });
    return {
      token: res.token || `token-${res.user.id}-${Date.now()}`,
      user: res.user,
      tenants: res.tenants || [],
    };
  },

  registerTenant: async (data: {
    companyName: string;
    tenantCode: string;
    email: string;
    password?: string;
    adminName?: string;
  }): Promise<UserSession> => {
    // Step 1: Register User
    const userRes = await apiClient.post<any>('/auth/register', {
      email: data.email,
      password: data.password || 'password123',
      displayName: data.adminName || data.email.split('@')[0],
    });

    // Step 2: Create Tenant
    const tenantRes = await apiClient.post<any>('/tenants', {
      tenantCode: data.tenantCode.toUpperCase().trim(),
      legalName: data.companyName,
      displayName: data.companyName,
    });

    // Step 3: Add Membership as ADMIN
    await apiClient.post('/auth/membership', {
      tenantId: tenantRes.id,
      userId: userRes.id,
      roleCode: 'ADMIN',
    });

    // Step 4: Login and return user session
    return authApi.login(data.email, data.password || 'password123');
  },

  seedDemo: async (): Promise<UserSession> => {
    // Log in directly as the seeded Admin
    return authApi.login('admin@rndtechnosoft.com', 'password123');
  },

  getMe: async (userId: string): Promise<Omit<UserSession, 'token'>> => {
    return apiClient.get<Omit<UserSession, 'token'>>(`/auth/me?userId=${encodeURIComponent(userId)}`);
  },
};
