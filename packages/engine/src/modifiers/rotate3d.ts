import { mapPoints, subdivide } from '../geometry';
import { defineModifier, deg, fromFraction } from '../modifier';

/**
 * Rotates the drawing in 3D (X, Y, Z) around a pivot and projects it with perspective.
 * Tilting on X or Y gives the "tilt"; Z is a flat spin.
 */
export const rotate3d = defineModifier({
  type: 'rotate3d',
  label: 'Rotate 3D',
  kind: 'deformer',
  params: {
    rotateX: { type: 'angle', default: 30, label: 'Tilt X' },
    rotateY: { type: 'angle', default: 0, label: 'Tilt Y' },
    rotateZ: { type: 'angle', default: 0, label: 'Spin Z' },
    perspective: { type: 'number', default: 2, min: 0.5, max: 10, step: 0.1, unit: 'fraction', group: 'Camera', ramp: false },
    pivot: { type: 'point', default: [0.5, 0.5], unit: 'fraction', group: 'Camera' },
  },
  apply(geo, p, ctx) {
    if (p.rotateX === 0 && p.rotateY === 0 && p.rotateZ === 0) return geo;
    const [px, py] = fromFraction(ctx.bounds, p.pivot);
    const d = p.perspective * Math.max(ctx.bounds.width, ctx.bounds.height);
    const [sx, cx] = [Math.sin(deg(p.rotateX)), Math.cos(deg(p.rotateX))];
    const [sy, cy] = [Math.sin(deg(p.rotateY)), Math.cos(deg(p.rotateY))];
    const [sz, cz] = [Math.sin(deg(p.rotateZ)), Math.cos(deg(p.rotateZ))];
    return mapPoints(subdivide(geo, ctx.resolution), ([x0, y0]) => {
      let x = x0 - px;
      let y = y0 - py;
      let z = 0;
      // Z, luego X, luego Y.
      [x, y] = [x * cz - y * sz, x * sz + y * cz];
      [y, z] = [y * cx - z * sx, y * sx + z * cx];
      [x, z] = [x * cy + z * sy, -x * sy + z * cy];
      // Perspective: the camera is at distance d, looking at the plane z = 0. z > 0 comes closer.
      const f = d / Math.max(d - z, d * 0.05);
      return [px + x * f, py + y * f];
    });
  },
});
