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

const styleAttrs = (style: Style) => {
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

export interface ToSVGOptions {
  precision?: number;
}

/** SVG plano, autocontenido. */
export function toSVG(geo: Geometry, { precision = 2 }: ToSVGOptions = {}): string {
  const [x, y, w, h] = geo.viewBox;
  const paths = geo.shapes
    .map((shape) => `  <path d="${toPathData(shape, precision)}"${styleAttrs(shape.style)}/>`)
    .join('\n');
  const defs = gradientDefs(geo);
  return `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}">\n${defs ? `  <defs>${defs}</defs>\n` : ''}${paths}\n</svg>\n`;
}

/**
 * Pinta la geometría dentro de un <svg> existente, reutilizando los <path>
 * entre llamadas para que la animación no cree nodos en cada fotograma.
 */
export function renderInto(svg: SVGSVGElement, geo: Geometry, { precision = 2 }: ToSVGOptions = {}): void {
  svg.setAttribute('viewBox', geo.viewBox.join(' '));
  // Degradados: un <defs> propio, que solo se reescribe si cambia.
  const defs = gradientDefs(geo);
  let defsEl = svg.querySelector(':scope > defs[data-svertik]');
  if (defs && !defsEl) {
    defsEl = svg.ownerDocument.createElementNS(SVG_NS, 'defs');
    defsEl.setAttribute('data-svertik', '');
    svg.insertBefore(defsEl, svg.firstChild);
  }
  if (defsEl && defsEl.innerHTML !== defs) defsEl.innerHTML = defs;
  const paths = Array.from(svg.querySelectorAll(':scope > path[data-svertik]'));
  geo.shapes.forEach((shape, i) => {
    let path = paths[i];
    if (!path) {
      path = svg.ownerDocument.createElementNS(SVG_NS, 'path');
      path.setAttribute('data-svertik', '');
      svg.appendChild(path);
    }
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
    const list = now.join(' ');
    if ((path.getAttribute('data-svertik') ?? '') !== list) path.setAttribute('data-svertik', list);
    const css = cssOf(shape.style);
    if ((path.getAttribute('style') ?? '') !== css) {
      if (css) path.setAttribute('style', css);
      else path.removeAttribute('style');
    }
  });
  for (const extra of paths.slice(geo.shapes.length)) extra.remove();
}
