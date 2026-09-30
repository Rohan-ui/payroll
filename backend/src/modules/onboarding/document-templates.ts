import { Prisma } from '@prisma/client';

/**
 * Letter templates: plain text with {{placeholders}}. Each kind has a fixed set
 * of placeholders, filled from verified records by the server; a template may
 * use no other, so nothing is ever left blank by a typo.
 */

export const TEMPLATE_KINDS = ['OFFER_LETTER', 'JOINING_LETTER', 'EMPLOYMENT_AGREEMENT', 'CERTIFICATE'] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** Kinds that can be created now. The others arrive with their workflows. */
export const AVAILABLE_TEMPLATE_KINDS: readonly TemplateKind[] = ['OFFER_LETTER'];

export const PLACEHOLDERS: Record<TemplateKind, { key: string; description: string; sample: string }[]> = {
  OFFER_LETTER: [
    { key: 'candidate_name', description: "The candidate's full name", sample: 'Priya Rao' },
    { key: 'company_name', description: 'Your company’s legal name', sample: 'Acme Technologies Pvt Ltd' },
    { key: 'job_title', description: 'The job title offered', sample: 'Senior Backend Engineer' },
    { key: 'department', description: 'The department', sample: 'Engineering' },
    { key: 'designation', description: 'The designation', sample: 'Senior Engineer' },
    { key: 'reporting_manager', description: 'The manager they report to', sample: 'Ravi Kumar' },
    { key: 'employment_type', description: 'Full-time, contract and so on', sample: 'Full-time' },
    { key: 'work_location', description: 'Where they will work', sample: 'Pune office' },
    { key: 'salary', description: 'Total annual pay (CTC)', sample: 'INR 18,00,000.00' },
    { key: 'joining_date', description: 'The joining date', sample: '1 November 2026' },
    { key: 'probation_period', description: 'The probation period', sample: '6 months' },
    { key: 'offer_expiry_date', description: 'The last day to accept', sample: '15 October 2026' },
    { key: 'special_terms', description: 'Any special terms', sample: 'A joining bonus of INR 50,000 is paid with the first salary.' },
    { key: 'offer_reference', description: 'The offer reference number', sample: 'OFR-2026-123456' },
    { key: 'today', description: "Today's date", sample: '30 September 2026' },
  ],
  JOINING_LETTER: [],
  EMPLOYMENT_AGREEMENT: [],
  CERTIFICATE: [],
};

const TOKEN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

/** Why this template text can't be used, or null when it can. */
export function templateProblem(kind: TemplateKind, title: string, body: string): string | null {
  const allowed = new Set(PLACEHOLDERS[kind].map((p) => p.key));
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

export function sampleValues(kind: TemplateKind): Record<string, string> {
  return Object.fromEntries(PLACEHOLDERS[kind].map((p) => [p.key, p.sample]));
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

/** An amount in Indian digit grouping, e.g. INR 12,00,000.00, computed on the decimal string, never a float. */
export function formatInr(amount: Prisma.Decimal): string {
  const [whole, fraction] = amount.toFixed(2).split('.');
  const negative = whole.startsWith('-');
  const digits = negative ? whole.slice(1) : whole;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `INR ${negative ? '-' : ''}${rest ? `${rest},${last3}` : last3}.${fraction}`;
}

/** A date column (YYYY-MM-DD at UTC midnight) as "1 November 2026". */
export function formatLetterDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
