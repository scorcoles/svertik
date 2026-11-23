import { centroid, mapPoints } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/**
 * Turns the object so it faces another one (its centre), without moving it: it turns around `pivot`.
 * `facing`: which side of the object is its front (0, the right; -90, up; 90, down; 180, the left).
 * `amount`: how much it turns towards it (0, none; 1, fully). If the other moves, it keeps looking at it.
 */
export const lookat = defineModifier({
  type: 'lookat',
  label: 'Look At',
  kind: 'deformer',
  family: 'utils',
  params: {
    target: { type: 'node', default: '', label: 'Target' },
    facing: { type: 'angle', default: 0, label: 'Facing' },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', neutral: 0 },
    pivot: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Pivot' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    const c = target ? centroid(target) : null;
    if (!c) return geo;
    const o = fromFraction(ctx.bounds, p.pivot);
    const dx = c[0] - o[0], dy = c[1] - o[1];
    if (Math.hypot(dx, dy) < 1e-9) return geo;
    // The shortest turn from the front to the direction of the other.
    let turn = Math.atan2(dy, dx) - deg(p.facing);
    turn = Math.atan2(Math.sin(turn), Math.cos(turn)) * p.amount;
    if (Math.abs(turn) < 1e-12) return geo;
    const cos = Math.cos(turn), sin = Math.sin(turn);
    return mapPoints(geo, ([x, y]) => {
      const rx = x - o[0], ry = y - o[1];
      return [o[0] + rx * cos - ry * sin, o[1] + rx * sin + ry * cos];
    });
  },
});
