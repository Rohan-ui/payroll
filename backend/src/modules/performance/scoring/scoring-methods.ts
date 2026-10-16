import { Prisma } from '@prisma/client';
import { ratingPercent, ScaleDefinition } from '../rating-scale';

/**
 * How one KPI, KRA or scored question turns what was entered into a score
 * percentage (0–100). Every method is a fixed rule with settings checked
 * here; nothing an administrator types is ever executed. Each score comes
 * with the steps that produced it, in words, so it can be explained.
 */

type Decimal = Prisma.Decimal;
const D = (value: string | number | Decimal) => new Prisma.Decimal(value);
const ZERO = D(0);
const HUNDRED = D(100);

export const SCORING_METHODS = ['PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS', 'COMPLETION_PERCENT', 'YES_NO', 'RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'] as const;
export type ScoringMethod = (typeof SCORING_METHODS)[number];

export const MEASUREMENT_TYPES = ['NUMERIC', 'PERCENTAGE', 'CURRENCY', 'COUNT', 'DURATION', 'QUALITY_SCORE', 'MILESTONE', 'YES_NO', 'RATING', 'QUALITATIVE'] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];
export type Direction = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NOT_APPLICABLE';

const MEASURED: ScoringMethod[] = ['PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS', 'RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'];

/** The methods that make sense for each kind of measurement. */
export const METHODS_FOR: Record<MeasurementType, ScoringMethod[]> = {
  NUMERIC: MEASURED,
  CURRENCY: MEASURED,
  COUNT: MEASURED,
  DURATION: MEASURED,
  QUALITY_SCORE: MEASURED,
  PERCENTAGE: [...MEASURED, 'COMPLETION_PERCENT'],
  MILESTONE: [...MEASURED, 'COMPLETION_PERCENT'],
  YES_NO: ['YES_NO', 'MANUAL'],
  RATING: ['RATING_SCALE'],
  QUALITATIVE: ['RATING_SCALE'],
};

/** A KRA without KPIs is rated as a whole, by one of these. */
export const DIRECT_METHODS: ScoringMethod[] = ['RATING_SCALE', 'DIRECT_MARKS', 'MANUAL'];

/** Methods that compare an actual result with targets. */
export const TARGET_METHODS: ScoringMethod[] = ['PERCENT_OF_TARGET', 'LINEAR_BETWEEN', 'SLABS'];

export interface LinearConfig { belowThresholdScore: string; thresholdScore: string; targetScore: string; stretchScore: string }
export interface Slab { from: string; to: string | null; scorePercent: string }
export interface SlabsConfig { basis: 'ACTUAL' | 'ACHIEVEMENT_PERCENT'; slabs: Slab[] }
export interface YesNoConfig { yesScore: string; noScore: string }
export type ScoringConfig = Record<string, never> | LinearConfig | SlabsConfig | YesNoConfig;

export const MAX_SLABS = 20;
const DECIMAL = /^-?\d{1,14}(\.\d{1,4})?$/;
const PERCENT = /^\d{1,3}(\.\d{1,4})?$/;

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const percentProblem = (value: unknown) => (typeof value !== 'string' || !PERCENT.test(value) || D(value).gt(HUNDRED) ? 'a percentage from 0 to 100' : null);

/** The settings a method starts with, so a new line is valid straight away. */
export function defaultConfig(method: ScoringMethod): ScoringConfig {
  if (method === 'LINEAR_BETWEEN') return { belowThresholdScore: '0', thresholdScore: '50', targetScore: '100', stretchScore: '100' };
  if (method === 'SLABS') {
    return { basis: 'ACHIEVEMENT_PERCENT', slabs: [{ from: '0', to: '60', scorePercent: '0' }, { from: '60', to: '90', scorePercent: '60' }, { from: '90', to: '100', scorePercent: '80' }, { from: '100', to: null, scorePercent: '100' }] };
  }
  if (method === 'YES_NO') return { yesScore: '100', noScore: '0' };
  return {};
}

/**
 * How a line is scored: an administrator's choice of method, or, for a
 * scored number question, its answer's place in the question's range.
 */
export type LineMethod = ScoringMethod | 'NUMBER_RANGE';

/** Checks a method's settings; `where` names the line in messages. */
export function validateScoringConfig(method: LineMethod, raw: unknown, where: string): { config: ScoringConfig } | { problems: string[] } {
  const problems: string[] = [];
  if (!isObject(raw)) return { problems: [`${where}: the scoring settings are missing.`] };

  if (method === 'LINEAR_BETWEEN') {
    const keys = ['belowThresholdScore', 'thresholdScore', 'targetScore', 'stretchScore'] as const;
    const labels = { belowThresholdScore: 'score below the threshold', thresholdScore: 'score at the threshold', targetScore: 'score at the target', stretchScore: 'score at the stretch target' };
    keys.forEach((key) => {
      if (percentProblem(raw[key])) problems.push(`${where}: the ${labels[key]} must be a percentage from 0 to 100.`);
    });
    if (problems.length) return { problems };
    const scores = keys.map((key) => D(raw[key] as string));
    for (let i = 1; i < scores.length; i += 1) {
      if (scores[i].lt(scores[i - 1])) problems.push(`${where}: a better result can’t score less, so each score must be at least the one before it.`);
    }
    return problems.length ? { problems: [...new Set(problems)] } : { config: Object.fromEntries(keys.map((k) => [k, raw[k]])) as unknown as LinearConfig };
  }

  if (method === 'SLABS') {
    if (raw.basis !== 'ACTUAL' && raw.basis !== 'ACHIEVEMENT_PERCENT') problems.push(`${where}: say whether slabs apply to the actual result or to achievement against target.`);
    const slabs = Array.isArray(raw.slabs) ? raw.slabs : [];
    if (slabs.length < 1) problems.push(`${where}: add at least one slab.`);
    if (slabs.length > MAX_SLABS) problems.push(`${where}: at most ${MAX_SLABS} slabs.`);
    const parsed: Slab[] = [];
    slabs.forEach((s: unknown, i: number) => {
      const n = i + 1;
      if (!isObject(s) || typeof s.from !== 'string' || !DECIMAL.test(s.from)) { problems.push(`${where}: slab ${n} needs a “from” value.`); return; }
      if (s.to !== null && (typeof s.to !== 'string' || !DECIMAL.test(s.to))) { problems.push(`${where}: slab ${n}’s “up to” must be a number, or empty for no upper end.`); return; }
      if (percentProblem(s.scorePercent)) { problems.push(`${where}: slab ${n}’s score must be a percentage from 0 to 100.`); return; }
      parsed.push({ from: s.from, to: s.to as string | null, scorePercent: s.scorePercent as string });
    });
    if (problems.length) return { problems };
    parsed.forEach((slab, i) => {
      const n = i + 1;
      if (slab.to !== null && !D(slab.to).gt(D(slab.from))) problems.push(`${where}: slab ${n} must end above where it starts.`);
      if (slab.to === null && i !== parsed.length - 1) problems.push(`${where}: only the last slab can have no upper end.`);
      if (i > 0 && (parsed[i - 1].to === null || !D(slab.from).eq(D(parsed[i - 1].to as string)))) {
        problems.push(`${where}: slab ${n} must start where slab ${i} ends, with no gap or overlap.`);
      }
    });
    return problems.length ? { problems } : { config: { basis: raw.basis as SlabsConfig['basis'], slabs: parsed } };
  }

  if (method === 'YES_NO') {
    if (percentProblem(raw.yesScore)) problems.push(`${where}: the score for “yes” must be a percentage from 0 to 100.`);
    if (percentProblem(raw.noScore)) problems.push(`${where}: the score for “no” must be a percentage from 0 to 100.`);
    return problems.length ? { problems } : { config: { yesScore: raw.yesScore as string, noScore: raw.noScore as string } };
  }

  if (Object.keys(raw).length) return { problems: [`${where}: this scoring method has no settings.`] };
  return { config: {} };
}

/** What a reviewer or the employee entered for one scored line. */
export interface ItemInput {
  actual?: string | null;
  /** Targets for this employee, when the template asks for them per employee. */
  target?: string | null;
  threshold?: string | null;
  stretch?: string | null;
  rating?: string | null;
  marks?: string | null;
  answer?: 'YES' | 'NO' | null;
  /** A number answer to a scored question. */
  value?: string | null;
  scorePercent?: string | null;
  justification?: string | null;
  exempt?: boolean;
}

/** One scored line as the method needs it. */
export interface ScoredLine {
  method: LineMethod;
  config: unknown;
  direction: Direction;
  unitLabel: string | null;
  target: Decimal | null;
  threshold: Decimal | null;
  stretch: Decimal | null;
  maxMarks: Decimal | null;
  minMarks: Decimal | null;
  scale: ScaleDefinition | null;
  /** For NUMBER_RANGE: the answer's range. */
  range?: { min: Decimal; max: Decimal };
}

export type ItemScore =
  | { status: 'SCORED'; percent: Decimal; steps: string[] }
  | { status: 'MISSING'; steps: string[] }
  | { status: 'INVALID'; problem: string };

/** A number for an explanation: up to 4 decimal places, trailing zeros dropped. */
export const show = (value: Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toString();
const pct = (value: Decimal) => `${show(value)}%`;
const unit = (line: ScoredLine, value: Decimal) => (line.unitLabel ? (line.unitLabel === '%' ? `${show(value)}%` : `${show(value)} ${line.unitLabel}`) : show(value));
const clamp = (value: Decimal) => Prisma.Decimal.max(ZERO, Prisma.Decimal.min(HUNDRED, value));
const number = (value: string | null | undefined): Decimal | null | 'BAD' => {
  if (value === null || value === undefined || value.trim() === '') return null;
  return DECIMAL.test(value.trim()) ? D(value.trim()) : 'BAD';
};

/** Achievement against target in %, before any cap; null with a reason when there is no usable target. */
function achievement(line: ScoredLine, actual: Decimal, target: Decimal | null): { value: Decimal; step: string } | { problem: string } {
  if (!target || !target.gt(0)) return { problem: 'There is no target above 0 to compare the result with.' };
  if (line.direction === 'LOWER_IS_BETTER') {
    if (!actual.gt(0)) return { value: HUNDRED.times(10), step: `Achievement: the result is ${unit(line, actual)}, the best possible for a lower-is-better measure` };
    const value = target.div(actual).times(HUNDRED);
    return { value, step: `Achievement = target ${unit(line, target)} ÷ actual ${unit(line, actual)} × 100 = ${pct(value)} (lower is better)` };
  }
  const value = actual.div(target).times(HUNDRED);
  return { value, step: `Achievement = actual ${unit(line, actual)} ÷ target ${unit(line, target)} × 100 = ${pct(value)}` };
}

/** Scores one line from what was entered. */
export function scoreItem(line: ScoredLine, input: ItemInput | undefined): ItemScore {
  const parsed = validateScoringConfig(line.method, line.config, 'Scoring');
  if ('problems' in parsed) return { status: 'INVALID', problem: parsed.problems[0] };
  const config = parsed.config;
  const given = input ?? {};
  const actual = number(given.actual);
  if (actual === 'BAD') return { status: 'INVALID', problem: 'The actual result is not a number.' };
  const target = number(given.target) ?? line.target;
  const threshold = number(given.threshold) ?? line.threshold;
  const stretch = number(given.stretch) ?? line.stretch;
  if (target === 'BAD' || threshold === 'BAD' || stretch === 'BAD') return { status: 'INVALID', problem: 'A target is not a number.' };
  const missing = (what: string): ItemScore => ({ status: 'MISSING', steps: [`No ${what} was given`] });

  switch (line.method) {
    case 'PERCENT_OF_TARGET': {
      if (actual === null) return missing('actual result');
      const a = achievement(line, actual, target);
      if ('problem' in a) return { status: 'INVALID', problem: a.problem };
      const percent = clamp(a.value);
      return { status: 'SCORED', percent, steps: [a.step, percent.eq(a.value) ? `Score = ${pct(percent)}` : `Score = ${pct(percent)} (a score is between 0% and 100%)`] };
    }

    case 'LINEAR_BETWEEN': {
      if (actual === null) return missing('actual result');
      const c = config as LinearConfig;
      if (threshold === null || target === null) return { status: 'INVALID', problem: 'Scoring between threshold and target needs both.' };
      // Measured as "goodness", so lower-is-better works the same way.
      const lower = line.direction === 'LOWER_IS_BETTER';
      const good = (v: Decimal) => (lower ? v.negated() : v);
      const [g, gThreshold, gTarget] = [good(actual), good(threshold), good(target)];
      const gStretch = stretch === null ? null : good(stretch);
      if (!gTarget.gt(gThreshold) || (gStretch !== null && !gStretch.gt(gTarget))) {
        return { status: 'INVALID', problem: lower ? 'For lower-is-better, the threshold must be above the target, and the target above the stretch target.' : 'The threshold must be below the target, and the target below the stretch target.' };
      }
      const [below, atThreshold, atTarget, atStretch] = [D(c.belowThresholdScore), D(c.thresholdScore), D(c.targetScore), D(c.stretchScore)];
      const between = (from: Decimal, to: Decimal, sFrom: Decimal, sTo: Decimal) => sFrom.plus(g.minus(from).div(to.minus(from)).times(sTo.minus(sFrom)));
      const points = `threshold ${unit(line, threshold)} → ${pct(atThreshold)}, target ${unit(line, target)} → ${pct(atTarget)}${stretch !== null ? `, stretch ${unit(line, stretch)} → ${pct(atStretch)}` : ''}`;
      const first = `Actual ${unit(line, actual)}; scoring points: ${points}`;
      if (g.lt(gThreshold)) return { status: 'SCORED', percent: below, steps: [first, `${lower ? 'Above' : 'Below'} the threshold, so the score is ${pct(below)}`] };
      if (g.lt(gTarget)) {
        const percent = between(gThreshold, gTarget, atThreshold, atTarget);
        return { status: 'SCORED', percent, steps: [first, `Between threshold and target, in proportion: ${pct(percent)}`] };
      }
      if (gStretch === null) return { status: 'SCORED', percent: atTarget, steps: [first, `Target reached, so the score is ${pct(atTarget)}`] };
      if (g.lt(gStretch)) {
        const percent = between(gTarget, gStretch, atTarget, atStretch);
        return { status: 'SCORED', percent, steps: [first, `Between target and stretch target, in proportion: ${pct(percent)}`] };
      }
      return { status: 'SCORED', percent: atStretch, steps: [first, `Stretch target reached, so the score is ${pct(atStretch)}`] };
    }

    case 'SLABS': {
      if (actual === null) return missing('actual result');
      const c = config as SlabsConfig;
      const steps: string[] = [];
      let basis = actual;
      if (c.basis === 'ACHIEVEMENT_PERCENT') {
        const a = achievement(line, actual, target);
        if ('problem' in a) return { status: 'INVALID', problem: a.problem };
        basis = a.value;
        steps.push(a.step);
      }
      const label = c.basis === 'ACHIEVEMENT_PERCENT' ? pct(basis) : unit(line, basis);
      const slab = c.slabs.find((s, i) => basis.gte(D(s.from)) && (s.to === null || basis.lt(D(s.to)) || (i === c.slabs.length - 1 && basis.eq(D(s.to)))));
      if (!slab) return { status: 'INVALID', problem: `No slab covers ${label}.` };
      const percent = D(slab.scorePercent);
      steps.push(`${label} falls in the slab from ${slab.from}${slab.to === null ? ' upwards' : ` up to ${slab.to}`}, which scores ${pct(percent)}`);
      return { status: 'SCORED', percent, steps };
    }

    case 'COMPLETION_PERCENT': {
      if (actual === null) return missing('completion percentage');
      const percent = clamp(actual);
      return { status: 'SCORED', percent, steps: [percent.eq(actual) ? `Completed ${pct(actual)}, which is the score` : `Completed ${pct(actual)}; a score is between 0% and 100%, so ${pct(percent)}`] };
    }

    case 'YES_NO': {
      if (!given.answer) return missing('yes or no answer');
      const c = config as YesNoConfig;
      const percent = D(given.answer === 'YES' ? c.yesScore : c.noScore);
      return { status: 'SCORED', percent, steps: [`Answered ${given.answer === 'YES' ? 'yes' : 'no'}, which scores ${pct(percent)}`] };
    }

    case 'RATING_SCALE': {
      if (given.rating === null || given.rating === undefined || given.rating === '') return missing('rating');
      if (!line.scale) return { status: 'INVALID', problem: 'No rating scale is set.' };
      if (!DECIMAL.test(given.rating)) return { status: 'INVALID', problem: 'The rating is not a number.' };
      const result = ratingPercent(line.scale, given.rating, line.maxMarks?.toString() ?? null);
      if ('problem' in result) return { status: 'INVALID', problem: result.problem };
      const level = line.scale.levels.find((l) => l.value.eq(D(given.rating as string)));
      return { status: 'SCORED', percent: result.percent, steps: [`Rated ${given.rating}${level ? ` (${level.label})` : ''}, which scores ${pct(result.percent)} on the scale`] };
    }

    case 'DIRECT_MARKS': {
      const marks = number(given.marks);
      if (marks === null) return missing('marks');
      if (marks === 'BAD') return { status: 'INVALID', problem: 'The marks are not a number.' };
      if (!line.maxMarks || !line.maxMarks.gt(0)) return { status: 'INVALID', problem: 'No maximum marks are set.' };
      const min = line.minMarks ?? ZERO;
      if (marks.lt(min) || marks.gt(line.maxMarks)) return { status: 'INVALID', problem: `Marks must be from ${show(min)} to ${show(line.maxMarks)}.` };
      const percent = marks.div(line.maxMarks).times(HUNDRED);
      return { status: 'SCORED', percent, steps: [`${show(marks)} of ${show(line.maxMarks)} marks = ${pct(percent)}`] };
    }

    case 'NUMBER_RANGE': {
      const value = number(given.value);
      if (value === null) return missing('answer');
      if (value === 'BAD') return { status: 'INVALID', problem: 'The answer is not a number.' };
      if (!line.range || !line.range.max.gt(line.range.min)) return { status: 'INVALID', problem: 'The question has no range to score against.' };
      const { min, max } = line.range;
      if (value.lt(min) || value.gt(max)) return { status: 'INVALID', problem: `The answer must be from ${show(min)} to ${show(max)}.` };
      const percent = value.minus(min).div(max.minus(min)).times(HUNDRED);
      return { status: 'SCORED', percent, steps: [`Answered ${show(value)} on ${show(min)}–${show(max)} = ${pct(percent)}`] };
    }

    case 'MANUAL': {
      const percent = number(given.scorePercent);
      if (percent === null) return missing('score');
      if (percent === 'BAD' || percent.lt(0) || percent.gt(HUNDRED)) return { status: 'INVALID', problem: 'A score is a percentage from 0 to 100.' };
      if (!given.justification?.trim()) return { status: 'INVALID', problem: 'A score given by hand needs a justification.' };
      return { status: 'SCORED', percent, steps: [`Scored ${pct(percent)} by hand: “${given.justification.trim()}”`] };
    }
  }
}
