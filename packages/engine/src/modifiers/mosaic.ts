import { intersection, type MultiPolygon, type Pair } from '../polygon';
import { covers, regionOf, simplify, toSubPath } from '../clip';
import { bounds, mapPoints, type Bounds, type Shape } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Mosaico: recorta el dibujo en teselas sobre una rejilla de columnas × filas, con separación en X e Y
 * y la red girada `angle` grados. Las teselas son rectángulos, triángulos o hexágonos (encajan sin huecos),
 * o una forma por celda: círculo, polígono, estrella u otro objeto de la escena (`shape`).
 * `fit`: `cut` recorta el dibujo con cada tesela (en los bordes quedan trozos); `whole` pone la tesela
 * entera donde el dibujo cubre al menos la mitad, con su estilo. Cada tesela es un elemento (como una copia
 * de Clone), así que Step, Color o Boolean la tratan por separado. Solo las superficies: las líneas abiertas se pierden.
 */
export const mosaic = defineModifier({
  type: 'mosaic',
  label: 'Mosaic',
  kind: 'generator',
  params: {
    columns: { type: 'number', default: 8, min: 1, max: 60, step: 1, ramp: false, pair: 'rows' },
    rows: { type: 'number', default: 8, min: 1, max: 60, step: 1, ramp: false },
    tile: { type: 'enum', default: 'rect', options: ['rect', 'triangle', 'hexagon', 'circle', 'polygon', 'star', 'shape'] as const, label: 'Tile', animatable: false },
    sides: { type: 'number', default: 5, min: 3, max: 12, step: 1, ramp: false, label: 'Sides', showIf: { tile: ['polygon', 'star'] } },
    source: { type: 'node', default: '', label: 'Shape', showIf: { tile: ['shape'] } },
    fit: { type: 'enum', default: 'cut', options: ['cut', 'whole'] as const, label: 'Fit', animatable: false },
    // Separación entre teselas, en las unidades del dibujo (px), en X y en Y.
    gutter: { type: 'point', default: [4, 4], unit: 'px', step: 0.5, min: 0, label: 'Gutter', handle: false, linkable: true, random: [0, 16] },
    angle: { type: 'angle', default: 0, ramp: false, random: [-45, 45] },
  },
  apply(geo, p, ctx) {
    const b0 = bounds(geo);
    if (b0.width <= 0 || b0.height <= 0) return geo;
    // Red girada: se calcula en el marco de la red (el dibujo girado al revés alrededor de su centro)
    // y cada tesela se gira de vuelta. Así columnas × filas cubren siempre el dibujo entero.
    const c: Pair = [b0.x + b0.width / 2, b0.y + b0.height / 2];
    const a = (p.angle * Math.PI) / 180;
    const rot = (q: Pair, s: number): Pair => {
      const [dx, dy] = [q[0] - c[0], q[1] - c[1]];
      const [cs, sn] = [Math.cos(s * a), Math.sin(s * a)];
      return [c[0] + dx * cs - dy * sn, c[1] + dx * sn + dy * cs];
    };
    const b = a ? bounds(mapPoints(geo, (q) => rot(q as Pair, -1))) : b0;
    const cols = Math.max(1, Math.round(p.columns));
    const rows = Math.max(1, Math.round(p.rows));
    const [gx, gy] = [Math.max(0, p.gutter[0]), Math.max(0, p.gutter[1])];
    const step = Math.max(ctx.resolution, 1e-3);
    // La forma de otro objeto, como superficie: es la que se pone en cada celda.
    let custom: MultiPolygon | null = null;
    if (p.tile === 'shape') {
      const g = p.source ? ctx.target?.(p.source) : null;
      custom = g ? regionOf(g.shapes, step) : null;
      if (!custom?.length) return geo;
      // Va a verse del tamaño de una celda: con el detalle de la escena a ese tamaño basta.
      const cb = boxOf(custom);
      const k = Math.min(b.width / cols / (cb.width || 1), b.height / rows / (cb.height || 1));
      if (k > 0 && k < 1) custom = simplify(custom, (step * 0.1) / k);
    }
    // Cada forma, como superficie (con su caja, para no recortar contra teselas que no toca).
    const regions = geo.shapes
      .map((s) => ({ s, r: regionOf([s], step) }))
      .filter((x) => x.r.length)
      .map((x) => ({ ...x, box: boxOf(x.r) }));
    const whole = p.fit === 'whole';
    const out: Shape[] = [];
    tiles(p.tile, b, cols, rows, Math.round(p.sides), custom).forEach((poly, index) => {
      // La separación encoge cada tesela alrededor de su centro: la mitad por cada lado, así entre dos
      // teselas queda el hueco entero. En las que no son rectángulos es aproximada (se mide en su caja).
      const pb = boxOf(poly);
      if (pb.width <= gx || pb.height <= gy) return;
      const t = shrink(poly, pb, 1 - gx / pb.width, 1 - gy / pb.height, a ? (q) => rot(q, 1) : null);
      const tb = boxOf(t);
      const near = regions.filter(({ box }) => !(box.x > tb.x + tb.width || box.x + box.width < tb.x || box.y > tb.y + tb.height || box.y + box.height < tb.y));
      // Lo normal: la tesela cae entera dentro de una forma. Entonces no hace falta recortar.
      const fits = (r: MultiPolygon) => covers(r, tb);
      const tileShape = () => t.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
      if (whole) {
        // Entera, con el estilo de la forma de más arriba que la cubre al menos a medias.
        const full = areaOf(t);
        const owner = [...near].reverse().find(({ r }) => fits(r) || areaOf(intersection(r, t)) >= full * 0.5);
        const subpaths = tileShape();
        if (owner && subpaths.length) out.push({ ...owner.s, subpaths, clone: index });
        return;
      }
      for (const { s, r } of near) {
        const cut = fits(r) ? t : intersection(r, t);
        const subpaths = cut.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
        if (subpaths.length) out.push({ ...s, subpaths, clone: index });
      }
    });
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/** Las teselas, en orden de lectura (filas de arriba abajo, de izquierda a derecha). */
function tiles(kind: string, b: Bounds, cols: number, rows: number, sides: number, custom: MultiPolygon | null): MultiPolygon[] {
  const cw = b.width / cols, ch = b.height / rows;
  const out: MultiPolygon[] = [];
  const push = (ring: Pair[]) => out.push([[[...ring, ring[0]!]]]);
  if (kind === 'triangle') {
    // Triángulos alternos (hacia arriba y hacia abajo), dos por celda más los de los bordes.
    for (let r = 0; r < rows; r++) {
      const y0 = b.y + r * ch, y1 = y0 + ch;
      for (let i = 0; i <= cols * 2; i++) {
        const x = b.x + ((i - 1) * cw) / 2;
        push((i + r) % 2 === 0 ? [[x, y1], [x + cw, y1], [x + cw / 2, y0]] : [[x, y0], [x + cw, y0], [x + cw / 2, y1]]);
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
        push(Array.from({ length: 6 }, (_, k) => {
          const a = ((60 * k - 90) * Math.PI) / 180;
          return [cx + Math.cos(a) * sx, cy + Math.sin(a) * sy] as Pair;
        }));
      }
    }
    return out;
  }
  // Una forma por celda, inscrita en ella (estirada si la celda no es cuadrada).
  const cb = custom ? boxOf(custom) : null;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = b.x + c * cw, y0 = b.y + r * ch;
      const cx = x0 + cw / 2, cy = y0 + ch / 2;
      const around = (n: number, radius: (k: number) => number, start = -Math.PI / 2) =>
        Array.from({ length: n }, (_, k) => {
          const t = start + (k / n) * Math.PI * 2;
          return [cx + (Math.cos(t) * cw * radius(k)) / 2, cy + (Math.sin(t) * ch * radius(k)) / 2] as Pair;
        });
      if (kind === 'circle') push(around(48, () => 1, 0));
      else if (kind === 'polygon') push(around(Math.max(3, sides), () => 1));
      else if (kind === 'star') push(around(Math.max(3, sides) * 2, (k) => (k % 2 ? 0.45 : 1)));
      else if (custom && cb && cb.width > 0 && cb.height > 0) {
        // La forma del objeto, encajada en la celda sin deformarla.
        const k = Math.min(cw / cb.width, ch / cb.height);
        const ox = cx - (cb.x + cb.width / 2) * k, oy = cy - (cb.y + cb.height / 2) * k;
        out.push(custom.map((poly) => poly.map((ring) => ring.map(([x, y]) => [ox + x * k, oy + y * k] as Pair))));
      } else push([[x0, y0], [x0 + cw, y0], [x0 + cw, y0 + ch], [x0, y0 + ch]]);
    }
  }
  return out;
}

/** Escala una tesela alrededor del centro de su caja (y la gira de vuelta, si hace falta). */
function shrink(m: MultiPolygon, b: Bounds, kx: number, ky: number, turn: ((q: Pair) => Pair) | null): MultiPolygon {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return m.map((poly) => poly.map((ring) => ring.map(([x, y]) => {
    const q: Pair = [cx + (x - cx) * kx, cy + (y - cy) * ky];
    return turn ? turn(q) : q;
  })));
}

/** Área de una superficie (los agujeros restan: van en sentido contrario). */
function areaOf(m: MultiPolygon): number {
  let sum = 0;
  for (const poly of m) {
    poly.forEach((ring, i) => {
      let a = 0;
      for (let j = 0; j + 1 < ring.length; j++) a += ring[j]![0] * ring[j + 1]![1] - ring[j + 1]![0] * ring[j]![1];
      sum += (i === 0 ? 1 : -1) * Math.abs(a / 2);
    });
  }
  return sum;
}

function boxOfRing(r: Pair[]): Bounds {
  const xs = r.map((q) => q[0]), ys = r.map((q) => q[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function boxOf(m: MultiPolygon): Bounds {
  return boxOfRing(m.flatMap((poly) => poly.flat()));
}
