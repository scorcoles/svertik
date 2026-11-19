// Geometry → Canvas 2D: the same drawing as the SVG renderer, painted into a <canvas>. For Play, where a
// scene with thousands of shapes costs more as live SVG elements than as one bitmap.
//
// What the canvas cannot do (SVG filters and masks), it leaves to SVG: `mountCanvas` paints those
// frames into the <svg> as usual. Not supported on the canvas: gradient spreadMethod reflect/repeat
// (they pad) and image preserveAspectRatio (images fill their footprint).

import { parseColor } from './color';
import type { Engine } from './engine';
import type { DocumentResult } from './document';
import { bounds, type Geometry, type Gradient, type Shape } from './geometry';
import { renderInto, type ToSVGOptions } from './render';
import type { SceneV1 } from './scene';

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const invert = (m: M): M | null => {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const asDOM = (m: M) => ({ a: m[0], b: m[1], c: m[2], d: m[3], e: m[4], f: m[5] });

/** Can the canvas paint this geometry? SVG filters and masks need the <svg>. */
export function canvasCanPaint(geo: Geometry): boolean {
  const fx = geo.filters;
  if (!fx || !Object.keys(fx).length) return true;
  return !geo.shapes.some((s) => s.wrap?.some((id) => fx[id]));
}

/** A shape's outline as a Path2D (cubic segments, as the engine keeps them). */
const paths = new WeakMap<Shape['subpaths'], Path2D>();
function pathOf(shape: Shape): Path2D {
  const known = paths.get(shape.subpaths);
  if (known) return known;
  const p = new Path2D();
  for (const sp of shape.subpaths) {
    p.moveTo(sp.start[0], sp.start[1]);
    for (const s of sp.segs) p.bezierCurveTo(s.c1[0], s.c1[1], s.c2[0], s.c2[1], s.p[0], s.p[1]);
    if (sp.closed) p.closePath();
  }
  paths.set(shape.subpaths, p);
  return p;
}

const num = (v: string | undefined, fallback: number) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) ? n : fallback;
};

/** CSS blend modes have the same names as canvas composite operations; normal is source-over. */
const composite = (blend: string | undefined): GlobalCompositeOperation =>
  !blend || blend === 'normal' ? 'source-over' : (blend as GlobalCompositeOperation);

/** An SVG transform list (`matrix`, `translate`, `scale`, `rotate`, `skewX`, `skewY`) as one matrix. */
export function parseTransform(text: string | undefined): M {
  let m: M = [1, 0, 0, 1, 0, 0];
  if (!text) return m;
  for (const [, fn, args] of text.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = args!.split(/[\s,]+/).filter(Boolean).map(Number);
    const rad = (d: number) => (d * Math.PI) / 180;
    let t: M | null = null;
    if (fn === 'matrix' && a.length >= 6) t = [a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!];
    else if (fn === 'translate') t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (fn === 'scale') t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const r = rad(a[0] ?? 0), c = Math.cos(r), s = Math.sin(r), cx = a[1] ?? 0, cy = a[2] ?? 0;
      t = mul(mul([1, 0, 0, 1, cx, cy], [c, s, -s, c, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === 'skewX') t = [1, 0, Math.tan(rad(a[0] ?? 0)), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(rad(a[0] ?? 0)), 0, 1, 0, 0];
    if (t) m = mul(m, t);
  }
  return m;
}

/** A gradient with what it inherits through `href` (stops and attributes it does not set itself). */
function resolveGradient(g: Gradient, all: Gradient[], depth = 0): Gradient {
  if (!g.href || depth > 8) return g;
  const base = all.find((x) => x.id === g.href);
  if (!base) return g;
  const parent = resolveGradient(base, all, depth + 1);
  const out = { ...parent, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v !== undefined)) } as Gradient;
  out.kind = g.kind;
  out.stops = g.stops.length ? g.stops : parent.stops;
  return out;
}

const stopColor = (color: string, opacity = 1) => {
  const c = parseColor(color);
  if (!c) return color;
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${c[3] * opacity})`;
};

/**
 * Paints `path` with an SVG gradient. The gradient lives in its own space (the shape's box for
 * objectBoundingBox, then its gradientTransform); the canvas is moved into that space and the path is
 * mapped back, so skewed or stretched gradients look as they do in SVG.
 */
function paintGradient(ctx: CanvasRenderingContext2D, path: Path2D, g: Gradient, shape: Shape, how: { stroke: false; rule: CanvasFillRule } | { stroke: true; width: number }) {
  const box = bounds({ shapes: [shape], viewBox: [0, 0, 0, 0] });
  const units: M = g.gradientUnits === 'userSpaceOnUse' ? [1, 0, 0, 1, 0, 0] : [box.width || 1, 0, 0, box.height || 1, box.x, box.y];
  const space = mul(units, parseTransform(g.gradientTransform));
  const back = invert(space);
  if (!back) return;
  const grad = g.kind === 'radial'
    ? ctx.createRadialGradient(g.fx ?? g.cx ?? 0.5, g.fy ?? g.cy ?? 0.5, g.fr ?? 0, g.cx ?? 0.5, g.cy ?? 0.5, g.r ?? 0.5)
    : ctx.createLinearGradient(g.x1 ?? 0, g.y1 ?? 0, g.x2 ?? 1, g.y2 ?? 0);
  let last = 0;
  for (const s of g.stops) {
    // SVG clamps offsets into order; the canvas throws on a step back.
    last = Math.max(last, Math.min(1, Math.max(0, s.offset)));
    grad.addColorStop(last, stopColor(s.color, s.opacity));
  }
  const mapped = new Path2D();
  mapped.addPath(path, asDOM(back));
  ctx.save();
  ctx.transform(...space);
  if (how.stroke) {
    ctx.strokeStyle = grad;
    // The line width as it would be on the page, roughly (exact when the gradient space is not skewed).
    ctx.lineWidth = how.width / Math.sqrt(Math.abs(space[0] * space[3] - space[1] * space[2]) || 1);
    ctx.stroke(mapped);
  } else {
    ctx.fillStyle = grad;
    ctx.fill(mapped, how.rule);
  }
  ctx.restore();
}

/** What a painted shape answers to the pointer (the same rules as the SVG: its fill, its stroke). */
interface Hit {
  node: string;
  path: Path2D;
  fill: boolean;
  rule: CanvasFillRule;
  stroke: number;
}

/** Loaded images, by href; a new one asks for a repaint when it arrives. */
export type ImageCache = Map<string, HTMLImageElement>;

export interface PaintOptions {
  images?: ImageCache;
  /** Called when an image that was still loading is ready. */
  onImage?: () => void;
}

/**
 * Paints the geometry on a context whose canvas covers its viewBox. Returns what the pointer can hit,
 * front first, in document coordinates.
 */
export function paintCanvas(ctx: CanvasRenderingContext2D, geo: Geometry, options: PaintOptions = {}): Hit[] {
  const { width: cw, height: ch } = ctx.canvas;
  const [vx, vy, vw, vh] = geo.viewBox;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, cw, ch);
  if (!vw || !vh) return [];
  const base: M = [cw / vw, 0, 0, ch / vh, ((0 - vx) * cw) / vw, ((0 - vy) * ch) / vh];
  const hits: Hit[] = [];
  for (const shape of geo.shapes) {
    const st = shape.style;
    const opacity = Math.max(0, Math.min(1, num(st.opacity, 1)));
    // Invisible: not drawn and lets the pointer through (as the SVG's pointer-events none).
    if (opacity <= 0) continue;
    ctx.setTransform(...base);
    ctx.globalCompositeOperation = composite(st['mix-blend-mode']);
    const path = pathOf(shape);
    if (shape.image) {
      paintImage(ctx, shape, opacity, options);
      if (shape.node) hits.push({ node: shape.node, path, fill: true, rule: 'nonzero', stroke: 0 });
      continue;
    }
    const gradients = shape.gradients ?? [];
    const paintOf = (value: string) => {
      const ref = /^url\(#([^)]+)\)$/.exec(value);
      const g = ref ? gradients.find((x) => x.id === ref[1]) : undefined;
      return g ? resolveGradient(g, gradients) : value;
    };
    // SVG defaults: black fill, no stroke.
    const fillValue = st.fill ?? '#000000';
    const strokeValue = st.stroke ?? 'none';
    const fills = fillValue !== 'none';
    const strokeWidth = strokeValue !== 'none' ? Math.max(0, num(st['stroke-width'], 1)) : 0;
    const rule: CanvasFillRule = st['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero';
    const doFill = () => {
      if (!fills) return;
      ctx.globalAlpha = opacity * Math.max(0, Math.min(1, num(st['fill-opacity'], 1)));
      const paint = paintOf(fillValue);
      if (typeof paint === 'string') {
        ctx.fillStyle = paint;
        ctx.fill(path, rule);
      } else paintGradient(ctx, path, paint, shape, { stroke: false, rule });
    };
    const doStroke = () => {
      if (!strokeWidth) return;
      ctx.globalAlpha = opacity * Math.max(0, Math.min(1, num(st['stroke-opacity'], 1)));
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = (st['stroke-linecap'] as CanvasLineCap) ?? 'butt';
      ctx.lineJoin = (st['stroke-linejoin'] as CanvasLineJoin) ?? 'miter';
      ctx.miterLimit = num(st['stroke-miterlimit'], 4);
      const dash = (st['stroke-dasharray'] ?? '').split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n >= 0);
      ctx.setLineDash(dash.some((n) => n > 0) ? dash : []);
      ctx.lineDashOffset = num(st['stroke-dashoffset'], 0);
      const paint = paintOf(strokeValue);
      if (typeof paint === 'string') {
        ctx.strokeStyle = paint;
        ctx.stroke(path);
      } else paintGradient(ctx, path, paint, shape, { stroke: true, width: strokeWidth });
      ctx.setLineDash([]);
    };
    if ((st['paint-order'] ?? '').trim().startsWith('stroke')) {
      doStroke();
      doFill();
    } else {
      doFill();
      doStroke();
    }
    if (shape.node && (fills || strokeWidth)) hits.push({ node: shape.node, path, fill: fills, rule, stroke: strokeWidth });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  return hits.reverse();
}

function paintImage(ctx: CanvasRenderingContext2D, shape: Shape, opacity: number, options: PaintOptions) {
  const image = shape.image!;
  const sp = shape.subpaths[0];
  if (!sp || sp.segs.length < 3 || typeof Image === 'undefined') return;
  const images = options.images;
  let img = images?.get(image.href);
  if (!img) {
    img = new Image();
    img.onload = () => options.onImage?.();
    img.src = image.href;
    images?.set(image.href, img);
  }
  if (!img.complete || !img.naturalWidth) return;
  // The same placement as the SVG <image>: its rectangle onto the transformed footprint.
  const [x, y] = sp.start, [rx, ry] = sp.segs[0]!.p, [bx, by] = sp.segs[2]!.p;
  ctx.save();
  ctx.transform((rx - x) / image.width, (ry - y) / image.width, (bx - x) / image.height, (by - y) / image.height, x, y);
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, 0, 0, image.width, image.height);
  ctx.restore();
}

/** The object under a point (document coordinates), front first: as the SVG's own hit-testing. */
export function hitTest(ctx: CanvasRenderingContext2D, hits: Hit[], x: number, y: number): string | null {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    for (const h of hits) {
      if (h.fill && ctx.isPointInPath(h.path, x, y, h.rule)) return h.node;
      if (h.stroke) {
        ctx.lineWidth = h.stroke;
        if (ctx.isPointInStroke(h.path, x, y)) return h.node;
      }
    }
    return null;
  } finally {
    ctx.restore();
  }
}

/**
 * Which renderer paints a frame. `svg` (default): live SVG elements. `canvas`: a <canvas> inside the
 * <svg>, except for frames with filters or masks. `auto`: canvas only when a frame has many shapes
 * (`CANVAS_FROM` or more) and nothing the canvas cannot paint.
 */
export type Renderer = 'svg' | 'canvas' | 'auto';
export const CANVAS_FROM = 800;

const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The largest canvas side, in pixels (browsers refuse much bigger ones). */
const MAX_SIDE = 8192;

export interface Mounted {
  update(scene: SceneV1): void;
  doc(): DocumentResult | null;
  /** Whether the last frame went to the canvas (then the pointer is tested with `hit`, not the DOM). */
  onCanvas(): boolean;
  /** The object under a point on screen, when the last frame went to the canvas. */
  hit(clientX: number, clientY: number): string | null;
  /** The element that receives the pointer while painting on the canvas (to set its cursor). */
  surface(): HTMLCanvasElement | null;
  /** The chosen renderer, and a new one (the current frame is repainted with it). */
  renderer(): Renderer;
  setRenderer(renderer: Renderer): void;
  destroy(): void;
}

/**
 * Like `engine.mount`, painting each frame on a canvas or as SVG (see `Renderer`). The canvas sits in a
 * <foreignObject> over the viewBox, so the <svg> keeps its size, its fit (preserveAspectRatio), its
 * pointer events and its coordinates; only the pixels change hands.
 */
export function mountCanvas(engine: Engine, svg: SVGSVGElement, scene: SceneV1, initial: Renderer, options?: ToSVGOptions): Mounted {
  let renderer = initial;
  let last: DocumentResult | null = null;
  let hits: Hit[] = [];
  let canvasFrame = false;
  let svgHasShapes = false;
  const images: ImageCache = new Map();
  const doc = svg.ownerDocument;
  const holder = doc.createElementNS(SVG_NS, 'foreignObject');
  holder.setAttribute('data-svertik-canvas', '');
  const canvas = doc.createElementNS(XHTML, 'canvas') as HTMLCanvasElement;
  canvas.style.cssText = 'display:block;width:100%;height:100%';
  holder.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  holder.style.display = 'none';
  svg.appendChild(holder);

  let lastScene = scene;
  const paint = (s: SceneV1) => {
    lastScene = s;
    last = engine.evaluateDocument(s);
    const geo = last.geometry;
    // Wire (outlines only) is CSS on the SVG paths: while it is on, frames go to SVG.
    const wire = svg.classList.contains('wire');
    const wantCanvas = !!ctx && !wire && renderer !== 'svg' && canvasCanPaint(geo) && (renderer === 'canvas' || geo.shapes.length >= CANVAS_FROM);
    if (!wantCanvas) {
      if (canvasFrame) holder.style.display = 'none';
      canvasFrame = false;
      hits = [];
      renderInto(svg, geo, options);
      svgHasShapes = true;
      return;
    }
    // Leaving SVG: its elements go (an empty frame keeps the viewBox).
    if (svgHasShapes) {
      renderInto(svg, { ...geo, shapes: [], filters: undefined }, options);
      svgHasShapes = false;
    }
    const [vx, vy, vw, vh] = geo.viewBox;
    svg.setAttribute('viewBox', geo.viewBox.join(' '));
    const set = (k: string, v: number) => { if (holder.getAttribute(k) !== String(v)) holder.setAttribute(k, String(v)); };
    set('x', vx); set('y', vy); set('width', vw); set('height', vh);
    if (!canvasFrame) holder.style.display = '';
    canvasFrame = true;
    // Pixels: the viewBox at its size on screen, times the device's density.
    const m = svg.getScreenCTM?.();
    const dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const sx = m ? Math.hypot(m.a, m.b) : 1, sy = m ? Math.hypot(m.c, m.d) : 1;
    const k = Math.min(1, MAX_SIDE / Math.max(1, vw * sx * dpr, vh * sy * dpr));
    const pw = Math.max(1, Math.round(vw * sx * dpr * k)), ph = Math.max(1, Math.round(vh * sy * dpr * k));
    if (canvas.width !== pw) canvas.width = pw;
    if (canvas.height !== ph) canvas.height = ph;
    hits = paintCanvas(ctx!, geo, { images, onImage: () => last && paintCanvas(ctx!, last.geometry, { images }) });
  };
  paint(scene);
  // Wire switched on or off (W): repaint now, with the renderer that suits it, even on a still frame.
  let wireWas = svg.classList.contains('wire');
  const watch = typeof MutationObserver === 'function' ? new MutationObserver(() => {
    const wire = svg.classList.contains('wire');
    if (wire !== wireWas) {
      wireWas = wire;
      paint(lastScene);
    }
  }) : null;
  watch?.observe(svg, { attributes: true, attributeFilter: ['class'] });
  return {
    update: paint,
    doc: () => last,
    onCanvas: () => canvasFrame,
    hit(clientX, clientY) {
      if (!canvasFrame || !ctx) return null;
      const m = svg.getScreenCTM?.();
      if (!m) return null;
      const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
      return hitTest(ctx, hits, p.x, p.y);
    },
    surface: () => (canvasFrame ? canvas : null),
    renderer: () => renderer,
    setRenderer(next) {
      if (next === renderer) return;
      renderer = next;
      paint(lastScene);
    },
    destroy() {
      watch?.disconnect();
      holder.remove();
    },
  };
}
