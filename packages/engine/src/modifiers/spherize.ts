import { mapPoints, subdivide } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';

/**
 * Abomba (fuerza > 0) o encoge (fuerza < 0) lo que cae dentro de un círculo.
 * El borde del círculo no se mueve, así que no hay saltos con lo de fuera.
 */
export const spherize = defineModifier({
  type: 'spherize',
  label: 'Spherize',
  kind: 'deformer',
  params: {
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Falloff' },
    radius: { type: 'number', default: 0.5, min: 0, max: 2, step: 0.01, unit: 'fraction', group: 'Falloff', ramp: false },
    strength: { type: 'number', default: 0.5, min: -1, max: 1, step: 0.01 },
  },
  apply(geo, p, ctx) {
    const [cx, cy] = fromFraction(ctx.bounds, p.center);
    const R = p.radius * Math.max(ctx.bounds.width, ctx.bounds.height);
    if (R <= 0 || p.strength === 0) return geo;
    const k = Math.min(1, Math.abs(p.strength));
    // Perfil radial: d ∈ [0, 1] → d' ∈ [0, 1], monótono y con f(1) = 1.
    const profile =
      p.strength > 0
        ? (d: number) => d + (Math.sin((d * Math.PI) / 2) - d) * k
        : (d: number) => d + (1 - Math.cos((d * Math.PI) / 2) - d) * k;
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r === 0 || r >= R) return [x, y];
      const f = (profile(r / R) * R) / r;
      return [cx + dx * f, cy + dy * f];
    });
  },
});
