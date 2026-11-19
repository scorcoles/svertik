import { describe, expect, it } from 'vitest';
import { apply, builtins, createEngine, invert, type Mat, type SceneV1, type StackInput } from '../src';

// Left half black, right half light grey: the black side should get every layer, the grey side none.
const halves =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect x="0" y="0" width="100" height="100" fill="#000"/><rect x="100" y="0" width="100" height="100" fill="#eee"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: halves, stack: [{ id: 'h', type: 'crosshatch', params }] } as StackInput);
const ends = (params: Record<string, unknown>) => run(params).shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]));

describe('crosshatch', () => {
  it('does not explode an initially crossing screen when Collisions is enabled, and can replay it', () => {
    const scene = (time: number): SceneV1 => ({ version: 1, objects: [{ kind: 'shape', id: 'hex', name: 'Hexagon', shape: 'polygon', params: { radius: 80, sides: 6, fill: true, fillColor: '#333333' }, transform: { rotation: 21 }, stack: [
      { id: 'h', type: 'crosshatch', params: { spacing: 12, angle: 73, layers: 3, merge: false } },
      { id: 'fall', type: 'gravity', params: { time, collisions: true, floor: [0.5, 4], bounce: 0.5 } },
    ] }] });
    const engine = createEngine(builtins);
    const before = engine.evaluateDocument(scene(0)).geometry.shapes;
    for (const time of [1 / 30, 0.3, 0.9]) {
      const after = engine.evaluateDocument(scene(time)).geometry.shapes;
      expect(after).toHaveLength(before.length);
      for (let i = 0; i < after.length; i++) {
        const a = after[i]!.subpaths[0]!, b = before[i]!.subpaths[0]!;
        expect(a.start[0]).toBeCloseTo(b.start[0], 5);
        expect(a.start[1] - b.start[1]).toBeCloseTo(0.5 * 160 * time * time, 5);
        expect(a.segs[0]!.p[0] - a.start[0]).toBeCloseTo(b.segs[0]!.p[0] - b.start[0], 5);
      }
    }
    engine.evaluateDocument(scene(3));
    engine.evaluateDocument(scene(0.3));
    const replay = engine.toSVG(scene(3));
    expect(replay).toBe(createEngine(builtins).toSVG(scene(3)));
  });
  it('lets unmerged lines settle independently on both a Solid and the Floor', () => {
    const engine = createEngine(builtins);
    for (const solid of [false, true]) {
      const scene: SceneV1 = { version: 1, objects: [
        { kind: 'shape', id: 'hex', name: 'Hexagon', shape: 'polygon', params: { radius: 20, sides: 6, fill: true, fillColor: '#000000' }, stack: [
          { id: 'h', type: 'crosshatch', params: { spacing: 8, angle: 0, layers: 1, merge: false, width: 2 } },
          { id: 'fall', type: 'gravity', params: { time: 3, solids: solid ? ['platform'] : [], floor: [0.5, solid ? 20 : 2.75], bounce: 0 } },
        ] },
        { kind: 'shape', id: 'platform', name: 'Platform', visible: false, shape: 'rectangle', params: { width: 400, height: 20, fill: true }, transform: { y: 100 }, stack: [] },
      ] };
      const ys = engine.evaluateDocument(scene).geometry.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start[1], ...sp.segs.map((seg) => seg.p[1])]));
      expect(ys.length).toBeGreaterThan(4);
      // Both surfaces are at Y=90. Every independent 2px stroke rests just above it.
      expect(Math.max(...ys)).toBeLessThan(90.1);
      expect(Math.min(...ys)).toBeGreaterThan(87);
    }
  });
  it('keeps merged Original-colour lines as one rigid body on solids and the floor', () => {
    const engine = createEngine(builtins);
    const scene = (time: number, solids: string[]): SceneV1 => ({ version: 1, objects: [
      { kind: 'shape', id: 'hex', name: 'Hexagon', shape: 'polygon', params: { radius: 40, sides: 6, fill: true, fillColor: '#000000' }, stack: [
        { id: 'tone', type: 'gradient', params: { from: '#000000', to: '#777777' } },
        { id: 'h', type: 'crosshatch', params: { spacing: 8, color: 'original', merge: true } },
        { id: 'fall', type: 'gravity', params: { time, solids, floor: [0.5, 8], bounce: 0 } },
      ] },
      { kind: 'shape', id: 'platform', name: 'Platform', visible: false, shape: 'rectangle', params: { width: 400, height: 20, fill: true }, transform: { y: 100 }, stack: [] },
    ] });
    const points = (time: number, solids: string[]) => engine.evaluateDocument(scene(time, solids)).geometry.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((seg) => seg.p)]));
    const before = points(0, []);
    expect(before.length).toBeGreaterThan(30);
    for (const solids of [[], ['platform']]) {
      const after = points(3, solids);
      expect(after).toHaveLength(before.length);
      for (let i = 1; i < before.length; i += 17) {
        const distance = (p: readonly (readonly [number, number])[]) => Math.hypot(p[i]![0] - p[0]![0], p[i]![1] - p[0]![1]);
        expect(distance(after)).toBeCloseTo(distance(before), 5);
      }
      if (solids.length) expect(Math.max(...after.map((p) => p[1]))).toBeLessThan(91);
      else expect(Math.max(...after.map((p) => p[1]))).toBeGreaterThan(200);
    }
  });
  it('attaches lines to the actual cracked hexagon fragments during rigid-body fall', () => {
    const engine = createEngine(builtins);
    for (const time of [0.2, 0.4]) {
      const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'hex', name: 'Hexagon', shape: 'polygon', params: { sides: 6, radius: 100, fill: true, fillColor: '#000000' }, stack: [
        { id: 'gradient', type: 'gradient', params: { from: '#000000', to: '#777777' } },
        { id: 'crack', type: 'crack', params: { mode: 'shatter', cracks: 5, separation: 10 } },
        { id: 'gravity', type: 'gravity', params: { time } },
        { id: 'h', type: 'crosshatch', params: { angle: 0, spacing: 10, layers: 1, fixLines: false } },
      ] }] };
      const doc = engine.evaluateDocument(scene);
      const originY = doc.nodes.get('hex')!.bounds.y;
      expect(doc.geometry.shapes.length).toBeGreaterThan(10);
      for (const shape of doc.geometry.shapes) {
        expect(shape.patternTransform).toBeDefined();
        const inverse = invert(shape.patternTransform!);
        for (const sp of shape.subpaths) {
          const a = apply(inverse, sp.start), b = apply(inverse, sp.segs[0]!.p);
          expect(a[1]).toBeCloseTo(b[1], 5);
          const phase = (a[1] - originY) / 10;
          expect(phase).toBeCloseTo(Math.round(phase), 5);
        }
      }
    }
  });
  it.each([false, true])('tracks Gravity inside the stack only when Fix lines is off (%s)', (fixLines) => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 100, fill: true, fillColor: '#000000' }, stack: [
      { id: 'fall', type: 'gravity', params: { time: 0.2, physics: false } },
      { id: 'h', type: 'crosshatch', params: { angle: 0, spacing: 10, layers: 1, fixLines } },
    ] }] };
    const shapes = createEngine(builtins).evaluateDocument(scene).geometry.shapes;
    expect(shapes.length).toBeGreaterThan(5);
    for (const shape of shapes) {
      const y = shape.subpaths[0]!.start[1] - (fixLines ? 0 : 2);
      expect(y / 10).toBeCloseTo(Math.round(y / 10), 6);
    }
  });

  it('keeps lines attached through a stack Transform rotation and translation', () => {
    const matrix: Mat = [Math.cos(Math.PI / 6), 0.5, -0.5, Math.cos(Math.PI / 6), 3, 7];
    const scene = (fixLines: boolean): SceneV1 => ({ version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 100, fill: true, fillColor: '#000000' }, stack: [
      { id: 'move', type: 'transform', params: { x: 3, y: 7, rotation: 30 } },
      { id: 'h', type: 'crosshatch', params: { angle: 0, spacing: 10, layers: 1, fixLines } },
    ] }] });
    const engine = createEngine(builtins);
    for (const fixLines of [false, true]) {
      const shapes = engine.evaluateDocument(scene(fixLines)).geometry.shapes;
      expect(shapes.length).toBeGreaterThan(5);
      for (const shape of shapes) for (const sp of shape.subpaths) {
        const a = fixLines ? sp.start : apply(invert(matrix), sp.start);
        const b = fixLines ? sp.segs[0]!.p : apply(invert(matrix), sp.segs[0]!.p);
        expect(a[1]).toBeCloseTo(b[1], 6);
        expect(a[1] / 10).toBeCloseTo(Math.round(a[1] / 10), 6);
      }
    }
  });
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
