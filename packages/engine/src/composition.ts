import { signalSchemas } from './modifiers/signal-schemas';
import { waveform, wiggleSignal, pulseSignal, shakeSignal } from './modifiers/time-signal';
import { sampleScene } from './animation';
import { evaluateSceneExpressions } from './expression';
import { effectorStacks, walkNodes } from './document';
import { resolveParams, type ModifierDef, type ParamSchema } from './modifier';
import { sceneDuration, type ClockModulation, type SceneNode, type SceneV1 } from './scene';

export const compositionParams = {
  time: { type: 'number', default: 0, step: 0.01, unit: 's', label: 'Time', random: false },
  start: { type: 'number', default: 0, step: 0.01, unit: 's', label: 'Start', random: false },
  speed: { type: 'number', default: 1, min: -4, max: 4, step: 0.05, label: 'Speed', random: false },
  offset: { type: 'number', default: 0, step: 0.01, unit: 's', label: 'Offset', random: false },
  frameRate: { type: 'number', default: 0, min: 0, max: 60, step: 1, label: 'Playback FPS', random: false },
  reverse: { type: 'boolean', default: false, label: 'Reverse', animatable: false },
  loop: { type: 'enum', default: 'hold', options: ['hold', 'loop', 'pingpong'], label: 'Playback', animatable: false },
} satisfies ParamSchema;

export function compositionTime(parentTime: number, duration: number, given: Record<string, unknown> = {}, modulation?: ClockModulation): number {
  const p = resolveParams(compositionParams, given);
  const clock = given.time === undefined ? parentTime : p.time;
  let raw = Math.max(0, clock - p.start) * p.speed + p.offset;
  if (modulation && modulation.enabled !== false) {
    const m = resolveParams(signalSchemas[modulation.type], modulation.params) as Record<string, any>;
    const time = modulation.params?.time === undefined ? parentTime : m.time;
    const cycles = time * m.frequency + (m.phase ?? 0) / 360;
    const signal = modulation.type === 'oscillate' ? waveform(cycles, m.wave)
      : modulation.type === 'wiggle' ? wiggleSignal(cycles, m.seed, 0)
      : modulation.type === 'pulse' ? pulseSignal(cycles, m.attack, m.decay)
      : shakeSignal(time - m.start, m.duration, m.frequency, m.decay, m.seed, 0);
    raw += (m.offset ?? 0) + m.amplitude * signal;
  }
  const d = Math.max(0, duration);
  if (!d) return 0;
  let t = Math.max(0, Math.min(d, raw));
  if (p.loop === 'loop') t = ((raw % d) + d) % d;
  if (p.loop === 'pingpong') { const cycle = ((raw % (2 * d)) + 2 * d) % (2 * d); t = cycle <= d ? cycle : 2 * d - cycle; }
  const local = p.reverse ? d - t : t;
  return p.frameRate > 0 && local < d ? Math.floor((local + 1e-9) * p.frameRate) / p.frameRate : local;
}

/** Materialize each scene at its own clock, then namespace it before passing it to the document evaluator. */
export function expandCompositions(scene: SceneV1, registry: Map<string, ModifierDef<any>>, depth = 0, ancestors = new Set<SceneV1>()): SceneV1 {
  if (depth > 32 || ancestors.has(scene)) throw new Error('Composition nesting is cyclic or exceeds 32 levels');
  const chain = new Set(ancestors); chain.add(scene);
  const occupied = new Set<string>();
  const collect = (stack: SceneNode['stack']) => { for (const m of stack) { occupied.add(m.id); collect(m.children ?? []); } };
  for (const { node } of walkNodes(scene.objects)) { occupied.add(node.id); collect(node.stack); }
  const expand = (nodes: SceneNode[]): SceneNode[] => nodes.map(node => {
    if (node.kind !== 'group') return node;
    if (!node.composition) return { ...node, children: expand(node.children) };
    const source = node.composition.scene;
    const localTime = compositionTime(scene.at ?? 0, sceneDuration(source), node.composition.params, node.composition.modulation);
    const local = evaluateSceneExpressions({ ...sampleScene(source, localTime), at: localTime });
    const byId = new Map([...walkNodes(local.objects)].map(({ node }) => [node.id, node]));
    const extra = effectorStacks(local, byId);
    const bake = (items: SceneNode[]): SceneNode[] => items.map(n => n.kind === 'group'
      ? { ...n, stack: [...n.stack, ...(extra.get(n.id) ?? [])], children: bake(n.children) }
      : { ...n, stack: [...n.stack, ...(extra.get(n.id) ?? [])], ...(n.kind === 'effector' ? { visible: false } : {}) });
    const resolved = expandCompositions({ ...local, objects: bake(local.objects) }, registry, depth + 1, chain);
    // Length-delimited prefixes are distinct even for IDs containing our separators.
    let prefix = `${node.id.length}:${node.id}::`;
    while ([...occupied].some(id => id.startsWith(prefix))) prefix = '@' + prefix;
    const stack = (items: SceneNode['stack']): SceneNode['stack'] => items.map(m => {
      const schema = registry.get(m.type)?.params ?? {};
      const params = Object.fromEntries(Object.entries(m.params ?? {}).map(([k, v]) => [k,
        schema[k]?.type === 'node' && typeof v === 'string' && v ? prefix + v
          : schema[k]?.type === 'nodes' && Array.isArray(v) ? v.map(id => prefix + id) : v]));
      return { ...m, id: prefix + m.id, params, ...(m.children ? { children: stack(m.children) } : {}) };
    });
    const namespace = (items: SceneNode[]): SceneNode[] => items.map(n => ({
      ...n, id: prefix + n.id, stack: stack(n.stack),
      ...(n.kind === 'instance' ? { of: prefix + n.of } : {}),
      ...(n.kind === 'effector' ? { targets: n.targets.map(id => prefix + id) } : {}),
      ...(n.kind === 'group' ? { children: namespace(n.children) } : {}),
    } as SceneNode));
    return { ...node, children: namespace(resolved.objects) };
  });
  return { ...scene, objects: expand(scene.objects) };
}
