import { defineModifier } from '../modifier';
import { rng } from '../random';
import { applyWeighted, keyFor, smooth } from './weighted';

/** CSS-style An+B, one-based, with n >= 0. Invalid selectors deliberately select nothing. */
export function nthSelector(expression: string): ((index: number) => boolean) | null {
  if (typeof expression !== 'string') return null;
  const text = expression.toLowerCase().replace(/\s+/g, '');
  if (text === 'even') return (i) => i % 2 === 0;
  if (text === 'odd') return (i) => i % 2 === 1;
  if (/^[+-]?\d+$/.test(text)) {
    const value = Number(text);
    return Number.isSafeInteger(value) ? (i) => i === value : null;
  }
  const match = /^([+-]?\d*)n(?:([+-]\d+))?$/.exec(text);
  if (!match) return null;
  const a = match[1] === '' || match[1] === '+' ? 1 : match[1] === '-' ? -1 : Number(match[1]), b = Number(match[2] ?? 0);
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b)) return null;
  return (i) => a === 0 ? i === b : Number.isInteger((i - b) / a) && (i - b) / a >= 0;
}

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
    selector: { type: 'enum', default: 'all', options: ['all', 'even', 'odd', 'nth'] as const, label: 'Select', animatable: false },
    nth: { type: 'text', default: '2n', label: 'An+B', animatable: false, showIf: { selector: ['nth'] } },
    start: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Start', ramp: false },
    end: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'End', ramp: false },
    offset: { type: 'number', default: 0, min: -1, max: 1, step: 0.01, label: 'Offset', ramp: false },
    shape: { type: 'enum', label: 'Falloff', default: 'square', options: ['square', 'ramp up', 'ramp down', 'triangle', 'round', 'smooth'] as const, animatable: false },
    unit: { type: 'enum', default: 'elements', options: ['elements', 'words', 'lines', 'rows', 'columns'] as const, label: 'Unit', animatable: false },
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
    const selected = p.selector === 'all' ? () => true : nthSelector(p.selector === 'nth' ? p.nth : p.selector) ?? (() => false);
    const result = applyWeighted(
      geo,
      ctx,
      keyOf,
      (key, _i, n) => {
        // Grid indices remain tied to their original cells even when Fill leaves entire rows empty.
        const position = !p.random && (p.unit === 'rows' || p.unit === 'columns') ? key + 1 : order.get(key)! + 1;
        if (!selected(position)) return 0;
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
      [0, 1],
      ctx.id,
    );
    // A row/column selector must not change the grid's paint order just by grouping cells.
    if ((p.unit === 'rows' || p.unit === 'columns') && ctx.children.every((c) => c.def.kind !== 'generator')) {
      const order = new Map(geo.shapes.map((s, i) => [s.clone, i]));
      if (result.shapes.every((s) => order.has(s.clone))) result.shapes.sort((a, b) => order.get(a.clone)! - order.get(b.clone)!);
    }
    return result;
  },
});
