import { Prisma } from '@prisma/client';
import { calculateStructure, checkStructure, prorationShare, StructureLine } from './structure-engine';

const D = (v: string | number) => new Prisma.Decimal(v);
const line = (code: string, extra: Partial<StructureLine>): StructureLine => ({
  code, name: code, category: 'EARNING', calculationType: 'FIXED', amount: null, percentage: null, percentageBase: null, formula: null,
  isProrated: true, includeInGross: true, minAmount: null, maxAmount: null, roundingScale: 2, roundingMode: 'HALF_UP', ...extra,
});
const variables = (extra: Record<string, string | number> = {}) =>
  Object.fromEntries(Object.entries({ MONTHLY_SALARY: 50000, PRORATION: 1, PAID_DAYS: 30, DIVISOR: 30, ...extra }).map(([k, v]) => [k, D(v)]));

const STANDARD: StructureLine[] = [
  line('BASIC', { calculationType: 'PERCENTAGE', percentage: D(50), percentageBase: 'MONTHLY_SALARY' }),
  line('HRA', { calculationType: 'PERCENTAGE', percentage: D(40), percentageBase: 'BASIC' }),
  line('SPECIAL', { calculationType: 'FORMULA', formula: 'MONTHLY_SALARY - BASIC - HRA' }),
  line('PF', { category: 'DEDUCTION', calculationType: 'FORMULA', formula: 'min(BASIC, 15000) * 12%', isProrated: false, roundingScale: 0 }),
  line('PF_EMPLOYER', { category: 'EMPLOYER_CONTRIBUTION', calculationType: 'FORMULA', formula: 'PF', isProrated: false, includeInGross: false }),
  line('BONUS', { calculationType: 'MANUAL', isProrated: false }),
];

describe('salary structure engine', () => {
  it('works out a structure in dependency order, keeping the structure’s own order', () => {
    const checked = checkStructure(STANDARD);
    expect(checked.problems).toEqual([]);
    expect(checked.order.indexOf('BASIC')).toBeLessThan(checked.order.indexOf('HRA'));
    const result = calculateStructure(STANDARD, checked, { variables: variables(), overrides: {}, provided: {} });
    expect(result.problems).toEqual([]);
    expect(result.lines.map((l) => [l.code, l.amount.toFixed()])).toEqual([
      ['BASIC', '25000'], ['HRA', '10000'], ['SPECIAL', '15000'], ['PF', '1800'], ['PF_EMPLOYER', '1800'], ['BONUS', '0'],
    ]);
    expect(result.gross.toFixed()).toBe('50000');
    expect(result.totalDeductions.toFixed()).toBe('1800');
    expect(result.employerContributions.toFixed()).toBe('1800');
    expect(result.net.toFixed()).toBe('48200');
  });

  it('explains every line', () => {
    const result = calculateStructure(STANDARD, checkStructure(STANDARD), { variables: variables(), overrides: {}, provided: {} });
    const steps = Object.fromEntries(result.lines.map((l) => [l.code, l.steps]));
    expect(steps.HRA).toEqual(['40% of BASIC (25000) = 10000']);
    expect(steps.SPECIAL).toEqual(['MONTHLY_SALARY (50000) - BASIC (25000) - HRA (10000) = 15000']);
    expect(steps.PF).toEqual(['min(BASIC (25000), 15000) × 12% = 1800']);
    expect(steps.BONUS).toEqual(['No amount entered for this period']);
  });

  it('pays prorated lines for the paid share of the month only', () => {
    const share = prorationShare(D(30), D(3));
    expect(share.toFixed()).toBe('0.9');
    const result = calculateStructure(STANDARD, checkStructure(STANDARD), { variables: variables({ PRORATION: share.toFixed() }), overrides: {}, provided: {} });
    const amounts = Object.fromEntries(result.lines.map((l) => [l.code, l.amount.toFixed()]));
    expect(amounts).toMatchObject({ BASIC: '22500', HRA: '9000', SPECIAL: '13500', PF: '1800' });
    expect(result.lines.find((l) => l.code === 'BASIC')?.fullAmount.toFixed()).toBe('25000');
    expect(prorationShare(D(30), D(45)).toFixed()).toBe('0');
    expect(prorationShare(D(26), D(1)).toFixed()).toBe('0.961538');
  });

  it('uses the employee’s own amounts and percentages first', () => {
    const lines = [line('BASIC', { amount: D(10000) }), line('HRA', { calculationType: 'PERCENTAGE', percentage: D(40), percentageBase: 'BASIC' })];
    const result = calculateStructure(lines, checkStructure(lines), { variables: variables(), overrides: { BASIC: { amount: D(20000) }, HRA: { percentage: D(50) } }, provided: {} });
    expect(result.lines.map((l) => l.amount.toFixed())).toEqual(['20000', '10000']);
    expect(result.lines[0].steps[0]).toBe('Employee’s own amount 20000');
  });

  it('refuses to guess a missing amount, and stops lines that depend on it', () => {
    const lines = [line('BASIC', {}), line('HRA', { calculationType: 'PERCENTAGE', percentage: D(40), percentageBase: 'BASIC' })];
    const result = calculateStructure(lines, checkStructure(lines), { variables: variables(), overrides: {}, provided: {} });
    expect(result.problems.map((p) => p.code)).toEqual(['BASIC', 'HRA']);
    expect(result.lines).toEqual([]);
  });

  it('needs a system-calculated amount from payroll rather than assuming zero', () => {
    const lines = [line('BASIC', { amount: D(1000) }), line('OT', { calculationType: 'SYSTEM_CALCULATED', isProrated: false })];
    const missing = calculateStructure(lines, checkStructure(lines), { variables: variables(), overrides: {}, provided: {} });
    expect(missing.problems.map((p) => p.code)).toEqual(['OT']);
    const given = calculateStructure(lines, checkStructure(lines), { variables: variables(), overrides: {}, provided: { OT: { amount: D(500), note: '2 hours × 250' } } });
    expect(given.lines[1].steps).toEqual(['2 hours × 250']);
  });

  it('applies minimum, maximum and rounding, and refuses negative lines and negative net pay', () => {
    const lines = [
      line('BASIC', { amount: D('1000.555') }),
      line('CAPPED', { calculationType: 'FORMULA', formula: 'BASIC * 100', maxAmount: D(5000) }),
      line('FLOOR', { calculationType: 'FORMULA', formula: '1', minAmount: D(10), roundingScale: 0, roundingMode: 'UP' }),
    ];
    const result = calculateStructure(lines, checkStructure(lines), { variables: variables(), overrides: {}, provided: {} });
    expect(result.lines.map((l) => l.amount.toFixed())).toEqual(['1000.56', '5000', '10']);
    expect(result.lines[1].steps).toContain('Limited to the maximum 5000');

    const negative = [line('BASIC', { amount: D(100) }), line('ODD', { calculationType: 'FORMULA', formula: 'BASIC - 200' })];
    expect(calculateStructure(negative, checkStructure(negative), { variables: variables(), overrides: {}, provided: {} }).problems[0].code).toBe('ODD');

    const overdrawn = [line('BASIC', { amount: D(100) }), line('LOAN', { category: 'DEDUCTION', amount: D(200), isProrated: false })];
    expect(calculateStructure(overdrawn, checkStructure(overdrawn), { variables: variables(), overrides: {}, provided: {} }).problems[0].message).toMatch(/negative/);
  });

  it('turns a division by zero into a problem on that line', () => {
    const lines = [line('BASIC', { amount: D(100) }), line('DAILY', { calculationType: 'FORMULA', formula: 'BASIC / DIVISOR' })];
    const result = calculateStructure(lines, checkStructure(lines), { variables: variables({ DIVISOR: 0 }), overrides: {}, provided: {} });
    expect(result.problems).toEqual([{ code: 'DAILY', message: expect.stringContaining('divides by zero') }]);
  });

  it('refuses structures that can’t be worked out', () => {
    const problems = (lines: StructureLine[]) => checkStructure(lines).problems.map((p) => p.message);
    expect(problems([line('A', { calculationType: 'FORMULA', formula: 'B' }), line('B', { calculationType: 'FORMULA', formula: 'A + 1' })])).toEqual([
      'A → B → A: these use each other, so none of them can be worked out.',
    ]);
    expect(problems([line('A', { calculationType: 'FORMULA', formula: 'GROSS * 10%' })])[0]).toMatch(/use each other/);
    expect(problems([line('A', { amount: D(1) }), line('TAX', { category: 'DEDUCTION', calculationType: 'FORMULA', formula: 'GROSS * 10%' })])).toEqual([]);
    expect(problems([line('A', { calculationType: 'FORMULA', formula: 'NOPE + 1' })])[0]).toMatch(/NOPE, which is not in this structure/);
    expect(problems([line('A', { calculationType: 'FORMULA', formula: 'A + 1' })])[0]).toMatch(/uses A itself/);
    expect(problems([line('A', { calculationType: 'FORMULA', formula: '1 +' })])[0]).toMatch(/^A’s formula:/);
    expect(problems([line('A', { calculationType: 'PERCENTAGE', percentage: D(1) })])[0]).toMatch(/percentage of/);
    expect(problems([line('A', { minAmount: D(5), maxAmount: D(1) })])[0]).toMatch(/minimum is more than the maximum/);
    expect(problems([line('A', { category: 'DEDUCTION', amount: D(1) })])).toEqual(['A structure needs at least one earning.']);
    expect(problems([line('A', {}), line('A', {})])[0]).toMatch(/more than once/);
  });
});
