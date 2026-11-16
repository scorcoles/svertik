import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type SceneV1, type StackInput } from '../src';

// A row of 5 vertical bars, 0..100 wide and 0..100 tall (each a 2-point path).
const bars = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + [0, 25, 50, 75, 100].map((x) => `<path d="M${x} 0V100" stroke="#000" fill="none"/>`).join('') + '</svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: bars, stack: [{ id: 'g', type: 'gather', params }] } as StackInput).shapes.map((s) => {
    const sp = s.subpaths[0]!;
    return [sp.start, ...sp.segs.map((g) => g.p)];
  });

describe('gather', () => {
  it('squeezes towards the left at the start edge and the right at the end edge', () => {
    const lines = run({ axis: 'x', start: 0.5, end: -0.5 });
    const tops = lines.map((l) => l[0]![0]), bottoms = lines.map((l) => l[l.length - 1]![0]);
    // Edges stay put; inner bars move left at the top and right at the bottom.
    expect(tops[0]).toBeCloseTo(0); expect(tops[4]).toBeCloseTo(100);
    expect(tops[1]!).toBeLessThan(25); expect(bottoms[1]!).toBeGreaterThan(25);
    // The middle bar's two ends are symmetric around 50.
    expect(tops[2]! + bottoms[2]!).toBeCloseTo(100);
  });

  it('keeps bars straight', () => {
    for (const l of run({ axis: 'x', start: 0.6, end: -0.4 })) {
      const [a, b] = [l[0]!, l[l.length - 1]!];
      for (const q of l) {
        const t = (q[1] - a[1]) / (b[1] - a[1]);
        expect(q[0]).toBeCloseTo(a[0] + (b[0] - a[0]) * t, 6);
      }
    }
  });

  it('does nothing at 0', () => {
    expect(run({ start: 0, end: 0 }).map((l) => l[0]![0])).toEqual([0, 25, 50, 75, 100]);
  });
});

describe('expressions inside point params', () => {
  it('Clone spacing can hold a formula per component', () => {
    const scene = { version: 1, custom: { pitch: 30 }, objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: 10, height: 10 },
      stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 3, rows: 1, spacing: [{ $expr: 'scene.custom.pitch / 10', fallback: 1 }, 1] } }] }] } as unknown as SceneV1;
    const box = createEngine(builtins).evaluateDocument(scene).nodes.get('r')!.box;
    expect(box.width).toBeCloseTo(2 * 30 + 10);
  });
});
