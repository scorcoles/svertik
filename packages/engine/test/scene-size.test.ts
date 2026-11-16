import { describe, expect, it } from 'vitest';
import { evaluateExpression, evaluateSceneExpressions, evaluateSceneVariables, validateExpression, type SceneV1 } from '../src';

const base = { time: 0, frame: 0, fps: 30, duration: 10, progress: 0, seedGenerator: 1, custom: {} };
const shape = (document: SceneV1['document'], extra: Record<string, unknown> = {}): SceneV1 => ({
  version: 1, ...(document === undefined ? {} : { document }),
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: { $expr: 'scene.width / 9', fallback: 1 }, height: { $expr: 'scene.height - 100', fallback: 1 } }, stack: [], ...extra }],
});

describe('scene.width / scene.height', () => {
  it('parse, and read the context (0 when absent)', () => {
    expect(validateExpression('scene.width + scene.height')).toBeNull();
    expect(evaluateExpression('scene.width * 2 + scene.height', { ...base, width: 900, height: 1400 })).toBe(3200);
    expect(evaluateExpression('scene.width', base)).toBe(0);
  });

  it('take the document size in a scene, and are 0 without a fixed document', () => {
    const sized = evaluateSceneExpressions(shape({ width: 900, height: 1400 })).objects[0] as { params: { width: number; height: number } };
    expect(sized.params).toMatchObject({ width: 100, height: 1300 });
    const free = evaluateSceneExpressions(shape(undefined)).objects[0] as { params: { width: number; height: number } };
    expect(free.params).toMatchObject({ width: 0, height: -100 });
    expect(evaluateSceneVariables(shape({ width: 640, height: 480 }), 0)).toMatchObject({ width: 640, height: 480 });
  });

  it('a nested composition sees its own document', () => {
    const child = shape({ width: 300, height: 200 });
    const parent: SceneV1 = { version: 1, document: { width: 900, height: 1400 }, objects: [{ kind: 'group', id: 'c', name: 'C', stack: [], children: [], composition: { scene: child } }] };
    expect(evaluateSceneVariables(parent, 0)).toMatchObject({ width: 900 });
    expect(evaluateSceneVariables(child, 0)).toMatchObject({ width: 300 });
  });
});
