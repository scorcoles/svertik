import { intersection, type MultiPolygon, type Pair } from '../polygon';
import { covers, regionOf, toSubPath } from '../clip';
import type { Geometry, Shape } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, prepare, type Layer } from './halftone';
import { noise2D } from '../random';

const MAX_CELLS = 1000;

/** Turns filled input surfaces into clipped, tone-sampled Voronoi cells. */
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
    drift: { type: 'number', default: 0, min: 0, max: 0.25, step: 0.01, unit: 'fraction', group: 'Motion', label: 'Drift' },
    speed: { type: 'number', default: 0.2, min: 0, max: 3, step: 0.01, group: 'Motion', label: 'Speed' },
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
    const nx = Math.max(1, Math.ceil((bounds[2] - bounds[0]) / step));
    const ny = Math.max(1, Math.ceil((bounds[3] - bounds[1]) / step));
    const gridX = bounds[0] + (bounds[2] - bounds[0] - nx * step) / 2;
    const gridY = bounds[1] + (bounds[3] - bounds[1] - ny * step) / 2;
    const sites: Pair[] = [];
    const driftX = p.drift > 0 ? noise2D(p.seed + 104729) : null;
    const driftY = p.drift > 0 ? noise2D(p.seed + 130363) : null;
    const phase = p.time * p.speed;
    for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const cx = gridX + (x + 0.5) * step;
      const cy = gridY + (y + 0.5) * step;
      const baseX = cx + (rand(p.seed, x, y, 0) - 0.5) * step * p.jitter;
      const baseY = cy + (rand(p.seed, x, y, 1) - 0.5) * step * p.jitter;
      const nx = x * 0.73, ny = y * 0.73;
      const dx = driftX ? (driftX(nx + phase, ny + phase * 0.37) - driftX(nx, ny)) * 0.5 * step * p.drift : 0;
      const dy = driftY ? (driftY(nx - phase * 0.41, ny + phase * 0.61) - driftY(nx, ny)) * 0.5 * step * p.drift : 0;
      sites.push([baseX + dx, baseY + dy]);
    }
    const output: Shape[] = [];
    const reach = 2;
    for (let index = 0; index < sites.length; index++) {
      const site = sites[index]!;
      const gx = Math.round((site[0] - gridX) / step - 0.5);
      const gy = Math.round((site[1] - gridY) / step - 0.5);
      let cell: Pair[] = [[site[0] - step * 2.5, site[1] - step * 2.5], [site[0] + step * 2.5, site[1] - step * 2.5], [site[0] + step * 2.5, site[1] + step * 2.5], [site[0] - step * 2.5, site[1] + step * 2.5]];
      for (let oy = -reach; oy <= reach && cell.length; oy++) for (let ox = -reach; ox <= reach && cell.length; ox++) {
        const sx = gx + ox, sy = gy + oy;
        if (sx < 0 || sy < 0 || sx >= nx || sy >= ny || (!ox && !oy)) continue;
        const other = sites[sy * nx + sx];
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
      const sample = paintAt ? paintAt(site) ?? paintAt(centroid(cell)) : null;
      if (p.color === 'original' && !sample) continue;
      const subpaths = clipped.flatMap((poly) => poly.map(toSubPath)).filter((path): path is NonNullable<typeof path> => !!path);
      if (subpaths.length) output.push({ style: p.color === 'ink' ? { fill: p.ink, stroke: 'none' } : sample!.style, subpaths, clone: index });
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});

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
