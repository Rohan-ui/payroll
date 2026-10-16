import { Prisma } from '@prisma/client';
import { ScaleDefinition } from '../rating-scale';
import { DIRECT_METHODS, Direction, LinearConfig, MeasurementType, METHODS_FOR, ScoringMethod, SlabsConfig, TARGET_METHODS, validateScoringConfig } from './scoring-methods';
import { EmployeeVisibility, FIELD_KEY, FieldType, FilledBy, MAX_FIELDS, SCORABLE_FIELD_TYPES, validateFieldConfig } from './form-fields';

/**
 * An appraisal template version as scoring and checking see it: its scoring
 * policy, KRAs with their KPIs, and form questions. The rules here decide
 * whether a version may be published; nothing is adjusted to make it fit.
 */

type Decimal = Prisma.Decimal;
const HUNDRED = new Prisma.Decimal(100);

export const SCORING_MODELS = ['WEIGHTED', 'MARKS'] as const;
export const WEIGHT_RULES = ['MUST_TOTAL', 'NORMALIZE'] as const;
export const MISSING_RULES = ['BLOCK', 'EXCLUDE', 'ZERO'] as const;
export const TARGET_SOURCES = ['TEMPLATE', 'PER_EMPLOYEE'] as const;
export type ScoringModel = (typeof SCORING_MODELS)[number];
export type WeightRule = (typeof WEIGHT_RULES)[number];
export type MissingRule = (typeof MISSING_RULES)[number];
export type TargetSource = (typeof TARGET_SOURCES)[number];

export const MAX_KRAS = 30;
export const MAX_KPIS_PER_KRA = 30;

export interface PolicyDef {
  /** WEIGHTED: lines carry weight percentages. MARKS: lines carry maximum marks, which are their weights. */
  model: ScoringModel;
  /** MUST_TOTAL: weights must add up exactly. NORMALIZE: each weight counts as its share of the total given. */
  weightRule: WeightRule;
  /** MARKS with MUST_TOTAL: what all marks add up to, such as 100. */
  totalMarks: Decimal | null;
  /** What a line nobody rated does: hold back the score, leave it out, or count it as 0%. */
  missingRule: MissingRule;
  /** Decimal places of the final score, rounded once at the end. */
  decimals: number;
  finalScale: ScaleDefinition | null;
}

export interface KpiDef {
  key: string;
  code: string;
  name: string;
  measurementType: MeasurementType;
  direction: Direction;
  unitLabel: string | null;
  method: ScoringMethod;
  config: unknown;
  targetSource: TargetSource;
  target: Decimal | null;
  threshold: Decimal | null;
  stretch: Decimal | null;
  weightPercent: Decimal | null;
  maxMarks: Decimal | null;
  scale: ScaleDefinition | null;
  allowsExemption: boolean;
}

export interface KraDef {
  key: string;
  code: string;
  name: string;
  weightPercent: Decimal | null;
  maxMarks: Decimal | null;
  minMarks: Decimal | null;
  /** How the KRA is rated when it has no KPIs; null when its KPIs make its score. */
  method: ScoringMethod | null;
  scale: ScaleDefinition | null;
  allowsExemption: boolean;
  kpis: KpiDef[];
}

export interface FieldDef {
  /** The line's id, which entered answers are keyed by. */
  key: string;
  /** The question's key on the form, such as achievements. */
  fieldKey: string;
  label: string;
  type: FieldType;
  required: boolean;
  filledBy: FilledBy;
  visibility: EmployeeVisibility;
  config: unknown;
  scale: ScaleDefinition | null;
  scored: boolean;
  weightPercent: Decimal | null;
  maxMarks: Decimal | null;
}

export interface TemplateDef {
  policy: PolicyDef;
  kras: KraDef[];
  fields: FieldDef[];
}

export interface TemplateProblem {
  path: string;
  message: string;
}

/** The weight a line counts with: its percentage, or under MARKS its maximum marks. */
export const weightOf = (policy: PolicyDef, line: { weightPercent: Decimal | null; maxMarks: Decimal | null }) =>
  (policy.model === 'WEIGHTED' ? line.weightPercent : line.maxMarks);

const sum = (values: (Decimal | null)[]) => values.reduce<Decimal>((total, v) => total.plus(v ?? 0), new Prisma.Decimal(0));

/** Every reason this version can't be published yet; empty when it can. */
export function validateTemplate(def: TemplateDef): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  const add = (path: string, message: string) => problems.push({ path, message });
  const { policy } = def;
  const marks = policy.model === 'MARKS';
  const weightName = marks ? 'maximum marks' : 'weight';

  if (!Number.isInteger(policy.decimals) || policy.decimals < 0 || policy.decimals > 4) add('policy.decimals', 'The final score has 0 to 4 decimal places.');
  if (marks && policy.weightRule === 'MUST_TOTAL' && !(policy.totalMarks && policy.totalMarks.gt(0))) add('policy.totalMarks', 'Give the total marks the appraisal adds up to, such as 100.');
  if (!marks && policy.totalMarks) add('policy.totalMarks', 'Total marks only apply when scoring in marks.');
  if (policy.finalScale && !policy.finalScale.bands.length) add('policy.finalScale', 'The final rating scale has no final rating bands. Choose a scale that has them, or none.');

  if (!def.kras.length) add('kras', 'Add at least one KRA.');
  if (def.kras.length > MAX_KRAS) add('kras', `A template has at most ${MAX_KRAS} KRAs.`);
  if (def.fields.length > MAX_FIELDS) add('fields', `A template has at most ${MAX_FIELDS} questions.`);

  // A line needs a positive weight (or maximum marks) of at most 100%.
  const checkWeight = (path: string, name: string, line: { weightPercent: Decimal | null; maxMarks: Decimal | null }) => {
    const w = weightOf(policy, line);
    if (!w || !w.gt(0)) add(`${path}.${marks ? 'maxMarks' : 'weightPercent'}`, `Give ${name} its ${weightName}.`);
    else if (!marks && w.gt(HUNDRED)) add(`${path}.weightPercent`, `${name}’s weight can’t be more than 100%.`);
  };

  const codes = new Set<string>();
  const kpiCodes = new Map<string, string>();
  def.kras.forEach((kra, k) => {
    const path = `kras.${k}`;
    if (codes.has(kra.code)) add(`${path}`, `${kra.code} is in the template twice.`);
    codes.add(kra.code);
    checkWeight(path, kra.name, kra);
    if (kra.minMarks && (!kra.maxMarks || !kra.minMarks.lt(kra.maxMarks))) add(`${path}.minMarks`, `${kra.name}’s minimum marks must be below its maximum marks.`);
    if (kra.kpis.length > MAX_KPIS_PER_KRA) add(`${path}.kpis`, `${kra.name} has more than ${MAX_KPIS_PER_KRA} KPIs.`);

    if (kra.kpis.length) {
      if (kra.method) add(`${path}.method`, `${kra.name} is scored from its KPIs, so it isn’t rated on its own.`);
    } else {
      if (!kra.method || !DIRECT_METHODS.includes(kra.method)) add(`${path}.method`, `${kra.name} has no KPIs, so choose how it is rated: on a rating scale, in marks or by hand.`);
      checkMethodNeeds(path, kra.name, kra.method, kra.scale, kra.maxMarks, add);
    }

    kra.kpis.forEach((kpi, i) => {
      const kpiPath = `${path}.kpis.${i}`;
      const name = `${kra.name} → ${kpi.name}`;
      const firstUse = kpiCodes.get(kpi.code);
      // The same measure counted twice would count its result twice.
      if (firstUse) add(kpiPath, `${kpi.code} is already counted under ${firstUse}. A KPI can appear once in a template.`);
      else kpiCodes.set(kpi.code, kra.name);
      checkWeight(kpiPath, name, kpi);
      if (!METHODS_FOR[kpi.measurementType].includes(kpi.method)) add(`${kpiPath}.method`, `${name} can’t be scored that way for its kind of measurement.`);
      const config = validateScoringConfig(kpi.method, kpi.config, name);
      if ('problems' in config) config.problems.forEach((message) => add(`${kpiPath}.config`, message));
      checkMethodNeeds(kpiPath, name, kpi.method, kpi.scale, kpi.maxMarks, add);
      if (TARGET_METHODS.includes(kpi.method)) {
        if (kpi.direction === 'NOT_APPLICABLE') add(`${kpiPath}.method`, `${name} has no better direction, so it can’t be scored against targets.`);
        else if (kpi.targetSource === 'TEMPLATE' && 'config' in config) checkTargets(kpiPath, name, kpi, config.config as LinearConfig | SlabsConfig, add);
      }
    });

    if (policy.weightRule === 'MUST_TOTAL' && kra.kpis.length) {
      const total = sum(kra.kpis.map((kpi) => weightOf(policy, kpi)));
      const required = marks ? kra.maxMarks : HUNDRED;
      if (required && !total.eq(required)) {
        add(`${path}.kpis`, marks
          ? `${kra.name}’s KPIs add up to ${total.toString()} marks, but the KRA is worth ${required.toString()}. Make them equal, or let weights be shared out in proportion.`
          : `${kra.name}’s KPI weights add up to ${total.toString()}%, not 100%. Change them, or let weights be shared out in proportion.`);
      }
    }
  });

  const keys = new Set<string>();
  def.fields.forEach((field, f) => {
    const path = `fields.${f}`;
    const name = field.label.trim() || `Question ${f + 1}`;
    if (!FIELD_KEY.test(field.fieldKey)) add(`${path}.key`, `${name}: its key is 2 to 40 lowercase letters, digits or underscores, starting with a letter.`);
    if (keys.has(field.fieldKey)) add(`${path}.key`, `${name}: another question uses the key ${field.fieldKey}.`);
    keys.add(field.fieldKey);
    if (!field.label.trim()) add(`${path}.label`, `Question ${f + 1} needs a label.`);
    const config = validateFieldConfig(field.type, field.config, field.scored, name);
    if ('problems' in config) config.problems.forEach((message) => add(`${path}.config`, message));
    if (field.type === 'RATING' && !field.scale) add(`${path}.scale`, `${name}: choose the rating scale it is answered on.`);
    if (field.type === 'RATING' && field.scale?.inputKind === 'MARKS') add(`${path}.scale`, `${name}: a question can’t use a marks scale; choose a level or range scale.`);
    if (field.filledBy === 'SELF' && field.visibility === 'NEVER') add(`${path}.visibility`, `${name}: the employee answers it, so they can see it.`);
    if (field.scored) {
      if (!SCORABLE_FIELD_TYPES.includes(field.type)) add(`${path}.scored`, `${name}: only rating and number questions can count toward the score.`);
      checkWeight(path, name, field);
    } else if (field.weightPercent || field.maxMarks) {
      add(`${path}.weightPercent`, `${name} doesn’t count toward the score, so it has no ${weightName}.`);
    }
  });

  const scoredFields = def.fields.filter((f) => f.scored);
  if (policy.weightRule === 'MUST_TOTAL' && def.kras.length) {
    const total = sum([...def.kras.map((k) => weightOf(policy, k)), ...scoredFields.map((f) => weightOf(policy, f))]);
    const what = scoredFields.length ? 'KRAs and scored questions' : 'KRAs';
    if (marks && policy.totalMarks && !total.eq(policy.totalMarks)) {
      add('kras', `The ${what} add up to ${total.toString()} marks, not the template’s ${policy.totalMarks.toString()}. Change them, or let weights be shared out in proportion.`);
    } else if (!marks && !total.eq(HUNDRED)) {
      add('kras', `The ${what} weights add up to ${total.toString()}%, not 100%. Change them, or let weights be shared out in proportion.`);
    }
  }
  return problems;
}

/** What a rating method needs before it can score. */
function checkMethodNeeds(path: string, name: string, method: ScoringMethod | null, scale: ScaleDefinition | null, maxMarks: Decimal | null, add: (path: string, message: string) => void) {
  if (method === 'RATING_SCALE' && !scale) add(`${path}.scale`, `${name}: choose the rating scale it is rated on.`);
  if (method === 'RATING_SCALE' && scale?.inputKind === 'MARKS' && !(maxMarks && maxMarks.gt(0))) add(`${path}.maxMarks`, `${name} is rated in marks, so give its maximum marks.`);
  if (method === 'DIRECT_MARKS' && !(maxMarks && maxMarks.gt(0))) add(`${path}.maxMarks`, `${name} is scored in marks, so give its maximum marks.`);
}

/** Targets set in the template must be there and in order for the method. */
function checkTargets(path: string, name: string, kpi: KpiDef, config: LinearConfig | SlabsConfig, add: (path: string, message: string) => void) {
  const lower = kpi.direction === 'LOWER_IS_BETTER';
  const needsTarget = kpi.method === 'PERCENT_OF_TARGET' || kpi.method === 'LINEAR_BETWEEN' || (kpi.method === 'SLABS' && (config as SlabsConfig).basis === 'ACHIEVEMENT_PERCENT');
  if (needsTarget && !(kpi.target && kpi.target.gt(0))) add(`${path}.target`, `${name}: give a target above 0, or set targets for each employee.`);
  if (kpi.method !== 'LINEAR_BETWEEN') return;
  if (!kpi.threshold) { add(`${path}.threshold`, `${name}: give the threshold, the ${lower ? 'highest' : 'lowest'} result still accepted.`); return; }
  if (!kpi.target) return;
  const ordered = lower
    ? kpi.threshold.gt(kpi.target) && (!kpi.stretch || kpi.target.gt(kpi.stretch))
    : kpi.threshold.lt(kpi.target) && (!kpi.stretch || kpi.target.lt(kpi.stretch));
  if (!ordered) {
    add(`${path}.target`, lower
      ? `${name}: lower is better, so the threshold must be above the target, and the target above the stretch target.`
      : `${name}: the threshold must be below the target, and the target below the stretch target.`);
  }
}
