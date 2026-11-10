// Primitivas: formas generadas por parámetros, no SVG importados.

import { line, type Cubic, type Geometry, type Style, type SubPath, type Vec2 } from './geometry';
import { fontFor } from './fonts';
import { parsePathData } from './import';
import { resolveParams, type ParamSchema, type ParamValues } from './modifier';

export interface ShapeDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  params: P;
  /** Geometría centrada en el origen. */
  build(p: ParamValues<P>): SubPath[];
  /** Si la forma tiene varios elementos (Text: una por letra), cada uno por separado (para Step, Color…). */
  buildParts?(p: ParamValues<P>): SubPath[][];
  /** Marcas de cada pieza (Text: su palabra y su línea), para Range por palabras o líneas. */
  partTags?(p: ParamValues<P>): { word?: number; line?: number }[];
}

const defineShape = <P extends ParamSchema>(d: ShapeDef<P>): ShapeDef<P> => d;

// Estilo común a todas las primitivas.
const style: ParamSchema = {
  fill: { type: 'boolean', default: true, group: 'Style', label: 'Fill', animatable: false },
  fillColor: { type: 'color', default: '#d9d9d9', group: 'Style', label: 'Fill color' },
  stroke: { type: 'boolean', default: false, group: 'Style', label: 'Stroke', animatable: false },
  strokeColor: { type: 'color', default: '#ededed', group: 'Style', label: 'Stroke color' },
  strokeWidth: { type: 'number', default: 2, min: 0, max: 40, step: 0.5, unit: 'px', group: 'Style', label: 'Stroke width' },
  strokeJoin: { type: 'enum', default: 'round', options: ['miter', 'round', 'bevel'], group: 'Style', label: 'Join', animatable: false },
  strokeCap: { type: 'enum', default: 'round', options: ['butt', 'round', 'square'], group: 'Style', label: 'Cap', animatable: false },
};

const closed = (pts: Vec2[]): SubPath => ({ start: pts[0]!, segs: pts.slice(1).concat([pts[0]!]).map((p, i) => line(i === 0 ? pts[0]! : pts[i]!, p)), closed: true });

/** Arco de elipse como cúbicas (cuartos de vuelta). */
function ellipse(rx: number, ry: number): SubPath {
  const k = 0.5522847498;
  const p = (x: number, y: number): Vec2 => [x, y];
  const segs: Cubic[] = [
    { c1: p(rx, -ry * k), c2: p(rx * k, -ry), p: p(0, -ry) },
    { c1: p(-rx * k, -ry), c2: p(-rx, -ry * k), p: p(-rx, 0) },
    { c1: p(-rx, ry * k), c2: p(-rx * k, ry), p: p(0, ry) },
    { c1: p(rx * k, ry), c2: p(rx, ry * k), p: p(rx, 0) },
  ];
  return { start: p(rx, 0), segs, closed: true };
}

export const rectangle = defineShape({
  type: 'rectangle',
  label: 'Rectangle',
  params: {
    width: { type: 'number', default: 160, min: 1, step: 1, unit: 'px', pair: 'height' },
    height: { type: 'number', default: 120, min: 1, step: 1, unit: 'px' },
    radius: { type: 'number', default: 0, min: 0, step: 1, unit: 'px' },
    ...style,
  },
  build({ width: w, height: h, radius }) {
    const r = Math.min(radius, w / 2, h / 2);
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    if (r <= 0) return [closed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])];
    const k = 0.5522847498 * r;
    const start: Vec2 = [x0 + r, y0];
    const segs: Cubic[] = [
      line([x0 + r, y0], [x1 - r, y0]),
      { c1: [x1 - r + k, y0], c2: [x1, y0 + r - k], p: [x1, y0 + r] },
      line([x1, y0 + r], [x1, y1 - r]),
      { c1: [x1, y1 - r + k], c2: [x1 - r + k, y1], p: [x1 - r, y1] },
      line([x1 - r, y1], [x0 + r, y1]),
      { c1: [x0 + r - k, y1], c2: [x0, y1 - r + k], p: [x0, y1 - r] },
      line([x0, y1 - r], [x0, y0 + r]),
      { c1: [x0, y0 + r - k], c2: [x0 + r - k, y0], p: [x0 + r, y0] },
    ];
    return [{ start, segs, closed: true }];
  },
});

export const ellipseShape = defineShape({
  type: 'ellipse',
  label: 'Ellipse',
  params: {
    width: { type: 'number', default: 140, min: 1, step: 1, unit: 'px', pair: 'height' },
    height: { type: 'number', default: 140, min: 1, step: 1, unit: 'px' },
    ...style,
  },
  build: ({ width, height }) => [ellipse(width / 2, height / 2)],
});

const ring = (n: number, r: (i: number) => number, rotation: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rotation - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / n;
    return [Math.cos(a) * r(i), Math.sin(a) * r(i)];
  });

export const polygon = defineShape({
  type: 'polygon',
  label: 'Polygon',
  params: {
    radius: { type: 'number', default: 80, min: 1, step: 1, unit: 'px' },
    sides: { type: 'number', default: 6, min: 3, max: 64, step: 1, ramp: false },
    rotation: { type: 'angle', default: 0 },
    ...style,
  },
  build: ({ radius, sides, rotation }) => [closed(ring(Math.max(3, Math.round(sides)), () => radius, rotation))],
});

export const star = defineShape({
  type: 'star',
  label: 'Star',
  params: {
    radius: { type: 'number', default: 80, min: 1, step: 1, unit: 'px' },
    points: { type: 'number', default: 5, min: 2, max: 64, step: 1, ramp: false },
    inner: { type: 'number', default: 0.45, min: 0.01, max: 1, step: 0.01, label: 'Inner radius' },
    rotation: { type: 'angle', default: 0 },
    ...style,
  },
  build: ({ radius, points, inner, rotation }) => {
    const n = Math.max(2, Math.round(points)) * 2;
    return [closed(ring(n, (i) => (i % 2 ? radius * inner : radius), rotation))];
  },
});

export const lineShape = defineShape({
  type: 'line',
  label: 'Line',
  params: {
    length: { type: 'number', default: 200, min: 1, step: 1, unit: 'px' },
    angle: { type: 'angle', default: 0 },
    ...style,
    fill: { ...style.fill!, default: false } as ParamSchema[string],
    stroke: { ...style.stroke!, default: true } as ParamSchema[string],
  },
  build: ({ length, angle }) => {
    const a = (angle * Math.PI) / 180;
    const d: Vec2 = [(Math.cos(a) * length) / 2, (Math.sin(a) * length) / 2];
    return [{ start: [-d[0], -d[1]], segs: [line([-d[0], -d[1]], d)], closed: false }];
  },
});

export const spiral = defineShape({
  type: 'spiral',
  label: 'Spiral',
  params: {
    radius: { type: 'number', default: 90, min: 1, step: 1, unit: 'px' },
    turns: { type: 'number', default: 4, min: 0.25, max: 30, step: 0.25, ramp: false },
    ...style,
    fill: { ...style.fill!, default: false } as ParamSchema[string],
    stroke: { ...style.stroke!, default: true } as ParamSchema[string],
  },
  build: ({ radius, turns }) => {
    // Espiral de Arquímedes muestreada en tramos cortos.
    const steps = Math.max(8, Math.round(turns * 48));
    const pts: Vec2[] = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const a = t * turns * 2 * Math.PI;
      return [Math.cos(a) * radius * t, Math.sin(a) * radius * t];
    });
    return [{ start: pts[0]!, segs: pts.slice(1).map((p, i) => line(pts[i]!, p)), closed: false }];
  },
});

// Peón de ajedrez: la «tetera de Utah» de svertik, una forma de prueba con curvas, cuello y base.
// Perfil de 120 × 200 centrado en el origen (cabeza, collarín, cuerpo cóncavo, anillo y peana).
const PAWN =
  'M0 -100 A26 26 0 0 1 12 -51 L12 -46 C12 -44 26 -43 26 -38 C26 -33 16 -32 15 -30 ' +
  'C15 -6 26 30 40 52 C44 58 48 60 52 62 C55 63 55 70 52 72 L52 74 C58 75 60 78 60 82 L60 100 ' +
  'L-60 100 L-60 82 C-60 78 -58 75 -52 74 L-52 72 C-55 70 -55 63 -52 62 C-48 60 -44 58 -40 52 ' +
  'C-26 30 -15 -6 -15 -30 C-16 -32 -26 -33 -26 -38 C-26 -43 -12 -44 -12 -46 L-12 -51 A26 26 0 0 1 0 -100 Z';

export const pawn = defineShape({
  type: 'pawn',
  label: 'Pawn',
  params: {
    height: { type: 'number', default: 200, min: 1, step: 1, unit: 'px' },
    ...style,
  },
  build: ({ height }) => {
    const k = height / 200;
    return parsePathData(PAWN).map((sp) => {
      const f = (q: Vec2): Vec2 => [q[0] * k, q[1] * k];
      return { start: f(sp.start), segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })), closed: sp.closed };
    });
  },
});

/**
 * Contorno de un glifo (comandos M L Q C Z de opentype.js) como subtrazados de cúbicas.
 * Los contornos de una fuente siempre son cerrados, lleven o no la «Z» (muchas fuentes no la ponen).
 */
function glyphSubpaths(commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let p0: Vec2 = [0, 0];
  const close = () => {
    if (!cur) return;
    if (cur.segs.length && (Math.abs(p0[0] - cur.start[0]) > 1e-9 || Math.abs(p0[1] - cur.start[1]) > 1e-9)) cur.segs.push(line(p0, cur.start));
    cur.closed = true;
    cur = null;
  };
  for (const c of commands) {
    if (c.type === 'M') {
      close();
      cur = { start: [c.x!, c.y!], segs: [], closed: false };
      out.push(cur);
      p0 = [c.x!, c.y!];
    } else if (c.type === 'L' && cur) {
      cur.segs.push(line(p0, [c.x!, c.y!]));
      p0 = [c.x!, c.y!];
    } else if (c.type === 'Q' && cur) {
      // Cuadrática → cúbica: los controles, a 2/3 del control cuadrático desde cada extremo.
      const q: Vec2 = [c.x1!, c.y1!], e: Vec2 = [c.x!, c.y!];
      cur.segs.push({ c1: [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])], c2: [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], p: e });
      p0 = e;
    } else if (c.type === 'C' && cur) {
      cur.segs.push({ c1: [c.x1!, c.y1!], c2: [c.x2!, c.y2!], p: [c.x!, c.y!] });
      p0 = [c.x!, c.y!];
    } else if (c.type === 'Z') close();
  }
  close();
  return out.filter((sp) => sp.segs.length);
}

export const text = defineShape({
  type: 'text',
  label: 'Text',
  params: {
    text: { type: 'text', default: 'svertik', label: 'Text' },
    font: { type: 'font', default: 'JetBrains Mono', label: 'Font' },
    size: { type: 'number', default: 72, min: 1, step: 1, unit: 'px' },
    tracking: { type: 'number', default: 0, min: -500, max: 2000, step: 5, label: 'Tracking', ramp: false },
    lineHeight: { type: 'number', default: 1.2, min: 0.5, max: 4, step: 0.05, label: 'Line height', ramp: false },
    align: { type: 'enum', default: 'center', options: ['left', 'center', 'right'], animatable: false },
    ...style,
  },
  build(p): SubPath[] {
    return textParts(p).flat();
  },
  buildParts: (p) => textParts(p),
  partTags: (p) => textTags(p),
});

/** Palabra y línea de cada letra visible, en el mismo orden que textParts. */
function textTags(p: Record<string, unknown>): { word: number; line: number }[] {
  const found = fontFor(String(p.font));
  if (!found) return [];
  const tags: { word: number; line: number }[] = [];
  let word = 0;
  String(p.text).split('\n').forEach((l, line) => {
    let inWord = false;
    found.font.forEachGlyph(l, 0, 0, Number(p.size), { kerning: true }, (glyph, gx, gy) => {
      const visible = glyph.getPath(gx, gy, Number(p.size)).commands.length > 0;
      if (visible) {
        if (!inWord) inWord = true;
        tags.push({ word, line });
      } else if (inWord) {
        inWord = false;
        word++;
      }
    });
    if (inWord) word++;
  });
  return tags;
}

/** Una pieza por letra (los espacios no cuentan), con kerning; varias líneas con su alineación. */
function textParts(p: Record<string, unknown>): SubPath[][] {
  const found = fontFor(String(p.font));
  if (!found) return [];
  const { font } = found;
  const size = Number(p.size);
  const lines = String(p.text).split('\n');
  const opts = { kerning: true, tracking: Number(p.tracking) };
  const widths = lines.map((l) => font.forEachGlyph(l, 0, 0, size, opts, () => {}));
  const maxW = Math.max(0, ...widths);
  const parts: SubPath[][] = [];
  lines.forEach((l, i) => {
    const w = widths[i]!;
    const x0 = p.align === 'left' ? -maxW / 2 : p.align === 'right' ? maxW / 2 - w : -w / 2;
    const y = i * size * Number(p.lineHeight);
    font.forEachGlyph(l, x0, y, size, opts, (glyph, gx, gy) => {
      const sps = glyphSubpaths(glyph.getPath(gx, gy, size).commands as never);
      if (sps.length) parts.push(sps);
    });
  });
  // Centrado en el origen (por la tinta), como las demás primitivas.
  const all = parts.flat();
  if (!all.length) return parts;
  const pts = all.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const f = (q: Vec2): Vec2 => [q[0] - cx, q[1] - cy];
  return parts.map((sps) => sps.map((sp) => ({ start: f(sp.start), segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })), closed: sp.closed })));
}

// El peón, siempre el último (es la forma de pruebas).
export const shapes = [rectangle, ellipseShape, polygon, star, lineShape, spiral, text, pawn];
export const shapeRegistry = new Map<string, ShapeDef>(shapes.map((s) => [s.type, s as ShapeDef]));

/** Geometría de una primitiva, con su estilo. */
export function buildShape(type: string, given: Record<string, unknown> = {}): Geometry {
  const def = shapeRegistry.get(type);
  if (!def) throw new Error(`svertik: primitiva desconocida «${type}»`);
  const p = resolveParams(def.params, given) as Record<string, unknown>;
  const parts = def.buildParts ? def.buildParts(p as never) : [def.build(p as never)];
  const st: Style = {
    fill: p.fill ? String(p.fillColor) : 'none',
    ...(p.stroke ? { stroke: String(p.strokeColor), 'stroke-width': String(p.strokeWidth), 'stroke-linejoin': String(p.strokeJoin ?? 'round'), 'stroke-linecap': String(p.strokeCap ?? 'round') } : {}),
  };
  const tags = def.partTags?.(p as never) ?? [];
  return { viewBox: [0, 0, 0, 0], shapes: parts.map((subpaths, i) => ({ subpaths, style: st, ...(def.buildParts ? { clone: i } : {}), ...(tags[i] ?? {}) })) };
}
