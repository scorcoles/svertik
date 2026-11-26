import { bounds, flatten, line, mapPoints, networkLinkShape, type Bounds, type Geometry, type Shape, type Vec2 } from '../geometry';
import { collisionBody, createStepper, type CollisionBody, type State, type StepSettings } from './gravity-collisions';
import { gravityBody, type Body } from './gravity-physics';
import { defineModifier, resolveParams, type HistoryLookup, type SceneSpace } from '../modifier';
import { apply as applyMat } from '../matrix';
import { crack } from './crack';
import { hasSoftMaterial, softGeometry, softPlanOf, softStepper, type Frame, type SoftPlan, type SoftSettings } from './softbody-physics';

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
  /** A piece of a burst body: how fast it leaves the body's centre when it appears. */
  burst?: number;
}
/** The bodies of one input: its parts and the solids, and which body each part is. */
interface Layout {
  key: string;
  /** Which pieces there are (not their shapes): a change here is a body born, gone or cut. */
  pieces: string;
  parts: Part[];
  bodies: CollisionBody[];
  indices: Map<number, number>;
}

// The outlines' part of the key, per subpath list: a frame's input rebuilds its shapes around the same outlines
// (an unchanged child keeps its cached geometry), so each is hashed once instead of on every frame.
const outlineKeys = new WeakMap<Shape['subpaths'], string>();
function outlineKey(subpaths: Shape['subpaths']): string {
  let key = outlineKeys.get(subpaths);
  if (key === undefined) {
    let hash = 2166136261;
    const add = (value: string) => { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
    for (const path of subpaths) {
      add(JSON.stringify([path.closed, path.start]));
      for (const segment of path.segs) add(JSON.stringify([segment.c1, segment.c2, segment.p]));
    }
    outlineKeys.set(subpaths, key = (hash >>> 0).toString(36));
  }
  return key;
}
const geometryKeys = new WeakMap<Geometry, string>();
function geometryKey(geometries: Geometry[]): string {
  let hash = 2166136261;
  const add = (value: string) => { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
  for (const geo of geometries) {
    let own = geometryKeys.get(geo);
    if (own === undefined) {
      const parts: string[] = [];
      for (const shape of geo.shapes) parts.push(JSON.stringify([shape.clone, shape.bodyGroup, shape.node, shape.style.fill !== 'none', shape.impulse, shape.force, shape.burstSpeed]), outlineKey(shape.subpaths));
      geometryKeys.set(geo, own = parts.join('|'));
    }
    add(own);
  }
  return (hash >>> 0).toString(36);
}

/** The elements of an input, grouped as Physics moves them. */
function groupsOf(geo: Geometry): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  geo.shapes.forEach((shape, i) => {
    // A Network link is not a body: it is drawn again between the bodies it joins.
    if (shape.networkLink) return;
    const key = shape.bodyGroup ?? shape.clone ?? i;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  return groups;
}

/** Which pieces there are: when it changes (a Mosaic that cuts more, an Explosion, a click that adds one…), the bodies change. */
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
      let collider = body ? collisionBody(part, body, fixed, detail, true) : null;
      // A Gravity inside this group adds its pull and its floor to the bodies it was on.
      const force = shapes[0]?.force;
      if (collider && force) collider = { ...collider, acceleration: force.acceleration, ...(force.plane ? { planes: [force.plane] } : {}) };
      if (collider) { indices.set(parts.length, bodies.length); bodies.push(collider); }
      parts.push({ shapeIndices, key: elementKey, node: shapes[0]?.node, body, collider, box: bounds(part), ...(shapes[0]?.burstSpeed ? { burst: shapes[0].burstSpeed } : {}) });
    }
    for (const solid of solids) { const collider = collisionBody(solid, undefined, true, detail, true); if (collider) bodies.push(collider); }
    layout = { key, pieces: piecesOf(geo), parts, bodies, indices };
    layouts.set(key, layout);
    if (layouts.size > 64) layouts.delete(layouts.keys().next().value!);
  }
  layouts.delete(key);
  layouts.set(key, layout);
  return layout;
}

const overlap = (a: Bounds, b: Bounds) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/**
 * The state each new body starts in when the pieces change: that of the earlier body it comes from (the same
 * element, or else the one of the same node that most overlaps it at rest), carried rigidly: same angle and
 * spin, and the speed of that point of the old body. A piece with no origin (a body just born) starts at rest
 * where it is, with its own impulse. `carried` maps each body kept as it was to its new index.
 */
function inherit(before: Layout, states: State[], after: Layout): { start: (State | undefined)[]; carried: Map<number, number> } {
  const start: (State | undefined)[] = [];
  const carried = new Map<number, number>();
  const same = new Map(before.parts.map((part, i) => [`${part.node ?? ''}#${part.key}`, i]));
  after.parts.forEach((part, partIndex) => {
    const index = after.indices.get(partIndex);
    if (index === undefined || !part.body) return;
    let best: { part: Part; state: State; score: number; distance: number } | null = null;
    const exact = same.get(`${part.node ?? ''}#${part.key}`);
    const exactIndex = exact === undefined ? undefined : before.indices.get(exact);
    if (exact !== undefined && exactIndex !== undefined && before.parts[exact]!.body) {
      best = { part: before.parts[exact]!, state: states[exactIndex]!, score: Infinity, distance: 0 };
      carried.set(exactIndex, index);
    } else before.parts.forEach((old, oldIndex) => {
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
  return { start, carried };
}

// ── The live world
//
// A world per Physics effect (per scene, apart from its time and from what is born at runtime) that steps
// forward and keeps what it did: bodies born or gone, and snapshots. Going on from the last frame costs only
// the new steps; a click that adds a body joins the running simulation at that moment; going back restores a
// snapshot and replays what was recorded. Changing anything in the scene starts a new world from 0.
const HZ = 120;
/** Coarse sampling of the past when looking for changes, in simulation steps (a quarter of a second). */
const COARSE = 30;
/** Steps between snapshots, and how many are kept (older ones are thinned, never the first). */
const SNAPSHOT = 30;
const MAX_SNAPSHOTS = 1200;

/** One input's bodies, stepped forward: rigid ones or a soft material. `S` is the state of the bodies. */
interface Run<S> {
  /** The input's shapes, and which pieces it has. */
  key: string;
  pieces: string;
  initial(): S;
  /** Starts from the previous run's state: kept bodies go on as they were, new ones from where they come from (or at rest). */
  from(before: Run<S>, state: S): S;
  advance(state: S, dt: number): S;
  copy(state: S): S;
  /** A click's push (Poke): adds `dv` to the speed of the body `identity` (node and element key), if it has one here. */
  kick(state: S, identity: string, dv: Vec2): S;
  /** Drag & throw: grabs the body of `node` at `point` (this stack's coordinates); what `pull` holds; null if there is none. */
  grab(state: S, node: string, point: Vec2, body?: string): Grip | null;
  /** Pulls the grabbed point towards `target` for `dt`: a critically damped spring (the pointer's). */
  pull(state: S, grip: Grip, target: Vec2, dt: number): S;
  /**
   * Hover push: the pointer went from `a` to `b` at `velocity` (px/s): bodies within `radius` of that stretch
   * take on part of its velocity and part away from it, more the nearer they are. Absent: no sweeping.
   */
  sweep?(state: S, a: Vec2, b: Vec2, velocity: Vec2, radius: number): S;
}
/** What a drag holds: the body, and the point it was grabbed by (in its own frame) or the particles near it. */
interface Grip { identity: string; anchor: Vec2; particle?: number; weights?: Float64Array }
/** The pointer's spring: about 4 Hz, critically damped (it follows without wobbling; on release the body keeps its speed). */
const SPRING = 2 * Math.PI * 4;
/** From `step` on, this run (a new one when a body is born, gone or cut). */
interface Epoch<S> { step: number; run: Run<S> }
/** Where the world is: at `step`, in epoch `epoch`; `scene`, the scene time it corresponds to. */
interface Cursor<S> { step: number; epoch: number; state: S; scene: number }
interface Live<S> {
  key: string; epochs: Epoch<S>[]; snapshots: Cursor<S>[]; cursor: Cursor<S>;
  /** The step each click (Poke) was given when first seen, so replaying puts it at the same step. */
  pokeSteps: Map<string, number>;
  /** This frame's pushes by step: applied as the world steps forward from that step. */
  kicks: Map<number, { identity: string; dv: Vec2 }[]>;
  /** Drags (Drag & throw): their path by step, and what each one grabbed (once, at its first step). */
  drags: LiveDrag[];
  grips: Map<number, Grip | null>;
  /** The gestures the recorded steps were simulated with (each with its step), to notice one that changed or went away. */
  events: Map<string, number>;
  /**
   * Hover push: the step each pointer sample was given when first seen, and this frame's strokes by step. They
   * only push forward (a seek back forgets them), so they are left out of `events`.
   */
  sweepSteps: Map<string, number>;
  sweeps: Map<number, { a: Vec2; b: Vec2; velocity: Vec2 }[]>;
  radius: number;
}
interface LiveDrag { id: number; node: string; body?: string; steps: number[]; points: Vec2[]; end?: number }
/** A drag of a body, in this stack's coordinates (see `SceneV1.drags`). */
interface DragIn { id: number; node: string; body?: string; points: { at: number; point: Vec2 }[]; end?: number }
const targetOf = (drag: LiveDrag, step: number): Vec2 => {
  let k = 0;
  while (k + 1 < drag.steps.length && drag.steps[k + 1]! <= step) k++;
  const next = drag.steps[k + 1];
  if (next === undefined || next <= drag.steps[k]!) return drag.points[k]!;
  const f = (step - drag.steps[k]!) / (next - drag.steps[k]!), a = drag.points[k]!, b = drag.points[k + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
/** A click on a body (Poke), ready for the world: when, which body, and the change of speed in its axes. */
interface Kick { at: number; identity: string; dv: Vec2 }
const lives = new Map<string, Live<unknown>>();

const copyOf = <S>(live: Live<S>, c: Cursor<S>): Cursor<S> => ({ ...c, state: live.epochs[c.epoch]!.run.copy(c.state) });

/** Into the next epoch. */
function enter<S>(live: Live<S>, index: number) {
  const { cursor } = live, before = live.epochs[cursor.epoch]!.run, after = live.epochs[index]!.run;
  live.cursor = { ...cursor, epoch: index, state: after.from(before, cursor.state) };
}

/** Steps forward to `target` through the recorded epochs, taking snapshots on the way. */
function advanceTo<S>(live: Live<S>, target: number, sceneAt: (step: number) => number) {
  for (;;) {
    let next = live.epochs[live.cursor.epoch + 1];
    while (next && next.step <= live.cursor.step) { enter(live, live.cursor.epoch + 1); next = live.epochs[live.cursor.epoch + 1]; }
    if (live.cursor.step >= target) return;
    const stop = Math.min(target, next?.step ?? Infinity);
    const { run } = live.epochs[live.cursor.epoch]!;
    let { step, state } = live.cursor;
    for (; step < stop; step++) {
      for (const kick of live.kicks.get(step) ?? []) state = run.kick(state, kick.identity, kick.dv);
      if (run.sweep) for (const stroke of live.sweeps.get(step) ?? []) state = run.sweep(state, stroke.a, stroke.b, stroke.velocity, live.radius);
      for (const drag of live.drags) {
        if (step < drag.steps[0]! || (drag.end !== undefined && step >= drag.end)) continue;
        let grip = live.grips.get(drag.id);
        if (grip === undefined) live.grips.set(drag.id, grip = run.grab(state, drag.node, drag.points[0]!, drag.body));
        if (grip) state = run.pull(state, grip, targetOf(drag, step), 1 / HZ);
      }
      state = run.advance(state, 1 / HZ);
      if ((step + 1) % SNAPSHOT === 0 && (step + 1) > live.snapshots[live.snapshots.length - 1]!.step) {
        live.snapshots.push({ step: step + 1, epoch: live.cursor.epoch, state: run.copy(state), scene: sceneAt(step + 1) });
        if (live.snapshots.length > MAX_SNAPSHOTS) live.snapshots = live.snapshots.filter((_, i) => i === 0 || i >= MAX_SNAPSHOTS / 2 || i % 2 === 0);
      }
    }
    live.cursor = { ...live.cursor, step, state };
  }
}

/** Forgets what was recorded after the cursor (it didn't happen that way after all). */
function truncate<S>(live: Live<S>) {
  const { cursor } = live;
  live.epochs.length = cursor.epoch + 1;
  live.snapshots = live.snapshots.filter((s) => s.epoch <= cursor.epoch && s.step <= cursor.step);
}

/** Starts a new epoch at the cursor with another run. */
function swap<S>(live: Live<S>, run: Run<S>) {
  truncate(live);
  live.epochs.push({ step: live.cursor.step, run });
  enter(live, live.epochs.length - 1);
}

/**
 * The world of this Physics at its Time now: the run in force (the input now) and its bodies' state.
 * `runOf` makes the run of an input; `key`, the settings that, when changed, start the world again.
 */
function simulate<S>(geo: Geometry, time: number, history: HistoryLookup | undefined, scope: string, key: string, runOf: (geo: Geometry) => Run<S>, kicks: Kick[] = [], drags: DragIn[] = [], sweep?: { samples: { at: number; point: Vec2 }[]; radius: number }): { run: Run<S>; state: S } {
  const now = runOf(geo);
  const target = Math.floor(time * HZ + 1e-9);
  const sceneNow = history?.now ?? 0;
  let live = lives.get(scope) as Live<S> | undefined;
  if (!live || live.key !== key) {
    const then = history && history.now > 0 ? history.at(0) : null;
    const first = then ? runOf(then.geo) : now;
    live = { key, epochs: [{ step: 0, run: first }], snapshots: [], cursor: { step: 0, epoch: 0, state: first.initial(), scene: 0 }, pokeSteps: new Map(), kicks: new Map(), drags: [], grips: new Map(), events: new Map(), sweepSteps: new Map(), sweeps: new Map(), radius: 0 };
    live.snapshots.push(copyOf(live, live.cursor));
    lives.set(scope, live as Live<unknown>);
    if (lives.size > 64) lives.delete(lives.keys().next().value!);
  }
  lives.delete(scope);
  lives.set(scope, live as Live<unknown>);

  // Clicks (Poke): a new one goes at the step of its scene time, never before where the world already is
  // (it pushes from this frame on); then it keeps that step.
  live.kicks = new Map();
  for (const kick of kicks) {
    const id = `${kick.at}|${kick.identity}`;
    let step = live.pokeSteps.get(id);
    if (step === undefined) {
      const mapped = Math.floor((time - (sceneNow - kick.at)) * HZ + 1e-9);
      step = Math.max(0, Math.min(target, target >= live.cursor.step ? Math.max(mapped, live.cursor.step) : mapped));
      live.pokeSteps.set(id, step);
    }
    if (step > target) continue;
    live.kicks.set(step, [...(live.kicks.get(step) ?? []), { identity: kick.identity, dv: kick.dv }]);
  }
  // Hover push: each sample of the pointer's path goes at the step of its scene time, never before where the
  // world is; each stretch between two samples is one stroke, at the later one's step.
  live.sweeps = new Map();
  live.radius = sweep?.radius ?? 0;
  const sweepSteps = new Map<string, number>();
  if (sweep && sweep.radius > 0) {
    let before: { at: number; point: Vec2 } | null = null;
    for (const sample of sweep.samples) {
      const id = `${sample.at}|${sample.point.join(',')}`;
      let step = live.sweepSteps.get(id);
      if (step === undefined) step = Math.max(0, Math.min(target, Math.max(Math.floor((time - (sceneNow - sample.at)) * HZ + 1e-9), live.cursor.step)));
      sweepSteps.set(id, step);
      if (before && sample.at > before.at && step <= target) {
        const dt = Math.max(sample.at - before.at, 1 / HZ);
        const velocity: Vec2 = [(sample.point[0] - before.point[0]) / dt, (sample.point[1] - before.point[1]) / dt];
        live.sweeps.set(step, [...(live.sweeps.get(step) ?? []), { a: before.point, b: sample.point, velocity }]);
      }
      before = sample;
    }
  }
  live.sweepSteps = sweepSteps;
  // Drags: each point of the path goes at its step like a click, in order; so does the release.
  const stepOf = (id: string, at: number, after: number) => {
    let step = live!.pokeSteps.get(id);
    if (step === undefined) {
      const mapped = Math.floor((time - (sceneNow - at)) * HZ + 1e-9);
      step = Math.max(after, 0, Math.min(target, target >= live!.cursor.step ? Math.max(mapped, live!.cursor.step) : mapped));
      live!.pokeSteps.set(id, step);
    }
    return step;
  };
  live.drags = drags.map((drag) => {
    const steps: number[] = [];
    drag.points.forEach((point, k) => steps.push(stepOf(`drag:${drag.id}:${k}:${point.at}`, point.at, k ? steps[k - 1]! : 0)));
    return { id: drag.id, node: drag.node, ...(drag.body ? { body: drag.body } : {}), steps, points: drag.points.map((p) => p.point), ...(drag.end !== undefined ? { end: stepOf(`drag:${drag.id}:end`, drag.end, steps[steps.length - 1]!) } : {}) };
  });
  // A gesture that went away or changed before where the world is (a seek back before it, an edit of the list):
  // what was recorded from its step on had it, so the world goes back to before it. New ones are never
  // earlier than the world (they go at its step at the latest).
  const events = new Map<string, number>();
  for (const [step, list] of live.kicks) for (const kick of list) events.set(`kick:${step}:${kick.identity}:${kick.dv.join(',')}`, step);
  for (const drag of live.drags) {
    drag.steps.forEach((step, k) => events.set(`drag:${drag.id}:${k}:${step}:${drag.points[k]!.join(',')}`, step));
    if (drag.end !== undefined) events.set(`drag:${drag.id}:end:${drag.end}`, drag.end);
  }
  let changed = Infinity;
  for (const [id, step] of live.events) if (!events.has(id)) changed = Math.min(changed, step);
  for (const [id, step] of events) if (!live.events.has(id)) changed = Math.min(changed, step);
  live.events = events;
  if (changed < live.cursor.step) {
    const snapshot = live.snapshots.filter((s) => s.step <= changed).pop()!;
    live.cursor = copyOf(live, snapshot);
    live.snapshots = live.snapshots.filter((s) => s.step <= snapshot.step);
  }
  // Back in time: from the last snapshot at or before the target.
  if (target < live.cursor.step) live.cursor = copyOf(live, live.snapshots.filter((s) => s.step <= target).pop()!);
  const from = copyOf(live, live.cursor);
  // Scene time of a step between the cursor and now, for snapshots (only to bound later searches).
  const sceneAt = (step: number) => target > from.step ? from.scene + (sceneNow - from.scene) * (step - from.step) / (target - from.step) : sceneNow;
  advanceTo(live, target, sceneAt);
  if (live.epochs[live.cursor.epoch]!.run.pieces !== now.pieces) {
    // What was recorded (or not) doesn't match the input now: redo from where this frame started, reading
    // the past for when the pieces changed.
    live.cursor = from;
    truncate(live);
    if (history) for (const change of changesBetween(history, Math.min(from.scene, sceneNow), sceneNow)) {
      const step = Math.floor(change.time * HZ + 1e-9);
      if (step < live.cursor.step || step > target) continue;
      advanceTo(live, step, sceneAt);
      swap(live, runOf(change.geo));
    }
    advanceTo(live, target, sceneAt);
  }
  // The same pieces with other shapes (animated, or the change found in the past): go on with these.
  if (live.epochs[live.cursor.epoch]!.run.key !== now.key) swap(live, now);
  live.cursor.scene = sceneNow;
  const run = live.epochs[live.cursor.epoch]!.run;
  const fraction = time - target / HZ;
  return { run, state: fraction > 1e-12 ? run.advance(live.cursor.state, fraction) : live.cursor.state };
}

interface Rigid { states: State[]; pending: Set<number> }
type RigidRun = Run<Rigid> & { layout: Layout };
// Runs are kept per input and settings: a frame whose input didn't change reuses its stepper.
const rigidRuns = new WeakMap<Layout, Map<string, RigidRun>>();
function rigidRun(layout: Layout, settings: StepSettings): RigidRun {
  const key = JSON.stringify(settings);
  let runs = rigidRuns.get(layout);
  if (!runs) rigidRuns.set(layout, runs = new Map());
  let run = runs.get(key);
  if (!run) runs.set(key, run = makeRigidRun(layout, settings));
  return run;
}
function makeRigidRun(layout: Layout, settings: StepSettings): RigidRun {
  const stepper = createStepper(layout.bodies, settings);
  return {
    key: layout.key, pieces: layout.pieces, layout,
    initial: () => { const states = stepper.initial(); return { states, pending: stepper.pendingOf(states) }; },
    from(before, state) {
      const old = (before as RigidRun).layout;
      const { start, carried } = inherit(old, state.states, layout);
      const states = stepper.initial(start);
      const pending = new Set<number>();
      const n = old.bodies.length, m = layout.bodies.length;
      for (const pair of state.pending) {
        const a = carried.get(Math.floor(pair / n)), b = carried.get(pair % n);
        if (a !== undefined && b !== undefined) pending.add(Math.min(a, b) * m + Math.max(a, b));
      }
      const kept = new Set(carried.values());
      // The pieces of a body that just burst fly out from the centre of all of them.
      const pieces = new Map<string, number[]>();
      layout.parts.forEach((part, partIndex) => {
        const i = layout.indices.get(partIndex);
        if (i === undefined || !part.burst || kept.has(i) || layout.bodies[i]!.fixed) return;
        pieces.set(part.node ?? '', [...(pieces.get(part.node ?? '') ?? []), i]);
      });
      for (const list of pieces.values()) {
        const cx = list.reduce((sum, i) => sum + states[i]!.x, 0) / list.length, cy = list.reduce((sum, i) => sum + states[i]!.y, 0) / list.length;
        for (const i of list) {
          const dx = states[i]!.x - cx, dy = states[i]!.y - cy, length = Math.hypot(dx, dy), speed = layout.parts[[...layout.indices].find(([, b]) => b === i)![0]]!.burst!;
          if (length > 1e-9) states[i] = { ...states[i]!, vx: states[i]!.vx + dx / length * speed, vy: states[i]!.vy + dy / length * speed };
        }
      }
      for (const pair of stepper.pendingOf(states, new Set(layout.bodies.map((_, i) => i).filter((i) => !kept.has(i))))) pending.add(pair);
      return { states, pending };
    },
    advance: (state, dt) => stepper.advance(state.states, state.pending, dt),
    copy: (state) => ({ states: state.states.map((s) => ({ ...s })), pending: new Set(state.pending) }),
    kick(state, identity, dv) {
      const part = layout.parts.findIndex((p) => `${p.node ?? ''}#${p.key}` === identity);
      const index = part < 0 ? undefined : layout.indices.get(part);
      if (index === undefined || layout.bodies[index]!.fixed) return state;
      const states = state.states.slice();
      states[index] = { ...states[index]!, vx: states[index]!.vx + dv[0], vy: states[index]!.vy + dv[1] };
      return { ...state, states };
    },
    grab(state, node, point, body) {
      // The body that was pressed, or else the one of that node nearest the point.
      let best: { identity: string; index: number; distance: number } | null = null;
      layout.parts.forEach((part, partIndex) => {
        const index = layout.indices.get(partIndex);
        if (part.node !== node || index === undefined || layout.bodies[index]!.fixed) return;
        if (body && `${part.node ?? ''}#${part.key}` !== body) return;
        const s = state.states[index]!, distance = Math.hypot(s.x - point[0], s.y - point[1]);
        if (!best || distance < best.distance) best = { identity: `${part.node ?? ''}#${part.key}`, index, distance };
      });
      if (!best) return null;
      const { identity, index } = best as { identity: string; index: number };
      const s = state.states[index]!, c = Math.cos(s.angle), sn = Math.sin(s.angle), dx = point[0] - s.x, dy = point[1] - s.y;
      return { identity, anchor: [dx * c + dy * sn, -dx * sn + dy * c] };
    },
    pull(state, grip, target, dt) {
      const part = layout.parts.findIndex((p) => `${p.node ?? ''}#${p.key}` === grip.identity);
      const index = part < 0 ? undefined : layout.indices.get(part);
      if (index === undefined || layout.bodies[index]!.fixed) return state;
      const s = state.states[index]!, k2 = Math.max(layout.bodies[index]!.body.inertia, 1e-9);
      const c = Math.cos(s.angle), sn = Math.sin(s.angle), rx = grip.anchor[0] * c - grip.anchor[1] * sn, ry = grip.anchor[0] * sn + grip.anchor[1] * c;
      const gx = s.x + rx, gy = s.y + ry, vx = s.vx - s.omega * ry, vy = s.vy + s.omega * rx;
      // The change of speed the spring wants at the grabbed point; the impulse that gives it there (the body
      // turns about its centre of mass as it is pulled by a point off it).
      const wx = (SPRING * SPRING * (target[0] - gx) - 2 * SPRING * vx) * dt, wy = (SPRING * SPRING * (target[1] - gy) - 2 * SPRING * vy) * dt;
      const a = 1 + ry * ry / k2, b = -rx * ry / k2, d = 1 + rx * rx / k2, det = a * d - b * b;
      const jx = (d * wx - b * wy) / det, jy = (a * wy - b * wx) / det;
      const states = state.states.slice();
      states[index] = { ...s, vx: s.vx + jx, vy: s.vy + jy, omega: s.omega + (rx * jy - ry * jx) / k2 };
      return { ...state, states };
    },
    sweep(state, a, b, velocity, radius) {
      const speed = Math.hypot(velocity[0], velocity[1]);
      if (!(radius > 0) || speed < 1e-6) return state;
      const ex = b[0] - a[0], ey = b[1] - a[1], length2 = ex * ex + ey * ey;
      let states: State[] | null = null;
      layout.bodies.forEach((body, i) => {
        if (body.fixed) return;
        const s = state.states[i]!;
        // The nearest point of the stroke to the body's centre.
        const t = length2 > 1e-12 ? Math.max(0, Math.min(1, ((s.x - a[0]) * ex + (s.y - a[1]) * ey) / length2)) : 1;
        const dx = s.x - (a[0] + ex * t), dy = s.y - (a[1] + ey * t), distance = Math.hypot(dx, dy);
        if (distance >= radius) return;
        const near = 1 - distance / radius, f = near * near;
        // Carried along with the pointer, and pushed aside from its path; a body off the path turns a little.
        const out = distance > 1e-9 ? 0.35 * speed * f / distance : 0;
        const vx = s.vx + (velocity[0] - s.vx) * 0.6 * f + dx * out, vy = s.vy + (velocity[1] - s.vy) * 0.6 * f + dy * out;
        const omega = s.omega + f * (dx * velocity[1] - dy * velocity[0]) / (radius * radius) * 0.6;
        (states ??= state.states.slice())[i] = { ...s, vx, vy, omega };
      });
      return states ? { ...state, states } : state;
    },
  };
}

type SoftRun = Run<Frame> & { plan: SoftPlan };
const softRuns = new Map<string, SoftRun>();
function softRun(geo: Geometry, settings: SoftSettings, targets: Geometry[], size: number, solidsKey: string): SoftRun {
  const key = geometryKey([geo]) + '|' + solidsKey + '|' + JSON.stringify([settings, size]);
  let run = softRuns.get(key);
  if (run) { softRuns.delete(key); softRuns.set(key, run); return run; }
  run = makeSoftRun(geo, key, settings, targets, size);
  softRuns.set(key, run);
  if (softRuns.size > 64) softRuns.delete(softRuns.keys().next().value!);
  return run;
}
function makeSoftRun(geo: Geometry, key: string, settings: SoftSettings, targets: Geometry[], size: number): SoftRun {
  const plan = softPlanOf(geo, size);
  const stepper = softStepper(plan, settings, targets, size);
  return {
    key, pieces: piecesOf(geo), plan,
    initial: () => ({ ...plan.initial, pos: plan.initial.pos.slice(), vel: plan.initial.vel.slice(), pending: stepper.pendingOf(plan.initial.pos) }),
    from(before, frame) {
      const old = (before as SoftRun).plan;
      const pos = plan.rest.slice(), vel = plan.initial.vel.slice();
      const groups = new Map(old.groups.map((g, i) => [g.identity, i]));
      const carried = new Map<number, number>();
      // An element that was already there goes on as it was. Its material cage may have another resolution
      // now (it follows the length of all the input): each particle then takes the displacement and speed of
      // the old one nearest to it at rest.
      plan.groups.forEach((group, i) => {
        const j = groups.get(group.identity), was = j === undefined ? undefined : old.groups[j]!;
        if (!was) return;
        const same = was.ids.length === group.ids.length;
        group.ids.forEach((id, k) => {
          let o = was.ids[k]!;
          if (!same) {
            const x = plan.rest[id * 2]!, y = plan.rest[id * 2 + 1]!;
            let best = Infinity;
            for (const c of was.ids) {
              const d = (old.rest[c * 2]! - x) ** 2 + (old.rest[c * 2 + 1]! - y) ** 2;
              if (d < best) { best = d; o = c; }
            }
          }
          pos[id * 2] = plan.rest[id * 2]! + frame.pos[o * 2]! - old.rest[o * 2]!;
          pos[id * 2 + 1] = plan.rest[id * 2 + 1]! + frame.pos[o * 2 + 1]! - old.rest[o * 2 + 1]!;
          vel[id * 2] = frame.vel[o * 2]!; vel[id * 2 + 1] = frame.vel[o * 2 + 1]!;
        });
        carried.set(j!, i);
      });
      // A new piece of an element that was there (a burst body): it goes where that element is now, turned as
      // it is, with its motion (the best rigid fit of the old element's particles); then out from the centre.
      const nodeOf = (identity: string) => identity.slice(0, identity.lastIndexOf('#'));
      const fits = new Map<number, { rest: Vec2; now: Vec2; c: number; s: number; v: Vec2; spin: number }>();
      const fit = (j: number) => {
        let f = fits.get(j);
        if (f) return f;
        const ids = old.groups[j]!.ids, n = ids.length;
        let rx = 0, ry = 0, px = 0, py = 0, vx = 0, vy = 0;
        for (const id of ids) { rx += old.rest[id * 2]!; ry += old.rest[id * 2 + 1]!; px += frame.pos[id * 2]!; py += frame.pos[id * 2 + 1]!; vx += frame.vel[id * 2]!; vy += frame.vel[id * 2 + 1]!; }
        rx /= n; ry /= n; px /= n; py /= n; vx /= n; vy /= n;
        let dot = 0, cross = 0, spin = 0, inertia = 0;
        for (const id of ids) {
          const ax = old.rest[id * 2]! - rx, ay = old.rest[id * 2 + 1]! - ry, bx = frame.pos[id * 2]! - px, by = frame.pos[id * 2 + 1]! - py;
          dot += ax * bx + ay * by; cross += ax * by - ay * bx;
          spin += bx * (frame.vel[id * 2 + 1]! - vy) - by * (frame.vel[id * 2]! - vx); inertia += bx * bx + by * by;
        }
        const angle = Math.atan2(cross, dot);
        fits.set(j, f = { rest: [rx, ry], now: [px, py], c: Math.cos(angle), s: Math.sin(angle), v: [vx, vy], spin: inertia > 1e-12 ? spin / inertia : 0 });
        return f;
      };
      const kept0 = new Set(carried.values());
      const pieces = new Map<string, number[]>();
      plan.groups.forEach((group, i) => {
        if (kept0.has(i)) return;
        const node = nodeOf(group.identity);
        let best = -1, distance = Infinity;
        let gx = 0, gy = 0;
        for (const id of group.ids) { gx += plan.rest[id * 2]!; gy += plan.rest[id * 2 + 1]!; }
        gx /= group.ids.length; gy /= group.ids.length;
        old.groups.forEach((was, j) => {
          if (nodeOf(was.identity) !== node) return;
          const f = fit(j), d = Math.hypot(f.rest[0] - gx, f.rest[1] - gy);
          if (d < distance) { distance = d; best = j; }
        });
        if (best < 0) return;
        const f = fit(best);
        for (const id of group.ids) {
          const qx = plan.rest[id * 2]! - f.rest[0], qy = plan.rest[id * 2 + 1]! - f.rest[1];
          const ox = f.c * qx - f.s * qy, oy = f.s * qx + f.c * qy;
          pos[id * 2] = f.now[0] + ox; pos[id * 2 + 1] = f.now[1] + oy;
          vel[id * 2] = f.v[0] - f.spin * oy; vel[id * 2 + 1] = f.v[1] + f.spin * ox;
        }
        if (plan.base.shapes[group.paths[0]?.shape ?? -1]?.burstSpeed) pieces.set(node, [...(pieces.get(node) ?? []), i]);
      });
      for (const list of pieces.values()) {
        const centre = (i: number): Vec2 => { const ids = plan.groups[i]!.ids; let x = 0, y = 0; for (const id of ids) { x += pos[id * 2]!; y += pos[id * 2 + 1]!; } return [x / ids.length, y / ids.length]; };
        const centres = list.map(centre), cx = centres.reduce((a, c) => a + c[0], 0) / list.length, cy = centres.reduce((a, c) => a + c[1], 0) / list.length;
        list.forEach((i, k) => {
          const dx = centres[k]![0] - cx, dy = centres[k]![1] - cy, length = Math.hypot(dx, dy);
          const speed = plan.base.shapes[plan.groups[i]!.paths[0]!.shape]!.burstSpeed!;
          if (length > 1e-9) for (const id of plan.groups[i]!.ids) if (plan.free[id]) { vel[id * 2] = vel[id * 2]! + dx / length * speed; vel[id * 2 + 1] = vel[id * 2 + 1]! + dy / length * speed; }
        });
      }
      const pending = new Set<number>();
      const n = old.groups.length, m = plan.groups.length;
      for (const pair of frame.pending) {
        const a = carried.get(Math.floor(pair / n)), b = carried.get(pair % n);
        if (a !== undefined && b !== undefined) pending.add(Math.min(a, b) * m + Math.max(a, b));
      }
      const kept = new Set(carried.values());
      for (const pair of stepper.pendingOf(pos, new Set(plan.groups.map((_, i) => i).filter((i) => !kept.has(i))))) pending.add(pair);
      return { pos, vel, pending };
    },
    advance: (frame, dt) => stepper.advance(frame, dt),
    copy: (frame) => ({ pos: frame.pos.slice(), vel: frame.vel.slice(), pending: new Set(frame.pending) }),
    kick(frame, identity, dv) {
      const group = plan.groups.find((g) => g.identity === identity);
      if (!group) return frame;
      const vel = frame.vel.slice();
      for (const id of group.ids) if (plan.free[id]) { vel[id * 2] = vel[id * 2]! + dv[0]; vel[id * 2 + 1] = vel[id * 2 + 1]! + dv[1]; }
      return { ...frame, vel };
    },
    grab(frame, node, point, body) {
      // The element that was pressed (or else of that node, the nearest), held by its particle nearest the
      // point and, less and less, by the others around it: the body stretches where it is grabbed.
      let best: { group: SoftPlan['groups'][number]; particle: number; distance: number } | null = null;
      for (const group of plan.groups) {
        if (group.identity.slice(0, group.identity.lastIndexOf('#')) !== node || (body && group.identity !== body)) continue;
        for (const id of group.ids) {
          const distance = Math.hypot(frame.pos[id * 2]! - point[0], frame.pos[id * 2 + 1]! - point[1]);
          if (!best || distance < best.distance) best = { group, particle: id, distance };
        }
      }
      if (!best) return null;
      const { group, particle } = best as { group: SoftPlan['groups'][number]; particle: number };
      return { identity: group.identity, anchor: [0, 0], particle, weights: weightsAround(frame.pos, group.ids, particle) };
    },
    pull(frame, grip, target, dt) {
      const group = plan.groups.find((g) => g.identity === grip.identity);
      if (!group) return frame;
      // Another cage resolution than at the grab (the input changed): hold it again by its particle nearest the target.
      if (!grip.weights || grip.weights.length !== group.ids.length || !group.ids.includes(grip.particle!)) {
        let nearest = group.ids[0]!, distance = Infinity;
        for (const id of group.ids) { const d = Math.hypot(frame.pos[id * 2]! - target[0], frame.pos[id * 2 + 1]! - target[1]); if (d < distance) { distance = d; nearest = id; } }
        grip.particle = nearest;
        grip.weights = weightsAround(frame.pos, group.ids, nearest);
      }
      const p = grip.particle!, dx = target[0] - frame.pos[p * 2]!, dy = target[1] - frame.pos[p * 2 + 1]!;
      const vel = frame.vel.slice();
      group.ids.forEach((id, k) => {
        const w = grip.weights![k]!;
        if (!w || !plan.free[id]) return;
        vel[id * 2] = vel[id * 2]! + w * (SPRING * SPRING * dx - 2 * SPRING * vel[id * 2]!) * dt;
        vel[id * 2 + 1] = vel[id * 2 + 1]! + w * (SPRING * SPRING * dy - 2 * SPRING * vel[id * 2 + 1]!) * dt;
      });
      return { ...frame, vel };
    },
  };
}

interface Sample { pieces: string; geo: Geometry; time: number }
const pasts = new Map<string, Map<number, Sample | null>>();
/** Physics' own Time from its resolved parameters. */
const timeOf = (params: Record<string, unknown>) => Math.max(0, Math.min(MAX_TIME, Number(resolveParams(physics.params, params).time)));

/**
 * When the pieces changed between scene times `from` and `to` (seconds): on a coarse grid of steps, then
 * halving down to the step where they are new. Each change with the input then and Physics' Time then.
 */
function changesBetween(history: HistoryLookup, from: number, to: number): Sample[] {
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
    const sample = then ? { pieces: piecesOf(then.geo), geo: then.geo, time: timeOf(then.params) } : null;
    memo.set(step, sample);
    return sample;
  };
  const first = Math.max(0, Math.floor(from * HZ + 1e-9)), last = Math.floor(to * HZ + 1e-9);
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
  for (let step = first; step < last; step += COARSE) grid.push(step);
  grid.push(last);
  for (let i = 1; i < grid.length; i++) find(grid[i - 1]!, grid[i]!);
  return changes.map((step) => at(step)!);
}

const MAX_TIME = 3600;

/** How much each particle of a soft element follows a drag from `particle`: all of it there, less farther (half the element's size). */
function weightsAround(pos: Float64Array, ids: number[], particle: number): Float64Array {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const id of ids) { x0 = Math.min(x0, pos[id * 2]!); y0 = Math.min(y0, pos[id * 2 + 1]!); x1 = Math.max(x1, pos[id * 2]!); y1 = Math.max(y1, pos[id * 2 + 1]!); }
  const radius = Math.max(1, Math.max(x1 - x0, y1 - y0) * 0.5);
  return Float64Array.from(ids, (id) => Math.exp(-((pos[id * 2]! - pos[particle * 2]!) ** 2 + (pos[id * 2 + 1]! - pos[particle * 2 + 1]!) ** 2) / (radius * radius)));
}

/** The drags of this input's bodies (Drag & throw), their path turned from document coordinates into this stack's with `world`. */
function dragsIn(geo: Geometry, world: readonly number[] | undefined): DragIn[] {
  const [a, b, c, d, e, f] = world ?? [1, 0, 0, 1, 0, 0];
  const det = a! * d! - b! * c! || 1;
  const local = (x: number, y: number): Vec2 => [(d! * (x - e!) - c! * (y - f!)) / det, (-b! * (x - e!) + a! * (y - f!)) / det];
  const out = new Map<number, DragIn>();
  for (const shape of geo.shapes) for (const drag of shape.drags ?? []) {
    if (out.has(drag.id) || !drag.points.length) continue;
    out.set(drag.id, { id: drag.id, node: shape.node ?? '', ...(drag.body ? { body: drag.body } : {}), points: drag.points.map((p) => ({ at: p.at, point: local(p.x, p.y) })), ...(drag.end !== undefined ? { end: drag.end } : {}) });
  }
  return [...out.values()];
}

const hashOf = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };
/** Which double-clicks this input carries (a new one changes what the past looks like). */
const burstSignature = (geo: Geometry) => {
  const list = new Set<string>();
  geo.shapes.forEach((shape) => { for (const b of shape.bursts ?? []) list.add(`${shape.node ?? ''}@${b.at}@${b.body ?? ''}`); });
  return [...list].sort().join(',');
};

const ringArea = (ring: Vec2[]) => ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]!; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
/** Douglas-Peucker on a closed ring (split at its two farthest-apart points). */
function simplifyRing(ring: Vec2[], tolerance: number): Vec2[] {
  const points = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1] ? ring.slice(0, -1) : ring;
  if (points.length <= 4) return points;
  const keep = new Uint8Array(points.length);
  const along = (a: number, b: number) => {
    let worst = -1, at = -1;
    const [ax, ay] = points[a]!, [bx, by] = points[b % points.length]!, dx = bx - ax, dy = by - ay, length = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i % points.length]!, d = Math.abs((px - ax) * dy - (py - ay) * dx) / length;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance) { keep[at % points.length] = 1; along(a, at); along(at, b); }
  };
  let far = 0, best = -1;
  for (let i = 1; i < points.length; i++) { const d = Math.hypot(points[i]![0] - points[0]![0], points[i]![1] - points[0]![1]); if (d > best) { best = d; far = i; } }
  keep[0] = keep[far] = 1;
  along(0, far);
  along(far, points.length);
  return points.filter((_, i) => keep[i]);
}

const burstCuts = new Map<string, Shape[]>();
/**
 * The input at scene time `t` with each body double-clicked by then in `pieces` pieces: Crack (shatter from
 * the body's centre) cuts it, and each piece is a body of its own that leaves the centre at `speed`.
 */
function burstGeo(geo: Geometry, t: number, pieces: number, speed: number): Geometry {
  const identityOf = (shape: Shape, i: number) => `${shape.node ?? ''}#${shape.bodyGroup ?? shape.clone ?? i}`;
  // Only the body that was double-clicked (one letter of a word), or all of the node's if it isn't said which.
  const broken = (shape: Shape, i: number) => !!shape.bursts?.some((b) => b.at <= t + 1e-9 && (!b.body || b.body === identityOf(shape, i)));
  if (!geo.shapes.some(broken)) return geo;
  const bodies = new Map<string, number[]>();
  geo.shapes.forEach((shape, i) => {
    if (!broken(shape, i)) return;
    const identity = identityOf(shape, i);
    bodies.set(identity, [...(bodies.get(identity) ?? []), i]);
  });
  const replaced = new Map<number, Shape[]>();
  for (const [identity, list] of bodies) {
    const part: Geometry = { ...geo, shapes: list.map((i) => geo.shapes[i]!) };
    const key = `${geometryKey([part])}|${identity}|${pieces}|${speed}`;
    let out = burstCuts.get(key);
    if (!out) {
      const box = bounds(part), size = Math.max(box.width, box.height) || 1;
      // Straight cracks without branches: about `pieces` pieces, not a spray of splinters.
      const params = resolveParams(crack.params, { mode: 'shatter', pattern: 'impact', cracks: pieces, length: 1.5, branching: 0, jagged: 0.15, spread: 1, width: Math.max(0.5, size * 0.004), separation: 0, variation: 0, impact: [0.5, 0.5], seed: hashOf(identity) % 100000 });
      const cut = crack.apply(part, params, { id: 'burst', bounds: box, resolution: size * 0.01, children: [] });
      // The cut comes as polylines with many points: each is a particle or a contact test, so the outlines
      // are simplified (1% of the body's size), and splinters too small to matter are left out.
      const whole = Math.abs(part.shapes.reduce((sum, shape) => sum + shape.subpaths.reduce((a, path) => a + ringArea(flatten(path, 4)), 0), 0)) || 1;
      out = cut.shapes.flatMap(({ bursts: _done, ...shape }) => {
        const subpaths = shape.subpaths.flatMap((path) => {
          const ring = simplifyRing(flatten(path, 4), size * 0.01);
          return ring.length >= 3 && Math.abs(ringArea(ring)) > whole * 0.015 ? [{ closed: true, start: ring[0]!, segs: ring.slice(1).concat([ring[0]!]).map((q, i, list) => line(i ? list[i - 1]! : ring[0]!, q)) }] : [];
        });
        // Each piece, a body of its own (its key apart from every other element's).
        return subpaths.length ? [{ ...shape, subpaths, bodyGroup: 1e13 + hashOf(`${identity}:${shape.clone ?? 0}`), burstSpeed: speed }] : [];
      });
      burstCuts.set(key, out);
      if (burstCuts.size > 128) burstCuts.delete(burstCuts.keys().next().value!);
    }
    replaced.set(list[0]!, out);
    for (const i of list.slice(1)) replaced.set(i, []);
  }
  return { ...geo, shapes: geo.shapes.flatMap((shape, i) => replaced.get(i) ?? [shape]) };
}

/**
 * The clicks on the bodies of this input (Poke), as pushes of `speed` px/s: each one's direction comes in
 * document coordinates and is turned into this stack's axes with `world` (the group's place in the scene).
 */
function kicksOf(geo: Geometry, speed: number, world: readonly number[] | undefined): Kick[] {
  const kicks: Kick[] = [], seen = new Set<string>();
  const [a, b, c, d] = world ?? [1, 0, 0, 1];
  const det = a! * d! - b! * c! || 1;
  geo.shapes.forEach((shape, i) => {
    if (!shape.pokes?.length) return;
    const identity = `${shape.node ?? ''}#${shape.bodyGroup ?? shape.clone ?? i}`;
    for (const poke of shape.pokes) {
      if (poke.body && poke.body !== identity) continue;
      const id = `${poke.at}|${identity}`;
      if (seen.has(id)) continue;
      seen.add(id);
      // The inverse of the linear part takes a document direction into the stack's axes.
      const x = (d! * poke.dir[0] - c! * poke.dir[1]) / det, y = (-b! * poke.dir[0] + a! * poke.dir[1]) / det;
      const length = Math.hypot(x, y) || 1;
      kicks.push({ at: poke.at, identity, dv: [x / length * speed, y / length * speed] });
    }
  });
  return kicks;
}

/**
 * The scene's `physicsBounds`: four static walls just outside the document's edges, as thick as the document
 * is large (nothing fast goes through), in this stack's coordinates.
 */
function documentWalls(space: SceneSpace | undefined): Geometry[] {
  if (!space?.edges) return [];
  const { x, y, width: w, height: h } = space.frame;
  const t = Math.max(w, h);
  const rect = (x0: number, y0: number, x1: number, y1: number): Geometry => {
    const corners = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Vec2[]).map((q) => applyMat(space.edges!, q));
    const segs = corners.map((q, i) => line(corners[i]!, corners[(i + 1) % 4]!));
    return { viewBox: [x0, y0, x1 - x0, y1 - y0], shapes: [{ subpaths: [{ start: corners[0]!, segs, closed: true }], style: {} }] };
  };
  return [
    rect(x - t, y - t, x + w + t, y),
    rect(x - t, y + h, x + w + t, y + h + t),
    rect(x - t, y, x, y + h),
    rect(x + w, y, x + w + t, y + h),
  ];
}

/** General purpose 2D rigid-body simulation for all elements in a group. */
export const physics = defineModifier({
  type: 'physics',
  label: 'Physics',
  kind: 'effector',
  history: true,
  params: {
    time: { type: 'number', default: 0, defaultExpr: 'scene.time', min: 0, max: MAX_TIME, step: 0.01, label: 'Time (s)', sliderCurve: 'quadratic' },
    acceleration: { type: 'point', default: [0, 0], unit: 'px', label: 'Acceleration', group: 'Forces' },
    damping: { type: 'number', default: 0, min: 0, max: 20, step: 0.1, unit: '1/s', label: 'Air drag', group: 'Forces' },
    collisions: { type: 'boolean', default: true, label: 'Body collisions', group: 'Contacts' },
    solids: { type: 'nodes', default: [], label: 'Solids', animatable: false, random: false, group: 'Contacts' },
    friction: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Friction', group: 'Contacts' },
    bounce: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Bounce', group: 'Contacts' },
    poke: { type: 'number', default: 0, min: 0, max: 5000, step: 10, unit: 'px/s', label: 'Click push', group: 'Pointer', sliderCurve: 'quadratic' },
    burst: { type: 'number', default: 0, min: 0, max: 16, step: 1, label: 'Double-click burst', group: 'Pointer', ramp: false, animatable: false },
    drag: { type: 'boolean', default: false, label: 'Drag & throw', group: 'Pointer', animatable: false },
    push: { type: 'number', default: 0, min: 0, max: 600, step: 1, unit: 'px', label: 'Hover push', group: 'Pointer', sliderCurve: 'quadratic' },
    burstSpeed: { type: 'number', default: 250, min: 0, max: 3000, step: 10, unit: 'px/s', label: 'Burst speed', group: 'Pointer', sliderCurve: 'quadratic' },
  },
  apply(input, p, ctx) {
    const time = Math.max(0, Math.min(MAX_TIME, p.time));
    if (!time || !input.shapes.length) return input;
    // Double-clicked bodies (Burst) are in pieces from that moment on, now and when the past is read.
    const pieceCount = Math.round(p.burst);
    const burstAt = (geo: Geometry, t: number) => pieceCount >= 2 ? burstGeo(geo, t, pieceCount, Math.max(0, p.burstSpeed)) : geo;
    const geo = burstAt(input, ctx.history?.now ?? 0);
    const signature = pieceCount >= 2 ? burstSignature(input) : '';
    const history: HistoryLookup | undefined = ctx.history && signature
      ? { ...ctx.history, key: `${ctx.history.key}|burst:${pieceCount}:${p.burstSpeed}:${signature}`, at: (t) => { const then = ctx.history!.at(t); return then ? { ...then, geo: burstAt(then.geo, t) } : null; } }
      : ctx.history;
    const solids = [...new Set(p.solids)].flatMap((id) => { const target = ctx.target?.(id); return target ? [target] : []; }).concat(documentWalls(ctx.scene));
    const detail = Math.max(Math.max(ctx.bounds.width, ctx.bounds.height) * 0.006, 0.25);
    const friction = Math.max(0, Math.min(1, p.friction)), bounce = Math.max(0, Math.min(1, p.bounce));
    const size = Math.max(ctx.bounds.width, ctx.bounds.height) || 1;
    // Without the scene's past (an effect evaluated alone), the world is this input's, from rest.
    const scope = (ctx.history?.scope ?? `geo:${geometryKey([geo])}`) + '|' + (ctx.id ?? '');
    const solidsKey = geometryKey(solids);
    const kicks = p.poke > 0 ? kicksOf(geo, p.poke, ctx.scene?.world) : [];
    const drags = p.drag ? dragsIn(geo, ctx.scene?.world) : [];
    // The bodies the pointer can act on, each with its identity (as gestures name it: an enclosing group or
    // layer renumbers element keys, so the player can't rebuild it from what is drawn).
    const pokeable = (out: Geometry): Geometry => p.poke > 0 || pieceCount >= 2 || p.drag ? { ...out, shapes: out.shapes.map((shape, i) => ({ ...shape, body: `${shape.node ?? ''}#${shape.bodyGroup ?? shape.clone ?? i}`, ...(p.poke > 0 ? { pokeable: true } : {}), ...(pieceCount >= 2 && !shape.burstSpeed ? { burstable: true } : {}), ...(p.drag ? { draggable: true } : {}) })) } : out;
    if (hasSoftMaterial(geo)) {
      // As with rigid bodies below, the world's key leaves out what follows the input's size.
      const settings: SoftSettings = { acceleration: p.acceleration, floor: null, rotation: 0, friction, bounce, collisions: p.collisions, ...(p.damping > 0 ? { damping: p.damping } : {}) };
      const { run, state } = simulate(geo, time, history, scope + '|soft', JSON.stringify([settings, solidsKey]), (input) => softRun(input, settings, solids, size, solidsKey), kicks, drags);
      const plan = (run as SoftRun).plan;
      return pokeable(plan.paths.length ? softGeometry(plan, state) : geo);
    }

    const settings: StepSettings = { acceleration: p.acceleration, planes: [], friction, bounce, collide: p.collisions, contactDamping: 0, ...(p.damping > 0 ? { damping: p.damping } : {}) };
    // Hover push: the pointer's path sweeps the bodies it passes near (Play).
    const sweep = p.push > 0 && ctx.scene?.sweeps?.length ? { samples: ctx.scene.sweeps, radius: p.push } : undefined;
    // The world's key leaves out Detail: it follows the input's size, which an animated input (Bones, a Wave…)
    // changes every frame, and a new key would restart the world from the first frame's shapes each time.
    // Shapes and detail are the run's (a change swaps the bodies and goes on).
    const { run, state } = simulate(geo, time, history, scope, JSON.stringify([settings, solidsKey]), (input) => rigidRun(layoutOf(input, solids, detail), settings), kicks, drags, sweep);
    const now = (run as RigidRun).layout, states = state.states;

    const transforms = new Map<Shape, (point: readonly [number, number]) => [number, number]>();
    now.parts.forEach((part, partIndex) => {
      const shapes = part.shapeIndices.map((i) => geo.shapes[i]!);
      const index = now.indices.get(partIndex);
      const pose = index === undefined ? undefined : states[index];
      if (!part.body || !pose) return shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [x, y]));
      const c = Math.cos(pose.angle), s = Math.sin(pose.angle);
      const center: Vec2 = part.body.center;
      shapes.forEach((shape) => transforms.set(shape, ([x, y]) => [
        pose.x + (x - center[0]) * c - (y - center[1]) * s,
        pose.y + (x - center[0]) * s + (y - center[1]) * c,
      ]));
    });
    // Network links follow the bodies at their ends (with slack, or snapping when stretched too far), as in Gravity.
    const ends = new Map<string, Map<number, (point: readonly [number, number]) => [number, number]>>();
    for (const shape of geo.shapes) {
      const move = transforms.get(shape);
      if (!move) continue;
      for (const ref of shape.networkNodes ?? []) {
        const nodes = ends.get(ref.networkId) ?? new Map();
        nodes.set(ref.node, move);
        ends.set(ref.networkId, nodes);
      }
    }
    return pokeable({
      ...geo,
      shapes: geo.shapes.flatMap((shape) => {
        if (shape.networkLink) {
          const link = shape.networkLink, nodes = ends.get(link.networkId), path = shape.subpaths[0];
          const from = nodes?.get(link.from), to = nodes?.get(link.to);
          if (!path || !from || !to) return [shape];
          const updated = networkLinkShape(shape, from(path.start), to(path.segs.at(-1)?.p ?? path.start));
          return updated ? [updated] : [];
        }
        const moved = mapPoints({ ...geo, shapes: [shape] }, transforms.get(shape) ?? (([x, y]) => [x, y])).shapes[0]!;
        const { impulse: _consumed, force: _applied, pokes: _pushed, bursts: _burst, drags: _dragged, ...result } = moved;
        return [result];
      }),
    });
  },
});
