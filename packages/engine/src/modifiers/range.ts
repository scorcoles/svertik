import { defineModifier } from '../modifier';
import { rng } from '../random';
import { applyWeighted, keyFor, smooth } from './weighted';

/**
 * Range selector: picks which elements (letters, words,
 * lines, copies, tiles, pieces…) get the nested effects and how much, by their order.
 * Start and End mark the range (0–1 of the total) and Offset moves it: animate Offset to sweep the text.
 * The shape says how the weight is spread within the range.
 */
export const range = defineModifier({
  type: 'range',
  label: 'Range',
  kind: 'effector',
  params: {
    start: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Start', ramp: false },
    end: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'End', ramp: false },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Offset', ramp: false },
    shape: { type: 'enum', default: 'square', options: ['square', 'ramp up', 'ramp down', 'triangle', 'round', 'smooth'] as const, animatable: false },
    unit: { type: 'enum', default: 'elements', options: ['elements', 'words', 'lines'] as const, animatable: false },
    amount: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Amount', ramp: false },
    random: { type: 'boolean', default: false, label: 'Random order', animatable: false },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const keyOf = keyFor(geo, p.unit);
    // Order (optionally shuffled, with a seed).
    const keys = [...new Set(geo.shapes.map(keyOf))].filter((k) => k >= 0).sort((a, b) => a - b);
    const order = new Map(keys.map((k, i) => [k, i]));
    if (p.random) {
      const rand = rng(p.seed);
      const shuffled = [...keys];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      shuffled.forEach((k, i) => order.set(k, i));
    }
    const s0 = Math.min(p.start, p.end) + p.offset, s1 = Math.max(p.start, p.end) + p.offset;
    return applyWeighted(
      geo,
      ctx,
      keyOf,
      (key, _i, n) => {
        // Each element takes its band [i/n, (i+1)/n]; its centre counts.
        const u = (order.get(key)! + 0.5) / n;
        if (u < s0 || u > s1 || s1 <= s0) return 0;
        const t = (u - s0) / (s1 - s0);
        switch (p.shape) {
          case 'ramp up': return t;
          case 'ramp down': return 1 - t;
          case 'triangle': return 1 - Math.abs(2 * t - 1);
          case 'round': return Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2));
          case 'smooth': return smooth(1 - Math.abs(2 * t - 1));
          default: return 1;
        }
      },
      p.amount,
    );
  },
});
