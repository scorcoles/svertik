import { describe, expect, it } from 'vitest';
import { compactJSON } from './exporters';

describe('compactJSON', () => {
  it('parses back to the same value, without undefined fields', () => {
    const value = { a: 1, b: undefined, list: [1, 2, [3, 4]], deep: { s: 'x"y', n: null, empty: [], obj: {} }, holes: [undefined, 1] };
    expect(JSON.parse(compactJSON(value))).toEqual(JSON.parse(JSON.stringify(value)));
  });
  it('keeps short values on one line: packed geometry is a fraction of pretty-printed JSON', () => {
    const segs = Array.from({ length: 200 }, (_, i) => ({ c1: [i * 1.123456789012, -i * 2.98765432101], c2: [i * 3.14159265358, i * 0.5], p: [i + 0.333333333333, -i - 0.666666666666] }));
    const scene = { version: 1, objects: [{ kind: 'object', id: 'o', packed: { key: 'k', geometry: { viewBox: [0, 0, 0, 0], shapes: [{ subpaths: [{ start: [0, 0], segs, closed: true }], style: { fill: '#333' } }] } }, stack: [] }] };
    const text = compactJSON(scene);
    expect(JSON.parse(text)).toEqual(JSON.parse(JSON.stringify(scene)));
    expect(text.length).toBeLessThan(JSON.stringify(scene, null, 2).length * 0.6);
    // Each Bézier segment on one line.
    expect(text.split('\n').filter((line) => line.includes('"c1"'))).toHaveLength(segs.length);
  });
});
