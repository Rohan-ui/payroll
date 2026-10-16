import { Prisma } from '@prisma/client';

/**
 * Questions an appraisal form asks besides its KRAs and KPIs. A question is
 * structured settings checked here, never code. The actual result of each KPI
 * is asked on the KPI's own row, so it is not a question type.
 */

const D = (value: string) => new Prisma.Decimal(value);

export const FIELD_TYPES = [
  'RATING', 'NUMBER', 'SHORT_TEXT', 'LONG_TEXT', 'YES_NO', 'DROPDOWN', 'MULTI_SELECT', 'DATE', 'ATTACHMENT', 'ACHIEVEMENTS', 'DEVELOPMENT_GOAL',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Who answers: the employee in their self-assessment, reviewers, or both. */
export const FILLED_BY = ['SELF', 'REVIEWERS', 'BOTH'] as const;
export type FilledBy = (typeof FILLED_BY)[number];

/** When the employee may see the answers to a question reviewers fill in. */
export const EMPLOYEE_VISIBILITY = ['ALWAYS', 'AFTER_FINALIZATION', 'NEVER'] as const;
export type EmployeeVisibility = (typeof EMPLOYEE_VISIBILITY)[number];

/** Only questions answered with a rating or a number can count toward the score. */
export const SCORABLE_FIELD_TYPES: FieldType[] = ['RATING', 'NUMBER'];

export const FIELD_KEY = /^[a-z][a-z0-9_]{1,39}$/;
export const MAX_FIELDS = 50;
export const MAX_OPTIONS = 50;

export type FieldConfig =
  | Record<string, never>
  | { min: string | null; max: string | null; decimals: number }
  | { maxLength: number }
  | { options: string[] }
  | { maxFiles: number };

const NUMBER = /^-?\d{1,14}(\.\d{1,4})?$/;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const whole = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;

/** The settings a question type starts with. */
export function defaultFieldConfig(type: FieldType): FieldConfig {
  if (type === 'NUMBER') return { min: null, max: null, decimals: 0 };
  if (type === 'SHORT_TEXT') return { maxLength: 200 };
  if (type === 'LONG_TEXT' || type === 'ACHIEVEMENTS' || type === 'DEVELOPMENT_GOAL') return { maxLength: 2000 };
  if (type === 'DROPDOWN' || type === 'MULTI_SELECT') return { options: ['Option 1', 'Option 2'] };
  if (type === 'ATTACHMENT') return { maxFiles: 3 };
  return {};
}

/** Checks a question's settings for its type; `where` names it in messages. */
export function validateFieldConfig(type: FieldType, raw: unknown, scored: boolean, where: string): { config: FieldConfig } | { problems: string[] } {
  if (!isObject(raw)) return { problems: [`${where}: the question’s settings are missing.`] };
  const problems: string[] = [];

  if (type === 'NUMBER') {
    const { min, max, decimals } = raw;
    if (min !== null && (typeof min !== 'string' || !NUMBER.test(min))) problems.push(`${where}: the lowest answer must be a number, or empty.`);
    if (max !== null && (typeof max !== 'string' || !NUMBER.test(max))) problems.push(`${where}: the highest answer must be a number, or empty.`);
    if (!whole(decimals, 0, 4)) problems.push(`${where}: decimal places are 0 to 4.`);
    if (problems.length) return { problems };
    if (typeof min === 'string' && typeof max === 'string' && !D(max).gt(D(min))) problems.push(`${where}: the highest answer must be above the lowest.`);
    if (scored && (min === null || max === null)) problems.push(`${where}: a scored number question needs its lowest and highest answers, to score against.`);
    return problems.length ? { problems } : { config: { min: min as string | null, max: max as string | null, decimals: decimals as number } };
  }

  if (type === 'SHORT_TEXT' || type === 'LONG_TEXT' || type === 'ACHIEVEMENTS' || type === 'DEVELOPMENT_GOAL') {
    const limit = type === 'SHORT_TEXT' ? 500 : 5000;
    if (!whole(raw.maxLength, 1, limit)) return { problems: [`${where}: the longest answer is 1 to ${limit} characters.`] };
    return { config: { maxLength: raw.maxLength as number } };
  }

  if (type === 'DROPDOWN' || type === 'MULTI_SELECT') {
    const options = Array.isArray(raw.options) ? raw.options : null;
    if (!options || options.length < 2) return { problems: [`${where}: give at least two choices.`] };
    if (options.length > MAX_OPTIONS) problems.push(`${where}: at most ${MAX_OPTIONS} choices.`);
    const seen = new Set<string>();
    const cleaned: string[] = [];
    options.forEach((o: unknown, i: number) => {
      const text = typeof o === 'string' ? o.trim() : '';
      if (!text || text.length > 120) problems.push(`${where}: choice ${i + 1} must be 1 to 120 characters.`);
      else if (seen.has(text.toLowerCase())) problems.push(`${where}: “${text}” is listed twice.`);
      seen.add(text.toLowerCase());
      cleaned.push(text);
    });
    return problems.length ? { problems } : { config: { options: cleaned } };
  }

  if (type === 'ATTACHMENT') {
    if (!whole(raw.maxFiles, 1, 10)) return { problems: [`${where}: allow 1 to 10 files.`] };
    return { config: { maxFiles: raw.maxFiles as number } };
  }

  if (Object.keys(raw).length) return { problems: [`${where}: this kind of question has no settings.`] };
  return { config: {} };
}
