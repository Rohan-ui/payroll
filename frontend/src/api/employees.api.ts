import { apiClient } from './client';

export interface BackendEmployee {
  id: string;
  tenant_id: string;
  employee_code: string;
  first_name: string;
  middle_name?: string | null;
  last_name?: string | null;
  work_email?: string | null;
  work_mobile?: string | null;
  employee_status: string;
  hire_date?: string | null;
  joining_date: string;
  rndtechnosoft_employee_employments?: {
    id: string;
    is_primary: boolean;
    rndtechnosoft_branches?: { branch_name: string; state_code?: string } | null;
    rndtechnosoft_departments?: { department_name: string } | null;
    rndtechnosoft_designations?: { designation_name: string } | null;
  }[];
  rndtechnosoft_employee_bank_accounts?: {
    id: string;
    bank_name: string;
    account_number: string;
    bank_code?: string; // IFSC
    verification_status: string;
    is_primary: boolean;
  }[];
}

export interface EmployeeListResponse {
  total: number;
  page: number;
  limit: number;
  items: BackendEmployee[];
}

export const employeesApi = {
  list: async (page = 1, limit = 50, search = ''): Promise<EmployeeListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
    });
    return apiClient.get<EmployeeListResponse>(`/employees?${params.toString()}`);
  },

  getById: async (id: string): Promise<BackendEmployee> => {
    return apiClient.get<BackendEmployee>(`/employees/${id}`);
  },

  create: async (data: {
    employeeCode: string;
    firstName: string;
    lastName?: string;
    workEmail?: string;
    workMobile?: string;
    joiningDate: string;
    departmentId?: string;
    branchId?: string;
    designationId?: string;
  }): Promise<BackendEmployee> => {
    return apiClient.post<BackendEmployee>('/employees', data);
  },

  addBankAccount: async (
    employeeId: string,
    data: {
      accountHolderName: string;
      bankName: string;
      accountNumber: string;
      bankCode?: string; // IFSC
      effectiveFrom: string;
    },
  ) => {
    return apiClient.post(`/employees/${employeeId}/bank-account`, {
      ...data,
      bankCodeType: 'IFSC',
    });
  },
};
