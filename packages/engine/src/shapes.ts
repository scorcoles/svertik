// Primitivas: formas generadas por parámetros (como los objetos primitivos de C4D), no SVG importados.

import { line, type Cubic, type Geometry, type Style, type SubPath, type Vec2 } from './geometry';
import { resolveParams, type ParamSchema, type ParamValues } from './modifier';

export interface ShapeDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  params: P;
  /** Geometría centrada en el origen. */
  build(p: ParamValues<P>): SubPath[];
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
    width: { type: 'number', default: 160, min: 1, step: 1, unit: 'px' },
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
    width: { type: 'number', default: 140, min: 1, step: 1, unit: 'px' },
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

export const shapes = [rectangle, ellipseShape, polygon, star, lineShape, spiral];
export const shapeRegistry = new Map<string, ShapeDef>(shapes.map((s) => [s.type, s as ShapeDef]));

/** Geometría de una primitiva, con su estilo. */
export function buildShape(type: string, given: Record<string, unknown> = {}): Geometry {
  const def = shapeRegistry.get(type);
  if (!def) throw new Error(`svertik: primitiva desconocida «${type}»`);
  const p = resolveParams(def.params, given) as Record<string, unknown>;
  const subpaths = def.build(p as never);
  const st: Style = {
    fill: p.fill ? String(p.fillColor) : 'none',
    ...(p.stroke ? { stroke: String(p.strokeColor), 'stroke-width': String(p.strokeWidth), 'stroke-linejoin': String(p.strokeJoin ?? 'round'), 'stroke-linecap': String(p.strokeCap ?? 'round') } : {}),
  };
  return { viewBox: [0, 0, 0, 0], shapes: [{ subpaths, style: st }] };
}
