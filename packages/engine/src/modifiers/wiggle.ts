import { signalSchemas } from './signal-schemas';
import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { wiggleSignal } from './time-signal';

/** Deterministic smooth random modulation; independent signals per element when enabled. */
export const wiggle = defineModifier({
  type: 'wiggle', label: 'Wiggle', kind: 'effector',
  params: signalSchemas.wiggle,
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (key, index) => p.offset + p.amplitude * wiggleSignal(p.time * p.frequency + (p.phase + index * p.elementPhase) / 360, p.seed, p.perElement ? key : 0),
      1, [-Infinity, Infinity]);
  },
});
