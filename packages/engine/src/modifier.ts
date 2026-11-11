// The contract of a modifier and its parameter schema.
// The schema is the source of truth: it builds the UI, validates the JSON and says what can be animated.

import type { Bounds, Geometry } from './geometry';

interface ParamBase {
  label?: string;
  /** Pair that can be linked in the panel (width ↔ height): with the lock on, they change in proportion. */
  pair?: string;
  /** For points: X and Y can be linked (in proportion). */
  linkable?: boolean;
  /** For linkable points: they start linked (usually the same value in X and Y). */
  linked?: boolean;
  /** Can be animated on the timeline. Yes by default. */
  animatable?: boolean;
  /** Section of the attributes panel where it shows. Without a group: the main section. */
  group?: string;
  /** Inside Step, does it grow with each copy? By default numbers and angles do. */
  ramp?: boolean;
  /** The "no effect" value it grows from (0 by default; scale, 1). */
  neutral?: number;
  /** A point that is a place in the drawing can be dragged on the canvas. Yes by default. */
  handle?: boolean;
  /** Range for the dice (randomize). false: the dice leaves it alone. Without a range: min/max or a sensible one. */
  random?: [number, number] | false;
  /** For points: the random range is added to the default value (moves it a little) instead of replacing it. */
  randomRelative?: boolean;
  /** Only shown (and only counts) when another parameter has one of these values: `{ tile: ['polygon'] }`. */
  showIf?: Record<string, readonly string[]>;
}

export type ParamSpec =
  | (ParamBase & { type: 'number'; default: number; min?: number; max?: number; step?: number; unit?: string })
  | (ParamBase & { type: 'angle'; default: number })
  | (ParamBase & { type: 'point'; default: [number, number]; unit?: 'fraction' | 'px'; step?: number; min?: number })
  | (ParamBase & { type: 'seed'; default: number })
  | (ParamBase & { type: 'boolean'; default: boolean })
  | (ParamBase & { type: 'color'; default: string })
  | (ParamBase & { type: 'enum'; default: string; options: readonly string[] })
  /** Another node of the scene (its id); empty = none. */
  | (ParamBase & { type: 'node'; default: string })
  /** Free text (several lines). */
  | (ParamBase & { type: 'text'; default: string })
  /** Name of a registered font (see fonts.ts). */
  | (ParamBase & { type: 'font'; default: string });

export type ParamSchema = Record<string, ParamSpec>;

type ValueOf<S extends ParamSpec> = S['default'];
export type ParamValues<P extends ParamSchema> = { [K in keyof P]: ValueOf<P[K]> };

export interface ResolvedModifier {
  def: ModifierDef<any>;
  params: Record<string, unknown>;
  enabled: boolean;
  children: ResolvedModifier[];
}

export interface ModifierContext {
  /** Box of the source drawing: a stable reference for relative parameters (fractions). */
  bounds: Bounds;
  /** Maximum segment length when subdividing before deforming, in SVG units. */
  resolution: number;
  /** Modifiers nested in this one (only Step and the like use them). */
  children: ResolvedModifier[];
  /** The geometry of another node (`node` params), in the coordinates of this stack; null if not known (yet). */
  target?: (id: string) => Geometry | null;
  /**
   * Where the centre of another node (the centroid of its drawing: it doesn't wobble when it turns) has been in
   * the last `length` seconds, in `samples` samples: oldest first, in the coordinates of this stack. Only the
   * current one if the scene is not at a time of its animation; null if not known yet.
   */
  trail?: TrailLookup;
}

export type TrailLookup = (id: string, length: number, samples: number) => [number, number][] | null;

export interface ModifierDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  kind: 'deformer' | 'generator' | 'effector' | 'style' | 'filter';
  /**
   * The result takes up another area (copies, a reflection…): the effects below measure their fractions
   * (centre, radius, strength…) on the box of what this one outputs, not on the source's.
   */
  reframe?: boolean;
  /**
   * Mask: does not change the geometry; the document wraps the whole object (after its stack and its
   * filters) in a `<mask>` made from another object. See modifiers/mask.ts.
   */
  mask?: boolean;
  /** Family (to group them in the menus even when their kinds differ): 'glitch', 'utils'. */
  family?: string;
  params: P;
  apply(geo: Geometry, params: ParamValues<P>, ctx: ModifierContext): Geometry;
  /**
   * Only for `filter` kind: they don't change the geometry; they give SVG filter primitives that read `input`
   * and leave their result in `out`. `place` says where the object is in the document (for zoned filters).
   * They apply to the whole object, after its other effects, in stack order.
   */
  filter?(params: ParamValues<P>, io: { input: string; out: string; id: string }, place: FilterPlace): string;
  /** How far the filter reaches beyond the object's box, in document units (so it isn't clipped). */
  filterPad?(params: ParamValues<P>): number;
  /** Guides for the editor canvas (lines and points, in object coordinates): the bones of Bones. */
  guides?(params: ParamValues<P>, bounds: Bounds): { lines: (readonly [number, number])[][]; points: (readonly [number, number])[] };
}

/** Where the object a filter applies to is, in the document. */
export interface FilterPlace {
  /** A point of the object in fractions of its box (0–1), already in the document (with its rotation and scale). */
  point(fx: number, fy: number): readonly [number, number];
  /** The size of the object (its longest side), in the document: for relative measures. */
  size: number;
  /** The rotation of the object, in degrees. */
  rotation: number;
  /** The area of the filter: [x, y, width, height]. */
  region: [number, number, number, number];
}

/** Type helper: infers the parameters from the schema. */
export const defineModifier = <P extends ParamSchema>(def: ModifierDef<P>): ModifierDef<P> => def;

/** Default values, completed with whatever comes in the scene. */
export function resolveParams<P extends ParamSchema>(schema: P, given: Record<string, unknown> = {}): ParamValues<P> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    const v = given[name];
    out[name] = v === undefined ? spec.default : v;
  }
  return out as ParamValues<P>;
}

/**
 * Parameters of a modifier for copy k (1, 2, 3…) inside Step:
 * numbers grow from their neutral value; the seed changes per copy; the rest stays.
 */
export function rampParams(schema: ParamSchema, params: Record<string, unknown>, k: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [name, spec] of Object.entries(schema)) {
    const v = params[name];
    if (spec.type === 'seed' && typeof v === 'number') out[name] = v + Math.round(k) - 1;
    if ((spec.type !== 'number' && spec.type !== 'angle') || spec.ramp === false || typeof v !== 'number') continue;
    const n = spec.neutral ?? 0;
    out[name] = n + (v - n) * k;
  }
  return out;
}

/** For Range and Field: numbers and angles, from their neutral to their value, by weight w (0–1). Seeds don't change. */
export function weightParams(schema: ParamSchema, params: Record<string, unknown>, w: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...params };
  for (const [name, spec] of Object.entries(schema)) {
    const v = params[name];
    if ((spec.type !== 'number' && spec.type !== 'angle') || spec.ramp === false || typeof v !== 'number') continue;
    const n = spec.neutral ?? 0;
    out[name] = n + (v - n) * w;
  }
  return out;
}

/**
 * Random values for the dice. Respects the schema ranges; what makes no sense to randomize
 * (colours, offsets in pixels…) stays as it is.
 */
/**
 * "To zero": numbers and angles to 0 (or to their neutral value, like scale 1; or to their minimum if 0 isn't allowed).
 * Points, colours, modes, texts and seeds are left alone.
 */
export function zeroParams(schema: ParamSchema, current: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  for (const [name, spec] of Object.entries(schema)) {
    if (spec.type === 'angle') out[name] = 0;
    else if (spec.type === 'number') {
      const v = spec.neutral ?? 0;
      out[name] = Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, v));
    }
    // A place in the drawing (centre, pivot, corner…) doesn't go to 0,0 (the corner): it goes back to its default.
    else if (spec.type === 'point' && spec.unit === 'fraction' && spec.handle !== false) out[name] = [...spec.default];
    // The other points are distances (gap, offset): to zero, or to their minimum.
    else if (spec.type === 'point') out[name] = [Math.max(spec.min ?? -Infinity, 0), Math.max(spec.min ?? -Infinity, 0)];
  }
  return out;
}

export function randomizeParams(schema: ParamSchema, current: Record<string, unknown>, rand: () => number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  // Triangular distribution (mean of two): more often near the middle of the range than at the edges.
  const between = (a: number, b: number) => a + (b - a) * ((rand() + rand()) / 2);
  const snap = (v: number, step?: number) => (step ? Math.round(v / step) * step : v);
  const round = (v: number, step?: number) => Number(snap(v, step).toFixed(step && step < 1 ? String(step).split('.')[1]!.length : 3));
  for (const [name, spec] of Object.entries(schema)) {
    if (spec.random === false) continue;
    switch (spec.type) {
      case 'number': {
        // Without a range of its own: around the default value (30 % of the range), not end to end.
        // The extremes are rarely useful; normal use is close to the starting values.
        let range = spec.random ?? null;
        if (!range && spec.min !== undefined && spec.max !== undefined) {
          const w = (spec.max - spec.min) * 0.3;
          const lo = Math.max(spec.min, spec.default - w / 2), hi = Math.min(spec.max, spec.default + w / 2);
          range = [lo, hi];
        }
        if (!range) break;
        out[name] = round(between(range[0], range[1]), spec.step);
        break;
      }
      case 'angle': {
        const [a, b] = spec.random ?? [spec.default - 45, spec.default + 45];
        out[name] = Math.round(between(a, b));
        break;
      }
      case 'point': {
        if (spec.handle === false && !spec.random) break;
        const [a, b] = spec.random ?? [0.2, 0.8];
        const base: [number, number] = spec.randomRelative ? spec.default : [0, 0];
        const x = round(base[0] + between(a, b));
        // Linked: the same change in both.
        out[name] = spec.linked ? [x, round(base[1] + (x - base[0]))] : [x, round(base[1] + between(a, b))];
        break;
      }
      case 'seed':
        out[name] = 1 + Math.floor(rand() * 9999);
        break;
      case 'enum':
        if (spec.animatable === false && spec.random === undefined) break; // axes and modes: the user's decision
        out[name] = spec.options[Math.floor(rand() * spec.options.length)];
        break;
      case 'boolean':
      case 'color':
      case 'node':
      case 'text':
      case 'font':
        break;
    }
  }
  return out;
}

/** Fraction of the source box → SVG coordinates. */
export const fromFraction = (b: Bounds, [fx, fy]: readonly [number, number]): [number, number] => [
  b.x + fx * b.width,
  b.y + fy * b.height,
];

export const deg = (a: number) => (a * Math.PI) / 180;
