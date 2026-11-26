import { builtins, evaluateExpression, evaluateSceneExpressions, evaluateSceneVariables, objectValues, resolveParams, sampleScene, sceneNames, shapeRegistry, type ExpressionContext, type ModifierInstance, type SceneNode, type SceneV1 } from '@svertik/engine';

/** What an expression gives in the console: its value, or why it has none. */
/** What a console line gives: a value, why it has none, or what a command did. */
export interface ConsoleResult { value?: number; error?: string; message?: string }
/** One line typed in the console and its answer. */
export interface ConsoleEval { id: number; time: number; input: string; result: ConsoleResult }

const numbers = (values: Record<string, unknown> | undefined, into: Record<string, number>) => {
  for (const [k, v] of Object.entries(values ?? {})) if (typeof v === 'number' && Number.isFinite(v) && !(k in into)) into[k] = v;
};
const findModifier = (list: ModifierInstance[] | undefined, id: string): ModifierInstance | null => {
  for (const m of list ?? []) {
    if (m.id === id) return m;
    const inner = findModifier(m.children, id);
    if (inner) return inner;
  }
  return null;
};
const effects = new Map(builtins.map((d) => [d.type, d]));
/** Default values by type, for what the scene leaves unset (as `this.name` and `scene.object.…` read them). */
const defaults = (owner: 'shape' | 'effect', type: string) => {
  const schema = owner === 'shape' ? shapeRegistry.get(type)?.params : effects.get(type)?.params;
  return schema ? (resolveParams(schema) as Record<string, unknown>) : undefined;
};

/** The values `this.name` reads for the selection (an object, or an effect), once its formulas are evaluated. */
function selfOf(evaluated: SceneV1, selected: string): Record<string, number> | undefined {
  const visit = (nodes: SceneNode[]): Record<string, number> | undefined => {
    for (const node of nodes) {
      const self: Record<string, number> = {};
      if (node.id === selected) {
        if (node.kind === 'shape') { numbers(node.params, self); numbers(defaults('shape', node.shape), self); }
        numbers({ x: 0, y: 0, scale: 1, rotation: 0, ...node.transform }, self);
        if (typeof node.opacity === 'number') self.opacity = node.opacity;
        return self;
      }
      const modifier = findModifier(node.stack, selected);
      if (modifier) { numbers(modifier.params, self); numbers(defaults('effect', modifier.type), self); return self; }
      const inner = node.children?.length ? visit(node.children) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  return visit(evaluated.objects);
}

/**
 * An expression evaluated in the scene at `time`, the way a parameter's formula would be: scene.* (the pointer
 * and the device neutral, as on the editor's canvas), the document variables, and `this.*` for the selection.
 * `element.*`, `props.*` and `children[…]` belong to a place in the scene, so they are not available here.
 */
/** What a formula can read here at `time`: other objects' values by path, and the selection's own (`this`). */
export function sceneScope(scene: SceneV1, time: number, selected?: string | null): { objects: Record<string, number>; self?: Record<string, number> } {
  // The editor's scene is reactive state: the engine clones it, so it gets a plain copy.
  scene = $state.snapshot(scene) as SceneV1;
  const sampled = { ...sampleScene(scene, time), at: time };
  const evaluated = evaluateSceneExpressions(sampled, { defaults });
  return { objects: objectValues(evaluated, sceneNames(scene), defaults), ...(selected ? { self: selfOf(evaluated, selected) } : {}) };
}

export function evaluateInScene(source: string, scene: SceneV1 | null, time: number, selected?: string | null): ConsoleResult {
  if (!source.trim()) return {};
  if (!scene) return { error: 'Open a scene first.' };
  try {
    scene = $state.snapshot(scene) as SceneV1;
    const sampled = { ...sampleScene(scene, time), at: time };
    const reads = { self: /\bthis\s*\./.test(source), objects: /\bscene\s*\.\s*object\s*\./.test(source) };
    const scope = reads.self || reads.objects ? sceneScope(scene, time, selected) : null;
    const context: ExpressionContext = evaluateSceneVariables(sampled, time, 0, undefined, scope?.objects);
    if (reads.objects) context.objects = scope!.objects;
    if (reads.self) {
      if (!scope?.self) return { error: 'Select an object or an effect to read this.name.' };
      context.self = scope.self;
    }
    return { value: evaluateExpression(source, context) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** A value as the console shows it: up to six decimals, no trailing zeros. */
export const formatValue = (n: number) => String(Math.round(n * 1e6) / 1e6);

const PINNED_KEY = 'svertik.console.pinned';
const readPinned = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(PINNED_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : [];
  } catch { return []; }
};

/**
 * The console's memory, alive while the editor is open (closing the panel keeps it): what was typed and its
 * answers, and the live expressions pinned on top (remembered in the browser).
 */
class ConsoleState {
  evals = $state<ConsoleEval[]>([]);
  pinned = $state<string[]>(readPinned());
  #id = 0;
  run(input: string, result: ConsoleResult) {
    this.evals = [...this.evals.slice(-199), { id: ++this.#id, time: Date.now(), input, result }];
  }
  clear() { this.evals = []; }
  pin(source: string) {
    const s = source.trim();
    if (!s || this.pinned.includes(s)) return;
    this.#savePinned([...this.pinned, s]);
  }
  unpin(source: string) { this.#savePinned(this.pinned.filter((p) => p !== source)); }
  #savePinned(list: string[]) {
    this.pinned = list;
    try { localStorage.setItem(PINNED_KEY, JSON.stringify(list)); } catch { /* the browser keeps none */ }
  }
  /** What was typed, newest last, without repeats in a row: ↑ and ↓ walk it. */
  get typed() {
    const out: string[] = [];
    for (const e of this.evals) if (e.input !== out.at(-1)) out.push(e.input);
    return out;
  }
}
export const consoleState = new ConsoleState();
