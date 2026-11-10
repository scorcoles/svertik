// Escena v2: varios objetos y grupos, cada uno con su pila de efectos y su posición.

import { bounds, mapPoints, type Bounds, type Geometry, type Shape } from './geometry';
import { importSVG } from './import';
import { buildShape } from './shapes';
import { IDENTITY, invert, multiply, rotateScale, translate, type Mat } from './matrix';
import type { ModifierInstance, Scene as SceneV1 } from './engine';

export interface Placement {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  /** Reflejo horizontal (espejo izquierda ↔ derecha) y vertical, alrededor del centro del nodo. */
  flipX?: boolean;
  flipY?: boolean;
  /** Centro de transformación (giro, escala, reflejo), en fracciones de la caja del nodo. Por defecto, el centro. */
  pivot?: [number, number];
}

interface NodeBase {
  id: string;
  name: string;
  /** Efectos del nodo. En un grupo, se aplican al conjunto de sus hijos. */
  stack: ModifierInstance[];
  transform?: Partial<Placement>;
  opacity?: number;
  visible?: boolean;
}

export interface ObjectNode extends NodeBase {
  kind: 'object';
  source: string;
}

/** Primitiva: forma generada por parámetros (rectángulo, estrella…), con su propia pila. */
export interface ShapeNode extends NodeBase {
  kind: 'shape';
  shape: string;
  params: Record<string, unknown>;
}

export interface GroupNode extends NodeBase {
  kind: 'group';
  children: SceneNode[];
}

export type SceneNode = ObjectNode | ShapeNode | GroupNode;

export interface SceneV2 {
  version: 2;
  /** Como en las capas de Illustrator o Figma: el primero de la lista está delante. */
  objects: SceneNode[];
  /** Longitud máxima de tramo al subdividir, como fracción del tamaño de cada objeto. */
  resolution?: number;
  /** Tamaño fijo del documento (centrado en el origen). Sin él, se ajusta a lo que haya. */
  document?: { width: number; height: number } | null;
}

export type AnyScene = SceneV1 | SceneV2;

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, rotation: 0 };

/** Escenas v1 (un SVG, una pila) → v2 con un objeto. Las v2 pasan tal cual. */
export function migrateScene(scene: AnyScene, name = 'source.svg'): SceneV2 {
  if (scene.version === 2) return scene;
  return {
    version: 2,
    resolution: scene.resolution,
    objects: [{ kind: 'object', id: 'object-1', name, source: scene.source, stack: scene.stack }],
  };
}

/** Recorre el árbol: cada nodo con su padre. */
export function* walkNodes(nodes: SceneNode[], parent: GroupNode | null = null): Generator<{ node: SceneNode; parent: GroupNode | null }> {
  for (const node of nodes) {
    yield { node, parent };
    if (node.kind === 'group') yield* walkNodes(node.children, node);
  }
}

export interface NodeInfo {
  id: string;
  kind: 'object' | 'shape' | 'group';
  /** Caja de referencia de los efectos del nodo (fracciones), en sus coordenadas locales. */
  bounds: Bounds;
  /** De coordenadas locales del nodo a coordenadas del documento. */
  matrix: Mat;
  /** Caja del resultado del nodo, ya en el documento (para seleccionarlo). */
  box: Bounds;
}

export interface DocumentResult {
  geometry: Geometry;
  /** El origen de cada objeto, colocado en el documento (para verlo en fantasma). */
  sources: Geometry;
  nodes: Map<string, NodeInfo>;
}

export const placementOf = (n: NodeBase): Placement => ({ ...DEFAULT_PLACEMENT, ...n.transform });

/** Matriz de un nodo: mueve, gira y escala alrededor de `center`, que acaba en (x, y) + `anchor`. */
function placementMatrix(p: Placement, ref: Bounds, anchor: [number, number]): Mat {
  // Con el pivote fuera del centro, el ancla se mueve lo mismo: sin giro ni escala, el nodo no cambia de sitio.
  const c = centerOf(ref);
  const pv = pivotPoint(ref, p.pivot);
  const a: [number, number] = [anchor[0] + pv[0] - c[0], anchor[1] + pv[1] - c[1]];
  return multiply(translate(a[0] + p.x, a[1] + p.y), multiply(linearOf(p), translate(-pv[0], -pv[1])));
}

/** La parte lineal de la colocación: giro, escala y reflejo. */
export const linearOf = (p: Placement): Mat => multiply(rotateScale(p.rotation, p.scale), [p.flipX ? -1 : 1, 0, 0, p.flipY ? -1 : 1, 0, 0]);

/** El pivote en coordenadas locales del nodo. */
export const pivotPoint = (ref: Bounds, pivot: [number, number] | undefined): [number, number] => {
  const [fx, fy] = pivot ?? [0.5, 0.5];
  return [ref.x + fx * ref.width, ref.y + fy * ref.height];
};

const transformGeo = (geo: Geometry, m: Mat): Geometry => {
  if (m.every((v, i) => v === IDENTITY[i])) return geo;
  return mapPoints(geo, ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
};

const withOpacity = (shapes: Shape[], opacity: number | undefined): Shape[] => {
  if (opacity === undefined || opacity >= 1) return shapes;
  return shapes.map((s) => ({ ...s, style: { ...s.style, opacity: String(Number(s.style.opacity ?? 1) * Math.max(0, opacity)) } }));
};

const centerOf = (b: Bounds): [number, number] => [b.x + b.width / 2, b.y + b.height / 2];

const union = (boxes: Bounds[]): Bounds => {
  const real = boxes.filter((b) => b.width > 0 || b.height > 0);
  if (!real.length) return { x: 0, y: 0, width: 0, height: 0 };
  const x0 = Math.min(...real.map((b) => b.x));
  const y0 = Math.min(...real.map((b) => b.y));
  const x1 = Math.max(...real.map((b) => b.x + b.width));
  const y1 = Math.max(...real.map((b) => b.y + b.height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
};

export interface DocumentEvaluator {
  evaluate(scene: SceneV2): DocumentResult;
}

/** Geometría de otro nodo, ya en las coordenadas de la pila que la pide (o null si aún no se sabe). */
export type TargetLookup = (id: string) => Geometry | null;

/**
 * Evalúa el árbol. `runStack` aplica una pila a una geometría con su caja de referencia;
 * los objetos guardan en caché su origen importado y el resultado de su pila.
 *
 * Efectos que usan otro objeto (Clone sobre un objeto, Path wrap…): una primera pasada sin ellos
 * y, si alguno lo pidió, otra con lo que salió de la primera. Esos nodos no se guardan en caché.
 */
export function createDocumentEvaluator(
  runStack: (geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: TargetLookup) => Geometry,
): DocumentEvaluator {
  const cache = new Map<string, { key: string; source: Geometry; result: Geometry; dynamic: boolean }>();

  function evaluate(scene: SceneV2): DocumentResult {
    const resolution = scene.resolution ?? 0.01;
    const seen = new Set<string>();
    /** Lo de la pasada anterior: matriz y resultado (en el documento) de cada nodo. */
    let known = new Map<string, { world: Mat; geo: Geometry }>();
    let nodes = new Map<string, NodeInfo>();
    let shapes: Shape[] = [];

    for (let passNo = 0; passNo < 3; passNo++) {
      nodes = new Map<string, NodeInfo>();
      const results = new Map<string, Geometry>();
      let asked = false;
      const lookupFor = (ownerId: string): TargetLookup => (id) => {
        if (!id || id === ownerId) return null;
        asked = true;
        const owner = known.get(ownerId);
        const t = known.get(id);
        return owner && t ? transformGeo(t.geo, invert(owner.world)) : null;
      };

      // Devuelve la geometría del nodo en coordenadas de su padre.
      const evalNode = (node: SceneNode, parentMatrix: Mat): Shape[] => {
        seen.add(node.id);
        const p = placementOf(node);
        if (node.kind === 'object' || node.kind === 'shape') {
          const key = node.kind === 'object' ? JSON.stringify([resolution, node.stack]) + '\n' + node.source : JSON.stringify([resolution, node.stack, node.shape, node.params]);
          let entry = cache.get(node.id);
          if (!entry || entry.key !== key || entry.dynamic) {
            const source = entry && entry.key === key ? entry.source : node.kind === 'object' ? importSVG(node.source) : buildShape(node.shape, node.params);
            const ref = bounds(source);
            const before = asked;
            asked = false;
            const result = runStack(source, node.stack, ref, resolution, lookupFor(node.id));
            entry = { key, source, result, dynamic: asked };
            asked = asked || before;
            cache.set(node.id, entry);
          }
          const ref = bounds(entry.source);
          // Un objeto importado queda centrado en el origen.
          const m = placementMatrix(p, ref, [0, 0]);
          const world = multiply(parentMatrix, m);
          const placed = transformGeo(entry.result, m);
          results.set(node.id, entry.result);
          nodes.set(node.id, { id: node.id, kind: node.kind, bounds: ref, matrix: world, box: bounds(transformGeo(entry.result, world)) });
          if (node.visible === false) return [];
          return withOpacity(placed.shapes.map((s) => ({ ...s, node: s.node ?? node.id })), node.opacity);
        }
        // Grupo: los hijos en sus posiciones; luego la pila del grupo sobre el conjunto; luego su posición.
        // Se pintan de abajo arriba (el primero de la lista, delante); para Step, Color…
        // cada hijo es un elemento numerado en el orden de la lista (respetando sus copias).
        const childShapes: Shape[] = [];
        for (let i = node.children.length - 1; i >= 0; i--) {
          const out = evalNode(node.children[i]!, IDENTITY);
          childShapes.push(...out.map((s) => ({ ...s, clone: i * 10000 + (s.clone ?? 0) })));
        }
        const inner: Geometry = { viewBox: [0, 0, 0, 0], shapes: childShapes };
        const ref = bounds(inner);
        const result = node.stack.length ? runStack(inner, node.stack, ref, resolution, lookupFor(node.id)) : inner;
        const c = centerOf(ref);
        // Agrupar no mueve nada: el centro del grupo se queda donde está.
        const m = placementMatrix(p, ref, c);
        const world = multiply(parentMatrix, m);
        // Los hijos ya están en coordenadas del grupo: su matriz real es la del grupo por la suya.
        for (const child of node.children) if (nodes.has(child.id)) reparent(child, world);
        results.set(node.id, result);
        nodes.set(node.id, { id: node.id, kind: 'group', bounds: ref, matrix: world, box: bounds(transformGeo(result, world)) });
        if (node.visible === false) return [];
        return withOpacity(transformGeo(result, m).shapes, node.opacity);
      };

      // Al evaluar un hijo dentro de un grupo se usó la identidad: aquí se le compone la del grupo.
      const reparent = (node: SceneNode, groupWorld: Mat) => {
        const info = nodes.get(node.id)!;
        info.matrix = multiply(groupWorld, info.matrix);
        info.box = transformBox(info.box, groupWorld);
        if (node.kind === 'group') for (const c of node.children) reparent(c, groupWorld);
      };

      // El primero de la lista se pinta el último: queda delante.
      shapes = [...scene.objects].reverse().flatMap((n) => evalNode(n, IDENTITY));
      // Nadie pidió otro objeto: no hace falta otra pasada.
      if (!asked) break;
      known = new Map([...nodes].map(([id, info]) => [id, { world: info.matrix, geo: transformGeo(results.get(id)!, info.matrix) }]));
    }

    // El origen de cada objeto, con su matriz final (la de sus grupos incluida).
    const placedSources: Shape[] = [];
    for (const { node } of walkNodes(scene.objects)) {
      if (node.kind === 'group' || node.visible === false) continue;
      const entry = cache.get(node.id);
      const info = nodes.get(node.id);
      if (entry && info) placedSources.push(...transformGeo(entry.source, info.matrix).shapes.map((s) => ({ ...s, node: node.id })));
    }
    for (const id of [...cache.keys()]) if (!seen.has(id)) cache.delete(id);

    const all = bounds({ viewBox: [0, 0, 0, 0], shapes });
    let viewBox: [number, number, number, number];
    if (scene.document) {
      const { width: w, height: h } = scene.document;
      viewBox = [-w / 2, -h / 2, w, h];
    } else {
      const m = Math.max(all.width, all.height) * 0.05 || 1;
      viewBox = [all.x - m, all.y - m, all.width + 2 * m, all.height + 2 * m].map((n) => Math.round(n * 100) / 100) as [number, number, number, number];
    }
    return { geometry: { viewBox, shapes }, sources: { viewBox, shapes: placedSources }, nodes };
  }

  return { evaluate };
}

/** Caja de una caja transformada (las cuatro esquinas). */
function transformBox(b: Bounds, m: Mat): Bounds {
  const pts: [number, number][] = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x, b.y + b.height],
    [b.x + b.width, b.y + b.height],
  ].map(([x, y]) => [m[0] * x! + m[2] * y! + m[4], m[1] * x! + m[3] * y! + m[5]]);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export { union as unionBounds };
