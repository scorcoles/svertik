import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';

/** Estrecha (o ensancha) un extremo: el ancho perpendicular cambia a lo largo del eje. */
export const taper = defineModifier({
  type: 'taper',
  label: 'Taper',
  kind: 'deformer',
  params: {
    amount: { type: 'number', default: 0.5, min: -1, max: 1, step: 0.01 },
    curve: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, random: [-0.5, 0.5] },
    axis: { type: 'enum', default: 'vertical', options: ['vertical', 'horizontal'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    if (p.amount === 0) return geo;
    const b = ctx.bounds;
    const vertical = p.axis !== 'horizontal';
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      // t ∈ [0, 1] a lo largo del eje; con amount > 0 se estrecha hacia el final.
      const t = vertical ? (y - b.y) / (b.height || 1) : (x - b.x) / (b.width || 1);
      const shaped = p.curve === 0 ? t : Math.pow(Math.max(0, t), Math.pow(2, -p.curve * 2));
      const f = Math.max(0, 1 - p.amount * shaped);
      return vertical ? [cx + (x - cx) * f, y] : [x, cy + (y - cy) * f];
    });
  },
});
