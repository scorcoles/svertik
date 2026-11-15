// Primitives: shapes generated from parameters, not imported SVG.

import { line, type Cubic, type Geometry, type Gradient, type Style, type SubPath, type Vec2 } from './geometry';
import type { Font } from 'opentype.js';
import { fontFor, fontKey } from './fonts';
import { resolveParams, type ParamSchema, type ParamValues } from './modifier';

export interface ShapeDef<P extends ParamSchema = ParamSchema> {
  type: string;
  label: string;
  params: P;
  /** Geometry centred on the origin. */
  build(p: ParamValues<P>): SubPath[];
  /** If the shape has several elements (Text: one per letter), each one separately (for Step, Color…). */
  buildParts?(p: ParamValues<P>): SubPath[][];
  /** Tags for each piece (Text: its word and line), for Range by words or lines. */
  partTags?(p: ParamValues<P>): { word?: number; line?: number }[];
  /** New instances follow scene.time automatically. */
  timeDriven?: boolean;
  /** Draw a stroke without exposing a Stroke toggle to the user. */
  fixedStroke?: boolean;
  /** The point that goes at the node's position, if not the centre of its box (Text with an anchor). */
  origin?(p: ParamValues<P>): Vec2 | null;
}

const defineShape = <P extends ParamSchema>(d: ShapeDef<P>): ShapeDef<P> => d;

// Style shared by all primitives.
const style: ParamSchema = {
  fill: { type: 'boolean', default: true, group: 'Style', label: 'Fill', animatable: false },
  fillColor: { type: 'color', default: '#d9d9d9', group: 'Style', label: 'Fill color' },
  stroke: { type: 'boolean', default: false, group: 'Style', label: 'Stroke', animatable: false },
  strokeColor: { type: 'color', default: '#ededed', group: 'Style', label: 'Stroke color' },
  strokeWidth: { type: 'number', default: 2, min: 0, max: 40, step: 0.5, unit: 'px', group: 'Style', label: 'Stroke width' },
  strokeJoin: { type: 'enum', default: 'round', options: ['miter', 'round', 'bevel'], group: 'Style', label: 'Join', animatable: false },
  strokeCap: { type: 'enum', default: 'round', options: ['butt', 'round', 'square'], group: 'Style', label: 'Cap', animatable: false },
  ...strokeExtras('Style'),
};

/**
 * What SVG adds to the stroke, for primitives and Paint: dashes (dash and gap in px; 0, solid), their
 * offset (animating it makes the dashes run) and painting it behind the fill (`paint-order`: only the
 * outer half shows, like an outside border).
 */
export function strokeExtras(group: string): ParamSchema {
  const on = { stroke: ['true'] } as const;
  return {
    dash: { type: 'number', default: 0, min: 0, max: 400, step: 0.5, unit: 'px', group, label: 'Dash', showIf: on, random: false },
    gap: { type: 'number', default: 0, min: 0, max: 400, step: 0.5, unit: 'px', group, label: 'Gap', showIf: on, random: false },
    dashOffset: { type: 'number', default: 0, min: -10000, max: 10000, step: 1, unit: 'px', group, label: 'Dash offset', showIf: on, random: false },
    behind: { type: 'boolean', default: false, group, label: 'Behind fill', showIf: on, animatable: false },
  };
}

/** The stroke attributes of `strokeExtras` (only those that change something). */
export function strokeExtraStyle(p: Record<string, unknown>): Style {
  const out: Style = {};
  const dash = Number(p.dash) || 0;
  if (dash > 0) {
    const gap = Number(p.gap) || dash;
    out['stroke-dasharray'] = `${dash} ${gap}`;
    const off = Number(p.dashOffset) || 0;
    if (off) out['stroke-dashoffset'] = String(off);
  }
  if (p.behind) out['paint-order'] = 'stroke';
  return out;
}

const closed = (pts: Vec2[]): SubPath => ({ start: pts[0]!, segs: pts.slice(1).concat([pts[0]!]).map((p, i) => line(i === 0 ? pts[0]! : pts[i]!, p)), closed: true });

/** An ellipse arc as cubics (quarter turns). */
function ellipse(rx: number, ry: number): SubPath {
  const k = 0.5522847498;
  const p = (x: number, y: number): Vec2 => [x, y];
  const segs: Cubic[] = [
    { c1: p(rx, -ry * k), c2: p(rx * k, -ry), p: p(0, -ry) },
    { c1: p(-rx * k, -ry), c2: p(-rx, -ry * k), p: p(-rx, 0) },
    { c1: p(-rx, ry * k), c2: p(-rx * k, ry), p: p(0, ry) },
    { c1: p(rx * k, ry), c2: p(rx, ry * k), p: p(rx, 0) },
  ];
  return { start: p(rx, 0), segs, closed: true };
}

export const rectangle = defineShape({
  type: 'rectangle',
  label: 'Rectangle',
  params: {
    width: { type: 'number', default: 160, min: 1, step: 1, unit: 'px', pair: 'height' },
    height: { type: 'number', default: 120, min: 1, step: 1, unit: 'px' },
    radius: { type: 'number', default: 0, min: 0, step: 1, unit: 'px' },
    ...style,
  },
  build({ width: w, height: h, radius }) {
    const r = Math.min(radius, w / 2, h / 2);
    const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2;
    if (r <= 0) return [closed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])];
    const k = 0.5522847498 * r;
    const start: Vec2 = [x0 + r, y0];
    const segs: Cubic[] = [
      line([x0 + r, y0], [x1 - r, y0]),
      { c1: [x1 - r + k, y0], c2: [x1, y0 + r - k], p: [x1, y0 + r] },
      line([x1, y0 + r], [x1, y1 - r]),
      { c1: [x1, y1 - r + k], c2: [x1 - r + k, y1], p: [x1 - r, y1] },
      line([x1 - r, y1], [x0 + r, y1]),
      { c1: [x0 + r - k, y1], c2: [x0, y1 - r + k], p: [x0, y1 - r] },
      line([x0, y1 - r], [x0, y0 + r]),
      { c1: [x0, y0 + r - k], c2: [x0 + r - k, y0], p: [x0 + r, y0] },
    ];
    return [{ start, segs, closed: true }];
  },
});

export const ellipseShape = defineShape({
  type: 'ellipse',
  label: 'Ellipse',
  params: {
    width: { type: 'number', default: 140, min: 1, step: 1, unit: 'px', pair: 'height' },
    height: { type: 'number', default: 140, min: 1, step: 1, unit: 'px' },
    ...style,
  },
  build: ({ width, height }) => [ellipse(width / 2, height / 2)],
});

const ring = (n: number, r: (i: number) => number, rotation: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = ((rotation - 90) * Math.PI) / 180 + (i * 2 * Math.PI) / n;
    return [Math.cos(a) * r(i), Math.sin(a) * r(i)];
  });

export const polygon = defineShape({
  type: 'polygon',
  label: 'Polygon',
  params: {
    radius: { type: 'number', default: 80, min: 1, step: 1, unit: 'px' },
    sides: { type: 'number', default: 6, min: 3, max: 64, step: 1, ramp: false },
    rotation: { type: 'angle', default: 0 },
    ...style,
  },
  build: ({ radius, sides, rotation }) => [closed(ring(Math.max(3, Math.round(sides)), () => radius, rotation))],
});

export const star = defineShape({
  type: 'star',
  label: 'Star',
  params: {
    radius: { type: 'number', default: 80, min: 1, step: 1, unit: 'px' },
    points: { type: 'number', default: 5, min: 2, max: 64, step: 1, ramp: false },
    inner: { type: 'number', default: 0.45, min: 0.01, max: 1, step: 0.01, label: 'Inner radius' },
    rotation: { type: 'angle', default: 0 },
    ...style,
  },
  build: ({ radius, points, inner, rotation }) => {
    const n = Math.max(2, Math.round(points)) * 2;
    return [closed(ring(n, (i) => (i % 2 ? radius * inner : radius), rotation))];
  },
});

export const lineShape = defineShape({
  type: 'line',
  label: 'Line',
  params: {
    length: { type: 'number', default: 200, min: 1, step: 1, unit: 'px' },
    angle: { type: 'angle', default: 0 },
    ...style,
    fill: { ...style.fill!, default: false } as ParamSchema[string],
    stroke: { ...style.stroke!, default: true } as ParamSchema[string],
  },
  build: ({ length, angle }) => {
    const a = (angle * Math.PI) / 180;
    const d: Vec2 = [(Math.cos(a) * length) / 2, (Math.sin(a) * length) / 2];
    return [{ start: [-d[0], -d[1]], segs: [line([-d[0], -d[1]], d)], closed: false }];
  },
});

export const spiral = defineShape({
  type: 'spiral',
  label: 'Spiral',
  params: {
    radius: { type: 'number', default: 90, min: 1, step: 1, unit: 'px' },
    turns: { type: 'number', default: 4, min: 0.25, max: 30, step: 0.25, ramp: false },
    ...style,
    fill: { ...style.fill!, default: false } as ParamSchema[string],
    stroke: { ...style.stroke!, default: true } as ParamSchema[string],
  },
  build: ({ radius, turns }) => {
    // Archimedean spiral sampled in short segments.
    const steps = Math.max(8, Math.round(turns * 48));
    const pts: Vec2[] = Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const a = t * turns * 2 * Math.PI;
      return [Math.cos(a) * radius * t, Math.sin(a) * radius * t];
    });
    return [{ start: pts[0]!, segs: pts.slice(1).map((p, i) => line(pts[i]!, p)), closed: false }];
  },
});

// Chess pawn: svertik's "Utah teapot", a test shape with curves, a neck and a base.
// A 120 × 200 profile centred on the origin (head, collar, concave body, ring and foot).
// The path is already turned into cubic subpaths: the core doesn't need a path parser for one shape.
const PAWN: SubPath[] = [
  {
    start: [0, -100],
    closed: true,
    segs: [
      { c1: [11.930872, -99.943192], c2: [22.29192, -91.773437], p: [25.129934, -80.184882] },
      { c1: [27.967947, -68.596327], c2: [22.554487, -56.563427], p: [12, -51] },
      { c1: [12, -51], c2: [12, -46], p: [12, -46] },
      { c1: [12, -44], c2: [26, -43], p: [26, -38] },
      { c1: [26, -33], c2: [16, -32], p: [15, -30] },
      { c1: [15, -6], c2: [26, 30], p: [40, 52] },
      { c1: [44, 58], c2: [48, 60], p: [52, 62] },
      { c1: [55, 63], c2: [55, 70], p: [52, 72] },
      { c1: [52, 72], c2: [52, 74], p: [52, 74] },
      { c1: [58, 75], c2: [60, 78], p: [60, 82] },
      { c1: [60, 82], c2: [60, 100], p: [60, 100] },
      { c1: [60, 100], c2: [-60, 100], p: [-60, 100] },
      { c1: [-60, 100], c2: [-60, 82], p: [-60, 82] },
      { c1: [-60, 78], c2: [-58, 75], p: [-52, 74] },
      { c1: [-52, 74], c2: [-52, 72], p: [-52, 72] },
      { c1: [-55, 70], c2: [-55, 63], p: [-52, 62] },
      { c1: [-48, 60], c2: [-44, 58], p: [-40, 52] },
      { c1: [-26, 30], c2: [-15, -6], p: [-15, -30] },
      { c1: [-16, -32], c2: [-26, -33], p: [-26, -38] },
      { c1: [-26, -43], c2: [-12, -44], p: [-12, -46] },
      { c1: [-12, -46], c2: [-12, -51], p: [-12, -51] },
      { c1: [-22.554487, -56.563427], c2: [-27.967947, -68.596327], p: [-25.129934, -80.184882] },
      { c1: [-22.29192, -91.773437], c2: [-11.930872, -99.943192], p: [0, -100] },
    ],
  },
];

/** A filled plus sign. Width controls the arm thickness independently of its overall size. */
export const cross = defineShape({
  type: 'cross',
  label: 'Cross',
  params: {
    size: { type: 'number', default: 140, min: 1, step: 1, unit: 'px', label: 'Size' },
    width: { type: 'number', default: 28, min: 1, step: 1, unit: 'px', label: 'Width' },
    ...style,
  },
  build: ({ size, width }) => {
    const r = Math.max(1, size) / 2;
    const w = Math.min(Math.max(1, width) / 2, r);
    return [closed([
      [-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w],
      [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w],
    ])];
  },
});

/** A single continuous outline, including circular heads as exact cubic arcs. */
export const arrow = defineShape({
  type: 'arrow', label: 'Arrow',
  params: {
    length: { type: 'number', default: 240, min: 1, step: 1, unit: 'px', label: 'Length' },
    width: { type: 'number', default: 24, min: 1, step: 1, unit: 'px', label: 'Body width' },
    startHead: { type: 'enum', default: 'none', options: ['none', 'triangle', 'v', 'square', 'circle'] as const, label: 'Start head', animatable: false },
    endHead: { type: 'enum', default: 'triangle', options: ['none', 'triangle', 'v', 'square', 'circle'] as const, label: 'End head', animatable: false },
    headLength: { type: 'number', default: 0.28, min: 0.01, max: 0.5, step: 0.01, unit: 'fraction', label: 'Head / length' },
    headWidth: { type: 'number', default: 3, min: 1, max: 12, step: 0.1, label: 'Head / body width' },
    notch: { type: 'number', default: 0.45, min: 0, max: 0.9, step: 0.01, unit: 'fraction', label: 'V depth' },
    ...style,
  },
  build({ length, width, startHead, endHead, headLength, headWidth, notch }) {
    const L = Math.max(1, length), b = Math.max(1, width) / 2;
    const h = b * Math.max(1, headWidth);
    const d = L * Math.min(0.5, Math.max(0.01, headLength));
    // Each head runs from the upper body junction around the end to the lower junction.
    const head = (sign: number, tip: string): SubPath => {
      if (tip === 'none') return { start: [sign * L / 2, -sign * b], segs: [line([sign * L / 2, -sign * b], [sign * L / 2, sign * b])], closed: false };
      const x = L / 2, back = x - d;
      const points: Vec2[] = tip === 'v'
        ? [[back + d * notch, -b], [back, -h], [x, 0], [back, h], [back + d * notch, b]]
        : tip === 'square'
          ? [[back, -b], [back, -h], [x, -h], [x, h], [back, h], [back, b]]
          : [[back, -b], [back, -h], [x, 0], [back, h], [back, b]];
      let path: SubPath;
      if (tip === 'circle') {
        // An elliptical round head: independent length and width, joined without internal seams.
        const rx = d / 2, cx = x - rx;
        const a = Math.asin(Math.min(1, b / h));
        const from = Math.PI + a, to = 3 * Math.PI - a;
        const point = (t: number): Vec2 => [cx + rx * Math.cos(t), h * Math.sin(t)];
        const segs: Cubic[] = [];
        const angles = [from, ...[1.5, 2, 2.5].map(t => t * Math.PI).filter(t => t > from && t < to), to];
        for (let i = 0; i < angles.length - 1; i++) {
          const t0 = angles[i]!, t1 = angles[i + 1]!;
          const k = 4 / 3 * Math.tan((t1 - t0) / 4), p0 = point(t0), p1 = point(t1);
          segs.push({ c1: [p0[0] - k * rx * Math.sin(t0), p0[1] + k * h * Math.cos(t0)], c2: [p1[0] + k * rx * Math.sin(t1), p1[1] - k * h * Math.cos(t1)], p: p1 });
        }
        path = { start: point(from), segs, closed: false };
      } else path = { start: points[0]!, segs: points.slice(1).map((p, i) => line(points[i]!, p)), closed: false };
      const map = ([x, y]: Vec2): Vec2 => [sign * x, sign * y];
      return { start: map(path.start), segs: path.segs.map(s => ({ c1: map(s.c1), c2: map(s.c2), p: map(s.p) })), closed: false };
    };
    const end = head(1, endHead);
    const start = head(-1, startHead);
    return [{ start: end.start, closed: true, segs: [...end.segs, line(end.segs.at(-1)!.p, start.start), ...start.segs, line(start.segs.at(-1)!.p, end.start)] }];
  },
});

export const pawn = defineShape({
  type: 'pawn',
  label: 'Pawn',
  params: {
    height: { type: 'number', default: 200, min: 1, step: 1, unit: 'px' },
    ...style,
  },
  build: ({ height }) => {
    const k = height / 200;
    const f = (q: Vec2): Vec2 => [q[0] * k, q[1] * k];
    return PAWN.map((sp) => ({
      start: f(sp.start),
      segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })),
      closed: sp.closed,
    }));
  },
});

/**
 * Outline of a glyph (opentype.js M L Q C Z commands) as cubic subpaths.
 * A font's contours are always closed, with or without the "Z" (many fonts leave it out).
 */
function glyphSubpaths(commands: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): SubPath[] {
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let p0: Vec2 = [0, 0];
  const close = () => {
    if (!cur) return;
    if (cur.segs.length && (Math.abs(p0[0] - cur.start[0]) > 1e-9 || Math.abs(p0[1] - cur.start[1]) > 1e-9)) cur.segs.push(line(p0, cur.start));
    cur.closed = true;
    cur = null;
  };
  for (const c of commands) {
    if (c.type === 'M') {
      close();
      cur = { start: [c.x!, c.y!], segs: [], closed: false };
      out.push(cur);
      p0 = [c.x!, c.y!];
    } else if (c.type === 'L' && cur) {
      cur.segs.push(line(p0, [c.x!, c.y!]));
      p0 = [c.x!, c.y!];
    } else if (c.type === 'Q' && cur) {
      // Quadratic → cubic: the controls at 2/3 of the quadratic control from each end.
      const q: Vec2 = [c.x1!, c.y1!], e: Vec2 = [c.x!, c.y!];
      cur.segs.push({ c1: [p0[0] + (2 / 3) * (q[0] - p0[0]), p0[1] + (2 / 3) * (q[1] - p0[1])], c2: [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])], p: e });
      p0 = e;
    } else if (c.type === 'C' && cur) {
      cur.segs.push({ c1: [c.x1!, c.y1!], c2: [c.x2!, c.y2!], p: [c.x!, c.y!] });
      p0 = [c.x!, c.y!];
    } else if (c.type === 'Z') close();
  }
  close();
  return out.filter((sp) => sp.segs.length);
}

export const text = defineShape({
  type: 'text',
  label: 'Text',
  params: {
    text: { type: 'text', default: 'svertik', label: 'Text', expression: true },
    updateRate: { type: 'number', default: 12, min: 1, max: 60, step: 1, unit: 'Hz', label: 'Update rate', expression: false, animatable: false, ramp: false, random: false },
    font: { type: 'font', default: 'JetBrains Mono', label: 'Font' },
    weight: { type: 'number', default: 400, min: 100, max: 900, step: 100, label: 'Weight', ramp: false, animatable: false, random: false },
    italic: { type: 'boolean', default: false, label: 'Italic', animatable: false },
    size: { type: 'number', default: 72, min: 1, step: 1, unit: 'px' },
    tracking: { type: 'number', default: 0, min: -500, max: 2000, step: 5, label: 'Tracking', ramp: false },
    lineHeight: { type: 'number', default: 1.2, min: 0.5, max: 4, step: 0.05, label: 'Line height', ramp: false },
    align: { type: 'enum', default: 'center', options: ['left', 'center', 'right'], animatable: false },
    // Which point goes at the object's position. ink: the centre of what is visible (changes with each word);
    // left, center and right: the edge or the centre of the line by the font (doesn't move when the text changes).
    anchor: { type: 'enum', default: 'ink', options: ['ink', 'left', 'center', 'right'], label: 'Anchor', animatable: false },
    ...style,
  },
  build(p): SubPath[] {
    return textParts(p).flat();
  },
  buildParts: (p) => textParts(p),
  partTags: (p) => textTags(p),
  origin: (p) => (p.anchor === 'ink' ? null : textLayout(p).origin),
});

/**
 * Text drawing options (with ligatures). Some fonts carry substitutions opentype.js can't apply yet
 * (it throws): those are drawn letter by letter (tried once per font).
 */
const probed = new WeakSet<object>();
function textOptions(font: Font, text: string, extra: object = {}): object {
  const opts = { kerning: true, features: { liga: true, rlig: true }, ...extra };
  if (!probed.has(font)) {
    probed.add(font);
    try {
      font.forEachGlyph(`${text} The quick brown fox jumps over the lazy dog fi fl ffi ffl Th 0123`, 0, 0, 10, opts, () => {});
    } catch {
      // That font, letter by letter: no substitutions (ligatures, composition), with its advance and kerning.
      const f = font as unknown as { stringToGlyphs: (s: string) => unknown[]; charToGlyph: (c: string) => unknown };
      f.stringToGlyphs = (str: string) => Array.from(str, (c) => f.charToGlyph(c));
    }
  }
  return opts;
}

/** Word and line of each visible letter, in the same order as textParts. */
function textTags(p: Record<string, unknown>): { word: number; line: number }[] {
  const found = fontFor(fontKey(String(p.font), Number(p.weight ?? 400), !!p.italic), String(p.font));
  if (!found) return [];
  const tags: { word: number; line: number }[] = [];
  let word = 0;
  String(p.text).split('\n').forEach((l, line) => {
    let inWord = false;
    found.font.forEachGlyph(l, 0, 0, Number(p.size), textOptions(found.font, String(p.text)), (glyph, gx, gy) => {
      const visible = glyph.getPath(gx, gy, Number(p.size)).commands.length > 0;
      if (visible) {
        if (!inWord) inWord = true;
        tags.push({ word, line });
      } else if (inWord) {
        inWord = false;
        word++;
      }
    });
    if (inWord) word++;
  });
  return tags;
}

/** One piece per letter (spaces don't count), with kerning; several lines with their alignment. */
const textParts = (p: Record<string, unknown>): SubPath[][] => textLayout(p).parts;

/**
 * The letters, centred on the origin by their ink, and the anchor: the left edge, the centre or the right
 * edge of the block (by the letters' advance) at mid-height of its lines (by the font, not by the ink).
 */
function textLayout(p: Record<string, unknown>): { parts: SubPath[][]; origin: Vec2 } {
  const found = fontFor(fontKey(String(p.font), Number(p.weight ?? 400), !!p.italic), String(p.font));
  if (!found) return { parts: [], origin: [0, 0] };
  const { font } = found;
  const size = Number(p.size);
  const lines = String(p.text).split('\n');
  const opts = textOptions(font, String(p.text), { tracking: Number(p.tracking) });
  const widths = lines.map((l) => font.forEachGlyph(l, 0, 0, size, opts, () => {}));
  const maxW = Math.max(0, ...widths);
  const parts: SubPath[][] = [];
  lines.forEach((l, i) => {
    const w = widths[i]!;
    const x0 = p.align === 'left' ? -maxW / 2 : p.align === 'right' ? maxW / 2 - w : -w / 2;
    const y = i * size * Number(p.lineHeight);
    font.forEachGlyph(l, x0, y, size, opts, (glyph, gx, gy) => {
      const sps = glyphSubpaths(glyph.getPath(gx, gy, size).commands as never);
      if (sps.length) parts.push(sps);
    });
  });
  // The anchor, before centring: horizontally the block goes from -maxW/2 to maxW/2; vertically, from the
  // top of the first line to the bottom of the last (the font's ascender and descender).
  const k = size / font.unitsPerEm;
  const top = -font.ascender * k;
  const bottom = (lines.length - 1) * size * Number(p.lineHeight) - font.descender * k;
  const ax = p.anchor === 'left' ? -maxW / 2 : p.anchor === 'right' ? maxW / 2 : 0;
  const anchor: Vec2 = [ax, (top + bottom) / 2];
  // Centred on the origin (by the ink), like the other primitives.
  const all = parts.flat();
  if (!all.length) return { parts, origin: anchor };
  // Match `bounds()`'s geometry box, which includes Bézier control points. If we centre only on
  // segment endpoints here, then bounds() computes a slightly different centre for each changing
  // glyph (e.g. a live timer), and placement around the object centre produces visible micro-jitter.
  const pts = all.flatMap((sp) => [sp.start, ...sp.segs.flatMap((g) => [g.c1, g.c2, g.p])]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const f = (q: Vec2): Vec2 => [q[0] - cx, q[1] - cy];
  return {
    parts: parts.map((sps) => sps.map((sp) => ({ start: f(sp.start), segs: sp.segs.map((g) => ({ c1: f(g.c1), c2: f(g.c2), p: f(g.p) })), closed: sp.closed }))),
    origin: f(anchor),
  };
}

const frameRandom = (seed: number, frame: number) => {
  let state = (Math.trunc(seed) ^ Math.imul(frame + 1, 0x9e3779b1)) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const dynamicSourceParams = {
  seed: { type: 'seed', default: 1, group: 'Generator' },
  time: { type: 'number', default: 0, min: 0, max: 3600, step: 0.01, group: 'Generator', label: 'Time' },
  fps: { type: 'number', default: 12, min: 1, max: 60, step: 1, group: 'Generator', label: 'Update rate' },
} as const satisfies ParamSchema;

const sourceStyle = {
  fill: { type: 'boolean', default: true, group: 'Style', label: 'Fill', animatable: false },
  fillColor: { type: 'color', default: '#d9d9d9', group: 'Style', label: 'Fill color' },
} as const satisfies ParamSchema;

/** Autonomous synthesizer-style wave source. Random retains the original seeded signal mode. */
export const randomWave = defineShape({
  type: 'randomwave', label: 'Wave', timeDriven: true, fixedStroke: true,
  params: {
    width: { type: 'number', default: 900, min: 1, step: 1, unit: 'px', group: 'Generator' },
    height: { type: 'number', default: 360, min: 1, step: 1, unit: 'px', group: 'Generator' },
    points: { type: 'number', default: 90, min: 8, max: 600, step: 1, group: 'Generator', label: 'Samples' },
    amplitude: { type: 'number', default: 0.46, min: 0, max: 1, step: 0.01, group: 'Generator' },
    waveform: { type: 'enum', default: 'random', options: ['random', 'sine', 'square', 'triangle', 'sawtooth'] as const, group: 'Generator', label: 'Waveform' },
    cycles: { type: 'number', default: 3, min: 0.1, max: 30, step: 0.1, group: 'Generator', label: 'Cycles' },
    speed: { type: 'number', default: 0.5, min: -10, max: 10, step: 0.01, group: 'Generator', label: 'Speed' },
    phase: { type: 'angle', default: 0, group: 'Generator', label: 'Phase' },
    direction: { type: 'enum', default: 'middle', options: ['middle', 'bottom'] as const, group: 'Generator', label: 'Direction' },
    ...dynamicSourceParams,
    ...sourceStyle,
    fill: { type: 'boolean', default: false, group: 'Style', label: 'Fill', animatable: false },
  },
  build(p) {
    const frame = Math.floor(Math.max(0, p.time) * p.fps);
    const random = frameRandom(p.seed, frame);
    const count = Math.round(p.points), knots = Math.max(3, Math.round(p.cycles * 5));
    const signal = Array.from({ length: knots + 1 }, () => random() * 2 - 1);
    const points = Array.from({ length: count }, (_, i) => {
      const progress = i / (count - 1);
      let value: number;
      if (p.waveform === 'random') {
        const u = progress * knots, k = Math.min(knots - 1, Math.floor(u)), f = u - k;
        const smooth = f * f * (3 - 2 * f);
        value = signal[k]! + (signal[k + 1]! - signal[k]!) * smooth;
      } else {
        const cycle = progress * p.cycles + p.time * p.speed + p.phase / 360;
        const angle = cycle * Math.PI * 2;
        const sine = Math.sin(angle);
        value = p.waveform === 'square' ? (sine >= 0 ? 1 : -1)
          : p.waveform === 'triangle' ? 2 / Math.PI * Math.asin(sine)
            : p.waveform === 'sawtooth' ? 2 * (cycle - Math.floor(cycle + 0.5))
              : sine;
      }
      const y = p.direction === 'bottom'
        ? p.height / 2 - (value + 1) * p.height * p.amplitude / 2
        : value * p.height * p.amplitude / 2;
      return [-p.width / 2 + i / (count - 1) * p.width, y] as Vec2;
    });
    const segs = points.slice(1).map((point, i) => line(points[i]!, point));
    if (p.fill) {
      const baseline = p.direction === 'bottom' ? p.height / 2 : 0;
      const rightBase: Vec2 = [p.width / 2, baseline];
      const leftBase: Vec2 = [-p.width / 2, baseline];
      segs.push(line(points.at(-1)!, rightBase), line(rightBase, leftBase), line(leftBase, points[0]!));
    }
    return [{ start: points[0]!, segs, closed: p.fill }];
  },
});

/** An autonomous seeded signal source drawn as changing vertical bars around a horizontal centreline. */
export const randomBars = defineShape({
  type: 'randombars', label: 'Random bars', timeDriven: true,
  // Keep the centreline fixed while the changing bar heights alter the geometry bounds.
  origin: () => [0, 0],
  params: {
    width: { type: 'number', default: 900, min: 1, step: 1, unit: 'px', group: 'Generator' },
    height: { type: 'number', default: 360, min: 1, step: 1, unit: 'px', group: 'Generator' },
    bars: { type: 'number', default: 72, min: 4, max: 500, step: 1, group: 'Generator' },
    amplitude: { type: 'number', default: 0.9, min: 0, max: 1, step: 0.01, group: 'Generator' },
    gap: { type: 'number', default: 0.24, min: 0, max: 0.9, step: 0.01, group: 'Generator', label: 'Gap' },
    direction: { type: 'enum', default: 'both', options: ['both', 'top', 'bottom'] as const, group: 'Generator', label: 'Direction' },
    ...dynamicSourceParams,
    ...sourceStyle,
    fill: { type: 'boolean', default: true, group: 'Style', label: 'Fill', animatable: false },
  },
  build(p) { return randomBarParts(p.width, p.height, p.bars, p.amplitude, p.gap, p.seed, p.time, p.fps, p.direction).flat(); },
  buildParts(p) { return randomBarParts(p.width, p.height, p.bars, p.amplitude, p.gap, p.seed, p.time, p.fps, p.direction); },
});

const randomBarParts = (width: number, height: number, count: number, amplitude: number, gap: number, seed: number, time: number, fps: number, direction: string) => {
  const bars = Math.round(count), cell = width / bars, barWidth = cell * (1 - gap);
  const random = frameRandom(seed, Math.floor(Math.max(0, time) * fps));
  return Array.from({ length: bars }, (_, i) => {
    const barHeight = height * amplitude * (0.08 + random() * 0.92);
    const sign = direction === 'top' ? -1 : direction === 'bottom' ? 1 : random() < 0.5 ? -1 : 1;
    const x = -width / 2 + i * cell + (cell - barWidth) / 2;
    const y = sign < 0 ? -barHeight : 0;
    return [closed([[x, y], [x + barWidth, y], [x + barWidth, y + barHeight], [x, y + barHeight]])];
  });
};

// Autonomous sources are objects in a scene, not drawing tools or stack modifiers.
export const autonomousGenerators = [randomWave, randomBars];

// The pawn, always last (it is the test shape).
export const shapes = [rectangle, ellipseShape, polygon, star, cross, arrow, lineShape, spiral, text, pawn];
export const shapeRegistry = new Map<string, ShapeDef>([...shapes, ...autonomousGenerators].map((s) => [s.type, s as ShapeDef]));

/** A primitive's geometry, with its style. */
export function buildShape(type: string, given: Record<string, unknown> = {}): Geometry {
  const def = shapeRegistry.get(type);
  if (!def) throw new Error(`svertik: unknown primitive "${type}"`);
  const p = resolveParams(def.params, given) as Record<string, unknown>;
  const parts = def.buildParts ? def.buildParts(p as never) : [def.build(p as never)];
  const gradients: Gradient[] = [];
  const fill = paintStyle(p.fill, p.fillColor, 'fill', gradients, 'sf');
  const stroke = (def.fixedStroke && !(type === 'randomwave' && p.fill) || p.stroke) ? paintStyle(true, p.strokeColor ?? p.fillColor, 'stroke', gradients, 'ss') : null;
  const st: Style = {
    fill: fill.value,
    ...(stroke ? { stroke: stroke.value, 'stroke-width': String(p.strokeWidth ?? 3), 'stroke-linejoin': String(p.strokeJoin ?? 'round'), 'stroke-linecap': String(p.strokeCap ?? 'round'), ...strokeExtraStyle(p) } : {}),
  };
  const tags = def.partTags?.(p as never) ?? [];
  const origin = def.origin?.(p as never);
  return {
    viewBox: [0, 0, 0, 0],
    shapes: parts.map((subpaths, i) => ({ subpaths, style: st, ...(def.buildParts ? { clone: i } : {}), ...(tags[i] ?? {}), ...(gradients.length ? { gradients } : {}) })),
    ...(origin ? { origin } : {}),
  };
}

function paintStyle(enabled: unknown, value: unknown, prop: 'fill' | 'stroke', out: Gradient[], prefix: string): { value: string } {
  if (!enabled) return { value: 'none' };
  const g = normalizeGradient(value, `${prefix}-${hashValue(value)}`);
  if (g) {
    out.push(g);
    return { value: `url(#${g.id})` };
  }
  return { value: String(value ?? (prop === 'fill' ? '#d9d9d9' : '#ededed')) };
}

function normalizeGradient(value: unknown, fallbackId: string): Gradient | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (v.kind !== 'linear' && v.kind !== 'radial') return null;
  const stops = Array.isArray(v.stops) ? v.stops.filter((s): s is { offset: number; color: string; opacity?: number } => !!s && typeof s === 'object') : [];
  if (!stops.length) return null;
  const id = typeof v.id === 'string' && v.id ? v.id : fallbackId;
  const g: Gradient = { id, kind: v.kind, stops: stops.map((s) => ({ offset: Number((s as any).offset) || 0, color: String((s as any).color ?? '#000'), ...((s as any).opacity != null ? { opacity: Number((s as any).opacity) } : {}) })) };
  const copyNum = (k: keyof Gradient) => { if (typeof v[k] === 'number') (g as any)[k] = v[k]; };
  const copyStr = (k: keyof Gradient) => { if (typeof v[k] === 'string') (g as any)[k] = v[k]; };
  ['x1','y1','x2','y2','cx','cy','r','fx','fy','fr'].forEach(copyNum as any);
  ['gradientUnits','gradientTransform','spreadMethod','href'].forEach(copyStr as any);
  return g;
}

function hashValue(v: unknown): string {
  const s = JSON.stringify(v) ?? '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
