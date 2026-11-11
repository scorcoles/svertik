import { bounds, mapPoints, type Geometry } from '../geometry';
import { defineModifier } from '../modifier';
import { fitViewBox } from './clone';

/**
 * Reflects the drawing on an axis. `keep`: the original stays and its reflection is added (symmetry);
 * `transform`: the drawing becomes its reflection.
 * The axis is a vertical line (horizontal flip) or a horizontal one (vertical flip), at a fraction of the box.
 */
export const mirror = defineModifier({
  type: 'mirror',
  label: 'Mirror',
  kind: 'generator',
  reframe: true,
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
    // Each half, a different element (for Step and Color): the original on even numbers, the reflection on odd ones.
    const shapes = [
      ...(p.original !== 'transform' ? geo.shapes.map((s) => ({ ...s, clone: (s.clone ?? 0) * 2 })) : []),
      ...reflected.shapes.map((s) => ({ ...s, clone: (s.clone ?? 0) * 2 + 1 })),
    ];
    const out: Geometry = { viewBox: geo.viewBox, shapes };
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});
