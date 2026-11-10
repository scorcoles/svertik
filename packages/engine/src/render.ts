// Geometry → SVG: como texto (SVG plano) o actualizando un <svg> vivo.

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

/** Propiedades que en SVG solo existen como CSS (no como atributo): van en `style`. */
const CSS_ONLY = new Set(['mix-blend-mode', 'isolation']);
const cssOf = (style: Style) =>
  Object.entries(style)
    .filter(([k]) => CSS_ONLY.has(k))
    .map(([k, v]) => `${k}:${v}`)
    .join(';');

/** Los atributos de estilo de una forma, como texto (` fill="…" stroke="…"`). */
export const styleAttrs = (style: Style) => {
  const css = cssOf(style);
  return (
    Object.entries(style)
      .filter(([k]) => !CSS_ONLY.has(k))
      .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
      .join('') + (css ? ` style="${escapeAttr(css)}"` : '')
  );
};

/** Los degradados de todas las formas, sin repetir, como contenido de <defs>. */
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

/** Los filtros de la geometría, como contenido de <defs> (con `prefix` delante de cada id). */
export function filterDefs(geo: Geometry, prefix = ''): string {
  return Object.entries(geo.filters ?? {})
    .map(([id, f]) => {
      const [x, y, w, h] = f.region.map((n) => Math.round(n * 100) / 100);
      return `<filter id="${prefix}sv-f-${id}" filterUnits="userSpaceOnUse" x="${x}" y="${y}" width="${w}" height="${h}" color-interpolation-filters="sRGB">${f.markup}</filter>`;
    })
    .join('');
}

export interface ToSVGOptions {
  precision?: number;
}

/** SVG plano, autocontenido. */
export function toSVG(geo: Geometry, { precision = 2 }: ToSVGOptions = {}): string {
  const [x, y, w, h] = geo.viewBox;
  // Las formas de un objeto con filtros, dentro de su <g filter> (anidados, si hace falta).
  const lines: string[] = [];
  let open: string[] = [];
  for (const shape of geo.shapes) {
    const wrap = shape.wrap ?? [];
    let same = 0;
    while (same < open.length && same < wrap.length && open[same] === wrap[same]) same++;
    for (let i = open.length - 1; i >= same; i--) lines.push(`${'  '.repeat(i + 1)}</g>`);
    for (let i = same; i < wrap.length; i++) lines.push(`${'  '.repeat(i + 1)}<g filter="url(#sv-f-${wrap[i]})">`);
    open = wrap;
    lines.push(`${'  '.repeat(wrap.length + 1)}<path d="${toPathData(shape, precision)}"${styleAttrs(shape.style)}/>`);
  }
  for (let i = open.length - 1; i >= 0; i--) lines.push(`${'  '.repeat(i + 1)}</g>`);
  const paths = lines.join('\n');
  const defs = gradientDefs(geo) + filterDefs(geo);
  return `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}">\n${defs ? `  <defs>${defs}</defs>\n` : ''}${paths}\n</svg>\n`;
}

/**
 * Pinta la geometría dentro de un <svg> existente, reutilizando los <path>
 * entre llamadas para que la animación no cree nodos en cada fotograma.
 */
export function renderInto(svg: SVGSVGElement, geo: Geometry, { precision = 2 }: ToSVGOptions = {}): void {
  svg.setAttribute('viewBox', geo.viewBox.join(' '));
  // Ids de filtro propios de este <svg>: en la misma página puede haber otros con los mismos objetos.
  const prefix = prefixOf(svg);
  // Degradados y filtros: un <defs> propio, que solo se reescribe si cambia.
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
  // Lo último que se ha colocado en cada contenedor: así solo se mueve lo que no está en su sitio.
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
    // Dentro de los grupos con filtro que le tocan (de fuera adentro).
    let parent: Element = svg;
    for (const id of shape.wrap ?? []) {
      let g = groups.get(id);
      if (!g) {
        g = svg.ownerDocument.createElementNS(SVG_NS, 'g');
        g.setAttribute('data-svertik-fx', id);
        groups.set(id, g);
      }
      if (!used.has(g)) {
        place(parent, g);
        used.add(g);
        const url = `url(#${prefix}sv-f-${id})`;
        if (g.getAttribute('filter') !== url) g.setAttribute('filter', url);
      }
      parent = g;
    }
    place(parent, path);
    path.setAttribute('d', toPathData(shape, precision));
    if (shape.node) path.setAttribute('data-node', shape.node);
    else path.removeAttribute('data-node');
    // Los atributos de estilo que ya no tiene (una opacidad, un trazo…) se quitan: si no, se quedaría
    // con los del fotograma anterior. Se recuerda cuáles puso el render en data-svertik.
    const before = (path.getAttribute('data-svertik') ?? '').split(' ').filter(Boolean);
    const now: string[] = [];
    for (const [k, v] of Object.entries(shape.style)) {
      if (CSS_ONLY.has(k)) continue;
      now.push(k);
      if (path.getAttribute(k) !== v) path.setAttribute(k, v);
    }
    for (const k of before) if (!now.includes(k)) path.removeAttribute(k);
    // Invisible (opacidad 0): deja pasar el puntero a lo que haya debajo (un destello apagado no tapa los clics).
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
