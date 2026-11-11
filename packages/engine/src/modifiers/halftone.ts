import { line, type Gradient, type Shape, type Style, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { parseColor, toHex } from '../color';

/**
 * Halftone: the drawing turned into a screen of dots (or other marks) whose size follows the tone,
 * like printed halftone. A grid of `spacing` px cells rotated `angle` degrees; each cell samples the
 * colour below its centre and places a mark sized by its darkness (light areas → small, dark → large).
 * `min`/`max`: mark size at the lightest/darkest tone (as a fraction of the cell). `shape`: the mark
 * (circle, square, diamond, line, ring). `color`: sampled from the drawing or a single ink colour.
 * `invert`: swap light and dark. `jitter`: random offset per cell (seeded). Runs of equal marks are
 * not merged (each is its own element); vector and sharp at any size.
 */
export const halftone = defineModifier({
  type: 'halftone',
  label: 'Halftone',
  kind: 'generator',
  params: {
    spacing: { type: 'number', default: 10, min: 1, max: 200, step: 0.5, unit: 'px', label: 'Spacing', random: [4, 20] },
    angle: { type: 'angle', default: 45, label: 'Angle', ramp: false, random: [0, 90] },
    min: { type: 'number', default: 0, min: 0, max: 1.5, step: 0.01, label: 'Min', random: [0, 0.2] },
    max: { type: 'number', default: 0.9, min: 0, max: 1.5, step: 0.01, label: 'Max', random: [0.5, 1] },
    gamma: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Gamma', random: [0.7, 1.6] },
    shape: { type: 'enum', default: 'circle', options: ['circle', 'square', 'diamond', 'line', 'ring'] as const, label: 'Shape', animatable: false },
    color: { type: 'enum', default: 'original', options: ['original', 'ink'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#111111', label: 'Ink', showIf: { color: ['ink'] } },
    invert: { type: 'boolean', default: false, label: 'Invert' },
    jitter: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Jitter', random: [0, 0.3] },
    seed: { type: 'seed', default: 1 },
    offset: { type: 'point', default: [0, 0], unit: 'fraction', step: 0.01, label: 'Offset', handle: false, random: false },
  },
  apply(geo, p, ctx) {
    if (!(p.spacing >= 0.5) || !geo.shapes.length) return geo;
    const layers = geo.shapes.map((s) => prepare(s)).filter((l): l is Layer => !!l);
    if (!layers.length) return { viewBox: geo.viewBox, shapes: [] };

    // Overall bounds in scene space.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const l of layers) (x0 = Math.min(x0, l.box[0])), (y0 = Math.min(y0, l.box[1])), (x1 = Math.max(x1, l.box[2])), (y1 = Math.max(y1, l.box[3]));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const w = Math.max(x1 - x0, 1), h = Math.max(y1 - y0, 1);
    const rad = ((p.angle % 180) * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    // Rotate point around bounds centre.
    const toGrid = (x: number, y: number): Vec2 => [cos * (x - cx) + sin * (y - cy), -sin * (x - cx) + cos * (y - cy)];
    const toScene = (gx: number, gy: number): Vec2 => [cx + cos * gx - sin * gy, cy + sin * gx + cos * gy];

    // Cover the rotated bounds.
    const corners: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (const [x, y] of corners) {
      const [gx, gy] = toGrid(x, y);
      gx0 = Math.min(gx0, gx); gy0 = Math.min(gy0, gy); gx1 = Math.max(gx1, gx); gy1 = Math.max(gy1, gy);
    }

    let size = p.spacing;
    while (((gx1 - gx0) / size) * ((gy1 - gy0) / size) > 60000) size *= 1.25;
    const ox = ctx.bounds.x + (p.offset[0] % 1) * size;
    const oy = ctx.bounds.y + (p.offset[1] % 1) * size;
    // Align grid origin in grid space near bounds min, shifted by offset projected.
    const offG = toGrid(ox, oy);
    const i0 = Math.floor((gx0 - offG[0]) / size), i1 = Math.ceil((gx1 - offG[0]) / size);
    const j0 = Math.floor((gy0 - offG[1]) / size), j1 = Math.ceil((gy1 - offG[1]) / size);

    const shapes: Shape[] = [];
    let n = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        let gcx = offG[0] + (i + 0.5) * size;
        let gcy = offG[1] + (j + 0.5) * size;
        if (p.jitter > 0) {
          const r1 = rnd(p.seed, i, j, 1), r2 = rnd(p.seed, i, j, 2);
          gcx += (r1 - 0.5) * 2 * p.jitter * size * 0.5;
          gcy += (r2 - 0.5) * 2 * p.jitter * size * 0.5;
        }
        const [sx, sy] = toScene(gcx, gcy);
        const hit = colorAt(layers, [sx, sy]);
        if (!hit) continue;
        const tone = darkness(hit.rgba);
        let t = p.invert ? 1 - tone : tone; // darkness -> larger mark
        t = Math.max(0, Math.min(1, Math.pow(t, p.gamma)));
        const r = (p.min + (p.max - p.min) * t) * 0.5 * size;
        if (!(r > 0.05)) continue;
        const style = p.color === 'ink' ? { fill: p.ink, stroke: 'none' } : hit.style;
        const subpaths = mark(p.shape, sx, sy, r, size, rad);
        shapes.push({ style, subpaths, clone: n++ });
      }
    }
    return { viewBox: geo.viewBox, shapes };
  },
});

interface Hit {
  style: Style;
  rgba: [number, number, number, number];
  /** Paint that produced the hit: solid colour or a gradient to sample at the point. */
  paint: { solid: string } | { grad: Gradient; bbox: [number, number, number, number] };
  opacity: number;
}
interface Layer {
  box: [number, number, number, number];
  bbox: [number, number, number, number];
  polys: Vec2[][];
  evenodd: boolean;
  fill: Hit | null;
  stroke: { hit: Hit; half: number } | null;
  lines: Vec2[][];
}

function paintOf(value: string | undefined, gradients: Gradient[] | undefined): { solid: string } | { grad: Gradient } | null {
  if (!value || value === 'none' || value === 'transparent') return null;
  const m = /^url\(#([^)]+)\)$/.exec(value.trim());
  if (m) {
    const g = gradients?.find((x) => x.id === m[1]);
    return g ? { grad: g } : null;
  }
  return { solid: value };
}

function prepare(s: Shape): Layer | null {
  const st = s.style;
  const fillPaint = paintOf(st.fill ?? '#000000', s.gradients);
  const strokePaint = paintOf(st.stroke, s.gradients);
  const width = Number(st['stroke-width'] ?? 1);
  const baseOp = Number(st.opacity ?? 1);
  const hitFor = (paint: { solid: string } | { grad: Gradient }, op: number, bbox: [number, number, number, number]): Hit => {
    const o = baseOp * op;
    const style: Style = { fill: 'solid' in paint ? paint.solid : `url(#${paint.grad.id})`, stroke: 'none' };
    // keep original gradient defs on shape output if needed? we drop gradients; for sampling original is fine. For output style we want a flat colour if solid, else keep url.
    if ('solid' in paint) style.fill = paint.solid;
    else style.fill = `url(#${paint.grad.id})`;
    if (o < 1) style.opacity = String(o);
    if (st['mix-blend-mode']) style['mix-blend-mode'] = st['mix-blend-mode'];
    const rgba0 = 'solid' in paint ? (parseColor(paint.solid) ?? [0, 0, 0, 1]) : [0, 0, 0, 1];
    const a0 = rgba0[3] ?? 1;
    return { style, rgba: [rgba0[0]!, rgba0[1]!, rgba0[2]!, a0 * o], paint: 'solid' in paint ? paint : { grad: paint.grad, bbox }, opacity: o };
  };
  const closed = s.subpaths.filter((sp) => sp.closed);
  const polys = fillPaint ? closed.map((sp) => flatten(sp, 8)) : [];
  const lines = strokePaint && width > 0 ? s.subpaths.map((sp) => { const pts = flatten(sp, 8); if (sp.closed) pts.push(sp.start); return pts; }) : [];
  if (!polys.length && !lines.length) return null;
  const half = lines.length ? width / 2 : 0;
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (const r of [...polys, ...lines]) for (const q of r) (bx0 = Math.min(bx0, q[0])), (by0 = Math.min(by0, q[1])), (bx1 = Math.max(bx1, q[0])), (by1 = Math.max(by1, q[1]));
  const bbox: [number, number, number, number] = [bx0, by0, Math.max(bx1 - bx0, 1e-6), Math.max(by1 - by0, 1e-6)];
  return {
    box: [bx0 - half, by0 - half, bx1 + half, by1 + half],
    bbox,
    polys,
    evenodd: st['fill-rule'] === 'evenodd',
    fill: fillPaint && polys.length ? hitFor(fillPaint, Number(st['fill-opacity'] ?? 1), bbox) : null,
    stroke: lines.length ? { hit: hitFor(strokePaint!, Number(st['stroke-opacity'] ?? 1), bbox), half } : null,
    lines,
  };
}

function colorAt(layers: Layer[], q: Vec2): { rgba: [number, number, number, number]; style: Style; gradients?: Gradient[] } | null {
  for (let n = layers.length - 1; n >= 0; n--) {
    const l = layers[n]!;
    if (q[0] < l.box[0] || q[0] > l.box[2] || q[1] < l.box[1] || q[1] > l.box[3]) continue;
    let hit: Hit | null = null;
    if (l.stroke && nearLines(l.lines, q, l.stroke.half)) hit = l.stroke.hit;
    else if (l.fill && insideFill(l.polys, q, l.evenodd)) hit = l.fill;
    if (!hit) continue;
    if ('grad' in hit.paint) {
      const c = sampleGradient(hit.paint.grad, q, hit.paint.bbox);
      const rgba: [number, number, number, number] = [c[0], c[1], c[2], c[3] * hit.opacity];
      const hex = toHex([rgba[0], rgba[1], rgba[2], 1]);
      const style: Style = { ...hit.style, fill: hex };
      if (rgba[3] < 1) style.opacity = String(rgba[3]);
      else delete style.opacity;
      return { rgba, style };
    }
    return { rgba: hit.rgba, style: hit.style };
  }
  return null;
}

function sampleGradient(g: Gradient, [x, y]: Vec2, [bx, by, bw, bh]: [number, number, number, number]): [number, number, number, number] {
  const u = (x - bx) / bw, v = (y - by) / bh;
  let t = 0;
  if (g.kind === 'linear') {
    const x1 = g.x1 ?? 0, y1 = g.y1 ?? 0, x2 = g.x2 ?? 1, y2 = g.y2 ?? 0;
    const dx = x2 - x1, dy = y2 - y1, den = dx * dx + dy * dy || 1;
    t = ((u - x1) * dx + (v - y1) * dy) / den;
  } else {
    const cx = g.cx ?? 0.5, cy = g.cy ?? 0.5, r = g.r ?? 0.5;
    const fx = g.fx ?? cx, fy = g.fy ?? cy;
    if (Math.abs(fx - cx) < 1e-6 && Math.abs(fy - cy) < 1e-6) {
      t = Math.hypot(u - cx, v - cy) / (r || 1);
    } else {
      // Approximate focal-point radial: distance from focus normalized by distance to edge along ray.
      const dx = u - fx, dy = v - fy;
      const d = Math.hypot(dx, dy) || 1e-6;
      const ux = dx / d, uy = dy / d;
      // intersect ray F + s*(ux,uy) with circle |P-C|=r
      const ox = fx - cx, oy = fy - cy;
      const bq = 2 * (ox * ux + oy * uy);
      const cq = ox * ox + oy * oy - r * r;
      const disc = bq * bq - 4 * cq;
      const sEdge = disc >= 0 ? (-bq + Math.sqrt(disc)) / 2 : r;
      t = d / (Math.abs(sEdge) || 1);
    }
  }
  const spread = g.spreadMethod ?? 'pad';
  if (spread === 'pad') t = Math.max(0, Math.min(1, t));
  else if (spread === 'repeat') t = ((t % 1) + 1) % 1;
  else if (spread === 'reflect') {
    t = Math.abs(t);
    const m = t % 2;
    t = m <= 1 ? m : 2 - m;
  }
  return sampleStops(g.stops, t);
}

function sampleStops(stops: { offset: number; color: string; opacity?: number }[], t: number): [number, number, number, number] {
  if (!stops.length) return [0, 0, 0, 1];
  const s = [...stops].sort((a, b) => a.offset - b.offset);
  if (t <= s[0]!.offset) return stopRgba(s[0]!);
  if (t >= s[s.length - 1]!.offset) return stopRgba(s[s.length - 1]!);
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!, b = s[i + 1]!;
    if (t >= a.offset && t <= b.offset) {
      const tt = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset);
      const ca = stopRgba(a), cb = stopRgba(b);
      return [ca[0] + (cb[0] - ca[0]) * tt, ca[1] + (cb[1] - ca[1]) * tt, ca[2] + (cb[2] - ca[2]) * tt, ca[3] + (cb[3] - ca[3]) * tt];
    }
  }
  return stopRgba(s[s.length - 1]!);
}
function stopRgba(stop: { color: string; opacity?: number }): [number, number, number, number] {
  const c = parseColor(stop.color) ?? [0, 0, 0, 1];
  return [c[0], c[1], c[2], (c[3] ?? 1) * (stop.opacity ?? 1)];
}

/** Perceived darkness 0..1 (1 = black/opaque). */
function darkness([r, g, b, a]: [number, number, number, number]): number {
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  // treat transparency as light/paper
  return (1 - lum) * a;
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

function flatten(sp: SubPath, max: number): Vec2[] {
  const pts: Vec2[] = [sp.start];
  let prev = sp.start;
  for (const seg of sp.segs) {
    subdiv(prev, seg, 0, 1, max, pts);
    prev = seg.p;
  }
  return pts;
}
function subdiv(p0: Vec2, s: { c1: Vec2; c2: Vec2; p: Vec2 }, t0: number, t1: number, max: number, out: Vec2[]) {
  const flat = dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p) - dist(p0, s.p) < max;
  if (flat || t1 - t0 < 1 / 64) { out.push(s.p); return; }
  const tm = (t0 + t1) / 2;
  const [a, b] = splitCubic(p0, s, 0.5);
  subdiv(p0, a, t0, tm, max, out);
  subdiv(a.p, b, tm, t1, max, out);
}
const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);
function splitCubic(p0: Vec2, s: { c1: Vec2; c2: Vec2; p: Vec2 }, t: number) {
  const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = lerp(p0, s.c1, t), b = lerp(s.c1, s.c2, t), c = lerp(s.c2, s.p, t);
  const d = lerp(a, b, t), e = lerp(b, c, t), m = lerp(d, e, t);
  return [{ c1: a, c2: d, p: m }, { c1: e, c2: c, p: s.p }] as const;
}

// Deterministic pseudo-random in [0,1).
function rnd(seed: number, i: number, j: number, k: number): number {
  let x = Math.imul(seed | 0, 374761393) + Math.imul(i | 0, 668265263) + Math.imul(j | 0, 2147483647) + Math.imul(k | 0, 1274126177);
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function mark(shape: string, cx: number, cy: number, r: number, cell: number, angle: number): SubPath[] {
  if (shape === 'square') return [rect(cx - r, cy - r, r * 2, r * 2)];
  if (shape === 'diamond') return [diamond(cx, cy, r)];
  if (shape === 'line') return [bar(cx, cy, r, cell, angle)];
  if (shape === 'ring') return [circlePath(cx, cy, r, false), circlePath(cx, cy, Math.max(r * 0.5, r - cell * 0.12), true)];
  return [circle(cx, cy, r)];
}

const rect = (x: number, y: number, w: number, h: number): SubPath => {
  const a: Vec2 = [x, y], b: Vec2 = [x + w, y], c: Vec2 = [x + w, y + h], d: Vec2 = [x, y + h];
  return { start: a, segs: [line(a, b), line(b, c), line(c, d), line(d, a)], closed: true };
};

function diamond(cx: number, cy: number, r: number): SubPath {
  const a: Vec2 = [cx, cy - r], b: Vec2 = [cx + r, cy], c: Vec2 = [cx, cy + r], d: Vec2 = [cx - r, cy];
  return { start: a, segs: [line(a, b), line(b, c), line(c, d), line(d, a)], closed: true };
}

function circle(cx: number, cy: number, r: number): SubPath {
  return circlePath(cx, cy, r, false);
}

function circlePath(cx: number, cy: number, r: number, cw: boolean): SubPath {
  const k = 0.5523 * r;
  const P = (x: number, y: number): Vec2 => [cx + x, cy + y];
  if (!cw) return { start: P(r, 0), segs: [ { c1: P(r, k), c2: P(k, r), p: P(0, r) }, { c1: P(-k, r), c2: P(-r, k), p: P(-r, 0) }, { c1: P(-r, -k), c2: P(-k, -r), p: P(0, -r) }, { c1: P(k, -r), c2: P(r, -k), p: P(r, 0) } ], closed: true };
  return { start: P(r, 0), segs: [ { c1: P(r, -k), c2: P(k, -r), p: P(0, -r) }, { c1: P(-k, -r), c2: P(-r, -k), p: P(-r, 0) }, { c1: P(-r, k), c2: P(-k, r), p: P(0, r) }, { c1: P(k, r), c2: P(r, k), p: P(r, 0) } ], closed: true };
}

function bar(cx: number, cy: number, r: number, cell: number, angle: number): SubPath {
  // Elongated mark along the screen angle.
  const hw = r, hh = Math.max(r * 0.35, cell * 0.12);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = (x: number, y: number): Vec2 => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const a = rot(-hw, -hh), b = rot(hw, -hh), c = rot(hw, hh), d = rot(-hw, hh);
  return { start: a, segs: [line(a, b), line(b, c), line(c, d), line(d, a)], closed: true };
}

