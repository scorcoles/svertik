import { bounds, mapPoints, type Bounds, type Geometry, type Shape, type Vec2 } from '../geometry';
import { collisionBody, physicsStates, type CollisionBody, type CollisionWorld, type State } from './gravity-collisions';
import { gravityBody, type Body } from './gravity-physics';
import { defineModifier, resolveParams, type HistoryLookup } from '../modifier';

/** One element of the input (a child, a copy, a tile): the shapes that move together as one body. */
interface Part {
  shapeIndices: number[];
  /** Which element it is (`clone`, or its position), and which node it comes from. */
  key: number;
  node?: string;
  body: Body | null;
  collider: CollisionBody | null;
  /** Its box at rest (in the input's coordinates): to know which earlier body a new piece comes from. */
  box: Bounds;
}
/** The bodies of one input: its parts and the solids, and which body each part is. */
interface Layout {
  key: string;
  parts: Part[];
  bodies: CollisionBody[];
  indices: Map<number, number>;
}

function geometryKey(geometries: Geometry[]): string {
  let hash = 2166136261;
  const add = (value: string) => { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
  for (const geo of geometries) for (const shape of geo.shapes) {
    add(JSON.stringify([shape.clone, shape.node, shape.style.fill !== 'none', shape.impulse]));
    for (const path of shape.subpaths) {
      add(JSON.stringify([path.closed, path.start]));
      for (const segment of path.segs) add(JSON.stringify([segment.c1, segment.c2, segment.p]));
    }
  }
  return (hash >>> 0).toString(36);
}

/** The elements of an input, grouped as Physics moves them. */
function groupsOf(geo: Geometry): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  geo.shapes.forEach((shape, i) => {
    const key = shape.clone ?? i;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return groups;
}

/** Which pieces there are: when it changes (a Mosaic that cuts more, an Explosion…), the bodies change. */
const piecesOf = (geo: Geometry) => [...groupsOf(geo)].map(([key, list]) => `${key}:${list.length}:${geo.shapes[list[0]!]!.node ?? ''}`).join(',');

const layouts = new Map<string, Layout>();
function layoutOf(geo: Geometry, solids: Geometry[], detail: number): Layout {
  const key = geometryKey([geo, ...solids]) + '|' + detail;
  let layout = layouts.get(key);
  if (!layout) {
    const parts: Part[] = [], bodies: CollisionBody[] = [], indices = new Map<number, number>();
    for (const [elementKey, shapeIndices] of groupsOf(geo)) {
      const shapes = shapeIndices.map((i) => geo.shapes[i]!);
      const part = { ...geo, shapes };
      const body = gravityBody(part);
      const fixed = !!shapes[0]?.impulse?.immovable;
      const collider = body ? collisionBody(part, body, fixed, detail, true) : null;
      if (collider) { indices.set(parts.length, bodies.length); bodies.push(collider); }
      parts.push({ shapeIndices, key: elementKey, node: shapes[0]?.node, body, collider, box: bounds(part) });
    }
    for (const solid of solids) { const collider = collisionBody(solid, undefined, true, detail, true); if (collider) bodies.push(collider); }
    layout = { key, parts, bodies, indices };
    layouts.set(key, layout);
    if (layouts.size > 64) layouts.delete(layouts.keys().next().value!);
  }
  layouts.delete(key);
  layouts.set(key, layout);
  return layout;
}

/** A world per layout and starting states: its replay (with checkpoints) is kept from one frame to the next. */
const worlds = new Map<string, CollisionWorld>();
function worldOf(layout: Layout, start: (State | undefined)[] | undefined): CollisionWorld {
  const key = layout.key + '|' + JSON.stringify(start ?? null);
  let world = worlds.get(key);
  if (!world) {
    world = { bodies: layout.bodies };
    worlds.set(key, world);
    if (worlds.size > 64) worlds.delete(worlds.keys().next().value!);
  }
  return world;
}

const overlap = (a: Bounds, b: Bounds) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/**
 * The state each new body starts in when the pieces change: that of the earlier body it comes from (the one
 * of the same node that most overlaps it at rest), carried rigidly: same angle and spin, and the speed of
 * that point of the old body. A piece with no origin starts at rest where it is, with its own impulse.
 */
function inherit(before: Layout, states: State[], after: Layout): (State | undefined)[] {
  const start: (State | undefined)[] = [];
  after.parts.forEach((part, partIndex) => {
    const index = after.indices.get(partIndex);
    if (index === undefined || !part.body) return;
    let best: { part: Part; state: State; score: number; distance: number } | null = null;
    before.parts.forEach((old, oldIndex) => {
      const i = before.indices.get(oldIndex);
      if (i === undefined || !old.body || old.node !== part.node) return;
      const score = overlap(old.box, part.box);
      const distance = Math.hypot(old.body.center[0] - part.body!.center[0], old.body.center[1] - part.body!.center[1]);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) <= 1e-9 && distance < best.distance)) best = { part: old, state: states[i]!, score, distance };
    });
    if (!best) return;
    const { part: old, state } = best as { part: Part; state: State };
    const c = Math.cos(state.angle), s = Math.sin(state.angle);
    const dx = part.body.center[0] - old.body!.center[0], dy = part.body.center[1] - old.body!.center[1];
    const rx = dx * c - dy * s, ry = dx * s + dy * c;
    start[index] = part.collider!.fixed
      ? { x: state.x + rx, y: state.y + ry, angle: state.angle, vx: 0, vy: 0, omega: 0 }
      : { x: state.x + rx, y: state.y + ry, angle: state.angle, vx: state.vx - state.omega * ry, vy: state.vy + state.omega * rx, omega: state.omega };
  });
  return start;
}

// ── When the pieces changed (from the input's past)
const HZ = 120;
/** Coarse sampling of the past, in simulation steps (a quarter of a second); changes are then pinned to the step. */
const COARSE = 30;
interface Sample { pieces: string; geo: Geometry; time: number }
const pasts = new Map<string, Map<number, Sample | null>>();

/**
 * The stretches of the simulation: from each change of pieces to the next, with the input then. The first
 * starts at 0; the last uses the input now. Without a past (or if it never changed), one stretch.
 */
function stretchesOf(history: HistoryLookup | undefined, now: Geometry, time: number): { start: number; geo: Geometry }[] {
  const single = [{ start: 0, geo: now }];
  if (!history || history.now <= 0) return single;
  let samples = pasts.get(history.key);
  if (!samples) {
    samples = new Map();
    pasts.set(history.key, samples);
    if (pasts.size > 16) pasts.delete(pasts.keys().next().value!);
  }
  const memo = samples;
  const at = (step: number): Sample | null => {
    if (memo.has(step)) return memo.get(step)!;
    const then = history.at(step / HZ);
    const sample = then ? { pieces: piecesOf(then.geo), geo: then.geo, time: Math.max(0, Math.min(60, resolveParams(physics.params, then.params).time)) } : null;
    memo.set(step, sample);
    return sample;
  };
  const last = Math.floor(history.now * HZ + 1e-9);
  // Where the pieces change: on a coarse grid, then halving down to the step where they are new.
  const changes: number[] = [];
  const find = (a: number, b: number) => {
    const sa = at(a), sb = at(b);
    if (!sa || !sb || sa.pieces === sb.pieces) return;
    if (b - a <= 1) return void changes.push(b);
    const m = Math.floor((a + b) / 2);
    find(a, m);
    find(m, b);
  };
  const grid: number[] = [];
  for (let step = 0; step < last; step += COARSE) grid.push(step);
  grid.push(last);
  for (let i = 1; i < grid.length; i++) find(grid[i - 1]!, grid[i]!);
  const first = at(0);
  if (!first || !changes.length) return single;
  const out = [{ start: 0, geo: first.geo }];
  for (const step of changes) {
    const sample = at(step)!;
    // In the simulation's time (Physics' own Time); a change after it doesn't count yet.
    if (sample.time <= out[out.length - 1]!.start || sample.time > time) continue;
    out.push({ start: sample.time, geo: sample.geo });
  }
  out[out.length - 1] = { ...out[out.length - 1]!, geo: now };
  return out;
}

/** General purpose 2D rigid-body simulation for all elements in a group. */
export const physics = defineModifier({
  type: 'physics',
  label: 'Physics',
  kind: 'effector',
  history: true,
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
    const detail = Math.max(Math.max(ctx.bounds.width, ctx.bounds.height) * 0.006, 0.25);
    const friction = Math.max(0, Math.min(1, p.friction)), bounce = Math.max(0, Math.min(1, p.bounce));

    // Stretch by stretch: each one starts with the bodies of the previous one where they left off.
    const stretches = stretchesOf(ctx.history, geo, time);
    let layout!: Layout;
    let states: State[] = [];
    stretches.forEach((stretch, i) => {
      const next = layoutOf(stretch.geo, solids, detail);
      const start = i ? inherit(layout, states, next) : undefined;
      const end = stretches[i + 1]?.start ?? time;
      states = physicsStates(worldOf(next, start), p.acceleration, end - stretch.start, friction, bounce, p.collisions, start);
      layout = next;
    });

    const transforms = new Map<Shape, (point: readonly [number, number]) => [number, number]>();
    layout.parts.forEach((part, partIndex) => {
      const shapes = part.shapeIndices.map((i) => geo.shapes[i]!);
      const index = layout.indices.get(partIndex);
      const pose = index === undefined ? undefined : states[index];
      if (!part.body || !pose) return shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x, y]));
      const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
      const center: Vec2 = part.body.center;
      shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [
        pose.x + (x - center[0]) * c - (y - center[1]) * s,
        pose.y + (x - center[0]) * s + (y - center[1]) * c,
      ]));
    });
    return {
      ...geo,
      shapes: geo.shapes.map((shape) => {
        const moved = mapPoints({ ...geo, shapes: [shape] }, transforms.get(shape) ?? (([x, y]) => [x, y])).shapes[0]!;
        const { impulse: _consumed, ...result } = moved;
        return result;
      }),
    };
  },
});
