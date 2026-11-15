import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, sampleScene, validateScene, type SceneV2 } from '../src';
import { pulseSignal, shakeSignal, waveform, wiggleSignal } from '../src/modifiers/time-signal';
import { prepareScene } from '../src/prepare';

const scene = (type: string, params: Record<string, unknown> = {}): SceneV2 => ({
  version: 2, animation: { duration: 4, tracks: [] }, objects: [{ kind: 'shape', id: 'c', name: 'Cross', shape: 'cross', params: { size: 20, width: 4 }, stack: [
    { id: 'grid', type: 'clone', params: { mode: 'grid', columns: 3, rows: 1, spacing: [2, 1] } },
    { id: 'signal', type, params: { time: { $expr: 'scene.time', fallback: 0 }, ...(type === 'shake' ? {} : { elementPhase: 0 }), ...params }, children: [{ id: 'move', type: 'transform', params: { y: 20, scale: 1.2 } }] },
  ] }],
});
const engine = createEngine(builtins);
const at = (s: SceneV2, t: number) => engine.evaluateDocument(sampleScene(s, t)).geometry;

describe('Time modulators', () => {
  it('oscillates around neutral values, with per-element and whole-object pivots', () => {
    const s = scene('oscillate');
    expect(bounds(at(s, 0)).y).toBeCloseTo(-10);
    expect(bounds(at(s, 0.25)).y).toBeCloseTo(8); // 20 offset minus radius 12
    expect(bounds(at(s, 0.75)).y).toBeCloseTo(-28); // -20 minus radius 8
    expect(bounds(at(s, 0.25)).width).toBeCloseTo(104); // centres stay put
    expect(bounds(at(scene('oscillate', { perElement: false }), 0.25)).width).toBeCloseTo(120);
  });
  it('uses phase per element and preserves compound element tags', () => {
    const geo = at(scene('oscillate', { elementPhase: 90 }), 0);
    const boxes = [0, 1, 2].map(clone => bounds({ ...geo, shapes: geo.shapes.filter(s => s.clone === clone) }));
    expect(boxes[0]!.y).toBeCloseTo(-10);
    expect(boxes[1]!.y).toBeCloseTo(8);
    expect(boxes[2]!.y).toBeCloseTo(-10);
  });
  it('supports amplitude, offset, zero frequency and negative time', () => {
    expect(bounds(at(scene('oscillate', { amplitude: 0, offset: 0.5 }), 1)).y).toBeCloseTo(-1);
    expect(at(scene('oscillate', { frequency: 0 }), 0)).toEqual(at(scene('oscillate', { frequency: 0 }), 3));
    expect(waveform(-0.25, 'sine')).toBeCloseTo(-1);
    expect(waveform(0.25, 'triangle')).toBe(0);
    expect(waveform(0.75, 'square')).toBe(-1);
    expect(waveform(0.25, 'saw')).toBe(-0.5);
  });
  it('wiggle is bounded, smooth at lattice boundaries, reproducible and seed dependent', () => {
    for (let t = -3; t < 3; t += 0.013) expect(Math.abs(wiggleSignal(t, 17, 3))).toBeLessThanOrEqual(1);
    expect(Math.abs(wiggleSignal(1 - 1e-5, 17, 3) - wiggleSignal(1 + 1e-5, 17, 3))).toBeLessThan(1e-8);
    const s = scene('wiggle'); const first = at(s, 1.23); at(s, 3.87);
    expect(at(s, 1.23)).toEqual(first);
    expect(at(scene('wiggle', { seed: 22 }), 1.23)).not.toEqual(first);
    const ys = first.shapes.map(shape => bounds({ ...first, shapes: [shape] }).y);
    expect(new Set(ys).size).toBe(3);
  });
  it('Pulse attacks, decays and rests with a stable period, including zero-length stages', () => {
    expect(pulseSignal(0, 0.1, 0.4)).toBe(0);
    expect(pulseSignal(0.1, 0.1, 0.4)).toBe(1);
    expect(pulseSignal(0.3, 0.1, 0.4)).toBeCloseTo(0.5);
    expect(pulseSignal(0.8, 0.1, 0.4)).toBe(0);
    expect(pulseSignal(-0.9, 0.1, 0.4)).toBeCloseTo(1);
    expect(pulseSignal(0, 0, 0.4)).toBe(1);
    expect(pulseSignal(0.5, 1, 1)).toBe(1);
    expect(pulseSignal(0.5, 0, 0)).toBe(0);
    expect(bounds(at(scene('pulse'), 0.1)).y).toBeCloseTo(8);
    expect(at(scene('pulse'), 0.8)).toEqual(at(scene('pulse'), 0));
  });
  it('Shake is a scheduled one-shot, decays to neutral and supports staggered impacts', () => {
    const s = scene('shake', { start: 1, duration: 0.5, perElement: true, elementDelay: 0.25 });
    expect(at(s, 0)).toEqual(at(s, 0.99));
    expect(at(s, 1.1)).not.toEqual(at(s, 0));
    expect(at(s, 2)).toEqual(at(s, 0));
    const first = at(s, 1.2); at(s, 3); expect(at(s, 1.2)).toEqual(first);
    expect(shakeSignal(-0.1, 1, 8, 2, 1, 0)).toBe(0);
    expect(shakeSignal(1, 1, 8, 2, 1, 0)).toBe(0);
    expect(Math.abs(shakeSignal(0.9, 1, 8, 2, 1, 0))).toBeLessThanOrEqual(0.01);
    expect(at(scene('shake', { amplitude: 0 }), 0.3)).toEqual(at(scene('shake', { amplitude: 0 }), 3));
  });
  it('honours disabled children and modulators', () => {
    const s = scene('oscillate'); s.objects[0]!.stack[1]!.children![0]!.enabled = false;
    expect(at(s, 0.25)).toEqual(at(s, 0));
    s.objects[0]!.stack[1]!.enabled = false;
    expect(at(s, 0.25)).toEqual(at(s, 0));
  });
  it('validates and loads all time modulators through the minimal player', async () => {
    for (const type of ['oscillate', 'wiggle', 'pulse', 'shake']) {
      const s = scene(type);
      expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
      const minimal = createEngine(await prepareScene(s));
      expect(minimal.evaluateDocument(sampleScene(s, 0.33)).geometry).toEqual(at(s, 0.33));
    }
  });
});
