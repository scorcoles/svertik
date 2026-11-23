import { splitCubic, type Cubic, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

interface Strand {
  shape: Shape;
  path: SubPath;
  segments: Cubic[];
  start: Vec2;
  length: number;
  samples: { a: Vec2; b: Vec2; segment: number; t0: number; t1: number; from: number; to: number }[];
  crossings: Crossing[];
}
interface Crossing { point: Vec2; a: Strand; b: Strand; atA: number; atB: number; }

/** Alternates which open stroked path passes over at each crossing, cutting a clean gap below. */
export const weave = defineModifier({
  type: 'weave', label: 'Weave', kind: 'generator', family: 'utils',
  params: {
    gap: { type: 'number', default: 12, min: 0, max: 120, step: 0.5, unit: 'px', label: 'Gap' },
    samples: { type: 'number', default: 10, min: 4, max: 24, step: 1, label: 'Curve detail', animatable: false },
  },
  apply(geo, p): Geometry {
    const strands: Strand[] = [];
    for (const shape of geo.shapes) {
      if (shape.style.stroke === 'none' || Number.parseFloat(shape.style['stroke-width'] ?? '0') <= 0 || shape.style.fill !== 'none') continue;
      // Filled contours keep their fill. Weave is for open linework; stroke-only closed paths are supported too.
      for (const path of shape.subpaths) {
        if (path.closed && shape.style.fill !== 'none') continue;
        const segments = path.closed ? [...path.segs, straight(path.segs.at(-1)?.p ?? path.start, path.start)] : path.segs;
        if (!segments.length) continue;
        const strand: Strand = { shape, path, segments, start: path.start, length: 0, samples: [], crossings: [] };
        let point = path.start;
        const count = Math.max(4, Math.min(24, Math.round(p.samples)));
        segments.forEach((segment, si) => {
          let previous = point;
          for (let i = 1; i <= count; i++) {
            const t0 = (i - 1) / count, t1 = i / count;
            const next = cubicAt(point, segment, t1);
            const length = distance(previous, next);
            strand.samples.push({ a: previous, b: next, segment: si, t0, t1, from: strand.length, to: strand.length + length });
            strand.length += length;
            previous = next;
          }
          point = segment.p;
        });
        if (strand.samples.length) strands.push(strand);
      }
    }
    if (strands.length < 2) return geo;

    const edges = strands.flatMap((strand) => strand.samples.map((sample) => ({ strand, sample,
      minX: Math.min(sample.a[0], sample.b[0]), maxX: Math.max(sample.a[0], sample.b[0]),
      minY: Math.min(sample.a[1], sample.b[1]), maxY: Math.max(sample.a[1], sample.b[1]),
    }))).sort((a, b) => a.minX - b.minX);
    const active: typeof edges = [];
    const seen = new Set<string>();
    let checks = 0;
    for (const edge of edges) {
      for (let i = active.length - 1; i >= 0; i--) if (active[i]!.maxX < edge.minX) active.splice(i, 1);
      for (const other of active) {
        if (other.strand === edge.strand || other.maxY < edge.minY || edge.maxY < other.minY) continue;
        if (++checks > 250_000) break;
        const hit = intersect(other.sample.a, other.sample.b, edge.sample.a, edge.sample.b);
        if (!hit) continue;
        const [ta, tb, point] = hit;
        const key = `${Math.min(strands.indexOf(other.strand), strands.indexOf(edge.strand))}:${Math.max(strands.indexOf(other.strand), strands.indexOf(edge.strand))}:${Math.round(point[0] * 100)}:${Math.round(point[1] * 100)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const atA = other.sample.from + (other.sample.to - other.sample.from) * ta;
        const atB = edge.sample.from + (edge.sample.to - edge.sample.from) * tb;
        const crossing: Crossing = { point, a: other.strand, b: edge.strand, atA, atB };
        other.strand.crossings.push(crossing); edge.strand.crossings.push(crossing);
      }
      active.push(edge);
      if (checks > 250_000) break;
    }

    const gap = Math.max(0, p.gap);
    const cutAt = new Map<Strand, [number, number][]>();
    for (const strand of strands) strand.crossings.sort((a, b) => (a.a === strand ? a.atA - b.atA : a.atB - b.atB));
    for (const strand of strands) {
      strand.crossings.forEach((crossing, index) => {
        const strandIsA = crossing.a === strand;
        const other = strandIsA ? crossing.b : crossing.a;
        const otherIndex = other.crossings.indexOf(crossing);
        const aOver = (index + otherIndex) % 2 === 0;
        const strandOver = strandIsA ? aOver : !aOver;
        if (!strandOver) {
          const at = strandIsA ? crossing.atA : crossing.atB;
          const cuts = cutAt.get(strand) ?? [];
          cuts.push([Math.max(0, at - gap / 2), Math.min(strand.length, at + gap / 2)]);
          cutAt.set(strand, cuts);
        }
      });
    }

    const byShape = new Map<Shape, SubPath[]>();
    const strandSet = new Set(strands.map((s) => s.path));
    for (const shape of geo.shapes) {
      const unchanged = shape.subpaths.filter((path) => !strandSet.has(path));
      if (unchanged.length) byShape.set(shape, [...unchanged]);
    }
    for (const strand of strands) {
      const cuts = (cutAt.get(strand) ?? []).sort((a, b) => a[0] - b[0]);
      const merged: [number, number][] = [];
      for (const cut of cuts) {
        const last = merged.at(-1);
        if (last && cut[0] <= last[1]) last[1] = Math.max(last[1], cut[1]);
        else merged.push([...cut]);
      }
      let from = 0;
      const kept: [number, number][] = [];
      for (const [a, b] of merged) { if (a > from) kept.push([from, a]); from = Math.max(from, b); }
      if (from < strand.length) kept.push([from, strand.length]);
      const paths = byShape.get(strand.shape) ?? [];
      for (const [a, b] of kept) {
        const result = slicePath(strand, a, b);
        if (result) paths.push(result);
      }
      byShape.set(strand.shape, paths);
    }
    return { ...geo, shapes: geo.shapes.flatMap((shape) => {
      const paths = byShape.get(shape);
      return paths?.length ? [{ ...shape, subpaths: paths }] : [];
    }) };
  },
});

function distance(a: Vec2, b: Vec2) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function cubicAt(p0: Vec2, s: Cubic, t: number): Vec2 {
  const u = 1 - t;
  return [u ** 3 * p0[0] + 3 * u * u * t * s.c1[0] + 3 * u * t * t * s.c2[0] + t ** 3 * s.p[0], u ** 3 * p0[1] + 3 * u * u * t * s.c1[1] + 3 * u * t * t * s.c2[1] + t ** 3 * s.p[1]];
}
function straight(a: Vec2, b: Vec2): Cubic { return { c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3], c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3], p: b }; }
function intersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): [number, number, Vec2] | null {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-8) return null;
  const qx = c[0] - a[0], qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (t < -1e-5 || t > 1 + 1e-5 || u < -1e-5 || u > 1 + 1e-5) return null;
  const ta = Math.max(0, Math.min(1, t)), tb = Math.max(0, Math.min(1, u));
  return [ta, tb, [a[0] + rx * ta, a[1] + ry * ta]];
}
function cubicBetween(p0: Vec2, s: Cubic, t0: number, t1: number): Cubic {
  const left = t0 > 0 ? splitCubic(p0, s, t0)[1] : s;
  return t1 < 1 ? splitCubic(cubicAt(p0, s, t0), left, (t1 - t0) / (1 - t0))[0] : left;
}
function slicePath(strand: Strand, from: number, to: number): SubPath | null {
  const pieces: { segment: Cubic; start: Vec2; t0: number; t1: number }[] = [];
  for (const sample of strand.samples) {
    const lo = Math.max(from, sample.from), hi = Math.min(to, sample.to);
    if (hi - lo <= 1e-4 || sample.to - sample.from <= 1e-8) continue;
    const fraction0 = (lo - sample.from) / (sample.to - sample.from), fraction1 = (hi - sample.from) / (sample.to - sample.from);
    const t0 = sample.t0 + (sample.t1 - sample.t0) * fraction0, t1 = sample.t0 + (sample.t1 - sample.t0) * fraction1;
    let start = strand.start;
    for (let i = 0; i < sample.segment; i++) start = strand.segments[i]!.p;
    pieces.push({ segment: cubicBetween(start, strand.segments[sample.segment]!, t0, t1), start: cubicAt(start, strand.segments[sample.segment]!, t0), t0, t1 });
  }
  if (!pieces.length) return null;
  const segs: Cubic[] = [];
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    if (i && distance(pieces[i - 1]!.segment.p, piece.start) > 0.01) return null;
    segs.push(piece.segment);
  }
  return { start: pieces[0]!.start, segs, closed: false };
}
