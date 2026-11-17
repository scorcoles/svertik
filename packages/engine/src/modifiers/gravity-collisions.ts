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
}
interface State { x: number; y: number; angle: number; vx: number; vy: number; omega: number }
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
  // Open paths retain their floor dynamics but have no filled area to collide with other bodies.
  return { body, parts, fixed, impulse: geo.shapes[0]?.impulse };
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

interface Replay { key: string; checkpoints: State[][]; latest: { step: number; states: State[] } }
interface StaticIndex { key: string; cell: number; grid: Map<string, number[]>; parts: { owner: Placed; polygon: Polygon }[]; box: Box }
export interface CollisionWorld { bodies: CollisionBody[]; replay?: Replay; fixedIndex?: StaticIndex }

function place(collider: CollisionBody, state: State, index: number): Placed {
  const { body, parts, fixed } = collider, c = Math.cos(state.angle), s = Math.sin(state.angle);
  const { x: ox, y: oy } = state;
  const point = ([x, y]: Vec2): Vec2 => [ox + x * c - y * s, oy + x * s + y * c];
  let mesh: Polygon[] | undefined;
  const polygons = () => mesh ??= parts.map((part) => { return polygonOf(part.map(point)); });
  const hull = body.points.map(point);
  return { index, state, polygons, hull, box: boxOf(hull), im: fixed ? 0 : 1 / body.mass, ii: fixed ? 0 : 1 / (body.mass * body.inertia) };
}
function cells(box: Box, size: number, visit: (key: string) => void) {
  for (let x = Math.floor(box.x0 / size); x <= Math.floor(box.x1 / size); x++) for (let y = Math.floor(box.y0 / size); y <= Math.floor(box.y1 / size); y++) visit(`${x}:${y}`);
}

function simulateWorld(world: CollisionWorld, floor: Vec2 | null, rotation: number, acceleration: Vec2, time: number, friction: number, bounce: number, collide: boolean, contactDamping: number): FallPose[] {
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  const key = [floor?.[0], floor?.[1], rotation, ...acceleration, friction, bounce, collide, contactDamping].join('|');
  let replay = world.replay;
  if (!replay || replay.key !== key) {
    const initial = world.bodies.map(({ body, fixed, impulse }): State => {
      const [vx, vy] = fixed ? [0, 0] : impulse?.velocity ?? [0, 0];
      return floor
        ? { x: (body.center[0] - floor[0]) * cs + (body.center[1] - floor[1]) * sn, y: -(body.center[0] - floor[0]) * sn + (body.center[1] - floor[1]) * cs, angle: -rotation, vx: vx * cs + vy * sn, vy: -vx * sn + vy * cs, omega: fixed ? 0 : impulse?.spin ?? 0 }
        : { x: body.center[0], y: body.center[1], angle: 0, vx, vy, omega: fixed ? 0 : impulse?.spin ?? 0 };
    });
    replay = world.replay = { key, checkpoints: [initial], latest: { step: 0, states: initial } };
  }
  const size = Math.max(...world.bodies.filter((b) => !b.fixed).map((b) => Math.sqrt(b.body.inertia)), 1);
  const slop = size * 0.0001;
  // Slow approaches don't bounce: bodies resting against each other (pieces of a fracture, a stack) stay in contact
  // instead of trading tiny rebounds. Without acceleration the floor of size × 0.5/s keeps it above zero.
  const restitutionThreshold = Math.max(Math.sqrt(Math.hypot(...acceleration) * size) * 0.05, size * 0.5);
  // Static solids never change during one replay: keep transformed convex parts in a spatial hash.
  let fixed = world.fixedIndex;
  const fixedKey = [floor?.[0], floor?.[1], rotation].join('|');
  if (!fixed || fixed.key !== fixedKey) {
    fixed = { key: fixedKey, cell: Math.max(32, size), grid: new Map(), parts: [], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity } };
    world.bodies.forEach((collider, i) => {
      if (!collider.fixed) return;
      const owner = place(collider, replay!.checkpoints[0]![i]!, i);
      for (const polygon of owner.polygons()) {
        fixed!.box.x0 = Math.min(fixed!.box.x0, polygon.box.x0); fixed!.box.y0 = Math.min(fixed!.box.y0, polygon.box.y0);
        fixed!.box.x1 = Math.max(fixed!.box.x1, polygon.box.x1); fixed!.box.y1 = Math.max(fixed!.box.y1, polygon.box.y1);
        const id = fixed!.parts.length;
        fixed!.parts.push({ owner, polygon });
        cells(polygon.box, fixed!.cell, (key) => { const list = fixed!.grid.get(key) ?? []; list.push(id); fixed!.grid.set(key, list); });
      }
    });
    world.fixedIndex = fixed;
  }
  const advance = (before: State[], dt: number): State[] => {
    const states = before.map((state, i) => {
      if (world.bodies[i]!.fixed) return { ...state };
      const ax = floor ? acceleration[1] * sn : acceleration[0];
      const ay = floor ? acceleration[1] * cs : acceleration[1];
      return { ...state, x: state.x + state.vx * dt + ax * dt * dt / 2, y: state.y + state.vy * dt + ay * dt * dt / 2, vx: state.vx + ax * dt, vy: state.vy + ay * dt, angle: state.angle + state.omega * dt };
    });
    const placed = world.bodies.flatMap((collider, index) => collider.fixed ? [] : [place(collider, states[index]!, index)]);
    const contacts: Contact[] = [];
    const add = (a: Placed, b: Placed | undefined, nx: number, ny: number, depth: number, points: Vec2[]) => {
      // Correct penetration once per manifold, independent of the number of contact points.
      const total = a.im + (b?.im ?? 0);
      if (!total) return;
      const correction = Math.max(0, depth - slop) * 0.8 / total;
      a.state.x -= nx * correction * a.im; a.state.y -= ny * correction * a.im;
      if (b) { b.state.x += nx * correction * b.im; b.state.y += ny * correction * b.im; }
      for (const [x, y] of points) {
        const avx = a.state.vx - a.state.omega * (y - a.state.y), avy = a.state.vy + a.state.omega * (x - a.state.x);
        const bvx = b ? b.state.vx - b.state.omega * (y - b.state.y) : 0, bvy = b ? b.state.vy + b.state.omega * (x - b.state.x) : 0;
        const closing = (bvx - avx) * nx + (bvy - avy) * ny;
        contacts.push({ a, b, nx, ny, x, y, depth, normal: 0, tangent: 0, target: closing < -restitutionThreshold ? -closing * bounce : 0 });
      }
    };
    for (const a of placed) if (a.im && floor) {
      const bottom = Math.max(...a.hull.map((p) => p[1]));
      if (bottom < -slop) continue;
      const face = a.hull.filter((p) => bottom - p[1] < slop * 4 + 1e-6);
      const left = face.reduce((p, q) => p[0] < q[0] ? p : q), right = face.reduce((p, q) => p[0] > q[0] ? p : q);
      add(a, undefined, 0, 1, bottom, left === right ? [left] : [left, right]);
    }
    // Sweep-and-prune on body bounds before testing convex parts.
    const ordered = (collide ? placed : []).slice().sort((a, b) => a.box.x0 - b.box.x0 || a.index - b.index);
    for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
      const a = ordered[i]!, b = ordered[j]!;
      if (b.box.x0 > a.box.x1) break;
      if ((!a.im && !b.im) || (!collide && a.im && b.im) || !overlap(a.box, b.box)) continue;
      const hits: NonNullable<ReturnType<typeof manifold>>[] = [];
      for (const pa of a.polygons()) for (const pb of b.polygons()) {
        const hit = manifold(pa, pb);
        if (!hit) continue;
        const same = hits.findIndex((h) => h.nx * hit.nx + h.ny * hit.ny > 0.98);
        if (same < 0) hits.push(hit);
        else if (hits[same]!.depth < hit.depth) hits[same] = hit;
      }
      for (const hit of hits.sort((a, b) => b.depth - a.depth).slice(0, 4)) add(a, b, hit.nx, hit.ny, hit.depth, hit.points);
    }
    for (const a of placed) {
      if (!overlap(a.box, fixed!.box)) continue;
      const hits = new Map<Placed, NonNullable<ReturnType<typeof manifold>>[]>();
      for (const polygon of a.polygons()) {
        const candidates = new Set<number>();
        cells(polygon.box, fixed!.cell, (key) => { for (const id of fixed!.grid.get(key) ?? []) candidates.add(id); });
        for (const id of candidates) {
          const b = fixed!.parts[id]!, hit = manifold(polygon, b.polygon);
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
    const after = energy();
    if (after > energyBefore * (1 + 1e-9) && after > 0) {
      const k = Math.sqrt(energyBefore / after);
      for (const { state } of involved) { state.vx *= k; state.vy *= k; state.omega *= k; }
    }
    const touching = new Set(contacts.flatMap((c) => c.b ? [c.a.index, c.b.index] : [c.a.index]));
    if (contactDamping) for (const i of touching) if (!world.bodies[i]!.fixed) states[i]!.omega *= Math.exp(-contactDamping * dt);
    return states;
  };
  const whole = Math.floor(time * HZ + 1e-9), at = Math.min(Math.floor(whole / INTERVAL), replay.checkpoints.length - 1);
  let step = at * INTERVAL, states = replay.checkpoints[at]!;
  if (replay.latest.step <= whole && replay.latest.step > step) { step = replay.latest.step; states = replay.latest.states; }
  for (; step < whole; step++) {
    states = advance(states, 1 / HZ);
    if ((step + 1) % INTERVAL === 0 && (step + 1) / INTERVAL === replay.checkpoints.length) replay.checkpoints.push(states);
  }
  replay.latest = { step: whole, states };
  const fraction = time - whole / HZ;
  if (fraction > 1e-12) states = advance(states, fraction);
  return states.map((s) => floor
    ? ({ x: floor[0] + s.x * cs - s.y * sn, y: floor[1] + s.x * sn + s.y * cs, angle: s.angle + rotation })
    : ({ x: s.x, y: s.y, angle: s.angle }));
}

export function fallWorld(world: CollisionWorld, floor: Vec2, rotation: number, gravity: number, time: number, friction: number, bounce: number, collide: boolean): FallPose[] {
  return simulateWorld(world, floor, rotation, [0, gravity], time, friction, bounce, collide, 1);
}

export function physicsWorld(world: CollisionWorld, acceleration: Vec2, time: number, friction: number, bounce: number, collide: boolean): FallPose[] {
  return simulateWorld(world, null, 0, acceleration, time, friction, bounce, collide, 0);
}
