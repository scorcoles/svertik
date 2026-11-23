import { flatten, line, mapSubPaths, type Cubic, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Regular spikes along the outline: `count` tips per path, evenly spaced by length, each `height` px
 * out along the outline's normal (negative: inwards).
 * - curve: how the sides go from the base to the tip. 0: straight; towards 1 they hollow out
 *   (thorns: they leave the outline flat and climb at the end); towards -1 they bulge (petals).
 * - width: the share of its stretch each spike takes; the rest keeps following the outline.
 * - lean: tilts the tips along the outline (-1: towards the start of the spike; 1: towards its end).
 * - phase: slides the whole row along the outline (1: one whole spike).
 * Curved outlines are walked as fine polylines. On an open path the ends stay where they are.
 */
export const spikes = defineModifier({
  type: 'spikes',
  label: 'Spikes',
  kind: 'deformer',
  params: {
    count: { type: 'number', default: 12, min: 1, max: 200, step: 1, label: 'Count', ramp: false, sliderCurve: 'quadratic', random: [5, 40] },
    height: { type: 'number', default: 30, min: -500, max: 500, step: 0.5, unit: 'px', label: 'Height', sliderCurve: 'quadratic', random: [10, 80] },
    curve: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Curve' },
    width: { type: 'number', default: 1, min: 0.05, max: 1, step: 0.01, unit: 'fraction', label: 'Width', neutral: 1 },
    lean: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Lean' },
    phase: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Phase' },
  },
  apply(geo, p) {
    const count = Math.max(1, Math.min(MAX_SPIKES, Math.round(p.count)));
    if (p.height === 0) return geo;
    return mapSubPaths(geo, (sp) => spikeSubPath(sp, count, p.height, clamp(p.curve, -1, 1), clamp(p.width, 0.05, 1), clamp(p.lean, -1, 1), p.phase));
  },
});

const MAX_SPIKES = 2000;
const EPS = 1e-9;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Walk {
  pts: Vec2[];
  cum: number[];
  length: number;
  closed: boolean;
}

function spikeSubPath(sp: SubPath, count: number, height: number, curve: number, width: number, lean: number, phase: number): SubPath {
  const w = walk(sp);
  if (!w) return sp;
  // Positive height points away from the inside of a closed path; on an open one, to the left of its direction.
  const side = !w.closed || area(w.pts) > 0 ? -1 : 1;
  const stretch = w.length / count;
  const offset = w.closed ? (((phase % 1) + 1) % 1) * stretch : 0;
  const start = at(w, offset).p;
  const segs: Cubic[] = [];
  let cursor = start;
  let from = offset;
  for (let i = 0; i < count; i++) {
    const s0 = offset + i * stretch + (stretch * (1 - width)) / 2;
    const s1 = s0 + stretch * width;
    // The stretch before the spike keeps the outline.
    cursor = follow(w, from, s0, cursor, segs);
    const foot = at(w, s0 + (s1 - s0) * (0.5 + lean * 0.5));
    const tip: Vec2 = [foot.p[0] - foot.t[1] * side * height, foot.p[1] + foot.t[0] * side * height];
    const end = at(w, s1).p;
    segs.push(flank(cursor, tip, foot.p, curve), flank(tip, end, foot.p, curve, true));
    cursor = end;
    from = s1;
  }
  follow(w, from, offset + w.length, cursor, segs);
  // A closed path returns to its start by itself.
  if (w.closed && segs.length && dist(segs[segs.length - 1]!.p, start) < 1e-6) segs[segs.length - 1] = { ...segs[segs.length - 1]!, p: start };
  return { start, segs, closed: sp.closed };
}

/**
 * One side of a spike, between the outline (`base`) and the tip. Straight with `curve` 0; otherwise a
 * quadratic curve whose control point goes towards the tip's foot (hollow) or towards the corner above
 * the base (bulging).
 */
function flank(a: Vec2, b: Vec2, foot: Vec2, curve: number, down = false): Cubic {
  if (Math.abs(curve) < 1e-4) return line(a, b);
  const base = down ? b : a;
  const tip = down ? a : b;
  const mid: Vec2 = [(base[0] + tip[0]) / 2, (base[1] + tip[1]) / 2];
  const target: Vec2 = curve > 0 ? foot : [base[0] + tip[0] - foot[0], base[1] + tip[1] - foot[1]];
  const k = Math.abs(curve);
  const c: Vec2 = [mid[0] + (target[0] - mid[0]) * k, mid[1] + (target[1] - mid[1]) * k];
  return { c1: [a[0] + ((c[0] - a[0]) * 2) / 3, a[1] + ((c[1] - a[1]) * 2) / 3], c2: [b[0] + ((c[0] - b[0]) * 2) / 3, b[1] + ((c[1] - b[1]) * 2) / 3], p: b };
}

/** The outline from length `a` to `b`, as straight segments appended to `segs`. Returns the last point. */
function follow(w: Walk, a: number, b: number, cursor: Vec2, segs: Cubic[]): Vec2 {
  if (b - a < 1e-6) return cursor;
  const n = w.pts.length - 1;
  const push = (q: Vec2) => {
    if (dist(cursor, q) < 1e-6) return;
    segs.push(line(cursor, q));
    cursor = q;
  };
  // Vertices strictly between both lengths; a closed path may go round past its end.
  const laps = w.closed ? Math.floor(a / w.length) : 0;
  for (let lap = laps; lap * w.length < b; lap++) {
    for (let i = 0; i < n; i++) {
      const s = w.cum[i]! + lap * w.length;
      if (s > a + 1e-6 && s < b - 1e-6) push(w.pts[i]!);
    }
    if (!w.closed) break;
  }
  push(at(w, b).p);
  return cursor;
}

/** The subpath as a polyline with accumulated lengths; closed ones come back to the start. */
function walk(sp: SubPath): Walk | null {
  const pts = flatten(sp, 16);
  if (sp.closed && dist(pts[0]!, pts[pts.length - 1]!) > EPS) pts.push(pts[0]!);
  const clean: Vec2[] = [pts[0]!];
  for (const q of pts) if (dist(clean[clean.length - 1]!, q) > EPS) clean.push(q);
  if (clean.length < 2) return null;
  const cum = [0];
  for (let i = 1; i < clean.length; i++) cum.push(cum[i - 1]! + dist(clean[i - 1]!, clean[i]!));
  const length = cum[cum.length - 1]!;
  return length > EPS ? { pts: clean, cum, length, closed: sp.closed } : null;
}

/** Point and unit tangent at length `s` (closed paths wrap around). */
function at(w: Walk, s: number): { p: Vec2; t: Vec2 } {
  if (w.closed) s = ((s % w.length) + w.length) % w.length;
  else s = clamp(s, 0, w.length);
  let lo = 0, hi = w.pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (w.cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const a = w.pts[lo]!, b = w.pts[hi]!;
  const len = w.cum[hi]! - w.cum[lo]! || 1;
  const k = (s - w.cum[lo]!) / len;
  return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
/** Shoelace area: positive when the path turns clockwise on screen (Y grows downwards). */
function area(pts: Vec2[]) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) sum += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
  return sum / 2;
}
