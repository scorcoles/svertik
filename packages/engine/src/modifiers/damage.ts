import { difference, type MultiPolygon, type Pair, type Polygon } from 'polygon-clipping';
import { regionOf, toSubPath } from '../clip';
import { bounds, insidePolygons, type Shape, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { tearPolyline } from '../paths';
import { rng } from '../random';

/**
 * Desgaste: grietas que entran desde los bordes, desconchones en el borde y motas, recortados
 * como agujeros (por ellos asoma el fondo). Todo sale de una semilla; `growth` hace avanzar las grietas.
 * Solo superficies (como Boolean): las curvas pasan a tramos rectos.
 */
export const damage = defineModifier({
  type: 'damage',
  label: 'Damage',
  kind: 'generator',
  params: {
    seed: { type: 'seed', default: 1 },
    growth: { type: 'number', default: 1, min: 0, max: 1, step: 0.01, label: 'Growth' },
    roughness: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, label: 'Roughness', ramp: false },
    cracks: { type: 'number', default: 3, min: 0, max: 12, step: 1, ramp: false, group: 'Cracks', label: 'Count' },
    length: { type: 'number', default: 0.55, min: 0.05, max: 1.5, step: 0.01, unit: 'fraction', group: 'Cracks', label: 'Length' },
    width: { type: 'number', default: 0.012, min: 0.001, max: 0.06, step: 0.001, unit: 'fraction', group: 'Cracks', label: 'Width' },
    jagged: { type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, group: 'Cracks', label: 'Jagged' },
    taper: { type: 'number', default: 0.75, min: 0, max: 1, step: 0.01, group: 'Cracks', label: 'Taper' },
    chips: { type: 'number', default: 4, min: 0, max: 30, step: 1, ramp: false, group: 'Chips', label: 'Count' },
    chipSize: { type: 'number', default: 0.035, min: 0.005, max: 0.15, step: 0.001, unit: 'fraction', group: 'Chips', label: 'Size' },
    specks: { type: 'number', default: 30, min: 0, max: 300, step: 1, ramp: false, group: 'Specks', label: 'Count' },
    speckSize: { type: 'number', default: 0.006, min: 0.001, max: 0.03, step: 0.001, unit: 'fraction', group: 'Specks', label: 'Size' },
    edgeBias: { type: 'number', default: 0.7, min: 0, max: 1, step: 0.01, group: 'Specks', label: 'Near edges' },
  },
  apply(geo, p, ctx) {
    const b = bounds(geo);
    const size = Math.max(b.width, b.height);
    if (!size) return geo;
    const step = Math.max(ctx.resolution, 1e-3);
    const filled = geo.shapes.filter((s) => (s.style.fill ?? 'black') !== 'none');
    const region = regionOf(filled, step);
    if (!region.length) return geo;
    const rand = rng(p.seed);
    const rings = region.flatMap((poly) => poly) as Vec2[][];
    const inside = (q: Vec2) => insidePolygons(rings, q);
    const edges = edgeSampler(region[0] ? region.map((poly) => poly[0]!) : [], rand);
    if (!edges) return geo;

    const holes: Polygon[] = [];
    const crackLines: Vec2[][] = [];

    // ── Grietas: desde un punto del borde, hacia dentro, con zigzag; más anchas al empezar.
    for (let i = 0; i < Math.round(p.cracks); i++) {
      const { at, inward } = edges();
      // Rumbo general de la grieta; el trazo vuelve a él tras cada quiebro (recta en conjunto, con dientes).
      const heading = Math.atan2(inward[1], inward[0]) + (rand() - 0.5) * 1.6;
      let a = heading;
      const L = p.length * size * (0.55 + rand() * 0.7) * Math.max(0, Math.min(1, p.growth));
      const seg = size * 0.012;
      const pts: Vec2[] = [[at[0] - inward[0] * seg, at[1] - inward[1] * seg]];
      let q = at;
      pts.push(q);
      for (let d = 0; d < L; ) {
        // Quiebros secos de vez en cuando; si no, un leve temblor que tira hacia el rumbo.
        if (rand() < 0.18 + p.jagged * 0.25) a += (rand() - 0.5) * (0.6 + p.jagged * 2.2);
        else a += (rand() - 0.5) * p.jagged * 0.3;
        a = a * 0.75 + heading * 0.25;
        const s = seg * (0.5 + rand());
        q = [q[0] + Math.cos(a) * s, q[1] + Math.sin(a) * s];
        pts.push(q);
        d += s;
        // Si sale de la forma, la ha atravesado: ahí termina (un poco más allá, para cortar limpio).
        if (!inside(q)) {
          pts.push([q[0] + Math.cos(a) * seg, q[1] + Math.sin(a) * seg]);
          break;
        }
      }
      if (pts.length < 3) continue;
      crackLines.push(pts);
      holes.push([band(pts, p.width * size, p.taper, rand)]);
      // Donde empieza, a veces, un desconchón.
      if (rand() < 0.6) holes.push([blob(at, p.chipSize * size * (0.5 + rand() * 0.6), 7, rand)]);
    }

    // ── Desconchones sueltos en el borde.
    for (let i = 0; i < Math.round(p.chips); i++) {
      const { at } = edges();
      holes.push([blob(at, p.chipSize * size * (0.4 + rand() * 0.9), 6 + Math.floor(rand() * 4), rand)]);
    }

    // ── Motas: cerca de los bordes o de las grietas (según `edgeBias`) o en cualquier sitio.
    for (let i = 0, tries = 0; i < Math.round(p.specks) && tries < p.specks * 20; tries++) {
      let q: Vec2;
      const r = rand();
      if (r < p.edgeBias * 0.6) {
        const { at, inward } = edges();
        const d = size * 0.06 * rand() * rand();
        q = [at[0] + inward[0] * d, at[1] + inward[1] * d];
      } else if (r < p.edgeBias && crackLines.length) {
        const line = crackLines[Math.floor(rand() * crackLines.length)]!;
        const c = line[Math.floor(rand() * line.length)]!;
        const d = size * 0.03 * rand();
        const t = rand() * Math.PI * 2;
        q = [c[0] + Math.cos(t) * d, c[1] + Math.sin(t) * d];
      } else q = [b.x + rand() * b.width, b.y + rand() * b.height];
      if (!inside(q)) continue;
      holes.push([blob(q, p.speckSize * size * (0.3 + rand() * rand() * 2.2), 4 + Math.floor(rand() * 3), rand)]);
      i++;
    }
    if (!holes.length) return geo;
    // Bordes orgánicos: cada agujero, rasgado (los lados largos se parten y se desplazan al azar).
    if (p.roughness > 0) {
      const detail = size * 0.006;
      for (const h of holes) {
        const r = tearPolyline(h[0]!.slice(0, -1) as Vec2[], true, detail, p.roughness, rand) as Pair[];
        h[0] = [...r, r[0]!];
      }
    }

    // Cada forma conserva su estilo: se le restan los agujeros.
    const out: Shape[] = [];
    for (const s of geo.shapes) {
      if ((s.style.fill ?? 'black') === 'none') {
        out.push(s);
        continue;
      }
      const r = regionOf([s], step);
      if (!r.length) continue;
      let cut: MultiPolygon;
      try {
        cut = difference(r, ...holes.map((h) => [h] as MultiPolygon));
      } catch {
        return geo;
      }
      const subpaths = cut.flatMap((pl) => pl.map(toSubPath)).filter((x) => x !== null);
      if (subpaths.length) out.push({ ...s, subpaths });
    }
    return { viewBox: geo.viewBox, shapes: out };
  },
});

/** Puntos al azar en el contorno (por longitud), con la normal hacia dentro. */
function edgeSampler(outer: Pair[][], rand: () => number) {
  const segs: { a: Vec2; b: Vec2; len: number; inward: Vec2 }[] = [];
  for (const ring of outer) {
    // Sentido del anillo, para saber hacia dónde es «dentro».
    let area = 0;
    for (let i = 0; i < ring.length - 1; i++) area += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
    const sgn = area > 0 ? 1 : -1;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0) segs.push({ a, b, len, inward: [(-(b[1] - a[1]) / len) * sgn, ((b[0] - a[0]) / len) * sgn] });
    }
  }
  const total = segs.reduce((s, x) => s + x.len, 0);
  if (!total) return null;
  return () => {
    let d = rand() * total;
    const s = segs.find((x) => (d <= x.len ? true : ((d -= x.len), false))) ?? segs[segs.length - 1]!;
    const k = d / s.len;
    return { at: [s.a[0] + (s.b[0] - s.a[0]) * k, s.a[1] + (s.b[1] - s.a[1]) * k] as Vec2, inward: s.inward };
  };
}

/** Banda alrededor de una línea: ancho `w`, que se afila hacia el final (`taper`), con algo de ruido. */
export function band(pts: Vec2[], w: number, taper: number, rand: () => number): Pair[] {
  const left: Pair[] = [], right: Pair[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!, c = pts[Math.min(n - 1, i + 1)]!;
    const dx = c[0] - a[0], dy = c[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const t = i / (n - 1);
    const half = (w / 2) * (1 - taper * t) * (0.5 + rand());
    const [nx, ny] = [-dy / l, dx / l];
    left.push([pts[i]![0] + nx * half, pts[i]![1] + ny * half]);
    right.push([pts[i]![0] - nx * half, pts[i]![1] - ny * half]);
  }
  const ring = [...left, ...right.reverse()];
  return [...ring, ring[0]!];
}

/** Mancha irregular de radio aproximado `r`. */
function blob(c: Vec2, r: number, n: number, rand: () => number): Pair[] {
  const a0 = rand() * Math.PI * 2;
  const pts = Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
    const k = r * (0.45 + rand() * 0.75);
    return [c[0] + Math.cos(a) * k, c[1] + Math.sin(a) * k] as Pair;
  });
  return [...pts, pts[0]!];
}
