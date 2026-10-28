/**
 * The public demo deployment. With DEMO_MODE=true the API lists the demo
 * sign-ins on the sign-in page and refuses the routes in DemoModeGuard. The
 * same accounts are created by `npm run seed:demo`, so the page and the data
 * cannot drift apart.
 *
 * These credentials are public by design. Never set DEMO_MODE on a deployment
 * that holds real customer data.
 */
export const isDemoMode = () => process.env.DEMO_MODE === 'true';

export const DEMO_WORKSPACE = {
  tenantCode: 'DEMO',
  subdomain: 'nimbustech',
  legalName: 'Nimbus Tech Solutions Private Limited',
  displayName: 'Nimbus Tech Solutions',
} as const;

/** One password for every demo account keeps the sign-in page simple. */
export const DEMO_PASSWORD = 'Demo@2026!';

export interface DemoAccount {
  email: string;
  displayName: string;
  /** The tenant role the seed gives this account. */
  roleCode: string;
  /** Shown on the sign-in page. */
  label: string;
  summary: string;
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    email: 'admin@demo.nder.com',
    displayName: 'Aarav Mehta',
    roleCode: 'ADMIN',
    label: 'Administrator',
    summary: 'Every module: people, payroll, performance, CRM, onboarding and settings.',
  },
  {
    email: 'hr@demo.nder.com',
    displayName: 'Priya Nair',
    roleCode: 'HR_MANAGER',
    label: 'HR Manager',
    summary: 'Employees, attendance, leave approvals, onboarding and appraisals.',
  },
  {
    email: 'payroll@demo.nder.com',
    displayName: 'Rohit Kulkarni',
    roleCode: 'PAYROLL_MANAGER',
    label: 'Payroll Manager',
    summary: 'Salary structures, payroll runs, payslips and bookkeeping.',
  },
  {
    email: 'employee@demo.nder.com',
    displayName: 'Sneha Patil',
    roleCode: 'EMPLOYEE',
    label: 'Employee',
    summary: 'The default employee role: their own appraisal, nothing else.',
  },
];

/** What the public sign-in page may show about the demo, or null outside demo mode. */
export function demoSignIn() {
  if (!isDemoMode()) return null;
  return {
    password: DEMO_PASSWORD,
    accounts: DEMO_ACCOUNTS.map(({ email, label, summary }) => ({ email, label, summary })),
  };
}
