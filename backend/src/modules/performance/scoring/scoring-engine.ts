import { Prisma } from '@prisma/client';
import { bandFor } from '../rating-scale';
import { ItemInput, ItemScore, scoreItem, ScoredLine, show } from './scoring-methods';
import { FieldDef, KpiDef, KraDef, MissingRule, PolicyDef, TemplateDef, weightOf } from './template-definition';

/**
 * Works out an appraisal's score from a template version and what was
 * entered for each line, keyed by the line's id.
 *
 * Each line gets a score percentage. A KRA with KPIs is the weighted average
 * of its KPIs; the overall score is the weighted average of the KRAs and any
 * scored questions. Under MARKS, maximum marks are the weights and marks are
 * reported too. Lines left out (exempt, or unrated under EXCLUDE) give their
 * share to the rest, and the explanation says so. Everything is decimal and
 * unrounded until the final score, which is rounded once (half up); the
 * percentages shown for lines are rounded to 4 places for display only.
 */

type Decimal = Prisma.Decimal;
const D = (value: string | number | Decimal) => new Prisma.Decimal(value);
const ZERO = D(0);
const HUNDRED = D(100);

export type LineStatus = 'SCORED' | 'EXEMPT' | 'MISSING' | 'INVALID';

export interface LineResult {
  key: string;
  name: string;
  status: LineStatus;
  /** 0–100, to 4 decimal places for display; null when there is no score. */
  scorePercent: string | null;
  /** The weight it was given: a percentage, or under MARKS its maximum marks. */
  weight: string | null;
  /** Its share of its group after lines were left out or weights shared out, in %. */
  sharePercent: string | null;
  /** Under MARKS: the marks it earned. */
  marks: string | null;
  maxMarks: string | null;
  /** How many points of the overall score it gives. */
  contributionPercent: string | null;
  steps: string[];
  problem: string | null;
}

export interface KraResult extends LineResult {
  code: string;
  kpis: (LineResult & { code: string })[];
}

export interface AppraisalScore {
  /** COMPLETE: every line counted. INCOMPLETE: a rating is still needed. INVALID: something entered can't be scored. */
  status: 'COMPLETE' | 'INCOMPLETE' | 'INVALID';
  scorePercent: string | null;
  marks: string | null;
  totalMarks: string | null;
  band: { label: string; description: string | null } | null;
  kras: KraResult[];
  fields: LineResult[];
  steps: string[];
  problems: string[];
}

type Outcome = ItemScore | { status: 'EXEMPT' };

/** A line or group as the average above it sees it. */
interface Part {
  name: string;
  weight: Decimal | null;
  status: LineStatus;
  percent: Decimal | null;
}

interface Combined {
  status: LineStatus;
  percent: Decimal | null;
  /** Each part's share of the weight counted (0–1); null for parts left out. */
  shares: (Decimal | null)[];
  steps: string[];
}

const pct = (value: Decimal) => `${show(value)}%`;

/** The weighted average of a group's parts, following the template's missing-rating rule. */
function combine(name: string, parts: Part[], rule: MissingRule): Combined {
  const steps: string[] = [];
  const counted: { index: number; weight: Decimal; percent: Decimal }[] = [];
  const left: string[] = [];
  let invalid = false;
  let waiting = false;

  parts.forEach((part, index) => {
    if (part.status === 'INVALID') invalid = true;
    else if (part.status === 'EXEMPT') left.push(`${part.name} (exempt)`);
    else if (part.status === 'MISSING') {
      if (rule === 'BLOCK') waiting = true;
      else if (rule === 'EXCLUDE') left.push(`${part.name} (not rated)`);
      else {
        counted.push({ index, weight: part.weight ?? ZERO, percent: ZERO });
        steps.push(`${part.name} was not rated, so it counts as 0%`);
      }
    } else if (part.percent) {
      counted.push({ index, weight: part.weight ?? ZERO, percent: part.percent });
    }
  });

  const shares: (Decimal | null)[] = parts.map(() => null);
  if (invalid) return { status: 'INVALID', percent: null, shares, steps: [`${name} can’t be scored until the problems below are fixed`] };
  if (waiting) return { status: 'MISSING', percent: null, shares, steps: [`${name} is waiting for ratings`] };
  const total = counted.reduce((t, c) => t.plus(c.weight), ZERO);
  if (!total.gt(0)) return { status: 'EXEMPT', percent: null, shares, steps: [`Nothing in ${name} was scored, so it is left out`] };

  const percent = counted.reduce((t, c) => t.plus(c.weight.times(c.percent)), ZERO).div(total);
  counted.forEach((c) => { shares[c.index] = c.weight.div(total); });
  steps.push(`${name} = (${counted.map((c) => `${show(c.weight)} × ${pct(c.percent)}`).join(' + ')}) ÷ ${show(total)} = ${pct(percent)}`);
  if (left.length) steps.push(`Left out: ${left.join(', ')}. The rest share their weight in proportion.`);
  return { status: 'SCORED', percent, shares, steps };
}

function kpiLine(kpi: KpiDef): ScoredLine {
  const fromTemplate = kpi.targetSource === 'TEMPLATE';
  return {
    method: kpi.method, config: kpi.config, direction: kpi.direction, unitLabel: kpi.unitLabel,
    target: fromTemplate ? kpi.target : null, threshold: fromTemplate ? kpi.threshold : null, stretch: fromTemplate ? kpi.stretch : null,
    maxMarks: kpi.maxMarks, minMarks: null, scale: kpi.scale,
  };
}

function kraLine(kra: KraDef): ScoredLine {
  return {
    method: kra.method ?? 'MANUAL', config: {}, direction: 'NOT_APPLICABLE', unitLabel: null, target: null, threshold: null, stretch: null,
    maxMarks: kra.maxMarks, minMarks: kra.minMarks, scale: kra.scale,
  };
}

function fieldLine(field: FieldDef): ScoredLine {
  const config = (field.config ?? {}) as { min?: string | null; max?: string | null };
  return {
    method: field.type === 'RATING' ? 'RATING_SCALE' : 'NUMBER_RANGE', config: {}, direction: 'NOT_APPLICABLE', unitLabel: null,
    target: null, threshold: null, stretch: null, maxMarks: null, minMarks: null, scale: field.scale,
    range: config.min && config.max ? { min: D(config.min), max: D(config.max) } : undefined,
  };
}

/** One line scored, refusing an exemption the template doesn't allow. */
function outcomeOf(line: ScoredLine, allowsExemption: boolean, input: ItemInput | undefined): Outcome {
  if (input?.exempt) return allowsExemption ? { status: 'EXEMPT' } : { status: 'INVALID', problem: 'This line can’t be marked exempt.' };
  return scoreItem(line, input);
}

function resultOf(key: string, name: string, weight: Decimal | null, maxMarks: Decimal | null, outcome: Outcome | null): LineResult {
  const result: LineResult = {
    key, name, status: outcome?.status ?? 'MISSING', scorePercent: null, weight: weight?.toString() ?? null, sharePercent: null, marks: null,
    maxMarks: maxMarks?.toString() ?? null, contributionPercent: null, steps: [], problem: null,
  };
  if (!outcome) return result;
  if (outcome.status === 'SCORED') { result.scorePercent = show(outcome.percent); result.steps = outcome.steps; }
  else if (outcome.status === 'MISSING') result.steps = outcome.steps;
  else if (outcome.status === 'EXEMPT') result.steps = ['Marked exempt, so it is left out'];
  else result.problem = outcome.problem;
  return result;
}

const percentOf = (outcome: Outcome) => (outcome.status === 'SCORED' ? outcome.percent : null);

export function scoreAppraisal(def: TemplateDef, inputs: Record<string, ItemInput>): AppraisalScore {
  const { policy } = def;
  const marks = policy.model === 'MARKS';
  const problems: string[] = [];
  const note = (name: string, outcome: Outcome) => { if (outcome.status === 'INVALID') problems.push(`${name}: ${outcome.problem}`); };

  // Each KRA (from its KPIs, or rated as a whole), keeping exact values for later.
  const kras = def.kras.map((kra) => {
    const weight = weightOf(policy, kra);
    if (!kra.kpis.length) {
      const outcome = outcomeOf(kraLine(kra), kra.allowsExemption, inputs[kra.key]);
      note(kra.name, outcome);
      return { result: { ...resultOf(kra.key, kra.name, weight, kra.maxMarks, outcome), code: kra.code, kpis: [] } as KraResult, percent: percentOf(outcome), kpis: [] as { percent: Decimal | null; share: Decimal | null }[] };
    }
    const kpis = kra.kpis.map((kpi) => {
      const outcome = outcomeOf(kpiLine(kpi), kpi.allowsExemption, inputs[kpi.key]);
      note(`${kra.name} → ${kpi.name}`, outcome);
      return { kpi, outcome, result: { ...resultOf(kpi.key, kpi.name, weightOf(policy, kpi), kpi.maxMarks, outcome), code: kpi.code } };
    });
    const combined = combine(kra.name, kpis.map(({ kpi, outcome }) => ({ name: kpi.name, weight: weightOf(policy, kpi), status: outcome.status, percent: percentOf(outcome) })), policy.missingRule);
    const result: KraResult = {
      ...resultOf(kra.key, kra.name, weight, kra.maxMarks, null),
      code: kra.code, status: combined.status, scorePercent: combined.percent ? show(combined.percent) : null, steps: combined.steps, kpis: kpis.map((k) => k.result),
    };
    return { result, percent: combined.percent, kpis: kpis.map((k, i) => ({ percent: percentOf(k.outcome), share: combined.shares[i] })) };
  });

  const fields = def.fields.filter((f) => f.scored).map((field) => {
    const outcome = outcomeOf(fieldLine(field), false, inputs[field.key]);
    note(field.label, outcome);
    return { result: resultOf(field.key, field.label, weightOf(policy, field), field.maxMarks, outcome), percent: percentOf(outcome) };
  });

  const overall = combine('Overall score', [
    ...kras.map((k, i) => ({ name: k.result.name, weight: weightOf(policy, def.kras[i]), status: k.result.status, percent: k.percent })),
    ...fields.map((f) => ({ name: f.result.name, weight: f.result.weight === null ? null : D(f.result.weight), status: f.result.status, percent: f.percent })),
  ], policy.missingRule);

  // Shares, contributions and marks, now that the overall weights are known.
  const marksOf = (percent: Decimal | null, maxMarks: string | null) => (marks && percent && maxMarks ? show(percent.times(D(maxMarks)).div(HUNDRED)) : null);
  kras.forEach((k, i) => {
    const share = overall.shares[i];
    k.result.sharePercent = share ? show(share.times(HUNDRED)) : null;
    k.result.contributionPercent = share && k.percent ? show(share.times(k.percent)) : null;
    k.result.marks = marksOf(k.percent, k.result.maxMarks);
    k.kpis.forEach((kpi, j) => {
      const line = k.result.kpis[j];
      line.sharePercent = kpi.share ? show(kpi.share.times(HUNDRED)) : null;
      line.contributionPercent = share && kpi.share && kpi.percent ? show(share.times(kpi.share).times(kpi.percent)) : null;
      line.marks = marksOf(kpi.percent, line.maxMarks);
    });
  });
  fields.forEach((f, i) => {
    const share = overall.shares[kras.length + i];
    f.result.sharePercent = share ? show(share.times(HUNDRED)) : null;
    f.result.contributionPercent = share && f.percent ? show(share.times(f.percent)) : null;
    f.result.marks = marksOf(f.percent, f.result.maxMarks);
  });

  const totalMarks = marks
    ? policy.totalMarks ?? [...def.kras.map((k) => k.maxMarks), ...def.fields.filter((f) => f.scored).map((f) => f.maxMarks)].reduce<Decimal>((t, v) => t.plus(v ?? 0), ZERO)
    : null;
  const steps = [...overall.steps];
  let scorePercent: string | null = null;
  let marksEarned: string | null = null;
  let band: AppraisalScore['band'] = null;
  if (overall.status === 'SCORED' && overall.percent) {
    const rounded = overall.percent.toDecimalPlaces(policy.decimals, Prisma.Decimal.ROUND_HALF_UP);
    scorePercent = rounded.toFixed(policy.decimals);
    if (!rounded.eq(overall.percent)) steps.push(`Rounded once, to ${policy.decimals} decimal place${policy.decimals === 1 ? '' : 's'}: ${scorePercent}%`);
    if (totalMarks) {
      marksEarned = overall.percent.times(totalMarks).div(HUNDRED).toDecimalPlaces(policy.decimals, Prisma.Decimal.ROUND_HALF_UP).toFixed(policy.decimals);
      steps.push(`Marks = ${pct(overall.percent)} of ${show(totalMarks)} = ${marksEarned}`);
    }
    if (policy.finalScale) {
      const found = bandFor(policy.finalScale, rounded);
      band = found && { label: found.label, description: found.description };
      if (found) steps.push(`${scorePercent}% is in the band ${show(found.minPercent)}–${show(found.maxPercent)}%: ${found.label}`);
    }
  }

  return {
    status: overall.status === 'INVALID' ? 'INVALID' : overall.status === 'SCORED' ? 'COMPLETE' : 'INCOMPLETE',
    scorePercent, marks: marksEarned, totalMarks: totalMarks?.toString() ?? null, band,
    kras: kras.map((k) => k.result), fields: fields.map((f) => f.result), steps, problems,
  };
}
