// Editor state: the scene (objects and groups), the selection, the history and the URL.
import { t } from '@svertik/ui/i18n';
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
  attachSources,
  detachSources,
  missingSources,
  unpackNode,
  restorePacks,
  stripPackGeometry,
  linearOf,
  readTarget,
  pathPointParam,
  parsePathPointParam,
  readPathPointTarget,
  writePathPointTarget,
  isPathContours,
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
  type ViewportFit,
  viewportFit,
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
  liftNodeEach,
  applyPalette,
  DOCUMENT_PALETTE,
  PALETTES,
  type Palette,
  type ParamSchema,
  renameReferences,
  sceneNames,
  type SceneNames,
} from '@svertik/engine';
import { DEFAULT_SCRIPT } from './code';
import { compactJSON } from './exporters';
import { browserStore, remember, type Recent, type RecentStore } from './recents';
import { decodeState, encodeState, MAX_HASH, shortenState, shortLink, stateFromHash, uploadPreview, type ShareTarget } from './share';

export const registry = new Map<string, ModifierDef>(builtins.map((m) => [m.type, m as ModifierDef]));
/** Effects that only live inside another one (Each › Shape): left out of the menus and the command line. */
export const nestedOnly = new Set(['shapevalues']);
export const modifierTypes = builtins.map((m) => m.type).filter((type) => !nestedOnly.has(type));

/** What the editor shows behind a scene without a background (exports stay transparent). */
export const DEFAULT_CANVAS = '#ffffff';

/** CSS for a stage behind the scene: its background over the editor's default (translucent ones show it). */
export const stageBackground = (background: string) =>
  background ? `linear-gradient(${background}, ${background}), ${DEFAULT_CANVAS}` : DEFAULT_CANVAS;

/** Projects, links and autosaves from before `scene.background` kept it as the editor's canvas colour. */
function adoptCanvas(scene: SceneV1 | null | undefined, canvas: string | undefined) {
  if (scene && canvas && !scene.background) scene.background = canvas;
}

/** The colour a Tracer draws an object's trail in: the object's fill, or its stroke, or the accent. */
function tracerColor(node: SceneNode): string {
  const params = node.kind === 'shape' ? (node.params as Record<string, unknown>) : {};
  const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v : undefined);
  return (params.fill !== false && hex(params.fillColor)) || (params.stroke === true && hex(params.strokeColor)) || '#09fdd1';
}

/** Fill for new primitives: visible on the default light canvas. */
export const DEFAULT_FILL = '#333333';

export const DEFAULT_DOCUMENT = { width: 1400, height: 900 };
const newScene = (objects: SceneNode[] = []): SceneV1 => ({ version: 1, document: { ...DEFAULT_DOCUMENT }, objects });
const normalizeSeedGenerator = (value: number) => Math.max(0, Math.min(0x7fffffff, Math.round(Number.isFinite(value) ? value : 1)));

/** Effects that select a subset of elements and can scope time signals to that subset. */
export const selectors = new Set(['range', 'field']);
/** Time-signal effectors that can run inside a selector. */
export const signalEffectors = new Set(['oscillate', 'wiggle', 'pulse', 'shake']);
/** Modifiers that accept children and apply them according to their own semantics. */
export const effectors = new Set(['step', 'each', 'range', 'field', 'stagger', 'oscillate', 'wiggle', 'pulse', 'shake', 'physics', 'rigidpieces']);
const rigidPieceStyles = new Set(['color', 'tint', 'opacity', 'paint', 'gradient', 'imagefill', 'feather']);
export const containers = new Set([...effectors, 'rgbsplit']);
/**
 * Can `child` go inside `parent`? Selectors can scope time signals to their selected elements. Rigid Pieces
 * also scopes geometry and per-piece style effects; other effectors do not contain effectors.
 */
export function canNest(parent: string, child: string): boolean {
  if (child === 'shapevalues') return parent === 'each';
  if (!containers.has(parent)) return false;
  if (parent === 'rigidpieces') return registry.get(child)?.kind === 'deformer' || rigidPieceStyles.has(child);
  if (selectors.has(parent) && signalEffectors.has(child)) return true;
  if (effectors.has(parent)) return !effectors.has(child);
  return child !== 'rgbsplit';
}

/** Where a modifier is in a stack tree: its list, its position and what contains it. */
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

/** Where a node (object or group) is: its list, its position and its group. */
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

/** A modifier and the node whose stack holds it. */
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

/** Writes a value to what a track points at (in the editor's live scene). */
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
    if (n.kind === 'shape') {
      if (n.shape === 'path' && parsePathPointParam(tr.param)) writePathPointTarget(n.params.contours, tr.param, value);
      else n.params[tr.param] = value;
    }
  } else {
    const m = tr.modifier ? locate(n.stack, tr.modifier)?.inst : undefined;
    if (m && tr.param === 'enabled') m.enabled = !!value;
    else if (m) m.params = { ...m.params, [tr.param]: value };
  }
}

/** Preferences in localStorage (it may be missing: private mode, no permission…). */
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
    /* no storage: nothing to do */
  }
}
/** This tab's autosave (sessionStorage: per tab, kept across reloads). Empty clears it; too big or no storage, nothing is kept. */
const SESSION_KEY = 'svertik:session';
function readSession(): string {
  try {
    return sessionStorage.getItem(SESSION_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeSession(encoded: string) {
  try {
    if (encoded) sessionStorage.setItem(SESSION_KEY, encoded);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Over the quota: drop the older autosave rather than bring back stale work after a reload.
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* no storage */ }
  }
}
const uid = () => Math.random().toString(36).slice(2, 8);
/** The id of this tab's current scene among the recent ones (sessionStorage: a restored tab keeps it). */
const RECENT_KEY = 'svertik:recent';
function readRecentId(): string {
  try {
    return sessionStorage.getItem(RECENT_KEY) ?? '';
  } catch {
    return '';
  }
}
function writeRecentId(id: string) {
  try {
    sessionStorage.setItem(RECENT_KEY, id);
  } catch {
    /* no storage: the entry lasts this page */
  }
}

/** Saved custom palettes (a list of { name, colors }); anything unreadable is dropped. */
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

/** Copy with new ids (its children's and effects' too), to paste without repeating. */
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
    // 0.0.8 kept per-copy shape values on the node: they are an Each › Shape now.
    if (value) liftNodeEach(value);
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
      if (locations.some(l => l.list !== target)) { this.notice = t('Select objects in the same group to create a composition.'); return; }
      locations.sort((a, b) => a.index - b.index); index = locations[0]!.index;
      objects = locations.map(l => l.node);
      const ids = new Set([...walkNodes(objects)].map(({ node }) => node.id));
      // A composition is an isolated scope: never silently break references at its boundary.
      for (const { node: n } of walkNodes(parent.objects)) {
        const refs: string[] = n.kind === 'instance' ? [n.of, ...(typeof n.mouse?.target === 'string' && n.mouse.target ? [n.mouse.target] : [])] : n.kind === 'effector' ? n.targets : [];
        const scan = (stack: ModifierInstance[]) => { for (const m of stack) {
          const schema = registry.get(m.type)?.params ?? {};
          for (const [key, value] of Object.entries(m.params ?? {})) {
            if (schema[key]?.type === 'node' && typeof value === 'string' && value) refs.push(value);
            if (schema[key]?.type === 'nodes' && Array.isArray(value)) refs.push(...value);
          }
          scan(m.children ?? []);
        } }; scan(n.stack);
        if (refs.some(id => !!locateNode(parent.objects, id) && ids.has(n.id) !== ids.has(id))) {
          this.notice = t('Include all linked objects and targets in the selection before creating a composition.'); return;
        }
      }
      if (parent.interactions?.some(it => ids.has(it.node) !== ids.has(it.target.node))) {
        this.notice = t('Include the linked interaction targets in the composition.'); return;
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
      if (node.kind === 'instance') {
        node.of = remap.get(node.of) ?? node.of;
        if (typeof node.mouse?.target === 'string') node.mouse.target = remap.get(node.mouse.target) ?? node.mouse.target;
      }
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
    if (timelineTracks.length) this.notice = t('Composition clock baked into the parent timeline at {fps} fps.', { fps: Math.round(bakeRate) });
    this.record(true);
  }
  importComposition(text: string, filename = 'Composition'): boolean {
    try {
      const data = JSON.parse(text); const scene = data?.svertik === 'project' ? data.scene : data;
      if (!isScene(scene)) { this.notice = t('Choose a project or scene JSON.'); return false; }
      const report = validateScene(scene, builtins);
      if (report.errors.length) { this.notice = report.errors.join('\n'); return false; }
      return !!this.createComposition(false, scene, data.name ?? filename.replace(/\.[^.]+$/, ''));
    } catch { this.notice = t('Could not read the composition file.'); return false; }
  }
  /** Document name (the first SVG's, until there is another). */
  name = $state('untitled');
  /** The scene's background (the project's root scene); empty: transparent, shown over DEFAULT_CANVAS. */
  get background() { return this.#rootScene?.background ?? ''; }
  textZoom = $state(Math.max(80, Math.min(180, Number(readPref('svertik.textZoom')) || 100)));
  setTextZoom(value: number) {
    const zoom = Math.max(80, Math.min(180, Math.round(value / 10) * 10));
    if (zoom === this.textZoom) return;
    this.textZoom = zoom;
    writePref('svertik.textZoom', String(zoom));
  }
  setBackground(color: string) {
    const root = this.#rootScene;
    if (!root || color === (root.background ?? '')) return;
    if (color) root.background = color;
    else delete root.background;
    this.record();
  }
  setNotes(notes: string) {
    if (!this.scene || notes === (this.scene.notes ?? '')) return;
    if (notes) this.scene.notes = notes;
    else delete this.scene.notes;
    this.record();
  }
  /** Fill and stroke of new primitives (the rail's colour pickers). */
  fillColor = $state(DEFAULT_FILL);
  strokeColor = $state('#ededed');
  strokeOn = $state(false);
  /** New primitives without fill (the rail's fill set to None). */
  fillOn = $state(true);

  // ── Palettes: the built-in ones and custom ones (in this browser, like the canvas colour)

  savedPalettes = $state<Palette[]>(readSaved());
  /** The one the colour picker shows (a name, or the document's). */
  paletteName = $state(readPref('svertik.palette') || DOCUMENT_PALETTE);
  palettes = $derived([...PALETTES, ...this.savedPalettes]);
  selectPalette(name: string) {
    this.paletteName = name;
    writePref('svertik.palette', name === DOCUMENT_PALETTE ? '' : name);
  }
  /** Saves the document's colours as a palette (under that name; replaces a custom one with it). */
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
  /** Swaps the drawing's colours for the palette's (by lightness). Undoes like everything else. */
  applyPalette(name: string) {
    const p = this.palettes.find((x) => x.name === name);
    if (!this.scene || !p) return;
    const n = applyPalette(this.scene, p.colors);
    if (!n) {
      this.notice = t('Nothing to change: the drawing already uses those colors.');
      return;
    }
    this.notice = `${n} ${n === 1 ? 'color' : 'colors'} changed to ${p.name}. Undo brings them back.`;
    this.record(true);
  }
  /** The selection: a node (object or group) or a modifier. Assigning it leaves a single selection. */
  #selected = $state<string | null>(null);
  get selected() {
    return this.#selected;
  }
  set selected(id: string | null) {
    if (id && this.scene) {
      const owner = locateNode(this.scene.objects, id)?.node ?? locateModifier(this.scene, id)?.owner;
      if (owner?.kind === 'group' && owner.layer) {
        // A layer is not selected like an object: it becomes the active one.
        this.#activeLayer = owner.id;
        this.#selected = null;
        this.also = [];
        return;
      }
      if (owner && this.isLocked(owner.id)) return;
      const layer = owner ? this.layerOf(owner.id) : null;
      if (layer) this.#activeLayer = layer.id;
    }
    this.#selected = id;
    this.also = [];
  }

  // ── Layers: top-level groups with `layer: true` that split the scene's objects, so one zone can be
  // worked on while the others are hidden or locked. A scene without them is one implicit layer.

  #activeLayer = $state<string | null>(null);
  /** The scene's layers, front first (empty: the scene is one implicit layer). */
  get layers(): GroupNode[] {
    return (this.scene?.objects ?? []).filter((n): n is GroupNode => n.kind === 'group' && !!n.layer);
  }
  /** The layer new objects go to (the last one picked, or the front one). */
  get activeLayer(): GroupNode | null {
    const layers = this.layers;
    return layers.find((l) => l.id === this.#activeLayer) ?? layers[0] ?? null;
  }
  /** The top-level list the stack shows and new objects go to: the active layer's, or the scene's. */
  get root(): SceneNode[] {
    return this.activeLayer?.children ?? this.scene?.objects ?? [];
  }
  /** The layer that holds a node (its top-level ancestor, if that is a layer). */
  layerOf(id: string): GroupNode | null {
    if (!this.scene) return null;
    let at = locateNode(this.scene.objects, id);
    while (at?.parent) at = locateNode(this.scene.objects, at.parent.id);
    return at?.node.kind === 'group' && at.node.layer ? at.node : null;
  }
  /** Adds at the front of the active layer. A hidden layer is shown; a locked one refuses. */
  addToRoot(...nodes: SceneNode[]): boolean {
    if (!this.scene) return false;
    const layer = this.activeLayer;
    if (layer?.locked) {
      this.notice = t('Layer “{name}” is locked: unlock it or pick another layer.', { name: layer.name });
      return false;
    }
    if (layer && layer.visible === false) layer.visible = undefined;
    this.root.unshift(...nodes);
    return true;
  }
  setActiveLayer(id: string) {
    if (!this.layers.some((l) => l.id === id)) return;
    this.#activeLayer = id;
    // The selection stays only if it is in that layer.
    if (this.#selected && this.layerOf(this.activeNode?.id ?? this.#selected)?.id !== id) this.selected = null;
  }
  /**
   * A new layer in front of the active one. The first time, the scene's objects become "Layer 1", so a
   * scene always has at least one layer once layers are used.
   */
  addLayer() {
    if (!this.scene) return;
    if (!this.layers.length) {
      this.scene.objects = [{ kind: 'group', id: `layer-${uid()}`, name: 'Layer 1', layer: true, children: this.scene.objects, stack: [] }];
    }
    const taken = new Set(this.layers.map((l) => l.name));
    let n = this.layers.length + 1;
    while (taken.has(`Layer ${n}`)) n++;
    const layer: GroupNode = { kind: 'group', id: `layer-${uid()}`, name: `Layer ${n}`, layer: true, children: [], stack: [] };
    const at = this.activeLayer ? this.scene.objects.indexOf(this.activeLayer) : 0;
    this.scene.objects.splice(Math.max(0, at), 0, layer);
    this.#activeLayer = layer.id;
    this.selected = null;
    this.record(true);
  }
  /** Deletes a layer and its objects (undo brings them back). The last layer stays. */
  removeLayer(id: string) {
    if (!this.scene || this.layers.length <= 1) return;
    const i = this.scene.objects.findIndex((n) => n.id === id);
    const layer = this.scene.objects[i];
    if (!layer || layer.kind !== 'group' || !layer.layer || layer.locked) return;
    if (this.#selected && this.layerOf(this.activeNode?.id ?? this.#selected)?.id === id) this.selected = null;
    this.scene.objects.splice(i, 1);
    if (this.#activeLayer === id) this.#activeLayer = (this.scene.objects[i] ?? this.scene.objects[i - 1])?.id ?? null;
    this.record(true);
  }
  renameLayer(id: string, name: string) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer || !name.trim()) return;
    layer.name = name.trim();
    this.record(true);
  }
  /** Hidden layers are kept in the file but not drawn or exported. Locked layers can still be hidden. */
  setLayerVisible(id: string, visible: boolean) {
    const layer = this.layers.find((l) => l.id === id);
    if (!layer) return;
    layer.visible = visible ? undefined : false;
    if (!visible && this.#selected && this.layerOf(this.activeNode?.id ?? this.#selected)?.id === id) this.selected = null;
    this.record(true);
  }
  /** One step towards the front (-1) or the back (1). */
  moveLayer(id: string, dir: -1 | 1) {
    if (!this.scene) return;
    const list = this.scene.objects;
    const i = list.findIndex((n) => n.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    this.record(true);
  }
  /** Moves the selected objects to the front of another layer (keeping their order), in one undo step. */
  moveSelectionToLayer(id: string) {
    const target = this.layers.find((l) => l.id === id);
    if (!this.scene || !target || target.locked) return;
    const moving = this.selectedNodes.filter((n) => !this.isLocked(n.id) && this.layerOf(n.id)?.id !== id);
    if (!moving.length) return;
    // Layers have no transform: a node keeps its place on the page when it changes layer, as long as
    // it moves with its own transform (nested nodes take their groups' placement along).
    const located = moving.map((n) => ({ n, at: locateNode(this.scene!.objects, n.id)!, info: this.infos.get(n.id) })).filter((x) => x.at);
    const order = [...walkNodes(this.scene.objects)].map((x) => x.node.id);
    located.sort((a, b) => order.indexOf(a.n.id) - order.indexOf(b.n.id));
    for (const { n, at, info } of located) {
      const i = at.list.indexOf(n);
      if (i >= 0) at.list.splice(i, 1);
      const nested = !!at.parent && !(at.parent.kind === 'group' && at.parent.layer);
      if (nested && info) {
        const p = placementOf(n), b = info.bounds, c = [b.x + b.width / 2, b.y + b.height / 2];
        const rel = info.matrix, pv = pivotPoint(b, p.pivot), flip = p.flipX ? -1 : 1;
        n.transform = {
          ...p,
          x: rel[4] - pv[0] + c[0]! + rel[0] * pv[0] + rel[2] * pv[1],
          y: rel[5] - pv[1] + c[1]! + rel[1] * pv[0] + rel[3] * pv[1],
          rotation: Math.atan2(rel[1] * flip, rel[0] * flip) * 180 / Math.PI,
          scale: Math.hypot(rel[0], rel[1]),
        };
      }
    }
    if (target.visible === false) target.visible = undefined;
    target.children.unshift(...located.map((x) => x.n));
    this.#activeLayer = id;
    this.record(true);
  }
  /** More selected nodes (⇧ + click) besides the main one: to align, distribute, move together… */
  also = $state<string[]>([]);
  /** Collapsed nodes in the stack. */
  collapsed = $state<string[]>([]);
  #themeOverride = ['light', 'dark'].includes(readPref('svertik.theme'));
  #lightTheme = $state(readPref('svertik.theme') === 'light' ||
    (readPref('svertik.theme') !== 'dark' && !(typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches)));
  followSystemTheme(dark: boolean) {
    if (!this.#themeOverride) this.#lightTheme = !dark;
  }
  get lightTheme() { return this.#lightTheme; }
  set lightTheme(on: boolean) {
    this.#themeOverride = true;
    this.#lightTheme = on;
    writePref('svertik.theme', on ? 'light' : 'dark');
  }
  #showOriginal = $state(readPref('svertik.original') === 'on');
  get showOriginal() { return this.#showOriginal; }
  set showOriginal(on: boolean) { this.#showOriginal = on; writePref('svertik.original', on ? 'on' : 'off'); }
  // Inspector panels: Stack, Properties and Layers fold; the Layers panel is off until the View menu
  // turns it on (its × closes it again).
  #stackOpen = $state(readPref('svertik.panel.stack') !== 'off');
  get stackOpen() { return this.#stackOpen; }
  set stackOpen(on: boolean) { this.#stackOpen = on; writePref('svertik.panel.stack', on ? 'on' : 'off'); }

  #layersOpen = $state(readPref('svertik.panel.layers') !== 'off');
  get layersOpen() { return this.#layersOpen; }
  set layersOpen(on: boolean) { this.#layersOpen = on; writePref('svertik.panel.layers', on ? 'on' : 'off'); }
  #showLayers = $state(readPref('svertik.panel.layersShown') === 'on');
  get showLayers() { return this.#showLayers; }
  set showLayers(on: boolean) { this.#showLayers = on; writePref('svertik.panel.layersShown', on ? 'on' : 'off'); }
  /**
   * A scene that arrives with more than two layers shows the Layers panel, open, without asking: its layers
   * are part of how it is made. Only for this scene: the saved preference (shown or not) stays as it was.
   */
  #revealLayers(scene: SceneV1) {
    if (scene.objects.filter((o) => o.kind === 'group' && o.layer).length <= 2) return;
    this.#showLayers = true;
    this.#layersOpen = true;
  }
  #showWire = $state(readPref('svertik.wire') === 'on');
  get showWire() { return this.#showWire; }
  set showWire(on: boolean) { this.#showWire = on; writePref('svertik.wire', on ? 'on' : 'off'); }
  #showInfo = $state(readPref('svertik.showInfo') !== 'off');
  get showInfo() { return this.#showInfo; }
  set showInfo(on: boolean) { this.#showInfo = on; writePref('svertik.showInfo', on ? '' : 'off'); }
  /** View › Show presets: the effects' preset thumbnails (on by default; remembered in this browser). */
  #showPresets = $state(readPref('svertik.showPresets') !== 'off');
  get showPresets() { return this.#showPresets; }
  set showPresets(on: boolean) { this.#showPresets = on; writePref('svertik.showPresets', on ? '' : 'off'); }
  /** Temporarily freeze scene time without removing animation data from the document. */
  #animationDisabled = $state(readPref('svertik.animation-disabled') === 'on');
  get animationDisabled() { return this.#animationDisabled; }
  set animationDisabled(disabled: boolean) {
    this.#animationDisabled = disabled;
    writePref('svertik.animation-disabled', disabled ? 'on' : '');
    if (disabled) {
      this.playing = false;
      this.timelineOpen = false;
    }
  }
  /** Show the document border (what is exported). Remembered in this browser. */
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
  /** Box of what is drawn (no margin), in the document: the canvas writes it when painting. */
  contentBox = $state.raw<{ x: number; y: number; width: number; height: number } | null>(null);
  error = $state<string | null>(null);
  /** Script of the code panel (what follows the scene in the JS tab). */
  script = $state(DEFAULT_SCRIPT);
  /** Objects the script animates while it runs; they are not in the history. */
  preview = $state<SceneNode[] | null>(null);
  // Code and timeline, one or the other: while playing, the scene changes every frame and the code
  // could not be edited. Opening code pauses playback; closing the timeline does not stop it.
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
  /** Formula reference (ƒx): the variables and functions an expression can use. */
  fxOpen = $state(false);
  /** Timeline: open, current time (s) and playback. */
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
  /** Play mode: the scene full screen, no tools, with the exported code's player. */
  presenting = $state(false);
  time = $state(0);
  #playing = $state(false);
  get playing() { return this.#playing; }
  set playing(on: boolean) { this.#playing = !!on && !this.animationDisabled; }
  /** Fonts that Text can use (the bundled ones and, if requested, the system's). */
  fonts = $state<string[]>([]);
  /** Bumped every time a font arrives: the canvas redraws the text. */
  fontsTick = $state(0);
  /** A message for the user (the app shows it for a moment). */
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
    this.notice = t('Now it is yours: “{name}”. Save it with ⌘S.', { name: this.name });
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
      this.notice = this.current ? t('Nothing animated in this effect yet: use the ◇ next to a value, or: key <parameter>.') : t('Select an object to key.');
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
        out.push({ id: m.id, label: m.name || (registry.get(m.type)?.label ?? m.type), detail: t('effect on {name}', { name: owner }) });
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
  /** Info on each node after evaluation (reference box, matrix…): the canvas leaves it here. */
  infos = $state.raw<Map<string, NodeInfo>>(new Map());
  /** Armed primitive tool (drawn by dragging on the canvas). */
  tool = $state<string | null>(null);
  /** Point being moved (fraction of the source box); cleared when it stops. */
  marker = $state<[number, number] | null>(null);
  #markerTimer: ReturnType<typeof setTimeout> | undefined;
  /** An effect parameter is being changed (from the panel or the canvas): its wire shows lit. */
  busy = $state(false);
  #busyTimer: ReturnType<typeof setTimeout> | undefined;

  #history: string[] = [];
  #lastPasted = '';
  #pastes = 0;
  #index = $state(-1);
  #historyLength = $state(0);
  #timer: ReturnType<typeof setTimeout> | undefined;
  #pending = false;

  /** For debugging: history size and position. */
  get historyInfo() {
    return { length: this.#history.length, index: this.#index };
  }

  canUndo = $derived(this.#index > 0);
  canRedo = $derived(this.#index < this.#historyLength - 1);
  /** The selected modifier, with the node that holds it. */
  #mod = $derived(this.scene ? locateModifier(this.scene, this.selected) : null);
  current = $derived(this.#mod?.inst ?? null);
  /** The Step (or other container) the selection hangs from, if any. */
  currentParent = $derived(this.#mod?.parent ?? null);
  /** The selected node (object or group), if the selection is a node. */
  currentNode = $derived(this.scene ? (locateNode(this.scene.objects, this.selected)?.node ?? null) : null);
  /** The node being worked on: the selected one or the owner of the selected effect. */
  activeNode = $derived(this.currentNode ?? this.#mod?.owner ?? null);
  /** Every selected node (the main one first), without those that no longer exist. */
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

  /** Selects every root layer; groups include their children without selecting them twice. */
  selectAll() {
    const ids = this.scene ? this.root.filter((node) => !node.locked).map((node) => node.id) : [];
    this.#selected = ids[0] ?? null;
    this.also = ids.slice(1);
    this.tool = null;
  }

  /** ⇧ + click: adds or removes a node from the selection; the last one added becomes the main one. */
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

  /** Colours used in the document (primitives, effects and imported SVGs), for the picker's swatches. */
  docColors = $derived.by(() => {
    if (!this.scene) return [] as string[];
    const out = new Set<string>();
    // Swatches are opaque: a translucent colour (#rrggbbaa) adds its #rrggbb.
    const hex = /#[0-9a-f]{6}(?:[0-9a-f]{2})?\b|#[0-9a-f]{3}\b/gi;
    const add = (v: unknown) => {
      if (typeof v !== 'string') return;
      for (const m of v.match(hex) ?? []) out.add(m.length === 4 ? `#${[...m.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : m.slice(0, 7).toLowerCase());
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

  /** Loads an SVG: without a scene, it creates one; with one, it adds it as a new object, centred. */
  load(source: string, name: string) {
    this.error = null;
    if (!/<svg[\s>]/i.test(source)) {
      this.error = t('That is not an SVG.');
      return;
    }
    // Text in an SVG cannot be deformed (it has no outline until drawn with its font).
    if (/<text[\s>]/i.test(source)) this.notice = t('This SVG has text: convert it to outlines (paths) before importing, or it won’t be deformed.');
    const node: ObjectNode = { kind: 'object', id: `object-${uid()}`, name, source, stack: [] };
    if (!this.scene) {
      this.scene = newScene([node]);
      this.name = name.replace(/\.svg$/i, '');
      this.#newRecent();
      this.#history = [];
      this.#index = -1;
    } else {
      // New things go at the top of the list: in front of everything (in the active layer).
      if (!this.addToRoot(node)) return;
    }
    this.selected = node.id;
    this.record(true);
  }

  /** Adds a primitive (rectangle, star…) at `at` (centre, in the document) with its parameters. */
  addShape(type: string, params: Record<string, unknown> = {}, at: { x: number; y: number } = { x: 0, y: 0 }, options: { keepTool?: boolean } = {}) {
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
          : { fillColor: this.fillColor, strokeColor: this.strokeColor, stroke: this.strokeOn, ...(this.fillOn ? {} : { fill: false }) }),
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
      // Inside the selected group, if any; at the top of the list (in front).
      const g = this.currentNode?.kind === 'group' && !this.currentNode.composition ? this.currentNode : null;
      if (g) g.children.unshift(node);
      else if (!this.addToRoot(node)) return;
    }
    this.selected = node.id;
    if (!options.keepTool) this.tool = null;
    this.record(true);
  }

  // ── Utils

  /**
   * Instance of the active node: a live copy of its result, right in front of it and slightly offset
   * (so it shows), with the same placement and no effects of its own.
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

  addMouseInstance() {
    if (!this.scene) return;
    const source = this.activeNode;
    const taken = new Set([...walkNodes(this.scene.objects)].map(({ node }) => node.name));
    let name = 'Mouse Instance';
    for (let i = 2; taken.has(name); i++) name = `Mouse Instance ${i}`;
    const node: InstanceNode = {
      kind: 'instance', id: `mouse-${uid()}`, name,
      of: source && source.kind !== 'effector' && !(source.kind === 'instance' && source.mouse) ? source.id : '',
      mouse: {}, stack: [],
    };
    if (!this.addToRoot(node)) return;
    this.selected = node.id;
    this.record(true);
  }

  setMouseParam(id: string, name: string, value: unknown) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'instance' || !at.node.mouse) return;
    at.node.mouse[name] = value;
    this.record();
  }

  /**
   * New Effector, at the top of the list, with the selected objects as targets (it may start with
   * none). It stays selected: effects added go to its stack.
   */
  addEffector() {
    if (!this.scene) return;
    const targets = this.selectedNodes.filter((n) => n.kind !== 'effector').map((n) => n.id);
    const taken = new Set([...walkNodes(this.scene.objects)].map((x) => x.node.name));
    let name = 'Effector';
    for (let i = 2; taken.has(name); i++) name = `Effector ${i}`;
    const node: EffectorNode = { kind: 'effector', id: `effector-${uid()}`, name, targets, stack: [] };
    if (!this.addToRoot(node)) return;
    this.selected = node.id;
    this.record(true);
  }

  /**
   * Connector: a line (with its stroke) joining the first two selected objects and following them (the
   * Connect effect). At the top of the list; with fewer than two, the missing ones are picked in the effect later.
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
    if (!this.addToRoot(node)) return;
    this.selected = node.stack[0]!.id;
    this.record(true);
  }

  /** Tracer: a line that draws the active object's trail as it moves (the Trace effect), behind it. */
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
      // In the object's own colour (its fill, or its stroke): the line's default near-white disappears on a light canvas.
      params: { ...resolveParams(def.params), strokeWidth: 2, strokeColor: tracerColor(at.node) },
      stack: [{ id: `trace-${uid()}`, type: 'trace', enabled: true, params: { ...resolveParams(tdef.params), target: at.node.id } }],
    };
    // Behind the object (the trail does not cover it), in the top list (outside groups).
    const top = this.scene!.objects;
    const root = at.parent ? top.findIndex((n) => !!locateNode([n], at.node.id)) : at.index;
    top.splice(root + 1, 0, node);
    this.selected = node.stack[0]!.id;
    this.record(true);
  }

  /** Adds (or removes) a target of an Effector. */
  setEffectorTarget(id: string, target: string, on: boolean) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'effector' || target === id) return;
    const has = at.node.targets.includes(target);
    if (on === has) return;
    at.node.targets = on ? [...at.node.targets, target] : at.node.targets.filter((x) => x !== target);
    this.record(true);
  }

  /** Delay from one target to the next (seconds). */
  setEffectorDelay(id: string, delay: number, now = false) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'effector') return;
    const d = Math.max(0, Math.round(delay * 1000) / 1000);
    if (d) at.node.delay = d;
    else delete at.node.delay;
    this.record(now);
  }

  /** Changes an instance's original. */
  setInstanceOf(id: string, of: string) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'instance' || at.node.of === of || id === of) return;
    at.node.of = of;
    this.record(true);
  }

  /** A primitive parameter. */
  /** Changes a primitive parameter without the history (while typing on the canvas: one step later). */
  previewShapeParam(id: string, name: string, value: unknown) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (at?.node.kind === 'shape') at.node.params[name] = value;
  }
  /** Text being edited on the canvas (node id), or null. */
  editingText = $state<string | null>(null);
  editingPath = $state<string | null>(null);
  startPointEditing(id = this.selected) {
    this.playing = false;
    this.editingText = null;
    this.tool = 'nodes';
    const node = id && this.scene ? locateNode(this.scene.objects, id)?.node : null;
    this.editingPath = node?.kind === 'shape' && node.shape === 'path' && !this.isLocked(node.id) ? node.id : null;
  }
  textFxNode = $state<string | null>(null);
  openTextFx(id: string) {
    const n = this.scene ? locateNode(this.scene.objects, id)?.node : null;
    if (n?.kind !== 'shape' || n.shape !== 'text' || this.isLocked(id)) return;
    this.editingText = null;
    this.editingPath = null;
    this.tool = null;
    this.textFxNode = id;
  }

  convertTextToPlain(id: string): boolean {
    if (!this.scene || this.isLocked(id)) return false;
    const node = locateNode(this.scene.objects, id)?.node;
    if (node?.kind !== 'shape' || node.shape !== 'text') return false;
    const resolved = evaluateSceneExpressions(sampleScene($state.snapshot(this.scene) as SceneV1, this.time));
    const evaluated = locateNode(resolved.objects, id)?.node;
    if (evaluated?.kind !== 'shape') return false;
    const text = String(evaluated.params.text ?? '');
    if (hasTextExpressions(text)) { this.notice = t('Cannot convert: fix the unresolved text expressions first.'); return false; }
    this.flush();
    node.params.text = text;
    // Keep the evaluated text anchor so conversion does not recenter the rendered text.
    if (evaluated.params.anchor !== undefined) node.params.anchor = evaluated.params.anchor;
    if (evaluated.params.updateRate !== undefined) node.params.updateRate = evaluated.params.updateRate;
    if (this.scene.animation) this.scene.animation.tracks = this.scene.animation.tracks.filter(t => !(t.node === id && t.on === 'shape' && t.param === 'text'));
    this.record(true);
    return true;
  }

  keyPathPoint(id: string, contour: number, index: number) {
    if (!this.scene || this.isLocked(id)) return;
    const node = locateNode(this.scene.objects, id)?.node;
    if (node?.kind !== 'shape' || node.shape !== 'path' || !isPathContours(node.params.contours)) return;
    const point = node.params.contours[contour]?.points[index];
    if (!point) return;
    this.flush();
    point.id ??= `point-${uid()}`;
    const target: TrackTarget = { node: id, on: 'shape', param: pathPointParam(point.id) };
    const animation = this.#ensureAnimation();
    let track = this.track(target);
    if (!track) { track = { id: `track-${uid()}`, ...target, keys: [] }; animation.tracks.push(track); }
    track.keys = setKey(track.keys, this.time, [...point.point], animation.fps ?? 30);
    this.record(true);
  }

  setShapeParam(id: string, name: string, value: unknown) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    at.node.params[name] = value;
    if (at.node.shape === 'path' && name === 'contours' && this.scene?.animation) {
      this.scene.animation.tracks = this.scene.animation.tracks.filter(t => t.node !== id || t.on !== 'shape' || !parsePathPointParam(t.param) || readPathPointTarget(value, t.param) !== undefined);
      for (const track of this.scene.animation.tracks) if (track.node === id && track.on === 'shape' && parsePathPointParam(track.param) && this.keyState(track) === 'key') this.#autoKey(track, readPathPointTarget(value, track.param));
    }
    this.#parameterChanged({ node: id, on: 'shape', param: name }, value);
    this.record();
  }

  /**
   * Resizes a primitive through its size values (canvas handles): sets the values that changed and moves it
   * to (x, y), so it grows around the right point. Animated values get a key, like a typed value would.
   */
  resizeShape(id: string, params: Record<string, unknown>, x: number, y: number) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    const r = (n: number) => Math.round(n * 100) / 100;
    for (const [name, value] of Object.entries(params)) {
      const next = typeof value === 'number' ? r(value) : value;
      if (at.node.params[name] === next) continue;
      at.node.params[name] = next;
      if (typeof next === 'number') this.#parameterChanged({ node: id, on: 'shape', param: name }, next);
    }
    at.node.transform = { ...at.node.transform, x: r(x), y: r(y) };
    this.#autoKey({ node: id, on: 'node', param: 'x' }, r(x));
    this.#autoKey({ node: id, on: 'node', param: 'y' }, r(y));
    this.record();
  }

  /** Set related shape parameters as one undoable edit (used by linked controls). */
  setShapeParams(id: string, values: Record<string, unknown>) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'shape') return;
    Object.assign(at.node.params, values);
    this.record();
  }

  #parameterChanged(target: TrackTarget, value: unknown) {
    const expression = isNumericExpression(value) || (target.on === 'shape' && target.param === 'text' && hasTextExpressions(value));
    if (expression) {
      const anim = this.#ensureAnimation();
      anim.tracks = anim.tracks.filter((t) => !(t.node === target.node && t.on === target.on && t.param === target.param && (t.modifier ?? '') === (target.modifier ?? '')));
    } else this.#autoKey(target, value);
  }

  /** Primitives the rail's colour pickers act on: the selection, or the selected effect's shape. */
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
  /** Fill the rail's pickers show: the selection's, or the one for new primitives. */
  get currentFill(): string {
    return String(this.#colorTargets()[0]?.params.fillColor ?? this.fillColor);
  }
  /** Stroke the rail's pickers show: the selection's, or the one for new primitives. */
  get currentOutline(): string {
    return String(this.#colorTargets()[0]?.params.strokeColor ?? this.strokeColor);
  }
  /** Whether the rail's fill shows None: the selection's fill is off, or new primitives get none. */
  get currentFillOff(): boolean {
    const first = this.#colorTargets()[0];
    return first ? first.params.fill === false : !this.#svgColorTargets().length && !this.fillOn;
  }
  /** Whether the rail's stroke shows None: the selection has no stroke, or new primitives get none. */
  get currentStrokeOff(): boolean {
    const first = this.#colorTargets()[0];
    return first ? !first.params.stroke : !this.strokeOn;
  }
  /**
   * Swaps fill and stroke (⇧X, the rail's arrows): colours and whether each is on. With a selection, its
   * shapes; without one, the colours new primitives get.
   */
  swapFillStroke() {
    const targets = this.#colorTargets();
    if (!targets.length) {
      [this.fillColor, this.strokeColor] = [this.strokeColor, this.fillColor];
      [this.fillOn, this.strokeOn] = [this.strokeOn, this.fillOn];
      return;
    }
    for (const n of targets) {
      const p = n.params as Record<string, unknown>;
      this.setShapeParams(n.id, { fillColor: p.strokeColor ?? this.strokeColor, strokeColor: p.fillColor ?? this.fillColor, fill: !!p.stroke, stroke: p.fill !== false });
    }
  }
  /** Rail fill › None: the selection's fill off (its colour is kept for when it comes back); without one, new primitives'. */
  setFillNone() {
    const targets = this.#colorTargets();
    if (!targets.length) { this.fillOn = false; return; }
    for (const n of targets) if (n.params.fill !== false) this.setShapeParam(n.id, 'fill', false);
  }
  /** Rail stroke › None: the selection's stroke off; without one, new primitives'. */
  setStrokeNone() {
    const targets = this.#colorTargets();
    if (!targets.length) { this.strokeOn = false; return; }
    for (const n of targets) if (n.params.stroke) this.setShapeParam(n.id, 'stroke', false);
  }
  /** Rail fill: with a selection, its own (and turns it on); without one, the new primitives'. */
  setFillColor(color: string) {
    const targets = this.#colorTargets();
    const svgTargets = this.#svgColorTargets();
    if (!targets.length && !svgTargets.length) {
      this.fillColor = color;
      this.fillOn = true;
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
  /** Rail stroke: with a selection, its own (and turns it on); without one, the new primitives'. */
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

  /** Changes an object's SVG, keeping its stack and position. */
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

  /** Document size: fixed (centred where told) or null, which fits what is drawn. */
  setDocument(size: { width: number; height: number; x?: number; y?: number } | null, commit = true) {
    if (!this.scene) return;
    if (size) {
      const r = (v: number) => Math.round(v * 100) / 100;
      const { width, height, x = this.scene.document?.x ?? 0, y = this.scene.document?.y ?? 0 } = size;
      this.scene.document = { width: Math.max(1, r(width)), height: Math.max(1, r(height)), ...(x ? { x: r(x) } : {}), ...(y ? { y: r(y) } : {}) };
    } else delete this.scene.document;
    this.record(commit);
  }
  /** How Play fits the document to the screen in Full mode, or null when Full is off. */
  get viewportFit(): ViewportFit | null { return this.scene ? viewportFit(this.scene) : null; }
  setFullViewport(enabled: boolean) {
    if (!this.scene) return;
    if (enabled) this.scene.fullViewport = true;
    else { delete this.scene.fullViewport; delete this.scene.adaptContent; }
    this.record(true);
  }
  /** Clip to the document in Play (nothing outside it shows). */
  setClipToDocument(enabled: boolean) {
    if (!this.scene) return;
    if (enabled) this.scene.clipToDocument = true;
    else delete this.scene.clipToDocument;
    this.record(true);
  }
  /** Full mode's fit (contain is stored as `true`, the default). */
  setViewportFit(fit: ViewportFit) {
    if (!this.scene) return;
    this.scene.fullViewport = fit === 'contain' ? true : fit;
    // Adapt starts with its content scaled to fit (stored as absent); the other fits don't use it.
    delete this.scene.adaptContent;
    this.record(true);
  }
  /** Adapt: scale the content to the viewport (on) or keep it at the document's size in the middle. */
  get adaptContent(): boolean { return this.scene?.adaptContent !== false; }
  setAdaptContent(enabled: boolean) {
    if (!this.scene) return;
    if (enabled) delete this.scene.adaptContent;
    else this.scene.adaptContent = false;
    this.record(true);
  }
  /** The document's edges are walls for every Physics. */
  setPhysicsBounds(enabled: boolean) {
    if (!this.scene) return;
    if (enabled) this.scene.physicsBounds = true;
    else delete this.scene.physicsBounds;
    this.record(true);
  }
  /** Seconds between automatic re-seeds (0: off). */
  get seedEvery(): number { return Number(this.scene?.seedEvery) > 0 ? Number(this.scene!.seedEvery) : 0; }
  setSeedEvery(value: number) {
    if (!this.scene) return;
    const every = Number.isFinite(value) && value > 0 ? Math.round(value * 1000) / 1000 : 0;
    if (every === this.seedEvery) return;
    if (every) this.scene.seedEvery = every;
    else delete this.scene.seedEvery;
    this.record(true);
  }
  /** Play draws a new seed on every load. */
  setSeedOnLoad(enabled: boolean) {
    if (!this.scene) return;
    if (enabled) this.scene.seedOnLoad = true;
    else delete this.scene.seedOnLoad;
    this.record(true);
  }
  setSeedGenerator(value: number) {
    if (!this.scene) return;
    const seed = normalizeSeedGenerator(value);
    if (seed === this.seedGenerator && this.scene.seedGenerator !== undefined) return;
    this.scene.seedGenerator = seed;
    this.record(true);
  }
  setCustomVariables(values: NonNullable<SceneV1['custom']> | null) {
    if (!this.scene) return;
    if (values === null) delete this.scene.custom;
    else this.scene.custom = values;
    this.record();
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
  /** Document the size of what is drawn and centred on it (nothing moves). */
  fitDocument() {
    const b = this.contentBox;
    if (!b || b.width <= 0 || b.height <= 0) return;
    this.setDocument({ width: Math.ceil(b.width), height: Math.ceil(b.height), x: b.x + b.width / 2, y: b.y + b.height / 2 });
  }

  // ── Nodos

  isCollapsed = (id: string) => this.collapsed.includes(id);
  /** Collapse or expand the whole Stack panel: objects, groups and containers (Step…). */
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

  /** Puts the selected node in a new group, in the same place. */
  /** Turns a primitive (a text, a shape) into a path object, in place and with its effects. */
  outline(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    const r = outlineNode(this.scene, id);
    if (!r) return;
    this.selected = id;
    if (r.removed) this.notice = r.removed === 1 ? t('Converted to outlines. One animation of its shape was removed (Undo brings it back).') : t('Converted to outlines. {count} animations of its shape were removed (Undo brings it back).', { count: r.removed });
    this.#applyTime();
    this.record(true);
  }

  // ── Expand an SVG: one object per shape, inside a group that keeps the place and the stack

  #shapeCounts = new Map<string, number>();
  /** How many shapes an object's SVG has (cached: the panel asks while drawing). */
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
   * Expands an object's SVG: one shape, one object. They go in a group with the same id, name,
   * placement and stack, so whatever animated it or referenced it keeps working.
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
      this.notice = t('This SVG has one shape: there is nothing to expand.');
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
    this.notice = t('Expanded into {count} objects.', { count: geo.shapes.length });
    this.#applyTime();
    this.record(true);
  }

  // ── Pack: freeze a node into its result (and unpack it)

  /** The active node is a pack. */
  get packed() {
    const n = this.activeNode;
    return this.selectedNodes.length <= 1 && n?.kind === 'object' && !!n.packed;
  }
  #packEngine: ReturnType<typeof createEngine> | null = null;
  /** Packs the active node: its result stays, with nothing more to compute; the original goes inside. */
  pack(id?: string | null) {
    const selection = id === undefined || id === this.currentNode?.id ? this.selectedNodes : [];
    id ??= this.activeNode?.id ?? null;
    if (!this.scene || !id) return;
    this.flush();
    let grouped: { list: SceneNode[]; original: SceneNode[] } | undefined;
    if (selection.length > 1) {
      const locs = selection.map((n) => locateNode(this.scene!.objects, n.id)!);
      if (locs.some((l) => l.list !== locs[0]!.list || this.isLocked(l.node.id) || (l.node.kind === 'group' && l.node.layer))) {
        this.notice = t('Select unlocked objects in the same folder to pack them together.');
        return;
      }
      const list = locs[0]!.list;
      const ordered = locs.sort((a, b) => a.index - b.index);
      grouped = { list, original: [...list] };
      const group: GroupNode = { kind: 'group', id: `group-${uid()}`, name: 'Group', stack: [], children: ordered.map((l) => l.node) };
      for (const l of [...ordered].reverse()) list.splice(l.index, 1);
      list.splice(ordered[0]!.index, 0, group);
      id = group.id;
    }
    const engine = (this.#packEngine ??= createEngine(builtins));
    const doc = engine.evaluateDocument($state.snapshot(this.scene) as SceneV1);
    const r = packNode(this.scene, id, doc, uid());
    if (!r) {
      if (grouped) grouped.list.splice(0, grouped.list.length, ...grouped.original);
      return;
    }
    if (grouped) r.node.packed!.autoGrouped = true;
    this.selected = r.node.id;
    this.also = [];
    if (r.animated) this.notice = t('Packed at this frame: its animation stays inside and plays again when you unpack it.');
    this.#applyTime();
    this.record(true);
  }
  /** Packs saved without geometry get it back from their original (the exported code needs it). */
  #restorePacks(scene: SceneV1) {
    const engine = (this.#packEngine ??= createEngine(builtins));
    restorePacks(scene, (s) => engine.evaluateDocument(s));
  }
  /** Unpacks: the original comes back, with however the pack moved and its effects on top. */
  unpack(id = this.activeNode?.id ?? null) {
    if (!this.scene || !id) return;
    const packedNode = locateNode(this.scene.objects, id)?.node;
    const dissolve = packedNode?.kind === 'object' && packedNode.packed?.autoGrouped;
    const back = unpackNode(this.scene, id, (old) => `${old.replace(/-[a-z0-9]{6}$/, '')}-${uid()}`);
    if (!back) return;
    this.selected = back;
    this.also = [];
    const at = locateNode(this.scene.objects, back);
    const group = at?.node;
    // Keep a wrapper when it carries edits made to the pack: ungrouping would discard them.
    if (dissolve && at && group?.kind === 'group' && !group.stack.length &&
        Object.entries(group.transform ?? {}).every(([key, value]) => value === (key === 'scale' || key === 'stretch' ? 1 : 0)) &&
        group.opacity === undefined && !group.blend && group.visible !== false &&
        !this.scene.animation?.tracks.some((t) => t.node === back) &&
        !this.scene.interactions?.some((i) => i.node === back || i.target.node === back)) {
      at.list.splice(at.index, 1, ...group.children);
      this.selected = group.children[0]?.id ?? null;
      this.also = group.children.slice(1).map((n) => n.id);
    }
    this.#applyTime();
    this.record(true);
  }

  group(id = this.activeNode?.id ?? null) {
    const many = this.selectedNodes;
    if (this.scene && many.length > 1 && id === this.currentNode?.id) {
      const locs = many.map((n) => locateNode(this.scene!.objects, n.id)!).filter(Boolean);
      // Only those sharing a list with the main one; in list order.
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

  /** Ungroups: its children stay in place (the group's position and effects are lost). */
  ungroup(id = this.currentNode?.id ?? null) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || at.node.kind !== 'group' || at.node.composition) return;
    at.list.splice(at.index, 1, ...at.node.children);
    this.selected = at.node.children[0]?.id ?? null;
    this.record(true);
  }

  /** Moves a node: inside `groupId` (or at the top level) at position `index`. */
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
    const list = target ? target.children! : this.root;
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

  /** Position, scale, rotation, opacity, visibility or name of a node. */
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

  /** Defines custom numeric props that this node forwards to its descendants. */
  setNodeProps(id: string, props: Record<string, unknown>) {
    if (this.isLocked(id)) return;
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at) return;
    at.node.props = props;
    this.record();
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

  /** Centres the visible box in the document, converting the offset into the parent's space. */
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

  /** Moves several nodes at once (align, distribute, drag a selection): one history step. */
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
   * Moves the transform centre without the object jumping: compensates the position by
   * (rotation·scale·flip − identity) times how far the pivot moved.
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
    // More precision than when moving: dragging the pivot compensates each step and rounding would add up.
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
   * Order of the selection within its list (the first in the list is in front): to front, forward,
   * backward or to back. With several, they all move and keep their order among themselves.
   */
  reorder(how: 'front' | 'forward' | 'backward' | 'back') {
    if (!this.scene || !this.selectedNodes.length) return;
    // By list (each one, in its group).
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
        // Forward = towards the start of the list; one by one, without jumping over another selected one.
        for (let i = 1; i < list.length; i++) if (set.has(list[i]!) && !set.has(list[i - 1]!)) [list[i - 1], list[i]] = [list[i]!, list[i - 1]!];
      } else {
        for (let i = list.length - 2; i >= 0; i--) if (set.has(list[i]!) && !set.has(list[i + 1]!)) [list[i], list[i + 1]] = [list[i + 1]!, list[i]!];
      }
    }
    this.record(true);
  }

  /** Flips the selected nodes (each around its centre). */
  flip(axis: 'x' | 'y') {
    if (!this.scene || !this.selectedNodes.length) return;
    const key = axis === 'x' ? 'flipX' : 'flipY';
    for (const n of this.selectedNodes) n.transform = { ...n.transform, [key]: !n.transform?.[key] };
    this.record(true);
  }

  /** Removes every selected node (or the selected modifier). */
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
   * Quick boolean bar: with several selected, groups them and gives the group Boolean in that mode.
   * With a group that already has Boolean, it only changes the mode (no second one). The group stays selected.
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
    // The group stays selected: the bar stays at hand to try another mode.
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
    if (!baked?.node.packed?.geometry) return;
    baked.node.source = toSVG(baked.node.packed.geometry, { precision: 3 });
    delete baked.node.packed;
    this.selected = group.id;
    this.also = [];
    this.#applyTime();
    this.notice = t('Boolean converted to a path. Its source objects, effects and animation were removed; Undo restores them.');
    this.record(true);
  }

  // ── Animation: keys live in scene.animation; the current time's value is written into the scene
  // (without history), so panel, canvas and actuators always read "what is shown now".

  get animation(): Animation | null {
    return this.scene?.animation ?? null;
  }
  #ensureAnimation(): Animation {
    const s = this.scene!;
    s.animation ??= { duration: sceneDuration(s), loop: true, fps: 30, tracks: [] };
    return s.animation;
  }
  /** The track of a parameter, if it is animated. */
  track(t: TrackTarget): Track | undefined {
    return this.animation?.tracks.find((x) => x.node === t.node && x.on === t.on && x.param === t.param && (x.modifier ?? '') === (t.modifier ?? ''));
  }
  /** State of a parameter's diamond: not animated, animated, or with a key at this time. */
  keyState(t: TrackTarget): 'none' | 'animated' | 'key' {
    const tr = this.track(t);
    if (!tr) return 'none';
    const eps = 0.5 / (this.animation?.fps ?? 30);
    return tr.keys.some((k) => Math.abs(k.t - this.time) <= eps) ? 'key' : 'animated';
  }
  /**
   * Diamond: not animated, it starts animating with a key here; with a key here, it removes it (and if it
   * was the last, the parameter stops being animated); animated without a key here, it adds one with the current value.
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
  /** When an animated value changes from the panel or the canvas: a key at the current time. */
  #autoKey(t: TrackTarget, value: unknown) {
    // While playing, changes come from the animation itself: never new keys.
    if (this.playing) return;
    const tr = this.track(t);
    if (!tr) return;
    tr.keys = setKey(tr.keys, this.time, $state.snapshot(value as object) ?? value, this.animation?.fps ?? 30);
  }
  /** Go to a time: writes every track's value into the scene (without history). */
  setTime(t: number) {
    if (this.animationDisabled) return;
    const anim = this.animation;
    const d = anim?.duration ?? 3;
    this.time = Math.max(0, Math.min(anim?.infinite ? Infinity : d, t));
    this.#applyTime();
  }
  /** Playback belongs to the editor, independently of which panels are open. */
  togglePlayback() {
    if (!this.scene) return;
    if (!this.playing && !this.animation?.infinite && this.time >= (this.animation?.duration ?? 3) - 1e-6) this.setTime(0);
    this.playing = !this.playing;
  }
  advancePlayback(seconds: number) {
    if (!this.playing || !this.scene || seconds <= 0) return;
    const duration = this.animation?.duration ?? 3;
    let time = this.time + seconds;
    if (!this.animation?.infinite && time >= duration) {
      if (this.animation?.loop !== false) time %= duration;
      else { time = duration; this.playing = false; }
    }
    this.setTime(time);
  }
  stepFrame(direction: -1 | 1) {
    this.playing = false;
    const fps = this.animation?.fps ?? 30;
    const last = this.animation?.infinite ? Infinity : Math.floor((this.animation?.duration ?? 3) * fps + 1e-6);
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
    if (!anim.infinite && this.time > anim.duration) this.setTime(anim.duration);
    this.record();
  }
  setInfiniteTime(enabled: boolean) {
    if (!this.scene) return;
    const anim = this.#ensureAnimation();
    if (enabled) { anim.infinite = true; anim.loop = false; }
    else { delete anim.infinite; this.setTime(Math.min(this.time, anim.duration)); }
    this.record(true);
  }
  setLoop(loop: boolean) {
    const anim = this.#ensureAnimation();
    anim.loop = anim.infinite ? false : loop;
    this.record(true);
  }
  /** A track's repeats: how many times (1, no repeat; 0, forever) and how often (without it, back to back). */
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
  /** Moves a key to another time (dragging it on the timeline). */
  /** Returns the time it lands on (rounded), which is how it is found again. */
  moveKey(trackId: string, from: number, to: number): number {
    const tr = this.animation?.tracks.find((x) => x.id === trackId);
    const k = tr?.keys.find((x) => x.t === from);
    if (!tr || !k) return from;
    const d = this.animation!.duration;
    const t = Math.round(Math.max(0, Math.min(d, to)) * 1000) / 1000;
    // Never on top of another key of the same track.
    if (tr.keys.some((x) => x !== k && x.t === t)) return from;
    k.t = t;
    tr.keys.sort((a, b) => a.t - b.t);
    this.#applyTime();
    this.record();
    return t;
  }
  /** Move a set of keyframes by one shared delta; collisions reject the whole move. */
  moveKeys(keys: { track: string; t: number }[], delta: number): number {
    const anim = this.animation;
    if (!anim || !Number.isFinite(delta) || Math.abs(delta) < 1e-9) return 0;
    const refs: { track: Track; key: Track['keys'][number] }[] = [];
    const seen = new Set<string>();
    for (const ref of keys) {
      const id = `${ref.track}@${ref.t}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const track = anim.tracks.find((tr) => tr.id === ref.track);
      const key = track?.keys.find((k) => k.t === ref.t);
      if (track && key) refs.push({ track, key });
    }
    if (!refs.length) return 0;
    const actual = Math.max(-Math.min(...refs.map(({ key }) => key.t)), Math.min(anim.duration - Math.max(...refs.map(({ key }) => key.t)), delta));
    const targets = refs.map(({ key }) => Math.round((key.t + actual) * 1000) / 1000);
    for (let i = 0; i < refs.length; i++) {
      const { track, key } = refs[i]!;
      if (track.keys.some((other) => other !== key && !refs.some((ref) => ref.track === track && ref.key === other) && other.t === targets[i])) return 0;
    }
    for (let i = 0; i < refs.length; i++) refs[i]!.key.t = targets[i]!;
    for (const track of new Set(refs.map(({ track }) => track))) track.keys.sort((a, b) => a.t - b.t);
    this.#applyTime();
    this.record();
    return actual;
  }
  /** Scale selected key times around a fixed anchor, preserving their relative timing. */
  scaleKeys(keys: { track: string; t: number }[], anchor: number, factor: number): boolean {
    const anim = this.animation;
    if (!anim || !Number.isFinite(anchor) || !Number.isFinite(factor) || factor < 0) return false;
    const refs: { track: Track; key: Track['keys'][number] }[] = [];
    const seen = new Set<string>();
    for (const ref of keys) {
      const id = `${ref.track}@${ref.t}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const track = anim.tracks.find((tr) => tr.id === ref.track);
      const key = track?.keys.find((k) => k.t === ref.t);
      if (track && key) refs.push({ track, key });
    }
    if (!refs.length) return false;
    const targets = refs.map(({ key }) => Math.round((anchor + (key.t - anchor) * factor) * 1000) / 1000);
    for (let i = 0; i < refs.length; i++) {
      const { track, key } = refs[i]!;
      if (targets[i]! < 0 || targets[i]! > anim.duration) return false;
      if (refs.some((ref, j) => j < i && ref.track === track && targets[j] === targets[i])) return false;
      if (track.keys.some((other) => other !== key && !refs.some((ref) => ref.track === track && ref.key === other) && other.t === targets[i])) return false;
    }
    for (let i = 0; i < refs.length; i++) refs[i]!.key.t = targets[i]!;
    for (const track of new Set(refs.map(({ track }) => track))) track.keys.sort((a, b) => a.t - b.t);
    this.#applyTime();
    this.record();
    return true;
  }
  /** A segment's curve. `final` false while a custom curve is being dragged: the drag is one undo step. */
  setEase(trackId: string, at: number, e: Ease, final = true) {
    const k = this.animation?.tracks.find((x) => x.id === trackId)?.keys.find((x) => x.t === at);
    if (!k) return;
    k.ease = e;
    this.#applyTime();
    this.record(final);
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
  /** Remove selected keys across tracks as one undoable operation. */
  removeKeys(keys: { track: string; t: number }[]) {
    const anim = this.animation;
    if (!anim || !keys.length) return;
    let removed = false;
    for (const track of anim.tracks) {
      const times = new Set(keys.filter((key) => key.track === track.id).map((key) => key.t));
      if (!times.size) continue;
      const kept = track.keys.filter((key) => !times.has(key.t));
      if (kept.length !== track.keys.length) { track.keys = kept; removed = true; }
    }
    if (!removed) return;
    anim.tracks = anim.tracks.filter((track) => track.keys.length);
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
   * In and out presets: a Stagger with its effects and two keys of
   * Progress (0 → 1 over the animation's duration). Applied to the active object and edited like anything else.
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

  // ── Interactions (hover and click): they live in scene.interactions

  /** What an interaction on this node can change: placement and numbers, angles and colours of its effects. */
  interactionTargets(nodeId: string): { label: string; target: TrackTarget; kind: 'number' | 'angle' | 'color' }[] {
    const n = this.scene ? locateNode(this.scene.objects, nodeId)?.node : undefined;
    if (!n) return [];
    const out: { label: string; target: TrackTarget; kind: 'number' | 'angle' | 'color' }[] = [
      { label: t('Position X'), target: { node: nodeId, on: 'node', param: 'x' }, kind: 'number' },
      { label: t('Position Y'), target: { node: nodeId, on: 'node', param: 'y' }, kind: 'number' },
      { label: t('Scale'), target: { node: nodeId, on: 'node', param: 'scale' }, kind: 'number' },
      { label: t('Rotation'), target: { node: nodeId, on: 'node', param: 'rotation' }, kind: 'angle' },
      { label: t('Opacity'), target: { node: nodeId, on: 'node', param: 'opacity' }, kind: 'number' },
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
    // The list is created first and then read from the scene: so the reactive version is used (not the copy).
    this.scene.interactions ??= [];
    this.scene.interactions.push({ id: `int-${uid()}`, node: nodeId, trigger: 'hover', target: { node: nodeId, on: 'node', param: 'scale' }, to: 1.2, duration: 0.3, ease: 'back-out' });
    this.record(true);
  }
  /** The node's effects (for "toggle" and "seed"): with their name and whether they have a seed. */
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
   * What can follow the pointer: the object's position, the points of its effects that are a place in the
   * drawing (centres, pivots…) and its numbers (with a range).
   */
  followTargets(nodeId: string): { label: string; target: TrackTarget; kind: 'point' | 'number' | 'angle' }[] {
    const n = this.scene ? locateNode(this.scene.objects, nodeId)?.node : undefined;
    if (!n) return [];
    const out: { label: string; target: TrackTarget; kind: 'point' | 'number' | 'angle' }[] = [{ label: t('Position'), target: { node: nodeId, on: 'node', param: 'position' }, kind: 'point' }];
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
  /** Changes the trigger; "pointer" goes with "follow" (and vice versa), with starting values. */
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
  /** What follows the pointer; a number starts with a range around its value. */
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

  /** Changes what an interaction does, with sensible starting values for the new action. */
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

  // ── Copy and paste (the clipboard carries JSON with the `svertik` mark)

  /** The selection, ready for the clipboard: nodes (with their stacks) or an effect. */
  copySelection(): string | null {
    if (!this.scene) return null;
    if (this.current) return JSON.stringify({ svertik: 1, kind: 'modifiers', items: [$state.snapshot(this.current)] });
    const nodes = this.selectedNodes;
    if (!nodes.length) return null;
    // In list order (the first in front), to paste them the same way.
    const order = [...walkNodes(this.scene.objects)].map((x) => x.node.id);
    const sorted = [...nodes].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const ids = new Set([...walkNodes(sorted)].map(({ node }) => node.id));
    const animation = this.scene.animation;
    return JSON.stringify({
      svertik: 1, kind: 'nodes', items: sorted.map((n) => $state.snapshot(n)),
      ...(animation ? { animation: { ...$state.snapshot(animation), markers: undefined, tracks: animation.tracks.filter(tr => ids.has(tr.node)) } } : {}),
    });
  }

  /** Pastes what was copied (`offset`: how far it shifts; 0, in place). Returns false if the text is not svertik's clipboard. */
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
      // Below the selected effect (in its list), or at the end of the stack.
      const list = at ? at.list : owner.stack;
      list.splice(at ? at.index + 1 : list.length, 0, ...items);
      this.selected = items[0]!.id;
      if (commit) this.record(true);
      return true;
    }
    if (data.kind !== 'nodes') return false;
    // Pasting the same again: each copy one step further (not all in the same place).
    this.#pastes = this.#lastPasted === text ? this.#pastes + 1 : 1;
    this.#lastPasted = text;
    offset *= this.#pastes;
    // If the name exists: "Name copy", "Name copy 2", "Name copy 3"… ("Name copy" gives "Name copy 2").
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
      // Above the first selected one (in its list), or at the very top.
      const first = this.selectedNodes[0];
      const at = first ? locateNode(this.scene.objects, first.id) : null;
      if (at) at.list.splice(at.index, 0, ...items);
      else if (!this.addToRoot(...items)) return false;
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
    for (const { node } of after) {
      if (node.kind === 'instance' && typeof node.mouse?.target === 'string') node.mouse.target = nodeIds.get(node.mouse.target) ?? node.mouse.target;
    }
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

  /** Duplicates the selection (⌘D), without the clipboard. */
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
    // Physics simulates the children of a group: on anything else, `add` groups it first.
    if (type === 'physics') return true;
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
    if (!this.canAdd(type)) { this.notice = t('This effect does not support raster images.'); return; }
    // Boolean with several objects selected: they are grouped first (Boolean works on a group's children).
    if (type === 'boolean' && this.selectedNodes.length > 1 && !this.current) this.group();
    // Physics simulates the children of a group: a loose object (or several selected) goes into one first,
    // and with nothing selected it starts an empty "Physics" group to put things in.
    const grouped = type === 'physics' && !!this.activeNode && this.activeNode.kind !== 'group';
    const started = type === 'physics' && !this.activeNode && !!this.scene;
    if (grouped || started) {
      const taken = new Set([...walkNodes(this.scene!.objects)].map((x) => x.node.name));
      let name = 'Physics';
      for (let i = 2; taken.has(name); i++) name = `Physics ${i}`;
      if (grouped) {
        this.group();
        const g = this.activeNode;
        if (g?.kind === 'group') {
          g.name = name;
          // Each object gets its Rigid Body, to set how it starts (velocity, spin) or pin it (Immovable).
          const body = registry.get('rigidbody');
          if (body) for (const child of g.children) {
            if (child.stack.some((m) => m.type === 'rigidbody')) continue;
            child.stack.push({ id: `rigidbody-${uid()}`, type: 'rigidbody', enabled: true, params: { ...resolveParams(body.params) } });
          }
        }
      } else {
        const g: GroupNode = { kind: 'group', id: `group-${uid()}`, name, stack: [], children: [] };
        if (!this.addToRoot(g)) return;
        this.selected = g.id;
      }
    }
    const def = registry.get(type);
    const owner = this.activeNode;
    if (!this.scene || !def || !owner) return;
    const inst: ModifierInstance = { id: `${type}-${uid()}`, type, enabled: true, params: { ...resolveParams(def.params) } };
    if (type === 'color') inst.params!.mode = 'solid';
    // Time follows scene.time below; a visible drift makes the cells move as soon as playback starts.
    if (type === 'voronoi') inst.params!.drift = 0.3;
    if (['particles', 'gravity', 'physics', 'voronoi', 'oscillate', 'wiggle', 'pulse', 'shake', 'rope', 'wavelines'].includes(type)) {
      inst.params!.time = { $expr: 'scene.time', fallback: type === 'rope' || type === 'wavelines' ? 0 : 1 };
      this.#ensureAnimation();
    }
    if (containers.has(type)) inst.children = [];
    // Each on a shape starts with a Shape inside, ready for per-copy values of the shape's own parameters.
    if (type === 'each' && owner.kind === 'shape' && owner.shape !== 'text' && owner.shape !== 'path') inst.children = [{ id: `shapevalues-${uid()}`, type: 'shapevalues', params: {} }];
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
    // Show what was added: the node and the Step that receives it, expanded.
    const host = at && containers.has(at.inst.type) ? at.inst.id : at?.parent?.id;
    this.collapsed = this.collapsed.filter((x) => x !== owner.id && x !== host);
    if (grouped) this.notice = t('Grouped first: Physics simulates the objects inside a group.');
    if (started) this.notice = t('A Physics group: put objects inside it to simulate them.');
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

  /** Removes a modifier or a node. */
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

  /** Moves within its own list (keyboard: ⌥↑/↓). Works for modifiers and nodes. */
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

  /** Moves a modifier anywhere in its node's stack: inside `parentId` (a Step) or at the top. */
  /**
   * Moves a modifier anywhere: inside `parentId` (a Step) or at the top, in the stack of
   * `ownerId` (by default its node's; it can be another object). With `copy`, it leaves the original and puts
   * a copy (new ids) at the destination.
   */
  moveTo(id: string, parentId: string | null, index: number, ownerId?: string, copy = false) {
    if (!this.scene) return;
    const at = locateModifier(this.scene, id);
    if (!at || id === parentId) return;
    if (this.isLocked(at.owner.id) || (ownerId && this.isLocked(ownerId))) return;
    // Neither inside something that doesn't accept it, nor inside itself (or what it contains).
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

  /** An object's position, scale, rotation or opacity set to a formula (or back to a number) from the inspector. */
  setNodeFormula(id: string, key: 'x' | 'y' | 'scale' | 'rotation' | 'opacity', value: unknown) {
    const at = this.scene ? locateNode(this.scene.objects, id) : null;
    if (!at || this.isLocked(id)) return;
    if (key === 'opacity') at.node.opacity = value as number;
    else at.node.transform = { ...at.node.transform, [key]: value as number };
    this.#parameterChanged({ node: id, on: 'node', param: key }, value);
    this.record();
  }

  /** Sets a value of any effect (not only the selected one): the console's set(). Animated values get a key. */
  setModifierParam(id: string, name: string, value: unknown) {
    const at = this.scene ? locateModifier(this.scene, id) : null;
    if (!at || this.isLocked(at.owner.id)) return;
    at.inst.params = { ...at.inst.params, [name]: value };
    this.#parameterChanged({ node: at.owner.id, on: 'modifier', modifier: id, param: name }, value);
    this.record();
  }

  /** Replaces all the values of a modifier with free parameters (Each › Shape: the shape's parameter names). */
  setFreeParams(id: string, params: Record<string, unknown>) {
    if (this.activeNode && this.isLocked(this.activeNode.id)) return;
    const modifier = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    if (!modifier) return;
    modifier.params = params;
    this.record();
  }

  setModifierProps(id: string, props: Record<string, unknown>) {
    const modifier = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    if (!modifier) return;
    modifier.props = Object.keys(props).length ? props : undefined;
    this.record();
  }

  /**
   * Long embedded data (an imported SVG's markup, an image as a data: URL) goes to the agent as a short
   * stand-in, `svertik:kept:N`, and comes back from it whole: the prompt stays small, and the agent can't
   * damage what it can't read. The stand-ins live as long as this editor does.
   */
  #agentKept = new Map<string, string>();
  #agentKeptByValue = new Map<string, string>();
  /** The last fix request for the agent (its scene didn't validate), ready to paste to it. */
  agentFixRequest: string | null = null;

  #shrinkForAgent(value: unknown, key = ''): unknown {
    if (typeof value === 'string') {
      const long = value.length > 1000 && (key === 'source' || key === 'href' || value.startsWith('<') || value.startsWith('data:'));
      if (!long) return value;
      let token = this.#agentKeptByValue.get(value);
      if (!token) {
        token = `svertik:kept:${this.#agentKept.size + 1}`;
        this.#agentKept.set(token, value);
        this.#agentKeptByValue.set(value, token);
      }
      return token;
    }
    if (Array.isArray(value)) return value.map((item) => this.#shrinkForAgent(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.#shrinkForAgent(v, k)]));
    return value;
  }
  #restoreFromAgent(value: unknown, missing: Set<string>): unknown {
    if (typeof value === 'string') {
      if (!/^svertik:kept:\d+$/.test(value)) return value;
      const kept = this.#agentKept.get(value);
      if (kept === undefined) missing.add(value);
      return kept ?? value;
    }
    if (Array.isArray(value)) return value.map((item) => this.#restoreFromAgent(item, missing));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.#restoreFromAgent(v, missing)]));
    return value;
  }

  /**
   * What to paste into any AI agent (a chat, Claude Code, Cursor…): what svertik is, where its guide is, what
   * is selected, this scene, and a place for the request. Its answer, pasted back into the editor, is applied
   * by `fromAgent`.
   */
  agentPrompt(): string | null {
    if (!this.scene) return null;
    const scene = this.#shrinkForAgent($state.snapshot(this.scene)) as SceneV1;
    const kept = JSON.stringify(scene).includes('svertik:kept:');
    // What "this" means in the request: the selected object and effect.
    const node = this.activeNode, effect = this.current;
    const selected = node
      ? `Selected in the editor: object "${node.name}" (id "${node.id}")${effect ? `, effect "${effect.name || registry.get(effect.type)?.label || effect.type}" (id "${effect.id}")` : ''}. When my request says "this", it means the selection.`
      : 'Nothing is selected in the editor.';
    return [
      'You are editing a svertik scene: non-destructive SVG design and motion, stored as JSON (SceneV1).',
      'Before editing, read the engine guide: https://svertik.com/docs/engine/ (every effect and its parameters: https://svertik.com/docs/reference/).',
      'Keep "version": 1 and unique ids; the first object in "objects" is drawn in front. Treat the scene\'s "notes" as the author\'s direction.',
      ...(kept ? ['Strings like "svertik:kept:1" stand for long embedded data (imported SVG markup, images): keep them exactly as they are.'] : []),
      'Answer with the complete updated scene as a single JSON code block, so it can be pasted back into the editor.',
      // Without notes, the agent doesn't know what the scene is for: it asks first and keeps the answer as notes.
      ...(this.scene.notes?.trim() ? [] : [
        'This scene has no notes yet. Before changing anything, ask me what it is for and what I want to do with it; once I answer, keep a short summary of that in the scene\'s "notes" field.',
      ]),
      selected,
      '',
      'The scene:',
      '```json',
      JSON.stringify(scene, null, 2),
      '```',
      '',
      'My request: ',
    ].join('\n');
  }

  /**
   * An AI agent's answer pasted into the editor: the scene in it (the whole text, a ```json block, or the
   * outermost braces) replaces this one as one undo step. 'none' when the text holds no scene (an ordinary
   * paste goes on); 'invalid' when it does but validation fails: a notice says why, and `agentFixRequest`
   * holds a message asking the agent to fix it.
   */
  fromAgent(text: string): 'applied' | 'invalid' | 'none' {
    if (!text.includes('"objects"')) return 'none';
    const candidates = [text, ...[...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]!)];
    const first = text.indexOf('{'), last = text.lastIndexOf('}');
    if (first >= 0 && last > first) candidates.push(text.slice(first, last + 1));
    let found: SceneV1 | null = null;
    for (const candidate of candidates) {
      try {
        const data = JSON.parse(candidate) as { svertik?: string; scene?: unknown };
        const scene = data?.svertik === 'project' ? data.scene : data;
        if (isScene(scene)) { found = scene; break; }
      } catch { /* not this one */ }
    }
    if (!found) return 'none';
    const missing = new Set<string>();
    found = this.#restoreFromAgent(found, missing) as SceneV1;
    const report = validateScene(found, builtins);
    const errors = [...report.errors, ...[...missing].map((token) => `"${token}" is unknown to this editor (copied in another session?): copy the scene for the agent again`)];
    if (errors.length) {
      this.agentFixRequest = [
        'The scene you returned does not validate in svertik:',
        ...errors.slice(0, 12).map((error) => `- ${error}`),
        'Fix these and answer again with the complete scene as a single JSON code block.',
      ].join('\n');
      this.notice = t('The agent\'s scene has errors: {errors}', { errors: errors.slice(0, 3).join(' · ') });
      return 'invalid';
    }
    this.agentFixRequest = null;
    if (!this.scene) return this.openProject(JSON.stringify(found)) ? 'applied' : 'invalid';
    // Primitives with all their parameters (missing ones at their default): the panel needs them.
    for (const { node } of walkNodes(found.objects)) {
      const def = node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
      if (node.kind === 'shape' && def) node.params = { ...resolveParams(def.params), ...node.params };
    }
    this.applyScene(found);
    return 'applied';
  }

  /** Replaces the whole scene (from the code panel). Returns false if nothing changes. */
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

  /** Marks the point on the canvas and clears it 300 ms after it stops moving. */
  showMarker(point: [number, number]) {
    this.marker = point;
    clearTimeout(this.#markerTimer);
    this.#markerTimer = setTimeout(() => (this.marker = null), 300);
  }

  setEnabled(id: string, enabled: boolean) {
    const at = this.scene ? locateModifier(this.scene, id) : null;
    if (!at) return;
    at.inst.enabled = enabled;
    // If it is animated, the change is a key at this time.
    this.#autoKey({ node: at.owner.id, on: 'modifier', modifier: id, param: 'enabled' }, enabled);
    this.record(true);
  }

  /** The dice: random values (in sensible ranges) for the selected effect. */
  randomize(id = this.selected, seed = Math.floor(Math.random() * 2 ** 31)) {
    const m = this.scene ? locateModifier(this.scene, id)?.inst : undefined;
    const def = m && registry.get(m.type);
    if (!m || !def) return;
    m.params = randomizeParams(def.params, resolveParams(def.params, m.params), rng(seed));
    this.record(true);
  }

  /** To zero: numbers and angles to 0 (or to their neutral / minimum). */
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

  // ── History: consecutive changes (dragging a value) count as one.

  /**
   * Whatever animates or fires on something that no longer exists (a deleted effect or object) is left over:
   * its tracks and interactions go with it.
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

  /** The system names at the last recorded change, to keep `scene.object.…` references when they change. */
  #names: { scene: SceneV1; names: SceneNames } | null = null;
  /**
   * An object or effect renamed (or a repeated name whose `_2` moved after a delete or a reorder): formulas that read
   * it through `scene.object.<name>` are rewritten to its new name, in the same history step.
   */
  #keepReferences() {
    const scene = this.scene;
    if (!scene) { this.#names = null; return; }
    const names = sceneNames(scene);
    if (this.#names?.scene === scene) renameReferences(scene, this.#names.names, names);
    this.#names = { scene, names };
  }

  record(now = false) {
    this.#keepReferences();
    clearTimeout(this.#timer);
    const push = () => {
      this.#pending = false;
      this.#prune();
      const snap = JSON.stringify({ scene: this.#rootScene, name: this.name, script: this.script });
      if (snap === this.#history[this.#index]) return;
      this.#history = this.#history.slice(0, this.#index + 1);
      this.#history.push(snap);
      if (this.#history.length > HISTORY_LIMIT) this.#history.shift();
      this.#index = this.#history.length - 1;
      this.#historyLength = this.#history.length;
      void this.saveSession();
    };
    if (now) push();
    else {
      this.#pending = true;
      this.#timer = setTimeout(push, 350);
    }
  }

  /** Saves whatever is pending now (before undoing, for instance). */
  flush() {
    if (this.#pending) this.record(true);
  }

  #restore(i: number) {
    const snap = this.#history[i];
    if (!snap) return;
    const { scene, name, script } = JSON.parse(snap) as { scene: SceneV1 | null; name: string; script?: string };
    this.#rootScene = scene;
    this.compositionPath = this.compositionPath.slice(0, this.compositionBreadcrumbs.length);
    this.#compositionViews = this.#compositionViews.slice(0, this.compositionPath.length);
    this.name = name;
    this.script = script ?? DEFAULT_SCRIPT;
    this.#index = i;
    if (this.selected && this.scene && !locateNode(this.scene.objects, this.selected) && !locateModifier(this.scene, this.selected)) {
      this.selected = this.scene?.objects[0]?.id ?? null;
    }
    void this.saveSession();
  }

  undo() {
    this.flush();
    if (this.canUndo) this.#restore(this.#index - 1);
  }
  redo() {
    this.flush();
    if (this.canRedo) this.#restore(this.#index + 1);
  }

  // ── Project: everything in one file (.json) to save it and open it again

  /** The whole project as text: objects (with their SVGs), stacks, animation, script, name and canvas. */
  // ── Saving: what would be lost by starting another file

  #saved: string | undefined;
  /** The current state counts as saved (on save, opening a project or a demo). */
  markSaved() {
    this.flush();
    this.#saved = this.#history[this.#index];
    // Its recent entry now says saved.
    if (this.#recentKept) void this.saveSession();
  }
  /** There are unsaved changes: a scene different from the last one saved or opened. */
  get dirty() {
    this.flush();
    return !!this.scene && this.#history[this.#index] !== this.#saved;
  }
  /** Back to the start screen to open a project or create a new scene. */
  returnToStart() {
    this.scene = null;
    this.missingSvgs = [];
    this.embedSources = true;
    this.selected = null;
    this.also = [];
    this.playing = false;
    this.time = 0;
    this.compositionPath = [];
    this.#compositionViews = [];
  }
  /** New file: empty canvas, no history. */
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
    this.error = null;
    this.#newRecent();
    this.#history = [];
    this.#index = -1;
    this.record(true);
    this.markSaved();
  }

  /** Whether the saved project carries its SVGs; off, objects keep only a file name (`href`) next to the project. */
  embedSources = $state(true);
  /** SVG files the open project points to but doesn't have yet (their objects draw nothing until attached). */
  missingSvgs = $state<string[]>([]);

  projectFile(): string | null {
    if (!this.scene) return null;
    // Packs keep their original: their frozen geometry is rebuilt on open, it isn't saved.
    const scene = stripPackGeometry($state.snapshot(this.#rootScene) as SceneV1);
    return compactJSON({
      svertik: 'project', version: 1, name: this.name, script: this.script,
      embedSources: this.embedSources ? undefined : false,
      scene: this.embedSources ? scene : detachSources(scene).scene,
    });
  }

  /**
   * Fills in the SVGs the project keeps outside, by file name. Not an edit: undo history restarts from here
   * and a saved project stays saved. Returns how many of the missing files it found.
   */
  attachSvgFiles(files: ReadonlyMap<string, string>): number {
    if (!this.#rootScene || !this.missingSvgs.length) return 0;
    const clean = !this.dirty;
    const before = this.missingSvgs.length;
    this.#rootScene = attachSources($state.snapshot(this.#rootScene) as SceneV1, files);
    this.missingSvgs = missingSources(this.#rootScene);
    this.#history = [];
    this.#index = -1;
    this.record(true);
    if (clean) this.markSaved();
    return before - this.missingSvgs.length;
  }

  /** Opens a saved project. Returns false if the text is not a svertik project. */
  /** `fileName`: the file it came from; a scene saved without a name takes it (without .json). */
  openProject(text: string, fileName?: string): boolean {
    let data: { svertik?: string; name?: string; canvas?: string; script?: string; embedSources?: boolean; scene?: unknown };
    try {
      data = JSON.parse(text);
    } catch {
      return false;
    }
    // A bare scene JSON works too ("Copy JSON").
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
    this.#restorePacks(scene);
    adoptCanvas(scene, data.canvas);
    this.scene = scene;
    this.#revealLayers(scene);
    // Primitives, with all their parameters (missing ones at their default): the panel needs them.
    for (const { node } of walkNodes(this.scene.objects)) {
      const def = node.kind === 'shape' ? shapeRegistry.get(node.shape) : undefined;
      if (node.kind === 'shape' && def) node.params = { ...resolveParams(def.params), ...node.params };
    }
    this.name = data.name || fileName?.replace(/^.*[\\/]/, '').replace(/\.json$/i, '') || 'untitled';
    this.script = data.script ?? DEFAULT_SCRIPT;
    this.missingSvgs = missingSources(this.scene);
    this.embedSources = data.embedSources !== false && !this.missingSvgs.length;
    this.selected = this.scene.objects[0]?.id ?? null;
    this.time = 0;
    this.playing = false;
    this.#newRecent();
    this.#history = [];
    this.#index = -1;
    this.#applyTime();
    this.record(true);
    this.markSaved();
    return true;
  }

  // ── Session

  /** Orders the autosaves: compression is async, and only the latest may be written. */
  #sessionWrite = 0;
  /**
   * Autosave: the current work, kept for this tab (it survives a reload; a duplicated tab gets a copy).
   * It used to live in the URL (#s=…); the address bar now stays clean and Share makes the links.
   */
  async saveSession() {
    const write = ++this.#sessionWrite;
    if (!this.scene) return writeSession('');
    this.flush();
    let encoded: string;
    try {
      encoded = await encodeState({ scene: stripPackGeometry($state.snapshot(this.#rootScene) as SceneV1), name: this.name, script: this.script });
    } catch {
      // Autosave is a convenience: if compression fails (or is cut short), keep the previous one.
      return;
    }
    if (write !== this.#sessionWrite) return;
    writeSession(encoded);
    // Among the recent scenes once it has changes (an untouched demo or file doesn't count), and from then on.
    const dirty = this.dirty;
    if (!dirty && !this.#recentKept) return;
    if (!this.#recentId) this.#newRecent();
    this.#recentKept = true;
    void remember(this.recents, { id: this.#recentId, name: this.name, updated: Date.now(), state: encoded, saved: !dirty }).catch(() => {});
  }

  // ── Recent scenes (see recents.ts)

  /** Where they are kept: the browser's IndexedDB (tests put a memory store here). */
  recents: RecentStore = browserStore();
  #recentId = readRecentId();
  /** This scene already has an entry: every autosave updates it, saved or not. */
  #recentKept = false;
  /** Another scene in this tab: its own entry (written once it changes). */
  #newRecent() {
    this.#recentId = `${Date.now().toString(36)}-${uid()}`;
    this.#recentKept = false;
    writeRecentId(this.#recentId);
  }
  /** Opens a recent scene; this tab goes on writing its entry. False if it can't be read. */
  async openRecent(recent: Recent): Promise<boolean> {
    const state = await decodeState(recent.state);
    if (!state) return false;
    this.#applyState(state);
    this.#recentId = recent.id;
    this.#recentKept = true;
    writeRecentId(recent.id);
    if (recent.saved) this.markSaved();
    return true;
  }
  /** This scene's own entry (the menu doesn't offer to open what is already open). */
  get recentId(): string { return this.#recentId; }
  forgetRecent(id: string): Promise<void> {
    return this.recents.remove(id).catch(() => {});
  }
  /**
   * Share link, opening the scene in Play or in the editor (`target`): a short link from the link service when
   * the build has one, otherwise the scene in the URL (play.html#p=… or the editor's #s=…).
   * `preview` makes the link's preview card (a JPEG) for chat apps and social sites; short links only.
   * null if it does not fit in a link (then the .json file is better).
   */
  async shareURL(target: ShareTarget = 'play', preview?: () => Promise<Blob>): Promise<string | null> {
    if (!this.scene) return null;
    const encoded = await encodeState({ scene: $state.snapshot(this.scene) as SceneV1, name: this.name, script: this.script });
    // The card is drawn while the scene uploads; a link without a picture still works.
    const card = preview?.().catch(() => null);
    const id = await shortenState(encoded);
    if (id) {
      // Before handing the link over: a chat app may read the page as soon as it is pasted.
      const jpeg = await card;
      if (jpeg) await uploadPreview(id, jpeg);
      return shortLink(id, target);
    }
    if (encoded.length >= MAX_HASH) return null;
    // The Play page, next to the editor: it loads only the engine (much less than the whole editor).
    const dir = location.pathname.replace(/[^/]*$/, '');
    return target === 'edit' ? `${location.origin}${dir}#s=${encoded}` : `${location.origin}${dir}play.html#p=${encoded}`;
  }

  /**
   * Opens what the page came with: a link in the address bar (#s=, #p=, or a short link's #e=/#l=), read once
   * and then cleared from it, or else this tab's autosave. False if there is neither.
   */
  async loadFromURL() {
    let found = await stateFromHash(location.hash);
    const fromLink = !!found;
    // A link that worked leaves the address bar; one that failed stays, so it can be retried.
    if (found) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    else {
      const saved = readSession();
      const state = saved ? await decodeState(saved) : null;
      found = state ? { state, mode: 's' } : null;
    }
    if (!found) return false;
    const { state, mode } = found;
    // A link is another scene; this tab's autosave goes on with its own entry.
    if (fromLink) this.#newRecent();
    this.#applyState(state);
    // Links shared from Play open in Play; those shared from the editor, in the editor.
    if (mode === 'p' || mode === 'l') {
      this.selected = null;
      this.presenting = true;
    }
    return true;
  }

  /** Puts a decoded scene (a link's, the autosave's, a recent one's) in the editor, with a fresh history. */
  #applyState(state: NonNullable<Awaited<ReturnType<typeof decodeState>>>) {
    const scene = state.scene;
    this.compositionPath = [];
    this.#compositionViews = [];
    this.#restorePacks(scene);
    adoptCanvas(scene, state.canvas);
    this.scene = scene;
    this.#revealLayers(scene);
    this.name = state.name.replace(/\.svg$/i, '');
    this.missingSvgs = missingSources(scene);
    if (state.script) this.script = state.script;
    this.selected = scene.objects[0]?.id ?? null;
    this.#history = [];
    this.#index = -1;
    this.record(true);
  }
}
