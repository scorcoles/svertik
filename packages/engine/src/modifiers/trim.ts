import { cubicAt, line, mapSubPaths, type Cubic, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Trims paths (draws them): of each path only the stretch between Start and End (fractions of its
 * length) remains, shifted by Offset; in closed paths the stretch wraps around. Animating End from 0 to 1,
 * the stroke draws itself. Meant for strokes; a trimmed fill closes with a straight line.
 */
export const trim = defineModifier({
  type: 'trim',
  label: 'Trim',
  kind: 'deformer',
  params: {
    // Neutral: the whole stroke (start 0, end 1). Inside Stagger, Range or Field, each element goes from its
    // whole stroke to these values by its weight: with End at 0, the lines draw one after another.
    start: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Start' },
    end: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'End', neutral: 1 },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Offset' },
  },
  apply(geo, p) {
    // Stagger's back and elastic curves can go beyond 0–1: the stretch, kept inside.
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    const a = clamp(Math.min(p.start, p.end)), b = clamp(Math.max(p.start, p.end));
    if (a <= 0 && b >= 1 && p.offset === 0) return geo;
    const out = mapSubPaths(geo, (sp) => cut(sp, a + p.offset, b + p.offset) ?? empty(sp));
    return { ...out, shapes: out.shapes.map((s) => ({ ...s, subpaths: s.subpaths.filter((x) => x.segs.length) })) };
  },
});

const empty = (sp: SubPath): SubPath => ({ start: sp.start, segs: [], closed: false });

/** Is this cubic a straight segment (control points on the chord)? Then one sample is exact. */
function straight(p0: Vec2, s: Cubic): boolean {
  const dx = s.p[0] - p0[0], dy = s.p[1] - p0[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-12) return Math.hypot(s.c1[0] - p0[0], s.c1[1] - p0[1]) < 1e-9 && Math.hypot(s.c2[0] - p0[0], s.c2[1] - p0[1]) < 1e-9;
  const off = (q: Vec2) => Math.abs((q[0] - p0[0]) * dy - (q[1] - p0[1]) * dx) / length;
  return off(s.c1) <= length * 1e-6 && off(s.c2) <= length * 1e-6;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * The path as a polyline: straight segments kept as they are, curves sampled about every 3 px (2 to 24
 * samples, by the length of their control polygon), so generators' thousands of tiny curves stay cheap.
 */
function polyline(sp: SubPath): Vec2[] {
  const pts: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const s of sp.segs) {
    if (straight(p0, s)) pts.push(s.p);
    else {
      const samples = Math.max(2, Math.min(24, Math.ceil((dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p)) / 3)));
      for (let i = 1; i <= samples; i++) pts.push(cubicAt(p0, s, i / samples));
    }
    p0 = s.p;
  }
  return pts;
}

function cut(sp: SubPath, f0: number, f1: number): SubPath | null {
  const pts = polyline(sp);
  if (sp.closed) pts.push(sp.start);
  const n = pts.length;
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = cum[n - 1]!;
  if (L <= 0 || f1 - f0 <= 1e-6) return null;
  // Open: trimmed within [0, 1]. Closed: the stretch can wrap around.
  let s0 = f0 * L, s1 = f1 * L;
  if (!sp.closed) {
    s0 = Math.max(0, s0);
    s1 = Math.min(L, s1);
    if (s1 - s0 <= 1e-9) return null;
  }
  /** First vertex index i (1…n-1) with cum[i] >= s: binary search, so long paths stay linear overall. */
  const after = (s: number) => {
    let lo = 1, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid]! < s) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const at = (s: number): Vec2 => {
    if (sp.closed) s = ((s % L) + L) % L;
    const i = after(s);
    const seg = cum[i]! - cum[i - 1]! || 1;
    const k = (s - cum[i - 1]!) / seg;
    const p0 = pts[i - 1]!, p1 = pts[i]!;
    return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k];
  };
  // Points of the stretch: the start, the inner vertices (taken as they are) and the end.
  const span = Math.min(s1 - s0, L);
  const out: Vec2[] = [at(s0)];
  const base = Math.floor(s0 / L) * L;
  for (let lap = 0; lap < 2; lap++) {
    const from = base + lap * L;
    if (from >= s0 + span) break;
    for (let i = after(Math.max(1e-12, s0 - from)); i < n - 1; i++) {
      const s = from + cum[i]!;
      if (s <= s0) continue;
      if (s >= s0 + span) break;
      out.push(pts[i]!);
    }
  }
  out.push(at(s0 + span));
  const full = sp.closed && span >= L - 1e-9;
  return { start: out[0]!, segs: out.slice(1).map((q, i) => line(out[i]!, q)), closed: full };
}
