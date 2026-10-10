/**
 * The system values a salary formula can use besides other components. Each
 * is worked out for the employee and the month by payroll, never typed in;
 * the sample is what a structure preview starts from.
 */
export interface SystemVariable {
  name: string;
  label: string;
  description: string;
  group: 'Salary' | 'Days' | 'Hours' | 'Late & early';
  sample: string;
}

export const SYSTEM_VARIABLES: SystemVariable[] = [
  { name: 'MONTHLY_SALARY', label: 'Monthly salary', group: 'Salary', sample: '50000', description: 'The full monthly salary on the employee’s salary assignment.' },
  { name: 'ANNUAL_CTC', label: 'Annual CTC', group: 'Salary', sample: '600000', description: 'The annual cost to company on the salary assignment.' },
  { name: 'DAILY_RATE', label: 'Daily rate', group: 'Salary', sample: '1666.67', description: 'The day rate for people paid by the day; otherwise the monthly salary divided by the divisor.' },
  { name: 'HOURLY_RATE', label: 'Hourly rate', group: 'Salary', sample: '208.33', description: 'The hourly rate for people paid by the hour; otherwise the daily rate divided by standard hours per day.' },
  { name: 'GROSS', label: 'Gross earnings', group: 'Salary', sample: '50000', description: 'The total of every earning counted in gross, for a full month. Only deductions and employer contributions can use it.' },
  { name: 'PRORATION', label: 'Paid share of the month', group: 'Days', sample: '1', description: 'From 0 to 1: the share of the month paid, after unpaid days. Components set to “pay in proportion to paid days” are multiplied by it.' },
  { name: 'CALENDAR_DAYS', label: 'Calendar days', group: 'Days', sample: '30', description: 'Days in the pay period.' },
  { name: 'WORKING_DAYS', label: 'Working days', group: 'Days', sample: '26', description: 'Days in the period that are neither weekly offs nor holidays.' },
  { name: 'DIVISOR', label: 'Divisor', group: 'Days', sample: '30', description: 'What a monthly salary is divided by for a day’s pay, from the payroll policy.' },
  { name: 'PAID_DAYS', label: 'Paid days', group: 'Days', sample: '30', description: 'Days paid in the period: present days, paid leave, and paid weekly offs and holidays.' },
  { name: 'UNPAID_DAYS', label: 'Unpaid days', group: 'Days', sample: '0', description: 'Days not paid: absences, unpaid leave and unpaid half days.' },
  { name: 'PRESENT_DAYS', label: 'Present days', group: 'Days', sample: '26', description: 'Days the employee attended, half days counted as the policy’s half-day value.' },
  { name: 'HALF_DAYS', label: 'Half days', group: 'Days', sample: '0', description: 'Days marked as half days.' },
  { name: 'PAID_LEAVE_DAYS', label: 'Paid leave days', group: 'Days', sample: '0', description: 'Approved paid leave in the period.' },
  { name: 'UNPAID_LEAVE_DAYS', label: 'Unpaid leave days', group: 'Days', sample: '0', description: 'Approved unpaid leave in the period.' },
  { name: 'HOLIDAYS', label: 'Holidays', group: 'Days', sample: '0', description: 'Holidays in the period on the employee’s holiday calendar.' },
  { name: 'WEEKLY_OFFS', label: 'Weekly offs', group: 'Days', sample: '4', description: 'Weekly off days in the period.' },
  { name: 'HOURS_PER_DAY', label: 'Standard hours per day', group: 'Hours', sample: '8', description: 'Standard hours in a working day, from the payroll policy.' },
  { name: 'WORKED_HOURS', label: 'Worked hours', group: 'Hours', sample: '208', description: 'Hours worked in the period, from attendance.' },
  { name: 'PAYABLE_HOURS', label: 'Payable hours', group: 'Hours', sample: '208', description: 'Hours paid in the period, from attendance.' },
  { name: 'OVERTIME_HOURS', label: 'Approved overtime hours', group: 'Hours', sample: '0', description: 'Approved overtime in the period, after the policy’s minimum, rounding and caps.' },
  { name: 'LATE_COUNT', label: 'Late arrivals', group: 'Late & early', sample: '0', description: 'Days the employee arrived after the grace period.' },
  { name: 'LATE_MINUTES', label: 'Minutes late', group: 'Late & early', sample: '0', description: 'Total minutes late after the grace period.' },
  { name: 'EARLY_COUNT', label: 'Early departures', group: 'Late & early', sample: '0', description: 'Days the employee left before the shift ended, after the grace period.' },
  { name: 'EARLY_MINUTES', label: 'Minutes left early', group: 'Late & early', sample: '0', description: 'Total minutes left early after the grace period.' },
];

export const SYSTEM_VARIABLE_NAMES = new Set(SYSTEM_VARIABLES.map((v) => v.name));

/** A component code: capitals, digits and underscores, and never a system value’s name. */
export const COMPONENT_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;
