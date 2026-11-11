// Scene validation: what comes from a file, the code panel or a link.
// - errors: the scene can't be used (something essential is missing or a type is unknown);
// - warnings: it can be used, but something will be silently ignored (a misspelt parameter, a track
//   pointing at an effect that doesn't exist…).
import type { SceneNode, SceneV2 } from './document';
import type { ModifierInstance } from './engine';
import type { ModifierDef, ParamSchema } from './modifier';
import { builtins } from './modifiers';
import { shapeRegistry } from './shapes';

export interface SceneReport {
  errors: string[];
  warnings: string[];
}

/** What an `on: 'node'` track can animate. */
const NODE_PARAMS = new Set(['x', 'y', 'scale', 'rotation', 'opacity', 'pivot']);

/**
 * Checks a scene. Doesn't change it (except filling in empty `stack` and `params`, as the engine would).
 * With errors, don't use it; with warnings, you can.
 */
export function validateScene(value: unknown, modifiers: readonly ModifierDef<any>[] = builtins): SceneReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = value as Partial<SceneV2> | null;
  if (!raw || typeof raw !== 'object') return { errors: ['Expected an object'], warnings };
  if (raw.version !== 2) errors.push('version must be 2');
  if (!Array.isArray(raw.objects)) return { errors: [...errors, 'objects must be an array'], warnings };
  const scene = raw as SceneV2;
  const registry = new Map(modifiers.map((m) => [m.type, m]));

  // Every node and effect, by id (for references), and repeated ids.
  const nodes = new Map<string, SceneNode>();
  const mods = new Map<string, { inst: ModifierInstance; node: SceneNode }>();
  const nodeRefs: { from: string; param: string; id: string }[] = [];
  const name = (n: SceneNode) => `"${n.name || n.id}"`;

  /** Parameters the schema doesn't know (typos) and references to other nodes. */
  const checkParams = (schema: ParamSchema, params: Record<string, unknown> | undefined, where: string) => {
    for (const [k, v] of Object.entries(params ?? {})) {
      const spec = schema[k];
      if (!spec) warnings.push(`${where}: unknown parameter "${k}"`);
      else if (spec.type === 'node' && typeof v === 'string' && v) nodeRefs.push({ from: where, param: k, id: v });
    }
  };

  const checkStack = (list: unknown, node: SceneNode, path: string) => {
    if (!Array.isArray(list)) return void errors.push(`${path}: stack and children must be arrays`);
    for (const m of list as ModifierInstance[]) {
      if (!m || typeof m.id !== 'string') {
        errors.push(`${path}: every modifier needs a string id`);
        continue;
      }
      const def = registry.get(m.type);
      if (!def) {
        errors.push(`${path}: unknown modifier "${m.type}"`);
        continue;
      }
      if (mods.has(m.id)) warnings.push(`Modifier id "${m.id}" is used more than once`);
      mods.set(m.id, { inst: m, node });
      const where = `${path} › ${def.label} (${m.id})`;
      checkParams(def.params, m.params, where);
      if (m.children !== undefined) checkStack(m.children, node, where);
    }
  };

  const checkNodes = (list: SceneNode[]) => {
    for (const n of list) {
      if (!n || typeof n.id !== 'string') {
        errors.push('Every object needs a string id');
        continue;
      }
      if (nodes.has(n.id)) warnings.push(`Object id "${n.id}" is used more than once`);
      nodes.set(n.id, n);
      if (n.kind !== 'object' && n.kind !== 'group' && n.kind !== 'shape' && n.kind !== 'instance' && n.kind !== 'effector') {
        errors.push(`${name(n)}: kind must be "object", "shape", "group", "instance" or "effector"`);
        continue;
      }
      if (n.kind === 'object' && typeof n.source !== 'string' && !n.packed) errors.push(`${name(n)}: needs a source SVG`);
      if (n.kind === 'instance') {
        if (typeof n.of !== 'string' || !n.of) warnings.push(`${name(n)}: is an instance of nothing ("of" is empty)`);
        else nodeRefs.push({ from: name(n), param: 'of', id: n.of });
      }
      if (n.kind === 'effector') {
        if (!Array.isArray(n.targets)) n.targets = [];
        for (const id of n.targets) nodeRefs.push({ from: name(n), param: 'targets', id });
        if (n.delay !== undefined && !(n.delay >= 0)) warnings.push(`${name(n)}: delay must be 0 or more seconds`);
      }
      if (n.kind === 'shape') {
        const def = shapeRegistry.get(n.shape);
        if (!def) errors.push(`${name(n)}: unknown shape "${n.shape}"`);
        else {
          n.params ??= {};
          checkParams(def.params, n.params, name(n));
        }
      }
      n.stack ??= [];
      checkStack(n.stack, n, name(n));
      if (n.kind === 'group') {
        if (!Array.isArray(n.children)) errors.push(`${name(n)}: children must be an array`);
        else checkNodes(n.children);
      }
    }
  };
  checkNodes(scene.objects);

  for (const r of nodeRefs) if (!nodes.has(r.id)) warnings.push(`${r.from}: "${r.param}" points to "${r.id}", which does not exist`);

  // Tracks: their node, their effect and their parameter.
  for (const tr of scene.animation?.tracks ?? []) {
    const label = `Track "${tr.id}"`;
    const n = nodes.get(tr.node);
    if (!n) {
      warnings.push(`${label}: object "${tr.node}" does not exist`);
      continue;
    }
    if (!Array.isArray(tr.keys) || !tr.keys.length) warnings.push(`${label}: has no keyframes`);
    if (tr.repeat !== undefined && (!Number.isInteger(tr.repeat) || tr.repeat < 0)) warnings.push(`${label}: repeat must be a whole number (0 = forever)`);
    if (tr.every !== undefined && !(tr.every > 0)) warnings.push(`${label}: every must be a positive number of seconds`);
    if (tr.on === 'node') {
      if (!NODE_PARAMS.has(tr.param)) warnings.push(`${label}: objects cannot animate "${tr.param}" (only ${[...NODE_PARAMS].join(', ')})`);
    } else if (tr.on === 'shape') {
      const def = n.kind === 'shape' ? shapeRegistry.get(n.shape) : undefined;
      if (!def) warnings.push(`${label}: ${name(n)} is not a shape`);
      else if (!def.params[tr.param]) warnings.push(`${label}: ${def.label} has no parameter "${tr.param}"`);
    } else if (tr.on === 'modifier') {
      const m = tr.modifier ? mods.get(tr.modifier) : undefined;
      if (!m) warnings.push(`${label}: modifier "${tr.modifier ?? ''}" does not exist`);
      else if (m.node.id !== n.id) warnings.push(`${label}: modifier "${tr.modifier}" belongs to ${name(m.node)}, not to ${name(n)}`);
      else {
        const def = registry.get(m.inst.type)!;
        if (!def.params[tr.param] && tr.param !== 'enabled') warnings.push(`${label}: ${def.label} has no parameter "${tr.param}"`);
      }
    } else warnings.push(`${label}: "on" must be "node", "shape" or "modifier"`);
  }

  // Interactions: who fires them and what they act on.
  for (const it of scene.interactions ?? []) {
    const label = `Interaction "${it.id}"`;
    if (it.trigger !== 'enter' && !nodes.has(it.node)) warnings.push(`${label}: object "${it.node}" does not exist`);
    if (it.action === 'follow' && it.trigger !== 'pointer') warnings.push(`${label}: "follow" only works with the "pointer" trigger`);
    const t = it.target;
    if (it.action === 'play' || !t) continue;
    if (!nodes.has(t.node)) warnings.push(`${label}: target object "${t.node}" does not exist`);
    else if ((t.on === 'modifier' || it.action === 'toggle') && !(t.modifier && mods.has(t.modifier))) warnings.push(`${label}: modifier "${t.modifier ?? ''}" does not exist`);
  }

  return { errors, warnings };
}
