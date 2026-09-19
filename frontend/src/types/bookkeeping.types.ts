export type AccountCategory = 'EXPENSE' | 'LIABILITY' | 'ASSET' | 'EQUITY' | 'REVENUE';
export type EntrySide = 'DEBIT' | 'CREDIT';
export type VoucherType =
  | 'PAYROLL_ACCRUAL'
  | 'PAYROLL_PAYMENT'
  | 'STATUTORY_REMITTANCE'
  | 'MANUAL_JOURNAL'
  | 'YEAR_END_CLOSING';

export interface FinancialYear {
  id: string;
  tenant_id?: string;
  financial_year_code: string;
  financial_year_name: string;
  start_date: string;
  end_date: string;
  assessment_year?: string | null;
  is_current: boolean;
  is_closed: boolean;
  closed_at?: string | null;
  notes?: string | null;
  _count?: {
    rndtechnosoft_payroll_periods?: number;
    rndtechnosoft_bookkeeping_entries?: number;
  };
}

export interface AccountingLedger {
  id: string;
  ledger_code: string;
  ledger_name: string;
  account_category: AccountCategory;
  normal_balance: EntrySide;
  currency_code: string;
  is_system: boolean;
  is_active: boolean;
  description?: string | null;
}

export interface BookkeepingEntryLine {
  id: string;
  line_number: number;
  entry_side: EntrySide;
  amount: string | number;
  narration?: string | null;
  rndtechnosoft_accounting_ledgers?: {
    ledger_code: string;
    ledger_name: string;
    account_category: AccountCategory;
  };
}

export interface BookkeepingEntry {
  id: string;
  financial_year_id: string;
  payroll_run_id?: string | null;
  voucher_number: string;
  voucher_date: string;
  voucher_type: VoucherType;
  total_debit: string | number;
  total_credit: string | number;
  narration: string;
  entry_status: 'DRAFT' | 'POSTED' | 'VOID';
  posted_at?: string | null;
  rndtechnosoft_financial_years?: {
    financial_year_code: string;
    financial_year_name: string;
  };
  rndtechnosoft_payroll_runs?: {
    run_number: string;
    run_type: string;
  } | null;
  rndtechnosoft_bookkeeping_entry_lines: BookkeepingEntryLine[];
}

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
