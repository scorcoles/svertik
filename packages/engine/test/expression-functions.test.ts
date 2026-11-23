import { describe, expect, it } from 'vitest';
import { builtins, createEngine, createExpressionMemory, evaluateExpression, type ExpressionContext, type SceneV1 } from '../src';

const ctx = (time = 0, extra: Partial<ExpressionContext> = {}): ExpressionContext => ({ time, frame: 0, fps: 30, duration: 1, progress: 0, seedGenerator: 1, custom: {}, ...extra });
const ev = (e: string, c = ctx()) => evaluateExpression(e, c);

describe('expression functions', () => {
  it('map, mod, step, smoothstep and the easings', () => {
    expect(ev('map(5, 0, 10, 100, 200)')).toBe(150);
    expect(ev('map(20, 0, 10, 0, 1)')).toBe(2);
    expect(ev('mod(-1, 3)')).toBe(2);
    expect(ev('mod(7, 3)')).toBe(1);
    expect(ev('step(0.5, 0.4)')).toBe(0);
    expect(ev('step(0.5, 0.5)')).toBe(1);
    expect(ev('smoothstep(0, 1, 0.5)')).toBe(0.5);
    expect(ev('smoothstep(0, 1, 2)')).toBe(1);
    expect(ev('easeIn(0.5)')).toBe(0.125);
    expect(ev('easeOut(0.5)')).toBe(0.875);
    expect(ev('easeInOut(0.25)')).toBeCloseTo(0.0625);
    expect(ev('easeInOut(2)')).toBe(1);
  });

  it('pick chooses by index, wrapping both ways', () => {
    expect(ev('pick(0, 10, 20, 40)')).toBe(10);
    expect(ev('pick(4, 10, 20, 40)')).toBe(20);
    expect(ev('pick(-1, 10, 20, 40)')).toBe(40);
  });

  it('noise is smooth, reproducible, within −1…1 and follows the document seed', () => {
    const a = ev('noise(1.3)');
    expect(ev('noise(1.3)')).toBe(a);
    expect(Math.abs(ev('noise(1.31)') - a)).toBeLessThan(0.05);
    expect(ev('noise(1.3)', ctx(0, { seedGenerator: 2 }))).not.toBe(a);
    expect(ev('noise(1.3, 5)')).not.toBe(a);
    for (let x = 0; x < 20; x += 0.37) expect(Math.abs(ev(`noise(${x})`))).toBeLessThanOrEqual(1);
  });

  it('smooth follows its target over frames and is the target without memory', () => {
    expect(ev('smooth(100, 0.3)')).toBe(100);
    const memory = createExpressionMemory();
    const at = (t: number, x: number) => evaluateExpression('smooth(scene.custom.x, 0.3)', ctx(t, { memory, custom: { x } }));
    expect(at(0, 0)).toBe(0);
    const first = at(1 / 30, 100);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(100);
    // The same frame again: no second step.
    expect(at(1 / 30, 100)).toBe(first);
    let v = first;
    for (let f = 2; f <= 9; f++) v = at(f / 30, 100);
    // About 95% of the jump after 0.3 s.
    expect(v).toBeGreaterThan(93);
    expect(v).toBeLessThan(97);
    // Going back in time starts again from the target.
    expect(at(0, 40)).toBe(40);
  });

  it('spring overshoots with bounce and settles on the target', () => {
    const memory = createExpressionMemory();
    const at = (t: number, x: number) => evaluateExpression('spring(scene.custom.x, 0.5, 0.6)', ctx(t, { memory, custom: { x } }));
    at(0, 0);
    let peak = 0;
    let v = 0;
    for (let f = 1; f <= 90; f++) {
      v = at(f / 30, 100);
      peak = Math.max(peak, v);
    }
    expect(peak).toBeGreaterThan(100);
    expect(v).toBeCloseTo(100, 0);
  });

  it('an engine smooths a parameter frame by frame', () => {
    const scene = (t: number, x: number): SceneV1 => ({
      version: 1, at: t,
      objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: { $expr: 'smooth(scene.custom.w, 0.3)', fallback: 10 }, height: 10 }, stack: [] }],
      custom: { w: x },
    } as SceneV1);
    const engine = createEngine(builtins);
    const width = (t: number, x: number) => engine.evaluateDocument(scene(t, x)).nodes.get('r')!.box.width;
    expect(width(0, 10)).toBeCloseTo(10);
    const w = width(1 / 30, 200);
    expect(w).toBeGreaterThan(10);
    expect(w).toBeLessThan(200);
  });
});
