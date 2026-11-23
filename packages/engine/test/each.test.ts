import { describe, expect, it } from 'vitest';
import { builtins, createEngine, evaluateExpression, validateExpression, validateScene, type SceneV1 } from '../src';

const clone = { id: 'c', type: 'clone', params: { mode: 'grid', columns: 3, rows: 3, spacing: [1.5, 1.5] } };
// A 3 × 3 grid of donuts with an Each after the Clone.
const grid = (children: unknown[], stack?: unknown[], extra: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1,
  ...extra,
  objects: [{
    kind: 'shape', id: 'd', name: 'Donut', shape: 'donut',
    params: { radius: 20, innerRadius: 15, fill: true, stroke: false },
    stack: stack ?? [clone, { id: 'e', type: 'each', params: {}, children }],
  }],
} as unknown as SceneV1);
const shape = (params: Record<string, unknown>) => ({ id: 's', type: 'shapevalues', params });

/** Per copy, in order: the hole's radius (0 without a hole) and the ring's centre. */
const copies = (scene: SceneV1) => {
  const svg = createEngine(builtins).toSVG(scene);
  return [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => {
    const subs = m[1]!.split('M').filter(Boolean);
    const xs = (s: string) => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
    const outer = xs(subs[0]!);
    return { hole: subs.length < 2 ? 0 : Math.round((Math.max(...xs(subs[1]!)) - Math.min(...xs(subs[1]!))) / 2), x: Math.round((Math.max(...outer) + Math.min(...outer)) / 2) };
  });
};

describe('Each', () => {
  it('Each › Shape rebuilds every copy with values from element.*, in its place', () => {
    const r = copies(grid([shape({ innerRadius: { $expr: '15 * (1 - element.distance)', fallback: 15 } })]));
    expect(r).toHaveLength(9);
    expect(r[4]!.hole).toBe(15);
    expect(r[0]!.hole).toBe(0);
    expect(r[1]!.hole).toBe(Math.round(15 * (1 - 1 / Math.SQRT2)));
    // Copies stay where the Clone put them.
    const plain = copies(grid([]));
    expect(r.map((c) => c.x)).toEqual(plain.map((c) => c.x));
  });

  it('gives row, column, u, v, index and count per element', () => {
    const r = copies(grid([shape({ innerRadius: { $expr: '2 + element.column * 3 + element.row * 4 + element.u + element.v * 2 + element.index * 0 + element.count * 0', fallback: 0 } })]));
    expect(r[5]!.hole).toBe(14);
    expect(r[0]!.hole).toBe(2);
  });

  it('applies ordinary effects per element with formulas (Transform scale by distance)', () => {
    const svg = createEngine(builtins).toSVG(grid([{ id: 't', type: 'transform', params: { scale: { $expr: '1 - 0.5 * element.distance', fallback: 1 } } }]));
    const widths = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => {
      const xs = (m[1]!.split('M').filter(Boolean)[0]!.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
      return Math.round(Math.max(...xs) - Math.min(...xs));
    });
    expect(widths[4]).toBe(40);
    expect(widths[0]).toBe(20);
  });

  it('follows the scene: a formula with scene.time changes between frames', () => {
    const engine = createEngine(builtins);
    const at = (t: number) => engine.toSVG({ ...grid([shape({ innerRadius: { $expr: '5 + scene.time', fallback: 5 } })]), at: t } as SceneV1);
    expect(at(0)).not.toBe(at(3));
  });

  it('element.* only works in Each; an unknown field is a parse error', () => {
    expect(validateExpression('element.distance')).toBeNull();
    expect(validateExpression('element.size')).toMatch(/element value/);
    expect(() => evaluateExpression('element.index', { time: 0, frame: 0, fps: 30, duration: 0, progress: 0, seedGenerator: 1, custom: {} })).toThrow(/Each/);
  });

  it('validation: Shape needs Each, a shape object and numeric parameters', () => {
    const report = validateScene(grid([shape({ fillColor: 1, innerRadius: { $expr: 'element.u', fallback: 0 } })]));
    expect(report.warnings.join('\n')).toMatch(/"fillColor" is not a numeric parameter/);
    expect(report.warnings.join('\n')).not.toMatch(/unknown parameter/);
    const loose = validateScene(grid([], [clone, shape({ innerRadius: 5 })]));
    expect(loose.warnings.join('\n')).toMatch(/Shape only works inside Each/);
    expect(validateScene(grid([shape({ innerRadius: 'x' })])).errors.join('\n')).toMatch(/must be a number/);
  });
});

describe('liftNodeEach', () => {
  it('turns a 0.0.8 node-level each into Each › Shape right after the Clone', async () => {
    const { liftNodeEach } = await import('../src');
    const scene = { version: 1, objects: [{ kind: 'shape', id: 'd', name: 'Donut', shape: 'donut', params: { radius: 20, innerRadius: 15 },
      each: { innerRadius: { $expr: '15 * (1 - element.distance)', fallback: 15 } },
      stack: [clone, { id: 't', type: 'transform', params: {} }] }] } as unknown as SceneV1;
    liftNodeEach(scene);
    const node = scene.objects[0] as unknown as { each?: unknown; stack: { type: string; children?: { type: string; params: Record<string, unknown> }[] }[] };
    expect(node.each).toBeUndefined();
    expect(node.stack.map((m) => m.type)).toEqual(['clone', 'each', 'transform']);
    expect(node.stack[1]!.children![0]!.type).toBe('shapevalues');
    expect(copies(scene)[0]!.hole).toBe(0);
  });
});
