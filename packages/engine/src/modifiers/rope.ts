import { flatten, type Cubic, type Geometry, type Vec2 } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';

// Rope: every open path becomes a hanging rope pinned at its two ends. A Verlet chain of equal-ish links
// (their rest length is the one of the drawn path, so a path that is already a catenary stays at rest),
// gravity, an optional wind, and a round obstacle (the pointer) that pushes the links out of its way.
//
// It is stateful: the chain is stepped forward from the last time it was shown, and the state lives in a
// WeakMap keyed by the input geometry, so it needs a stable input (put Rope first in the stack, or on a
// source that does not change). A jump back in time, or a long jump forward, restarts the chain at rest
// a couple of seconds before the asked time and replays it with the current pointer.

const STEP = 1 / 120;
const WARMUP = 2;
const MAX_ADVANCE = 1.5;

interface Rope {
  /** Interleaved x, y of the nodes now and one step ago. */
  pos: Float64Array;
  prev: Float64Array;
  /** Rest length of each link. */
  rest: Float64Array;
  /** The longest link: how far a node can be moved by the constraints in one step. */
  link: number;
}

interface Place { shape: number; sub: number; rope: Rope }

interface State {
  t: number;
  /** The pointer (x, y, radius) at the last step; interpolated to the new one. */
  pointer: [number, number, number];
  ropes: Place[];
}

// By identity when the input is the same object, otherwise by a structural signature (a stack upstream of
// Rope, such as Clone, hands over a new object every frame with the same paths).
const states = new WeakMap<Geometry, Map<string, State>>();
const bySignature = new Map<string, State>();
const MAX_SIGNATURES = 8;

/** A cheap fingerprint of the open paths: their count, ends and number of segments. */
function signature(geo: Geometry): string {
  let h = 17, n = 0;
  for (const shape of geo.shapes) for (const sp of shape.subpaths) {
    const last = sp.segs.length ? sp.segs[sp.segs.length - 1]!.p : sp.start;
    h = (Math.imul(h, 31) + Math.round(sp.start[0] * 4) + Math.imul(Math.round(sp.start[1] * 4), 7) + Math.imul(Math.round(last[0] * 4), 13) + Math.imul(Math.round(last[1] * 4), 19) + sp.segs.length) | 0;
    n++;
  }
  return `${n}:${h}`;
}

/** Resamples a polyline to `n` points, equally spaced along its length. */
function resample(pts: Vec2[], n: number): Vec2[] {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const total = cum[cum.length - 1]!;
  if (total === 0) return Array.from({ length: n }, () => pts[0]!);
  const out: Vec2[] = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const d = (total * k) / (n - 1);
    while (j < pts.length - 1 && cum[j]! < d) j++;
    const span = cum[j]! - cum[j - 1]!;
    const u = span > 0 ? (d - cum[j - 1]!) / span : 0;
    out.push([pts[j - 1]![0] + (pts[j]![0] - pts[j - 1]![0]) * u, pts[j - 1]![1] + (pts[j]![1] - pts[j - 1]![1]) * u]);
  }
  return out;
}

function build(geo: Geometry, segments: number): Place[] {
  const ropes: Place[] = [];
  geo.shapes.forEach((shape, si) => shape.subpaths.forEach((sp, pi) => {
    if (sp.closed || !sp.segs.length) return;
    const pts = resample(flatten(sp, 8), segments + 1);
    const n = pts.length;
    const pos = new Float64Array(n * 2), rest = new Float64Array(n - 1);
    pts.forEach(([x, y], i) => { pos[i * 2] = x; pos[i * 2 + 1] = y; });
    for (let i = 0; i < n - 1; i++) rest[i] = Math.hypot(pos[i * 2 + 2]! - pos[i * 2]!, pos[i * 2 + 3]! - pos[i * 2 + 1]!);
    ropes.push({ shape: si, sub: pi, rope: { pos, prev: pos.slice(), rest, link: Math.max(...rest) } });
  }));
  return ropes;
}

interface Forces { gravity: number; wind: number; damping: number; iterations: number; seed: number }

function step(ropes: Place[], t: number, f: Forces, ptr: [number, number, number]) {
  const keep = Math.exp(-f.damping * STEP);
  const [px, py, pr] = ptr;
  const pr2 = pr * pr;
  ropes.forEach(({ rope }, ri) => {
    const { pos, prev, rest, link } = rope;
    const n = pos.length / 2;
    const phase = ri * 0.73 + f.seed * 1.9;
    // Only ropes with a node near the obstacle (before the step) need the contact test.
    let near = false;
    if (pr > 0) for (let i = 1; i < n - 1; i++) {
      const dx = pos[i * 2]! - px, dy = pos[i * 2 + 1]! - py, reach = pr + 3 * link;
      if (dx * dx + dy * dy < reach * reach) { near = true; break; }
    }
    for (let i = 1; i < n - 1; i++) {
      const x = pos[i * 2]!, y = pos[i * 2 + 1]!;
      const ax = f.wind ? f.wind * (Math.sin(t * 0.8 + y * 0.004 + phase) + 0.5 * Math.sin(t * 1.9 + y * 0.011 + phase * 1.7)) : 0;
      pos[i * 2] = x + (x - prev[i * 2]!) * keep + ax * STEP * STEP;
      pos[i * 2 + 1] = y + (y - prev[i * 2 + 1]!) * keep + f.gravity * STEP * STEP;
      prev[i * 2] = x; prev[i * 2 + 1] = y;
    }
    for (let it = 0; it < f.iterations; it++) {
      for (let i = 0; i < n - 1; i++) {
        const dx = pos[i * 2 + 2]! - pos[i * 2]!, dy = pos[i * 2 + 3]! - pos[i * 2 + 1]!;
        const d = Math.sqrt(dx * dx + dy * dy) || 1e-9;
        const k = (d - rest[i]!) / d;
        // The two end nodes are pinned: the link moves only its free end (fully), or both (half each).
        const wa = i === 0 ? 0 : i === n - 2 ? 1 : 0.5, wb = i === n - 2 ? 0 : i === 0 ? 1 : 0.5;
        pos[i * 2] = pos[i * 2]! + dx * k * wa; pos[i * 2 + 1] = pos[i * 2 + 1]! + dy * k * wa;
        pos[i * 2 + 2] = pos[i * 2 + 2]! - dx * k * wb; pos[i * 2 + 3] = pos[i * 2 + 3]! - dy * k * wb;
      }
      if (near) for (let i = 1; i < n - 1; i++) {
        const dx = pos[i * 2]! - px, dy = pos[i * 2 + 1]! - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < pr2) {
          const d = Math.sqrt(d2);
          const u = d > 1e-9 ? pr / d : 0;
          pos[i * 2] = px + (u ? dx * u : 0); pos[i * 2 + 1] = py + (u ? dy * u : -pr);
        }
      }
    }
  });
}

/** Catmull-Rom through the nodes, as cubics. */
function toCubics(pos: Float64Array): { start: Vec2; segs: Cubic[] } {
  const n = pos.length / 2;
  const at = (i: number): Vec2 => { const j = Math.max(0, Math.min(n - 1, i)); return [pos[j * 2]!, pos[j * 2 + 1]!]; };
  const segs: Cubic[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    segs.push({
      c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6],
      c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6],
      p: p2,
    });
  }
  return { start: at(0), segs };
}

/**
 * Rope: open paths hang as ropes pinned at both ends. Gravity (fraction of the drawing size per s²), Wind,
 * Damping and Stiffness shape the chain; Pointer and Radius place a round obstacle that pushes it. Bind
 * Time to the scene clock. Closed paths are left alone.
 */
export const rope = defineModifier({
  type: 'rope',
  label: 'Rope',
  kind: 'deformer',
  params: {
    time: { type: 'number', default: 0, defaultExpr: 'scene.time', min: 0, max: 100000, step: 0.01, label: 'Time (s)' },
    gravity: { type: 'number', default: 1, min: 0, max: 10, step: 0.01, label: 'Gravity', unit: 'fraction', ramp: false },
    wind: { type: 'number', default: 0, min: 0, max: 5, step: 0.01, label: 'Wind', ramp: false },
    damping: { type: 'number', default: 0.8, min: 0, max: 20, step: 0.05, label: 'Damping', ramp: false },
    stiffness: { type: 'number', default: 14, min: 1, max: 60, step: 1, label: 'Stiffness', animatable: false, ramp: false },
    segments: { type: 'number', default: 24, min: 4, max: 120, step: 1, label: 'Segments', animatable: false, ramp: false },
    pointer: { type: 'point', default: [-2, -2], unit: 'fraction', label: 'Pointer', group: 'Pointer' },
    space: { type: 'enum', default: 'box', options: ['box', 'scene'] as const, group: 'Pointer', label: 'Pointer in', animatable: false },
    radius: { type: 'number', default: 0, min: 0, max: 1, step: 0.005, label: 'Radius', unit: 'fraction', group: 'Pointer', ramp: false },
    settle: { type: 'number', default: 0, min: 0, max: 10, step: 0.1, label: 'Settle (s)', unit: 's', animatable: false, ramp: false },
    seed: { type: 'seed', default: 1, label: 'Seed', group: 'Wind' },
  },
  apply(geo, p, ctx) {
    if (!geo.shapes.length) return geo;
    const segments = Math.max(4, Math.min(120, Math.round(p.segments)));
    const key = `${segments}`;
    let byKey = states.get(geo);
    if (!byKey) states.set(geo, (byKey = new Map()));
    const sigKey = `${signature(geo)}|${key}|${Math.round(Math.max(0, p.settle) * 100)}`;
    let st = byKey.get(key) ?? bySignature.get(sigKey);
    const size = Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
    const forces: Forces = { gravity: Math.max(0, p.gravity) * size, wind: Math.max(0, p.wind) * size, damping: Math.max(0, p.damping), iterations: Math.max(1, Math.round(p.stiffness)), seed: p.seed };
    // `scene`: the pointer is in the rope's own coordinates (px), as scene.mouse.posX / posY give it.
    const [fx, fy] = p.space === 'scene' ? p.pointer : fromFraction(ctx.bounds, p.pointer);
    const target: [number, number, number] = [fx, fy, Math.max(0, p.radius) * size];
    const time = Math.max(0, p.time);
    if (!st || time < st.t - STEP || time - st.t > MAX_ADVANCE) {
      st = { t: Math.max(0, time - WARMUP), pointer: target, ropes: build(geo, segments) };
      // Settle: the drawn pose falls into its rest shape (heavily damped, no wind, no pointer) before time 0.
      const calm: Forces = { ...forces, wind: 0, damping: Math.max(forces.damping, 2.5) };
      for (let s = Math.round(Math.max(0, p.settle) / STEP); s > 0; s--) step(st.ropes, 0, calm, [0, 0, 0]);
      for (const { rope } of st.ropes) rope.prev.set(rope.pos);
      bySignature.set(sigKey, st);
      if (bySignature.size > MAX_SIGNATURES) bySignature.delete(bySignature.keys().next().value!);
    }
    byKey.set(key, st);
    const steps = Math.floor((time - st.t) / STEP + 1e-6);
    const from = st.pointer;
    for (let s = 1; s <= steps; s++) {
      const u = s / steps;
      st.t += STEP;
      step(st.ropes, st.t, forces, [from[0] + (target[0] - from[0]) * u, from[1] + (target[1] - from[1]) * u, from[2] + (target[2] - from[2]) * u]);
    }
    if (steps > 0) st.pointer = target;
    const placed = new Map<string, Rope>();
    for (const r of st.ropes) placed.set(`${r.shape}:${r.sub}`, r.rope);
    return {
      ...geo,
      shapes: geo.shapes.map((shape, si) => ({
        ...shape,
        subpaths: shape.subpaths.map((sp, pi) => {
          const r = placed.get(`${si}:${pi}`);
          return r ? { ...sp, ...toCubics(r.pos) } : sp;
        }),
      })),
    };
  },
});
