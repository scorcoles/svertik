// Animation: keyframe tracks on any parameter (of an effect, of a primitive or of a node's
// placement). `sampleScene` gives the scene at a time: the rest of the engine doesn't change.
import { mixColor, parseColor, toHex } from './color';
import type { SceneNode, SceneV2 } from './document';
import type { ModifierInstance } from './engine';

/** Curve from one key to the next. `hold`: keeps the value until the next one (a jump). */
export type Ease =
  | 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
  | 'expo-in' | 'expo-out' | 'back-in' | 'back-out' | 'elastic-in' | 'elastic-out' | 'bounce-in' | 'bounce-out'
  | 'hold';
export const EASES: Ease[] = [
  'linear', 'ease-in', 'ease-out', 'ease-in-out',
  'expo-in', 'expo-out', 'back-in', 'back-out', 'elastic-in', 'elastic-out', 'bounce-in', 'bounce-out',
  'hold',
];

export interface Keyframe {
  /** Time, in seconds. */
  t: number;
  value: unknown;
  ease?: Ease;
}

/**
 * What a track animates:
 * - `node`: the node's placement or visibility (x, y, scale, rotation, opacity);
 * - `shape`: a parameter of the primitive (radius, text, fillColor…);
 * - `modifier`: a parameter of an effect in its stack (by its id).
 */
export interface Track {
  id: string;
  node: string;
  on: 'node' | 'shape' | 'modifier';
  modifier?: string;
  /** With `modifier`, also `enabled`: turns the effect on and off (true / false, jumps at each key). */
  param: string;
  keys: Keyframe[];
  /**
   * How many times its keys play, one after another (1 by default). 0: forever.
   * Each lap starts `every` seconds after the previous one (by default, the length of the keys).
   */
  repeat?: number;
  every?: number;
}

export interface Animation {
  /** Duration in seconds. */
  duration: number;
  loop?: boolean;
  /** Starts by itself on load (yes by default). Without autoplay, only "play" interactions move it. */
  autoplay?: boolean;
  /** Frames per second keys snap to (24, 25, 30, 60…). */
  fps?: number;
  tracks: Track[];
}

const EASE_OUT: Record<'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'expo-out' | 'back-out' | 'elastic-out' | 'bounce-out', (x: number) => number> = {
  linear: (x) => x,
  'ease-in': (x) => x * x * x,
  'ease-out': (x) => 1 - (1 - x) ** 3,
  'ease-in-out': (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  // expo (very fast start), back (overshoots a little and comes back), elastic (spring)
  // and bounce (bounces against the end). back and elastic leave 0–1 on purpose. Their "in" versions, below.
  'expo-out': (x) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x)),
  'back-out': (x) => {
    const c = 1.8;
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
  },
  'elastic-out': (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin(((x * 10 - 0.75) * 2 * Math.PI) / 3) + 1),
  'bounce-out': (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
};
/** The "in" version of an "out" curve: the same, reversed (starts slowly and ends abruptly). */
const inOf = (out: (x: number) => number) => (x: number) => 1 - out(1 - x);
const EASE: Record<Ease, (x: number) => number> = {
  ...EASE_OUT,
  'expo-in': inOf(EASE_OUT['expo-out']),
  'back-in': inOf(EASE_OUT['back-out']),
  'elastic-in': inOf(EASE_OUT['elastic-out']),
  'bounce-in': inOf(EASE_OUT['bounce-out']),
  hold: () => 0,
};
export const ease = (name: Ease | undefined, x: number) => (EASE[name ?? 'ease-in-out'] ?? EASE.linear)(Math.max(0, Math.min(1, x)));

/** Blends two values: numbers, points and colours interpolate; the rest (modes, texts…) holds until the next key. */
export function lerpValue(a: unknown, b: unknown, k: number): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v) => typeof v === 'number')) {
    return a.map((v, i) => (v as number) + ((b[i] as number) - (v as number)) * k);
  }
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    const ca = parseColor(a), cb = parseColor(b);
    // Colours don't overshoot (back, elastic): they stay between the two.
    if (ca && cb) return toHex(mixColor(ca, cb, Math.max(0, Math.min(1, k))));
  }
  return k < 1 ? a : b;
}

/** A track's value at time `t`. Before the first key, the first; after the last, the last. */
export function valueAt(keys: Keyframe[], t: number): unknown {
  if (!keys.length) return undefined;
  const ks = keys.length > 1 ? [...keys].sort((x, y) => x.t - y.t) : keys;
  if (t <= ks[0]!.t) return ks[0]!.value;
  const last = ks[ks.length - 1]!;
  if (t >= last.t) return last.value;
  let i = 0;
  while (i < ks.length - 2 && ks[i + 1]!.t <= t) i++;
  const a = ks[i]!, b = ks[i + 1]!;
  if (a.ease === 'hold') return a.value;
  const k = ease(a.ease, (t - a.t) / (b.t - a.t || 1));
  return lerpValue(a.value, b.value, k);
}

/**
 * The time within a track's keys that applies at `t`, with its repeats: inside each lap, the
 * matching time of the first; between laps (if `every` is longer than the keys), the last value.
 */
export function trackTime(tr: Pick<Track, 'keys' | 'repeat' | 'every'>, t: number): number {
  const times = tr.keys.map((k) => k.t);
  const first = Math.min(...times), last = Math.max(...times);
  const span = last - first;
  const repeat = tr.repeat ?? 1;
  if (repeat === 1 || !(span > 0) || t <= first) return t;
  const period = Math.max(span, tr.every ?? span, 1e-3);
  const n = Math.floor((t - first) / period);
  if (repeat > 0 && n >= repeat) return t;
  return Math.min(last, first + (t - first - n * period));
}

/** A track's value at time `t` (with its repeats). */
export const trackValue = (tr: Track, t: number): unknown => valueAt(tr.keys, trackTime(tr, t));

/** Finds an effect by id in a stack (also inside Step and the like). */
export function findModifier(stack: ModifierInstance[], id: string): ModifierInstance | null {
  for (const m of stack) {
    if (m.id === id) return m;
    const inner = m.children && findModifier(m.children, id);
    if (inner) return inner;
  }
  return null;
}
function findNode(nodes: SceneNode[], id: string): SceneNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.kind === 'group') {
      const inner = findNode(n.children, id);
      if (inner) return inner;
    }
  }
  return null;
}

/** The current (unanimated) value of what a track points at. */
export function readTarget(scene: SceneV2, tr: Pick<Track, 'node' | 'on' | 'modifier' | 'param'>): unknown {
  const n = findNode(scene.objects, tr.node);
  if (!n) return undefined;
  if (tr.on === 'node') return tr.param === 'opacity' ? (n.opacity ?? 1) : ((n.transform as Record<string, unknown> | undefined)?.[tr.param] ?? (tr.param === 'scale' ? 1 : 0));
  if (tr.on === 'shape') return n.kind === 'shape' ? n.params[tr.param] : undefined;
  const m = tr.modifier ? findModifier(n.stack, tr.modifier) : null;
  if (m && tr.param === 'enabled') return m.enabled !== false;
  return m?.params?.[tr.param];
}

export function writeTarget(scene: SceneV2, tr: Pick<Track, 'node' | 'on' | 'modifier' | 'param'>, value: unknown) {
  const n = findNode(scene.objects, tr.node);
  if (!n || value === undefined) return;
  if (tr.on === 'node') {
    if (tr.param === 'opacity') n.opacity = value as number;
    else n.transform = { ...n.transform, [tr.param]: value };
  } else if (tr.on === 'shape') {
    if (n.kind === 'shape') n.params = { ...n.params, [tr.param]: value };
  } else {
    const m = tr.modifier ? findModifier(n.stack, tr.modifier) : null;
    if (m && tr.param === 'enabled') m.enabled = !!value;
    else if (m) m.params = { ...m.params, [tr.param]: value };
  }
}

/** The scene at time `t` (seconds): a copy with the tracks' values set. */
export function sampleScene(scene: SceneV2, t: number): SceneV2 {
  const anim = scene.animation;
  if (!anim?.tracks.length) return scene;
  const out = structuredClone(scene) as SceneV2;
  for (const tr of anim.tracks) writeTarget(out, tr, trackValue(tr, t));
  // The time, for what is delayed (Effector's Delay): not saved, only used to evaluate.
  out.at = t;
  return out;
}

/** Sets (or replaces) a key at `t`; keys less than half a frame apart count as the same one. */
export function setKey(keys: Keyframe[], t: number, value: unknown, fps = 30): Keyframe[] {
  const eps = 0.5 / fps;
  const rest = keys.filter((k) => Math.abs(k.t - t) > eps);
  const prev = keys.find((k) => Math.abs(k.t - t) <= eps);
  return [...rest, { t, value, ...(prev?.ease ? { ease: prev.ease } : {}) }].sort((a, b) => a.t - b.t);
}
