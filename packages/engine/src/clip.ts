// Recortes con polygon-clipping: de trazados a superficies (polígonos) y de vuelta.
// Las curvas se aproximan con tramos rectos según la resolución.
import { union, xor, type MultiPolygon, type Pair, type Ring } from './polygon';
import { cubicAt, line, type Shape, type SubPath, type Vec2 } from './geometry';

/** La superficie de un elemento: cada forma, par-impar entre sus anillos; las formas, unidas. */
export function regionOf(shapes: Shape[], step: number): MultiPolygon {
  const parts: MultiPolygon[] = [];
  for (const s of shapes) {
    const rings = s.subpaths.filter((sp) => sp.closed).map((sp) => ring(sp, step)).filter((r) => r.length >= 4);
    if (!rings.length) continue;
    parts.push(rings.slice(1).reduce<MultiPolygon>((acc, r) => xor(acc, [r]), [[rings[0]!]]));
  }
  if (!parts.length) return [];
  const [a, ...more] = parts as [MultiPolygon, ...MultiPolygon[]];
  return more.length ? union(a, ...more) : a;
}

/** Subtrazado → anillo: los tramos rectos, un punto; las curvas, según su longitud y la resolución. */
export function ring(sp: SubPath, step: number): Ring {
  const pts: Vec2[] = [sp.start];
  let p0 = sp.start;
  for (const s of sp.segs) {
    const len = dist(p0, s.c1) + dist(s.c1, s.c2) + dist(s.c2, s.p);
    const straight = len - dist(p0, s.p) < 1e-6 * (len + 1);
    const n = straight ? 1 : Math.min(64, Math.max(4, Math.ceil(len / step)));
    for (let i = 1; i <= n; i++) pts.push(cubicAt(p0, s, i / n));
    p0 = s.p;
  }
  const r = pts.map(([x, y]) => [x, y] as [number, number]);
  const a = r[0]!, z = r[r.length - 1]!;
  if (a[0] !== z[0] || a[1] !== z[1]) r.push([a[0], a[1]]);
  return r;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function toSubPath(r: Ring): SubPath | null {
  if (r.length < 4) return null;
  const pts = r.slice(0, -1) as Vec2[];
  const segs = pts.map((p, i) => line(p, pts[(i + 1) % pts.length]!));
  return { start: pts[0]!, segs, closed: true };
}

/** Dentro de alguna de las superficies: en su contorno y fuera de sus agujeros. */
export function inside(q: Pair, region: MultiPolygon): boolean {
  return region.some(([outer, ...holes]) => !!outer && inRing(q, outer) && !holes.some((h) => inRing(q, h)));
}

export function inRing([x, y]: Pair, r: Pair[]): boolean {
  let hit = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i]!, [xj, yj] = r[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Simplifica una superficie (Douglas-Peucker en cada anillo): quita los puntos que se apartan menos de
 * `tol` de la recta entre sus vecinos. Cada anillo conserva al menos un triángulo.
 */
export function simplify(m: MultiPolygon, tol: number): MultiPolygon {
  if (tol <= 0) return m;
  return m.map((poly) => poly.map((r) => simplifyRing(r, tol)).filter((r) => r.length >= 4)).filter((poly) => poly.length);
}

function simplifyRing(r: Ring, tol: number): Ring {
  const pts = r.slice(0, -1) as Pair[];
  if (pts.length < 4) return r;
  // Partir por el punto más lejano del primero: el anillo, como dos líneas abiertas.
  let far = 0, best = -1;
  for (let i = 1; i < pts.length; i++) {
    const d = (pts[i]![0] - pts[0]![0]) ** 2 + (pts[i]![1] - pts[0]![1]) ** 2;
    if (d > best) (best = d), (far = i);
  }
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[far] = 1;
  const stack: [number, number][] = [[0, far], [far, pts.length]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const pa = pts[a]!, pb = pts[b % pts.length]!;
    const [dx, dy] = [pb[0] - pa[0], pb[1] - pa[1]];
    const len = Math.hypot(dx, dy) || 1;
    let idx = -1, max = tol;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i]![0] - pa[0]) * dy - (pts[i]![1] - pa[1]) * dx) / len;
      if (d > max) (max = d), (idx = i);
    }
    if (idx >= 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i]);
  if (out.length < 3) return r;
  return [...out, out[0]!];
}

/** La superficie cubre entera la caja `b` (ningún borde la cruza y su centro está dentro). */
export function covers(region: MultiPolygon, b: { x: number; y: number; width: number; height: number }): boolean {
  const [x0, y0, x1, y1] = [b.x, b.y, b.x + b.width, b.y + b.height];
  for (const poly of region) {
    for (const r of poly) {
      for (let i = 1; i < r.length; i++) {
        if (segmentHitsBox(r[i - 1]!, r[i]!, x0, y0, x1, y1)) return false;
      }
    }
  }
  return inside([(x0 + x1) / 2, (y0 + y1) / 2], region);
}

/** El segmento a-b toca la caja (Liang-Barsky). */
function segmentHitsBox(a: Pair, b: Pair, x0: number, y0: number, x1: number, y1: number): boolean {
  if (Math.max(a[0], b[0]) < x0 || Math.min(a[0], b[0]) > x1 || Math.max(a[1], b[1]) < y0 || Math.min(a[1], b[1]) > y1) return false;
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}
