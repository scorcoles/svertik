import { difference, type MultiPolygon, type Pair, type Polygon } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import { bounds, insidePolygons, type Shape, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { tearPolyline } from '../paths';
import { rng } from '../random';

/**
 * Wear: cracks coming in from the edges, chips on the edge and specks, cut out
 * as holes (the background shows through them). Everything comes from a seed; `growth` advances the cracks.
 * Surfaces only (like Boolean): curves become straight segments.
 */
export const damage = defineModifier({
  type: 'damage',
  label: 'Damage',
  kind: 'generator',
  params: {
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
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    const size = Math.max(b.width, b.height);
    if (!size) return geo;
    const step = Math.max(ctx.resolution, 1e-3);
    const filled = geo.shapes.filter((s) => (s.style.fill ?? 'black') !== 'none');
    const region = regionOf(filled, step);
    if (!region.length) return geo;
    const rand = rng(p.seed);
    const rings = region.flatMap((poly) => poly) as Vec2[][];
    const inside = (q: Vec2) => insidePolygons(rings, q);
    const edges = edgeSampler(region[0] ? region.map((poly) => poly[0]!) : [], rand);
    if (!edges) return geo;

    const holes: Polygon[] = [];
    const growth = Math.max(0, Math.min(1, p.growth));
    const crackLines: Vec2[][] = [];

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
      const half = halfWidths(pts, p.width * size, p.taper, rand);
      const grownBand = growing(pts, half, growth);
      if (grownBand) holes.push([grownBand]);
      // Where it starts, sometimes, a chip.
      if (rand() < 0.6) holes.push([blob(at, p.chipSize * size * (0.5 + rand() * 0.6), 7, rand)]);
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
      // Advances until it has covered (in the direction of the target) the part `growth` says.
      const total = Math.hypot(to[0] - from[0], to[1] - from[1]);
      const goal = total;
      const [ux, uy] = [(to[0] - from[0]) / total, (to[1] - from[1]) / total];
      for (let guard = 0; (q[0] - from[0]) * ux + (q[1] - from[1]) * uy < goal && guard < 4000; guard++) {
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
      const halfT = halfWidths(pts, p.width * size * 0.8, 0.2, rand);
      const grownT = growing(pts, halfT, growth);
      if (grownT) holes.push([grownT]);
    }

    // ── Loose chips on the edge.
    for (let i = 0; i < Math.round(p.chips); i++) {
      const { at } = edges();
      holes.push([blob(at, p.chipSize * size * (0.4 + rand() * 0.9), 6 + Math.floor(rand() * 4), rand)]);
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
      holes.push([blob(q, p.speckSize * size * (0.3 + rand() * rand() * 2.2), 4 + Math.floor(rand() * 3), rand)]);
      i++;
    }
    if (!holes.length) return geo;
    // Organic edges: each hole, torn (long sides are split and moved at random).
    if (p.roughness > 0) {
      const detail = size * 0.006;
      holes.forEach((h, i) => {
        // Each hole with its own randomness: so tearing one doesn't change when another grows.
        const r = tearPolyline(h[0]!.slice(0, -1) as Vec2[], true, detail, p.roughness, rngFrom(p.seed * 1000 + i)) as Pair[];
        h[0] = [...r, r[0]!];
      });
    }

    // Each shape keeps its style: the holes are subtracted from it.
    const out: Shape[] = [];
    let piece = 0;
    for (const s of geo.shapes) {
      if ((s.style.fill ?? 'black') === 'none') {
        out.push(s);
        continue;
      }
      const r = regionOf([s], step);
      if (!r.length) continue;
      let cut: MultiPolygon;
      try {
        cut = difference(r, ...holes.map((h) => [h] as MultiPolygon));
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
  return () => {
    let d = rand() * total;
    const s = segs.find((x) => (d <= x.len ? true : ((d -= x.len), false))) ?? segs[segs.length - 1]!;
    const k = d / s.len;
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
