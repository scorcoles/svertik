import type { FilterChain } from './chain';
import type { Mat } from './matrix';
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

/** Transform controls nested in Rigid Pieces wait for a downstream deformer to act. */
export interface RigidPieceTransform {
  type: 'transform' | 'rotate3d';
  params: Record<string, unknown>;
}

export interface NetworkNodeRef { networkId: string; node: number }
export interface NetworkLinkRef { networkId: string; from: number; to: number }

/** Initial motion metadata consumed by the next rigid-body simulation. */
export interface Impulse {
  velocity: Vec2;
  spin: number;
  immovable?: boolean;
}

export interface SoftMaterial {
  mode: string; body: string; stiffness: number; bending: number; volume: number; damping: number; recovery: number; pins: string; segments: number;
}

export interface Shape {
  /** Material properties only; motion is evaluated by Gravity or Physics. */
  softBody?: SoftMaterial;
  /** Range IDs which affect this element; diagnostic only, never scene state. */
  rangeSelections?: string[];
  /** Runtime material frame, from pre-motion geometry to current stack coordinates. */
  patternTransform?: Mat;
  /** Runtime rigid-body grouping, independent of the per-element clone indices used by effectors. */
  bodyGroup?: number;
  /** Elements marked by Rigid Pieces; compatible deformers move each group without bending it. */
  rigidGroup?: number;
  /** Mix between normal pointwise deformation (0) and whole-piece rigid motion (1). */
  rigidAmount?: number;
  /** Deferred per-piece transforms; consumed by the first downstream deformer that changes this piece. */
  rigidTransforms?: RigidPieceTransform[];
  /** Runtime graph node identities used to keep Network links attached during rigid-body motion. */
  networkNodes?: NetworkNodeRef[];
  /** Runtime endpoints for a Network link; Gravity uses the attached nodes' body transforms. */
  networkLink?: NetworkLinkRef;
  /** Anchor point used when compatible deformers rotate this rigid piece. */
  rigidPivot?: 'center' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  impulse?: Impulse;
  /** Embedded or linked raster image carried by a rectangular path footprint. */
  image?: { href: string; width: number; height: number; preserveAspectRatio: string };
  subpaths: SubPath[];
  style: Style;
  /** Copy number given by Clone (for effectors like Step). */
  clone?: number;
  /** Original zero-based cell of a Clone grid (a packed tile uses its top-left cell). */
  gridRow?: number;
  gridColumn?: number;
  /** Mirror branch path, used to keep generated filters' raster regions local. */
  filterRegion?: string;
  /** Runtime input emission, shared by copies from one Mouse event. */
  emission?: number;
  /** Internal tag for keeping a parent's nested shapes in one time signal. */
  signalGroup?: number;
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
  /** Coordinate system: relative to the shape's box (default) or in user space. */
  gradientUnits?: 'objectBoundingBox' | 'userSpaceOnUse';
  /** Transform applied to the gradient (SVG transform value). */
  gradientTransform?: string;
  /** How the gradient extends beyond its bounds. */
  spreadMethod?: 'pad' | 'reflect' | 'repeat';
  /** Reference to another gradient (its id), whose attributes/stops are inherited. */
  href?: string;
  /** Linear: from (x1, y1) to (x2, y2), in fractions of the box (or user units). */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** Radial: centre, radius and focus (the brightest point), in fractions of the box (or user units). */
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
  /** Radial: focal radius (SVG2). */
  fr?: number;
}

export interface Geometry {
  shapes: Shape[];
  /** Runtime diagnostics from effects, collected by the document evaluator for editor feedback. */
  diagnostics?: { code: string; effectId?: string; message: string }[];
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

/** Maps geometry while preserving marked pieces as rigid translations and rotations. */
export function mapDeformer(geo: Geometry, fn: (p: Vec2) => Vec2, maxLength = 0): Geometry {
  if (!geo.shapes.some((shape) => shape.rigidGroup !== undefined)) {
    return mapPoints(maxLength > 0 ? subdivide(geo, maxLength) : geo, fn);
  }
  const flexible = geo.shapes.filter((shape) => shape.rigidGroup === undefined);
  const refined = maxLength > 0 && flexible.length
    ? subdivide({ viewBox: geo.viewBox, shapes: flexible }, maxLength).shapes
    : flexible;
  let flexibleIndex = 0;
  const shapes = geo.shapes.map((shape) => shape.rigidGroup === undefined ? refined[flexibleIndex++]! : shape);
  const groups = new Map<number, Shape[]>();
  for (const shape of shapes) if (shape.rigidGroup !== undefined) {
    const group = groups.get(shape.rigidGroup) ?? [];
    group.push(shape);
    groups.set(shape.rigidGroup, group);
  }
  const transforms = new Map<number, (point: Vec2) => Vec2>();
  const activated = new Set<number>();
  for (const [id, members] of groups) {
    const b = bounds({ viewBox: geo.viewBox, shapes: members });
    const pivot = members[0]?.rigidPivot ?? 'center';
    const fractions: Record<NonNullable<Shape['rigidPivot']>, Vec2> = {
      center: [0.5, 0.5], n: [0.5, 0], ne: [1, 0], e: [1, 0.5], se: [1, 1],
      s: [0.5, 1], sw: [0, 1], w: [0, 0.5], nw: [0, 0],
    };
    const [fx, fy] = fractions[pivot];
    const anchor: Vec2 = [b.x + b.width * fx, b.y + b.height * fy];
    const target = fn(anchor);
    const epsilon = Math.max(Math.hypot(b.width, b.height) * 1e-4, 1e-3);
    let vx = fn([anchor[0] + epsilon, anchor[1]])[0] - target[0];
    let vy = fn([anchor[0] + epsilon, anchor[1]])[1] - target[1];
    if (Math.hypot(vx, vy) < 1e-10) {
      const vertical = fn([anchor[0], anchor[1] + epsilon]);
      vx = vertical[1] - target[1];
      vy = target[0] - vertical[0];
    }
    const angle = Math.atan2(vy, vx), c = Math.cos(angle), s = Math.sin(angle);
    const amount = Math.max(0, Math.min(1, members[0]?.rigidAmount ?? 1));
    const pieceChanged = members.some((shape) => shape.subpaths.some((path) => {
      const points = [path.start, ...path.segs.flatMap((seg) => [seg.c1, seg.c2, seg.p])];
      return points.some((point) => {
        const moved = fn(point);
        return Math.hypot(moved[0] - point[0], moved[1] - point[1]) > 1e-6;
      });
    }));
    let rigidMap = ([x, y]: Vec2): Vec2 => {
      const dx = x - anchor[0], dy = y - anchor[1];
      return [target[0] + dx * c - dy * s, target[1] + dx * s + dy * c];
    };
    if (pieceChanged && amount > 0) {
      for (const operation of members[0]?.rigidTransforms ?? []) {
        const current = mapPoints({ viewBox: geo.viewBox, shapes: members }, rigidMap);
        const box = bounds(current);
        const params = operation.params;
        const px = box.x + box.width * (pivot === 'nw' || pivot === 'w' || pivot === 'sw' ? 0 : pivot === 'ne' || pivot === 'e' || pivot === 'se' ? 1 : 0.5);
        const py = box.y + box.height * (pivot === 'nw' || pivot === 'n' || pivot === 'ne' ? 0 : pivot === 'sw' || pivot === 's' || pivot === 'se' ? 1 : 0.5);
        const previous = rigidMap;
        if (operation.type === 'transform') {
          const rotation = (Number(params.rotation ?? 0) * Math.PI) / 180;
          const scale = Number(params.scale ?? 1);
          const co = Math.cos(rotation) * scale, si = Math.sin(rotation) * scale;
          const tx = Number(params.x ?? 0), ty = Number(params.y ?? 0);
          rigidMap = (point) => {
            const [x, y] = previous(point), dx = x - px, dy = y - py;
            return [px + dx * co - dy * si + tx, py + dx * si + dy * co + ty];
          };
        } else {
          const rx = (Number(params.rotateX ?? 30) * Math.PI) / 180;
          const ry = (Number(params.rotateY ?? 0) * Math.PI) / 180;
          const rz = (Number(params.rotateZ ?? 0) * Math.PI) / 180;
          const [sx, cx] = [Math.sin(rx), Math.cos(rx)];
          const [sy, cy] = [Math.sin(ry), Math.cos(ry)];
          const [sz, cz] = [Math.sin(rz), Math.cos(rz)];
          const distance = Number(params.perspective ?? 2) * Math.max(box.width, box.height);
          rigidMap = (point) => {
            let [x, y] = previous(point);
            x -= px; y -= py;
            let z = 0;
            [x, y] = [x * cz - y * sz, x * sz + y * cz];
            [y, z] = [y * cx - z * sx, y * sx + z * cx];
            [x, z] = [x * cy + z * sy, -x * sy + z * cy];
            const f = distance / Math.max(distance - z, distance * 0.05);
            return [px + x * f, py + y * f];
          };
        }
      }
      activated.add(id);
    }
    transforms.set(id, (source) => {
      const flexible = fn(source);
      if (amount === 0) return flexible;
      const rigid = rigidMap(source);
      return [flexible[0] + (rigid[0] - flexible[0]) * amount, flexible[1] + (rigid[1] - flexible[1]) * amount];
    });
  }
  const moved = mapSubPaths({ viewBox: geo.viewBox, shapes }, (path, shape) => {
    const map = shape.rigidGroup === undefined ? fn : transforms.get(shape.rigidGroup)!;
    return {
      start: map(path.start),
      segs: path.segs.map((segment) => ({ c1: map(segment.c1), c2: map(segment.c2), p: map(segment.p) })),
      closed: path.closed,
    };
  });
  if (activated.size) moved.shapes = moved.shapes.map((shape) => shape.rigidGroup !== undefined && activated.has(shape.rigidGroup)
    ? (({ rigidTransforms: _pending, ...rest }) => rest)(shape)
    : shape);
  return moved;
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
/** Samples per segment of `centroid`. */
const SAMPLES = 8;

export function centroid(geo: Geometry, m?: readonly number[]): Vec2 | null {
  // With `m`, the centroid of the drawing transformed (its points mapped before being sampled), with
  // nothing allocated: `flatten` would build a point per sample just to add it up.
  const mm = m ?? [1, 0, 0, 1, 0, 0];
  const m0 = mm[0]!, m1 = mm[1]!, m2 = mm[2]!, m3 = mm[3]!, m4 = mm[4]!, m5 = mm[5]!;
  let a = 0, cx = 0, cy = 0, n = 0, sx = 0, sy = 0;
  for (const s of geo.shapes) {
    for (const sp of s.subpaths) {
      // The first point of the subpath, and the previous one as it is sampled.
      let px = m0 * sp.start[0] + m2 * sp.start[1] + m4;
      let py = m1 * sp.start[0] + m3 * sp.start[1] + m5;
      const fx = px, fy = py;
      let qx = px, qy = py;
      sx += px; sy += py; n++;
      for (const seg of sp.segs) {
        const c1x = m0 * seg.c1[0] + m2 * seg.c1[1] + m4, c1y = m1 * seg.c1[0] + m3 * seg.c1[1] + m5;
        const c2x = m0 * seg.c2[0] + m2 * seg.c2[1] + m4, c2y = m1 * seg.c2[0] + m3 * seg.c2[1] + m5;
        const ex = m0 * seg.p[0] + m2 * seg.p[1] + m4, ey = m1 * seg.p[0] + m3 * seg.p[1] + m5;
        for (let i = 1; i <= SAMPLES; i++) {
          const t = i / SAMPLES, u = 1 - t;
          const A = u * u * u, B = 3 * u * u * t, C = 3 * u * t * t, D = t * t * t;
          const x = A * px + B * c1x + C * c2x + D * ex;
          const y = A * py + B * c1y + C * c2y + D * ey;
          sx += x; sy += y; n++;
          if (sp.closed) {
            const c = qx * y - x * qy;
            a += c;
            cx += (qx + x) * c;
            cy += (qy + y) * c;
          }
          qx = x; qy = y;
        }
        px = ex; py = ey;
      }
      if (sp.closed) {
        const c = qx * fy - fx * qy;
        a += c;
        cx += (qx + fx) * c;
        cy += (qy + fy) * c;
      }
    }
  }
  if (Math.abs(a) > 1e-9) return [cx / (3 * a), cy / (3 * a)];
  return n ? [sx / n, sy / n] : null;
}
