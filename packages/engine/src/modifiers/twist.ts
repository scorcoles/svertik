import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/** Remolino: gira más cuanto más cerca del centro; en el borde del radio, nada. */
export const twist = defineModifier({
  type: 'twist',
  label: 'Twist',
  kind: 'deformer',
  params: {
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Falloff' },
    radius: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01, unit: 'fraction', group: 'Falloff' },
    angle: { type: 'angle', default: 90 },
  },
  apply(geo, p, ctx) {
    const [cx, cy] = fromFraction(ctx.bounds, p.center);
    const R = p.radius * Math.max(ctx.bounds.width, ctx.bounds.height);
    if (R <= 0 || p.angle === 0) return geo;
    const a = deg(p.angle);
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      if (r >= R) return [x, y];
      const t = 1 - r / R;
      const th = a * t * t * (3 - 2 * t); // suavizado en el borde
      const c = Math.cos(th);
      const s = Math.sin(th);
      return [cx + dx * c - dy * s, cy + dx * s + dy * c];
    });
  },
});
