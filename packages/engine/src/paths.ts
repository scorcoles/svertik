// Walking paths by length: to spread copies along an outline or wrap a drawing along it.
import { flatten, type Geometry, type Vec2 } from './geometry';

export interface Polyline {
  pts: Vec2[];
  /** Accumulated length up to each point. */
  cum: number[];
  closed: boolean;
  length: number;
}

/** Each subpath as a polyline (closed ones with the point back at the start). */
export function polylines(geo: Geometry, samples = 16): Polyline[] {
  return geo.shapes.flatMap((s) =>
    s.subpaths.map((sp) => {
      const pts = flatten(sp, samples);
      if (sp.closed) pts.push(sp.start);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, cum, closed: sp.closed, length: cum[cum.length - 1]! };
    }),
  ).filter((p) => p.length > 0);
}

/** Point and (unit) tangent at distance `s`. Closed paths wrap around; open ones extend in a straight line. */
export function pointAt(pl: Polyline, s: number): { p: Vec2; t: Vec2 } {
  const L = pl.length;
  if (pl.closed) s = ((s % L) + L) % L;
  const n = pl.pts.length;
  // Beyond an open path: follow the end's tangent.
  if (!pl.closed && (s < 0 || s > L)) {
    const [a, b] = s < 0 ? [pl.pts[0]!, pl.pts[1]!] : [pl.pts[n - 2]!, pl.pts[n - 1]!];
    const t = unit([b[0] - a[0], b[1] - a[1]]);
    const from = s < 0 ? a : b;
    const d = s < 0 ? s : s - L;
    return { p: [from[0] + t[0] * d, from[1] + t[1] * d], t };
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pl.cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const a = pl.pts[lo]!, b = pl.pts[hi]!;
  const seg = pl.cum[hi]! - pl.cum[lo]! || 1;
  const k = (s - pl.cum[lo]!) / seg;
  return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: unit([b[0] - a[0], b[1] - a[1]]) };
}

const unit = ([x, y]: Vec2): Vec2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/**
 * Fractal midpoint displacement: while a side is longer than `detail`, it is split in two and the new
 * point moves sideways (up to `amount` × half its length). A torn edge.
 * With `closed`, the last point links to the first; otherwise the ends don't move.
 */
export function tearPolyline(pts: Vec2[], closed: boolean, detail: number, amount: number, rand: () => number, maxPoints = 4000): Vec2[] {
  let cur = pts;
  for (let pass = 0; pass < 8; pass++) {
    const next: Vec2[] = [];
    let split = false;
    const n = closed ? cur.length : cur.length - 1;
    for (let i = 0; i < n; i++) {
      const a = cur[i]!, b = cur[(i + 1) % cur.length]!;
      next.push(a);
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy);
      if (len <= detail) continue;
      split = true;
      const off = (rand() - 0.5) * len * 0.5 * amount;
      next.push([(a[0] + b[0]) / 2 - (dy / len) * off, (a[1] + b[1]) / 2 + (dx / len) * off]);
    }
    if (!closed) next.push(cur[cur.length - 1]!);
    cur = next;
    if (!split || cur.length > maxPoints) break;
  }
  return cur;
}
