import { isPathContours, parsePathPointParam, readPathPointTarget } from './manual-path';
import { mouseParams } from './mouse';
import { isRangedVariable } from './scene';
import { parseColor } from './color';
import { isNumericExpression } from './expression';
import { parsePercent } from './units';
import { signalSchemas } from './modifiers/signal-schemas';
import { compositionParams } from './composition';
import { nthSelector } from './modifiers/range';
// Scene validation: what comes from a file, the code panel or a link.
// - errors: the scene can't be used (something essential is missing or a type is unknown);
// - warnings: it can be used, but something will be silently ignored (a misspelt parameter, a track
//   pointing at an effect that doesn't exist…).
import type { SceneNode, SceneV1 } from './document';
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
export function validateScene(value: unknown, modifiers: readonly ModifierDef<any>[] = builtins, ancestors = new Set<unknown>()): SceneReport {
  if (ancestors.has(value) || ancestors.size > 32) return { errors: ['Composition nesting is cyclic or exceeds 32 levels'], warnings: [] };
  const chain = new Set(ancestors); chain.add(value);
  const errors: string[] = [];
  const warnings: string[] = [];
  const raw = value as Partial<SceneV1> | null;
  if (!raw || typeof raw !== 'object') return { errors: ['Expected an object'], warnings };
  if (raw.version !== 1) errors.push('version must be 1');
  if (!Array.isArray(raw.objects)) return { errors: [...errors, 'objects must be an array'], warnings };
  const scene = raw as SceneV1;
  if (scene.clipToDocument !== undefined && typeof scene.clipToDocument !== 'boolean') errors.push('clipToDocument must be true or false');
  if (scene.background !== undefined && (typeof scene.background !== 'string' || !/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(scene.background) || !parseColor(scene.background))) errors.push('background must be a hex colour (#rrggbb or #rrggbbaa)');
  if (scene.fullViewport !== undefined && typeof scene.fullViewport !== 'boolean' && !['contain', 'cover', 'stretch', 'adapt'].includes(scene.fullViewport as string)) errors.push('fullViewport must be true/false or "contain", "cover", "stretch" or "adapt"');
  if (scene.adaptContent !== undefined && typeof scene.adaptContent !== 'boolean') errors.push('adaptContent must be true or false');
  if (scene.physicsBounds !== undefined && typeof scene.physicsBounds !== 'boolean') errors.push('physicsBounds must be true or false');
  if (scene.fullViewport === 'adapt' && !scene.document) warnings.push('fullViewport "adapt" needs a document size: without one it behaves as "contain"');
  if (scene.physicsBounds && !scene.document) warnings.push('physicsBounds needs a document size: without one there are no walls');
  if (scene.seedOnLoad !== undefined && typeof scene.seedOnLoad !== 'boolean') errors.push('seedOnLoad must be true or false');
  if (scene.seedEvery !== undefined && !(typeof scene.seedEvery === 'number' && Number.isFinite(scene.seedEvery) && scene.seedEvery >= 0)) errors.push('seedEvery must be a number of seconds, 0 or more');
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
      else if (spec.type === 'number' && typeof v === 'string') {
        // Text in a number: only a percentage, and only where the parameter accepts one.
        if (parsePercent(v) === null) warnings.push(`${where}: "${k}" must be a number or a percentage like "50%", not "${v}"`);
        else if (!spec.percentOf) warnings.push(`${where}: "${k}" does not accept percentages ("${v}")`);
      } else if (spec.type === 'palette' && (!Array.isArray(v) || !v.length || v.some(c => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)))) errors.push(`${where}: "${k}" must be a non-empty array of #rrggbb colors`);
      else if (spec.type === 'path' && !isPathContours(v)) errors.push(`${where}: "${k}" must contain valid path contours with finite point and handle coordinates`);
      else if (spec.type === 'path' && isPathContours(v)) { const ids = v.flatMap(c => c.points.flatMap(p => p.id ? [p.id] : [])); if (new Set(ids).size !== ids.length) errors.push(`${where}: path point ids must be unique within the shape`); }
      else if (spec.type === 'node' && typeof v === 'string' && v) nodeRefs.push({ from: where, param: k, id: v });
      else if (spec.type === 'nodes') {
        if (!Array.isArray(v) || v.some((id) => typeof id !== 'string')) errors.push(`${where}: "${k}" must be an array of node ids`);
        else for (const id of v) if (id) nodeRefs.push({ from: where, param: k, id });
      }
    }
  };

  const checkStack = (list: unknown, node: SceneNode, path: string, parentType?: string) => {
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
      if (parentType === 'rigidpieces' && def.kind !== 'deformer' && !['color', 'tint', 'opacity', 'paint', 'gradient', 'imagefill', 'feather'].includes(m.type)) warnings.push(`${where}: Rigid Pieces accepts deformers and per-piece style effects only`);
      if (def.freeParams) {
        // Each › Shape: the shape's own numeric parameters, by name.
        const shape = node && node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
        if (parentType !== 'each') warnings.push(`${where}: Shape only works inside Each`);
        if (!shape) warnings.push(`${where}: Shape only works on a shape object`);
        for (const [key, v] of Object.entries(m.params ?? {})) {
          if (shape && shape.params[key]?.type !== 'number') warnings.push(`${where}: "${key}" is not a numeric parameter of ${shape.label}`);
          if (!(typeof v === 'number' && Number.isFinite(v)) && !(isNumericExpression(v) && Number.isFinite(v.fallback))) errors.push(`${where}: "${key}" must be a number or a numeric expression`);
        }
      } else checkParams(def.params, m.params, where);
      if (m.type === 'range' && m.params?.selector === 'nth' && !nthSelector((m.params.nth ?? '2n') as string)) warnings.push(`${where}: invalid An+B selector; no elements will be selected`);
      if (m.children !== undefined) checkStack(m.children, node, where, m.type);
    }
  };

  const containsSoft = (stack: ModifierInstance[]): boolean => stack.some((m) => m.enabled !== false && (m.type === 'softbody' || containsSoft(m.children ?? [])));
  const isSimulation = (m: ModifierInstance) => m.enabled !== false && ['gravity', 'physics'].includes(m.type);
  const checkNodes = (list: SceneNode[], root = false, ancestorSimulation = false) => {
    if (root && list.some((n) => n?.kind === 'group' && n.layer)) {
      const loose = list.filter((n) => !(n?.kind === 'group' && n.layer));
      if (loose.length) warnings.push(`With layers, every top-level object must be a layer: ${loose.map((n) => `"${n?.name ?? n?.id}"`).join(', ')} ${loose.length === 1 ? 'is' : 'are'} outside any layer`);
    }
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
      if (n.kind === 'object' && !n.source && !n.packed && n.href) warnings.push(`${name(n)}: its SVG "${n.href}" is not loaded (it draws nothing)`);
      if (n.kind === 'instance') {
        if (n.mouse) {
          checkParams(mouseParams, n.mouse, name(n) + ' Mouse Instance');
          const numeric = (v: unknown) => (typeof v === 'number' && Number.isFinite(v)) || (isNumericExpression(v) && Number.isFinite(v.fallback));
          for (const [key, spec] of Object.entries(mouseParams)) {
            const v = n.mouse[key];
            if (v === undefined) continue;
            if (spec.type === 'number' && !numeric(v)) errors.push(`${name(n)}: mouse ${key} must be a finite number or numeric expression`);
            if (spec.type === 'enum' && !(spec.options as readonly unknown[]).includes(v)) errors.push(`${name(n)}: unknown mouse ${key}`);
            if (spec.type === 'point' && (!Array.isArray(v) || v.length !== 2 || v.some(c => !numeric(c)))) errors.push(`${name(n)}: mouse ${key} must be a numeric point`);
          }
        }
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
      let lastSimulation = -1;
      n.stack.forEach((m, i) => { if (isSimulation(m)) lastSimulation = i; });
      if (!ancestorSimulation && lastSimulation >= 0 && containsSoft(n.stack.slice(lastSimulation + 1))) warnings.push(`${name(n)}: Soft Body is after the last simulation; move the material before Gravity/Physics so it can affect the motion`);
      if (n.kind === 'group' && n.layer) {
        if (!root) errors.push(`${name(n)}: a layer must be a top-level object of its scene, not nested`);
        if (n.composition) errors.push(`${name(n)}: a layer cannot be a composition`);
        if (n.stack.length) warnings.push(`${name(n)}: layers have no effects; its stack is still applied`);
        if (n.transform && Object.keys(n.transform).length) warnings.push(`${name(n)}: layers have no transform; it is still applied`);
        if ((n.opacity !== undefined && n.opacity !== 1) || (n.blend && n.blend !== 'normal')) warnings.push(`${name(n)}: layer opacity and blend apply to each object, not to the layer as a whole`);
      }
      if (n.kind === 'group') {
        if (n.composition) {
          if (n.children?.length) errors.push(`${name(n)}: a composition stores its objects in composition.scene, not children`);
          checkParams(compositionParams, n.composition.params, `${name(n)} composition`);
          const signal = n.composition.modulation;
          if (signal) {
            const schema = signalSchemas[signal.type];
            if (!schema) errors.push(`${name(n)}: unknown clock modulator`);
            else checkParams(schema, signal.params, `${name(n)} clock signal`);
          }
          const nested = validateScene(n.composition.scene, modifiers, chain);
          errors.push(...nested.errors.map(e => `${name(n)} composition: ${e}`));
          warnings.push(...nested.warnings.map(e => `${name(n)} composition: ${e}`));
        }
      }
      if (n.children !== undefined || n.kind === 'group') {
        if (!Array.isArray(n.children)) errors.push(`${name(n)}: children must be an array`);
        else checkNodes(n.children, false, ancestorSimulation || n.stack.some(isSimulation));
      }
    }
  };
  checkNodes(scene.objects, true);

  for (const r of nodeRefs) if (!nodes.has(r.id)) warnings.push(`${r.from}: "${r.param}" points to "${r.id}", which does not exist`);

  if (scene.animation?.infinite !== undefined && typeof scene.animation.infinite !== 'boolean') errors.push('animation.infinite must be a boolean');
  if (scene.animation?.infinite && scene.animation.loop === true) warnings.push('Infinite time overrides scene Loop; use a looping composition for repeated playback');

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
      else if (n.kind === 'shape' && n.shape === 'path' && parsePathPointParam(tr.param)) {
        if (!readPathPointTarget(n.params.contours, tr.param)) warnings.push(`${label}: path point does not exist`);
        if (Array.isArray(tr.keys) && tr.keys.some(k => !Array.isArray(k.value) || k.value.length !== 2 || k.value.some(v => typeof v !== 'number' || !Number.isFinite(v)))) errors.push(`${label}: point keys must be finite coordinate pairs`);
      }
      else if (!def.params[tr.param]) warnings.push(`${label}: ${def.label} has no parameter "${tr.param}"`);
    } else if (tr.on === 'composition') {
      if (n.kind !== 'group' || !n.composition) warnings.push(`${label}: ${name(n)} is not a composition`);
      else if (!compositionParams[tr.param as keyof typeof compositionParams] || (compositionParams as ParamSchema)[tr.param]?.animatable === false) warnings.push(`${label}: composition parameter \"${tr.param}\" cannot be animated`);
    } else if (tr.on === 'modifier') {
      const m = tr.modifier ? mods.get(tr.modifier) : undefined;
      if (!m) warnings.push(`${label}: modifier "${tr.modifier ?? ''}" does not exist`);
      else if (m.node.id !== n.id) warnings.push(`${label}: modifier "${tr.modifier}" belongs to ${name(m.node)}, not to ${name(n)}`);
      else {
        const def = registry.get(m.inst.type)!;
        if (!def.params[tr.param] && tr.param !== 'enabled') warnings.push(`${label}: ${def.label} has no parameter "${tr.param}"`);
      }
    } else warnings.push(`${label}: "on" must be "node", "shape", "composition" or "modifier"`);
  }

  const markerIds = new Set<string>();
  for (const marker of scene.animation?.markers ?? []) {
    if (typeof marker.id !== 'string' || markerIds.has(marker.id)) warnings.push('Timeline markers need unique string ids');
    markerIds.add(marker.id);
    if (typeof marker.name !== 'string' || !marker.name.trim()) warnings.push('Timeline marker needs a name');
    if (!Number.isFinite(marker.t) || marker.t < 0 || marker.t > scene.animation!.duration) warnings.push(`Marker "${marker.name}" is outside the timeline`);
  }

  // Custom variables: a number, an expression, or a number with a sensible range.
  for (const [key, v] of Object.entries(scene.custom ?? {})) {
    if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)) warnings.push(`Custom variable "${key}": use letters, digits and _ (not starting with a digit)`);
    if (typeof v === 'number' || isNumericExpression(v)) continue;
    if (!isRangedVariable(v)) warnings.push(`Custom variable "${key}": must be a number, an expression or { value, min?, max?, step? }`);
    else if (v.min !== undefined && v.max !== undefined && v.min > v.max) warnings.push(`Custom variable "${key}": min is above max`);
    else if (v.step !== undefined && !(v.step > 0)) warnings.push(`Custom variable "${key}": step must be positive`);
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
