import { signalSchemas } from './signal-schemas';
import { defineModifier } from '../modifier';
import { applyWeighted, keyFor } from './weighted';
import { waveform } from './time-signal';

/** Periodic modulation of nested effects, from their neutral values to the configured amplitudes. */
export const oscillate = defineModifier({
  type: 'oscillate', label: 'Oscillate', kind: 'effector',
  params: signalSchemas.oscillate,
  apply(geo, p, ctx) {
    return applyWeighted(geo, ctx, p.perElement ? keyFor(geo, 'elements') : () => 0,
      (_key, index) => p.offset + p.amplitude * waveform(p.time * p.frequency + (p.phase + index * p.elementPhase) / 360, p.wave),
      1, [-Infinity, Infinity]);
  },
});
