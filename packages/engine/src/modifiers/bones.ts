import { mapPoints, subdivide, type Bounds, type Vec2 } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/**
 * Bones: a chain of 2 to 6 equal bones running through the drawing from Start to End. Each bone turns on its
 * joint (its angle, relative to the previous one) and drags what is around it; at each joint the change
 * from one bone to the next is smooth (Smooth). Each point belongs to the bone at its height along the
 * chain, so there are no weights to paint.
 * With IK, the angles are solved so the tip reaches Target (the current angles say which way it
 * bends). The engine solves it live: the scene only stores the angles (or the target) and their keys.
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
  },
  apply(geo, p, ctx) {
    const chain = chainOf(p, ctx.bounds);
    if (!chain || chain.rel.every((a) => Math.abs(a) < 1e-9)) return geo;
    const { A, n, seg, rest, pose, turn } = chain;
    const [ux, uy] = [Math.cos(chain.base), Math.sin(chain.base)];
    // What bone k does to a point: turn it on its joint and carry it to the posed joint.
    const move = (k: number, x: number, y: number): Vec2 => {
      const [jx, jy] = rest[k]!, [px, py] = pose[k]!;
      const [c, s] = [Math.cos(turn[k]!), Math.sin(turn[k]!)];
      const [dx, dy] = [x - jx, y - jy];
      return [px + dx * c - dy * s, py + dx * s + dy * c];
    };
    // Half width of the blend zone at each joint, in bones (0 = no blend; 0.5 = half a bone).
    const w = Math.max(1e-6, Math.min(1, p.smooth) * 0.5);
    const smoothstep = (t: number) => t * t * (3 - 2 * t);

    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // How far along the chain it is (in bones: 0 at Start, n at End); outside, the first or the last.
      const t = ((x - A[0]) * ux + (y - A[1]) * uy) / seg;
      const k = Math.max(0, Math.min(n - 1, Math.floor(t)));
      // Near a joint, a blend of the two bones.
      const joint = Math.max(1, Math.min(n - 1, Math.round(t)));
      const d = t - joint;
      if (Math.abs(d) < w) {
        const mix = smoothstep((d + w) / (2 * w));
        const [ax, ay] = move(joint - 1, x, y);
        const [bx, by] = move(joint, x, y);
        return [ax + (bx - ax) * mix, ay + (by - ay) * mix];
      }
      return move(k, x, y);
    });
  },
  // On the canvas: the chain in its pose (the bones and their joints).
  guides(p, b) {
    const chain = chainOf(p, b);
    return chain ? { lines: [chain.pose], points: chain.pose } : { lines: [], points: [] };
  },
});

/** The posed chain: joints at rest (on the line) and posed, and each bone's accumulated rotation. */
function chainOf(
  p: { start: [number, number]; end: [number, number]; segments: number; ik: boolean; target: [number, number]; angle1: number; angle2: number; angle3: number; angle4: number; angle5: number; angle6: number },
  b: Bounds,
) {
  const A = fromFraction(b, p.start);
  const B = fromFraction(b, p.end);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  if (L < 1e-9) return null;
  const n = Math.max(2, Math.min(6, Math.round(p.segments)));
  const seg = L / n;
  const base = Math.atan2(B[1] - A[1], B[0] - A[0]);
  // Each bone's angle (relative to the previous one): the panel's, or the ones that take the tip to the target.
  let rel = [p.angle1, p.angle2, p.angle3, p.angle4, p.angle5, p.angle6].slice(0, n).map(deg);
  if (p.ik) rel = solveIK(A, base, seg, rel, fromFraction(b, p.target));
  const rest: Vec2[] = Array.from({ length: n + 1 }, (_, k) => [A[0] + Math.cos(base) * seg * k, A[1] + Math.sin(base) * seg * k]);
  const pose: Vec2[] = [A];
  const turn: number[] = [];
  let acc = 0;
  for (let k = 0; k < n; k++) {
    acc += rel[k]!;
    turn.push(acc);
    const j = pose[k]!;
    pose.push([j[0] + Math.cos(base + acc) * seg, j[1] + Math.sin(base + acc) * seg]);
  }
  return { A, n, seg, base, rel, rest, pose, turn };
}

/**
 * IK by FABRIK: the chain's tip (root fixed at A) towards the target, in a few passes. It starts from the
 * pose of the given angles (if they are all 0, from a slight curve), so the chain bends that way.
 * Returns each bone's relative angle.
 */
function solveIK(A: Vec2, base: number, seg: number, start: number[], target: Vec2): number[] {
  const n = start.length;
  const hint = start.every((a) => Math.abs(a) < 1e-6) ? start.map(() => deg(8)) : start;
  const pts: [number, number][] = [[A[0], A[1]]];
  let acc = 0;
  for (const a of hint) {
    acc += a;
    const j = pts[pts.length - 1]!;
    pts.push([j[0] + Math.cos(base + acc) * seg, j[1] + Math.sin(base + acc) * seg]);
  }
  const toward = (from: [number, number], to: [number, number]): [number, number] => {
    const d = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1e-9;
    return [from[0] + ((to[0] - from[0]) / d) * seg, from[1] + ((to[1] - from[1]) / d) * seg];
  };
  for (let it = 0; it < 24; it++) {
    // From tip to root, and from root to tip.
    pts[n] = [target[0], target[1]];
    for (let k = n - 1; k >= 0; k--) pts[k] = toward(pts[k + 1]!, pts[k]!);
    pts[0] = [A[0], A[1]];
    for (let k = 1; k <= n; k++) pts[k] = toward(pts[k - 1]!, pts[k]!);
    if (Math.hypot(pts[n]![0] - target[0], pts[n]![1] - target[1]) < seg * 1e-3) break;
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
