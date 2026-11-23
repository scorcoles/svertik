import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type SceneV1, type StackInput } from '../src';

// Nine vertical bars, evenly spaced 0..80 wide and 0..100 tall (each a 2-point path).
const xs = [0, 10, 20, 30, 40, 50, 60, 70, 80];
const bars = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100">' + xs.map((x) => `<path d="M${x} 0V100" stroke="#000" fill="none"/>`).join('') + '</svg>';
const run = (params: Record<string, unknown>, stack: StackInput['stack'] = []) =>
  createEngine(builtins).evaluateStack({ source: bars, stack: [...stack, { id: 'c', type: 'compress', params }] } as StackInput).shapes.map((s) => {
    const sp = s.subpaths[0]!;
    return [sp.start, ...sp.segs.map((g) => g.p)];
  });
const tops = (lines: ReturnType<typeof run>) => lines.map((l) => l[0]![0]);
const gaps = (v: number[]) => v.slice(1).map((x, i) => x - v[i]!);

describe('compress', () => {
  it('crowds marks towards the center, keeping the ends and the order', () => {
    const x = tops(run({ axis: 'x', start: 0.5, end: 0.5, strength: 0.8 }));
    expect(x[0]).toBeCloseTo(0); expect(x[8]).toBeCloseTo(80); expect(x[4]).toBeCloseTo(40);
    const g = gaps(x);
    for (const d of g) expect(d).toBeGreaterThan(0);
    // Gaps shrink towards the center from both ends.
    expect(g[0]!).toBeGreaterThan(g[3]!); expect(g[7]!).toBeGreaterThan(g[4]!);
    expect(g[3]!).toBeLessThan(10);
  });

  it('spreads marks away from the center with negative strength', () => {
    const g = gaps(tops(run({ start: 0.5, end: 0.5, strength: -0.8 })));
    expect(g[3]!).toBeGreaterThan(10); expect(g[0]!).toBeLessThan(10);
  });

  it('moves the center from start (top) to end (bottom)', () => {
    const lines = run({ start: 0.25, end: 0.75, strength: 1 });
    // The bar at x = 20 is at the top center and stays; at the bottom it is pulled towards 60.
    const bar = lines[2]!;
    expect(bar[0]![0]).toBeCloseTo(20);
    expect(bar[bar.length - 1]![0]).toBeGreaterThan(20);
  });

  it('works on y and does nothing at strength 0', () => {
    expect(tops(run({ strength: 0 }))).toEqual(xs);
    const y = run({ axis: 'y', start: 0.5, end: 0.5, strength: 0.8 });
    // Along y the bars keep their x and their ends stay at 0 and 100.
    expect(tops(y)).toEqual(xs);
    expect(y[0]![0]![1]).toBeCloseTo(0); expect(y[0]![y[0]!.length - 1]![1]).toBeCloseTo(100);
  });

  it('moves rigid pieces whole after Rigid Pieces', () => {
    // Bars become rigid pieces: each one moves sideways without bending, so it stays vertical.
    const lines = run({ start: 0.5, end: 0.5, strength: 0.8 }, [{ id: 'r', type: 'rigidpieces', params: { amount: 1 } }]);
    for (const l of lines) for (const q of l) expect(q[0]).toBeCloseTo(l[0]![0], 6);
  });
});

describe('subdivision after a Clone', () => {
  it('follows the grid, not the tiny source: a deformer after a Clone of small marks stays light', () => {
    // 2.6 × 15 px marks in a 44 × 34 grid. Before, the subdivision length came from the 15 px source (0.15 px),
    // so every mark was cut into ~240 commands and a frame took ~200 ms.
    const scene = { version: 1, objects: [{ kind: 'shape', id: 't', name: 't', shape: 'rectangle', params: { width: 2.6, height: 15, fill: true, stroke: false },
      stack: [{ id: 'g', type: 'clone', params: { mode: 'grid', columns: 44, rows: 34, spacing: [5.6, 1.5] } },
        { id: 'c', type: 'compress', params: { start: 0, end: 0, strength: 0.5 } }] }] } as unknown as SceneV1;
    const svg = createEngine(builtins).toSVG(scene);
    const commands = (svg.match(/[MLCZ]/g) ?? []).length;
    expect(commands / (44 * 34)).toBeLessThan(40);
  });
});
