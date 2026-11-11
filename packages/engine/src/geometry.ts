import type { FilterChain } from './chain';
// Internal geometry: everything is a cubic curve. A shape has subpaths and a style.

export type Vec2 = readonly [number, number];

/** A cubic segment; its start point is the end of the previous segment (or `start`). */
export interface Cubic {
  c1: Vec2;
  c2: Vec2;
  p: Vec2;
}

export interface SubPath {
  start: Vec2;
  segs: Cubic[];
  closed: boolean;
}

export type Style = Record<string, string>;

export interface Shape {
  subpaths: SubPath[];
  style: Style;
  /** Copy number given by Clone (for effectors like Step). */
  clone?: number;
  /** In a text: which word and which line the letter belongs to (for Range by words or lines). */
  word?: number;
  line?: number;
  /** Scene object it comes from (to select it on the canvas). */
  node?: string;
  /** Gradients its style uses (`fill="url(#id)"`); the renderer writes them in <defs>. */
  gradients?: Gradient[];
  /** Filter groups wrapping it, from outside in (ids of `Geometry.filters`). */
  wrap?: string[];
}

/** An SVG filter for a group of shapes: its primitives and the area it covers (in the document). */
export interface FilterDef {
  markup: string;
  region: [number, number, number, number];
  /**
   * `mask`: not a filter but a mask (`<mask>`): `markup` is what draws it, already in the document.
   * `alpha`: the shape counts (its opacity), not its colours.
   */
  kind?: 'filter' | 'mask';
  alpha?: boolean;
}

/** Gradient relative to each shape's box (objectBoundingBox): it follows the shape when moved or scaled. */
export interface Gradient {
  id: string;
  kind: 'linear' | 'radial';
  stops: { offset: number; color: string; opacity?: number }[];
  /** Linear: from (x1, y1) to (x2, y2), in fractions of the box. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** Radial: centre, radius and focus (the brightest point), in fractions of the box. */
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
}

export interface Geometry {
  shapes: Shape[];
  /** viewBox of the source SVG: [x, y, width, height]. */
  viewBox: [number, number, number, number];
  /** SVG filters (shadow, blur…) of the objects that have them, by id. See `Shape.wrap`. */
  filters?: Record<string, FilterDef>;
  /**
   * Only in a node's source: the point placed at its position (x, y). Without it, the centre of its
   * box. A left-anchored text doesn't move when its words change.
   */
  origin?: Vec2;
  /**
   * Filters that only go on part of the drawing (what is inside RGB Split: the coloured copies), by
   * key. The shapes that carry them have `@key` in their `wrap`; when the node is placed they become
   * real filters (with their id and area). `ref`: the box of that part, for zoned filters.
   */
  inner?: Record<string, { chain: FilterChain; ref: Bounds }>;
}

/** The inner filters of `before` that `after` lacks (an effect that rebuilt the geometry): they are kept. */
export function keepInner(before: Geometry, after: Geometry): Geometry {
  if (!before.inner || after === before) return after;
  return { ...after, inner: { ...before.inner, ...after.inner } };
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** A straight line as a cubic (controls at one and two thirds). */
export const line = (a: Vec2, b: Vec2): Cubic => ({ c1: lerp(a, b, 1 / 3), c2: lerp(a, b, 2 / 3), p: b });

/** Splits a cubic at t (de Casteljau). */
export function splitCubic(p0: Vec2, s: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, s.c1, t);
  const b = lerp(s.c1, s.c2, t);
  const c = lerp(s.c2, s.p, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const m = lerp(d, e, t);
  return [
    { c1: a, c2: d, p: m },
    { c1: e, c2: c, p: s.p },
  ];
}

/** Approximate length from the control polygon (an upper bound, enough to subdivide). */
const hullLength = (p0: Vec2, s: Cubic) => dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p);

/**
 * Subdivides every segment until none is longer than `maxLength`.
 * Needed before deforming: a long curve with only two controls doesn't bend.
 */
export function subdivide(geo: Geometry, maxLength: number): Geometry {
  return mapSubPaths(geo, (sp) => {
    const segs: Cubic[] = [];
    let p0 = sp.start;
    for (const s of sp.segs) {
      const n = Math.max(1, Math.ceil(hullLength(p0, s) / maxLength));
      let rest = s;
      let from = p0;
      for (let i = n; i > 1; i--) {
        const [a, b] = splitCubic(from, rest, 1 / i);
        segs.push(a);
        from = a.p;
        rest = b;
      }
      segs.push(rest);
      p0 = s.p;
    }
    return { start: sp.start, segs, closed: sp.closed };
  });
}

export function mapSubPaths(geo: Geometry, fn: (sp: SubPath, shape: Shape) => SubPath): Geometry {
  return {
    viewBox: geo.viewBox,
    shapes: geo.shapes.map((shape) => ({ ...shape, subpaths: shape.subpaths.map((sp) => fn(sp, shape)) })),
  };
}

/** Applies a function to every point (anchors and controls). */
export function mapPoints(geo: Geometry, fn: (p: Vec2) => Vec2): Geometry {
  return mapSubPaths(geo, (sp) => ({
    start: fn(sp.start),
    segs: sp.segs.map((s) => ({ c1: fn(s.c1), c2: fn(s.c2), p: fn(s.p) })),
    closed: sp.closed,
  }));
}

/** Box containing every point (controls included). */
export function bounds(geo: Geometry): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Vec2) => {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  };
  for (const shape of geo.shapes) {
    for (const sp of shape.subpaths) {
      add(sp.start);
      for (const s of sp.segs) {
        add(s.c1);
        add(s.c2);
        add(s.p);
      }
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Cubic evaluated at t. */
export function cubicAt(p0: Vec2, s: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p[0],
    a * p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p[1],
  ];
}

/** Subpath → polyline (fixed samples per segment; enough for inside/outside tests). */
export function flatten(sp: SubPath, samplesPerSegment = 8): Vec2[] {
  const pts: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const s of sp.segs) {
    for (let i = 1; i <= samplesPerSegment; i++) pts.push(cubicAt(p0, s, i / samplesPerSegment));
    p0 = s.p;
  }
  return pts;
}

/** Point inside a set of polygons, by the even-odd rule (respects holes). */
export function insidePolygons(polys: Vec2[][], [x, y]: Vec2): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Centre of a drawing that doesn't change when it turns: the centroid of its surfaces (closed; holes
 * subtract if they wind the other way) or, without any, the mean of its points. Null if empty.
 */
export function centroid(geo: Geometry): Vec2 | null {
  let a = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
  for (const s of geo.shapes) {
    for (const sp of s.subpaths) {
      const pts = flatten(sp, 8);
      for (const q of pts) (sx += q[0]), (sy += q[1]), n++;
      if (!sp.closed) continue;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!, q = pts[(i + 1) % pts.length]!;
        const c = p[0] * q[1] - q[0] * p[1];
        a += c;
        cx += (p[0] + q[0]) * c;
        cy += (p[1] + q[1]) * c;
      }
    }
  }
  if (Math.abs(a) > 1e-9) return [cx / (3 * a), cy / (3 * a)];
  return n ? [sx / n, sy / n] : null;
}
