import { mapPoints, type Geometry, type Shape } from '../geometry';
import { fallBody, gravityBody } from './gravity-physics';
import { defineModifier, deg, fromFraction } from '../modifier';

// Stable input geometries share their mass properties and deterministic simulation checkpoints.
const bodyPlans = new WeakMap<Geometry, { shapes: Shape[]; body?: ReturnType<typeof gravityBody> }[]>();

/** Exact maximum along the plane normal, including cubic extrema. */
function support(geo: Geometry): number {
  let maximum = -Infinity;
  for (const shape of geo.shapes) for (const path of shape.subpaths) {
    let y0 = path.start[1];
    maximum = Math.max(maximum, y0);
    for (const seg of path.segs) {
      const y1 = seg.c1[1], y2 = seg.c2[1], y3 = seg.p[1];
      const a = -y0 + 3 * y1 - 3 * y2 + y3;
      const b = 2 * (y0 - 2 * y1 + y2);
      const c = y1 - y0;
      const disc = b * b - 4 * a * c;
      const roots = Math.abs(a) < 1e-12
        ? (Math.abs(b) < 1e-12 ? [] : [-c / b])
        : (disc < 0 ? [] : [(-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a)]);
      maximum = Math.max(maximum, y3);
      for (const t of roots) if (t > 0 && t < 1) {
        const u = 1 - t;
        maximum = Math.max(maximum, u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3);
      }
      y0 = y3;
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
    floor: { type: 'point', default: [0.5, 1.5], unit: 'fraction', label: 'Floor position' },
    physics: { type: 'boolean', default: true, label: 'Rigid bodies', animatable: false },
    friction: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, label: 'Friction', ramp: false },
    bounce: { type: 'number', default: 0.15, min: 0, max: 1, step: 0.01, label: 'Bounce', ramp: false },
    rotation: { type: 'angle', default: 0, label: 'Floor rotation', ramp: false },
  },
  apply(geo, p, ctx) {
    const time = Math.min(60, Math.max(0, p.time));
    if (!time || (!p.gravity && !(p.physics && geo.shapes.some((s) => s.impulse))) || !geo.shapes.length) return geo;
    const floor = fromFraction(ctx.bounds, p.floor);
    const angle = deg(p.rotation);
    const nx = -Math.sin(angle), ny = Math.cos(angle);
    const fall = 0.5 * Math.max(0, p.gravity) * (Math.max(ctx.bounds.width, ctx.bounds.height) || 1) * time * time;
    let parts = bodyPlans.get(geo);
    if (!parts) {
      const tagged = geo.shapes.some((s) => s.clone !== undefined);
      const groups = new Map<number, Shape[]>();
      geo.shapes.forEach((shape, i) => {
        const key = tagged ? (shape.clone ?? -1) : i;
        const group = groups.get(key) ?? [];
        group.push(shape);
        groups.set(key, group);
      });
      parts = [...groups.values()].map((shapes) => ({ shapes }));
      bodyPlans.set(geo, parts);
    }
    // Calculate transforms by group, then preserve the original paint order.
    const transforms = new Map<Shape, (point: readonly [number, number]) => [number, number]>();
    for (const entry of parts) {
      const { shapes } = entry;
      const part: Geometry = { ...geo, shapes };
      if (p.physics) {
        const body = entry.body === undefined ? (entry.body = gravityBody(part)) : entry.body;
        if (!body) {
          shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x, y]));
          continue;
        }
        const acceleration = Math.max(0, p.gravity) * (Math.max(ctx.bounds.width, ctx.bounds.height) || 1);
        const pose = fallBody(body, floor, angle, acceleration, time, Math.max(0, Math.min(1, p.friction)), Math.max(0, Math.min(1, p.bounce)), shapes[0]?.impulse);
        const cs = Math.cos(pose.angle), sn = Math.sin(pose.angle);
        const transform = ([x, y]: readonly [number, number]): [number, number] => [
          pose.x + (x - body.center[0]) * cs - (y - body.center[1]) * sn,
          pose.y + (x - body.center[0]) * sn + (y - body.center[1]) * cs,
        ];
        // The sampled collision hull drives dynamics; exact cubic support keeps rendered curves above the plane.
        const projected = support(mapPoints(part, (point) => {
          const [x, y] = transform(point);
          return [0, (x - floor[0]) * nx + (y - floor[1]) * ny];
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
    return {
      ...geo,
      shapes: geo.shapes.map((shape) => {
        const moved = mapPoints({ ...geo, shapes: [shape] }, transforms.get(shape)!).shapes[0]!;
        if (!p.physics || !moved.impulse) return moved;
        const { impulse: _consumed, ...result } = moved;
        return result;
      }),
    };
  },
});
