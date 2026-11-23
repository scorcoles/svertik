import { describe, expect, it } from 'vitest';
import { builtins, createEngine, evaluateExpression, validateExpression, validateScene, type SceneV1 } from '../src';

// A 3 × 3 grid of donuts whose hole shrinks with the distance from the centre.
const grid = (each: Record<string, unknown> | undefined, stack?: unknown[], extra: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1,
  ...extra,
  objects: [{
    kind: 'shape', id: 'd', name: 'Donut', shape: 'donut',
    params: { radius: 20, innerRadius: 15, fill: true, stroke: false },
    ...(each ? { each } : {}),
    stack: stack ?? [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 3, rows: 3, spacing: [1.5, 1.5] } }],
  }],
} as unknown as SceneV1);

/** Radius of each copy's hole, from the SVG: the inner circle of every ring, in copy order. */
const holes = (scene: SceneV1) => {
  const svg = createEngine(builtins).toSVG(scene);
  return [...svg.matchAll(/ d="([^"]+)"/g)].flatMap((m) => {
    // Each donut path: two closed circles; the second (after the second M) is the hole.
    const subs = m[1]!.split('M').filter(Boolean);
    return subs.length < 2 ? [0] : [extent(subs[1]!)];
  });
};
const extent = (d: string) => {
  const xs = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
  return Math.round((Math.max(...xs) - Math.min(...xs)) / 2);
};

describe('Each', () => {
  it('rebuilds every Clone copy with its own values from element.*', () => {
    const r = holes(grid({ innerRadius: { $expr: '15 * (1 - element.distance)', fallback: 15 } }));
    expect(r).toHaveLength(9);
    // Centre copy (index 4): full hole; corners (distance 1): no hole left, a plain disc.
    expect(r[4]).toBe(15);
    expect(r[0]).toBe(0);
    // Edge middles sit at distance 1/√2 of a corner.
    expect(r[1]).toBe(Math.round(15 * (1 - 1 / Math.SQRT2)));
  });

  it('gives row, column, u, v, index and count per copy', () => {
    const r = holes(grid({ innerRadius: { $expr: '2 + element.column * 3 + element.row * 4 + element.u + element.v * 2 + element.index * 0 + element.count * 0', fallback: 0 } }));
    // index 5 = row 1, column 2: 2 + 6 + 4 + 1 + 1 = 14.
    expect(r[5]).toBe(14);
    expect(r[0]).toBe(2);
  });

  it('takes plain numbers too, and leaves the shape alone without a Clone first', () => {
    expect(new Set(holes(grid({ innerRadius: 5 })))).toEqual(new Set([5]));
    expect(holes(grid({ innerRadius: 5 }, [{ id: 't', type: 'transform', params: {} }]))).toEqual([15]);
  });

  it('follows the scene: a formula with scene.time changes between frames', () => {
    const engine = createEngine(builtins);
    const at = (t: number) => engine.toSVG({ ...grid({ innerRadius: { $expr: '5 + scene.time', fallback: 5 } }), at: t } as SceneV1);
    expect(at(0)).not.toBe(at(3));
  });

  it('element.* only works in Each; an unknown field is a parse error', () => {
    expect(validateExpression('element.distance')).toBeNull();
    expect(validateExpression('element.size')).toMatch(/element value/);
    expect(() => evaluateExpression('element.index', { time: 0, frame: 0, fps: 30, duration: 0, progress: 0, seedGenerator: 1, custom: {} })).toThrow(/Each/);
  });

  it('validation warns about non-numeric parameters and a stack without a Clone first', () => {
    const report = validateScene(grid({ fillColor: 1, innerRadius: { $expr: 'element.u', fallback: 0 } }, [{ id: 't', type: 'transform', params: {} }]));
    expect(report.warnings.join('\n')).toMatch(/Each "fillColor" is not a numeric parameter/);
    expect(report.warnings.join('\n')).toMatch(/first effect is a Clone/);
    expect(validateScene(grid({ innerRadius: 'x' })).errors.join('\n')).toMatch(/must be a number/);
  });
});
