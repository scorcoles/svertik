import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg } from '../modifier';

/**
 * Envuelve el dibujo alrededor de un cilindro vertical (la etiqueta de una lata).
 * `wrap` es la parte de la vuelta que ocupa el dibujo; lo de los lados se comprime y se acerca o aleja.
 */
export const cylinder = defineModifier({
  type: 'cylinder',
  label: 'Cylinder',
  kind: 'deformer',
  params: {
    wrap: { type: 'number', default: 0.5, min: 0.01, max: 1, step: 0.01 },
    rotation: { type: 'angle', default: 0, random: [-60, 60] },
    perspective: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, ramp: false },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const W = b.width || 1;
    const cx = b.x + W / 2;
    const cy = b.y + b.height / 2;
    // Radio tal que el ancho del dibujo ocupa `wrap` de la circunferencia.
    const R = W / (2 * Math.PI * Math.max(0.01, p.wrap));
    const rot = deg(p.rotation);
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const theta = (x - cx) / R + rot;
      const depth = Math.cos(theta); // 1 delante, −1 detrás
      const k = 1 + p.perspective * (depth - 1) * 0.5;
      return [cx + R * Math.sin(theta) * k, cy + (y - cy) * k];
    });
  },
});
