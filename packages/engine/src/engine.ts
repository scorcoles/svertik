import { expandCompositions } from './composition';
import type { GroupNode, SceneNode } from './scene';
// The scene (what is saved and exported as JSON) and the engine that evaluates it.

import { createDocumentEvaluator, withoutUnborn, type DocumentResult, type PastScenes, type SceneV1, type TargetLookup } from './document';
import { sampleScene } from './animation';
import { bounds, keepInner, type Bounds, type Geometry } from './geometry';
import { importSVG } from './importer';
import { chainFrom, type FilterChain } from './chain';
import { resolveParams, type HistoryLookup, type ModifierContext, type SceneSpace, type ModifierDef, type ResolvedModifier, type TrailLookup } from './modifier';
import { renderInto, toSVG, type ToSVGOptions } from './render';
import { effectGuides, type EffectGuide } from './guides';
import { createExpressionMemory, evaluateSceneExpressions, type ParamDefaults } from './expression';
import { shapeRegistry } from './shapes';
import { hasMissingPacks, restorePacks } from './pack';

export interface ModifierInstance {
  /** Stable id: animation tracks refer to it. */
  id: string;
  type: string;
  /** Optional display name in editors (the stack shows it instead of the effect's label). Not rendered. */
  name?: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  /** Numeric custom props forwarded to nested modifiers. */
  props?: Record<string, unknown>;
  /** Modifiers nested in this one (Step applies them copy by copy). */
  children?: ModifierInstance[];
  /** Runtime only, never saved: added by an Effector node, so it measures in the scene (see `scene`). */
  space?: 'scene';
  /** Runtime only, never saved: the scene placement the document gives a `space: 'scene'` effect. */
  scene?: SceneSpace;
  /** Runtime only, never saved: inside a group with Physics (Gravity then hands its forces to it). */
  inWorld?: boolean;
  /** Runtime only, never saved: the context an Each's children's formulas run in (from the formula pass). */
  eachContext?: unknown;
}

/**
 * A stack of effects on a loose SVG, without a scene (to test effects or show the chain step by step).
 * The result stays in the SVG's coordinates.
 */
export interface StackInput {
  source: string;
  stack: ModifierInstance[];
  /** Maximum segment length when subdividing, as a fraction of the drawing size. */
  resolution?: number;
}

export type { FilterChain } from './chain';

export interface Engine {
  /** Applies a stack to an SVG; reuses what was computed if the start of the stack hasn't changed. */
  evaluateStack(input: StackInput): Geometry;
  /** The result of each step of the stack: [source, after the 1st, after the 2nd, …]. */
  evaluateStackSteps(input: StackInput): Geometry[];
  /** The scene: the whole document, the placed sources and per-node info. */
  evaluateDocument(scene: SceneV1): DocumentResult;
  toSVG(scene: SceneV1, options?: ToSVGOptions): string;
  /** Draws the scene into an <svg> and returns how to update it. */
  mount(svg: SVGSVGElement, scene: SceneV1, options?: ToSVGOptions): { update(scene: SceneV1): void; doc(): DocumentResult | null };
}

const DEFAULT_RESOLUTION = 0.01;

/** What `runStack` keeps for a node between evaluations: the geometry it started from and each step's result. */
export interface StepMemo {
  base?: Geometry;
  resolution?: number;
  /** `deps`: what a step that looked at other objects saw of them (fingerprints); absent when it can't be reused. */
  steps: { key: string; geo: Geometry; dynamic: boolean; ref: Bounds; deps?: [string, number][] }[];
}

/**
 * The box each effect of a stack measures on (by its id): the source's or that of the last one that changed it.
 * The empty key ('') holds the one at the end of the stack: the filters', which apply after everything.
 */
export type StackRefs = Record<string, Bounds>;

export function createEngine(modifiers: readonly ModifierDef<any>[]): Engine {
  const registry = new Map(modifiers.map((m) => [m.type, m]));

  // Cache: the imported source and the result of each step, with the key that produced it.
  let sourceKey: string | null = null;
  let sourceGeo: Geometry | null = null;
  let steps: { key: string; geo: Geometry; ref: Bounds }[] = [];

  function load(scene: StackInput): Geometry {
    const key = `${scene.resolution ?? DEFAULT_RESOLUTION}\n${scene.source}`;
    if (key !== sourceKey || !sourceGeo) {
      sourceGeo = importSVG(scene.source);
      sourceKey = key;
      steps = [];
    }
    return sourceGeo;
  }

  function evaluateStackSteps(scene: StackInput): Geometry[] {
    const source = load(scene);
    const b = bounds(source);
    const ctx: ModifierContext = {
      bounds: b,
      resolution: Math.max(b.width, b.height) * (scene.resolution ?? DEFAULT_RESOLUTION) || 1,
      children: [],
    };
    const out: Geometry[] = [source];
    let geo = source;
    let ref = b;
    let reusable = true;
    scene.stack.forEach((inst, i) => {
      const key = JSON.stringify([inst.id, inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
      const cached = steps[i];
      if (reusable && cached && cached.key === key) {
        geo = cached.geo;
        ref = cached.ref;
      } else {
        reusable = false;
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: unknown modifier "${inst.type}"`);
        // Filters and masks don't change the geometry (they apply when the object is painted).
        if (inst.enabled !== false && def.kind !== 'filter' && !def.mask) {
          geo = keepInner(geo, def.apply(geo, resolveParams(def.params, inst.params), { ...ctx, id: inst.id, bounds: ref, children: resolveChildren(inst.children) }));
          if (def.reframe) {
            const nb = bounds(geo);
            if (nb.width > 0 || nb.height > 0) ref = nb;
          }
        }
        steps[i] = { key, geo, ref };
      }
      out.push(geo);
    });
    steps.length = scene.stack.length;
    return out;
  }

  function resolveChildren(children: ModifierInstance[] = []): ResolvedModifier[] {
    return children.map((c) => {
      const def = registry.get(c.type);
      if (!def) throw new Error(`svertik: unknown modifier "${c.type}"`);
      return { id: c.id, def, params: def.freeParams ? { ...(c.params ?? {}) } : resolveParams(def.params, c.params), enabled: c.enabled !== false, children: resolveChildren(c.children) };
    });
  }

  const evaluateStack = (input: StackInput) => evaluateStackSteps(input).at(-1)!;

  /**
   * A stack applied to a geometry with its reference box (for objects and groups).
   * With `memo`, it keeps each step's result: if the starting geometry is the same and the first
   * effects haven't changed, they are reused (animating the last of the stack doesn't redo the ones above).
   * A step that looks at another object is not reused (the other may have changed).
   */
  function runStack(geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: TargetLookup, memo?: StepMemo, refs?: StackRefs, trail?: TrailLookup, history?: (inst: ModifierInstance) => HistoryLookup | undefined, rebuild?: (params: Record<string, number>) => Geometry | null): Geometry {
    // Subdivision follows the reference box, which changes after an effect that reframes (a Clone grid): a
    // deformer after it bends at the scale of the whole grid, so tiny copies must not be cut at the source's scale.
    let res = Math.max(ref.width, ref.height) * resolution || 1;
    let reuse = !!memo && memo.base === geo && memo.resolution === resolution;
    if (memo && !reuse) Object.assign(memo, { base: geo, resolution, steps: [] });
    stack.forEach((inst, i) => {
      if (refs) refs[inst.id] = ref;
      const key = JSON.stringify([inst.id, inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? [], inst.scene ?? 0, inst.inWorld ?? false, inst.eachContext ?? 0]);
      const cached = memo?.steps[i];
      // A step that looked at other objects is reused while they look the same (a Clone on a hidden shape).
      const same = (deps: [string, number][] | undefined) => !!deps && !!target?.fingerprint && deps.every(([id, h]) => target.fingerprint!(id) === h);
      if (reuse && cached && cached.key === key && (!cached.dynamic || same(cached.deps))) {
        geo = cached.geo;
        ref = cached.ref;
        res = Math.max(ref.width, ref.height) * resolution || 1;
        return;
      }
      reuse = false;
      let dynamic = false;
      // Fingerprints of the objects this step looks at; dropped when it also reads the past (it can't be reused).
      let deps: [string, number][] | undefined = [];
      const look = target && ((id: string) => {
        dynamic = true;
        if (deps && target.fingerprint) deps.push([id, target.fingerprint(id)]); else deps = undefined;
        return target(id);
      });
      const past: TrailLookup | undefined = trail && ((...args) => ((dynamic = true), (deps = undefined), trail(...args)));
      if (inst.enabled !== false) {
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: unknown modifier "${inst.type}"`);
        if (def.kind !== 'filter' && !def.mask) {
          // What depends on its past is redone every time (the past can change without its input changing).
          const own = def.history ? history?.(inst) : undefined;
          if (own) dynamic = true, deps = undefined;
          geo = keepInner(geo, def.apply(geo, resolveParams(def.params, inst.params), { id: inst.id, bounds: ref, resolution: res, target: look, trail: past, children: resolveChildren(inst.children), history: own, ...(inst.scene ? { scene: inst.scene } : {}), ...(inst.inWorld ? { inWorld: true } : {}), ...(inst.type === 'each' ? { expressions: inst.eachContext, ...(rebuild ? { rebuild } : {}) } : {}) }));
          if (def.reframe) {
            const b = bounds(geo);
            if (b.width > 0 || b.height > 0) {
              ref = b;
              res = Math.max(ref.width, ref.height) * resolution || 1;
            }
          }
        }
      }
      if (memo) memo.steps[i] = { key, geo, dynamic, ref, ...(dynamic && deps ? { deps } : {}) };
    });
    // Mask is a post-process, even when it precedes Clone in the stack.
    const lastMask = [...stack].reverse().find(inst => inst.enabled !== false && registry.get(inst.type)?.mask && inst.params?.source);
    if (lastMask) {
      const def = registry.get(lastMask.type)!;
      geo = keepInner(geo, def.apply(geo, resolveParams(def.params, lastMask.params), { bounds: ref, resolution: res, target, trail, children: [] }));
    }
    if (memo) memo.steps.length = stack.length;
    if (refs) refs[''] = ref;
    return geo;
  }
  /**
   * The filters of a stack (the active ones, in order): how far they reach in total and how to write their
   * chained primitives once it is known where the object is.
   */
  function filtersOf(stack: ModifierInstance[]): FilterChain | null {
    return chainFrom(
      stack.flatMap((inst) => {
        const def = registry.get(inst.type);
        return inst.enabled !== false && def?.kind === 'filter' ? [{ def, params: resolveParams(def.params, inst.params) as Record<string, unknown> }] : [];
      }),
    );
  }

  /** The mask of a stack (the last active one), with its parameters. */
  function maskOf(stack: ModifierInstance[]): { source: string; mode: string; invert: boolean; whole: boolean } | null {
    let out: { source: string; mode: string; invert: boolean; whole: boolean } | null = null;
    for (const inst of stack) {
      const def = registry.get(inst.type);
      if (inst.enabled === false || !def?.mask) continue;
      const p = resolveParams(def.params, inst.params) as Record<string, unknown>;
      if (p.source) out = { source: String(p.source), mode: String(p.mode ?? 'shape'), invert: !!p.invert, whole: !!p.whole };
    }
    return out;
  }

  const documents = createDocumentEvaluator(runStack, filtersOf, { maskOf });
  // Packs saved without their geometry are rebuilt from their original, with an evaluator of their own
  // (so the scene's caches keep the scene's nodes) and once per pack.
  const packDocuments = createDocumentEvaluator(runStack, filtersOf, { maskOf });
  const packCache = new Map<string, Geometry>();
  const withPacks = (scene: SceneV1) => {
    if (!hasMissingPacks(scene)) return scene;
    const out = structuredClone(scene);
    restorePacks(out, (s) => packDocuments.evaluate(expandCompositions(evaluateSceneExpressions(withPacks(s), { defaults }), registry)), packCache);
    return out;
  };
  // The past, for effects that read it (`history`): the scene at other times, with every stack cut right
  // before them (so they see their input, and don't ask for their own past again). Kept per time while the
  // scene, apart from its time, doesn't change: while playing, each frame adds one time at most.
  const cut = (stack: ModifierInstance[]) => {
    const i = stack.findIndex((m) => m.enabled !== false && registry.get(m.type)?.history);
    return i < 0 ? stack : stack.slice(0, i);
  };
  const pastDocuments = createDocumentEvaluator(runStack, filtersOf, { maskOf, trails: false, cut });
  const pastCache = { key: '', at: new Map<number, { doc: DocumentResult; scene: SceneV1 }>() };
  const pastOf = (raw: SceneV1): PastScenes => {
    let key: string | undefined, scope: string | undefined;
    const { at: _now, ...base } = raw;
    // What identifies the scene apart from its time: the live pointer, clock, scroll and dt change on every
    // frame of Play without the scene changing (hashing them would start the past, and Physics, over each frame).
    const { pointer: _pointer, runtime: _runtime, pokes: _pokes, bursts: _bursts, drags: _drags, sweeps: _sweeps, ...authored } = base;
    let sampled: SceneV1 | undefined;
    const atZero = () => (sampled ??= sampleScene(authored as SceneV1, 0));
    return {
      // Animated values count at time 0: the editor writes the current ones into the scene as it plays.
      key: () => (key ??= hashText(JSON.stringify(atZero(), (k, v) => (k === 'at' ? undefined : v)))),
      // Runtime copies (`since`) left out too: a click doesn't change it, an edit does.
      scope: () => (scope ??= hashText(JSON.stringify(atZero(), (k, v) => (k === 'at' ? undefined : Array.isArray(v) && k === 'children' ? v.filter((n: { since?: number }) => n?.since === undefined) : v)))),
      at(t) {
        const k = this.key();
        if (pastCache.key !== k) pastCache.key = k, pastCache.at.clear();
        let hit = pastCache.at.get(t);
        if (!hit) {
          const then = expandCompositions(evaluateSceneExpressions(withoutUnborn({ ...sampleScene(base as SceneV1, t), at: t }), { defaults }), registry);
          hit = { doc: pastDocuments.evaluate(then), scene: then };
          pastCache.at.set(t, hit);
          if (pastCache.at.size > 2000) pastCache.at.delete(pastCache.at.keys().next().value!);
        }
        return hit;
      },
    };
  };
  const usesHistory = (scene: SceneV1) => {
    const types = new Set([...registry.values()].filter((d) => d.history).map((d) => d.type));
    if (!types.size) return false;
    const text = JSON.stringify(scene);
    return [...types].some((t) => text.includes(`"type":"${t}"`));
  };
  /** A short fingerprint of a long text (FNV-1a). */
  const hashText = (text: string) => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36) + ':' + text.length;
  };
  /** Parameters with a default formula (`defaultExpr`, a Time that follows scene.time) that a scene leaves out. */
  const defaultExpressions = new Map<string, [string, string, number][]>();
  for (const def of registry.values()) {
    const list = Object.entries(def.params as Record<string, import('./modifier').ParamSpec>).flatMap(([name, spec]) => spec.type === 'number' && spec.defaultExpr ? [[name, spec.defaultExpr, spec.default] as [string, string, number]] : []);
    if (list.length) defaultExpressions.set(def.type, list);
  }
  const withDefaultExpressions = (scene: SceneV1): SceneV1 => {
    if (!defaultExpressions.size) return scene;
    let changed = false;
    const stack = (list: ModifierInstance[]): ModifierInstance[] => {
      let out: ModifierInstance[] | null = null;
      list.forEach((m, i) => {
        const wanted = defaultExpressions.get(m.type)?.filter(([name]) => m.params?.[name] === undefined) ?? [];
        const children = m.children?.length ? stack(m.children) : m.children;
        if (!wanted.length && children === m.children) return;
        out ??= list.slice();
        out[i] = { ...m, params: { ...m.params, ...Object.fromEntries(wanted.map(([name, $expr, fallback]) => [name, { $expr, fallback }])) }, ...(children ? { children } : {}) };
      });
      if (out) changed = true;
      return out ?? list;
    };
    const nodes = (list: SceneNode[]): SceneNode[] => {
      let out: SceneNode[] | null = null;
      list.forEach((n, i) => {
        const s = n.stack?.length ? stack(n.stack) : n.stack;
        const children = n.children?.length ? nodes(n.children) : n.children;
        const composition = n.kind === 'group' && n.composition ? withDefaultExpressions(n.composition.scene) : undefined;
        if (s === n.stack && children === n.children && (!composition || composition === (n as GroupNode).composition!.scene)) return;
        out ??= list.slice();
        out[i] = { ...n, stack: s, ...(children ? { children } : {}), ...(composition ? { composition: { ...(n as GroupNode).composition!, scene: composition } } : {}) } as SceneNode;
      });
      if (out) changed = true;
      return out ?? list;
    };
    const objects = nodes(scene.objects);
    return changed ? { ...scene, objects } : scene;
  };
  // smooth() and spring() remember the last frame here: only this frame-by-frame evaluation writes it.
  const memory = createExpressionMemory();
  // Default values by type, for `this.name` formulas that read a parameter the scene leaves unset.
  const defaultsCache = new Map<string, Record<string, unknown> | undefined>();
  const defaults: ParamDefaults = (owner, type) => {
    const key = `${owner}:${type}`;
    if (!defaultsCache.has(key)) {
      const schema = owner === 'shape' ? shapeRegistry.get(type)?.params : registry.get(type)?.params;
      defaultsCache.set(key, schema ? resolveParams(schema) as Record<string, unknown> : undefined);
    }
    return defaultsCache.get(key);
  };
  const evaluateDocument = (scene: SceneV1) => {
    // Copies born at runtime are filtered before compositions expand (expansion drops their birth time).
    const raw = withoutUnborn(withDefaultExpressions(withPacks(scene)));
    const resolved = expandCompositions(evaluateSceneExpressions(raw, { memory, defaults }), registry);
    const doc = documents.evaluate(resolved, usesHistory(raw) ? pastOf(raw) : undefined);
    let guides: EffectGuide[] | undefined;
    return { ...doc, guides: () => (guides ??= effectGuides(resolved, doc.nodes, registry, doc)) };
  };
  const flat = (scene: SceneV1) => evaluateDocument(scene).geometry;

  return {
    evaluateStack,
    evaluateStackSteps,
    evaluateDocument,
    toSVG: (scene, options) => toSVG(flat(scene), options),
    mount(svg, scene, options) {
      // The last thing painted (to know where each object is: "follow" needs it).
      let last: DocumentResult | null = null;
      const paint = (s: SceneV1) => {
        last = evaluateDocument(s);
        renderInto(svg, last.geometry, options);
      };
      paint(scene);
      return { update: paint, doc: () => last };
    },
  };
}
