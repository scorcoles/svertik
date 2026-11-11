// The scene (what is saved and exported as JSON) and the engine that evaluates it.

import { createDocumentEvaluator, type DocumentResult, type SceneV2 } from './document';
import { bounds, keepInner, type Bounds, type Geometry } from './geometry';
import { importSVG } from './import';
import { chainFrom, type FilterChain } from './chain';
import { resolveParams, type ModifierContext, type ModifierDef, type ResolvedModifier, type TrailLookup } from './modifier';
import { renderInto, toSVG, type ToSVGOptions } from './render';

export interface ModifierInstance {
  /** Stable id: animation tracks refer to it. */
  id: string;
  type: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  /** Modifiers nested in this one (Step applies them copy by copy). */
  children?: ModifierInstance[];
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
  evaluateDocument(scene: SceneV2): DocumentResult;
  toSVG(scene: SceneV2, options?: ToSVGOptions): string;
  /** Draws the scene into an <svg> and returns how to update it. */
  mount(svg: SVGSVGElement, scene: SceneV2, options?: ToSVGOptions): { update(scene: SceneV2): void; doc(): DocumentResult | null };
}

const DEFAULT_RESOLUTION = 0.01;

/** What `runStack` keeps for a node between evaluations: the geometry it started from and each step's result. */
export interface StepMemo {
  base?: Geometry;
  resolution?: number;
  steps: { key: string; geo: Geometry; dynamic: boolean; ref: Bounds }[];
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
      const key = JSON.stringify([inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
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
          geo = keepInner(geo, def.apply(geo, resolveParams(def.params, inst.params), { ...ctx, bounds: ref, children: resolveChildren(inst.children) }));
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
      return { def, params: resolveParams(def.params, c.params), enabled: c.enabled !== false, children: resolveChildren(c.children) };
    });
  }

  const evaluateStack = (input: StackInput) => evaluateStackSteps(input).at(-1)!;

  /**
   * A stack applied to a geometry with its reference box (for objects and groups).
   * With `memo`, it keeps each step's result: if the starting geometry is the same and the first
   * effects haven't changed, they are reused (animating the last of the stack doesn't redo the ones above).
   * A step that looks at another object is not reused (the other may have changed).
   */
  function runStack(geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: (id: string) => Geometry | null, memo?: StepMemo, refs?: StackRefs, trail?: TrailLookup): Geometry {
    // Subdivision follows the size of the source; the reference box changes after an effect that reframes.
    const res = Math.max(ref.width, ref.height) * resolution || 1;
    let reuse = !!memo && memo.base === geo && memo.resolution === resolution;
    if (memo && !reuse) Object.assign(memo, { base: geo, resolution, steps: [] });
    stack.forEach((inst, i) => {
      if (refs) refs[inst.id] = ref;
      const key = JSON.stringify([inst.type, inst.enabled ?? true, inst.params ?? {}, inst.children ?? []]);
      const cached = memo?.steps[i];
      if (reuse && cached && cached.key === key && !cached.dynamic) {
        geo = cached.geo;
        ref = cached.ref;
        return;
      }
      reuse = false;
      let dynamic = false;
      const look = target && ((id: string) => ((dynamic = true), target(id)));
      const past: TrailLookup | undefined = trail && ((...args) => ((dynamic = true), trail(...args)));
      if (inst.enabled !== false) {
        const def = registry.get(inst.type);
        if (!def) throw new Error(`svertik: unknown modifier "${inst.type}"`);
        if (def.kind !== 'filter' && !def.mask) {
          geo = keepInner(geo, def.apply(geo, resolveParams(def.params, inst.params), { bounds: ref, resolution: res, target: look, trail: past, children: resolveChildren(inst.children) }));
          if (def.reframe) {
            const b = bounds(geo);
            if (b.width > 0 || b.height > 0) ref = b;
          }
        }
      }
      if (memo) memo.steps[i] = { key, geo, dynamic, ref };
    });
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
  function maskOf(stack: ModifierInstance[]): { source: string; mode: string; invert: boolean } | null {
    let out: { source: string; mode: string; invert: boolean } | null = null;
    for (const inst of stack) {
      const def = registry.get(inst.type);
      if (inst.enabled === false || !def?.mask) continue;
      const p = resolveParams(def.params, inst.params) as Record<string, unknown>;
      if (p.source) out = { source: String(p.source), mode: String(p.mode ?? 'shape'), invert: !!p.invert };
    }
    return out;
  }

  const documents = createDocumentEvaluator(runStack, filtersOf, { maskOf });
  const evaluateDocument = (scene: SceneV2) => documents.evaluate(scene);
  const flat = (scene: SceneV2) => evaluateDocument(scene).geometry;

  return {
    evaluateStack,
    evaluateStackSteps,
    evaluateDocument,
    toSVG: (scene, options) => toSVG(flat(scene), options),
    mount(svg, scene, options) {
      // The last thing painted (to know where each object is: "follow" needs it).
      let last: DocumentResult | null = null;
      const paint = (s: SceneV2) => {
        last = evaluateDocument(s);
        renderInto(svg, last.geometry, options);
      };
      paint(scene);
      return { update: paint, doc: () => last };
    },
  };
}
