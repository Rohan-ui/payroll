import { apiClient, apiFetch } from './client';

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

export type EmployeeSortField = 'name' | 'code' | 'joiningDate' | 'department' | 'designation' | 'status';

/** The People directory's query: every filter is applied by the server. */
export interface EmployeeDirectoryQuery {
  page: number;
  limit: number;
  search?: string;
  departmentId?: string;
  designationId?: string;
  employmentTypeId?: string;
  branchId?: string;
  managerId?: string;
  status?: string;
  joinedFrom?: string;
  joinedTo?: string;
  sortBy: EmployeeSortField;
  sortOrder: 'asc' | 'desc';
}

export interface DirectoryEmployee {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  workEmail: string | null;
  workMobile: string | null;
  employeeStatus: string;
  hireDate: string | null;
  currentEmployment: {
    branch: string | null;
    branchId: string | null;
    department: string | null;
    departmentId: string | null;
    designation: string | null;
    designationId: string | null;
    employmentType: string | null;
    employmentTypeId: string | null;
    joiningDate: string;
    probationEndDate: string | null;
  } | null;
  manager: { id: string; employeeCode: string; name: string } | null;
}

export interface EmployeeDirectoryPage extends Omit<EmployeeListResponse, 'items'> {
  items: DirectoryEmployee[];
}

export interface EmployeeDirectorySummary {
  total: number;
  active: number;
  onNotice: number;
  inactive: number;
  onProbation: number;
  recentlyJoined: number;
  recentJoinerDays: number;
}

export interface EmployeeDirectoryFilters {
  departments: { id: string; department_code: string; department_name: string }[];
  designations: { id: string; designation_code: string; designation_name: string }[];
  employmentTypes: { id: string; employment_type_code: string; employment_type_name: string }[];
  branches: { id: string; branch_code: string; branch_name: string }[];
  statuses: string[];
}

export const employeesApi = {
  list: async (page = 1, limit = 20, search = ''): Promise<EmployeeDirectoryPage> => {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(search ? { search } : {}),
    });
    return apiClient.get<EmployeeDirectoryPage>(`/employees?${params.toString()}`);
  },

  /** Active employees matching a name or code, for pickers; the server filters, a few at a time. */
  findActive: async (term: string): Promise<{ id: string; name: string; code: string }[]> => {
    const page = await employeesApi.directory({ page: 1, limit: 20, search: term, status: 'ACTIVE', sortBy: 'name', sortOrder: 'asc' });
    return page.items.map((e) => ({ id: e.id, name: [e.firstName, e.lastName].filter(Boolean).join(' '), code: e.employeeCode }));
  },

  directory: async (query: EmployeeDirectoryQuery): Promise<EmployeeDirectoryPage> => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    return apiClient.get<EmployeeDirectoryPage>(`/employees?${params.toString()}`);
  },

  /** The filtered directory as an Excel file, fetched with the session (a bare link would carry no sign-in). */
  exportDirectory: async (query: Omit<EmployeeDirectoryQuery, 'page' | 'limit'>): Promise<{ blob: Blob; filename: string }> => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const response = await apiFetch(`/api/v1/employees/export?${params.toString()}`);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || 'The export could not be created. Try again.');
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const filename = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disposition)?.[1] ?? 'employees.xlsx');
    return { blob: await response.blob(), filename };
  },

  directorySummary: async (): Promise<EmployeeDirectorySummary> => apiClient.get('/employees/meta/summary'),

  directoryFilters: async (): Promise<EmployeeDirectoryFilters> => apiClient.get('/employees/meta/filters'),

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

