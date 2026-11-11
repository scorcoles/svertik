// Animación: pistas de fotogramas clave sobre cualquier parámetro (de un efecto, de una primitiva o de la
// colocación de un nodo). `sampleScene` da la escena en un instante: lo demás del motor no cambia.
import { mixColor, parseColor, toHex } from './color';
import type { SceneNode, SceneV2 } from './document';
import type { ModifierInstance } from './engine';

/** Curva desde una clave hasta la siguiente. `hold`: se mantiene hasta la siguiente (salto). */
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
  /** Instante, en segundos. */
  t: number;
  value: unknown;
  ease?: Ease;
}

/**
 * Qué anima una pista:
 * - `node`: la colocación o la visibilidad del nodo (x, y, scale, rotation, opacity);
 * - `shape`: un parámetro de la primitiva (radius, text, fillColor…);
 * - `modifier`: un parámetro de un efecto de su pila (por su id).
 */
export interface Track {
  id: string;
  node: string;
  on: 'node' | 'shape' | 'modifier';
  modifier?: string;
  /** En `modifier`, también `enabled`: encender y apagar el efecto (true / false, salta en cada clave). */
  param: string;
  keys: Keyframe[];
  /**
   * Cuántas veces se reproducen sus claves, una detrás de otra (por defecto, 1). 0: sin parar.
   * Cada vuelta empieza `every` segundos después de la anterior (por defecto, lo que duran las claves).
   */
  repeat?: number;
  every?: number;
}

export interface Animation {
  /** Duración en segundos. */
  duration: number;
  loop?: boolean;
  /** Arranca sola al cargar (por defecto, sí). Sin autoplay, solo la mueven las interacciones «play». */
  autoplay?: boolean;
  /** Fotogramas por segundo para encajar las claves (24, 25, 30, 60…). */
  fps?: number;
  tracks: Track[];
}

const EASE_OUT: Record<'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'expo-out' | 'back-out' | 'elastic-out' | 'bounce-out', (x: number) => number> = {
  linear: (x) => x,
  'ease-in': (x) => x * x * x,
  'ease-out': (x) => 1 - (1 - x) ** 3,
  'ease-in-out': (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  // expo (arranque muy rápido), back (se pasa un poco y vuelve), elastic (muelle)
  // y bounce (rebota contra el final). back y elastic salen de 0–1 a propósito. Sus «in», más abajo.
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
/** La versión «in» de una curva «out»: la misma, al revés (arranca despacio y acaba de golpe). */
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

/** Mezcla dos valores: números, puntos y colores se interpolan; lo demás (modos, textos…) se mantiene hasta la clave siguiente. */
export function lerpValue(a: unknown, b: unknown, k: number): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v) => typeof v === 'number')) {
    return a.map((v, i) => (v as number) + ((b[i] as number) - (v as number)) * k);
  }
  if (typeof a === 'string' && typeof b === 'string' && a.startsWith('#') && b.startsWith('#')) {
    const ca = parseColor(a), cb = parseColor(b);
    // Los colores no se pasan (back, elastic): se quedan entre los dos.
    if (ca && cb) return toHex(mixColor(ca, cb, Math.max(0, Math.min(1, k))));
  }
  return k < 1 ? a : b;
}

/** Valor de una pista en el instante `t`. Antes de la primera clave, la primera; después de la última, la última. */
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
 * El instante de las claves de una pista que toca en `t`, con sus repeticiones: dentro de cada vuelta,
 * lo que corresponde de la primera; entre vueltas (si `every` es más largo que las claves), el último valor.
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

/** Valor de una pista en el instante `t` (con sus repeticiones). */
export const trackValue = (tr: Track, t: number): unknown => valueAt(tr.keys, trackTime(tr, t));

/** Busca un efecto por id en una pila (también dentro de Step). */
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

/** El valor que tiene ahora (sin animar) lo que apunta una pista. */
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

/** La escena en el instante `t` (segundos): una copia con los valores de las pistas puestos. */
export function sampleScene(scene: SceneV2, t: number): SceneV2 {
  const anim = scene.animation;
  if (!anim?.tracks.length) return scene;
  const out = structuredClone(scene) as SceneV2;
  for (const tr of anim.tracks) writeTarget(out, tr, trackValue(tr, t));
  // El instante, para lo que va con retraso (Delay de Effector): no se guarda, solo vale para evaluar.
  out.at = t;
  return out;
}

/** Pone (o sustituye) una clave en `t`; las claves a menos de medio fotograma se consideran la misma. */
export function setKey(keys: Keyframe[], t: number, value: unknown, fps = 30): Keyframe[] {
  const eps = 0.5 / fps;
  const rest = keys.filter((k) => Math.abs(k.t - t) > eps);
  const prev = keys.find((k) => Math.abs(k.t - t) <= eps);
  return [...rest, { t, value, ...(prev?.ease ? { ease: prev.ease } : {}) }].sort((a, b) => a.t - b.t);
}
