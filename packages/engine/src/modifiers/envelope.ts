import { mapPoints, subdivide, type Vec2 } from '../geometry';
import { defineModifier, fromFraction, type ParamSpec } from '../modifier';

// A 3×3 mesh of control points (a quadratic Bézier surface). By default, the box itself: no change.
const NAMES = ['p00', 'p10', 'p20', 'p01', 'p11', 'p21', 'p02', 'p12', 'p22'] as const;
const LABELS = ['Top left', 'Top', 'Top right', 'Left', 'Middle', 'Right', 'Bottom left', 'Bottom', 'Bottom right'];

const params = Object.fromEntries(
  NAMES.map((n, i) => {
    const gx = (i % 3) / 2;
    const gy = Math.floor(i / 3) / 2;
    const spec: ParamSpec = { type: 'point', default: [gx, gy], unit: 'fraction', label: LABELS[i], group: 'Mesh', random: [-0.25, 0.25], randomRelative: true };
    return [n, spec];
  }),
) as Record<(typeof NAMES)[number], ParamSpec & { type: 'point'; default: [number, number] }>;

const bern = (t: number): [number, number, number] => [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];

/** Envelope: drag the nine points of the mesh and the drawing bends with it. */
export const envelope = defineModifier({
  type: 'envelope',
  label: 'Envelope',
  kind: 'deformer',
  params,
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    if (b.width === 0 || b.height === 0) return geo;
    const P: Vec2[] = NAMES.map((n) => fromFraction(b, p[n]));
    return mapPoints(subdivide(geo, ctx.resolution), ([x, y]) => {
      const bu = bern((x - b.x) / b.width);
      const bv = bern((y - b.y) / b.height);
      let X = 0;
      let Y = 0;
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const w = bu[i]! * bv[j]!;
          const q = P[j * 3 + i]!;
          X += w * q[0];
          Y += w * q[1];
        }
      }
      return [X, Y];
    });
  },
});
