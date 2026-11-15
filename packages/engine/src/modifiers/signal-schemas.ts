import type { ParamSchema } from '../modifier';
import { signalParams } from './time-signal';

/** Shared schemas for geometry effectors and composition clock signals. */
export const signalSchemas = {
  oscillate: {
    wave: { type: 'enum', default: 'sine', options: ['sine', 'triangle', 'square', 'saw'] as const, label: 'Wave', animatable: false },
    ...signalParams,
  },
  wiggle: { ...signalParams, seed: { type: 'seed', default: 1 } },
  pulse: {
    ...signalParams,
    attack: { type: 'number', default: 0.1, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Attack / cycle', ramp: false },
    decay: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01, unit: 'fraction', label: 'Decay / cycle', ramp: false },
  },
  shake: {
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
} satisfies Record<string, ParamSchema>;
