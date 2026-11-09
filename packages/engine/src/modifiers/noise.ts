import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';
import { noise2D } from '../random';

/** Desplaza cada punto con ruido suave: aspecto orgánico o de dibujo a mano. */
export const noise = defineModifier({
  type: 'noise',
  label: 'Noise',
  kind: 'deformer',
  params: {
    amount: { type: 'number', default: 0.03, min: 0, step: 0.005, unit: 'fraction' },
    scale: { type: 'number', default: 4, min: 0.1, step: 0.1, label: 'Frequency' },
    evolution: { type: 'number', default: 0, step: 0.01, group: 'Variation' },
    seed: { type: 'seed', default: 1, group: 'Variation' },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const size = Math.max(b.width, b.height);
    const A = p.amount * size;
    if (A === 0 || size === 0) return geo;
    const nx = noise2D(p.seed);
    const ny = noise2D(p.seed + 7919);
    const f = p.scale / size;
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const u = (x - b.x) * f + p.evolution;
      const v = (y - b.y) * f;
      return [x + nx(u, v) * A, y + ny(u, v + p.evolution) * A];
    });
  },
});
