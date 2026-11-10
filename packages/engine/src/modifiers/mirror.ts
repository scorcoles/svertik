import { bounds, mapPoints, type Geometry } from '../geometry';
import { defineModifier } from '../modifier';
import { fitViewBox } from './clone';

/**
 * Refleja el dibujo en un eje. `keep`: se conserva el original y se añade su reflejo (simetría, como Symmetry de C4D);
 * `transform`: el dibujo pasa a ser su reflejo.
 * El eje es una línea vertical (reflejo horizontal) u horizontal (vertical), a una fracción de la caja.
 */
export const mirror = defineModifier({
  type: 'mirror',
  label: 'Mirror',
  kind: 'generator',
  params: {
    axis: { type: 'enum', default: 'horizontal', options: ['horizontal', 'vertical'] as const, animatable: false },
    position: { type: 'number', default: 1, min: -1, max: 2, step: 0.01, unit: 'fraction', label: 'Axis at' },
    original: { type: 'enum', default: 'keep', options: ['keep', 'transform'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const horizontal = p.axis !== 'vertical';
    const line = horizontal ? b.x + p.position * b.width : b.y + p.position * b.height;
    const reflected = mapPoints(geo, ([x, y]) => (horizontal ? [2 * line - x, y] : [x, 2 * line - y]));
    // Cada mitad, un elemento distinto (para Step y Color): el original en pares, el reflejo en impares.
    const shapes = [
      ...(p.original !== 'transform' ? geo.shapes.map((s) => ({ ...s, clone: (s.clone ?? 0) * 2 })) : []),
      ...reflected.shapes.map((s) => ({ ...s, clone: (s.clone ?? 0) * 2 + 1 })),
    ];
    const out: Geometry = { viewBox: geo.viewBox, shapes };
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});
