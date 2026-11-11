// Geometry → SVG: as text (a plain SVG) or by updating a live <svg>.

import type { Geometry, Gradient, Shape, Style } from './geometry';

const SVG_NS = 'http://www.w3.org/2000/svg';

const fmt = (n: number, precision: number) => {
  const v = Number(n.toFixed(precision));
  return Object.is(v, -0) ? '0' : String(v);
};

export function toPathData(shape: Shape, precision = 2): string {
  const f = (n: number) => fmt(n, precision);
  let d = '';
  for (const sp of shape.subpaths) {
    d += `M${f(sp.start[0])} ${f(sp.start[1])}`;
    for (const s of sp.segs) {
      d += `C${f(s.c1[0])} ${f(s.c1[1])} ${f(s.c2[0])} ${f(s.c2[1])} ${f(s.p[0])} ${f(s.p[1])}`;
    }
    if (sp.closed) d += 'Z';
  }
  return d;
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
      return g.kind === 'radial'
        ? `<radialGradient id="${g.id}" cx="${g.cx ?? 0.5}" cy="${g.cy ?? 0.5}" r="${g.r ?? 0.5}" fx="${g.fx ?? g.cx ?? 0.5}" fy="${g.fy ?? g.cy ?? 0.5}">${stops}</radialGradient>`
        : `<linearGradient id="${g.id}" x1="${g.x1 ?? 0}" y1="${g.y1 ?? 0}" x2="${g.x2 ?? 1}" y2="${g.y2 ?? 0}">${stops}</linearGradient>`;
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

export interface ToSVGOptions {
  precision?: number;
}

/** SVG plano, autocontenido. */
export function toSVG(geo: Geometry, { precision = 2 }: ToSVGOptions = {}): string {
  const [x, y, w, h] = geo.viewBox;
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
      lines.push(`${'  '.repeat(i + 1)}<g ${k}="${v}">`);
    }
    open = wrap;
    lines.push(`${'  '.repeat(wrap.length + 1)}<path d="${toPathData(shape, precision)}"${styleAttrs(shape.style)}/>`);
  }
  for (let i = open.length - 1; i >= 0; i--) lines.push(`${'  '.repeat(i + 1)}</g>`);
  const paths = lines.join('\n');
  const defs = gradientDefs(geo) + filterDefs(geo);
  return `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}">\n${defs ? `  <defs>${defs}</defs>\n` : ''}${paths}\n</svg>\n`;
}

/**
 * Paints the geometry into an existing <svg>, reusing the <path> elements
 * between calls so the animation doesn't create nodes every frame.
 */
export function renderInto(svg: SVGSVGElement, geo: Geometry, { precision = 2 }: ToSVGOptions = {}): void {
  svg.setAttribute('viewBox', geo.viewBox.join(' '));
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
  const paths = Array.from(svg.querySelectorAll('path[data-svertik]'));
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
    let path = paths[i];
    if (!path) {
      path = svg.ownerDocument.createElementNS(SVG_NS, 'path');
      path.setAttribute('data-svertik', '');
    }
    // Inside the filter groups that apply to it (from outside in).
    let parent: Element = svg;
    for (const id of wrapOf(geo, shape)) {
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
      }
      parent = g;
    }
    place(parent, path);
    path.setAttribute('d', toPathData(shape, precision));
    if (shape.node) path.setAttribute('data-node', shape.node);
    else path.removeAttribute('data-node');
    // Style attributes it no longer has (an opacity, a stroke…) are removed: otherwise it would keep
    // the previous frame's. The renderer remembers which ones it set in data-svertik.
    const before = (path.getAttribute('data-svertik') ?? '').split(' ').filter(Boolean);
    const now: string[] = [];
    for (const [k, v] of Object.entries(shape.style)) {
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
    const css = cssOf(shape.style);
    if ((path.getAttribute('style') ?? '') !== css) {
      if (css) path.setAttribute('style', css);
      else path.removeAttribute('style');
    }
  });
  for (const extra of paths.slice(geo.shapes.length)) extra.remove();
  for (const g of groups.values()) if (!used.has(g)) g.remove();
}

const prefixes = new WeakMap<SVGSVGElement, string>();
let svgCount = 0;
const prefixOf = (svg: SVGSVGElement) => {
  let p = prefixes.get(svg);
  if (!p) prefixes.set(svg, (p = `s${++svgCount}-`));
  return p;
};
