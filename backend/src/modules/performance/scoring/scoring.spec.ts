import { Prisma } from '@prisma/client';
import { ScaleDefinition, validateScale } from '../rating-scale';
import { defaultConfig, scoreItem, ScoredLine } from './scoring-methods';
import { scoreAppraisal } from './scoring-engine';
import { KpiDef, KraDef, TemplateDef, validateTemplate } from './template-definition';
import { validateFieldConfig } from './form-fields';

const D = (v: string) => new Prisma.Decimal(v);

const scale = (bands = false): ScaleDefinition => {
  const result = validateScale({
    inputKind: 'LEVELS', conversionMethod: 'PROPORTION_OF_MAX', minValue: null, maxValue: null, stepValue: null, unitLabel: null,
    levels: ['Unsatisfactory', 'Needs Improvement', 'Meets', 'Exceeds', 'Outstanding'].map((label, i) => ({ value: String(i + 1), label, description: null, scorePercent: null })),
    bands: bands ? [
      { label: 'Below', description: null, minPercent: '0', maxPercent: '60' },
      { label: 'Meets', description: null, minPercent: '60', maxPercent: '85' },
      { label: 'Exceeds', description: null, minPercent: '85', maxPercent: '100' },
    ] : [],
  });
  if ('problems' in result) throw new Error('bad scale');
  return result.scale;
};

const kpi = (key: string, extra: Partial<KpiDef> = {}): KpiDef => ({
  key, code: key.toUpperCase(), name: key, measurementType: 'NUMERIC', direction: 'HIGHER_IS_BETTER', unitLabel: null, method: 'PERCENT_OF_TARGET', config: {},
  targetSource: 'TEMPLATE', target: D('100'), threshold: null, stretch: null, weightPercent: D('50'), maxMarks: null, scale: null, allowsExemption: false, ...extra,
});
const kra = (key: string, weight: string, kpis: KpiDef[], extra: Partial<KraDef> = {}): KraDef => ({
  key, code: key.toUpperCase(), name: key, weightPercent: D(weight), maxMarks: null, minMarks: null, method: kpis.length ? null : 'RATING_SCALE', scale: kpis.length ? null : scale(),
  allowsExemption: false, kpis, ...extra,
});
const policy = (extra: Partial<TemplateDef['policy']> = {}): TemplateDef['policy'] => ({ model: 'WEIGHTED', weightRule: 'MUST_TOTAL', totalMarks: null, missingRule: 'BLOCK', decimals: 2, finalScale: null, ...extra });

/** The spec's example: Business results 40% (revenue 60%, new customers 40%), quality 25%, productivity 20%, teamwork 15%. */
const example = (extra: Partial<TemplateDef['policy']> = {}): TemplateDef => ({
  policy: policy(extra),
  kras: [
    kra('business', '40', [
      kpi('revenue', { measurementType: 'CURRENCY', unitLabel: '₹', target: D('1000000'), weightPercent: D('60') }),
      kpi('customers', { measurementType: 'COUNT', target: D('10'), weightPercent: D('40') }),
    ]),
    kra('quality', '25', [kpi('defects', { measurementType: 'PERCENTAGE', unitLabel: '%', direction: 'LOWER_IS_BETTER', target: D('2'), weightPercent: D('100') })]),
    kra('productivity', '20', []),
    kra('teamwork', '15', []),
  ],
  fields: [],
});
const line = (extra: Partial<ScoredLine>): ScoredLine => ({
  method: 'PERCENT_OF_TARGET', config: {}, direction: 'HIGHER_IS_BETTER', unitLabel: null, target: D('100'), threshold: null, stretch: null, maxMarks: null, minMarks: null, scale: null, ...extra,
});
const percentOf = (score: ReturnType<typeof scoreItem>) => (score.status === 'SCORED' ? score.percent.toString() : score.status === 'INVALID' ? `INVALID: ${score.problem}` : 'MISSING');

describe('scoring methods', () => {
  it('scores achievement against target, both ways, and never divides by zero', () => {
    expect(percentOf(scoreItem(line({}), { actual: '85' }))).toBe('85');
    expect(percentOf(scoreItem(line({}), { actual: '130' }))).toBe('100');
    expect(percentOf(scoreItem(line({ direction: 'LOWER_IS_BETTER', target: D('2') }), { actual: '2.5' }))).toBe('80');
    expect(percentOf(scoreItem(line({ direction: 'LOWER_IS_BETTER', target: D('2') }), { actual: '0' }))).toBe('100');
    expect(percentOf(scoreItem(line({ target: D('0') }), { actual: '5' }))).toMatch(/^INVALID: There is no target above 0/);
    expect(percentOf(scoreItem(line({ target: null }), { actual: '5', target: '10' }))).toBe('50');
    expect(percentOf(scoreItem(line({}), {}))).toBe('MISSING');
  });

  it('explains the working in words', () => {
    const score = scoreItem(line({ unitLabel: '₹', target: D('1000000') }), { actual: '850000' });
    expect(score.status === 'SCORED' && score.steps).toEqual(['Achievement = actual 850000 ₹ ÷ target 1000000 ₹ × 100 = 85%', 'Score = 85%']);
  });

  it('scores linearly between threshold, target and stretch, for lower-is-better too', () => {
    const config = { belowThresholdScore: '0', thresholdScore: '50', targetScore: '80', stretchScore: '100' };
    const higher = line({ method: 'LINEAR_BETWEEN', config, threshold: D('60'), target: D('100'), stretch: D('120') });
    expect(percentOf(scoreItem(higher, { actual: '50' }))).toBe('0');
    expect(percentOf(scoreItem(higher, { actual: '80' }))).toBe('65');
    expect(percentOf(scoreItem(higher, { actual: '110' }))).toBe('90');
    expect(percentOf(scoreItem(higher, { actual: '150' }))).toBe('100');
    const lower = line({ method: 'LINEAR_BETWEEN', config, direction: 'LOWER_IS_BETTER', threshold: D('5'), target: D('2'), stretch: D('1') });
    expect(percentOf(scoreItem(lower, { actual: '3.5' }))).toBe('65');
    expect(percentOf(scoreItem(lower, { actual: '6' }))).toBe('0');
    const flat = line({ method: 'LINEAR_BETWEEN', config, threshold: D('100'), target: D('100') });
    expect(percentOf(scoreItem(flat, { actual: '100' }))).toMatch(/^INVALID/);
  });

  it('scores slabs on achievement, refusing results no slab covers', () => {
    const slabs = line({ method: 'SLABS', config: defaultConfig('SLABS') });
    expect(percentOf(scoreItem(slabs, { actual: '59.99' }))).toBe('0');
    expect(percentOf(scoreItem(slabs, { actual: '95' }))).toBe('80');
    expect(percentOf(scoreItem(slabs, { actual: '140' }))).toBe('100');
    const actualSlabs = line({ method: 'SLABS', config: { basis: 'ACTUAL', slabs: [{ from: '10', to: '20', scorePercent: '50' }] } });
    expect(percentOf(scoreItem(actualSlabs, { actual: '20' }))).toBe('50');
    expect(percentOf(scoreItem(actualSlabs, { actual: '5' }))).toBe('INVALID: No slab covers 5.');
  });

  it('scores yes/no, completion, marks, ratings and hand-given scores, which need a reason', () => {
    expect(percentOf(scoreItem(line({ method: 'YES_NO', config: { yesScore: '100', noScore: '20' } }), { answer: 'NO' }))).toBe('20');
    expect(percentOf(scoreItem(line({ method: 'COMPLETION_PERCENT' }), { actual: '120' }))).toBe('100');
    expect(percentOf(scoreItem(line({ method: 'DIRECT_MARKS', maxMarks: D('20') }), { marks: '15' }))).toBe('75');
    expect(percentOf(scoreItem(line({ method: 'DIRECT_MARKS', maxMarks: D('20'), minMarks: D('5') }), { marks: '4' }))).toMatch(/^INVALID: Marks must be from 5 to 20/);
    expect(percentOf(scoreItem(line({ method: 'RATING_SCALE', scale: scale() }), { rating: '4' }))).toBe('80');
    expect(percentOf(scoreItem(line({ method: 'MANUAL' }), { scorePercent: '70' }))).toBe('INVALID: A score given by hand needs a justification.');
    expect(percentOf(scoreItem(line({ method: 'MANUAL' }), { scorePercent: '70', justification: 'Covered for a colleague all quarter' }))).toBe('70');
  });
});

describe('appraisal score', () => {
  const ratings = { revenue: { actual: '850000' }, customers: { actual: '12' }, defects: { actual: '2.5' }, productivity: { rating: '4' }, teamwork: { rating: '5' } };

  it('weights KPIs within their KRA and KRAs within the appraisal, with each contribution shown', () => {
    const result = scoreAppraisal(example(), ratings);
    expect(result.status).toBe('COMPLETE');
    // Business = 60×85 + 40×100 = 91; quality 80; productivity 80; teamwork 100.
    expect(result.kras.map((k) => k.scorePercent)).toEqual(['91', '80', '80', '100']);
    // 0.4×91 + 0.25×80 + 0.2×80 + 0.15×100 = 87.4
    expect(result.scorePercent).toBe('87.40');
    expect(result.kras[0].kpis.map((k) => [k.sharePercent, k.contributionPercent])).toEqual([['60', '20.4'], ['40', '16']]);
    expect(result.kras.map((k) => k.contributionPercent)).toEqual(['36.4', '20', '16', '15']);
    expect(result.steps[0]).toBe('Overall score = (40 × 91% + 25 × 80% + 20 × 80% + 15 × 100%) ÷ 100 = 87.4%');
  });

  it('rounds once, at the end, and names the final rating band', () => {
    const def = example({ decimals: 1, finalScale: scale(true) });
    def.kras = [kra('a', '100', [kpi('x', { weightPercent: D('1') }), kpi('y', { weightPercent: D('1') }), kpi('z', { weightPercent: D('1') })])];
    def.policy.weightRule = 'NORMALIZE';
    const result = scoreAppraisal(def, { x: { actual: '100' }, y: { actual: '100' }, z: { actual: '57' } });
    // (100 + 100 + 57) ÷ 3 = 85.666…, one rounding → 85.7, which is in "Exceeds".
    expect(result.kras[0].scorePercent).toBe('85.6667');
    expect(result.scorePercent).toBe('85.7');
    expect(result.band?.label).toBe('Exceeds');
  });

  it('holds the score back, leaves lines out, or counts them as zero, as the template says', () => {
    const partial = { ...ratings, customers: {} };
    expect(scoreAppraisal(example({ missingRule: 'BLOCK' }), partial)).toMatchObject({ status: 'INCOMPLETE', scorePercent: null });
    const excluded = scoreAppraisal(example({ missingRule: 'EXCLUDE' }), partial);
    expect(excluded.kras[0].scorePercent).toBe('85');
    expect(excluded.kras[0].steps[1]).toContain('Left out: customers (not rated)');
    const zero = scoreAppraisal(example({ missingRule: 'ZERO' }), partial);
    expect(zero.kras[0].scorePercent).toBe('51');
  });

  it('leaves out exempt lines only where the template allows it', () => {
    const def = example();
    expect(scoreAppraisal(def, { ...ratings, customers: { exempt: true } }).status).toBe('INVALID');
    def.kras[0].kpis[1].allowsExemption = true;
    const result = scoreAppraisal(def, { ...ratings, customers: { exempt: true } });
    expect(result.kras[0].kpis[1].status).toBe('EXEMPT');
    expect(result.kras[0].scorePercent).toBe('85');
    expect(result.kras[0].kpis[0].sharePercent).toBe('100');
  });

  it('scores in marks, where maximum marks are the weights', () => {
    const def: TemplateDef = {
      policy: policy({ model: 'MARKS', totalMarks: D('100') }),
      kras: [
        kra('sales', '0', [kpi('rev', { weightPercent: null, maxMarks: D('30') }), kpi('cust', { weightPercent: null, maxMarks: D('20') })], { weightPercent: null, maxMarks: D('50') }),
        kra('conduct', '0', [], { weightPercent: null, maxMarks: D('50'), method: 'DIRECT_MARKS', scale: null }),
      ],
      fields: [],
    };
    expect(validateTemplate(def)).toEqual([]);
    const result = scoreAppraisal(def, { rev: { actual: '80' }, cust: { actual: '100' }, conduct: { marks: '35' } });
    expect(result.kras[0].kpis.map((k) => k.marks)).toEqual(['24', '20']);
    expect(result.kras.map((k) => k.marks)).toEqual(['44', '35']);
    expect([result.scorePercent, result.marks, result.totalMarks]).toEqual(['79.00', '79.00', '100']);
  });

  it('counts scored questions inside the same total', () => {
    const def = example();
    def.kras[3].weightPercent = D('5');
    def.fields = [{ key: 'communication', fieldKey: 'communication', label: 'Communication', type: 'RATING', required: true, filledBy: 'REVIEWERS', visibility: 'ALWAYS', config: {}, scale: scale(), scored: true, weightPercent: D('10'), maxMarks: null }];
    expect(validateTemplate(def)).toEqual([]);
    const result = scoreAppraisal(def, { ...ratings, communication: { rating: '3' } });
    expect(result.fields[0]).toMatchObject({ scorePercent: '60', contributionPercent: '6' });
    // 36.4 + 20 + 16 + 0.05×100 + 0.1×60 = 83.4
    expect(result.scorePercent).toBe('83.40');
  });
});

describe('template rules', () => {
  const paths = (def: TemplateDef) => validateTemplate(def).map((p) => p.path);

  it('accepts weights that total 100% at both levels', () => {
    expect(validateTemplate(example())).toEqual([]);
  });

  it('refuses weights that don’t total, without adjusting them, unless the template shares them out', () => {
    const def = example();
    def.kras[0].kpis[1].weightPercent = D('30');
    def.kras[3].weightPercent = D('10');
    const problems = validateTemplate(def);
    expect(problems.map((p) => p.message)).toEqual([
      'business’s KPI weights add up to 90%, not 100%. Change them, or let weights be shared out in proportion.',
      'The KRAs weights add up to 95%, not 100%. Change them, or let weights be shared out in proportion.',
    ]);
    expect(def.kras[3].weightPercent?.toString()).toBe('10');
    def.policy.weightRule = 'NORMALIZE';
    expect(validateTemplate(def)).toEqual([]);
  });

  it('checks methods against the kind of measurement, and targets set in the template', () => {
    const def = example();
    def.kras[0].kpis[0].method = 'YES_NO';
    def.kras[0].kpis[1].target = null;
    def.kras[1].kpis[0] = kpi('defects', { method: 'LINEAR_BETWEEN', config: defaultConfig('LINEAR_BETWEEN'), direction: 'LOWER_IS_BETTER', threshold: D('1'), target: D('2'), weightPercent: D('100') });
    expect(paths(def)).toEqual(expect.arrayContaining(['kras.0.kpis.0.method', 'kras.0.kpis.1.target', 'kras.1.kpis.0.target']));
    def.kras[0].kpis[1].targetSource = 'PER_EMPLOYEE';
    expect(paths(def)).not.toContain('kras.0.kpis.1.target');
  });

  it('refuses a KPI counted twice, and a KRA without KPIs or a way to rate it', () => {
    const def = example();
    def.kras[1].kpis[0] = kpi('revenue', { weightPercent: D('100') });
    def.kras[2].method = null;
    expect(paths(def)).toEqual(expect.arrayContaining(['kras.1.kpis.0', 'kras.2.method']));
  });

  it('checks question settings, and only lets rating and number questions count', () => {
    expect('problems' in validateFieldConfig('DROPDOWN', { options: ['Yes', 'yes'] }, false, 'Q')).toBe(true);
    expect('problems' in validateFieldConfig('NUMBER', { min: null, max: '10', decimals: 0 }, true, 'Q')).toBe(true);
    expect(validateFieldConfig('LONG_TEXT', { maxLength: 2000 }, false, 'Q')).toEqual({ config: { maxLength: 2000 } });
    const def = example();
    def.fields = [{ key: 'goals', fieldKey: 'goals', label: 'Goals', type: 'LONG_TEXT', required: false, filledBy: 'SELF', visibility: 'NEVER', config: { maxLength: 100 }, scale: null, scored: true, weightPercent: D('5'), maxMarks: null }];
    expect(paths(def)).toEqual(expect.arrayContaining(['fields.0.visibility', 'fields.0.scored']));
  });
});
