// The factories that aren't generated: the scene, groups, layers, SVGs, instances, compositions and raw nodes.
import type { ClockModulation, SceneNode } from '@svertik/engine';
import { Group, Instance, RawNode, SceneBuild, SvgObject, type Node, type SceneOptions } from './core';

/** The scene: options, then its objects (the first one is drawn in front). */
export const scene = (options: SceneOptions, ...objects: Node[]) => new SceneBuild(options, objects);

/** A group of objects that move together; its effects apply to all of them. */
export function group(...children: Node[]): Group;
export function group(name: string, ...children: Node[]): Group;
export function group(...args: (string | Node)[]): Group {
  const name = typeof args[0] === 'string' ? (args.shift() as string) : undefined;
  return new Group(name, args as Node[]);
}

/** A layer: organizes the scene's top-level objects (no effects or placement). */
export function layer(name: string, ...children: Node[]): Group {
  const g = new Group(name, children);
  g.layer = true;
  return g;
}

/** An imported SVG, by its markup. */
export function svg(source: string): SvgObject;
export function svg(name: string, source: string): SvgObject;
export function svg(a: string, b?: string): SvgObject {
  return b === undefined ? new SvgObject(undefined, a) : new SvgObject(a, b);
}

interface InstanceOptions { of: Node | string; mouse?: Record<string, unknown> }
/** Draws another object's result (`of`), with its own placement and effects; `mouse` makes copies on input. */
export function instance(options: InstanceOptions): Instance;
export function instance(name: string, options: InstanceOptions): Instance;
export function instance(a: string | InstanceOptions, b?: InstanceOptions): Instance {
  const [name, o] = typeof a === 'string' ? [a, b!] : [undefined, a];
  return new Instance(name, o.of, o.mouse);
}

/**
 * A nested scene with its own clock: `params` are time, start, speed, offset, reverse, loop, frameRate;
 * `modulation` wobbles the clock (oscillate, wiggle, pulse, shake).
 */
export function composition(name: string, inner: SceneBuild, params?: Record<string, unknown>, modulation?: ClockModulation): Group {
  const g = new Group(name, []);
  g.composition = { scene: inner, ...(params ? { params } : {}), ...(modulation ? { modulation } : {}) };
  return g;
}

/** A node written as scene JSON, kept exactly as it is (what svertikJS has no words for yet). */
export const raw = (json: SceneNode) => new RawNode(json);
