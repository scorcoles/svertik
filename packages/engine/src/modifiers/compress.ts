import { mapDeformer } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Compress: crowds the drawing towards a center line along one axis, or spreads it away from it, while both
 * ends of the box stay where they are. With axis x every point keeps its height; its x is remapped on each side
 * of the center: u → u^p (crowd) or u → 1 − (1 − u)^p (spread), where u is the distance from the center as a
 * fraction of that side and p = 1 + 5·|strength|. The map is monotonic, so order is kept: a row of evenly spaced
 * marks becomes one whose spacing shrinks towards the center until, with Rigid Pieces before it, the marks pile
 * into a solid bar. The center goes from `start` at one edge (top for axis x, left for axis y) to `end` at the
 * other, so one grid can carry a diagonal sweep row by row.
 */
export const compress = defineModifier({
  type: 'compress',
  label: 'Compress',
  kind: 'deformer',
  params: {
    axis: { type: 'enum', default: 'x', options: ['x', 'y'] as const, label: 'Axis', animatable: false },
    start: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Start', random: [0.1, 0.9] },
    end: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'End', random: [0.1, 0.9] },
    strength: { type: 'number', default: 0.7, min: -1, max: 1, step: 0.01, random: [-0.6, 1] },
  },
  apply(geo, p, ctx) {
    if (p.strength === 0) return geo;
    const b = ctx.bounds;
    const alongX = p.axis !== 'y';
    const size = alongX ? b.width : b.height;
    if (!(size > 0)) return geo;
    const k = 1 + 5 * Math.min(1, Math.abs(p.strength));
    const profile = p.strength > 0 ? (u: number) => u ** k : (u: number) => 1 - (1 - u) ** k;
    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    return mapDeformer(geo, ([x, y]) => {
      // t: place across the compressed axis; s: place along the other one (where the center goes from start to end).
      const t = alongX ? (x - b.x) / size : (y - b.y) / size;
      if (t <= 0 || t >= 1) return [x, y];
      const s = clamp01(alongX ? (y - b.y) / (b.height || 1) : (x - b.x) / (b.width || 1));
      const c = clamp01(p.start + (p.end - p.start) * s);
      let t2: number;
      if (t >= c) {
        const side = 1 - c;
        t2 = side > 0 ? c + profile((t - c) / side) * side : t;
      } else {
        t2 = c > 0 ? c - profile((c - t) / c) * c : t;
      }
      return alongX ? [b.x + t2 * size, y] : [x, b.y + t2 * size];
    }, ctx.resolution);
  },
});
