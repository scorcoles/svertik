// Estado del editor: la escena (v2: varios objetos y grupos), la selección, el historial y la URL.
import {
  builtins,
  createEngine,
  isScene,
  outlineNode,
  packNode,
  unpackNode,
  linearOf,
  readTarget,
  sampleScene,
  setKey,
  placementOf,
  shapeRegistry,
  randomizeParams,
  zeroParams,
  resolveParams,
  rng,
  walkNodes,
  type Animation,
  type BlendMode,
  type Ease,
  type Track,
  type GroupNode,
  type Interaction,
  type NodeInfo,
  type ModifierDef,
  type ModifierInstance,
  type EffectorNode,
  type InstanceNode,
  type ObjectNode,
  type SceneNode,
  type SceneV2,
  type ShapeNode,
  validateScene,
  applyPalette,
  DOCUMENT_PALETTE,
  PALETTES,
  type Palette,
} from '@svertik/engine';
import { DEFAULT_SCRIPT } from './code';
import { decodeState, encodeState, MAX_HASH } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
export const modifierTypes = builtins.map((m) => m.type);

/** Modificadores que aceptan otros colgados (y los aplican a su manera). */
/** Efectos que llevan otros dentro: los efectores (Step, Range, Field, Stagger) y RGB Split (lo suyo, a las copias). */
export const effectors = new Set(['step', 'range', 'field', 'stagger']);
export const containers = new Set([...effectors, 'rgbsplit']);
/**
 * ¿Puede `child` ir dentro de `parent`? Un efector no lleva otro efector; RGB Split lleva cualquier cosa
 * menos otro RGB Split (un Step dentro reparte sus copias por elementos), y también puede ir dentro de un efector.
 */
export function canNest(parent: string, child: string): boolean {
  if (!containers.has(parent)) return false;
  if (effectors.has(parent)) return !effectors.has(child);
  return child !== 'rgbsplit';
}

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

export const PRESETS = ['rise', 'cascade', 'flip', 'spring', 'scatter', 'fall'] as const;
export type PresetName = (typeof PRESETS)[number];

export type TrackTarget = Pick<Track, 'node' | 'on' | 'modifier' | 'param'>;

/** Escribe un valor en lo que apunta una pista (en la escena viva del editor). */
function writeTrackTarget(scene: SceneV2, tr: TrackTarget, value: unknown) {
  if (value === undefined) return;
  const at = locateNode(scene.objects, tr.node);
  if (!at) return;
  const n = at.node;
  if (tr.on === 'node') {
    if (tr.param === 'opacity') n.opacity = value as number;
    else n.transform = { ...n.transform, [tr.param]: value as number };
  } else if (tr.on === 'shape') {
    if (n.kind === 'shape') n.params[tr.param] = value;
  } else {
    const m = tr.modifier ? locate(n.stack, tr.modifier)?.inst : undefined;
    if (m && tr.param === 'enabled') m.enabled = !!value;
    else if (m) m.params = { ...m.params, [tr.param]: value };
  }
}

/** Preferencias en localStorage (puede no haberlo: modo privado, sin permisos…). */
function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writePref(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* sin almacenamiento: no pasa nada */
  }
}
const uid = () => Math.random().toString(36).slice(2, 8);

/** Paletas propias guardadas (lista de { name, colors }); lo que no se entienda, fuera. */
function readSaved(): Palette[] {
  try {
    const v = JSON.parse(readPref('svertik.palettes') || '[]') as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter((p): p is Palette => !!p && typeof p.name === 'string' && Array.isArray(p.colors) && p.colors.every((c: unknown) => typeof c === 'string'));
  } catch {
    return [];
  }
}
const writeSaved = (list: Palette[]) => writePref('svertik.palettes', list.length ? JSON.stringify(list) : '');

/** Copia con ids nuevos (también los de sus hijos y sus efectos), para pegar sin repetir. */
function freshModifier(m: ModifierInstance): ModifierInstance {
  return { ...m, id: `${m.type}-${uid()}`, ...(m.children ? { children: m.children.map(freshModifier) } : {}) };
}
function freshNode(n: SceneNode): SceneNode {
  const base = { ...n, id: `${n.kind === 'shape' ? n.shape : n.kind}-${uid()}`, stack: n.stack.map(freshModifier) };
  return base.kind === 'group' ? { ...base, children: base.children.map(freshNode) } : base;
}

export class Editor {
  scene = $state<SceneV2 | null>(null);
  /** Nombre del documento (el del primer SVG, mientras no haya otro). */
  name = $state('untitled');
  /** Color del lienzo (solo para ver; no entra en el SVG exportado). Vacío: el del tema. */
  canvas = $state(readPref('svertik.canvas'));

  // ── Paletas: las de serie y las propias (en este navegador, como el color del lienzo)

  savedPalettes = $state<Palette[]>(readSaved());
  /** La que enseña el selector de color (nombre, o la del documento). */
  paletteName = $state(readPref('svertik.palette') || DOCUMENT_PALETTE);
  palettes = $derived([...PALETTES, ...this.savedPalettes]);
  selectPalette(name: string) {
    this.paletteName = name;
    writePref('svertik.palette', name === DOCUMENT_PALETTE ? '' : name);
  }
  /** Guarda los colores del documento como paleta (con ese nombre; si ya hay una propia, la sustituye). */
  savePalette(name: string): boolean {
    const n = name.trim();
    const colors = this.docColors;
    if (!n || !colors.length || PALETTES.some((p) => p.name === n) || n === DOCUMENT_PALETTE) return false;
    this.savedPalettes = [...this.savedPalettes.filter((p) => p.name !== n), { name: n, colors: [...colors] }];
    writeSaved(this.savedPalettes);
    this.selectPalette(n);
    return true;
  }
  deletePalette(name: string) {
    if (!this.savedPalettes.some((p) => p.name === name)) return;
    this.savedPalettes = this.savedPalettes.filter((p) => p.name !== name);
    writeSaved(this.savedPalettes);
    if (this.paletteName === name) this.selectPalette(DOCUMENT_PALETTE);
  }
  /** Cambia los colores del dibujo por los de la paleta (por luminosidad). Se deshace como todo. */
  applyPalette(name: string) {
    const p = this.palettes.find((x) => x.name === name);
    if (!this.scene || !p) return;
    const n = applyPalette(this.scene, p.colors);
    if (!n) {
      this.notice = 'Nothing to change: the drawing already uses those colors.';
      return;
    }
    this.notice = `${n} ${n === 1 ? 'color' : 'colors'} changed to ${p.name}. Undo brings them back.`;
    this.record(true);
  }
  /** Lo seleccionado: un nodo (objeto o grupo) o un modificador. Asignarlo deja la selección en uno solo. */
  #selected = $state<string | null>(null);
  get selected() {
    return this.#selected;
  }
  set selected(id: string | null) {
    this.#selected = id;
    this.also = [];
  }
  /** Más nodos seleccionados (⇧ + clic), además del principal: para alinear, distribuir, mover juntos… */
  also = $state<string[]>([]);
  /** Nodos plegados en la pila. */
  collapsed = $state<string[]>([]);
  showOriginal = $state(false);
  showWire = $state(false);
  /** Ver el borde del documento (lo que se exporta). Se recuerda en este navegador. */
  #showBounds = $state(readPref('svertik.bounds') !== 'off');
  get showBounds() {
    return this.#showBounds;
  }
  set showBounds(on: boolean) {
    this.#showBounds = on;
    writePref('svertik.bounds', on ? '' : 'off');
  }
  /** Caja de lo que hay dibujado (sin margen), en el documento: la escribe el lienzo al pintar. */
  contentBox = $state.raw<{ x: number; y: number; width: number; height: number } | null>(null);
  error = $state<string | null>(null);
  /** Script del panel de código (lo que va después de la escena en la pestaña JS). */
  script = $state(DEFAULT_SCRIPT);
  /** Objetos animados por el script mientras corre; no entran en el historial. */
  preview = $state<SceneNode[] | null>(null);
  // Código y línea de tiempo, uno u otro: reproduciendo, la escena cambia cada fotograma y el código
  // no se podría tocar. Abrir uno cierra el otro (y cerrar la línea de tiempo la para).
  #codeOpen = $state(false);
  #timelineOpen = $state(false);
  get codeOpen() {
    return this.#codeOpen;
  }
  set codeOpen(open: boolean) {
    this.#codeOpen = open;
    if (open) this.timelineOpen = false;
  }
  /** Línea de tiempo: abierta, instante actual (s) y reproducción. */
  get timelineOpen() {
    return this.#timelineOpen;
  }
  set timelineOpen(open: boolean) {
    this.#timelineOpen = open;
    if (open) this.#codeOpen = false;
    else this.playing = false;
  }
  /** Modo Play: la escena a pantalla completa, sin herramientas, con el reproductor del código exportado. */
  presenting = $state(false);
  time = $state(0);
  playing = $state(false);
  /** Fuentes que se pueden elegir en Text (las incluidas y, si se pidieron, las del sistema). */
  fonts = $state<string[]>([]);
  /** Sube cada vez que llega una fuente: el lienzo vuelve a dibujar el texto. */
  fontsTick = $state(0);
  /** Aviso para el usuario (lo muestra la app un momento). */
  notice = $state<string | null>(null);
  /** Información de cada nodo tras evaluar (caja de referencia, matriz…): la deja el lienzo. */
  infos = $state.raw<Map<string, NodeInfo>>(new Map());
  /** Herramienta de primitivas armada (se dibuja arrastrando en el lienzo). */
  tool = $state<string | null>(null);
  /** Punto que se está moviendo (fracción de la caja de origen); se borra al parar. */
  marker = $state<[number, number] | null>(null);
  #markerTimer: ReturnType<typeof setTimeout> | undefined;
  /** Se está cambiando un parámetro del efecto (desde el panel o el lienzo): su wire se ve encendido. */
  busy = $state(false);
  #busyTimer: ReturnType<typeof setTimeout> | undefined;

  #history: string[] = [];
  #lastPasted = '';
  #pastes = 0;
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
  /** Todos los nodos seleccionados (el principal primero), sin los que ya no existen. */
  selectedNodes = $derived.by(() => {
    if (!this.scene) return [] as SceneNode[];
    const ids = [this.currentNode?.id, ...this.also].filter((x): x is string => !!x);
    return [...new Set(ids)].map((id) => locateNode(this.scene!.objects, id)?.node).filter((n): n is SceneNode => !!n);
  });
  isSelected = (id: string) => this.#selected === id || this.also.includes(id);

  /** ⇧ + clic: añade o quita un nodo de la selección; el último añadido pasa a ser el principal. */
  toggleSelect(id: string) {
    const nodes = this.selectedNodes.map((n) => n.id);
    if (nodes.includes(id)) {
      const rest = nodes.filter((x) => x !== id);
      this.#selected = rest[0] ?? null;
      this.also = rest.slice(1);
    } else {
      this.#selected = id;
      this.also = nodes;
    }
  }

  /** Colores usados en el documento (primitivas, efectos y SVG importados), para las muestras del selector. */
  docColors = $derived.by(() => {
    if (!this.scene) return [] as string[];
    const out = new Set<string>();
    const hex = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi;
    const add = (v: unknown) => {
      if (typeof v !== 'string') return;
      for (const m of v.match(hex) ?? []) out.add(m.length === 4 ? `#${[...m.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : m.toLowerCase());
    };
    const fromStack = (list: ModifierInstance[]) => list.forEach((m) => { Object.values(m.params ?? {}).forEach(add); fromStack(m.children ?? []); });
    for (const { node } of walkNodes(this.scene.objects)) {
      if (node.kind === 'shape') Object.values(node.params).forEach(add);
      if (node.kind === 'object') add(node.source);
      fromStack(node.stack);
    }
    return [...out];
  });

  objectCount = $derived(this.scene ? [...walkNodes(this.scene.objects)].filter((x) => x.node.kind !== 'group').length : 0);

  // ── Origen

  /** Carga un SVG: si no hay escena, la crea; si la hay, lo añade como un objeto nuevo, centrado. */
  load(source: string, name: string) {
    this.error = null;
    if (!/<svg[\s>]/i.test(source)) {
      this.error = 'That is not an SVG.';
      return;
    }
    // El texto de un SVG no se puede deformar (no tiene contorno hasta que se dibuja con su fuente).
    if (/<text[\s>]/i.test(source)) this.notice = 'This SVG has text: convert it to outlines (paths) before importing, or it won’t be deformed.';
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

  // ── Utils

  /**
   * Instancia del nodo activo: una copia viva de su resultado, justo delante de él y un poco desplazada
   * (para que se vea), con su misma colocación y sin efectos propios.
   */
  addInstance(of = this.activeNode?.id ?? null) {
    const at = this.scene && of ? locateNode(this.scene.objects, of) : null;
    if (!at) return;
    const orig = at.node;
    const taken = new Set([...walkNodes(this.scene!.objects)].map((x) => x.node.name));
    let name = `${orig.name} instance`;
    for (let i = 2; taken.has(name); i++) name = `${orig.name} instance ${i}`;
    const p = placementOf(orig);
    const step = Math.max(10, Math.round(Math.max(this.contentBox?.width ?? 0, this.contentBox?.height ?? 0) * 0.05));
    const node: InstanceNode = {
      kind: 'instance',
      id: `instance-${uid()}`,
      name,
      of: orig.id,
      stack: [],
      transform: { ...orig.transform, x: p.x + step, y: p.y + step },
    };
    at.list.splice(at.index, 0, node);
    this.selected = node.id;
    this.record(true);
  }

  /**
   * Effector nuevo, arriba de la lista, con los objetos seleccionados como targets (puede empezar sin
   * ninguno). Queda seleccionado: los efectos que se añadan van a su pila.
   */
  addEffector() {
    if (!this.scene) return;
    const targets = this.selectedNodes.filter((n) => n.kind !== 'effector').map((n) => n.id);
    const taken = new Set([...walkNodes(this.scene.objects)].map((x) => x.node.name));
    let name = 'Effector';
    for (let i = 2; taken.has(name); i++) name = `Effector ${i}`;
    const node: EffectorNode = { kind: 'effector', id: `effector-${uid()}`, name, targets, stack: [] };
    this.scene.objects.unshift(node);
    this.selected = node.id;
    this.record(true);
  }

  /**
   * Connector: una línea (con su trazo) que une los dos primeros objetos seleccionados y los sigue (efecto
   * Connect). Arriba de la lista; con menos de dos, los que falten se eligen luego en el efecto.
   */
  addConnector() {
    if (!this.scene) return;
    const [from, to] = this.selectedNodes.filter((n) => n.kind !== 'effector').map((n) => n.id);
    const def = shapeRegistry.get('line');
    if (!def) return;
    const taken = new Set([...walkNodes(this.scene.objects)].map((x) => x.node.name));
    let name = 'Connector';
    for (let i = 2; taken.has(name); i++) name = `Connector ${i}`;
    const cdef = registry.get('connect')!;
    const node: ShapeNode = {
      kind: 'shape',
      id: `line-${uid()}`,
      name,
      shape: 'line',
      params: { ...resolveParams(def.params), strokeWidth: 2 },
      stack: [{ id: `connect-${uid()}`, type: 'connect', enabled: true, params: { ...resolveParams(cdef.params), from: from ?? '', to: to ?? '' } }],
    };
    this.scene.objects.unshift(node);
    this.selected = node.stack[0]!.id;
    this.record(true);
  }

  /** Tracer: una línea que dibuja la estela del objeto activo al animarse (efecto Trace), detrás de él. */
  addTracer() {
    const at = this.scene && this.activeNode ? locateNode(this.scene.objects, this.activeNode.id) : null;
    if (!at) return;
    const def = shapeRegistry.get('line');
    const tdef = registry.get('trace');
    if (!def || !tdef) return;
    const taken = new Set([...walkNodes(this.scene!.objects)].map((x) => x.node.name));
    let name = `${at.node.name} trace`;
    for (let i = 2; taken.has(name); i++) name = `${at.node.name} trace ${i}`;
    const node: ShapeNode = {
      kind: 'shape',
      id: `line-${uid()}`,
      name,
      shape: 'line',
      params: { ...resolveParams(def.params), strokeWidth: 2 },
      stack: [{ id: `trace-${uid()}`, type: 'trace', enabled: true, params: { ...resolveParams(tdef.params), target: at.node.id } }],
    };
    // Detrás del objeto (la estela no lo tapa), en la lista de arriba (fuera de grupos).
    const top = this.scene!.objects;
    const root = at.parent ? top.findIndex((n) => !!locateNode([n], at.node.id)) : at.index;
    top.splice(root + 1, 0, node);
    this.selected = node.stack[0]!.id;
    this.record(true);
  }

  /** Añade (o quita) un target de un Effector. */
  setEffectorTarget(id: string, target: string, on: boolean) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'effector' || target === id) return;
    const has = at.node.targets.includes(target);
    if (on === has) return;
    at.node.targets = on ? [...at.node.targets, target] : at.node.targets.filter((x) => x !== target);
    this.record(true);
  }

  /** Retraso entre un target y el siguiente (segundos). */
  setEffectorDelay(id: string, delay: number, now = false) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'effector') return;
    const d = Math.max(0, Math.round(delay * 1000) / 1000);
    if (d) at.node.delay = d;
    else delete at.node.delay;
    this.record(now);
  }

  /** Cambia el original de una instancia. */
  setInstanceOf(id: string, of: string) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'instance' || at.node.of === of || id === of) return;
    at.node.of = of;
    this.record(true);
  }

  /** Un parámetro de una primitiva. */
  /** Cambia un parámetro de una primitiva sin pasar por el historial (al escribir en el lienzo: luego, uno solo). */
  previewShapeParam(id: string, name: string, value: unknown) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (at?.node.kind === 'shape') at.node.params[name] = value;
  }
  /** Texto que se está editando sobre el lienzo (id del nodo), o null. */
  editingText = $state<string | null>(null);

  setShapeParam(id: string, name: string, value: unknown) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    at.node.params[name] = value;
    this.#autoKey({ node: id, on: 'shape', param: name }, value);
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

  /** Tamaño del documento: fijo (centrado donde se diga) o null, que se ajusta a lo que haya. */
  setDocument(size: { width: number; height: number; x?: number; y?: number } | null, commit = true) {
    if (!this.scene) return;
    if (size) {
      const r = (v: number) => Math.round(v * 100) / 100;
      const { width, height, x = this.scene.document?.x ?? 0, y = this.scene.document?.y ?? 0 } = size;
      this.scene.document = { width: Math.max(1, r(width)), height: Math.max(1, r(height)), ...(x ? { x: r(x) } : {}), ...(y ? { y: r(y) } : {}) };
    } else delete this.scene.document;
    this.record(commit);
  }
  /** Documento del tamaño de lo dibujado y centrado en ello (sin mover nada). */
  fitDocument() {
    const b = this.contentBox;
    if (!b || b.width <= 0 || b.height <= 0) return;
    this.setDocument({ width: Math.ceil(b.width), height: Math.ceil(b.height), x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }

  setCanvas(color: string) {
    this.canvas = color;
    // Preferencia del usuario: se recuerda entre documentos y sesiones (en este navegador).
    writePref('svertik.canvas', color);
    this.record();
  }

  // ── Nodos

  isCollapsed = (id: string) => this.collapsed.includes(id);
  /** Plegar o desplegar todo el panel Stack: objetos, grupos y contenedores (Step…). */
  setAllCollapsed(collapse: boolean) {
    if (!collapse || !this.scene) {
      this.collapsed = [];
      return;
    }
    const ids: string[] = [];
    const mods = (list: ModifierInstance[]) => list.forEach((m) => m.children && (ids.push(m.id), mods(m.children)));
    for (const { node } of walkNodes(this.scene.objects)) {
      if (node.stack.length || node.kind === 'group') ids.push(node.id);
      mods(node.stack);
    }
    this.collapsed = ids;
  }
  toggleCollapsed(id: string, expanded: boolean) {
    this.collapsed = expanded ? this.collapsed.filter((x) => x !== id) : [...this.collapsed, id];
  }

  /** Mete el nodo seleccionado en un grupo nuevo, en su mismo sitio. */
  /** Convierte la primitiva (un texto, una forma) en un objeto de trazados, en su sitio y con sus efectos. */
  outline(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    const r = outlineNode(this.scene, id);
    if (!r) return;
    this.selected = id;
    if (r.removed) this.notice = `Converted to outlines. ${r.removed === 1 ? 'One animation of its shape was' : `${r.removed} animations of its shape were`} removed (Undo brings it back).`;
    this.#applyTime();
    this.record(true);
  }

  // ── Pack: congelar un nodo en su resultado (y desempaquetarlo)

  /** El nodo activo es un paquete. */
  get packed() {
    const n = this.activeNode;
    return n?.kind === 'object' && !!n.packed;
  }
  #packEngine: ReturnType<typeof createEngine> | null = null;
  /** Empaqueta el nodo activo: se queda su resultado, sin calcular nada más; el original va dentro. */
  pack(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    this.flush();
    const engine = (this.#packEngine ??= createEngine(builtins));
    const doc = engine.evaluateDocument($state.snapshot(this.scene) as SceneV2);
    const r = packNode(this.scene, id, doc, uid());
    if (!r) return;
    this.selected = r.node.id;
    this.also = [];
    if (r.animated) this.notice = 'Packed at this frame: its animation stays inside and plays again when you unpack it.';
    this.#applyTime();
    this.record(true);
  }
  /** Desempaqueta: vuelve el original, con lo que se haya movido el paquete y sus efectos encima. */
  unpack(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    const back = unpackNode(this.scene, id, (old) => `${old.replace(/-[a-z0-9]{6}$/, '')}-${uid()}`);
    if (!back) return;
    this.selected = back;
    this.also = [];
    this.#applyTime();
    this.record(true);
  }

  group(id = this.activeNode?.id ?? null) {
    const many = this.selectedNodes;
    if (this.scene && many.length > 1 && id === this.currentNode?.id) {
      const locs = many.map((n) => locateNode(this.scene!.objects, n.id)!).filter(Boolean);
      // Solo los que comparten lista con el principal; en el orden de la lista.
      const same = locs.filter((l) => l.list === locs[0]!.list).sort((a, b) => a.index - b.index);
      if (same.length > 1) {
        const g: GroupNode = { kind: 'group', id: `group-${uid()}`, name: 'Group', stack: [], children: same.map((l) => l.node) };
        const list = same[0]!.list;
        const first = same[0]!.index;
        for (const l of [...same].reverse()) list.splice(l.index, 1);
        list.splice(first, 0, g);
        this.selected = g.id;
        this.record(true);
        return;
      }
    }
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
  setNode(id: string, key: 'x' | 'y' | 'scale' | 'rotation' | 'flipX' | 'flipY' | 'opacity' | 'visible' | 'name' | 'blend', value: unknown, now = false) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at) return;
    const n = at.node;
    if (key === 'opacity') n.opacity = value as number;
    else if (key === 'visible') n.visible = value as boolean;
    else if (key === 'name') n.name = String(value);
    else if (key === 'blend') {
      if (value === 'normal') delete n.blend;
      else n.blend = value as BlendMode;
    }
    else n.transform = { ...n.transform, [key]: value as number };
    if (key === 'x' || key === 'y' || key === 'scale' || key === 'rotation' || key === 'opacity') this.#autoKey({ node: id, on: 'node', param: key }, value);
    this.record(now);
  }

  /** Mueve varios nodos a la vez (alinear, distribuir, arrastrar una selección): un solo paso de historial. */
  moveNodes(moves: { id: string; dx: number; dy: number }[], now = true) {
    if (!this.scene) return;
    const r = (n: number) => Math.round(n * 100) / 100;
    for (const { id, dx, dy } of moves) {
      const n = locateNode(this.scene.objects, id)?.node;
      if (!n || (dx === 0 && dy === 0)) continue;
      n.transform = { ...n.transform, x: r((n.transform?.x ?? 0) + dx), y: r((n.transform?.y ?? 0) + dy) };
    }
    this.record(now);
  }

  /**
   * Mueve el centro de transformación sin que el objeto salte: compensa la posición con
   * (giro·escala·reflejo − identidad) por lo que se movió el pivote.
   */
  setPivot(id: string, pivot: [number, number], now = false) {
    const n = this.scene ? locateNode(this.scene.objects, id)?.node : undefined;
    const ref = this.infos.get(id)?.bounds;
    if (!n || !ref) return;
    const p = placementOf(n);
    const [ox, oy] = p.pivot ?? [0.5, 0.5];
    const d = [(pivot[0] - ox) * ref.width, (pivot[1] - oy) * ref.height] as const;
    const L = linearOf(p);
    // Más precisión que al mover: al arrastrar el pivote se compensa en cada paso y el redondeo se acumularía.
    const r = (v: number) => Math.round(v * 10000) / 10000;
    const k = (v: number) => Math.round(v * 1000) / 1000;
    n.transform = {
      ...n.transform,
      x: r(p.x + (L[0] - 1) * d[0] + L[2] * d[1]),
      y: r(p.y + L[1] * d[0] + (L[3] - 1) * d[1]),
      pivot: [k(pivot[0]), k(pivot[1])],
    };
    this.record(now);
  }

  /**
   * Orden de los seleccionados dentro de su lista (el primero de la lista, delante): al frente, subir,
   * bajar o al fondo. Con varios, se mueven todos y conservan su orden entre ellos.
   */
  reorder(how: 'front' | 'forward' | 'backward' | 'back') {
    if (!this.scene || !this.selectedNodes.length) return;
    // Por listas (cada uno, en su grupo).
    const lists = new Map<SceneNode[], SceneNode[]>();
    for (const n of this.selectedNodes) {
      const at = locateNode(this.scene.objects, n.id);
      if (at) lists.set(at.list, [...(lists.get(at.list) ?? []), n]);
    }
    for (const [list, picked] of lists) {
      const set = new Set(picked);
      if (how === 'front' || how === 'back') {
        const rest = list.filter((n) => !set.has(n));
        const moving = list.filter((n) => set.has(n));
        list.splice(0, list.length, ...(how === 'front' ? [...moving, ...rest] : [...rest, ...moving]));
      } else if (how === 'forward') {
        // Hacia delante = hacia el principio de la lista; uno a uno, sin saltarse a otro seleccionado.
        for (let i = 1; i < list.length; i++) if (set.has(list[i]!) && !set.has(list[i - 1]!)) [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
      } else {
        for (let i = list.length - 2; i >= 0; i--) if (set.has(list[i]!) && !set.has(list[i + 1]!)) [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
      }
    }
    this.record(true);
  }

  /** Voltea los nodos seleccionados (cada uno alrededor de su centro). */
  flip(axis: 'x' | 'y') {
    if (!this.scene || !this.selectedNodes.length) return;
    const key = axis === 'x' ? 'flipX' : 'flipY';
    for (const n of this.selectedNodes) n.transform = { ...n.transform, [key]: !n.transform?.[key] };
    this.record(true);
  }

  /** Quita todos los nodos seleccionados (o el modificador seleccionado). */
  removeSelection() {
    const nodes = this.selectedNodes;
    if (nodes.length < 2) return this.remove();
    for (const n of nodes) {
      const at = this.scene ? locateNode(this.scene.objects, n.id) : null;
      at?.list.splice(at.index, 1);
    }
    this.selected = this.scene?.objects[0]?.id ?? null;
    if (this.objectCount === 0) {
      this.scene = null;
      this.selected = null;
    }
    this.record(true);
  }

  /**
   * Barra rápida de booleanos: con varios seleccionados, los agrupa y les pone Boolean en ese modo.
   * Con un grupo que ya tiene Boolean, solo le cambia el modo (no apila otro). El grupo queda seleccionado.
   */
  booleanize(mode: string) {
    if (!this.scene) return;
    if (this.selectedNodes.length > 1) this.group();
    const g = this.currentNode;
    if (!g || g.kind !== 'group') return;
    const existing = g.stack.find((m) => m.type === 'boolean');
    if (existing) existing.params = { ...existing.params, mode };
    else {
      this.add('boolean');
      if (this.current?.type === 'boolean') this.current.params = { ...this.current.params, mode };
    }
    // El grupo queda seleccionado: la barra sigue a mano para probar otro modo.
    this.selected = g.id;
    this.record(true);
  }

  // ── Animación: las claves viven en scene.animation; el valor del instante actual se escribe en la escena
  // (sin historial), así panel, lienzo y actuadores leen siempre «lo que se ve ahora».

  get animation(): Animation | null {
    return this.scene?.animation ?? null;
  }
  #ensureAnimation(): Animation {
    const s = this.scene!;
    s.animation ??= { duration: 3, loop: true, fps: 30, tracks: [] };
    return s.animation;
  }
  /** La pista de un parámetro, si está animado. */
  track(t: TrackTarget): Track | undefined {
    return this.animation?.tracks.find((x) => x.node === t.node && x.on === t.on && x.param === t.param && (x.modifier ?? '') === (t.modifier ?? ''));
  }
  /** Estado del rombo de un parámetro: sin animar, animado o con clave en este instante. */
  keyState(t: TrackTarget): 'none' | 'animated' | 'key' {
    const tr = this.track(t);
    if (!tr) return 'none';
    const eps = 0.5 / (this.animation?.fps ?? 30);
    return tr.keys.some((k) => Math.abs(k.t - this.time) <= eps) ? 'key' : 'animated';
  }
  /**
   * Rombo: sin animar, empieza a animarlo con una clave aquí; con clave aquí, la quita (y si era la última,
   * deja de estar animado); animado sin clave aquí, pone una con el valor actual.
   */
  toggleKey(t: TrackTarget) {
    if (!this.scene) return;
    const anim = this.#ensureAnimation();
    const tr = this.track(t);
    const fps = anim.fps ?? 30;
    if (!tr) {
      anim.tracks.push({ id: `track-${uid()}`, ...t, keys: [{ t: this.time, value: $state.snapshot(readTarget(this.scene, t) as object) ?? readTarget(this.scene, t) }] });
    } else if (this.keyState(t) === 'key') {
      tr.keys = tr.keys.filter((k) => Math.abs(k.t - this.time) > 0.5 / fps);
      if (!tr.keys.length) anim.tracks = anim.tracks.filter((x) => x !== tr);
    } else {
      tr.keys = setKey(tr.keys, this.time, $state.snapshot(readTarget(this.scene, t) as object) ?? readTarget(this.scene, t), fps);
    }
    this.record(true);
  }
  /** Al cambiar un valor animado desde el panel o el lienzo: clave en el instante actual. */
  #autoKey(t: TrackTarget, value: unknown) {
    // Reproduciendo, los cambios vienen de la propia animación: nunca son claves nuevas.
    if (this.playing) return;
    const tr = this.track(t);
    if (!tr) return;
    tr.keys = setKey(tr.keys, this.time, $state.snapshot(value as object) ?? value, this.animation?.fps ?? 30);
  }
  /** Ir a un instante: escribe en la escena el valor de cada pista (sin historial). */
  setTime(t: number) {
    const anim = this.animation;
    const d = anim?.duration ?? 0;
    this.time = Math.max(0, Math.min(d || t, t));
    this.#applyTime();
  }
  #applyTime() {
    if (!this.scene?.animation) return;
    const sampled = sampleScene($state.snapshot(this.scene) as SceneV2, this.time);
    for (const tr of this.scene.animation.tracks) {
      const v = readTarget(sampled, tr);
      writeTrackTarget(this.scene, tr, v);
    }
  }
  setDuration(d: number) {
    const anim = this.#ensureAnimation();
    anim.duration = Math.max(0.1, d);
    if (this.time > anim.duration) this.setTime(anim.duration);
    this.record();
  }
  setLoop(loop: boolean) {
    this.#ensureAnimation().loop = loop;
    this.record(true);
  }
  /** Repeticiones de una pista: cuántas veces (1, sin repetir; 0, sin parar) y cada cuánto (sin él, seguidas). */
  setRepeat(trackId: string, repeat: number, every?: number) {
    const tr = this.animation?.tracks.find((x) => x.id === trackId);
    if (!tr) return;
    const n = Math.max(0, Math.round(repeat));
    if (n === 1) {
      delete tr.repeat;
      delete tr.every;
    } else {
      tr.repeat = n;
      if (every && every > 0) tr.every = every;
      else delete tr.every;
    }
    this.#applyTime();
    this.record(true);
  }
  /** Mueve una clave a otro instante (arrastrándola en la línea de tiempo). */
  /** Devuelve el instante en que queda (redondeado), que es por el que se la vuelve a buscar. */
  moveKey(trackId: string, from: number, to: number): number {
    const tr = this.animation?.tracks.find((x) => x.id === trackId);
    const k = tr?.keys.find((x) => x.t === from);
    if (!tr || !k) return from;
    const d = this.animation!.duration;
    const t = Math.round(Math.max(0, Math.min(d, to)) * 1000) / 1000;
    // No se pisa otra clave de la misma pista.
    if (tr.keys.some((x) => x !== k && x.t === t)) return from;
    k.t = t;
    tr.keys.sort((a, b) => a.t - b.t);
    this.#applyTime();
    this.record();
    return t;
  }
  setEase(trackId: string, at: number, e: Ease) {
    const k = this.animation?.tracks.find((x) => x.id === trackId)?.keys.find((x) => x.t === at);
    if (!k) return;
    k.ease = e;
    this.#applyTime();
    this.record(true);
  }
  removeKey(trackId: string, at: number) {
    const anim = this.animation;
    const tr = anim?.tracks.find((x) => x.id === trackId);
    if (!anim || !tr) return;
    tr.keys = tr.keys.filter((k) => k.t !== at);
    if (!tr.keys.length) anim.tracks = anim.tracks.filter((x) => x !== tr);
    this.#applyTime();
    this.record(true);
  }
  removeTrack(trackId: string) {
    const anim = this.animation;
    if (!anim) return;
    anim.tracks = anim.tracks.filter((x) => x.id !== trackId);
    this.record(true);
  }

  /**
   * Presets de entrada y salida: un Stagger con sus efectos y dos claves de
   * Progress (0 → 1 en la duración de la animación). Se aplican al objeto activo y se editan como cualquier otra cosa.
   */
  applyPreset(name: PresetName) {
    const node = this.activeNode;
    if (!this.scene || !node) return;
    const h = this.infos.get(node.id)?.box.height || 100;
    const r = (v: number) => Math.round(v);
    const mod = (type: string, params: Record<string, unknown>): ModifierInstance => ({ id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(registry.get(type)!.params), ...params } });
    const fade = () => mod('opacity', { opacity: 0 });
    const P: Record<PresetName, { stagger: Record<string, unknown>; children: ModifierInstance[] }> = {
      rise: { stagger: { ease: 'expo-out', stagger: 0.6 }, children: [mod('transform', { y: r(h * 0.6) }), fade()] },
      cascade: { stagger: { ease: 'back-out', stagger: 0.7 }, children: [mod('transform', { y: r(-h * 0.8), rotation: -20 }), fade()] },
      flip: { stagger: { ease: 'ease-out', stagger: 0.6 }, children: [mod('rotate3d', { rotateX: 90, rotateY: 0, rotateZ: 0 }), fade()] },
      spring: { stagger: { ease: 'elastic-out', stagger: 0.5 }, children: [mod('transform', { scale: 0 })] },
      scatter: { stagger: { ease: 'expo-out', stagger: 0.3, order: 'random' }, children: [mod('explosion', { amount: 1, force: 1, spin: 180, shrink: 0.5 }), fade()] },
      fall: { stagger: { ease: 'ease-in', stagger: 0.6, direction: 'out' }, children: [mod('transform', { y: r(h * 1.2), rotation: 25 }), fade()] },
    };
    const preset = P[name];
    const st = mod('stagger', { ...preset.stagger, progress: 0 });
    st.children = preset.children;
    node.stack.push(st);
    const anim = this.#ensureAnimation();
    anim.tracks.push({ id: `track-${uid()}`, node: node.id, on: 'modifier', modifier: st.id, param: 'progress', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: anim.duration, value: 1 }] });
    this.collapsed = this.collapsed.filter((x) => x !== node.id && x !== st.id);
    this.selected = st.id;
    this.timelineOpen = true;
    this.setTime(0);
    this.record(true);
  }

  // ── Interacciones (hover y clic): viven en scene.interactions

  /** Los valores que una interacción de este nodo puede cambiar: colocación y números, ángulos y colores de sus efectos. */
  interactionTargets(nodeId: string): { label: string; target: TrackTarget; kind: 'number' | 'angle' | 'color' }[] {
    const n = this.scene ? locateNode(this.scene.objects, nodeId)?.node : undefined;
    if (!n) return [];
    const out: { label: string; target: TrackTarget; kind: 'number' | 'angle' | 'color' }[] = [
      { label: 'Position X', target: { node: nodeId, on: 'node', param: 'x' }, kind: 'number' },
      { label: 'Position Y', target: { node: nodeId, on: 'node', param: 'y' }, kind: 'number' },
      { label: 'Scale', target: { node: nodeId, on: 'node', param: 'scale' }, kind: 'number' },
      { label: 'Rotation', target: { node: nodeId, on: 'node', param: 'rotation' }, kind: 'angle' },
      { label: 'Opacity', target: { node: nodeId, on: 'node', param: 'opacity' }, kind: 'number' },
    ];
    const walk = (list: ModifierInstance[]) => {
      for (const m of list) {
        const def = registry.get(m.type);
        for (const [name, spec] of Object.entries(def?.params ?? {})) {
          if (spec.animatable === false || (spec.type !== 'number' && spec.type !== 'angle' && spec.type !== 'color')) continue;
          out.push({ label: `${def!.label} · ${spec.label ?? name}`, target: { node: nodeId, on: 'modifier', modifier: m.id, param: name }, kind: spec.type });
        }
        walk(m.children ?? []);
      }
    };
    walk(n.stack);
    return out;
  }
  addInteraction(nodeId: string) {
    if (!this.scene) return;
    // Primero se crea la lista y luego se lee de la escena: así se usa la versión reactiva (no la copia).
    this.scene.interactions ??= [];
    this.scene.interactions.push({ id: `int-${uid()}`, node: nodeId, trigger: 'hover', target: { node: nodeId, on: 'node', param: 'scale' }, to: 1.2, duration: 0.3, ease: 'back-out' });
    this.record(true);
  }
  /** Los efectos del nodo (para «toggle» y «seed»): con su nombre y si tienen semilla. */
  interactionEffects(nodeId: string): { id: string; label: string; hasSeed: boolean }[] {
    const n = this.scene ? locateNode(this.scene.objects, nodeId)?.node : undefined;
    const out: { id: string; label: string; hasSeed: boolean }[] = [];
    const walk = (list: ModifierInstance[]) => {
      for (const m of list) {
        const def = registry.get(m.type);
        const same = out.filter((x) => x.label.startsWith(def?.label ?? m.type)).length;
        out.push({ id: m.id, label: `${def?.label ?? m.type}${same ? ` ${same + 1}` : ''}`, hasSeed: !!def && Object.values(def.params).some((p) => p.type === 'seed') });
        walk(m.children ?? []);
      }
    };
    walk(n?.stack ?? []);
    return out;
  }
  /** Cambia lo que hace una interacción, con valores de partida razonables para la nueva acción. */
  setInteractionAction(id: string, action: 'tween' | 'play' | 'seed' | 'toggle') {
    const it = this.scene?.interactions?.find((x) => x.id === id);
    if (!it) return;
    it.action = action;
    if (action === 'play') it.segment = it.segment ?? [0, this.animation?.duration ?? 3];
    if (action === 'seed' || action === 'toggle') {
      const fx = this.interactionEffects(it.node);
      const pick = action === 'seed' ? fx.find((x) => x.hasSeed) : fx[0];
      it.target = { node: it.node, on: 'modifier', modifier: pick?.id, param: action === 'seed' ? 'seed' : '' };
    }
    if (action === 'tween') it.target = { node: it.node, on: 'node', param: 'scale' };
    this.record(true);
  }
  setAutoplay(on: boolean) {
    this.#ensureAnimation().autoplay = on;
    this.record(true);
  }
  updateInteraction(id: string, patch: Partial<Interaction>) {
    const it = this.scene?.interactions?.find((x) => x.id === id);
    if (!it) return;
    Object.assign(it, patch);
    this.record();
  }
  removeInteraction(id: string) {
    if (!this.scene?.interactions) return;
    this.scene.interactions = this.scene.interactions.filter((x) => x.id !== id);
    this.record(true);
  }

  // ── Copiar y pegar (el portapapeles lleva JSON con la marca `svertik`)

  /** Lo seleccionado, listo para el portapapeles: nodos (con sus pilas) o un efecto. */
  copySelection(): string | null {
    if (!this.scene) return null;
    if (this.current) return JSON.stringify({ svertik: 1, kind: 'modifiers', items: [$state.snapshot(this.current)] });
    const nodes = this.selectedNodes;
    if (!nodes.length) return null;
    // En el orden de la lista (el primero, delante), para pegarlos igual.
    const order = [...walkNodes(this.scene.objects)].map((x) => x.node.id);
    const sorted = [...nodes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    return JSON.stringify({ svertik: 1, kind: 'nodes', items: sorted.map((n) => $state.snapshot(n)) });
  }

  /** Pega lo copiado (`offset`: cuánto se desplaza; 0, en el mismo sitio). Devuelve false si el texto no es del portapapeles de svertik. */
  paste(text: string, offset = 16): boolean {
    let data: { svertik?: number; kind?: string; items?: unknown[] };
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    if (data?.svertik !== 1 || !Array.isArray(data.items) || !data.items.length) return false;
    if (data.kind === 'modifiers') {
      const owner = this.activeNode;
      if (!this.scene || !owner) return true;
      const items = (data.items as ModifierInstance[]).map(freshModifier);
      const at = locate(owner.stack, this.selected);
      // Debajo del efecto seleccionado (en su misma lista), o al final de la pila.
      const list = at ? at.list : owner.stack;
      list.splice(at ? at.index + 1 : list.length, 0, ...items);
      this.selected = items[0]!.id;
      this.record(true);
      return true;
    }
    if (data.kind !== 'nodes') return false;
    // Pegar lo mismo otra vez: cada copia, un paso más allá (no todas en el mismo sitio).
    this.#pastes = this.#lastPasted === text ? this.#pastes + 1 : 1;
    this.#lastPasted = text;
    offset *= this.#pastes;
    // Si el nombre ya existe: «Name copy», «Name copy 2», «Name copy 3»… (de «Name copy» sale «Name copy 2»).
    const taken = new Set(this.scene ? [...walkNodes(this.scene.objects)].map((x) => x.node.name) : []);
    const items = (data.items as SceneNode[]).map(freshNode).map((n) => {
      n.transform = { ...n.transform, x: (n.transform?.x ?? 0) + offset, y: (n.transform?.y ?? 0) + offset };
      if (taken.has(n.name)) {
        const base = n.name.replace(/ copy( \d+)?$/, '');
        let name = `${base} copy`;
        for (let i = 2; taken.has(name); i++) name = `${base} copy ${i}`;
        n.name = name;
      }
      taken.add(n.name);
      return n;
    });
    if (!this.scene) {
      this.scene = { version: 2, objects: items };
      this.#history = [];
      this.#index = -1;
    } else {
      // Encima del primer seleccionado (en su lista), o arriba del todo.
      const first = this.selectedNodes[0];
      const at = first ? locateNode(this.scene.objects, first.id) : null;
      (at ? at.list : this.scene.objects).splice(at ? at.index : 0, 0, ...items);
    }
    this.selected = items[0]!.id;
    this.also = items.slice(1).map((n) => n.id);
    this.record(true);
    return true;
  }

  /** Duplica lo seleccionado (⌘D), sin pasar por el portapapeles. */
  duplicate() {
    const text = this.copySelection();
    if (!text) return;
    this.#lastPasted = '';
    this.paste(text);
  }

  // ── Pila del nodo activo

  add(type: string) {
    // Boolean con varios objetos seleccionados: primero se agrupan (Boolean trabaja con los hijos de un grupo).
    if (type === 'boolean' && this.selectedNodes.length > 1 && !this.current) this.group();
    const def = registry.get(type);
    const owner = this.activeNode;
    if (!this.scene || !def || !owner) return;
    const inst: ModifierInstance = { id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(def.params) } };
    if (containers.has(type)) inst.children = [];
    const stack = owner.stack;
    const at = locate(stack, this.selected);
    if (at && canNest(at.inst.type, type)) {
      // Con Step (o RGB Split) seleccionado: dentro, al final.
      at.inst.children ??= [];
      at.inst.children.push(inst);
    } else if (at) {
      // Debajo del seleccionado, en su misma lista si lo admite; si no, se sube de nivel (un Step dentro de
      // un Step va debajo del de fuera).
      let cur = at;
      while (cur.parent && !canNest(cur.parent.type, type)) cur = locate(stack, cur.parent.id)!;
      cur.list.splice(cur.index + 1, 0, inst);
    } else {
      // Con el nodo seleccionado: al final de su pila.
      stack.push(inst);
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
  /**
   * Mueve un modificador a cualquier sitio: dentro de `parentId` (un Step) o arriba, en la pila de
   * `ownerId` (por defecto, la de su nodo; puede ser otro objeto). Con `copy`, deja el original y pone
   * una copia (ids nuevos) en el destino.
   */
  moveTo(id: string, parentId: string | null, index: number, ownerId?: string, copy = false) {
    if (!this.scene) return;
    const at = locateModifier(this.scene, id);
    if (!at || id === parentId) return;
    // Ni dentro de algo que no lo admite, ni dentro de sí mismo (o de lo que lleva dentro).
    if (parentId && at.inst.children && locate(at.inst.children, parentId)) return;
    const owner = ownerId ? locateNode(this.scene.objects, ownerId)?.node : at.owner;
    if (!owner) return;
    const stack = owner.stack;
    const target = parentId ? locate(stack, parentId)?.inst : null;
    if (parentId && (!target || !canNest(target.type, at.inst.type))) return;
    if (target) target.children ??= [];
    const list = target ? target.children! : stack;
    let m: ModifierInstance;
    let i = index;
    if (copy) m = freshModifier($state.snapshot(at.inst) as ModifierInstance);
    else {
      [m] = at.list.splice(at.index, 1) as [ModifierInstance];
      if (list === at.list && index > at.index) i = index - 1;
    }
    list.splice(Math.max(0, Math.min(list.length, i)), 0, m);
    this.selected = m.id;
    this.collapsed = this.collapsed.filter((x) => x !== owner.id);
    this.record(true);
  }

  setParam(name: string, value: unknown) {
    if (!this.current?.params) return;
    this.current.params[name] = value;
    const owner = this.activeNode;
    if (owner) this.#autoKey({ node: owner.id, on: 'modifier', modifier: this.current.id, param: name }, value);
    if (registry.get(this.current.type)?.params[name]?.type === 'point') this.showMarker(value as [number, number]);
    this.busy = true;
    clearTimeout(this.#busyTimer);
    this.#busyTimer = setTimeout(() => (this.busy = false), 400);
    this.record();
  }

  /** Sustituye la escena entera (desde el panel de código). Devuelve false si no cambia nada. */
  applyScene(v2: SceneV2) {
    if (!this.scene) return false;
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
    const at = this.scene ? locateModifier(this.scene, id) : null;
    if (!at) return;
    at.inst.enabled = enabled;
    // Si está animado, el cambio es una clave en este instante.
    this.#autoKey({ node: at.owner.id, on: 'modifier', modifier: id, param: 'enabled' }, enabled);
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

  /** A cero: números y ángulos a 0 (o a su neutro / mínimo). */
  zero(id = this.selected) {
    const m = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    const def = m && registry.get(m.type);
    if (!m || !def) return;
    m.params = zeroParams(def.params, resolveParams(def.params, m.params));
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

  /**
   * Lo que se anima o se dispara sobre algo que ya no existe (un efecto o un objeto borrado) sobra:
   * sus pistas y sus interacciones se van con él.
   */
  #prune() {
    const scene = this.scene;
    if (!scene) return;
    const alive = (t: { node: string; on?: string; modifier?: string }) =>
      !!locateNode(scene.objects, t.node) && (t.on !== 'modifier' || !t.modifier || !!locateModifier(scene, t.modifier));
    const anim = scene.animation;
    if (anim && anim.tracks.some((t) => !alive(t))) anim.tracks = anim.tracks.filter(alive);
    const list = scene.interactions;
    if (list && list.some((x) => !alive({ node: x.node }) || !alive(x.target))) scene.interactions = list.filter((x) => alive({ node: x.node }) && alive(x.target));
  }

  record(now = false) {
    clearTimeout(this.#timer);
    const push = () => {
      this.#pending = false;
      this.#prune();
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

  // ── Proyecto: todo en un archivo (.svrtk) para guardarlo y volver a abrirlo

  /** El proyecto entero como texto: objetos (con sus SVG), pilas, animación, script, nombre y lienzo. */
  // ── Guardado: qué se perdería al empezar otro archivo

  #saved: string | undefined;
  /** Lo de ahora queda como guardado (al guardar, abrir un proyecto o una demo). */
  markSaved() {
    this.flush();
    this.#saved = this.#history[this.#index];
  }
  /** Hay cambios sin guardar: una escena distinta de la última guardada o abierta. */
  get dirty() {
    this.flush();
    return !!this.scene && this.#history[this.#index] !== this.#saved;
  }
  /** Archivo nuevo: lienzo vacío, sin historial. */
  newFile() {
    this.scene = null;
    this.name = 'untitled';
    this.script = DEFAULT_SCRIPT;
    this.selected = null;
    this.also = [];
    this.time = 0;
    this.playing = false;
    this.timelineOpen = false;
    this.codeOpen = false;
    this.error = null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    this.markSaved();
  }

  projectFile(): string | null {
    if (!this.scene) return null;
    return JSON.stringify(
      { svertik: 'project', version: 1, name: this.name, canvas: this.canvas || undefined, script: this.script, scene: $state.snapshot(this.scene) },
      null,
      2,
    );
  }

  /** Abre un proyecto guardado. Devuelve false si el texto no es un proyecto de svertik. */
  openProject(text: string): boolean {
    let data: { svertik?: string; name?: string; canvas?: string; script?: string; scene?: unknown };
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    // También vale el JSON de la escena a secas («Copy JSON»).
    const scene = data?.svertik === 'project' ? data.scene : data;
    if (!isScene(scene)) return false;
    const report = validateScene(scene, builtins);
    if (report.errors.length) {
      console.error('svertik: the project cannot be opened:', report.errors);
      return false;
    }
    if (report.warnings.length) console.warn(`svertik: ${report.warnings.length} problem(s) in the project:\n${report.warnings.join('\n')}`);
    this.scene = scene;
    // Las primitivas, con todos sus parámetros (los que falten, por defecto): el panel los necesita.
    for (const { node } of walkNodes(this.scene.objects)) {
      const def = node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
      if (node.kind === 'shape' && def) node.params = { ...resolveParams(def.params), ...node.params };
    }
    this.name = data.name ?? 'untitled';
    if (data.canvas) this.canvas = data.canvas;
    this.script = data.script ?? DEFAULT_SCRIPT;
    this.selected = this.scene.objects[0]?.id ?? null;
    this.time = 0;
    this.playing = false;
    this.#history = [];
    this.#index = -1;
    this.#applyTime();
    this.record(true);
    this.markSaved();
    return true;
  }

  // ── URL

  /** Lo último que quedó guardado en la URL (el estado del historial), o nada si no cabía. */
  #inURL: string | undefined;
  async saveToURL() {
    if (!this.scene) {
      history.replaceState(null, '', `${location.pathname}${location.search}`);
      return;
    }
    this.flush();
    const state = this.#history[this.#index];
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as SceneV2, name: this.name, script: this.script, ...(this.canvas ? { canvas: this.canvas } : {}) });
    const fits = encoded.length < MAX_HASH;
    history.replaceState(null, '', `${location.pathname}${location.search}${fits ? `#s=${encoded}` : ''}`);
    this.#inURL = fits ? state : undefined;
  }
  /**
   * Cerrar la pestaña perdería algo: hay cambios sin guardar y no están en la URL (una escena grande no
   * cabe). Si están en la URL, volver a abrirla (o recargar) los recupera: no hace falta preguntar.
   */
  get wouldLose() {
    return this.dirty && this.#history[this.#index] !== this.#inURL;
  }

  /**
   * Enlace para compartir: la escena en la URL, marcada para abrirse en el modo Play (#p=…).
   * null si no cabe en un enlace (entonces, mejor el archivo .svrtk).
   */
  async shareURL(): Promise<string | null> {
    if (!this.scene) return null;
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as SceneV2, name: this.name, script: this.script, ...(this.canvas ? { canvas: this.canvas } : {}) });
    if (encoded.length >= MAX_HASH) return null;
    // La página de Play, junto al editor: carga solo el motor (mucho menos que el editor entero).
    const dir = location.pathname.replace(/[^/]*$/, '');
    return `${location.origin}${dir}play.html#p=${encoded}`;
  }

  async loadFromURL() {
    // #s=…: la escena; #p=…: la escena, en el modo Play (un enlace compartido).
    const m = location.hash.match(/^#([sp])=(.+)$/);
    if (!m) return false;
    const state = await decodeState(m[2]!);
    if (!state) return false;
    const scene = state.scene;
    this.scene = scene;
    this.name = state.name.replace(/\.svg$/i, '');
    if (state.script) this.script = state.script;
    if (state.canvas) this.canvas = state.canvas;
    this.selected = scene.objects[0]?.id ?? null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    if (m[1] === 'p') {
      this.selected = null;
      this.presenting = true;
    }
    return true;
  }
}
