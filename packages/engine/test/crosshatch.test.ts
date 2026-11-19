import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type SceneV1, type StackInput } from '../src';

// Left half black, right half light grey: the black side should get every layer, the grey side none.
const halves =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="0" y="0" width="100" height="100" fill="#000"/><rect x="100" y="0" width="100" height="100" fill="#eee"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: halves, stack: [{ id: 'h', type: 'crosshatch', params }] } as StackInput);
const ends = (params: Record<string, unknown>) => run(params).shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]));

describe('crosshatch', () => {
  it('can anchor lines to the scene through movement, rotation and scaling, including cached frames', () => {
    const engine = createEngine(builtins);
    const scene = (fixLines: boolean, y: number, rotation: number, scale: number): SceneV1 => ({
      version: 1, document: { width: 300, height: 300 },
      objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 100, fill: true, fillColor: '#000000' }, transform: { y, rotation, scale }, stack: [{ id: 'h', type: 'crosshatch', params: { angle: 0, spacing: 10, layers: 1, fixLines } }] }],
    });
    for (const [y, rotation, scale] of [[0, 0, 1], [3, 0, 1], [3, 35, 2], [7, 90, 0.5]]) {
      const shapes = engine.evaluateDocument(scene(true, y!, rotation!, scale!)).geometry.shapes;
      expect(shapes.length).toBeGreaterThan(2);
      for (const shape of shapes) for (const sp of shape.subpaths) {
        expect(sp.start[1] / 10).toBeCloseTo(Math.round(sp.start[1] / 10), 6);
        expect(sp.segs[0]!.p[1]).toBeCloseTo(sp.start[1], 6);
      }
    }
    const moving = engine.evaluateDocument(scene(false, 3, 0, 1)).geometry.shapes;
    expect(moving.length).toBeGreaterThan(2);
    expect(moving[0]!.subpaths[0]!.start[1] / 10).not.toBeCloseTo(Math.round(moving[0]!.subpaths[0]!.start[1] / 10), 6);
  });
  it('draws lines only where the tone passes the threshold, and they stop at the edge', () => {
    const pts = ends({ layers: 1, spacing: 5 });
    expect(pts.length).toBeGreaterThan(20);
    // Every end point stays on the dark half (bisection lands within a fraction of a pixel).
    expect(Math.max(...pts.map(([x]) => x))).toBeLessThan(100.2);
    expect(Math.min(...pts.map(([, y]) => y))).toBeGreaterThan(-0.2);
    // Some lines reach the boundary instead of stopping a sample short.
    expect(pts.filter(([x]) => x > 99.8).length).toBeGreaterThan(3);
  });

  it('adds a layer per threshold: more layers, more lines on the dark side', () => {
    const one = run({ layers: 1 }).shapes.length;
    const four = run({ layers: 4 }).shapes.length;
    expect(four).toBeGreaterThan(one * 3);
  });

  it('strokes with the ink, or with the colour below', () => {
    const ink = run({ layers: 1, ink: '#ff0000' }).shapes;
    expect(ink.every((s) => s.style.stroke === '#ff0000' && s.style.fill === 'none')).toBe(true);
    const orig = run({ layers: 1, color: 'original', invert: true }).shapes;
    // Inverted, the light half is the one shaded, in its own grey.
    expect(orig.length).toBeGreaterThan(0);
    expect(orig.every((s) => s.style.stroke === '#eee' || s.style.stroke === '#eeeeee')).toBe(true);
  });

  it('merges every line of one colour into a single path', () => {
    const merged = run({ layers: 2, merge: true }).shapes;
    expect(merged.length).toBe(1);
    expect(merged[0]!.subpaths.length).toBeGreaterThan(20);
  });

  it('leaves holes empty and splits strokes at their boundaries', () => {
    const source = '<svg viewBox="0 0 100 100"><path fill="#000" fill-rule="evenodd" d="M0 0H100V100H0Z M30 30H70V70H30Z"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source, stack: [{ id: 'h', type: 'crosshatch', params: { angle: 0, spacing: 5, layers: 1 } }] });
    const middle = geo.shapes.flatMap((s) => s.subpaths).filter((sp) => sp.start[1] > 35 && sp.start[1] < 65);
    expect(middle.length).toBeGreaterThan(4);
    for (const sp of middle) {
      const xs = [sp.start[0], ...sp.segs.map((seg) => seg.p[0])];
      expect(Math.max(...xs) <= 30.1 || Math.min(...xs) >= 69.9).toBe(true);
    }
  });

  it('samples gradient darkness rather than treating the whole fill as black', () => {
    const source = '<svg viewBox="0 0 100 100"><defs><linearGradient id="tone"><stop stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient></defs><rect width="100" height="100" fill="url(#tone)"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source, stack: [{ id: 'h', type: 'crosshatch', params: { angle: 0, layers: 1, spacing: 5 } }] });
    const xs = geo.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start[0], ...sp.segs.map((seg) => seg.p[0])]));
    expect(xs.length).toBeGreaterThan(20);
    expect(Math.max(...xs)).toBeCloseTo(50, 0);
  });

  it('produces no strokes for an unpainted source', () => {
    const source = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="none"/></svg>';
    expect(createEngine(builtins).evaluateStack({ source, stack: [{ id: 'h', type: 'crosshatch', params: {} }] }).shapes).toHaveLength(0);
  });
});
