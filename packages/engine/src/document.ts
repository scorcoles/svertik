// Scene: several objects and groups, each with its own effect stack and placement.

import { bounds, centroid, mapPoints, type Bounds, type FilterDef, type Geometry, type Shape, type Vec2 } from './geometry';
import { importSVG } from './importer';
import { fontsOf, fontsVersion, hasFont, loadFont } from './fonts';
import { buildShape, shapeRegistry } from './shapes';
import { apply, IDENTITY, invert, multiply, rotateScale, translate, type Mat } from './matrix';
import { findModifier, sampleScene, trackValue } from './animation';
import type { FilterChain, ModifierInstance, StackRefs, StepMemo } from './engine';
import type { TrailLookup } from './modifier';
import { gradientDefs, styleAttrs, toPathData } from './render';
import {
  type BlendMode,
  type GroupNode,
  type NodeBase,
  type Placement,
  type Scene,
  type SceneNode,
  type SceneV1,
} from './scene';

// The shape of a scene lives in its own module (scene.ts), with nothing of the engine: whoever only
// reads a scene doesn't need to bring the motor along.
export * from './scene';

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, rotation: 0 };


/** Walks the tree: each node with its parent. */
export function* walkNodes(nodes: SceneNode[], parent: SceneNode | null = null): Generator<{ node: SceneNode; parent: SceneNode | null }> {
  for (const node of nodes) {
    yield { node, parent };
    if (node.children?.length) yield* walkNodes(node.children, node);
  }
}

export interface NodeInfo {
  id: string;
  kind: 'object' | 'shape' | 'group' | 'instance' | 'effector';
  /** Reference box of the node's effects (fractions), in its local coordinates. */
  bounds: Bounds;
  /**
   * The box each effect of its stack measures on (by id), if not `bounds`: after a Clone or a
   * Mirror, the ones below measure on what those generate.
   */
  refs?: StackRefs;
  /** From the node's local coordinates to document coordinates. */
  matrix: Mat;
  /** Box of the node's result, already in the document (to select it). */
  box: Bounds;
}

export interface DocumentResult {
  geometry: Geometry;
  /** The result of a node (with its effects), in the document; without its opacity or blend. */
  geometryOf(id: string): Geometry | null;
  /** The source of each object, placed in the document (to show it as a ghost). */
  sources: Geometry;
  nodes: Map<string, NodeInfo>;
}

export const placementOf = (n: NodeBase): Placement => ({ ...DEFAULT_PLACEMENT, ...n.transform });

/**
 * A node's matrix: rotates and scales around its pivot, and its origin (by default, the centre of its box)
 * ends up at (x, y) + `anchor`.
 */
function placementMatrix(p: Placement, ref: Bounds, anchor: [number, number], origin: Vec2 = centerOf(ref)): Mat {
  // With the pivot off-centre, the anchor moves the same: with no rotation or scale, the node doesn't move.
  const c = origin;
  const pv = pivotPoint(ref, p.pivot);
  const a: [number, number] = [anchor[0] + pv[0] - c[0], anchor[1] + pv[1] - c[1]];
  return multiply(translate(a[0] + p.x, a[1] + p.y), multiply(linearOf(p), translate(-pv[0], -pv[1])));
}

/** The linear part of the placement: rotation, scale, stretch and flip. */
export const linearOf = (p: Placement): Mat => multiply(rotateScale(p.rotation, p.scale), [(p.flipX ? -1 : 1) * (p.stretch?.[0] ?? 1), 0, 0, (p.flipY ? -1 : 1) * (p.stretch?.[1] ?? 1), 0, 0]);

/** The pivot in the node's local coordinates. */
export const pivotPoint = (ref: Bounds, pivot: [number, number] | undefined): [number, number] => {
  const [fx, fy] = pivot ?? [0.5, 0.5];
  return [ref.x + fx * ref.width, ref.y + fy * ref.height];
};

const transformGeo = (geo: Geometry, m: Mat): Geometry => {
  if (m.every((v, i) => v === IDENTITY[i])) return geo;
  const moved = mapPoints(geo, ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
  moved.shapes = moved.shapes.map((shape) => {
    if (!shape.impulse) return shape;
    const [x, y] = shape.impulse.velocity;
    return { ...shape, impulse: { velocity: [m[0] * x + m[2] * y, m[1] * x + m[3] * y], spin: shape.impulse.spin * (m[0] * m[3] - m[1] * m[2] < 0 ? -1 : 1) } };
  });
  return moved;
};

/** The box of the drawing with `m` applied: the same as `bounds(transformGeo(geo, m))`, without
 *  building the transformed drawing (this runs per node and per pass, and the drawing can be big). */
const boundsOf = (geo: Geometry, m: Mat): Bounds => {
  if (m.every((v, i) => v === IDENTITY[i])) return bounds(geo);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x: number, y: number) => {
    const tx = m[0] * x + m[2] * y + m[4];
    const ty = m[1] * x + m[3] * y + m[5];
    if (tx < x0) x0 = tx;
    if (ty < y0) y0 = ty;
    if (tx > x1) x1 = tx;
    if (ty > y1) y1 = ty;
  };
  for (const shape of geo.shapes) {
    for (const sp of shape.subpaths) {
      add(sp.start[0], sp.start[1]);
      for (const s of sp.segs) {
        add(s.c1[0], s.c1[1]);
        add(s.c2[0], s.c2[1]);
        add(s.p[0], s.p[1]);
      }
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

/** The node's blend on its shapes; one a shape already has (from a child) wins. */
const withBlend = (shapes: Shape[], blend: BlendMode | undefined): Shape[] =>
  !blend || blend === 'normal' ? shapes : shapes.map((s) => (s.style['mix-blend-mode'] ? s : { ...s, style: { ...s.style, 'mix-blend-mode': blend } }));

const withOpacity = (shapes: Shape[], opacity: number | undefined): Shape[] => {
  if (opacity === undefined || opacity >= 1) return shapes;
  return shapes.map((s) => ({ ...s, style: { ...s.style, opacity: String(Number(s.style.opacity ?? 1) * Math.max(0, opacity)) } }));
};

const centerOf = (b: Bounds): [number, number] => [b.x + b.width / 2, b.y + b.height / 2];

const union = (boxes: Bounds[]): Bounds => {
  const real = boxes.filter((b) => b.width > 0 || b.height > 0);
  if (!real.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x0 = Math.min(...real.map((b) => b.x));
  const y0 = Math.min(...real.map((b) => b.y));
  const x1 = Math.max(...real.map((b) => b.x + b.width));
  const y1 = Math.max(...real.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

export interface DocumentEvaluator {
  evaluate(scene: SceneV1): DocumentResult;
}

/** Geometry of another node, already in the coordinates of the stack asking for it (or null if not known yet). */
export type TargetLookup = (id: string) => Geometry | null;

/**
 * Evaluates the tree. `runStack` applies a stack to a geometry with its reference box;
 * objects cache their imported source and the result of their stack.
 *
 * Effects that use another object (Clone on an object, Path Wrap…): a first pass without them
 * and, if any asked, another one with what came out of the first. Those nodes are not cached.
 */
export function createDocumentEvaluator(
  runStack: (geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: TargetLookup, memo?: StepMemo, refs?: StackRefs, trail?: TrailLookup) => Geometry,
  filtersOf: (stack: ModifierInstance[]) => FilterChain | null = () => null,
  options: { trails?: boolean; maskOf?: (stack: ModifierInstance[]) => { source: string; mode: string; invert: boolean; whole?: boolean } | null } = {},
): DocumentEvaluator {
  const maskOf = options.maskOf ?? (() => null);
  // Trails (Trace): the scene evaluated at earlier times, with another evaluator (without trails, so it
  // doesn't loop). Results are kept per time (on a fixed grid of times): while playing, each frame only
  // computes the new time. Cleared when anything but the time changes.
  const withTrails = options.trails !== false;
  // La historia de las estelas: el centro de cada objeto observado, fotograma a fotograma.
  //
  // Antes, la estela se trazaba reevaluando la escena en los tiempos pasados (una evaluación
  // completa por muestra): en una escena complexa eso congelaba la página al empezar (45
  // evaluaciones en el primer fotograma). Ahora la estela se dibuja con lo que el motor ya ha
  // visto: el recorrido se anota mientras se reproduce, y no cuesta nada.
  const history = new Map<string, { t: number; p: Vec2 }[]>();
  const traced = new Set<string>();
  // El tiempo "sin envolver": cuando la animación vuelve a empezar, el tiempo sigue creciendo,
  // para que la estela pueda seguir el recorrido a través del bucle.
  let lastAt: number | undefined;
  let wraps = 0;
  // La firma de la escena (sin el tiempo): cuando cambia, la historia deja de valer.
  let sceneKey = '';

  // Each node's source (imported SVG or primitive), by its own key: not rebuilt when only its effects
  // change. And what its stack produces, step by step (see runStack).
  const sources = new Map<string, { key: string; geo: Geometry }>();
  const memos = new Map<string, StepMemo>();
  const memoOf = (id: string) => {
    let m = memos.get(id);
    if (!m) memos.set(id, (m = { steps: [] }));
    return m;
  };
  // `deps`: for the ones that use another object, a fingerprint of what they saw of each (its geometry and
  // where both were). While it doesn't change, the result holds: touching something else doesn't redo it.
  const cache = new Map<string, { key: string; source: Geometry; result: Geometry; dynamic: boolean; deps: [string, number][]; refs: StackRefs; volatile?: boolean }>();
  const groupCache = new Map<string, { key: string; result: Geometry; refs: StackRefs }>();
  /** What came out last time (matrix and geometry of each node): the first pass starts from there. */
  let last = new Map<string, { world: Mat; geo: Geometry }>();

  function evaluate(scene: SceneV1): DocumentResult {
    const resolution = scene.resolution ?? 0.01;
    // El tiempo sin envolver: cuando la animación vuelve a empezar (el bucle), el tiempo sigue
    // creciendo, para que la estela pueda seguir el recorrido a través de la vuelta. Un salto
    // hacia atrás que no sea el bucle (el usuario arrastra la línea de tiempo) no cuenta.
    if (scene.at !== undefined) {
      const d = scene.animation?.duration ?? 0;
      const isLoop = d > 0 && lastAt !== undefined && lastAt >= d * 0.9 && scene.at <= d * 0.1;
      if (lastAt !== undefined && scene.at < lastAt - 1e-6 && isLoop) wraps += d;
      lastAt = scene.at;
    }
    const unwrappedAt = (scene.at ?? 0) + wraps;
    const seen = new Set<string>();
    const byId = new Map<string, SceneNode>();
    for (const { node } of walkNodes(scene.objects)) byId.set(node.id, node);
    const broken = brokenInstances(byId);
    // For trails: the scene without the time (animated values at their value at 0), as the cache key.
    // When the scene changes, the history of the trails is stale: it is cleared.
    let pastBase: SceneV1 | null = null;
    const baseScene = () => {
      if (pastBase) return pastBase;
      const { at: _at, ...rest } = scene;
      pastBase = rest as SceneV1;
      const key = JSON.stringify(sampleScene(pastBase, 0), (k, v) => (k === 'at' ? undefined : v));
      if (key !== sceneKey) {
        sceneKey = key;
        history.clear();
        lastAt = undefined;
        wraps = 0;
      }
      return pastBase;
    };
    // What Effectors add to each node (at the end of its stack, in scene order).
    const extra = effectorStacks(scene, byId);
    const stackOf = (node: SceneNode) => {
      const more = extra.get(node.id);
      const own = node.stack ?? [];
      return more ? [...own, ...more] : own;
    };
    /** From the previous pass: matrix and result (in the document) of each node. */
    let known = last;
    // Fingerprint of the geometry of each known node (computed once per pass).
    let prints = new Map<string, number>();
    const printOf = (id: string) => {
      let h = prints.get(id);
      if (h === undefined) prints.set(id, (h = known.has(id) ? hashGeo(known.get(id)!.geo) : -1));
      return h;
    };
    /** What `ownerId` sees of `id`: changes if the other changes or if either of them moves. */
    const depOf = (ownerId: string, id: string) => {
      const owner = known.get(ownerId);
      return owner && known.has(id) ? mix(printOf(id), owner.world) : -1;
    };
    let nodes = new Map<string, NodeInfo>();
    let shapes: Shape[] = [];
    let finalResults = new Map<string, Geometry>();
    let fx = new Map<string, FilterChain>();
    let innerFx = new Map<string, { chain: FilterChain; ref: Bounds; node: string }>();
    let masked = new Map<string, { source: string; mode: string; invert: boolean; whole?: boolean }>();

    for (let passNo = 0; passNo < 3; passNo++) {
      nodes = new Map<string, NodeInfo>();
      const results = new Map<string, Geometry>();
      let asked = false;
      // What was asked in this pass, to know whether the next one is needed.
      const seenDeps: { owner: string; id: string; h: number }[] = [];
      const lookupFor = (ownerId: string, deps?: [string, number][]): TargetLookup => (id) => {
        if (!id || id === ownerId) return null;
        asked = true;
        const h = depOf(ownerId, id);
        deps?.push([id, h]);
        seenDeps.push({ owner: ownerId, id, h });
        const owner = known.get(ownerId);
        const t = known.get(id);
        return owner && t ? transformGeo(t.geo, invert(owner.world)) : null;
      };

      // Trails: oldest first, on a fixed grid of times; the last one, now.
      let usedTrail = false;
      const trailFor = (ownerId: string): TrailLookup | undefined =>
        withTrails
          ? (id, length, samples) => {
              usedTrail = true;
              traced.add(id);
              asked = true;
              const owner = known.get(ownerId);
              const now = known.get(id);
              // What was seen of the object (from the previous pass): if it changed in this one, another pass.
              seenDeps.push({ owner: ownerId, id, h: owner && now ? depOf(ownerId, id) : -2 });
              if (!owner || !now) return null;
              const toOwner = invert(owner.world);
              const local = (q: Vec2): [number, number] => apply(toOwner, q) as [number, number];
              const current = centroid(now.geo);
              const at = scene.at;
              if (at === undefined || !scene.animation || !current) return current ? [local(current)] : [];
              const n = Math.max(1, Math.min(240, Math.round(samples)));
              const out: [number, number][] = [];
              // La historia: el centro del objeto en cada fotograma ya pasado, con su tiempo.
              const hist = history.get(id);
              const hp: { t: number; p: Vec2 }[] = [];
              if (hist) for (const h of hist) if (h.t <= unwrappedAt + 1e-6 && h.t >= unwrappedAt - length - 1e-6) hp.push(h);
              // Se remuestrea a la densidad pedida, interpolando entre fotogramas.
              if (!hp.length) return current ? [local(current)] : [];
              const t0 = Math.max(hp[0]!.t, unwrappedAt - length);
              for (let k = 0; k < n; k++) {
                const want = t0 + ((unwrappedAt - t0) * k) / Math.max(1, n - 1);
                let j = 0;
                while (j + 1 < hp.length && hp[j + 1]!.t < want) j++;
                const a = hp[j]!, b = hp[Math.min(j + 1, hp.length - 1)]!;
                const u = b.t > a.t ? Math.max(0, Math.min(1, (want - a.t) / (b.t - a.t))) : 0;
                out.push(local([a.p[0] + (b.p[0] - a.p[0]) * u, a.p[1] + (b.p[1] - a.p[1]) * u]));
              }
              out.push(local(current));
              return out;
            }
          : undefined;

      // Filters (shadow, blur…): their shapes go inside a group with the node's filter.
      fx = new Map();
      // Filters on part of the drawing (what is inside RGB Split): `@key` becomes `<node>--<key>`.
      innerFx = new Map();
      const adoptInner = (node: SceneNode, result: Geometry, shapes: Shape[]): Shape[] => {
        if (!result.inner) return shapes;
        const idOf = (key: string) => `${node.id}--${key}`;
        for (const [key, f] of Object.entries(result.inner)) innerFx.set(idOf(key), { ...f, node: node.id });
        return shapes.map((s) => (s.wrap?.some((w) => w.startsWith('@')) ? { ...s, wrap: s.wrap.map((w) => (w.startsWith('@') ? idOf(w.slice(1)) : w)) } : s));
      };
      // Masks: the whole object (with its filters) inside a <g mask>; the mask is built at the end.
      masked = new Map();
      const withMask = (node: SceneNode, shapes: Shape[]): Shape[] => {
        const m = maskOf(stackOf(node));
        if (!m || (m.whole && m.mode === 'shape') || !shapes.length || m.source === node.id) return shapes;
        const id = `${node.id}--mask`;
        masked.set(id, m);
        return shapes.map((s) => ({ ...s, wrap: [id, ...(s.wrap ?? [])] }));
      };
      const withFilters = (node: SceneNode, shapes: Shape[]): Shape[] => {
        // An instance also carries the original's filters (its shadow, its blur…).
        const of = node.kind === 'instance' && !broken.has(node.id) ? byId.get(node.of) : undefined;
        const f = filtersOf(of && of.kind !== 'group' ? [...stackOf(of), ...stackOf(node)] : stackOf(node));
        if (!f || !shapes.length) return shapes;
        fx.set(node.id, f);
        return shapes.map((s) => ({ ...s, wrap: [node.id, ...(s.wrap ?? [])] }));
      };

      // Returns the node's geometry in its parent's coordinates.
      const evalNode = (node: SceneNode, parentMatrix: Mat): Shape[] => {
        seen.add(node.id);
        if (node.kind === 'effector') return [];
        const stack = stackOf(node);
        const p = placementOf(node);
        if (node.kind === 'object' || node.kind === 'shape' || node.kind === 'instance') {
          // Instance: its source is the original's result (without its placement). If not computed yet in
          // this pass, the previous pass's, and another pass is asked for.
          let instSrc: { geo: Geometry; key: string } | null = null;
          if (node.kind === 'instance') {
            let geo: Geometry | null = null;
            if (!broken.has(node.id)) {
              geo = results.get(node.of) ?? null;
              if (!geo) {
                const k = known.get(node.of);
                if (k) geo = transformGeo(k.geo, invert(k.world));
                if (byId.has(node.of)) {
                  asked = true;
                  seenDeps.push({ owner: node.id, id: node.of, h: depOf(node.id, node.of) });
                }
              }
            }
            const clean: Geometry = { viewBox: geo?.viewBox ?? [0, 0, 0, 0], shapes: (geo?.shapes ?? []).map(({ node: _n, wrap: _w, ...s }) => s) };
            instSrc = { geo: clean, key: `inst:${node.of}:${hashGeo(clean)}` };
          }
          const childShapes: Shape[] = [];
          for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) childShapes.push(...evalNode(node.children![i]!, IDENTITY));
          const childKey = childShapes.length ? '|' + hashGeo({ viewBox: [0, 0, 0, 0], shapes: childShapes }) + '|' + JSON.stringify(childShapes.map((s) => [s.style, s.clone, s.node, s.wrap, s.gradients, s.image])) : '';
          // Text depends on the registered fonts: when a new one arrives, it is drawn again.
          const key =
            node.kind === 'instance'
              ? JSON.stringify([resolution, stack]) + '\n' + instSrc!.key + childKey
              : node.kind === 'object' ? JSON.stringify([resolution, stack]) + '\n' + (node.packed ? `pack:${node.packed.key}` : node.source) + childKey : JSON.stringify([resolution, stack, node.shape, node.params, node.shape === 'text' ? fontsVersion() : 0]) + childKey;
          let entry = cache.get(node.id);
          // One that uses another object is valid if what it sees of it hasn't changed.
          // A trail depends on the time: it is not cached.
          const fresh = entry && !entry.volatile && entry.key === key && (!entry.dynamic || entry.deps.every(([id, h]) => depOf(node.id, id) === h));
          if (entry && fresh && entry.dynamic) {
            asked = true;
            for (const [id, h] of entry.deps) seenDeps.push({ owner: node.id, id, h });
          }
          if (!entry || !fresh) {
            const sk = node.kind === 'instance' ? instSrc!.key : node.kind === 'object' ? (node.packed ? `pack:${node.packed.key}` : node.source) : JSON.stringify([node.shape, node.params, node.shape === 'text' ? fontsVersion() : 0]);
            let src = sources.get(node.id);
            if (!src || src.key !== sk) {
              src = { key: sk, geo: node.kind === 'instance' ? instSrc!.geo : node.kind === 'object' ? (node.packed?.geometry ?? importSVG(node.source)) : buildShape(node.shape, node.params) };
              sources.set(node.id, src);
            }
            const source = src.geo;
            const ref = bounds(source);
            const local = childShapes;
            const combinedSource: Geometry = local.length ? { ...source, shapes: [...source.shapes, ...local].map((shape) => ({ ...shape, signalGroup: 0 })) } : source;
            const before = asked;
            asked = false;
            const deps: [string, number][] = [];
            const refs: StackRefs = {};
            usedTrail = false;
            const computed = runStack(combinedSource, stack, ref, resolution, lookupFor(node.id, deps), memoOf(node.id), refs, trailFor(node.id));
            const result = local.length ? { ...computed, shapes: computed.shapes.map(({ signalGroup: _signalGroup, ...shape }) => shape) } : computed;
            entry = { key, source, result, dynamic: asked, deps, refs, volatile: usedTrail };
            asked = asked || before;
            cache.set(node.id, entry);
          }
          const ref = bounds(entry.source);
          // An imported object is centred on the origin (or on its own origin point if it has one: Text with an anchor).
          // Dynamic shapes with an explicit origin can change bounds over time. Scaling around that
          // moving box's centre makes the origin drift, so use it as the default pivot.
          const origin = entry.source.origin;
          const anchoredDynamicShape = node.kind === 'shape' && shapeRegistry.get(node.shape)?.timeDriven && origin;
          const originPivot: [number, number] | undefined = anchoredDynamicShape && node.transform?.pivot === undefined
            ? [
                ref.width ? (origin[0] - ref.x) / ref.width : 0.5,
                ref.height ? (origin[1] - ref.y) / ref.height : 0.5,
              ]
            : undefined;
          const m = placementMatrix(originPivot ? { ...p, pivot: originPivot } : p, ref, [0, 0], origin);
          const world = multiply(parentMatrix, m);
          const placed = transformGeo(entry.result, m);
          for (const child of node.children ?? []) if (nodes.has(child.id)) reparent(child, world);
          for (const { node: child } of walkNodes(node.children ?? [])) {
            const info = nodes.get(child.id);
            const own = entry.result.shapes.filter((shape) => shape.node === child.id);
            if (info && own.length) info.box = boundsOf({ viewBox: entry.result.viewBox, shapes: own }, world);
          }
          results.set(node.id, entry.result);
          nodes.set(node.id, { id: node.id, kind: node.kind, bounds: ref, refs: entry.refs, matrix: world, box: boundsOf(entry.result, world) });
          if (node.visible === false) return [];
          return withMask(node, withFilters(node, withBlend(withOpacity(adoptInner(node, entry.result, placed.shapes.map((s) => ({ ...s, node: s.node ?? node.id }))), node.opacity), node.blend)));
        }
        // Group: the children at their places; then the group's stack on all of them; then its placement.
        // They are painted bottom up (the first in the list, in front); for Step, Color…
        // each child is an element numbered in list order (keeping its copies).
        const childShapes: Shape[] = [];
        for (let i = node.children.length - 1; i >= 0; i--) {
          const out = evalNode(node.children[i]!, IDENTITY);
          childShapes.push(...out.map((s) => ({ ...s, clone: i * 10000 + (s.clone ?? 0) })));
        }
        const inner: Geometry = { viewBox: [0, 0, 0, 0], shapes: childShapes };
        const frame = node.composition?.scene.document;
        const ref = frame ? { x: (frame.x ?? 0) - frame.width / 2, y: (frame.y ?? 0) - frame.height / 2, width: frame.width, height: frame.height } : bounds(inner);
        let refs: StackRefs = {};
        let result = inner;
        if (stack.length) {
          // What its stack produced holds while its children (shape and style) and its stack don't change, and
          // it doesn't look at other objects (that is always redone): a Metaball isn't repeated in every pass of a frame.
          const gkey = JSON.stringify([resolution, stack]) + '|' + hashGeo(inner) + '|' + JSON.stringify(childShapes.map((s) => [s.style, s.clone, s.node, s.wrap, s.gradients]));
          const hit = groupCache.get(node.id);
          if (hit && hit.key === gkey) {
            result = hit.result;
            refs = hit.refs;
          } else {
            const before = asked;
            asked = false;
            result = runStack(inner, stack, ref, resolution, lookupFor(node.id), undefined, refs);
            if (!asked) groupCache.set(node.id, { key: gkey, result, refs });
            else groupCache.delete(node.id);
            asked = asked || before;
          }
        }
        const c = centerOf(ref);
        // Grouping moves nothing: the group's centre stays where it is.
        const m = placementMatrix(p, ref, c);
        const world = multiply(parentMatrix, m);
        // The children are already in group coordinates: their real matrix is the group's times theirs.
        for (const child of node.children) if (nodes.has(child.id)) reparent(child, world);
        results.set(node.id, result);
        nodes.set(node.id, { id: node.id, kind: 'group', bounds: ref, refs, matrix: world, box: node.composition && !result.shapes.length ? (() => {
          const pts = [[ref.x, ref.y], [ref.x + ref.width, ref.y], [ref.x, ref.y + ref.height], [ref.x + ref.width, ref.y + ref.height]].map(([x, y]) => apply(world, [x!, y!]));
          const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
          return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        })() : boundsOf(result, world) });
        if (node.visible === false) return [];
        return withMask(node, withFilters(node, withBlend(withOpacity(adoptInner(node, result, transformGeo(result, m).shapes.map((s) => node.composition ? { ...s, node: node.id } : s.node ? s : { ...s, node: node.id })), node.opacity), node.blend)));
      };

      // A child inside a group was evaluated with the identity: here the group's matrix is composed in.
      const reparent = (node: SceneNode, groupWorld: Mat) => {
        const info = nodes.get(node.id)!;
        info.matrix = multiply(groupWorld, info.matrix);
        info.box = transformBox(info.box, groupWorld);
        for (const c of node.children ?? []) reparent(c, groupWorld);
      };

      // The first in the list is painted last: it ends up in front.
      shapes = [...scene.objects].reverse().flatMap((n) => evalNode(n, IDENTITY));
      // An Effector measures on its first target (its handles go there); it has no box of its own to drag.
      for (const n of byId.values()) {
        if (n.kind !== 'effector') continue;
        const first = n.targets.map((id) => nodes.get(id)).find(Boolean);
        nodes.set(n.id, first ? { ...first, id: n.id, kind: 'effector', box: { x: 0, y: 0, width: 0, height: 0 } } : { id: n.id, kind: 'effector', bounds: { x: 0, y: 0, width: 0, height: 0 }, matrix: IDENTITY, box: { x: 0, y: 0, width: 0, height: 0 } });
        results.set(n.id, { viewBox: [0, 0, 0, 0], shapes: [] });
      }
      finalResults = results;
      // Nobody asked for another object: no need for another pass.
      if (!asked) {
        last = new Map();
        break;
      }
      known = new Map([...nodes].map(([id, info]) => [id, { world: info.matrix, geo: transformGeo(results.get(id)!, info.matrix) }]));
      prints = new Map();
      last = known;
      // If what came out now would look the same as what was seen, done: another pass would give the same.
      if (seenDeps.every((d) => depOf(d.owner, d.id) === d.h)) break;
    }

    // La historia de las estelas: el centro de cada objeto observado, en este fotograma.
    if (scene.at !== undefined) {
      for (const id of traced) {
        const g = finalResults.get(id);
        const info = nodes.get(id);
        if (!g || !info) continue;
        const c = centroid(g, info.matrix);
        if (!c) continue;
        const arr = history.get(id) ?? [];
        const last = arr[arr.length - 1];
        if (!last || Math.abs(unwrappedAt - last.t) > 1e-9) arr.push({ t: unwrappedAt, p: c });
        // Solo hace falta la ventana reciente; lo viejo se va.
        while (arr.length > 1 && arr[0]!.t < unwrappedAt - 30) arr.shift();
        if (arr.length > 4000) arr.shift();
        history.set(id, arr);
      }
    }

    // The source of each object, with its final matrix (its groups' included).
    const placedSources: Shape[] = [];
    for (const { node } of walkNodes(scene.objects)) {
      if (node.kind === 'group' || node.kind === 'effector' || node.visible === false) continue;
      const entry = cache.get(node.id);
      const info = nodes.get(node.id);
      if (entry && info) placedSources.push(...transformGeo(entry.source, info.matrix).shapes.map((s) => ({ ...s, node: node.id })));
    }
    for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);
    for (const id of [...groupCache.keys()]) if (!seen.has(id)) groupCache.delete(id);
    for (const map of [sources, memos]) for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id);

    // The area of each filter: the object's box in the document, plus how far the filter reaches.
    let filters: Record<string, FilterDef> | undefined;
    for (const [id, f] of fx) {
      const info = nodes.get(id);
      if (!info) continue;
      const b = info.box;
      const region: [number, number, number, number] = [b.x - f.pad, b.y - f.pad, b.width + 2 * f.pad, b.height + 2 * f.pad];
      // Where the object is (its reference box with its matrix): zoned filters follow the object.
      const m = info.matrix, r = info.refs?.[''] ?? info.bounds;
      const scale = Math.hypot(m[0], m[1]);
      const place = {
        point: (fx: number, fy: number) => apply(m, [r.x + fx * r.width, r.y + fy * r.height]),
        size: Math.max(r.width, r.height) * scale,
        rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
        region,
      };
      (filters ??= {})[id] = { markup: f.markup(id, place), region };
    }
    // Inner ones: their area, that of the shapes that carry them (already in the document) plus their reach;
    // their place, the box of that part (in the node) with the node's matrix.
    for (const [id, f] of innerFx) {
      const info = nodes.get(f.node);
      const mine = shapes.filter((s) => s.wrap?.includes(id));
      if (!info || !mine.length) continue;
      const b = bounds({ viewBox: [0, 0, 0, 0], shapes: mine });
      const region: [number, number, number, number] = [b.x - f.chain.pad, b.y - f.chain.pad, b.width + 2 * f.chain.pad, b.height + 2 * f.chain.pad];
      const m = info.matrix, r = f.ref;
      const place = {
        point: (fx: number, fy: number) => apply(m, [r.x + fx * r.width, r.y + fy * r.height]),
        size: Math.max(r.width, r.height) * Math.hypot(m[0], m[1]),
        rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
        region,
      };
      (filters ??= {})[id] = { markup: f.chain.markup(id, place), region };
    }
    // What everything takes up, counting how far filters reach (a long shadow isn't clipped).
    const all = union([bounds({ viewBox: [0, 0, 0, 0], shapes }), ...Object.values(filters ?? {}).map(({ region: [x, y, width, height] }) => ({ x, y, width, height }))]);
    let viewBox: [number, number, number, number];
    if (scene.document) {
      const { width: w, height: h, x = 0, y = 0 } = scene.document;
      viewBox = [x - w / 2, y - h / 2, w, h];
    } else {
      const m = Math.max(all.width, all.height) * 0.05 || 1;
      viewBox = [all.x - m, all.y - m, all.width + 2 * m, all.height + 2 * m].map((n) => Math.round(n * 100) / 100) as [number, number, number, number];
    }
    const geometryOf = (id: string) => {
      const g = finalResults.get(id);
      const info = nodes.get(id);
      return g && info ? transformGeo(g, info.matrix) : null;
    };
    // Masks: the other object already placed (even if hidden), in the document. A generous area.
    for (const [id, m] of masked) {
      const content = geometryOf(m.source);
      if (!content?.shapes.length) continue;
      const [vx, vy, vw, vh] = viewBox;
      const cb = bounds(content);
      const all = union([{ x: vx, y: vy, width: vw, height: vh }, cb]);
      const region: [number, number, number, number] = [all.x - all.width, all.y - all.height, all.width * 3, all.height * 3];
      const d = (s: Shape) => toPathData(s, 2);
      let markup: string;
      if (m.mode === 'luminance') {
        // With its colours (and its gradients).
        const defs = gradientDefs(content);
        markup = (defs ? `<defs>${defs}</defs>` : '') + content.shapes.map((s) => `<path d="${d(s)}"${styleAttrs(withoutCss(s.style))}/>`).join('');
      } else {
        // Its shape: what shows, in white (or, inverted, everything white and the shape in black).
        const ink = m.invert ? '#000' : '#fff';
        const paint = (s: Shape) => {
          const st = s.style;
          const fill = st.fill !== 'none' && s.subpaths.some((sp) => sp.closed) ? ink : 'none';
          const stroke = st.stroke && st.stroke !== 'none' ? ` stroke="${ink}" stroke-width="${st['stroke-width'] ?? 1}" stroke-linecap="${st['stroke-linecap'] ?? 'butt'}" stroke-linejoin="${st['stroke-linejoin'] ?? 'miter'}"` : '';
          return `<path d="${d(s)}" fill="${fill}"${st['fill-rule'] ? ` fill-rule="${st['fill-rule']}"` : ''}${stroke}/>`;
        };
        const [rx, ry, rw, rh] = region;
        markup = (m.invert ? `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="#fff"/>` : '') + content.shapes.map(paint).join('');
      }
      (filters ??= {})[id] = { markup, region, kind: 'mask' };
    }
    return { geometry: { viewBox, shapes, ...(filters ? { filters } : {}) }, sources: { viewBox, shapes: placedSources }, nodes, geometryOf };
  }

  return { evaluate };
}

/**
 * The stack each (visible) Effector adds to each of its targets. With `delay` and the scene at a time
 * (`at`), target n gets its effects with the Effector's tracks read n × delay earlier.
 */
export function effectorStacks(scene: SceneV1, byId: Map<string, SceneNode>): Map<string, ModifierInstance[]> {
  const out = new Map<string, ModifierInstance[]>();
  for (const n of byId.values()) {
    if (n.kind !== 'effector' || n.visible === false || !(n.stack?.length)) continue;
    const tracks = (scene.animation?.tracks ?? []).filter((tr) => tr.node === n.id && tr.on === 'modifier');
    const delay = n.delay ?? 0;
    let i = 0;
    for (const id of n.targets ?? []) {
      const t = byId.get(id);
      if (!t || t.kind === 'effector' || id === n.id) continue;
      let stack = n.stack ?? [];
      if (delay > 0 && i > 0 && tracks.length && scene.at !== undefined) {
        stack = structuredClone(stack);
        const at = Math.max(0, scene.at - i * delay);
        for (const tr of tracks) {
          const m = tr.modifier ? findModifier(stack, tr.modifier) : null;
          const v = trackValue(tr, at);
          if (!m || v === undefined) continue;
          if (tr.param === 'enabled') m.enabled = !!v;
          else m.params = { ...m.params, [tr.param]: v };
        }
      }
      out.set(id, [...(out.get(id) ?? []), ...stack]);
      i++;
    }
  }
  return out;
}

/**
 * The scene reduced to what is needed to draw node `id`: the top-level nodes that contain it and
 * everything they use (other objects in their effects, an instance's original, the Effectors that
 * touch them…), again and again. For trails: no need to compute the rest at each past time.
 * What an effect uses is recognised by its parameter strings that are node ids.
 */
export function onlyFor(scene: SceneV1, id: string): SceneV1 {
  const byId = new Map<string, SceneNode>();
  const rootOf = new Map<string, SceneNode>();
  for (const top of scene.objects) for (const { node } of walkNodes([top])) (byId.set(node.id, node), rootOf.set(node.id, top));
  const effectorsOf = new Map<string, SceneNode[]>();
  for (const n of byId.values()) if (n.kind === 'effector') for (const t of n.targets ?? []) effectorsOf.set(t, [...(effectorsOf.get(t) ?? []), n]);
  const roots = new Set<SceneNode>();
  const seen = new Set<string>();
  const todo = [id];
  const refs = (list: ModifierInstance[], out: string[]) => {
    for (const m of list) {
      for (const v of Object.values(m.params ?? {})) {
        for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string' && byId.has(id)) out.push(id);
      }
      refs(m.children ?? [], out);
    }
  };
  while (todo.length) {
    const cur = todo.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const root = rootOf.get(cur);
    if (!root) continue;
    roots.add(root);
    // Everything under its top-level node (it is part of the same computation).
    for (const { node } of walkNodes([root])) {
      const out: string[] = [];
      refs(node.stack ?? [], out);
      if (node.kind === 'instance') out.push(node.of);
      if (node.kind === 'effector') out.push(...(node.targets ?? []));
      for (const e of effectorsOf.get(node.id) ?? []) out.push(e.id);
      for (const x of out) if (!seen.has(x)) todo.push(x);
      if (!seen.has(node.id)) seen.add(node.id);
    }
  }
  return { ...scene, objects: scene.objects.filter((n) => roots.has(n)) };
}

/**
 * Instances that would depend on themselves: on their own group (or something containing it), on another
 * instance that ends up in them… Following `of` and group children leads back to them.
 */
export function brokenInstances(byId: Map<string, SceneNode>): Set<string> {
  const bad = new Set<string>();
  for (const n of byId.values()) {
    if (n.kind !== 'instance') continue;
    const todo = [n.of];
    const visited = new Set<string>();
    while (todo.length) {
      const id = todo.pop()!;
      if (id === n.id) {
        bad.add(n.id);
        break;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      const t = byId.get(id);
      if (t?.kind === 'instance') todo.push(t.of);
      else if (t?.children?.length) for (const c of t.children) todo.push(c.id);
    }
  }
  return bad;
}

/** The style without what is CSS-only in SVG (a blend inside a mask does nothing). */
const withoutCss = (st: Record<string, string>) => {
  const { 'mix-blend-mode': _b, isolation: _i, ...rest } = st;
  return rest;
};

/** Box of a transformed box (its four corners). */
function transformBox(b: Bounds, m: Mat): Bounds {
  const pts: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export { union as unionBounds };

/** Numeric fingerprint of a geometry (its points, rounded): to know whether it changed. */
function hashGeo(geo: Geometry): number {
  let h = 2166136261;
  const add = (v: number) => {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  for (const s of geo.shapes) {
    add(s.subpaths.length);
    if (s.impulse) { add(s.impulse.velocity[0]); add(s.impulse.velocity[1]); add(s.impulse.spin); }
    for (const sp of s.subpaths) {
      add(sp.start[0]);
      add(sp.start[1]);
      add(sp.closed ? 1 : 0);
      for (const g of sp.segs) {
        add(g.c1[0]); add(g.c1[1]); add(g.c2[0]); add(g.c2[1]); add(g.p[0]); add(g.p[1]);
      }
    }
  }
  return h >>> 0;
}

/** The geometry's fingerprint, together with the matrix of whoever looks at it. */
function mix(h: number, m: Mat): number {
  for (const v of m) {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Cuánto tiempo (en segundos) abarcan las estelas de la escena: la ventana que hay que recorrer
 * antes de dibujarlas. La estela se traza con lo que el motor ya ha visto, así que para una imagen
 * fija hay que reproducir ese trozo antes (si no, la estela saldría vacía).
 */
export function sceneTrailWindow(scene: SceneV1): number {
  let max = 0;
  const walk = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      const stacks = (m: { type: string; params?: Record<string, unknown>; children?: unknown[] }) => {
        if (m.type === 'trace') max = Math.max(max, Number(m.params?.length ?? 0));
        for (const c of m.children ?? []) stacks(c as { type: string; params?: Record<string, unknown>; children?: unknown[] });
      };
      for (const m of node.stack ?? []) stacks(m);
      if (node.children?.length) walk(node.children);
      if (node.kind === 'group' && node.composition) walk(node.composition.scene.objects);
    }
  };
  walk(scene.objects);
  return max;
}

/** The fonts used by the scene's texts (also those inside a pack). */
export function sceneFonts(scene: SceneV1) {
  const params: Record<string, unknown>[] = [];
  const visit = (nodes: SceneNode[]) => {
    for (const { node } of walkNodes(nodes)) {
      if (node.kind === 'shape' && node.shape === 'text') params.push(node.params);
      if (node.kind === 'object' && node.packed?.original) visit([node.packed.original]);
      if (node.kind === 'group' && node.composition) visit(node.composition.scene.objects);
    }
  };
  visit(scene.objects);
  return fontsOf(params);
}

/** Downloads from Fontsource the fonts the scene uses that aren't registered yet. */
export async function loadFonts(scene: SceneV1): Promise<void> {
  await Promise.all(sceneFonts(scene).filter((f) => !hasFont(f.key)).map((f) => loadFont(f.family, f.weight, f.italic)));
}
