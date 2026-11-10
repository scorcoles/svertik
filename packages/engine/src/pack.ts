// Pack: congela un nodo (con sus efectos) en un objeto que solo dibuja el resultado.
// El original va dentro, con lo que lo animaba o lo hacía reaccionar; Unpack lo devuelve tal cual.

import { mapPoints, type Geometry } from './geometry';
import { invert, type Mat } from './matrix';
import { walkNodes, type DocumentResult, type GroupNode, type ObjectNode, type SceneNode, type SceneV2 } from './document';
import type { ModifierInstance } from './engine';

/** Dónde está un nodo: su lista y su posición, y el grupo que lo contiene. */
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

/** Los ids de un nodo y todo lo que cuelga de él (hijos y efectos). */
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
 * Empaqueta el nodo `id` con el resultado que da `doc` (la evaluación de esta misma escena).
 * Cambia la escena: el nodo pasa a ser un paquete en su mismo sitio y con su mismo id (así lo que lo
 * usaba de referencia, como Mosaic o Clone, lo sigue encontrando). Devuelve el paquete y si
 * estaba animado (su animación queda dentro y no se ve hasta desempaquetarlo), o null si no se puede.
 */
export function packNode(scene: SceneV2, id: string, doc: DocumentResult, key: string): { node: ObjectNode; animated: boolean } | null {
  const at = locate(scene.objects, id);
  const world = doc.geometryOf(id);
  if (!at || !world) return null;
  const node = at.list[at.index]!;
  if (node.kind === 'object' && node.packed) return null;
  // En las coordenadas del padre (dentro de un grupo, las del grupo).
  const parentWorld = at.parent ? doc.nodes.get(at.parent.id)?.matrix : null;
  const local = parentWorld ? apply(world, invert(parentWorld)) : world;
  // Sin a quién pertenecían sus formas (el paquete es un solo objeto); sí con sus elementos, para los efectos.
  const geometry: Geometry = clone({ viewBox: local.viewBox, shapes: local.shapes.map(({ node: _n, ...s }) => s) });
  if (!geometry.shapes.length) return null;
  const xs = geometry.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p), ...sp.segs.flatMap((g) => [g.c1, g.c2])]));
  const [x0, x1] = [Math.min(...xs.map((q) => q[0])), Math.max(...xs.map((q) => q[0]))];
  const [y0, y1] = [Math.min(...xs.map((q) => q[1])), Math.max(...xs.map((q) => q[1]))];
  // Un objeto pone el centro de su origen en (x, y): así el paquete queda justo donde estaba.
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };

  // Lo que anima o hace reaccionar al nodo (o a algo de dentro) se va con él.
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
 * Desempaqueta: el original vuelve a su sitio, movido lo que se haya movido el paquete, con la opacidad,
 * la fusión y la visibilidad del paquete y, encima de su pila, los efectos que se le pusieron al paquete.
 * Si algún id ya existe en la escena (un paquete duplicado), lo de dentro recibe ids nuevos.
 * Devuelve el id del nodo restaurado, o null.
 */
export function unpackNode(scene: SceneV2, id: string, freshId: (old: string) => string): string | null {
  const at = locate(scene.objects, id);
  const pack = at?.list[at.index];
  if (!at || !pack || pack.kind !== 'object' || !pack.packed?.original) return null;
  const data = clone(pack.packed);
  let node = data.original!;

  // Ids que ya están en la escena (sin contar el paquete): los de dentro, nuevos.
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
    // Cualquier texto que sea uno de esos ids (el propio id, o un parámetro que apunta a otro nodo).
    const re = (_k: string, v: unknown) => (typeof v === 'string' && map.has(v) ? map.get(v) : v);
    node = JSON.parse(JSON.stringify(node), re) as SceneNode;
    data.tracks = data.tracks && JSON.parse(JSON.stringify(data.tracks), re);
    data.interactions = data.interactions && JSON.parse(JSON.stringify(data.interactions), re);
  }

  // Lo que se movió el paquete, al original.
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
