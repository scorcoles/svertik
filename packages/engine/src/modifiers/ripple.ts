import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/** Ondas concéntricas desde un punto, como una gota en el agua; se apagan con la distancia. */
export const ripple = defineModifier({
  type: 'ripple',
  label: 'Ripple',
  kind: 'deformer',
  params: {
    amplitude: { type: 'number', default: 0.03, min: 0, max: 0.2, step: 0.005, unit: 'fraction' },
    wavelength: { type: 'number', default: 0.15, min: 0.02, max: 1, step: 0.01, unit: 'fraction', ramp: false },
    phase: { type: 'angle', default: 0 },
    decay: { type: 'number', default: 1, min: 0, max: 5, step: 0.1, ramp: false },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction' },
  },
  apply(geo, p, ctx) {
    const size = Math.max(ctx.bounds.width, ctx.bounds.height);
    const A = p.amplitude * size;
    const L = p.wavelength * size;
    if (A === 0 || L <= 0) return geo;
    const [cx, cy] = fromFraction(ctx.bounds, p.center);
    const ph = deg(p.phase);
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r === 0) return [x, y];
      const off = A * Math.sin((2 * Math.PI * r) / L - ph) * Math.exp((-p.decay * r) / size);
      return [x + (dx / r) * off, y + (dy / r) * off];
    });
  },
});
