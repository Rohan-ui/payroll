/**
 * Placeholders in sequence emails: {{Name}}, or {{Name|fallback}} to use the
 * fallback when the lead has no value. Only names backed by real lead or
 * workspace data exist. A placeholder with no value and no fallback stops the
 * email from being sent: nobody gets "Dear ," or a made-up name.
 */
export const SEQUENCE_PLACEHOLDERS = [
  { key: 'First Name', description: 'The lead’s first name' },
  { key: 'Last Name', description: 'The lead’s last name' },
  { key: 'Full Name', description: 'First and last name' },
  { key: 'Company Name', description: 'The lead’s company' },
  { key: 'Designation', description: 'The lead’s job title' },
  { key: 'Industry', description: 'The lead’s industry' },
  { key: 'City', description: 'The lead’s city' },
  { key: 'Lead Owner', description: 'The team member the lead is assigned to' },
  { key: 'Sender Name', description: 'The name the email is sent from' },
  { key: 'Workspace Name', description: 'Your company’s name' },
] as const;

export type PlaceholderKey = (typeof SEQUENCE_PLACEHOLDERS)[number]['key'];
export type PlaceholderValues = Partial<Record<PlaceholderKey, string | null | undefined>>;

const TOKEN = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g;
const keyOf = (name: string): PlaceholderKey | null => SEQUENCE_PLACEHOLDERS.find((p) => p.key.toLowerCase() === name.trim().toLowerCase())?.key ?? null;

/** Placeholders in a text that don't exist, as written. */
export function unknownPlaceholders(text: string): string[] {
  const unknown = new Set<string>();
  for (const match of text.matchAll(TOKEN)) if (!keyOf(match[1])) unknown.add(match[1].trim());
  return [...unknown];
}

/** The text with every placeholder filled, and the placeholders that had neither a value nor a fallback. */
export function renderPlaceholders(text: string, values: PlaceholderValues): { text: string; missing: PlaceholderKey[] } {
  const missing = new Set<PlaceholderKey>();
  const rendered = text.replace(TOKEN, (whole, name: string, fallback: string | undefined) => {
    const key = keyOf(name);
    if (!key) return whole;
    const value = values[key]?.trim();
    if (value) return value;
    if (fallback !== undefined && fallback.trim()) return fallback.trim();
    missing.add(key);
    return whole;
  });
  return { text: rendered, missing: [...missing] };
}

export interface PlaceholderLead {
  first_name: string | null;
  last_name: string | null;
  company_name: string;
  designation: string | null;
  industry: string | null;
  city: string | null;
}

/** A lead's placeholder values. */
export function leadValues(lead: PlaceholderLead, extra: { owner: string | null; sender: string | null; workspace: string | null }): PlaceholderValues {
  return {
    'First Name': lead.first_name,
    'Last Name': lead.last_name,
    'Full Name': [lead.first_name, lead.last_name].map((v) => v?.trim()).filter(Boolean).join(' '),
    'Company Name': lead.company_name,
    Designation: lead.designation,
    Industry: lead.industry,
    City: lead.city,
    'Lead Owner': extra.owner,
    'Sender Name': extra.sender,
    'Workspace Name': extra.workspace,
  };
}

/** Made-up values for previews and test emails, never for a real send. */
export const SAMPLE_VALUES: PlaceholderValues = {
  'First Name': 'Priya',
  'Last Name': 'Sharma',
  'Full Name': 'Priya Sharma',
  'Company Name': 'Acme Industries',
  Designation: 'Head of Operations',
  Industry: 'Manufacturing',
  City: 'Pune',
};
