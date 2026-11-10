// Exportar a Lottie (JSON de animación vectorial para apps y webs).
// La escena se evalúa fotograma a fotograma. Cada objeto cuya forma no cambia (solo se mueve, gira, escala o
// se desvanece) se exporta una vez, con fotogramas clave nativos de su colocación y su opacidad; el que
// cambia de forma (efectos animados: Damage, Explosion, deformaciones…), fotograma a fotograma, que pesa más.
// Lo que Lottie no tiene (filtros, interacciones) no se exporta, y los avisos lo dicen.

import { parseColor } from './color';
import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { Gradient, Shape, SubPath } from './geometry';
import type { Mat } from './matrix';
import { analyzeMotion } from './motion';

export interface LottieExport {
  /** El JSON de Lottie (objeto; `JSON.stringify` para guardarlo). */
  data: Record<string, unknown>;
  /** Lo que no se ha exportado o lo que conviene saber (en inglés: lo enseña el editor). */
  warnings: string[];
  frames: number;
}

const BLEND: Record<string, number> = {
  multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, 'color-dodge': 6, 'color-burn': 7, 'hard-light': 8,
  'soft-light': 9, difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15,
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Coordenadas, con dos decimales (de sobra en pantalla; el archivo pesa mucho menos). */
const r2 = (v: number) => Math.round(v * 100) / 100;
const apply = (m: Mat, [x, y]: readonly [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function toLottie(engine: Engine, scene: SceneV2, options: { name?: string } = {}): LottieExport {
  const a = analyzeMotion(engine, scene);
  const [vx, vy, vw, vh] = a.viewBox;
  const toDoc = (p: readonly [number, number]): [number, number] => [r2(p[0] - vx), r2(p[1] - vy)];
  // Las matrices de las piezas son del documento; Lottie dibuja con el origen en la esquina del viewBox.
  const shift = (m: Mat): Mat => [m[0], m[1], m[2], m[3], m[4] + m[0] * vx + m[2] * vy - vx, m[5] + m[1] * vx + m[3] * vy - vy];

  const layers = a.layers.map((l) => {
    if (l.kind === 'object') {
      return layer(l.name, lottieShapes(l.shapes, (p) => [r2(p[0]), r2(p[1])]), transformKeys(l.matrices, l.anchor, l.opacity, vx, vy), 0, a.frames, blendOf(l.shapes));
    }
    if (l.kind === 'pieces') {
      const trOf = (i: number) => groupTransform(l.pieces[i]!.matrices.map(shift), l.pieces[i]!.opacity, l.ip);
      return layer(l.name, lottieShapes(l.shapes, toDoc, trOf), staticTransform(), l.ip, l.op, blendOf(l.shapes));
    }
    return layer(l.name, lottieShapes(l.shapes, toDoc), staticTransform(), l.ip, l.op, blendOf(l.shapes));
  });
  // En Lottie, la primera capa es la de delante.
  layers.reverse().forEach((l, i) => (l.ind = i + 1));

  const warnings: string[] = [];
  if (Object.keys(a.filters).length) warnings.push('Filters (Shadow, Blur, Glow, Grain, Displace) are not exported: Lottie players don’t support them reliably.');
  if (scene.interactions?.length) warnings.push('Interactions (hover, click, enter) are not exported: Lottie has none.');
  if (a.heavy.length) warnings.push(`Partly exported frame by frame (their shape changes, so the file is heavier): ${a.heavy.join(', ')}.`);
  if (!a.autoplay) warnings.push('Autoplay is off here, but Lottie players decide that themselves (autoplay, loop).');

  const data = { v: '5.7.0', fr: a.fps, ip: 0, op: a.frames, w: Math.round(vw), h: Math.round(vh), nm: options.name ?? 'svertik', ddd: 0, assets: [], layers };
  return { data, warnings, frames: a.frames };
}

const blendOf = (shapes: Shape[]) => BLEND[shapes[0]?.style['mix-blend-mode'] ?? ''] ?? 0;

function layer(nm: string, shapes: unknown[], ks: unknown, ip: number, op: number, bm: number): Record<string, unknown> {
  return { ddd: 0, ind: 0, ty: 4, nm, sr: 1, ks, ao: 0, shapes, ip, op, st: 0, bm };
}

const staticTransform = () => ({ o: { a: 0, k: 100 }, r: { a: 0, k: 0 }, p: { a: 0, k: [0, 0, 0] }, a: { a: 0, k: [0, 0, 0] }, s: { a: 0, k: [100, 100, 100] } });

/**
 * Colocación y opacidad, fotograma a fotograma, a partir de la matriz de cada uno; se quitan las claves que
 * sobran (donde el movimiento es una recta). Interpolación lineal entre las que quedan.
 */
function transformKeys(ms: Mat[], anchor: [number, number], opacity: number[], vx: number, vy: number) {
  // Posición: dónde cae el punto de anclaje en cada fotograma.
  const pos = ms.map((m) => {
    const [x, y] = apply(m, anchor);
    return [r3(x - vx), r3(y - vy), 0];
  });
  // Giro continuo (sin saltos de 360°).
  let prev = 0;
  const rot = ms.map((m, i) => {
    let a = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    if (i) while (a - prev > 180) a -= 360;
    if (i) while (a - prev < -180) a += 360;
    prev = a;
    return [r3(a)];
  });
  const scale = ms.map((m) => {
    const sx = Math.hypot(m[0], m[1]);
    const sy = sx ? (m[0] * m[3] - m[1] * m[2]) / sx : 0;
    return [r3(sx * 100), r3(sy * 100), 100];
  });
  const op = opacity.map((o) => [r3(o * 100)]);
  return { o: keys(op, true), r: keys(rot, true), p: keys(pos), a: { a: 0, k: [r3(anchor[0]), r3(anchor[1]), 0] }, s: keys(scale) };
}

function keys(values: number[][], scalar = false, from = 0) {
  const same = values.every((v) => v.every((x, i) => Math.abs(x - values[0]![i]!) < 1e-3));
  if (same) return { a: 0, k: scalar ? values[0]![0] : values[0] };
  // Se quedan las claves donde el movimiento deja de ser recto.
  const keep = values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return true;
    const a = values[i - 1]!, b = values[i + 1]!;
    return v.some((x, k) => Math.abs(x - (a[k]! + b[k]!) / 2) > 1e-3);
  });
  const lin = { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } };
  return { a: 1, k: values.flatMap((v, t) => (keep[t] ? [{ t: t + from, s: v, ...lin }] : [])) };
}

/** Las formas, como grupos de Lottie (la de delante, la primera). */
function lottieShapes(shapes: Shape[], at: (p: readonly [number, number]) => [number, number], trOf?: (index: number) => unknown): unknown[] {
  return [...shapes].reverse().map((s, i) => {
    const index = shapes.length - 1 - i;
    const items: unknown[] = s.subpaths.map((sp) => ({ ty: 'sh', ks: { a: 0, k: pathOf(sp, at) } }));
    const o = Number(s.style.opacity ?? 1);
    const fill = paintOf(s.style.fill, s, at, Number(s.style['fill-opacity'] ?? 1) * o, s.style['fill-rule'] === 'evenodd' ? 2 : 1);
    if (fill) items.push(fill);
    const stroke = s.style.stroke && s.style.stroke !== 'none' ? parseColor(s.style.stroke) : null;
    if (stroke) {
      const w = Number(s.style['stroke-width'] ?? 1);
      items.push({
        ty: 'st',
        c: { a: 0, k: [stroke[0] / 255, stroke[1] / 255, stroke[2] / 255, 1] },
        o: { a: 0, k: r3(stroke[3] * Number(s.style['stroke-opacity'] ?? 1) * o * 100) },
        w: { a: 0, k: r3(w) },
        lc: { butt: 1, round: 2, square: 3 }[s.style['stroke-linecap'] ?? 'butt'] ?? 1,
        lj: { miter: 1, round: 2, bevel: 3 }[s.style['stroke-linejoin'] ?? 'miter'] ?? 1,
        ml: 4,
      });
    }
    items.push(trOf?.(index) ?? { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } });
    return { ty: 'gr', nm: `Shape ${shapes.length - i}`, it: items };
  });
}

/** Un subtrazado como trazado de Lottie: vértices y tiradores (relativos a cada vértice). */
function pathOf(sp: SubPath, at: (p: readonly [number, number]) => [number, number]) {
  const segs = sp.segs;
  const last = segs[segs.length - 1];
  // Cerrado y con el último tramo de vuelta al principio: ese tramo es el que cierra.
  const closesOnStart = sp.closed && last && Math.hypot(last.p[0] - sp.start[0], last.p[1] - sp.start[1]) < 1e-6;
  const pts = [sp.start, ...segs.map((g) => g.p)];
  if (closesOnStart) pts.pop();
  const v = pts.map(at);
  const n = v.length;
  const i: [number, number][] = v.map(() => [0, 0]);
  const o: [number, number][] = v.map(() => [0, 0]);
  segs.forEach((g, k) => {
    const from = k, to = (k + 1) % n;
    if (!sp.closed && k + 1 >= n) return;
    const c1 = at(g.c1), c2 = at(g.c2);
    o[from] = [r2(c1[0] - v[from]![0]), r2(c1[1] - v[from]![1])];
    i[to] = [r2(c2[0] - v[to]![0]), r2(c2[1] - v[to]![1])];
  });
  return { i, o, v, c: sp.closed };
}

function paintOf(paint: string | undefined, s: Shape, at: (p: readonly [number, number]) => [number, number], opacity: number, rule: number): unknown | null {
  if (!paint || paint === 'none') return null;
  const grad = /^url\(#(.+)\)$/.exec(paint);
  if (grad) {
    const g = s.gradients?.find((x) => x.id === grad[1]);
    return g ? gradientFill(g, s, at, opacity, rule) : null;
  }
  const c = parseColor(paint) ?? [0, 0, 0, 1];
  return { ty: 'fl', c: { a: 0, k: [c[0] / 255, c[1] / 255, c[2] / 255, 1] }, o: { a: 0, k: r3(c[3] * opacity * 100) }, r: rule };
}

/** Degradado (relativo a la caja de la forma, como en svertik) → puntos de inicio y fin en coordenadas. */
function gradientFill(g: Gradient, s: Shape, at: (p: readonly [number, number]) => [number, number], opacity: number, rule: number) {
  const pts = s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((x) => x.p)]).map(at);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x0, Math.max(...ys) - y0];
  const box = (fx: number, fy: number) => [r3(x0 + fx * w), r3(y0 + fy * h)];
  const colors = g.stops.flatMap((st) => {
    const c = parseColor(st.color) ?? [0, 0, 0, 1];
    return [st.offset, c[0] / 255, c[1] / 255, c[2] / 255];
  });
  const alphas = g.stops.flatMap((st) => [st.offset, (parseColor(st.color)?.[3] ?? 1) * (st.opacity ?? 1)]);
  const radial = g.kind === 'radial';
  const start = radial ? box(g.cx ?? 0.5, g.cy ?? 0.5) : box(g.x1 ?? 0, g.y1 ?? 0);
  const end = radial ? box((g.cx ?? 0.5) + (g.r ?? 0.5), g.cy ?? 0.5) : box(g.x2 ?? 1, g.y2 ?? 0);
  return { ty: 'gf', t: radial ? 2 : 1, s: { a: 0, k: start }, e: { a: 0, k: end }, g: { p: g.stops.length, k: { a: 0, k: [...colors, ...alphas] } }, o: { a: 0, k: r3(opacity * 100) }, r: rule };
}

// ── Piezas rígidas


/** El movimiento de una pieza (matrices desde su primer fotograma) como transformación de su grupo en Lottie. */
function groupTransform(ms: Mat[], opacity: number[], from: number) {
  let prev = 0;
  const pos: number[][] = [], rot: number[][] = [], scale: number[][] = [];
  ms.forEach((m, i) => {
    const sx = Math.hypot(m[0], m[1]);
    const sy = sx ? (m[0] * m[3] - m[1] * m[2]) / sx : 0;
    let a = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    if (i) while (a - prev > 180) a -= 360;
    if (i) while (a - prev < -180) a += 360;
    prev = a;
    pos.push([r2(m[4]), r2(m[5])]);
    rot.push([r3(a)]);
    scale.push([r3(sx * 100), r3(sy * 100)]);
  });
  // Las claves, en el tiempo de la animación (el tramo empieza en `from`).
  return { ty: 'tr', p: keys(pos, false, from), a: { a: 0, k: [0, 0] }, s: keys(scale, false, from), r: keys(rot, true, from), o: keys(opacity.map((o) => [r3(o * 100)]), true, from) };
}
