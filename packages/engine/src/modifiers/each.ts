import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { defineModifier, type ModifierContext, type ResolvedModifier } from '../modifier';
import { evaluateForElement, type ElementValues } from '../expression';
import { rng } from '../random';

/**
 * Each: applies the effects nested in it to every element separately (Clone copies, letters, tiles…), with
 * formulas that read the element: `element.index`, `count`, `row`, `column`, `u`, `v`, `distance` and `random`.
 * Like Step, but the per-element value comes from a formula instead of the element's order. A Shape inside it
 * rebuilds each copy of a shape object with other values for its own parameters (Inner, Outer…).
 */
export const each = defineModifier({
  type: 'each',
  label: 'Each',
  kind: 'effector',
  params: {
    seed: { type: 'seed', default: 1, label: 'Random seed' },
  },
  apply(geo, p, ctx) {
    const children = ctx.children.filter((c) => c.enabled);
    if (!children.length) return geo;

    // Elements: by copy number if there are any; otherwise one shape = one element (as in Step).
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const keyOf = (s: Shape, i: number) => (tagged ? (s.clone ?? -1) : i);
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const parts = keys.map((key) => ({ key, shapes: geo.shapes.filter((s, i) => keyOf(s, i) === key) }));

    // Where each element is: its centre, its grid cell. Distance is from the centre of all of them.
    const centres = parts.map(({ shapes }) => {
      const b = bounds({ viewBox: geo.viewBox, shapes });
      return [b.x + b.width / 2, b.y + b.height / 2] as const;
    });
    const mx = centres.reduce((s, c) => s + c[0], 0) / (centres.length || 1);
    const my = centres.reduce((s, c) => s + c[1], 0) / (centres.length || 1);
    const far = centres.reduce((m, c) => Math.max(m, Math.hypot(c[0] - mx, c[1] - my)), 0);
    const rowOf = (shapes: Shape[]) => shapes.find((s) => s.gridRow !== undefined)?.gridRow;
    const columnOf = (shapes: Shape[]) => shapes.find((s) => s.gridColumn !== undefined)?.gridColumn;
    const rows = parts.reduce((n, x) => Math.max(n, (rowOf(x.shapes) ?? -1) + 1), 0);
    const cols = parts.reduce((n, x) => Math.max(n, (columnOf(x.shapes) ?? -1) + 1), 0);

    const out: Shape[] = [];
    let inner = geo.inner;
    parts.forEach(({ key, shapes }, index) => {
      const row = rowOf(shapes), column = columnOf(shapes);
      const along = parts.length > 1 ? index / (parts.length - 1) : 0.5;
      const grid = row !== undefined && column !== undefined;
      const [cx, cy] = centres[index]!;
      const element: ElementValues = {
        index,
        count: parts.length,
        row: row ?? 0,
        column: column ?? 0,
        u: grid ? (cols > 1 ? column! / (cols - 1) : 0.5) : along,
        v: grid ? (rows > 1 ? row! / (rows - 1) : 0.5) : along,
        distance: far > 0 ? Math.hypot(cx - mx, cy - my) / far : 0,
        random: rng(p.seed * 7919 + index + 1)(),
      };
      let part: Geometry = { viewBox: geo.viewBox, shapes };
      const local: ModifierContext = { ...ctx, bounds: bounds(part), children: [] };
      for (const c of children) part = applyFor(c, part, element, local, ctx.expressions);
      out.push(...part.shapes.map((s) => (tagged ? { ...s, clone: key } : s)));
      if (part.inner) inner = { ...inner, ...part.inner };
    });
    const untouched = geo.shapes.filter((s, i) => keyOf(s, i) < 0);
    return { viewBox: geo.viewBox, shapes: [...out, ...untouched], ...(inner ? { inner } : {}) };
  },
});

/** One nested effect on one element: its formulas evaluated for that element (and its own children's too). */
function applyFor(c: ResolvedModifier, part: Geometry, element: ElementValues, ctx: ModifierContext, expressions: unknown): Geometry {
  const params = evaluateForElement(c.params, element, expressions);
  const children = c.children.map((k) => ({ ...k, params: evaluateForElement(k.params, element, expressions) }));
  return c.def.apply(part, params, { ...ctx, children });
}

/**
 * Each › Shape: rebuilds each copy of a shape object with other values for the shape's own parameters (names as in
 * the scene: `innerRadius`, `radius`…). The new copy goes where the Clone put the old one, with its style. Only for
 * shape objects, and for copies a Clone placed (their placement travels with them).
 */
export const shapevalues = defineModifier({
  type: 'shapevalues',
  label: 'Shape',
  kind: 'deformer',
  freeParams: true,
  params: {},
  apply(geo, p, ctx) {
    const over: Record<string, number> = {};
    for (const [key, value] of Object.entries(p as Record<string, unknown>)) if (typeof value === 'number' && Number.isFinite(value)) over[key] = value;
    const placed = geo.shapes[0]?.materialTransform;
    if (!ctx.rebuild || !placed || !Object.keys(over).length) return geo;
    const rebuilt = ctx.rebuild(over);
    if (!rebuilt) return geo;
    const [a, b, c, d, e, f] = placed;
    const moved = mapPoints(rebuilt, ([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
    // Same number of shapes: keep each one's style and tags, with the new outline. Otherwise, the rebuilt ones.
    const shapes = moved.shapes.length === geo.shapes.length
      ? geo.shapes.map((s, i) => ({ ...s, subpaths: moved.shapes[i]!.subpaths }))
      : moved.shapes.map((s) => ({ ...geo.shapes[0]!, ...s, subpaths: s.subpaths }));
    return { viewBox: geo.viewBox, shapes };
  },
});
