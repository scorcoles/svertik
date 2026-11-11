import { cubicAt, line, mapSubPaths, splitCubic, type Cubic, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Rounds the corners: at every point where the path changes direction sharply, it cuts the two incoming
 * segments and joins them with an arc (or a straight line, in `chamfer`). Smooth curves aren't touched.
 * - radius: the arc's radius, in drawing units. If the segments are short, the arc shrinks to
 *   fit (at most half a segment that is also rounded at its other end).
 * - limit: only corners with an inner angle below it (180: all; 90: only right and sharp ones).
 */
export const roundcorners = defineModifier({
  type: 'roundcorners',
  label: 'Round Corners',
  kind: 'deformer',
  params: {
    radius: { type: 'number', default: 12, min: 0, max: 500, step: 0.5, unit: 'px', label: 'Radius', random: [2, 60] },
    limit: { type: 'number', default: 180, min: 0, max: 180, step: 1, unit: '°', label: 'Angle limit', ramp: false, neutral: 180 },
    shape: { type: 'enum', default: 'round', options: ['round', 'chamfer'] as const, animatable: false, label: 'Shape' },
  },
  apply(geo, p) {
    if (p.radius <= 0) return geo;
    return mapSubPaths(geo, (sp) => roundSubPath(sp, p.radius, p.limit, p.shape === 'chamfer'));
  },
});

/** Below this turn it isn't a corner (approximated smooth curves). */
const MIN_TURN = (1 * Math.PI) / 180;
const EPS = 1e-6;

interface Seg {
  p0: Vec2;
  s: Cubic;
  len: number;
}

function roundSubPath(sp: SubPath, radius: number, limitDeg: number, chamfer: boolean): SubPath {
  // Segments with their start point; zero-length ones dropped. A closed path ends at its start.
  const segs: Seg[] = [];
  let p0 = sp.start;
  for (const s of sp.segs) {
    const len = length(p0, s);
    if (len > EPS) segs.push({ p0, s, len });
    p0 = s.p;
  }
  if (sp.closed && dist(p0, sp.start) > EPS) segs.push({ p0, s: line(p0, sp.start), len: dist(p0, sp.start) });
  const n = segs.length;
  if (n < 2) return sp;

  // Corners: corner k is between segment k-1 and k (in an open path, 1 to n-1; in a closed one, all).
  const turnLimit = Math.PI - (Math.max(0, Math.min(180, limitDeg)) * Math.PI) / 180;
  const turns: number[] = new Array(n).fill(0);
  for (let k = sp.closed ? 0 : 1; k < n; k++) {
    const a = segs[(k - 1 + n) % n]!, b = segs[k]!;
    const t = angleBetween(endTangent(a), startTangent(b));
    if (t > MIN_TURN && t >= turnLimit - EPS) turns[k] = t;
  }
  if (turns.every((t) => t === 0)) return sp;

  // How much is cut on each side of each corner: R·tan(turn/2), never more than fits in each segment.
  const room = (i: number, otherEnd: number) => segs[i]!.len * (turns[otherEnd] ? 0.5 : 1) * 0.999;
  const cut: number[] = turns.map((t, k) => {
    if (!t) return 0;
    const want = radius * Math.tan(Math.min(t, Math.PI - 1e-3) / 2);
    const prev = (k - 1 + n) % n;
    return Math.min(want, room(prev, prev), room(k, (k + 1) % n));
  });

  // Each segment, trimmed at both ends.
  const trimmed: { start: Vec2; s: Cubic }[] = segs.map((g, i) => {
    let from = g.p0;
    let s = g.s;
    const head = cut[i]!;
    const tail = sp.closed || i < n - 1 ? cut[(i + 1) % n]! : 0;
    if (head > 0) {
      const t = paramAt(from, s, head);
      const [, rest] = splitCubic(from, s, t);
      from = cubicAt(g.p0, g.s, t);
      s = rest;
    }
    if (tail > 0) {
      const len = length(from, s);
      const t = paramAt(from, s, Math.max(0, len - tail));
      [s] = splitCubic(from, s, t);
    }
    return { start: from, s };
  });

  // Arc between the end of one segment and the start of the next.
  const arc = (a: { start: Vec2; s: Cubic }, b: { start: Vec2; s: Cubic }): Cubic => {
    const from = a.s.p, to = b.start;
    if (chamfer) return line(from, to);
    const ta = unit(endTangent({ p0: a.start, s: a.s, len: 0 }));
    const tb = unit(startTangent({ p0: b.start, s: b.s, len: 0 }));
    const turn = angleBetween(ta, tb);
    if (turn < MIN_TURN) return line(from, to);
    // Radius through both points with those tangents; handles of a circular arc (4/3·tan(turn/4)).
    const r = dist(from, to) / (2 * Math.sin(turn / 2));
    const k = (4 / 3) * Math.tan(turn / 4) * r;
    return { c1: [from[0] + ta[0] * k, from[1] + ta[1] * k], c2: [to[0] - tb[0] * k, to[1] - tb[1] * k], p: to };
  };

  const out: Cubic[] = [];
  for (let i = 0; i < n; i++) {
    out.push(trimmed[i]!.s);
    const next = (i + 1) % n;
    if ((sp.closed || i < n - 1) && turns[next]) out.push(arc(trimmed[i]!, trimmed[next]!));
  }
  return { start: trimmed[0]!.start, segs: out, closed: sp.closed };
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const unit = (v: Vec2): Vec2 => {
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
};
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const angleBetween = (a: Vec2, b: Vec2) => {
  const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]);
  if (la < EPS || lb < EPS) return 0;
  return Math.acos(Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1]) / (la * lb))));
};

/** Direction arriving at the end of the segment (the nearest control that doesn't coincide with the tip). */
function endTangent({ p0, s }: Seg): Vec2 {
  for (const q of [s.c2, s.c1, p0]) if (dist(q, s.p) > EPS) return sub(s.p, q);
  return [0, 0];
}
/** Direction leaving the start of the segment. */
function startTangent({ p0, s }: Seg): Vec2 {
  for (const q of [s.c1, s.c2, s.p]) if (dist(q, p0) > EPS) return sub(q, p0);
  return [0, 0];
}

const SAMPLES = 24;
function length(p0: Vec2, s: Cubic): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= SAMPLES; i++) {
    const q = cubicAt(p0, s, i / SAMPLES);
    len += dist(prev, q);
    prev = q;
  }
  return len;
}
/** The t at which distance `d` has been covered from the start of the segment (by samples, interpolating). */
function paramAt(p0: Vec2, s: Cubic, d: number): number {
  let acc = 0;
  let prev = p0;
  for (let i = 1; i <= SAMPLES; i++) {
    const q = cubicAt(p0, s, i / SAMPLES);
    const step = dist(prev, q);
    if (acc + step >= d) return (i - 1 + (step > 0 ? (d - acc) / step : 0)) / SAMPLES;
    acc += step;
    prev = q;
  }
  return 1;
}
