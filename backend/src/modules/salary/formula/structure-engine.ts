import { Prisma } from '@prisma/client';
import { evaluateFormula, evaluationOrder, explainFormula, FormulaError, formulaNames, Node, parseFormula } from './formula';
import { SYSTEM_VARIABLE_NAMES } from './variables';

/**
 * Works out a salary structure's lines for one employee and month. The same
 * code serves the structure preview and payroll itself, so what a preview
 * shows is what payroll pays.
 *
 * A component's name in a formula means its full-month amount. Then each
 * line set to “pay in proportion to paid days” is multiplied by PRORATION.
 * Each line is rounded twice, at defined points: its full-month amount, and
 * the amount paid, both to its own decimal places.
 */

type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);

export const COMPONENT_CATEGORIES = ['EARNING', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION'] as const;
export const CALCULATION_TYPES = ['FIXED', 'PERCENTAGE', 'FORMULA', 'MANUAL', 'SYSTEM_CALCULATED'] as const;
export const ROUNDING_MODES = ['HALF_UP', 'UP', 'DOWN'] as const;
export type ComponentCategory = (typeof COMPONENT_CATEGORIES)[number];
export type CalculationType = (typeof CALCULATION_TYPES)[number];
export type RoundingMode = (typeof ROUNDING_MODES)[number];

export interface StructureLine {
  code: string;
  name: string;
  category: ComponentCategory;
  calculationType: CalculationType;
  amount: Decimal | null;
  percentage: Decimal | null;
  /** PERCENTAGE: the component code or system value it is a percentage of. */
  percentageBase: string | null;
  formula: string | null;
  isProrated: boolean;
  includeInGross: boolean;
  minAmount: Decimal | null;
  maxAmount: Decimal | null;
  roundingScale: number;
  roundingMode: RoundingMode;
}

export interface StructureProblem {
  /** The component the problem is in, or null for the structure as a whole. */
  code: string | null;
  message: string;
}

export interface CheckedStructure {
  problems: StructureProblem[];
  /** The order to work the lines out in (empty when there are problems). */
  order: string[];
  formulas: Map<string, Node>;
}

const GROSS = 'GROSS';

/** Checks a structure can be worked out: every formula parses, uses only known names, and nothing uses itself. */
export function checkStructure(lines: StructureLine[]): CheckedStructure {
  const problems: StructureProblem[] = [];
  const formulas = new Map<string, Node>();
  const codes = new Set<string>();
  for (const line of lines) {
    if (codes.has(line.code)) problems.push({ code: line.code, message: `${line.code} is in the structure more than once.` });
    codes.add(line.code);
  }
  if (!lines.some((l) => l.category === 'EARNING')) problems.push({ code: null, message: 'A structure needs at least one earning.' });

  const known = (name: string) => codes.has(name) || SYSTEM_VARIABLE_NAMES.has(name);
  const uses = new Map<string, Set<string>>();
  for (const line of lines) {
    const deps = new Set<string>();
    const problem = (message: string) => problems.push({ code: line.code, message });
    if (line.minAmount && line.maxAmount && line.minAmount.gt(line.maxAmount)) problem(`${line.code}: the minimum is more than the maximum.`);
    if (line.calculationType === 'PERCENTAGE') {
      if (!line.percentageBase) problem(`${line.code} is a percentage, so it needs what it is a percentage of.`);
      else if (line.percentageBase === line.code) problem(`${line.code} can’t be a percentage of itself.`);
      else if (!known(line.percentageBase)) problem(`${line.code} is a percentage of ${line.percentageBase}, which is not in this structure or a system value.`);
      else deps.add(line.percentageBase);
    }
    if (line.calculationType === 'FORMULA') {
      if (!line.formula?.trim()) problem(`${line.code} is calculated by formula, so it needs a formula.`);
      else {
        try {
          const tree = parseFormula(line.formula);
          formulas.set(line.code, tree);
          for (const name of formulaNames(tree)) {
            if (name === line.code) problem(`${line.code}’s formula uses ${line.code} itself.`);
            else if (!known(name)) problem(`${line.code}’s formula uses ${name}, which is not in this structure or a system value.`);
            else deps.add(name);
          }
        } catch (e) {
          if (!(e instanceof FormulaError)) throw e;
          problem(`${line.code}’s formula: ${e.message}`);
        }
      }
    }
    uses.set(line.code, deps);
  }
  // GROSS is worked out from every earning counted in gross, so an earning counted in gross can't use it.
  uses.set(GROSS, new Set(lines.filter((l) => l.category === 'EARNING' && l.includeInGross).map((l) => l.code)));

  const result = evaluationOrder(uses);
  if ('cycle' in result) {
    problems.push({ code: result.cycle[0] === GROSS ? result.cycle[1] : result.cycle[0], message: `${result.cycle.join(' → ')}: these use each other, so none of them can be worked out.` });
  }
  if (problems.length) return { problems, order: [], formulas };
  return { problems, order: (result as { order: string[] }).order, formulas };
}

export interface EmployeeOverride {
  amount?: Decimal | null;
  percentage?: Decimal | null;
}

export interface CalculationInput {
  /** System values for this employee and month. */
  variables: Record<string, Decimal>;
  /** The employee's own amounts or percentages, by component code. */
  overrides: Record<string, EmployeeOverride>;
  /** Amounts for manual and system-calculated lines, worked out elsewhere, with how. */
  provided: Record<string, { amount: Decimal; note: string }>;
}

export interface CalculatedLine {
  code: string;
  name: string;
  category: ComponentCategory;
  /** The full-month amount. */
  fullAmount: Decimal;
  /** The amount paid (or deducted) this month. */
  amount: Decimal;
  steps: string[];
}

export interface CalculationResult {
  lines: CalculatedLine[];
  gross: Decimal;
  totalEarnings: Decimal;
  totalDeductions: Decimal;
  employerContributions: Decimal;
  net: Decimal;
  /** Anything that stopped a line being worked out. A result with problems must not be paid. */
  problems: StructureProblem[];
}

const ROUNDING = { HALF_UP: Prisma.Decimal.ROUND_HALF_UP, UP: Prisma.Decimal.ROUND_UP, DOWN: Prisma.Decimal.ROUND_DOWN } as const;
const ROUNDING_WORDS = { HALF_UP: 'rounded', UP: 'rounded up', DOWN: 'rounded down' } as const;
const money = (v: Decimal) => v.toFixed();

/** Works out every line of a checked structure. Never guesses: a value that can't be worked out is a problem, not zero. */
export function calculateStructure(lines: StructureLine[], checked: CheckedStructure, input: CalculationInput): CalculationResult {
  const problems: StructureProblem[] = [...checked.problems];
  const byCode = new Map(lines.map((l) => [l.code, l]));
  const values: Record<string, Decimal | undefined> = { ...input.variables };
  const calculated: CalculatedLine[] = [];

  for (const code of checked.order) {
    if (code === GROSS) {
      const parts = lines.filter((l) => l.category === 'EARNING' && l.includeInGross);
      if (parts.every((l) => values[l.code] !== undefined)) values[GROSS] = parts.reduce((sum, l) => sum.plus(values[l.code] as Decimal), ZERO);
      continue;
    }
    const line = byCode.get(code) as StructureLine;
    const steps: string[] = [];
    const problem = (message: string) => { problems.push({ code, message }); return undefined; };
    const override = input.overrides[code] ?? {};
    let full: Decimal | undefined;

    try {
      switch (line.calculationType) {
        case 'FIXED': {
          const amount = override.amount ?? line.amount;
          if (amount == null) { full = problem(`${code} has no amount: set it on the employee’s salary.`); break; }
          full = amount;
          steps.push(override.amount != null ? `Employee’s own amount ${money(amount)}` : `Fixed amount ${money(amount)}`);
          break;
        }
        case 'PERCENTAGE': {
          const percentage = override.percentage ?? line.percentage;
          const base = line.percentageBase as string;
          if (percentage == null) { full = problem(`${code} has no percentage: set it on the employee’s salary.`); break; }
          const baseValue = values[base];
          if (baseValue === undefined) { full = problem(`${code} can’t be worked out: there is no value for ${base}.`); break; }
          full = baseValue.times(percentage).div(100);
          steps.push(`${money(percentage)}% of ${base} (${money(baseValue)}) = ${money(full)}`);
          break;
        }
        case 'FORMULA': {
          const tree = checked.formulas.get(code) as Node;
          full = evaluateFormula(tree, values);
          steps.push(`${explainFormula(tree, values)} = ${money(full)}`);
          break;
        }
        case 'MANUAL': {
          const given = input.provided[code];
          full = given?.amount ?? ZERO;
          steps.push(given ? given.note : 'No amount entered for this period');
          break;
        }
        case 'SYSTEM_CALCULATED': {
          const given = input.provided[code];
          if (!given) { full = problem(`${code} is worked out by payroll from attendance and records, and that has not been done.`); break; }
          full = given.amount;
          steps.push(given.note);
          break;
        }
      }
    } catch (e) {
      if (!(e instanceof FormulaError)) throw e;
      full = problem(`${code}: ${e.message}`);
    }
    if (full === undefined) continue;

    if (line.minAmount && full.lt(line.minAmount)) { full = line.minAmount; steps.push(`Raised to the minimum ${money(line.minAmount)}`); }
    if (line.maxAmount && full.gt(line.maxAmount)) { full = line.maxAmount; steps.push(`Limited to the maximum ${money(line.maxAmount)}`); }
    if (full.isNegative()) { problem(`${code} comes to ${money(full)}; a component can’t be negative. Check its formula or amounts.`); continue; }
    const mode = ROUNDING[line.roundingMode];
    const roundedFull = full.toDecimalPlaces(line.roundingScale, mode);
    if (!roundedFull.eq(full)) steps.push(`${ROUNDING_WORDS[line.roundingMode]} to ${roundedFull.toFixed(line.roundingScale)}`);
    values[code] = roundedFull;

    let amount = roundedFull;
    if (line.isProrated) {
      const share = input.variables.PRORATION;
      if (share === undefined) { problem(`${code} is paid in proportion to paid days, but the paid share of the month is not known.`); continue; }
      if (!share.eq(1)) {
        amount = roundedFull.times(share).toDecimalPlaces(line.roundingScale, mode);
        steps.push(`× paid share of the month ${money(share)} = ${amount.toFixed(line.roundingScale)}`);
      }
    }
    calculated.push({ code, name: line.name, category: line.category, fullAmount: roundedFull, amount, steps });
  }

  const sum = (pick: (l: CalculatedLine) => boolean) => calculated.filter(pick).reduce((s, l) => s.plus(l.amount), ZERO);
  const totalEarnings = sum((l) => l.category === 'EARNING');
  const totalDeductions = sum((l) => l.category === 'DEDUCTION');
  const net = totalEarnings.minus(totalDeductions);
  if (net.isNegative() && !problems.length) problems.push({ code: null, message: `Deductions (${money(totalDeductions)}) are more than earnings (${money(totalEarnings)}), so net pay would be negative.` });
  // Lines keep the structure's own order, not the order they were worked out in.
  const position = new Map(lines.map((l, i) => [l.code, i]));
  calculated.sort((a, b) => (position.get(a.code) as number) - (position.get(b.code) as number));
  return {
    lines: calculated,
    gross: sum((l) => l.category === 'EARNING' && (byCode.get(l.code) as StructureLine).includeInGross),
    totalEarnings,
    totalDeductions,
    employerContributions: sum((l) => l.category === 'EMPLOYER_CONTRIBUTION'),
    net,
    problems,
  };
}

/** The paid share of a month: (divisor − unpaid days) ÷ divisor, kept between 0 and 1. */
export function prorationShare(divisor: Decimal, unpaidDays: Decimal): Decimal {
  if (divisor.lte(0)) throw new Error('The divisor must be more than zero.');
  const share = divisor.minus(unpaidDays).div(divisor);
  return Prisma.Decimal.min(Prisma.Decimal.max(share, ZERO), D(1)).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP);
}
