// Motion analysis of a scene, to export it as an animation (Lottie, animated SVG).
// It is evaluated frame by frame and, object by object, the lightest way to describe it is chosen:
// - object: its shape doesn't change (seen from the object itself): the shape once, plus its matrix and opacity;
// - pieces: in segments, each piece keeps its points and only moves, turns or scales (pieces of an
//   explosion, letters of a stagger): each piece once, with its motion;
// - frame: what really changes shape: the shapes as they are, over their range of frames.
// Everything in document coordinates.

import { sampleScene } from './animation';

/** Separates, in a layer key, the object from its filters. */
const LAYER_SEP = '\u0001';
import type { SceneV2 } from './document';
import type { Engine } from './engine';
import type { FilterDef, Shape } from './geometry';
import { invert, type Mat } from './matrix';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const apply = (m: Mat, [x, y]: readonly [number, number]): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

interface LayerBase {
  /** Object id (empty: shapes without an object, like Streaks' streaks). */
  id: string;
  name: string;
  /** Frames where it is visible: [ip, op). */
  ip: number;
  op: number;
  /** Filter groups wrapping it (from the first frame). */
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
  /** Layers, back to front. */
  layers: MotionLayer[];
  /** Filters of the first frame (by id) and whether they change over the animation. */
  filters: Record<string, FilterDef>;
  filtersChange: boolean;
  /** Objects that go (partly) frame by frame: they weigh more. */
  heavy: string[];
}

export function analyzeMotion(engine: Engine, scene: SceneV2): MotionAnalysis {
  const anim = scene.animation?.tracks.length ? scene.animation : null;
  const fps = anim?.fps ?? 30;
  const frames = anim ? Math.max(1, Math.round(anim.duration * fps)) : 1;

  // Each frame: each object's shapes (in the document), its matrix and its anchor point.
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
      // Each filter's area, that of its whole run; its values, the first frame's.
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
      // One layer per object and per filters: RGB Split copies with blur, apart from the drawing.
      const id = (s.node ?? '') + (s.wrap?.length ? LAYER_SEP + s.wrap.join(',') : '');
      if (!byNode.has(id)) (byNode.set(id, []), order.push(id));
      byNode.get(id)!.push(s);
    }
    const matrix = new Map<string, Mat>();
    const anchor = new Map<string, [number, number]>();
    for (const [id, info] of doc.nodes) {
      matrix.set(id, info.matrix);
      // The object's pivot (in its coordinates): it turns and scales around it.
      const [fx, fy] = pivots.get(id) ?? [0.5, 0.5];
      anchor.set(id, [info.bounds.x + fx * info.bounds.width, info.bounds.y + fy * info.bounds.height]);
    }
    evaluated.push({ byNode, matrix, anchor, order });
  }

  // The objects, in paint order (the first, the furthest back).
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
    // Is the shape the same in every frame, seen from the object itself?
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
    // In segments (see above).
    let f = 0;
    let loose = 0;
    while (f < frames) {
      if (!perFrame[f]!.shapes.length) {
        f++;
        continue;
      }
      const sig = topology(perFrame[f]!.shapes);
      // The reference: the first frame of the segment where every piece has a size (if they start at
      // scale 0, like letters coming in, their motion can't be computed from there).
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
        // Not even the first fits the reference: this frame, as it is.
        layers.push({ kind: 'frame', id, name, ip: f, op: f + 1, shapes: perFrame[f]!.shapes, ...wrapOf(perFrame[f]!.shapes) });
        if (frames > 1) loose++;
        f++;
        continue;
      }
      if (g - f === 1 && frames > 1) loose++;
      // Each piece's opacity, separately (absolute: it may start at 0); the shape, opaque.
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


/** Fingerprint of some shapes (rounded): their path and style, with the opacity relative to the first. */
const keyOf = (shapes: Shape[], base: number) =>
  JSON.stringify(
    shapes.map((s) => [
      s.subpaths.map((sp) => [sp.closed, ...[sp.start, ...sp.segs.flatMap((g) => [g.c1, g.c2, g.p])].flat().map((v) => Math.round(v * 100) / 100)]),
      { ...s.style, opacity: base ? r3(Number(s.style.opacity ?? 1) / base) : 1 },
    ]),
  );


/** The shape, carried by matrix `m` (to the object itself, or nowhere). */
function mapShape(s: Shape, m: Mat): Shape {
  const f = (p: readonly [number, number]) => apply(m, p);
  return { ...s, subpaths: s.subpaths.map((sp) => ({ start: f(sp.start), closed: sp.closed, segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })) })) };
}
const withOpacity = (s: Shape, o: number): Shape => ({ ...s, style: { ...s.style, opacity: String(o) } });

// ── Rigid pieces

/** The size of a point cloud (its longest side). */
function spanOf(pts: (readonly [number, number])[]): number {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  return Math.max(x1 - x0, y1 - y0);
}

/** Every point of a shape (vertices and handles), in order. */
const pointsOf = (s: Shape): (readonly [number, number])[] => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.flatMap((g) => [g.c1, g.c2, g.p])]);

/** What can't change within a segment: how many pieces, their segments and their style (without opacity). */
const topology = (shapes: Shape[]) =>
  JSON.stringify(shapes.map((s) => [s.subpaths.map((sp) => [sp.segs.length, sp.closed]), { ...s.style, opacity: undefined }]));

/**
 * The matrix that takes points P to Q, if it is an undistorted motion: move, rotate and scale (also
 * different in X and Y, or flipped), without shear. null if the piece changed shape.
 */
function fitRigid(P: (readonly [number, number])[], Q: (readonly [number, number])[], tol = 0.05): Mat | null {
  const n = P.length;
  if (!n || n !== Q.length) return null;
  // Three well-separated points (the largest triangle found quickly).
  const d2 = (a: readonly [number, number], b: readonly [number, number]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  let i1 = 0;
  for (let k = 1; k < n; k++) if (d2(P[k]!, P[0]!) > d2(P[i1]!, P[0]!)) i1 = k;
  const area = (k: number) => Math.abs((P[i1]![0] - P[0]![0]) * (P[k]![1] - P[0]![1]) - (P[i1]![1] - P[0]![1]) * (P[k]![0] - P[0]![0]));
  let i2 = 0;
  for (let k = 1; k < n; k++) if (area(k) > area(i2)) i2 = k;
  let m: Mat;
  if (area(i2) > 1e-6) {
    // Affine from three points.
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
    // All on a line: similarity from two points.
    const [px, py] = [P[i1]![0] - P[0]![0], P[i1]![1] - P[0]![1]];
    const [qx, qy] = [Q[i1]![0] - Q[0]![0], Q[i1]![1] - Q[0]![1]];
    const den = px * px + py * py;
    const a = (px * qx + py * qy) / den, b = (px * qy - py * qx) / den;
    m = [a, b, -b, a, Q[0]![0] - (a * P[0]![0] - b * P[0]![1]), Q[0]![1] - (b * P[0]![0] + a * P[0]![1])];
  } else {
    m = [1, 0, 0, 1, Q[0]![0] - P[0]![0], Q[0]![1] - P[0]![1]];
  }
  // The closest without shear (rotate and scale in X and Y), which is what Lottie can animate; with the same
  // centre (the mean of the points). Valid if it takes every point to its place.
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

