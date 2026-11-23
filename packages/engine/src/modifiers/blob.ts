import { cubicAt, line, type Cubic, type Geometry, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Turns every outline into a blob: a smooth closed curve with no straight sides and no corners.
 * - inset: pulls the outline inwards first (px; negative grows it). On touching cells (Voronoi, Mosaic)
 *   this opens the gaps that make each one read as a separate blob; a cell smaller than the inset vanishes.
 * - roundness: how much of each side the corners take. 0 keeps the polygon; 1 is a quadratic B-spline
 *   through the middle of every side (fully round, tangent-continuous).
 * Curved input is sampled first, so a circle stays a circle; straight sides keep their real corners.
 */
export const blob = defineModifier({
  type: 'blob',
  label: 'Blob',
  kind: 'deformer',
  params: {
    roundness: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Roundness', neutral: 0 },
    inset: { type: 'number', default: 0, min: -100, max: 200, step: 0.5, unit: 'px', label: 'Inset', neutral: 0, random: [0, 10] },
  },
  apply(geo, p): Geometry {
    const roundness = Math.max(0, Math.min(1, p.roundness));
    if (roundness <= 0 && !p.inset) return geo;
    return {
      ...geo,
      shapes: geo.shapes.map((shape) => ({
        ...shape,
        subpaths: shape.subpaths.flatMap((sp) => {
          const out = blobPath(sp, roundness, sp.closed ? p.inset : 0);
          return out ? [out] : [];
        }),
      })),
    };
  },
});

const EPS = 1e-9;
/** Turns smaller than this (radians) are not corners: samples of a curve or collinear points. */
const FLAT = (2.5 * Math.PI) / 180;

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const along = (from: Vec2, to: Vec2, t: number): Vec2 => [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];

/** Is this cubic straight (controls on the chord)? */
function straight(p0: Vec2, s: Cubic): boolean {
  const [dx, dy] = sub(s.p, p0);
  const length = Math.hypot(dx, dy);
  if (length < EPS) return true;
  const off = (q: Vec2) => Math.abs((q[0] - p0[0]) * dy - (q[1] - p0[1]) * dx) / length;
  return off(s.c1) <= length * 1e-6 && off(s.c2) <= length * 1e-6;
}

/** The outline as a polygon: straight sides as they are, curves sampled by length (2 to 16 points). */
function polygon(sp: SubPath): Vec2[] {
  const pts: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const s of sp.segs) {
    if (straight(p0, s)) pts.push(s.p);
    else {
      const n = Math.max(2, Math.min(16, Math.ceil((dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p)) / 6)));
      for (let i = 1; i <= n; i++) pts.push(cubicAt(p0, s, i / n));
    }
    p0 = s.p;
  }
  // No repeated points (and, when closed, no closing duplicate of the start).
  const clean = pts.filter((q, i) => i === 0 || dist(q, pts[i - 1]!) > EPS);
  if (sp.closed && clean.length > 1 && dist(clean[0]!, clean[clean.length - 1]!) <= EPS) clean.pop();
  return clean;
}

/** Drops points where the outline barely turns, so straight sides are one side and corners stay corners. */
function corners(pts: Vec2[], closed: boolean): Vec2[] {
  let out = pts;
  for (let pass = 0; pass < 3; pass++) {
    const n = out.length;
    if (n <= 3) return out;
    const kept: Vec2[] = [];
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) { kept.push(out[i]!); continue; }
      const prev = out[(i - 1 + n) % n]!, here = out[i]!, next = out[(i + 1) % n]!;
      const a = sub(here, prev), b = sub(next, here);
      const turn = Math.abs(Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]));
      if (turn >= FLAT) kept.push(here);
    }
    if (kept.length === n || kept.length < 3) return kept.length < 3 ? out : kept;
    out = kept;
  }
  return out;
}

function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  return area / 2;
}

/** Each vertex moved `distance` px inwards along its bisector (miter capped at 4×). Null if it turns inside out. */
function inset(pts: Vec2[], distance: number): Vec2[] | null {
  const area = signedArea(pts);
  if (Math.abs(area) < EPS) return null;
  // Inward normal of side a→b, for this orientation.
  const sign = area > 0 ? 1 : -1;
  const normal = (a: Vec2, b: Vec2): Vec2 => { const [dx, dy] = sub(b, a); const l = Math.hypot(dx, dy) || 1; return [(-dy / l) * sign, (dx / l) * sign]; };
  const n = pts.length;
  const out = pts.map((here, i) => {
    const prev = pts[(i - 1 + n) % n]!, next = pts[(i + 1) % n]!;
    const n1 = normal(prev, here), n2 = normal(here, next);
    let bx = n1[0] + n2[0], by = n1[1] + n2[1];
    const bl = Math.hypot(bx, by);
    if (bl < EPS) { bx = n1[0]; by = n1[1]; } else { bx /= bl; by /= bl; }
    const reach = distance / Math.max(0.25, bx * n1[0] + by * n1[1]);
    return [here[0] + bx * reach, here[1] + by * reach] as Vec2;
  });
  // Shrunk past its own size: the outline flips (or collapses), so the shape is gone.
  const after = signedArea(out);
  if (distance > 0 && (Math.sign(after) !== Math.sign(area) || Math.abs(after) < Math.abs(area) * 1e-3)) return null;
  return out;
}

/**
 * Corner cutting: each corner P is replaced by a quadratic arc (as a cubic) from A, `r / 2` of the way to the
 * previous point, to B, `r / 2` of the way to the next; what is left of each side stays straight.
 */
function blobPath(sp: SubPath, r: number, offset: number): SubPath | null {
  let pts = corners(polygon(sp), sp.closed);
  if (pts.length < (sp.closed ? 3 : 2)) return sp;
  if (offset) {
    const moved = inset(pts, offset);
    if (!moved) return null;
    pts = moved;
  }
  const n = pts.length;
  const arc = (a: Vec2, corner: Vec2, b: Vec2): Cubic => ({ c1: along(a, corner, 2 / 3), c2: along(b, corner, 2 / 3), p: b });
  if (sp.closed) {
    const cut = (i: number) => {
      const here = pts[i]!;
      return { a: along(here, pts[(i - 1 + n) % n]!, r / 2), b: along(here, pts[(i + 1) % n]!, r / 2), here };
    };
    const cuts = pts.map((_, i) => cut(i));
    const segs: Cubic[] = [];
    let at = cuts[0]!.a;
    for (let i = 0; i < n; i++) {
      const { a, b, here } = cuts[i]!;
      if (dist(at, a) > EPS) segs.push(line(at, a));
      segs.push(r > 0 ? arc(a, here, b) : line(a, b));
      at = b;
    }
    if (dist(at, cuts[0]!.a) > EPS) segs.push(line(at, cuts[0]!.a));
    return { start: cuts[0]!.a, segs, closed: true };
  }
  // Open: the ends stay where they are; the inner corners round.
  const segs: Cubic[] = [];
  let at = pts[0]!;
  for (let i = 1; i < n - 1; i++) {
    const here = pts[i]!;
    // Only the inner end of an end side is shared, so an end side can give its whole length.
    const a = along(here, pts[i - 1]!, i === 1 ? r : r / 2), b = along(here, pts[i + 1]!, i === n - 2 ? r : r / 2);
    if (dist(at, a) > EPS) segs.push(line(at, a));
    segs.push(arc(a, here, b));
    at = b;
  }
  if (dist(at, pts[n - 1]!) > EPS) segs.push(line(at, pts[n - 1]!));
  return { start: pts[0]!, segs, closed: false };
}
