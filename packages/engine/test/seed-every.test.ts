import { describe, expect, it } from 'vitest';
import { evaluateSceneVariables, liveSeed, sceneHasExpressions, validateScene, builtins, type SceneV1 } from '../src';

const scene = (extra: Partial<SceneV1> = {}) => ({ version: 1, seedGenerator: 5, objects: [], ...extra }) as SceneV1;

describe('seedEvery', () => {
  it('keeps the seed when off', () => {
    expect(liveSeed(scene(), 99)).toBe(5);
    expect(evaluateSceneVariables(scene(), 3).seedGenerator).toBe(5);
  });

  it('moves the seed one step per interval, the same at any time inside it', () => {
    const s = scene({ seedEvery: 1 });
    expect(liveSeed(s, 0)).toBe(5);
    expect(liveSeed(s, 0.99)).toBe(5);
    const second = liveSeed(s, 1);
    expect(second).not.toBe(5);
    expect(liveSeed(s, 1.5)).toBe(second);
    expect(liveSeed(s, 2)).not.toBe(second);
    expect(evaluateSceneVariables(s, 1.2).seedGenerator).toBe(second);
  });

  it('steps far enough that small offsets from the seed never repeat across intervals', () => {
    const s = scene({ seedEvery: 0.5 });
    const seen = new Set<number>();
    for (let t = 0; t < 20; t++) for (let k = 0; k < 100; k++) seen.add(liveSeed(s, t * 0.5) + k);
    expect(seen.size).toBe(20 * 100);
  });

  it('makes a scene time-driven and validates', () => {
    expect(sceneHasExpressions(scene({ seedEvery: 1 }))).toBe(true);
    expect(validateScene(scene({ seedEvery: 1 }), builtins).errors).toEqual([]);
    expect(validateScene(scene({ seedEvery: -1 }), builtins).errors.length).toBe(1);
  });
});
