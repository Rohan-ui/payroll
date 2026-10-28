import { apiClient } from './client';

export interface EmploymentTypeItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
  candidatesCount: number;
  offersCount: number;
  employeesCount: number;
  policyScopesCount: number;
  isReferenced: boolean;
}

export interface CreateEmploymentTypeInput {
  name: string;
  code?: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface UpdateEmploymentTypeInput {
  name?: string;
  description?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface ListEmploymentTypesQuery {
  search?: string;
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
}

export const employmentTypesApi = {
  list: async (query?: ListEmploymentTypesQuery): Promise<EmploymentTypeItem[]> => {
    const params = new URLSearchParams();
    if (query?.search) params.set('search', query.search);
    if (query?.status) params.set('status', query.status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const res = await apiClient.get<{ success: boolean; data: EmploymentTypeItem[] }>(`/tenant/employment-types${qs}`);
    return res.data;
  },

  get: async (id: string): Promise<EmploymentTypeItem> => {
    const res = await apiClient.get<{ success: boolean; data: EmploymentTypeItem }>(`/tenant/employment-types/${id}`);
    return res.data;
  },

  create: async (input: CreateEmploymentTypeInput): Promise<EmploymentTypeItem> => {
    const res = await apiClient.post<{ success: boolean; data: EmploymentTypeItem; message: string }>('/tenant/employment-types', input);
    return res.data;
  },

  update: async (id: string, input: UpdateEmploymentTypeInput): Promise<EmploymentTypeItem> => {
    const res = await apiClient.put<{ success: boolean; data: EmploymentTypeItem; message: string }>(`/tenant/employment-types/${id}`, input);
    return res.data;
  },

  setStatus: async (id: string, status: 'ACTIVE' | 'INACTIVE'): Promise<EmploymentTypeItem> => {
    const res = await apiClient.patch<{ success: boolean; data: EmploymentTypeItem; message: string }>(`/tenant/employment-types/${id}/status`, { status });
    return res.data;
  },

  delete: async (id: string): Promise<{ success: boolean; message: string }> => {
    return apiClient.delete<{ success: boolean; message: string }>(`/tenant/employment-types/${id}`);
  },
};
