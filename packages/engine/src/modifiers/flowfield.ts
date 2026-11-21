import { bounds, flatten, insidePolygons, type Cubic, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';
import { noise2D, rng } from '../random';

const MAX_POINTS = 120_000;

/** Integrates seeded streamlines through a smooth angle field, stopping at the input silhouette. */
export const flowfield = defineModifier({
  type: 'flowfield', label: 'Flow Field', kind: 'generator', family: 'utils',
  params: {
    lines: { type: 'number', default: 56, min: 1, max: 256, step: 1, label: 'Lines', ramp: false, random: [24, 100] },
    length: { type: 'number', default: 320, min: 20, max: 2400, step: 1, unit: 'px', label: 'Length', ramp: false, random: [160, 600] },
    step: { type: 'number', default: 4, min: 0.5, max: 20, step: 0.1, unit: 'px', label: 'Step', ramp: false, animatable: false },
    scale: { type: 'number', default: 3, min: 0.1, max: 20, step: 0.1, label: 'Field scale', ramp: false, random: [1, 8] },
    curl: { type: 'number', default: 1.2, min: 0, max: 2, step: 0.01, label: 'Curl', ramp: false, random: [0.5, 1.7] },
    direction: { type: 'angle', default: 0, label: 'Direction', ramp: false },
    seed: { type: 'seed', default: 1 },
  },
  apply(geo, p): Geometry {
    if (!geo.shapes.length) return { viewBox: geo.viewBox, shapes: [] };
    const box = bounds(geo);
    const size = Math.max(box.width, box.height);
    if (size < 1e-6) return { viewBox: geo.viewBox, shapes: [] };
    const polygons = geo.shapes.flatMap((shape) => shape.subpaths.filter((path) => path.closed).map((path) => flatten(path, 12)));
    const contains = polygons.length ? (point: Vec2) => insidePolygons(polygons, point)
      : (point: Vec2) => point[0] >= box.x && point[0] <= box.x + box.width && point[1] >= box.y && point[1] <= box.y + box.height;
    const random = rng(p.seed);
    const field = noise2D(p.seed);
    const step = Math.max(0.5, p.step);
    const requested = Math.max(1, Math.min(256, Math.round(p.lines)));
    const halfSteps = Math.max(2, Math.min(1200, Math.floor(Math.max(step, p.length) / (2 * step))));
    const budgetScale = Math.min(1, MAX_POINTS / Math.max(1, requested * (halfSteps * 2 + 1)));
    const lineCount = Math.max(1, Math.floor(requested * budgetScale));
    const scale = Math.max(0.01, p.scale) / size;
    const base = (p.direction * Math.PI) / 180;
    const curl = Math.max(0, Math.min(2, p.curl)) * Math.PI;
    const angleAt = (point: Vec2) => {
      const x = (point[0] - box.x) * scale, y = (point[1] - box.y) * scale;
      return base + field(x, y) * curl;
    };
    const velocity = (point: Vec2): Vec2 => { const a = angleAt(point); return [Math.cos(a), Math.sin(a)]; };
    const advance = (point: Vec2, sign: number): Vec2 => {
      const a = velocity(point);
      const middle: Vec2 = [point[0] + a[0] * sign * step * 0.5, point[1] + a[1] * sign * step * 0.5];
      const b = velocity(middle);
      return [point[0] + b[0] * sign * step, point[1] + b[1] * sign * step];
    };
    const output: Shape[] = [];
    const maximumAttempts = lineCount * 32;
    let attempts = 0;
    while (output.length < lineCount && attempts++ < maximumAttempts) {
      const seed: Vec2 = [box.x + random() * box.width, box.y + random() * box.height];
      if (!contains(seed)) continue;
      const trace = (sign: number) => {
        const points: Vec2[] = [seed];
        let current = seed;
        for (let i = 0; i < halfSteps; i++) {
          const next = advance(current, sign);
          if (!contains(next)) break;
          points.push(next);
          current = next;
        }
        return points;
      };
      const backward = trace(-1).reverse();
      const forward = trace(1);
      const points = [...backward.slice(0, -1), ...forward];
      if (points.length < 4) continue;
      const path = smoothPath(points, contains);
      const source = geo.shapes[0]!;
      const stroke = source.style.stroke && source.style.stroke !== 'none'
        ? source.style.stroke
        : source.style.fill && source.style.fill !== 'none' ? source.style.fill : '#333333';
      const strokeWidth = source.style.stroke && source.style.stroke !== 'none' ? source.style['stroke-width'] ?? '1.5' : '1.5';
      output.push({ ...source, style: { ...source.style, fill: 'none', stroke, 'stroke-width': strokeWidth }, subpaths: [path], clone: output.length });
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});

function smoothPath(points: Vec2[], contains: (point: Vec2) => boolean): SubPath {
  const segs: Cubic[] = [];
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))]!;
  for (let i = 0; i < points.length - 1; i++) {
    const a = at(i), b = at(i + 1), before = at(i - 1), after = at(i + 2);
    const curve: Cubic = {
      c1: [a[0] + (b[0] - before[0]) / 6, a[1] + (b[1] - before[1]) / 6],
      c2: [b[0] - (after[0] - a[0]) / 6, b[1] - (after[1] - a[1]) / 6],
      p: b,
    };
    // Catmull-Rom handles can overshoot the sampled silhouette near its edge.
    // Keep the smooth curve when it stays inside; otherwise use a straight cubic.
    const staysInside = [0.25, 0.5, 0.75].every((t) => contains(cubicPoint(a, curve, t)));
    segs.push(staysInside ? curve : {
      c1: [a[0] + (b[0] - a[0]) / 3, a[1] + (b[1] - a[1]) / 3],
      c2: [a[0] + (b[0] - a[0]) * 2 / 3, a[1] + (b[1] - a[1]) * 2 / 3],
      p: b,
    });
  }
  return { start: points[0]!, segs, closed: false };
}

function cubicPoint(start: Vec2, segment: Cubic, t: number): Vec2 {
  const u = 1 - t;
  return [
    u * u * u * start[0] + 3 * u * u * t * segment.c1[0] + 3 * u * t * t * segment.c2[0] + t * t * t * segment.p[0],
    u * u * u * start[1] + 3 * u * u * t * segment.c1[1] + 3 * u * t * t * segment.c2[1] + t * t * t * segment.p[1],
  ];
}
