// Exportar a Lottie (JSON de animación vectorial para apps y webs).
// La escena se evalúa fotograma a fotograma. Cada objeto cuya forma no cambia (solo se mueve, gira, escala o
// se desvanece) se exporta una vez, con fotogramas clave nativos de su colocación y su opacidad; el que
// cambia de forma (efectos animados: Damage, Explosion, deformaciones…), fotograma a fotograma, que pesa más.
// Lo que Lottie no tiene (filtros, interacciones) no se exporta, y los avisos lo dicen.

import { sampleScene } from './animation';
import { parseColor } from './color';
import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { Gradient, Shape, SubPath } from './geometry';
import { invert, type Mat } from './matrix';

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
  const anim = scene.animation?.tracks.length ? scene.animation : null;
  const fps = anim?.fps ?? 30;
  const frames = anim ? Math.max(1, Math.round(anim.duration * fps)) : 1;
  const warnings: string[] = [];

  // Cada fotograma: las formas de cada objeto (en el documento) y su matriz.
  type Frame = { byNode: Map<string, Shape[]>; matrix: Map<string, Mat>; anchor: Map<string, [number, number]>; order: string[] };
  const evaluated: Frame[] = [];
  let viewBox: [number, number, number, number] = [0, 0, 1, 1];
  let filtered = false;
  for (let f = 0; f < frames; f++) {
    const doc = engine.evaluateDocument(anim ? sampleScene(scene, f / fps) : scene);
    if (f === 0) viewBox = doc.geometry.viewBox;
    if (doc.geometry.filters && Object.keys(doc.geometry.filters).length) filtered = true;
    const byNode = new Map<string, Shape[]>();
    const order: string[] = [];
    for (const s of doc.geometry.shapes) {
      const id = s.node ?? '';
      if (!byNode.has(id)) (byNode.set(id, []), order.push(id));
      byNode.get(id)!.push(s);
    }
    const matrix = new Map<string, Mat>();
    const anchor = new Map<string, [number, number]>();
    const pivots = new Map([...walk(scene.objects)].map(({ node }) => [node.id, node.transform?.pivot]));
    for (const [id, info] of doc.nodes) {
      matrix.set(id, info.matrix);
      // El pivote del objeto (en sus coordenadas): el punto de anclaje de su capa, alrededor del que gira y escala.
      const [fx, fy] = pivots.get(id) ?? [0.5, 0.5];
      anchor.set(id, [info.bounds.x + fx * info.bounds.width, info.bounds.y + fy * info.bounds.height]);
    }
    evaluated.push({ byNode, matrix, anchor, order });
  }
  const [vx, vy, vw, vh] = viewBox;
  const toDoc = (p: readonly [number, number]): [number, number] => [r2(p[0] - vx), r2(p[1] - vy)];

  // Los objetos, en el orden en que se pintan (el primero, el de más atrás).
  const ids: string[] = [];
  for (const fr of evaluated) for (const id of fr.order) if (!ids.includes(id)) ids.push(id);
  const nameOf = (id: string) => {
    for (const { node } of walk(scene.objects)) if (node.id === id) return node.name;
    return id ? id : 'Effects';
  };

  const layers: Record<string, unknown>[] = [];
  const heavy: string[] = [];
  ids.forEach((id) => {
    const perFrame = evaluated.map((fr) => ({ shapes: fr.byNode.get(id) ?? [], m: fr.matrix.get(id), a: fr.anchor.get(id) ?? [0, 0] }));
    // ¿La forma es la misma en todos los fotogramas, vista desde el propio objeto?
    const local = perFrame.map(({ shapes, m }) => {
      if (!m || !shapes.length) return null;
      const inv = invert(m);
      const base = Number(shapes[0]!.style.opacity ?? 1);
      const mine = shapes.map((s) => mapShape(s, inv));
      return { opacity: base, key: keyOf(mine, base), shapes: mine };
    });
    const present = local.filter((x) => x !== null);
    const fixed = id !== '' && present.length === frames && present.every((x) => x.key === present[0]!.key);
    if (fixed) {
      const first = present[0]!;
      const shapes = first.shapes.map((s, i) => withOpacity(s, first.opacity ? Number(perFrame[0]!.shapes[i]!.style.opacity ?? 1) / first.opacity : 1));
      layers.push(layer(nameOf(id), lottieShapes(shapes, (p) => [r2(p[0]), r2(p[1])]), transformKeys(perFrame.map((x) => x.m!), perFrame[0]!.a, present.map((x) => x.opacity), vx, vy), 0, frames, blendOf(shapes)));
      return;
    }
    // Por tramos: mientras cada pieza conserve sus puntos y solo se mueva, gire o escale (los trozos de una
    // explosión, las letras de un escalonado), una capa con la pieza una vez y sus claves de movimiento.
    // Lo que cambia de forma de verdad, fotograma a fotograma.
    let f = 0;
    let loose = 0;
    while (f < frames) {
      if (!perFrame[f]!.shapes.length) {
        f++;
        continue;
      }
      // Para ajustar, sin redondear (se redondea al escribir).
      const raw = (p: readonly [number, number]): [number, number] => [p[0] - vx, p[1] - vy];
      const sig = topology(perFrame[f]!.shapes);
      // La referencia: el primer fotograma del tramo en que todas las piezas tienen tamaño (si empiezan a
      // escala 0, como las letras que entran, desde ahí no se puede calcular su movimiento).
      let r = f;
      for (let k = f; k < Math.min(frames, f + 120) && topology(perFrame[k]!.shapes) === sig; k++) {
        if (perFrame[k]!.shapes.every((sh) => spanOf(pointsOf(sh)) > 1e-3)) {
          r = k;
          break;
        }
      }
      const ref = perFrame[r]!.shapes;
      const refPts = ref.map((sh) => pointsOf(sh).map(raw));
      const fits: Mat[][] = [];
      let g = f;
      while (g < frames) {
        const cur = perFrame[g]!.shapes;
        if (topology(cur) !== sig) break;
        const step = cur.map((sh, i) => fitRigid(refPts[i]!, pointsOf(sh).map(raw)));
        if (step.some((m) => !m)) break;
        fits.push(step as Mat[]);
        g++;
      }
      if (g === f) {
        // Ni siquiera el primero encaja con la referencia: este fotograma, tal cual.
        layers.push(layer(nameOf(id), lottieShapes(perFrame[f]!.shapes, toDoc), staticTransform(), f, f + 1, blendOf(perFrame[f]!.shapes)));
        if (frames > 1) loose++;
        f++;
        continue;
      }
      if (g - f === 1 && frames > 1) loose++;
      // La opacidad de cada pieza, como animación de su grupo (en valor absoluto: puede empezar en 0).
      const trOf = (i: number) =>
        groupTransform(
          fits.map((ms) => ms[i]!),
          perFrame.slice(f, g).map(({ shapes }) => Number(shapes[i]!.style.opacity ?? 1)),
          f,
        );
      layers.push(layer(nameOf(id), lottieShapes(ref.map((sh) => withOpacity(sh, 1)), toDoc, trOf), staticTransform(), f, g, blendOf(ref)));
      f = g;
    }
    if (loose > 1) heavy.push(nameOf(id));
  });
  // En Lottie, la primera capa es la de delante.
  layers.reverse().forEach((l, i) => (l.ind = i + 1));

  if (filtered) warnings.push('Filters (Shadow, Blur, Glow, Grain, Displace, RGB Split) are not exported: Lottie players don’t support them reliably.');
  if (scene.interactions?.length) warnings.push('Interactions (hover, click, enter) are not exported: Lottie has none.');
  if (heavy.length) warnings.push(`Partly exported frame by frame (their shape changes, so the file is heavier): ${heavy.join(', ')}.`);
  if (anim?.autoplay === false) warnings.push('Autoplay is off here, but Lottie players decide that themselves (autoplay, loop).');

  const data = {
    v: '5.7.0',
    fr: fps,
    ip: 0,
    op: frames,
    w: Math.round(vw),
    h: Math.round(vh),
    nm: options.name ?? 'svertik',
    ddd: 0,
    assets: [],
    layers,
  };
  return { data, warnings, frames };
}

function* walk(nodes: SceneV2['objects']): Generator<{ node: SceneV2['objects'][number] }> {
  for (const node of nodes) {
    yield { node };
    if (node.kind === 'group') yield* walk(node.children);
  }
}

/** Huella de unas formas (redondeadas): su trazado y su estilo, con la opacidad relativa a la primera. */
const keyOf = (shapes: Shape[], base: number) =>
  JSON.stringify(
    shapes.map((s) => [
      s.subpaths.map((sp) => [sp.closed, ...[sp.start, ...sp.segs.flatMap((g) => [g.c1, g.c2, g.p])].flat().map((v) => Math.round(v * 100) / 100)]),
      { ...s.style, opacity: base ? r3(Number(s.style.opacity ?? 1) / base) : 1 },
    ]),
  );

/** La forma, llevada con la matriz `m` (al propio objeto, o a ninguna parte). */
function mapShape(s: Shape, m: Mat): Shape {
  const f = (p: readonly [number, number]) => apply(m, p);
  return { ...s, subpaths: s.subpaths.map((sp) => ({ start: f(sp.start), closed: sp.closed, segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })) })) };
}
const withOpacity = (s: Shape, o: number): Shape => ({ ...s, style: { ...s.style, opacity: String(o) } });
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


/** Lo que mide una nube de puntos (su lado mayor). */
function spanOf(pts: (readonly [number, number])[]): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return Math.max(x1 - x0, y1 - y0);
}

/** Todos los puntos de una forma (vértices y tiradores), en orden. */
const pointsOf = (s: Shape): (readonly [number, number])[] => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.flatMap((g) => [g.c1, g.c2, g.p])]);

/** Lo que no puede cambiar dentro de un tramo: cuántas piezas, sus tramos y su estilo (sin la opacidad). */
const topology = (shapes: Shape[]) =>
  JSON.stringify(shapes.map((s) => [s.subpaths.map((sp) => [sp.segs.length, sp.closed]), { ...s.style, opacity: undefined }]));

/**
 * La matriz que lleva los puntos P a Q, si es un movimiento sin deformar: mover, girar y escalar
 * (también distinto en X y en Y, o con reflejo), sin sesgo. null si la pieza ha cambiado de forma.
 */
function fitRigid(P: (readonly [number, number])[], Q: (readonly [number, number])[], tol = 0.05): Mat | null {
  const n = P.length;
  if (!n || n !== Q.length) return null;
  // Tres puntos bien separados (el triángulo más grande que se encuentre deprisa).
  const d2 = (a: readonly [number, number], b: readonly [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let i1 = 0;
  for (let k = 1; k < n; k++) if (d2(P[k]!, P[0]!) > d2(P[i1]!, P[0]!)) i1 = k;
  const area = (k: number) => Math.abs((P[i1]![0] - P[0]![0]) * (P[k]![1] - P[0]![1]) - (P[i1]![1] - P[0]![1]) * (P[k]![0] - P[0]![0]));
  let i2 = 0;
  for (let k = 1; k < n; k++) if (area(k) > area(i2)) i2 = k;
  let m: Mat;
  if (area(i2) > 1e-6) {
    // Afín por tres puntos.
    const [x0, y0] = P[0]!, [x1, y1] = P[i1]!, [x2, y2] = P[i2]!;
    const det = x0 * (y1 - y2) - x1 * (y0 - y2) + x2 * (y0 - y1);
    const solve = (u0: number, u1: number, u2: number): [number, number, number] => [
      (u0 * (y1 - y2) - u1 * (y0 - y2) + u2 * (y0 - y1)) / det,
      (x0 * (u1 - u2) - x1 * (u0 - u2) + x2 * (u0 - u1)) / det,
      (x0 * (y1 * u2 - y2 * u1) - x1 * (y0 * u2 - y2 * u0) + x2 * (y0 * u1 - y1 * u0)) / det,
    ];
    const [a, c, e] = solve(Q[0]![0], Q[i1]![0], Q[i2]![0]);
    const [b, d, f] = solve(Q[0]![1], Q[i1]![1], Q[i2]![1]);
    m = [a, b, c, d, e, f];
  } else if (i1 !== 0 && d2(P[i1]!, P[0]!) > 1e-9) {
    // Todos en línea: semejanza por dos puntos.
    const [px, py] = [P[i1]![0] - P[0]![0], P[i1]![1] - P[0]![1]];
    const [qx, qy] = [Q[i1]![0] - Q[0]![0], Q[i1]![1] - Q[0]![1]];
    const den = px * px + py * py;
    const a = (px * qx + py * qy) / den, b = (px * qy - py * qx) / den;
    m = [a, b, -b, a, Q[0]![0] - (a * P[0]![0] - b * P[0]![1]), Q[0]![1] - (b * P[0]![0] + a * P[0]![1])];
  } else {
    m = [1, 0, 0, 1, Q[0]![0] - P[0]![0], Q[0]![1] - P[0]![1]];
  }
  // Lo más cercano sin sesgo (girar y escalar en X e Y), que es lo que Lottie puede animar; con el mismo
  // centro (la media de los puntos). Vale si lleva cada punto a su sitio.
  const [a, b] = m;
  const sx = Math.hypot(a, b);
  const sy = sx > 1e-12 ? (m[0] * m[3] - m[1] * m[2]) / sx : 0;
  const [cos, sin] = sx > 1e-12 ? [a / sx, b / sx] : [1, 0];
  const lin: [number, number, number, number] = [cos * sx, sin * sx, -sin * sy, cos * sy];
  const mean = (A: (readonly [number, number])[]): [number, number] => [A.reduce((t, p) => t + p[0], 0) / A.length, A.reduce((t, p) => t + p[1], 0) / A.length];
  const [px, py] = mean(P), [qx, qy] = mean(Q);
  m = [...lin, qx - (lin[0] * px + lin[2] * py), qy - (lin[1] * px + lin[3] * py)];
  for (let k = 0; k < n; k++) {
    const [x, y] = apply(m, P[k]!);
    if (Math.abs(x - Q[k]![0]) > tol || Math.abs(y - Q[k]![1]) > tol) return null;
  }
  return m;
}

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
