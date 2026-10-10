import { Prisma } from '@prisma/client';
import { evaluateFormula, evaluationOrder, explainFormula, FormulaError, formulaNames, parseFormula } from './formula';

const D = (v: string | number) => new Prisma.Decimal(v);
const run = (source: string, values: Record<string, string | number> = {}) =>
  evaluateFormula(parseFormula(source), Object.fromEntries(Object.entries(values).map(([k, v]) => [k, D(v)]))).toFixed();
const errorOf = (fn: () => unknown): FormulaError => {
  try { fn(); } catch (e) { if (e instanceof FormulaError) return e; throw e; }
  throw new Error('expected a FormulaError');
};

describe('salary formulas', () => {
  it('works out arithmetic exactly, with percentages and precedence', () => {
    expect(run('40% * CTC', { CTC: 50000 })).toBe('20000');
    expect(run('0.1 + 0.2')).toBe('0.3');
    expect(run('2 + 3 * 4')).toBe('14');
    expect(run('(2 + 3) * 4')).toBe('20');
    expect(run('-BASIC + 10', { BASIC: 4 })).toBe('6');
    expect(run('BASIC / 3', { BASIC: 10 })).toMatch(/^3\.333333/);
  });

  it('accepts names in any case and reports them upper-case', () => {
    expect(run('basic * 2', { BASIC: 5 })).toBe('10');
    expect([...formulaNames(parseFormula('basic + Hra * PAID_DAYS'))].sort()).toEqual(['BASIC', 'HRA', 'PAID_DAYS']);
  });

  it('supports conditions and the allowed functions', () => {
    expect(run('if(PAID_DAYS >= 20 and LATE_COUNT <= 2, 1500, 0)', { PAID_DAYS: 22, LATE_COUNT: 1 })).toBe('1500');
    expect(run('if(PAID_DAYS >= 20 && not (LATE_COUNT <= 2), 1500, 0)', { PAID_DAYS: 22, LATE_COUNT: 1 })).toBe('0');
    expect(run('min(BASIC, 15000) * 12%', { BASIC: 40000 })).toBe('1800');
    expect(run('max(1, 2, 3)')).toBe('3');
    expect(run('round(10 / 3, 2)')).toBe('3.33');
    expect(run('round(2.5)')).toBe('3');
    expect(run('floor(2.79, 1)')).toBe('2.7');
    expect(run('ceil(2.71, 1)')).toBe('2.8');
    expect(run('abs(-4)')).toBe('4');
    expect(run('clamp(X, 0, 100)', { X: 150 })).toBe('100');
  });

  it('only works out the chosen branch of if(), so a guarded division is safe', () => {
    expect(run('if(WORKING_DAYS > 0, BASIC / WORKING_DAYS, 0)', { WORKING_DAYS: 0, BASIC: 30000 })).toBe('0');
  });

  it('refuses to divide by zero instead of giving zero or infinity', () => {
    expect(errorOf(() => run('BASIC / WORKING_DAYS', { BASIC: 30000, WORKING_DAYS: 0 })).code).toBe('DIVISION_BY_ZERO');
  });

  it('refuses a missing value instead of treating it as zero', () => {
    const e = errorOf(() => run('BASIC + HRA', { BASIC: 1 }));
    expect(e.code).toBe('MISSING_VALUE');
    expect(e.message).toContain('HRA');
  });

  it('refuses anything outside the language, with a position', () => {
    expect(errorOf(() => parseFormula('process.exit(1)')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('BASIC; 1')).position).toBe(5);
    expect(errorOf(() => parseFormula('constructor(1)')).code).toBe('UNKNOWN_FUNCTION');
    expect(errorOf(() => parseFormula('eval(1)')).code).toBe('UNKNOWN_FUNCTION');
    expect(errorOf(() => parseFormula('toString(1)')).code).toBe('UNKNOWN_FUNCTION');
    expect(errorOf(() => run('CONSTRUCTOR + __PROTO__')).code).toBe('MISSING_VALUE');
    expect(errorOf(() => parseFormula('"text"')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('BASIC +')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('(BASIC')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('BASIC HRA')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('   ')).code).toBe('SYNTAX');
    expect(errorOf(() => parseFormula('if(1, 2)')).code).toBe('ARGUMENTS');
    expect(errorOf(() => parseFormula('1 < 2 < 3')).code).toBe('SYNTAX');
  });

  it('refuses formulas that are too long or deep', () => {
    expect(errorOf(() => parseFormula('1'.repeat(1001))).code).toBe('TOO_COMPLEX');
    expect(run('round(min(max(if(1 > 0, (((2))), 3), 1), 9), 0)')).toBe('2');
    expect(errorOf(() => parseFormula('1+'.repeat(400) + '1')).code).toBe('TOO_COMPLEX');
    expect(errorOf(() => parseFormula('('.repeat(30) + '1' + ')'.repeat(30))).code).toBe('TOO_COMPLEX');
  });

  it('keeps amounts and conditions apart', () => {
    expect(errorOf(() => run('PAID_DAYS > 20', { PAID_DAYS: 22 })).code).toBe('TYPE');
    expect(errorOf(() => run('if(1, 2, 3)')).code).toBe('TYPE');
    expect(errorOf(() => run('(1 > 0) + 1')).code).toBe('TYPE');
  });

  it('checks decimal places and clamp bounds', () => {
    expect(errorOf(() => run('round(1.5, 1.5)')).code).toBe('ARGUMENTS');
    expect(errorOf(() => run('round(1.5, 9)')).code).toBe('ARGUMENTS');
    expect(errorOf(() => run('clamp(5, 10, 1)')).code).toBe('ARGUMENTS');
  });

  it('explains a result by writing each value beside its name', () => {
    const tree = parseFormula('min(BASIC, 15000) * 12%');
    expect(explainFormula(tree, { BASIC: D(40000) })).toBe('min(BASIC (40000), 15000) × 12%');
    expect(explainFormula(parseFormula('(A + B) * 2'), { A: D(1), B: D(2) })).toBe('(A (1) + B (2)) × 2');
    expect(explainFormula(parseFormula('A - (B - C)'), {})).toBe('A - (B - C)');
  });

  it('orders formulas after what they use, and finds circles', () => {
    const order = evaluationOrder(new Map([
      ['HRA', new Set(['BASIC'])],
      ['BASIC', new Set(['CTC'])],
      ['SPECIAL', new Set(['BASIC', 'HRA'])],
    ]));
    expect(order).toEqual({ order: ['BASIC', 'HRA', 'SPECIAL'] });
    expect(evaluationOrder(new Map([
      ['A', new Set(['B'])],
      ['B', new Set(['C'])],
      ['C', new Set(['A'])],
    ]))).toEqual({ cycle: ['A', 'B', 'C', 'A'] });
    expect(evaluationOrder(new Map([['A', new Set(['A'])]]))).toEqual({ cycle: ['A', 'A'] });
  });
});
