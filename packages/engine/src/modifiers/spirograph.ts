import { bounds, type Cubic, type Geometry, type Shape, type SubPath, type Vec2 } from '../geometry';
import { defineModifier } from '../modifier';

/** Generates a closed hypotrochoid or epitrochoid inside the input drawing's bounds. */
export const spirograph = defineModifier({
  type: 'spirograph', label: 'Spirograph', kind: 'generator', family: 'utils',
  params: {
    mode: { type: 'enum', default: 'hypo', options: ['hypo', 'epi'] as const, label: 'Gear', animatable: false },
    ring: { type: 'number', default: 84, min: 12, max: 160, step: 1, label: 'Ring teeth', ramp: false },
    wheel: { type: 'number', default: 23, min: 2, max: 80, step: 1, label: 'Wheel teeth', ramp: false },
    pen: { type: 'number', default: 0.82, min: 0, max: 2, step: 0.01, label: 'Pen offset', ramp: false },
    phase: { type: 'angle', default: 0, label: 'Phase' },
    detail: { type: 'number', default: 1800, min: 120, max: 4096, step: 1, label: 'Detail', ramp: false, animatable: false },
  },
  apply(geo, p): Geometry {
    if (!geo.shapes.length) return geo;
    const box = bounds(geo);
    const width = Math.max(1e-6, box.width), height = Math.max(1e-6, box.height);
    const ring = Math.max(2, Math.round(p.ring)), wheel = Math.max(1, Math.min(ring - 1, Math.round(p.wheel)));
    const divisor = gcd(ring, wheel);
    const rotations = wheel / divisor;
    const count = Math.max(120, Math.min(4096, Math.round(p.detail)));
    const points: Vec2[] = [];
    const phase = (p.phase * Math.PI) / 180;
    const d = Math.max(0, Math.min(2, p.pen)) * wheel;
    for (let i = 0; i < count; i++) {
      const t = phase + (i / count) * Math.PI * 2 * rotations;
      const center = p.mode === 'epi' ? ring + wheel : ring - wheel;
      const frequency = center / wheel;
      const secondary = frequency * t;
      const x = p.mode === 'epi' ? center * Math.cos(t) - d * Math.cos(secondary) : center * Math.cos(t) + d * Math.cos(secondary);
      const y = p.mode === 'epi' ? center * Math.sin(t) - d * Math.sin(secondary) : center * Math.sin(t) - d * Math.sin(secondary);
      points.push([x, y]);
    }
    const x0 = Math.min(...points.map((q) => q[0])), x1 = Math.max(...points.map((q) => q[0]));
    const y0 = Math.min(...points.map((q) => q[1])), y1 = Math.max(...points.map((q) => q[1]));
    const scale = Math.min(width / Math.max(1e-6, x1 - x0), height / Math.max(1e-6, y1 - y0)) * 0.94;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    const placed = points.map(([x, y]): Vec2 => [cx + (x - (x0 + x1) / 2) * scale, cy + (y - (y0 + y1) / 2) * scale]);
    const segs: Cubic[] = placed.map((current, i) => {
      const previous = placed[(i - 1 + count) % count]!, next = placed[(i + 1) % count]!, after = placed[(i + 2) % count]!;
      const end = next;
      return {
        c1: [current[0] + (next[0] - previous[0]) / 6, current[1] + (next[1] - previous[1]) / 6],
        c2: [next[0] - (after[0] - current[0]) / 6, next[1] - (after[1] - current[1]) / 6],
        p: end,
      };
    });
    const path: SubPath = { start: placed[0]!, segs, closed: true };
    const source = geo.shapes[0]!;
    const stroke = source.style.stroke && source.style.stroke !== 'none'
      ? source.style.stroke
      : source.style.fill && source.style.fill !== 'none' ? source.style.fill : '#333333';
    const strokeWidth = source.style.stroke && source.style.stroke !== 'none' ? source.style['stroke-width'] ?? '1.5' : '1.5';
    return { viewBox: geo.viewBox, shapes: [{ ...source, style: { ...source.style, fill: 'none', stroke, 'stroke-width': strokeWidth }, subpaths: [path], clone: source.clone ?? 0 }] };
  },
});

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : a; }
