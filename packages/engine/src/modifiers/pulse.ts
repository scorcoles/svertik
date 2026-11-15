import { signalSchemas } from './signal-schemas';
import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { pulseSignal } from './time-signal';

export const pulse = defineModifier({
  type: 'pulse', label: 'Pulse', kind: 'effector',
  params: signalSchemas.pulse,
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (_key, index) => p.offset + p.amplitude * pulseSignal(p.time * p.frequency + (p.phase + index * p.elementPhase) / 360, p.attack, p.decay),
      1, [-Infinity, Infinity]);
  },
});
