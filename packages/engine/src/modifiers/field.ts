import { bounds } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';
import { applyWeighted, keyFor, smooth } from './weighted';

/**
 * Field: the nested effects act more or less on each element
 * depending on where its centre is relative to a shape (circle, plane or box). Moving the field sweeps the drawing.
 * Softness: how much of the edge is a transition (0, a hard cut; 1, all gradient).
 */
export const field = defineModifier({
  type: 'field',
  label: 'Field',
  kind: 'effector',
  params: {
    shape: { type: 'enum', default: 'circle', options: ['circle', 'linear', 'box'] as const, animatable: false },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Center' },
    radius: { type: 'number', default: 0.35, min: 0.01, max: 2, step: 0.01, unit: 'fraction', label: 'Radius', ramp: false },
    softness: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Softness', ramp: false },
    angle: { type: 'angle', default: 0, ramp: false, label: 'Angle' },
    invert: { type: 'boolean', default: false, label: 'Invert', animatable: false },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', ramp: false },
    unit: { type: 'enum', default: 'elements', options: ['elements', 'words', 'lines'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const size = Math.max(b.width, b.height) || 1;
    const c = fromFraction(b, p.center);
    const R = Math.max(1e-6, p.radius * size);
    const a = (p.angle * Math.PI) / 180;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    // Normalised distance (0 at the centre of the shape, 1 at its edge) → weight, with a softened edge.
    const falloff = (d: number) => {
      const inner = 1 - Math.max(0, Math.min(1, p.softness));
      if (d <= inner) return 1;
      if (d >= 1) return 0;
      return smooth(1 - (d - inner) / (1 - inner || 1));
    };
    return applyWeighted(
      geo,
      ctx,
      keyFor(geo, p.unit),
      (_k, _i, _n, part) => {
        const pb = bounds(part);
        const [x, y] = [pb.x + pb.width / 2 - c[0], pb.y + pb.height / 2 - c[1]];
        let d: number;
        if (p.shape === 'linear') {
          // Plane: full behind the line (in the direction of the angle) and fading over Radius.
          const s = x * ux + y * uy;
          d = s <= 0 ? 0 : s / R;
        } else if (p.shape === 'box') {
          const [lx, ly] = [x * ux + y * uy, -x * uy + y * ux];
          d = Math.max(Math.abs(lx), Math.abs(ly)) / R;
        } else d = Math.hypot(x, y) / R;
        const w = falloff(d);
        return p.invert ? 1 - w : w;
      },
      p.amount,
    );
  },
});
