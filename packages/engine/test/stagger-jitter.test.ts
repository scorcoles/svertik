import { describe, expect, it } from 'vitest';
import { builtins, createEngine, bounds, type StackInput } from '../src';

const bar = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>';
/** Vertical offset (of 100) each of 8 copies has reached at a progress, with the given stagger params. */
const offsets = (progress: number, params: Record<string, unknown>) => {
  const g = createEngine(builtins).evaluateStack({ source: bar, stack: [
    { id: 'c', type: 'clone', params: { mode: 'linear', count: 8, offset: [1.2, 0] } },
    { id: 's', type: 'stagger', params: { progress, direction: 'out', ease: 'linear', stagger: 0.3, order: 'forward', seed: 5, ...params },
      children: [{ id: 't', type: 'transform', params: { y: 100 } }] },
  ] } as StackInput);
  return g.shapes.map((s) => bounds({ ...g, shapes: [s] }).y);
};

describe('stagger jitter', () => {
  it('does nothing at 0', () => {
    expect(offsets(0.5, { jitter: 0 })).toEqual(offsets(0.5, {}));
  });

  it('keeps the order on the whole but lets neighbours swap', () => {
    const plain = offsets(0.5, { jitter: 0 });
    for (let i = 1; i < plain.length; i++) expect(plain[i]!).toBeLessThanOrEqual(plain[i - 1]! + 1e-9); // later elements are behind
    const swaps = [0, 1, 2, 3, 4, 5, 6, 7].filter((seed) => { const j = offsets(0.5, { jitter: 3, seed }); return j.some((y, i) => i > 0 && y > j[i - 1]! + 1e-6); });
    expect(swaps.length).toBeGreaterThan(0);                              // with jitter, somewhere a later element is ahead of an earlier one
    // On the whole the row still falls from left to right: the first elements are ahead of the last ones.
    const j = offsets(0.5, { jitter: 3, seed: 2 });
    expect(j.slice(0, 3).reduce((a, b) => a + b, 0)).toBeGreaterThan(j.slice(-3).reduce((a, b) => a + b, 0));
  });

  it('is deterministic per seed, differs between seeds, and every element completes at progress 1', () => {
    expect(offsets(0.5, { jitter: 4, seed: 9 })).toEqual(offsets(0.5, { jitter: 4, seed: 9 }));
    expect(offsets(0.5, { jitter: 4, seed: 9 })).not.toEqual(offsets(0.5, { jitter: 4, seed: 10 }));
    const end = offsets(1, { jitter: 6, seed: 3 }), start = offsets(0, { jitter: 6, seed: 3 });
    for (let i = 0; i < end.length; i++) expect(end[i]! - start[i]!).toBeCloseTo(100, 4);
  });
});
