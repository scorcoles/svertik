import type { Shape, Style, SubPath, Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { line } from '../geometry';
import { circlePath, insideFill, rnd } from './halftone';

/**
 * Vector Grain (not the SVG Grain filter): vector stipple that gathers at the edges. Each shape is scattered with small marks (circles,
 * squares or irregular specks) whose density is highest at the edge and falls off over `falloff` px
 * (shaped by `curve`) down to `interior` (a fraction of the edge density) deep inside. `edge` picks the
 * side: inside the shape, outside it (a halo) or both. Marks take the shape's own fill or an ink colour;
 * size, opacity and their variation are controllable, and `edgeSize` makes edge marks bigger or smaller
 * than interior ones. `center` (a point dragged on the canvas, as a fraction of the drawing's box) works as a
 * light: in the middle of the shape the band of grain is even all round the edge; moved off it, the band
 * gets thinner and sparser on the edge near it and wider and denser on the far edge. Along the edge, the
 * band's width scales by how far that edge point is from the centre, relative to its distance from the
 * shape's own middle (1 everywhere when they coincide); `focus` sets how much (0: even band, whatever the
 * centre) and `focusCurve` sharpens it. Seeded: the same seed always gives the same grain. Marks of the same colour and
 * opacity share one path, so thousands of marks stay light in the SVG. By default the source is kept and the
 * grain goes on top of it in black ink; `blend` sets how the grain mixes with what is under it.
 */
/** CSS blend modes for the grain over what is under it (the kept source and the rest of the scene). */
const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'] as const;

export const vectorGrain = defineModifier({
  type: 'vectorgrain',
  label: 'Vector Grain',
  kind: 'generator',
  params: {
    edge: { type: 'enum', default: 'inside', options: ['inside', 'outside', 'both'] as const, label: 'Edge', animatable: false },
    density: { type: 'number', default: 2000, min: 0, max: 5000, step: 10, label: 'Density', random: [800, 4000] },
    falloff: { type: 'number', default: 40, min: 0.5, max: 2000, step: 0.5, unit: 'px', label: 'Falloff', random: [10, 120] },
    curve: { type: 'number', default: 1.5, min: 0.1, max: 6, step: 0.05, label: 'Curve', random: [0.6, 3] },
    interior: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Interior', random: [0, 0.2] },
    center: { type: 'point', default: [0.5, 0.5], unit: 'fraction', step: 0.01, label: 'Center', random: false },
    focus: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Focus', random: [0.5, 1] },
    focusCurve: { type: 'number', default: 1, min: 0.1, max: 6, step: 0.05, label: 'Focus curve', random: [0.6, 2.5] },
    distribution: { type: 'enum', default: 'random', options: ['random', 'even'] as const, label: 'Distribution', animatable: false },
    shape: { type: 'enum', default: 'circle', options: ['circle', 'square', 'speck'] as const, label: 'Mark', animatable: false },
    size: { type: 'number', default: 1.2, min: 0.05, max: 50, step: 0.05, unit: 'px', label: 'Size', random: [0.6, 3] },
    sizeJitter: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Size jitter', random: [0, 0.8] },
    edgeSize: { type: 'number', default: 1, min: 0.1, max: 4, step: 0.05, label: 'Edge size', random: [0.6, 2] },
    color: { type: 'enum', default: 'ink', options: ['ink', 'original'] as const, label: 'Color', animatable: false },
    ink: { type: 'color', default: '#000000', label: 'Ink', showIf: { color: ['ink'] } },
    blend: { type: 'enum', default: 'normal', options: BLENDS, label: 'Blend', animatable: false },
    opacity: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Opacity', random: [0.6, 1] },
    opacityJitter: { type: 'number', default: 0, min: 0, max: 1, step: 0.01, label: 'Opacity jitter', random: [0, 0.6] },
    source: { type: 'enum', default: 'keep', options: ['keep', 'replace'] as const, label: 'Source', animatable: false },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    if (!geo.shapes.length) return geo;
    const out: Shape[] = p.source === 'keep' ? [...geo.shapes] : [];
    if (!(p.density > 0) || !(p.opacity > 0)) return { viewBox: geo.viewBox, shapes: out };
    let budget = MAX_MARKS;
    geo.shapes.forEach((s, index) => {
      if (budget <= 0 || s.image) return;
      const marks = grainFor(s, p, index, budget, [ctx.bounds.x + p.center[0] * ctx.bounds.width, ctx.bounds.y + p.center[1] * ctx.bounds.height]);
      budget -= marks.count;
      out.push(...marks.shapes);
    });
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/** At most this many marks per Grain, whatever the density: beyond it the SVG gets heavy to draw. */
const MAX_MARKS = 80000;
/** At most this many candidate points per shape (density is lowered evenly if the area needs more). */
const MAX_CANDIDATES = 800000;
/** How much the Center can widen (and narrow) the band along the edge. */
const WIDEST = 3;
const NARROWEST = 0.1;
/** Flattening tolerance for edges and inside tests, in px. */
const FLAT = 0.25;
/** Opacity jitter is quantised to this many steps, so marks can share paths. */
const OPACITY_STEPS = 8;

type Params = {
  edge: string;
  density: number;
  falloff: number;
  curve: number;
  interior: number;
  center: [number, number];
  focus: number;
  focusCurve: number;
  distribution: string;
  shape: string;
  size: number;
  sizeJitter: number;
  edgeSize: number;
  color: string;
  ink: string;
  blend: string;
  opacity: number;
  opacityJitter: number;
  seed: number;
};

/**
 * What does not depend on the Center, Focus, Curve, Interior, size, opacity or colour: the candidate points
 * on the chosen side, each with its distance to the nearest edge and that edge point. Computed once per
 * shape and kept (keyed by the parameters it depends on), so dragging the Center or tuning the look only
 * redoes the cheap last step.
 */
interface Prep {
  /** Per candidate: x, y, inside (0/1), distance to the edge, nearest edge x, y (NaN if none in reach), index. */
  data: Float64Array;
  n: number;
  mid: Vec2;
  limit: number;
  seed: number;
}
const STRIDE = 7;
const prepared = new WeakMap<Shape, { key: string; prep: Prep | null }>();

function prepare(s: Shape, p: Params, index: number): Prep | null {
  // Toggling Focus on or off changes how far the band can reach, so it is part of the key.
  const limit = p.falloff * (p.focus > 0 ? WIDEST : 1);
  const key = JSON.stringify([p.edge, p.density, p.falloff, p.distribution, p.seed, index, limit]);
  const hit = prepared.get(s);
  if (hit && hit.key === key) return hit.prep;
  const prep = build(s, p, index, limit);
  prepared.set(s, { key, prep });
  return prep;
}

function build(s: Shape, p: Params, index: number, limit: number): Prep | null {
  const closed = s.subpaths.filter((sp) => sp.closed);
  // Fine flattening (0.25 px): coarser chords cut inside the real curve, leaving a bare crescent along the
  // edge for inside grain and letting outside grain creep into the shape.
  const polys = closed.map((sp) => flattenFine(sp, FLAT));
  // Edges: every subpath outline (closed ones as rings, open ones as polylines).
  const edges = s.subpaths.map((sp) => {
    const pts = flattenFine(sp, FLAT);
    if (sp.closed) pts.push(sp.start);
    return pts;
  });
  if (!edges.some((e) => e.length > 1)) return null;
  if (p.edge === 'inside' && !polys.length) return null;
  const evenodd = s.style['fill-rule'] === 'evenodd';

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of edges) for (const q of e) (x0 = Math.min(x0, q[0])), (y0 = Math.min(y0, q[1])), (x1 = Math.max(x1, q[0])), (y1 = Math.max(y1, q[1]));
  const mid: Vec2 = [(x0 + x1) / 2, (y0 + y1) / 2];
  // Outside grain needs room around the shape: the widest band.
  if (p.edge !== 'inside') (x0 -= limit), (y0 -= limit), (x1 += limit), (y1 += limit);
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);

  const ix = edgeIndex(edges, limit);
  let density = p.density;
  if ((density * w * h) / 10000 > MAX_CANDIDATES) density = (MAX_CANDIDATES * 10000) / (w * h);

  // Candidate points: uniformly random, or one per cell of a jittered grid (more even coverage).
  const pts: number[] = [];
  const seed = (p.seed | 0) * 7919 + index * 104729;
  if (p.distribution === 'even') {
    const cell = Math.sqrt(10000 / density);
    const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) pts.push(x0 + (i + rnd(seed, i, j, 1)) * cell, y0 + (j + rnd(seed, i, j, 2)) * cell);
  } else {
    const n = Math.round((density * w * h) / 10000);
    for (let k = 0; k < n; k++) pts.push(x0 + rnd(seed, k, 0, 1) * w, y0 + rnd(seed, k, 0, 2) * h);
  }

  // Per grid cell, cached: a cell with no edge in it is wholly inside or outside (one test at its centre),
  // and one with no edge within reach is "far" (no search needed).
  const cellInside = new Map<number, boolean>();
  const cellFar = new Map<number, boolean>();
  const reach = Math.ceil(limit / ix.cell);
  const isFar = (ci: number, cj: number) => {
    for (let j = Math.max(0, cj - reach); j <= Math.min(ix.rows - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(ix.cols - 1, ci + reach); i++) if (ix.buckets[j * ix.cols + i]) return false;
    }
    return true;
  };

  const total = pts.length / 2;
  const data = new Float64Array(total * STRIDE);
  let n = 0;
  for (let k = 0; k < total; k++) {
    const q: Vec2 = [pts[2 * k]!, pts[2 * k + 1]!];
    const ci = Math.floor((q[0] - ix.x0) / ix.cell), cj = Math.floor((q[1] - ix.y0) / ix.cell);
    const inGrid = ci >= 0 && cj >= 0 && ci < ix.cols && cj < ix.rows;
    const cellKey = inGrid ? cj * ix.cols + ci : -1;
    const clear = inGrid && !ix.buckets[cellKey];
    let inside: boolean;
    if (!polys.length || !inGrid) inside = false;
    else if (clear) {
      let v = cellInside.get(cellKey);
      if (v === undefined) cellInside.set(cellKey, (v = insideFill(polys, [ix.x0 + (ci + 0.5) * ix.cell, ix.y0 + (cj + 0.5) * ix.cell], evenodd)));
      inside = v;
    } else inside = insideFill(polys, q, evenodd);
    if (p.edge === 'inside' && !inside) continue;
    if (p.edge === 'outside' && inside) continue;
    let far = false;
    if (clear) {
      let v = cellFar.get(cellKey);
      if (v === undefined) cellFar.set(cellKey, (v = isFar(ci, cj)));
      far = v;
    }
    const near = far ? null : nearest(ix, q, limit);
    const o = n * STRIDE;
    data[o] = q[0];
    data[o + 1] = q[1];
    data[o + 2] = inside ? 1 : 0;
    data[o + 3] = near ? near[0] : limit;
    data[o + 4] = near ? near[1] : NaN;
    data[o + 5] = near ? near[2] : NaN;
    data[o + 6] = k;
    n++;
  }
  return { data, n, mid, limit, seed };
}

function grainFor(s: Shape, p: Params, index: number, budget: number, focusAt: Vec2): { shapes: Shape[]; count: number } {
  const prep = prepare(s, p, index);
  if (!prep) return { shapes: [], count: 0 };
  const { data, n, mid, seed } = prep;
  // Centre as a light: at an edge point e, the band scales by |e − centre| / |e − middle of the shape|.
  // That is 1 all round when the centre is in the middle; above 1 on the edge away from it, below near it.
  const scaleAt = (ex: number, ey: number) => {
    if (!(p.focus > 0) || Number.isNaN(ex)) return 1;
    const k = Math.hypot(ex - focusAt[0], ey - focusAt[1]) / Math.max(1e-6, Math.hypot(ex - mid[0], ey - mid[1]));
    return Math.max(NARROWEST, Math.min(WIDEST, 1 + p.focus * (Math.pow(k, p.focusCurve) - 1)));
  };

  const groups = new Map<string, { style: Style; subpaths: SubPath[] }>();
  const baseStyle: Style = { stroke: 'none', fill: p.color === 'ink' ? p.ink : (s.style.fill && s.style.fill !== 'none' ? s.style.fill : (s.style.stroke ?? '#000000')) };
  const blend = p.blend !== 'normal' ? p.blend : s.style['mix-blend-mode'];
  if (blend) baseStyle['mix-blend-mode'] = blend;
  const baseOpacity = p.opacity * Number(s.style.opacity ?? 1);
  let count = 0;

  for (let c = 0; c < n && count < budget; c++) {
    const o = c * STRIDE;
    const inside = data[o + 2] === 1;
    const d = data[o + 3]!;
    const k = data[o + 6]!;
    // The band here: wider and denser on the edge away from the Center, thinner and sparser near it.
    const band = scaleAt(data[o + 4]!, data[o + 5]!);
    const t = Math.min(1, d / (p.falloff * band));
    // Density: full at the edge, falling with the curve; inside it settles at `interior`, outside at 0.
    const ramp = Math.pow(1 - t, p.curve) * Math.min(1, band);
    const keep = inside ? p.interior + (1 - p.interior) * ramp : ramp;
    if (!(rnd(seed, k, 1, 3) < keep)) continue;

    const scale = p.edgeSize + (1 - p.edgeSize) * t;
    const r = Math.max(0.01, 0.5 * p.size * scale * (1 + (rnd(seed, k, 1, 4) - 0.5) * 2 * p.sizeJitter));
    // Inside or outside only: the whole mark stays on its side (it may touch the edge, never cross it).
    if (p.edge !== 'both' && d < r) continue;
    const op = baseOpacity * (1 - p.opacityJitter * rnd(seed, k, 1, 5));
    const level = Math.max(1, Math.round(op * OPACITY_STEPS));
    const groupKey = String(level);
    let group = groups.get(groupKey);
    if (!group) {
      const style: Style = { ...baseStyle };
      const lv = level / OPACITY_STEPS;
      if (lv < 1) style.opacity = String(lv);
      group = { style, subpaths: [] };
      groups.set(groupKey, group);
    }
    group.subpaths.push(mark(p.shape, [data[o]!, data[o + 1]!], r, rnd(seed, k, 1, 6), seed + k));
    count++;
  }

  // Carry what selection and per-element effects read from the source (node, word, line, clone).
  const { subpaths: _sp, style: _st, gradients, image: _im, ...meta } = s;
  const shapes = [...groups.values()].map((g) => ({ ...meta, style: g.style, subpaths: g.subpaths, ...(p.color === 'original' && gradients ? { gradients } : {}) }));
  return { shapes, count };
}

// ── Distance to the nearest edge, with the segments bucketed in a grid (only nearby cells are tested).

interface EdgeIndex {
  x0: number;
  y0: number;
  cell: number;
  cols: number;
  rows: number;
  buckets: (number[] | undefined)[];
  segs: number[];
}

function edgeIndex(edges: Vec2[][], falloff: number): EdgeIndex {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  let count = 0;
  for (const e of edges) {
    count += Math.max(0, e.length - 1);
    for (const q of e) (x0 = Math.min(x0, q[0])), (y0 = Math.min(y0, q[1])), (x1 = Math.max(x1, q[0])), (y1 = Math.max(y1, q[1]));
  }
  const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6);
  // Cells about the falloff in size, but never more than 96 a side nor fewer segments than needed.
  const cell = Math.max(falloff / 2, w / 96, h / 96, Math.sqrt((w * h) / Math.max(1, count)));
  const cols = Math.max(1, Math.ceil(w / cell)), rows = Math.max(1, Math.ceil(h / cell));
  const buckets: (number[] | undefined)[] = new Array(cols * rows);
  const segs: number[] = [];
  for (const e of edges) {
    for (let i = 1; i < e.length; i++) {
      const [ax, ay] = e[i - 1]!, [bx, by] = e[i]!;
      const at = segs.length;
      segs.push(ax, ay, bx, by);
      const ia = clamp(Math.floor((Math.min(ax, bx) - x0) / cell), 0, cols - 1), ib = clamp(Math.floor((Math.max(ax, bx) - x0) / cell), 0, cols - 1);
      const ja = clamp(Math.floor((Math.min(ay, by) - y0) / cell), 0, rows - 1), jb = clamp(Math.floor((Math.max(ay, by) - y0) / cell), 0, rows - 1);
      for (let j = ja; j <= jb; j++) for (let i2 = ia; i2 <= ib; i2++) (buckets[j * cols + i2] ??= []).push(at);
    }
  }
  return { x0, y0, cell, cols, rows, buckets, segs };
}

/** The nearest edge point to `q` within `limit`: [distance, x, y], or null if none is that close. */
function nearest(ix: EdgeIndex, [x, y]: Vec2, limit: number): [number, number, number] | null {
  const reach = Math.ceil(limit / ix.cell);
  const ci = Math.floor((x - ix.x0) / ix.cell), cj = Math.floor((y - ix.y0) / ix.cell);
  let best = limit * limit;
  let bx = NaN, by = NaN;
  const seen = new Set<number>();
  for (let j = Math.max(0, cj - reach); j <= Math.min(ix.rows - 1, cj + reach); j++) {
    for (let i = Math.max(0, ci - reach); i <= Math.min(ix.cols - 1, ci + reach); i++) {
      const list = ix.buckets[j * ix.cols + i];
      if (!list) continue;
      for (const at of list) {
        if (seen.has(at)) continue;
        seen.add(at);
        const s = ix.segs;
        const ax = s[at]!, ay = s[at + 1]!, ex = s[at + 2]! - ax, ey = s[at + 3]! - ay;
        const len2 = ex * ex + ey * ey;
        const u = len2 ? Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)) : 0;
        const px = ax + u * ex, py = ay + u * ey;
        const d2 = (x - px) ** 2 + (y - py) ** 2;
        if (d2 < best) (best = d2), (bx = px), (by = py);
      }
    }
  }
  return Number.isNaN(bx) ? null : [Math.sqrt(best), bx, by];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── Flattening: split each cubic until its control points are within `tol` of the chord (the curve then
// is too: it lies in their hull). Halftone's flatten measures polygon length, which barely grows on short
// arcs, so a circle came out as ~34 chords, 0.4 px inside the real curve.

function flattenFine(sp: SubPath, tol: number): Vec2[] {
  const out: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const seg of sp.segs) {
    split(p0, seg.c1, seg.c2, seg.p, tol, 0, out);
    p0 = seg.p;
  }
  return out;
}

function split(p0: Vec2, c1: Vec2, c2: Vec2, p3: Vec2, tol: number, depth: number, out: Vec2[]) {
  const dx = p3[0] - p0[0], dy = p3[1] - p0[1];
  const len = Math.hypot(dx, dy);
  const off = (c: Vec2) => (len > 1e-9 ? Math.abs((c[0] - p0[0]) * dy - (c[1] - p0[1]) * dx) / len : Math.hypot(c[0] - p0[0], c[1] - p0[1]));
  if (depth >= 12 || Math.max(off(c1), off(c2)) <= tol) {
    out.push(p3);
    return;
  }
  const m = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const a = m(p0, c1), b = m(c1, c2), c = m(c2, p3);
  const d = m(a, b), e = m(b, c), mid = m(d, e);
  split(p0, a, d, mid, tol, depth + 1, out);
  split(mid, e, c, p3, tol, depth + 1, out);
}

// ── Marks

function mark(shape: string, [cx, cy]: Vec2, r: number, turn: number, seed: number): SubPath {
  if (shape === 'circle') return circlePath(cx, cy, r, false);
  const a = turn * Math.PI * 2;
  if (shape === 'square') return polygon(cx, cy, [r * Math.SQRT2, r * Math.SQRT2, r * Math.SQRT2, r * Math.SQRT2], a + Math.PI / 4);
  // Speck: an irregular 5–7 sided grain of sand.
  const sides = 5 + Math.floor(rnd(seed, 3, 7, 11) * 3);
  const radii = Array.from({ length: sides }, (_, i) => r * (0.55 + 0.6 * rnd(seed, i, 7, 13)));
  return polygon(cx, cy, radii, a);
}

function polygon(cx: number, cy: number, radii: number[], start: number): SubPath {
  const pts: Vec2[] = radii.map((rr, i) => {
    const a = start + (i / radii.length) * Math.PI * 2;
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
  const segs = pts.map((q, i) => line(q, pts[(i + 1) % pts.length]!));
  return { start: pts[0]!, segs, closed: true };
}
