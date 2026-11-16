import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Gather: squeezes the drawing towards one side along an axis, by an amount that changes across it. With
 * axis x, every point keeps its height but its x is remapped: t → t − bias·t·(1 − t), where t is its place
 * across the box (0 left, 1 right) and bias goes from `start` at the top to `end` at the bottom. A positive
 * bias gathers towards the left/top, a negative one towards the right/bottom; 0 leaves it as it is. Straight
 * lines across the gathered axis stay straight (each point moves in proportion to its place along the other
 * one), so a grid of bars becomes a fan of bars whose spacing drifts — the basis of moiré-like weaves.
 * Strokes keep their width (the path is moved, the stroke is drawn after).
 */
export const gather = defineModifier({
  type: 'gather',
  label: 'Gather',
  kind: 'deformer',
  params: {
    axis: { type: 'enum', default: 'x', options: ['x', 'y'] as const, label: 'Axis', animatable: false },
    start: { type: 'number', default: 0.5, min: -0.99, max: 0.99, step: 0.01, label: 'Start', random: [-0.8, 0.8] },
    end: { type: 'number', default: -0.5, min: -0.99, max: 0.99, step: 0.01, label: 'End', random: [-0.8, 0.8] },
  },
  apply(geo, p, ctx) {
    if (p.start === 0 && p.end === 0) return geo;
    const b = ctx.bounds;
    const alongX = p.axis !== 'y';
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // t: place across the gathered axis; s: place along the other one (where bias goes from start to end).
      const t = alongX ? (x - b.x) / (b.width || 1) : (y - b.y) / (b.height || 1);
      const s = Math.max(0, Math.min(1, alongX ? (y - b.y) / (b.height || 1) : (x - b.x) / (b.width || 1)));
      const bias = p.start + (p.end - p.start) * s;
      const t2 = t - bias * t * (1 - t);
      return alongX ? [b.x + t2 * b.width, y] : [x, b.y + t2 * b.height];
    });
  },
});
