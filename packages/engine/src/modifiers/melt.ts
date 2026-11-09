import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';
import { noise2D } from '../random';

/** Derretir: el dibujo gotea hacia abajo, más cuanto más abajo está; el ruido decide dónde caen las gotas. */
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
      // Gotas: ruido a lo ancho, afilado para que haya regueros y huecos.
      const r = Math.pow((n(((x - b.x) / (b.width || 1)) * p.drips, 0.5) + 1) / 2, p.sharpness);
      return [x, y + drop * r * t * t];
    });
  },
});
