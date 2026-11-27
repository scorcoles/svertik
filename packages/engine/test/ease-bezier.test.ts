import { describe, expect, it } from 'vitest';
import { bezierEase, bezierOf, ease, parseBezier, sampleScene, type SceneV1 } from '../src';

describe('custom ease (cubic-bezier)', () => {
  it('solves curves as CSS does', () => {
    expect(ease('cubic-bezier(0, 0, 1, 1)', 0.3)).toBeCloseTo(0.3, 5);
    // CSS "ease" (0.25, 0.1, 0.25, 1) at half time: ≈ 0.8024.
    expect(ease('cubic-bezier(0.25, 0.1, 0.25, 1)', 0.5)).toBeCloseTo(0.8024, 3);
    expect(ease('cubic-bezier(0.25, 0.1, 0.25, 1)', 0)).toBe(0);
    expect(ease('cubic-bezier(0.25, 0.1, 0.25, 1)', 1)).toBe(1);
    // y may overshoot (a back-like curve).
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => ease('cubic-bezier(0.34, 1.56, 0.64, 1)', i / 49)))).toBeGreaterThan(1.05);
  });

  it('parses, writes and seeds from named curves', () => {
    expect(parseBezier('cubic-bezier(0.1, -0.5, 2, 1.5)')).toEqual([0.1, -0.5, 1, 1.5]);
    expect(parseBezier('ease-in')).toBeNull();
    expect(bezierEase([0.12345, 1, 0.5, 0])).toBe('cubic-bezier(0.123, 1, 0.5, 0)');
    expect(bezierOf('ease-in-out')).toEqual([0.65, 0, 0.35, 1]);
    expect(bezierOf('bounce-out')).toBeNull();
    // The seeds draw close to the curves they stand for.
    for (const name of ['ease-in', 'ease-out', 'ease-in-out', 'expo-out'] as const) {
      const custom = bezierEase(bezierOf(name)!);
      for (const x of [0.25, 0.5, 0.75]) expect(Math.abs(ease(custom, x) - ease(name, x))).toBeLessThan(0.08);
    }
  });

  it('a key with a custom ease drives the track', () => {
    const scene: SceneV1 = {
      version: 1,
      animation: { duration: 1, tracks: [{ id: 't', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'cubic-bezier(0.25, 0.1, 0.25, 1)' }, { t: 1, value: 100 }] }] },
      objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'rectangle', params: {}, stack: [] }],
    };
    expect(sampleScene(scene, 0.5).objects[0]!.transform!.x).toBeCloseTo(80.24, 1);
  });
});
