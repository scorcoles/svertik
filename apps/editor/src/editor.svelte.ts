// Estado del editor: la escena (scene: varios objetos y grupos), la selección, el historial y la URL.
import {
  bounds,
  apply,
  invert,
  multiply,
  pivotPoint,
  builtins,
  createEngine,
  importSVG,
  isScene,
  isNumericExpression,
  evaluateSceneExpressions,
  sceneDuration,
  compositionTime,
  hasTextExpressions,
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
  toSVG,
  walkNodes,
  type Animation,
  type BlendMode,
  type Ease,
  type Track,
  type Geometry,
  type GroupNode,
  type Interaction,
  type NodeInfo,
  type ModifierDef,
  type ModifierInstance,
  type EffectorNode,
  type InstanceNode,
  type ObjectNode,
  type SceneNode,
  type SceneV1,
  type ShapeNode,
  validateScene,
  applyPalette,
  DOCUMENT_PALETTE,
  PALETTES,
  type Palette,
  type ParamSchema,
} from '@svertik/engine';
import { printPosterProject } from './demo-poster';
import { DEFAULT_SCRIPT } from './code';
import { decodeState, encodeState, MAX_HASH } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
export const modifierTypes = builtins.map((m) => m.type);

/** Default canvas colour: the one used until the document sets its own. */
export const DEFAULT_CANVAS = '#b0b0b0';

/** Relleno de las primitivas nuevas: se ve sobre el lienzo claro de serie. */
export const DEFAULT_FILL = '#333333';

export const DEFAULT_DOCUMENT = { width: 1400, height: 900 };
const newScene = (objects: SceneNode[] = []): SceneV1 => ({ version: 1, document: { ...DEFAULT_DOCUMENT }, objects });
const normalizeSeedGenerator = (value: number) => Math.max(0, Math.min(0x7fffffff, Math.round(Number.isFinite(value) ? value : 1)));

/** Modificadores que aceptan otros colgados (y los aplican a su manera). */
/** Efectos que llevan otros dentro: los efectores (Step, Range, Field, Stagger) y RGB Split (lo suyo, a las copias). */
export const effectors = new Set(['step', 'range', 'field', 'stagger', 'oscillate', 'wiggle', 'pulse', 'shake']);
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
  parent: SceneNode | null;
}

export function locateNode(nodes: SceneNode[], id: string | null, parent: SceneNode | null = null): NodeLocation | null {
  if (!id) return null;
  for (const [index, node] of nodes.entries()) {
    if (node.id === id) return { list: nodes, index, node, parent };
    if (node.children?.length) {
      const found = locateNode(node.children, id, node);
      if (found) return found;
    }
  }
  return null;
}

/** Un modificador y el nodo cuya pila lo contiene. */
export function locateModifier(scene: SceneV1, id: string | null): (Location & { owner: SceneNode }) | null {
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

/** The object properties the command line's "set" and "key" can reach (beside the shape's own). */
const NODE_PARAMS: ParamSchema = {
  x: { type: 'number', default: 0, unit: 'px' },
  y: { type: 'number', default: 0, unit: 'px' },
  rotation: { type: 'angle', default: 0 },
  scale: { type: 'number', default: 1, min: 0.01 },
  opacity: { type: 'number', default: 1, min: 0, max: 1 },
};

/** What "set" and "key" act on: its name, parameters, current values, how to change and key each one. */
export interface ParamTarget {
  label: string;
  params: ParamSchema;
  value(name: string): unknown;
  set(name: string, value: unknown): void;
  track(name: string): TrackTarget;
}

/** Escribe un valor en lo que apunta una pista (en la escena viva del editor). */
function writeTrackTarget(scene: SceneV1, tr: TrackTarget, value: unknown) {
  if (value === undefined) return;
  const at = locateNode(scene.objects, tr.node);
  if (!at) return;
  const n = at.node;
  if (tr.on === 'node') {
    if (tr.param === 'opacity') n.opacity = value as number;
    else n.transform = { ...n.transform, [tr.param]: value as number };
  } else if (tr.on === 'composition') {
    if (n.kind === 'group' && n.composition) n.composition.params = { ...n.composition.params, [tr.param]: value };
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
  return { ...base, ...(n.children ? { children: n.children.map(freshNode) } : {}) };
}

export class Editor {
  #rootScene = $state<SceneV1 | null>(null);
  compositionPath = $state<string[]>([]);
  #compositionViews: { time: number }[] = [];
  get projectScene() { return this.#rootScene; }
  get scene(): SceneV1 | null {
    let scene = this.#rootScene;
    for (const id of this.compositionPath) {
      const n = scene && locateNode(scene.objects, id)?.node;
      if (!n || n.kind !== 'group' || !n.composition) break;
      scene = n.composition.scene;
    }
    return scene;
  }
  /** Current scene seed, inherited from its parent composition until locally overridden. */
  get seedGenerator(): number {
    let scene = this.#rootScene;
    let seed = normalizeSeedGenerator(scene?.seedGenerator ?? 1);
    for (const id of this.compositionPath) {
      const node = scene && locateNode(scene.objects, id)?.node;
      if (!node || node.kind !== 'group' || !node.composition) break;
      scene = node.composition.scene;
      if (scene.seedGenerator !== undefined) seed = normalizeSeedGenerator(scene.seedGenerator);
    }
    return seed;
  }
  set scene(value: SceneV1 | null) {
    let scene = this.#rootScene;
    for (let i = 0; i < this.compositionPath.length; i++) {
      const n = scene && locateNode(scene.objects, this.compositionPath[i]!)?.node;
      if (!n || n.kind !== 'group' || !n.composition) break;
      if (i === this.compositionPath.length - 1) { n.composition.scene = value ?? newScene(); return; }
      scene = n.composition.scene;
    }
    this.#rootScene = value;
  }
  get compositionBreadcrumbs(): { id: string; name: string }[] {
    const out: { id: string; name: string }[] = []; let scene = this.#rootScene;
    for (const id of this.compositionPath) {
      const n = scene && locateNode(scene.objects, id)?.node;
      if (!n || n.kind !== 'group' || !n.composition) break;
      out.push({ id, name: n.name }); scene = n.composition.scene;
    }
    return out;
  }
  openComposition(id: string) {
    const n = this.scene && locateNode(this.scene.objects, id)?.node;
    if (!n || n.kind !== 'group' || !n.composition) return;
    this.flush(); this.#compositionViews.push({ time: this.time });
    this.playing = false; this.compositionPath = [...this.compositionPath, id];
    this.selected = this.scene?.objects[0]?.id ?? null; this.time = 0; this.infos = new Map(); this.#applyTime();
  }
  leaveComposition(level = this.compositionPath.length - 1) {
    if (level >= this.compositionPath.length) return;
    this.flush(); this.playing = false;
    const returnTime = this.#compositionViews[Math.max(0, level)]?.time ?? 0;
    this.#compositionViews = this.#compositionViews.slice(0, Math.max(0, level));
    const selected = this.compositionPath[level]; this.compositionPath = this.compositionPath.slice(0, Math.max(0, level));
    this.selected = selected ?? null; this.time = returnTime; this.infos = new Map(); this.#applyTime();
  }
  setCompositionParam(id: string, name: string, value: unknown) {
    const n = this.scene && locateNode(this.scene.objects, id)?.node;
    if (!n || n.kind !== 'group' || !n.composition) return;
    n.composition.params = { ...n.composition.params, [name]: value };
    this.#parameterChanged({ node: id, on: 'composition', param: name }, value); this.record();
  }
  setClockModulator(id: string, type: string) {
    const n = this.scene && locateNode(this.scene.objects, id)?.node;
    if (!n || n.kind !== 'group' || !n.composition) return;
    if (type === 'none') delete n.composition.modulation;
    else if (['oscillate', 'wiggle', 'pulse', 'shake'].includes(type)) n.composition.modulation = {
      type: type as 'oscillate' | 'wiggle' | 'pulse' | 'shake', params: { ...resolveParams(registry.get(type)!.params), time: { $expr: 'scene.time', fallback: 0 }, amplitude: 0.25, perElement: false },
    };
    this.record(true);
  }
  setClockSignalParam(id: string, name: string, value: unknown) {
    const n = this.scene && locateNode(this.scene.objects, id)?.node;
    if (!n || n.kind !== 'group' || !n.composition?.modulation) return;
    const signal = n.composition.modulation;
    signal.params = { ...signal.params, [name]: value }; this.record();
  }
  toggleCompositionKey(id: string, param: string) {
    if (!this.scene) return;
    const n = locateNode(this.scene.objects, id)?.node;
    if (!n || n.kind !== 'group' || !n.composition) return;
    const target: TrackTarget = { node: id, on: 'composition', param };
    const current = readTarget(this.scene, target);
    if (isNumericExpression(current)) {
      const resolved = evaluateSceneExpressions({ ...$state.snapshot(this.scene) as SceneV1, at: this.time });
      n.composition.params = { ...n.composition.params, [param]: readTarget(resolved, target) };
    } else if (param === 'time' && n.composition.params?.time === undefined) {
      n.composition.params = { ...n.composition.params, time: this.time };
    }
    this.toggleKey(target);
  }
  addMarker() {
    const anim = this.#ensureAnimation();
    const names = new Set(anim.markers?.map(m => m.name));
    let i = 1; while (names.has(`Marker ${i}`)) i++;
    const name = `Marker ${i}`;
    anim.markers ??= [];
    anim.markers.push({ id: `marker-${uid()}`, name, t: this.time });
    this.record(true);
  }
  setMarker(id: string, key: 'name' | 't', value: string | number) {
    const marker = this.animation?.markers?.find(m => m.id === id); if (!marker) return;
    if (key === 'name') marker.name = String(value).trim() || 'Marker';
    else if (Number.isFinite(Number(value))) marker.t = Math.max(0, Math.min(this.animation!.duration, Number(value)));
    else return;
    this.record();
  }
  removeMarker(id: string) {
    if (this.animation?.markers) { this.animation.markers = this.animation.markers.filter(m => m.id !== id); this.record(true); }
  }
  createComposition(fromSelection = false, imported?: SceneV1, name = 'Composition') {
    if (!this.scene) return;
    const parent = this.scene;
    let objects: SceneNode[] = [];
    let target = parent.objects; let index = 0;
    const tracks: Track[] = [];
    let interactions: SceneV1['interactions'];
    if (fromSelection) {
      const locations = this.selectedNodes.map(n => locateNode(parent.objects, n.id)!).filter(Boolean);
      if (!locations.length) return;
      target = locations[0]!.list;
      if (locations.some(l => l.list !== target)) { this.notice = 'Select objects in the same group to create a composition.'; return; }
      locations.sort((a, b) => a.index - b.index); index = locations[0]!.index;
      objects = locations.map(l => l.node);
      const ids = new Set([...walkNodes(objects)].map(({ node }) => node.id));
      // A composition is an isolated scope: never silently break references at its boundary.
      for (const { node: n } of walkNodes(parent.objects)) {
        const refs: string[] = n.kind === 'instance' ? [n.of] : n.kind === 'effector' ? n.targets : [];
        const scan = (stack: ModifierInstance[]) => { for (const m of stack) {
          const schema = registry.get(m.type)?.params ?? {};
          for (const [key, value] of Object.entries(m.params ?? {})) {
            if (schema[key]?.type === 'node' && typeof value === 'string' && value) refs.push(value);
            if (schema[key]?.type === 'nodes' && Array.isArray(value)) refs.push(...value);
          }
          scan(m.children ?? []);
        } }; scan(n.stack);
        if (refs.some(id => !!locateNode(parent.objects, id) && ids.has(n.id) !== ids.has(id))) {
          this.notice = 'Include all linked objects and targets in the selection before creating a composition.'; return;
        }
      }
      if (parent.interactions?.some(it => ids.has(it.node) !== ids.has(it.target.node))) {
        this.notice = 'Include the linked interaction targets in the composition.'; return;
      }
      interactions = parent.interactions?.filter(it => ids.has(it.node));
      if (parent.interactions) parent.interactions = parent.interactions.filter(it => !ids.has(it.node));
      if (parent.animation) {
        tracks.push(...parent.animation.tracks.filter(t => ids.has(t.node)));
        parent.animation.tracks = parent.animation.tracks.filter(t => !ids.has(t.node));
      }
      for (const l of [...locations].reverse()) target.splice(l.index, 1);
    }
    const scene: SceneV1 = imported ?? { version: 1, document: { ...(parent.document ?? DEFAULT_DOCUMENT) }, objects,
      animation: { duration: parent.animation?.duration ?? 3, fps: parent.animation?.fps ?? 30, loop: true, tracks }, ...(interactions?.length ? { interactions } : {}) };
    const node: GroupNode = { kind: 'group', id: `composition-${uid()}`, name, stack: [], children: [], composition: { scene,
      params: { time: { $expr: 'scene.time', fallback: 0 }, speed: 1, loop: 'hold' } } };
    target.splice(index, 0, node);
    this.#ensureAnimation().duration = Math.max(this.animation?.duration ?? 3, scene.animation?.duration ?? 3);
    this.selected = node.id; this.record(true);
    return node.id;
  }
  /** Release the isolated scene into a regular group, merging its objects and timeline into this scene. */
  releaseComposition(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id || this.isLocked(id)) return;
    const at = locateNode(this.scene.objects, id);
    if (!at || at.node.kind !== 'group' || !at.node.composition) return;
    const compositionNode = at.node;
    const inner = structuredClone(at.node.composition.scene);
    const timelineSource = structuredClone(inner);
    const parentClockScene = $state.snapshot(this.scene) as SceneV1;
    const parentDuration = Math.max(0, parentClockScene.animation?.duration ?? sceneDuration(parentClockScene));
    const sourceTracks = timelineSource.animation?.tracks ?? [];
    const expressionTracks: Track[] = [];
    const hasExpressionTarget = new Set<string>();
    const targetKey = (node: string, on: Track['on'], param: string, modifier = '') => `${node}\n${on}\n${modifier}\n${param}`;
    const registerExpressions = (node: SceneNode, on: Track['on'], params: Record<string, unknown>, modifier?: string) => {
      for (const [param, value] of Object.entries(params)) {
        if (!isNumericExpression(value)) continue;
        const key = targetKey(node.id, on, param, modifier);
        if (hasExpressionTarget.has(key)) continue;
        hasExpressionTarget.add(key);
        expressionTracks.push({ id: `expression-${uid()}`, node: node.id, on, param, ...(modifier ? { modifier } : {}), keys: [] });
      }
    };
    const scanStack = (node: SceneNode, stack: ModifierInstance[]) => stack.forEach((modifier) => {
      registerExpressions(node, 'modifier', modifier.params ?? {}, modifier.id);
      scanStack(node, modifier.children ?? []);
    });
    for (const { node } of walkNodes(inner.objects)) {
      if (node.kind === 'shape') registerExpressions(node, 'shape', node.params);
      if (node.kind === 'group' && node.composition) registerExpressions(node, 'composition', node.composition.params ?? {});
      scanStack(node, node.stack);
    }
    const timelineTracks = [
      ...sourceTracks.filter((track) => !hasExpressionTarget.has(targetKey(track.node, track.on, track.param, track.modifier))),
      ...expressionTracks,
    ];
    let bakeRate = parentClockScene.animation?.fps || 30;
    const bakedKeys = new Map(timelineTracks.map((track) => [track.id, [] as Track['keys']]));
    if (timelineTracks.length && parentDuration > 0) {
      const parentFps = parentClockScene.animation?.fps || 30;
      const fps = Math.max(1, Math.min(parentFps, 12000 / parentDuration));
      bakeRate = fps;
      const frames = Math.max(1, Math.ceil(parentDuration * fps));
      const localDuration = sceneDuration(timelineSource);
      for (let frame = 0; frame <= frames; frame++) {
        const t = Math.min(parentDuration, frame / fps);
        const parentAt = evaluateSceneExpressions(sampleScene(parentClockScene, t));
        const clock = locateNode(parentAt.objects, id)?.node;
        if (clock?.kind !== 'group' || !clock.composition) continue;
        const localTime = compositionTime(t, localDuration, clock.composition.params, clock.composition.modulation);
        const innerAt = evaluateSceneExpressions(sampleScene(timelineSource, localTime));
        for (const track of timelineTracks) {
          const value = readTarget(innerAt, track);
          if (value === undefined) continue;
          const keys = bakedKeys.get(track.id)!;
          const previous = keys.at(-1);
          if (previous && JSON.stringify(previous.value) === JSON.stringify(value)) continue;
          keys.push({ t, value, ease: 'linear' });
        }
      }
    }
    const used = new Set<string>();
    const collectIds = (nodes: SceneNode[]) => nodes.forEach((node) => {
      used.add(node.id);
      node.stack.forEach((modifier) => { used.add(modifier.id); modifier.children?.forEach((child) => used.add(child.id)); });
      if (node.children) collectIds(node.children);
    });
    collectIds(this.scene.objects);
    const fresh = (base: string) => {
      let next = `${base}-${uid()}`;
      while (used.has(next)) next = `${base}-${uid()}`;
      used.add(next);
      return next;
    };
    const remap = new Map<string, string>();
    const prepare = (nodes: SceneNode[]) => nodes.forEach((node) => {
      remap.set(node.id, fresh(node.id));
      const modifiers = (list: ModifierInstance[]) => list.forEach((modifier) => {
        remap.set(modifier.id, fresh(modifier.id));
        modifiers(modifier.children ?? []);
      });
      modifiers(node.stack);
      if (node.children) prepare(node.children);
    });
    prepare(inner.objects);
    const cloneRefs = (nodes: SceneNode[]) => nodes.forEach((node) => {
      node.id = remap.get(node.id)!;
      const updateStack = (list: ModifierInstance[]) => list.forEach((modifier) => {
        modifier.id = remap.get(modifier.id)!;
        const schema = registry.get(modifier.type)?.params ?? {};
        for (const [key, value] of Object.entries(modifier.params ?? {})) {
          if (schema[key]?.type === 'node' && typeof value === 'string') modifier.params![key] = remap.get(value) ?? value;
          else if (schema[key]?.type === 'nodes' && Array.isArray(value)) modifier.params![key] = value.map((target) => typeof target === 'string' ? remap.get(target) ?? target : target);
        }
        updateStack(modifier.children ?? []);
      });
      updateStack(node.stack);
      if (node.kind === 'instance') node.of = remap.get(node.of) ?? node.of;
      if (node.kind === 'effector') node.targets = node.targets.map((target) => remap.get(target) ?? target);
      if (node.children) cloneRefs(node.children);
    });
    cloneRefs(inner.objects);
    const tracks = timelineTracks.flatMap((track) => {
      const keys = bakedKeys.get(track.id) ?? [];
      if (!keys.length) return [];
      const { repeat: _repeat, every: _every, ...baseTrack } = track;
      return [{ ...baseTrack, id: fresh(track.id), node: remap.get(track.node) ?? track.node,
        ...(track.modifier ? { modifier: remap.get(track.modifier) ?? track.modifier } : {}), keys }];
    });
    for (const track of expressionTracks) {
      const key = bakedKeys.get(track.id)?.[0];
      const node = remap.get(track.node);
      const modifier = track.modifier ? remap.get(track.modifier) : undefined;
      if (key && node) writeTrackTarget(inner, { node, on: track.on, param: track.param, ...(modifier ? { modifier } : {}) }, key.value);
    }
    const interactions = (inner.interactions ?? []).map((interaction) => ({
      ...interaction,
      id: fresh(interaction.id),
      node: remap.get(interaction.node) ?? interaction.node,
      target: { ...interaction.target, node: remap.get(interaction.target.node) ?? interaction.target.node,
        ...(interaction.target.modifier ? { modifier: remap.get(interaction.target.modifier) ?? interaction.target.modifier } : {}) },
    }));
    const { composition: _composition, children: _children, ...base } = compositionNode;
    const released: GroupNode = { ...base, kind: 'group', children: inner.objects };
    at.list.splice(at.index, 1, released);
    const animation = this.#ensureAnimation();
    animation.tracks = [...animation.tracks.filter((track) => !(track.node === id && track.on === 'composition')), ...tracks];
    animation.duration = Math.max(animation.duration, parentDuration, inner.animation?.duration ?? 0);
    if (interactions.length) this.scene.interactions = [...(this.scene.interactions ?? []), ...interactions];
    this.selected = released.id;
    this.also = [];
    if (timelineTracks.length) this.notice = `Composition clock baked into the parent timeline at ${Math.round(bakeRate)} fps.`;
    this.record(true);
  }
  importComposition(text: string, filename = 'Composition'): boolean {
    try {
      const data = JSON.parse(text); const scene = data?.svertik === 'project' ? data.scene : data;
      if (!isScene(scene)) { this.notice = 'Choose a .svrtk project or scene JSON.'; return false; }
      const report = validateScene(scene, builtins);
      if (report.errors.length) { this.notice = report.errors.join('\n'); return false; }
      return !!this.createComposition(false, scene, data.name ?? filename.replace(/\.[^.]+$/, ''));
    } catch { this.notice = 'Could not read the composition file.'; return false; }
  }
  /** Nombre del documento (el del primer SVG, mientras no haya otro). */
  name = $state('untitled');
  /** Color del lienzo (solo para ver; no entra en el SVG exportado). Vacío: el del tema. */
  canvas = $state(readPref('svertik.canvas'));
  textZoom = $state(Math.max(80, Math.min(180, Number(readPref('svertik.textZoom')) || 100)));
  setTextZoom(value: number) {
    const zoom = Math.max(80, Math.min(180, Math.round(value / 10) * 10));
    if (zoom === this.textZoom) return;
    this.textZoom = zoom;
    writePref('svertik.textZoom', String(zoom));
  }
  setCanvas(color: string) {
    if (color === this.canvas) return;
    this.canvas = color;
    writePref('svertik.canvas', color);
    this.record();
  }
  setNotes(notes: string) {
    if (!this.scene || notes === (this.scene.notes ?? '')) return;
    if (notes) this.scene.notes = notes;
    else delete this.scene.notes;
    this.record();
  }
  /** Relleno y contorno de las primitivas nuevas (los selectores de color del rail). */
  fillColor = $state(DEFAULT_FILL);
  strokeColor = $state('#ededed');
  strokeOn = $state(false);

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
    if (id && this.scene) {
      const owner = locateNode(this.scene.objects, id)?.node ?? locateModifier(this.scene, id)?.owner;
      if (owner && this.isLocked(owner.id)) return;
    }
    this.#selected = id;
    this.also = [];
  }
  /** Más nodos seleccionados (⇧ + clic), además del principal: para alinear, distribuir, mover juntos… */
  also = $state<string[]>([]);
  /** Nodos plegados en la pila. */
  collapsed = $state<string[]>([]);
  showOriginal = $state(false);
  showWire = $state(false);
  /** Temporarily freeze scene time without removing animation data from the document. */
  #animationDisabled = $state(false);
  get animationDisabled() { return this.#animationDisabled; }
  set animationDisabled(disabled: boolean) {
    this.#animationDisabled = disabled;
    if (disabled) {
      this.playing = false;
      this.timelineOpen = false;
    }
  }
  /** Ver el borde del documento (lo que se exporta). Se recuerda en este navegador. */
  #showBounds = $state(readPref('svertik.bounds') !== 'off');
  get showBounds() {
    return this.#showBounds;
  }
  set showBounds(on: boolean) {
    this.#showBounds = on;
    writePref('svertik.bounds', on ? '' : 'off');
  }
  /** Clip artwork to the document frame in the editor; this does not affect exports. */
  #hideOutside = $state(readPref('svertik.hideOutside') === 'on');
  get hideOutside() { return this.#hideOutside; }
  set hideOutside(on: boolean) {
    this.#hideOutside = on;
    writePref('svertik.hideOutside', on ? 'on' : 'off');
  }
  /** The top bar's effect menus (Deform…Utils): shown by default; the command line covers them when
   * hidden. Remembered in this browser. */
  #showEffectMenus = $state(readPref('svertik.effect-menus') !== 'off');
  get showEffectMenus() { return this.#showEffectMenus; }
  set showEffectMenus(on: boolean) {
    this.#showEffectMenus = on;
    writePref('svertik.effect-menus', on ? '' : 'off');
  }
  /** Replace the top effect menus with the command bar. Off by default; remembered in this browser. */
  #commandInEffectsSlot = $state(readPref('svertik.command-in-effects-slot') === 'on');
  get commandInEffectsSlot() { return this.#commandInEffectsSlot; }
  set commandInEffectsSlot(on: boolean) {
    this.#commandInEffectsSlot = on;
    writePref('svertik.command-in-effects-slot', on ? 'on' : '');
  }
  /** Rulers are hidden by default; the preference is remembered in this browser. */
  #showRulers = $state(readPref('svertik.rulers') === 'on');
  get showRulers() { return this.#showRulers; }
  set showRulers(on: boolean) {
    this.#showRulers = on;
    writePref('svertik.rulers', on ? 'on' : 'off');
  }
  /** Guides are hidden by default; the preference is remembered in this browser. */
  #showGuides = $state(readPref('svertik.guides') === 'on');
  get showGuides() { return this.#showGuides; }
  set showGuides(on: boolean) {
    this.#showGuides = on;
    writePref('svertik.guides', on ? 'on' : 'off');
  }
  /** Grid: a square grid on the canvas whose step follows the zoom (off by default; remembered here). */
  #showGrid = $state(readPref('svertik.grid') === 'on');
  get showGrid() { return this.#showGrid; }
  set showGrid(on: boolean) {
    this.#showGrid = on;
    writePref('svertik.grid', on ? 'on' : 'off');
  }
  /** Onion skin: faded frames around the playhead (off by default; remembered in this browser). */
  #onionSkin = $state(readPref('svertik.onion') === 'on');
  get onionSkin() { return this.#onionSkin; }
  set onionSkin(on: boolean) {
    this.#onionSkin = on;
    writePref('svertik.onion', on ? 'on' : 'off');
  }
  /** Smart alignment guides are on by default; manual ruler guides remain available when disabled. */
  #smartGuides = $state(readPref('svertik.smartGuides') !== 'off');
  get smartGuides() { return this.#smartGuides; }
  set smartGuides(on: boolean) {
    this.#smartGuides = on;
    writePref('svertik.smartGuides', on ? '' : 'off');
  }
  /** Caja de lo que hay dibujado (sin margen), en el documento: la escribe el lienzo al pintar. */
  contentBox = $state.raw<{ x: number; y: number; width: number; height: number } | null>(null);
  error = $state<string | null>(null);
  /** Script del panel de código (lo que va después de la escena en la pestaña JS). */
  script = $state(DEFAULT_SCRIPT);
  /** Objetos animados por el script mientras corre; no entran en el historial. */
  preview = $state<SceneNode[] | null>(null);
  // Código y línea de tiempo, uno u otro: reproduciendo, la escena cambia cada fotograma y el código
  // no se podría tocar. Abrir código pausa la reproducción; cerrar el timeline no la detiene.
  #codeOpen = $state(false);
  #timelineOpen = $state(false);
  get codeOpen() {
    return this.#codeOpen;
  }
  set codeOpen(open: boolean) {
    this.#codeOpen = open;
    if (open) {
      this.timelineOpen = false;
      this.playing = false;
      this.notesOpen = false;
    }
  }
  #notesOpen = $state(false);
  get notesOpen() {
    return this.#notesOpen;
  }
  set notesOpen(open: boolean) {
    this.#notesOpen = open;
    if (open) {
      this.codeOpen = false;
      this.timelineOpen = false;
    }
  }
  /** Línea de tiempo: abierta, instante actual (s) y reproducción. */
  get timelineOpen() {
    return this.#timelineOpen;
  }
  set timelineOpen(open: boolean) {
    this.#timelineOpen = open && !this.animationDisabled;
    if (this.#timelineOpen) {
      this.#codeOpen = false;
      this.notesOpen = false;
    }
  }
  /** Modo Play: la escena a pantalla completa, sin herramientas, con el reproductor del código exportado. */
  presenting = $state(false);
  time = $state(0);
  #playing = $state(false);
  get playing() { return this.#playing; }
  set playing(on: boolean) { this.#playing = !!on && !this.animationDisabled; }
  /** Fuentes que se pueden elegir en Text (las incluidas y, si se pidieron, las del sistema). */
  fonts = $state<string[]>([]);
  /** Sube cada vez que llega una fuente: el lienzo vuelve a dibujar el texto. */
  fontsTick = $state(0);
  /** Aviso para el usuario (lo muestra la app un momento). */
  notice = $state<string | null>(null);
  /** Request to open the command line with some text (the stack's +, "/", ⌘K). `n` tells identical requests apart. */
  commandRequest = $state<{ text: string; n: number } | null>(null);
  /** The demo this document was opened from, while it is still that demo (null: the person's own work). */
  demoOrigin = $state<string | null>(null);
  /** From a demo to a piece of one's own: a new name, so saving never looks like editing the demo. */
  makeOwn() {
    if (!this.demoOrigin) return;
    this.name = `my-${this.name}`;
    this.demoOrigin = null;
    this.playing = false;
    this.notice = `Now it is yours: “${this.name}”. Save it with ⌘S.`;
  }
  /** The keyboard shortcut sheet ("?" or the svertik menu). */
  showShortcuts = $state(false);
  /** Set by the app: runs an export by format (the command line's "export png"). */
  exporter: ((format: 'svg' | 'png' | 'mp4' | 'animsvg' | 'lottie' | 'json') => void) | null = null;

  /** The selected effect, or else the selected object (its transform, opacity and shape parameters). */
  paramTarget(): ParamTarget | null {
    if (!this.scene) return null;
    const owner = this.activeNode;
    const m = this.current;
    if (m && owner) {
      const def = registry.get(m.type);
      if (!def) return null;
      return {
        label: m.name || def.label,
        params: def.params,
        value: (k) => m.params?.[k] ?? def.params[k]?.default,
        set: (k, v) => this.setParam(k, v),
        track: (k) => ({ node: owner.id, on: 'modifier', modifier: m.id, param: k }),
      };
    }
    const n = this.currentNode;
    if (!n) return null;
    const shapeParams: ParamSchema = n.kind === 'shape' ? (shapeRegistry.get(n.shape)?.params ?? {}) : {};
    const isNode = (k: string) => k in NODE_PARAMS;
    return {
      label: n.name,
      params: { ...shapeParams, ...NODE_PARAMS },
      value: (k) => (k === 'opacity' ? (n.opacity ?? 1) : isNode(k) ? (n.transform?.[k as 'x'] ?? NODE_PARAMS[k]!.default) : n.kind === 'shape' ? (n.params[k] ?? shapeParams[k]?.default) : undefined),
      set: (k, v) => (isNode(k) ? this.setNode(n.id, k as 'x', v, true) : this.setShapeParam(n.id, k, v)),
      track: (k) => ({ node: n.id, on: isNode(k) ? 'node' : 'shape', param: k }),
    };
  }

  /** Makes sure there is a keyframe at the playhead (unlike toggleKey, never removes one). */
  keyHere(t: TrackTarget) {
    if (this.isLocked(t.node)) return;
    if (this.keyState(t) !== 'key') this.toggleKey(t);
  }

  /**
   * "Key here" (as F6 in classic animation tools): a keyframe at the playhead on everything already
   * animated in the selection. A selected object with nothing animated gets x, y, rotation and scale.
   * Returns how many keys were placed (0: nothing to key, with a notice).
   */
  keySelectionHere(): number {
    const anim = this.animation;
    const tracks = anim?.tracks ?? [];
    const targets: TrackTarget[] = [];
    if (this.current && this.activeNode) {
      const m = this.current;
      targets.push(...tracks.filter((t) => t.on === 'modifier' && t.modifier === m.id));
    } else {
      for (const n of this.selectedNodes) {
        if (this.isLocked(n.id)) continue;
        const own = tracks.filter((t) => t.node === n.id && t.on !== 'modifier');
        targets.push(...(own.length ? own : (['x', 'y', 'rotation', 'scale'] as const).map((param) => ({ node: n.id, on: 'node' as const, param }))));
      }
    }
    const missing = targets.filter((t) => this.keyState(t) !== 'key');
    if (!targets.length) {
      this.notice = this.current ? 'Nothing animated in this effect yet: use the ◇ next to a value, or: key <parameter>.' : 'Select an object to key.';
      return 0;
    }
    for (const t of missing) this.keyHere({ node: t.node, on: t.on, modifier: t.modifier, param: t.param });
    if (!this.timelineOpen) this.timelineOpen = true;
    return missing.length;
  }

  /** Every object and effect by display name, for "select" (locked objects are left out). */
  namedItems(): { id: string; label: string; detail: string }[] {
    if (!this.scene) return [];
    const out: { id: string; label: string; detail: string }[] = [];
    const mods = (list: ModifierInstance[], owner: string) => {
      for (const m of list) {
        out.push({ id: m.id, label: m.name || (registry.get(m.type)?.label ?? m.type), detail: `effect on ${owner}` });
        if (m.children) mods(m.children, owner);
      }
    };
    for (const { node } of walkNodes(this.scene.objects)) {
      if (this.isLocked(node.id)) continue;
      out.push({ id: node.id, label: node.name, detail: node.kind === 'group' ? 'group' : 'object' });
      mods(node.stack, node.name);
    }
    return out;
  }
  openCommand(text = '') {
    this.commandRequest = { text, n: (this.commandRequest?.n ?? 0) + 1 };
  }
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

  isLocked(id: string): boolean {
    let at = this.scene ? locateNode(this.scene.objects, id) : null;
    while (at) {
      if (at.node.locked) return true;
      at = at.parent ? locateNode(this.scene!.objects, at.parent.id) : null;
    }
    return false;
  }

  toggleLock(id: string) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || (at.parent && this.isLocked(at.parent.id))) return;
    at.node.locked = !at.node.locked;
    if (at.node.locked) {
      this.collapsed = [...new Set([...this.collapsed, id])];
      if (this.activeNode && this.isLocked(this.activeNode.id)) this.selected = null;
      this.also = this.also.filter((selectedId) => !this.isLocked(selectedId));
    }
    this.record(true);
  }

  /** Selecciona todas las capas raíz; los grupos incluyen sus hijos sin seleccionarlos por duplicado. */
  selectAll() {
    const ids = this.scene?.objects.filter((node) => !node.locked).map((node) => node.id) ?? [];
    this.#selected = ids[0] ?? null;
    this.also = ids.slice(1);
    this.tool = null;
  }

  /** ⇧ + clic: añade o quita un nodo de la selección; el último añadido pasa a ser el principal. */
  toggleSelect(id: string) {
    if (this.isLocked(id)) return;
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
      this.scene = newScene([node]);
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
      params: {
        ...resolveParams(def.params),
        ...(def.timeDriven
          ? { time: { $expr: 'scene.time', fallback: 0 } }
          : { fillColor: this.fillColor, strokeColor: this.strokeColor, stroke: this.strokeOn }),
        ...params,
      },
      stack: [],
      transform: { x: Math.round(at.x * 100) / 100, y: Math.round(at.y * 100) / 100 },
    };
    if (!this.scene) {
      this.scene = newScene([node]);
      this.name = 'untitled';
      this.#history = [];
      this.#index = -1;
    } else {
      // Dentro del grupo seleccionado, si lo hay; arriba de la lista (delante).
      const g = this.currentNode?.kind === 'group' && !this.currentNode.composition ? this.currentNode : null;
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
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'effector') return;
    const d = Math.max(0, Math.round(delay * 1000) / 1000);
    if (d) at.node.delay = d;
    else delete at.node.delay;
    this.record(now);
  }

  /** Cambia el original de una instancia. */
  setInstanceOf(id: string, of: string) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'instance' || at.node.of === of || id === of) return;
    at.node.of = of;
    this.record(true);
  }

  /** Un parámetro de una primitiva. */
  /** Cambia un parámetro de una primitiva sin pasar por el historial (al escribir en el lienzo: luego, uno solo). */
  previewShapeParam(id: string, name: string, value: unknown) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (at?.node.kind === 'shape') at.node.params[name] = value;
  }
  /** Texto que se está editando sobre el lienzo (id del nodo), o null. */
  editingText = $state<string | null>(null);

  setShapeParam(id: string, name: string, value: unknown) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    at.node.params[name] = value;
    this.#parameterChanged({ node: id, on: 'shape', param: name }, value);
    this.record();
  }

  #parameterChanged(target: TrackTarget, value: unknown) {
    const expression = isNumericExpression(value) || (target.on === 'shape' && target.param === 'text' && hasTextExpressions(value));
    if (expression) {
      const anim = this.#ensureAnimation();
      anim.tracks = anim.tracks.filter((t) => !(t.node === target.node && t.on === target.on && t.param === target.param && (t.modifier ?? '') === (target.modifier ?? '')));
    } else this.#autoKey(target, value);
  }

  /** Primitivas sobre las que actúan los selectores de color del rail: la selección, o la forma del efecto elegido. */
  #colorTargets(): ShapeNode[] {
    const roots: SceneNode[] = this.selectedNodes.length ? this.selectedNodes : this.activeNode ? [this.activeNode] : [];
    const shapes: ShapeNode[] = [];
    const collect = (node: SceneNode) => {
      if (node.kind === 'shape') shapes.push(node);
      for (const child of node.children ?? []) collect(child);
    };
    for (const node of roots) collect(node);
    return shapes;
  }
  #svgColorTargets(): ObjectNode[] {
    const roots: SceneNode[] = this.selectedNodes.length ? this.selectedNodes : this.activeNode ? [this.activeNode] : [];
    const objects: ObjectNode[] = [];
    const collect = (node: SceneNode) => {
      if (node.kind === 'object' && !node.packed && /<svg[\s>]/i.test(node.source)) objects.push(node);
      for (const child of node.children ?? []) collect(child);
    };
    for (const node of roots) collect(node);
    return objects;
  }
  /** Recolor explicit SVG fills and set the inherited fill on the root, preserving `fill="none"`. */
  #recolorSvg(source: string, color: string): string {
    const paint = (value: string) => value.trim().toLowerCase() === 'none' ? value : color;
    let next = source
      .replace(/(\bfill\s*=\s*)(["'])(.*?)\2/gi, (_match, prefix: string, quote: string, value: string) => `${prefix}${quote}${paint(value)}${quote}`)
      .replace(/(\bfill\s*:\s*)([^;"'}]+)/gi, (_match, prefix: string, value: string) => `${prefix}${paint(value)}`);
    next = next.replace(/<svg\b([^>]*)>/i, (tag, attrs: string) => /\bfill\s*=/.test(attrs) || /\bfill\s*:/.test(attrs) ? tag : `<svg${attrs} fill="${color}">`);
    return next;
  }
  /** Relleno que muestran los selectores del rail: el de la selección o el de las primitivas nuevas. */
  get currentFill(): string {
    return String(this.#colorTargets()[0]?.params.fillColor ?? this.fillColor);
  }
  /** Contorno que muestran los selectores del rail: el de la selección o el de las primitivas nuevas. */
  get currentOutline(): string {
    return String(this.#colorTargets()[0]?.params.strokeColor ?? this.strokeColor);
  }
  /** Relleno del rail: con selección, el suyo (y lo enciende); sin ella, el de las primitivas nuevas. */
  setFillColor(color: string) {
    const targets = this.#colorTargets();
    const svgTargets = this.#svgColorTargets();
    if (!targets.length && !svgTargets.length) {
      this.fillColor = color;
      return;
    }
    for (const n of targets) {
      this.setShapeParam(n.id, 'fillColor', color);
      if (n.params.fill === false) this.setShapeParam(n.id, 'fill', true);
    }
    for (const node of svgTargets) {
      if (this.isLocked(node.id)) continue;
      node.source = this.#recolorSvg(node.source, color);
      this.record(true);
    }
  }
  /** Contorno del rail: con selección, el suyo (y lo enciende); sin ella, el de las primitivas nuevas. */
  setOutlineColor(color: string) {
    const targets = this.#colorTargets();
    if (!targets.length) {
      this.strokeColor = color;
      this.strokeOn = true;
      return;
    }
    for (const n of targets) {
      this.setShapeParam(n.id, 'strokeColor', color);
      if (!n.params.stroke) this.setShapeParam(n.id, 'stroke', true);
    }
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
  setSeedGenerator(value: number) {
    if (!this.scene) return;
    const seed = normalizeSeedGenerator(value);
    if (seed === this.seedGenerator && this.scene.seedGenerator !== undefined) return;
    this.scene.seedGenerator = seed;
    // The poster's randomness is baked into its generated objects rather than effect params.
    // Keep the demo responsive to the document seed while it is still the opened demo.
    if (this.demoOrigin === 'poster') {
      const generated = printPosterProject(seed);
      this.scene.objects = generated.scene.objects;
      this.selected = null;
      this.also = [];
    }
    this.record(true);
  }
  /** Link every numeric seed in this scene to its scene seed, retaining its current value as an offset. */
  linkSeedsToGenerator(): number {
    const active = this.scene;
    if (!active) return 0;
    let linked = 0;
    const linkParams = (params: Record<string, unknown> | undefined, baseSeed: number) => {
      const seed = params?.seed;
      if (!params || typeof seed !== 'number' || !Number.isFinite(seed)) return;
      const offset = Math.round(seed - baseSeed);
      params.seed = {
        $expr: offset === 0 ? 'scene.seedGenerator' : `scene.seedGenerator ${offset > 0 ? '+' : '-'} ${Math.abs(offset)}`,
        fallback: seed,
      };
      linked++;
    };
    const linkScene = (scene: SceneV1, inheritedSeed: number) => {
      const baseSeed = normalizeSeedGenerator(scene.seedGenerator ?? inheritedSeed);
      const linkStack = (items: SceneNode['stack']) => {
        for (const item of items) { linkParams(item.params, baseSeed); linkStack(item.children ?? []); }
      };
      const linkNodes = (items: SceneNode[]) => {
        for (const node of items) {
          if (node.kind === 'shape') linkParams(node.params, baseSeed);
          linkStack(node.stack);
          if (node.children?.length) linkNodes(node.children);
          if (node.kind === 'group' && node.composition) {
            linkParams(node.composition.modulation?.params, baseSeed);
            linkScene(node.composition.scene, baseSeed);
          }
        }
      };
      linkNodes(scene.objects);
    };
    linkScene(active, this.seedGenerator);
    if (linked) this.record(true);
    return linked;
  }
  /** Documento del tamaño de lo dibujado y centrado en ello (sin mover nada). */
  fitDocument() {
    const b = this.contentBox;
    if (!b || b.width <= 0 || b.height <= 0) return;
    this.setDocument({ width: Math.ceil(b.width), height: Math.ceil(b.height), x: b.x + b.width / 2, y: b.y + b.height / 2 });
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
      if (node.stack.length || node.kind === 'group' || node.children?.length) ids.push(node.id);
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

  // ── Expandir un SVG: un objeto por forma, dentro de un grupo que conserva el sitio y la pila

  #shapeCounts = new Map<string, number>();
  /** Cuántas formas tiene el SVG de un objeto (con caché: el panel lo pregunta al dibujar). */
  shapeCount(source: string) {
    const hit = this.#shapeCounts.get(source);
    if (hit !== undefined) return hit;
    let n = 0;
    try {
      n = importSVG(source).shapes.length;
    } catch {
      n = 0;
    }
    if (this.#shapeCounts.size >= 24) this.#shapeCounts.clear();
    this.#shapeCounts.set(source, n);
    return n;
  }

  /**
   * Expande el SVG de un objeto: una forma, un objeto. Van dentro de un grupo con el mismo id, nombre,
   * colocación y pila, así que lo que lo animaba o lo usaba como referencia sigue funcionando.
   */
  expand(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    const at = locateNode(this.scene.objects, id);
    const node = at?.node;
    if (!at || !node || node.kind !== 'object' || node.packed) return;
    let geo: Geometry;
    try {
      geo = importSVG(node.source);
    } catch {
      return;
    }
    if (geo.shapes.length < 2) {
      this.notice = 'This SVG has one shape: there is nothing to expand.';
      return;
    }
    const ref = bounds(geo);
    const c = { x: ref.x + ref.width / 2, y: ref.y + ref.height / 2 };
    const base = node.name.replace(/\.svg$/i, '');
    // The first child in a group is the one in front: the last shape of the SVG (the one on top) goes first.
    // Each object puts the centre of its source in its position, so its position is that centre (in the
    // original coordinates) and the group, below, puts everything back where it was.
    const parts = geo.shapes
      .map((shape, i): ObjectNode => {
        const b = bounds({ shapes: [shape], viewBox: geo.viewBox });
        return {
          kind: 'object',
          id: `object-${uid()}`,
          name: `${base} ${i + 1}`,
          source: toSVG({ shapes: [shape], viewBox: geo.viewBox }, { precision: 3 }),
          stack: [],
          transform: { x: b.x + b.width / 2, y: b.y + b.height / 2 },
        };
      })
      .reverse();
    // A group moves nothing: its centre stays where it is, so its position is the object's minus its centre.
    // Its effects see the same coordinates as before (the children's); its scale and rotation, unchanged.
    const p = node.transform ?? {};
    const group: GroupNode = {
      kind: 'group',
      id: node.id,
      name: node.name,
      stack: node.stack,
      transform: { ...p, x: (p.x ?? 0) - c.x, y: (p.y ?? 0) - c.y },
      children: parts,
      ...(node.opacity !== undefined ? { opacity: node.opacity } : {}),
      ...(node.blend ? { blend: node.blend } : {}),
      ...(node.visible === false ? { visible: false } : {}),
    };
    // Its own x/y animation (if any) speaks of the object's position; on the group, the same place is `- c`.
    const anim = this.scene.animation;
    for (const tr of anim?.tracks ?? []) {
      if (tr.node !== id || tr.on !== 'node' || (tr.param !== 'x' && tr.param !== 'y')) continue;
      const d = tr.param === 'x' ? c.x : c.y;
      tr.keys = tr.keys.map((k) => (typeof k.value === 'number' ? { ...k, value: k.value - d } : k));
    }
    for (const it of this.scene.interactions ?? []) {
      if (it.target.node !== id || it.target.on !== 'node' || (it.target.param !== 'x' && it.target.param !== 'y')) continue;
      if (typeof it.to === 'number') it.to = it.to - (it.target.param === 'x' ? c.x : c.y);
    }
    at.list.splice(at.index, 1, group);
    this.selected = group.id;
    this.also = [];
    this.notice = `Expanded into ${geo.shapes.length} objects.`;
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
    const doc = engine.evaluateDocument($state.snapshot(this.scene) as SceneV1);
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
    if (!at || at.node.kind !== 'group' || at.node.composition) return;
    at.list.splice(at.index, 1, ...at.node.children);
    this.selected = at.node.children[0]?.id ?? null;
    this.record(true);
  }

  /** Mueve un nodo: dentro de `groupId` (o arriba del todo) en la posición `index`. */
  moveNode(id: string, groupId: string | null, index: number) {
    if (!this.scene || id === groupId) return;
    if (this.isLocked(id) || (groupId && this.isLocked(groupId))) return;
    const at = locateNode(this.scene.objects, id);
    if (!at) return;
    // A node cannot become a child of one of its descendants.
    if (groupId && at.node.children?.length && locateNode(at.node.children, groupId)) return;
    const target = groupId ? locateNode(this.scene.objects, groupId)?.node : null;
    if (groupId && (!target || target.kind === 'effector' || (target.kind === 'group' && target.composition))) return;
    if (target && !target.children) target.children = [];
    const list = target ? target.children! : this.scene.objects;
    const info = this.infos.get(id);
    const parentInfo = target ? this.infos.get(target.id) : null;
    let placement: Partial<ReturnType<typeof placementOf>> | null = null;
    if (at.list !== list && info && (!target || parentInfo)) {
      const rel = target ? multiply(invert(parentInfo!.matrix), info.matrix) : info.matrix;
      const p = placementOf(at.node), b = info.bounds, c = [b.x + b.width / 2, b.y + b.height / 2];
      const pv = pivotPoint(b, p.pivot);
      const flip = p.flipX ? -1 : 1;
      placement = {
        ...p,
        x: rel[4] - pv[0] + c[0]! + rel[0] * pv[0] + rel[2] * pv[1],
        y: rel[5] - pv[1] + c[1]! + rel[1] * pv[0] + rel[3] * pv[1],
        rotation: Math.atan2(rel[1] * flip, rel[0] * flip) * 180 / Math.PI,
        scale: Math.hypot(rel[0], rel[1]),
      };
    }
    const [n] = at.list.splice(at.index, 1);
    const i = list === at.list && index > at.index ? index - 1 : index;
    list.splice(Math.max(0, Math.min(list.length, i)), 0, n!);
    if (placement) n!.transform = placement;
    this.record(true);
  }

  /** Posición, escala, giro, opacidad, visibilidad o nombre de un nodo. */
  setNode(id: string, key: 'x' | 'y' | 'scale' | 'stretch' | 'rotation' | 'flipX' | 'flipY' | 'opacity' | 'visible' | 'name' | 'blend', value: unknown, now = false) {
    if (this.isLocked(id)) return;
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
    else if (key === 'stretch') {
      const [sx, sy] = value as [number, number];
      const t = { ...n.transform };
      if (sx === 1 && sy === 1) delete t.stretch;
      else t.stretch = [Math.max(0.01, sx), Math.max(0.01, sy)];
      n.transform = t;
    }
    else n.transform = { ...n.transform, [key]: value as number };
    if (key === 'x' || key === 'y' || key === 'scale' || key === 'rotation' || key === 'opacity') this.#autoKey({ node: id, on: 'node', param: key }, value);
    this.record(now);
  }

  /** Set the placement origin in local or canvas coordinates, including moving group pivots. */
  setNodePosition(id: string, target: [number, number], space: 'local' | 'world' = 'local') {
    if (!this.scene || this.isLocked(id) || !target.every(Number.isFinite)) return;
    const at = locateNode(this.scene.objects, id);
    if (!at || at.node.kind === 'effector') return;
    let [x, y] = target;
    if (space === 'world' && at.parent) {
      const scene = $state.snapshot(this.scene) as SceneV1;
      scene.at = this.time;
      const probe = locateNode(scene.objects, id)!.node;
      const engine = createEngine(builtins);
      const measure = (px: number, py: number) => {
        probe.transform = { ...probe.transform, x: px, y: py };
        const parent = engine.evaluateDocument(scene).nodes.get(at.parent!.id);
        return parent ? apply(parent.matrix, [px, py]) : null;
      };
      const p = placementOf(at.node);
      x = p.x;
      y = p.y;
      let converged = false;
      for (let i = 0; i < 20; i++) {
        const c = measure(x, y);
        if (!c) return;
        const dx = target[0] - c[0], dy = target[1] - c[1];
        if (Math.abs(dx) + Math.abs(dy) < 1e-7) { converged = true; break; }
        const a = measure(x + 0.01, y), b = measure(x, y + 0.01);
        if (!a || !b) return;
        const ax = (a[0] - c[0]) / 0.01, ay = (a[1] - c[1]) / 0.01;
        const bx = (b[0] - c[0]) / 0.01, by = (b[1] - c[1]) / 0.01;
        const det = ax * by - ay * bx;
        if (Math.abs(det) < 1e-12) return;
        x += (dx * by - dy * bx) / det;
        y += (dy * ax - dx * ay) / det;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      }
      // Do not write an approximation when the requested position cannot be reached.
      if (!converged) return;
    }
    this.setNode(id, 'x', x);
    this.setNode(id, 'y', y);
  }

  /** Centra la caja visible en el documento, convirtiendo el desplazamiento al espacio del padre. */
  centerNode(id: string) {
    if (!this.scene) return;
    if (this.isLocked(id)) return;
    const at = locateNode(this.scene.objects, id);
    const info = this.infos.get(id);
    if (!at || !info || at.node.kind === 'effector') return;
    const doc = this.scene.document;
    const frame = this.contentBox;
    if (!doc && !frame) return;
    const targetX = doc ? doc.x ?? 0 : frame!.x + frame!.width / 2;
    const targetY = doc ? doc.y ?? 0 : frame!.y + frame!.height / 2;
    const p = placementOf(at.node);
    let x = p.x + targetX - (info.box.x + info.box.width / 2);
    let y = p.y + targetY - (info.box.y + info.box.height / 2);
    if (at.parent) {
      // Group pivots follow their children's bounds. Probe the actual result rather than
      // treating the parent's matrix as fixed while its child moves.
      const scene = $state.snapshot(this.scene) as SceneV1;
      scene.at = this.time;
      const probe = locateNode(scene.objects, id)!.node;
      const engine = createEngine(builtins);
      const measure = (px: number, py: number) => {
        probe.transform = { ...probe.transform, x: px, y: py };
        const box = engine.evaluateDocument(scene).nodes.get(id)!.box;
        return [box.x + box.width / 2, box.y + box.height / 2];
      };
      x = p.x;
      y = p.y;
      for (let i = 0; i < 6; i++) {
        const c = measure(x, y);
        const dx = targetX - c[0]!, dy = targetY - c[1]!;
        if (Math.abs(dx) + Math.abs(dy) < 1e-7) break;
        const a = measure(x + 1, y), b = measure(x, y + 1);
        const ax = a[0]! - c[0]!, ay = a[1]! - c[1]!;
        const bx = b[0]! - c[0]!, by = b[1]! - c[1]!;
        const det = ax * by - ay * bx;
        if (Math.abs(det) < 1e-12) return;
        x += (dx * by - dy * bx) / det;
        y += (dy * ax - dx * ay) / det;
      }
    }
    if (Math.abs(x - p.x) + Math.abs(y - p.y) < 1e-7) return;
    this.playing = false;
    at.node.transform = { ...at.node.transform, x, y };
    this.#autoKey({ node: id, on: 'node', param: 'x' }, x);
    this.#autoKey({ node: id, on: 'node', param: 'y' }, y);
    this.record(true);
  }

  /** Capture a shared world-space pivot once, so pointer drags never compound their scale. */
  captureSelectionScale(): ((factor: number) => void) | null {
    if (!this.scene) return null;
    const chosen = this.selectedNodes.filter(n => n.kind !== 'effector');
    const ids = new Set(chosen.map(n => n.id));
    const roots = chosen.filter(n => {
      let parent = locateNode(this.scene!.objects, n.id)?.parent;
      while (parent) { if (ids.has(parent.id)) return false; parent = locateNode(this.scene!.objects, parent.id)?.parent; }
      return true;
    });
    const scene = $state.snapshot(this.scene) as SceneV1; scene.at = this.time;
    const doc = createEngine(builtins).evaluateDocument(scene);
    const boxes = roots.flatMap(n => { const info = doc.nodes.get(n.id); return info ? [info.box] : []; });
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
    const x1 = Math.max(...boxes.map(b => b.x + b.width)), y1 = Math.max(...boxes.map(b => b.y + b.height));
    const center: [number, number] = [(x0 + x1) / 2, (y0 + y1) / 2];
    const initial = roots.flatMap(n => {
      const info = doc.nodes.get(n.id); if (!info) return [];
      const p = placementOf(n), q = apply(info.matrix, pivotPoint(info.bounds, p.pivot));
      const parent = locateNode(this.scene!.objects, n.id)?.parent;
      const matrix = parent && doc.nodes.get(parent.id)?.matrix;
      const toParent = matrix ? invert(matrix) : [1, 0, 0, 1, 0, 0];
      return [{ id: n.id, p, q, toParent, nested: !!parent && !(parent.kind === 'group' && parent.composition) }];
    });
    return (factor: number) => {
      if (!this.scene || !Number.isFinite(factor)) return;
      const k = Math.max(0.0001, factor);
      for (const { id, p, q, toParent: m } of initial) {
        const n = locateNode(this.scene.objects, id)?.node; if (!n) continue;
        const dx = (q[0] - center[0]) * (k - 1), dy = (q[1] - center[1]) * (k - 1);
        const x = p.x + m[0]! * dx + m[2]! * dy, y = p.y + m[1]! * dx + m[3]! * dy;
        n.transform = { ...n.transform, x, y, scale: p.scale * k };
      }
      // Ordinary groups pivot around changing child bounds. Solve their placement response in
      // document space rather than assuming their parent matrix stays fixed during the resize.
      if (initial.some(item => item.nested)) {
        const probe = $state.snapshot(this.scene) as SceneV1; probe.at = this.time;
        const engine = createEngine(builtins);
        const measure = (id: string) => {
          const info = engine.evaluateDocument(probe).nodes.get(id)!;
          const n = locateNode(probe.objects, id)!.node;
          return apply(info.matrix, pivotPoint(info.bounds, placementOf(n).pivot));
        };
        for (let pass = 0; pass < 3; pass++) for (const item of initial.filter(i => i.nested)) {
          const n = locateNode(probe.objects, item.id)!.node;
          const target = [center[0] + k * (item.q[0] - center[0]), center[1] + k * (item.q[1] - center[1])];
          for (let i = 0; i < 4; i++) {
            const c = measure(item.id), dx = target[0]! - c[0], dy = target[1]! - c[1];
            if (Math.abs(dx) + Math.abs(dy) < 1e-6) break;
            const p = placementOf(n);
            n.transform = { ...n.transform, x: p.x + 1 }; const a = measure(item.id);
            n.transform = { ...n.transform, x: p.x, y: p.y + 1 }; const b = measure(item.id);
            const ax = a[0] - c[0], ay = a[1] - c[1], bx = b[0] - c[0], by = b[1] - c[1], det = ax * by - ay * bx;
            n.transform = { ...n.transform, x: p.x, y: p.y };
            if (Math.abs(det) < 1e-12) break;
            n.transform = { ...n.transform, x: p.x + (dx * by - dy * bx) / det, y: p.y + (dy * ax - dx * ay) / det };
          }
        }
        for (const item of initial.filter(i => i.nested)) {
          const n = locateNode(this.scene.objects, item.id)!.node;
          n.transform = { ...n.transform, ...locateNode(probe.objects, item.id)!.node.transform };
        }
      }
      for (const { id } of initial) {
        const p = placementOf(locateNode(this.scene.objects, id)!.node);
        for (const param of ['x', 'y', 'scale'] as const) this.#autoKey({ node: id, on: 'node', param }, p[param]);
      }
      this.record();
    };
  }
  scaleSelection(factor: number) { this.captureSelectionScale()?.(factor); }

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
    if (this.isLocked(id)) return;
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
    this.also = [];
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

  /** Bake a Boolean group's current result into an SVG path object, discarding its editable sources. */
  booleanToPath() {
    const scene = this.scene;
    const group = this.activeNode;
    if (!scene || !group || group.kind !== 'group' || !this.current || this.current.type !== 'boolean') return;
    this.flush();
    const engine = (this.#packEngine ??= createEngine(builtins));
    const doc = engine.evaluateDocument($state.snapshot(scene) as SceneV1);
    const baked = packNode(scene, group.id, doc, uid());
    if (!baked?.node.packed) return;
    baked.node.source = toSVG(baked.node.packed.geometry, { precision: 3 });
    delete baked.node.packed;
    this.selected = group.id;
    this.also = [];
    this.#applyTime();
    this.notice = 'Boolean converted to a path. Its source objects, effects and animation were removed; Undo restores them.';
    this.record(true);
  }

  // ── Animación: las claves viven en scene.animation; el valor del instante actual se escribe en la escena
  // (sin historial), así panel, lienzo y actuadores leen siempre «lo que se ve ahora».

  get animation(): Animation | null {
    return this.scene?.animation ?? null;
  }
  #ensureAnimation(): Animation {
    const s = this.scene!;
    s.animation ??= { duration: sceneDuration(s), loop: true, fps: 30, tracks: [] };
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
    if (this.animationDisabled) return;
    const anim = this.animation;
    const d = anim?.duration ?? 3;
    this.time = Math.max(0, Math.min(d, t));
    this.#applyTime();
  }
  /** Playback belongs to the editor, independently of which panels are open. */
  togglePlayback() {
    if (!this.scene) return;
    if (!this.playing && this.time >= (this.animation?.duration ?? 3) - 1e-6) this.setTime(0);
    this.playing = !this.playing;
  }
  advancePlayback(seconds: number) {
    if (!this.playing || !this.scene || seconds <= 0) return;
    const duration = this.animation?.duration ?? 3;
    let time = this.time + seconds;
    if (time >= duration) {
      if (this.animation?.loop !== false) time %= duration;
      else { time = duration; this.playing = false; }
    }
    this.setTime(time);
  }
  stepFrame(direction: -1 | 1) {
    this.playing = false;
    const fps = this.animation?.fps ?? 30;
    const last = Math.floor((this.animation?.duration ?? 3) * fps + 1e-6);
    this.setTime(Math.max(0, Math.min(last, Math.round(this.time * fps) + direction)) / fps);
  }
  #applyTime() {
    if (!this.scene?.animation) return;
    const sampled = sampleScene($state.snapshot(this.scene) as SceneV1, this.time);
    for (const tr of this.scene.animation.tracks) {
      const v = readTarget(sampled, tr);
      writeTrackTarget(this.scene, tr, v);
    }
  }
  setDuration(d: number) {
    const anim = this.#ensureAnimation();
    anim.duration = Math.max(0.1, d);
    for (const marker of anim.markers ?? []) marker.t = Math.min(marker.t, anim.duration);
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
  /**
   * Lo que puede seguir al puntero: la posición del objeto, los puntos de sus efectos que son un lugar del
   * dibujo (centros, pivotes…) y sus números (con un rango).
   */
  followTargets(nodeId: string): { label: string; target: TrackTarget; kind: 'point' | 'number' | 'angle' }[] {
    const n = this.scene ? locateNode(this.scene.objects, nodeId)?.node : undefined;
    if (!n) return [];
    const out: { label: string; target: TrackTarget; kind: 'point' | 'number' | 'angle' }[] = [{ label: 'Position', target: { node: nodeId, on: 'node', param: 'position' }, kind: 'point' }];
    const walk = (list: ModifierInstance[]) => {
      for (const m of list) {
        const def = registry.get(m.type);
        for (const [name, spec] of Object.entries(def?.params ?? {})) {
          if (spec.type === 'point' && spec.unit === 'fraction' && spec.handle !== false && spec.animatable !== false)
            out.push({ label: `${def!.label} · ${spec.label ?? name[0]!.toUpperCase() + name.slice(1)}`, target: { node: nodeId, on: 'modifier', modifier: m.id, param: name }, kind: 'point' });
        }
        walk(m.children ?? []);
      }
    };
    walk(n.stack);
    for (const t of this.interactionTargets(nodeId)) if (t.kind !== 'color' && t.target.param !== 'x' && t.target.param !== 'y') out.push({ ...t, kind: t.kind });
    return out;
  }
  /** Cambia el disparador; «pointer» va con «follow» (y al revés), con valores de partida. */
  setInteractionTrigger(id: string, trigger: Interaction['trigger']) {
    const it = this.scene?.interactions?.find((x) => x.id === id);
    if (!it || it.trigger === trigger) return;
    it.trigger = trigger;
    if (trigger === 'pointer') {
      Object.assign(it, { action: 'follow', target: { node: it.node, on: 'node', param: 'position' }, to: null, duration: 0.15, axis: 'both' });
      delete it.range;
    } else if (it.action === 'follow') {
      Object.assign(it, { action: 'tween', target: { node: it.node, on: 'node', param: 'scale' }, to: 1.2, duration: 0.3, ease: 'back-out' });
      delete it.axis;
      delete it.range;
      delete it.stay;
    }
    this.record(true);
  }
  /** Qué sigue al puntero; un número empieza con un rango alrededor de su valor. */
  setFollowTarget(id: string, target: TrackTarget, kind: 'point' | 'number' | 'angle') {
    const it = this.scene?.interactions?.find((x) => x.id === id);
    if (!it || !this.scene) return;
    it.target = target;
    if (kind === 'point') {
      it.axis = it.axis ?? 'both';
      delete it.range;
    } else {
      const v = Number(readTarget($state.snapshot(this.scene) as SceneV1, target) ?? 0) || 0;
      it.range = kind === 'angle' ? [v - 45, v + 45] : target.param === 'scale' || target.param === 'opacity' ? [0, 1] : [v - 1, v + 1];
      it.axis = it.axis === 'y' ? 'y' : 'x';
    }
    this.record(true);
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
    const ids = new Set([...walkNodes(sorted)].map(({ node }) => node.id));
    const animation = this.scene.animation;
    return JSON.stringify({
      svertik: 1, kind: 'nodes', items: sorted.map((n) => $state.snapshot(n)),
      ...(animation ? { animation: { ...$state.snapshot(animation), markers: undefined, tracks: animation.tracks.filter(tr => ids.has(tr.node)) } } : {}),
    });
  }

  /** Pega lo copiado (`offset`: cuánto se desplaza; 0, en el mismo sitio). Devuelve false si el texto no es del portapapeles de svertik. */
  paste(text: string, offset = 16, commit = true): boolean {
    let data: { svertik?: number; kind?: string; items?: unknown[]; animation?: Animation };
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
      if (commit) this.record(true);
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
      this.scene = newScene(items);
      this.#history = [];
      this.#index = -1;
    } else {
      // Encima del primer seleccionado (en su lista), o arriba del todo.
      const first = this.selectedNodes[0];
      const at = first ? locateNode(this.scene.objects, first.id) : null;
      (at ? at.list : this.scene.objects).splice(at ? at.index : 0, 0, ...items);
    }
    // Match old and fresh IDs throughout the copied subtrees, including nested effects.
    const nodeIds = new Map<string, string>();
    const modifierIds = new Map<string, string>();
    const mapModifiers = (before: ModifierInstance[], after: ModifierInstance[]) => {
      before.forEach((m, i) => {
        const copy = after[i]!;
        modifierIds.set(m.id, copy.id);
        mapModifiers(m.children ?? [], copy.children ?? []);
      });
    };
    const before = [...walkNodes(data.items as SceneNode[])];
    const after = [...walkNodes(items)];
    before.forEach(({ node }, i) => {
      nodeIds.set(node.id, after[i]!.node.id);
      mapModifiers(node.stack, after[i]!.node.stack);
    });
    const roots = new Set((data.items as SceneNode[]).map(n => n.id));
    const source = data.animation;
    const tracks = Array.isArray(source?.tracks) ? source.tracks.flatMap(tr => {
      const node = nodeIds.get(tr.node);
      const modifier = tr.modifier ? modifierIds.get(tr.modifier) : undefined;
      if (!node || (tr.on === 'modifier' && !modifier)) return [];
      return [{
        ...tr, id: `track-${uid()}`, node, ...(modifier ? { modifier } : {}),
        keys: tr.keys.map(key => ({ ...key, value: tr.on === 'node' && roots.has(tr.node) &&
          (tr.param === 'x' || tr.param === 'y') && typeof key.value === 'number' ? key.value + offset : key.value })),
      }];
    }) : [];
    if (tracks.length && source) {
      if (!this.scene.animation) this.scene.animation = { ...source, markers: undefined, tracks };
      else {
        this.scene.animation.tracks.push(...tracks);
        this.scene.animation.duration = Math.max(this.scene.animation.duration, source.duration);
      }
      this.#applyTime();
    }
    this.selected = items[0]!.id;
    this.also = items.slice(1).map((n) => n.id);
    if (commit) this.record(true);
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

  /** Raster objects support affine transforms, opacity, masks and SVG pixel filters. */
  canAdd(type: string) {
    const node = this.activeNode;
    if (node?.kind !== 'object' || node.packed || !/<image\b/i.test(node.source)) return true;
    const def = registry.get(type);
    return type === 'transform' || type === 'opacity' || type === 'mask' || def?.kind === 'filter';
  }

  /**
   * Where `add(type)` would put a new modifier: inside the selected container (at the end), after the
   * selected modifier (climbing out of containers that can't hold `type`, so a Step inside a Step goes
   * after the outer one), or at the end of the active node's stack. Null without an active node.
   */
  insertion(type: string): { owner: SceneNode; where: 'inside' | 'after' | 'end'; at: Location | null } | null {
    const owner = this.activeNode;
    if (!owner) return null;
    const at = locate(owner.stack, this.selected);
    if (!at) return { owner, where: 'end', at: null };
    if (canNest(at.inst.type, type)) return { owner, where: 'inside', at };
    let cur = at;
    while (cur.parent && !canNest(cur.parent.type, type)) cur = locate(owner.stack, cur.parent.id)!;
    return { owner, where: 'after', at: cur };
  }

  /** The modifier type the command line is about to add (the stack previews where it will land). */
  commandPreview = $state<string | null>(null);

  /** `params`: values that override the defaults (from the command line: "twist angle=45"). */
  add(type: string, params: Record<string, unknown> = {}) {
    if (this.activeNode && this.isLocked(this.activeNode.id)) return;
    if (!this.canAdd(type)) { this.notice = 'This effect does not support raster images.'; return; }
    // Boolean con varios objetos seleccionados: primero se agrupan (Boolean trabaja con los hijos de un grupo).
    if (type === 'boolean' && this.selectedNodes.length > 1 && !this.current) this.group();
    const def = registry.get(type);
    const owner = this.activeNode;
    if (!this.scene || !def || !owner) return;
    const inst: ModifierInstance = { id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(def.params) } };
    if (type === 'color') inst.params!.mode = 'solid';
    if (['particles', 'gravity', 'oscillate', 'wiggle', 'pulse', 'shake'].includes(type)) {
      inst.params!.time = { $expr: 'scene.time', fallback: 1 };
      this.#ensureAnimation();
    }
    if (containers.has(type)) inst.children = [];
    if (['oscillate', 'wiggle', 'pulse', 'shake'].includes(type)) {
      const params = type === 'pulse' ? { scale: 1.2 } : type === 'shake' ? { x: 12, y: 8, rotation: 3 } : { y: type === 'oscillate' ? 30 : 12, rotation: type === 'wiggle' ? 8 : 0 };
      inst.children = [{ id: `transform-${uid()}`, type: 'transform', params }];
    }
    Object.assign(inst.params!, params);
    const at = locate(owner.stack, this.selected);
    const spot = this.insertion(type)!;
    if (spot.where === 'inside') {
      spot.at!.inst.children ??= [];
      spot.at!.inst.children.push(inst);
    } else if (spot.where === 'after') spot.at!.list.splice(spot.at!.index + 1, 0, inst);
    else owner.stack.push(inst);
    this.selected = inst.id;
    // Que se vea lo añadido: el nodo y el Step que lo recibe, desplegados.
    const host = at && containers.has(at.inst.type) ? at.inst.id : at?.parent?.id;
    this.collapsed = this.collapsed.filter((x) => x !== owner.id && x !== host);
    this.record(true);
  }

  /** Names a modifier in the stack; an empty name, or the effect's own label, goes back to the label. */
  renameModifier(id: string, name: string) {
    const at = this.scene ? locateModifier(this.scene, id) : null;
    if (!at || this.isLocked(at.owner.id)) return;
    const clean = name.trim();
    if (!clean || clean === registry.get(at.inst.type)?.label) delete at.inst.name;
    else at.inst.name = clean;
    this.record(true);
  }

  /** Quita un modificador o un nodo. */
  remove(id = this.selected) {
    if (!this.scene || !id) return;
    const lockedOwner = locateNode(this.scene.objects, id)?.node ?? locateModifier(this.scene, id)?.owner;
    if (lockedOwner && this.isLocked(lockedOwner.id)) return;
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
    this.record(true);
  }

  /** Mueve dentro de su misma lista (teclado: ⌥↑/↓). Vale para modificadores y nodos. */
  move(id: string, to: number) {
    if (!this.scene) return;
    const owner = locateNode(this.scene.objects, id)?.node ?? locateModifier(this.scene, id)?.owner;
    if (owner && this.isLocked(owner.id)) return;
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
    if (this.isLocked(at.owner.id) || (ownerId && this.isLocked(ownerId))) return;
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
    if (this.activeNode && this.isLocked(this.activeNode.id)) return;
    if (!this.current?.params) return;
    this.current.params[name] = value;
    const owner = this.activeNode;
    if (owner) this.#parameterChanged({ node: owner.id, on: 'modifier', modifier: this.current.id, param: name }, value);
    if (registry.get(this.current.type)?.params[name]?.type === 'point') this.showMarker(value as [number, number]);
    this.busy = true;
    clearTimeout(this.#busyTimer);
    this.#busyTimer = setTimeout(() => (this.busy = false), 400);
    this.record();
  }

  /** Sustituye la escena entera (desde el panel de código). Devuelve false si no cambia nada. */
  applyScene(scene: SceneV1) {
    if (!this.scene) return false;
    if (JSON.stringify(scene) === JSON.stringify($state.snapshot(this.scene))) return false;
    this.scene = scene;
    if (this.selected && !locateNode(scene.objects, this.selected) && !locateModifier(scene, this.selected)) this.selected = scene.objects[0]?.id ?? null;
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

  /** The dice and zero controls for autonomous shape generators. */
  randomizeShape(id: string, seed = Math.floor(Math.random() * 2 ** 31)) {
    const node = this.scene ? locateNode(this.scene.objects, id)?.node : undefined;
    const def = node?.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
    if (!node || node.kind !== 'shape' || !def?.timeDriven || this.isLocked(id)) return;
    node.params = randomizeParams(def.params, resolveParams(def.params, node.params), rng(seed));
    this.record(true);
  }

  zeroShape(id: string) {
    const node = this.scene ? locateNode(this.scene.objects, id)?.node : undefined;
    const def = node?.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
    if (!node || node.kind !== 'shape' || !def?.timeDriven || this.isLocked(id)) return;
    node.params = zeroParams(def.params, resolveParams(def.params, node.params));
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
      const snap = JSON.stringify({ scene: this.#rootScene, name: this.name, script: this.script, canvas: this.canvas });
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
    const { scene, name, script, canvas } = JSON.parse(snap) as { scene: SceneV1 | null; name: string; script?: string; canvas?: string };
    this.#rootScene = scene;
    this.compositionPath = this.compositionPath.slice(0, this.compositionBreadcrumbs.length);
    this.#compositionViews = this.#compositionViews.slice(0, this.compositionPath.length);
    this.name = name;
    this.canvas = canvas ?? '';
    this.script = script ?? DEFAULT_SCRIPT;
    this.#index = i;
    if (this.selected && this.scene && !locateNode(this.scene.objects, this.selected) && !locateModifier(this.scene, this.selected)) {
      this.selected = this.scene?.objects[0]?.id ?? null;
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
  /** Vuelve a la pantalla inicial para abrir un proyecto o crear una escena nueva. */
  returnToStart() {
    this.scene = null;
    this.selected = null;
    this.also = [];
    this.playing = false;
    this.time = 0;
    this.compositionPath = [];
    this.#compositionViews = [];
  }
  /** Archivo nuevo: lienzo vacío, sin historial. */
  newFile(width = DEFAULT_DOCUMENT.width, height = DEFAULT_DOCUMENT.height) {
    this.compositionPath = [];
    this.#compositionViews = [];
    this.demoOrigin = null;
    this.scene = { ...newScene(), document: { width: Math.max(1, Math.min(10000, Number(width) || DEFAULT_DOCUMENT.width)), height: Math.max(1, Math.min(10000, Number(height) || DEFAULT_DOCUMENT.height)) } };
    this.name = 'untitled';
    this.script = DEFAULT_SCRIPT;
    this.selected = null;
    this.also = [];
    this.time = 0;
    this.playing = false;
    this.timelineOpen = false;
    this.codeOpen = false;
    // Fondo de serie: no se hereda el que tuviera otro documento (ni la preferencia guardada).
    this.canvas = '';
    writePref('svertik.canvas', '');
    this.error = null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
    this.markSaved();
  }

  projectFile(): string | null {
    if (!this.scene) return null;
    return JSON.stringify(
      { svertik: 'project', version: 1, name: this.name, canvas: this.canvas || undefined, script: this.script, scene: $state.snapshot(this.#rootScene) },
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
    this.compositionPath = [];
    this.#compositionViews = [];
    this.demoOrigin = null;
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
    const encoded = await encodeState({ scene: $state.snapshot(this.#rootScene) as SceneV1, name: this.name, script: this.script, ...(this.canvas ? { canvas: this.canvas } : {}) });
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
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as SceneV1, name: this.name, script: this.script, ...(this.canvas ? { canvas: this.canvas } : {}) });
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
    this.compositionPath = [];
    this.#compositionViews = [];
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
