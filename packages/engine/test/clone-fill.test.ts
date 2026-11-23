import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type Shape, type StackInput } from '../src';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 10, rows: 6, spacing: [1, 1], ...params } }] } as StackInput).shapes;
const centreY = (s: Shape) => s.subpaths[0]!.start[1];

describe('clone grid fill', () => {
  it('keeps every cell by default', () => expect(run({})).toHaveLength(60));

  it('keeps the share asked for', () => {
    expect(run({ fill: 0.5 })).toHaveLength(30);
    expect(run({ fill: 0 })).toHaveLength(0);
  });

  it('grows from the side Fill angle points to (90°: the bottom)', () => {
    const ys = run({ fill: 0.5, fillDirection: 1, fillAngle: 90 }).map(centreY);
    const mid = (Math.min(...run({}).map(centreY)) + Math.max(...run({}).map(centreY))) / 2;
    expect(ys.filter((y) => y > mid).length).toBeGreaterThan(ys.length * 0.75);
    const up = run({ fill: 0.5, fillDirection: 1, fillAngle: -90 }).map(centreY);
    expect(up.filter((y) => y < mid).length).toBeGreaterThan(up.length * 0.75);
  });

  it('is seeded', () => {
    const a = JSON.stringify(run({ fill: 0.5, fillSeed: 3 }));
    expect(JSON.stringify(run({ fill: 0.5, fillSeed: 3 }))).toBe(a);
    expect(JSON.stringify(run({ fill: 0.5, fillSeed: 4 }))).not.toBe(a);
  });

  it('counts a 2×2 copy as four cells', () => {
    const shapes = run({ packLarge: '2x2', largeRatio: 0.3, fill: 0.5, gap: 0 });
    const area = shapes.reduce((sum, s) => {
      const xs = s.subpaths[0]!.segs.map((g) => g.p[0]);
      const w = Math.max(...xs) - Math.min(...xs);
      return sum + (w > 15 ? 4 : 1);
    }, 0);
    expect(area).toBeGreaterThanOrEqual(30);
    expect(area).toBeLessThanOrEqual(33);
  });
});

describe('clone grid gaps with large copies', () => {
  it('a 2×2 copy spans its two cells and the gap between them, so every gap is the same', () => {
    const shapes = run({ packLarge: '2x2', largeRatio: 0.3, gap: 4 });
    const boxes = shapes.map((s) => {
      const pts = [s.subpaths[0]!.start, ...s.subpaths[0]!.segs.map((g) => g.p)];
      const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    });
    const large = boxes.filter((b) => b.x1 - b.x0 > 15);
    expect(large.length).toBeGreaterThan(0);
    for (const b of large) {
      expect(b.x1 - b.x0).toBeCloseTo(24, 6);
      expect(b.y1 - b.y0).toBeCloseTo(24, 6);
    }
    // Horizontal neighbours on the same row: the space between any two is exactly the gap.
    for (const a of boxes) for (const b of boxes) {
      if (a === b || Math.abs(a.y0 - b.y0) > 1e-6 || b.x0 <= a.x1) continue;
      const between = b.x0 - a.x1;
      if (between < 10) expect(between).toBeCloseTo(4, 6);
    }
  });
});
