// Estado del editor: la escena, la selección, el historial y la URL.
import { builtins, resolveParams, type ModifierDef, type ModifierInstance, type Scene } from '@svertik/engine';
import { decodeState, encodeState, MAX_HASH } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
export const modifierTypes = builtins.map((m) => m.type);

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
  current = $derived(this.scene?.stack.find((m) => m.id === this.selected) ?? null);

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
    // Debajo del seleccionado, o al final.
    const i = this.scene.stack.findIndex((m) => m.id === this.selected);
    this.scene.stack.splice(i < 0 ? this.scene.stack.length : i + 1, 0, inst);
    this.selected = inst.id;
    this.expanded = true;
    this.record(true);
  }

  remove(id = this.selected) {
    if (!this.scene || !id) return;
    const i = this.scene.stack.findIndex((m) => m.id === id);
    if (i < 0) return;
    this.scene.stack.splice(i, 1);
    const next = this.scene.stack[Math.min(i, this.scene.stack.length - 1)];
    this.selected = next?.id ?? null;
    this.record(true);
  }

  move(id: string, to: number) {
    if (!this.scene) return;
    const from = this.scene.stack.findIndex((m) => m.id === id);
    if (from < 0) return;
    const clamped = Math.max(0, Math.min(this.scene.stack.length - 1, to));
    if (clamped === from) return;
    const [m] = this.scene.stack.splice(from, 1);
    this.scene.stack.splice(clamped, 0, m!);
    this.record(true);
  }

  setParam(name: string, value: unknown) {
    if (!this.current?.params) return;
    this.current.params[name] = value;
    if (registry.get(this.current.type)?.params[name]?.type === 'point') this.showMarker(value as [number, number]);
    this.record();
  }

  /** Marca el punto en el lienzo y la quita a los 300 ms de dejar de moverlo. */
  showMarker(point: [number, number]) {
    this.marker = point;
    clearTimeout(this.#markerTimer);
    this.#markerTimer = setTimeout(() => (this.marker = null), 300);
  }

  setEnabled(id: string, enabled: boolean) {
    const m = this.scene?.stack.find((x) => x.id === id);
    if (!m) return;
    m.enabled = enabled;
    this.record(true);
  }

  reset(id = this.selected) {
    const m = this.scene?.stack.find((x) => x.id === id);
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
      const snap = JSON.stringify({ scene: this.scene, name: this.name });
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
    const { scene, name } = JSON.parse(snap) as { scene: Scene; name: string };
    this.scene = scene;
    this.name = name;
    this.#index = i;
    if (this.selected && !scene?.stack.some((m) => m.id === this.selected)) this.selected = scene?.stack.at(-1)?.id ?? null;
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
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as Scene, name: this.name });
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
    this.selected = state.scene.stack.at(-1)?.id ?? null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    return true;
  }
}
