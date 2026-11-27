// Ease names (power1–4, sine, circ, expo, back, elastic, bounce with .in / .out / .inOut) → the engine's
// `Ease`. Exact where the engine has the curve (power2 is its cubic; expo, back, elastic and bounce in and
// out), Bézier approximations elsewhere (easings.net), a warning where a single Bézier can't draw it.
import type { Ease } from '@svertik/engine';

export type Bezier = [number, number, number, number];
type Dir = 'in' | 'out' | 'inOut';

/** An ease as svertikJS takes it: a name like `power2.out`, one of the engine's, or Bézier control points. */
export type EaseInput = string | Bezier;

const ENGINE = new Set(['linear', 'ease-in', 'ease-out', 'ease-in-out', 'expo-in', 'expo-out', 'back-in', 'back-out', 'elastic-in', 'elastic-out', 'bounce-in', 'bounce-out', 'hold']);

const BEZIER: Record<string, Partial<Record<Dir, Bezier>>> = {
  power1: { in: [0.11, 0, 0.5, 0], out: [0.5, 1, 0.89, 1], inOut: [0.45, 0, 0.55, 1] },
  power3: { in: [0.5, 0, 0.75, 0], out: [0.25, 1, 0.5, 1], inOut: [0.76, 0, 0.24, 1] },
  power4: { in: [0.64, 0, 0.78, 0], out: [0.22, 1, 0.36, 1], inOut: [0.83, 0, 0.17, 1] },
  sine: { in: [0.12, 0, 0.39, 0], out: [0.61, 1, 0.88, 1], inOut: [0.37, 0, 0.63, 1] },
  circ: { in: [0.55, 0, 1, 0.45], out: [0, 0.55, 0.45, 1], inOut: [0.85, 0, 0.15, 1] },
  expo: { inOut: [0.87, 0, 0.13, 1] },
  back: { inOut: [0.68, -0.6, 0.32, 1.6] },
};
const ALIAS: Record<string, string> = { quad: 'power1', cubic: 'power2', quart: 'power3', quint: 'power4', strong: 'power4' };

const r3 = (n: number) => String(Math.round(n * 1000) / 1000);
export const bezierEase = ([x1, y1, x2, y2]: Bezier): Ease =>
  `cubic-bezier(${r3(Math.max(0, Math.min(1, x1)))}, ${r3(y1)}, ${r3(Math.max(0, Math.min(1, x2)))}, ${r3(y2)})`;

/** The engine's ease for a named one; `warn` hears about approximations. The default is power1.out. */
export function toEase(input: EaseInput | undefined, warn: (message: string) => void = () => {}): Ease {
  if (input === undefined) return toEase('power1.out');
  if (Array.isArray(input)) return bezierEase(input);
  const name = input.trim();
  if (ENGINE.has(name) || name.startsWith('cubic-bezier(')) return name as Ease;
  if (name === 'none') return 'linear';
  const [rawFamily = '', rawDir = 'out'] = name.split('.');
  const family = ALIAS[rawFamily] ?? rawFamily;
  const dir = (rawDir === 'in' || rawDir === 'out' || rawDir === 'inOut' ? rawDir : null);
  if (!dir) { warn(`Unknown ease "${name}": using power1.out`); return toEase('power1.out'); }
  if (family === 'power0' || family === 'linear') return 'linear';
  if (family === 'power2') return dir === 'in' ? 'ease-in' : dir === 'out' ? 'ease-out' : 'ease-in-out';
  if (['expo', 'back', 'elastic', 'bounce'].includes(family) && dir !== 'inOut') return `${family}-${dir}` as Ease;
  const curve = BEZIER[family]?.[dir];
  if (curve) {
    if (family === 'expo' || family === 'back') warn(`"${name}" is approximated with a Bézier curve`);
    return bezierEase(curve);
  }
  if (family === 'elastic' || family === 'bounce') { warn(`"${name}" has no equivalent: using ${family}.out`); return `${family}-out` as Ease; }
  warn(`Unknown ease "${name}": using power1.out`);
  return toEase('power1.out');
}

/** The ease of the way back in a yoyo: the tween plays backwards, so in and out swap. */
export function mirrorEase(ease: Ease): Ease {
  const m = /^cubic-bezier\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*\)$/.exec(ease);
  if (m) {
    const [x1, y1, x2, y2] = m.slice(1).map(Number) as Bezier;
    return bezierEase([1 - x2, 1 - y2, 1 - x1, 1 - y1]);
  }
  if (ease.endsWith('-in-out') || ease === 'linear' || ease === 'hold') return ease;
  if (ease.endsWith('-in')) return ease.replace(/-in$/, '-out') as Ease;
  if (ease.endsWith('-out')) return ease.replace(/-out$/, '-in') as Ease;
  return ease;
}
