import { Prisma } from '@prisma/client';

/**
 * The salary formula language: a small, safe expression language for
 * payroll calculations, read by this parser and never executed as code.
 *
 *   numbers           30000, 12.5, 40% (= 0.40)
 *   names             BASIC, HRA (other components, by code), PAID_DAYS, HOURLY_RATE (system values)
 *   arithmetic        + - * /   and parentheses
 *   comparisons       < <= > >= == !=
 *   logic             and, or, not   (also && || !)
 *   functions         if(cond, a, b)  min(a, b, …)  max(a, b, …)  round(x, places)
 *                     floor(x, places)  ceil(x, places)  abs(x)  clamp(x, low, high)
 *
 * Arithmetic is exact decimal. Division by zero, unknown names and unknown
 * functions are errors, never zero. A formula is limited in length and depth.
 */

export type Decimal = Prisma.Decimal;
const D = (v: string | number | Decimal) => new Prisma.Decimal(v);
const hasOwn = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

export const FORMULA_LIMITS = { length: 1000, depth: 20, nodes: 300 };

export type FormulaErrorCode = 'SYNTAX' | 'TOO_COMPLEX' | 'UNKNOWN_NAME' | 'UNKNOWN_FUNCTION' | 'ARGUMENTS' | 'TYPE' | 'DIVISION_BY_ZERO' | 'MISSING_VALUE';

/** A problem with a formula, with where it is (character position) when known, in words a payroll administrator can act on. */
export class FormulaError extends Error {
  constructor(readonly code: FormulaErrorCode, message: string, readonly position?: number) {
    super(message);
    this.name = 'FormulaError';
  }
}

export type Node =
  | { kind: 'number'; value: Decimal; text: string; pos: number }
  | { kind: 'name'; name: string; pos: number }
  | { kind: 'unary'; op: '-' | 'not'; arg: Node; pos: number }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '<' | '<=' | '>' | '>=' | '==' | '!=' | 'and' | 'or'; left: Node; right: Node; pos: number }
  | { kind: 'call'; fn: string; args: Node[]; pos: number };

type Token = { type: 'num' | 'name' | 'op' | 'lparen' | 'rparen' | 'comma' | 'percent' | 'end'; text: string; pos: number };

const FUNCTIONS: Record<string, { min: number; max: number }> = {
  if: { min: 3, max: 3 },
  min: { min: 2, max: 20 },
  max: { min: 2, max: 20 },
  round: { min: 1, max: 2 },
  floor: { min: 1, max: 2 },
  ceil: { min: 1, max: 2 },
  abs: { min: 1, max: 1 },
  clamp: { min: 3, max: 3 },
};
export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) { i += 1; continue; }
    const rest = source.slice(i);
    const number = rest.match(/^\d+(\.\d+)?/);
    if (number) { tokens.push({ type: 'num', text: number[0], pos: i }); i += number[0].length; continue; }
    const name = rest.match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (name) {
      const lower = name[0].toLowerCase();
      tokens.push(lower === 'and' || lower === 'or' || lower === 'not' ? { type: 'op', text: lower, pos: i } : { type: 'name', text: name[0], pos: i });
      i += name[0].length;
      continue;
    }
    const op = rest.match(/^(<=|>=|==|!=|&&|\|\||[-+*/<>!])/);
    if (op) {
      const text = op[0] === '&&' ? 'and' : op[0] === '||' ? 'or' : op[0] === '!' ? 'not' : op[0];
      tokens.push({ type: 'op', text, pos: i });
      i += op[0].length;
      continue;
    }
    if (c === '(') tokens.push({ type: 'lparen', text: c, pos: i });
    else if (c === ')') tokens.push({ type: 'rparen', text: c, pos: i });
    else if (c === ',') tokens.push({ type: 'comma', text: c, pos: i });
    else if (c === '%') tokens.push({ type: 'percent', text: c, pos: i });
    else throw new FormulaError('SYNTAX', `“${c}” can’t be used in a formula (position ${i + 1}).`, i);
    i += 1;
  }
  tokens.push({ type: 'end', text: '', pos: source.length });
  return tokens;
}

/** Parses a formula into its tree, refusing anything outside the language. */
export function parseFormula(source: string): Node {
  if (!source.trim()) throw new FormulaError('SYNTAX', 'The formula is empty.');
  if (source.length > FORMULA_LIMITS.length) throw new FormulaError('TOO_COMPLEX', `A formula is at most ${FORMULA_LIMITS.length} characters.`);
  const tokens = tokenize(source);
  let at = 0;
  let nodes = 0;
  const peek = () => tokens[at];
  const next = () => tokens[at++];
  // depth = parentheses and function calls inside each other; nodes = numbers, names and operations.
  const count = (depth: number) => {
    nodes += 1;
    if (nodes > FORMULA_LIMITS.nodes || depth > FORMULA_LIMITS.depth) throw new FormulaError('TOO_COMPLEX', 'The formula is too long or nested too deeply. Split it into more components.');
  };
  const binary = (ops: string[], sub: (depth: number) => Node) => (depth: number): Node => {
    let left = sub(depth);
    while (peek().type === 'op' && ops.includes(peek().text)) {
      const t = next();
      count(depth);
      const right = sub(depth);
      left = { kind: 'binary', op: t.text as never, left, right, pos: t.pos };
    }
    return left;
  };
  const primary = (depth: number): Node => {
    count(depth);
    const t = next();
    if (t.type === 'num') {
      let value = D(t.text);
      let text = t.text;
      if (peek().type === 'percent') { next(); value = value.div(100); text = `${t.text}%`; }
      return { kind: 'number', value, text, pos: t.pos };
    }
    if (t.type === 'name') {
      if (peek().type === 'lparen') {
        next();
        const fn = t.text.toLowerCase();
        const args: Node[] = [];
        if (peek().type !== 'rparen') {
          for (;;) {
            args.push(expression(depth + 1));
            if (peek().type === 'comma') { next(); continue; }
            break;
          }
        }
        const close = next();
        if (close.type !== 'rparen') throw new FormulaError('SYNTAX', `Expected “)” to close ${t.text}( at position ${close.pos + 1}.`, close.pos);
        const spec = hasOwn(FUNCTIONS, fn) ? FUNCTIONS[fn] : undefined;
        if (!spec) throw new FormulaError('UNKNOWN_FUNCTION', `There is no function “${t.text}”. Use one of: ${FORMULA_FUNCTIONS.join(', ')}.`, t.pos);
        if (args.length < spec.min || args.length > spec.max) {
          throw new FormulaError('ARGUMENTS', `${fn}() takes ${spec.min === spec.max ? spec.min : `${spec.min} to ${spec.max}`} value${spec.max === 1 ? '' : 's'}, not ${args.length}.`, t.pos);
        }
        return { kind: 'call', fn, args, pos: t.pos };
      }
      return { kind: 'name', name: t.text.toUpperCase(), pos: t.pos };
    }
    if (t.type === 'lparen') {
      const inner = expression(depth + 1);
      const close = next();
      if (close.type !== 'rparen') throw new FormulaError('SYNTAX', `Expected “)” at position ${close.pos + 1}.`, close.pos);
      return inner;
    }
    if (t.type === 'end') throw new FormulaError('SYNTAX', 'The formula ends too early.', t.pos);
    throw new FormulaError('SYNTAX', `Unexpected “${t.text}” at position ${t.pos + 1}.`, t.pos);
  };
  const unary = (depth: number): Node => {
    if (peek().type === 'op' && peek().text === '-') { const t = next(); count(depth); return { kind: 'unary', op: '-', arg: unary(depth), pos: t.pos }; }
    if (peek().type === 'op' && peek().text === '+') { next(); return unary(depth); }
    return primary(depth);
  };
  const multiplicative = binary(['*', '/'], unary);
  const additive = binary(['+', '-'], multiplicative);
  const comparison = (depth: number): Node => {
    const left = additive(depth);
    if (peek().type === 'op' && ['<', '<=', '>', '>=', '==', '!='].includes(peek().text)) {
      const t = next();
      count(depth);
      return { kind: 'binary', op: t.text as never, left, right: additive(depth), pos: t.pos };
    }
    return left;
  };
  const negation = (depth: number): Node => {
    if (peek().type === 'op' && peek().text === 'not') { const t = next(); count(depth); return { kind: 'unary', op: 'not', arg: negation(depth), pos: t.pos }; }
    return comparison(depth);
  };
  const conjunction = binary(['and'], negation);
  const expression: (depth: number) => Node = binary(['or'], conjunction);

  const tree = expression(0);
  const end = peek();
  if (end.type !== 'end') throw new FormulaError('SYNTAX', `Unexpected “${end.text}” at position ${end.pos + 1}.`, end.pos);
  return tree;
}

/** Every name a formula uses (component codes and system values), upper-case. */
export function formulaNames(node: Node, into = new Set<string>()): Set<string> {
  if (node.kind === 'name') into.add(node.name);
  else if (node.kind === 'unary') formulaNames(node.arg, into);
  else if (node.kind === 'binary') { formulaNames(node.left, into); formulaNames(node.right, into); }
  else if (node.kind === 'call') node.args.forEach((a) => formulaNames(a, into));
  return into;
}

type Value = Decimal | boolean;
const isNumber = (v: Value): v is Decimal => typeof v !== 'boolean';

/**
 * A formula's value from the given names. Every name must have a value: a
 * missing one is an error (MISSING_VALUE), never zero.
 */
export function evaluateFormula(node: Node, values: Record<string, Decimal | undefined>): Decimal {
  const result = evaluate(node, values);
  if (!isNumber(result)) throw new FormulaError('TYPE', 'The formula gives yes/no, not an amount. Wrap the condition in if(condition, amount, other amount).');
  return result;
}

function evaluate(node: Node, values: Record<string, Decimal | undefined>): Value {
  const num = (n: Node, what: string) => {
    const v = evaluate(n, values);
    if (!isNumber(v)) throw new FormulaError('TYPE', `${what} must be an amount, not yes/no.`, n.pos);
    return v;
  };
  const bool = (n: Node, what: string) => {
    const v = evaluate(n, values);
    if (isNumber(v)) throw new FormulaError('TYPE', `${what} must be a condition (such as PAID_DAYS > 20), not an amount.`, n.pos);
    return v;
  };
  switch (node.kind) {
    case 'number': return node.value;
    case 'name': {
      const v = hasOwn(values, node.name) ? values[node.name] : undefined;
      if (v === undefined) throw new FormulaError('MISSING_VALUE', `There is no value for ${node.name}.`, node.pos);
      return v;
    }
    case 'unary': return node.op === '-' ? num(node.arg, 'The value after “-”').neg() : !bool(node.arg, 'The value after “not”');
    case 'binary': {
      if (node.op === 'and') return bool(node.left, 'Each side of “and”') && bool(node.right, 'Each side of “and”');
      if (node.op === 'or') return bool(node.left, 'Each side of “or”') || bool(node.right, 'Each side of “or”');
      const a = num(node.left, `The left of “${node.op}”`);
      const b = num(node.right, `The right of “${node.op}”`);
      switch (node.op) {
        case '+': return a.plus(b);
        case '-': return a.minus(b);
        case '*': return a.times(b);
        case '/':
          if (b.isZero()) throw new FormulaError('DIVISION_BY_ZERO', 'The formula divides by zero here. Guard it, for example if(WORKING_DAYS > 0, BASIC / WORKING_DAYS, 0).', node.pos);
          return a.div(b);
        case '<': return a.lt(b);
        case '<=': return a.lte(b);
        case '>': return a.gt(b);
        case '>=': return a.gte(b);
        case '==': return a.eq(b);
        case '!=': return !a.eq(b);
      }
      throw new FormulaError('SYNTAX', 'Unknown operator.', node.pos);
    }
    case 'call': {
      const places = (n: Node | undefined) => {
        if (!n) return 0;
        const p = num(n, 'The number of decimal places');
        if (!p.isInteger() || p.lt(0) || p.gt(6)) throw new FormulaError('ARGUMENTS', 'Decimal places are a whole number from 0 to 6.', n.pos);
        return p.toNumber();
      };
      switch (node.fn) {
        // Only the chosen branch is worked out, so the other may divide by zero safely.
        case 'if': return bool(node.args[0], 'The first value of if()') ? evaluate(node.args[1], values) : evaluate(node.args[2], values);
        case 'min': return Prisma.Decimal.min(...node.args.map((a) => num(a, 'Each value of min()')));
        case 'max': return Prisma.Decimal.max(...node.args.map((a) => num(a, 'Each value of max()')));
        case 'round': return num(node.args[0], 'The value to round').toDecimalPlaces(places(node.args[1]), Prisma.Decimal.ROUND_HALF_UP);
        case 'floor': return num(node.args[0], 'The value to round down').toDecimalPlaces(places(node.args[1]), Prisma.Decimal.ROUND_FLOOR);
        case 'ceil': return num(node.args[0], 'The value to round up').toDecimalPlaces(places(node.args[1]), Prisma.Decimal.ROUND_CEIL);
        case 'abs': return num(node.args[0], 'The value of abs()').abs();
        case 'clamp': {
          const [x, lo, hi] = node.args.map((a) => num(a, 'Each value of clamp()'));
          if (lo.gt(hi)) throw new FormulaError('ARGUMENTS', 'clamp(x, low, high) needs low ≤ high.', node.pos);
          return Prisma.Decimal.min(Prisma.Decimal.max(x, lo), hi);
        }
      }
      throw new FormulaError('UNKNOWN_FUNCTION', `There is no function “${node.fn}”.`, node.pos);
    }
  }
}

const show = (v: Value) => (typeof v === 'boolean' ? (v ? 'yes' : 'no') : v.toFixed());

/** The formula written with each name's value beside it, for explaining a result: “BASIC (30000) × 40% ”. */
export function explainFormula(node: Node, values: Record<string, Decimal | undefined>): string {
  const op = (o: string) => ({ '*': '×', '/': '÷', and: 'and', or: 'or', '==': '=', '!=': '≠', '<=': '≤', '>=': '≥' } as Record<string, string>)[o] ?? o;
  const walk = (n: Node, parentPrecedence: number): string => {
    switch (n.kind) {
      case 'number': return n.text;
      case 'name': return hasOwn(values, n.name) && values[n.name] !== undefined ? `${n.name} (${show(values[n.name] as Decimal)})` : n.name;
      case 'unary': return n.op === '-' ? `−${walk(n.arg, 9)}` : `not ${walk(n.arg, 9)}`;
      case 'call': return `${n.fn}(${n.args.map((a) => walk(a, 0)).join(', ')})`;
      case 'binary': {
        const precedence = { or: 1, and: 2, '<': 3, '<=': 3, '>': 3, '>=': 3, '==': 3, '!=': 3, '+': 4, '-': 4, '*': 5, '/': 5 }[n.op];
        const text = `${walk(n.left, precedence)} ${op(n.op)} ${walk(n.right, precedence + 1)}`;
        return precedence < parentPrecedence ? `(${text})` : text;
      }
    }
  };
  return walk(node, 0);
}

/**
 * The order to work out named formulas in, each after the names it uses; or
 * the circle of names that use each other (which can never be worked out).
 */
export function evaluationOrder(formulas: Map<string, Set<string>>): { order: string[] } | { cycle: string[] } {
  const order: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];
  const visit = (name: string): string[] | null => {
    if (state.get(name) === 'done') return null;
    if (state.get(name) === 'visiting') return [...stack.slice(stack.indexOf(name)), name];
    state.set(name, 'visiting');
    stack.push(name);
    for (const dep of formulas.get(name) ?? []) {
      if (!formulas.has(dep)) continue;
      const cycle = visit(dep);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(name, 'done');
    order.push(name);
    return null;
  };
  for (const name of [...formulas.keys()].sort()) {
    const cycle = visit(name);
    if (cycle) return { cycle };
  }
  return { order };
}
