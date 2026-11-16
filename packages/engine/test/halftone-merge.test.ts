import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type StackInput } from '../src';

const slab = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><rect width="200" height="100" fill="#808080"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: slab, stack: [{ id: 'h', type: 'halftone', params: { spacing: 10, shape: 'square', color: 'ink', ...params } }] } as StackInput);

describe('halftone merge', () => {
  it('keeps one element per mark by default (Step, Color… can act mark by mark)', () => {
    const shapes = run({}).shapes;
    expect(shapes.length).toBeGreaterThan(100);
    expect(shapes.every((s) => s.subpaths.length === 1)).toBe(true);
  });

  it('with merge, marks of one colour share one path, the same marks in all', () => {
    const one = run({}).shapes;
    const merged = run({ merge: true }).shapes;
    expect(merged.length).toBe(1);
    expect(merged[0]!.subpaths).toEqual(one.flatMap((s) => s.subpaths));
  });
});
