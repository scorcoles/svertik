// Geometry → SVG: como texto (SVG plano) o actualizando un <svg> vivo.

import type { Geometry, Shape, Style } from './geometry';

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

const styleAttrs = (style: Style) =>
  Object.entries(style)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join('');

export interface ToSVGOptions {
  precision?: number;
}

/** SVG plano, autocontenido. */
export function toSVG(geo: Geometry, { precision = 2 }: ToSVGOptions = {}): string {
  const [x, y, w, h] = geo.viewBox;
  const paths = geo.shapes
    .map((shape) => `  <path d="${toPathData(shape, precision)}"${styleAttrs(shape.style)}/>`)
    .join('\n');
  return `<svg xmlns="${SVG_NS}" viewBox="${x} ${y} ${w} ${h}">\n${paths}\n</svg>\n`;
}

/**
 * Pinta la geometría dentro de un <svg> existente, reutilizando los <path>
 * entre llamadas para que la animación no cree nodos en cada fotograma.
 */
export function renderInto(svg: SVGSVGElement, geo: Geometry, { precision = 2 }: ToSVGOptions = {}): void {
  svg.setAttribute('viewBox', geo.viewBox.join(' '));
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
    for (const [k, v] of Object.entries(shape.style)) {
      if (path.getAttribute(k) !== v) path.setAttribute(k, v);
    }
  });
  for (const extra of paths.slice(geo.shapes.length)) extra.remove();
}
