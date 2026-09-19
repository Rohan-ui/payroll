import { apiClient } from './client';

export interface BackendTenant {
  id: string;
  tenant_code: string;
  legal_name: string;
  display_name: string;
  country_code: string;
  default_currency_code: string;
  tenant_status: string;
  rndtechnosoft_tenant_settings?: {
    settings: {
      payroll?: {
        payFrequency?: string;
        currency?: string;
        workingDaysPerMonth?: number;
      };
      compliance?: {
        epfWageCeiling?: number;
        esicThreshold?: number;
        ptState?: string;
      };
    };
  }[];
}

export const tenantsApi = {
  getCurrent: async (): Promise<BackendTenant> => {
    return apiClient.get<BackendTenant>('/tenants/current');
  },

  updateSettings: async (settings: Record<string, unknown>): Promise<any> => {
    return apiClient.patch('/tenants/current', { settings });
  },
};
