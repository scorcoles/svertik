import { describe, expect, it } from 'vitest';
import { builtins, createEngine, ease, mixColor, parseColor, rgbToOklab, sampleScene, setKey, toHex, trackTime, valueAt, type SceneV2 } from '../src';

const scene = (): SceneV2 => ({
  version: 2,
  objects: [{ kind: 'shape', id: 's', name: 's', shape: 'star', params: { radius: 50, fillColor: '#000000' }, stack: [{ id: 'w', type: 'wave', params: { amplitude: 0 } }] }],
  animation: {
    duration: 2,
    tracks: [
      { id: 'a', node: 's', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100 }] },
      { id: 'b', node: 's', on: 'shape', param: 'fillColor', keys: [{ t: 0, value: '#000000', ease: 'linear' }, { t: 1, value: '#ffffff' }] },
      { id: 'c', node: 's', on: 'modifier', modifier: 'w', param: 'amplitude', keys: [{ t: 0, value: 0, ease: 'hold' }, { t: 1, value: 0.2 }] },
    ],
  },
});

describe('animation', () => {
  it('interpolates numbers and colours and respects hold', () => {
    const s = sampleScene(scene(), 1);
    const n = s.objects[0]!;
    expect(n.transform?.x).toBeCloseTo(50);
    expect(n.kind === 'shape' && n.params.fillColor).toBe('#ffffff');
    const half = sampleScene(scene(), 0.5).objects[0]!;
    expect(half.kind === 'shape' && half.params.fillColor).toBe('#636363');
    expect(half.stack[0]!.params?.amplitude).toBe(0);
    // Past the last key, its value.
    expect(sampleScene(scene(), 1.5).objects[0]!.stack[0]!.params?.amplitude).toBe(0.2);
  });

  it('does not touch the original scene; without animation, returns it as is', () => {
    const sc = scene();
    sampleScene(sc, 1);
    expect(sc.objects[0]!.transform).toBeUndefined();
    const plain: SceneV2 = { version: 2, objects: [] };
    expect(sampleScene(plain, 1)).toBe(plain);
  });

  it('default easing: ease-in-out (slow at the start and the end)', () => {
    const keys = [{ t: 0, value: 0 }, { t: 1, value: 1 }];
    expect(valueAt(keys, 0.1)).toBeLessThan(0.1);
    expect(valueAt(keys, 0.5)).toBeCloseTo(0.5);
  });

  it('setKey replaces the key on the same frame and sorts', () => {
    let keys = setKey([], 1, 10);
    keys = setKey(keys, 0, 0);
    keys = setKey(keys, 1.01, 20, 30);
    expect(keys).toEqual([{ t: 0, value: 0 }, { t: 1.01, value: 20 }]);
  });

  it('the engine draws the sampled scene', () => {
    const doc = createEngine(builtins).evaluateDocument(sampleScene(scene(), 2));
    expect(doc.nodes.get('s')!.box.x).toBeGreaterThan(40);
  });
});

describe('expo, back, elastic and bounce curves', () => {
  it('back and elastic overshoot and come back; bounce and expo end at 1', () => {
    const keys = (e: string) => [{ t: 0, value: 0, ease: e as never }, { t: 1, value: 1 }];
    const max = (e: string) => Math.max(...Array.from({ length: 50 }, (_, i) => valueAt(keys(e), i / 50) as number));
    expect(max('back-out')).toBeGreaterThan(1.02);
    expect(max('elastic-out')).toBeGreaterThan(1.02);
    expect(valueAt(keys('bounce-out'), 0.999)).toBeCloseTo(1, 2);
    expect(valueAt(keys('expo-out'), 0.3)).toBeGreaterThan(0.8);
  });
});

describe('colour mixing (OKLCH)', () => {
  const mid = (a: string, b: string) => toHex(mixColor(parseColor(a)!, parseColor(b)!, 0.5));
  const chroma = (hex: string) => Math.hypot(...rgbToOklab(parseColor(hex)!).slice(1));
  it('between two vivid colours it does not go through grey', () => {
    // In RGB, from turquoise to coral gives a greenish grey (chroma ~0.07); in OKLCH, a vivid yellow.
    expect(chroma(mid('#09fdd1', '#ff6b5e'))).toBeGreaterThan(0.15);
  });
  it('with a grey, the hue is the other colour', () => {
    const [, a, b] = rgbToOklab(parseColor(mid('#ffffff', '#ff0000'))!);
    const [, ra, rb] = rgbToOklab(parseColor('#ff0000')!);
    expect(Math.abs(Math.atan2(b, a) - Math.atan2(rb, ra))).toBeLessThan(0.05);
  });
  it('the ends are exact; out of gamut, within 0–255', () => {
    expect(mid('#000000', '#ffffff')).toBe('#636363');
    expect(toHex(mixColor(parseColor('#09fdd1')!, parseColor('#ff6b5e')!, 0))).toBe('#09fdd1');
    expect(toHex(mixColor(parseColor('#09fdd1')!, parseColor('#ff6b5e')!, 1))).toBe('#ff6b5e');
    expect(mid('#0000ff', '#ffff00')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('in curves', () => {
  it('they are the out curves reversed: they start slowly and reach 1', () => {
    for (const name of ['expo', 'back', 'elastic', 'bounce'] as const) {
      expect(ease(`${name}-in`, 0)).toBeCloseTo(0);
      expect(ease(`${name}-in`, 1)).toBeCloseTo(1);
      expect(ease(`${name}-in`, 0.3)).toBeCloseTo(1 - ease(`${name}-out`, 0.7));
      expect(ease(`${name}-in`, 0.2)).toBeLessThan(0.2);
    }
    // back-in winds up backwards.
    expect(ease('back-in', 0.2)).toBeLessThan(0);
  });
});

describe('repeating a track', () => {
  const keys = [{ t: 1, value: 0, ease: 'linear' as const }, { t: 2, value: 10 }];
  it('back to back: each lap starts when the previous ends; afterwards, the last value', () => {
    const tr = { keys, repeat: 3 };
    expect(trackTime(tr, 0.5)).toBe(0.5);
    expect(valueAt(keys, trackTime(tr, 1.5))).toBeCloseTo(5);
    expect(valueAt(keys, trackTime(tr, 2.5))).toBeCloseTo(5);
    expect(valueAt(keys, trackTime(tr, 3.5))).toBeCloseTo(5);
    expect(valueAt(keys, trackTime(tr, 4.5))).toBe(10);
  });
  it('with every: between laps it holds the last value', () => {
    const tr = { keys, repeat: 2, every: 3 };
    expect(valueAt(keys, trackTime(tr, 3))).toBe(10);
    expect(valueAt(keys, trackTime(tr, 4.5))).toBeCloseTo(5);
    expect(valueAt(keys, trackTime(tr, 7.5))).toBe(10);
  });
  it('0: forever', () => {
    expect(valueAt(keys, trackTime({ keys, repeat: 0 }, 100.5))).toBeCloseTo(5);
  });
});

describe('turning an effect on and off', () => {
  it('a track on enabled turns it off and on at each key', () => {
    const s: SceneV2 = {
      version: 2,
      objects: [{ kind: 'shape', id: 'n', name: 'n', shape: 'rectangle', params: {}, stack: [{ id: 'm', type: 'rgbsplit', params: { distance: 5 } }] }],
      animation: { duration: 2, tracks: [{ id: 'e', node: 'n', on: 'modifier', modifier: 'm', param: 'enabled', keys: [{ t: 0, value: false, ease: 'hold' }, { t: 1, value: true }] }] },
    };
    expect(sampleScene(s, 0.5).objects[0]!.stack[0]!.enabled).toBe(false);
    expect(sampleScene(s, 1.5).objects[0]!.stack[0]!.enabled).toBe(true);
    const engine = createEngine(builtins);
    // Off: only the rectangle; on: with its two coloured copies.
    expect(engine.evaluateDocument(sampleScene(s, 0.5)).geometry.shapes).toHaveLength(1);
    expect(engine.evaluateDocument(sampleScene(s, 1.5)).geometry.shapes).toHaveLength(3);
  });
});
