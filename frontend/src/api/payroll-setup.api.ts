import { apiClient, ApiError } from './client';

/**
 * Payroll setup: payroll policies, salary components, versioned salary
 * structures and employee salaries. Amounts travel as decimal strings and are
 * never turned into JavaScript numbers for arithmetic.
 */

interface Envelope<T> {
  success: boolean;
  data: T;
  message?: string;
}
const data = async <T>(promise: Promise<Envelope<T>>) => (await promise).data;

export type VersionStatus = 'DRAFT' | 'PUBLISHED';
export type ComponentCategory = 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
export type CalculationType = 'FIXED' | 'PERCENTAGE' | 'FORMULA' | 'MANUAL' | 'SYSTEM_CALCULATED';
export type SystemRule = 'OVERTIME' | 'LATE_ARRIVAL' | 'EARLY_DEPARTURE' | 'LOAN_RECOVERY' | 'ARREARS';
export type RoundingMode = 'HALF_UP' | 'UP' | 'DOWN';
export type PayBasis = 'MONTHLY' | 'DAILY' | 'HOURLY';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CHEQUE';

/** A problem the server found, by component code or settings path. */
export interface Problem {
  code?: string | null;
  path?: string;
  message: string;
}

/** The problems list a refused request carries, if any. */
export const problemsOf = (error: unknown): Problem[] =>
  error instanceof ApiError && Array.isArray(error.data?.errors) ? (error.data.errors as Problem[]) : [];

/* ── Policies ─────────────────────────────────────────────── */

export interface PenaltyBand {
  fromMinute: number;
  toMinute: number | null;
  action: 'WARNING' | 'FIXED_AMOUNT' | 'PER_MINUTE' | 'DAY_FRACTION';
  amount: string | null;
  dayFraction: string | null;
}

export interface PenaltyRule {
  enabled: boolean;
  graceMinutes: number;
  freeOccurrences: number;
  bands: PenaltyBand[];
  repeated: { everyOccurrences: number; dayFraction: string } | null;
  monthlyCapAmount: string | null;
}

export interface PolicyConfig {
  schemaVersion: 1;
  payFrequency: 'MONTHLY';
  weeklyOffDays: number[];
  divisor: { method: 'CALENDAR_DAYS' | 'WORKING_DAYS' | 'FIXED_DAYS'; fixedDays: number | null };
  hoursPerDay: string;
  attendance: {
    halfDayValue: string;
    weeklyOffsPaidForDaily: boolean;
    holidaysPaidForDaily: boolean;
    missingAttendance: 'EXCEPTION' | 'UNPAID';
    requireApprovedAttendance: boolean;
  };
  overtime: {
    enabled: boolean;
    requiresApproval: boolean;
    minimumMinutes: number;
    roundToMinutes: number;
    roundingMode: 'DOWN' | 'NEAREST' | 'UP';
    dailyCapMinutes: number | null;
    monthlyCapMinutes: number | null;
    multipliers: { workingDay: string; weeklyOff: string; holiday: string };
  };
  lateArrival: PenaltyRule;
  earlyDeparture: PenaltyRule;
  rounding: { netPayScale: 0 | 1 | 2; netPayMode: 'HALF_UP' | 'UP' | 'DOWN' };
}

export interface VersionBrief {
  number: number;
  effectiveFrom: string;
  components?: number;
}

export interface PolicySummary {
  id: string;
  policyCode: string;
  policyName: string;
  description: string | null;
  isDefault: boolean;
  status: 'ACTIVE' | 'ARCHIVED';
  currentVersion: VersionBrief | null;
  upcomingVersion: VersionBrief | null;
  draft: VersionBrief | null;
  scopeCount: number;
}

export interface PolicyScopes {
  departmentIds: string[];
  branchIds: string[];
  employmentTypeIds: string[];
  designationIds: string[];
}

export interface PolicyVersion {
  id: string;
  number: number;
  status: VersionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  config: PolicyConfig;
  changeNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
}

export interface PolicyDetail extends Omit<PolicySummary, 'currentVersion' | 'upcomingVersion' | 'draft' | 'scopeCount'> {
  scopes: PolicyScopes;
  versions: PolicyVersion[];
  lockedThrough: string | null;
}

export interface Option {
  id: string;
  name: string;
}

export interface ScopeOptions {
  departments: Option[];
  branches: Option[];
  employmentTypes: Option[];
  designations: Option[];
}

export const policiesApi = {
  list: (archived = false) => data(apiClient.get<Envelope<PolicySummary[]>>(`/payroll/policies${archived ? '?archived=true' : ''}`)),
  template: () => data(apiClient.get<Envelope<{ config: PolicyConfig }>>('/payroll/policies/template')),
  scopeOptions: () => data(apiClient.get<Envelope<ScopeOptions>>('/payroll/policies/scope-options')),
  get: (id: string) => data(apiClient.get<Envelope<PolicyDetail>>(`/payroll/policies/${id}`)),
  create: (input: { policyCode: string; policyName: string; description?: string; isDefault: boolean; effectiveFrom: string }) =>
    data(apiClient.post<Envelope<PolicyDetail>>('/payroll/policies', input)),
  update: (id: string, input: { policyName: string; description?: string; isDefault: boolean }) => data(apiClient.put<Envelope<PolicyDetail>>(`/payroll/policies/${id}`, input)),
  setScopes: (id: string, scopes: PolicyScopes) => data(apiClient.put<Envelope<PolicyDetail>>(`/payroll/policies/${id}/scopes`, scopes)),
  saveDraft: (id: string, input: { effectiveFrom: string; config: PolicyConfig; changeNote?: string }) => data(apiClient.put<Envelope<PolicyDetail>>(`/payroll/policies/${id}/draft`, input)),
  discardDraft: (id: string) => data(apiClient.delete<Envelope<PolicyDetail>>(`/payroll/policies/${id}/draft`)),
  publish: (id: string) => data(apiClient.post<Envelope<PolicyDetail>>(`/payroll/policies/${id}/draft/publish`)),
  archive: (id: string) => data(apiClient.post<Envelope<PolicyDetail>>(`/payroll/policies/${id}/archive`)),
};

/* ── Components ───────────────────────────────────────────── */

export interface ComponentSettings {
  componentName: string;
  description?: string | null;
  category: ComponentCategory;
  calculationType: CalculationType;
  systemRule: SystemRule | null;
  isStatutory: boolean;
  isTaxable: boolean;
  isProrated: boolean;
  includeInGross: boolean;
  includeInCtc: boolean;
  showOnPayslip: boolean;
  minAmount: string | null;
  maxAmount: string | null;
  roundingScale: number;
  roundingMode: RoundingMode;
  displayOrder: number;
}

export interface SalaryComponent extends ComponentSettings {
  id: string;
  componentCode: string;
  status: 'ACTIVE' | 'ARCHIVED';
  usedInPublished: boolean;
}

export const componentsApi = {
  list: (archived = false) => data(apiClient.get<Envelope<SalaryComponent[]>>(`/salary/components${archived ? '?archived=true' : ''}`)),
  create: (input: ComponentSettings & { componentCode: string }) => data(apiClient.post<Envelope<SalaryComponent>>('/salary/components', input)),
  update: (id: string, input: ComponentSettings) => data(apiClient.put<Envelope<SalaryComponent>>(`/salary/components/${id}`, input)),
  archive: (id: string) => data(apiClient.post<Envelope<SalaryComponent>>(`/salary/components/${id}/archive`)),
  restore: (id: string) => data(apiClient.post<Envelope<SalaryComponent>>(`/salary/components/${id}/restore`)),
};

/* ── Structures ───────────────────────────────────────────── */

export interface SystemVariable {
  name: string;
  label: string;
  description: string;
  group: 'Salary' | 'Days' | 'Hours' | 'Late & early';
  sample: string;
}

export interface StructureLineInput {
  salaryComponentId: string;
  defaultAmount: string | null;
  defaultPercentage: string | null;
  percentageBase: string | null;
  formula: string | null;
  isMandatory: boolean;
}

export interface StructureLine extends StructureLineInput {
  component: SalaryComponent;
}

export interface StructureSummary {
  id: string;
  structureCode: string;
  structureName: string;
  payFrequency: string;
  status: 'ACTIVE' | 'ARCHIVED';
  currentVersion: VersionBrief | null;
  upcomingVersion: VersionBrief | null;
  draft: VersionBrief | null;
}

export interface StructureVersion {
  id: string;
  number: number;
  status: VersionStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
  changeNote: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  lines: StructureLine[];
}

export interface StructureDetail {
  id: string;
  structureCode: string;
  structureName: string;
  payFrequency: string;
  status: 'ACTIVE' | 'ARCHIVED';
  lockedThrough: string | null;
  versions: StructureVersion[];
}

export interface CalculatedLine {
  code: string;
  name: string;
  category: ComponentCategory;
  fullAmount?: string;
  amount: string;
  steps: string[];
}

export interface Totals {
  gross: string;
  earnings: string;
  deductions: string;
  employerContributions: string;
  net: string;
}

export interface StructurePreview {
  problems: Problem[];
  lines: CalculatedLine[];
  totals: Totals;
  variables: Record<string, string>;
}

export interface PreviewInput {
  lines: StructureLineInput[];
  variables?: Record<string, string>;
  overrides?: Record<string, { amount?: string | null; percentage?: string | null }>;
  provided?: Record<string, string>;
}

export const structuresApi = {
  formulaReference: () => data(apiClient.get<Envelope<{ variables: SystemVariable[]; functions: string[] }>>('/salary/formula-reference')),
  list: (archived = false) => data(apiClient.get<Envelope<StructureSummary[]>>(`/salary/structures${archived ? '?archived=true' : ''}`)),
  get: (id: string) => data(apiClient.get<Envelope<StructureDetail>>(`/salary/structures/${id}`)),
  create: (input: { structureCode: string; structureName: string; effectiveFrom: string; changeNote?: string; lines: StructureLineInput[] }) =>
    data(apiClient.post<Envelope<StructureDetail>>('/salary/structures', input)),
  rename: (id: string, structureName: string) => data(apiClient.put<Envelope<StructureDetail>>(`/salary/structures/${id}`, { structureName })),
  saveDraft: (id: string, input: { effectiveFrom: string; changeNote?: string; lines: StructureLineInput[] }) => data(apiClient.put<Envelope<StructureDetail>>(`/salary/structures/${id}/draft`, input)),
  discardDraft: (id: string) => data(apiClient.post<Envelope<StructureDetail>>(`/salary/structures/${id}/draft/discard`)),
  publish: (id: string) => data(apiClient.post<Envelope<StructureDetail>>(`/salary/structures/${id}/draft/publish`)),
  archive: (id: string) => data(apiClient.post<Envelope<StructureDetail>>(`/salary/structures/${id}/archive`)),
  preview: (input: PreviewInput) => data(apiClient.post<Envelope<StructurePreview>>('/salary/structures/preview', input)),
};

/* ── Employee salaries ────────────────────────────────────── */

export interface SalaryRevision {
  id: string;
  status: 'ACTIVE' | 'CANCELLED';
  effectiveFrom: string;
  effectiveTo: string | null;
  structure: { id: string; code: string; name: string };
  policy: { id: string; code: string; name: string } | null;
  payBasis: PayBasis;
  monthlySalary: string | null;
  annualCtc: string | null;
  baseRate: string | null;
  currencyCode: string;
  isOvertimeEligible: boolean;
  paymentMethod: PaymentMethod;
  changeReason: string | null;
  createdAt: string;
  createdBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  componentValues: { salaryComponentId: string; code: string; name: string; amount: string | null; percentage: string | null }[];
}

export interface EmployeeSalary {
  employee: { id: string; employeeCode: string; name: string };
  lockedThrough: string | null;
  currentId: string | null;
  upcomingId: string | null;
  policy: {
    policy: { id: string; policyCode: string; policyName: string } | null;
    version: { id: string; number: number; effectiveFrom: string } | null;
    reason: string | null;
    problem: string | null;
  } | null;
  estimate: { month: string; version?: number; problems: Problem[]; lines: CalculatedLine[]; totals: Totals | null } | null;
  history: SalaryRevision[];
  arrears: { id: string; salaryAssignmentId: string; status: 'PENDING' | 'INCLUDED' | 'CANCELLED'; period: { start: string; end: string }; paid: string; revised: string; amount: string; includedAt: string | null }[];
}

export interface RevisionInput {
  salaryStructureId: string;
  effectiveFrom: string;
  payBasis: PayBasis;
  monthlySalary: string | null;
  annualCtc: string | null;
  baseRate: string | null;
  currencyCode: string;
  payrollPolicyId: string | null;
  isOvertimeEligible: boolean;
  paymentMethod: PaymentMethod;
  changeReason: string;
  componentValues: { salaryComponentId: string; amount: string | null; percentage: string | null }[];
  arrearsFrom?: string | null;
}

export const employeeSalaryApi = {
  get: (employeeId: string) => data(apiClient.get<Envelope<EmployeeSalary>>(`/salary/employees/${employeeId}`)),
  revise: (employeeId: string, input: RevisionInput) => data(apiClient.post<Envelope<EmployeeSalary>>(`/salary/employees/${employeeId}/revisions`, input)),
  cancel: (assignmentId: string, reason: string) => data(apiClient.post<Envelope<EmployeeSalary>>(`/salary/assignments/${assignmentId}/cancel`, { reason })),
};

/* ── Salary import ────────────────────────────────────────── */

export interface ImportStructureInput {
  sourceName: string;
  basis: 'MONTHLY' | 'HOURLY';
}

export interface ImportRowInput {
  rowNumber: number;
  employeeName: string;
  altName?: string;
  structureName: string;
  startDate: string;
  amount: string;
}

export interface ImportEmployee {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface ImportPreview {
  structures: (ImportStructureInput & { code: string; existing: { id: string; name: string } | null; effectiveFrom: string | null })[];
  rows: (Omit<ImportRowInput, 'altName'> & { basis: 'MONTHLY' | 'HOURLY' | null; suggestedEmployeeId: string | null; candidates: ImportEmployee[]; notes: string[] })[];
  employees: ImportEmployee[];
  lockedThrough: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  results: { rowNumber: number; outcome: 'IMPORTED' | 'SKIPPED'; reason: string | null }[];
}

export const salaryImportApi = {
  preview: (input: { structures: ImportStructureInput[]; rows: ImportRowInput[] }) => data(apiClient.post<Envelope<ImportPreview>>('/salary/imports/preview', input)),
  commit: (input: { structures: ImportStructureInput[]; rows: (ImportRowInput & { employeeId: string })[] }) => data(apiClient.post<Envelope<ImportResult>>('/salary/imports/commit', input)),
};

/* ── Pay calculation ──────────────────────────────────────── */

export interface PayableEmployee {
  id: string;
  code: string;
  name: string;
  status: string;
  hasSalary: boolean;
}

export interface PayLine {
  salaryComponentId: string;
  componentCode: string;
  componentName: string;
  componentCategory: ComponentCategory;
  calculationType: string;
  amount: string;
  displayOrder: number;
  showOnPayslip: boolean;
  source: 'STRUCTURE' | 'VARIABLE_INPUT' | 'SYSTEM';
  steps: string[];
}

export interface EmployeePay {
  employee: { id: string; code: string; name: string };
  period: { start: string; end: string };
  status: 'READY' | 'EXCEPTION';
  exceptions: string[];
  warnings: string[];
  currency: string;
  segments: {
    from: string;
    to: string;
    structure: { code: string; name: string; version: number };
    policy: { code: string; name: string; version: number; reason: string } | null;
    payBasis: PayBasis;
    variables: Record<string, string>;
  }[];
  attendance: {
    calendarDays: number; workingDays: number; presentDays: string; halfDays: number; paidLeaveDays: number; unpaidLeaveDays: number; absentDays: number;
    holidays: number; weeklyOffs: number; missingDays: number; notEmployedDays: number; paidDays: string; unpaidDays: string;
    workedMinutes: number; payableMinutes: number; lateCount: number; lateMinutes: number; earlyCount: number; earlyMinutes: number; overtimeMinutes: number;
  };
  lines: PayLine[];
  totals: { earnings: string; deductions: string; employerContributions: string; gross: string; netBeforeRounding: string; roundingAdjustment: string; net: string };
}

export const payCalculationApi = {
  employees: (month: string) => data(apiClient.get<Envelope<PayableEmployee[]>>(`/payroll/calculation/employees?month=${encodeURIComponent(month)}`)),
  preview: (employeeId: string, month: string) => data(apiClient.get<Envelope<EmployeePay>>(`/payroll/calculation/preview?employeeId=${encodeURIComponent(employeeId)}&month=${encodeURIComponent(month)}`)),
};

/* ── Monthly entries, overtime, loans ─────────────────────── */

export interface InputEntry {
  id: string;
  employee: { id: string; code: string; name: string };
  component: { code: string; name: string; category: ComponentCategory };
  amount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  note: string | null;
  rejectionReason: string | null;
  createdBy: string | null;
  createdByMemberId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface InputMonth {
  month: string;
  finalized: boolean;
  entries: InputEntry[];
}

export const inputsApi = {
  components: () => data(apiClient.get<Envelope<{ id: string; code: string; name: string; category: ComponentCategory }[]>>('/payroll/inputs/components')),
  list: (month: string) => data(apiClient.get<Envelope<InputMonth>>(`/payroll/inputs?month=${encodeURIComponent(month)}`)),
  create: (input: { month: string; employeeId: string; salaryComponentId: string; amount: string; note?: string }) => data(apiClient.post<Envelope<InputMonth>>('/payroll/inputs', input)),
  update: (id: string, input: { amount: string; note?: string }) => data(apiClient.put<Envelope<InputMonth>>(`/payroll/inputs/${id}`, input)),
  approve: (id: string) => data(apiClient.post<Envelope<InputMonth>>(`/payroll/inputs/${id}/approve`)),
  reject: (id: string, reason: string) => data(apiClient.post<Envelope<InputMonth>>(`/payroll/inputs/${id}/reject`, { reason })),
  cancel: (id: string) => data(apiClient.post<Envelope<InputMonth>>(`/payroll/inputs/${id}/cancel`)),
};

export interface OvertimeDay {
  employee: { id: string; code: string; name: string };
  date: string;
  attendanceStatus: string;
  recordedMinutes: number;
  eligible: boolean;
  state: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGED';
  approvedMinutes: number | null;
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface OvertimeDecision {
  employeeId: string;
  date: string;
  decision: 'APPROVED' | 'REJECTED';
  approvedMinutes?: number;
  note?: string;
}

export const overtimeApi = {
  list: (month: string) => data(apiClient.get<Envelope<OvertimeDay[]>>(`/payroll/overtime?month=${encodeURIComponent(month)}`)),
  decide: (decisions: OvertimeDecision[]) => data(apiClient.post<Envelope<{ decided: number }>>('/payroll/overtime/decisions', { decisions })),
};

export interface LoanSummary {
  id: string;
  loanNumber: string;
  loanType: 'LOAN' | 'ADVANCE';
  employee: { id: string; code: string; name: string };
  principal: string;
  installmentAmount: string;
  firstMonth: string;
  expectedEnd: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  recovered: string;
  outstanding: string;
  nextDue: { date: string; amount: string } | null;
}

export interface LoanDetail extends LoanSummary {
  installments: { id: string; number: number; dueDate: string; amount: string; status: 'SCHEDULED' | 'RECOVERED' | 'DEFERRED' | 'CANCELLED' }[];
  repayments: { date: string; amount: string; source: string; notes: string | null }[];
}

export const loansApi = {
  list: (status?: string) => data(apiClient.get<Envelope<LoanSummary[]>>(`/payroll/loans${status ? `?status=${status}` : ''}`)),
  get: (id: string) => data(apiClient.get<Envelope<LoanDetail>>(`/payroll/loans/${id}`)),
  create: (input: { employeeId: string; loanType: 'LOAN' | 'ADVANCE'; principal: string; installments?: number; installmentAmount?: string; firstMonth: string; note?: string }) =>
    data(apiClient.post<Envelope<LoanDetail>>('/payroll/loans', input)),
  defer: (id: string, installmentId: string, reason: string) => data(apiClient.post<Envelope<LoanDetail>>(`/payroll/loans/${id}/installments/${installmentId}/defer`, { reason })),
  cancel: (id: string, reason: string) => data(apiClient.post<Envelope<LoanDetail>>(`/payroll/loans/${id}/cancel`, { reason })),
};

/* ── Payroll overview ─────────────────────────────────────── */

export type RunStatus = 'DRAFT' | 'CALCULATED' | 'REVIEWED' | 'APPROVED' | 'FINALIZED';

export interface OverviewTotals {
  totalCost: string;
  earnings: string;
  deductions: string;
  employerContributions: string;
  net: string;
  employees: number;
  ready: number;
  exceptions: number;
}

export interface PayrollOverview {
  month: string;
  currency: string;
  period: { id: string; start: string; end: string; paymentDate: string | null } | null;
  run: { id: string; number: string; status: RunStatus; calculatedAt: string | null; approvedAt: string | null; finalizedAt: string | null } | null;
  summary: OverviewTotals | null;
  previous: (OverviewTotals & { month: string }) | null;
  changes: { totalCost: string | null; deductions: string | null; employerContributions: string | null; employees: string | null } | null;
  trend: { month: string; totalCost: string | null; status: RunStatus | null }[];
  readiness: { activeEmployees: number; withoutSalary: number };
}

export type OverviewEmployeeStatus = 'READY' | 'APPROVED' | 'FINALIZED' | 'EXCEPTION';

export interface OverviewEmployee {
  employeeId: string;
  name: string;
  code: string;
  department: string | null;
  designation: string | null;
  gross: string;
  deductions: string;
  net: string;
  status: OverviewEmployeeStatus;
  problem: string | null;
  payslipNumber: string | null;
  payment: { status: string; date: string | null } | null;
  paymentDate: string | null;
}

export interface OverviewEmployeePage {
  total: number;
  page: number;
  limit: number;
  counts: { all: number; ready: number; exceptions: number; finalized: number };
  items: OverviewEmployee[];
}

export const payrollOverviewApi = {
  get: (month: string) => data(apiClient.get<Envelope<PayrollOverview>>(`/payroll/dashboard?month=${encodeURIComponent(month)}`)),
  employees: (query: { month: string; status: 'ALL' | 'READY' | 'EXCEPTION' | 'FINALIZED'; search: string; page: number; limit: number }) => {
    const params = new URLSearchParams({ month: query.month, status: query.status, page: String(query.page), limit: String(query.limit) });
    if (query.search.trim()) params.set('search', query.search.trim());
    return data(apiClient.get<Envelope<OverviewEmployeePage>>(`/payroll/dashboard/employees?${params}`));
  },
};
