export type TaxRegime = 'NEW' | 'OLD';

export type UserRole = 'ADMIN' | 'HR_ACCOUNTANT' | 'MANAGER' | 'EMPLOYEE' | 'SUPER_ADMIN';

export type AppView =
  | 'dashboard'
  | 'crm'
  | 'emails'
  | 'super-admin'
  | 'payroll'
  | 'people'
  | 'employee-detail'
  | 'add-employee'
  | 'edit-employee'
  | 'attendance'
  | 'clock-in'
  | 'onboarding'
  | 'offboarding'
  | 'performance'
  | 'payslips'
  | 'bookkeeping'
  | 'reports'
  | 'settings'
  | 'organization'
  | 'users'
  | 'my-email'
  | 'help';

export type CrmTab =
  | 'cold-funnel'
  | 'pipeline'
  | 'leads'
  | 'activities'
  | 'proposals'
  | 'reports'
  | 'masters'
  | 'audit-trail'
  | 'whatsapp';


/* ── Bank ──────────────────────────────────────────────────── */
export interface BankDetails {
  accountHolder: string;
  bankName: string;
  branchName?: string;
  accountNumberMasked: string;
  accountNumber?: string;
  ifsc: string;
  isValidIfsc: boolean;
}

/* ── Statutory ─────────────────────────────────────────────── */
export interface StatutoryDetails {
  pan: string;
  aadhaarLast4: string;
  uan?: string;
  esicNumber?: string;
  pfEnrolled: boolean;
  pfCapAtCeiling: boolean; // ₹15,000 statutory wage ceiling option
  esiEnrolled: boolean;
  ptApplicable: boolean;
  taxRegime: TaxRegime;
}

/* ── Salary ────────────────────────────────────────────────── */
export interface SalaryBreakdown {
  ctcAnnual: number;
  grossMonthly: number;
  basicMonthly: number;
  hraMonthly: number;
  specialAllowanceMonthly: number;
  conveyanceMonthly: number;
  medicalAllowanceMonthly: number;
}

/* ── Leave ─────────────────────────────────────────────────── */
export interface LeaveBalance {
  earned: number;
  usedEarned: number;
  sick: number;
  usedSick: number;
  casual: number;
  usedCasual: number;
}

/* ── Net pay trend (6-month sparkline) ─────────────────────── */
export interface PayTrendPoint {
  month: string;   // e.g. "Apr", "May"
  net: number;     // net pay in ₹
}

/* ── Attendance calendar cell ───────────────────────────────── */
export type AttendanceDayStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'HALF_DAY'
  | 'PAID_LEAVE'
  | 'UNPAID_LEAVE'
  | 'HOLIDAY'
  | 'WEEKEND'
  | 'FUTURE';

export interface AttendanceDay {
  date: string;          // YYYY-MM-DD
  status: AttendanceDayStatus;
}

/* ── Employee ──────────────────────────────────────────────── */
export interface Employee {
  id: string;
  code: string;
  name: string;
  avatarUrl?: string;
  department: string;
  designation: string;
  joiningDate: string;
  workState?: 'Maharashtra' | 'Gujarat' | 'Karnataka' | 'Delhi' | 'Tamil Nadu';
  workEmail: string;
  mobileNumber: string;
  status: 'ACTIVE' | 'RESIGNED' | 'ON_NOTICE' | 'INACTIVE' | 'PROBATION' | 'TERMINATED' | 'SUSPENDED' | 'EXITED' | (string & {});
  /** Only what the employee record actually holds; missing means not recorded, never a made-up value. */
  bank?: BankDetails;
  statutory?: StatutoryDetails;
  /** Not carried on the employee: salaries live in Payroll → employee salary (see SalaryPanel). */
  salary?: SalaryBreakdown;
  leaveBalance?: LeaveBalance;
  netPayTrend?: PayTrendPoint[];
  attendanceDays: AttendanceDay[];
  isNewJoiner?: boolean;
}

/* ── Attendance aggregates ─────────────────────────────────── */
export interface EmployeeAttendance {
  employeeId: string;
  monthDays: number;
  presentDays: number;
  paidLeaveDays: number;
  lossOfPayDays: number;
  payableDays: number;
}

/* ── Payroll input ─────────────────────────────────────────── */
export interface VariablePayrollInput {
  employeeId: string;
  bonus: number;
  overtimeHours: number;
  overtimePay: number;
  reimbursement: number;
  otherDeductions: number;
}

/* ── Payroll item ──────────────────────────────────────────── */
export interface EmployeePayrollItem {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  designation: string;
  workState: string;
  monthDays: number;
  payableDays: number;
  lossOfPayDays: number;
  // Earnings
  earnedBasic: number;
  earnedHra: number;
  earnedSpecial: number;
  earnedConveyance: number;
  bonus: number;
  overtimePay: number;
  reimbursement: number;
  grossEarnings: number;
  // Statutory & Other Deductions
  epfEmployee: number;
  epfEmployer: number;
  epsEmployer: number;
  esicEmployee: number;
  esicEmployer: number;
  pt: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
  // Net
  netPay: number;
  // Snapshots for audit
  bankSnapshot: BankDetails;
}

/* ── Anomaly ───────────────────────────────────────────────── */
export interface AnomalyItem {
  id: string;
  type: 'NEW_JOINER' | 'SALARY_JUMP' | 'MISSING_BANK' | 'HIGH_LOP' | 'ESI_QUALIFIED';
  severity: 'warning' | 'critical' | 'info';
  employeeId: string;
  employeeName: string;
  message: string;
  suggestedAction: string;
}

/* ── Payroll run ───────────────────────────────────────────── */
export interface PayrollRun {
  id: string;
  periodMonth: string; // e.g. "October 2026"
  periodCode: string;  // e.g. "2026-10"
  status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID';
  totalEmployees: number;
  totalGross: number;
  totalDeductions: number;
  totalNetPayout: number;
  totalEmployerContributions: number;
  calculatedAt?: string;
  approvedAt?: string;
  paidAt?: string;
  items: EmployeePayrollItem[];
  anomalies: AnomalyItem[];
}

/* ── Compliance calendar ───────────────────────────────────── */
export interface ComplianceCalendarItem {
  id: string;
  title: string;
  authority: 'EPFO' | 'ESIC' | 'State PT' | 'Income Tax';
  dueDate: string;
  period: string;
  status: 'PENDING' | 'PAID' | 'OVERDUE';
  amount?: number;
  filingType: string;
}

/* ── Payslip history entry ─────────────────────────────────── */
export interface PayslipHistoryEntry {
  month: string;       // "September 2026"
  periodCode: string;  // "2026-09"
  netPay: number;
  grossEarnings: number;
  totalDeductions: number;
  status: 'PAID' | 'PROCESSING';
}
