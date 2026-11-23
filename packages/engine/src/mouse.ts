import { insideMouseTarget } from './mouse-target';
import type { DocumentResult } from './document';
import { seedMouseColors } from './mouse-color-seeds';
import { evaluateSceneExpressions } from './expression';
import { onlyFor, walkNodes } from './document';
import { resolveParams, type ParamSchema } from './modifier';
import type { GroupNode, InstanceNode, SceneNode, ScenePointer, SceneV1 } from './scene';

export const mouseParams = {
  target: { type: 'node', default: '', label: 'Target', animatable: false },
  event: { type: 'enum', default: 'click', options: ['click', 'double-click', 'right-click', 'middle-click', 'move', 'wheel-up', 'wheel-down'], label: 'Event' },
  button: { type: 'enum', default: 'any', options: ['any', 'left', 'right', 'middle'], label: 'While pressed', showIf: { event: ['move'] } },
  rate: { type: 'number', default: 20, min: 0.1, max: 120, step: 1, label: 'Rate', unit: '/s' },
  distance: { type: 'number', default: 0, min: 0, max: 1000, step: 1, label: 'Min distance', unit: 'px', showIf: { event: ['move'] } },
  count: { type: 'number', default: 1, min: 1, max: 50, step: 1, label: 'Copies / event' },
  lifetime: { type: 'number', default: 3, min: 0, max: 120, step: 0.1, label: 'Life (0 = keep)', unit: 's' },
  limit: { type: 'number', default: 100, min: 1, max: 500, step: 1, label: 'Max copies' },
  offset: { type: 'point', default: [0, 0], label: 'Offset' },
  scale: { type: 'number', default: 1, min: 0.01, max: 10, step: 0.01, label: 'Scale' },
  rotation: { type: 'number', default: 0, min: -360, max: 360, step: 1, label: 'Rotation', unit: '°' },
  scatter: { type: 'number', default: 0, min: 0, max: 1000, step: 1, label: 'Position variation', unit: 'px' },
  scaleVariation: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Scale variation' },
  rotationVariation: { type: 'number', default: 0, min: 0, max: 180, step: 1, label: 'Rotation variation', unit: '°' },
} satisfies ParamSchema;

export type MouseEventKind = 'click' | 'double-click' | 'right-click' | 'middle-click' | 'move' | 'wheel-up' | 'wheel-down';

/**
 * The nodes a source needs to be drawn: what its effects refer to (parameter strings that are node ids), an
 * instance's original and the Effectors on it, again and again from each of those.
 */
function dependenciesOf(scene: SceneV1, source: SceneNode): Set<string> {
  const byId = new Map([...walkNodes(scene.objects)].map(({ node }) => [node.id, node]));
  const effectorsOf = new Map<string, string[]>();
  for (const n of byId.values()) if (n.kind === 'effector') for (const t of n.targets ?? []) effectorsOf.set(t, [...(effectorsOf.get(t) ?? []), n.id]);
  const needed = new Set<string>();
  const todo: SceneNode[] = [source];
  const refs = (stack: SceneNode['stack'], out: string[]) => {
    for (const m of stack ?? []) {
      for (const v of Object.values(m.params ?? {})) for (const id of Array.isArray(v) ? v : [v]) if (typeof id === 'string' && byId.has(id)) out.push(id);
      refs(m.children ?? [], out);
    }
  };
  while (todo.length) {
    for (const { node } of walkNodes([todo.pop()!])) {
      const out: string[] = [];
      refs(node.stack, out);
      if (node.kind === 'instance') out.push(node.of);
      out.push(...(effectorsOf.get(node.id) ?? []));
      for (const id of out) if (!needed.has(id) && byId.has(id)) { needed.add(id); todo.push(byId.get(id)!); }
    }
  }
  return needed;
}

/** Pure runtime state: input never changes the saved scene. Times are monotonic seconds. */
export function createMouseInstances(scene: SceneV1, random = Math.random) {
  const generators: InstanceNode[] = [];
  const collect = (nodes: SceneNode[]) => {
    for (const node of nodes) {
      if (node.visible === false) continue;
      if (node.kind === 'instance' && node.mouse) generators.push(node);
      if (node.children) collect(node.children);
    }
  };
  collect(scene.objects);
  // A generator inside a layer draws its copies in that layer (at its front), not over every layer.
  const layerOf = new Map<string, string>();
  for (const root of scene.objects) {
    if (root.kind !== 'group' || !root.layer) continue;
    for (const { node } of walkNodes(root.children)) if (node.kind === 'instance' && node.mouse) layerOf.set(node.id, root.id);
  }
  const byId = new Map([...walkNodes(scene.objects)].map(({ node }) => [node.id, node]));
  // A generator inside an ordinary group (not a layer) places its copies in that group, where the group's
  // effects (Physics…) treat them as its own children. Those copies run on scene time and exist from birth.
  const groupOf = new Map<string, string>();
  for (const { node, parent } of walkNodes(scene.objects)) if (node.kind === 'instance' && node.mouse && parent?.kind === 'group' && !parent.layer && !parent.composition) groupOf.set(node.id, parent.id);
  const state = new Map<string, { last: number; point: [number, number]; copies: { born: number; since: number; node: GroupNode; life: number }[] }>();
  const occupied = new Set(byId.keys());
  const occupyStack = (stack: SceneNode['stack']) => { for (const m of stack) { occupied.add(m.id); occupyStack(m.children ?? []); } };
  for (const n of byId.values()) occupyStack(n.stack);
  const unique = (base: string) => { let id = base; while (occupied.has(id)) id = '@' + id; return id; };
  let serial = 0;
  let emission = 0;
  const templates = new Map<string, SceneV1>();
  function template(g: InstanceNode): SceneV1 | null {
    if (templates.has(g.id)) return templates.get(g.id)!;
    const source = byId.get(g.of);
    if (!source || source.kind === 'effector' || (source.kind === 'instance' && source.mouse) || source.id === g.id) return null;
    const local = structuredClone(onlyFor(scene, source.id));
    // Dependencies remain available, but only the chosen source is drawn. Its own placement/animation
    // are retained relative to its initial position; parent placement does not affect the cursor.
    const copy = [...walkNodes(local.objects)].find(({ node }) => node.id === source.id)!.node;
    for (const n of local.objects) n.visible = n.kind === 'effector' ? n.visible : false;
    copy.visible = true;
    // Keep ancestors hidden as dependencies and draw a detached copy instead.
    const detach = (nodes: SceneNode[]): SceneNode[] => nodes.filter(n => n.id !== copy.id).map(n => ({ ...n, ...(n.children ? { children: detach(n.children) } : {}) }));
    // Of the rest, only what the source uses (and the groups on the way to it, without their effects). A
    // source inside a Physics group would otherwise carry that whole world, simulated again in every copy.
    const needed = dependenciesOf(local, copy);
    const prune = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap((n): SceneNode[] => {
      if (needed.has(n.id) || n.kind === 'effector') return [n];
      const children = n.children ? prune(n.children) : [];
      return children.length ? [{ ...n, stack: [], children } as SceneNode] : [];
    });
    local.objects = [{ kind: 'group', id: unique(`@mouse-origin-${g.id}`), name: 'Origin', stack: [], transform: { x: -(source.transform?.x ?? 0), y: -(source.transform?.y ?? 0) }, children: [copy] }, ...prune(detach(local.objects))];
    // A known origin aligns each source result with its generated placement.
    local.document = { width: local.document?.width ?? 1, height: local.document?.height ?? 1, x: 0, y: 0 };
    local.interactions = [];
    templates.set(g.id, local);
    return local;
  }
  const paramsAt = (g: InstanceNode, sceneTime: number, birthIndex: number, pointer?: Partial<ScenePointer>) => {
    const evaluated = evaluateSceneExpressions({
      version: 1, custom: scene.custom, seedGenerator: scene.seedGenerator, document: scene.document, pointer,
      animation: scene.animation ? { ...scene.animation, tracks: [], markers: undefined } : undefined, at: sceneTime,
      objects: [{ ...g, stack: [], children: undefined }],
    }, { randomSalt: birthIndex }).objects[0] as InstanceNode;
    const safe = { ...evaluated.mouse };
    for (const [key, spec] of Object.entries(mouseParams)) {
      if (spec.type === 'number' && (typeof safe[key] !== 'number' || !Number.isFinite(safe[key]))) safe[key] = spec.default;
    }
    const offset = Array.isArray(safe.offset) ? safe.offset : [0, 0];
    safe.offset = [0, 1].map(i => typeof offset[i] === 'number' && Number.isFinite(offset[i]) ? offset[i] : 0);
    const p = resolveParams(mouseParams, safe);
    p.distance = Math.max(0, p.distance);
    p.scatter = Math.max(0, p.scatter);
    p.scaleVariation = Math.max(0, Math.min(1, p.scaleVariation));
    p.rotationVariation = Math.max(0, p.rotationVariation);
    return p;
  };
  return {
    event(kind: MouseEventKind, point: [number, number], now: number, buttons = 0, sceneTime = now, doc?: DocumentResult | null, pointer?: Partial<ScenePointer>) {
      if (!point.every(Number.isFinite) || !Number.isFinite(now)) return false;
      let handled = false;
      for (const g of generators) {
        const p = paramsAt(g, sceneTime, serial + 1, pointer);
        if (p.event !== kind) continue;
        if (kind === 'move' && p.button !== 'any' && !(buttons & ({ left: 1, right: 2, middle: 4 }[p.button] ?? 0))) continue;
        if (p.target && !insideMouseTarget(doc, p.target, point)) continue;
        const local = template(g);
        if (!local) continue;
        handled = true;
        let st = state.get(g.id);
        if (!st) { st = { last: -Infinity, point, copies: [] }; state.set(g.id, st); }
        if (now - st.last < 1 / Math.max(0.1, Math.min(120, p.rate))) continue;
        if (kind === 'move' && Number.isFinite(st.last) && Math.hypot(point[0] - st.point[0], point[1] - st.point[1]) < p.distance) continue;
        st.last = now; st.point = point;
        const eventSalt = ++emission;
        const vary = (v: number) => (random() * 2 - 1) * v;
        for (let i = 0; i < Math.min(50, Math.max(1, Math.floor(p.count))); i++) {
          const id = unique(`@mouse-${g.id}-${++serial}`);
          const birth = i === 0 ? p : paramsAt(g, sceneTime, serial, pointer);
          const node: GroupNode = {
            kind: 'group', id, name: g.name, children: [], stack: [], elementIndex: serial, eventIndex: eventSalt,
            transform: { x: point[0] + birth.offset[0]! + vary(birth.scatter), y: point[1] + birth.offset[1]! + vary(birth.scatter), scale: Math.max(0.01, birth.scale * (1 + vary(birth.scaleVariation))), rotation: birth.rotation + vary(birth.rotationVariation) },
            composition: { scene: local, randomSalt: serial, eventSalt, params: { time: 0, loop: 'hold' } },
          };
          st.copies.unshift({ born: now, since: sceneTime, life: Math.max(0, birth.lifetime), node });
        }
        st.copies.length = Math.min(st.copies.length, Math.max(1, Math.min(500, Math.floor(p.limit))));
      }
      return handled;
    },
    apply(frame: SceneV1, now: number): SceneV1 {
      if (!generators.length) return frame;
      const current = new Map([...walkNodes(frame.objects)].map(({ node }) => [node.id, node]));
      const collectors: GroupNode[] = generators.map(g => {
        const st = state.get(g.id);
        const inGroup = groupOf.has(g.id);
        const at = frame.at;
        if (st) st.copies = st.copies.filter(c => (!c.life || now - c.born < c.life)
          // In a group, scene time rules: going back before a birth (a loop, a seek) removes that copy for good.
          && !(inGroup && at !== undefined && c.since > at + 1e-6));
        const candidate = current.get(g.id);
        const node = candidate?.kind === 'instance' ? candidate : g;
        const evaluated = evaluateSceneExpressions({ ...frame, objects: [{ ...node, children: undefined }] }).objects[0]!;
        return {
          kind: 'group', id: g.id, name: g.name,
          stack: seedMouseColors(evaluated.stack, 0, frame.seedGenerator),
          visible: node.visible, opacity: node.opacity, blend: node.blend,
          children: (st?.copies ?? []).map(c => inGroup
            ? { ...c.node, since: c.since, composition: { ...c.node.composition!, params: { time: { $expr: `max(0, scene.time - ${c.since})`, fallback: 0 }, loop: 'hold' } } }
            : { ...c.node, composition: { ...c.node.composition!, params: { time: Math.max(0, now - c.born), loop: 'hold' } } }),
        };
      });
      const ids = new Set(generators.map(g => g.id));
      const placed = new Map(collectors.filter(c => groupOf.has(c.id)).map(c => [c.id, c]));
      // Generators in a group are replaced in place by their collector; the others are lifted out.
      const strip = (nodes: SceneNode[]): SceneNode[] => nodes.flatMap(n => placed.has(n.id) ? [placed.get(n.id)!] : ids.has(n.id) ? [] : [n.children?.length ? { ...n, children: strip(n.children) } : n]);
      const inLayer = new Map<string, GroupNode[]>();
      const atRoot: GroupNode[] = [];
      for (const c of collectors) {
        if (placed.has(c.id)) continue;
        const layer = layerOf.get(c.id);
        if (layer) inLayer.set(layer, [...(inLayer.get(layer) ?? []), c]);
        else atRoot.push(c);
      }
      const objects = strip(frame.objects).map((n) => {
        const own = inLayer.get(n.id);
        return own && n.kind === 'group' ? { ...n, children: [...own, ...n.children] } : n;
      });
      return { ...frame, objects: [...atRoot, ...objects] };
    },
    active: () => [...state.values()].some(s => s.copies.length > 0),
    enabled: generators.length > 0,
    clear() { state.clear(); },
  };
}
