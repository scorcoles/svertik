// Hover push: the pointer's path sweeps the bodies it passes near, without clicking; far ones stay put.
import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, sampleScene, type SceneSweep, type SceneV1, type Shape } from '../src';

const scene = (push: number): SceneV1 => ({
  version: 1, document: { width: 800, height: 400 },
  animation: { duration: 4, fps: 30, tracks: [], infinite: true, loop: false },
  objects: [{
    kind: 'group', id: 'g', name: 'World',
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, collisions: false, damping: 2, push } }],
    children: [
      { kind: 'shape', id: 'near', name: 'Near', shape: 'ellipse', params: { width: 20, height: 20 }, transform: { x: -100 }, stack: [] },
      { kind: 'shape', id: 'far', name: 'Far', shape: 'ellipse', params: { width: 20, height: 20 }, transform: { x: 250 }, stack: [] },
    ],
  }],
} as SceneV1);
const centre = (shapes: Shape[], node: string) => { const b = bounds({ viewBox: [0, 0, 0, 0], shapes: shapes.filter((s) => s.node === node) }); return [b.x + b.width / 2, b.y + b.height / 2]; };

/** Plays the scene frame by frame (one engine: the live world), the pointer sweeping right past `near` at 0.5 s. */
function play(push: number) {
  const engine = createEngine(builtins);
  const s = scene(push);
  // From (-160, 10) to (-40, 10) in 0.1 s: 1200 px/s, 10 px below the body's centre.
  const path: SceneSweep[] = [0, 1, 2, 3, 4].map((k) => ({ at: 0.5 + k * 0.025, x: -160 + k * 30, y: 10 }));
  let shapes: Shape[] = [];
  for (let f = 0; f <= 45; f++) {
    const t = f / 30;
    const sweeps = path.filter((p) => p.at <= t + 1e-6 && p.at >= t - 1);
    shapes = engine.evaluateDocument({ ...sampleScene(s, t), at: t, ...(sweeps.length ? { sweeps } : {}) }).geometry.shapes;
  }
  return shapes;
}

describe('Hover push', () => {
  it('moves the bodies the pointer sweeps past, along its way, and leaves far ones alone', () => {
    const shapes = play(60);
    const [nx, ny] = centre(shapes, 'near');
    expect(nx! - -100).toBeGreaterThan(40);
    expect(ny!).toBeLessThan(-2);
    expect(centre(shapes, 'far')).toEqual([250, 0]);
  });
  it('does nothing at 0', () => {
    expect(centre(play(0), 'near')).toEqual([-100, 0]);
  });
});
