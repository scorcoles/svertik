/// <reference path="../earcut.d.ts" />
// Coupled rigid bodies: exterior contours are triangulated, then merged into convex parts.
import earcut from 'earcut';
import { regionOf, simplify } from '../clip';
import { bounds, type Geometry, type Impulse, type Vec2 } from '../geometry';
import { gravityBody, type Body, type FallPose } from './gravity-physics';

export interface CollisionBody {
  body: Body;
  parts: Vec2[][];
  impulse?: Impulse;
  fixed?: boolean;
  /** Generated strokes may intentionally cross when born; do not eject those initial overlaps. */
  lineBody?: boolean;
  /** Its own forces (a Gravity under Physics): acceleration added to the world's, and its floors. */
  acceleration?: Vec2;
  planes?: Plane[];
}
/** A body's state: where its centre is, its angle, and how fast both change. */
export interface State { x: number; y: number; angle: number; vx: number; vy: number; omega: number }
interface Box { x0: number; y0: number; x1: number; y1: number }
interface Axis { x: number; y: number; min: number; max: number }
interface Polygon { points: Vec2[]; box: Box; axes: Axis[] }
interface Placed { index: number; state: State; polygons: () => Polygon[]; hull: Vec2[]; box: Box; im: number; ii: number }
interface Contact { a: Placed; b?: Placed; nx: number; ny: number; x: number; y: number; depth: number; normal: number; tangent: number; target: number }
const HZ = 120;
const INTERVAL = 30;
const cross = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const area = (ids: number[], points: Vec2[]) => Math.abs(ids.reduce((sum, id, i) => {
  const a = points[id]!, b = points[ids[(i + 1) % ids.length]!]!;
  return sum + a[0] * b[1] - a[1] * b[0];
}, 0)) / 2;

function convex(ids: number[], points: Vec2[]): number[] {
  const sorted = [...new Set(ids)].sort((a, b) => points[a]![0] - points[b]![0] || points[a]![1] - points[b]![1]);
  const half = (list: number[]) => {
    const out: number[] = [];
    for (const id of list) {
      while (out.length > 1 && cross(points[out[out.length - 2]!]!, points[out[out.length - 1]!]!, points[id]!) <= 1e-9) out.pop();
      out.push(id);
    }
    return out;
  };
  return [...half(sorted).slice(0, -1), ...half(sorted.reverse()).slice(0, -1)];
}

/** Merge neighbouring triangles only when their union is convex; never bridge a notch or hole. */
function mergeTriangles(triangles: number[], points: Vec2[]): Vec2[][] {
  const parts = new Map<number, number[]>();
  for (let i = 0; i < triangles.length; i += 3) parts.set(i, triangles.slice(i, i + 3));
  let changed = true;
  while (changed) {
    changed = false;
    const edges = new Map<string, number>();
    outer: for (const [id, polygon] of parts) for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const otherId = edges.get(key);
      if (otherId !== undefined) {
        const other = parts.get(otherId)!;
        const joined = convex([...polygon, ...other], points);
        if (joined.length <= 12 && Math.abs(area(joined, points) - area(polygon, points) - area(other, points)) < 1e-6) {
          parts.set(id, joined);
          parts.delete(otherId);
          changed = true;
          break outer;
        }
      }
      edges.set(key, id);
    }
  }
  return [...parts.values()].map((part) => part.map((i) => points[i]!));
}

/**
 * The collider of a drawing: its filled regions as convex parts. With `holes` (Physics), interior contours stay
 * open, so a hollow shape (a ring, an O) can contain bodies. Without it (Gravity), only each region's exterior
 * counts: letter counters and interior cuts are solid, while gaps between separate shapes stay open.
 */
export function collisionBody(geo: Geometry, body = gravityBody(geo), fixed = false, tolerance?: number, holes = false): CollisionBody | null {
  if (!body) return null;
  const b = bounds(geo), size = Math.max(b.width, b.height) || 1;
  const filled = geo.shapes.filter((shape) => shape.style.fill !== 'none' && shape.subpaths.some((p) => p.closed));
  const detail = tolerance ?? Math.max(size * 0.002, 0.25);
  const regions = simplify(regionOf(filled, Math.max(size / 100, detail * 2)), detail);
  const parts: Vec2[][] = [];
  for (const polygon of regions) {
    // Physics keeps interior contours (a hollow solid contains bodies); Gravity uses only the exterior.
    const rings = (holes ? polygon : polygon.slice(0, 1)).map((ring) => {
      const end = ring[ring.length - 1]!, first = ring[0]!;
      const open = end[0] === first[0] && end[1] === first[1] ? ring.slice(0, -1) : ring;
      return open.map(([x, y]): Vec2 => [x - body.center[0], y - body.center[1]]);
    });
    const points = rings.flat();
    const ids = points.map((_, i) => i);
    const outerIds = rings[0]!.map((_, i) => i);
    const envelope = convex(outerIds, points);
    // A convex exterior (notably O) must stay one collider: triangulation seams
    // otherwise supply contradictory normals to a fragment that starts inside it.
    if (rings.length === 1 && Math.abs(area(envelope, points) - area(ids, points)) < 1e-6) parts.push(envelope.map((i) => points[i]!));
    else {
      const holes: number[] = [];
      let offset = rings[0]!.length;
      for (const ring of rings.slice(1)) { holes.push(offset); offset += ring.length; }
      parts.push(...mergeTriangles(earcut(points.flat(), holes, 2), points));
    }
  }
  // A merged line drawing is an explicit body, even though its paint contains no filled area.
  // Use the envelope of its marks; ordinary independent open strokes retain floor-only dynamics.
  if (!holes && !parts.length && !filled.length && geo.shapes.some((s) => s.bodyGroup !== undefined) && body.points.length >= 3) parts.push(body.points);
  return { body, parts, fixed, impulse: geo.shapes[0]?.impulse, lineBody: !holes && geo.shapes.every((s) => s.bodyGroup !== undefined && s.style.fill === 'none') };
}

const boxOf = (points: Vec2[]): Box => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
};
const overlap = (a: Box, b: Box) => a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;

function polygonOf(points: Vec2[]): Polygon {
  const axes: Axis[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!;
    const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (length < 1e-10) continue;
    const x = -(q[1] - p[1]) / length, y = (q[0] - p[0]) / length;
    if (axes.some((axis) => Math.abs(axis.x * x + axis.y * y) > 1 - 1e-9)) continue;
    let min = Infinity, max = -Infinity;
    for (const p of points) { const value = p[0] * x + p[1] * y; min = Math.min(min, value); max = Math.max(max, value); }
    axes.push({ x, y, min, max });
  }
  return { points, box: boxOf(points), axes };
}

/** The nearest point on a convex solid; an interior point is already in the solid. */
function nearestOnPolygon(point: Vec2, polygon: Polygon): Vec2 {
  if (polygon.axes.every(({ x, y, min, max }) => {
    const value = point[0] * x + point[1] * y;
    return value >= min - 1e-9 && value <= max + 1e-9;
  })) return point;
  let nearest: Vec2 = polygon.points[0] ?? point;
  let distance2 = Infinity;
  for (let i = 0; i < polygon.points.length; i++) {
    const a = polygon.points[i]!, b = polygon.points[(i + 1) % polygon.points.length]!;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const t = length2 > 1e-12 ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
    const candidate: Vec2 = [a[0] + dx * t, a[1] + dy * t];
    const d2 = (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2;
    if (d2 < distance2) { nearest = candidate; distance2 = d2; }
  }
  return nearest;
}

/** The nearest point in a body's filled region; decomposed holes remain empty. */
function nearestOnBody(point: Vec2, polygons: Polygon[], hull: Vec2[]): Vec2 {
  const parts = polygons.length ? polygons : hull.length >= 3 ? [polygonOf(hull)] : [];
  let nearest = point, distance2 = Infinity;
  for (const polygon of parts) {
    const candidate = nearestOnPolygon(point, polygon);
    const d2 = (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2;
    if (d2 < distance2) { nearest = candidate; distance2 = d2; }
  }
  return nearest;
}

/** SAT with a two-point support manifold. Normal points from A into B. */
function manifold(a: Polygon, b: Polygon): { nx: number; ny: number; depth: number; points: Vec2[] } | null {
  if (!overlap(a.box, b.box)) return null;
  let depth = Infinity, nx = 0, ny = 0;
  for (let owner = 0; owner < 2; owner++) for (const axis of (owner === 0 ? a : b).axes) {
    const ax = axis.x, ay = axis.y;
    let a0 = owner === 0 ? axis.min : Infinity, a1 = owner === 0 ? axis.max : -Infinity;
    let b0 = owner === 1 ? axis.min : Infinity, b1 = owner === 1 ? axis.max : -Infinity;
    if (owner === 1) for (const [x, y] of a.points) { const v = x * ax + y * ay; a0 = Math.min(a0, v); a1 = Math.max(a1, v); }
    else for (const [x, y] of b.points) { const v = x * ax + y * ay; b0 = Math.min(b0, v); b1 = Math.max(b1, v); }
    const left = a1 - b0, right = b1 - a0;
    if (left <= 0 || right <= 0) return null;
    if (Math.min(left, right) < depth) { depth = Math.min(left, right); const sign = left < right ? 1 : -1; nx = ax * sign; ny = ay * sign; }
  }
  if (!Number.isFinite(depth)) return null;
  const tx = -ny, ty = nx;
  const aMax = Math.max(...a.points.map(([x, y]) => x * nx + y * ny));
  const bMin = Math.min(...b.points.map(([x, y]) => x * nx + y * ny));
  const feature = (points: Vec2[], limit: number, sign: number) => {
    const values = points.filter(([x, y]) => sign * (x * nx + y * ny - limit) > -1e-5).map(([x, y]) => x * tx + y * ty);
    return [Math.min(...values), Math.max(...values)];
  };
  const af = feature(a.points, aMax, 1), bf = feature(b.points, bMin, -1);
  let lo = Math.max(af[0]!, bf[0]!), hi = Math.min(af[1]!, bf[1]!);
  if (lo > hi) lo = hi = (lo + hi) / 2;
  const normal = (aMax + bMin) / 2;
  const point = (t: number): Vec2 => [nx * normal + tx * t, ny * normal + ty * t];
  return { nx, ny, depth, points: hi - lo > 1e-5 ? [point(lo), point(hi)] : [point(lo)] };
}


/** A solid half-plane (a floor): `normal` points into the solid, so a floor below has normal [0, 1]. */
export interface Plane { point: Vec2; normal: Vec2 }

/** What every body of one world shares: forces and contact settings. Per-body forces live on each body. */
export interface StepSettings {
  acceleration: Vec2;
  planes: Plane[];
  friction: number;
  bounce: number;
  collide: boolean;
  /** Angular damping while touching (Gravity: 1; Physics: 0). */
  contactDamping: number;
  /** Air drag (1/s): every moving body loses this fraction of its speed and spin per second, continuously. */
  damping?: number;
}

/**
 * One fixed set of bodies, stepped forward. A world whose bodies change (a click adds one, a fracture
 * replaces one) swaps steppers and carries the states over; the stepper itself never looks at time.
 */
export interface Stepper {
  bodies: CollisionBody[];
  /** The state each body starts in: the given one, or at rest where it is with its impulse. */
  initial(start?: (State | undefined)[]): State[];
  /** Pairs of line bodies born overlapping (hatching strokes): ignored until they separate. `fresh`: only pairs with one of these. */
  pendingOf(states: State[], fresh?: Set<number>): Set<number>;
  advance(states: State[], pending: Set<number>, dt: number): { states: State[]; pending: Set<number> };
}

function place(collider: CollisionBody, state: State, index: number): Placed {
  const { body, parts, fixed } = collider, c = Math.cos(state.angle), s = Math.sin(state.angle);
  const { x: ox, y: oy } = state;
  const point = ([x, y]: Vec2): Vec2 => [ox + x * c - y * s, oy + x * s + y * c];
  let mesh: Polygon[] | undefined;
  const polygons = () => mesh ??= parts.map((part) => polygonOf(part.map(point)));
  const hull = body.points.map(point);
  return { index, state, polygons, hull, box: boxOf(hull), im: fixed ? 0 : 1 / body.mass, ii: fixed ? 0 : 1 / (body.mass * body.inertia) };
}
function cells(box: Box, size: number, visit: (key: string) => void) {
  for (let x = Math.floor(box.x0 / size); x <= Math.floor(box.x1 / size); x++) for (let y = Math.floor(box.y0 / size); y <= Math.floor(box.y1 / size); y++) visit(`${x}:${y}`);
}

interface StaticIndex { cell: number; grid: Map<string, number[]>; parts: { owner: Placed; polygon: Polygon }[]; box: Box }

export function createStepper(bodies: CollisionBody[], settings: StepSettings): Stepper {
  const { acceleration, friction, bounce, collide, contactDamping } = settings;
  const size = Math.max(...bodies.filter((b) => !b.fixed).map((b) => Math.sqrt(b.body.inertia)), 1);
  const attractionSize = Math.max(...bodies.map((b) => Math.sqrt(b.body.inertia)), 1);
  const slop = size * 0.0001;
  const accelerationOf = bodies.map((b): Vec2 => [acceleration[0] + (b.acceleration?.[0] ?? 0), acceleration[1] + (b.acceleration?.[1] ?? 0)]);
  const planesOf = bodies.map((b) => b.planes?.length ? [...settings.planes, ...b.planes] : settings.planes);
  // Slow approaches don't bounce: bodies resting against each other (pieces of a fracture, a stack) stay in contact
  // instead of trading tiny rebounds. Without acceleration the floor of size × 0.5/s keeps it above zero.
  const strongest = Math.max(Math.hypot(...acceleration), ...accelerationOf.map((a) => Math.hypot(...a)));
  const restitutionThreshold = Math.max(Math.sqrt(strongest * size) * 0.05, size * 0.5);
  // Fixed bodies never move while this stepper lives: their convex parts go in a spatial hash, once.
  let fixed: StaticIndex | undefined;
  const staticIndex = (states: State[]): StaticIndex => {
    if (fixed) return fixed;
    const index: StaticIndex = { cell: Math.max(32, size), grid: new Map(), parts: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };
    bodies.forEach((collider, i) => {
      if (!collider.fixed) return;
      const owner = place(collider, states[i]!, i);
      for (const polygon of owner.polygons()) {
        index.box.x0 = Math.min(index.box.x0, polygon.box.x0); index.box.y0 = Math.min(index.box.y0, polygon.box.y0);
        index.box.x1 = Math.max(index.box.x1, polygon.box.x1); index.box.y1 = Math.max(index.box.y1, polygon.box.y1);
        const id = index.parts.length;
        index.parts.push({ owner, polygon });
        cells(polygon.box, index.cell, (key) => { const list = index.grid.get(key) ?? []; list.push(id); index.grid.set(key, list); });
      }
    });
    return fixed = index;
  };

  // Pinned bodies (Rigid Body › Pin): a point of the body held where it is in the input, turning about it.
  // `anchor` is that point in the body's own frame (from its centre at rest); `at`, where it is held.
  const pins = bodies.map(({ body, fixed, impulse }) => !fixed && impulse?.pin ? { anchor: [impulse.pin[0] - body.center[0], impulse.pin[1] - body.center[1]] as Vec2, at: impulse.pin } : null);
  const pinned = pins.some(Boolean);
  const armOf = (i: number, state: State): Vec2 => {
    const [ax, ay] = pins[i]!.anchor, c = Math.cos(state.angle), s = Math.sin(state.angle);
    return [ax * c - ay * s, ax * s + ay * c];
  };
  /** Puts each pinned body back on its pin (keeping its angle). */
  const holdPins = (states: State[]) => {
    if (pinned) pins.forEach((pin, i) => {
      if (!pin) return;
      const [rx, ry] = armOf(i, states[i]!);
      states[i]!.x = pin.at[0] - rx; states[i]!.y = pin.at[1] - ry;
    });
  };
  /** Cancels the speed of each pinned body's pinned point (an impulse there: it keeps turning about it). */
  const stopPins = (states: State[]) => {
    if (pinned) pins.forEach((pin, i) => {
      if (!pin) return;
      const state = states[i]!, { body } = bodies[i]!;
      const im = 1 / body.mass, ii = 1 / (body.mass * body.inertia);
      const [rx, ry] = armOf(i, state);
      const vx = state.vx - state.omega * ry, vy = state.vy + state.omega * rx;
      const a = im + ii * ry * ry, b = -ii * rx * ry, d = im + ii * rx * rx, det = a * d - b * b;
      if (Math.abs(det) < 1e-18) return;
      const px = -(d * vx - b * vy) / det, py = -(-b * vx + a * vy) / det;
      state.vx += px * im; state.vy += py * im; state.omega += (rx * py - ry * px) * ii;
    });
  };

  const initial = (start?: (State | undefined)[]) => bodies.map(({ body, fixed, impulse }, i): State => {
    // A body that takes over from another (when the pieces change) starts where that one left off.
    const given = start?.[i];
    if (given) return { ...given };
    const [vx, vy] = fixed ? [0, 0] : impulse?.velocity ?? [0, 0];
    return { x: body.center[0], y: body.center[1], angle: 0, vx, vy, omega: fixed ? 0 : impulse?.spin ?? 0 };
  });

  const pendingOf = (states: State[], fresh?: Set<number>) => {
    const pending = new Set<number>();
    if (!collide) return pending;
    // A hatching screen is born with crossing strokes. Ignore only those initial pairs until
    // they separate; later contacts use the normal solver, on both solids and the floor.
    const lines = bodies.flatMap((b, i) => b.lineBody && !b.fixed ? [place(b, states[i]!, i)] : []).sort((a, b) => a.box.x0 - b.box.x0 || a.index - b.index);
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i]!, b = lines[j]!;
      if (b.box.x0 > a.box.x1) break;
      if (fresh && !fresh.has(a.index) && !fresh.has(b.index)) continue;
      if (overlap(a.box, b.box) && a.polygons().some((pa) => b.polygons().some((pb) => !!manifold(pa, pb)))) {
        pending.add(Math.min(a.index, b.index) * bodies.length + Math.max(a.index, b.index));
      }
    }
    return pending;
  };

  const advance = (before: State[], pending: Set<number>, dt: number) => {
    const index = staticIndex(before);
    const stillPending = new Set<number>();
    const attractors = bodies.flatMap((collider, i) => {
      const impulse = collider.impulse;
      if (!impulse?.attractor || (!(impulse.attractionStrength ?? 1) && !(impulse.attractionAbsorption ?? 0)) || !before[i]) return [];
      const placed = place(collider, before[i]!, i);
      return [{ index: i, strength: Math.max(0, impulse.attractionStrength ?? 1), absorption: Math.max(0, Math.min(1, impulse.attractionAbsorption ?? 0.5)), range: Math.max(0, impulse.attractionRange ?? 0) * attractionSize, polygons: placed.polygons(), hull: placed.hull }];
    });
    const bodyAccelerations = before.map((_, i): [number, number] => [accelerationOf[i]![0], accelerationOf[i]![1]]);
    for (const source of attractors) {
      const sourceBody = bodies[source.index]!;
      for (let i = 0; i < before.length; i++) {
        const targetBody = bodies[i]!;
        if (i === source.index || targetBody.fixed) continue;
        const state = before[i]!;
        const target = nearestOnBody([state.x, state.y], source.polygons, source.hull);
        const dx = target[0] - state.x, dy = target[1] - state.y;
        const distance2 = dx * dx + dy * dy;
        if ((source.range > 0 && distance2 > source.range * source.range) || distance2 < 1e-12) continue;
        const distance = Math.sqrt(distance2);
        const directionX = dx / distance, directionY = dy / distance;
        if (source.strength > 0) {
          const inverseDistance = 1 / Math.sqrt(Math.max(distance2, attractionSize * attractionSize * 0.0004, 1));
          // Inverse-square field: Strength is the acceleration fraction of the largest body's scale at that distance.
          // Cap the singularity near the attractor so a close pass cannot launch a body out of the simulation.
          const magnitude = Math.min(source.strength * attractionSize * 20, source.strength * attractionSize * attractionSize * attractionSize * inverseDistance * inverseDistance);
          bodyAccelerations[i]![0] += directionX * magnitude;
          bodyAccelerations[i]![1] += directionY * magnitude;
          // Attraction is reciprocal. A fixed attractor is a constraint, so its support absorbs the reaction force.
          if (!sourceBody.fixed) {
            const ratio = targetBody.body.mass / sourceBody.body.mass;
            bodyAccelerations[source.index]![0] -= directionX * magnitude * ratio;
            bodyAccelerations[source.index]![1] -= directionY * magnitude * ratio;
          }
        }
      }
    }
    const states = before.map((state, i) => {
      if (bodies[i]!.fixed) return { ...state };
      const [ax, ay] = bodyAccelerations[i]!;
      return { ...state, x: state.x + state.vx * dt + ax * dt * dt / 2, y: state.y + state.vy * dt + ay * dt * dt / 2, vx: state.vx + ax * dt, vy: state.vy + ay * dt, angle: state.angle + state.omega * dt };
    });
    holdPins(states);
    stopPins(states);
    // Only bodies that can touch something are placed: with no collisions between bodies, no solids and no
    // floor, a body moves freely and placing its outline every step would cost the most for nothing.
    const solid = index.parts.length > 0;
    const placed = bodies.flatMap((collider, i) => collider.fixed || !(collide || solid || planesOf[i]!.length) ? [] : [place(collider, states[i]!, i)]);
    const contacts: Contact[] = [];
    const absorptionOf = (i: number) => bodies[i]?.impulse?.attractor ? Math.max(0, Math.min(1, bodies[i]?.impulse?.attractionAbsorption ?? 0)) : 0;
    const add = (a: Placed, b: Placed | undefined, nx: number, ny: number, depth: number, points: Vec2[]) => {
      // Correct penetration once per manifold, independent of the number of contact points.
      const total = a.im + (b?.im ?? 0);
      if (!total) return;
      const absorption = Math.max(absorptionOf(a.index), b ? absorptionOf(b.index) : 0);
      const restitution = bounce * (1 - Math.max(0, Math.min(1, absorption)));
      const correction = Math.max(0, depth - slop) * 0.8 / total;
      // A pinned body can't be shifted: it turns about its pin, so that the contact moves out by as much.
      const push = (body: Placed, amount: number) => {
        const pin = pins[body.index];
        if (!pin) { body.state.x += nx * amount; body.state.y += ny * amount; return; }
        const [px, py] = points[0] ?? [body.state.x, body.state.y];
        const qx = px - pin.at[0], qy = py - pin.at[1], lever = -qy * nx + qx * ny;
        if (Math.abs(lever) < size * 1e-3) return;
        body.state.angle += Math.max(-0.2, Math.min(0.2, amount / lever));
        const [rx, ry] = armOf(body.index, body.state);
        body.state.x = pin.at[0] - rx; body.state.y = pin.at[1] - ry;
      };
      push(a, -correction * a.im);
      if (b) push(b, correction * b.im);
      for (const [x, y] of points) {
        const avx = a.state.vx - a.state.omega * (y - a.state.y), avy = a.state.vy + a.state.omega * (x - a.state.x);
        const bvx = b ? b.state.vx - b.state.omega * (y - b.state.y) : 0, bvy = b ? b.state.vy + b.state.omega * (x - b.state.x) : 0;
        const closing = (bvx - avx) * nx + (bvy - avy) * ny;
        contacts.push({ a, b, nx, ny, x, y, depth, normal: 0, tangent: 0, target: closing < -restitutionThreshold ? -closing * restitution : 0 });
      }
    };
    // Floors: only hull vertices can touch a plane; the deepest ones (one, or the two ends of a flat face) are contacts.
    for (const a of placed) if (a.im) for (const plane of planesOf[a.index]!) {
      const [px, py] = plane.point, [nx, ny] = plane.normal;
      const depthOf = (p: Vec2) => (p[0] - px) * nx + (p[1] - py) * ny;
      let deepest = -Infinity;
      for (const p of a.hull) deepest = Math.max(deepest, depthOf(p));
      if (deepest < -slop) continue;
      const face = a.hull.filter((p) => deepest - depthOf(p) < slop * 4 + 1e-6);
      const along = (p: Vec2) => p[0] * ny - p[1] * nx;
      const left = face.reduce((p, q) => along(p) < along(q) ? p : q), right = face.reduce((p, q) => along(p) > along(q) ? p : q);
      add(a, undefined, nx, ny, deepest, left === right ? [left] : [left, right]);
    }
    // Sweep-and-prune on body bounds before testing convex parts.
    const ordered = (collide ? placed : []).slice().sort((a, b) => a.box.x0 - b.box.x0 || a.index - b.index);
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!, b = ordered[j]!;
      if (b.box.x0 > a.box.x1) break;
      if ((!a.im && !b.im) || !overlap(a.box, b.box)) continue;
      const hits: NonNullable<ReturnType<typeof manifold>>[] = [];
      for (const pa of a.polygons()) for (const pb of b.polygons()) {
        const hit = manifold(pa, pb);
        if (!hit) continue;
        const same = hits.findIndex((h) => h.nx * hit.nx + h.ny * hit.ny > 0.98);
        if (same < 0) hits.push(hit);
        else if (hits[same]!.depth < hit.depth) hits[same] = hit;
      }
      const pair = Math.min(a.index, b.index) * bodies.length + Math.max(a.index, b.index);
      if (pending.has(pair) && hits.length) { stillPending.add(pair); continue; }
      for (const hit of hits.sort((a, b) => b.depth - a.depth).slice(0, 4)) add(a, b, hit.nx, hit.ny, hit.depth, hit.points);
    }
    for (const a of placed) {
      if (!overlap(a.box, index.box)) continue;
      const hits = new Map<Placed, NonNullable<ReturnType<typeof manifold>>[]>();
      for (const polygon of a.polygons()) {
        const candidates = new Set<number>();
        cells(polygon.box, index.cell, (key) => { for (const id of index.grid.get(key) ?? []) candidates.add(id); });
        for (const id of candidates) {
          const b = index.parts[id]!, hit = manifold(polygon, b.polygon);
          if (!hit) continue;
          const list = hits.get(b.owner) ?? [];
          const same = list.findIndex((h) => h.nx * hit.nx + h.ny * hit.ny > 0.98);
          if (same < 0) list.push(hit);
          else if (list[same]!.depth < hit.depth) list[same] = hit;
          hits.set(b.owner, list);
        }
      }
      for (const [b, list] of hits) for (const hit of list.sort((a, b) => b.depth - a.depth).slice(0, 4)) add(a, b, hit.nx, hit.ny, hit.depth, hit.points);
    }
    // Contacts are passive: they may lose energy but never create it. Simultaneous restitution in chains of
    // contacts (a light piece between a heavy one and a wall) can, so the bodies involved are scaled back.
    const involved = [...new Set(contacts.flatMap((c) => c.b ? [c.a, c.b] : [c.a]))].filter((p) => p.im);
    const energy = () => involved.reduce((sum, { state, im, ii }) => sum + (state.vx ** 2 + state.vy ** 2) / im + state.omega ** 2 / ii, 0);
    const energyBefore = energy();
    for (let iteration = 0; iteration < 12; iteration++) for (const contact of contacts) {
      const { a, b, nx, ny, x, y } = contact;
      const rx = x - a.state.x, ry = y - a.state.y, sx = b ? x - b.state.x : 0, sy = b ? y - b.state.y : 0;
      const relative = (ax: number, ay: number) => ((b ? b.state.vx - b.state.omega * sy : 0) - (a.state.vx - a.state.omega * ry)) * ax + ((b ? b.state.vy + b.state.omega * sx : 0) - (a.state.vy + a.state.omega * rx)) * ay;
      const apply = (amount: number, ax: number, ay: number) => {
        a.state.vx -= amount * ax * a.im; a.state.vy -= amount * ay * a.im; a.state.omega -= (rx * ay - ry * ax) * amount * a.ii;
        if (b) { b.state.vx += amount * ax * b.im; b.state.vy += amount * ay * b.im; b.state.omega += (sx * ay - sy * ax) * amount * b.ii; }
      };
      const normalMass = a.im + (b?.im ?? 0) + (rx * ny - ry * nx) ** 2 * a.ii + (sx * ny - sy * nx) ** 2 * (b?.ii ?? 0);
      const normal = Math.max(0, contact.normal + (contact.target - relative(nx, ny)) / normalMass);
      apply(normal - contact.normal, nx, ny); contact.normal = normal;
      const tx = -ny, ty = nx;
      const tangentMass = a.im + (b?.im ?? 0) + (rx * ty - ry * tx) ** 2 * a.ii + (sx * ty - sy * tx) ** 2 * (b?.ii ?? 0);
      const tangent = Math.max(-friction * normal, Math.min(friction * normal, contact.tangent - relative(tx, ty) / tangentMass));
      apply(tangent - contact.tangent, tx, ty); contact.tangent = tangent;
    }
    // Pins are solved with the contacts, so a pinned body passes on (and takes) pushes through its pin.
    if (pinned) for (let iteration = 0; iteration < 12; iteration++) {
      for (const contact of contacts) {
        if (!pins[contact.a.index] && !(contact.b && pins[contact.b.index])) continue;
        const { a, b, nx, ny, x, y } = contact;
        const rx = x - a.state.x, ry = y - a.state.y, sx = b ? x - b.state.x : 0, sy = b ? y - b.state.y : 0;
        const relative = ((b ? b.state.vx - b.state.omega * sy : 0) - (a.state.vx - a.state.omega * ry)) * nx + ((b ? b.state.vy + b.state.omega * sx : 0) - (a.state.vy + a.state.omega * rx)) * ny;
        const normalMass = a.im + (b?.im ?? 0) + (rx * ny - ry * nx) ** 2 * a.ii + (sx * ny - sy * nx) ** 2 * (b?.ii ?? 0);
        const normal = Math.max(0, contact.normal + (contact.target - relative) / normalMass), amount = normal - contact.normal;
        a.state.vx -= amount * nx * a.im; a.state.vy -= amount * ny * a.im; a.state.omega -= (rx * ny - ry * nx) * amount * a.ii;
        if (b) { b.state.vx += amount * nx * b.im; b.state.vy += amount * ny * b.im; b.state.omega += (sx * ny - sy * nx) * amount * b.ii; }
        contact.normal = normal;
      }
      stopPins(states);
    }
    const after = energy();
    if (after > energyBefore * (1 + 1e-9) && after > 0) {
      const k = Math.sqrt(energyBefore / after);
      for (const { state } of involved) { state.vx *= k; state.vy *= k; state.omega *= k; }
    }
    // Absorption happens on impact, so it preserves the initial approach speed while damping repeated rebounds.
    const dampedByBody = new Map<number, { absorption: number; threshold: number }>();
    const settingOf = (i: number) => {
      const body = bodies[i];
      return body?.impulse?.attractor
        ? { absorption: Math.max(0, Math.min(1, body.impulse.attractionAbsorption ?? 0.5)), threshold: Math.max(0, body.impulse.attractionSleepThreshold ?? 0.03) }
        : null;
    };
    for (const contact of contacts) {
      const setting = [settingOf(contact.a.index), contact.b ? settingOf(contact.b.index) : null].filter((value): value is NonNullable<typeof value> => value !== null).sort((a, b) => b.absorption - a.absorption)[0];
      if (!setting || setting.absorption <= 0) continue;
      for (const i of [contact.a.index, contact.b?.index]) {
        if (i === undefined || bodies[i]!.fixed) continue;
        const previous = dampedByBody.get(i);
        if (!previous || setting.absorption > previous.absorption) dampedByBody.set(i, setting);
      }
    }
    for (const [i, setting] of dampedByBody) {
      const state = states[i]!;
      const factor = Math.exp(-setting.absorption * 8 * dt);
      state.vx *= factor; state.vy *= factor; state.omega *= factor;
      const body = bodies[i]!.body;
      const radiusOfGyration = Math.sqrt(body.inertia / body.mass);
      const specificSpeed2 = state.vx * state.vx + state.vy * state.vy + (state.omega * radiusOfGyration) ** 2;
      // Below the configurable fraction of the attractor's reference scale per second, make residual energy exactly zero.
      if (setting.threshold > 0 && specificSpeed2 < (attractionSize * setting.threshold) ** 2) state.vx = state.vy = state.omega = 0;
    }
    if (settings.damping) {
      const keep = Math.exp(-settings.damping * dt);
      for (let i = 0; i < states.length; i++) if (!bodies[i]!.fixed) { const s = states[i]!; s.vx *= keep; s.vy *= keep; s.omega *= keep; }
    }
    if (contactDamping) {
      const touching = new Set(contacts.flatMap((c) => c.b ? [c.a.index, c.b.index] : [c.a.index]));
      for (const i of touching) if (!bodies[i]!.fixed) states[i]!.omega *= Math.exp(-contactDamping * dt);
    }
    // Contacts may have pushed a pinned body off its pin: back onto it.
    holdPins(states);
    return { states, pending: stillPending };
  };
  return { bodies, initial, pendingOf, advance };
}

// ── A whole simulation from rest (Gravity's coupled bodies): pure in time, with checkpoints kept per world.
interface Replay { key: string; stepper: Stepper; checkpoints: { states: State[]; pending: Set<number> }[]; latest: { step: number; states: State[]; pending: Set<number> } }
export interface CollisionWorld { bodies: CollisionBody[]; replay?: Replay }

function simulateWorld(world: CollisionWorld, settings: StepSettings, time: number, start?: (State | undefined)[]): State[] {
  const key = JSON.stringify([settings, start ?? null]);
  let replay = world.replay;
  if (!replay || replay.key !== key) {
    const stepper = createStepper(world.bodies, settings);
    const states = stepper.initial(start);
    const pending = stepper.pendingOf(states);
    replay = world.replay = { key, stepper, checkpoints: [{ states, pending }], latest: { step: 0, states, pending } };
  }
  const whole = Math.floor(time * HZ + 1e-9), at = Math.min(Math.floor(whole / INTERVAL), replay.checkpoints.length - 1);
  let step = at * INTERVAL, { states, pending } = replay.checkpoints[at]!;
  if (replay.latest.step <= whole && replay.latest.step > step) ({ step, states, pending } = replay.latest);
  for (; step < whole; step++) {
    ({ states, pending } = replay.stepper.advance(states, pending, 1 / HZ));
    if ((step + 1) % INTERVAL === 0 && (step + 1) / INTERVAL === replay.checkpoints.length) replay.checkpoints.push({ states, pending });
  }
  replay.latest = { step: whole, states, pending };
  const fraction = time - whole / HZ;
  if (fraction > 1e-12) states = replay.stepper.advance(states, pending, fraction).states;
  return states;
}

const posesOf = (states: State[]): FallPose[] => states.map((s) => ({ x: s.x, y: s.y, angle: s.angle }));

/** A floor at `floor` turned by `rotation` (its solid side below), gravity straight down. */
export const floorPlane = (floor: Vec2, rotation: number): Plane => ({ point: floor, normal: [-Math.sin(rotation), Math.cos(rotation)] });

export function fallWorld(world: CollisionWorld, floor: Vec2, rotation: number, gravity: number, time: number, friction: number, bounce: number, collide: boolean): FallPose[] {
  return posesOf(simulateWorld(world, { acceleration: [0, gravity], planes: [floorPlane(floor, rotation)], friction, bounce, collide, contactDamping: 1 }, time));
}

export function physicsWorld(world: CollisionWorld, acceleration: Vec2, time: number, friction: number, bounce: number, collide: boolean): FallPose[] {
  return posesOf(physicsStates(world, acceleration, time, friction, bounce, collide));
}

/**
 * Physics without a floor, as full states (in the world's coordinates): `start` gives the state some bodies
 * begin in (the others, at rest where they are, with their impulse). The poses are the states' x, y and angle.
 */
export function physicsStates(world: CollisionWorld, acceleration: Vec2, time: number, friction: number, bounce: number, collide: boolean, start?: (State | undefined)[]): State[] {
  return simulateWorld(world, { acceleration, planes: [], friction, bounce, collide, contactDamping: 0 }, time, start);
}
