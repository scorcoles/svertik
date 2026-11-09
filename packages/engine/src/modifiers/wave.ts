import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg } from '../modifier';

/** Ondula el dibujo: desplaza cada punto en perpendicular a la dirección de la onda. */
export const wave = defineModifier({
  type: 'wave',
  label: 'Wave',
  kind: 'deformer',
  params: {
    amplitude: { type: 'number', default: 0.05, min: 0, max: 0.5, step: 0.005, unit: 'fraction' },
    wavelength: { type: 'number', default: 0.5, min: 0.01, max: 2, step: 0.01, unit: 'fraction' },
    phase: { type: 'angle', default: 0 },
    direction: { type: 'angle', default: 0 },
  },
  apply(geo, p, ctx) {
    const size = Math.max(ctx.bounds.width, ctx.bounds.height);
    const A = p.amplitude * size;
    const lambda = p.wavelength * size;
    if (A === 0 || lambda <= 0) return geo;
    const dir = deg(p.direction);
    const ux = Math.cos(dir);
    const uy = Math.sin(dir);
    const ph = deg(p.phase);
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const s = x * ux + y * uy;
      const off = A * Math.sin((2 * Math.PI * s) / lambda + ph);
      return [x - uy * off, y + ux * off];
    });
  },
});
