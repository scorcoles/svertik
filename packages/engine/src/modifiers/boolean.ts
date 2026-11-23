import { difference, intersection, union, xor, type MultiPolygon, type Pair } from '../polygon';
import { inside, regionOf, ring, toSubPath } from '../clip';
import { line, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Boolean operations between elements.
 * An element is each child of a group, each copy of a Clone or each tile: what Step numbers.
 * Without tagged elements, each shape is one (as in Explosion).
 * - union: everything in one shape; intersect: what all share; exclude: what doesn't overlap;
 * - subtract: the front ones are cut out of the furthest back ("Minus Front").
 * Open lines have no surface: they don't count for the result, but aren't lost. With union they
 * stay whole; otherwise, clipped by the result (when subtracting, only those of the back one).
 * Curves are approximated with straight segments (the scene's resolution).
 */
export const boolean = defineModifier({
  type: 'boolean',
  label: 'Boolean',
  kind: 'generator',
  params: {
    mode: { type: 'enum', default: 'union', options: ['union', 'subtract', 'intersect', 'exclude'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    // Elements in paint order: the first, the furthest back.
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const elements = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const k = tagged ? (s.clone ?? -1) : i;
      elements.set(k, [...(elements.get(k) ?? []), s]);
    });
    const step = Math.max(ctx.resolution, 1e-3);
    const list = [...elements.values()].map((shapes) => ({ shapes, region: regionOf(shapes, step) }));
    const solid = list.filter((x) => x.region.length);
    if (solid.length < 2) return geo;
    const [first, ...rest] = solid.map((x) => x.region) as [MultiPolygon, ...MultiPolygon[]];
    const out =
      p.mode === 'subtract' ? difference(first, ...rest) : p.mode === 'intersect' ? intersection(first, ...rest) : p.mode === 'exclude' ? xor(first, ...rest) : union(first, ...rest);
    // Style: the back one's when subtracting (it is what remains); otherwise the front one's.
    const owner = p.mode === 'subtract' ? solid[0]! : solid[solid.length - 1]!;
    const from = owner.shapes.find((s) => s.subpaths.some((sp) => sp.closed)) ?? owner.shapes[0]!;
    const subpaths = out.flatMap((poly) => poly.map(toSubPath)).filter((s): s is SubPath => !!s);
    const shapes: Shape[] = subpaths.length ? [{ ...from, subpaths, clone: 0 }] : [];

    // Lines: when subtracting, only the back one's (and those of elements that are only lines).
    const keepFrom = p.mode === 'subtract' ? list.filter((x) => x === solid[0] || !x.region.length) : list;
    for (const { shapes: own } of keepFrom) {
      for (const s of own) {
        const open = s.subpaths.filter((sp) => !sp.closed);
        if (!open.length) continue;
        const kept = p.mode === 'union' ? open : open.flatMap((sp) => clipLine(sp, out, step));
        if (kept.length) shapes.push({ ...s, subpaths: kept, clone: 0 });
      }
    }
    return { viewBox: geo.viewBox, shapes };
  },
});

/** The pieces of an open line that fall inside a surface (approximate, at the resolution). */
function clipLine(sp: SubPath, region: MultiPolygon, step: number): SubPath[] {
  const pts = ring(sp, step) as Pair[];
  // `ring` closes it (repeats the start at the end if needed); here it stays open.
  const end = sp.segs[sp.segs.length - 1]?.p ?? sp.start;
  if (pts.length > 1 && (end[0] !== sp.start[0] || end[1] !== sp.start[1])) pts.pop();
  // Finer, so the cut lands close to the edge.
  const dense: Pair[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const out: SubPath[] = [];
  let run: Vec2[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ start: run[0]!, segs: run.slice(1).map((q, i) => line(run[i]!, q)), closed: false });
    run = [];
  };
  for (let i = 1; i < dense.length; i++) {
    const [a, b] = [dense[i - 1]!, dense[i]!];
    if (inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], region)) {
      if (!run.length) run.push(a);
      run.push(b);
    } else flush();
  }
  flush();
  return out;
}
