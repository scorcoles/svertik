import { difference, union, type MultiPolygon, type Pair, type Polygon } from '../polygon';
import { regionOf, simplify, toSubPath } from '../clip';
import { bounds, type Geometry, type Shape, type Vec2 } from '../geometry';
import { defineModifier, type ParamSchema, type ParamValues } from '../modifier';
import { tearPolyline } from '../paths';
import { rng } from '../random';

const params = {
  seed: { type: 'seed', default: 1 },
  growth: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Growth' },
  roughness: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Roughness', ramp: false },
  cracks: { type: 'number', default: 3, min: 0, max: 12, step: 1, ramp: false, group: 'Cracks', label: 'Count' },
  through: { type: 'number', default: 0, min: 0, max: 8, step: 1, ramp: false, group: 'Cracks', label: 'Through' },
  length: { type: 'number', default: 0.55, min: 0.05, max: 1.5, step: 0.01, unit: 'fraction', group: 'Cracks', label: 'Length' },
  width: { type: 'number', default: 0.012, min: 0.001, max: 0.06, step: 0.001, unit: 'fraction', group: 'Cracks', label: 'Width' },
  jagged: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, group: 'Cracks', label: 'Jagged' },
  taper: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.01, group: 'Cracks', label: 'Taper' },
  chips: { type: 'number', default: 4, min: 0, max: 30, step: 1, ramp: false, group: 'Chips', label: 'Count' },
  chipSize: { type: 'number', default: 0.035, min: 0.005, max: 0.15, step: 0.001, unit: 'fraction', group: 'Chips', label: 'Size' },
  specks: { type: 'number', default: 30, min: 0, max: 300, step: 1, ramp: false, group: 'Specks', label: 'Count' },
  speckSize: { type: 'number', default: 0.006, min: 0.001, max: 0.03, step: 0.001, unit: 'fraction', group: 'Specks', label: 'Size' },
  edgeBias: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, group: 'Specks', label: 'Near edges' },
} as const satisfies ParamSchema;

type DamageParams = ParamValues<typeof params>;

/**
 * Wear: cracks coming in from the edges, chips on the edge and specks, cut out
 * as holes (the background shows through them). Everything comes from a seed; `growth` advances the cracks.
 * Surfaces only (like Boolean): curves become straight segments.
 */
export const damage = defineModifier({
  type: 'damage',
  label: 'Damage',
  kind: 'generator',
  params,
  apply(geo, p, ctx) {
    const step = Math.max(ctx.resolution, 1e-3);
    // Everything but Growth is planned once and reused: while Growth is dragged (or animated), only the
    // bands grow and the shapes are cut again.
    const key = `${step}|${p.seed}|${p.roughness}|${p.cracks}|${p.through}|${p.length}|${p.width}|${p.jagged}|${p.taper}|${p.chips}|${p.chipSize}|${p.specks}|${p.speckSize}|${p.edgeBias}`;
    let plan: DamagePlan | null | undefined = plans.get(geo);
    if (!plan || plan.key !== key) {
      plan = makePlan(geo, p, step, key);
      if (!plan) return geo;
      plans.set(geo, plan);
    }
    const growth = Math.max(0, Math.min(1, p.growth));
    // Each hole: the bands, up to where Growth says; the rest, as they are. Then torn (organic edges).
    const holes: Polygon[] = [];
    const holeBoxes: Box4[] = [];
    const detail = plan.size * 0.006;
    for (let i = 0; i < plan.parts.length; i++) {
      const part = plan.parts[i]!;
      // Chips and specks come already torn (they don't change); only the bands are grown and torn here.
      let ring: Pair[] | null;
      if ('band' in part) {
        ring = growing(part.band.pts, part.band.half, growth);
        if (ring && p.roughness > 0) ring = tearRing(ring, detail, p.roughness, rngFrom(p.seed * 1000 + i));
      } else ring = part.ring;
      if (!ring) continue;
      holes.push([ring]);
      holeBoxes.push(ringBox(ring));
    }
    if (!holes.length) return geo;

    // Each shape keeps its style: the holes are subtracted from it. Only the ones it meets (most of them
    // are tiny and far away) and all in one go: the clipping library runs once per shape, not once per hole.
    const out: Shape[] = [];
    let piece = 0;
    for (const s of geo.shapes) {
      if ((s.style.fill ?? 'black') === 'none') {
        out.push(s);
        continue;
      }
      const r = plan.surfaces.get(s);
      if (!r?.length) continue;
      const bb = plan.shapeBoxes.get(s)!;
      const near: MultiPolygon = [];
      for (let i = 0; i < holes.length; i++) {
        const hb = holeBoxes[i]!;
        if (hb[2] < bb[0] || hb[0] > bb[2] || hb[3] < bb[1] || hb[1] > bb[3]) continue;
        near.push(holes[i]!);
      }
      // Nothing to cut: the shape is left as it was (its curves stay curves).
      if (!near.length) {
        out.push({ ...s, clone: piece++ });
        continue;
      }
      let cut: MultiPolygon;
      try {
        cut = difference(r, near);
      } catch {
        return geo;
      }
      // Each loose piece left (a polygon with its holes), an element: Step treats it separately.
      for (const pl of cut) {
        const subpaths = pl.map(toSubPath).filter((x) => x !== null);
        if (subpaths.length) out.push({ ...s, subpaths, clone: piece++ });
      }
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/** A box: [x0, y0, x1, y1]. */
type Box4 = [number, number, number, number];

/** What Damage needs that doesn't depend on Growth: the surfaces, and the holes (whole cracks, chips, specks). */
interface DamagePlan {
  key: string;
  size: number;
  surfaces: Map<Shape, MultiPolygon>;
  shapeBoxes: Map<Shape, Box4>;
  /** Holes to cut, in order: bands (which grow with Growth) or rings already in place. */
  parts: ({ band: { pts: Vec2[]; half: number[] } } | { ring: Pair[] })[];
}

/** One plan per source geometry: the engine re-evaluates the same object while its parameters change. */
const plans = new WeakMap<Geometry, DamagePlan>();

/** Cracks, chips and specks of a drawing: the same whatever Growth is (it only trims the cracks). */
function makePlan(geo: Geometry, p: DamageParams, step: number, key: string): DamagePlan | null {
  const b = bounds(geo);
  const size = Math.max(b.width, b.height);
  if (!size) return null;
  // Each shape's surface, computed once: it is cut on its own (so each keeps its style and a hole only
  // touches the shapes it meets) and, united, it tells where the cracks start and what is inside.
  const surfaces = new Map<Shape, MultiPolygon>();
  const shapeBoxes = new Map<Shape, Box4>();
  const regions: MultiPolygon[] = [];
  for (const s of geo.shapes) {
    if ((s.style.fill ?? 'black') === 'none') continue;
    const r = regionOf([s], step);
    // Cutting doesn't need every point of the outline: a hair of tolerance (a thousandth of the drawing)
    // halves the work of the clipping library without anything visible.
    const cut = simplify(r, step * 0.1);
    surfaces.set(s, cut.length ? cut : r);
    if (!r.length) continue;
    shapeBoxes.set(s, regionBox(r));
    regions.push(r);
  }
  if (!regions.length) return null;
  const region = regions.length === 1 ? regions[0]! : union(regions[0]!, ...regions.slice(1));
  const rand = rng(p.seed);
  const rings = region.flatMap((poly) => poly) as Vec2[][];
  const boxes = rings.map(ringBox);
  const inside = (q: Vec2) => insideRings(rings, boxes, q);
  const edges = edgeSampler(region.map((poly) => poly[0]!), rand);
  if (!edges) return null;

  const parts: DamagePlan['parts'] = [];
  const crackLines: Vec2[][] = [];
  // A chip or a speck: torn now, since neither Growth nor anything else changes it afterwards.
  const detail = size * 0.006;
  const fixed = (ring: Pair[]): DamagePlan['parts'][number] => ({
    ring: p.roughness > 0 ? tearRing(ring, detail, p.roughness, rngFrom(p.seed * 1000 + parts.length)) : ring,
  });

  // ── Cracks: from a point on the edge, inwards, zigzagging; wider where they start.
  for (let i = 0; i < Math.round(p.cracks); i++) {
    const { at, inward } = edges();
    // The crack's general heading; the line returns to it after each kink (straight overall, with teeth).
    const heading = Math.atan2(inward[1], inward[0]) + (rand() - 0.5) * 1.6;
    let a = heading;
    // Always the whole crack (the same random numbers whatever Growth is); trimmed afterwards.
    const L = p.length * size * (0.55 + rand() * 0.7);
    const seg = size * 0.012;
    const pts: Vec2[] = [[at[0] - inward[0] * seg, at[1] - inward[1] * seg]];
    let q = at;
    pts.push(q);
    for (let d = 0; d < L; ) {
      // Sharp kinks now and then; otherwise a slight tremble pulling towards the heading.
      if (rand() < 0.18 + p.jagged * 0.25) a += (rand() - 0.5) * (0.6 + p.jagged * 2.2);
      else a += (rand() - 0.5) * p.jagged * 0.3;
      a = a * 0.75 + heading * 0.25;
      const s = seg * (0.5 + rand());
      q = [q[0] + Math.cos(a) * s, q[1] + Math.sin(a) * s];
      pts.push(q);
      d += s;
      // If it leaves the shape, it went through it: it ends there (a little beyond, for a clean cut).
      if (!inside(q)) {
        pts.push([q[0] + Math.cos(a) * seg, q[1] + Math.sin(a) * seg]);
        break;
      }
    }
    if (pts.length < 3) continue;
    crackLines.push(pts);
    // Width at each point, computed once on the whole crack; Growth only shows the first part.
    parts.push({ band: { pts, half: halfWidths(pts, p.width * size, p.taper, rand) } });
    // Where it starts, sometimes, a chip.
    if (rand() < 0.6) parts.push(fixed(blob(at, p.chipSize * size * (0.5 + rand() * 0.6), 7, rand)));
  }

  // ── Through cracks: from one side of the box to the opposite one, cutting everything they meet (they split the object).
  for (let i = 0; i < Math.round(p.through); i++) {
    const horizontal = rand() < 0.5;
    const m = size * 0.03;
    const from: Vec2 = horizontal ? [b.x - m, b.y + b.height * (0.15 + rand() * 0.7)] : [b.x + b.width * (0.15 + rand() * 0.7), b.y - m];
    const to: Vec2 = horizontal ? [b.x + b.width + m, b.y + b.height * (0.15 + rand() * 0.7)] : [b.x + b.width * (0.15 + rand() * 0.7), b.y + b.height + m];
    const heading = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const seg = size * 0.012;
    const pts: Vec2[] = [from];
    let q = from, a = heading;
    // Pulls towards the target point until it reaches the other side.
    const total = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const [ux, uy] = [(to[0] - from[0]) / total, (to[1] - from[1]) / total];
    for (let guard = 0; (q[0] - from[0]) * ux + (q[1] - from[1]) * uy < total && guard < 4000; guard++) {
      if (rand() < 0.18 + p.jagged * 0.25) a += (rand() - 0.5) * (0.6 + p.jagged * 2.2);
      else a += (rand() - 0.5) * p.jagged * 0.3;
      // Pulls towards the target point: it always reaches the other side.
      const toward = Math.atan2(to[1] - q[1], to[0] - q[0]);
      a = a * 0.7 + toward * 0.3;
      const st = seg * (0.5 + rand());
      q = [q[0] + Math.cos(a) * st, q[1] + Math.sin(a) * st];
      pts.push(q);
    }
    if (pts.length < 3) continue;
    crackLines.push(pts);
    parts.push({ band: { pts, half: halfWidths(pts, p.width * size * 0.8, 0.2, rand) } });
  }

  // ── Loose chips on the edge.
  for (let i = 0; i < Math.round(p.chips); i++) {
    const { at } = edges();
    parts.push(fixed(blob(at, p.chipSize * size * (0.4 + rand() * 0.9), 6 + Math.floor(rand() * 4), rand)));
  }

  // ── Specks: near the edges or the cracks (by `edgeBias`) or anywhere.
  for (let i = 0, tries = 0; i < Math.round(p.specks) && tries < p.specks * 20; tries++) {
    let q: Vec2;
    const r = rand();
    if (r < p.edgeBias * 0.6) {
      const { at, inward } = edges();
      const d = size * 0.06 * rand() * rand();
      q = [at[0] + inward[0] * d, at[1] + inward[1] * d];
    } else if (r < p.edgeBias && crackLines.length) {
      const line = crackLines[Math.floor(rand() * crackLines.length)]!;
      const c = line[Math.floor(rand() * line.length)]!;
      const d = size * 0.03 * rand();
      const t = rand() * Math.PI * 2;
      q = [c[0] + Math.cos(t) * d, c[1] + Math.sin(t) * d];
    } else q = [b.x + rand() * b.width, b.y + rand() * b.height];
    if (!inside(q)) continue;
    parts.push(fixed(blob(q, p.speckSize * size * (0.3 + rand() * rand() * 2.2), 4 + Math.floor(rand() * 3), rand)));
    i++;
  }
  return { key, size, surfaces, shapeBoxes, parts };
}

/** Half width at each point of the crack: wider at birth and tapering, with some noise. */
function halfWidths(pts: Vec2[], w: number, taper: number, rand: () => number): number[] {
  return pts.map((_, i) => (w / 2) * (1 - taper * (i / (pts.length - 1))) * (0.5 + rand()));
}

/**
 * The crack's band up to fraction `f` of its length, with the usual widths and a sharp tip.
 * So when Growth is animated, the crack advances along its path instead of changing shape.
 */
function growing(pts: Vec2[], half: number[], f: number): Pair[] | null {
  if (f <= 0) return null;
  const tr = f >= 1 ? pts : trim(pts, f);
  if (tr.length < 2) return null;
  const n = tr.length;
  const left: Pair[] = [], right: Pair[] = [];
  for (let i = 0; i < n; i++) {
    const a = tr[Math.max(0, i - 1)]!, c = tr[Math.min(n - 1, i + 1)]!;
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    // The last point, while growing, is the tip: almost zero width.
    const hw = f < 1 && i === n - 1 ? (half[Math.min(i, half.length - 1)] ?? 0) * 0.15 : (half[Math.min(i, half.length - 1)] ?? 0);
    const [nx, ny] = [-dy / l, dx / l];
    left.push([tr[i]![0] + nx * hw, tr[i]![1] + ny * hw]);
    right.push([tr[i]![0] - nx * hw, tr[i]![1] - ny * hw]);
  }
  const ring = [...left, ...right.reverse()];
  return [...ring, ring[0]!];
}

/** The first part of a polyline: fraction `f` of its length (so Growth grows the crack). */
function trim(pts: Vec2[], f: number): Vec2[] {
  if (f >= 1) return pts;
  if (f <= 0) return [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  let left = total * f;
  const out: Vec2[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d >= left) {
      const k = d ? left / d : 0;
      out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
      return out;
    }
    out.push(b);
    left -= d;
  }
  return out;
}

/** Separate randomness for the cut bands (doesn't use the shared one: so nothing else changes with Growth). */
const rngFrom = (seed: number) => rng(seed * 2654435761);

/** A ring, torn: its sides split and moved at random; closed again. */
function tearRing(ring: Pair[], detail: number, amount: number, rand: () => number): Pair[] {
  const r = tearPolyline(ring.slice(0, -1) as Vec2[], true, detail, amount, rand) as Pair[];
  return [...r, r[0]!];
}

/** The box around a ring, for cheap rejections. */
function ringBox(r: readonly Vec2[]): Box4 {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of r) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/** The box around a surface (all its rings). */
function regionBox(m: MultiPolygon): Box4 {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of m) {
    for (const r of poly) {
      const b = ringBox(r);
      if (b[0] < x0) x0 = b[0];
      if (b[1] < y0) y0 = b[1];
      if (b[2] > x1) x1 = b[2];
      if (b[3] > y1) y1 = b[3];
    }
  }
  return [x0, y0, x1, y1];
}

/** Inside the rings (even-odd), skipping the ones whose box doesn't even contain the point. */
function insideRings(rings: Vec2[][], boxes: Box4[], [x, y]: Vec2): boolean {
  let hit = false;
  for (let k = 0; k < rings.length; k++) {
    const b = boxes[k]!;
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    const r = rings[k]!;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!;
      const [xj, yj] = r[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** Random points on the outline (by length), with the normal pointing inwards. */
function edgeSampler(outer: Pair[][], rand: () => number) {
  const segs: { a: Vec2; b: Vec2; len: number; inward: Vec2 }[] = [];
  for (const ring of outer) {
    // The ring's winding, to know which way is "inside".
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) area += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0) segs.push({ a, b, len, inward: [(-(b[1] - a[1]) / len) * sgn, ((b[0] - a[0]) / len) * sgn] });
    }
  }
  const total = segs.reduce((s, x) => s + x.len, 0);
  if (!total) return null;
  // Cumulative lengths: a sample is found by bisection, not by walking the whole outline.
  const acc: number[] = [];
  for (let i = 0, sum = 0; i < segs.length; i++) acc.push((sum += segs[i]!.len));
  return () => {
    const d = rand() * total;
    let lo = 0, hi = segs.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d < acc[mid]!) hi = mid;
      else lo = mid + 1;
    }
    const s = segs[lo]!;
    const k = s.len ? (d - (lo ? acc[lo - 1]! : 0)) / s.len : 0;
    return { at: [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k] as Vec2, inward: s.inward };
  };
}

/** A band around a line: width `w`, tapering towards the end (`taper`), with some noise. */
export function band(pts: Vec2[], w: number, taper: number, rand: () => number): Pair[] {
  const left: Pair[] = [], right: Pair[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, c = pts[Math.min(n - 1, i + 1)]!;
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1);
    const half = (w / 2) * (1 - taper * t) * (0.5 + rand());
    const [nx, ny] = [-dy / l, dx / l];
    left.push([pts[i]![0] + nx * half, pts[i]![1] + ny * half]);
    right.push([pts[i]![0] - nx * half, pts[i]![1] - ny * half]);
  }
  const ring = [...left, ...right.reverse()];
  return [...ring, ring[0]!];
}

/** An irregular blot of roughly radius `r`. */
function blob(c: Vec2, r: number, n: number, rand: () => number): Pair[] {
  const a0 = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const k = r * (0.45 + rand() * 0.75);
    return [c[0] + Math.cos(a) * k, c[1] + Math.sin(a) * k] as Pair;
  });
  return [...pts, pts[0]!];
}
