// Glitch: distorsión de señal rota, en piezas sueltas que se combinan (cada una, solo lo suyo):
// - Slices: franjas horizontales; unas cuantas se corren a izquierda o derecha;
// - Blocks: trozos rectangulares que salen desplazados (dejan su hueco);
// - Scanlines: rayitas horizontales recortadas dentro;
// - Streaks: rayas finas que se escapan por los lados;
// - RGB Split (en filters.ts): copias de color desplazadas detrás, como filtro de SVG.
// Solo superficies (como Boolean y Mosaic): las líneas abiertas se pierden.
import { difference, intersection, type MultiPolygon, type Pair, type Polygon } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import { bounds, type Geometry, type Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { rng } from '../random';

/** Cada forma con relleno, como superficie (con su caja); las demás, fuera. */
function regions(geo: Geometry, resolution: number) {
  const step = Math.max(resolution, 1e-3);
  return geo.shapes
    .filter((s) => (s.style.fill ?? 'black') !== 'none')
    .map((shape) => ({ shape, poly: regionOf([shape], step) }))
    .filter((x) => x.poly.length)
    .map((x) => ({ ...x, box: boxOf(x.poly) }));
}
type Piece = ReturnType<typeof regions>[number];
const toShape = (pc: Piece, poly: MultiPolygon, extra: Partial<Shape> = {}): Shape | null => {
  const subpaths = poly.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
  return subpaths.length ? { ...pc.shape, subpaths, ...extra } : null;
};

export const slices = defineModifier({
  type: 'slices',
  label: 'Slices',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 14, min: 1, max: 60, step: 1, ramp: false, label: 'Count' },
    chance: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, label: 'Shifted' },
    shift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', label: 'Shift' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    // Cortes: alturas desiguales (unas finas, otras gruesas).
    const n = Math.max(1, Math.round(p.count));
    const weights = Array.from({ length: n }, () => 0.2 + rand() ** 2 * 2);
    const total = weights.reduce((s, x) => s + x, 0);
    const cuts = [b.y];
    for (const w of weights) cuts.push(cuts[cuts.length - 1]! + (w / total) * b.height);
    cuts[cuts.length - 1] = b.y + b.height + 1e-6;
    const dx = weights.map(() => (rand() < p.chance ? (rand() * 2 - 1) * p.shift * size : 0));
    const out: Shape[] = [];
    for (const pc of regions(geo, ctx.resolution)) {
      for (let i = 0; i < n; i++) {
        if (cuts[i + 1]! < pc.box.y || cuts[i]! > pc.box.y + pc.box.h) continue;
        const cut = intersection(pc.poly, [rect(b.x - size, cuts[i]!, b.width + 2 * size, cuts[i + 1]! - cuts[i]!)]);
        // Cada franja, un elemento (Step, Color… la tratan aparte).
        const sh = cut.length && toShape(pc, dx[i] ? move(cut, dx[i]!, 0) : cut, { clone: i });
        if (sh) out.push(sh);
      }
    }
    return out.length ? { viewBox: geo.viewBox, shapes: out } : geo;
  },
});

export const blocks = defineModifier({
  type: 'blocks',
  label: 'Blocks',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 8, min: 1, max: 80, step: 1, ramp: false, label: 'Count' },
    size: { type: 'number', default: 0.07, min: 0.01, max: 0.4, step: 0.005, unit: 'fraction', label: 'Size' },
    shift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', label: 'Shift' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    let pieces = regions(geo, ctx.resolution);
    if (!pieces.length) return geo;
    // Lo que cae dentro de cada bloque sale desplazado; en su sitio queda el hueco.
    for (let k = 0; k < Math.round(p.count); k++) {
      const bw = p.size * size * (0.5 + rand() * 1.5);
      const bh = p.size * size * (0.25 + rand() * 0.6);
      const B: Polygon = [rect(b.x + rand() * (b.width - bw), b.y + rand() * (b.height - bh), bw, bh)];
      const ox = (rand() * 2 - 1) * p.shift * size;
      const oy = (rand() * 2 - 1) * p.shift * size * 0.15;
      const bb = boxOf([B]);
      pieces = pieces.flatMap((pc) => {
        // Sin tocarse las cajas, no hay nada que recortar (evita miles de recortes inútiles).
        if (!overlaps(pc.box, bb)) return [pc];
        const inside = intersection(pc.poly, B);
        if (!inside.length) return [pc];
        const rest = difference(pc.poly, B);
        const moved = move(inside, ox, oy);
        return [...(rest.length ? [{ ...pc, poly: rest, box: boxOf(rest) }] : []), { ...pc, poly: moved, box: boxOf(moved) }];
      });
    }
    const out = pieces.map((pc) => toShape(pc, pc.poly)).filter((s): s is Shape => !!s);
    return { viewBox: geo.viewBox, shapes: out };
  },
});

export const scanlines = defineModifier({
  type: 'scanlines',
  label: 'Scanlines',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 60, min: 1, max: 300, step: 1, ramp: false, label: 'Count' },
    width: { type: 'number', default: 0.75, min: 0.1, max: 6, step: 0.05, unit: 'px', label: 'Width' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    // Tope: entre línea y línea queda al menos tanto material como hueco.
    const m = Math.max(1, Math.min(Math.round(p.count), Math.floor(b.height / (2 * p.width))));
    const gap = b.height / m;
    const out: Shape[] = [];
    for (const pc of regions(geo, ctx.resolution)) {
      // Solo las líneas que pasan por la altura de la pieza.
      const lines: MultiPolygon = [];
      const i0 = Math.max(0, Math.floor((pc.box.y - b.y) / gap - 1)), i1 = Math.min(m - 1, Math.ceil((pc.box.y + pc.box.h - b.y) / gap));
      for (let i = i0; i <= i1; i++) lines.push([rect(pc.box.x - 1, b.y + (i + 0.5) * gap - p.width / 2, pc.box.w + 2, p.width)]);
      const sh = toShape(pc, lines.length ? difference(pc.poly, lines) : pc.poly);
      if (sh) out.push(sh);
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});

export const streaks = defineModifier({
  type: 'streaks',
  label: 'Streaks',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 6, min: 1, max: 40, step: 1, ramp: false, label: 'Count' },
    length: { type: 'number', default: 0.15, min: 0.01, max: 1, step: 0.01, unit: 'fraction', label: 'Length' },
    width: { type: 'number', default: 1.5, min: 0.25, max: 10, step: 0.25, unit: 'px', label: 'Width' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    // Del color del dibujo (el de la primera forma con relleno); el dibujo se queda como estaba.
    const fill = geo.shapes.find((s) => s.style.fill && s.style.fill !== 'none')?.style.fill ?? '#000000';
    const out: Shape[] = [...geo.shapes];
    for (let k = 0; k < Math.round(p.count); k++) {
      const y = b.y + rand() * b.height;
      const len = p.length * size * (0.4 + rand());
      const left = rand() < 0.5;
      const x0 = left ? b.x - len * 0.7 : b.x + b.width - len * 0.3;
      const sp = toSubPath(rect(x0, y, len, p.width));
      if (sp) out.push({ subpaths: [sp], style: { fill } });
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});

type Box = { x: number; y: number; w: number; h: number };
function boxOf(m: MultiPolygon): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of m) for (const [x, y] of poly[0] ?? []) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
const overlaps = (a: Box, b: Box) => a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
const rect = (x: number, y: number, w: number, h: number): Pair[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const move = (m: MultiPolygon, dx: number, dy: number): MultiPolygon => m.map((poly) => poly.map((ring) => ring.map(([x, y]) => [x + dx, y + dy] as Pair)));
