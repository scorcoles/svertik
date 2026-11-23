// The Trace effect (Tracer): the path of the object it follows.
//
// Played as the player does (frame by frame), not with a single evaluation: the engine
// resolves dependencies between objects using the previous frame, and a trail computed
// in one go can come out different.

import { describe, expect, it } from 'vitest';
import { builtins, createEngine, sampleScene, type SceneV1 } from '../src';

const engine = () => createEngine(builtins);

/** A group with a moving object and a trail that follows it. */
const scene = (): SceneV1 => ({
  version: 1,
  objects: [
    {
      kind: 'group',
      id: 'g',
      name: 'g',
      stack: [],
      children: [
        {
          kind: 'shape',
          id: 'obj',
          name: 'obj',
          shape: 'rectangle',
          params: { width: 10, height: 10, fillColor: '#09fdd1' },
          stack: [],
        },
        {
          kind: 'shape',
          id: 'trail',
          name: 'trail',
          shape: 'line',
          params: { x1: 0, y1: 0, x2: 0, y2: 0 },
          stack: [{ id: 'tr', type: 'trace', params: { target: 'obj', length: 1, samples: 20 } }],
        },
      ],
    },
  ],
  animation: {
    duration: 2,
    loop: true,
    tracks: [
      { id: 'k1', node: 'obj', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100, ease: 'linear' }] },
    ],
  },
});

/** Plays the scene up to `t` and returns the trail's box. */
const trailBoxAt = (t: number) => {
  const e = engine();
  const s = scene();
  for (let i = 0; i * (1 / 30) <= t + 1e-9; i++) e.toSVG(sampleScene(s, i / 30));
  const doc = e.evaluateDocument(sampleScene(s, t));
  return doc.nodes.get('trail')!.box;
};

describe('traza', () => {
  it('the drawn path is the followed object\'s', () => {
    // At 0.5 s the object goes from x=0 to x=25; the trail must cover it.
    const box = trailBoxAt(0.5);
    expect(box.width).toBeGreaterThan(20);
    expect(box.height).toBeLessThan(5);   // the object moves horizontally
  });

  it('with the object still, the trail does not grow', () => {
    const e = engine();
    const s = scene();
    s.animation!.tracks[0]!.keys = [{ t: 0, value: 0 }, { t: 2, value: 0 }];
    for (let i = 0; i <= 30; i++) e.toSVG(sampleScene(s, i / 30));
    const doc = e.evaluateDocument(sampleScene(s, 1));
    const box = doc.nodes.get('trail')!.box;
    expect(box.width).toBeLessThan(1);
  });

  it('a trail does not grow the engine\'s work: time per frame holds', () => {
    const e = engine();
    const s = scene();
    // 60 frames: with and without the trail, the cost should be similar.
    const with_ = (() => { const t0 = performance.now(); for (let i = 0; i < 60; i++) e.toSVG(sampleScene(s, i / 30)); return performance.now() - t0; })();
    const s2 = scene();
    s2.objects[0]!.kind === 'group' && (s2.objects[0] as { children: unknown[] }).children.splice(1, 1);
    const e2 = engine();
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) e2.toSVG(sampleScene(s2, i / 30));
    const without = performance.now() - t0;
    // The trail cannot cost much more than the rest of the scene.
    expect(with_).toBeLessThan(without * 4 + 200);
  });
});
