import { mapPoints, subdivide } from '../geometry';
import { defineModifier } from '../modifier';
import { pointAt, polylines } from '../paths';

/**
 * Enrolla el dibujo a lo largo del trazado de otro objeto.
 * El eje del dibujo (horizontal o vertical) sigue el trazado; lo perpendicular se aparta de él.
 * `stretch`: el dibujo ocupa todo el trazado; `keep`: conserva su longitud y empieza en `offset`.
 */
export const pathwrap = defineModifier({
  type: 'pathwrap',
  label: 'Path Wrap',
  kind: 'deformer',
  params: {
    target: { type: 'node', default: '', label: 'Path' },
    axis: { type: 'enum', default: 'horizontal', options: ['horizontal', 'vertical'] as const, animatable: false },
    fit: { type: 'enum', default: 'stretch', options: ['stretch', 'keep'] as const, animatable: false },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, unit: 'fraction' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    if (!target) return geo;
    // El trazado más largo del objeto.
    const line = polylines(target).sort((a, b) => b.length - a.length)[0];
    if (!line) return geo;
    const b = ctx.bounds;
    const horizontal = p.axis !== 'vertical';
    const along = horizontal ? b.width : b.height;
    if (along <= 0) return geo;
    const L = line.length;
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    // Lo bastante fino para que siga las curvas del trazado.
    const res = Math.min(ctx.resolution, (L / 200) * (along / L || 1));
    return mapPoints(subdivide(geo, Math.max(res, 1e-3)), ([x, y]) => {
      const u = (horizontal ? x - b.x : y - b.y) / along;
      const v = horizontal ? y - cy : cx - x;
      const s = p.fit === 'keep' ? p.offset * L + u * along : (p.offset + u) * L;
      const { p: q, t } = pointAt(line, s);
      // Normal: la tangente girada 90° (hacia abajo si el trazado va a la derecha).
      return [q[0] - t[1] * v, q[1] + t[0] * v];
    });
  },
});

