import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type StackInput } from '../src';

const line = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0L0 100" stroke="#123456" fill="none"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: line, stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 6, rows: 2, ...params } }] } as StackInput).shapes;
const heights = (shapes: ReturnType<typeof run>) => shapes.map((s) => { const sp = s.subpaths[0]!; return Math.abs(sp.segs[sp.segs.length - 1]!.p[1] - sp.start[1]); });

describe('clone variation', () => {
  it('changes nothing with its defaults', () => {
    expect(run({})).toEqual(run({ jitter: [0, 0], scaleMin: 1, scaleMax: 1, rotateJitter: 0 }));
  });

  it('scales each copy inside the range, reproducibly', () => {
    const a = heights(run({ scaleMin: 0.5, scaleMax: 1.5, variationSeed: 4 }));
    expect(a).toEqual(heights(run({ scaleMin: 0.5, scaleMax: 1.5, variationSeed: 4 })));
    expect(a).not.toEqual(heights(run({ scaleMin: 0.5, scaleMax: 1.5, variationSeed: 5 })));
    for (const h of a) { expect(h).toBeGreaterThanOrEqual(50 - 1e-6); expect(h).toBeLessThanOrEqual(150 + 1e-6); }
    expect(new Set(a.map((h) => Math.round(h))).size).toBeGreaterThan(6);
  });

  it('jitters positions and rotations without losing copies', () => {
    const plain = run({}), moved = run({ jitter: [0.2, 0.2], rotateJitter: 20 });
    expect(moved.length).toBe(plain.length);
    expect(moved.some((s, i) => s.subpaths[0]!.start[0] !== plain[i]!.subpaths[0]!.start[0])).toBe(true);
  });

  it('lets the Color effect assign a seeded palette colour to each copy', () => {
    const engine = createEngine(builtins);
    const render = () => engine.evaluateStack({ source: line, stack: [
      { id: 'c', type: 'clone', params: { mode: 'grid', columns: 6, rows: 2 } },
      { id: 'color', type: 'color', params: { mode: 'palette', palette: ['#ff0000', '#00ff00'], seed: 1, target: 'stroke' } },
    ] } as StackInput).shapes;
    const shapes = render();
    const colours = shapes.map((s) => s.style.stroke);
    expect(colours.every((c) => c === '#ff0000' || c === '#00ff00')).toBe(true);
    expect(new Set(colours).size).toBe(2);
    expect(render().map(s => s.style.stroke)).toEqual(colours);
  });
});
