// Recortes con polygon-clipping: de trazados a superficies (polígonos) y de vuelta.
// Las curvas se aproximan con tramos rectos según la resolución.
import { union, xor, type MultiPolygon, type Ring } from 'polygon-clipping';
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
