// Geometría interna: todo es curva cúbica. Una forma tiene subtrazados y un estilo.

export type Vec2 = readonly [number, number];

/** Un tramo cúbico; su punto de partida es el final del tramo anterior (o `start`). */
export interface Cubic {
  c1: Vec2;
  c2: Vec2;
  p: Vec2;
}

export interface SubPath {
  start: Vec2;
  segs: Cubic[];
  closed: boolean;
}

export type Style = Record<string, string>;

export interface Shape {
  subpaths: SubPath[];
  style: Style;
  /** Número de copia que le dio Clone (para efectores como Step). */
  clone?: number;
  /** En un texto: a qué palabra y a qué línea pertenece la letra (para Range por palabras o líneas). */
  word?: number;
  line?: number;
  /** Objeto de la escena del que sale (para seleccionarlo en el lienzo). */
  node?: string;
  /** Degradados que usa su estilo (`fill="url(#id)"`); el render los escribe en <defs>. */
  gradients?: Gradient[];
  /** Grupos con filtro que la envuelven, de fuera adentro (ids de `Geometry.filters`). */
  wrap?: string[];
}

/** Un filtro de SVG para un grupo de formas: sus primitivas y la zona que ocupa (en el documento). */
export interface FilterDef {
  markup: string;
  region: [number, number, number, number];
}

/** Degradado relativo a la caja de cada forma (objectBoundingBox): sigue a la forma al moverla o escalarla. */
export interface Gradient {
  id: string;
  kind: 'linear' | 'radial';
  stops: { offset: number; color: string; opacity?: number }[];
  /** Lineal: de (x1, y1) a (x2, y2), en fracciones de la caja. */
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  /** Radial: centro, radio y foco (el punto de más intensidad), en fracciones de la caja. */
  cx?: number;
  cy?: number;
  r?: number;
  fx?: number;
  fy?: number;
}

export interface Geometry {
  shapes: Shape[];
  /** viewBox del SVG de origen: [x, y, ancho, alto]. */
  viewBox: [number, number, number, number];
  /** Filtros de SVG (sombra, desenfoque…) de los objetos que los llevan, por id. Ver `Shape.wrap`. */
  filters?: Record<string, FilterDef>;
  /**
   * Solo en el origen de un nodo: el punto que se coloca en su posición (x, y). Sin él, el centro de su
   * caja. Un texto anclado a la izquierda no se mueve al cambiar de palabra.
   */
  origin?: Vec2;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Recta como cúbica (controles a un tercio y dos tercios). */
export const line = (a: Vec2, b: Vec2): Cubic => ({ c1: lerp(a, b, 1 / 3), c2: lerp(a, b, 2 / 3), p: b });

/** Parte una cúbica en t (de Casteljau). */
export function splitCubic(p0: Vec2, s: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, s.c1, t);
  const b = lerp(s.c1, s.c2, t);
  const c = lerp(s.c2, s.p, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  const m = lerp(d, e, t);
  return [
    { c1: a, c2: d, p: m },
    { c1: e, c2: c, p: s.p },
  ];
}

/** Longitud aproximada por el polígono de control (cota superior, basta para subdividir). */
const hullLength = (p0: Vec2, s: Cubic) => dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p);

/**
 * Subdivide cada tramo hasta que ninguno mida más que `maxLength`.
 * Hace falta antes de deformar: una curva larga con solo dos controles no se dobla.
 */
export function subdivide(geo: Geometry, maxLength: number): Geometry {
  return mapSubPaths(geo, (sp) => {
    const segs: Cubic[] = [];
    let p0 = sp.start;
    for (const s of sp.segs) {
      const n = Math.max(1, Math.ceil(hullLength(p0, s) / maxLength));
      let rest = s;
      let from = p0;
      for (let i = n; i > 1; i--) {
        const [a, b] = splitCubic(from, rest, 1 / i);
        segs.push(a);
        from = a.p;
        rest = b;
      }
      segs.push(rest);
      p0 = s.p;
    }
    return { start: sp.start, segs, closed: sp.closed };
  });
}

export function mapSubPaths(geo: Geometry, fn: (sp: SubPath, shape: Shape) => SubPath): Geometry {
  return {
    viewBox: geo.viewBox,
    shapes: geo.shapes.map((shape) => ({ ...shape, subpaths: shape.subpaths.map((sp) => fn(sp, shape)) })),
  };
}

/** Aplica una función a todos los puntos (anclas y controles). */
export function mapPoints(geo: Geometry, fn: (p: Vec2) => Vec2): Geometry {
  return mapSubPaths(geo, (sp) => ({
    start: fn(sp.start),
    segs: sp.segs.map((s) => ({ c1: fn(s.c1), c2: fn(s.c2), p: fn(s.p) })),
    closed: sp.closed,
  }));
}

/** Caja que contiene todos los puntos (controles incluidos). */
export function bounds(geo: Geometry): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Vec2) => {
    if (p[0] < x0) x0 = p[0];
    if (p[1] < y0) y0 = p[1];
    if (p[0] > x1) x1 = p[0];
    if (p[1] > y1) y1 = p[1];
  };
  for (const shape of geo.shapes) {
    for (const sp of shape.subpaths) {
      add(sp.start);
      for (const s of sp.segs) {
        add(s.c1);
        add(s.c2);
        add(s.p);
      }
    }
  }
  if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Cúbica evaluada en t. */
export function cubicAt(p0: Vec2, s: Cubic, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * p0[0] + b * s.c1[0] + c * s.c2[0] + d * s.p[0],
    a * p0[1] + b * s.c1[1] + c * s.c2[1] + d * s.p[1],
  ];
}

/** Subtrazado → polilínea (muestras fijas por tramo; basta para pruebas de dentro/fuera). */
export function flatten(sp: SubPath, samplesPerSegment = 8): Vec2[] {
  const pts: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const s of sp.segs) {
    for (let i = 1; i <= samplesPerSegment; i++) pts.push(cubicAt(p0, s, i / samplesPerSegment));
    p0 = s.p;
  }
  return pts;
}

/** Punto dentro de un conjunto de polígonos, con la regla par-impar (respeta agujeros). */
export function insidePolygons(polys: Vec2[][], [x, y]: Vec2): boolean {
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]!;
      const [xj, yj] = poly[j]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}
