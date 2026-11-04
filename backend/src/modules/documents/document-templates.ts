import { Prisma } from '@prisma/client';
import { OFFBOARDING_DOCUMENT_TYPES } from '../offboarding/dto/offboarding.dto';

/**
 * Document templates: text with {{placeholders}}. Each kind has a fixed set
 * of placeholders, filled from verified records by the server; a template may
 * use no other, so nothing is ever left blank by a typo.
 */

export const TEMPLATE_KINDS = [
  'OFFER_LETTER',
  'APPOINTMENT_LETTER',
  'EMPLOYMENT_CONTRACT',
  'EMPLOYMENT_AGREEMENT',
  'JOINING_LETTER',
  'WELCOME_LETTER',
  'NDA',
  'SALARY_REVISION',
  'EXPERIENCE_LETTER',
  'RELIEVING_LETTER',
  'CERTIFICATE',
  'CUSTOM_HR',
  'OFFBOARDING_LETTER',
  'QUOTATION',
  'APPRAISAL_LETTER',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number] | (string & {});

/** Kinds that can be created now. All HR and business document kinds are fully supported. */
export const AVAILABLE_TEMPLATE_KINDS: readonly string[] = [
  'OFFER_LETTER',
  'APPOINTMENT_LETTER',
  'EMPLOYMENT_CONTRACT',
  'EMPLOYMENT_AGREEMENT',
  'JOINING_LETTER',
  'WELCOME_LETTER',
  'NDA',
  'SALARY_REVISION',
  'EXPERIENCE_LETTER',
  'RELIEVING_LETTER',
  'CERTIFICATE',
  'CUSTOM_HR',
  'OFFBOARDING_LETTER',
  'QUOTATION',
  'APPRAISAL_LETTER',
];

/** Kinds whose documents carry a table of amounts (the offered pay, a quotation's lines), placed where the template puts it. */
export const TABLE_KINDS: Partial<Record<string, string>> = {
  OFFER_LETTER: 'pay table',
  APPOINTMENT_LETTER: 'pay table',
  EMPLOYMENT_CONTRACT: 'pay table',
  SALARY_REVISION: 'salary table',
  QUOTATION: 'items table',
  OFFBOARDING_LETTER: 'pay table'
};

export const HR_COMMON_PLACEHOLDERS: { key: string; description: string; sample: string }[] = [
  { key: 'candidate_name', description: "The candidate's full name", sample: 'Harshit Dhodi' },
  { key: 'candidate_id', description: 'The candidate reference ID', sample: 'CAN-2026-243723' },
  { key: 'candidate_code', description: 'The candidate reference code', sample: 'CAN-2026-243723' },
  { key: 'candidate_email', description: "The candidate's email", sample: 'harshit@rndtechnosoft.com' },
  { key: 'email', description: "The candidate's email", sample: 'harshit@rndtechnosoft.com' },
  { key: 'candidate_phone', description: "The candidate's phone number", sample: '1234567890' },
  { key: 'phone', description: "The candidate's phone number", sample: '1234567890' },
  { key: 'address', description: "The candidate's address", sample: 'Pune, Maharashtra' },
  { key: 'candidate_address', description: "The candidate's address", sample: 'Pune, Maharashtra' },
  { key: 'job_title', description: 'The job title offered or held', sample: 'Lead Full Stack Engineer' },
  { key: 'designation', description: 'The designation', sample: 'Lead Full Stack Engineer' },
  { key: 'department', description: 'The department name', sample: 'TECH' },
  { key: 'employment_type', description: 'Full-time, contract, etc.', sample: 'Full-time' },
  { key: 'annual_salary', description: 'Annual compensation (CTC)', sample: 'INR 7,80,000.00' },
  { key: 'salary', description: 'Total annual pay (CTC)', sample: 'INR 7,80,000.00' },
  { key: 'expected_salary', description: 'Expected annual compensation', sample: 'INR 65,000.00' },
  { key: 'joining_date', description: 'The expected joining date', sample: '1 September 2026' },
  { key: 'expected_joining_date', description: 'The expected joining date', sample: '1 September 2026' },
  { key: 'work_location', description: 'Where they will work', sample: 'Pune Head Office' },
  { key: 'reporting_manager', description: 'The manager they report to', sample: 'Ravi Shah' },
  { key: 'recruiter_name', description: 'The recruiter handling onboarding', sample: 'Ravi Shah' },
  { key: 'recruiter', description: 'The recruiter handling onboarding', sample: 'Ravi Shah' },
  { key: 'probation_period', description: 'The probation duration', sample: '3 months' },
  { key: 'experience', description: 'Total years of experience', sample: '1.0 years' },
  { key: 'experience_years', description: 'Total years of experience', sample: '1.0' },
  { key: 'hiring_source', description: 'Where the candidate was sourced', sample: 'LINKEDIN' },
  { key: 'company_name', description: 'Your company’s legal name', sample: 'RND Technosoft' },
  { key: 'company_address', description: 'Your company’s registered address', sample: 'Tech Park, Pune' },
  { key: 'company_phone', description: 'Your company’s phone number', sample: '+91 20 1234 5678' },
  { key: 'company_email', description: 'Your company’s contact email', sample: 'hr@rndtechnosoft.com' },
  { key: 'company_website', description: 'Your company’s website', sample: 'https://rndtechnosoft.com' },
  { key: 'special_terms', description: 'Any special terms or conditions', sample: 'Subject to company policies.' },
  { key: 'offer_reference', description: 'Reference number', sample: 'DOC-2026-1001' },
  { key: 'offer_expiry_date', description: 'The last day to accept', sample: '15 October 2026' },
  { key: 'employee_name', description: "The employee / candidate's full name", sample: 'Harshit Dhodi' },
  { key: 'employee_code', description: 'The employee / candidate code', sample: 'CAN-2026-243723' },
  { key: 'today', description: "Today's date", sample: '28 October 2026' },
  { key: 'date', description: "Today's date", sample: '28 October 2026' },
  // Salary structure placeholders
  { key: 'basic_salary', description: 'Basic salary (monthly)', sample: 'INR 25,000.00' },
  { key: 'basic_salary_annual', description: 'Basic salary (annual)', sample: 'INR 3,00,000.00' },
  { key: 'hra', description: 'House rent allowance (monthly)', sample: 'INR 12,500.00' },
  { key: 'hra_annual', description: 'House rent allowance (annual)', sample: 'INR 1,50,000.00' },
  { key: 'special_allowance', description: 'Special allowance (monthly)', sample: 'INR 20,000.00' },
  { key: 'special_allowance_annual', description: 'Special allowance (annual)', sample: 'INR 2,40,000.00' },
  { key: 'gross_salary', description: 'Total gross salary (monthly)', sample: 'INR 57,500.00' },
  { key: 'gross_salary_annual', description: 'Total gross salary (annual)', sample: 'INR 6,90,000.00' },
  { key: 'pf_employer', description: 'PF company contribution (monthly)', sample: 'INR 1,800.00' },
  { key: 'pf_employer_annual', description: 'PF company contribution (annual)', sample: 'INR 21,600.00' },
  { key: 'esic_employer', description: 'ESIC company contribution (monthly)', sample: 'INR 0.00' },
  { key: 'esic_employer_annual', description: 'ESIC company contribution (annual)', sample: 'INR 0.00' },
  { key: 'total_b', description: 'Total employer contributions (monthly)', sample: 'INR 1,800.00' },
  { key: 'total_b_annual', description: 'Total employer contributions (annual)', sample: 'INR 21,600.00' },
  { key: 'pf_employee', description: 'PF employee contribution (monthly)', sample: 'INR 1,800.00' },
  { key: 'pf_employee_annual', description: 'PF employee contribution (annual)', sample: 'INR 21,600.00' },
  { key: 'esic_employee', description: 'ESIC employee deduction (monthly)', sample: 'INR 0.00' },
  { key: 'esic_employee_annual', description: 'ESIC employee deduction (annual)', sample: 'INR 0.00' },
  { key: 'pt', description: 'Professional tax (monthly)', sample: 'INR 200.00' },
  { key: 'pt_annual', description: 'Professional tax (annual)', sample: 'INR 2,400.00' },
  { key: 'total_c', description: 'Total deductions (monthly)', sample: 'INR 2,000.00' },
  { key: 'total_c_annual', description: 'Total deductions (annual)', sample: 'INR 24,000.00' },
  { key: 'net_salary', description: 'Net in-hand salary (monthly)', sample: 'INR 55,500.00' },
  { key: 'net_salary_annual', description: 'Net in-hand salary (annual)', sample: 'INR 6,66,000.00' },
  { key: 'monthly_ctc', description: 'Total monthly CTC', sample: 'INR 65,000.00' },
  { key: 'annual_ctc', description: 'Total annual CTC', sample: 'INR 7,80,000.00' },
];

export const PLACEHOLDERS: Record<string, { key: string; description: string; sample: string }[]> = {
  OFFER_LETTER: HR_COMMON_PLACEHOLDERS,
  APPOINTMENT_LETTER: HR_COMMON_PLACEHOLDERS,
  EMPLOYMENT_CONTRACT: HR_COMMON_PLACEHOLDERS,
  EMPLOYMENT_AGREEMENT: HR_COMMON_PLACEHOLDERS,
  JOINING_LETTER: HR_COMMON_PLACEHOLDERS,
  WELCOME_LETTER: HR_COMMON_PLACEHOLDERS,
  NDA: HR_COMMON_PLACEHOLDERS,
  SALARY_REVISION: HR_COMMON_PLACEHOLDERS,
  EXPERIENCE_LETTER: HR_COMMON_PLACEHOLDERS,
  RELIEVING_LETTER: HR_COMMON_PLACEHOLDERS,
  CERTIFICATE: HR_COMMON_PLACEHOLDERS,
  CUSTOM_HR: HR_COMMON_PLACEHOLDERS,
  OFFBOARDING_LETTER: HR_COMMON_PLACEHOLDERS,
  QUOTATION: [
    { key: 'quotation_number', description: 'The quotation number', sample: 'QT-2026-0042' },
    { key: 'quotation_date', description: 'The date the quotation was made', sample: '14 October 2026' },
    { key: 'valid_until', description: 'The last day the quotation is valid', sample: '13 November 2026' },
    { key: 'client_company', description: "The client's company name", sample: 'Northwind Retail Pvt Ltd' },
    { key: 'contact_person', description: 'The person the quotation is addressed to', sample: 'Anil Mehta' },
    { key: 'client_email', description: "The client's email", sample: 'anil@northwind.example' },
    { key: 'client_phone', description: "The client's phone number", sample: '+91 98200 12345' },
    { key: 'client_address', description: "The client's address", sample: '12 MG Road, Pune 411001' },
    { key: 'client_gstin', description: "The client's GSTIN", sample: '27AAACN1234F1Z5' },
    { key: 'place_of_supply', description: "The client's state", sample: 'Maharashtra' },
    { key: 'subtotal', description: 'The total before tax', sample: 'INR 1,50,000.00' },
    { key: 'cgst', description: 'Central GST (within the state)', sample: 'INR 13,500.00' },
    { key: 'sgst', description: 'State GST (within the state)', sample: 'INR 13,500.00' },
    { key: 'igst', description: 'Integrated GST (between states)', sample: 'INR 0.00' },
    { key: 'total_tax', description: 'All GST together', sample: 'INR 27,000.00' },
    { key: 'total_amount', description: 'The total including GST', sample: 'INR 1,77,000.00' },
    { key: 'notes', description: 'The notes on the quotation', sample: 'Prices include one year of support.' },
    { key: 'company_name', description: 'Your company’s legal name', sample: 'Acme Technologies Pvt Ltd' },
    { key: 'company_gstin', description: 'Your company’s GSTIN', sample: '27AAACA1234B1Z9' },
    { key: 'today', description: "Today's date", sample: '14 October 2026' },
  ],
  APPRAISAL_LETTER: [
    { key: 'employee_name', description: "The employee's full name", sample: 'Priya Rao' },
    { key: 'employee_code', description: "The employee's code", sample: 'EMP-0142' },
    { key: 'designation', description: 'Their designation', sample: 'Senior Engineer' },
    { key: 'department', description: 'Their department', sample: 'Engineering' },
    { key: 'cycle_name', description: 'The appraisal cycle', sample: 'Annual review 2026' },
    { key: 'review_period', description: 'The period reviewed', sample: '1 April 2025 to 31 March 2026' },
    { key: 'final_score', description: 'The final score, once the appraisal is finalised', sample: '86.5%' },
    { key: 'final_rating', description: 'The final rating band, once the appraisal is finalised', sample: 'Exceeds expectations' },
    { key: 'manager_name', description: 'Their reporting manager', sample: 'Ravi Kumar' },
    { key: 'company_name', description: 'Your company’s legal name', sample: 'Acme Technologies Pvt Ltd' },
    { key: 'today', description: "Today's date", sample: '14 October 2026' },
  ],
};

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Why this template text can't be used, or null when it can. */
export function templateProblem(kind: TemplateKind | string, title: string, body: string): string | null {
  const specific = (PLACEHOLDERS as Record<string, { key: string }[]>)[kind];
  const list = specific && specific.length > 0 ? specific : HR_COMMON_PLACEHOLDERS;
  const allowed = new Set([...list.map((p) => p.key), ...HR_COMMON_PLACEHOLDERS.map((p) => p.key)]);
  const text = `${title}\n${body}`;
  const unknown = [...new Set([...text.matchAll(TOKEN)].map((m) => m[1]).filter((key) => !allowed.has(key)))];
  if (unknown.length) return `These placeholders don't exist: ${unknown.map((k) => `{{${k}}}`).join(', ')}. Use only the ones listed.`;
  // Braces left over after removing valid placeholders mean one was mistyped.
  if (/\{\{|\}\}/.test(text.replace(TOKEN, ''))) return 'A placeholder is not closed properly. Write it as {{name}}.';
  return null;
}

/** The text with every placeholder replaced by its value. */
export function renderTemplate(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN, (_match, key: string) => values[key] ?? '');
}

export function sampleValues(kind: TemplateKind | string): Record<string, string> {
  const specific = (PLACEHOLDERS as Record<string, { key: string; sample: string }[]>)[kind];
  const list = specific && specific.length > 0 ? specific : HR_COMMON_PLACEHOLDERS;
  return Object.fromEntries(list.map((p) => [p.key, p.sample]));
}

/** Made-up pay lines for sample offer letters; they add up to the sample salary. */
export const SAMPLE_OFFER_TABLE = {
  heading: 'Annual compensation',
  rows: [
    ['Basic salary', 'INR 9,00,000.00'],
    ['House rent allowance', 'INR 3,60,000.00'],
    ['Special allowance', 'INR 5,40,000.00'],
  ] as [string, string][],
  total: ['Total (CTC)', 'INR 18,00,000.00'] as [string, string],
};

/** A quotation's line items as a table: one row per line, then the subtotal, GST and total. */
export const QUOTATION_COLUMNS = [
  { label: 'Description', width: 0.4 },
  { label: 'SAC', width: 0.1 },
  { label: 'Qty', width: 0.08, align: 'right' as const },
  { label: 'Rate', width: 0.2, align: 'right' as const },
  { label: 'Amount', width: 0.22, align: 'right' as const },
];

/** Made-up quotation lines for samples; they add up to the sample amounts. */
export const SAMPLE_QUOTATION_TABLE = {
  heading: 'Quotation details',
  columns: QUOTATION_COLUMNS,
  rows: [
    ['Website design and development', '998314', '1', 'INR 1,00,000.00', 'INR 1,00,000.00'],
    ['Annual maintenance', '998314', '1', 'INR 50,000.00', 'INR 50,000.00'],
  ],
  totals: [
    ['Subtotal', 'INR 1,50,000.00'],
    ['CGST 9%', 'INR 13,500.00'],
    ['SGST 9%', 'INR 13,500.00'],
  ] as [string, string][],
  total: ['Total', 'INR 1,77,000.00'] as [string, string],
};

/** The sample table a kind's previews show, if it has one. */
export function sampleTable(kind: TemplateKind) {
  if (kind === 'OFFER_LETTER') return SAMPLE_OFFER_TABLE;
  if (kind === 'QUOTATION') return SAMPLE_QUOTATION_TABLE;
  return undefined;
}

/** An amount in Indian digit grouping, e.g. INR 12,00,000.00, computed on the decimal string, never a float. */
export function formatInr(amount: Prisma.Decimal): string {
  const [whole, fraction] = amount.toFixed(2).split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `INR ${negative ? '-' : ''}${rest ? `${rest},${last3}` : last3}.${fraction}`;
}

/** An amount in its currency: INR in Indian digit grouping, others grouped in thousands. Computed on the decimal string, never a float. */
export function formatAmount(amount: Prisma.Decimal, currency: string): string {
  if (currency === 'INR') return formatInr(amount);
  const [whole, fraction] = amount.toFixed(2).split('.');
  const negative = whole.startsWith('-');
  const digits = (negative ? whole.slice(1) : whole).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${negative ? '-' : ''}${digits}.${fraction}`;
}

/** A date column (YYYY-MM-DD at UTC midnight) as "1 November 2026". */
export function formatLetterDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
