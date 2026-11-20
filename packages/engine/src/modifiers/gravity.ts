import { bounds, mapPoints, type Geometry, type Shape } from '../geometry';
import { collisionBody, fallWorld, type CollisionBody, type CollisionWorld } from './gravity-collisions';
import { fallBody, gravityBody, type FallPose } from './gravity-physics';
import { defineModifier, deg, fromFraction } from '../modifier';
import { apply, IDENTITY, invert, multiply, uprightBounds, type Mat } from '../matrix';
import { hasSoftMaterial, materialDynamics } from './softbody-physics';

/** Pairwise contact work grows rapidly with path count; keep high-detail outputs safe to play. */
export const GRAVITY_COLLISION_PATH_LIMIT = 512;

const sceneInputs = new WeakMap<Geometry, { key: string; geo: Geometry }>();

function inSpace(geo: Geometry, matrix: Mat): Geometry {
  const moved = mapPoints(geo, (q) => apply(matrix, q));
  moved.shapes = moved.shapes.map((shape) => {
    const patternTransform = multiply(matrix, shape.patternTransform ?? IDENTITY);
    const style = shape.bodyGroup !== undefined && shape.style['stroke-width'] ? { ...shape.style, 'stroke-width': String(Number(shape.style['stroke-width']) * Math.hypot(matrix[0], matrix[1])) } : shape.style;
    if (!shape.impulse) return { ...shape, style, patternTransform };
    const [x, y] = shape.impulse.velocity;
    return { ...shape, style, patternTransform, impulse: { ...shape.impulse,
      velocity: [matrix[0] * x + matrix[2] * y, matrix[1] * x + matrix[3] * y],
      spin: shape.impulse.spin * (matrix[0] * matrix[3] - matrix[1] * matrix[2] < 0 ? -1 : 1),
    } };
  });
  return moved;
}

// Stable input geometries share their mass properties and deterministic simulation checkpoints.
const bodyPlans = new WeakMap<Geometry, { shapes: Shape[]; body?: ReturnType<typeof gravityBody>; collider?: CollisionBody | null }[]>();

const collisionWorlds = new WeakMap<Geometry, { key: string; world: CollisionWorld; indices: Map<Shape[], number> }>();

/** Exact maximum along the plane normal, including cubic extrema. */
function support(geo: Geometry): number {
  let maximum = -Infinity;
  for (const shape of geo.shapes) {
    const half = shape.bodyGroup !== undefined && shape.style.fill === 'none' && shape.style.stroke && shape.style.stroke !== 'none' ? Math.max(0, Number(shape.style['stroke-width'] ?? 1)) / 2 : 0;
    for (const path of shape.subpaths) {
      let previous = path.start;
      maximum = Math.max(maximum, previous[1]);
      for (const seg of path.segs) {
        const y0 = previous[1], y1 = seg.c1[1], y2 = seg.c2[1], y3 = seg.p[1];
        const a = -y0 + 3 * y1 - 3 * y2 + y3;
        const b = 2 * (y0 - 2 * y1 + y2);
        const c = y1 - y0;
        const disc = b * b - 4 * a * c;
        const roots = Math.abs(a) < 1e-12
          ? (Math.abs(b) < 1e-12 ? [] : [-c / b])
          : (disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]);
        let top = Math.max(y0, y3);
        for (const t of roots) if (t > 0 && t < 1) {
          const u = 1 - t;
          top = Math.max(top, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
        }
        if (half) {
          const dx = seg.p[0] - previous[0], dy = y3 - y0, length = Math.hypot(dx, dy);
          const cross = (q: readonly [number, number]) => dx * (q[1] - y0) - dy * (q[0] - previous[0]);
          const straight = Math.abs(cross(seg.c1)) + Math.abs(cross(seg.c2)) < 1e-8 * (length + 1);
          top += straight && length > 1e-12 ? half * Math.abs(dx) / length : half;
        }
        maximum = Math.max(maximum, top);
        previous = seg.p;
      }
    }
  }
  return maximum;
}

/** Stateless fall: animate time (or bind it to scene.time). The plane's positive normal is solid. */
export const gravity = defineModifier({
  type: 'gravity',
  label: 'Gravity',
  kind: 'effector',
  params: {
    time: { type: 'number', default: 1, min: 0, max: 60, step: 0.01, label: 'Time (s)' },
    gravity: { type: 'number', default: 1, min: 0, max: 10, step: 0.01, label: 'Gravity', unit: 'fraction' },
    floor: { type: 'point', default: [0.5, 1.5], unit: 'fraction', label: 'Floor position', handle: false },
    rotation: { type: 'angle', default: 0, label: 'Floor rotation', ramp: false },
    collisions: { type: 'boolean', default: false, label: 'Collisions', animatable: false, group: 'Contacts' },
    solids: { type: 'nodes', default: [], label: 'Solids', animatable: false, random: false, group: 'Contacts' },
    physics: { type: 'boolean', default: true, label: 'Rigid bodies', animatable: false },
    friction: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'Friction', ramp: false },
    bounce: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Bounce', ramp: false },
  },
  apply(geo, p, ctx): Geometry {
    const time = Math.min(60, Math.max(0, p.time));
    if (!time || (!p.gravity && !(p.physics && geo.shapes.some((s) => s.impulse))) || !geo.shapes.length) return geo;
    const movingShapes = geo.shapes.filter((shape) => !shape.networkLink);
    const pathCount = movingShapes.reduce((count, shape) => count + shape.subpaths.length, 0);
    const overloaded = p.physics && pathCount > GRAVITY_COLLISION_PATH_LIMIT;
    const collisions = p.collisions && !overloaded;
    const diagnostics = overloaded ? [
      ...(geo.diagnostics ?? []),
      { code: 'gravity-collision-path-limit', ...(ctx.id ? { effectId: ctx.id } : {}), message: `Gravity is using a simplified body for its ${pathCount} input paths and has disabled body and Solid collisions to keep the scene responsive. The floor still works. Reduce the path count to restore detailed collisions.` },
    ] : geo.diagnostics;
    const activeSolids = overloaded ? [] : [...new Set(p.solids)];
    const world = ctx.scene?.world;
    if (world && !world.every((v, i) => v === IDENTITY[i])) {
      if (Math.abs(world[0] * world[3] - world[1] * world[2]) < 1e-12) return geo;
      const key = JSON.stringify(world);
      let entry = sceneInputs.get(geo);
      if (!entry || entry.key !== key) {
        entry = { key, geo: inSpace(geo, world) };
        sceneInputs.set(geo, entry);
      }
      const result = gravity.apply(entry.geo, p, { ...ctx, scene: undefined, bounds: uprightBounds(ctx.bounds, world),
        target: ctx.target ? (id) => { const g = ctx.target!(id); return g ? inSpace(g, world) : null; } : undefined,
      });
      const output = inSpace(result, invert(world));
      return diagnostics ? { ...output, diagnostics } : output;
    }
    const floor = fromFraction(uprightBounds(ctx.bounds, IDENTITY), p.floor);
    const angle = deg(p.rotation);
    if (p.physics && hasSoftMaterial(geo)) {
      const targets = activeSolids.flatMap((id) => { const target = ctx.target?.(id); return target ? [target] : []; });
      const size = Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
      const output = materialDynamics(geo, time, { acceleration: [0, Math.max(0, p.gravity) * size], floor, rotation: angle, friction: p.friction, bounce: p.bounce, collisions }, targets, size);
      return diagnostics ? { ...output, diagnostics } : output;
    }
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const fall = 0.5 * Math.max(0, p.gravity) * (Math.max(ctx.bounds.width, ctx.bounds.height) || 1) * time * time;
    let parts = bodyPlans.get(geo);
    if (!parts) {
      if (overloaded) parts = movingShapes.length ? [{ shapes: movingShapes }] : [];
      else {
        const tagged = movingShapes.some((s) => s.clone !== undefined);
        const groups = new Map<number, Shape[]>();
        movingShapes.forEach((shape, i) => {
          const key = shape.bodyGroup ?? (tagged ? (shape.clone ?? -1) : i);
          const group = groups.get(key) ?? [];
          group.push(shape);
          groups.set(key, group);
        });
        parts = [...groups.values()].map((shapes) => ({ shapes }));
      }
      bodyPlans.set(geo, parts);
    }
    let coupled: Map<Shape[], FallPose> | null = null;
    if (p.physics && (collisions || activeSolids.length)) {
      const solids = activeSolids.flatMap((id) => { const target = ctx.target?.(id); return target ? [target] : []; });
      const key = JSON.stringify(solids.map((g) => g.shapes.map((s) => [s.subpaths, s.style.fill])));
      let cache = collisionWorlds.get(geo);
      if (!cache || cache.key !== key) {
        const bodies: CollisionBody[] = [], indices = new Map<Shape[], number>();
        for (const entry of parts) {
          const part = { ...geo, shapes: entry.shapes };
          const body = entry.body === undefined ? (entry.body = gravityBody(part, overloaded)) : entry.body;
          // Generated pieces can be much smaller than the source object. Simplifying each collider
          // against the scene-wide size makes adjacent Voronoi/Mosaic cells overlap at startup.
          const partBounds = bounds(part);
          const detail = Math.max(Math.max(partBounds.width, partBounds.height) * 0.006, 0.25);
          const collider = entry.collider === undefined ? (entry.collider = collisionBody(part, body, !!entry.shapes[0]?.impulse?.immovable, detail)) : entry.collider;
          if (collider) { indices.set(entry.shapes, bodies.length); bodies.push(collider); }
        }
        for (const solid of solids) {
          const solidBounds = bounds(solid);
          const detail = Math.max(Math.max(solidBounds.width, solidBounds.height) * 0.006, 0.25);
          const collider = collisionBody(solid, undefined, true, detail);
          if (collider) bodies.push(collider);
        }
        cache = { key, world: { bodies }, indices };
        collisionWorlds.set(geo, cache);
      }
      const acceleration = Math.max(0, p.gravity) * (Math.max(ctx.bounds.width, ctx.bounds.height) || 1);
      const poses = fallWorld(cache.world, floor, angle, acceleration, time, Math.max(0, Math.min(1, p.friction)), Math.max(0, Math.min(1, p.bounce)), collisions);
      coupled = new Map([...cache.indices].map(([shapes, index]) => [shapes, poses[index]!]));
    }
    // Calculate transforms by group, then preserve the original paint order.
    const transforms = new Map<Shape, (point: readonly [number, number]) => [number, number]>();
    for (const entry of parts) {
      const { shapes } = entry;
      const part: Geometry = { ...geo, shapes };
      if (p.physics) {
        const body = entry.body === undefined ? (entry.body = gravityBody(part, overloaded)) : entry.body;
        if (!body) {
          shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x, y]));
          continue;
        }
        const acceleration = Math.max(0, p.gravity) * (Math.max(ctx.bounds.width, ctx.bounds.height) || 1);
        const pose = coupled?.get(shapes) ?? fallBody(body, floor, angle, acceleration, time, Math.max(0, Math.min(1, p.friction)), Math.max(0, Math.min(1, p.bounce)), shapes[0]?.impulse);
        const cs = Math.cos(pose.angle), sn = Math.sin(pose.angle);
        const transform = ([x, y]: readonly [number, number]): [number, number] => [
          pose.x + (x - body.center[0]) * cs - (y - body.center[1]) * sn,
          pose.y + (x - body.center[0]) * sn + (y - body.center[1]) * cs,
        ];
        // The sampled collision hull drives dynamics; exact cubic support keeps rendered curves above the plane.
        const projected = overloaded
          ? Math.max(...body.points.map(([x, y]) => {
              const [px, py] = transform([body.center[0] + x, body.center[1] + y]);
              return (px - floor[0]) * nx + (py - floor[1]) * ny;
            }))
          : support(mapPoints(part, (point) => {
              const [x, y] = transform(point);
              return [(x - floor[0]) * ny - (y - floor[1]) * nx, (x - floor[0]) * nx + (y - floor[1]) * ny];
            }));
        const correction = Math.max(0, projected);
        shapes.forEach((shape) => transforms.set(shape, (point) => {
          const [x, y] = transform(point);
          return [x - correction * nx, y - correction * ny];
        }));
        continue;
      }
      // Rotating the curves into the plane's frame gives their exact support bound,
      // including curved extrema (rather than an axis-aligned box approximation).
      const projected = support(mapPoints(part, ([x, y]) => [
        (x - floor[0]) * ny - (y - floor[1]) * nx,
        (x - floor[0]) * nx + (y - floor[1]) * ny,
      ]));
      const penetration = Math.max(0, projected + fall * ny);
      const shift: [number, number] = [-penetration * nx, fall - penetration * ny];
      shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x + shift[0], y + shift[1]]));
    }
    const networkMotions = new Map<string, Map<number, (point: readonly [number, number]) => [number, number]>>();
    for (const shape of movingShapes) {
      const move = transforms.get(shape);
      if (!move) continue;
      for (const ref of shape.networkNodes ?? []) {
        const nodes = networkMotions.get(ref.networkId) ?? new Map();
        nodes.set(ref.node, move);
        networkMotions.set(ref.networkId, nodes);
      }
    }
    const moveLink = (shape: Shape) => {
      const link = shape.networkLink;
      if (!link) return shape;
      const nodes = networkMotions.get(link.networkId);
      const from = nodes?.get(link.from), to = nodes?.get(link.to);
      const path = shape.subpaths[0];
      if (!path || !from || !to) return shape;
      const end = path.segs.at(-1)?.p ?? path.start;
      const start = from(path.start), finish = to(end);
      return {
        ...shape,
        subpaths: shape.subpaths.map((subpath, index) => index === 0 ? {
          ...subpath,
          start,
          segs: [{
            c1: [start[0] + (finish[0] - start[0]) / 3, start[1] + (finish[1] - start[1]) / 3] as [number, number],
            c2: [start[0] + (finish[0] - start[0]) * 2 / 3, start[1] + (finish[1] - start[1]) * 2 / 3] as [number, number],
            p: finish,
          }],
          closed: false,
        } : subpath),
      };
    };
    return {
      ...geo,
      ...(diagnostics ? { diagnostics } : {}),
      shapes: geo.shapes.map((shape) => {
        if (shape.networkLink) return moveLink(shape);
        const move = transforms.get(shape) ?? (([x, y]: readonly [number, number]) => [x, y]);
        const origin = move([0, 0]), x = move([1, 0]), y = move([0, 1]);
        const matrix: Mat = [x[0] - origin[0], x[1] - origin[1], y[0] - origin[0], y[1] - origin[1], origin[0], origin[1]];
        const moved = { ...mapPoints({ ...geo, shapes: [shape] }, move).shapes[0]!, patternTransform: multiply(matrix, shape.patternTransform ?? IDENTITY) };
        if (!p.physics || !moved.impulse) return moved;
        const { impulse: _consumed, ...result } = moved;
        return result;
      }),
    };
  },
});
