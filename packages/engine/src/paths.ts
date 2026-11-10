// Recorrer trazados por su longitud: para repartir copias por un contorno o enrollar un dibujo en él.
import { flatten, type Geometry, type Vec2 } from './geometry';

export interface Polyline {
  pts: Vec2[];
  /** Longitud acumulada hasta cada punto. */
  cum: number[];
  closed: boolean;
  length: number;
}

/** Cada subtrazado como polilínea (los cerrados, con el punto de vuelta al inicio). */
export function polylines(geo: Geometry, samples = 16): Polyline[] {
  return geo.shapes.flatMap((s) =>
    s.subpaths.map((sp) => {
      const pts = flatten(sp, samples);
      if (sp.closed) pts.push(sp.start);
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
      return { pts, cum, closed: sp.closed, length: cum[cum.length - 1]! };
    }),
  ).filter((p) => p.length > 0);
}

/** Punto y tangente (unitaria) a la distancia `s`. Los cerrados dan la vuelta; los abiertos se prolongan en línea recta. */
export function pointAt(pl: Polyline, s: number): { p: Vec2; t: Vec2 } {
  const L = pl.length;
  if (pl.closed) s = ((s % L) + L) % L;
  const n = pl.pts.length;
  // Fuera de un trazado abierto: sigue la tangente del extremo.
  if (!pl.closed && (s < 0 || s > L)) {
    const [a, b] = s < 0 ? [pl.pts[0]!, pl.pts[1]!] : [pl.pts[n - 2]!, pl.pts[n - 1]!];
    const t = unit([b[0] - a[0], b[1] - a[1]]);
    const from = s < 0 ? a : b;
    const d = s < 0 ? s : s - L;
    return { p: [from[0] + t[0] * d, from[1] + t[1] * d], t };
  }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pl.cum[mid]! <= s) lo = mid;
    else hi = mid;
  }
  const a = pl.pts[lo]!, b = pl.pts[hi]!;
  const seg = pl.cum[hi]! - pl.cum[lo]! || 1;
  const k = (s - pl.cum[lo]!) / seg;
  return { p: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k], t: unit([b[0] - a[0], b[1] - a[1]]) };
}

const unit = ([x, y]: Vec2): Vec2 => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
