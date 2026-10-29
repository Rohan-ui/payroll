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
  totalPages: number;
  hasMore: boolean;
  items: BackendEmployee[];
}

export const employeesApi = {
  list: async (page = 1, limit = 20, search = '', department = ''): Promise<EmployeeListResponse> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
      ...(department ? { department } : {}),
    });
    return apiClient.get<EmployeeListResponse>(`/employees?${params.toString()}`);
  },

  getById: async (id: string): Promise<BackendEmployee> => {
    return apiClient.get<BackendEmployee>(`/employees/${id}`);
  },

  create: async (data: {
    employeeCode: string;
    firstName: string;
    middleName?: string;
    lastName?: string;
    workEmail?: string;
    personalEmail?: string;
    workMobile?: string;
    joiningDate: string;
    departmentId?: string;
    departmentName?: string;
    branchId?: string;
    designationId?: string;
    designationName?: string;
    bankDetails?: {
      bankName: string;
      branchName?: string;
      accountNumber: string;
      ifsc: string;
      accountHolderName?: string;
    };
  }): Promise<BackendEmployee> => {
    return apiClient.post<BackendEmployee>('/employees', data);
  },

  update: async (
    id: string,
    data: {
      firstName?: string;
      lastName?: string;
      workEmail?: string;
      workMobile?: string;
      employeeStatus?: string;
      joiningDate?: string;
      departmentId?: string;
      departmentName?: string;
      designationId?: string;
      designationName?: string;
      bankDetails?: {
        bankName: string;
        branchName?: string;
        accountNumber?: string;
        ifsc: string;
        accountHolderName?: string;
      };
    },
  ): Promise<BackendEmployee> => {
    return apiClient.put<BackendEmployee>(`/employees/${id}`, data);
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

  getDepartments: async (): Promise<{ id: string; department_code: string; department_name: string }[]> => {
    return apiClient.get('/employees/meta/departments');
  },

  getDesignations: async (): Promise<{ id: string; designation_code: string; designation_name: string }[]> => {
    return apiClient.get('/employees/meta/designations');
  },

  verifyIfsc: async (code: string): Promise<{
    valid: boolean;
    bank?: string;
    branch?: string;
    address?: string;
    city?: string;
    state?: string;
    ifsc?: string;
    micr?: string;
    message?: string;
  }> => {
    return apiClient.get(`/employees/meta/ifsc/${encodeURIComponent(code.trim().toUpperCase())}`);
  },

  // COSEC Attendance Integration & Mapping
  getCosecMapping: async (employeeId: string): Promise<EmployeeCosecMapping> => {
    return apiClient.get<EmployeeCosecMapping>(`/external-api/cosec/mappings/${employeeId}`);
  },

  setCosecMapping: async (
    employeeId: string,
    data: { cosecEmployeeId: string; notes?: string },
  ): Promise<EmployeeCosecMapping> => {
    return apiClient.put<EmployeeCosecMapping>(`/external-api/cosec/mappings/${employeeId}`, data);
  },

  removeCosecMapping: async (employeeId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/external-api/cosec/mappings/${employeeId}`);
  },

  lookupCosecUser: async (cosecId: string): Promise<CosecLookupResult> => {
    return apiClient.get<CosecLookupResult>(`/external-api/cosec/mappings/lookup/${encodeURIComponent(cosecId.trim())}`);
  },

  getCosecReconciliation: async (): Promise<CosecReconciliationSummary> => {
    return apiClient.get<CosecReconciliationSummary>('/external-api/cosec/reconciliation');
  },

  runCosecReconcile: async (): Promise<{
    newlyMappedCount: number;
    verifiedCount: number;
    notFoundCount: number;
    reviewRequiredCount: number;
    totalEmployees: number;
    totalCosecUsers: number;
  }> => {
    return apiClient.post('/external-api/cosec/reconcile');
  },

  refreshEmployeeAttendance: async (employeeId: string, month: string): Promise<{
    status: string;
    syncedAt?: string;
    changedRecords?: number;
    skippedLocked?: number;
    matched?: boolean;
  }> => {
    return apiClient.post('/external-api/cosec/refresh-employee', { employeeId, month });
  },
};

export interface EmployeeCosecMapping {
  id: string | null;
  tenantId: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  workEmail: string | null;
  cosecEmployeeId: string | null;
  mappingStatus: 'MAPPED' | 'MAPPING_PENDING' | 'NOT_FOUND' | 'REQUIRES_REVIEW' | 'SYNC_ERROR' | string;
  mappingSource: 'AUTOMATIC' | 'MANUAL' | 'CANDIDATE_CONVERSION' | string;
  verificationStatus: 'UNVERIFIED' | 'VERIFIED' | 'FAILED' | string;
  lastSyncedAt: string | null;
  lastSyncResult: string | null;
  reviewNotes: string | null;
  isCosecConfigured: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CosecLookupResult {
  cosecId: string;
  isConfigured: boolean;
  existsInCosec: boolean;
  cosecUser: {
    cosecUserId: string;
    name: string;
    email: string | null;
    department: string | null;
    designation: string | null;
  } | null;
  alreadyMapped: boolean;
  alreadyMappedTo: {
    employeeId: string;
    employeeCode: string;
    employeeName: string;
  } | null;
}

export interface CosecReconciliationSummary {
  isConfigured: boolean;
  totalEmployees: number;
  totalCosecUsers: number;
  mappedCount: number;
  pendingCount: number;
  notFoundCount: number;
  reviewCount: number;
  unmappedEmployees: Array<{
    employeeId: string;
    employeeCode: string;
    name: string;
    workEmail: string | null;
    department: string | null;
    mappingStatus: string;
    currentCosecId: string | null;
    suggestedMatch: {
      cosecId: string;
      name: string;
      email: string | null;
    } | null;
  }>;
  unmatchedCosecUsers: Array<{
    cosecId: string;
    name: string;
    email: string | null;
    department: string | null;
    designation: string | null;
  }>;
}

