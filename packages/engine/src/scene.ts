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
  /** Transform origin (rotation, scale, flip), in fractions of the node's box. The centre by default. */
  pivot?: [number, number];
}

export interface NodeBase {
  id: string;
  name: string;
  /** The node's effects. In a group, they apply to all its children together. */
  stack: ModifierInstance[];
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

export interface GroupNode extends NodeBase {
  kind: 'group';
  children: SceneNode[];
}

/**
 * Instance: draws another node's result (`of`, with its effects) with its own placement and its own
 * effects on top. If the original changes, the instance changes. An instance that would end up depending
 * on itself (on its own group, or in a chain) draws nothing.
 */
export interface InstanceNode extends NodeBase {
  kind: 'instance';
  of: string;
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

export interface SceneV2 {
  version: 2;
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
}

/** The scene (what is saved and exported). */
export type Scene = SceneV2;

/** Is it an svertik scene? (for what comes from a file, the clipboard or the URL) */
export function isScene(value: unknown): value is SceneV2 {
  const s = value as Partial<SceneV2> | null;
  return !!s && s.version === 2 && Array.isArray(s.objects);
}
