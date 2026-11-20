import { line, type Geometry, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, darkness, prepare, rnd, type Layer } from './halftone';

// Bound per-frame sampling and SVG path size on large canvases. The grid grows evenly to fit the budget.
const MAX_CELLS = 40_000;

/** Turns sampled tone into a binary, vector pixel grid. */
export const dithering = defineModifier({
  type: 'dithering',
  label: 'Dithering',
  kind: 'generator',
  params: {
    spacing: { type: 'number', default: 6, min: 1, max: 100, step: 0.5, unit: 'px', label: 'Cell size', random: [3, 12] },
    angle: { type: 'angle', default: 0, label: 'Angle', ramp: false, random: [0, 90] },
    algorithm: { type: 'enum', default: 'bayer', options: ['bayer', 'floyd-steinberg', 'atkinson', 'noise'] as const, label: 'Algorithm', animatable: false },
    matrix: { type: 'enum', default: '4', options: ['2', '4', '8', '16'] as const, label: 'Bayer matrix', showIf: { algorithm: ['bayer'] }, animatable: false },
    threshold: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Threshold', random: [0.35, 0.65] },
    gamma: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Gamma', random: [0.7, 1.6] },
    color: { type: 'enum', default: 'ink', options: ['ink', 'original'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#111111', label: 'Ink', showIf: { color: ['ink'] } },
    invert: { type: 'boolean', default: false, label: 'Invert' },
    seed: { type: 'seed', default: 1 },
    offset: { type: 'point', default: [0, 0], unit: 'fraction', step: 0.01, label: 'Offset', handle: false, random: false },
    merge: { type: 'boolean', default: true, label: 'Merge cells', animatable: false, random: false },
  },
  apply(geo, p, ctx): Geometry {
    if (!(p.spacing >= 0.5) || !geo.shapes.length) return geo;
    const layers = geo.shapes.map((shape) => prepare(shape)).filter((layer): layer is Layer => !!layer);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    const paintAt = colorSampler(layers, p.color !== 'ink');

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const layer of layers) {
      x0 = Math.min(x0, layer.box[0]); y0 = Math.min(y0, layer.box[1]);
      x1 = Math.max(x1, layer.box[2]); y1 = Math.max(y1, layer.box[3]);
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const angle = p.angle * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
    const toGrid = (x: number, y: number): Vec2 => [cos * (x - cx) + sin * (y - cy), -sin * (x - cx) + cos * (y - cy)];
    const toScene = (x: number, y: number): Vec2 => [cx + cos * x - sin * y, cy + sin * x + cos * y];
    const corners = ([[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as Vec2[]).map(([x, y]) => toGrid(x, y));
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (const [x, y] of corners) { gx0 = Math.min(gx0, x); gy0 = Math.min(gy0, y); gx1 = Math.max(gx1, x); gy1 = Math.max(gy1, y); }

    let size = p.spacing;
    while ((Math.ceil((gx1 - gx0) / size) + 2) * (Math.ceil((gy1 - gy0) / size) + 2) > MAX_CELLS) size *= 1.2;
    const origin = toGrid(ctx.bounds.x + p.offset[0] * size, ctx.bounds.y + p.offset[1] * size);
    const i0 = Math.floor((gx0 - origin[0]) / size), i1 = Math.ceil((gx1 - origin[0]) / size);
    const j0 = Math.floor((gy0 - origin[1]) / size), j1 = Math.ceil((gy1 - origin[1]) / size);
    const cols = i1 - i0 + 1, rows = j1 - j0 + 1;
    const samples: ({ tone: number; style: Style } | null)[] = new Array(cols * rows).fill(null);
    const adjusted = (raw: number) => {
      const tone = p.invert ? 1 - raw : raw;
      return Math.max(0, Math.min(1, Math.pow(tone, p.gamma) + 0.5 - p.threshold));
    };
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const i = i0 + col, j = j0 + row;
      const point = toScene(origin[0] + (i + 0.5) * size, origin[1] + (j + 0.5) * size);
      const hit = paintAt(point);
      if (hit) samples[row * cols + col] = { tone: adjusted(darkness(hit.rgba)), style: hit.style };
    }

    const bits = new Uint8Array(cols * rows);
    if (p.algorithm === 'floyd-steinberg' || p.algorithm === 'atkinson') {
      diffuse(samples, bits, cols, rows, p.algorithm);
    } else {
      const matrixSize = Math.max(2, Math.min(16, Number(p.matrix) || 4));
      for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
        const index = row * cols + col, sample = samples[index];
        if (!sample) continue;
        const i = i0 + col, j = j0 + row;
        const threshold = p.algorithm === 'noise'
          ? rnd(p.seed, i, j, 0)
          : (bayerRank(i, j, matrixSize) + 0.5) / (matrixSize * matrixSize);
        bits[index] = sample.tone > threshold ? 1 : 0;
      }
    }

    const regions = mergeRegions(bits, samples, cols, rows, p.color === 'ink' ? p.ink : undefined);
    const shapes: Shape[] = [];
    const merged = new Map<string, Shape>();
    for (const region of regions) {
      const subpath = cellPath(
        origin[0] + (i0 + region.x) * size,
        origin[1] + (j0 + region.y) * size,
        region.width * size,
        region.height * size,
        cos, sin, cx, cy,
      );
      if (p.merge) {
        let shape = merged.get(region.key);
        if (!shape) { shape = { style: region.style, subpaths: [], clone: merged.size }; merged.set(region.key, shape); }
        shape.subpaths.push(subpath);
      } else shapes.push({ style: region.style, subpaths: [subpath], clone: shapes.length });
    }
    return { viewBox: geo.viewBox, shapes: p.merge ? [...merged.values()] : shapes };
  },
});

function bayerRank(x: number, y: number, size: number): number {
  let rank = 0;
  for (let bit = Math.log2(size) - 1; bit >= 0; bit--) {
    const quadrant = ((y >> bit) & 1) * 2 + ((x >> bit) & 1);
    rank = rank * 4 + [0, 2, 3, 1][quadrant]!;
  }
  return rank;
}

function diffuse(samples: ({ tone: number; style: Style } | null)[], bits: Uint8Array, cols: number, rows: number, algorithm: string): void {
  const values = Float32Array.from(samples, (sample) => sample?.tone ?? 0);
  const taps = algorithm === 'atkinson'
    ? [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]]
    : [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const index = y * cols + x;
    if (!samples[index]) continue;
    const value = Math.max(0, Math.min(1, values[index]!));
    const quantized = value >= 0.5 ? 1 : 0;
    bits[index] = quantized;
    const error = value - quantized;
    for (const [dx, dy, weight] of taps) {
      const nx = x + dx!, ny = y + dy!;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows) values[ny * cols + nx]! += error * weight!;
    }
  }
}

interface Region { key: string; style: Style; x: number; y: number; width: number; height: number }

/** Collapse identical horizontal runs into rectangles, extending matching runs across rows. */
function mergeRegions(bits: Uint8Array, samples: ({ tone: number; style: Style } | null)[], cols: number, rows: number, ink?: string): Region[] {
  const active = new Map<string, Region>();
  const regions: Region[] = [];
  const styleFor = (sample: { style: Style }): Style => {
    const style: Style = { fill: ink ?? sample.style.fill ?? '#111111', stroke: 'none' };
    if (!ink && sample.style.opacity) style.opacity = sample.style.opacity;
    return style;
  };
  for (let y = 0; y < rows; y++) {
    const present = new Set<string>();
    let x = 0;
    while (x < cols) {
      const index = y * cols + x, sample = samples[index];
      if (!bits[index] || !sample) { x++; continue; }
      const style = styleFor(sample);
      const key = JSON.stringify(style);
      const start = x++;
      while (x < cols) {
        const next = y * cols + x, nextSample = samples[next];
        if (!bits[next] || !nextSample) break;
        if (JSON.stringify(styleFor(nextSample)) !== key) break;
        x++;
      }
      const id = `${start}:${x}:${key}`;
      present.add(id);
      const region = active.get(id);
      if (region) region.height++;
      else active.set(id, { key, style, x: start, y, width: x - start, height: 1 });
    }
    for (const [id, region] of active) {
      if (present.has(id)) continue;
      regions.push(region);
      active.delete(id);
    }
  }
  regions.push(...active.values());
  return regions;
}

function cellPath(x: number, y: number, width: number, height: number, cos: number, sin: number, cx: number, cy: number): SubPath {
  const point = (px: number, py: number): Vec2 => [cx + cos * px - sin * py, cy + sin * px + cos * py];
  const a = point(x, y), b = point(x + width, y), c = point(x + width, y + height), d = point(x, y + height);
  return { start: a, segs: [line(a, b), line(b, c), line(c, d), line(d, a)], closed: true };
}
