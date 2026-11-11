// Pack: freezes a node (with its effects) into an object that only draws the result.
// The original goes inside, with what animated it or made it react; Unpack gives it back as it was.

import { bounds, mapPoints, type Geometry, type Shape } from './geometry';
import { buildShape } from './shapes';
import { toSVG } from './render';
import { invert, type Mat } from './matrix';
import { walkNodes, type DocumentResult, type GroupNode, type ObjectNode, type SceneNode, type SceneV2 } from './document';
import type { ModifierInstance } from './engine';

/** Where a node is: its list and position, and the group containing it. */
function locate(list: SceneNode[], id: string, parent: GroupNode | null = null): { list: SceneNode[]; index: number; parent: GroupNode | null } | null {
  for (let i = 0; i < list.length; i++) {
    const n = list[i]!;
    if (n.id === id) return { list, index: i, parent };
    if (n.kind === 'group') {
      const found = locate(n.children, id, n);
      if (found) return found;
    }
  }
  return null;
}

/** The ids of a node and everything under it (children and effects). */
function idsOf(node: SceneNode): Set<string> {
  const out = new Set<string>();
  const mods = (list: ModifierInstance[]) => list.forEach((m) => (out.add(m.id), mods(m.children ?? [])));
  for (const { node: n } of walkNodes([node])) {
    out.add(n.id);
    mods(n.stack);
  }
  return out;
}

const apply = (geo: Geometry, m: Mat): Geometry => mapPoints(geo, ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Packs node `id` with the result `doc` gives (the evaluation of this same scene).
 * Changes the scene: the node becomes a pack in the same place and with the same id (so whatever used it
 * as a reference, like Mosaic or Clone, still finds it). Returns the pack and whether it was animated
 * (its animation stays inside and isn't seen until it is unpacked), or null if it can't be done.
 */
export function packNode(scene: SceneV2, id: string, doc: DocumentResult, key: string): { node: ObjectNode; animated: boolean } | null {
  const at = locate(scene.objects, id);
  const world = doc.geometryOf(id);
  if (!at || !world) return null;
  const node = at.list[at.index]!;
  if (node.kind === 'object' && node.packed) return null;
  // In the parent's coordinates (inside a group, the group's).
  const parentWorld = at.parent ? doc.nodes.get(at.parent.id)?.matrix : null;
  const local = parentWorld ? apply(world, invert(parentWorld)) : world;
  // Without who its shapes belonged to (the pack is one object); with its elements, for the effects.
  const geometry: Geometry = clone({ viewBox: local.viewBox, shapes: local.shapes.map(({ node: _n, ...s }) => s) });
  if (!geometry.shapes.length) return null;
  const xs = geometry.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p), ...sp.segs.flatMap((g) => [g.c1, g.c2])]));
  const [x0, x1] = [Math.min(...xs.map((q) => q[0])), Math.max(...xs.map((q) => q[0]))];
  const [y0, y1] = [Math.min(...xs.map((q) => q[1])), Math.max(...xs.map((q) => q[1]))];
  // An object puts the centre of its source at (x, y): so the pack stays exactly where it was.
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };

  // What animates or makes the node react (or something inside it) goes with it.
  const ids = idsOf(node);
  const anim = scene.animation;
  const tracks = anim?.tracks.filter((t) => ids.has(t.node)) ?? [];
  if (anim && tracks.length) anim.tracks = anim.tracks.filter((t) => !ids.has(t.node));
  const touches = (x: { node: string; target: { node: string } }) => ids.has(x.node) || ids.has(x.target.node);
  const interactions = scene.interactions?.filter(touches) ?? [];
  if (scene.interactions && interactions.length) scene.interactions = scene.interactions.filter((x) => !touches(x));

  const pack: ObjectNode = {
    kind: 'object',
    id: node.id,
    name: node.name,
    source: '',
    stack: [],
    transform: { x: centre.x, y: centre.y },
    ...(node.opacity !== undefined ? { opacity: node.opacity } : {}),
    ...(node.blend ? { blend: node.blend } : {}),
    ...(node.visible === false ? { visible: false } : {}),
    packed: {
      key,
      geometry,
      original: clone(node),
      at: centre,
      ...(tracks.length ? { tracks: clone(tracks) } : {}),
      ...(interactions.length ? { interactions: clone(interactions) } : {}),
    },
  };
  at.list[at.index] = pack;
  return { node: pack, animated: tracks.length > 0 };
}

/**
 * Unpacks: the original goes back to its place, moved as much as the pack moved, with the pack's opacity,
 * blend and visibility and, on top of its stack, the effects that were put on the pack.
 * If any id already exists in the scene (a duplicated pack), what is inside gets new ids.
 * Returns the id of the restored node, or null.
 */
export function unpackNode(scene: SceneV2, id: string, freshId: (old: string) => string): string | null {
  const at = locate(scene.objects, id);
  const pack = at?.list[at.index];
  if (!at || !pack || pack.kind !== 'object' || !pack.packed?.original) return null;
  const data = clone(pack.packed);
  let node = data.original!;

  // Ids already in the scene (not counting the pack): the inner ones get new ones.
  const taken = new Set<string>();
  const mods = (list: ModifierInstance[]) => list.forEach((m) => (taken.add(m.id), mods(m.children ?? [])));
  for (const { node: n } of walkNodes(scene.objects)) {
    if (n === pack) continue;
    taken.add(n.id);
    mods(n.stack);
  }
  const map = new Map<string, string>();
  for (const x of idsOf(node)) if (taken.has(x)) map.set(x, freshId(x));
  if (map.size) {
    // Any string that is one of those ids (the id itself, or a parameter pointing at another node).
    const re = (_k: string, v: unknown) => (typeof v === 'string' && map.has(v) ? map.get(v) : v);
    node = JSON.parse(JSON.stringify(node), re) as SceneNode;
    data.tracks = data.tracks && JSON.parse(JSON.stringify(data.tracks), re);
    data.interactions = data.interactions && JSON.parse(JSON.stringify(data.interactions), re);
  }

  // How far the pack moved, onto the original.
  const t = { x: 0, y: 0, scale: 1, rotation: 0, ...node.transform };
  const p = { x: 0, y: 0, scale: 1, rotation: 0, ...pack.transform };
  node.transform = { ...node.transform, x: t.x + (p.x - data.at.x), y: t.y + (p.y - data.at.y), rotation: t.rotation + p.rotation, scale: t.scale * p.scale };
  for (const k of ['opacity', 'blend', 'visible'] as const) {
    if (pack[k] === undefined) delete node[k];
    else (node as unknown as Record<string, unknown>)[k] = pack[k];
  }
  node.stack = [...node.stack, ...pack.stack];
  at.list[at.index] = node;

  if (data.tracks?.length) {
    scene.animation ??= { duration: 3, tracks: [] };
    scene.animation.tracks.push(...data.tracks);
  }
  if (data.interactions?.length) {
    scene.interactions ??= [];
    scene.interactions.push(...data.interactions);
  }
  return node.id;
}

/**
 * Turns a primitive (a text, a star…) into an object made of paths: the SVG of its shape, in the same
 * place, with its id, its effect stack, its placement and its look. Each piece (each letter) is a separate path.
 * What animated the shape's parameters (the size, the text itself…) has nothing left to apply to and is removed.
 * Returns how many tracks or interactions were removed, or null if the node is not a primitive.
 */
export function outlineNode(scene: SceneV2, id: string): { removed: number } | null {
  const at = locate(scene.objects, id);
  const node = at?.list[at.index];
  if (!at || !node || node.kind !== 'shape') return null;
  const geo = buildShape(node.shape, node.params);
  if (!geo.shapes.length) return null;
  const b = bounds(geo);
  const source = toSVG({ viewBox: [b.x, b.y, b.width || 1, b.height || 1], shapes: geo.shapes.map(({ clone: _c, word: _w, line: _l, ...s }) => s as Shape) });
  const { shape: _s, params: _p, kind: _k, ...rest } = node;
  at.list[at.index] = { ...rest, kind: 'object', source } as ObjectNode;
  let removed = 0;
  const anim = scene.animation;
  if (anim) {
    const keep = anim.tracks.filter((t) => !(t.node === id && t.on === 'shape'));
    removed += anim.tracks.length - keep.length;
    anim.tracks = keep;
  }
  if (scene.interactions) {
    const keep = scene.interactions.filter((x) => !(x.target.node === id && x.target.on === 'shape'));
    removed += scene.interactions.length - keep.length;
    scene.interactions = keep;
  }
  return { removed };
}
