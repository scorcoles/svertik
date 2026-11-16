// Multi-unit number parameters: a value is px (a plain number) or a percentage, stored as text like CSS
// ("50%"). What 100% means depends on the parameter (`percentOf` in its spec): the document's width or
// height, or half the shape's shorter side (a corner radius of 100% makes a pill or a circle).
// Percentages are resolved to px right before a shape is built, so effects only ever see numbers.

import type { ParamSchema, ParamSpec } from './modifier';

export type PercentOf = 'documentWidth' | 'documentHeight' | 'halfShortSide';

/** The number in "50%" (spaces allowed), or null if the value is not a percentage. */
export function parsePercent(v: unknown): number | null {
  if (typeof v !== 'string') return null;
  const m = /^\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*%\s*$/.exec(v);
  return m ? Number(m[1]) : null;
}

export const formatPercent = (n: number): string => `${Math.round(n * 1000) / 1000}%`;

/** Whether any parameter value is a percentage (so the result depends on the document size). */
export const hasPercent = (params: Record<string, unknown> | undefined): boolean =>
  !!params && Object.values(params).some((v) => parsePercent(v) !== null);

export interface UnitContext {
  /** The document's size; when the scene has none, percentages of it use DEFAULT_PERCENT_BASE. */
  document?: { width: number; height: number } | null;
}

/** 100% of a document side when the scene has no fixed document (its frame fits the content). */
export const DEFAULT_PERCENT_BASE = 1000;

type Numberish = Extract<ParamSpec, { type: 'number' }>;

/** The px that 100% stands for, for this parameter, given the (already px) values of the others. */
export function percentBase(spec: ParamSpec, px: Record<string, unknown>, ctx: UnitContext = {}): number {
  const of = (spec as Numberish).percentOf;
  const doc = ctx.document;
  if (of === 'documentWidth') return doc?.width ?? DEFAULT_PERCENT_BASE;
  if (of === 'documentHeight') return doc?.height ?? DEFAULT_PERCENT_BASE;
  if (of === 'halfShortSide') return Math.min(Number(px.width) || 0, Number(px.height) || 0) / 2;
  return 0;
}

/**
 * The parameters with every percentage turned into px. Document-relative ones go first, then those that
 * depend on other parameters (a radius measured on the resolved width and height).
 */
export function resolveUnits(schema: ParamSchema, params: Record<string, unknown>, ctx: UnitContext = {}): Record<string, unknown> {
  if (!hasPercent(params)) return params;
  const out: Record<string, unknown> = { ...params };
  const order = Object.entries(schema).sort(([, a], [, b]) => rank(a) - rank(b));
  for (const [name, spec] of order) {
    // Only numbers that accept a percentage: a text reading "100%" is just text.
    if (spec.type !== 'number' || !spec.percentOf) continue;
    const pct = parsePercent(out[name]);
    if (pct === null) continue;
    out[name] = (pct / 100) * percentBase(spec, out, ctx);
  }
  return out;
}
const rank = (spec: ParamSpec) => ((spec as Numberish).percentOf === 'halfShortSide' ? 1 : 0);

/** The same length in the other unit: px → "N%" or "N%" → px, so switching units leaves the drawing as it is. */
export function convertUnit(spec: ParamSpec, value: unknown, to: 'px' | '%', px: Record<string, unknown>, ctx: UnitContext = {}): number | string {
  const base = percentBase(spec, px, ctx);
  const pct = parsePercent(value);
  if (to === '%') {
    if (pct !== null) return value as string;
    return formatPercent(base ? ((Number(value) || 0) / base) * 100 : 0);
  }
  if (pct === null) return Number(value) || 0;
  return Math.round(((pct / 100) * base) * 100) / 100;
}
