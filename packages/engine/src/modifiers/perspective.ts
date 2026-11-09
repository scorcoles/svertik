import { mapPoints, subdivide, type Vec2 } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';

/** Homografía del cuadrado unidad al cuadrilátero (a, b, c, d) = esquinas TL, TR, BR, BL. */
function squareToQuad([a, b, c, d]: Vec2[]): (u: number, v: number) => Vec2 {
  const [x0, y0] = a!, [x1, y1] = b!, [x2, y2] = c!, [x3, y3] = d!;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, h = 0;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) > 1e-12) {
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
  }
  const A = x1 - x0 + g * x1, B = x3 - x0 + h * x3, C = x0;
  const D = y1 - y0 + g * y1, E = y3 - y0 + h * y3, F = y0;
  return (u, v) => {
    const w = g * u + h * v + 1;
    return [(A * u + B * v + C) / w, (D * u + E * v + F) / w];
  };
}

/** Perspectiva libre: cada esquina del dibujo va donde arrastres su tirador. */
export const perspective = defineModifier({
  type: 'perspective',
  label: 'Perspective',
  kind: 'deformer',
  params: {
    topLeft: { type: 'point', default: [0.1, 0], unit: 'fraction', label: 'Top left', random: [-0.2, 0.3] },
    topRight: { type: 'point', default: [0.9, 0], unit: 'fraction', label: 'Top right', random: [0.7, 1.2] },
    bottomRight: { type: 'point', default: [1, 1], unit: 'fraction', label: 'Bottom right', random: [0.7, 1.2] },
    bottomLeft: { type: 'point', default: [0, 1], unit: 'fraction', label: 'Bottom left', random: [-0.2, 0.3] },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    if (b.width === 0 || b.height === 0) return geo;
    const map = squareToQuad([p.topLeft, p.topRight, p.bottomRight, p.bottomLeft].map((q) => fromFraction(b, q)));
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => map((x - b.x) / b.width, (y - b.y) / b.height));
  },
});
