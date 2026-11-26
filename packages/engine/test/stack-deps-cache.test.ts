import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type SceneV1 } from '../src/index';

const scene = (ringRadius: number, lens: number): SceneV1 => ({
  version: 1,
  objects: [
    { kind: 'shape', id: 'dots', name: 'Dots', shape: 'ellipse', params: { width: 3, height: 3 }, stack: [
      { id: 'clone', type: 'clone', params: { mode: 'object', target: 'ring', place: 'inside', count: 40, seed: 1 } },
      { id: 'lens', type: 'spherize', params: { center: [0.5, 0.5], radius: 0.3, strength: lens } },
    ] },
    { kind: 'shape', id: 'ring', name: 'Ring', shape: 'donut', visible: false, params: { radius: ringRadius, innerRadius: 40 }, stack: [] },
  ],
} as SceneV1);

describe('a stack step that looks at another object', () => {
  it('is reused while that object stays the same, and redone when it changes', () => {
    const engine = createEngine(builtins);
    const box = (s: SceneV1) => engine.evaluateDocument(s).nodes.get('dots')!.box;
    const fresh = (s: SceneV1) => createEngine(builtins).evaluateDocument(s).nodes.get('dots')!.box;
    box(scene(100, 0));
    // A later step changes: same result as a fresh engine (the Clone kept is still right).
    expect(box(scene(100, 0.6))).toEqual(fresh(scene(100, 0.6)));
    // The target grows: the Clone is redone, so the copies spread out.
    const grown = box(scene(200, 0.6));
    expect(grown).toEqual(fresh(scene(200, 0.6)));
    expect(grown.width).toBeGreaterThan(250);
  });
});
