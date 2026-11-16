// Geometry → SVG: as text (a plain SVG) or by updating a live <svg>.

import type { Geometry, Gradient, Shape, Style } from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

// A number as SVG writes it: `toFixed`, without the trailing zeros and without the "-0".
// (It is the same text as `String(Number(n.toFixed(precision)))`, which is what it used to be, but
// without turning the number into a string and back: this runs once per coordinate.)
const fmtSlow = (n: number, precision: number) => {
  const s = n.toFixed(precision);
  if (precision === 0 || s.indexOf('.') < 0) return s === '-0' ? '0' : s;
  let end = s.length;
  while (s.charCodeAt(end - 1) === 48) end--;
  if (s.charCodeAt(end - 1) === 46) end--;
  const t = s.slice(0, end);
  return t === '-0' ? '0' : t;
};

// Two decimals, which is what almost every drawing uses: the same text, in integers instead of
// going through `toFixed` (twice as fast, and this runs once per coordinate). Where the rounding
// could go either way — the product is a hair from a tie, or the number is too big for exact
// integers — it falls back to `toFixed`, which is always right.
const fmt =
  (n: number, precision: number) => {
    if (precision !== 2) return fmtSlow(n, precision);
    const v = n < 0 ? -n : n;
    const x = v * 100;
    const frac = x - Math.floor(x);
    if (x >= 9007199254740992 || Math.abs(frac - 0.5) < 8 * Number.EPSILON * (x > 1 ? x : 1)) return fmtSlow(n, 2);
    const r = Math.round(x);
    if (r === 0) return '0';
    const i = Math.floor(r / 100);
    const f = r - i * 100;
    const out = f === 0 ? '' + i : f < 10 ? i + '.0' + f : f % 10 === 0 ? i + '.' + f / 10 : i + '.' + f;
    return n < 0 ? '-' + out : out;
  };

/**
 * A shape's path data. With `lines`, cubics that are exact straight segments (control points at a third and
 * two thirds, as `line()` makes them) are written as `L`: the same drawing in about half the text, which
 * matters for effects with thousands of polygons (grain, halftone). Off by default: animated SVG interpolates
 * `d` between frames and needs the same commands in every frame.
 */
export function toPathData(shape: Shape, precision = 2, lines = false): string {
  const f = (n: number) => fmt(n, precision);
  let d = '';
  for (const sp of shape.subpaths) {
    d += `M${f(sp.start[0])} ${f(sp.start[1])}`;
    let p0 = sp.start;
    for (const s of sp.segs) {
      if (lines && isLine(p0, s)) d += `L${f(s.p[0])} ${f(s.p[1])}`;
      else d += `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`;
      p0 = s.p;
    }
    if (sp.closed) d += 'Z';
  }
  return d;
}

/** Whether a cubic is an exact straight segment from `p0` (control points on the chord at 1/3 and 2/3). */
function isLine(p0: readonly number[], s: Shape['subpaths'][number]['segs'][number]): boolean {
  const dx = s.p[0] - p0[0]!, dy = s.p[1] - p0[1]!;
  const eps = 1e-6 * Math.max(1, Math.abs(dx), Math.abs(dy));
  return (
    Math.abs(s.c1[0] - (p0[0]! + dx / 3)) <= eps && Math.abs(s.c1[1] - (p0[1]! + dy / 3)) <= eps &&
    Math.abs(s.c2[0] - (p0[0]! + (2 * dx) / 3)) <= eps && Math.abs(s.c2[1] - (p0[1]! + (2 * dy) / 3)) <= eps
  );
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Properties that only exist as CSS in SVG (not as attributes): they go in `style`. */
const CSS_ONLY = new Set(['mix-blend-mode', 'isolation']);
const cssOf = (style: Style) =>
  Object.entries(style)
    .filter(([k]) => CSS_ONLY.has(k))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

/** A shape's style attributes, as text (` fill="…" stroke="…"`). */
export const styleAttrs = (style: Style) => {
  const css = cssOf(style);
  return (
    Object.entries(style)
      .filter(([k]) => !CSS_ONLY.has(k))
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join('') + (css ? ` style="${escapeAttr(css)}"` : '')
  );
};

/** The gradients of all shapes, without repeats, as <defs> content. */
export function gradientDefs(geo: Geometry): string {
  const seen = new Map<string, Gradient>();
  for (const s of geo.shapes) for (const g of s.gradients ?? []) seen.set(g.id, g);
  return [...seen.values()]
    .map((g) => {
      const stops = g.stops
        .map((st) => `<stop offset="${st.offset}" stop-color="${escapeAttr(st.color)}"${st.opacity !== undefined && st.opacity < 1 ? ` stop-opacity="${st.opacity}"` : ''}/>`)
        .join('');
      const attrs = [
        `id="${g.id}"`,
        g.href ? `href="#${escapeAttr(g.href)}"` : '',
        g.gradientUnits && g.gradientUnits !== 'objectBoundingBox' ? `gradientUnits="${g.gradientUnits}"` : '',
        g.gradientTransform ? `gradientTransform="${escapeAttr(g.gradientTransform)}"` : '',
        g.spreadMethod && g.spreadMethod !== 'pad' ? `spreadMethod="${g.spreadMethod}"` : '',
      ];
      if (g.kind === 'radial') {
        attrs.push(
          `cx="${g.cx ?? 0.5}"`,
          `cy="${g.cy ?? 0.5}"`,
          `r="${g.r ?? 0.5}"`,
          `fx="${g.fx ?? g.cx ?? 0.5}"`,
          `fy="${g.fy ?? g.cy ?? 0.5}"`,
        );
        if (g.fr !== undefined) attrs.push(`fr="${g.fr}"`);
        return `<radialGradient ${attrs.filter(Boolean).join(' ')}>${stops}</radialGradient>`;
      }
      attrs.push(`x1="${g.x1 ?? 0}"`, `y1="${g.y1 ?? 0}"`, `x2="${g.x2 ?? 1}"`, `y2="${g.y2 ?? 0}"`);
      return `<linearGradient ${attrs.filter(Boolean).join(' ')}>${stops}</linearGradient>`;
    })
    .join('');
}

/** The filters wrapping a shape, only those that exist (an `@key` not yet placed on a node is left out). */
export const wrapOf = (geo: Geometry, shape: Shape): string[] => (shape.wrap ?? []).filter((id) => geo.filters?.[id]);

/** The geometry's filters (and masks), as <defs> content (with `prefix` before each id). */
export function filterDefs(geo: Geometry, prefix = ''): string {
  return Object.entries(geo.filters ?? {})
    .map(([id, f]) => {
      const [x, y, w, h] = f.region.map((n) => Math.round(n * 100) / 100);
      if (f.kind === 'mask')
        return `<mask id="${prefix}sv-m-${id}" maskUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}"${f.alpha ? ' style="mask-type:alpha"' : ''}>${f.markup}</mask>`;
      return `<filter id="${prefix}sv-f-${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">${f.markup}</filter>`;
    })
    .join('');
}

/** The attribute of the group that wraps shapes with a filter or a mask: [name, value]. */
export const wrapAttr = (geo: Geometry, id: string, prefix = ''): [string, string] =>
  geo.filters?.[id]?.kind === 'mask' ? ['mask', `url(#${prefix}sv-m-${id})`] : ['filter', `url(#${prefix}sv-f-${id})`];

/** Blend a filtered result with the scene behind its filter group. */
function filterBlends(geo: Geometry): Map<string, string | null> {
  const blends = new Map<string, string | null>();
  for (const shape of geo.shapes) {
    const id = shape.wrap?.find((key) => geo.filters?.[key]);
    if (!id) continue;
    const blend = shape.style['mix-blend-mode'] ?? null;
    if (!blends.has(id)) blends.set(id, blend);
    else if (blends.get(id) !== blend) blends.set(id, null);
  }
  return blends;
}

function drawnStyle(geo: Geometry, shape: Shape, blends: Map<string, string | null>): Style {
  const id = shape.wrap?.find((key) => geo.filters?.[key]);
  const blend = shape.style['mix-blend-mode'];
  const groupedBlend = !!blend && !!id && blends.get(id) === blend;
  if (!shape.image && !groupedBlend) return shape.style;
  const style = { ...shape.style };
  if (shape.image) for (const key of ['fill', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']) delete style[key];
  if (groupedBlend) delete style['mix-blend-mode'];
  return style;
}

export interface ToSVGOptions {
  precision?: number;
}

/** SVG plano, autocontenido. */
export function toSVG(geo: Geometry, { precision = 2 }: ToSVGOptions = {}): string {
  const [x, y, w, h] = geo.viewBox;
  const blends = filterBlends(geo);
  // The shapes of an object with filters go inside its <g filter> (nested if needed).
  const lines: string[] = [];
  let open: string[] = [];
  for (const shape of geo.shapes) {
    const wrap = wrapOf(geo, shape);
    let same = 0;
    while (same < open.length && same < wrap.length && open[same] === wrap[same]) same++;
    for (let i = open.length - 1; i >= same; i--) lines.push(`${'  '.repeat(i + 1)}</g>`);
    for (let i = same; i < wrap.length; i++) {
      const [k, v] = wrapAttr(geo, wrap[i]!);
      const blend = i === 0 ? blends.get(wrap[i]!) : null;
      lines.push(`${'  '.repeat(i + 1)}<g ${k}="${v}"${blend ? ` style="mix-blend-mode:${escapeAttr(blend)}"` : ''}>`);
    }
    open = wrap;
    if (shape.image) {
      const image = imagePlacement(shape);
      lines.push(`${'  '.repeat(wrap.length + 1)}<image href="${escapeAttr(shape.image.href)}" x="0" y="0" width="${shape.image.width}" height="${shape.image.height}" transform="${image}" preserveAspectRatio="${escapeAttr(shape.image.preserveAspectRatio)}"${styleAttrs(drawnStyle(geo, shape, blends))}/>`);
    } else lines.push(`${'  '.repeat(wrap.length + 1)}<path d="${toPathData(shape, precision, true)}"${styleAttrs(drawnStyle(geo, shape, blends))}/>`);
  }
  for (let i = open.length - 1; i >= 0; i--) lines.push(`${'  '.repeat(i + 1)}</g>`);
  const paths = lines.join('\n');
  const defs = gradientDefs(geo) + filterDefs(geo);
  return `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}">\n${defs ? `  <defs>${defs}</defs>\n` : ''}${paths}\n</svg>\n`;
}

/** Affine map from the source image rectangle onto its transformed path footprint. */
function imagePlacement(shape: Shape): string {
  const sp = shape.subpaths[0];
  if (!sp || sp.segs.length < 3 || !shape.image) return 'matrix(1 0 0 1 0 0)';
  const [x, y] = sp.start;
  const [rx, ry] = sp.segs[0]!.p;
  const [bx, by] = sp.segs[2]!.p;
  return `matrix(${(rx - x) / shape.image.width} ${(ry - y) / shape.image.width} ${(bx - x) / shape.image.height} ${(by - y) / shape.image.height} ${x} ${y})`;
}

/**
 * Paints the geometry into an existing <svg>, reusing the <path> elements
 * between calls so the animation doesn't create nodes every frame.
 */
export function renderInto(svg: SVGSVGElement, geo: Geometry, { precision = 2 }: ToSVGOptions = {}): void {
  svg.setAttribute('viewBox', geo.viewBox.join(' '));
  const blends = filterBlends(geo);
  // Filter ids of this <svg>: the same page may have others with the same objects.
  const prefix = prefixOf(svg);
  // Gradients and filters: a <defs> of its own, only rewritten when it changes.
  const defs = gradientDefs(geo) + filterDefs(geo, prefix);
  let defsEl = svg.querySelector(':scope > defs[data-svertik]');
  if (defs && !defsEl) {
    defsEl = svg.ownerDocument.createElementNS(SVG_NS, 'defs');
    defsEl.setAttribute('data-svertik', '');
    svg.insertBefore(defsEl, svg.firstChild);
  }
  if (defsEl && defsEl.innerHTML !== defs) defsEl.innerHTML = defs;
  const shapes = Array.from(svg.querySelectorAll('[data-svertik-shape]'));
  const groups = new Map(Array.from(svg.querySelectorAll('g[data-svertik-fx]'), (g) => [g.getAttribute('data-svertik-fx')!, g]));
  const used = new Set<Element>();
  // The last thing placed in each container: so only what is out of place moves.
  const lastIn = new Map<Element, Element | null>();
  const place = (parent: Element, el: Element) => {
    const prev = lastIn.has(parent) ? lastIn.get(parent)! : parent === svg ? (svg.querySelector(':scope > defs[data-svertik]') as Element | null) : null;
    if (el.parentNode !== parent || el.previousElementSibling !== prev) {
      if (prev) prev.after(el);
      else parent.prepend(el);
    }
    lastIn.set(parent, el);
  };
  geo.shapes.forEach((shape, i) => {
    const tag = shape.image ? 'image' : 'path';
    let path = shapes[i];
    if (path?.localName !== tag) {
      path?.remove();
      path = undefined;
    }
    if (!path) path = svg.ownerDocument.createElementNS(SVG_NS, tag);
    path.setAttribute('data-svertik-shape', '');
    // Inside the filter groups that apply to it (from outside in).
    let parent: Element = svg;
    for (const [depth, id] of wrapOf(geo, shape).entries()) {
      let g = groups.get(id);
      if (!g) {
        g = svg.ownerDocument.createElementNS(SVG_NS, 'g');
        g.setAttribute('data-svertik-fx', id);
        groups.set(id, g);
      }
      if (!used.has(g)) {
        place(parent, g);
        used.add(g);
        const [k, url] = wrapAttr(geo, id, prefix);
        if (g.getAttribute(k) !== url) g.setAttribute(k, url);
        g.removeAttribute(k === 'mask' ? 'filter' : 'mask');
        const blend = depth === 0 ? blends.get(id) : null;
        if (blend) g.setAttribute('style', `mix-blend-mode:${blend}`);
        else g.removeAttribute('style');
      }
      parent = g;
    }
    place(parent, path);
    if (shape.image) {
      const placement = imagePlacement(shape);
      const attrs: Record<string, string> = { href: shape.image.href, x: '0', y: '0', width: String(shape.image.width), height: String(shape.image.height), transform: placement, preserveAspectRatio: shape.image.preserveAspectRatio };
      for (const [k, v] of Object.entries(attrs)) if (path.getAttribute(k) !== v) path.setAttribute(k, v);
    } else path.setAttribute('d', toPathData(shape, precision, true));
    if (shape.node) path.setAttribute('data-node', shape.node);
    else path.removeAttribute('data-node');
    // Style attributes it no longer has (an opacity, a stroke…) are removed: otherwise it would keep
    // the previous frame's. The renderer remembers which ones it set in data-svertik.
    const before = (path.getAttribute('data-svertik') ?? '').split(' ').filter(Boolean);
    const now: string[] = [];
    const imageStyle = drawnStyle(geo, shape, blends);
    for (const [k, v] of Object.entries(imageStyle)) {
      if (CSS_ONLY.has(k)) continue;
      now.push(k);
      if (path.getAttribute(k) !== v) path.setAttribute(k, v);
    }
    for (const k of before) if (!now.includes(k)) path.removeAttribute(k);
    // Invisible (opacity 0): lets the pointer through to what is below (a faded flash doesn't block clicks).
    const hidden = Number(shape.style.opacity ?? 1) <= 0;
    if (hidden !== path.hasAttribute('pointer-events')) {
      if (hidden) path.setAttribute('pointer-events', 'none');
      else path.removeAttribute('pointer-events');
    }
    const list = now.join(' ');
    if ((path.getAttribute('data-svertik') ?? '') !== list) path.setAttribute('data-svertik', list);
    const css = cssOf(imageStyle);
    if ((path.getAttribute('style') ?? '') !== css) {
      if (css) path.setAttribute('style', css);
      else path.removeAttribute('style');
    }
  });
  for (const extra of shapes.slice(geo.shapes.length)) extra.remove();
  for (const g of groups.values()) if (!used.has(g)) g.remove();
}

const prefixes = new WeakMap<SVGSVGElement, string>();
let svgCount = 0;
const prefixOf = (svg: SVGSVGElement) => {
  let p = prefixes.get(svg);
  if (!p) prefixes.set(svg, (p = `s${++svgCount}-`));
  return p;
};
