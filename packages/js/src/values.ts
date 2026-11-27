// Values that are not plain numbers: ƒx formulas (`fx`) and scene variables (`custom`, `expose`).
import { evaluateExpression } from '@svertik/engine';

/** A per-frame ƒx formula. Serialized as `{ $expr, fallback }`. */
export class Expr {
  /** `refs`: the variables it reads, so the scene declares them. */
  constructor(readonly source: string, readonly fallback?: number, readonly refs: readonly Var[] = []) {}
  /** The formula, wrapped so it can go inside another one. */
  get term() { return `(${this.source})`; }
  times(n: Operand) { return combine(this, '*', n); }
  plus(n: Operand) { return combine(this, '+', n); }
  minus(n: Operand) { return combine(this, '-', n); }
  div(n: Operand) { return combine(this, '/', n); }
}

export interface VarOptions {
  /** What a control for it says. */
  label?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Unit shown beside its value (px, °, s…). */
  unit?: string;
}

/** A scene variable, `scene.custom.<name>`. Used as a value, it becomes a formula that reads it. */
export class Var {
  constructor(readonly name: string, readonly value: number | Expr, readonly options: VarOptions | null) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(name)) throw new Error(`svertikJS: variable name "${name}" must use letters, digits and _ (not starting with a digit)`);
  }
  get term() { return `scene.custom.${this.name}`; }
  times(n: Operand) { return combine(this, '*', n); }
  plus(n: Operand) { return combine(this, '+', n); }
  minus(n: Operand) { return combine(this, '-', n); }
  div(n: Operand) { return combine(this, '/', n); }
}

export type Operand = number | Expr | Var;
const termOf = (v: Operand) => (typeof v === 'number' ? String(v) : v.term);
const refsOf = (v: Operand): Var[] => (v instanceof Var ? [v] : v instanceof Expr ? [...v.refs] : []);
const combine = (a: Expr | Var, op: string, b: Operand) => new Expr(`${termOf(a)} ${op} ${termOf(b)}`, undefined, [...refsOf(a), ...refsOf(b)]);

/**
 * A ƒx formula, written as a template: ``fx`scene.time * 40` ``. Interpolated variables become their
 * reference (``fx`${radius} * 2` `` → `scene.custom.radius * 2`), formulas are wrapped in brackets and numbers
 * written as they are. ``fx({ fallback: 12 })`…` `` sets the fallback; without it, it is the formula's value
 * at time 0 (0 if it can't be worked out).
 */
export function fx(strings: TemplateStringsArray, ...values: Operand[]): Expr;
export function fx(options: { fallback: number }): (strings: TemplateStringsArray, ...values: Operand[]) => Expr;
export function fx(first: TemplateStringsArray | { fallback: number }, ...values: Operand[]): Expr | ((s: TemplateStringsArray, ...v: Operand[]) => Expr) {
  if (!Array.isArray(first)) {
    const { fallback } = first as { fallback: number };
    return (s: TemplateStringsArray, ...v: Operand[]) => new Expr(joinTemplate(s, v), fallback, v.flatMap(refsOf));
  }
  return new Expr(joinTemplate(first as TemplateStringsArray, values), undefined, values.flatMap(refsOf));
}
const joinTemplate = (strings: TemplateStringsArray, values: Operand[]) =>
  strings.reduce((out, s, i) => out + s + (i < values.length ? termOf(values[i]!) : ''), '').trim();

/** A numeric scene variable, `scene.custom.<name>`; its value may be a formula. */
export const custom = (name: string, value: number | Expr) => new Var(name, value, null);

/** A scene variable with a range and a label: Play and the editor show it as a control. */
export const expose = (name: string, value: number, options: VarOptions = {}) => new Var(name, value, options);

/** The fallback of a formula: its value at time 0 with the scene's variables (0 when it can't be worked out). */
export function fallbackOf(source: string, custom: Record<string, number>, seed = 1): number {
  try {
    return evaluateExpression(source, {
      time: 0, frame: 0, fps: 30, duration: 1, progress: 0, seedGenerator: seed, custom,
      element: { index: 0, count: 1, row: 0, column: 0, u: 0, v: 0, distance: 0, random: 0 },
    });
  } catch {
    return 0;
  }
}
