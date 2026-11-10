// Estado del editor: la escena (v2: varios objetos y grupos), la selección, el historial y la URL.
import {
  builtins,
  migrateScene,
  shapeRegistry,
  randomizeParams,
  resolveParams,
  rng,
  walkNodes,
  type AnyScene,
  type GroupNode,
  type ModifierDef,
  type ModifierInstance,
  type ObjectNode,
  type SceneNode,
  type SceneV2,
  type ShapeNode,
} from '@svertik/engine';
import { DEFAULT_SCRIPT } from './code';
import { decodeState, encodeState, MAX_HASH } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
export const modifierTypes = builtins.map((m) => m.type);

/** Modificadores que aceptan otros colgados (y los aplican a su manera). */
export const containers = new Set(['step']);

/** Dónde está un modificador en el árbol de una pila: su lista, su posición y quién la contiene. */
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

/** Dónde está un nodo (objeto o grupo): su lista, su posición y su grupo. */
export interface NodeLocation {
  list: SceneNode[];
  index: number;
  node: SceneNode;
  parent: GroupNode | null;
}

export function locateNode(nodes: SceneNode[], id: string | null, parent: GroupNode | null = null): NodeLocation | null {
  if (!id) return null;
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { list: nodes, index, node, parent };
    if (node.kind === 'group') {
      const found = locateNode(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

/** Un modificador y el nodo cuya pila lo contiene. */
export function locateModifier(scene: SceneV2, id: string | null): (Location & { owner: SceneNode }) | null {
  if (!id) return null;
  for (const { node } of walkNodes(scene.objects)) {
    const at = locate(node.stack, id);
    if (at) return { ...at, owner: node };
  }
  return null;
}

const HISTORY_LIMIT = 200;
const uid = () => Math.random().toString(36).slice(2, 8);

export class Editor {
  scene = $state<SceneV2 | null>(null);
  /** Nombre del documento (el del primer SVG, mientras no haya otro). */
  name = $state('untitled');
  /** Color del lienzo (solo para ver; no entra en el SVG exportado). Vacío: el del tema. */
  canvas = $state('');
  /** Lo seleccionado: un nodo (objeto o grupo) o un modificador. */
  selected = $state<string | null>(null);
  /** Nodos plegados en la pila. */
  collapsed = $state<string[]>([]);
  showOriginal = $state(false);
  showWire = $state(false);
  error = $state<string | null>(null);
  /** Script del panel de código (lo que va después de la escena en la pestaña JS). */
  script = $state(DEFAULT_SCRIPT);
  /** Objetos animados por el script mientras corre; no entran en el historial. */
  preview = $state<SceneNode[] | null>(null);
  codeOpen = $state(false);
  /** Herramienta de primitivas armada (se dibuja arrastrando en el lienzo). */
  tool = $state<string | null>(null);
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
  /** El modificador seleccionado, con el nodo que lo contiene. */
  #mod = $derived(this.scene ? locateModifier(this.scene, this.selected) : null);
  current = $derived(this.#mod?.inst ?? null);
  /** El Step (u otro contenedor) del que cuelga el seleccionado, si lo hay. */
  currentParent = $derived(this.#mod?.parent ?? null);
  /** El nodo seleccionado (objeto o grupo), si lo seleccionado es un nodo. */
  currentNode = $derived(this.scene ? (locateNode(this.scene.objects, this.selected)?.node ?? null) : null);
  /** El nodo con el que se trabaja: el seleccionado o el dueño del efecto seleccionado. */
  activeNode = $derived(this.currentNode ?? this.#mod?.owner ?? null);
  objectCount = $derived(this.scene ? [...walkNodes(this.scene.objects)].filter((x) => x.node.kind !== 'group').length : 0);

  // ── Origen

  /** Carga un SVG: si no hay escena, la crea; si la hay, lo añade como un objeto nuevo, centrado. */
  load(source: string, name: string) {
    this.error = null;
    if (!/<svg[\s>]/i.test(source)) {
      this.error = 'That is not an SVG.';
      return;
    }
    const node: ObjectNode = { kind: 'object', id: `object-${uid()}`, name, source, stack: [] };
    if (!this.scene) {
      this.scene = { version: 2, objects: [node] };
      this.name = name.replace(/\.svg$/i, '');
      this.#history = [];
      this.#index = -1;
    } else {
      // Lo nuevo, arriba de la lista: delante de todo.
      this.scene.objects.unshift(node);
    }
    this.selected = node.id;
    this.record(true);
  }

  /** Añade una primitiva (rectángulo, estrella…) en `at` (centro, en el documento) con sus parámetros. */
  addShape(type: string, params: Record<string, unknown> = {}, at: { x: number; y: number } = { x: 0, y: 0 }) {
    const def = shapeRegistry.get(type);
    if (!def) return;
    const taken = new Set(this.scene ? [...walkNodes(this.scene.objects)].map((x) => x.node.name) : []);
    let name = def.label;
    for (let i = 2; taken.has(name); i++) name = `${def.label} ${i}`;
    const node: ShapeNode = {
      kind: 'shape',
      id: `${type}-${uid()}`,
      name,
      shape: type,
      params: { ...resolveParams(def.params), ...params },
      stack: [],
      transform: { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 },
    };
    if (!this.scene) {
      this.scene = { version: 2, objects: [node] };
      this.name = 'untitled';
      this.#history = [];
      this.#index = -1;
    } else {
      // Dentro del grupo seleccionado, si lo hay; arriba de la lista (delante).
      const g = this.currentNode?.kind === 'group' ? this.currentNode : null;
      (g ? g.children : this.scene.objects).unshift(node);
    }
    this.selected = node.id;
    this.tool = null;
    this.record(true);
  }

  /** Un parámetro de una primitiva. */
  setShapeParam(id: string, name: string, value: unknown) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    at.node.params[name] = value;
    this.record();
  }

  /** Cambia el SVG de un objeto, conservando su pila y su posición. */
  replaceSource(id: string, source: string, name: string) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'object' || !/<svg[\s>]/i.test(source)) return;
    at.node.source = source;
    at.node.name = name;
    this.record(true);
  }

  setName(name: string) {
    const n = name.trim();
    if (!n || n === this.name) return;
    this.name = n;
    this.record(true);
  }

  setCanvas(color: string) {
    this.canvas = color;
    this.record();
  }

  // ── Nodos

  isCollapsed = (id: string) => this.collapsed.includes(id);
  toggleCollapsed(id: string, expanded: boolean) {
    this.collapsed = expanded ? this.collapsed.filter((x) => x !== id) : [...this.collapsed, id];
  }

  /** Mete el nodo seleccionado en un grupo nuevo, en su mismo sitio. */
  group(id = this.activeNode?.id ?? null) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at) return;
    const g: GroupNode = { kind: 'group', id: `group-${uid()}`, name: 'Group', stack: [], children: [at.node] };
    at.list.splice(at.index, 1, g);
    this.selected = g.id;
    this.record(true);
  }

  /** Deshace un grupo: sus hijos quedan en su lugar (su posición y sus efectos se pierden). */
  ungroup(id = this.currentNode?.id ?? null) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'group') return;
    at.list.splice(at.index, 1, ...at.node.children);
    this.selected = at.node.children[0]?.id ?? null;
    this.record(true);
  }

  /** Mueve un nodo: dentro de `groupId` (o arriba del todo) en la posición `index`. */
  moveNode(id: string, groupId: string | null, index: number) {
    if (!this.scene || id === groupId) return;
    const at = locateNode(this.scene.objects, id);
    if (!at) return;
    // Un grupo no entra en sí mismo ni en sus descendientes.
    if (groupId && at.node.kind === 'group' && locateNode(at.node.children, groupId)) return;
    const target = groupId ? locateNode(this.scene.objects, groupId)?.node : null;
    if (groupId && (!target || target.kind !== 'group')) return;
    const list = target && target.kind === 'group' ? target.children : this.scene.objects;
    const [n] = at.list.splice(at.index, 1);
    const i = list === at.list && index > at.index ? index - 1 : index;
    list.splice(Math.max(0, Math.min(list.length, i)), 0, n!);
    this.record(true);
  }

  /** Posición, escala, giro, opacidad, visibilidad o nombre de un nodo. */
  setNode(id: string, key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'visible' | 'name', value: unknown, now = false) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at) return;
    const n = at.node;
    if (key === 'opacity') n.opacity = value as number;
    else if (key === 'visible') n.visible = value as boolean;
    else if (key === 'name') n.name = String(value);
    else n.transform = { ...n.transform, [key]: value as number };
    this.record(now);
  }

  // ── Pila del nodo activo

  add(type: string) {
    const def = registry.get(type);
    const owner = this.activeNode;
    if (!this.scene || !def || !owner) return;
    const inst: ModifierInstance = { id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(def.params) } };
    if (containers.has(type)) inst.children = [];
    const stack = owner.stack;
    const at = locate(stack, this.selected);
    if (at && containers.has(at.inst.type) && !containers.has(type)) {
      // Con Step seleccionado: dentro, al final.
      (at.inst.children ??= []).push(inst);
    } else if (at && at.parent && !containers.has(type)) {
      // Con algo de dentro de Step seleccionado: dentro, debajo de él.
      at.list.splice(at.index + 1, 0, inst);
    } else {
      // Si no, en la pila del nodo, debajo del seleccionado (o del Step que lo contiene); con el nodo seleccionado, al final.
      const top = at?.parent ? stack.findIndex((m) => m.id === at.parent!.id) : (at?.index ?? -1);
      stack.splice(top < 0 ? stack.length : top + 1, 0, inst);
    }
    this.selected = inst.id;
    // Que se vea lo añadido: el nodo y el Step que lo recibe, desplegados.
    const host = at && containers.has(at.inst.type) ? at.inst.id : at?.parent?.id;
    this.collapsed = this.collapsed.filter((x) => x !== owner.id && x !== host);
    this.record(true);
  }

  /** Quita un modificador o un nodo. */
  remove(id = this.selected) {
    if (!this.scene || !id) return;
    const at = locateModifier(this.scene, id);
    if (at) {
      at.list.splice(at.index, 1);
      const next = at.list[Math.min(at.index, at.list.length - 1)];
      this.selected = next?.id ?? at.parent?.id ?? at.owner.id;
      this.record(true);
      return;
    }
    const n = locateNode(this.scene.objects, id);
    if (!n) return;
    n.list.splice(n.index, 1);
    this.selected = n.list[Math.min(n.index, n.list.length - 1)]?.id ?? n.parent?.id ?? null;
    // Sin objetos no hay escena: vuelta al estado vacío.
    if (this.objectCount === 0) {
      this.scene = null;
      this.selected = null;
    }
    this.record(true);
  }

  /** Mueve dentro de su misma lista (teclado: ⌥↑/↓). Vale para modificadores y nodos. */
  move(id: string, to: number) {
    if (!this.scene) return;
    const at = locateModifier(this.scene, id) ?? locateNode(this.scene.objects, id);
    if (!at) return;
    const list = at.list as unknown[];
    const clamped = Math.max(0, Math.min(list.length - 1, to));
    if (clamped === at.index) return;
    const [m] = list.splice(at.index, 1);
    list.splice(clamped, 0, m);
    this.record(true);
  }

  /** Mueve un modificador a cualquier sitio de la pila de su nodo: dentro de `parentId` (un Step) o arriba. */
  moveTo(id: string, parentId: string | null, index: number) {
    if (!this.scene) return;
    const at = locateModifier(this.scene, id);
    if (!at || id === parentId) return;
    if (parentId && containers.has(at.inst.type)) return;
    const stack = at.owner.stack;
    const target = parentId ? locate(stack, parentId)?.inst : null;
    if (parentId && (!target || !containers.has(target.type))) return;
    const list = target ? (target.children ??= []) : stack;
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
  applyScene(next: AnyScene) {
    if (!this.scene) return false;
    const v2 = migrateScene(next);
    if (JSON.stringify(v2) === JSON.stringify($state.snapshot(this.scene))) return false;
    this.scene = v2;
    if (this.selected && !locateNode(v2.objects, this.selected) && !locateModifier(v2, this.selected)) this.selected = v2.objects[0]?.id ?? null;
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
    const m = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    if (!m) return;
    m.enabled = enabled;
    this.record(true);
  }

  /** El dado: valores aleatorios (dentro de rangos razonables) para el efecto seleccionado. */
  randomize(id = this.selected, seed = Math.floor(Math.random() * 2 ** 31)) {
    const m = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    const def = m && registry.get(m.type);
    if (!m || !def) return;
    m.params = randomizeParams(def.params, resolveParams(def.params, m.params), rng(seed));
    this.record(true);
  }

  reset(id = this.selected) {
    const m = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
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
      const snap = JSON.stringify({ scene: this.scene, name: this.name, script: this.script, canvas: this.canvas });
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
    const { scene, name, script, canvas } = JSON.parse(snap) as { scene: SceneV2 | null; name: string; script?: string; canvas?: string };
    this.scene = scene;
    this.name = name;
    this.canvas = canvas ?? '';
    this.script = script ?? DEFAULT_SCRIPT;
    this.#index = i;
    if (this.selected && scene && !locateNode(scene.objects, this.selected) && !locateModifier(scene, this.selected)) {
      this.selected = scene.objects[0]?.id ?? null;
    }
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
    if (!this.scene) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      return;
    }
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as SceneV2, name: this.name, script: this.script, ...(this.canvas ? { canvas: this.canvas } : {}) });
    const hash = encoded.length < MAX_HASH ? `#s=${encoded}` : '';
    history.replaceState(null, '', `${location.pathname}${location.search}${hash}`);
  }

  async loadFromURL() {
    const m = location.hash.match(/^#s=(.+)$/);
    if (!m) return false;
    const state = await decodeState(m[1]!);
    if (!state) return false;
    const scene = migrateScene(state.scene, state.name.endsWith('.svg') ? state.name : `${state.name}.svg`);
    this.scene = scene;
    this.name = state.name.replace(/\.svg$/i, '');
    if (state.script) this.script = state.script;
    this.canvas = state.canvas ?? '';
    this.selected = scene.objects[0]?.id ?? null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    return true;
  }
}
