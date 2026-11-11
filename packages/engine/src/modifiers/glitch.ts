// Glitch: broken-signal distortion, in separate pieces that combine (each one only does its own thing):
// - Slices: horizontal bands; a few of them shift left or right;
// - Blocks: rectangular chunks that come out displaced (leaving their gap);
// - Scanlines: thin horizontal lines cut out inside;
// - Streaks: thin streaks escaping sideways;
// - RGB Split: two coloured, shifted copies of the drawing (behind or in front, with their blend mode).
// Filled shapes are cut as surfaces; stroke-only ones (no fill), as lines.
import { difference, intersection, type MultiPolygon, type Pair, type Polygon } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import { bounds, flatten, keepInner, line, type Geometry, type Shape, type Vec2 } from '../geometry';
import { chainFrom } from '../chain';
import { BLEND_MODES } from '../document';
import { defineModifier, deg } from '../modifier';
import { rng } from '../random';

/** Each filled shape, as a surface (with its box); the others, left out. */
function regions(geo: Geometry, resolution: number) {
  const step = Math.max(resolution, 1e-3);
  return geo.shapes
    .filter((s) => (s.style.fill ?? 'black') !== 'none' && !isLine(s))
    .map((shape) => ({ shape, poly: regionOf([shape], step) }))
    .filter((x) => x.poly.length)
    .map((x) => ({ ...x, box: boxOf(x.poly) }));
}
type Piece = ReturnType<typeof regions>[number];

// ── Strokes without fill: polylines clipped with rectangles.

/** A line: stroked and either unfilled or with no closed path at all (a <line> has no surface). */
const isLine = (s: Shape) =>
  !!s.style.stroke && s.style.stroke !== 'none' && ((s.style.fill ?? 'black') === 'none' || s.subpaths.every((sp) => !sp.closed));

interface LinePiece {
  shape: Shape;
  lines: Vec2[][];
  box: Box;
  /** Not cut yet: the original shape is returned (with its curves). */
  whole: boolean;
}
function linePieces(geo: Geometry): LinePiece[] {
  return geo.shapes.filter(isLine).map((shape) => {
    const lines = shape.subpaths.map((sp) => {
      const pts = flatten(sp, 16);
      if (sp.closed) pts.push(sp.start);
      return pts;
    }).filter((l) => l.length > 1);
    return { shape, lines, box: boxOfLines(lines), whole: true };
  }).filter((x) => x.lines.length);
}
function boxOfLines(lines: Vec2[][]): Box {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** Splits each polyline into the parts inside and outside a box (Liang–Barsky, segment by segment). */
function clipLines(lines: Vec2[][], r: Box): { inside: Vec2[][]; outside: Vec2[][] } {
  const inside: Vec2[][] = [], outside: Vec2[][] = [];
  const at = (a: Vec2, b: Vec2, t: number): Vec2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (const pts of lines) {
    let run: Vec2[] | null = null;
    let runIn = false;
    const push = (q: Vec2, isIn: boolean) => {
      if (!run || runIn !== isIn) {
        const last: Vec2 | undefined = run ? run[run.length - 1] : undefined;
        if (run && run.length > 1) (runIn ? inside : outside).push(run);
        run = last ? [last, q] : [q];
        runIn = isIn;
      } else run.push(q);
    };
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!, b = pts[i + 1]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      let t0 = 0, t1 = 1;
      for (const [pp, q] of [[-dx, a[0] - r.x], [dx, r.x + r.w - a[0]], [-dy, a[1] - r.y], [dy, r.y + r.h - a[1]]] as const) {
        if (pp === 0) {
          if (q < 0) t0 = 1, t1 = 0;
        } else {
          const t = q / pp;
          if (pp < 0) t0 = Math.max(t0, t);
          else t1 = Math.min(t1, t);
        }
      }
      if (i === 0) push(a, t0 <= 0 && t1 >= 0 && t0 <= t1);
      if (t0 < t1) {
        if (t0 > 0) push(at(a, b, t0), false), push(at(a, b, t0), true);
        if (t1 < 1) push(at(a, b, t1), true), push(at(a, b, t1), false);
        push(b, t1 >= 1);
      } else push(b, false);
    }
    const last = run as Vec2[] | null;
    if (last && last.length > 1) (runIn ? inside : outside).push(last);
  }
  const real = (l: Vec2[]) => l.some((q, i) => i > 0 && Math.hypot(q[0] - l[0]![0], q[1] - l[0]![1]) > 1e-9);
  return { inside: inside.filter(real), outside: outside.filter(real) };
}
const moveLines = (lines: Vec2[][], dx: number, dy: number): Vec2[][] => lines.map((l) => l.map(([x, y]) => [x + dx, y + dy] as Vec2));
function lineShape(lp: LinePiece, extra: Partial<Shape> = {}): Shape | null {
  if (lp.whole) return { ...lp.shape, ...extra };
  const subpaths = lp.lines.map((l) => ({ start: l[0]!, segs: l.slice(1).map((q, i) => line(l[i]!, q)), closed: false }));
  return subpaths.length ? { ...lp.shape, subpaths, ...extra } : null;
}
const toShape = (pc: Piece, poly: MultiPolygon, extra: Partial<Shape> = {}): Shape | null => {
  const subpaths = poly.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
  return subpaths.length ? { ...pc.shape, subpaths, ...extra } : null;
};

export const slices = defineModifier({
  type: 'slices',
  label: 'Slices',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 14, min: 1, max: 60, step: 1, ramp: false, label: 'Count' },
    chance: { type: 'number', default: 0.45, min: 0, max: 1, step: 0.01, label: 'Shifted' },
    shift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', label: 'Shift' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    // Cortes: alturas desiguales (unas finas, otras gruesas).
    const n = Math.max(1, Math.round(p.count));
    const weights = Array.from({ length: n }, () => 0.2 + rand() ** 2 * 2);
    const total = weights.reduce((s, x) => s + x, 0);
    const cuts = [b.y];
    for (const w of weights) cuts.push(cuts[cuts.length - 1]! + (w / total) * b.height);
    cuts[cuts.length - 1] = b.y + b.height + 1e-6;
    const dx = weights.map(() => (rand() < p.chance ? (rand() * 2 - 1) * p.shift * size : 0));
    const out: Shape[] = [];
    for (const pc of regions(geo, ctx.resolution)) {
      for (let i = 0; i < n; i++) {
        if (cuts[i + 1]! < pc.box.y || cuts[i]! > pc.box.y + pc.box.h) continue;
        const cut = intersection(pc.poly, [rect(b.x - size, cuts[i]!, b.width + 2 * size, cuts[i + 1]! - cuts[i]!)]);
        // Each band, an element (Step, Color… treat it separately).
        const sh = cut.length && toShape(pc, dx[i] ? move(cut, dx[i]!, 0) : cut, { clone: i });
        if (sh) out.push(sh);
      }
    }
    for (const lp of linePieces(geo)) {
      for (let i = 0; i < n; i++) {
        if (cuts[i + 1]! < lp.box.y || cuts[i]! > lp.box.y + lp.box.h) continue;
        const { inside } = clipLines(lp.lines, { x: b.x - size, y: cuts[i]!, w: b.width + 2 * size, h: cuts[i + 1]! - cuts[i]! });
        const sh = inside.length && lineShape({ ...lp, lines: dx[i] ? moveLines(inside, dx[i]!, 0) : inside, whole: false }, { clone: i });
        if (sh) out.push(sh);
      }
    }
    return out.length ? { viewBox: geo.viewBox, shapes: out } : geo;
  },
});

export const blocks = defineModifier({
  type: 'blocks',
  label: 'Blocks',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 8, min: 1, max: 80, step: 1, ramp: false, label: 'Count' },
    size: { type: 'number', default: 0.07, min: 0.01, max: 0.4, step: 0.005, unit: 'fraction', label: 'Size' },
    shift: { type: 'number', default: 0.05, min: 0, max: 0.4, step: 0.005, unit: 'fraction', label: 'Shift' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    let pieces = regions(geo, ctx.resolution);
    let lines = linePieces(geo);
    if (!pieces.length && !lines.length) return geo;
    // What falls inside each block comes out displaced; the gap stays in its place.
    for (let k = 0; k < Math.round(p.count); k++) {
      const bw = p.size * size * (0.5 + rand() * 1.5);
      const bh = p.size * size * (0.25 + rand() * 0.6);
      const B: Polygon = [rect(b.x + rand() * (b.width - bw), b.y + rand() * (b.height - bh), bw, bh)];
      const ox = (rand() * 2 - 1) * p.shift * size;
      const oy = (rand() * 2 - 1) * p.shift * size * 0.15;
      const bb = boxOf([B]);
      pieces = pieces.flatMap((pc) => {
        // If the boxes don't touch, there's nothing to cut (avoids thousands of useless cuts).
        if (!overlaps(pc.box, bb)) return [pc];
        const inside = intersection(pc.poly, B);
        if (!inside.length) return [pc];
        const rest = difference(pc.poly, B);
        const moved = move(inside, ox, oy);
        return [...(rest.length ? [{ ...pc, poly: rest, box: boxOf(rest) }] : []), { ...pc, poly: moved, box: boxOf(moved) }];
      });
      const r = { x: bb.x, y: bb.y, w: bb.w, h: bb.h };
      lines = lines.flatMap((lp) => {
        if (!overlaps(lp.box, bb)) return [lp];
        const { inside, outside } = clipLines(lp.lines, r);
        if (!inside.length) return [lp];
        const moved = moveLines(inside, ox, oy);
        return [...(outside.length ? [{ ...lp, lines: outside, box: boxOfLines(outside), whole: false }] : []), { ...lp, lines: moved, box: boxOfLines(moved), whole: false }];
      });
    }
    const out = [
      ...pieces.map((pc) => toShape(pc, pc.poly)),
      ...lines.map((lp) => lineShape(lp)),
    ].filter((s): s is Shape => !!s);
    return { viewBox: geo.viewBox, shapes: out };
  },
});

export const scanlines = defineModifier({
  type: 'scanlines',
  label: 'Scanlines',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 60, min: 1, max: 300, step: 1, ramp: false, label: 'Count' },
    width: { type: 'number', default: 0.75, min: 0.1, max: 6, step: 0.05, unit: 'px', label: 'Width' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    // Cap: between lines there is at least as much material as gap.
    const m = Math.max(1, Math.min(Math.round(p.count), Math.floor(b.height / (2 * p.width))));
    const gap = b.height / m;
    const out: Shape[] = [];
    for (const pc of regions(geo, ctx.resolution)) {
      // Only the lines crossing the piece's height.
      const lines: MultiPolygon = [];
      const i0 = Math.max(0, Math.floor((pc.box.y - b.y) / gap - 1)), i1 = Math.min(m - 1, Math.ceil((pc.box.y + pc.box.h - b.y) / gap));
      for (let i = i0; i <= i1; i++) lines.push([rect(pc.box.x - 1, b.y + (i + 0.5) * gap - p.width / 2, pc.box.w + 2, p.width)]);
      const sh = toShape(pc, lines.length ? difference(pc.poly, lines) : pc.poly);
      if (sh) out.push(sh);
    }
    // Strokes: the parts falling on each little line are removed.
    for (const lp of linePieces(geo)) {
      let rest = lp.lines;
      for (let i = 0; i < m; i++) {
        const y = b.y + (i + 0.5) * gap - p.width / 2;
        if (y > lp.box.y + lp.box.h || y + p.width < lp.box.y) continue;
        rest = clipLines(rest, { x: lp.box.x - 1, y, w: lp.box.w + 2, h: p.width }).outside;
      }
      const sh = rest.length && lineShape({ ...lp, lines: rest, whole: false });
      if (sh) out.push(sh);
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/**
 * Streaks escaping sideways, leaving from the real edge of the shape. With Bite, as if the band had
 * shifted: what sticks out on one side is missing on the other, at the same height. Bite is the size
 * of that gap relative to the streak: 0, no gap; 1, the same; less, smaller; more, larger.
 */
export const streaks = defineModifier({
  type: 'streaks',
  label: 'Streaks',
  kind: 'generator',
  family: 'glitch',
  params: {
    count: { type: 'number', default: 6, min: 1, max: 40, step: 1, ramp: false, label: 'Count' },
    length: { type: 'number', default: 0.15, min: 0.01, max: 1, step: 0.01, unit: 'fraction', label: 'Length' },
    width: { type: 'number', default: 1.5, min: 0.25, max: 10, step: 0.25, unit: 'px', label: 'Width' },
    bite: { type: 'number', default: 1, min: 0, max: 2, step: 0.05, label: 'Bite' },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const size = Math.max(b.width, b.height);
    const rand = rng(p.seed);
    // In the drawing's colour (the first filled shape's or, if none, its stroke's).
    const fill = geo.shapes.find((s) => s.style.fill && s.style.fill !== 'none')?.style.fill ?? geo.shapes.find(isLine)?.style.stroke ?? '#000000';
    // The outline of what is visible, as polylines: each streak leaves from the shape's real edge at its height
    // (not from the box, which in a round shape or a ring is far away).
    const outline = geo.shapes
      .filter((s) => (s.style.fill ?? 'black') !== 'none' || isLine(s))
      .flatMap((s) => s.subpaths.map((sp) => {
        const pts = flatten(sp, 16);
        if (sp.closed) pts.push(sp.start);
        return pts;
      }));
    const bars: Shape[] = [];
    const bites: Box[] = [];
    for (let k = 0; k < Math.round(p.count); k++) {
      // A height the shape passes through (a few attempts; a ring has gaps).
      let y = 0, span: [number, number] | null = null;
      for (let tries = 0; tries < 12 && !span; tries++) {
        y = b.y + rand() * b.height;
        span = spanAt(outline, y + p.width / 2);
      }
      const len = p.length * size * (0.4 + rand());
      const left = rand() < 0.5;
      if (!span) continue;
      const deep = Math.max(0, p.bite) * len;
      const edge = left ? span[0] : span[1];
      // Without a gap, the streak goes a little into the shape (so it looks attached); with a gap, it leaves from the edge.
      const inside = deep > 0 ? 0 : len * 0.3;
      const x0 = left ? edge - len + inside : edge - inside;
      const sp = toSubPath(rect(x0, y, len, p.width));
      if (sp) bars.push({ subpaths: [sp], style: { fill } });
      // The gap, on the opposite edge: it sticks out on the left, missing on the right (and vice versa).
      if (deep > 0) bites.push({ x: left ? span[1] - deep : span[0], y, w: deep, h: p.width });
    }
    // The bites: removed from the shapes they touch; the others stay as they were (with their curves).
    let shapes = geo.shapes;
    if (bites.length) {
      const cutPolys: MultiPolygon = bites.map((r) => [rect(r.x, r.y, r.w, r.h)]);
      const fills = new Map(regions(geo, ctx.resolution).map((pc) => [pc.shape, pc]));
      const lines = new Map(linePieces(geo).map((lp) => [lp.shape, lp]));
      shapes = geo.shapes.flatMap((shape) => {
        const pc = fills.get(shape);
        if (pc) {
          if (!bites.some((r) => overlaps(pc.box, r))) return [shape];
          const sh = toShape(pc, difference(pc.poly, cutPolys));
          return sh ? [sh] : [];
        }
        const lp = lines.get(shape);
        if (lp) {
          const hit = bites.filter((r) => overlaps(lp.box, r));
          if (!hit.length) return [shape];
          let rest = lp.lines;
          for (const r of hit) rest = clipLines(rest, r).outside;
          const sh = rest.length && lineShape({ ...lp, lines: rest, whole: false });
          return sh ? [sh] : [];
        }
        return [shape];
      });
    }
    return { viewBox: geo.viewBox, shapes: [...shapes, ...bars] };
  },
});

/** Where the horizontal `y` crosses the outline: the first and last points, or null if it doesn't touch it. */
function spanAt(lines: Vec2[][], y: number): [number, number] | null {
  let x0 = Infinity, x1 = -Infinity;
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
      if ((ay <= y && by >= y) || (by <= y && ay >= y)) {
        const x = ay === by ? Math.min(ax, bx) : ax + ((y - ay) / (by - ay)) * (bx - ax);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (ay === by) x1 = Math.max(x1, ax, bx);
      }
    }
  }
  return x0 <= x1 ? [x0, x1] : null;
}

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

/**
 * RGB split: two copies of the drawing, one of each colour, shifted to each side (Distance, in the
 * direction of Angle). Geometry, not a filter: inside Step, Range or Field each element (letter,
 * copy, piece) gets its own distance, and it exports to Lottie. The copies go behind or in front of the
 * drawing, with their blend mode (screen or multiply mix the colours where they cross).
 * What goes inside RGB Split (as in Step) applies only to the copies: Blur or Glow blur them,
 * Transform or Step move them, a Glitch breaks them… The drawing stays as it is.
 * Without Original, the drawing disappears and only the copies remain.
 */
export const rgbsplit = defineModifier({
  type: 'rgbsplit',
  label: 'RGB Split',
  kind: 'generator',
  family: 'glitch',
  params: {
    distance: { type: 'number', default: 3, min: 0, max: 60, step: 0.5, unit: 'px', label: 'Distance' },
    angle: { type: 'angle', default: 0, label: 'Angle', ramp: false },
    colorA: { type: 'color', default: '#00e5ff', label: 'Color A' },
    colorB: { type: 'color', default: '#ff2bd6', label: 'Color B' },
    layer: { type: 'enum', default: 'behind', options: ['behind', 'front'] as const, label: 'Layer', animatable: false },
    blend: { type: 'enum', default: 'normal', options: BLEND_MODES, label: 'Blend', animatable: false },
    original: { type: 'boolean', default: true, label: 'Original' },
  },
  apply(geo, p, ctx) {
    if (!(p.distance > 0) && p.original) return geo;
    const a = deg(p.angle);
    const [dx, dy] = [Math.cos(a) * p.distance, Math.sin(a) * p.distance];
    const paint = (v: string | undefined, color: string) => (v && v !== 'none' ? color : v);
    const copy = (color: string, sx: number, sy: number): Shape[] =>
      geo.shapes.map((s) => ({
        ...s,
        subpaths: s.subpaths.map((sp) => ({
          start: [sp.start[0] + sx, sp.start[1] + sy] as Vec2,
          segs: sp.segs.map((g) => ({ c1: [g.c1[0] + sx, g.c1[1] + sy] as Vec2, c2: [g.c2[0] + sx, g.c2[1] + sy] as Vec2, p: [g.p[0] + sx, g.p[1] + sy] as Vec2 })),
          closed: sp.closed,
        })),
        style: {
          ...s.style,
          fill: paint(s.style.fill ?? 'black', color)!,
          ...(s.style.stroke ? { stroke: paint(s.style.stroke, color)! } : {}),
          ...(p.blend !== 'normal' ? { 'mix-blend-mode': p.blend } : {}),
        },
      }));
    // The first in the list is painted first (it ends up behind).
    let copies: Geometry = { viewBox: geo.viewBox, shapes: [...copy(p.colorA, -dx, -dy), ...copy(p.colorB, dx, dy)] };
    // What is inside, only on the copies: geometry effects first, in order; filters, when painting.
    const children = ctx.children.filter((c) => c.enabled);
    for (const c of children) {
      if (c.def.kind === 'filter') continue;
      copies = keepInner(copies, c.def.apply(copies, c.params as never, { ...ctx, bounds: bounds(copies), children: c.children }));
    }
    const chain = chainFrom(children.map((c) => ({ def: c.def, params: c.params })));
    let inner = geo.inner;
    if (chain) {
      // The key comes from the filters and their values: the same filters, the same <filter>.
      const key = `rgb${hashText(JSON.stringify(children.filter((c) => c.def.kind === 'filter').map((c) => [c.def.type, c.params])))}`;
      copies = { ...copies, shapes: copies.shapes.map((s) => ({ ...s, wrap: [...(s.wrap ?? []), `@${key}`] })) };
      inner = { ...inner, ...copies.inner, [key]: { chain, ref: bounds(copies) } };
    } else if (copies.inner) inner = { ...inner, ...copies.inner };
    // Without the original: only the copies.
    const base = p.original ? geo.shapes : [];
    const shapes = p.layer === 'front' ? [...base, ...copies.shapes] : [...copies.shapes, ...base];
    return { viewBox: geo.viewBox, shapes, ...(inner ? { inner } : {}) };
  },
});

/** A short fingerprint of a string (FNV-1a), to name filters. */
function hashText(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
