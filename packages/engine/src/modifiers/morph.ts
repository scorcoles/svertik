import { mixColor, parseColor, toHex } from '../color';
import { flatten, line, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Evolución (morph): de este dibujo a la forma de otro objeto. Los trazados se emparejan (el más grande
 * con el más grande…), se reparten en el mismo número de puntos por su longitud y se interpolan.
 * Si uno tiene más trazados que el otro, los que sobran nacen (o se apagan) en un punto. El relleno
 * también pasa de un color al otro. `amount` de 0 a 1: para animarlo.
 * Con `steps`: el original, `steps` formas intermedias y el destino, cada una
 * un elemento (Step, Color, Explosion…). Amount, entonces, dice hasta dónde llega la secuencia.
 */
export const morph = defineModifier({
  type: 'morph',
  label: 'Morph',
  kind: 'deformer',
  params: {
    target: { type: 'node', default: '', label: 'To' },
    amount: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Amount' },
    points: { type: 'number', default: 200, min: 16, max: 1000, step: 8, label: 'Points', ramp: false },
    colors: { type: 'boolean', default: true, label: 'Blend colors', animatable: false },
    steps: { type: 'number', default: 0, min: 0, max: 100, step: 1, ramp: false, label: 'Steps' },
  },
  apply(geo, p, ctx) {
    const target = p.target ? ctx.target?.(p.target) : null;
    if (!target) return geo;
    const T = Math.max(0, Math.min(1, p.amount));
    const n = Math.max(16, Math.round(p.points));
    type Item = { pts: Vec2[]; shape: Shape; area: number };
    const items = (g: Geometry): Item[] =>
      g.shapes
        .flatMap((shape) => shape.subpaths.map((sp) => ({ pts: resample(sp, n), shape })))
        .filter((x) => x.pts.length)
        .map((x) => ({ ...x, area: Math.abs(areaOf(x.pts)) }))
        .sort((a, b) => b.area - a.area);
    const A = items(geo), B = items(target);
    if (!A.length || !B.length) return geo;
    const count = Math.max(A.length, B.length);
    const lastA = A[A.length - 1]!;
    // Parejas, una vez: de dónde sale cada punto y a dónde va.
    const pairs = Array.from({ length: count }, (_, i) => {
      const a = A[i], b = B[i];
      // Lo que no tiene pareja nace o se apaga en el centro de su contraparte más pequeña.
      const pa = a ? a.pts : collapse(b!.pts, centroid(lastA.pts));
      const pbRaw = b ? b.pts : collapse(a!.pts, centroid(B[B.length - 1]!.pts));
      return { pa, pb: align(pa, pbRaw), owner: (a ?? lastA).shape };
    });
    const fillOf = (s: Shape) => parseColor(s.style.fill ?? '#000000');
    const at = (t: number, clone?: number): Shape[] => {
      const byShape = new Map<Shape, SubPath[]>();
      for (const { pa, pb, owner } of pairs) {
        const pts = pa.map((q, k) => [q[0] + (pb[k]![0] - q[0]) * t, q[1] + (pb[k]![1] - q[1]) * t] as Vec2);
        const segs = pts.map((q, k) => line(q, pts[(k + 1) % pts.length]!));
        byShape.set(owner, [...(byShape.get(owner) ?? []), { start: pts[0]!, segs, closed: true }]);
      }
      return [...byShape].map(([shape, subpaths]) => {
        let style = shape.style;
        if (p.colors) {
          const ca = fillOf(shape), cb = fillOf(B[0]!.shape);
          if (ca && cb && shape.style.fill !== 'none') style = { ...style, fill: toHex(mixColor(ca, cb, t)) };
        }
        return { ...shape, style, subpaths, ...(clone !== undefined ? { clone } : {}) };
      });
    };
    const steps = Math.max(0, Math.round(p.steps));
    // Sin pasos: una forma en `amount`. Con pasos: la secuencia entera, del original (0) hasta `amount`.
    const out: Shape[] = steps === 0 ? at(T) : Array.from({ length: steps + 2 }, (_, i) => at((i / (steps + 1)) * T, i)).flat();
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/** n puntos repartidos por la longitud del trazado (cerrado o no). */
function resample(sp: SubPath, n: number): Vec2[] {
  const pts = flatten(sp, 12);
  if (sp.closed) pts.push(sp.start);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const L = cum[cum.length - 1]!;
  if (L <= 0) return [];
  const out: Vec2[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const d = (k / n) * L;
    while (j < cum.length - 2 && cum[j + 1]! < d) j++;
    const seg = cum[j + 1]! - cum[j]! || 1;
    const f = (d - cum[j]!) / seg;
    const a = pts[j]!, b = pts[j + 1]!;
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Reordena b (sentido y punto de inicio) para que cada punto vaya al más cercano de a: menos retorcimiento. */
function align(a: Vec2[], b: Vec2[]): Vec2[] {
  const n = a.length;
  const sameDir = Math.sign(areaOf(a)) === Math.sign(areaOf(b)) || areaOf(b) === 0;
  const base = sameDir ? b : [...b].reverse();
  const cost = (off: number) => {
    let s = 0;
    for (let k = 0; k < n; k += 4) {
      const q = base[(k + off) % n]!, r = a[k]!;
      s += (q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2;
    }
    return s;
  };
  let best = 0, bestCost = Infinity;
  const stride = Math.max(1, Math.floor(n / 64));
  for (let off = 0; off < n; off += stride) {
    const c = cost(off);
    if (c < bestCost) [best, bestCost] = [off, c];
  }
  for (let off = best - stride; off <= best + stride; off++) {
    const o = (off + n) % n;
    const c = cost(o);
    if (c < bestCost) [best, bestCost] = [o, c];
  }
  return base.map((_, k) => base[(k + best) % n]!);
}

const collapse = (like: Vec2[], at: Vec2): Vec2[] => like.map(() => [at[0], at[1]]);
const centroid = (pts: Vec2[]): Vec2 => [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length];
function areaOf(pts: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}
