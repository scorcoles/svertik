import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, sampleScene, type SceneV1 } from '../src';

// A bar flying right that Mosaic cuts in two at 0.5 s, inside Physics.
const scene = (): SceneV1 => ({
  version: 1,
  animation: { duration: 2, fps: 30, tracks: [{ id: 'cut', node: 'bar', on: 'modifier', modifier: 'mos', param: 'columns', keys: [{ t: 0.49, value: 1 }, { t: 0.51, value: 2 }] }] },
  objects: [{
    kind: 'group', id: 'g', name: 'Physics',
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, collisions: false } }],
    children: [{
      kind: 'shape', id: 'bar', name: 'Bar', shape: 'rectangle', params: { width: 200, height: 40 },
      stack: [{ id: 'rb', type: 'rigidbody', params: { velocity: [300, 0], spin: 90 } }, { id: 'mos', type: 'mosaic', params: { columns: 1, rows: 1, tile: 'rect', fit: 'cut' } }],
    }],
  }],
});
const centre = (e: ReturnType<typeof createEngine>, t: number) => {
  const shapes = e.evaluateDocument(sampleScene(scene(), t)).geometry.shapes.filter((s) => s.node === 'bar');
  const b = bounds({ viewBox: [0, 0, 0, 0], shapes });
  return { n: shapes.length, x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

describe('Physics when its pieces change', () => {
  it('the new pieces go on from where the body was, instead of starting over', () => {
    const e = createEngine(builtins);
    const before = centre(e, 0.48), after = centre(e, 0.48 + 1 / 30);
    expect(before.n).toBe(1);
    expect(after.n).toBe(2);
    // One frame further along its path.
    expect(after.x - before.x).toBeGreaterThan(5);
    expect(after.x - before.x).toBeLessThan(15);
    // Each half where it was inside the turned bar (about 50° by then): one above the other. Born apart at
    // the start, each would have turned on its own centre and both would stay level.
    const halves = e.evaluateDocument(sampleScene(scene(), 0.48 + 1 / 30)).geometry.shapes.filter((s) => s.node === 'bar').map((s) => bounds({ viewBox: [0, 0, 0, 0], shapes: [s] }));
    const dy = Math.abs(halves[0]!.y + halves[0]!.height / 2 - (halves[1]!.y + halves[1]!.height / 2));
    expect(dy).toBeGreaterThan(50);
  });

  it('jumping to a time gives what playing up to it gives', () => {
    const played = createEngine(builtins);
    for (let f = 0; f <= 40; f++) centre(played, f / 30);
    const end = centre(played, 40 / 30);
    const jumped = centre(createEngine(builtins), 40 / 30);
    expect(jumped.n).toBe(end.n);
    expect(jumped.x).toBeCloseTo(end.x, 6);
    expect(jumped.y).toBeCloseTo(end.y, 6);
  });
});
