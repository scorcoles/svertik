import type { Impulse } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';

/** Per-child body settings read by a Physics or Gravity container in an ancestor group. */
export const rigidbody = defineModifier({
  type: 'rigidbody',
  label: 'Rigid Body',
  kind: 'deformer',
  params: {
    velocity: { type: 'point', default: [0, 0], unit: 'px', label: 'Velocity' },
    spin: { type: 'number', default: 0, step: 1, unit: '°/s', label: 'Spin' },
    immovable: { type: 'boolean', default: false, label: 'Immovable' },
    pin: { type: 'boolean', default: false, label: 'Pin', group: 'Pin', animatable: false, showIf: { immovable: ['false'] } },
    pinPoint: { type: 'point', default: [0, 0.5], unit: 'fraction', label: 'Point', group: 'Pin', showIf: { immovable: ['false'], pin: ['true'] } },
    centerOfMassMode: { type: 'enum', default: 'auto', options: ['auto', 'custom'] as const, label: 'Mass center', group: 'Mass' },
    centerOfMass: { type: 'point', default: [0.5, 0.5], unit: 'fraction', label: 'Position', group: 'Mass', showIf: { centerOfMassMode: ['custom'] } },
    attractor: { type: 'boolean', default: false, label: 'Attractor', group: 'Attraction' },
    attractionStrength: { type: 'number', default: 1, min: 0, max: 10, step: 0.01, unit: 'fraction', label: 'Strength', group: 'Attraction' },
    attractionRange: { type: 'number', default: 0, min: 0, max: 10, step: 0.1, unit: 'fraction', label: 'Range', group: 'Attraction' },
    attractionAbsorption: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Absorption', group: 'Attraction' },
    attractionSleepThreshold: { type: 'number', default: 0.03, min: 0, max: 0.2, step: 0.005, unit: 'fraction', label: 'Settle', group: 'Attraction' },
  },
  apply(geo, p, ctx) {
    const impulse: Impulse = {
      velocity: p.velocity,
      spin: (p.spin * Math.PI) / 180,
      ...(p.centerOfMassMode === 'custom' ? { centerOfMass: p.centerOfMass } : {}),
      ...(p.immovable ? { immovable: true } : {}),
      // The pin as a point of the drawing (Point: fractions of its box; Bones' Start by default), so it is
      // carried with it as it is placed.
      ...(p.pin && !p.immovable ? { pin: fromFraction(ctx.bounds, p.pinPoint) } : {}),
      ...(p.attractor ? { attractor: true, attractionStrength: p.attractionStrength, attractionRange: p.attractionRange, attractionAbsorption: p.attractionAbsorption, attractionSleepThreshold: p.attractionSleepThreshold } : {}),
    };
    return { ...geo, shapes: geo.shapes.map((shape) => ({ ...shape, impulse })) };
  },
});
