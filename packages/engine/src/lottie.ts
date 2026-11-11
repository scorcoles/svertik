// Export to Lottie (vector animation JSON for apps and websites).
// The scene is evaluated frame by frame. Each object whose shape doesn't change (it only moves, turns, scales
// or fades) is exported once, with native keyframes for its placement and opacity; one that changes shape
// (animated effects: Damage, Explosion, deformations…), frame by frame, which weighs more.
// What Lottie doesn't have (filters, masks, interactions) isn't exported, and the warnings say so.

import { parseColor } from './color';
import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { Gradient, Shape, SubPath } from './geometry';
import type { Mat } from './matrix';
import { analyzeMotion } from './motion';

export interface LottieExport {
  /** The Lottie JSON (an object; `JSON.stringify` it to save it). */
  data: Record<string, unknown>;
  /** What wasn't exported or is worth knowing (shown by the editor). */
  warnings: string[];
  frames: number;
}

const BLEND: Record<string, number> = {
  multiply: 1, screen: 2, overlay: 3, darken: 4, lighten: 5, 'color-dodge': 6, 'color-burn': 7, 'hard-light': 8,
  'soft-light': 9, difference: 10, exclusion: 11, hue: 12, saturation: 13, color: 14, luminosity: 15,
};
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Coordinates with two decimals (plenty on screen; the file weighs much less). */
const r2 = (v: number) => Math.round(v * 100) / 100;
const apply = (m: Mat, [x, y]: readonly [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export function toLottie(engine: Engine, scene: SceneV2, options: { name?: string } = {}): LottieExport {
  const a = analyzeMotion(engine, scene);
  const [vx, vy, vw, vh] = a.viewBox;
  const toDoc = (p: readonly [number, number]): [number, number] => [r2(p[0] - vx), r2(p[1] - vy)];
  // The pieces' matrices are in the document; Lottie draws with the origin at the viewBox corner.
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
  // In Lottie, the first layer is the front one.
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
 * Placement and opacity, frame by frame, from each one's matrix; redundant keys are dropped (where the
 * motion is a straight line). Linear interpolation between the ones left.
 */
function transformKeys(ms: Mat[], anchor: [number, number], opacity: number[], vx: number, vy: number) {
  // Position: where the anchor point falls in each frame.
  const pos = ms.map((m) => {
    const [x, y] = apply(m, anchor);
    return [r3(x - vx), r3(y - vy), 0];
  });
  // Continuous rotation (no 360° jumps).
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
  // Keys stay where the motion stops being straight.
  const keep = values.map((v, i) => {
    if (i === 0 || i === values.length - 1) return true;
    const a = values[i - 1]!, b = values[i + 1]!;
    return v.some((x, k) => Math.abs(x - (a[k]! + b[k]!) / 2) > 1e-3);
  });
  const lin = { o: { x: [0], y: [0] }, i: { x: [1], y: [1] } };
  return { a: 1, k: values.flatMap((v, t) => (keep[t] ? [{ t: t + from, s: v, ...lin }] : [])) };
}

/** The shapes, as Lottie groups (the front one first). */
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
        // Dashes: dash, gap and offset, as in SVG.
        ...(() => {
          const da = (s.style['stroke-dasharray'] ?? '').split(/[\s,]+/).map(Number).filter((n) => n > 0);
          if (!da.length) return {};
          const off = Number(s.style['stroke-dashoffset'] ?? 0) || 0;
          return { d: [{ n: 'd', nm: 'dash', v: { a: 0, k: r3(da[0]!) } }, { n: 'g', nm: 'gap', v: { a: 0, k: r3(da[1] ?? da[0]!) } }, { n: 'o', nm: 'offset', v: { a: 0, k: r3(off) } }] };
        })(),
      });
    }
    items.push(trOf?.(index) ?? { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } });
    return { ty: 'gr', nm: `Shape ${shapes.length - i}`, it: items };
  });
}

/** A subpath as a Lottie path: vertices and handles (relative to each vertex). */
function pathOf(sp: SubPath, at: (p: readonly [number, number]) => [number, number]) {
  const segs = sp.segs;
  const last = segs[segs.length - 1];
  // Closed, with the last segment going back to the start: that segment is the one that closes it.
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

/** Gradient (relative to the shape's box, as in svertik) → start and end points in coordinates. */
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

// ── Rigid pieces


/** A piece's motion (matrices from its first frame) as the transform of its Lottie group. */
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
  // The keys, in animation time (the segment starts at `from`).
  return { ty: 'tr', p: keys(pos, false, from), a: { a: 0, k: [0, 0] }, s: keys(scale, false, from), r: keys(rot, true, from), o: keys(opacity.map((o) => [r3(o * 100)]), true, from) };
}
