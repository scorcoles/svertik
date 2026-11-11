import { difference, type MultiPolygon, type Pair } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import { flatten, insidePolygons, line, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { band } from './damage';
import { defineModifier, fromFraction } from '../modifier';
import { rng } from '../random';

interface Branch {
  points: Vec2[];
  /** "Time" of each point: steps from the impact. Used to grow the crack. */
  times: number[];
}

/**
 * Cracks: branching lines born from an impact point.
 * - lines: painted on top, as a new stroke-only shape (the shape isn't touched);
 * - cut: cut out as gaps of `width` px;
 * - shatter: cut out, and each loose piece moves away from the impact `separation` px (each piece, an element).
 * `growth` trims by "time", so animating it grows the crack without changing its drawing.
 */
export const crack = defineModifier({
  type: 'crack',
  label: 'Crack',
  kind: 'generator',
  params: {
    mode: { type: 'enum', default: 'cut', options: ['lines', 'cut', 'shatter'] as const, animatable: false },
    growth: { type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    cracks: { type: 'number', default: 5, min: 1, max: 16, step: 1, ramp: false },
    length: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01, unit: 'fraction' },
    branching: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    jagged: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01 },
    width: { type: 'number', default: 1, min: 0, max: 10, step: 0.1, unit: 'px', group: 'Style', ramp: false },
    color: { type: 'color', default: '#000000', group: 'Style' },
    separation: { type: 'number', default: 6, min: 0, max: 80, step: 0.5, unit: 'px', group: 'Shatter', label: 'Separation' },
    impact: { type: 'point', default: [0.4, 0.35], unit: 'fraction', group: 'Impact', label: 'Point' },
    seed: { type: 'seed', default: 1, group: 'Impact' },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const size = Math.max(b.width, b.height);
    if (size === 0 || p.cracks < 1 || p.length <= 0) return geo;

    // Crackable area: the filled shapes; if there are none, the drawing's box.
    const filled = geo.shapes.filter((s) => (s.style.fill ?? 'black') !== 'none');
    const polys = filled.length
      ? filled.flatMap((s) => s.subpaths.filter((sp) => sp.closed).map((sp) => flatten(sp)))
      : [[[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]] as Vec2[]];
    const inside = (pt: Vec2) => insidePolygons(polys, pt);

    // If the impact lands in a gap (between letters, for instance), the nearest point with material is used.
    let origin = fromFraction(b, p.impact) as Vec2;
    if (!inside(origin)) {
      const found = nearestInside(origin, inside, size);
      if (!found) return geo;
      origin = found;
    }
    // When cutting, cracks carry on across gaps (they cut where there is material); when painting, they don't.
    const cutting = p.mode !== 'lines';
    const box = { x0: b.x - size * 0.05, y0: b.y - size * 0.05, x1: b.x + b.width + size * 0.05, y1: b.y + b.height + size * 0.05 };
    const within = (q: Vec2) => (cutting ? q[0] >= box.x0 && q[0] <= box.x1 && q[1] >= box.y0 && q[1] <= box.y1 : inside(q));

    const rand = rng(p.seed);
    const step = size * 0.025;
    // In shatter, cracks run until they leave the object: so it always breaks into pieces.
    const maxSteps = p.mode === 'shatter' ? Math.ceil((3 * size) / step) : Math.max(1, Math.round((p.length * size) / step));
    const branches: Branch[] = [];

    const grow = (start: Vec2, startTime: number, angle: number, steps: number, depth: number) => {
      const br: Branch = { points: [start], times: [startTime] };
      branches.push(br);
      let a = angle;
      let pt = start;
      for (let k = 1; k <= steps; k++) {
        a += (rand() - 0.5) * p.jagged * 1.4;
        const d = step * (0.6 + rand() * 0.8);
        const next: Vec2 = [pt[0] + Math.cos(a) * d, pt[1] + Math.sin(a) * d];
        const branchRoll = rand();
        const sideRoll = rand();
        const lenRoll = rand();
        if (!within(next)) break;
        br.points.push(next);
        br.times.push(startTime + k);
        pt = next;
        if (depth < 3 && branchRoll < p.branching * 0.25) {
          const turn = (sideRoll < 0.5 ? -1 : 1) * (0.4 + lenRoll * 0.6);
          grow(pt, startTime + k, a + turn, Math.round((steps - k) * (0.3 + lenRoll * 0.4)), depth + 1);
        }
      }
    };

    const n = Math.round(p.cracks);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / n);
      grow(origin, 0, angle, Math.round(maxSteps * (0.6 + rand() * 0.4)), 0);
    }

    // Trimming by growth.
    const tMax = Math.max(1, ...branches.flatMap((br) => br.times));
    const limit = p.growth * tMax;
    const subpaths: SubPath[] = [];
    for (const br of branches) {
      const pts: Vec2[] = [];
      for (let i = 0; i < br.points.length; i++) {
        const t = br.times[i]!;
        if (t <= limit) { pts.push(br.points[i]!); continue; }
        // Last segment, halfway.
        if (i > 0) {
          const t0 = br.times[i - 1]!;
          const f = (limit - t0) / (t - t0);
          const a = br.points[i - 1]!;
          const c = br.points[i]!;
          if (f > 0) pts.push([a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]);
        }
        break;
      }
      if (pts.length < 2) continue;
      subpaths.push({ start: pts[0]!, segs: pts.slice(1).map((q, i) => line(pts[i]!, q)), closed: false });
    }
    if (!subpaths.length) return geo;

    if (cutting) return cut(geo, subpaths, p, origin, ctx.resolution);

    const cracks: Shape = {
      subpaths,
      style: { fill: 'none', stroke: p.color, 'stroke-width': String(p.width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    };
    return { viewBox: geo.viewBox, shapes: [...geo.shapes, cracks] };
  },
});

/** Cuts the cracks (bands of `width`) out of the filled shapes; in shatter, separates the pieces. */
function cut(geo: Geometry, lines: SubPath[], p: { mode: string; width: number; separation: number; seed: number }, origin: Vec2, resolution: number): Geometry {
  const rand = rngLike(p.seed);
  const holes: MultiPolygon = lines.map((sp) => {
    const pts: Vec2[] = [sp.start, ...sp.segs.map((g) => g.p)];
    return [band(pts, Math.max(0.2, p.width), 0.6, rand)];
  });
  const step = Math.max(resolution, 1e-3);
  const out: Shape[] = [];
  let piece = 0;
  for (const s of geo.shapes) {
    if ((s.style.fill ?? 'black') === 'none') {
      out.push(s);
      continue;
    }
    const r = regionOf([s], step);
    if (!r.length) continue;
    let rest: MultiPolygon;
    try {
      rest = difference(r, holes);
    } catch {
      out.push(s);
      continue;
    }
    for (const poly of rest) {
      let pl = poly;
      if (p.mode === 'shatter' && p.separation > 0) {
        // Each piece, moving away from the impact (from its centre), slightly at random.
        const ring = poly[0]!;
        const cx = ring.reduce((a, q) => a + q[0], 0) / ring.length, cy = ring.reduce((a, q) => a + q[1], 0) / ring.length;
        const dx = cx - origin[0], dy = cy - origin[1];
        const d = Math.hypot(dx, dy) || 1;
        const k = p.separation * (0.6 + rand() * 0.8);
        pl = poly.map((rg) => rg.map(([x, y]) => [x + (dx / d) * k, y + (dy / d) * k] as Pair));
      }
      const subpaths = pl.map(toSubPath).filter((x) => x !== null);
      if (subpaths.length) out.push({ ...s, subpaths, clone: piece++ });
    }
  }
  return { viewBox: geo.viewBox, shapes: out };
}

/** The point with material nearest to `q` (in a spiral, up to `size`). */
function nearestInside(q: Vec2, inside: (q: Vec2) => boolean, size: number): Vec2 | null {
  for (let r = size * 0.01; r < size; r *= 1.25) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const c: Vec2 = [q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r];
      if (inside(c)) return c;
    }
  }
  return null;
}

const rngLike = (seed: number) => rng(seed * 7919 + 13);
