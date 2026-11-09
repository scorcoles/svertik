import { flatten, insidePolygons, line, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier, fromFraction } from '../modifier';
import { rng } from '../random';

interface Branch {
  points: Vec2[];
  /** «Tiempo» de cada punto: pasos desde el impacto. Sirve para hacer crecer la grieta. */
  times: number[];
}

/**
 * Grietas: líneas ramificadas que nacen de un punto de impacto y no salen de las formas rellenas.
 * La forma no se toca; las grietas se añaden encima como una forma nueva de solo trazo.
 * `growth` recorta por «tiempo», así que animarlo hace crecer la grieta sin cambiar su dibujo.
 */
export const crack = defineModifier({
  type: 'crack',
  label: 'Crack',
  kind: 'generator',
  params: {
    growth: { type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    cracks: { type: 'number', default: 5, min: 1, max: 16, step: 1 },
    length: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01, unit: 'fraction' },
    branching: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    jagged: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01 },
    width: { type: 'number', default: 1, min: 0, max: 10, step: 0.1, unit: 'px', group: 'Style' },
    color: { type: 'color', default: '#000000', group: 'Style' },
    impact: { type: 'point', default: [0.4, 0.35], unit: 'fraction', group: 'Impact' },
    seed: { type: 'seed', default: 1, group: 'Impact' },
  },
  apply(geo, p, ctx) {
    const b = ctx.bounds;
    const size = Math.max(b.width, b.height);
    if (size === 0 || p.cracks < 1 || p.length <= 0) return geo;

    // Zona agrietable: las formas con relleno; si no hay, la caja del dibujo.
    const filled = geo.shapes.filter((s) => (s.style.fill ?? 'black') !== 'none');
    const polys = filled.length
      ? filled.flatMap((s) => s.subpaths.filter((sp) => sp.closed).map((sp) => flatten(sp)))
      : [[[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]] as Vec2[]];
    const inside = (pt: Vec2) => insidePolygons(polys, pt);

    const origin = fromFraction(b, p.impact) as Vec2;
    if (!inside(origin)) return geo;

    const rand = rng(p.seed);
    const step = size * 0.025;
    const maxSteps = Math.max(1, Math.round((p.length * size) / step));
    const branches: Branch[] = [];

    const grow = (start: Vec2, startTime: number, angle: number, steps: number, depth: number) => {
      const br: Branch = { points: [start], times: [startTime] };
      branches.push(br);
      let a = angle;
      let pt = start;
      for (let k = 1; k <= steps; k++) {
        a += (rand() - 0.5) * p.jagged * 1.4;
        const d = step * (0.6 + rand() * 0.8);
        const next: Vec2 = [pt[0] + Math.cos(a) * d, pt[1] + Math.sin(a) * d];
        const branchRoll = rand();
        const sideRoll = rand();
        const lenRoll = rand();
        if (!inside(next)) break;
        br.points.push(next);
        br.times.push(startTime + k);
        pt = next;
        if (depth < 3 && branchRoll < p.branching * 0.25) {
          const turn = (sideRoll < 0.5 ? -1 : 1) * (0.4 + lenRoll * 0.6);
          grow(pt, startTime + k, a + turn, Math.round((steps - k) * (0.3 + lenRoll * 0.4)), depth + 1);
        }
      }
    };

    const n = Math.round(p.cracks);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + (rand() - 0.5) * (Math.PI / n);
      grow(origin, 0, angle, Math.round(maxSteps * (0.6 + rand() * 0.4)), 0);
    }

    // Recorte por crecimiento.
    const tMax = Math.max(1, ...branches.flatMap((br) => br.times));
    const limit = p.growth * tMax;
    const subpaths: SubPath[] = [];
    for (const br of branches) {
      const pts: Vec2[] = [];
      for (let i = 0; i < br.points.length; i++) {
        const t = br.times[i]!;
        if (t <= limit) { pts.push(br.points[i]!); continue; }
        // Último tramo, a medias.
        if (i > 0) {
          const t0 = br.times[i - 1]!;
          const f = (limit - t0) / (t - t0);
          const a = br.points[i - 1]!;
          const c = br.points[i]!;
          if (f > 0) pts.push([a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f]);
        }
        break;
      }
      if (pts.length < 2) continue;
      subpaths.push({ start: pts[0]!, segs: pts.slice(1).map((q, i) => line(pts[i]!, q)), closed: false });
    }
    if (!subpaths.length) return geo;

    const cracks: Shape = {
      subpaths,
      style: { fill: 'none', stroke: p.color, 'stroke-width': String(p.width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    };
    return { viewBox: geo.viewBox, shapes: [...geo.shapes, cracks] };
  },
});
