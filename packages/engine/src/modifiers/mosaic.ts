import { intersection, type MultiPolygon, type Pair } from 'polygon-clipping';
import { regionOf, toSubPath } from '../clip';
import { bounds, type Bounds, type Shape } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Mosaico: recorta el dibujo en teselas (rectángulos, triángulos, hexágonos o círculos) sobre una rejilla
 * de columnas × filas, con separación en X e Y. Cada tesela es un elemento (como una copia de Clone),
 * así que Step, Color o Boolean la tratan por separado. Solo las superficies: las líneas abiertas se pierden.
 */
export const mosaic = defineModifier({
  type: 'mosaic',
  label: 'Mosaic',
  kind: 'generator',
  params: {
    columns: { type: 'number', default: 8, min: 1, max: 60, step: 1, ramp: false, pair: 'rows' },
    rows: { type: 'number', default: 8, min: 1, max: 60, step: 1, ramp: false },
    tile: { type: 'enum', default: 'rect', options: ['rect', 'triangle', 'hexagon', 'circle'] as const, label: 'Tile', animatable: false },
    gutter: { type: 'point', default: [0.1, 0.1], unit: 'fraction', label: 'Gutter', handle: false, linkable: true, random: [0, 0.4] },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    if (b.width <= 0 || b.height <= 0) return geo;
    const cols = Math.max(1, Math.round(p.columns));
    const rows = Math.max(1, Math.round(p.rows));
    const [gx, gy] = [clamp01(p.gutter[0]), clamp01(p.gutter[1])];
    const step = Math.max(ctx.resolution, 1e-3);
    // Cada forma, como superficie (con su caja, para no recortar contra teselas que no toca).
    const regions = geo.shapes
      .map((s) => ({ s, r: regionOf([s], step) }))
      .filter((x) => x.r.length)
      .map((x) => ({ ...x, box: boxOf(x.r) }));
    const out: Shape[] = [];
    tiles(p.tile, b, cols, rows).forEach((poly, index) => {
      // La separación encoge cada tesela alrededor de su centro.
      const t = shrink(poly, 1 - gx, 1 - gy);
      const tb = boxOfRing(t);
      for (const { s, r, box } of regions) {
        if (box.x > tb.x + tb.width || box.x + box.width < tb.x || box.y > tb.y + tb.height || box.y + box.height < tb.y) continue;
        const cut = intersection(r, [[t]]);
        const subpaths = cut.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
        if (subpaths.length) out.push({ ...s, subpaths, clone: index });
      }
    });
    return { viewBox: geo.viewBox, shapes: out };
  },
});

const clamp01 = (n: number) => Math.max(0, Math.min(0.95, n));

/** Las teselas, en orden de lectura (filas de arriba abajo, de izquierda a derecha). */
function tiles(kind: string, b: Bounds, cols: number, rows: number): Pair[][] {
  const cw = b.width / cols, ch = b.height / rows;
  const out: Pair[][] = [];
  if (kind === 'triangle') {
    // Triángulos alternos (hacia arriba y hacia abajo), dos por celda más los de los bordes.
    for (let r = 0; r < rows; r++) {
      const y0 = b.y + r * ch, y1 = y0 + ch;
      for (let i = 0; i <= cols * 2; i++) {
        const x = b.x + ((i - 1) * cw) / 2;
        out.push((i + r) % 2 === 0 ? [[x, y1], [x + cw, y1], [x + cw / 2, y0]] : [[x, y0], [x + cw, y0], [x + cw / 2, y1]]);
      }
    }
    return out;
  }
  if (kind === 'hexagon') {
    // Hexágonos con punta arriba: `cols` de ancho; filas a 3/4 de su alto, las impares desplazadas media celda.
    const sx = cw / Math.sqrt(3), sy = ch / 1.5;
    const n = Math.ceil(b.height / ch) + 1;
    for (let r = 0; r <= n; r++) {
      const cy = b.y + r * ch;
      const shift = r % 2 ? cw / 2 : 0;
      for (let c = -1; c <= cols; c++) {
        const cx = b.x + c * cw + cw / 2 + shift;
        out.push(Array.from({ length: 6 }, (_, k) => {
          const a = ((60 * k - 90) * Math.PI) / 180;
          return [cx + Math.cos(a) * sx, cy + Math.sin(a) * sy] as Pair;
        }));
      }
    }
    return out;
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = b.x + c * cw, y0 = b.y + r * ch;
      if (kind === 'circle') {
        // Círculo (o elipse, si la celda no es cuadrada) inscrito en la celda.
        const cx = x0 + cw / 2, cy = y0 + ch / 2;
        out.push(Array.from({ length: 48 }, (_, k) => {
          const a = (k / 48) * Math.PI * 2;
          return [cx + (Math.cos(a) * cw) / 2, cy + (Math.sin(a) * ch) / 2] as Pair;
        }));
      } else out.push([[x0, y0], [x0 + cw, y0], [x0 + cw, y0 + ch], [x0, y0 + ch]]);
    }
  }
  return out;
}

/** Escala un polígono alrededor de su centro (la media de sus vértices) y lo cierra. */
function shrink(poly: Pair[], kx: number, ky: number): Pair[] {
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length;
  const cy = poly.reduce((s, q) => s + q[1], 0) / poly.length;
  const pts = poly.map(([x, y]) => [cx + (x - cx) * kx, cy + (y - cy) * ky] as Pair);
  return [...pts, pts[0]!];
}

function boxOfRing(r: Pair[]): Bounds {
  const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function boxOf(m: MultiPolygon): Bounds {
  return boxOfRing(m.flatMap((poly) => poly.flat()));
}
