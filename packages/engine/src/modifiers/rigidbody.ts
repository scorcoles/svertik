import type { Impulse } from '../geometry';
import { defineModifier } from '../modifier';

/** Per-child body settings read by a Physics or Gravity container in an ancestor group. */
export const rigidbody = defineModifier({
  type: 'rigidbody',
  label: 'Rigid body',
  kind: 'deformer',
  params: {
    velocity: { type: 'point', default: [0, 0], unit: 'px', label: 'Velocity' },
    spin: { type: 'number', default: 0, step: 1, unit: '°/s', label: 'Spin' },
    immovable: { type: 'boolean', default: false, label: 'Immovable' },
  },
  apply(geo, p) {
    const impulse: Impulse = { velocity: p.velocity, spin: (p.spin * Math.PI) / 180, ...(p.immovable ? { immovable: true } : {}) };
    return { ...geo, shapes: geo.shapes.map((shape) => ({ ...shape, impulse })) };
  },
});
