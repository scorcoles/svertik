import { describe, expect, it } from 'vitest';
import { evaluateExpression, evaluateSceneExpressions, evaluateTextExpression, sampleScene, validateExpression, type ExpressionContext, type SceneV1 } from '../src';

const context = (time = 0, seedGenerator = 1): ExpressionContext => ({ time, frame: Math.floor(time * 30), duration: 10, fps: 30, progress: Math.min(1, time / 10), seedGenerator, custom: {} });

describe('random expressions', () => {
  it('keeps a stable value across time, repeated calls and evaluation order', () => {
    const initial = evaluateExpression('random(0, 100)', context());
    expect(evaluateExpression('random(0, 100)', context(180))).toBe(initial);
    evaluateExpression('random(0, 100, 1000)', context());
    expect(evaluateExpression('random(0, 100)', context())).toBe(initial);
    expect(evaluateExpression('random(0, 100, 0)', context())).toBe(initial);
    expect(evaluateExpression('random(0, 100)', context(0, 2))).not.toBe(initial);
  });

  it('changes by cycle or frame and reproduces the same result when seeking backwards', () => {
    const cycle = 'random(10, 50, scene.cycle)';
    const first = evaluateExpression(cycle, context(1));
    expect(evaluateExpression(cycle, context(9))).toBe(first);
    expect(evaluateExpression(cycle, context(10))).not.toBe(first);
    expect(evaluateExpression(cycle, context(180))).not.toBe(first);
    expect(evaluateExpression(cycle, context(1))).toBe(first);
    expect(evaluateExpression('random(0, 1, scene.frame)', context(1))).not.toBe(evaluateExpression('random(0, 1, scene.frame)', context(2)));
  });

  it('supports signed/fractional salts, separate seed pairs, reversed and equal bounds', () => {
    expect(evaluateExpression('random(0, 1, 0.1)', context())).not.toBe(evaluateExpression('random(0, 1, 0.2)', context()));
    expect(evaluateExpression('random(0, 1, 2)', context(0, 1))).not.toBe(evaluateExpression('random(0, 1, 1)', context(0, 2)));
    for (let seed = -20; seed < 20; seed++) {
      const c = context(0, seed);
      const value = evaluateExpression('random(-10, 20, -1.5)', c);
      expect(value).toBeGreaterThanOrEqual(-10);
      expect(value).toBeLessThan(20);
      expect(evaluateExpression('random(20, -10, -1.5)', c)).toBe(value);
      expect(evaluateExpression('random(7, 7)', c)).toBe(7);
    }
  });

  it('validates arity and rejects non-finite seeds or bounds', () => {
    expect(validateExpression('random(0, 1)')).toBeNull();
    expect(validateExpression('random(0, 1, scene.cycle)')).toBeNull();
    for (const source of ['random()', 'random(1)', 'random(0, 1, 2, 3)']) expect(validateExpression(source)).not.toBeNull();
    expect(() => evaluateExpression('random(0, 1, 1 / 0)', context())).toThrow();
    expect(() => evaluateExpression('random(0, 1 / 0)', context())).toThrow();
  });

  it('works in custom variables, numeric fields and text; invalid inputs use fallback', () => {
    const s: SceneV1 = { version: 1, seedGenerator: 42, animation: { duration: 10, infinite: true, loop: false, tracks: [] }, custom: { choice: { $expr: 'random(10, 100, scene.cycle)', fallback: 10 } }, objects: [
      { kind: 'shape', id: 'rect', name: 'Rect', shape: 'rectangle', stack: [], params: { width: { $expr: 'scene.custom.choice', fallback: 10 }, height: { $expr: 'random(0, 1, 1 / 0)', fallback: 15 } } },
      { kind: 'shape', id: 'text', name: 'Text', shape: 'text', stack: [], params: { text: '{{fixed(scene.custom.choice, 2)}}' } },
    ] };
    const expected = evaluateExpression('random(10, 100, scene.cycle)', context(180, 42));
    const resolved = evaluateSceneExpressions(sampleScene(s, 180));
    expect(resolved.objects[0]).toMatchObject({ params: { width: expected, height: 15 } });
    expect(resolved.objects[1]).toMatchObject({ params: { text: expected.toFixed(2) } });
    expect(evaluateTextExpression('fixed(random(10, 100, scene.cycle), 2)', context(180, 42))).toBe(expected.toFixed(2));
  });
});
