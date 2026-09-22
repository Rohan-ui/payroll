import { apiClient } from './client';
import {
  SuperAdminUser,
  SuperAdminTenant,
  AnalyticsOverview,
  PlatformInvoice,
  PlatformCoupon,
  SupportTicket,
  TenantQuota,
} from '../types/super-admin.types';

export const superAdminApi = {
  login: async (email: string, password?: string) => {
    return apiClient.post<{ token: string; superAdmin: SuperAdminUser }>('/super-admin/auth/login', {
      email,
      password,
    });
  },

  getAnalyticsOverview: async () => {
    return apiClient.get<AnalyticsOverview>('/super-admin/analytics/overview');
  },

  getTenants: async (search?: string, status?: string) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get<SuperAdminTenant[]>(`/super-admin/tenants${qs}`);
  },

  getTenantById: async (id: string) => {
    return apiClient.get<SuperAdminTenant>(`/super-admin/tenants/${id}`);
  },

  createTenant: async (data: {
    legalName: string;
    displayName: string;
    tenantCode: string;
    adminEmail: string;
    adminName: string;
    currency?: string;
    countryCode?: string;
  }) => {
    return apiClient.post<SuperAdminTenant>('/super-admin/tenants', data);
  },

  updateTenantStatus: async (id: string, status: string) => {
    return apiClient.put<{ message: string; tenant: SuperAdminTenant }>(`/super-admin/tenants/${id}/status`, {
      status,
    });
  },

  updateTenantQuotas: async (id: string, quotas: Partial<TenantQuota>) => {
    return apiClient.put<TenantQuota>(`/super-admin/tenants/${id}/quotas`, quotas);
  },

  impersonateTenant: async (tenantId: string, superAdminId?: string) => {
    return apiClient.post<{ token: string; activeTenantId: string; user: any }>(
      `/super-admin/tenants/${tenantId}/impersonate`,
      {},
      {
        headers: superAdminId ? { 'x-super-admin-id': superAdminId } : {},
      },
    );
  },

  getBillingPackages: async () => {
    return apiClient.get<any[]>('/super-admin/billing/packages');
  },

  getInvoices: async () => {
    return apiClient.get<PlatformInvoice[]>('/super-admin/billing/invoices');
  },

  getCoupons: async () => {
    return apiClient.get<PlatformCoupon[]>('/super-admin/billing/coupons');
  },

  createCoupon: async (data: {
    couponCode: string;
    discountType?: string;
    discountValue: number;
    maxUses?: number;
    validUntil?: string;
  }) => {
    return apiClient.post<PlatformCoupon>('/super-admin/billing/coupons', data);
  },

  getSupportTickets: async () => {
    return apiClient.get<SupportTicket[]>('/super-admin/support/tickets');
  },

  getSettings: async () => {
    return apiClient.get<any[]>('/super-admin/settings');
  },
};
