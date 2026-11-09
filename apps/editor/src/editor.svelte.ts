// Estado del editor: la escena, la selección, el historial y la URL.
import { builtins, randomizeParams, resolveParams, rng, type ModifierDef, type ModifierInstance, type Scene } from '@svertik/engine';
import { DEFAULT_SCRIPT } from './code';
import { decodeState, encodeState, MAX_HASH } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
export const modifierTypes = builtins.map((m) => m.type);

/** Modificadores que aceptan otros colgados (y los aplican a su manera). */
export const containers = new Set(['step']);

/** Dónde está un modificador en el árbol: su lista, su posición y quién la contiene. */
export interface Location {
  list: ModifierInstance[];
  index: number;
  inst: ModifierInstance;
  parent: ModifierInstance | null;
}

export function locate(stack: ModifierInstance[], id: string | null, parent: ModifierInstance | null = null): Location | null {
  if (!id) return null;
  for (const [index, inst] of stack.entries()) {
    if (inst.id === id) return { list: stack, index, inst, parent };
    if (inst.children) {
      const found = locate(inst.children, id, inst);
      if (found) return found;
    }
  }
  return null;
}

const HISTORY_LIMIT = 200;
const uid = () => Math.random().toString(36).slice(2, 8);

export class Editor {
  scene = $state<Scene | null>(null);
  name = $state('untitled.svg');
  selected = $state<string | null>(null);
  expanded = $state(true);
  showOriginal = $state(false);
  showWire = $state(false);
  error = $state<string | null>(null);
  /** Script del panel de código (lo que va después de la escena en la pestaña JS). */
  script = $state(DEFAULT_SCRIPT);
  /** Pila animada por el script mientras corre; no entra en el historial. */
  preview = $state<ModifierInstance[] | null>(null);
  codeOpen = $state(false);
  /** Punto que se está moviendo (fracción de la caja de origen); se borra al parar. */
  marker = $state<[number, number] | null>(null);
  #markerTimer: ReturnType<typeof setTimeout> | undefined;

  #history: string[] = [];
  #index = $state(-1);
  #historyLength = $state(0);
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending = false;

  /** Para depurar: tamaño del historial y posición. */
  get historyInfo() {
    return { length: this.#history.length, index: this.#index };
  }

  canUndo = $derived(this.#index > 0);
  canRedo = $derived(this.#index < this.#historyLength - 1);
  current = $derived(this.scene ? (locate(this.scene.stack, this.selected)?.inst ?? null) : null);
  /** El Step (u otro contenedor) del que cuelga el seleccionado, si lo hay. */
  currentParent = $derived(this.scene ? (locate(this.scene.stack, this.selected)?.parent ?? null) : null);

  // ── Origen

  load(source: string, name: string) {
    this.error = null;
    if (!/<svg[\s>]/i.test(source)) {
      this.error = 'That is not an SVG.';
      return;
    }
    this.scene = { version: 1, source, stack: [] };
    this.name = name;
    this.selected = null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
  }

  // ── Pila

  add(type: string) {
    const def = registry.get(type);
    if (!this.scene || !def) return;
    const inst: ModifierInstance = { id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(def.params) } };
    if (containers.has(type)) inst.children = [];
    const at = locate(this.scene.stack, this.selected);
    if (at && containers.has(at.inst.type) && !containers.has(type)) {
      // Con Step seleccionado: dentro, al final.
      (at.inst.children ??= []).push(inst);
    } else if (at && at.parent && !containers.has(type)) {
      // Con algo de dentro de Step seleccionado: dentro, debajo de él.
      at.list.splice(at.index + 1, 0, inst);
    } else {
      // Si no, en la pila principal, debajo del seleccionado (o del Step que lo contiene).
      const top = at?.parent ? this.scene.stack.findIndex((m) => m.id === at.parent!.id) : (at?.index ?? -1);
      this.scene.stack.splice(top < 0 ? this.scene.stack.length : top + 1, 0, inst);
    }
    this.selected = inst.id;
    this.expanded = true;
    this.record(true);
  }

  remove(id = this.selected) {
    if (!this.scene || !id) return;
    const at = locate(this.scene.stack, id);
    if (!at) return;
    at.list.splice(at.index, 1);
    const next = at.list[Math.min(at.index, at.list.length - 1)];
    this.selected = next?.id ?? at.parent?.id ?? null;
    this.record(true);
  }

  /** Mueve dentro de su misma lista (teclado: ⌥↑/↓). */
  move(id: string, to: number) {
    if (!this.scene) return;
    const at = locate(this.scene.stack, id);
    if (!at) return;
    const clamped = Math.max(0, Math.min(at.list.length - 1, to));
    if (clamped === at.index) return;
    const [m] = at.list.splice(at.index, 1);
    at.list.splice(clamped, 0, m!);
    this.record(true);
  }

  /** Mueve a cualquier sitio del árbol: dentro de `parentId` (o la pila principal) en la posición `index`. */
  moveTo(id: string, parentId: string | null, index: number) {
    if (!this.scene) return;
    const at = locate(this.scene.stack, id);
    if (!at || id === parentId) return;
    // Un contenedor no entra en otro contenedor.
    if (parentId && containers.has(at.inst.type)) return;
    const target = parentId ? locate(this.scene.stack, parentId)?.inst : null;
    if (parentId && (!target || !containers.has(target.type))) return;
    const list = target ? (target.children ??= []) : this.scene.stack;
    const [m] = at.list.splice(at.index, 1);
    const i = list === at.list && index > at.index ? index - 1 : index;
    list.splice(Math.max(0, Math.min(list.length, i)), 0, m!);
    this.record(true);
  }

  setParam(name: string, value: unknown) {
    if (!this.current?.params) return;
    this.current.params[name] = value;
    if (registry.get(this.current.type)?.params[name]?.type === 'point') this.showMarker(value as [number, number]);
    this.record();
  }

  /** Sustituye la escena entera (desde el panel de código). Devuelve false si no cambia nada. */
  applyScene(next: Scene) {
    if (!this.scene) return false;
    if (JSON.stringify(next) === JSON.stringify($state.snapshot(this.scene))) return false;
    this.scene = next;
    if (this.selected && !locate(next.stack, this.selected)) this.selected = next.stack.at(-1)?.id ?? null;
    this.record();
    return true;
  }

  setScript(script: string) {
    if (script === this.script) return;
    this.script = script;
    this.record();
  }

  /** Marca el punto en el lienzo y la quita a los 300 ms de dejar de moverlo. */
  showMarker(point: [number, number]) {
    this.marker = point;
    clearTimeout(this.#markerTimer);
    this.#markerTimer = setTimeout(() => (this.marker = null), 300);
  }

  setEnabled(id: string, enabled: boolean) {
    const m = this.scene ? locate(this.scene.stack, id)?.inst : undefined;
    if (!m) return;
    m.enabled = enabled;
    this.record(true);
  }

  /** El dado: valores aleatorios (dentro de rangos razonables) para el efecto seleccionado. */
  randomize(id = this.selected, seed = Math.floor(Math.random() * 2 ** 31)) {
    const m = this.scene ? locate(this.scene.stack, id)?.inst : undefined;
    const def = m && registry.get(m.type);
    if (!m || !def) return;
    m.params = randomizeParams(def.params, resolveParams(def.params, m.params), rng(seed));
    this.record(true);
  }

  reset(id = this.selected) {
    const m = this.scene ? locate(this.scene.stack, id)?.inst : undefined;
    const def = m && registry.get(m.type);
    if (!m || !def) return;
    m.params = { ...resolveParams(def.params) };
    this.record(true);
  }

  // ── Historial: los cambios seguidos (arrastrar un valor) cuentan como uno.

  record(now = false) {
    clearTimeout(this.#timer);
    const push = () => {
      this.#pending = false;
      const snap = JSON.stringify({ scene: this.scene, name: this.name, script: this.script });
      if (snap === this.#history[this.#index]) return;
      this.#history = this.#history.slice(0, this.#index + 1);
      this.#history.push(snap);
      if (this.#history.length > HISTORY_LIMIT) this.#history.shift();
      this.#index = this.#history.length - 1;
      this.#historyLength = this.#history.length;
      void this.saveToURL();
    };
    if (now) push();
    else {
      this.#pending = true;
      this.#timer = setTimeout(push, 350);
    }
  }

  /** Guarda ya lo que esté esperando (antes de deshacer, por ejemplo). */
  flush() {
    if (this.#pending) this.record(true);
  }

  #restore(i: number) {
    const snap = this.#history[i];
    if (!snap) return;
    const { scene, name, script } = JSON.parse(snap) as { scene: Scene; name: string; script?: string };
    this.scene = scene;
    this.name = name;
    this.script = script ?? DEFAULT_SCRIPT;
    this.#index = i;
    if (this.selected && scene && !locate(scene.stack, this.selected)) this.selected = scene.stack.at(-1)?.id ?? null;
    void this.saveToURL();
  }

  undo() {
    this.flush();
    if (this.canUndo) this.#restore(this.#index - 1);
  }
  redo() {
    this.flush();
    if (this.canRedo) this.#restore(this.#index + 1);
  }

  // ── URL

  async saveToURL() {
    if (!this.scene) return;
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as Scene, name: this.name, script: this.script });
    const hash = encoded.length < MAX_HASH ? `#s=${encoded}` : '';
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }

  async loadFromURL() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return false;
    const state = await decodeState(m[1]!);
    if (!state) return false;
    this.load(state.scene.source, state.name);
    this.scene!.stack = state.scene.stack;
    if (state.script) this.script = state.script;
    this.selected = state.scene.stack.at(-1)?.id ?? null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    return true;
  }
}
