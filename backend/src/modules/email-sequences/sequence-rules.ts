/**
 * Conditions on lead fields for automatic enrollment, checked by the server
 * against each lead: all of them, or any of them. Fields are only those the
 * lead record has.
 */
export const CONDITION_FIELDS = {
  industry: { label: 'Industry', column: 'industry' },
  city: { label: 'City', column: 'city' },
  state: { label: 'State', column: 'state' },
  country: { label: 'Country code', column: 'country_code' },
  designation: { label: 'Designation', column: 'designation' },
  temperature: { label: 'Temperature', column: 'temperature' },
  source: { label: 'Lead source', column: 'source_id' },
  owner: { label: 'Lead owner', column: 'assigned_tenant_member_id' },
  pipeline: { label: 'Pipeline', column: 'pipeline_id' },
  stage: { label: 'Stage', column: 'stage_id' },
} as const;
export type ConditionField = keyof typeof CONDITION_FIELDS;
export const CONDITION_OPERATORS = ['EQUALS', 'NOT_EQUALS', 'CONTAINS', 'IN', 'IS_EMPTY', 'IS_NOT_EMPTY'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value?: string | string[];
}
export interface RuleConditions {
  match: 'ALL' | 'ANY';
  conditions: RuleCondition[];
}

export class ConditionProblem extends Error {}

/** Checked conditions from stored or sent JSON; at most 20, values trimmed. */
export function parseConditions(raw: unknown): RuleConditions {
  const record = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const match = record.match === 'ANY' ? 'ANY' : 'ALL';
  const list = Array.isArray(record.conditions) ? record.conditions : [];
  if (list.length > 20) throw new ConditionProblem('A rule has at most 20 conditions.');
  const conditions = list.map((item, index): RuleCondition => {
    const c = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const field = c.field as ConditionField;
    const operator = c.operator as ConditionOperator;
    if (!(typeof field === 'string' && field in CONDITION_FIELDS)) throw new ConditionProblem(`Condition ${index + 1} names a field leads don’t have.`);
    if (!CONDITION_OPERATORS.includes(operator)) throw new ConditionProblem(`Condition ${index + 1} has an operator that doesn’t exist.`);
    if (operator === 'IS_EMPTY' || operator === 'IS_NOT_EMPTY') return { field, operator };
    if (operator === 'IN') {
      const values = (Array.isArray(c.value) ? c.value : []).filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim().slice(0, 200));
      if (!values.length || values.length > 50) throw new ConditionProblem(`Condition ${index + 1} needs between 1 and 50 values.`);
      return { field, operator, value: values };
    }
    const value = typeof c.value === 'string' ? c.value.trim().slice(0, 200) : '';
    if (!value) throw new ConditionProblem(`Condition ${index + 1} needs a value.`);
    return { field, operator, value };
  });
  return { match, conditions };
}

export type ConditionLead = Partial<Record<(typeof CONDITION_FIELDS)[ConditionField]['column'], string | null>>;

/** Whether a lead meets the conditions; no conditions is a match. Text compares without case. */
export function matchesConditions(lead: ConditionLead, rules: RuleConditions): boolean {
  if (!rules.conditions.length) return true;
  const test = (c: RuleCondition) => {
    const actual = (lead[CONDITION_FIELDS[c.field].column] ?? '').trim().toLowerCase();
    const wanted = Array.isArray(c.value) ? c.value.map((v) => v.toLowerCase()) : (c.value ?? '').toLowerCase();
    switch (c.operator) {
      case 'EQUALS': return actual === wanted;
      case 'NOT_EQUALS': return actual !== wanted;
      case 'CONTAINS': return typeof wanted === 'string' && actual.includes(wanted);
      case 'IN': return Array.isArray(wanted) && wanted.includes(actual);
      case 'IS_EMPTY': return actual === '';
      case 'IS_NOT_EMPTY': return actual !== '';
    }
  };
  return rules.match === 'ALL' ? rules.conditions.every(test) : rules.conditions.some(test);
}
