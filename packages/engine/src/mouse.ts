import { evaluateSceneExpressions } from './expression';
import { onlyFor, walkNodes } from './document';
import { resolveParams, type ParamSchema } from './modifier';
import type { GroupNode, InstanceNode, SceneNode, SceneV1 } from './scene';

export const mouseParams = {
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
  const byId = new Map([...walkNodes(scene.objects)].map(({ node }) => [node.id, node]));
  const state = new Map<string, { last: number; point: [number, number]; copies: { born: number; node: GroupNode; life: number }[] }>();
  const occupied = new Set(byId.keys());
  const occupyStack = (stack: SceneNode['stack']) => { for (const m of stack) { occupied.add(m.id); occupyStack(m.children ?? []); } };
  for (const n of byId.values()) occupyStack(n.stack);
  const unique = (base: string) => { let id = base; while (occupied.has(id)) id = '@' + id; return id; };
  let serial = 0;
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
    local.objects = [{ kind: 'group', id: unique(`@mouse-origin-${g.id}`), name: 'Origin', stack: [], transform: { x: -(source.transform?.x ?? 0), y: -(source.transform?.y ?? 0) }, children: [copy] }, ...detach(local.objects)];
    local.interactions = [];
    templates.set(g.id, local);
    return local;
  }
  const paramsAt = (g: InstanceNode, sceneTime: number, birthIndex: number) => {
    const evaluated = evaluateSceneExpressions({
      version: 1, custom: scene.custom, seedGenerator: scene.seedGenerator,
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
    event(kind: MouseEventKind, point: [number, number], now: number, buttons = 0, sceneTime = now) {
      if (!point.every(Number.isFinite) || !Number.isFinite(now)) return false;
      let handled = false;
      for (const g of generators) {
        const p = paramsAt(g, sceneTime, serial + 1);
        if (p.event !== kind) continue;
        if (kind === 'move' && p.button !== 'any' && !(buttons & ({ left: 1, right: 2, middle: 4 }[p.button] ?? 0))) continue;
        const local = template(g);
        if (!local) continue;
        handled = true;
        let st = state.get(g.id);
        if (!st) { st = { last: -Infinity, point, copies: [] }; state.set(g.id, st); }
        if (now - st.last < 1 / Math.max(0.1, Math.min(120, p.rate))) continue;
        if (kind === 'move' && Number.isFinite(st.last) && Math.hypot(point[0] - st.point[0], point[1] - st.point[1]) < p.distance) continue;
        st.last = now; st.point = point;
        const vary = (v: number) => (random() * 2 - 1) * v;
        for (let i = 0; i < Math.min(50, Math.max(1, Math.floor(p.count))); i++) {
          const id = unique(`@mouse-${g.id}-${++serial}`);
          const birth = i === 0 ? p : paramsAt(g, sceneTime, serial);
          const copyStack = (items: SceneNode['stack']): SceneNode['stack'] => items.map(m => ({ ...m, id: `${id}::${m.id}`, ...(m.children ? { children: copyStack(m.children) } : {}) }));
          st.copies.unshift({ born: now, life: Math.max(0, birth.lifetime), node: {
            kind: 'group', id, name: g.name, children: [], stack: copyStack(g.stack),
            opacity: g.opacity, blend: g.blend,
            transform: { x: point[0] + birth.offset[0]! + vary(birth.scatter), y: point[1] + birth.offset[1]! + vary(birth.scatter), scale: Math.max(0.01, birth.scale * (1 + vary(birth.scaleVariation))), rotation: birth.rotation + vary(birth.rotationVariation) },
            composition: { scene: local, params: { time: 0, loop: 'hold' } },
          } });
        }
        st.copies.length = Math.min(st.copies.length, Math.max(1, Math.min(500, Math.floor(p.limit))));
      }
      return handled;
    },
    apply(frame: SceneV1, now: number): SceneV1 {
      const copies: SceneNode[] = [];
      for (const st of state.values()) {
        st.copies = st.copies.filter(c => !c.life || now - c.born < c.life);
        for (const c of st.copies) copies.push({ ...c.node, composition: { ...c.node.composition!, params: { time: Math.max(0, now - c.born), loop: 'hold' } } });
      }
      return copies.length ? { ...frame, objects: [...copies, ...frame.objects] } : frame;
    },
    active: () => [...state.values()].some(s => s.copies.length > 0),
    enabled: generators.length > 0,
    clear() { state.clear(); },
  };
}
