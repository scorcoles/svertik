import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';
import { noise2D } from '../random';

/** Melt: the drawing drips downwards, more the lower it is; noise decides where the drops fall. */
export const melt = defineModifier({
  type: 'melt',
  label: 'Melt',
  kind: 'deformer',
  params: {
    amount: { type: 'number', default: 0.25, min: 0, max: 1, step: 0.01, unit: 'fraction' },
    drips: { type: 'number', default: 6, min: 1, max: 30, step: 1, ramp: false, label: 'Drips' },
    sharpness: { type: 'number', default: 2, min: 0.5, max: 6, step: 0.1, ramp: false },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    if (p.amount === 0 || b.height === 0) return geo;
    const n = noise2D(p.seed);
    const drop = p.amount * b.height;
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const t = Math.max(0, (y - b.y) / b.height);
      // Drops: noise across the width, sharpened so there are trickles and gaps.
      const r = Math.pow((n(((x - b.x) / (b.width || 1)) * p.drips, 0.5) + 1) / 2, p.sharpness);
      return [x, y + drop * r * t * t];
    });
  },
});
