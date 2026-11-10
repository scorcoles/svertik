import { difference, intersection, union, xor, type MultiPolygon, type Pair } from '../polygon';
import { inside, regionOf, ring, toSubPath } from '../clip';
import { line, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Booleanos entre elementos.
 * Un elemento es cada hijo de un grupo, cada copia de un Clone o cada tesela: lo que Step numera.
 * Sin elementos marcados, cada forma es uno (como en Explosion).
 * - union: todo en una forma; intersect: lo común a todos; exclude: lo que no se solapa;
 * - subtract: al de más atrás se le restan los de delante («Minus Front»).
 * Las líneas abiertas no tienen superficie: no cuentan para el resultado, pero no se pierden. Con union
 * se quedan enteras; en los demás, recortadas por el resultado (al restar, solo las del de atrás).
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
    const tagged = geo.shapes.some((s) => s.clone !== undefined);
    const elements = new Map<number, Shape[]>();
    geo.shapes.forEach((s, i) => {
      const k = tagged ? (s.clone ?? -1) : i;
      elements.set(k, [...(elements.get(k) ?? []), s]);
    });
    const step = Math.max(ctx.resolution, 1e-3);
    const list = [...elements.values()].map((shapes) => ({ shapes, region: regionOf(shapes, step) }));
    const solid = list.filter((x) => x.region.length);
    if (solid.length < 2) return geo;
    const [first, ...rest] = solid.map((x) => x.region) as [MultiPolygon, ...MultiPolygon[]];
    const out =
      p.mode === 'subtract' ? difference(first, ...rest) : p.mode === 'intersect' ? intersection(first, ...rest) : p.mode === 'exclude' ? xor(first, ...rest) : union(first, ...rest);
    // Estilo: el del de atrás al restar (es lo que queda); si no, el del de delante.
    const owner = p.mode === 'subtract' ? solid[0]! : solid[solid.length - 1]!;
    const from = owner.shapes.find((s) => s.subpaths.some((sp) => sp.closed)) ?? owner.shapes[0]!;
    const subpaths = out.flatMap((poly) => poly.map(toSubPath)).filter((s): s is SubPath => !!s);
    const shapes: Shape[] = subpaths.length ? [{ ...from, subpaths, clone: 0 }] : [];

    // Las líneas: al restar, solo las del de atrás (y las de elementos que solo son líneas).
    const keepFrom = p.mode === 'subtract' ? list.filter((x) => x === solid[0] || !x.region.length) : list;
    for (const { shapes: own } of keepFrom) {
      for (const s of own) {
        const open = s.subpaths.filter((sp) => !sp.closed);
        if (!open.length) continue;
        const kept = p.mode === 'union' ? open : open.flatMap((sp) => clipLine(sp, out, step));
        if (kept.length) shapes.push({ ...s, subpaths: kept, clone: 0 });
      }
    }
    return { viewBox: geo.viewBox, shapes };
  },
});

/** Los trozos de una línea abierta que caen dentro de una superficie (aproximado, a la resolución). */
function clipLine(sp: SubPath, region: MultiPolygon, step: number): SubPath[] {
  const pts = ring(sp, step) as Pair[];
  // `ring` la cierra (repite el principio al final si hacía falta); aquí sigue abierta.
  const end = sp.segs[sp.segs.length - 1]?.p ?? sp.start;
  if (pts.length > 1 && (end[0] !== sp.start[0] || end[1] !== sp.start[1])) pts.pop();
  // Más fina, para que el corte caiga cerca del borde.
  const dense: Pair[] = [pts[0]!];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 1; k <= n; k++) dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  const out: SubPath[] = [];
  let run: Vec2[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ start: run[0]!, segs: run.slice(1).map((q, i) => line(run[i]!, q)), closed: false });
    run = [];
  };
  for (let i = 1; i < dense.length; i++) {
    const [a, b] = [dense[i - 1]!, dense[i]!];
    if (inside([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], region)) {
      if (!run.length) run.push(a);
      run.push(b);
    } else flush();
  }
  flush();
  return out;
}
