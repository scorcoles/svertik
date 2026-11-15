import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { signalParams, pulseSignal } from './time-signal';

export const pulse = defineModifier({
  type: 'pulse', label: 'Pulse', kind: 'effector',
  params: {
    ...signalParams,
    attack: { type: 'number', default: 0.1, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Attack / cycle', ramp: false },
    decay: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Decay / cycle', ramp: false },
  },
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (_key, index) => p.offset + p.amplitude * pulseSignal(p.time * p.frequency + (p.phase + index * p.elementPhase) / 360, p.attack, p.decay),
      1, [-Infinity, Infinity]);
  },
});
