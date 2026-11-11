import { bounds, cubicAt, flatten, insidePolygons, splitCubic, type Cubic, type Geometry, type SubPath, type Vec2 } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';

/**
 * Joins two objects with a line that follows them when they move: the drawing becomes the stretch between
 * point `fromAnchor` of one and `toAnchor` of the other (fractions of their box), keeping its style (the
 * line from Utils → Connector: its colour, width, caps…).
 * - shape: straight, arc (curved to one side, `bend` of the length), horizontal or vertical (leaves and
 *   arrives in that direction, as in a node diagram; `bend`, how much).
 * - edges: starts and ends at the edge of each object, not at its point; `gap` (px) moves it a bit further.
 * - arrow: a head at the end, the start or both, of `arrowSize` px.
 */
export const connect = defineModifier({
  type: 'connect',
  label: 'Connect',
  kind: 'generator',
  family: 'utils',
  params: {
    from: { type: 'node', default: '', label: 'From' },
    to: { type: 'node', default: '', label: 'To' },
    shape: { type: 'enum', default: 'straight', options: ['straight', 'arc', 'horizontal', 'vertical'] as const, animatable: false, label: 'Shape' },
    bend: { type: 'number', default: 0.3, min: -2, max: 2, step: 0.01, label: 'Bend' },
    edges: { type: 'boolean', default: true, label: 'Edges' },
    gap: { type: 'number', default: 6, min: 0, max: 200, step: 0.5, unit: 'px', label: 'Gap' },
    arrow: { type: 'enum', default: 'none', options: ['none', 'end', 'start', 'both'] as const, animatable: false, label: 'Arrow' },
    arrowSize: { type: 'number', default: 10, min: 1, max: 100, step: 0.5, unit: 'px', label: 'Arrow size', showIf: { arrow: ['end', 'start', 'both'] } },
    fromAnchor: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'From anchor', group: 'Anchors', handle: false },
    toAnchor: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'To anchor', group: 'Anchors', handle: false },
  },
  apply(geo, p, ctx) {
    const A = p.from ? ctx.target?.(p.from) : null;
    const B = p.to ? ctx.target?.(p.to) : null;
    if (!A || !B || !A.shapes.length || !B.shapes.length) return geo;
    const a = fromFraction(bounds(A), p.fromAnchor);
    const b = fromFraction(bounds(B), p.toAnchor);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { viewBox: geo.viewBox, shapes: [] };
    let curve: Cubic;
    if (p.shape === 'arc') {
      // Normal to the left of the direction from A to B.
      const n: Vec2 = [-dy / len, dx / len];
      const h = p.bend * len;
      curve = { c1: [a[0] + dx / 3 + n[0] * h, a[1] + dy / 3 + n[1] * h], c2: [a[0] + (2 * dx) / 3 + n[0] * h, a[1] + (2 * dy) / 3 + n[1] * h], p: b };
    } else if (p.shape === 'horizontal' || p.shape === 'vertical') {
      const h = p.shape === 'horizontal';
      const k = p.bend * 2;
      curve = h ? { c1: [a[0] + dx * k, a[1]], c2: [b[0] - dx * k, b[1]], p: b } : { c1: [a[0], a[1] + dy * k], c2: [b[0], b[1] - dy * k], p: b };
    } else curve = { c1: [a[0] + dx / 3, a[1] + dy / 3], c2: [a[0] + (2 * dx) / 3, a[1] + (2 * dy) / 3], p: b };

    // Where it leaves A and where it enters B (by samples, then refined), plus the gap.
    const N = 200;
    const pts = Array.from({ length: N + 1 }, (_, i) => cubicAt(a, curve, i / N));
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
    const total = cum[N]!;
    let s0 = 0, s1 = total;
    if (p.edges) {
      const inA = solidTest(A), inB = solidTest(B);
      let i0 = 0;
      while (i0 < N && inA(pts[i0]!)) i0++;
      let i1 = N;
      while (i1 > 0 && inB(pts[i1]!)) i1--;
      // Refine the edge between the inside sample and the outside one.
      const edge = (i: number, j: number, inside: (q: Vec2) => boolean) => {
        let lo = i / N, hi = j / N; // lo: inside; hi: outside
        for (let k = 0; k < 24; k++) {
          const mid = (lo + hi) / 2;
          if (inside(cubicAt(a, curve, mid))) lo = mid;
          else hi = mid;
        }
        const q = cubicAt(a, curve, hi);
        const base = Math.min(i, j);
        return cum[base]! + Math.hypot(q[0] - pts[base]![0], q[1] - pts[base]![1]);
      };
      s0 = i0 > 0 && i0 < N ? edge(i0 - 1, i0, inA) : cum[i0]!;
      s1 = i1 < N && i1 > 0 ? edge(i1 + 1, i1, inB) : cum[i1]!;
    }
    s0 += p.gap;
    s1 -= p.gap;
    if (s1 - s0 < 1e-3) return { viewBox: geo.viewBox, shapes: [] };
    const tOf = (s: number) => {
      let i = 1;
      while (i < N && cum[i]! < s) i++;
      const f = (s - cum[i - 1]!) / (cum[i]! - cum[i - 1]! || 1);
      return (i - 1 + f) / N;
    };
    const t0 = tOf(s0), t1 = tOf(s1);
    // The stretch from t0 to t1.
    let [, rest] = splitCubic(a, curve, t0);
    const start = cubicAt(a, curve, t0);
    [rest] = splitCubic(start, rest, (t1 - t0) / (1 - t0 || 1));
    const subpaths: SubPath[] = [{ start, segs: [rest], closed: false }];

    // Heads: two legs from the tip, backwards along the tangent.
    const head = (tip: Vec2, dir: Vec2) => {
      const l = Math.hypot(dir[0], dir[1]) || 1;
      const u: Vec2 = [dir[0] / l, dir[1] / l];
      const s = p.arrowSize, w = s * 0.6;
      const back: Vec2 = [tip[0] - u[0] * s, tip[1] - u[1] * s];
      const l1: Vec2 = [back[0] - u[1] * w, back[1] + u[0] * w];
      const l2: Vec2 = [back[0] + u[1] * w, back[1] - u[0] * w];
      subpaths.push({ start: l1, segs: [straight(l1, tip), straight(tip, l2)], closed: false });
    };
    const endDir: Vec2 = [rest.p[0] - rest.c2[0], rest.p[1] - rest.c2[1]];
    const startDir: Vec2 = [start[0] - rest.c1[0], start[1] - rest.c1[1]];
    if (p.arrow === 'end' || p.arrow === 'both') head(rest.p, endDir);
    if (p.arrow === 'start' || p.arrow === 'both') head(start, startDir);

    const style = geo.shapes[0]?.style ?? { fill: 'none', stroke: '#d9d9d9', 'stroke-width': '2' };
    return { viewBox: geo.viewBox, shapes: [{ style: { ...style, fill: 'none' }, subpaths }] };
  },
});

const straight = (a: Vec2, b: Vec2): Cubic => ({ c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], p: b });

/** Does a point fall inside the object? By its closed shapes (open ones, by its box if there are no closed ones). */
function solidTest(geo: Geometry): (q: Vec2) => boolean {
  // Each shape, even-odd between its subpaths (its holes); across shapes, being in one is enough.
  const polys = geo.shapes.map((s) => s.subpaths.filter((sp) => sp.closed).map((sp) => flatten(sp, 8))).filter((x) => x.length);
  if (polys.length) return (q) => polys.some((own) => insidePolygons(own, q));
  const b = bounds(geo);
  return (q) => q[0] >= b.x && q[0] <= b.x + b.width && q[1] >= b.y && q[1] <= b.y + b.height;
}
