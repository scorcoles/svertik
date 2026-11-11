import { flatten, line, type Gradient, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Pixelate: the whole drawing made of little squares, like pixel art. A grid of `size` px cells; each
 * cell takes the colour of what is below its centre (the topmost object: its stroke if it passes there,
 * otherwise its fill). Runs of pixels of the same colour are merged into one path (it weighs little).
 * `gap`: space between pixels (an LED-screen look); `shape`: squares or round dots.
 * Vector: sharp at any size. A gradient counts as its first colour; filters aren't read.
 * With `size` at 0, the drawing stays as it was (animate from large to 0: from pixelated to sharp).
 */
export const pixelate = defineModifier({
  type: 'pixelate',
  label: 'Pixelate',
  kind: 'generator',
  params: {
    size: { type: 'number', default: 8, min: 0, max: 200, step: 0.5, unit: 'px', label: 'Size', random: [3, 24] },
    gap: { type: 'number', default: 0, min: 0, max: 50, step: 0.5, unit: 'px', label: 'Gap', random: [0, 3] },
    shape: { type: 'enum', default: 'square', options: ['square', 'dot'] as const, label: 'Shape', animatable: false },
    offset: { type: 'point', default: [0, 0], unit: 'fraction', step: 0.01, label: 'Offset', handle: false, random: false },
  },
  apply(geo, p, ctx) {
    if (!(p.size >= 0.5) || !geo.shapes.length) return geo;
    // Each shape, ready to answer "does it cover this point?": its polygons (fill) and its segments (stroke).
    const layers = geo.shapes.map((s) => prepare(s)).filter((l): l is Layer => !!l);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of layers) (x0 = Math.min(x0, l.box[0])), (y0 = Math.min(y0, l.box[1])), (x1 = Math.max(x1, l.box[2])), (y1 = Math.max(y1, l.box[3]));
    // Cell cap: with very small pixels on a large drawing, they grow (so it doesn't hang).
    let size = p.size;
    while (((x1 - x0) / size) * ((y1 - y0) / size) > 60000) size *= 1.25;
    // The grid starts at the source's corner (it doesn't move when the drawing changes), shifted `offset` cells.
    const ox = ctx.bounds.x + (p.offset[0] % 1) * size, oy = ctx.bounds.y + (p.offset[1] % 1) * size;
    const i0 = Math.floor((x0 - ox) / size), i1 = Math.ceil((x1 - ox) / size);
    const j0 = Math.floor((y0 - oy) / size), j1 = Math.ceil((y1 - oy) / size);
    const gap = Math.max(0, Math.min(p.gap, size * 0.9));
    const dot = p.shape === 'dot';
    // By colour (with its opacity), the runs of pixels in each row.
    const groups = new Map<string, { style: Style; subpaths: SubPath[] }>();
    for (let j = j0; j < j1; j++) {
      const cy = oy + (j + 0.5) * size;
      let run: { key: string; style: Style; from: number } | null = null;
      const flush = (to: number) => {
        if (!run) return;
        let g = groups.get(run.key);
        if (!g) groups.set(run.key, (g = { style: run.style, subpaths: [] }));
        const y = oy + j * size + gap / 2, h = size - gap;
        if (dot || gap > 0) {
          // Separate: each pixel its own.
          for (let i = run.from; i < to; i++) g.subpaths.push(dot ? circle(ox + (i + 0.5) * size, cy, h / 2) : rect(ox + i * size + gap / 2, y, size - gap, h));
        } else g.subpaths.push(rect(ox + run.from * size, y, (to - run.from) * size, h));
        run = null;
      };
      for (let i = i0; i < i1; i++) {
        const hit = colorAt(layers, [ox + (i + 0.5) * size, cy]);
        if (!hit) {
          flush(i);
          continue;
        }
        if (run && run.key !== hit.key) flush(i);
        if (!run) run = { key: hit.key, style: hit.style, from: i };
      }
      flush(i1);
    }
    const shapes: Shape[] = [...groups.values()].map((g, n) => ({ style: g.style, subpaths: g.subpaths, clone: n }));
    return { viewBox: geo.viewBox, shapes };
  },
});

interface Layer {
  box: [number, number, number, number];
  polys: Vec2[][];
  evenodd: boolean;
  fill: { key: string; style: Style } | null;
  stroke: { key: string; style: Style; half: number } | null;
  lines: Vec2[][];
}

/** A paint's colour: its own or, for a gradient, its first stop's. */
function paint(value: string | undefined, gradients: Gradient[] | undefined): string | null {
  if (!value || value === 'none' || value === 'transparent') return null;
  const m = /^url\(#([^)]+)\)$/.exec(value.trim());
  if (m) return gradients?.find((g) => g.id === m[1])?.stops[0]?.color ?? null;
  return value;
}

function prepare(s: Shape): Layer | null {
  const st = s.style;
  const fillColor = paint(st.fill ?? '#000000', s.gradients);
  const strokeColor = paint(st.stroke, s.gradients);
  const width = Number(st['stroke-width'] ?? 1);
  const pixel = (color: string, op: number): { key: string; style: Style } => {
    const o = Number(st.opacity ?? 1) * op;
    const style: Style = { fill: color, stroke: 'none' };
    if (o < 1) style.opacity = String(o);
    if (st['mix-blend-mode']) style['mix-blend-mode'] = st['mix-blend-mode'];
    return { key: JSON.stringify(style), style };
  };
  const closed = s.subpaths.filter((sp) => sp.closed);
  const polys = fillColor ? closed.map((sp) => flatten(sp, 8)) : [];
  const lines = strokeColor && width > 0 ? s.subpaths.map((sp) => { const pts = flatten(sp, 8); if (sp.closed) pts.push(sp.start); return pts; }) : [];
  if (!polys.length && !lines.length) return null;
  const half = lines.length ? width / 2 : 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of [...polys, ...lines]) for (const q of r) (x0 = Math.min(x0, q[0])), (y0 = Math.min(y0, q[1])), (x1 = Math.max(x1, q[0])), (y1 = Math.max(y1, q[1]));
  return {
    box: [x0 - half, y0 - half, x1 + half, y1 + half],
    polys,
    evenodd: st['fill-rule'] === 'evenodd',
    fill: fillColor && polys.length ? pixel(fillColor, Number(st['fill-opacity'] ?? 1)) : null,
    stroke: lines.length ? { ...pixel(strokeColor!, Number(st['stroke-opacity'] ?? 1)), half } : null,
    lines,
  };
}

/** What is visible at the point: top down, the stroke or fill of the first shape covering it. */
function colorAt(layers: Layer[], q: Vec2): { key: string; style: Style } | null {
  for (let n = layers.length - 1; n >= 0; n--) {
    const l = layers[n]!;
    if (q[0] < l.box[0] || q[0] > l.box[2] || q[1] < l.box[1] || q[1] > l.box[3]) continue;
    if (l.stroke && nearLines(l.lines, q, l.stroke.half)) return l.stroke;
    if (l.fill && insideFill(l.polys, q, l.evenodd)) return l.fill;
  }
  return null;
}

function nearLines(lines: Vec2[][], [x, y]: Vec2, half: number): boolean {
  const h2 = half * half;
  for (const pts of lines) {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
      const ex = bx - ax, ey = by - ay;
      const len2 = ex * ex + ey * ey;
      const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
      if ((x - ax - t * ex) ** 2 + (y - ay - t * ey) ** 2 <= h2) return true;
    }
  }
  return false;
}

/** Inside the fill: even-odd or, by default (nonzero), by the winding number. */
function insideFill(polys: Vec2[][], [x, y]: Vec2, evenodd: boolean): boolean {
  let wind = 0, odd = false;
  for (const r of polys) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
      if (yj <= y !== yi <= y && x < xj + ((y - yj) * (xi - xj)) / (yi - yj)) {
        odd = !odd;
        wind += yi > yj ? 1 : -1;
      }
    }
  }
  return evenodd ? odd : wind !== 0;
}

const rect = (x: number, y: number, w: number, h: number): SubPath => {
  const a: Vec2 = [x, y], b: Vec2 = [x + w, y], c: Vec2 = [x + w, y + h], d: Vec2 = [x, y + h];
  return { start: a, segs: [line(a, b), line(b, c), line(c, d), line(d, a)], closed: true };
};

/** A circle with four cubics. */
function circle(cx: number, cy: number, r: number): SubPath {
  const k = 0.5523 * r;
  const P = (x: number, y: number): Vec2 => [cx + x, cy + y];
  return {
    start: P(r, 0),
    segs: [
      { c1: P(r, k), c2: P(k, r), p: P(0, r) },
      { c1: P(-k, r), c2: P(-r, k), p: P(-r, 0) },
      { c1: P(-r, -k), c2: P(-k, -r), p: P(0, -r) },
      { c1: P(k, -r), c2: P(r, -k), p: P(r, 0) },
    ],
    closed: true,
  };
}
