import { difference, intersection, union, xor, type MultiPolygon } from '../polygon';
import { regionOf, toSubPath } from '../clip';
import type { Shape, SubPath } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Booleanos entre elementos.
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
    // Estilo: el del de atrás al restar (es lo que queda); si no, el del de delante.
    const from = (p.mode === 'subtract' ? list[0] : list[list.length - 1])![0]!;
    const subpaths = out.flatMap((poly) => poly.map(toSubPath)).filter((s): s is SubPath => !!s);
    return { viewBox: geo.viewBox, shapes: subpaths.length ? [{ ...from, subpaths, clone: 0 }] : [] };
  },
});

