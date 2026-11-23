import { mapPoints } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';
import { IDENTITY, multiply, type Mat } from '../matrix';

/** Move, rotate and scale the whole drawing. Offsets in SVG units. */
export const transform = defineModifier({
  type: 'transform',
  label: 'Transform',
  kind: 'deformer',
  params: {
    x: { type: 'number', default: 0, step: 1, unit: 'px' },
    y: { type: 'number', default: 0, step: 1, unit: 'px' },
    rotation: { type: 'angle', default: 0 },
    scale: { type: 'number', default: 1, min: 0, step: 0.01, neutral: 1 },
    pivot: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Pivot' },
  },
  apply(geo, p, ctx) {
    const [px, py] = fromFraction(ctx.bounds, p.pivot);
    const c = Math.cos(deg(p.rotation)) * p.scale;
    const s = Math.sin(deg(p.rotation)) * p.scale;
    const matrix: Mat = [c, s, -s, c, px - px * c + py * s + p.x, py - px * s - py * c + p.y];
    const moved = mapPoints(geo, ([x, y]) => {
      const dx = x - px;
      const dy = y - py;
      return [px + dx * c - dy * s + p.x, py + dx * s + dy * c + p.y];
    });
    moved.shapes = moved.shapes.map((shape) => {
      const patternTransform = multiply(matrix, shape.patternTransform ?? IDENTITY);
      if (!shape.impulse) return { ...shape, patternTransform };
      const [x, y] = shape.impulse.velocity;
      return { ...shape, patternTransform, impulse: { ...shape.impulse, velocity: [x * c - y * s, x * s + y * c] } };
    });
    return moved;
  },
});
