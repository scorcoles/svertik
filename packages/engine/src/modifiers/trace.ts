import type { Cubic, SubPath, Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/**
 * Estela: el dibujo pasa a ser el camino que ha seguido el centro de otro objeto (su centroide) durante los últimos `length` segundos de la animación, con el estilo que tenía (la línea de
 * Utils → Tracer). `samples`: cuántos puntos guarda; `smooth`: curva suave entre ellos o tramos rectos.
 * Se ve al reproducir o al mover el cabezal; quieta, no hay estela.
 */
export const trace = defineModifier({
  type: 'trace',
  label: 'Trace',
  kind: 'generator',
  family: 'utils',
  params: {
    target: { type: 'node', default: '', label: 'Object' },
    length: { type: 'number', default: 1, min: 0.05, max: 20, step: 0.05, unit: 's', label: 'Length', random: [0.3, 2] },
    samples: { type: 'number', default: 40, min: 2, max: 240, step: 1, label: 'Samples', ramp: false, animatable: false, random: false },
    smooth: { type: 'boolean', default: true, label: 'Smooth' },
  },
  apply(geo, p, ctx) {
    if (!p.target || !ctx.trail) return geo;
    const pts = ctx.trail(p.target, p.length, p.samples);
    const style = { ...(geo.shapes[0]?.style ?? { stroke: '#ededed', 'stroke-width': '2' }), fill: 'none' };
    // Sin puntos repetidos (un objeto quieto no deja tramos de longitud nula).
    const clean: Vec2[] = [];
    for (const q of pts ?? []) {
      const last = clean[clean.length - 1];
      if (!last || Math.hypot(q[0] - last[0], q[1] - last[1]) > 1e-6) clean.push(q);
    }
    if (clean.length < 2) return { viewBox: geo.viewBox, shapes: [] };
    const sp: SubPath = { start: clean[0]!, segs: p.smooth ? catmull(clean) : clean.slice(1).map((q, i) => straight(clean[i]!, q)), closed: false };
    return { viewBox: geo.viewBox, shapes: [{ style, subpaths: [sp] }] };
  },
});

const straight = (a: Vec2, b: Vec2): Cubic => ({ c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (2 * (b[0] - a[0])) / 3, a[1] + (2 * (b[1] - a[1])) / 3], p: b });

/** Por los puntos, con curvas (Catmull-Rom); en los extremos, el vecino se repite. */
function catmull(pts: Vec2[]): Cubic[] {
  const n = pts.length;
  const P = (i: number) => pts[Math.max(0, Math.min(n - 1, i))]!;
  const out: Cubic[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    out.push({ c1: [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2: [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6], p: p2 });
  }
  return out;
}
