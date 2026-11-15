import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { signalParams, shakeSignal } from './time-signal';

export const shake = defineModifier({
  type: 'shake', label: 'Shake', kind: 'effector',
  params: {
    time: signalParams.time,
    start: { type: 'number', default: 0, step: 0.01, unit: 's', label: 'Start', ramp: false },
    duration: { type: 'number', default: 1, min: 0.01, max: 10, step: 0.01, unit: 's', label: 'Duration', ramp: false },
    frequency: { ...signalParams.frequency, default: 8 },
    amplitude: signalParams.amplitude,
    decay: { type: 'number', default: 2, min: 0.1, max: 8, step: 0.1, label: 'Decay', ramp: false },
    perElement: { ...signalParams.perElement, default: false },
    elementDelay: { type: 'number', default: 0.04, min: 0, max: 1, step: 0.01, unit: 's', label: 'Element delay', ramp: false, showIf: { perElement: ['true'] } },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (key, index) => p.amplitude * shakeSignal(p.time - p.start - index * p.elementDelay, p.duration, p.frequency, p.decay, p.seed, p.perElement ? key : 0),
      1, [-Infinity, Infinity]);
  },
});
