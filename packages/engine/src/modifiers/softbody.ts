import type { SoftMaterial } from '../geometry';
import { defineModifier } from '../modifier';

/** Material only: the following Gravity, or an ancestor Physics group, owns the simulation. */
export const softbody = defineModifier({
  type: 'softbody', label: 'Soft Body', kind: 'deformer',
  params: {
    mode: { type: 'enum', default: 'auto', options: ['auto', 'fibers', 'bodies'] as const, label: 'Apply to', animatable: false },
    stiffness: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Stiffness', ramp: false },
    bending: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Bending', ramp: false },
    volume: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.01, label: 'Keep area', ramp: false },
    damping: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01, label: 'Damping', ramp: false },
    pins: { type: 'enum', default: 'free', options: ['free', 'start', 'ends'] as const, label: 'Pin fibers', animatable: false },
    segments: { type: 'number', default: 24, min: 4, max: 64, step: 1, label: 'Resolution', animatable: false, ramp: false },
  },
  apply(geo, p) {
    const material: SoftMaterial = { ...p };
    return { ...geo, shapes: geo.shapes.map((shape) => ({ ...shape, softBody: material })) };
  },
});
