// Escena v2: varios objetos y grupos, cada uno con su pila de efectos y su posición.

import { bounds, mapPoints, type Bounds, type FilterDef, type Geometry, type Shape, type Vec2 } from './geometry';
import { importSVG } from './import';
import { fontsOf, fontsVersion, hasFont, loadFont } from './fonts';
import { buildShape } from './shapes';
import { apply, IDENTITY, invert, multiply, rotateScale, translate, type Mat } from './matrix';
import type { Animation, Track } from './animation';
import type { Interaction } from './interactions';
import type { FilterChain, ModifierInstance, StackRefs, StepMemo } from './engine';

/** Modos de fusión de CSS Compositing and Blending (valen en SVG). */
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
  /** Modo de fusión con lo de detrás (`mix-blend-mode`); sin él, normal. En un grupo, se aplica a cada hijo. */
  blend?: BlendMode;
  visible?: boolean;
}

export interface ObjectNode extends NodeBase {
  kind: 'object';
  source: string;
  /** Paquete: el resultado congelado de otro nodo. Se dibuja `geometry` y no se calcula nada más. */
  packed?: Pack;
}

/**
 * Lo que guarda un paquete. `geometry` es el resultado del nodo original, ya colocado (en las coordenadas
 * de su padre); `original`, el nodo tal cual, con lo que lo animaba o lo hacía reaccionar, para desempaquetarlo.
 * `at`: la colocación del paquete al crearlo (al desempaquetar, lo que se haya movido se suma al original).
 */
export interface Pack {
  key: string;
  geometry: Geometry;
  /** Sin él (en el código exportado, por ejemplo), el paquete no se puede desempaquetar. */
  original?: SceneNode;
  at: { x: number; y: number };
  tracks?: Track[];
  interactions?: Interaction[];
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
  /** Como en las capas de los editores: el primero de la lista está delante. */
  objects: SceneNode[];
  /** Longitud máxima de tramo al subdividir, como fracción del tamaño de cada objeto. */
  resolution?: number;
  /** Tamaño fijo del documento, centrado en (x, y) (por defecto, el origen). Sin él, se ajusta a lo que haya. */
  document?: { width: number; height: number; x?: number; y?: number } | null;
  /** Animación (opcional): pistas de fotogramas clave. Ver animation.ts. */
  animation?: Animation;
  /** Interacciones (opcional): hover y clic sobre los objetos. Ver interactions.ts. */
  interactions?: Interaction[];
}

/** La escena (lo que se guarda y se exporta). */
export type Scene = SceneV2;

/** ¿Es una escena de svertik? (para lo que llega de un archivo, del portapapeles o de la URL) */
export function isScene(value: unknown): value is SceneV2 {
  const s = value as Partial<SceneV2> | null;
  return !!s && s.version === 2 && Array.isArray(s.objects);
}

export const DEFAULT_PLACEMENT: Placement = { x: 0, y: 0, scale: 1, rotation: 0 };


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
  /**
   * La caja sobre la que mide cada efecto de su pila (por id), si no es `bounds`: tras un Clone o un
   * Mirror, los de debajo miden sobre lo que estos generan.
   */
  refs?: StackRefs;
  /** De coordenadas locales del nodo a coordenadas del documento. */
  matrix: Mat;
  /** Caja del resultado del nodo, ya en el documento (para seleccionarlo). */
  box: Bounds;
}

export interface DocumentResult {
  geometry: Geometry;
  /** El resultado de un nodo (con sus efectos), en el documento; sin su opacidad ni su fusión. */
  geometryOf(id: string): Geometry | null;
  /** El origen de cada objeto, colocado en el documento (para verlo en fantasma). */
  sources: Geometry;
  nodes: Map<string, NodeInfo>;
}

export const placementOf = (n: NodeBase): Placement => ({ ...DEFAULT_PLACEMENT, ...n.transform });

/**
 * Matriz de un nodo: gira y escala alrededor de su pivote, y su origen (por defecto, el centro de su caja)
 * acaba en (x, y) + `anchor`.
 */
function placementMatrix(p: Placement, ref: Bounds, anchor: [number, number], origin: Vec2 = centerOf(ref)): Mat {
  // Con el pivote fuera del centro, el ancla se mueve lo mismo: sin giro ni escala, el nodo no cambia de sitio.
  const c = origin;
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

/** Fusión del nodo en sus formas; la que ya traiga una forma (de un hijo) manda. */
const withBlend = (shapes: Shape[], blend: BlendMode | undefined): Shape[] =>
  !blend || blend === 'normal' ? shapes : shapes.map((s) => (s.style['mix-blend-mode'] ? s : { ...s, style: { ...s.style, 'mix-blend-mode': blend } }));

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
  runStack: (geo: Geometry, stack: ModifierInstance[], ref: Bounds, resolution: number, target?: TargetLookup, memo?: StepMemo, refs?: StackRefs) => Geometry,
  filtersOf: (stack: ModifierInstance[]) => FilterChain | null = () => null,
): DocumentEvaluator {
  // El origen de cada nodo (SVG importado o primitiva), por su propia clave: no se rehace si solo
  // cambian sus efectos. Y lo que va dando su pila, paso a paso (ver runStack).
  const sources = new Map<string, { key: string; geo: Geometry }>();
  const memos = new Map<string, StepMemo>();
  const memoOf = (id: string) => {
    let m = memos.get(id);
    if (!m) memos.set(id, (m = { steps: [] }));
    return m;
  };
  // `deps`: en los que usan otro objeto, la huella de lo que vieron de cada uno (su geometría y dónde
  // estaban los dos). Mientras no cambie, el resultado vale: no se rehace al tocar otra cosa.
  const cache = new Map<string, { key: string; source: Geometry; result: Geometry; dynamic: boolean; deps: [string, number][]; refs: StackRefs }>();
  /** Lo que salió la última vez (matriz y geometría de cada nodo): la primera pasada parte de ahí. */
  let last = new Map<string, { world: Mat; geo: Geometry }>();

  function evaluate(scene: SceneV2): DocumentResult {
    const resolution = scene.resolution ?? 0.01;
    const seen = new Set<string>();
    /** Lo de la pasada anterior: matriz y resultado (en el documento) de cada nodo. */
    let known = last;
    // Huella de la geometría de cada nodo conocido (se calcula una vez por pasada).
    let prints = new Map<string, number>();
    const printOf = (id: string) => {
      let h = prints.get(id);
      if (h === undefined) prints.set(id, (h = known.has(id) ? hashGeo(known.get(id)!.geo) : -1));
      return h;
    };
    /** Lo que `ownerId` ve de `id`: cambia si cambia el otro o si se mueve cualquiera de los dos. */
    const depOf = (ownerId: string, id: string) => {
      const owner = known.get(ownerId);
      return owner && known.has(id) ? mix(printOf(id), owner.world) : -1;
    };
    let nodes = new Map<string, NodeInfo>();
    let shapes: Shape[] = [];
    let finalResults = new Map<string, Geometry>();
    let fx = new Map<string, FilterChain>();

    for (let passNo = 0; passNo < 3; passNo++) {
      nodes = new Map<string, NodeInfo>();
      const results = new Map<string, Geometry>();
      let asked = false;
      // Lo que se pidió en esta pasada, para saber si la siguiente hace falta.
      const seenDeps: { owner: string; id: string; h: number }[] = [];
      const lookupFor = (ownerId: string, deps?: [string, number][]): TargetLookup => (id) => {
        if (!id || id === ownerId) return null;
        asked = true;
        const h = depOf(ownerId, id);
        deps?.push([id, h]);
        seenDeps.push({ owner: ownerId, id, h });
        const owner = known.get(ownerId);
        const t = known.get(id);
        return owner && t ? transformGeo(t.geo, invert(owner.world)) : null;
      };

      // Filtros (sombra, desenfoque…): sus formas van dentro de un grupo con el filtro del nodo.
      fx = new Map();
      const withFilters = (node: SceneNode, shapes: Shape[]): Shape[] => {
        const f = filtersOf(node.stack);
        if (!f || !shapes.length) return shapes;
        fx.set(node.id, f);
        return shapes.map((s) => ({ ...s, wrap: [node.id, ...(s.wrap ?? [])] }));
      };

      // Devuelve la geometría del nodo en coordenadas de su padre.
      const evalNode = (node: SceneNode, parentMatrix: Mat): Shape[] => {
        seen.add(node.id);
        const p = placementOf(node);
        if (node.kind === 'object' || node.kind === 'shape') {
          // El texto depende de las fuentes registradas: si llega una nueva, se vuelve a dibujar.
          const key = node.kind === 'object' ? JSON.stringify([resolution, node.stack]) + '\n' + (node.packed ? `pack:${node.packed.key}` : node.source) : JSON.stringify([resolution, node.stack, node.shape, node.params, node.shape === 'text' ? fontsVersion() : 0]);
          let entry = cache.get(node.id);
          // Uno que usa otro objeto vale si lo que ve de él no ha cambiado.
          const fresh = entry && entry.key === key && (!entry.dynamic || entry.deps.every(([id, h]) => depOf(node.id, id) === h));
          if (entry && fresh && entry.dynamic) {
            asked = true;
            for (const [id, h] of entry.deps) seenDeps.push({ owner: node.id, id, h });
          }
          if (!entry || !fresh) {
            const sk = node.kind === 'object' ? (node.packed ? `pack:${node.packed.key}` : node.source) : JSON.stringify([node.shape, node.params, node.shape === 'text' ? fontsVersion() : 0]);
            let src = sources.get(node.id);
            if (!src || src.key !== sk) {
              src = { key: sk, geo: node.kind === 'object' ? (node.packed?.geometry ?? importSVG(node.source)) : buildShape(node.shape, node.params) };
              sources.set(node.id, src);
            }
            const source = src.geo;
            const ref = bounds(source);
            const before = asked;
            asked = false;
            const deps: [string, number][] = [];
            const refs: StackRefs = {};
            const result = runStack(source, node.stack, ref, resolution, lookupFor(node.id, deps), memoOf(node.id), refs);
            entry = { key, source, result, dynamic: asked, deps, refs };
            asked = asked || before;
            cache.set(node.id, entry);
          }
          const ref = bounds(entry.source);
          // Un objeto importado queda centrado en el origen (o, si lo trae, en su punto de origen: Text con ancla).
          const m = placementMatrix(p, ref, [0, 0], entry.source.origin);
          const world = multiply(parentMatrix, m);
          const placed = transformGeo(entry.result, m);
          results.set(node.id, entry.result);
          nodes.set(node.id, { id: node.id, kind: node.kind, bounds: ref, refs: entry.refs, matrix: world, box: bounds(transformGeo(entry.result, world)) });
          if (node.visible === false) return [];
          return withFilters(node, withBlend(withOpacity(placed.shapes.map((s) => ({ ...s, node: s.node ?? node.id })), node.opacity), node.blend));
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
        const refs: StackRefs = {};
        const result = node.stack.length ? runStack(inner, node.stack, ref, resolution, lookupFor(node.id), undefined, refs) : inner;
        const c = centerOf(ref);
        // Agrupar no mueve nada: el centro del grupo se queda donde está.
        const m = placementMatrix(p, ref, c);
        const world = multiply(parentMatrix, m);
        // Los hijos ya están en coordenadas del grupo: su matriz real es la del grupo por la suya.
        for (const child of node.children) if (nodes.has(child.id)) reparent(child, world);
        results.set(node.id, result);
        nodes.set(node.id, { id: node.id, kind: 'group', bounds: ref, refs, matrix: world, box: bounds(transformGeo(result, world)) });
        if (node.visible === false) return [];
        return withFilters(node, withBlend(withOpacity(transformGeo(result, m).shapes, node.opacity), node.blend));
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
      finalResults = results;
      // Nadie pidió otro objeto: no hace falta otra pasada.
      if (!asked) {
        last = new Map();
        break;
      }
      known = new Map([...nodes].map(([id, info]) => [id, { world: info.matrix, geo: transformGeo(results.get(id)!, info.matrix) }]));
      prints = new Map();
      last = known;
      // Si con lo que salió ahora se vería lo mismo que se vio, ya está: otra pasada daría lo mismo.
      if (seenDeps.every((d) => depOf(d.owner, d.id) === d.h)) break;
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
    for (const map of [sources, memos]) for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id);

    // La zona de cada filtro: la caja del objeto en el documento, más lo que se salga el filtro.
    let filters: Record<string, FilterDef> | undefined;
    for (const [id, f] of fx) {
      const info = nodes.get(id);
      if (!info) continue;
      const b = info.box;
      const region: [number, number, number, number] = [b.x - f.pad, b.y - f.pad, b.width + 2 * f.pad, b.height + 2 * f.pad];
      // Dónde está el objeto (su caja de referencia con su matriz): los filtros por zonas siguen al objeto.
      const m = info.matrix, r = info.refs?.[''] ?? info.bounds;
      const scale = Math.hypot(m[0], m[1]);
      const place = {
        point: (fx: number, fy: number) => apply(m, [r.x + fx * r.width, r.y + fy * r.height]),
        size: Math.max(r.width, r.height) * scale,
        rotation: (Math.atan2(m[1], m[0]) * 180) / Math.PI,
        region,
      };
      (filters ??= {})[id] = { markup: f.markup(id, place), region };
    }
    // Lo que ocupa todo, contando lo que se salen los filtros (una sombra larga no se corta).
    const all = union([bounds({ viewBox: [0, 0, 0, 0], shapes }), ...Object.values(filters ?? {}).map(({ region: [x, y, width, height] }) => ({ x, y, width, height }))]);
    let viewBox: [number, number, number, number];
    if (scene.document) {
      const { width: w, height: h, x = 0, y = 0 } = scene.document;
      viewBox = [x - w / 2, y - h / 2, w, h];
    } else {
      const m = Math.max(all.width, all.height) * 0.05 || 1;
      viewBox = [all.x - m, all.y - m, all.width + 2 * m, all.height + 2 * m].map((n) => Math.round(n * 100) / 100) as [number, number, number, number];
    }
    const geometryOf = (id: string) => {
      const g = finalResults.get(id);
      const info = nodes.get(id);
      return g && info ? transformGeo(g, info.matrix) : null;
    };
    return { geometry: { viewBox, shapes, ...(filters ? { filters } : {}) }, sources: { viewBox, shapes: placedSources }, nodes, geometryOf };
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

/** Huella numérica de una geometría (sus puntos, redondeados): para saber si ha cambiado. */
function hashGeo(geo: Geometry): number {
  let h = 2166136261;
  const add = (v: number) => {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  };
  for (const s of geo.shapes) {
    add(s.subpaths.length);
    for (const sp of s.subpaths) {
      add(sp.start[0]);
      add(sp.start[1]);
      add(sp.closed ? 1 : 0);
      for (const g of sp.segs) {
        add(g.c1[0]); add(g.c1[1]); add(g.c2[0]); add(g.c2[1]); add(g.p[0]); add(g.p[1]);
      }
    }
  }
  return h >>> 0;
}

/** La huella de la geometría, junto con la matriz del que la mira. */
function mix(h: number, m: Mat): number {
  for (const v of m) {
    h ^= Math.round(v * 1000) | 0;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Las fuentes que usan los textos de la escena (también los de dentro de un paquete). */
export function sceneFonts(scene: SceneV2) {
  const params: Record<string, unknown>[] = [];
  const visit = (nodes: SceneNode[]) => {
    for (const { node } of walkNodes(nodes)) {
      if (node.kind === 'shape' && node.shape === 'text') params.push(node.params);
      if (node.kind === 'object' && node.packed?.original) visit([node.packed.original]);
    }
  };
  visit(scene.objects);
  return fontsOf(params);
}

/** Baja de Fontsource las fuentes que usa la escena y aún no están registradas. */
export async function loadFonts(scene: SceneV2): Promise<void> {
  await Promise.all(sceneFonts(scene).filter((f) => !hasFont(f.key)).map((f) => loadFont(f.family, f.weight, f.italic)));
}
