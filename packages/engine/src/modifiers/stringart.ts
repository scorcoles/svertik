import { line, type Geometry, type Shape } from '../geometry';
import { polylines, pointAt } from '../paths';
import { defineModifier } from '../modifier';

/** Draws straight chords between evenly sampled positions on each closed input contour. */
export const stringart = defineModifier({
  type: 'stringart', label: 'String Art', kind: 'generator', family: 'utils',
  params: {
    points: { type: 'number', default: 120, min: 8, max: 256, step: 1, label: 'Points', ramp: false, random: [48, 160] },
    skip: { type: 'number', default: 37, min: 1, max: 255, step: 1, label: 'Skip', ramp: false, random: [11, 53] },
    phase: { type: 'angle', default: 0, label: 'Phase' },
  },
  apply(geo, p): Geometry {
    const count = Math.max(8, Math.min(256, Math.round(p.points)));
    const skip = 1 + ((Math.max(1, Math.round(p.skip)) - 1) % (count - 1));
    const output: Shape[] = [];
    for (const source of geo.shapes) {
      const polylinesForShape = polylines({ viewBox: geo.viewBox, shapes: [source] }, 20).filter((path) => path.closed && path.length > 1e-6);
      for (const path of polylinesForShape) {
        const offset = (((p.phase % 360) + 360) % 360 / 360) * path.length;
        const points = Array.from({ length: count }, (_, i) => pointAt(path, offset + (i / count) * path.length).p);
        const pairs = new Set<string>();
        for (let i = 0; i < count; i++) {
          const j = (i + skip) % count;
          if (i === j) continue;
          const key = i < j ? `${i}:${j}` : `${j}:${i}`;
          if (pairs.has(key)) continue;
          pairs.add(key);
          const a = points[i]!, b = points[j]!;
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) continue;
          const stroke = source.style.stroke && source.style.stroke !== 'none'
            ? source.style.stroke
            : source.style.fill && source.style.fill !== 'none' ? source.style.fill : '#333333';
          const width = source.style.stroke && source.style.stroke !== 'none' ? source.style['stroke-width'] ?? '1.5' : '1.5';
          output.push({
            ...source,
            style: { ...source.style, fill: 'none', stroke, 'stroke-width': width },
            subpaths: [{ start: a, segs: [line(a, b)], closed: false }],
            clone: output.length,
          });
        }
      }
    }
    return { viewBox: geo.viewBox, shapes: output };
  },
});
