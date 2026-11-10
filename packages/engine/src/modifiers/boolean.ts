import { difference, intersection, union, xor, type MultiPolygon, type Ring } from 'polygon-clipping';
import { cubicAt, line, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Booleanos entre elementos (como el objeto Boole de C4D o el Buscatrazos de Illustrator).
 * Un elemento es cada hijo de un grupo, o cada copia de un Clone: lo que Step numera.
 * - union: todo en una forma; intersect: lo común a todos; exclude: lo que no se solapa;
 * - subtract: al de más atrás se le restan los de delante («Minus Front»).
 * Las curvas se aproximan con tramos rectos (resolución de la escena).
 */
export const boolean = defineModifier({
  type: 'boolean',
  label: 'Boolean',
  kind: 'generator',
  params: {
    mode: { type: 'enum', default: 'union', options: ['union', 'subtract', 'intersect', 'exclude'] as const, animatable: false },
  },
  apply(geo, p, ctx) {
    // Elementos en el orden en que se pintan: el primero, el de más atrás.
    const elements = new Map<number, Shape[]>();
    for (const s of geo.shapes) elements.set(s.clone ?? 0, [...(elements.get(s.clone ?? 0) ?? []), s]);
    const list = [...elements.values()];
    if (list.length < 2) return geo;
    const step = Math.max(ctx.resolution, 1e-3);
    const regions = list.map((shapes) => regionOf(shapes, step)).filter((r) => r.length);
    if (regions.length < 2) return geo;
    const [first, ...rest] = regions as [MultiPolygon, ...MultiPolygon[]];
    const out =
      p.mode === 'subtract' ? difference(first, ...rest) : p.mode === 'intersect' ? intersection(first, ...rest) : p.mode === 'exclude' ? xor(first, ...rest) : union(first, ...rest);
    // Estilo: el del de atrás al restar (es lo que queda); si no, el del de delante (como Illustrator).
    const from = (p.mode === 'subtract' ? list[0] : list[list.length - 1])![0]!;
    const subpaths = out.flatMap((poly) => poly.map(toSubPath)).filter((s): s is SubPath => !!s);
    return { viewBox: geo.viewBox, shapes: subpaths.length ? [{ ...from, subpaths, clone: 0 }] : [] };
  },
});

/** La superficie de un elemento: cada forma, par-impar entre sus anillos; las formas, unidas. */
function regionOf(shapes: Shape[], step: number): MultiPolygon {
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
function ring(sp: SubPath, step: number): Ring {
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

function toSubPath(r: Ring): SubPath | null {
  if (r.length < 4) return null;
  const pts = r.slice(0, -1) as Vec2[];
  const segs = pts.map((p, i) => line(p, pts[(i + 1) % pts.length]!));
  return { start: pts[0]!, segs, closed: true };
}
