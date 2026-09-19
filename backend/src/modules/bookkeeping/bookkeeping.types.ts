import { Prisma } from '@prisma/client';

export type AccountCategory = 'EXPENSE' | 'LIABILITY' | 'ASSET' | 'EQUITY' | 'REVENUE';
export type EntrySide = 'DEBIT' | 'CREDIT';
export type VoucherType = 'PAYROLL_ACCRUAL' | 'PAYROLL_PAYMENT' | 'STATUTORY_REMITTANCE' | 'MANUAL_JOURNAL' | 'YEAR_END_CLOSING';

export interface CreateFinancialYearDto {
  financialYearCode: string; // e.g. "FY-2026-27"
  financialYearName: string; // e.g. "Financial Year 2026-2027"
  startDate: string;        // "YYYY-MM-DD" e.g. "2026-04-01"
  endDate: string;          // "YYYY-MM-DD" e.g. "2027-03-31"
  assessmentYear?: string;  // e.g. "AY-2027-28"
  notes?: string;
}

export interface StandardLedgerDefinition {
  code: string;
  name: string;
  category: AccountCategory;
  normalBalance: EntrySide;
  description: string;
}

export const STANDARD_PAYROLL_LEDGERS: StandardLedgerDefinition[] = [
  {
    code: 'EXP_SALARY_WAGES',
    name: 'Salaries & Wages Expense',
    category: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Gross employee compensation, allowances, and wage expense',
  },
  {
    code: 'EXP_EMPLOYER_PF',
    name: 'Employer PF Contribution Expense',
    category: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Statutory employer contributions towards Employees Provident Fund',
  },
  {
    code: 'EXP_EMPLOYER_ESI',
    name: 'Employer ESI Contribution Expense',
    category: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Statutory employer contributions towards Employees State Insurance',
  },
  {
    code: 'EXP_BONUS',
    name: 'Bonus & Incentives Expense',
    category: 'EXPENSE',
    normalBalance: 'DEBIT',
    description: 'Performance bonus, ex-gratia, and variable performance incentives',
  },
  {
    code: 'LIA_NET_SALARY_PAYABLE',
    name: 'Net Salary Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Disbursable net wage liability owed directly to employees via bank transfer',
  },
  {
    code: 'LIA_PF_PAYABLE',
    name: 'Provident Fund (PF) Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Statutory employee and employer EPF contributions awaiting EPFO remittance',
  },
  {
    code: 'LIA_ESI_PAYABLE',
    name: 'ESIC Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Statutory employee and employer ESIC contributions awaiting monthly challan payment',
  },
  {
    code: 'LIA_PT_PAYABLE',
    name: 'Professional Tax (PT) Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'State statutory professional tax deducted from payroll awaiting treasury payment',
  },
  {
    code: 'LIA_TDS_PAYABLE',
    name: 'TDS (Income Tax) Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Income tax deducted at source under Section 192 awaiting central remittance',
  },
  {
    code: 'LIA_OTHER_DEDUCTIONS',
    name: 'Other Payroll Deductions Payable',
    category: 'LIABILITY',
    normalBalance: 'CREDIT',
    description: 'Miscellaneous employee payroll deductions, canteen, insurance, or recovery',
  },
  {
    code: 'AST_BANK_PRIMARY',
    name: 'Primary Operating Bank Account',
    category: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Corporate bank account from which salary disbursements and tax remittances are funded',
  },
  {
    code: 'AST_SALARY_ADVANCE',
    name: 'Salary Advances & Employee Loans',
    category: 'ASSET',
    normalBalance: 'DEBIT',
    description: 'Short-term wage advances, festival loans, and employee receivables',
  },
];

export interface TrialBalanceItem {
  ledgerId: string;
  ledgerCode: string;
  ledgerName: string;
  accountCategory: AccountCategory;
  normalBalance: EntrySide;
  openingBalance: string;
  totalDebits: string;
  totalCredits: string;
  closingBalance: string;
}

export interface TrialBalanceResponse {
  financialYear: {
    id: string;
    code: string;
    name: string;
    startDate: string;
    endDate: string;
    isCurrent: boolean;
    isClosed: boolean;
  };
  items: TrialBalanceItem[];
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
  difference: string;
}

export interface SyncAccountingResult {
  financialYearCreated: boolean;
  financialYearCode: string;
  ledgersSeeded: number;
  payrollRunsProcessed: number;
  journalEntriesCreated: number;
  totalDebits: string;
  totalCredits: string;
  isBalanced: boolean;
}
