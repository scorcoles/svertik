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
  source: string;
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
  geometry: Geometry;
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
  /** Runtime element identity and emission for generated collections. */
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

export type ViewportFit = 'contain' | 'cover' | 'stretch';

/** How Play fits the document to a full viewport, or null when the scene is not full-viewport. */
export function viewportFit(scene: Pick<SceneV1, 'fullViewport'>): ViewportFit | null {
  const f = scene.fullViewport;
  return f === true ? 'contain' : f === 'contain' || f === 'cover' || f === 'stretch' ? f : null;
}

/** The SVG `preserveAspectRatio` for a viewport fit. */
export const VIEWPORT_ASPECT: Record<ViewportFit, string> = { contain: 'xMidYMid meet', cover: 'xMidYMid slice', stretch: 'none' };

export interface SceneV1 {
  version: 1;
  /**
   * Fill the viewport during Play, like CSS object-fit: `contain` (whole document, no distortion; also what
   * `true` means), `cover` (fills the screen, crops what overflows) or `stretch` (fills both axes, distorts).
   * Editor geometry and exports are unchanged.
   */
  fullViewport?: boolean | ViewportFit;
  /** Global seed for effect expressions; nested compositions inherit it unless they override it. */
  seedGenerator?: number;
  /**
   * Re-seed every this many seconds of scene time (0 or absent: never). `scene.seedGenerator` then takes a new
   * value per interval, so everything linked to it changes on a beat; still deterministic for a given time.
   */
  seedEvery?: number;
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
}

/** What `scene.mouse.*` formulas can read. `pos*`: scene coordinates (px, as an object's x/y); `frac*`: 0–1 across the document. */
export interface ScenePointer { posX: number; posY: number; fracX: number; fracY: number; down: number; inside: number }
export const POINTER_FIELDS = ['posX', 'posY', 'fracX', 'fracY', 'down', 'inside'] as const;

/** The pointer before it has moved: the centre of the document, not pressed, not inside. */
export const neutralPointer = (scene: Pick<SceneV1, 'document'>): ScenePointer => ({
  posX: scene.document?.x ?? 0, posY: scene.document?.y ?? 0, fracX: 0.5, fracY: 0.5, down: 0, inside: 0,
});

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
