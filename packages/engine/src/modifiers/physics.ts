import { mapPoints, type Geometry, type Shape } from '../geometry';
import { collisionBody, physicsWorld, type CollisionBody, type CollisionWorld } from './gravity-collisions';
import { gravityBody, type FallPose } from './gravity-physics';
import { defineModifier } from '../modifier';

interface PhysicsCache {
  parts: { shapeIndices: number[]; body?: ReturnType<typeof gravityBody>; collider?: CollisionBody | null }[];
  world: CollisionWorld;
  indices: Map<number, number>;
}
const worlds = new Map<string, PhysicsCache>();

function geometryKey(geometries: Geometry[]): string {
  let hash = 2166136261;
  const add = (value: string) => { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
  for (const geo of geometries) for (const shape of geo.shapes) {
    add(JSON.stringify([shape.clone, shape.style.fill !== 'none', shape.impulse]));
    for (const path of shape.subpaths) {
      add(JSON.stringify([path.closed, path.start]));
      for (const segment of path.segs) add(JSON.stringify([segment.c1, segment.c2, segment.p]));
    }
  }
  return (hash >>> 0).toString(36);
}

/** General purpose 2D rigid-body simulation for all elements in a group. */
export const physics = defineModifier({
  type: 'physics',
  label: 'Physics',
  kind: 'effector',
  params: {
    time: { type: 'number', default: 0, min: 0, max: 60, step: 0.01, label: 'Time (s)' },
    acceleration: { type: 'point', default: [0, 0], unit: 'px', label: 'Acceleration', group: 'Forces' },
    collisions: { type: 'boolean', default: true, label: 'Body collisions', group: 'Contacts' },
    solids: { type: 'nodes', default: [], label: 'Solid targets', animatable: false, random: false, group: 'Contacts' },
    friction: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Friction', group: 'Contacts' },
    bounce: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Restitution', group: 'Contacts' },
  },
  apply(geo, p, ctx) {
    const time = Math.max(0, Math.min(60, p.time));
    if (!time || !geo.shapes.length) return geo;
    const solids = [...new Set(p.solids)].flatMap((id) => { const target = ctx.target?.(id); return target ? [target] : []; });
    const key = geometryKey([geo, ...solids]);
    let cached = worlds.get(key);
    if (!cached) {
      const groups = new Map<number, number[]>();
      geo.shapes.forEach((shape, i) => {
        const key = shape.clone ?? i;
        groups.set(key, [...(groups.get(key) ?? []), i]);
      });
      const parts: PhysicsCache['parts'] = [...groups.values()].map((shapeIndices) => ({ shapeIndices }));
      const bodies: CollisionBody[] = [], indices = new Map<number, number>();
      const detail = Math.max(Math.max(ctx.bounds.width, ctx.bounds.height) * 0.006, 0.25);
      for (const [partIndex, entry] of parts.entries()) {
        const shapes = entry.shapeIndices.map((i) => geo.shapes[i]!);
        const part = { ...geo, shapes };
        const body = entry.body === undefined ? (entry.body = gravityBody(part)) : entry.body;
        const fixed = !!shapes[0]?.impulse?.immovable;
        const collider = entry.collider === undefined ? (entry.collider = collisionBody(part, body ?? undefined, fixed, detail, true)) : entry.collider;
        if (collider) { indices.set(partIndex, bodies.length); bodies.push(collider); }
      }
      for (const solid of solids) { const collider = collisionBody(solid, undefined, true, detail, true); if (collider) bodies.push(collider); }
      cached = { parts, world: { bodies }, indices };
      worlds.set(key, cached);
      if (worlds.size > 12) worlds.delete(worlds.keys().next().value!);
    }
    worlds.delete(key);
    worlds.set(key, cached);

    const poses = physicsWorld(cached.world, p.acceleration, time, Math.max(0, Math.min(1, p.friction)), Math.max(0, Math.min(1, p.bounce)), p.collisions);
    const transforms = new Map<Shape, (point: readonly [number, number]) => [number, number]>();
    for (const [partIndex, entry] of cached.parts.entries()) {
      const shapes = entry.shapeIndices.map((i) => geo.shapes[i]!);
      const body = entry.body ?? (entry.body = gravityBody({ ...geo, shapes }));
      const poseIndex = cached.indices.get(partIndex);
      const pose = poseIndex === undefined ? undefined : poses[poseIndex] as FallPose | undefined;
      if (!body || !pose) { shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x, y])); continue; }
      const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
      shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [
        pose.x + (x - body.center[0]) * c - (y - body.center[1]) * s,
        pose.y + (x - body.center[0]) * s + (y - body.center[1]) * c,
      ]));
    }
    return {
      ...geo,
      shapes: geo.shapes.map((shape) => {
        const moved = mapPoints({ ...geo, shapes: [shape] }, transforms.get(shape)!).shapes[0]!;
        const { impulse: _consumed, ...result } = moved;
        return result;
      }),
    };
  },
});
