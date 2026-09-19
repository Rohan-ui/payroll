import { apiClient } from './client';

export interface BackendPayrollPeriod {
  id: string;
  tenant_id: string;
  period_code: string;
  period_start: string;
  period_end: string;
  payment_date?: string | null;
  period_status: string;
}

export interface BackendPayrollRun {
  id: string;
  tenant_id: string;
  payroll_period_id: string;
  run_status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'FINALIZED' | 'CANCELLED';
  run_type: string;
  total_gross_pay: string | number;
  total_deductions: string | number;
  total_net_pay: string | number;
  total_employer_contributions: string | number;
  employee_count: number;
  calculated_at?: string | null;
  approved_at?: string | null;
  finalized_at?: string | null;
  rndtechnosoft_payroll_periods?: BackendPayrollPeriod;
  rndtechnosoft_payroll_run_employees?: {
    id: string;
    employee_id: string;
    gross_earnings: string | number;
    total_deductions: string | number;
    net_pay: string | number;
    employer_cost: string | number;
    calculation_status: string;
    rndtechnosoft_employees?: {
      employee_code: string;
      first_name: string;
      last_name?: string | null;
      work_email?: string | null;
    };
    rndtechnosoft_payslips?: {
      id: string;
      payslip_number: string;
      rndtechnosoft_payslip_lines: {
        id: string;
        component_code: string;
        component_name: string;
        component_category: string;
        amount: string | number;
      }[];
    }[];
  }[];
}

export const payrollApi = {
  listPeriods: async (): Promise<BackendPayrollPeriod[]> => {
    return apiClient.get<BackendPayrollPeriod[]>('/payroll/periods');
  },

  createPeriod: async (data: {
    periodCode: string;
    periodStart: string;
    periodEnd: string;
    paymentDate?: string;
  }): Promise<BackendPayrollPeriod> => {
    return apiClient.post<BackendPayrollPeriod>('/payroll/periods', data);
  },

  createRun: async (payrollPeriodId: string): Promise<BackendPayrollRun> => {
    return apiClient.post<BackendPayrollRun>('/payroll/runs', { payrollPeriodId });
  },

  getRunDetails: async (runId: string): Promise<BackendPayrollRun> => {
    return apiClient.get<BackendPayrollRun>(`/payroll/runs/${runId}`);
  },

  calculateRun: async (runId: string): Promise<BackendPayrollRun> => {
    return apiClient.post<BackendPayrollRun>(`/payroll/runs/${runId}/calculate`, {});
  },

  approveRun: async (runId: string): Promise<BackendPayrollRun> => {
    return apiClient.post<BackendPayrollRun>(`/payroll/runs/${runId}/approve`, {});
  },

  finalizeRun: async (runId: string): Promise<BackendPayrollRun> => {
    return apiClient.post<BackendPayrollRun>(`/payroll/runs/${runId}/finalize`, {});
  },
};
