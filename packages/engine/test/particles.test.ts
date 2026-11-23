import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, type SceneV1, validateScene } from '../src';

const source = '<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#D2502F"/></svg>';
const run = (params: Record<string, unknown> = {}) => createEngine(builtins).evaluateStack({ source, stack: [{ id: 'p', type: 'particles', params }] });
const quiet = { emitter: 'point', speed: 0, gravity: 0, spin: 0, rotationRandom: 0, sizeRandom: 0, fade: 0 };

describe('particles', () => {
  it('duplicates the source geometry and colours with independent element tags', () => {
    const geo = run({ ...quiet, count: 12 });
    expect(geo.shapes).toHaveLength(12);
    expect(new Set(geo.shapes.map((s) => s.clone)).size).toBe(12);
    expect(geo.shapes.every((s) => s.style.fill === '#D2502F')).toBe(true);
    expect(geo.shapes.every((s) => s.subpaths[0]!.segs.length === 4)).toBe(true);
  });
  it('same seed/frame is reproducible, a different seed changes the layout', () => {
    expect(run({ time: 1.23 })).toEqual(run({ time: 1.23 }));
    expect(run({ seed: 2 })).not.toEqual(run({ seed: 3 }));
  });
  it('integrates velocity and gravity analytically', () => {
    const a = bounds(run({ ...quiet, count: 1, speed: 1, speedRandom: 0, direction: 0, spread: 0, gravity: 2, time: 0 }));
    const b = bounds(run({ ...quiet, count: 1, speed: 1, speedRandom: 0, direction: 0, spread: 0, gravity: 2, time: 0.5 }));
    expect(b.x - a.x).toBeCloseTo(50);
    expect(b.y - a.y).toBeCloseTo(25);
  });
  it('expires a burst and fades only at the end of its lifetime', () => {
    expect(run({ count: 10, time: 3, lifetime: 3 }).shapes).toHaveLength(0);
    const geo = run({ ...quiet, count: 1, time: 2.7, lifetime: 3, fade: 0.2 });
    expect(Number(geo.shapes[0]!.style.opacity)).toBeCloseTo(0.5);
  });
  it('streams births with stable ids and a bounded live population', () => {
    expect(run({ ...quiet, emission: 'stream', count: 10, lifetime: 2, time: 0 }).shapes).toHaveLength(1);
    const before = run({ ...quiet, emission: 'stream', count: 10, lifetime: 2, time: 1 });
    expect(before.shapes).toHaveLength(6);
    const late = run({ ...quiet, emission: 'stream', count: 10, lifetime: 2, time: 59 });
    expect(late.shapes).toHaveLength(10);
    expect(Math.min(...late.shapes.map((s) => s.clone!))).toBeGreaterThan(200);
    expect(run({ emission: 'stream', count: 100000, time: 60 }).shapes.length).toBeLessThanOrEqual(512);
  });
  it('does not move or mutate the source and can keep it explicitly', () => {
    const geo = run({ ...quiet, count: 1, size: 0.1 });
    expect(bounds(geo)).toEqual({ x: 45, y: 45, width: 10, height: 10 });
    expect(run({ ...quiet, count: 1, keepSource: true }).shapes).toHaveLength(2);
  });
  it('the complete source object, including all colours and paths, becomes one particle', () => {
    const scene: SceneV1 = { version: 1, objects: [
      { kind: 'object', id: 'emitter', name: 'Emitter', source: '<svg viewBox="0 0 20 10"><rect width="10" height="10" fill="red"/><rect x="10" width="10" height="10" fill="blue"/></svg>', stack: [{ id: 'p', type: 'particles', params: { ...quiet, count: 3, size: 0.2 } }] },
    ] };
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
    const doc = createEngine(builtins).evaluateDocument(scene);
    const geo = doc.geometryOf('emitter')!;
    expect(geo.shapes).toHaveLength(6);
    for (const id of [0, 1, 2]) expect(geo.shapes.filter((s) => s.clone === id).map((s) => s.style.fill)).toEqual(['red', 'blue']);
    expect(doc.geometry.shapes.every((s) => s.node === 'emitter')).toBe(true);
  });
  it('generated particles on a group remain selectable as that group', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'group', id: 'emitter-group', name: 'Emitter', children: [{ kind: 'shape', id: 'child', name: 'Child', shape: 'rectangle', params: {}, stack: [] }], stack: [{ id: 'p', type: 'particles', params: { count: 3 } }] }] };
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
    expect(createEngine(builtins).evaluateDocument(scene).geometry.shapes.every((s) => s.node === 'emitter-group')).toBe(true);
  });
  it('impulse bursts hand velocity and spin to Gravity without double movement', () => {
    const params = { ...quiet, motion: 'impulse', count: 1, speed: 1, speedRandom: 0, direction: 0, spread: 0, time: 0.5 };
    expect(bounds(run(params)).x).toBeCloseTo(47.5);
    const geo = createEngine(builtins).evaluateStack({ source, stack: [{ id: 'p', type: 'particles', params }, { id: 'g', type: 'gravity', params: { time: 0.5, gravity: 0, floor: [0.5, 30] } }] });
    expect(bounds(geo).x).toBeCloseTo(97.5);
    expect(geo.shapes[0]!.impulse).toBeUndefined();
  });
});

describe('particle motion and lifecycle', () => {
  it('continuous emission keeps evolving beyond sixty seconds, independently of seek order', () => {
    const p = { emission: 'stream', count: 40, turbulence: .2, drag: .7, swirl: 80, wind: [.1,-.05] };
    const late = run({ ...p, time: 180.25 });
    run({ ...p, time: .3 });
    expect(run({ ...p, time: 180.25 })).toEqual(late);
    expect(run({ ...p, time: 181.25 })).not.toEqual(late);
    expect(late.shapes.length).toBeLessThanOrEqual(40);
  });
  it('explicit birth rate does not change when lifetime changes; prewarm fills the emitter', () => {
    expect(run({ ...quiet, emission: 'stream', rate: 10, count: 200, lifetime: 3, time: 1 }).shapes).toHaveLength(11);
    expect(run({ ...quiet, emission: 'stream', rate: 10, count: 200, lifetime: 6, time: 1 }).shapes).toHaveLength(11);
    expect(run({ ...quiet, emission: 'stream', count: 40, time: 0, prewarm: true }).shapes).toHaveLength(40);
    expect(run({ ...quiet, emission: 'stream', count: 40, time: 0 }).shapes).toHaveLength(1);
  });
  it('varies lifetime without reshuffling initial positions or letting particles exceed the lifetime', () => {
    const params = { count: 40, emitter: 'box', area: [1,1], lifetime: 3, time: 0, fade: 0 };
    expect(run({ ...params, lifetimeRandom: .8 })).toEqual(run(params));
    expect(run({ ...params, lifetimeRandom: .8, time: 2.5 }).shapes.length).toBeLessThan(40);
    expect(run({ ...params, lifetimeRandom: .8, time: 3 }).shapes).toHaveLength(0);
  });
  it('drag has the closed-form decaying-velocity displacement and wind adds constant drift', () => {
    const p = { ...quiet, count: 1, speed: 1, speedRandom: 0, direction: 0, spread: 0, time: 1, drag: 2 };
    const origin = bounds(run({ ...p, time: 0 }));
    const damped = bounds(run(p));
    expect(damped.x-origin.x).toBeCloseTo(100*(1-Math.exp(-2))/2);
    const wind = bounds(run({ ...p, wind: [.2,-.1] }));
    expect(wind.x-damped.x).toBeCloseTo(20); expect(wind.y-damped.y).toBeCloseTo(-10);
  });
  it('turbulence starts at the birth position and changes the later trajectory smoothly', () => {
    const p = { ...quiet, count: 1, time: 0 };
    expect(run({ ...p, turbulence: .5 })).toEqual(run(p));
    const a = bounds(run({ ...p, turbulence: .5, time: 1 }));
    const b = bounds(run({ ...p, turbulence: .5, time: 1.001 }));
    expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeLessThan(1);
    expect(a).not.toEqual(bounds(run({ ...p, time: 1 })));
  });
  it('reference size decouples emitted size and velocity from the source dimensions', () => {
    const params = { ...quiet, count: 1, referenceSize: 400, size: .05, speed: 1, speedRandom: 0, direction: 0, spread: 0, time: 1 };
    const small = createEngine(builtins).evaluateStack({ source: '<svg><rect width="10" height="10"/></svg>', stack: [{ id:'p', type:'particles', params }] });
    const large = run(params);
    expect(bounds(small).width).toBeCloseTo(20); expect(bounds(large).width).toBeCloseTo(20);
    expect(bounds(small).x-5).toBeCloseTo(bounds(large).x-50);
  });
  it('lifecycle fades in and scales down while preserving source colors', () => {
    const p = { ...quiet, count:1, lifetime:4, fadeIn:.5, sizeEnd:0 };
    expect(run({ ...p, time:0 }).shapes[0]!.style.opacity).toBe('0');
    const half = run({ ...p, time:2 });
    expect(bounds(half).width).toBeCloseTo(bounds(run({ ...p, time:0 })).width/2);
    expect(half.shapes[0]!.style.fill).toBe('#D2502F');
  });
});


it('bounds work for arbitrarily large finite elapsed times', () => {
  const geo = run({ emission: 'stream', count: 64, rate: 2000, time: 1e20 });
  expect(geo.shapes.length).toBeLessThanOrEqual(64);
});
