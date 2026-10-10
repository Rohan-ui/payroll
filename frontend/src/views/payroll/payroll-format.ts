import type { CalculationType, ComponentCategory, PayBasis, PaymentMethod, SystemRule } from '../../api/payroll-setup.api';

export const CATEGORY: Record<ComponentCategory, { label: string; variant: 'success' | 'danger' | 'info' }> = {
  EARNING: { label: 'Earning', variant: 'success' },
  DEDUCTION: { label: 'Deduction', variant: 'danger' },
  EMPLOYER_CONTRIBUTION: { label: 'Employer contribution', variant: 'info' },
};

export const CALCULATION: Record<CalculationType, { label: string; hint: string }> = {
  FIXED: { label: 'Fixed amount', hint: 'A set amount a month, from the structure or the employee’s salary.' },
  PERCENTAGE: { label: 'Percentage', hint: 'A percentage of another component or of a system value such as the monthly salary.' },
  FORMULA: { label: 'Formula', hint: 'Worked out from a formula you write in the structure, such as min(BASIC, 15000) * 12%.' },
  MANUAL: { label: 'Entered each month', hint: 'An amount entered for the pay period, such as a bonus. Nothing is paid when none is entered.' },
  SYSTEM_CALCULATED: { label: 'Worked out by payroll', hint: 'Payroll works it out from attendance or records, by the rule chosen below.' },
};

export const SYSTEM_RULE: Record<SystemRule, string> = {
  OVERTIME: 'Overtime, from approved overtime and the policy’s rates',
  LATE_ARRIVAL: 'Late arrival deductions, from the policy',
  EARLY_DEPARTURE: 'Early departure deductions, from the policy',
  LOAN_RECOVERY: 'Loan and advance recovery',
  ARREARS: 'Arrears from earlier months',
};

export const PAY_BASIS: Record<PayBasis, string> = { MONTHLY: 'Monthly salary', DAILY: 'Paid by the day', HOURLY: 'Paid by the hour' };
export const PAYMENT_METHOD: Record<PaymentMethod, string> = { BANK_TRANSFER: 'Bank transfer', CASH: 'Cash', CHEQUE: 'Cheque' };

/** Days of the week, Monday first; values are 0 = Sunday … 6 = Saturday. */
export const WEEKDAYS = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 0, short: 'Sun', long: 'Sunday' },
];

/** A decimal string as money, for display only (never for arithmetic). */
export const money = (value: string | null | undefined, currency = 'INR') => {
  if (value === null || value === undefined || value === '') return '—';
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value));
  } catch {
    return value;
  }
};

/** A YYYY-MM-DD date as people read it. */
export const day = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
};

/** Today as YYYY-MM-DD in the viewer's time zone. */
export const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** The first day of next month as YYYY-MM-DD: a sensible start for a change. */
export const nextMonthIso = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
};

export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'That did not work. Try again.');

export const cardClass = 'bg-white dark:bg-[#181724] rounded-xl border border-slate-200 dark:border-[#2B293E]';
export const fieldClass = 'w-full rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-500 dark:disabled:bg-white/5';
export const labelClass = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1';
export const hintClass = 'mt-1 text-xs text-slate-500 dark:text-slate-400';
export const thClass = 'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
export const tdClass = 'px-4 py-3 align-top';
