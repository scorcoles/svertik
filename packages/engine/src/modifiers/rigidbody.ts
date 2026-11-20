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
    attractor: { type: 'boolean', default: false, label: 'Attractor', group: 'Attraction' },
    attractionStrength: { type: 'number', default: 1, min: 0, max: 10, step: 0.01, unit: 'fraction', label: 'Strength', group: 'Attraction' },
    attractionRange: { type: 'number', default: 0, min: 0, max: 10, step: 0.1, unit: 'fraction', label: 'Range', group: 'Attraction' },
    attractionAbsorption: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Absorption', group: 'Attraction' },
    attractionSleepThreshold: { type: 'number', default: 0.03, min: 0, max: 0.2, step: 0.005, unit: 'fraction', label: 'Settle', group: 'Attraction' },
  },
  apply(geo, p) {
    const impulse: Impulse = {
      velocity: p.velocity,
      spin: (p.spin * Math.PI) / 180,
      ...(p.immovable ? { immovable: true } : {}),
      ...(p.attractor ? { attractor: true, attractionStrength: p.attractionStrength, attractionRange: p.attractionRange, attractionAbsorption: p.attractionAbsorption, attractionSleepThreshold: p.attractionSleepThreshold } : {}),
    };
    return { ...geo, shapes: geo.shapes.map((shape) => ({ ...shape, impulse })) };
  },
});
