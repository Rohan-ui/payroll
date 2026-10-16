import { Prisma } from '@prisma/client';
import { bandFor, ScaleDefinition, ScaleDraftInput, scorePercent, validateScale } from './rating-scale';

const fivePoint = (extra: Partial<ScaleDraftInput> = {}): ScaleDraftInput => ({
  inputKind: 'LEVELS',
  conversionMethod: 'PROPORTION_OF_MAX',
  minValue: null,
  maxValue: null,
  stepValue: null,
  unitLabel: null,
  levels: [
    { value: '1', label: 'Unsatisfactory', description: null, scorePercent: null },
    { value: '2', label: 'Needs Improvement', description: null, scorePercent: null },
    { value: '3', label: 'Meets Expectations', description: null, scorePercent: null },
    { value: '4', label: 'Exceeds Expectations', description: null, scorePercent: null },
    { value: '5', label: 'Outstanding', description: null, scorePercent: null },
  ],
  bands: [],
  ...extra,
});

const valid = (input: ScaleDraftInput): ScaleDefinition => {
  const result = validateScale(input);
  if ('problems' in result) throw new Error(JSON.stringify(result.problems));
  return result.scale;
};
const percentOf = (scale: ScaleDefinition, rating: string, maxMarks: string | null = null) => {
  const result = scorePercent(scale, rating, maxMarks);
  if ('problem' in result) throw new Error(result.problem);
  return result.percent.toString();
};
const problemsOf = (input: ScaleDraftInput) => {
  const result = validateScale(input);
  return 'problems' in result ? result.problems.map((p) => p.path) : [];
};

describe('rating scales', () => {
  it('takes a level scale’s range from its levels and scores a rating as a share of the highest', () => {
    const scale = valid(fivePoint());
    expect(scale.minValue?.toString()).toBe('1');
    expect(scale.maxValue?.toString()).toBe('5');
    expect(percentOf(scale, '3')).toBe('60');
    expect(percentOf(scale, '5')).toBe('100');
  });

  it('scores from the lowest level when asked, so the lowest rating is 0%', () => {
    const scale = valid(fivePoint({ conversionMethod: 'MIN_TO_MAX' }));
    expect(percentOf(scale, '1')).toBe('0');
    expect(percentOf(scale, '3')).toBe('50');
  });

  it('uses each level’s own score, which must be given and must not fall as ratings rise', () => {
    const levels = fivePoint().levels.map((l, i) => ({ ...l, scorePercent: ['0', '40', '70', '90', '100'][i] }));
    const scale = valid(fivePoint({ conversionMethod: 'LEVEL_PERCENT', levels }));
    expect(percentOf(scale, '3')).toBe('70');
    expect(problemsOf(fivePoint({ conversionMethod: 'LEVEL_PERCENT' }))).toContain('levels.0.scorePercent');
    const falling = levels.map((l, i) => (i === 3 ? { ...l, scorePercent: '60' } : l));
    expect(problemsOf(fivePoint({ conversionMethod: 'LEVEL_PERCENT', levels: falling }))).toContain('levels.3.scorePercent');
  });

  it('refuses a level rating that is not one of the levels', () => {
    expect(scorePercent(valid(fivePoint()), '3.5')).toEqual({ problem: '3.5 is not one of this scale’s levels.' });
  });

  it('allows fractional ratings on a range scale in its steps, and refuses values off a step or outside it', () => {
    const scale = valid(fivePoint({ inputKind: 'RANGE', minValue: '1', maxValue: '5', stepValue: '0.5', conversionMethod: 'MIN_TO_MAX' }));
    expect(percentOf(scale, '3.5')).toBe('62.5');
    expect('problem' in scorePercent(scale, '3.25')).toBe(true);
    expect('problem' in scorePercent(scale, '5.5')).toBe(true);
    expect(problemsOf(fivePoint({ inputKind: 'RANGE', minValue: '0', maxValue: '10', stepValue: '3', levels: [] }))).toContain('stepValue');
  });

  it('scores a percentage scale exactly, without binary rounding', () => {
    const scale = valid({ ...fivePoint(), inputKind: 'RANGE', minValue: '0', maxValue: '100', stepValue: '0.01', unitLabel: '%', levels: [] });
    expect(percentOf(scale, '33.33')).toBe('33.33');
    const thirds = valid({ ...fivePoint(), inputKind: 'RANGE', minValue: '0', maxValue: '3', stepValue: '1', levels: [] });
    expect(percentOf(thirds, '1')).toBe('33.3333');
  });

  it('scores marks out of the rated item’s own maximum', () => {
    const scale = valid({ ...fivePoint(), inputKind: 'MARKS', stepValue: '0.5', levels: [] });
    expect(percentOf(scale, '7.5', '10')).toBe('75');
    expect('problem' in scorePercent(scale, '11', '10')).toBe(true);
    expect('problem' in scorePercent(scale, '7', null)).toBe(true);
    expect(problemsOf({ ...fivePoint(), inputKind: 'MARKS', stepValue: '1', conversionMethod: 'MIN_TO_MAX', levels: [] })).toContain('conversionMethod');
  });

  it('needs final rating bands to run from 0 to 100 with no gap or overlap', () => {
    const band = (label: string, minPercent: string, maxPercent: string) => ({ label, description: null, minPercent, maxPercent });
    const scale = valid(fivePoint({ bands: [band('Below', '0', '50'), band('Meets', '50', '80'), band('Exceeds', '80', '100')] }));
    expect(bandFor(scale, new Prisma.Decimal('49.9999'))?.label).toBe('Below');
    expect(bandFor(scale, new Prisma.Decimal('50'))?.label).toBe('Meets');
    expect(bandFor(scale, new Prisma.Decimal('100'))?.label).toBe('Exceeds');
    expect(problemsOf(fivePoint({ bands: [band('Below', '0', '50'), band('Exceeds', '60', '100')] }))).toContain('bands.1.minPercent');
    expect(problemsOf(fivePoint({ bands: [band('Below', '10', '100')] }))).toContain('bands.0.minPercent');
    expect(problemsOf(fivePoint({ bands: [band('Below', '0', '90')] }))).toContain('bands.0.maxPercent');
  });

  it('needs at least two distinct, labelled levels', () => {
    expect(problemsOf(fivePoint({ levels: [{ value: '1', label: 'Only', description: null, scorePercent: null }] }))).toContain('levels');
    const duplicate = fivePoint().levels.map((l, i) => (i === 1 ? { ...l, value: '1' } : l));
    expect(problemsOf(fivePoint({ levels: duplicate })).some((p) => p.endsWith('.value'))).toBe(true);
  });
});
