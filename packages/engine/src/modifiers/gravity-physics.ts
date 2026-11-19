import { cubicAt, type Geometry, type Impulse, type SubPath, type Vec2 } from '../geometry';

export interface Body {
  points: Vec2[];
  center: Vec2;
  inertia: number;
  mass: number;
}

const cross = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

/** Only hull vertices can contact an infinite plane; the original curves are kept for rendering. */
function hull(points: Vec2[]): Vec2[] {
  const sorted = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list: Vec2[]) => {
    const out: Vec2[] = [];
    for (const p of list) {
      while (out.length > 1 && cross(out[out.length - 2]!, out[out.length - 1]!, p) <= 0) out.pop();
      out.push(p);
    }
    return out;
  };
  const lower = half(sorted), upper = half(sorted.slice().reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Damage already produces straight segments: do not expand each of them into twelve samples. */
function pathOutline(path: SubPath): Vec2[] {
  const points: Vec2[] = [path.start];
  let start = path.start;
  for (const segment of path.segs) {
    const distance = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const length = distance(start, segment.c1) + distance(segment.c1, segment.c2) + distance(segment.c2, segment.p);
    const samples = length - distance(start, segment.p) < 1e-9 * (length + 1) ? 1 : 12;
    for (let i = 1; i <= samples; i++) points.push(samples === 1 ? segment.p : cubicAt(start, segment, i / samples));
    start = segment.p;
  }
  return points;
}

/** Uniform lamina mass properties, including oppositely wound holes. Open paths use a hull fallback. */
export function gravityBody(geo: Geometry): Body | null {
  const points: Vec2[] = [];
  let area2 = 0, cx = 0, cy = 0, moment = 0;
  for (const shape of geo.shapes) {
    let shapeArea = 0, shapeX = 0, shapeY = 0, shapeMoment = 0;
    for (const path of shape.subpaths) {
      const poly = pathOutline(path);
      points.push(...poly);
      // Generated line bodies need thickness for the same contacts on solids and the floor.
      if (shape.bodyGroup !== undefined && shape.style.fill === 'none' && shape.style.stroke && shape.style.stroke !== 'none') {
        const half = Math.max(0, Number(shape.style['stroke-width'] ?? 1)) / 2;
        for (let i = 1; i < poly.length; i++) {
          const a = poly[i - 1]!, b = poly[i]!;
          const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (length < 1e-12) continue;
          const nx = -(b[1] - a[1]) / length * half, ny = (b[0] - a[0]) / length * half;
          points.push([a[0] + nx, a[1] + ny], [a[0] - nx, a[1] - ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny]);
        }
      }
      if (!path.closed) continue;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const z = a[0] * b[1] - b[0] * a[1];
        shapeArea += z;
        shapeX += (a[0] + b[0]) * z;
        shapeY += (a[1] + b[1]) * z;
        shapeMoment += z * (a[0] ** 2 + a[0] * b[0] + b[0] ** 2 + a[1] ** 2 + a[1] * b[1] + b[1] ** 2);
      }
    }
    const sign = Math.sign(shapeArea);
    area2 += shapeArea * sign;
    cx += shapeX * sign;
    cy += shapeY * sign;
    moment += shapeMoment * sign;
  }
  if (!points.length) return null;
  const outline = hull(points);
  const center: Vec2 = area2 > 1e-10
    ? [cx / (3 * area2), cy / (3 * area2)]
    : [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  const local = (outline.length ? outline : [points[0]!]).map(([x, y]): Vec2 => [x - center[0], y - center[1]]);
  const radius2 = Math.max(...local.map(([x, y]) => x * x + y * y), 1e-8);
  const inertia = area2 > 1e-10 ? moment / (6 * area2) - center[0] ** 2 - center[1] ** 2 : radius2 / 2;
  return { points: local, center, inertia: Math.max(radius2 * 1e-4, inertia), mass: Math.max(area2 / 2, radius2 * 1e-4) };
}

export interface FallPose {
  x: number;
  y: number;
  angle: number;
}

interface FallState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  omega: number;
}
interface Replay {
  key: string;
  checkpoints: FallState[];
  latest: { step: number; state: FallState };
}
const replays = new WeakMap<Body, Replay>();
const HZ = 120;
const CHECKPOINT = 30;

/** Fixed-step replay with quarter-second checkpoints; fractional frames never change cached states. */
export function fallBody(body: Body, floor: Vec2, rotation: number, gravity: number, time: number, friction: number, bounce: number, impulse?: Impulse): FallPose {
  const cs = Math.cos(rotation), sn = Math.sin(rotation);
  const [ix, iy] = impulse?.velocity ?? [0, 0];
  const spin = impulse?.spin ?? 0;
  const key = [floor[0], floor[1], rotation, gravity, friction, bounce, ix, iy, spin].join('|');
  let replay = replays.get(body);
  if (!replay || replay.key !== key) {
    const initial: FallState = {
      x: (body.center[0] - floor[0]) * cs + (body.center[1] - floor[1]) * sn,
      y: -(body.center[0] - floor[0]) * sn + (body.center[1] - floor[1]) * cs,
      angle: -rotation, vx: ix * cs + iy * sn, vy: -ix * sn + iy * cs, omega: spin,
    };
    replay = { key, checkpoints: [initial], latest: { step: 0, state: initial } };
    replays.set(body, replay);
  }
  const gx = gravity * sn, gy = gravity * cs;
  const invI = 1 / body.inertia;
  const tolerance = Math.sqrt(body.inertia) * 0.002;
  const advance = (state: FallState, dt: number): FallState => {
    let { x, y, angle, vx, vy, omega } = state;
    x += vx * dt + gx * dt * dt / 2;
    y += vy * dt + gy * dt * dt / 2;
    vx += gx * dt;
    vy += gy * dt;
    angle += omega * dt;
    const c = Math.cos(angle), s = Math.sin(angle);
    const rotated = body.points.map(([px, py]): Vec2 => [px * c - py * s, px * s + py * c]);
    const bottom = Math.max(...rotated.map((p) => p[1]));
    const penetration = y + bottom;
    if (penetration < -tolerance) return { x, y, angle, vx, vy, omega };
    y -= Math.max(0, penetration);
    // A face has two extreme contacts. A corner has one. Keep both for a stable resting manifold.
    const candidates = rotated.filter((p) => bottom - p[1] <= tolerance);
    const left = candidates.reduce((a, b) => a[0] < b[0] ? a : b);
    const right = candidates.reduce((a, b) => a[0] > b[0] ? a : b);
    const contacts = (left === right ? [left] : [left, right]).map(([rx, ry]) => ({
      rx, ry, normal: 0, tangent: 0,
      target: -bounce * Math.max(0, vy + omega * rx - Math.sqrt(gravity * Math.sqrt(body.inertia)) * 0.05),
    }));
    for (let iteration = 0; iteration < 12; iteration++) for (const contact of contacts) {
      const { rx, ry } = contact;
      const impulse = (vy + omega * rx - contact.target) / (1 + rx * rx * invI);
      const normal = Math.max(0, contact.normal + impulse);
      const change = normal - contact.normal;
      contact.normal = normal;
      vy -= change;
      omega -= rx * change * invI;
      const tangentImpulse = -(vx - omega * ry) / (1 + ry * ry * invI);
      const limit = friction * normal;
      const tangent = Math.max(-limit, Math.min(limit, contact.tangent + tangentImpulse));
      const tangentChange = tangent - contact.tangent;
      contact.tangent = tangent;
      vx += tangentChange;
      omega -= ry * tangentChange * invI;
    }
    // Small contact damping removes perpetual numerical rocking, without slowing free flight.
    omega *= Math.exp(-2 * dt);
    return { x, y, angle, vx, vy, omega };
  };
  const whole = Math.floor(time * HZ + 1e-9);
  const checkpoint = Math.min(Math.floor(whole / CHECKPOINT), replay.checkpoints.length - 1);
  let step = checkpoint * CHECKPOINT;
  let state = replay.checkpoints[checkpoint]!;
  if (replay.latest.step <= whole && replay.latest.step > step) {
    step = replay.latest.step;
    state = replay.latest.state;
  }
  for (; step < whole; step++) {
    state = advance(state, 1 / HZ);
    const next = step + 1;
    if (next % CHECKPOINT === 0 && next / CHECKPOINT === replay.checkpoints.length) replay.checkpoints.push(state);
  }
  replay.latest = { step: whole, state };
  const fraction = time - whole / HZ;
  if (fraction > 1e-12) state = advance(state, fraction);
  return { x: floor[0] + state.x * cs - state.y * sn, y: floor[1] + state.x * sn + state.y * cs, angle: state.angle + rotation };
}
