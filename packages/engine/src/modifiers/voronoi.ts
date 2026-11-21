import { intersection, type MultiPolygon, type Pair } from '../polygon';
import { covers, inside, regionOf, toSubPath } from '../clip';
import type { Geometry, Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, prepare, type Layer } from './halftone';
import { noise2D } from '../random';

const MAX_CELLS = 1000;

/** Turns filled input surfaces into clipped, tone-sampled Voronoi cells. Sites stay inside the source. */
export const voronoi = defineModifier({
  type: 'voronoi',
  label: 'Voronoi',
  kind: 'generator',
  params: {
    spacing: { type: 'number', default: 32, min: 8, max: 200, step: 1, unit: 'px', label: 'Cell size', random: [20, 48] },
    jitter: { type: 'number', default: 0.8, min: 0, max: 1, step: 0.01, label: 'Jitter', random: [0.3, 1] },
    color: { type: 'enum', default: 'original', options: ['original', 'ink'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#111111', label: 'Ink', showIf: { color: ['ink'] } },
    seed: { type: 'seed', default: 1 },
    drift: { type: 'number', default: 0, min: 0, max: 0.5, step: 0.01, unit: 'fraction', group: 'Motion', label: 'Drift' },
    speed: { type: 'number', default: 0.5, min: 0, max: 3, step: 0.01, group: 'Motion', label: 'Speed' },
    time: { type: 'number', default: 0, min: 0, step: 0.01, unit: 's', group: 'Motion', label: 'Time', random: false },
  },
  apply(geo, p, ctx): Geometry {
    if (!geo.shapes.length) return geo;
    const layers = geo.shapes.map(prepare).filter((layer): layer is Layer => !!layer);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    const spacing = Math.max(8, p.spacing);
    const paintAt = p.color === 'original' ? colorSampler(layers) : null;
    const bounds: [number, number, number, number] = layers.reduce<[number, number, number, number]>((b, l) => [Math.min(b[0], l.box[0]), Math.min(b[1], l.box[1]), Math.max(b[2], l.box[2]), Math.max(b[3], l.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    const region = regionOf(geo.shapes, Math.max(ctx.resolution, spacing / 80));
    if (!region.length) return { viewBox: geo.viewBox, shapes: [] };

    const cols = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / spacing));
    const rows = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / spacing));
    // Bound work for huge artboards. A coarser grid keeps generation and clipping responsive.
    const scale = Math.sqrt((cols * rows) / MAX_CELLS);
    const step = scale > 1 ? spacing * scale : spacing;
    const gridCols = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / step));
    const gridRows = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / step));
    const gridX = bounds[0] + (bounds[2] - bounds[0] - gridCols * step) / 2;
    const gridY = bounds[1] + (bounds[3] - bounds[1] - gridRows * step) / 2;
    // Preserve lattice IDs for every frame; only points inside the filled region become cells.
    const sites: (Pair | null)[] = Array(gridCols * gridRows).fill(null);
    const baseStyles: (Shape['style'] | null)[] = Array(gridCols * gridRows).fill(null);
    const driftX = p.drift > 0 ? noise2D(p.seed + 104729) : null;
    const driftY = p.drift > 0 ? noise2D(p.seed + 130363) : null;
    const phase = p.time * p.speed;
    for (let y = 0; y < gridRows; y++) for (let x = 0; x < gridCols; x++) {
      const cx = gridX + (x + 0.5) * step;
      const cy = gridY + (y + 0.5) * step;
      const baseX = cx + (rand(p.seed, x, y, 0) - 0.5) * step * p.jitter;
      const baseY = cy + (rand(p.seed, x, y, 1) - 0.5) * step * p.jitter;
      const base: Pair = [baseX, baseY];
      if (!inside(base, region)) continue;
      const latticeIndex = y * gridCols + x;
      baseStyles[latticeIndex] = paintAt?.(base)?.style ?? null;
      const nx = x * 0.73, ny = y * 0.73;
      const dx = driftX ? Math.tanh((driftX(nx + phase, ny + phase * 0.37) - driftX(nx, ny)) * 2) * step * p.drift : 0;
      const dy = driftY ? Math.tanh((driftY(nx - phase * 0.41, ny + phase * 0.61) - driftY(nx, ny)) * 2) * step * p.drift : 0;
      sites[latticeIndex] = dx || dy ? keepInside(base, [baseX + dx, baseY + dy], region) : base;
    }
    const output: Shape[] = [];
    // Search from each site's original lattice address: recomputing this address after the sites move
    // can skip a real neighbour, leaving overlapping Voronoi regions. Expand for the maximum drift.
    const reach = 2 + Math.ceil(p.drift * 2);
    for (let index = 0; index < sites.length; index++) {
      const site = sites[index];
      if (!site) continue;
      const gx = index % gridCols;
      const gy = Math.floor(index / gridCols);
      let cell: Pair[] = [[site[0] - step * 2.5, site[1] - step * 2.5], [site[0] + step * 2.5, site[1] - step * 2.5], [site[0] + step * 2.5, site[1] + step * 2.5], [site[0] - step * 2.5, site[1] + step * 2.5]];
      for (let oy = -reach; oy <= reach && cell.length; oy++) for (let ox = -reach; ox <= reach && cell.length; ox++) {
        const sx = gx + ox, sy = gy + oy;
        if (sx < 0 || sy < 0 || sx >= gridCols || sy >= gridRows || (!ox && !oy)) continue;
        const other = sites[sy * gridCols + sx];
        if (other) cell = clipHalfPlane(cell, site, other);
      }
      if (cell.length < 3) continue;
      const ring = [...cell, cell[0]!];
      const polygon: MultiPolygon = [[ring]];
      const xs = cell.map((point) => point[0]), ys = cell.map((point) => point[1]);
      const cellBounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      // Most cells are wholly inside the silhouette. Avoid a polygon boolean operation for those.
      const clipped = covers(region, cellBounds) ? polygon : intersection(region, polygon);
      if (!clipped.length) continue;
      const sampledStyle = paintAt ? paintAt(site)?.style ?? baseStyles[index] ?? paintAt(centroid(cell))?.style : null;
      if (p.color === 'original' && !sampledStyle) continue;
      const subpaths = clipped.flatMap((poly) => poly.map(toSubPath)).filter((path): path is NonNullable<typeof path> => !!path);
      if (subpaths.length) output.push({ style: p.color === 'ink' ? { fill: p.ink, stroke: 'none' } : sampledStyle!, subpaths, clone: index });
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});

/** Keep each moving site inside the silhouette so its cell cannot vanish or enter from outside. */
function keepInside(start: Pair, end: Pair, region: MultiPolygon): Pair {
  let low = 0;
  let high = 1;
  let crossed = false;
  // Check the path, not just its endpoint, so drift cannot jump across a concavity or hole.
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const point: Pair = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    if (inside(point, region)) low = t;
    else { high = t; crossed = true; break; }
  }
  if (!crossed) return end;
  for (let i = 0; i < 14; i++) {
    const t = (low + high) / 2;
    const point: Pair = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
    if (inside(point, region)) low = t;
    else high = t;
  }
  const t = low * 0.999;
  const point: Pair = [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t];
  return inside(point, region) ? point : start;
}

function clipHalfPlane(poly: Pair[], a: Pair, b: Pair): Pair[] {
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const limit = (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) / 2;
  let min = Infinity, max = -Infinity;
  for (const point of poly) {
    const d = point[0] * nx + point[1] * ny - limit;
    min = Math.min(min, d);
    max = Math.max(max, d);
  }
  if (max <= 1e-8) return poly;
  if (min > 1e-8) return [];
  const out: Pair[] = [];
  for (let i = 0; i < poly.length; i++) {
    const start = poly[i]!, end = poly[(i + 1) % poly.length]!;
    const ds = start[0] * nx + start[1] * ny - limit;
    const de = end[0] * nx + end[1] * ny - limit;
    if (ds <= 1e-8) out.push(start);
    if ((ds < 0 && de > 0) || (ds > 0 && de < 0)) {
      const t = ds / (ds - de);
      out.push([start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]);
    }
  }
  return out;
}

function centroid(points: Pair[]): Pair {
  const sum = points.reduce<Pair>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function rand(seed: number, x: number, y: number, axis: number): number {
  let n = Math.imul(Math.trunc(seed) ^ Math.imul(x + 4099, 0x9e3779b1) ^ Math.imul(y + 8191, 0x85ebca6b) ^ Math.imul(axis + 1, 0xc2b2ae35), 0x27d4eb2d);
  n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}
