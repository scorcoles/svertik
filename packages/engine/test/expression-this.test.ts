import { describe, expect, it } from 'vitest';
import { evaluateSceneExpressions, validateExpression } from '../src/expression';
import type { SceneV1 } from '../src/scene';

const donut = (params: Record<string, unknown>, transform?: Record<string, unknown>): SceneV1 => ({
  version: 1,
  objects: [{ kind: 'shape', id: 'd', name: 'Donut', shape: 'donut', params, ...(transform ? { transform } : {}), stack: [] } as never],
});
const shapeOf = (scene: SceneV1) => scene.objects[0] as unknown as { params: Record<string, number>; transform: Record<string, number> };

describe('this.name', () => {
  it('parses', () => {
    expect(validateExpression('this.outer - 50')).toBeNull();
    expect(validateExpression('this')).not.toBeNull();
  });
  it('reads another value of the same shape', () => {
    const out = evaluateSceneExpressions(donut({ outer: 452, inner: { $expr: 'this.outer - 50', fallback: 0 } }));
    expect(shapeOf(out).params.inner).toBe(402);
  });
  it('follows a chain of formulas in any order, and reads the placement', () => {
    const out = evaluateSceneExpressions(donut(
      { inner: { $expr: 'this.outer - 50', fallback: 0 }, outer: { $expr: 'this.x * 2', fallback: 0 } },
      { x: { $expr: '10 + 50', fallback: 0 } },
    ));
    expect(shapeOf(out).params).toMatchObject({ outer: 120, inner: 70 });
  });
  it('falls back on cycles and unknown names', () => {
    const out = evaluateSceneExpressions(donut({ outer: { $expr: 'this.inner + 1', fallback: 100 }, inner: { $expr: 'this.outer - 1', fallback: 80 }, segments: { $expr: 'this.nope', fallback: 7 } }));
    expect(shapeOf(out).params).toMatchObject({ outer: 100, inner: 80, segments: 7 });
  });
  it('works inside an effect', () => {
    const scene: SceneV1 = {
      version: 1,
      objects: [{ kind: 'shape', id: 's', name: 'S', shape: 'rectangle', params: {}, stack: [{ id: 'tw', type: 'twist', params: { angle: 40, radius: { $expr: 'this.angle / 100', fallback: 0 } } }] } as never],
    };
    const out = evaluateSceneExpressions(scene);
    expect((out.objects[0] as unknown as { stack: { params: Record<string, number> }[] }).stack[0]!.params.radius).toBe(0.4);
  });
});

describe('this.name through the engine', () => {
  it('reads a parameter left at its default', async () => {
    const { builtins, createEngine } = await import('../src/index');
    const engine = createEngine(builtins);
    const ring = (inner: unknown) => engine.toSVG({ version: 1, objects: [{ kind: 'shape', id: 'd', name: 'D', shape: 'donut', params: { innerRadius: inner, fill: true }, stack: [] } as never] });
    // Donut radius defaults to 80: this.radius - 50 is the same ring as an inner radius of 30.
    expect(ring({ $expr: 'this.radius - 50', fallback: 0 })).toBe(ring(30));
  });
});
