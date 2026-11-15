import { signalSchemas } from './signal-schemas';
import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { shakeSignal } from './time-signal';

export const shake = defineModifier({
  type: 'shake', label: 'Shake', kind: 'effector',
  params: signalSchemas.shake,
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (key, index) => p.amplitude * shakeSignal(p.time - p.start - index * p.elementDelay, p.duration, p.frequency, p.decay, p.seed, p.perElement ? key : 0),
      1, [-Infinity, Infinity]);
  },
});
