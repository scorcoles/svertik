import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg } from '../modifier';

/**
 * Curves the drawing like a sheet: the chosen axis becomes an arc of `angle` degrees.
 * Positive angle: the ends go down (∩); negative: they go up (∪).
 */
export const bend = defineModifier({
  type: 'bend',
  label: 'Bend',
  kind: 'deformer',
  params: {
    angle: { type: 'angle', default: 90 },
    axis: { type: 'enum', default: 'horizontal', options: ['horizontal', 'vertical'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    const theta = deg(p.angle);
    if (Math.abs(theta) < 1e-6) return geo;
    const b = ctx.bounds;
    const horizontal = p.axis !== 'vertical';
    const L = horizontal ? b.width : b.height;
    const R = L / theta;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // u: along the axis; v: across it.
      const u = horizontal ? x - cx : y - cy;
      const v = horizontal ? y - cy : cx - x;
      const phi = u / R;
      const r = R - v;
      const nu = r * Math.sin(phi);
      const nv = R - r * Math.cos(phi);
      return horizontal ? [cx + nu, cy + nv] : [cx - nv, cy + nu];
    });
  },
});
