import { bounds, flatten, insidePolygons, mapPoints, type Geometry, type Shape, type Style, type Vec2 } from '../geometry';
import { pointAt, polylines } from '../paths';
import { rng } from '../random';
import { defineModifier, deg } from '../modifier';

/**
 * Duplicates the drawing: in a grid, a circle or a line.
 * The copies spread around the original and the viewBox grows to fit them.
 * In `object` mode, on another object: along its outline, on its vertices or inside it (random, with a seed).
 */
export const clone = defineModifier({
  type: 'clone',
  label: 'Clone',
  kind: 'generator',
  reframe: true,
  params: {
    mode: { type: 'enum', default: 'grid', options: ['grid', 'radial', 'linear', 'object'] as const, animatable: false },
    count: { type: 'number', default: 6, min: 1, max: 256, step: 1, label: 'Count', ramp: false, random: [3, 16], showIf: { mode: ['radial', 'linear', 'object'] } },
    columns: { type: 'number', default: 3, min: 1, max: 256, step: 1, group: 'Grid', ramp: false, sliderCurve: 'quadratic', pair: 'rows', random: [2, 8] },
    rows: { type: 'number', default: 3, min: 1, max: 256, step: 1, group: 'Grid', ramp: false, sliderCurve: 'quadratic', random: [2, 8] },
    spacing: { type: 'point', default: [1.1, 1.1], unit: 'fraction', group: 'Grid', label: 'Spacing', handle: false, linkable: true, showIf: { packLarge: ['off'] } },
    packLarge: { type: 'enum', default: 'off', options: ['off', '2x2'] as const, group: 'Grid', label: 'Pack large copies', animatable: false },
    largeRatio: { type: 'number', default: 0.16, min: 0, max: 0.5, step: 0.01, group: 'Grid', label: 'Big / normal', ramp: false, showIf: { packLarge: ['2x2'] } },
    gridSeed: { type: 'seed', default: 1, group: 'Grid', label: 'Seed', showIf: { packLarge: ['2x2'] } },
    gap: { type: 'number', default: 12, min: 0, max: 500, step: 1, unit: 'px', group: 'Grid', label: 'Gap', showIf: { packLarge: ['2x2'] } },
    // Partial grids: keep a share of the cells, at random or growing from one side (a skyline).
    fill: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, group: 'Grid', label: 'Fill', ramp: false, random: [0.4, 0.9] },
    fillDirection: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, group: 'Grid', label: 'Fill direction', ramp: false, random: [0, 1] },
    fillAngle: { type: 'angle', default: 90, group: 'Grid', label: 'Fill angle', ramp: false, random: false },
    fillSeed: { type: 'seed', default: 1, group: 'Grid', label: 'Fill seed' },
    radius: { type: 'number', default: 1, min: 0, max: 5, step: 0.01, unit: 'fraction', group: 'Radial', ramp: false },
    rings: { type: 'number', default: 1, min: 1, max: 64, step: 1, group: 'Radial', label: 'Rings', ramp: false, sliderCurve: 'quadratic' },
    ringSpacing: { type: 'number', default: 1.1, min: 0, max: 5, step: 0.01, unit: 'fraction', group: 'Radial', label: 'Ring spacing', ramp: false },
    align: { type: 'boolean', default: true, label: 'Align' },
    startAngle: { type: 'angle', default: 0, group: 'Radial', label: 'Start' },
    offset: { type: 'point', default: [1.1, 0], unit: 'fraction', group: 'Linear', label: 'Offset', handle: false },
    scaleStep: { type: 'number', default: 1, min: 0, max: 2, step: 0.01, group: 'Linear', label: 'Scale step' },
    rotateStep: { type: 'angle', default: 0, group: 'Linear', label: 'Rotate step' },
    even: { type: 'boolean', default: false, group: 'Linear', label: 'Even gaps', animatable: false },
    target: { type: 'node', default: '', group: 'Object', label: 'Object' },
    place: { type: 'enum', default: 'contour', options: ['contour', 'vertices', 'inside'] as const, group: 'Object', label: 'Place', animatable: false },
    seed: { type: 'seed', default: 1, group: 'Object' },
    // Per-copy variation, for every mode: fixed (not animated) random values from their own seed.
    jitter: { type: 'point', default: [0, 0], unit: 'fraction', group: 'Variation', label: 'Position jitter', handle: false, linkable: true },
    scaleMin: { type: 'number', default: 1, min: 0.05, max: 4, step: 0.01, group: 'Variation', label: 'Scale min', ramp: false, neutral: 1, random: [0.5, 1] },
    scaleMax: { type: 'number', default: 1, min: 0.05, max: 4, step: 0.01, group: 'Variation', label: 'Scale max', ramp: false, neutral: 1, random: [1, 1.8] },
    rotateJitter: { type: 'angle', default: 0, group: 'Variation', label: 'Rotation jitter', ramp: false, random: false },
    randomColor: { type: 'boolean', default: false, group: 'Variation', label: 'Random colour', animatable: false },
    colors: { type: 'palette', default: ['#26262a', '#d8344f', '#4458d8', '#f0b82e', '#e0608e'], group: 'Variation', label: 'Colours', animatable: false, showIf: { randomColor: ['true'] } },
    variationSeed: { type: 'seed', default: 1, group: 'Variation', label: 'Variation seed' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const W = ctx.bounds.width;
    const H = ctx.bounds.height;
    const size = Math.max(W, H);

    // Each copy: offset, rotation and scale around the centre of the drawing.
    const copies: Copy[] = [];
    if (p.mode === 'grid') {
      const cols = Math.max(1, Math.round(p.columns));
      const rows = Math.max(1, Math.round(p.rows));
      if (p.packLarge === '2x2') {
        // Shuffle candidate cells so large tiles are spread through the grid, then reserve
        // their 2×2 footprint before placing another copy. Unreserved cells become normal tiles.
        const rand = rng(p.gridSeed);
        const cells = Array.from({ length: cols * rows }, (_, i) => [i % cols, Math.floor(i / cols)] as const);
        for (let i = cells.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [cells[i], cells[j]] = [cells[j]!, cells[i]!];
        }
        const occupied = new Set<string>();
        const has = (c: number, r: number) => occupied.has(`${c},${r}`);
        const add = (c: number, r: number, scale: number, cellWidth = 1, cellHeight = 1) => {
          const gx = c + (cellWidth - 1) / 2;
          const gy = r + (cellHeight - 1) / 2;
          // A copy spanning several cells also covers the gaps between them, so every gap stays the same width:
          // 2 cells across are 2·W + gap wide (not 2·W).
          const sx = (cellWidth * W + (cellWidth - 1) * p.gap) / (W || 1);
          const sy = (cellHeight * H + (cellHeight - 1) * p.gap) / (H || 1);
          copies.push({ dx: (gx - (cols - 1) / 2) * (W + p.gap), dy: (gy - (rows - 1) / 2) * (H + p.gap), rot: 0, scale: sx, sy, cells: cellWidth * cellHeight });
        };
        const targetLarge = Math.round((cols * rows * p.largeRatio) / (1 + 3 * p.largeRatio));
        let largeCount = 0;
        for (const [c, r] of cells) {
          if (has(c, r)) continue;
          const canFitLarge = c + 1 < cols && r + 1 < rows && !has(c + 1, r) && !has(c, r + 1) && !has(c + 1, r + 1);
          if (canFitLarge && largeCount < targetLarge) {
            occupied.add(`${c},${r}`); occupied.add(`${c + 1},${r}`);
            occupied.add(`${c},${r + 1}`); occupied.add(`${c + 1},${r + 1}`);
            add(c, r, 2, 2, 2);
            largeCount++;
          } else {
            occupied.add(`${c},${r}`);
            add(c, r, 1);
          }
        }
      } else {
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          copies.push({ dx: (c - (cols - 1) / 2) * p.spacing[0] * W, dy: (r - (rows - 1) / 2) * p.spacing[1] * H, rot: 0, scale: 1 });
        }
      }
      if (p.fill < 1) fillGrid(copies, p.fill, p.fillDirection, p.fillAngle, p.fillSeed);
    } else if (p.mode === 'radial') {
      const n = Math.max(1, Math.round(p.count));
      const rings = Math.max(1, Math.min(64, Math.round(p.rings)));
      const gap = Math.max(0, p.ringSpacing) * size;
      for (let ring = 0; ring < rings; ring++) {
        const R = Math.max(0, p.radius) * size + ring * gap;
        for (let i = 0; i < n; i++) {
          const a = deg(p.startAngle) + (i / n) * Math.PI * 2;
          copies.push({ dx: Math.cos(a) * R, dy: Math.sin(a) * R, rot: p.align ? a + Math.PI / 2 : 0, scale: 1 });
        }
      }
    } else if (p.mode === 'object') {
      const target = p.target ? ctx.target?.(p.target) : null;
      if (!target) return geo;
      const n = Math.max(1, Math.round(p.count));
      // The copies are centred on each point (the drawing's centre goes to the point).
      const at = (q: Vec2, rot = 0) => copies.push({ dx: q[0] - cx, dy: q[1] - cy, rot, scale: 1 });
      if (p.place === 'vertices') {
        for (const s of target.shapes) for (const sp of s.subpaths) {
          at(sp.start);
          // In closed paths the last vertex repeats the first.
          sp.segs.forEach((g, i) => (!sp.closed || i < sp.segs.length - 1) && at(g.p));
        }
      } else if (p.place === 'inside') {
        const polys = target.shapes.flatMap((s) => s.subpaths.filter((sp) => sp.closed).map((sp) => flatten(sp, 8)));
        const tb = bounds(target);
        const rand = rng(p.seed);
        for (let tries = 0; copies.length < n && tries < n * 200; tries++) {
          const q: Vec2 = [tb.x + rand() * tb.width, tb.y + rand() * tb.height];
          if (insidePolygons(polys, q)) at(q);
        }
      } else {
        // Outline: spread at equal distances along all its paths, as if they were one.
        const lines = polylines(target);
        const total = lines.reduce((sum, l) => sum + l.length, 0);
        const open = lines.length === 1 && !lines[0]!.closed;
        const gap = total / Math.max(1, open ? n - 1 : n);
        for (let i = 0; i < n; i++) {
          let d = i * gap;
          const l = lines.find((x) => (d <= x.length ? true : ((d -= x.length), false))) ?? lines[lines.length - 1]!;
          const { p: q, t } = pointAt(l, Math.min(d, l.length));
          at(q, p.align ? Math.atan2(t[1], t[0]) : 0);
        }
      }
    } else {
      const n = Math.max(1, Math.round(p.count));
      const ox = p.offset[0] * W, oy = p.offset[1] * H;
      const d = Math.hypot(ox, oy);
      if (p.even && d > 0 && n > 1) {
        // Equal gaps between copies of different sizes: each step is the gap (the scale-1 one)
        // plus half a copy on each side, at its scale. Then the whole set is centred.
        const [ux, uy] = [ox / d, oy / d];
        const extent = Math.abs(ux) * b.width + Math.abs(uy) * b.height;
        const gap = d - extent;
        const scales = Array.from({ length: n }, (_, i) => Math.pow(p.scaleStep, i));
        const pos = [0];
        for (let i = 1; i < n; i++) pos.push(pos[i - 1]! + gap + (extent * (scales[i - 1]! + scales[i]!)) / 2);
        const mid = (pos[0]! + pos[n - 1]!) / 2;
        for (let i = 0; i < n; i++) copies.push({ dx: ux * (pos[i]! - mid), dy: uy * (pos[i]! - mid), rot: deg(p.rotateStep) * i, scale: scales[i]! });
      } else {
        for (let i = 0; i < n; i++) {
          const t = i - (n - 1) / 2;
          copies.push({ dx: t * ox, dy: t * oy, rot: deg(p.rotateStep) * i, scale: Math.pow(p.scaleStep, i) });
        }
      }
    }

    // Variation: five numbers per copy in a fixed order, so toggling one control does not reshuffle the others.
    const vary = rng(p.variationSeed);
    const lo = Math.min(p.scaleMin, p.scaleMax), hi = Math.max(p.scaleMin, p.scaleMax);
    const palette = p.randomColor ? p.colors.filter((c) => /^#[0-9a-f]{6}$/i.test(c)) : [];
    const colorOf: (string | undefined)[] = [];
    for (const k of copies) {
      const [jx, jy, s, r, c] = [vary(), vary(), vary(), vary(), vary()];
      k.dx += (jx * 2 - 1) * p.jitter[0] * W;
      k.dy += (jy * 2 - 1) * p.jitter[1] * H;
      const f = lo + (hi - lo) * s;
      k.scale *= f;
      if (k.sy !== undefined) k.sy *= f;
      k.rot += (r * 2 - 1) * deg(p.rotateJitter);
      colorOf.push(palette.length ? palette[Math.min(palette.length - 1, Math.floor(c * palette.length))] : undefined);
    }

    const shapes: Shape[] = [];
    for (const [index, k] of copies.entries()) {
      const c = Math.cos(k.rot);
      const s = Math.sin(k.rot);
      const sx = k.scale, sy = k.sy ?? k.scale;
      const moved = mapPoints(geo, ([x, y]) => {
        const ux = (x - cx) * sx;
        const uy = (y - cy) * sy;
        return [cx + ux * c - uy * s + k.dx, cy + ux * s + uy * c + k.dy];
      });
      const color = colorOf[index];
      shapes.push(...moved.shapes.map((s) => ({ ...s, clone: index, ...(color ? { style: recolor(s.style, color) } : {}) })));
    }

    const out: Geometry = { viewBox: geo.viewBox, shapes };
    return { ...out, viewBox: fitViewBox(geo.viewBox, bounds(out)) };
  },
});

/** The same style with its painted fill and stroke (not `none`, not a gradient) in `color`. */
function recolor(style: Style, color: string): Style {
  const out = { ...style };
  for (const key of ['fill', 'stroke'] as const) {
    const v = out[key];
    if (v && v !== 'none' && !v.startsWith('url(')) out[key] = color;
  }
  return out;
}

/** A copy: its offset, rotation and scale around the drawing's centre (`sy`: a different vertical scale; `cells`: grid cells it covers). */
interface Copy { dx: number; dy: number; rot: number; scale: number; sy?: number; cells?: number }

/** Grows the viewBox just enough to fit everything, with a 5 % margin. */
export function fitViewBox([x, y, w, h]: [number, number, number, number], b: { x: number; y: number; width: number; height: number }): [number, number, number, number] {
  const m = Math.max(b.width, b.height) * 0.05;
  const x0 = Math.min(x, b.x - m);
  const y0 = Math.min(y, b.y - m);
  const x1 = Math.max(x + w, b.x + b.width + m);
  const y1 = Math.max(y + h, b.y + b.height + m);
  if (x0 === x && y0 === y && x1 === x + w && y1 === y + h) return [x, y, w, h];
  const r = (n: number) => Math.round(n * 100) / 100;
  return [r(x0), r(y0), r(x1 - x0), r(y1 - y0)];
}

/**
 * Keeps a share (`fill`, by area: a 2×2 copy counts as four cells) of a grid's copies. Each copy gets a key: how
 * far it lies towards `angle` (screen degrees, clockwise; 90 is down, so the grid fills from the bottom),
 * weighted by `direction`, plus a seeded random part. At direction 0 the holes are random; towards 1 the grid
 * grows from that side with a ragged edge (some randomness always stays, so the edge is never a straight cut).
 * Copies keep their order, so per-element effects still number them consistently.
 */
function fillGrid(copies: Copy[], fill: number, direction: number, angle: number, seed: number) {
  if (!copies.length) return;
  const rand = rng(seed);
  const a = (angle * Math.PI) / 180;
  const proj = copies.map((c) => c.dx * Math.cos(a) + c.dy * Math.sin(a));
  const lo = Math.min(...proj), span = Math.max(...proj) - lo || 1;
  const d = Math.max(0, Math.min(1, direction));
  const keyed = copies.map((c, i) => ({ i, key: d * ((proj[i]! - lo) / span) + (1 - d * 0.75) * rand(), area: c.cells ?? c.scale * c.scale }));
  const total = keyed.reduce((sum, k) => sum + k.area, 0);
  const want = Math.max(0, Math.min(1, fill)) * total;
  const keep = new Set<number>();
  let area = 0;
  for (const k of [...keyed].sort((x, y) => y.key - x.key)) {
    if (area >= want - 1e-9) break;
    keep.add(k.i);
    area += k.area;
  }
  const kept = copies.filter((_, i) => keep.has(i));
  copies.length = 0;
  copies.push(...kept);
}
