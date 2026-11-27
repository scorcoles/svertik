// svertikJS core: objects and effects that chain (each method changes the object and returns it), tweens
// on them, and the build into a SceneV1. Nothing here runs per frame: the code runs once and leaves JSON.
import type { BlendMode, ClockModulation, CustomVariable, Ease, Keyframe, ModifierInstance, SceneNode, SceneV1, Track } from '@svertik/engine';
import { builtins, resolveParams, shapeRegistry, systemName } from '@svertik/engine';
import { mirrorEase, toEase, type EaseInput } from './ease';
import { Expr, Var, fallbackOf } from './values';

// ── Tweens ───────────────────────────────────────────────────────────────────────────────────────────

/** Timing of a tween; every other key is a property to animate. */
export interface TweenTiming {
  /** Seconds (0.5 by default). */
  duration?: number;
  /** Seconds before it starts. */
  delay?: number;
  ease?: EaseInput;
  /** Extra plays after the first; -1: forever. */
  repeat?: number;
  /** Every other play goes backwards. */
  yoyo?: boolean;
  /** Seconds between plays. */
  repeatDelay?: number;
}
export type TweenVars = TweenTiming & Record<string, unknown>;
const TIMING = new Set(['duration', 'delay', 'ease', 'repeat', 'yoyo', 'repeatDelay']);

interface Tween { from?: Record<string, unknown>; to: Record<string, unknown>; timing: TweenTiming }

/** Keys written out (`.keys()`): any number of them, each with its time (s), value and ease. */
export interface KeysOptions {
  /** How many times the keys play (0: forever). */
  repeat?: number;
  /** Seconds from one play's start to the next. */
  every?: number;
  /** What the property belongs to, when it isn't clear: a composition's clock (`'composition'`). */
  on?: Track['on'];
  /** On a `raw` node: the id of the effect the property belongs to. */
  modifier?: string;
}
interface RawKeys { param: string; keys: Keyframe[]; options: KeysOptions }

function splitVars(vars: TweenVars): [Record<string, unknown>, TweenTiming] {
  const props: Record<string, unknown> = {};
  const timing: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) (TIMING.has(k) ? timing : props)[k] = v;
  return [props, timing as TweenTiming];
}

/** What can be tweened and chained: objects and effects. */
abstract class Animatable {
  /** @internal */ tweens: Tween[] = [];
  /** @internal */ rawKeys: RawKeys[] = [];
  /** Animates from the current values to these. */
  to(vars: TweenVars): this {
    const [to, timing] = splitVars(vars);
    this.tweens.push({ to, timing });
    return this;
  }
  /** Animates from these values to the current ones. */
  from(vars: TweenVars): this {
    const [from, timing] = splitVars(vars);
    this.tweens.push({ from, to: {}, timing });
    return this;
  }
  /** Animates from the first values to the second (timing goes with the second). */
  fromTo(fromVars: Record<string, unknown>, toVars: TweenVars): this {
    const [to, timing] = splitVars(toVars);
    this.tweens.push({ from: { ...fromVars }, to, timing });
    return this;
  }
  /** Keys written out for one property: `[{ t: 0, value: 0, ease: 'ease-out' }, { t: 1, value: 90 }]`. */
  keys(param: string, keys: Keyframe[], options: KeysOptions = {}): this {
    this.rawKeys.push({ param, keys: keys.map((k) => ({ ...k })), options });
    return this;
  }
}

// ── Effects ──────────────────────────────────────────────────────────────────────────────────────────

const effectDefs = new Map((builtins as { type: string; kind: string; params?: Record<string, unknown> }[]).map((d) => [d.type, d]));
/** Types whose `children` are nested effects (Step, Stagger, Each…). */
const EFFECTORS = new Set([...effectDefs.values()].filter((d) => d.kind === 'effector').map((d) => d.type));

/** An effect in an object's stack. Effectors keep nested effects in `children`. */
export class Effect<P extends object = Record<string, unknown>> extends Animatable {
  /** @internal */ owner: Node | null = null;
  /** @internal */ id?: string;
  readonly children: Effect[] = [];
  /** Name shown in the editor's stack (and in `scene.object.<object>.<name>` formulas). */
  name?: string;
  enabled?: boolean;
  /** Numeric values forwarded to nested effects (`props.name`). */
  props?: Record<string, unknown>;
  constructor(readonly type: string, public params: Partial<P> & Record<string, unknown> = {}, name?: string) {
    super();
    if (!effectDefs.has(type)) throw new Error(`svertikJS: unknown effect "${type}"`);
    if (name) this.name = name;
  }
  /** Changes parameters. */
  set(params: Partial<P> & Record<string, unknown>): this {
    Object.assign(this.params, params);
    return this;
  }
  /** A fixed id (by default `<object>_<type>`), for something outside the chain that points at it. */
  withId(id: string): this {
    this.id = id;
    return this;
  }
  /** Numeric values forwarded to nested effects (`props.name`). */
  withProps(props: Record<string, unknown>): this {
    this.props = { ...props };
    return this;
  }
  /** Turns it off (kept in the stack, not applied). */
  off(): this {
    this.enabled = false;
    return this;
  }
}

export type EffectRest<P extends object> = (Effect | ((effect: Effect<P>) => void))[];

/** Parses an effect call: `(name?, params?, ...children or callback)`. */
function makeEffect(type: string, args: unknown[]): [Effect, ((e: Effect) => void)[]] {
  let i = 0;
  const name = typeof args[0] === 'string' ? (args[i++] as string) : undefined;
  let params: Record<string, unknown> = {};
  if (args[i] && typeof args[i] === 'object' && !(args[i] instanceof Effect)) params = { ...(args[i++] as Record<string, unknown>) };
  const effect = new Effect(type, {}, name);
  const callbacks: ((e: Effect) => void)[] = [];
  // Each with values that aren't its own: they are a Shape (`shapevalues`) for every copy.
  if (type === 'each') {
    const own = Object.keys(effectDefs.get('each')?.params ?? {});
    const values = Object.fromEntries(Object.entries(params).filter(([k]) => !own.includes(k)));
    params = Object.fromEntries(Object.entries(params).filter(([k]) => own.includes(k)));
    if (Object.keys(values).length) effect.children.push(new Effect('shapevalues', values));
  }
  effect.params = params;
  for (; i < args.length; i++) {
    const a = args[i];
    if (a instanceof Effect) {
      if (!EFFECTORS.has(type)) throw new Error(`svertikJS: "${type}" takes no nested effects`);
      if (EFFECTORS.has(a.type)) throw new Error(`svertikJS: an effector ("${a.type}") can't go inside another ("${type}")`);
      effect.children.push(a);
    } else if (typeof a === 'function') callbacks.push(a as (e: Effect) => void);
    else if (a !== undefined) throw new Error(`svertikJS: unexpected argument for "${type}"`);
  }
  return [effect, callbacks];
}

/** A free-standing effect, to keep in a variable or nest in an effector: `spherize({ strength: 0.5 })`. */
export function effect<P extends object = Record<string, unknown>>(type: string, ...args: [string?, (Partial<P> & Record<string, unknown>)?, ...EffectRest<P>]): Effect<P> {
  const [e, callbacks] = makeEffect(type, args);
  callbacks.forEach((fn) => fn(e));
  return e as Effect<P>;
}

// ── Objects ──────────────────────────────────────────────────────────────────────────────────────────

const PLACEMENT = new Set(['x', 'y', 'scale', 'rotation', 'flipX', 'flipY', 'stretch', 'pivot']);
const NODE_FIELDS = new Set(['opacity', 'visible', 'blend', 'locked', 'props']);

export interface SetVars {
  x?: number | Expr | Var; y?: number | Expr | Var; scale?: number | Expr | Var; rotation?: number | Expr | Var;
  flipX?: boolean; flipY?: boolean; stretch?: [number, number]; pivot?: [number, number];
  opacity?: number | Expr | Var; visible?: boolean; blend?: BlendMode; locked?: boolean;
  /** Numeric values forwarded to descendants (`props.name`). */
  props?: Record<string, unknown>;
  /** Its name (the editor's layers, `scene.object.<name>` formulas); the id comes from it. */
  name?: string;
  /** A fixed id, when something points at it by id; by default it comes from the name. */
  id?: string;
  [param: string]: unknown;
}

/** An object of the scene. Its effect methods (`.twist()`, `.clone()`…) add to its stack, in order. */
export abstract class Node extends Animatable {
  readonly stack: Effect[] = [];
  /** @internal */ placement: Record<string, unknown> = {};
  /** @internal */ fields: Record<string, unknown> = {};
  /** @internal */ id?: string;
  /** @internal */ name?: string;
  constructor(name?: string) {
    super();
    if (name) this.name = name;
  }
  /** Placement (x, y, scale, rotation…), opacity, visibility, blend, name, id, and the shape's own values. */
  set(vars: SetVars): this {
    for (const [k, v] of Object.entries(vars)) {
      if (k === 'name') this.name = String(v);
      else if (k === 'id') this.id = String(v);
      else if (PLACEMENT.has(k)) this.placement[k] = v;
      else if (NODE_FIELDS.has(k)) this.fields[k] = v;
      else this.setParam(k, v);
    }
    return this;
  }
  /** @internal */ setParam(key: string, _value: unknown): void {
    throw new Error(`svertikJS: "${key}" is not a value of this object`);
  }
  /** Adds effects created apart (`const s = spherize({…})`). */
  add(...effects: Effect[]): this {
    for (const e of effects) {
      e.owner = this;
      this.stack.push(e);
    }
    return this;
  }
  /** Adds an effect by its type name, for any effect. */
  effect(type: string, ...args: unknown[]): this {
    const [e, callbacks] = makeEffect(type, args);
    this.add(e);
    callbacks.forEach((fn) => fn(e));
    return this;
  }
}

/** Splits `fill: '#fff'` / `stroke: '#000'` into the switch and its colour. */
function styleShortcut(params: Record<string, unknown>, key: string, value: unknown): boolean {
  if ((key !== 'fill' && key !== 'stroke') || typeof value !== 'string') return false;
  if (value === 'none' || value === '') params[key] = false;
  else { params[key] = true; params[`${key}Color`] = value; }
  return true;
}

/** A primitive: `ellipse`, `star`, `text`… */
export class Shape extends Node {
  readonly params: Record<string, unknown> = {};
  constructor(readonly shape: string, name?: string, params: Record<string, unknown> = {}) {
    super(name);
    if (!shapeRegistry.has(shape)) throw new Error(`svertikJS: unknown shape "${shape}"`);
    for (const [k, v] of Object.entries(params)) this.setParam(k, v);
  }
  override setParam(key: string, value: unknown) {
    if (!styleShortcut(this.params, key, value)) this.params[key] = value;
  }
}

/** A group: its children move with it, and its effects apply to all of them together. */
export class Group extends Node {
  readonly children: Node[];
  /** @internal */ layer = false;
  /** @internal */ composition: { scene: SceneBuild; params?: Record<string, unknown>; modulation?: ClockModulation } | null = null;
  constructor(name: string | undefined, children: Node[]) { super(name); this.children = children; }
}

/** An imported SVG (its markup). */
export class SvgObject extends Node {
  constructor(name: string | undefined, readonly source: string) { super(name); }
}

/** Draws another object's result, with its own placement and effects. */
export class Instance extends Node {
  constructor(name: string | undefined, readonly of: Node | string, readonly mouse?: Record<string, unknown>) { super(name); }
}

/** A node written as scene JSON, kept as it is (packs, Effector nodes, SVGs kept outside…). */
export class RawNode extends Node {
  constructor(readonly json: SceneNode) { super(json.name); this.id = json.id; }
}

// ── Scene ────────────────────────────────────────────────────────────────────────────────────────────

export interface SceneOptions {
  /** Document size (px). Without it, the document fits whatever is drawn. */
  width?: number;
  height?: number;
  /** `#rrggbb` or `#rrggbbaa`. */
  background?: string;
  /** Animation length (s). Without it, the end of the last tween that doesn't repeat forever. */
  duration?: number;
  fps?: number;
  /** The timeline starts over at the end. By default, when some tween repeats forever. */
  loop?: boolean;
  /** The clock keeps running past `duration` (procedural and interactive scenes). */
  infinite?: boolean;
  /** Without it, the animation only moves with "play" interactions. */
  autoplay?: boolean;
  /** Named times of the timeline. */
  markers?: { id: string; name: string; t: number }[];
  seed?: number;
  seedEvery?: number;
  seedOnLoad?: boolean;
  notes?: string;
  /** How Play fits the document to the screen. */
  fit?: SceneV1['fullViewport'];
  /** The document's edges are walls for Physics. */
  walls?: boolean;
  /** Play hides what lies outside the document. */
  clip?: boolean;
  /** Variables to declare (the ones used in values come in by themselves). */
  custom?: Var[];
  /** Hover, click, scroll and pointer reactions, as scene JSON. */
  interactions?: SceneV1['interactions'];
  /** Any other scene field, as JSON (merged last). */
  extra?: Partial<SceneV1>;
}

export interface BuildResult { scene: SceneV1; warnings: string[] }

/** A scene ready to build. `JSON.stringify` gives its SceneV1. */
export class SceneBuild {
  constructor(readonly options: SceneOptions, readonly objects: Node[]) {}
  build(): BuildResult { return buildScene(this); }
  toJSON(): SceneV1 { return this.build().scene; }
}

const SCALE_LIKE = new Set(['scale']);

/** Every id in a piece of JSON (a raw node and what it holds). */
function idsIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => idsIn(v, out));
  else if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') out.push(id);
    for (const [k, v] of Object.entries(value)) if (k !== 'composition') idsIn(v, out);
  }
  return out;
}

function buildScene(build: SceneBuild): BuildResult {
  const warnings: string[] = [];
  const warn = (m: string) => { if (!warnings.includes(m)) warnings.push(m); };
  const o = build.options;

  // Every object, in order; ids: the fixed ones first, then readable ones from the name (or the shape).
  const all: Node[] = [];
  const walk = (list: Node[]) => list.forEach((n) => { if (!all.includes(n)) { all.push(n); if (n instanceof Group) walk(n.children); } });
  walk(build.objects);
  const ids = new Map<Node | Effect, string>();
  const used = new Set<string>();
  const claim = (base: string) => {
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}_${k}`;
    used.add(id);
    return id;
  };
  const reserve = (id: string, what: Node | Effect | null) => {
    if (used.has(id)) throw new Error(`svertikJS: the id "${id}" is used twice`);
    used.add(id);
    if (what) ids.set(what, id);
  };
  for (const n of all) {
    if (n instanceof RawNode) { reserve(n.json.id, n); idsIn(n.json.stack).forEach((id) => reserve(id, null)); idsIn(n.json.children).forEach((id) => reserve(id, null)); }
    else if (n.id) reserve(n.id, n);
  }
  const kindName = (n: Node) => n instanceof Shape ? n.shape : n instanceof Group ? (n.layer ? 'layer' : n.composition ? 'composition' : 'group') : n instanceof Instance ? 'instance' : 'svg';
  for (const n of all) if (!ids.has(n)) ids.set(n, claim(systemName(n.name ?? kindName(n), kindName(n))));
  const effectsOf = (list: Effect[], out: Effect[] = []) => { list.forEach((e) => { out.push(e); effectsOf(e.children, out); }); return out; };
  const allEffects = all.flatMap((n) => effectsOf(n.stack).map((e) => [n, e] as const));
  for (const [, e] of allEffects) if (e.id) reserve(e.id, e);
  for (const [n, e] of allEffects) if (!ids.has(e)) ids.set(e, claim(`${ids.get(n)}_${e.type}`));

  // Variables: the listed ones and every one found in a value.
  const vars = new Map<string, Var>();
  const addVar = (v: Var) => {
    const had = vars.get(v.name);
    if (had && had !== v) throw new Error(`svertikJS: two variables are called "${v.name}"`);
    if (!had) { vars.set(v.name, v); if (v.value instanceof Expr) v.value.refs.forEach(addVar); }
  };
  const collect = (value: unknown): void => {
    if (value instanceof Var) addVar(value);
    else if (value instanceof Expr) value.refs.forEach(addVar);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object' && !(value instanceof Node)) Object.values(value).forEach(collect);
  };
  (o.custom ?? []).forEach(addVar);
  const scanNode = (n: Node) => {
    collect(n.placement); collect(n.fields);
    if (n instanceof Shape) collect(n.params);
    effectsOf(n.stack).forEach((e) => { collect(e.params); collect(e.props); e.tweens.forEach((t) => { collect(t.from); collect(t.to); }); });
    n.tweens.forEach((t) => { collect(t.from); collect(t.to); });
  };
  all.forEach(scanNode);
  const numbers: Record<string, number> = {};
  const varNumber = (v: Var): number => typeof v.value === 'number' ? v.value : fallbackOf(v.value.source, numbers, o.seed);
  // Plain values first, then formulas until nothing changes (they may read each other in any order).
  for (const v of vars.values()) if (typeof v.value === 'number') numbers[v.name] = v.value;
  for (let pass = 0; pass <= vars.size; pass++) {
    let changed = false;
    for (const v of vars.values()) {
      const n = varNumber(v);
      if (numbers[v.name] !== n) { numbers[v.name] = n; changed = true; }
    }
    if (!changed) break;
  }

  // Values: objects → their id; formulas and variables → { $expr, fallback }.
  const value = (v: unknown): unknown => {
    if (v instanceof Node) {
      const id = ids.get(v);
      if (!id) throw new Error('svertikJS: an object used as a reference is not in the scene');
      return id;
    }
    if (v instanceof Var) return { $expr: v.term, fallback: numbers[v.name] ?? 0 };
    if (v instanceof Expr) return { $expr: v.source, fallback: v.fallback ?? fallbackOf(v.source, numbers, o.seed) };
    if (Array.isArray(v)) return v.map(value);
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)]));
    return v;
  };

  const modifier = (e: Effect): ModifierInstance => ({
    id: ids.get(e)!,
    type: e.type,
    ...(e.name ? { name: e.name } : {}),
    ...(e.enabled === false ? { enabled: false } : {}),
    params: value(e.params) as Record<string, unknown>,
    ...(e.props ? { props: value(e.props) as Record<string, unknown> } : {}),
    ...(e.children.length ? { children: e.children.map(modifier) } : {}),
  });
  const nodeOf = (n: Node): SceneNode => {
    if (n instanceof RawNode) return structuredClone(n.json);
    const id = ids.get(n)!;
    const base = {
      id,
      name: n.name ?? id,
      stack: n.stack.map(modifier),
      ...(Object.keys(n.placement).length ? { transform: value(n.placement) as Record<string, number> } : {}),
      ...Object.fromEntries(Object.entries(n.fields).map(([k, v]) => [k, value(v)])),
    };
    if (n instanceof Shape) return { ...base, kind: 'shape', shape: n.shape, params: value(n.params) as Record<string, unknown> };
    if (n instanceof SvgObject) return { ...base, kind: 'object', source: n.source };
    if (n instanceof Instance) return { ...base, kind: 'instance', of: value(n.of) as string, ...(n.mouse ? { mouse: value(n.mouse) as Record<string, unknown> } : {}) };
    const g = n as Group;
    if (g.composition) {
      const inner = g.composition.scene.build();
      inner.warnings.forEach((w) => warn(`${id}: ${w}`));
      return {
        ...base, kind: 'group', children: [],
        composition: {
          scene: inner.scene,
          params: value(g.composition.params ?? { time: new Expr('scene.time', 0) }) as Record<string, unknown>,
          ...(g.composition.modulation ? { modulation: value(g.composition.modulation) as ClockModulation } : {}),
        },
      };
    }
    return { ...base, kind: 'group', ...(g.layer ? { layer: true } : {}), children: g.children.map(nodeOf) };
  };

  // Tracks.
  const tracks: Track[] = [];
  const ends: number[] = [];
  let forever = false;
  const current = (n: Node, e: Effect | null, on: Track['on'], param: string): unknown => {
    if (e) return e.params[param] ?? defaultOf(effectDefs.get(e.type)?.params, param);
    if (on === 'node') return param === 'opacity' ? (n.fields.opacity ?? 1) : (n.placement[param] ?? (SCALE_LIKE.has(param) ? 1 : 0));
    return n instanceof Shape ? (n.params[param] ?? defaultOf(shapeRegistry.get(n.shape)?.params, param)) : undefined;
  };
  const target = (n: Node, e: Effect | null, prop: string, on?: Track['on']): { on: Track['on']; param: string } => {
    if (on) return { on, param: prop };
    if (e) return { on: 'modifier', param: prop };
    if (prop === 'opacity' || PLACEMENT.has(prop)) return { on: 'node', param: prop };
    if (!(n instanceof Shape)) throw new Error(`svertikJS: "${prop}" can't be animated on ${ids.get(n)} (only x, y, scale, rotation and opacity on groups)`);
    return { on: 'shape', param: prop === 'fill' ? 'fillColor' : prop === 'stroke' ? 'strokeColor' : prop };
  };
  const trackFor = (n: Node, e: Effect | null, on: Track['on'], param: string, fresh: boolean): Track => {
    const nodeId = ids.get(n)!;
    const modId = e ? ids.get(e) : undefined;
    let track = fresh ? undefined : tracks.find((x) => x.node === nodeId && x.on === on && x.param === param && x.modifier === modId);
    if (!track) {
      track = { id: claim(`${modId ?? nodeId}_${param}`), node: nodeId, on, ...(modId ? { modifier: modId } : {}), param, keys: [] };
      tracks.push(track);
    }
    return track;
  };
  const tweensOf = (n: Node, e: Effect | null) => {
    const owner = e ?? n;
    for (const tw of owner.tweens) {
      const t = tw.timing;
      const duration = t.duration ?? 0.5;
      const delay = t.delay ?? 0;
      const ease = toEase(t.ease, warn);
      const props = new Set([...Object.keys(tw.from ?? {}), ...Object.keys(tw.to)]);
      for (const prop of props) {
        const { on, param } = target(n, e, prop);
        const now = current(n, e, on, param);
        const a = value(tw.from && prop in tw.from ? tw.from[prop] : now);
        const b = value(prop in tw.to ? tw.to[prop] : now);
        if ((a && typeof a === 'object') || (b && typeof b === 'object')) throw new Error(`svertikJS: ${ids.get(owner)}.${prop} is a formula and can't be tweened`);
        const keys: Keyframe[] = [{ t: delay, value: a, ease }, { t: delay + duration, value: b }];
        if (t.yoyo) { keys[1]!.ease = mirrorEase(ease); keys.push({ t: delay + 2 * duration, value: a }); }
        const lap = keys[keys.length - 1]!.t - delay;
        const track = trackFor(n, e, on, param, false);
        // A tween that starts where the previous one ended continues it.
        const last = track.keys[track.keys.length - 1];
        if (last && Math.abs(last.t - delay) < 1e-9) { last.ease = ease; keys.shift(); }
        else if (last && last.t > delay) warn(`${track.id}: tweens overlap; keys are sorted by time`);
        track.keys.push(...keys);
        track.keys.sort((x, y) => x.t - y.t);
        const repeat = t.repeat ?? 0;
        if (repeat !== 0) {
          if (track.repeat !== undefined) warn(`${track.id}: more than one tween repeats; the last one's repeat is used`);
          track.repeat = repeat < 0 ? 0 : repeat + 1;
          if (t.repeatDelay) track.every = lap + t.repeatDelay;
        }
        if (repeat < 0) { forever = true; ends.push(delay + lap); }
        else ends.push(delay + lap * (repeat + 1) + (t.repeatDelay ?? 0) * repeat);
      }
    }
    for (const r of owner.rawKeys) {
      const { on, param } = target(n, e, r.param, r.options.on);
      const track = trackFor(n, e, on, param, true);
      track.keys = r.keys.map((k) => ({ ...k, value: value(k.value) }));
      if (r.options.repeat !== undefined) track.repeat = r.options.repeat;
      if (r.options.every !== undefined) track.every = r.options.every;
      if (r.options.repeat === 0) forever = true;
      if (track.keys.length) ends.push(track.keys[track.keys.length - 1]!.t);
    }
  };
  for (const n of all) {
    if (n instanceof RawNode) {
      for (const r of n.rawKeys) {
        const modifier = r.options.modifier;
        tracks.push({
          id: claim(`${modifier ?? n.json.id}_${r.param}`), node: n.json.id, on: r.options.on ?? (modifier ? 'modifier' : 'node'), ...(modifier ? { modifier } : {}),
          param: r.param, keys: r.keys.map((k) => ({ ...k })), ...(r.options.repeat !== undefined ? { repeat: r.options.repeat } : {}), ...(r.options.every !== undefined ? { every: r.options.every } : {}),
        });
        if (r.options.repeat === 0) forever = true;
        if (r.keys.length) ends.push(r.keys[r.keys.length - 1]!.t);
      }
      continue;
    }
    tweensOf(n, null);
    for (const e of effectsOf(n.stack)) tweensOf(n, e);
  }

  const custom: Record<string, CustomVariable> = {};
  for (const v of vars.values()) {
    if (v.value instanceof Expr) custom[v.name] = { $expr: v.value.source, fallback: v.value.fallback ?? numbers[v.name] ?? 0 };
    else if (v.options) {
      const { label, min, max, step, unit } = v.options;
      custom[v.name] = { value: v.value, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(step !== undefined ? { step } : {}), ...(label ? { label } : {}), ...(unit ? { unit } : {}) };
    } else custom[v.name] = v.value;
  }

  const scene: SceneV1 = {
    version: 1,
    ...(o.width !== undefined || o.height !== undefined ? { document: { width: o.width ?? o.height!, height: o.height ?? o.width! } } : {}),
    ...(o.background ? { background: o.background } : {}),
    ...(o.notes ? { notes: o.notes } : {}),
    ...(o.seed !== undefined ? { seedGenerator: o.seed } : {}),
    ...(o.seedEvery ? { seedEvery: o.seedEvery } : {}),
    ...(o.seedOnLoad ? { seedOnLoad: true } : {}),
    ...(o.fit ? { fullViewport: o.fit } : {}),
    ...(o.walls ? { physicsBounds: true } : {}),
    ...(o.clip ? { clipToDocument: true } : {}),
    ...(vars.size ? { custom } : {}),
    objects: build.objects.map(nodeOf),
    ...(o.interactions?.length ? { interactions: structuredClone(o.interactions) } : {}),
  };
  if (tracks.length || o.duration !== undefined || o.infinite || o.fps !== undefined) {
    const duration = o.duration ?? (Math.max(0, ...ends) || 1);
    const infinite = !!o.infinite;
    const loop = !infinite && (o.loop ?? forever);
    scene.animation = {
      duration, ...(loop ? { loop: true } : {}), ...(infinite ? { infinite: true } : {}), ...(o.autoplay === false ? { autoplay: false } : {}),
      ...(o.fps ? { fps: o.fps } : {}), tracks, ...(o.markers?.length ? { markers: structuredClone(o.markers) } : {}),
    };
  }
  if (o.extra) Object.assign(scene, structuredClone(o.extra));
  if (build.objects.some((n) => n instanceof Group && n.layer) && !build.objects.every((n) => (n instanceof Group && n.layer) || (n instanceof RawNode && n.json.kind === 'group' && n.json.layer))) {
    throw new Error('svertikJS: when a scene has layers, every top-level object must be a layer');
  }
  return { scene, warnings };
}

function defaultOf(params: Record<string, unknown> | undefined, key: string): unknown {
  if (!params) return undefined;
  return (resolveParams(params as never) as Record<string, unknown>)[key];
}

// Types re-exported for the generated factories.
export type { Ease };
