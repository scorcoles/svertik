import { mapPoints, subdivide, type Bounds, type Vec2 } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

const lengthParam = (k: number, segments?: string[]) =>
  ({ type: 'number', default: 1, min: 0.1, max: 10, step: 0.05, label: `Length ${k}`, group: 'Chain', ...(segments ? { showIf: { segments } } : {}) }) as const;

/**
 * Bones: a chain of 2 to 6 bones running through the drawing from Start to End. Each bone has a length
 * (relative to the others: they share the Start–End distance) and turns on its joint (its angle, relative
 * to the previous one), dragging what is around it. Each point belongs to the bone at its height along the
 * chain, so there are no weights to paint.
 * At each joint the drawing bends round an arc tangent to both bones (a fillet), like Bend: the thickness
 * is kept, the inner side compresses instead of folding over and the outer side stays round. Smooth is
 * how long that arc is (1 = half of the shorter bone on each side). The joints stay where the rigid chain
 * puts them, so with IK the tip still reaches Target.
 * With IK, the angles are solved so the tip reaches Target (the current angles say which way it bends).
 * The engine solves it live: the scene only stores the angles (or the target) and their keys.
 */
export const bones = defineModifier({
  type: 'bones',
  label: 'Bones',
  kind: 'deformer',
  params: {
    segments: { type: 'number', default: 3, min: 2, max: 6, step: 1, ramp: false, label: 'Segments', random: false },
    angle1: { type: 'angle', default: 12, label: 'Bone 1', showIf: { ik: ['false'] } },
    angle2: { type: 'angle', default: 12, label: 'Bone 2', showIf: { ik: ['false'] } },
    angle3: { type: 'angle', default: 12, label: 'Bone 3', showIf: { ik: ['false'], segments: ['3', '4', '5', '6'] } },
    angle4: { type: 'angle', default: 12, label: 'Bone 4', showIf: { ik: ['false'], segments: ['4', '5', '6'] } },
    angle5: { type: 'angle', default: 12, label: 'Bone 5', showIf: { ik: ['false'], segments: ['5', '6'] } },
    angle6: { type: 'angle', default: 12, label: 'Bone 6', showIf: { ik: ['false'], segments: ['6'] } },
    smooth: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Smooth', ramp: false },
    ik: { type: 'boolean', default: false, label: 'IK', animatable: false },
    target: { type: 'point', default: [0.8, 0.1], unit: 'fraction', label: 'Target', showIf: { ik: ['true'] } },
    start: { type: 'point', default: [0, 0.5], unit: 'fraction', label: 'Start', group: 'Chain' },
    end: { type: 'point', default: [1, 0.5], unit: 'fraction', label: 'End', group: 'Chain' },
    length1: lengthParam(1),
    length2: lengthParam(2),
    length3: lengthParam(3, ['3', '4', '5', '6']),
    length4: lengthParam(4, ['4', '5', '6']),
    length5: lengthParam(5, ['5', '6']),
    length6: lengthParam(6, ['6']),
  },
  apply(geo, p, ctx) {
    const chain = chainOf(p, ctx.bounds);
    if (!chain || chain.rel.every((a) => Math.abs(a) < 1e-9)) return geo;
    const { A, n, base, J, len, rel, pose, turn } = chain;
    const [ux, uy] = [Math.cos(base), Math.sin(base)];
    // Each joint's fillet: half its rest length (along the chain) and its signed radius.
    const fillet = Array.from({ length: n }, (_, k) => {
      if (k === 0 || Math.abs(rel[k]!) < 1e-6) return null;
      const d = Math.max(0, Math.min(1, p.smooth)) * 0.5 * Math.min(len[k - 1]!, len[k]!);
      return d < 1e-9 ? null : { d, r: d / Math.tan(rel[k]! / 2) };
    });

    // Where bone k carries a point (u along the rest chain, v across it): turned with its bone, from its
    // posed joint. On the inner side of a bent joint, the two bones' material would cross over: each one
    // stops at the joint's bisector, so the inside ends in a clean corner.
    const rigid = (k: number, u: number, v: number): Vec2 => {
      const a = base + turn[k]!;
      const [bx, by] = [Math.cos(a), Math.sin(a)];
      const [qx, qy] = [-by * v, bx * v];
      let t = u - J[k]!;
      const cut = (j: number) => {
        // The bisector at joint j, as a distance along bone k from its own joint k.
        const [mx, my] = [Math.cos(base + turn[j - 1]!) + Math.cos(base + turn[j]!), Math.sin(base + turn[j - 1]!) + Math.sin(base + turn[j]!)];
        return J[j]! - J[k]! - (qx * mx + qy * my) / (bx * mx + by * my);
      };
      if (k > 0 && v * rel[k]! > 0) t = Math.max(t, cut(k));
      if (k < n - 1 && v * rel[k + 1]! > 0) t = Math.min(t, cut(k + 1));
      return [pose[k]![0] + bx * t + qx, pose[k]![1] + by * t + qy];
    };

    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // Chain-local coordinates: along the chain from Start (u) and across it (v).
      const [dx, dy] = [x - A[0], y - A[1]];
      const u = dx * ux + dy * uy;
      const v = -dx * uy + dy * ux;
      // The bone at that height (outside the chain, the first or the last).
      let k = 0;
      while (k < n - 1 && u >= J[k + 1]!) k++;
      // Inside the bend of the joint before or after it: along the fillet.
      for (const j of [k, k + 1]) {
        const f = j < n ? fillet[j] : null;
        if (!f || Math.abs(u - J[j]!) >= f.d) continue;
        // Further inside than the radius, it would cross the centre: it keeps to its bone.
        if (v * f.r > f.r * f.r) return rigid(u < J[j]! ? j - 1 : j, u, v);
        const a0 = base + turn[j - 1]!;
        const a = a0 + ((u - (J[j]! - f.d)) / (2 * f.d)) * rel[j]!;
        // The arc starts d before the posed joint, on the previous bone; its centre is r across from there.
        const S: Vec2 = [pose[j]![0] - Math.cos(a0) * f.d, pose[j]![1] - Math.sin(a0) * f.d];
        const C: Vec2 = [S[0] - Math.sin(a0) * f.r, S[1] + Math.cos(a0) * f.r];
        const [nx, ny] = [-Math.sin(a), Math.cos(a)];
        return [C[0] - nx * f.r + nx * v, C[1] - ny * f.r + ny * v];
      }
      return rigid(k, u, v);
    });
  },
  // On the canvas: the chain in its pose (the bones and their joints).
  guides(p, b) {
    const chain = chainOf(p, b);
    return chain ? { lines: [chain.pose], points: chain.pose } : { lines: [], points: [] };
  },
});

type ChainParams = {
  start: [number, number];
  end: [number, number];
  segments: number;
  ik: boolean;
  target: [number, number];
  smooth: number;
} & Record<`angle${1 | 2 | 3 | 4 | 5 | 6}` | `length${1 | 2 | 3 | 4 | 5 | 6}`, number>;

/** The posed chain: each joint's rest distance along the chain, the posed joints and each bone's accumulated rotation. */
function chainOf(p: ChainParams, b: Bounds) {
  const A = fromFraction(b, p.start);
  const B = fromFraction(b, p.end);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 1e-9) return null;
  const n = Math.max(2, Math.min(6, Math.round(p.segments)));
  const base = Math.atan2(B[1] - A[1], B[0] - A[0]);
  // Each bone's length: its share of Start–End.
  const weights = [p.length1, p.length2, p.length3, p.length4, p.length5, p.length6].slice(0, n).map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  const total = weights.reduce((s, w) => s + w, 0);
  const len = weights.map((w) => (w / total) * L);
  const J: number[] = [0];
  for (const l of len) J.push(J[J.length - 1]! + l);
  // Each bone's angle (relative to the previous one): the panel's, or the ones that take the tip to the target.
  let rel = [p.angle1, p.angle2, p.angle3, p.angle4, p.angle5, p.angle6].slice(0, n).map(deg);
  if (p.ik) rel = solveIK(A, base, len, rel, fromFraction(b, p.target));
  const pose: Vec2[] = [A];
  const turn: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += rel[k]!;
    turn.push(acc);
    const j = pose[k]!;
    pose.push([j[0] + Math.cos(base + acc) * len[k]!, j[1] + Math.sin(base + acc) * len[k]!]);
  }
  return { A, n, base, J, len, rel, pose, turn };
}

/**
 * IK by FABRIK: the chain's tip (root fixed at A) towards the target, in a few passes. It starts from the
 * pose of the given angles (if they are all 0, from a slight curve), so the chain bends that way.
 * Returns each bone's relative angle.
 */
function solveIK(A: Vec2, base: number, len: number[], start: number[], target: Vec2): number[] {
  const n = start.length;
  const hint = start.every((a) => Math.abs(a) < 1e-6) ? start.map(() => deg(8)) : start;
  const pts: [number, number][] = [[A[0], A[1]]];
  let acc = 0;
  hint.forEach((a, k) => {
    acc += a;
    const j = pts[pts.length - 1]!;
    pts.push([j[0] + Math.cos(base + acc) * len[k]!, j[1] + Math.sin(base + acc) * len[k]!]);
  });
  const toward = (from: [number, number], to: [number, number], l: number): [number, number] => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1e-9;
    return [from[0] + ((to[0] - from[0]) / d) * l, from[1] + ((to[1] - from[1]) / d) * l];
  };
  const reach = Math.min(...len) * 1e-3;
  for (let it = 0; it < 24; it++) {
    // From tip to root, and from root to tip.
    pts[n] = [target[0], target[1]];
    for (let k = n - 1; k >= 0; k--) pts[k] = toward(pts[k + 1]!, pts[k]!, len[k]!);
    pts[0] = [A[0], A[1]];
    for (let k = 1; k <= n; k++) pts[k] = toward(pts[k - 1]!, pts[k]!, len[k - 1]!);
    if (Math.hypot(pts[n]![0] - target[0], pts[n]![1] - target[1]) < reach) break;
  }
  // Relative angles, without full-turn jumps.
  const out: number[] = [];
  let prev = base;
  for (let k = 0; k < n; k++) {
    const a = Math.atan2(pts[k + 1]![1] - pts[k]![1], pts[k + 1]![0] - pts[k]![0]);
    let r = a - prev;
    while (r > Math.PI) r -= 2 * Math.PI;
    while (r < -Math.PI) r += 2 * Math.PI;
    out.push(r);
    prev = a;
  }
  return out;
}
