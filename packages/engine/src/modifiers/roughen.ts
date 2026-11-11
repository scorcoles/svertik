import { flatten, line, mapSubPaths, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { tearPolyline as tear } from '../paths';
import { rng } from '../random';

/**
 * Fractal edges, on any drawing:
 * - organic: a torn edge (midpoint displacement), like a coastline or torn paper;
 * - koch: each segment becomes a Koch curve peak, `iterations` times (cap: 4).
 * Curves become straight segments (that is what gets torn). Points per path are capped so it doesn't hang.
 */
export const roughenModifier = defineModifier({
  type: 'roughen',
  label: 'Roughen',
  kind: 'deformer',
  params: {
    mode: { type: 'enum', default: 'organic', options: ['organic', 'koch'] as const, animatable: false },
    amount: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, group: 'Organic', label: 'Amount' },
    detail: { type: 'number', default: 0.02, min: 0.004, max: 0.2, step: 0.001, unit: 'fraction', group: 'Organic', label: 'Detail' },
    seed: { type: 'seed', default: 1, group: 'Organic' },
    iterations: { type: 'number', default: 2, min: 1, max: 4, step: 1, ramp: false, group: 'Koch', label: 'Iterations' },
    height: { type: 'number', default: 0.29, min: -0.6, max: 0.6, step: 0.01, group: 'Koch', label: 'Peak' },
  },
  apply(geo, p, ctx) {
    const size = Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
    const rand = rng(p.seed);
    // Curves, to a fine polyline; straight segments keep their two points.
    const toPts = (sp: SubPath): Vec2[] => {
      const pts: Vec2[] = [sp.start];
      let p0 = sp.start;
      for (const g of sp.segs) {
        const straight = isLine(p0, g.c1, g.c2, g.p);
        const sub = flatten({ start: p0, segs: [g], closed: false }, straight ? 1 : 8).slice(1);
        pts.push(...sub);
        p0 = g.p;
      }
      // In closed paths, the last point repeats the first.
      if (sp.closed && pts.length > 1 && same(pts[0]!, pts[pts.length - 1]!)) pts.pop();
      return pts;
    };
    const out = mapSubPaths(geo, (sp) => {
      const pts = toPts(sp);
      if (pts.length < 2) return sp;
      const res =
        p.mode === 'koch'
          ? koch(pts, sp.closed, Math.max(1, Math.min(4, Math.round(p.iterations))), p.height)
          : tear(pts, sp.closed, Math.max(p.detail, 0.002) * size, p.amount, rand, 20000);
      const segs = res.slice(1).map((q, i) => line(res[i]!, q));
      if (sp.closed) segs.push(line(res[res.length - 1]!, res[0]!));
      return { start: res[0]!, segs, closed: sp.closed };
    });
    return out;
  },
});

/** Koch curve: each segment AB → A, ⅓, peak, ⅔, B. `h`: the peak's height relative to the segment. */
function koch(pts: Vec2[], closed: boolean, iterations: number, h: number): Vec2[] {
  let cur = pts;
  for (let it = 0; it < iterations; it++) {
    const next: Vec2[] = [];
    const n = closed ? cur.length : cur.length - 1;
    for (let i = 0; i < n; i++) {
      const a = cur[i]!, b = cur[(i + 1) % cur.length]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const p1: Vec2 = [a[0] + dx / 3, a[1] + dy / 3];
      const p2: Vec2 = [a[0] + (2 * dx) / 3, a[1] + (2 * dy) / 3];
      const peak: Vec2 = [a[0] + dx / 2 + dy * h, a[1] + dy / 2 - dx * h];
      next.push(a, p1, peak, p2);
    }
    if (!closed) next.push(cur[cur.length - 1]!);
    cur = next;
    if (cur.length > 20000) break;
  }
  return cur;
}

const same = (a: Vec2, b: Vec2) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
function isLine(a: Vec2, c1: Vec2, c2: Vec2, b: Vec2) {
  const d = (q: Vec2) => Math.abs((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]));
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return d(c1) / len < 1e-6 && d(c2) / len < 1e-6;
}
