import { intersection, type MultiPolygon, type Pair } from '../polygon';
import { covers, regionOf, simplify, toSubPath } from '../clip';
import { bounds, mapPoints, type Bounds, type Shape } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Mosaic: cuts the drawing into tiles on a grid of columns × rows, with a gap in X and Y
 * and the grid turned `angle` degrees. Tiles are rectangles, triangles or hexagons (they tile without gaps),
 * or one shape per cell: circle, polygon, star or another object of the scene (`shape`).
 * `fit`: `cut` clips the drawing with each tile (pieces remain at the edges); `whole` places the whole tile
 * where the drawing covers at least half of it, with its style. Each tile is an element (like a Clone
 * copy), so Step, Color or Boolean treat it separately. Surfaces only: open lines are lost.
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
    // Gap between tiles, in drawing units (px), in X and Y.
    gutter: { type: 'point', default: [4, 4], unit: 'px', step: 0.5, min: 0, label: 'Gutter', handle: false, linkable: true, linked: true, random: [0, 16] },
    angle: { type: 'angle', default: 0, ramp: false, random: [-45, 45] },
  },
  apply(geo, p, ctx) {
    const b0 = bounds(geo);
    if (b0.width <= 0 || b0.height <= 0) return geo;
    // Turned grid: computed in the grid's frame (the drawing turned backwards around its centre)
    // and each tile turned back. So columns × rows always cover the whole drawing.
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
    // Another object's shape, as a surface: the one placed in each cell.
    let custom: MultiPolygon | null = null;
    if (p.tile === 'shape') {
      const g = p.source ? ctx.target?.(p.source) : null;
      custom = g ? regionOf(g.shapes, step) : null;
      if (!custom?.length) return geo;
      // It will be seen at cell size: the scene's detail at that size is enough.
      const cb = boxOf(custom);
      const k = Math.min(b.width / cols / (cb.width || 1), b.height / rows / (cb.height || 1));
      if (k > 0 && k < 1) custom = simplify(custom, (step * 0.1) / k);
    }
    // Each shape, as a surface (with its box, so it isn't clipped against tiles it doesn't touch).
    const regions = geo.shapes
      .map((s) => ({ s, r: regionOf([s], step) }))
      .filter((x) => x.r.length)
      .map((x) => ({ ...x, box: boxOf(x.r) }));
    const whole = p.fit === 'whole';
    const out: Shape[] = [];
    tiles(p.tile, b, cols, rows, Math.round(p.sides), custom).forEach((poly, index) => {
      // The gap shrinks each tile around its centre: half on each side, so between two tiles the
      // whole gap remains. For non-rectangles it is approximate (measured on their box).
      const pb = boxOf(poly);
      if (pb.width <= gx || pb.height <= gy) return;
      const t = shrink(poly, pb, 1 - gx / pb.width, 1 - gy / pb.height, a ? (q) => rot(q, 1) : null);
      const tb = boxOf(t);
      const near = regions.filter(({ box }) => !(box.x > tb.x + tb.width || box.x + box.width < tb.x || box.y > tb.y + tb.height || box.y + box.height < tb.y));
      // The usual case: the tile falls entirely inside a shape. Then no clipping is needed.
      const fits = (r: MultiPolygon) => covers(r, tb);
      const tileShape = () => t.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
      if (whole) {
        // Whole, with the style of the topmost shape covering at least half of it.
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

/** The tiles, in reading order (rows top to bottom, left to right). */
function tiles(kind: string, b: Bounds, cols: number, rows: number, sides: number, custom: MultiPolygon | null): MultiPolygon[] {
  const cw = b.width / cols, ch = b.height / rows;
  const out: MultiPolygon[] = [];
  const push = (ring: Pair[]) => out.push([[[...ring, ring[0]!]]]);
  if (kind === 'triangle') {
    // Alternating triangles (up and down), two per cell plus the ones at the edges.
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
    // Pointy-top hexagons: `cols` wide; rows at 3/4 of their height, odd ones shifted half a cell.
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
  // One shape per cell, inscribed in it (stretched if the cell isn't square).
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
        // The object's shape, fitted into the cell without distorting it.
        const k = Math.min(cw / cb.width, ch / cb.height);
        const ox = cx - (cb.x + cb.width / 2) * k, oy = cy - (cb.y + cb.height / 2) * k;
        out.push(custom.map((poly) => poly.map((ring) => ring.map(([x, y]) => [ox + x * k, oy + y * k] as Pair))));
      } else push([[x0, y0], [x0 + cw, y0], [x0 + cw, y0 + ch], [x0, y0 + ch]]);
    }
  }
  return out;
}

/** Scales a tile around the centre of its box (and turns it back, if needed). */
function shrink(m: MultiPolygon, b: Bounds, kx: number, ky: number, turn: ((q: Pair) => Pair) | null): MultiPolygon {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return m.map((poly) => poly.map((ring) => ring.map(([x, y]) => {
    const q: Pair = [cx + (x - cx) * kx, cy + (y - cy) * ky];
    return turn ? turn(q) : q;
  })));
}

/** Area of a surface (holes subtract: they wind the other way). */
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
