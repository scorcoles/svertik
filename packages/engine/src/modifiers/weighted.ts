import { bounds, type Geometry, type Shape } from '../geometry';
import { weightParams, type ModifierContext } from '../modifier';

/**
 * Applies the nested effects to each element with a weight from 0 to 1 (Range, Field). With weight 0 the
 * element stays as it was; with 1, it gets the full effects. Fractions are measured on each one's box.
 */
export function applyWeighted(
  geo: Geometry,
  ctx: ModifierContext,
  keyOf: (s: Shape, i: number) => number,
  weightOf: (key: number, index: number, count: number, part: Geometry) => number,
  amount: number,
  /** Weight range: Range and Field go from 0 to 1; Stagger lets it overshoot (back, elastic curves). */
  limits: [number, number] = [0, 1],
): Geometry {
  const children = ctx.children.filter((c) => c.enabled);
  if (!children.length) return geo;
  const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
  const out: Shape[] = [];
  let inner = geo.inner;
  keys.forEach((key, index) => {
    const own = geo.shapes.filter((s, i) => keyOf(s, i) === key);
    let part: Geometry = { viewBox: geo.viewBox, shapes: own };
    const w = Math.max(limits[0], Math.min(limits[1], weightOf(key, index, keys.length, part))) * amount;
    if (Math.abs(w) > 1e-6) {
      const local: ModifierContext = { ...ctx, bounds: bounds(part), children: [] };
      for (const c of children) part = c.def.apply(part, weightParams(c.def.params, c.params, w), { ...local, children: c.children });
      // What comes out keeps its element (and its word and line tags).
      const tag = own[0]!;
      out.push(...part.shapes.map((s) => ({ ...s, clone: s.clone ?? tag.clone, word: s.word ?? tag.word, line: s.line ?? tag.line })));
      if (part.inner) inner = { ...inner, ...part.inner };
    } else out.push(...own);
  });
  geo.shapes.forEach((s, i) => keyOf(s, i) < 0 && out.push(s));
  return { viewBox: geo.viewBox, shapes: out, ...(inner ? { inner } : {}) };
}

/** Elements: copies or letters (clone); without them, each shape. By words or lines, if the text tags them. */
export function keyFor(geo: Geometry, unit: string): (s: Shape, i: number) => number {
  const has = (f: 'word' | 'line') => geo.shapes.some((s) => s[f] !== undefined);
  if (unit === 'words' && has('word')) return (s) => s.word ?? -1;
  if (unit === 'lines' && has('line')) return (s) => s.line ?? -1;
  const tagged = geo.shapes.some((s) => s.clone !== undefined);
  return (s, i) => (tagged ? (s.clone ?? -1) : i);
}

export const smooth = (x: number) => x * x * (3 - 2 * x);
