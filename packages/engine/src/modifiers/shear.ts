import { mapPoints } from '../geometry';
import { defineModifier, deg } from '../modifier';

/** Slants: X shifts with the height and Y with the width, around the centre. */
export const shear = defineModifier({
  type: 'shear',
  label: 'Shear',
  kind: 'deformer',
  params: {
    x: { type: 'angle', default: 20, label: 'Shear X', random: [-45, 45] },
    y: { type: 'angle', default: 0, label: 'Shear Y', random: [-30, 30] },
  },
  apply(geo, p, ctx) {
    if (p.x === 0 && p.y === 0) return geo;
    const b = ctx.bounds;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const tx = Math.tan(deg(Math.max(-85, Math.min(85, p.x))));
    const ty = Math.tan(deg(Math.max(-85, Math.min(85, p.y))));
    return mapPoints(geo, ([x, y]) => [x + tx * (y - cy), y + ty * (x - cx)]);
  },
});
