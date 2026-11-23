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
    // Space between neighbouring cells: without it, cells on a flat fill are indistinguishable from the source.
    gap: { type: 'number', default: 2, min: 0, max: 60, step: 0.5, unit: 'px', label: 'Gap', neutral: 0, sliderCurve: 'quadratic' },
    seed: { type: 'seed', default: 1 },
    drift: { type: 'number', default: 0, min: 0, max: 0.5, step: 0.01, unit: 'fraction', group: 'Motion', label: 'Drift' },
    speed: { type: 'number', default: 0.5, min: 0, max: 3, step: 0.01, group: 'Motion', label: 'Speed' },
    time: { type: 'number', default: 0, defaultExpr: 'scene.time', min: 0, step: 0.01, unit: 's', group: 'Motion', label: 'Time', random: false },
  },
  apply(geo, p, ctx): Geometry {
    if (!geo.shapes.length) return geo;
    const spacing = Math.max(8, p.spacing);
    const tolerance = Math.max(ctx.resolution, spacing / 80);
    const base = latticeOf(geo, spacing, p.jitter, p.seed, tolerance);
    if (!base) return { viewBox: geo.viewBox, shapes: [] };
    const { paintAt, region, convexRegion, ownersFrontToBack, step, gridCols, gridRows, sites: baseSites, baseStyles, edgeDistance } = base;
    const driftX = p.drift > 0 ? noise2D(p.seed + 104729) : null;
    const driftY = p.drift > 0 ? noise2D(p.seed + 130363) : null;
    const phase = p.time * p.speed;
    const gap = Math.max(0, p.gap);
    // Where each site is now, and how far it moved from its lattice place (to reuse the cached edge distance).
    const sites: (Pair | null)[] = Array(baseSites.length).fill(null);
    const moved: number[] = Array(baseSites.length).fill(0);
    for (let index = 0; index < baseSites.length; index++) {
      const start = baseSites[index];
      if (!start) continue;
      const x = index % gridCols, y = Math.floor(index / gridCols);
      const nx = x * 0.73, ny = y * 0.73;
      const dx = driftX ? Math.tanh((driftX(nx + phase, ny + phase * 0.37) - driftX(nx, ny)) * 2) * step * p.drift : 0;
      const dy = driftY ? Math.tanh((driftY(nx - phase * 0.41, ny + phase * 0.61) - driftY(nx, ny)) * 2) * step * p.drift : 0;
      if (!dx && !dy) { sites[index] = start; continue; }
      const distance = Math.hypot(dx, dy);
      // Far from the edge the whole move stays inside: no need to test the path against the silhouette.
      const site: Pair = distance < edgeDistance[index]! ? [start[0] + dx, start[1] + dy] : keepInside(start, [start[0] + dx, start[1] + dy], region);
      sites[index] = site;
      moved[index] = Math.hypot(site[0] - start[0], site[1] - start[1]);
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
        if (other) cell = clipHalfPlane(cell, site, other, gap / 2);
      }
      if (cell.length < 3) continue;
      const ring = [...cell, cell[0]!];
      const polygon: MultiPolygon = [[ring]];
      // A cell within the disc that is certainly inside the silhouette needs no clipping at all; otherwise
      // most cells are still wholly inside (cheap box test) and only the rest pay a polygon boolean.
      let radius = 0;
      for (const point of cell) radius = Math.max(radius, Math.hypot(point[0] - site[0], point[1] - site[1]));
      let clipped: MultiPolygon;
      if (radius < edgeDistance[index]! - moved[index]!) clipped = polygon;
      else {
        const xs = cell.map((point) => point[0]), ys = cell.map((point) => point[1]);
        const cellBounds = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
        clipped = covers(region, cellBounds) ? polygon
          : convexRegion ? convexClip(convexRegion, cell)
          : intersection(region, polygon);
      }
      if (!clipped.length) continue;
      const sampledStyle = paintAt(site)?.style ?? baseStyles[index] ?? paintAt(centroid(cell))?.style ?? geo.shapes[0]!.style;
      const subpaths = clipped.flatMap((poly) => poly.map(toSubPath)).filter((path): path is NonNullable<typeof path> => !!path);
      if (subpaths.length) {
        const owner = ownersFrontToBack.find((item) => inside(site, item.region))?.shape ?? geo.shapes[0]!;
        output.push({ ...owner, style: sampledStyle, subpaths, clone: index });
      }
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});

/** What does not depend on time: the silhouette, the lattice of sites at rest and how far each is from the edge. */
interface Lattice {
  paintAt: ReturnType<typeof colorSampler>;
  region: MultiPolygon;
  /** The silhouette's ring when it is one convex polygon without holes: then cells clip exactly and cheaply. */
  convexRegion: Pair[] | null;
  ownersFrontToBack: { shape: Shape; region: MultiPolygon }[];
  step: number;
  gridCols: number;
  gridRows: number;
  sites: (Pair | null)[];
  baseStyles: (Shape['style'] | null)[];
  /** Distance from each site at rest to the silhouette's nearest edge (holes included). */
  edgeDistance: number[];
}

// Drifting cells re-evaluate every frame with the same input: keep its lattice instead of rebuilding the
// silhouette, sampling the paint and testing every site against thousands of edges again.
const lattices = new Map<string, Lattice | null>();

function inputKey(geo: Geometry): string {
  let hash = 2166136261;
  const add = (value: string) => { for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } };
  for (const shape of geo.shapes) {
    add(JSON.stringify([shape.style, !!shape.imageFill, !!shape.materialTransform]));
    for (const path of shape.subpaths) {
      add(JSON.stringify([path.closed, path.start]));
      for (const segment of path.segs) add(JSON.stringify([segment.c1, segment.c2, segment.p]));
    }
  }
  return (hash >>> 0).toString(36) + ':' + geo.shapes.length;
}

function latticeOf(geo: Geometry, spacing: number, jitter: number, seed: number, tolerance: number): Lattice | null {
  const key = [inputKey(geo), spacing, jitter, seed, tolerance].join('|');
  if (lattices.has(key)) {
    const hit = lattices.get(key)!;
    lattices.delete(key);
    lattices.set(key, hit);
    return hit;
  }
  const lattice = buildLattice(geo, spacing, jitter, seed, tolerance);
  lattices.set(key, lattice);
  if (lattices.size > 32) lattices.delete(lattices.keys().next().value!);
  return lattice;
}

function buildLattice(geo: Geometry, spacing: number, jitter: number, seed: number, tolerance: number): Lattice | null {
  const layers = geo.shapes.map(prepare).filter((layer): layer is Layer => !!layer);
  if (!layers.length) return null;
  const paintAt = colorSampler(layers);
  const bounds: [number, number, number, number] = layers.reduce<[number, number, number, number]>((b, l) => [Math.min(b[0], l.box[0]), Math.min(b[1], l.box[1]), Math.max(b[2], l.box[2]), Math.max(b[3], l.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
  const region = regionOf(geo.shapes, tolerance);
  if (!region.length) return null;
  // The sampled paint supplies the cell's visible colour, while this owner preserves non-style
  // material data (notably Image Fill and a pending Clone transform) on generated cells.
  const materialOwners = geo.shapes
    .filter((shape) => shape.imageFill || shape.materialTransform)
    .map((shape) => ({ shape, region: regionOf([shape], tolerance) }))
    .filter((owner) => owner.region.length);
  const ownersFrontToBack = [...materialOwners].reverse();

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
  const edgeDistance: number[] = Array(gridCols * gridRows).fill(0);
  const edges = region.flatMap((poly) => poly.flatMap((ring) => ring.slice(1).map((point, i): [Pair, Pair] => [ring[i]!, point])));
  for (let y = 0; y < gridRows; y++) for (let x = 0; x < gridCols; x++) {
    const site: Pair = [gridX + (x + 0.5) * step + (rand(seed, x, y, 0) - 0.5) * step * jitter, gridY + (y + 0.5) * step + (rand(seed, x, y, 1) - 0.5) * step * jitter];
    if (!inside(site, region)) continue;
    const index = y * gridCols + x;
    sites[index] = site;
    baseStyles[index] = paintAt?.(site)?.style ?? null;
    let nearest = Infinity;
    for (const [a, b] of edges) nearest = Math.min(nearest, segmentDistance(site, a, b));
    edgeDistance[index] = nearest;
  }
  return { paintAt, region, convexRegion: convexRing(region), ownersFrontToBack, step, gridCols, gridRows, sites, baseStyles, edgeDistance };
}

/** The region's ring (open, counter-clockwise in y-down terms irrelevant: orientation is read) if convex. */
function convexRing(region: MultiPolygon): Pair[] | null {
  if (region.length !== 1 || region[0]!.length !== 1) return null;
  const ring = region[0]![0]!.slice(0, -1);
  if (ring.length < 3) return null;
  let sign = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!, b = ring[(i + 1) % ring.length]!, c = ring[(i + 2) % ring.length]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign && Math.sign(cross) !== sign) return null;
    sign = Math.sign(cross);
  }
  return sign ? ring : null;
}

/**
 * Intersection of a convex region with a convex cell (Sutherland–Hodgman: the region clipped by each edge of
 * the cell). Exact for two convex polygons, and linear in the region's vertices.
 */
function convexClip(region: Pair[], cell: Pair[]): MultiPolygon {
  let area = 0;
  for (let i = 0; i < cell.length; i++) { const a = cell[i]!, b = cell[(i + 1) % cell.length]!; area += a[0] * b[1] - b[0] * a[1]; }
  const orientation = Math.sign(area) || 1;
  let out = region;
  for (let i = 0; i < cell.length && out.length; i++) {
    const a = cell[i]!, b = cell[(i + 1) % cell.length]!;
    // Inside: on the same side of edge a→b as the cell's interior.
    const side = (q: Pair) => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) * orientation;
    const next: Pair[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[j]!, q = out[(j + 1) % out.length]!;
      const sp = side(p), sq = side(q);
      if (sp >= 0) next.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq);
        next.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
    out = next;
  }
  return out.length >= 3 ? [[[...out, out[0]!]]] : [];
}

function segmentDistance(q: Pair, a: Pair, b: Pair): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / length2)) : 0;
  return Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dy);
}

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

/** Keeps the part of `poly` closer to `a` than to `b`, moved `inset` px back from the bisector towards `a`. */
function clipHalfPlane(poly: Pair[], a: Pair, b: Pair, inset = 0): Pair[] {
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const limit = (b[0] * b[0] + b[1] * b[1] - a[0] * a[0] - a[1] * a[1]) / 2 - inset * Math.hypot(nx, ny);
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
