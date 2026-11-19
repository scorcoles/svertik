import { describe, expect, it } from 'vitest';
import { line, type Shape, type Vec2 } from '../src/geometry';
import { colorAt, colorSampler, prepare } from '../src/modifiers/halftone';

function contour(cx: number, cy: number, radius: number, reverse = false) {
  const points: Vec2[] = Array.from({ length: 100 }, (_, i) => {
    const a = i * Math.PI * 2 / 100 * (reverse ? -1 : 1);
    const r = radius * (i % 2 ? 0.75 : 1);
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
  return { start: points[0]!, segs: points.map((p, i) => line(p, points[(i + 1) % points.length]!)), closed: true };
}

describe('indexed tone sampling', () => {
  it.each(['evenodd', 'nonzero'])('preserves overlap, holes, gradients and strokes with %s fills', (rule) => {
    const shapes: Shape[] = Array.from({ length: 12 }, (_, i) => ({
      style: { fill: 'url(#tone)', 'fill-rule': rule, stroke: '#225588', 'stroke-width': '2', opacity: '0.7' },
      gradients: [{ id: 'tone', kind: i % 2 ? 'linear' : 'radial', stops: [{ offset: 1, color: '#ffffff', opacity: 0.2 }, { offset: 0, color: '#000000' }] }],
      subpaths: [contour((i % 4) * 25, Math.floor(i / 4) * 25, 25), contour((i % 4) * 25, Math.floor(i / 4) * 25, 10, true)],
    }));
    const layers = shapes.map((s) => prepare(s, 0.25)!);
    expect(layers.every((l) => !!l.fillIndex && !!l.strokeIndex)).toBe(true);
    const reference = layers.map((l) => ({ ...l, fillIndex: undefined, strokeIndex: undefined }));
    const sample = colorSampler(layers), tone = colorSampler(layers, false);
    for (let y = -30; y <= 80; y += 2.7) for (let x = -30; x <= 105; x += 3.1) {
      const q: Vec2 = [x, y], expected = colorAt(reference, q);
      expect(sample(q)).toEqual(expected);
      expect(tone(q)?.rgba).toEqual(expected?.rgba);
    }
    // Exact bucket/outline boundaries must agree too.
    for (const l of layers) {
      for (let row = 0; row <= l.fillIndex!.rows.length; row++) {
        const q: Vec2 = [l.box[0] + 20, l.fillIndex!.y0 + row * l.fillIndex!.height];
        expect(sample(q)).toEqual(colorAt(reference, q));
      }
    }
  });
});
