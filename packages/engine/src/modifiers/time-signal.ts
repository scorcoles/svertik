import type { ParamSchema } from '../modifier';
import { rng } from '../random';

/** Shared clock and signal controls. Time may be a scene.time expression or an explicit local clock. */
export const signalParams = {
  time: { type: 'number', default: 0, step: 0.01, unit: 's', label: 'Time', ramp: false },
  frequency: { type: 'number', default: 1, min: 0, max: 20, step: 0.05, unit: 'Hz', label: 'Frequency', ramp: false },
  amplitude: { type: 'number', default: 1, min: 0, max: 2, step: 0.01, label: 'Amplitude', ramp: false },
  offset: { type: 'number', default: 0, min: -2, max: 2, step: 0.01, label: 'Offset', ramp: false },
  phase: { type: 'angle', default: 0, label: 'Phase', ramp: false },
  perElement: { type: 'boolean', default: true, label: 'Per element', animatable: false },
  elementPhase: { type: 'angle', default: 20, label: 'Element phase', ramp: false, showIf: { perElement: ['true'] } },
} satisfies ParamSchema;

/** One cycle, bipolar. Floor-based wrapping also supports a reversed/negative clock. */
export function waveform(cycles: number, wave: string): number {
  const t = cycles - Math.floor(cycles);
  switch (wave) {
    case 'triangle': return 1 - 4 * Math.abs(t - 0.5);
    case 'square': return t < 0.5 ? 1 : -1;
    case 'saw': return 2 * t - 1;
    default: return Math.sin(2 * Math.PI * t);
  }
}

/** Smooth bounded value noise; no frame history, no accumulated random state. */
export function wiggleSignal(cycles: number, seed: number, element: number): number {
  const i = Math.floor(cycles), f = cycles - i;
  const value = (at: number) => rng(Math.imul(at, 374761393) ^ Math.imul(element, 668265263) ^ seed)() * 2 - 1;
  const a = value(i), b = value(i + 1);
  const smooth = f * f * f * (f * (f * 6 - 15) + 10);
  return a + (b - a) * smooth;
}

/** Attack and decay are fractions of a cycle; long envelopes fit within one period. */
export function pulseSignal(cycles: number, attack: number, decay: number): number {
  const a = Math.max(0, attack), d = Math.max(0, decay), total = Math.max(1, a + d);
  const up = a / total, down = d / total, t = cycles - Math.floor(cycles);
  const smooth = (v: number) => v * v * (3 - 2 * v);
  if (up > 0 && t < up) return smooth(t / up);
  if (down > 0 && t < up + down) return 1 - smooth((t - up) / down);
  return 0;
}

/** A one-shot impact with an exact end, independent of evaluation order. */
export function shakeSignal(time: number, duration: number, frequency: number, decay: number, seed: number, element: number): number {
  if (time < 0 || duration <= 0 || time >= duration) return 0;
  return wiggleSignal(time * Math.max(0, frequency), seed, element) * Math.pow(1 - time / duration, Math.max(0.01, decay));
}
