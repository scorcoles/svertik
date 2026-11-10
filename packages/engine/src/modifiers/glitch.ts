import { difference, intersection, type MultiPolygon, type Pair, type Polygon } from 'polygon-clipping';
import { regionOf, toSubPath } from '../clip';
import { bounds, type Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { rng } from '../random';

/**
 * Glitch: distorsión de señal rota, solo con geometría (sin filtros).
 * - slices: franjas horizontales; unas cuantas se corren a izquierda o derecha;
 * - blocks: trozos rectangulares que se recortan y aparecen desplazados (dejan su hueco);
 * - split: copias en dos colores, desplazadas detrás (separación RGB, visible en los bordes);
 * - streaks: rayas finas que se escapan por los lados;
 * - scanlines: rayitas horizontales recortadas dentro.
 * Cada franja es un elemento (Step, Color…). Solo superficies, como Boolean y Mosaic.
 */
export const glitch = defineModifier({
  type: 'glitch',
  label: 'Glitch',
  kind: 'generator',
  params: {
    seed: { type: 'seed', default: 1 },
    slices: { type: 'number', default: 14, min: 0, max: 60, step: 1, ramp: false, group: 'Slices', label: 'Count' },
    chance: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, group: 'Slices', label: 'Shifted' },
    shift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', group: 'Slices', label: 'Shift' },
    blocks: { type: 'number', default: 8, min: 0, max: 80, step: 1, ramp: false, group: 'Blocks', label: 'Count' },
    blockSize: { type: 'number', default: 0.07, min: 0.01, max: 0.4, step: 0.005, unit: 'fraction', group: 'Blocks', label: 'Size' },
    blockShift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', group: 'Blocks', label: 'Shift' },
    split: { type: 'number', default: 3, min: 0, max: 30, step: 0.5, unit: 'px', group: 'Split', label: 'Distance' },
    splitA: { type: 'color', default: '#00e5ff', group: 'Split', label: 'Color A' },
    splitB: { type: 'color', default: '#ff2bd6', group: 'Split', label: 'Color B' },
    streaks: { type: 'number', default: 6, min: 0, max: 40, step: 1, ramp: false, group: 'Streaks', label: 'Count' },
    streakLength: { type: 'number', default: 0.15, min: 0.01, max: 1, step: 0.01, unit: 'fraction', group: 'Streaks', label: 'Length' },
    streakWidth: { type: 'number', default: 1.5, min: 0.25, max: 10, step: 0.25, unit: 'px', group: 'Streaks', label: 'Width' },
    scanlines: { type: 'number', default: 0, min: 0, max: 300, step: 1, ramp: false, group: 'Scanlines', label: 'Count' },
    scanWidth: { type: 'number', default: 0.75, min: 0.1, max: 6, step: 0.05, unit: 'px', group: 'Scanlines', label: 'Width' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    const step = Math.max(ctx.resolution, 1e-3);
    const wide = (y0: number, y1: number): Polygon => [rect(b.x - size, y0, b.width + 2 * size, y1 - y0)];

    // Cortes de las franjas: alturas desiguales (unas finas, otras gruesas).
    const n = Math.max(1, Math.round(p.slices) || 1);
    const cuts = [b.y];
    const weights = Array.from({ length: n }, () => 0.2 + rand() ** 2 * 2);
    const total = weights.reduce((s, x) => s + x, 0);
    for (const w of weights) cuts.push(cuts[cuts.length - 1]! + (w / total) * b.height);
    cuts[cuts.length - 1] = b.y + b.height + 1e-6;
    const dx = weights.map(() => (p.slices > 0 && rand() < p.chance ? (rand() * 2 - 1) * p.shift * size : 0));

    // Piezas: cada forma cortada en franjas y corrida. Cada pieza, su estilo y su franja.
    type Piece = { shape: Shape; poly: MultiPolygon; band: number; box: Box };
    let pieces: Piece[] = [];
    for (const s of geo.shapes) {
      if ((s.style.fill ?? 'black') === 'none') continue;
      const r = regionOf([s], step);
      if (!r.length) continue;
      for (let i = 0; i < n; i++) {
        const cut = intersection(r, wide(cuts[i]!, cuts[i + 1]!));
        if (cut.length) {
          const poly = dx[i] ? move(cut, dx[i]!, 0) : cut;
          pieces.push({ shape: s, poly, band: i, box: boxOf(poly) });
        }
      }
    }
    if (!pieces.length) return geo;

    // Cuadraditos: lo que cae dentro del bloque sale desplazado; en su sitio queda el hueco.
    for (let k = 0; k < Math.round(p.blocks); k++) {
      const bw = p.blockSize * size * (0.5 + rand() * 1.5);
      const bh = p.blockSize * size * (0.25 + rand() * 0.6);
      const B: Polygon = [rect(b.x + rand() * (b.width - bw), b.y + rand() * (b.height - bh), bw, bh)];
      const ox = (rand() * 2 - 1) * p.blockShift * size;
      const oy = (rand() * 2 - 1) * p.blockShift * size * 0.15;
      const bb = boxOf([B]);
      const next: Piece[] = [];
      for (const pc of pieces) {
        // Sin tocarse las cajas, no hay nada que recortar (evita miles de recortes inútiles).
        if (!overlaps(pc.box, bb)) {
          next.push(pc);
          continue;
        }
        const inside = intersection(pc.poly, B);
        if (!inside.length) {
          next.push(pc);
          continue;
        }
        const rest = difference(pc.poly, B);
        if (rest.length) next.push({ ...pc, poly: rest, box: boxOf(rest) });
        const moved = move(inside, ox, oy);
        next.push({ ...pc, poly: moved, box: boxOf(moved) });
      }
      pieces = next;
    }

    // Barrido: rayitas horizontales recortadas en todas las piezas.
    if (p.scanlines > 0) {
      // Tope: entre línea y línea queda al menos tanto material como hueco.
      const m = Math.min(Math.round(p.scanlines), Math.floor(b.height / (2 * p.scanWidth)));
      const gap = b.height / Math.max(1, m);
      pieces = pieces
        .map((pc) => {
          // Solo las líneas que pasan por la altura de la pieza.
          const lines: MultiPolygon = [];
          const i0 = Math.max(0, Math.floor((pc.box.y - b.y) / gap - 1)), i1 = Math.min(m - 1, Math.ceil((pc.box.y + pc.box.h - b.y) / gap));
          for (let i = i0; i <= i1; i++) {
            const y = b.y + (i + 0.5) * gap;
            lines.push([rect(pc.box.x - 1, y - p.scanWidth / 2, pc.box.w + 2, p.scanWidth)]);
          }
          return lines.length ? { ...pc, poly: difference(pc.poly, lines) } : pc;
        })
        .filter((pc) => pc.poly.length);
    }

    const toShape = (pc: Piece, poly: MultiPolygon, style?: Shape['style']): Shape | null => {
      const subpaths = poly.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
      return subpaths.length ? { ...pc.shape, style: style ?? pc.shape.style, subpaths, clone: pc.band } : null;
    };
    const out: Shape[] = [];
    // Separación RGB: detrás, una copia a cada lado en su color.
    if (p.split > 0) {
      for (const [color, sx] of [[p.splitA, -p.split], [p.splitB, p.split]] as const) {
        for (const pc of pieces) {
          const sh = toShape(pc, move(pc.poly, sx, 0), { fill: color });
          if (sh) out.push(sh);
        }
      }
    }
    for (const pc of pieces) {
      const sh = toShape(pc, pc.poly);
      if (sh) out.push(sh);
    }

    // Rayas que se escapan por los lados, a la altura de alguna franja, del color del dibujo.
    const fill = pieces[0]!.shape.style.fill ?? '#000000';
    for (let k = 0; k < Math.round(p.streaks); k++) {
      const y = b.y + rand() * b.height;
      const len = p.streakLength * size * (0.4 + rand());
      const left = rand() < 0.5;
      const x0 = left ? b.x - len * 0.7 : b.x + b.width - len * 0.3;
      const poly: MultiPolygon = [[rect(x0, y, len, p.streakWidth)]];
      out.push({ subpaths: poly.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null), style: { fill }, clone: 0 });
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
