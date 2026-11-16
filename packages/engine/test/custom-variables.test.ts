import { describe, expect, it } from 'vitest';
import { builtins, createEngine, customNumber, validateScene, type SceneV1 } from '../src';

const scene = (custom: SceneV1['custom']): SceneV1 => ({
  version: 1,
  custom,
  objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: { $expr: 'scene.custom.w', fallback: 1 }, height: 10 }, stack: [] }],
} as SceneV1);
const width = (s: SceneV1) => createEngine(builtins).evaluateDocument(s).nodes.get('r')!.bounds.width;

describe('custom variables', () => {
  it('a plain number, and a ranged one (its value, clamped to the range)', () => {
    expect(width(scene({ w: 40 }))).toBeCloseTo(40);
    expect(width(scene({ w: { value: 40, min: 0, max: 100, step: 1 } }))).toBeCloseTo(40);
    expect(width(scene({ w: { value: 400, min: 0, max: 100 } }))).toBeCloseTo(100);
    expect(customNumber({ value: -5, min: 0 })).toBe(0);
  });

  it('an expression can use a ranged variable', () => {
    expect(width(scene({ n: { value: 3, min: 1, max: 10 }, w: { $expr: 'scene.custom.n * 10', fallback: 0 } }))).toBeCloseTo(30);
  });

  it('validates ranges', () => {
    expect(validateScene(scene({ w: { value: 1, min: 0, max: 2, step: 0.5 } })).warnings).toEqual([]);
    expect(validateScene(scene({ w: { value: 1, min: 5, max: 2 } })).warnings.join()).toContain('min is above max');
    expect(validateScene(scene({ w: 'big' as never })).warnings.join()).toContain('must be a number');
  });
});
