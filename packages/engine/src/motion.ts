// Análisis del movimiento de una escena, para exportarla como animación (Lottie, SVG animado).
// Se evalúa fotograma a fotograma y se decide, objeto a objeto, la forma más ligera de contarlo:
// - object: su forma no cambia (vista desde el propio objeto): la forma una vez, y su matriz y su opacidad;
// - pieces: por tramos, cada pieza conserva sus puntos y solo se mueve, gira o escala (trozos de una
//   explosión, letras de un escalonado): cada pieza una vez, con su movimiento;
// - frame: lo que cambia de forma de verdad: las formas tal cual, en su tramo de fotogramas.
// Todo en coordenadas del documento.

import { sampleScene } from './animation';

/** Separa, en la clave de una capa, el objeto de sus filtros. */
const LAYER_SEP = '\u0001';
import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { FilterDef, Shape } from './geometry';
import { invert, type Mat } from './matrix';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const apply = (m: Mat, [x, y]: readonly [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface LayerBase {
  /** Id del objeto (vacío: formas sin objeto, como las rayas de Streaks). */
  id: string;
  name: string;
  /** Tramo de fotogramas en que se ve: [ip, op). */
  ip: number;
  op: number;
  /** Grupos con filtro que la envuelven (del primer fotograma). */
  wrap?: string[];
}
export type MotionLayer =
  | (LayerBase & { kind: 'object'; shapes: Shape[]; matrices: Mat[]; opacity: number[]; anchor: [number, number] })
  | (LayerBase & { kind: 'pieces'; shapes: Shape[]; pieces: { matrices: Mat[]; opacity: number[] }[] })
  | (LayerBase & { kind: 'frame'; shapes: Shape[] });

export interface MotionAnalysis {
  fps: number;
  frames: number;
  viewBox: [number, number, number, number];
  loop: boolean;
  autoplay: boolean;
  /** Capas, de atrás adelante. */
  layers: MotionLayer[];
  /** Filtros del primer fotograma (por id) y si cambian a lo largo de la animación. */
  filters: Record<string, FilterDef>;
  filtersChange: boolean;
  /** Objetos que van (en parte) fotograma a fotograma: pesan más. */
  heavy: string[];
}

export function analyzeMotion(engine: Engine, scene: SceneV2): MotionAnalysis {
  const anim = scene.animation?.tracks.length ? scene.animation : null;
  const fps = anim?.fps ?? 30;
  const frames = anim ? Math.max(1, Math.round(anim.duration * fps)) : 1;

  // Cada fotograma: las formas de cada objeto (en el documento), su matriz y su punto de anclaje.
  type Frame = { byNode: Map<string, Shape[]>; matrix: Map<string, Mat>; anchor: Map<string, [number, number]>; order: string[] };
  const evaluated: Frame[] = [];
  let viewBox: [number, number, number, number] = [0, 0, 1, 1];
  let filters: Record<string, FilterDef> = {};
  let filtersChange = false;
  const pivots = new Map([...walk(scene.objects)].map(({ node }) => [node.id, node.transform?.pivot]));
  for (let f = 0; f < frames; f++) {
    const doc = engine.evaluateDocument(anim ? sampleScene(scene, f / fps) : scene);
    if (f === 0) {
      viewBox = doc.geometry.viewBox;
      filters = structuredClone(doc.geometry.filters ?? {});
    } else {
      // La zona de cada filtro, la de todo su recorrido; sus valores, los del primer fotograma.
      for (const [id, fd] of Object.entries(doc.geometry.filters ?? {})) {
        const cur = filters[id];
        if (!cur) continue;
        if (fd.markup !== cur.markup) filtersChange = true;
        const [x0, y0, w0, h0] = cur.region, [x1, y1, w1, h1] = fd.region;
        const x = Math.min(x0, x1), y = Math.min(y0, y1);
        cur.region = [x, y, Math.max(x0 + w0, x1 + w1) - x, Math.max(y0 + h0, y1 + h1) - y];
      }
    }
    const byNode = new Map<string, Shape[]>();
    const order: string[] = [];
    for (const s of doc.geometry.shapes) {
      // Una capa por objeto y por filtros: las copias de RGB Split con desenfoque, aparte del dibujo.
      const id = (s.node ?? '') + (s.wrap?.length ? LAYER_SEP + s.wrap.join(',') : '');
      if (!byNode.has(id)) (byNode.set(id, []), order.push(id));
      byNode.get(id)!.push(s);
    }
    const matrix = new Map<string, Mat>();
    const anchor = new Map<string, [number, number]>();
    for (const [id, info] of doc.nodes) {
      matrix.set(id, info.matrix);
      // El pivote del objeto (en sus coordenadas): alrededor de él gira y escala.
      const [fx, fy] = pivots.get(id) ?? [0.5, 0.5];
      anchor.set(id, [info.bounds.x + fx * info.bounds.width, info.bounds.y + fy * info.bounds.height]);
    }
    evaluated.push({ byNode, matrix, anchor, order });
  }

  // Los objetos, en el orden en que se pintan (el primero, el de más atrás).
  const ids: string[] = [];
  for (const fr of evaluated) for (const id of fr.order) if (!ids.includes(id)) ids.push(id);
  const nodeOf = (key: string) => key.split(LAYER_SEP)[0]!;
  const nameOf = (key: string) => {
    const id = nodeOf(key);
    for (const { node } of walk(scene.objects)) if (node.id === id) return node.name;
    return id ? id : 'Effects';
  };

  const layers: MotionLayer[] = [];
  const heavy: string[] = [];
  for (const id of ids) {
    const name = nameOf(id);
    const perFrame = evaluated.map((fr) => ({ shapes: fr.byNode.get(id) ?? [], m: fr.matrix.get(nodeOf(id)), a: fr.anchor.get(nodeOf(id)) ?? ([0, 0] as [number, number]) }));
    const wrapOf = (shapes: Shape[]) => (shapes[0]?.wrap?.length ? { wrap: shapes[0].wrap } : {});
    // ¿La forma es la misma en todos los fotogramas, vista desde el propio objeto?
    const local = perFrame.map(({ shapes, m }) => {
      if (!m || !shapes.length) return null;
      const inv = invert(m);
      const base = Number(shapes[0]!.style.opacity ?? 1);
      const mine = shapes.map((s) => mapShape(s, inv));
      return { opacity: base, key: keyOf(mine, base), shapes: mine };
    });
    const present = local.filter((x) => x !== null);
    if (id !== '' && present.length === frames && present.every((x) => x.key === present[0]!.key)) {
      const first = present[0]!;
      const shapes = first.shapes.map((s, i) => withOpacity(s, first.opacity ? Number(perFrame[0]!.shapes[i]!.style.opacity ?? 1) / first.opacity : 1));
      layers.push({ kind: 'object', id, name, ip: 0, op: frames, shapes, matrices: perFrame.map((x) => x.m!), opacity: present.map((x) => x.opacity), anchor: perFrame[0]!.a, ...wrapOf(perFrame[0]!.shapes) });
      continue;
    }
    // Por tramos (ver arriba).
    let f = 0;
    let loose = 0;
    while (f < frames) {
      if (!perFrame[f]!.shapes.length) {
        f++;
        continue;
      }
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
      const refPts = ref.map(pointsOf);
      const fits: Mat[][] = [];
      let g = f;
      while (g < frames) {
        const cur = perFrame[g]!.shapes;
        if (topology(cur) !== sig) break;
        const step = cur.map((sh, i) => fitRigid(refPts[i]!, pointsOf(sh)));
        if (step.some((m) => !m)) break;
        fits.push(step as Mat[]);
        g++;
      }
      if (g === f) {
        // Ni siquiera el primero encaja con la referencia: este fotograma, tal cual.
        layers.push({ kind: 'frame', id, name, ip: f, op: f + 1, shapes: perFrame[f]!.shapes, ...wrapOf(perFrame[f]!.shapes) });
        if (frames > 1) loose++;
        f++;
        continue;
      }
      if (g - f === 1 && frames > 1) loose++;
      // La opacidad de cada pieza, aparte (en valor absoluto: puede empezar en 0); la forma, opaca.
      layers.push({
        kind: 'pieces',
        id,
        name,
        ip: f,
        op: g,
        shapes: ref.map((sh) => withOpacity(sh, 1)),
        pieces: ref.map((_, i) => ({ matrices: fits.map((ms) => ms[i]!), opacity: perFrame.slice(f, g).map(({ shapes }) => Number(shapes[i]!.style.opacity ?? 1)) })),
        ...wrapOf(ref),
      });
      f = g;
    }
    if (loose > 1) heavy.push(name);
  }
  return { fps, frames, viewBox, loop: anim?.loop !== false, autoplay: anim?.autoplay !== false, layers, filters, filtersChange, heavy };
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

