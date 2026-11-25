// The shape of a scene: its types and how to tell one from anything else. Nothing else: no engine, no
// effects, no geometry. So whoever only needs to read a scene (a link, a file, a test) can do it
// without bringing the motor along.

import type { Geometry } from './geometry';
import type { Animation, Track } from './animation';
import type { Interaction } from './interactions';
import type { ModifierInstance } from './engine';

/** Blend modes from CSS Compositing and Blending (they work in SVG). */
export const BLEND_MODES = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn',
  'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Horizontal flip (mirror left ↔ right), around the node's centre. */
  flipX?: boolean;
  flipY?: boolean;
  /** Non-uniform scale on top of `scale`: [x, y] factors along the node's own axes. [1, 1] by default. */
  stretch?: [number, number];
  /** Transform origin (rotation, scale, flip), in fractions of the node's box. The centre by default. */
  pivot?: [number, number];
}

export interface NodeBase {
  id: string;
  name: string;
  /** The node's effects. In a group, they apply to all its children together. */
  stack: ModifierInstance[];
  /** Child objects inherit this node's placement. */
  children?: SceneNode[];
  /** Numeric custom props explicitly forwarded to descendants. Native values are read from the direct parent. */
  props?: Record<string, unknown>;
  /** Prevent editing this node and its descendants in the editor. */
  locked?: boolean;
  transform?: Partial<Placement>;
  opacity?: number;
  /** Blend with what is behind (`mix-blend-mode`); normal without it. In a group, it applies to each child. */
  blend?: BlendMode;
  visible?: boolean;
}

export interface ObjectNode extends NodeBase {
  kind: 'object';
  /** The SVG itself. Empty when the project keeps it outside (see `href`) and it hasn't been loaded. */
  source: string;
  /**
   * Where the SVG lives when the project doesn't embed it: a file name or path relative to the project file
   * (or a URL). Hosts load it into `source` before drawing (`resolveSources`); until then the object draws nothing.
   */
  href?: string;
  /** Pack: the frozen result of another node. `geometry` is drawn and nothing else is computed. */
  packed?: Pack;
}

/**
 * What a pack keeps. `geometry` is the original node's result, already placed (in its parent's
 * coordinates); `original`, the node as it was, with what animated it or made it react, to unpack it.
 * `at`: the pack's placement when it was made (when unpacking, how far it moved is added to the original).
 */
export interface Pack {
  key: string;
  /** Editor created a temporary group for a multi-selection; dissolve it on unpack when unchanged. */
  autoGrouped?: boolean;
  /**
   * The frozen result. Saved projects leave it out when `original` is there: evaluation rebuilds it
   * from the original (see `restorePacks`).
   */
  geometry?: Geometry;
  /** Without it (in exported code, for instance), the pack can't be unpacked. */
  original?: SceneNode;
  at: { x: number; y: number };
  tracks?: Track[];
  interactions?: Interaction[];
}

/** Primitive: a shape generated from parameters (rectangle, star…), with its own stack. */
export interface ShapeNode extends NodeBase {
  kind: 'shape';
  shape: string;
  params: Record<string, unknown>;
}

export interface ClockModulation { type: 'oscillate' | 'wiggle' | 'pulse' | 'shake'; params?: Record<string, unknown>; enabled?: boolean }

export interface GroupNode extends NodeBase {
  kind: 'group';
  /**
   * A layer: a top-level group that only organizes the scene's objects (no effects, transform, opacity
   * or blend). Hidden, it is not drawn or exported. Layers go only in a scene's `objects`, never nested;
   * when a scene has layers, every top-level object is one.
   */
  layer?: boolean;
  /** Runtime element identity and emission for generated collections. */
  /** Runtime only (Mouse Instance copies): scene time of its birth. Evaluated earlier, the node does not exist yet. */
  since?: number;
  elementIndex?: number;
  eventIndex?: number;
  children: SceneNode[];
  /** An isolated nested scene. Stored children are empty; the engine evaluates the local scene. */
  composition?: { scene: SceneV1; params?: Record<string, unknown>; modulation?: ClockModulation; /** Runtime copy context; omitted from authored scenes. */ randomSalt?: number; /** Runtime palette choice shared by copies from one input event. */ eventSalt?: number };
}

/**
 * Instance: draws another node's result (`of`, with its effects) with its own placement and its own
 * effects on top. If the original changes, the instance changes. An instance that would end up depending
 * on itself (on its own group, or in a chain) draws nothing.
 */
export interface InstanceNode extends NodeBase {
  kind: 'instance';
  of: string;
  /** Generates copies from canvas input during playback; draws nothing at rest. */
  mouse?: Record<string, unknown>;
}

/**
 * Effector: draws nothing. Its effect stack is appended to that of each of its `targets`, to each one
 * separately. `delay` (seconds): target n sees the animation of those effects n × delay later.
 * Hidden, it does nothing.
 */
export interface EffectorNode extends NodeBase {
  kind: 'effector';
  targets: string[];
  delay?: number;
}

export type SceneNode = ObjectNode | ShapeNode | GroupNode | InstanceNode | EffectorNode;

/** A custom variable: a number, an expression, or a number with a range (min/max/step for a slider). */
export type CustomVariable = number | { $expr: string; fallback: number } | RangedVariable;
export interface RangedVariable {
  value: number;
  min?: number;
  max?: number;
  step?: number;
}
/** Whether a custom variable is a number with a range. */
export const isRangedVariable = (v: unknown): v is RangedVariable =>
  !!v && typeof v === 'object' && typeof (v as RangedVariable).value === 'number' && !('$expr' in (v as object));
/** A plain or ranged variable's number (clamped to its range), or null for an expression. */
export function customNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (!isRangedVariable(v) || !Number.isFinite(v.value)) return null;
  return Math.min(v.max ?? Infinity, Math.max(v.min ?? -Infinity, v.value));
}

export type ViewportFit = 'contain' | 'cover' | 'stretch' | 'adapt';

/** How Play fits the document to a full viewport, or null when the scene is not full-viewport. */
export function viewportFit(scene: Pick<SceneV1, 'fullViewport'>): ViewportFit | null {
  const f = scene.fullViewport;
  return f === true ? 'contain' : f === 'contain' || f === 'cover' || f === 'stretch' || f === 'adapt' ? f : null;
}

/**
 * Adapt: the document takes the viewport's shape (`width` × `height`, in CSS px), around the same centre.
 * With `adaptContent` (the default) the content scales as Contain would fit it; without it, it stays at its
 * own size (1 document px = 1 CSS px) in the middle. Null without a document or a measurable viewport.
 */
export function adaptedDocument(
  scene: Pick<SceneV1, 'document' | 'adaptContent'>,
  width: number,
  height: number,
): NonNullable<SceneV1['document']> | null {
  const doc = scene.document;
  if (!doc || !(width > 0) || !(height > 0) || !(doc.width > 0) || !(doc.height > 0)) return null;
  const scale = scene.adaptContent === false ? 1 : Math.min(width / doc.width, height / doc.height);
  return { ...doc, width: width / scale, height: height / scale };
}

/** The SVG `preserveAspectRatio` for a viewport fit. */
export const VIEWPORT_ASPECT: Record<ViewportFit, string> = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none', adapt: 'xMidYMid meet' };

export interface SceneV1 {
  version: 1;
  /**
   * Fill the viewport during Play, like CSS object-fit: `contain` (whole document, no distortion; also what
   * `true` means), `cover` (fills the screen, crops what overflows), `stretch` (fills both axes, distorts) or
   * `adapt` (the document itself takes the viewport's shape, so `scene.width`/`height` and the Physics bounds
   * follow the screen; see `adaptContent`). Editor geometry and exports are unchanged.
   */
  fullViewport?: boolean | ViewportFit;
  /**
   * With `fullViewport: "adapt"`: scale the content to fit the viewport (on, the default) or keep it at the
   * document's own size in the middle (`false`).
   */
  adaptContent?: boolean;
  /**
   * The document's edges are walls for every Physics in the scene: bodies bounce off them. With Adapt, the
   * edges are the viewport's.
   */
  physicsBounds?: boolean;
  /**
   * Clip to the document in Play: whatever lies outside it is not shown (by default the stage lets it
   * overflow, and Contain shows it in the bands). Exports already stop at the document; the editor has its
   * own View → Hide outside.
   */
  clipToDocument?: boolean;
  /** Global seed for effect expressions; nested compositions inherit it unless they override it. */
  seedGenerator?: number;
  /**
   * Re-seed every this many seconds of scene time (0 or absent: never). `scene.seedGenerator` then takes a new
   * value per interval, so everything linked to it changes on a beat; still deterministic for a given time.
   */
  seedEvery?: number;
  /**
   * Play draws a new `seedGenerator` each time the scene loads, so everything linked to it (effect seeds,
   * `random()`) comes out different on every visit. The editor and exports keep the stored seed.
   */
  seedOnLoad?: boolean;
  /**
   * Optional numeric variables available as `scene.custom.name`: a number, an expression, or a number with a
   * range (`{ value, min?, max?, step? }`, shown as a slider in the editor; the value is clamped to it).
   */
  custom?: Record<string, CustomVariable>;
  /** User notes about the scene; editor metadata, ignored by rendering and SVG export. */
  notes?: string;
  /** Editor ruler guides in document coordinates; ignored by rendering and SVG export. */
  guides?: { x: number[]; y: number[] };
  /** As in the layers of design tools: the first one in the list is in front. */
  objects: SceneNode[];
  /** Maximum segment length when subdividing, as a fraction of each object's size. */
  resolution?: number;
  /** Fixed document size, centred at (x, y) (the origin by default). Without it, it fits whatever is drawn. */
  document?: { width: number; height: number; x?: number; y?: number } | null;
  /** Animation (optional): keyframe tracks. See animation.ts. */
  animation?: Animation;
  /** Interactions (optional): hover, click, scroll and pointer. See interactions.ts. */
  interactions?: Interaction[];
  /**
   * The time (seconds) the scene corresponds to, if it is a frame of the animation (`sampleScene` sets it;
   * the editor, when evaluating). Not saved: only what is delayed uses it (Effector's Delay).
   */
  at?: number;
  /**
   * The live pointer, for `scene.mouse.*` formulas. Runtime only (the player fills it in each frame it is
   * used; it is never saved). Absent, formulas see the neutral values of `neutralPointer`.
   */
  pointer?: Partial<ScenePointer>;
  /** Runtime only, like `pointer`: `scene.dt`, `scene.scroll`, `scene.pixelRatio` and `scene.clock.*`. */
  runtime?: Partial<SceneRuntime>;
  /**
   * Runtime only, like `pointer`: clicks on bodies of a Physics group with Poke (Play). `at`: scene time;
   * `node`: the body's node; `dir`: the push's direction in document coordinates (away from the click).
   */
  pokes?: ScenePoke[];
  /** Runtime only: double-clicks that burst a body of a Physics group with Burst (Play). `at`: scene time. */
  bursts?: SceneBurst[];
  /** Runtime only: bodies dragged with the pointer in a Physics group with Drag & throw (Play). */
  drags?: SceneDrag[];
  /**
   * Runtime only: the pointer's recent path over the stage in Play (scene time; document coordinates), for a
   * Physics with Hover push. Only the last moments are kept: a sweep pushes the world from where it is.
   */
  sweeps?: SceneSweep[];
}

/** A sample of the pointer's path in Play (see `SceneV1.sweeps`). */
export interface SceneSweep { at: number; x: number; y: number }

/**
 * A drag in Play (see `SceneV1.drags`): which body, the pointer's path (scene time; document coordinates; the
 * first point is where the body was grabbed) and when it was let go (absent while it is held).
 */
export interface SceneDrag { id: number; node: string; points: { at: number; x: number; y: number }[]; end?: number; body?: string }

/** A double-click that bursts a body in Play (see `SceneV1.bursts`). */
export interface SceneBurst { at: number; node: string; body?: string }

/**
 * A click on a body in Play (see `SceneV1.pokes`). `body`, on these and on bursts and drags: which body of that
 * node (`node#element key`: one letter of a Text, one piece of a burst body); absent, every body of the node.
 */
export interface ScenePoke { at: number; node: string; dir: [number, number]; body?: string }

/** What `scene.mouse.*` formulas can read. `pos*`: scene coordinates (px, as an object's x/y); `frac*`: 0–1 across the document. */
export interface ScenePointer {
  posX: number; posY: number; fracX: number; fracY: number; down: number; inside: number;
  /** Secondary buttons held (0/1). */
  rightDown: number; middleDown: number;
  /** Primary clicks since the player started, and ms since the last one (0 before any). */
  clicks: number; clickMs: number;
  /** The wheel, accumulated: 1 per 100 px of deltaY (positive = down, as the browser reports it). */
  wheel: number;
  /** Pointer speed, px per second in scene coordinates (smoothed; it decays to 0 when the pointer stops). */
  velX: number; velY: number;
  /** Milliseconds the primary button has been held; after release, how long the last press lasted (0 before any). */
  downMs: number;
}
export const POINTER_FIELDS = ['posX', 'posY', 'fracX', 'fracY', 'down', 'inside', 'velX', 'velY', 'downMs', 'rightDown', 'middleDown', 'clicks', 'clickMs', 'wheel'] as const;

/** The pointer before it has moved: the centre of the document, not pressed, not inside. */
export const neutralPointer = (scene: Pick<SceneV1, 'document'>): ScenePointer => ({
  posX: scene.document?.x ?? 0, posY: scene.document?.y ?? 0, fracX: 0.5, fracY: 0.5, down: 0, inside: 0, velX: 0, velY: 0, downMs: 0, rightDown: 0, middleDown: 0, clicks: 0, clickMs: 0, wheel: 0,
});

/** Live values supplied by a player: frame time, page scroll, screen density and the real clock. */
export interface SceneRuntime {
  /** Seconds since the previous frame (1 / fps in renders and exports). */
  dt: number;
  /** How far the page has scrolled, 0–1 (an embedded scene reacts to its page). */
  scroll: number;
  pixelRatio: number;
  /** The real clock, local time (renders and exports see 0: they are not about when they run). */
  hour: number; minute: number; second: number;
}
export const CLOCK_FIELDS = ['hour', 'minute', 'second'] as const;
export const neutralRuntime = (scene: Pick<SceneV1, 'animation'>): SceneRuntime => ({ dt: 1 / (scene.animation?.fps || 30), scroll: 0, pixelRatio: 1, hour: 0, minute: 0, second: 0 });

/** The scene (what is saved and exported). */
export type Scene = SceneV1;

/** Is it an svertik scene? (for what comes from a file, the clipboard or the URL) */
export function isScene(value: unknown): value is SceneV1 {
  const s = value as Partial<SceneV1> | null;
  return !!s && s.version === 1 && Array.isArray(s.objects);
}

/** Duration for scenes driven only by nested compositions (no parent timeline required). */
export function sceneDuration(scene: SceneV1, depth = 0): number {
  if (scene.animation) return scene.animation.duration;
  if (depth > 32) return 3;
  let duration = 0;
  const visit = (nodes: SceneNode[]) => { for (const n of nodes) {
    if (n.kind === 'group' && n.composition) {
      const p = n.composition.params ?? {};
      const speed = typeof p.speed === 'number' ? Math.abs(p.speed) : 1;
      duration = Math.max(duration, (Number(p.start) || 0) + sceneDuration(n.composition.scene, depth + 1) / (speed || 1));
    } else if (n.children?.length) visit(n.children);
  } };
  visit(scene.objects);
  return duration || 3;
}

/**
 * Scenes saved by 0.0.8 kept per-copy shape values on the node (`each`). They are now an Each effect with a Shape
 * inside, right after the node's first Clone. Moves them in place; a scene without them is left as it is.
 */
export function liftNodeEach(scene: { objects: unknown[] }): void {
  const walk = (nodes: unknown[]) => {
    for (const raw of nodes) {
      const node = raw as { id: string; kind?: string; each?: Record<string, unknown>; stack?: { id: string; type: string; params?: Record<string, unknown>; children?: unknown[] }[]; children?: unknown[]; composition?: { scene?: { objects: unknown[] } } };
      if (node.each) {
        const values = node.each;
        delete node.each;
        const stack = (node.stack ??= []);
        const at = stack.findIndex((m) => m.type === 'clone');
        if (Object.keys(values).length && at >= 0) {
          stack.splice(at + 1, 0, { id: `each-${node.id}`, type: 'each', params: {}, children: [{ id: `shape-${node.id}`, type: 'shapevalues', params: values }] });
        }
      }
      if (node.children) walk(node.children);
      if (node.composition?.scene) walk(node.composition.scene.objects);
    }
  };
  walk(scene.objects);
}
