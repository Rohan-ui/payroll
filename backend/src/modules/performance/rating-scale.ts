import { Prisma } from '@prisma/client';

/**
 * Rating scales: how a rating is entered and how it becomes a score
 * percentage. Pure functions, so the rules are the same wherever a scale is
 * saved, previewed or used to score, and decimal-safe throughout.
 */

type Decimal = Prisma.Decimal;
const D = (value: string | number | Decimal) => new Prisma.Decimal(value);
const HUNDRED = D(100);

export const INPUT_KINDS = ['LEVELS', 'RANGE', 'MARKS'] as const;
export const CONVERSION_METHODS = ['PROPORTION_OF_MAX', 'MIN_TO_MAX', 'LEVEL_PERCENT'] as const;
export type InputKind = (typeof INPUT_KINDS)[number];
export type ConversionMethod = (typeof CONVERSION_METHODS)[number];

export const MAX_LEVELS = 20;
export const MAX_BANDS = 20;
/** Scores are kept to 4 decimal places, rounded half up once at the end. */
export const SCORE_SCALE = 4;

export interface LevelInput {
  value: string;
  label: string;
  description: string | null;
  scorePercent: string | null;
}

export interface BandInput {
  label: string;
  description: string | null;
  minPercent: string;
  maxPercent: string;
}

export interface ScaleDraftInput {
  inputKind: InputKind;
  conversionMethod: ConversionMethod;
  minValue: string | null;
  maxValue: string | null;
  stepValue: string | null;
  unitLabel: string | null;
  levels: LevelInput[];
  bands: BandInput[];
}

/** A version as stored: levels in value order, bands in score order. */
export interface ScaleDefinition {
  inputKind: InputKind;
  conversionMethod: ConversionMethod;
  minValue: Decimal | null;
  maxValue: Decimal | null;
  stepValue: Decimal | null;
  unitLabel: string | null;
  levels: { value: Decimal; label: string; description: string | null; scorePercent: Decimal | null }[];
  bands: { label: string; description: string | null; minPercent: Decimal; maxPercent: Decimal }[];
}

export interface Problem {
  path: string;
  message: string;
}

const isMultiple = (value: Decimal, step: Decimal) => value.mod(step).isZero();

/** Checks a draft and returns the definition to store, or every problem found. */
export function validateScale(input: ScaleDraftInput): { scale: ScaleDefinition } | { problems: Problem[] } {
  const problems: Problem[] = [];
  const problem = (path: string, message: string) => problems.push({ path, message });
  const kind = input.inputKind;
  const method = input.conversionMethod;

  if (method === 'LEVEL_PERCENT' && kind !== 'LEVELS') problem('conversionMethod', 'A score for each level only works when raters pick a level.');
  if (kind === 'MARKS' && method !== 'PROPORTION_OF_MAX') problem('conversionMethod', 'Marks are scored as marks given out of the maximum marks.');

  const levels = [...input.levels]
    .map((l) => ({ value: D(l.value), label: l.label.trim(), description: l.description?.trim() || null, scorePercent: l.scorePercent === null ? null : D(l.scorePercent) }))
    .sort((a, b) => a.value.comparedTo(b.value));
  const seenValues = new Set<string>();
  const seenLabels = new Set<string>();
  levels.forEach((level, i) => {
    if (!level.label) problem(`levels.${i}.label`, 'Give every level a label.');
    if (seenValues.has(level.value.toString())) problem(`levels.${i}.value`, `Two levels have the value ${level.value.toString()}.`);
    if (seenLabels.has(level.label.toLowerCase())) problem(`levels.${i}.label`, `Two levels are labelled “${level.label}”.`);
    seenValues.add(level.value.toString());
    seenLabels.add(level.label.toLowerCase());
    if (level.scorePercent && level.scorePercent.gt(HUNDRED)) problem(`levels.${i}.scorePercent`, 'A level’s score is at most 100%.');
  });
  if (levels.length > MAX_LEVELS) problem('levels', `A scale has at most ${MAX_LEVELS} levels.`);

  let minValue: Decimal | null = null;
  let maxValue: Decimal | null = null;
  let stepValue: Decimal | null = null;

  if (kind === 'LEVELS') {
    if (input.stepValue !== null) problem('stepValue', 'Raters pick one of the levels, so there is no step.');
    if (levels.length < 2) problem('levels', 'Add at least two levels.');
    if (levels.length) {
      minValue = levels[0].value;
      maxValue = levels[levels.length - 1].value;
    }
    if (method === 'LEVEL_PERCENT') {
      levels.forEach((level, i) => {
        if (level.scorePercent === null) problem(`levels.${i}.scorePercent`, `Give the score for “${level.label || level.value.toString()}”.`);
      });
      // A higher rating never scores less than a lower one.
      for (let i = 1; i < levels.length; i += 1) {
        const before = levels[i - 1].scorePercent;
        const now = levels[i].scorePercent;
        if (before && now && now.lt(before)) problem(`levels.${i}.scorePercent`, `“${levels[i].label}” scores less than the level below it.`);
      }
    } else {
      levels.forEach((level, i) => {
        if (level.scorePercent !== null) problem(`levels.${i}.scorePercent`, 'Scores per level are only used with “a score for each level”.');
      });
    }
  } else if (kind === 'RANGE') {
    if (input.minValue === null) problem('minValue', 'Give the lowest rating.');
    if (input.maxValue === null) problem('maxValue', 'Give the highest rating.');
    if (input.stepValue === null) problem('stepValue', 'Give the step between ratings, such as 1 or 0.5.');
    minValue = input.minValue === null ? null : D(input.minValue);
    maxValue = input.maxValue === null ? null : D(input.maxValue);
    stepValue = input.stepValue === null ? null : D(input.stepValue);
    if (stepValue && stepValue.lte(0)) problem('stepValue', 'The step must be more than 0.');
    if (minValue && maxValue && !maxValue.gt(minValue)) problem('maxValue', 'The highest rating must be more than the lowest.');
    if (minValue && maxValue && stepValue && stepValue.gt(0) && maxValue.gt(minValue) && !isMultiple(maxValue.minus(minValue), stepValue)) {
      problem('stepValue', `Steps of ${stepValue.toString()} from ${minValue.toString()} don’t land on ${maxValue.toString()}.`);
    }
    levels.forEach((level, i) => {
      if (level.scorePercent !== null) problem(`levels.${i}.scorePercent`, 'On a range scale, levels only label values; the score comes from the conversion.');
      if (minValue && maxValue && (level.value.lt(minValue) || level.value.gt(maxValue))) {
        problem(`levels.${i}.value`, `${level.value.toString()} is outside ${minValue.toString()}–${maxValue.toString()}.`);
      } else if (minValue && stepValue && stepValue.gt(0) && !isMultiple(level.value.minus(minValue), stepValue)) {
        problem(`levels.${i}.value`, `${level.value.toString()} isn’t a value raters can give with steps of ${stepValue.toString()}.`);
      }
    });
  } else {
    if (input.minValue !== null || input.maxValue !== null) problem('maxValue', 'Marks run from 0 to each KRA’s or KPI’s own maximum marks.');
    if (input.stepValue === null) problem('stepValue', 'Give the step between marks, such as 1 or 0.5.');
    stepValue = input.stepValue === null ? null : D(input.stepValue);
    if (stepValue && stepValue.lte(0)) problem('stepValue', 'The step must be more than 0.');
    if (levels.length) problem('levels', 'Marks scales have no levels.');
  }
  if (method === 'PROPORTION_OF_MAX' && maxValue && maxValue.lte(0)) problem('maxValue', 'The highest rating must be more than 0 to score as a share of it.');

  const bands = [...input.bands]
    .map((b) => ({ label: b.label.trim(), description: b.description?.trim() || null, minPercent: D(b.minPercent), maxPercent: D(b.maxPercent) }))
    .sort((a, b) => a.minPercent.comparedTo(b.minPercent));
  if (bands.length > MAX_BANDS) problem('bands', `A scale has at most ${MAX_BANDS} final rating bands.`);
  const bandLabels = new Set<string>();
  bands.forEach((band, i) => {
    if (!band.label) problem(`bands.${i}.label`, 'Give every band a label.');
    if (bandLabels.has(band.label.toLowerCase())) problem(`bands.${i}.label`, `Two bands are labelled “${band.label}”.`);
    bandLabels.add(band.label.toLowerCase());
    if (band.maxPercent.gt(HUNDRED)) problem(`bands.${i}.maxPercent`, 'A band ends at 100% at most.');
    if (!band.maxPercent.gt(band.minPercent)) problem(`bands.${i}.maxPercent`, `“${band.label}” must end above where it starts.`);
  });
  if (bands.length) {
    if (!bands[0].minPercent.isZero()) problem('bands.0.minPercent', 'The lowest band must start at 0%, so every score gets a rating.');
    if (!bands[bands.length - 1].maxPercent.eq(HUNDRED)) problem(`bands.${bands.length - 1}.maxPercent`, 'The highest band must end at 100%.');
    for (let i = 1; i < bands.length; i += 1) {
      if (!bands[i].minPercent.eq(bands[i - 1].maxPercent)) {
        problem(`bands.${i}.minPercent`, `“${bands[i].label}” must start where “${bands[i - 1].label}” ends (${bands[i - 1].maxPercent.toString()}%), with no gap or overlap.`);
      }
    }
  }

  if (problems.length) return { problems };
  return { scale: { inputKind: kind, conversionMethod: method, minValue, maxValue, stepValue, unitLabel: input.unitLabel?.trim() || null, levels, bands } };
}

/**
 * The score percentage (0–100) a rating gives, unrounded, or why the rating
 * isn't one this scale allows. `maxMarks` is the rated item's maximum, for
 * MARKS scales. Scoring uses this and rounds once, at the very end.
 */
export function ratingPercent(scale: ScaleDefinition, rating: string, maxMarks: string | null = null): { percent: Decimal } | { problem: string } {
  const value = D(rating);
  if (value.isNegative()) return { problem: 'A rating cannot be negative.' };

  if (scale.inputKind === 'MARKS') {
    if (maxMarks === null || !D(maxMarks).gt(0)) return { problem: 'Marks need the item’s maximum marks.' };
    const max = D(maxMarks);
    if (value.gt(max)) return { problem: `At most ${max.toString()} marks can be given.` };
    if (scale.stepValue && !isMultiple(value, scale.stepValue)) return { problem: `Marks are given in steps of ${scale.stepValue.toString()}.` };
    return { percent: value.div(max).times(HUNDRED) };
  }

  const min = scale.minValue as Decimal;
  const max = scale.maxValue as Decimal;
  if (scale.inputKind === 'LEVELS') {
    const level = scale.levels.find((l) => l.value.eq(value));
    if (!level) return { problem: `${value.toString()} is not one of this scale’s levels.` };
    if (scale.conversionMethod === 'LEVEL_PERCENT') return { percent: level.scorePercent as Decimal };
  } else {
    if (value.lt(min) || value.gt(max)) return { problem: `Ratings run from ${min.toString()} to ${max.toString()}.` };
    if (scale.stepValue && !isMultiple(value.minus(min), scale.stepValue)) return { problem: `Ratings are given in steps of ${scale.stepValue.toString()}.` };
  }
  const percent = scale.conversionMethod === 'MIN_TO_MAX' ? value.minus(min).div(max.minus(min)) : value.div(max);
  return { percent: percent.times(HUNDRED) };
}

/** The score percentage a rating gives, rounded to 4 decimal places for display. */
export function scorePercent(scale: ScaleDefinition, rating: string, maxMarks: string | null = null): { percent: Decimal } | { problem: string } {
  const result = ratingPercent(scale, rating, maxMarks);
  return 'percent' in result ? { percent: result.percent.toDecimalPlaces(SCORE_SCALE, Prisma.Decimal.ROUND_HALF_UP) } : result;
}

/** The final rating band a score falls in; the top band includes 100. */
export function bandFor(scale: ScaleDefinition, percent: Decimal) {
  return scale.bands.find((band, i) => percent.gte(band.minPercent) && (percent.lt(band.maxPercent) || (i === scale.bands.length - 1 && percent.eq(band.maxPercent)))) ?? null;
}
