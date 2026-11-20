import { line, type Geometry, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { colorSampler, darkness, prepare, type Layer } from './halftone';

const MAX_STEPS = 400_000;

/** Tone isolines sampled from the input drawing and emitted as editable vector paths. */
export const contour = defineModifier({
  type: 'contour',
  label: 'Contour',
  kind: 'generator',
  params: {
    spacing: { type: 'number', default: 6, min: 1, max: 100, step: 0.5, unit: 'px', label: 'Sample spacing', random: [3, 12] },
    levels: { type: 'number', default: 6, min: 1, max: 16, step: 1, label: 'Levels', random: [3, 10] },
    width: { type: 'number', default: 1, min: 0.1, max: 20, step: 0.1, unit: 'px', label: 'Line width', random: [0.5, 2] },
    gamma: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Gamma', random: [0.7, 1.6] },
    color: { type: 'enum', default: 'ink', options: ['ink', 'original'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#111111', label: 'Ink', showIf: { color: ['ink'] } },
    invert: { type: 'boolean', default: false, label: 'Invert' },
    merge: { type: 'boolean', default: true, label: 'Merge contours', animatable: false, random: false },
  },
  apply(geo, p, ctx): Geometry {
    if (!(p.spacing >= 0.5) || !(p.width > 0) || !geo.shapes.length) return geo;
    const layers = geo.shapes.map((shape) => prepare(shape)).filter((layer): layer is Layer => !!layer);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    const paintAt = colorSampler(layers, p.color !== 'ink');
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const layer of layers) {
      x0 = Math.min(x0, layer.box[0]); y0 = Math.min(y0, layer.box[1]);
      x1 = Math.max(x1, layer.box[2]); y1 = Math.max(y1, layer.box[3]);
    }
    const levels = Math.max(1, Math.min(16, Math.round(p.levels)));
    let spacing = p.spacing;
    let col0 = 0, col1 = 0, row0 = 0, row1 = 0, cols = 0, rows = 0;
    const grid = () => {
      col0 = Math.floor((x0 - ctx.bounds.x) / spacing) - 1;
      col1 = Math.ceil((x1 - ctx.bounds.x) / spacing) + 1;
      row0 = Math.floor((y0 - ctx.bounds.y) / spacing) - 1;
      row1 = Math.ceil((y1 - ctx.bounds.y) / spacing) + 1;
      cols = col1 - col0 + 1;
      rows = row1 - row0 + 1;
    };
    grid();
    while ((cols - 1) * (rows - 1) * levels > MAX_STEPS) { spacing *= 1.2; grid(); }

    const tones = new Float32Array(cols * rows);
    const valid = new Uint8Array(cols * rows);
    let minTone = Infinity, maxTone = -Infinity;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const x = ctx.bounds.x + (col0 + col) * spacing;
      const y = ctx.bounds.y + (row0 + row) * spacing;
      const hit = paintAt([x, y]);
      if (!hit) continue; // Keep transparent space open; contours should end at the drawing silhouette.
      let value = darkness(hit.rgba);
      if (p.invert) value = 1 - value;
      value = Math.max(0, Math.min(1, Math.pow(value, p.gamma)));
      const index = row * cols + col;
      valid[index] = 1;
      tones[index] = value;
      minTone = Math.min(minTone, value);
      maxTone = Math.max(maxTone, value);
    }
    if (!Number.isFinite(minTone) || maxTone - minTone < 1e-5) return { viewBox: geo.viewBox, shapes: [] };

    const output: Shape[] = [];
    const byStyle = new Map<string, Shape>();
    for (let levelIndex = 0; levelIndex < levels; levelIndex++) {
      const threshold = minTone + (levelIndex + 1) / (levels + 1) * (maxTone - minTone);
      const paths = isolate(tones, valid, cols, rows, spacing, col0, row0, ctx.bounds.x, ctx.bounds.y, threshold);
      for (const path of paths) {
        const middle = path.segs[Math.floor(path.segs.length / 2)]?.p ?? path.start;
        const sample = p.color === 'original' ? paintAt(middle) : null;
        const color = p.color === 'original' ? sample?.style.fill ?? p.ink : p.ink;
        const style: Style = { fill: 'none', stroke: color, 'stroke-width': String(p.width) };
        if (sample?.style.opacity) style.opacity = sample.style.opacity;
        if (sample?.style['mix-blend-mode']) style['mix-blend-mode'] = sample.style['mix-blend-mode'];
        if (p.merge) {
          const key = JSON.stringify(style);
          let shape = byStyle.get(key);
          if (!shape) { shape = { style, subpaths: [], clone: byStyle.size }; byStyle.set(key, shape); }
          shape.subpaths.push(path);
        } else output.push({ style, subpaths: [path], clone: output.length });
      }
    }
    return { viewBox: geo.viewBox, shapes: p.merge ? [...byStyle.values()] : output };
  },
});

type SegmentPair = readonly [number, number];

function isolate(tones: Float32Array, valid: Uint8Array, cols: number, rows: number, spacing: number, col0: number, row0: number, ox: number, oy: number, level: number): SubPath[] {
  const points = new Map<string, Vec2>();
  const links = new Map<string, string[]>();
  const value = (x: number, y: number) => tones[y * cols + x]!;
  const vertex = (edge: number, x: number, y: number, tl: number, tr: number, br: number, bl: number): string => {
    let a: number, b: number, key: string;
    if (edge === 0) { a = tl; b = tr; key = `h:${y}:${x}`; }
    else if (edge === 1) { a = tr; b = br; key = `v:${y}:${x + 1}`; }
    else if (edge === 2) { a = bl; b = br; key = `h:${y + 1}:${x}`; }
    else { a = tl; b = bl; key = `v:${y}:${x}`; }
    if (!points.has(key)) {
      const t = a === b ? 0.5 : Math.max(0, Math.min(1, (level - a) / (b - a)));
      const px = edge === 1 ? x + 1 : edge === 3 ? x : x + t;
      const py = edge === 0 ? y : edge === 2 ? y + 1 : y + t;
      points.set(key, [ox + (col0 + px) * spacing, oy + (row0 + py) * spacing]);
    }
    return key;
  };
  const add = (a: string, b: string) => {
    if (a === b) return;
    (links.get(a) ?? (links.set(a, []), links.get(a)!)).push(b);
    (links.get(b) ?? (links.set(b, []), links.get(b)!)).push(a);
  };

  for (let y = 0; y < rows - 1; y++) for (let x = 0; x < cols - 1; x++) {
    if (!valid[y * cols + x] || !valid[y * cols + x + 1] || !valid[(y + 1) * cols + x + 1] || !valid[(y + 1) * cols + x]) continue;
    const tl = value(x, y), tr = value(x + 1, y), br = value(x + 1, y + 1), bl = value(x, y + 1);
    const code = Number(tl >= level) | (Number(tr >= level) << 1) | (Number(br >= level) << 2) | (Number(bl >= level) << 3);
    if (code === 0 || code === 15) continue;
    let pairs: SegmentPair[];
    const centerHigh = (tl + tr + br + bl) / 4 >= level;
    switch (code) {
      case 1: pairs = [[3, 0]]; break;
      case 2: pairs = [[0, 1]]; break;
      case 3: pairs = [[3, 1]]; break;
      case 4: pairs = [[1, 2]]; break;
      case 5: pairs = centerHigh ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]]; break;
      case 6: pairs = [[0, 2]]; break;
      case 7: pairs = [[3, 2]]; break;
      case 8: pairs = [[2, 3]]; break;
      case 9: pairs = [[0, 2]]; break;
      case 10: pairs = centerHigh ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]]; break;
      case 11: pairs = [[1, 2]]; break;
      case 12: pairs = [[1, 3]]; break;
      case 13: pairs = [[0, 1]]; break;
      default: pairs = [[3, 0]]; break;
    }
    for (const [a, b] of pairs) add(vertex(a, x, y, tl, tr, br, bl), vertex(b, x, y, tl, tr, br, bl));
  }

  const visited = new Set<string>();
  const paths: SubPath[] = [];
  const edgeKey = (a: string, b: string) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const walk = (start: string, next: string): SubPath | null => {
    const ids = [start];
    let previous = start, current = next;
    visited.add(edgeKey(previous, current));
    for (let guard = 0; guard <= links.size; guard++) {
      if (current === start) break;
      ids.push(current);
      const options = links.get(current) ?? [];
      const candidate = options.find((id) => id !== previous && !visited.has(edgeKey(current, id)));
      if (!candidate) break;
      previous = current; current = candidate; visited.add(edgeKey(previous, current));
    }
    const closed = current === start;
    if (ids.length < 2) return null;
    const coords = ids.map((id) => points.get(id)!);
    const segs = coords.slice(1).map((point, i) => line(coords[i]!, point));
    if (closed) segs.push(line(coords.at(-1)!, coords[0]!));
    return { start: coords[0]!, segs, closed };
  };
  for (const [id, neighbors] of links) if (neighbors.length !== 2) {
    for (const next of neighbors) if (!visited.has(edgeKey(id, next))) {
      const path = walk(id, next); if (path) paths.push(path);
    }
  }
  for (const [id, neighbors] of links) for (const next of neighbors) if (!visited.has(edgeKey(id, next))) {
    const path = walk(id, next); if (path) paths.push(path);
  }
  return paths;
}
