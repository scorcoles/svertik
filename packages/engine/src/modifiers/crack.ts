import { difference, type MultiPolygon, type Pair } from 'polygon-clipping';
import { regionOf, toSubPath } from '../clip';
import { flatten, insidePolygons, line, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { band } from './damage';
import { defineModifier, fromFraction } from '../modifier';
import { rng } from '../random';

interface Branch {
  points: Vec2[];
  /** «Tiempo» de cada punto: pasos desde el impacto. Sirve para hacer crecer la grieta. */
  times: number[];
}

/**
 * Grietas: líneas ramificadas que nacen de un punto de impacto.
 * - lines: se pintan encima, como una forma nueva de solo trazo (la forma no se toca);
 * - cut: se recortan como huecos de `width` px;
 * - shatter: se recortan y cada trozo suelto se aparta del impacto `separation` px (cada trozo, un elemento).
 * `growth` recorta por «tiempo», así que animarlo hace crecer la grieta sin cambiar su dibujo.
 */
export const crack = defineModifier({
  type: 'crack',
  label: 'Crack',
  kind: 'generator',
  params: {
    mode: { type: 'enum', default: 'cut', options: ['lines', 'cut', 'shatter'] as const, animatable: false },
    growth: { type: 'number', default: 1, min: 0, max: 1, step: 0.01 },
    cracks: { type: 'number', default: 5, min: 1, max: 16, step: 1, ramp: false },
    length: { type: 'number', default: 0.6, min: 0, max: 2, step: 0.01, unit: 'fraction' },
    branching: { type: 'number', default: 0.35, min: 0, max: 1, step: 0.01 },
    jagged: { type: 'number', default: 0.4, min: 0, max: 1, step: 0.01 },
    width: { type: 'number', default: 1, min: 0, max: 10, step: 0.1, unit: 'px', group: 'Style', ramp: false },
    color: { type: 'color', default: '#000000', group: 'Style' },
    separation: { type: 'number', default: 6, min: 0, max: 80, step: 0.5, unit: 'px', group: 'Shatter', label: 'Separation' },
    impact: { type: 'point', default: [0.4, 0.35], unit: 'fraction', group: 'Impact', label: 'Point' },
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

    // Si el impacto cae en un hueco (entre letras, por ejemplo), se busca el punto con material más cercano.
    let origin = fromFraction(b, p.impact) as Vec2;
    if (!inside(origin)) {
      const found = nearestInside(origin, inside, size);
      if (!found) return geo;
      origin = found;
    }
    // Al recortar, las grietas siguen aunque crucen un hueco (cortan donde hay material); al pintar, no.
    const cutting = p.mode !== 'lines';
    const box = { x0: b.x - size * 0.05, y0: b.y - size * 0.05, x1: b.x + b.width + size * 0.05, y1: b.y + b.height + size * 0.05 };
    const within = (q: Vec2) => (cutting ? q[0] >= box.x0 && q[0] <= box.x1 && q[1] >= box.y0 && q[1] <= box.y1 : inside(q));

    const rand = rng(p.seed);
    const step = size * 0.025;
    // En shatter, las grietas corren hasta salir del objeto: así siempre se parte en trozos.
    const maxSteps = p.mode === 'shatter' ? Math.ceil((3 * size) / step) : Math.max(1, Math.round((p.length * size) / step));
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
        if (!within(next)) break;
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

    if (cutting) return cut(geo, subpaths, p, origin, ctx.resolution);

    const cracks: Shape = {
      subpaths,
      style: { fill: 'none', stroke: p.color, 'stroke-width': String(p.width), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    };
    return { viewBox: geo.viewBox, shapes: [...geo.shapes, cracks] };
  },
});

/** Recorta las grietas (bandas de `width`) en las formas rellenas; en shatter, separa los trozos. */
function cut(geo: Geometry, lines: SubPath[], p: { mode: string; width: number; separation: number; seed: number }, origin: Vec2, resolution: number): Geometry {
  const rand = rngLike(p.seed);
  const holes: MultiPolygon = lines.map((sp) => {
    const pts: Vec2[] = [sp.start, ...sp.segs.map((g) => g.p)];
    return [band(pts, Math.max(0.2, p.width), 0.6, rand)];
  });
  const step = Math.max(resolution, 1e-3);
  const out: Shape[] = [];
  let piece = 0;
  for (const s of geo.shapes) {
    if ((s.style.fill ?? 'black') === 'none') {
      out.push(s);
      continue;
    }
    const r = regionOf([s], step);
    if (!r.length) continue;
    let rest: MultiPolygon;
    try {
      rest = difference(r, holes);
    } catch {
      out.push(s);
      continue;
    }
    for (const poly of rest) {
      let pl = poly;
      if (p.mode === 'shatter' && p.separation > 0) {
        // Cada trozo, alejándose del impacto (desde su centro), un poco al azar.
        const ring = poly[0]!;
        const cx = ring.reduce((a, q) => a + q[0], 0) / ring.length, cy = ring.reduce((a, q) => a + q[1], 0) / ring.length;
        const dx = cx - origin[0], dy = cy - origin[1];
        const d = Math.hypot(dx, dy) || 1;
        const k = p.separation * (0.6 + rand() * 0.8);
        pl = poly.map((rg) => rg.map(([x, y]) => [x + (dx / d) * k, y + (dy / d) * k] as Pair));
      }
      const subpaths = pl.map(toSubPath).filter((x) => x !== null);
      if (subpaths.length) out.push({ ...s, subpaths, clone: piece++ });
    }
  }
  return { viewBox: geo.viewBox, shapes: out };
}

/** El punto con material más cercano a `q` (en espiral, hasta `size`). */
function nearestInside(q: Vec2, inside: (q: Vec2) => boolean, size: number): Vec2 | null {
  for (let r = size * 0.01; r < size; r *= 1.25) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const c: Vec2 = [q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r];
      if (inside(c)) return c;
    }
  }
  return null;
}

const rngLike = (seed: number) => rng(seed * 7919 + 13);
