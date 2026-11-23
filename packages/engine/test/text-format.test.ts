import { expect, it } from 'vitest';
import { evaluateSceneExpressions, evaluateTextExpression, type SceneV1 } from '../src';
const context = { time: 3.125, frame: 94, fps: 30, duration: 10, progress: .3125, seedGenerator: 1, custom: {}, runtime: { hour: 7.5, minute: 4.25, second: 9.9 } };
it('fixed supports optional zero-padding with nested functions and commas', () => {
  expect(evaluateTextExpression('fixed(scene.time, 2)', context)).toBe('3.13');
  expect(evaluateTextExpression('fixed(scene.time, 2, 2)', context)).toBe('03.13');
  expect(evaluateTextExpression('fixed(max(1, min(4, 9)), 0, 3)', context)).toBe('004');
  expect(evaluateTextExpression('fixed(-3.5, 1, 2)', context)).toBe('-03.5');
});
it('the exact Clock preset renders padded hours, minutes and seconds; headless is reproducible', () => {
  const text = '{{fixed(floor(scene.clock.hour), 0, 2)}}:{{fixed(floor(scene.clock.minute), 0, 2)}}:{{fixed(floor(scene.clock.second), 0, 2)}}';
  const value = (runtime?: typeof context.runtime) => {
    const s: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'clock', name: 'Clock', shape: 'text', params: { text }, stack: [] }], at: 0, runtime };
    const n = evaluateSceneExpressions(s).objects[0]!;
    return n.kind === 'shape' ? n.params.text : null;
  };
  expect(value(context.runtime)).toBe('07:04:09');
  expect(value()).toBe('00:00:00');
});
