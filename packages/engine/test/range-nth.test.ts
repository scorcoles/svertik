import { describe, expect, it } from 'vitest';
import { builtins, createEngine, validateScene } from '../src';
import { nthSelector } from '../src/modifiers/range';

describe('Range nth selection', () => {
  it('refreshes diagnostic selection when a Range ID changes on a cached stack', () => {
    const engine = createEngine(builtins), source = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    engine.evaluateStack({ source, stack: [{ id: 'old', type: 'range', params: {} }] });
    const result = engine.evaluateStack({ source, stack: [{ id: 'new', type: 'range', params: {} }] });
    expect(result.shapes[0]!.rangeSelections).toEqual(['new']);
  });
  it.each(['rows', 'columns'])('moves odd grid %s together after Clone', (unit) => {
    const engine = createEngine(builtins);
    const source = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const clone = { id: 'c', type: 'clone', params: { mode: 'grid', columns: 4, rows: 3, spacing: [2, 2] } };
    const before = engine.evaluateStack({ source, stack: [clone] });
    const after = engine.evaluateStack({ source, stack: [clone, { id: 'r', type: 'range', params: { unit, selector: 'odd' }, children: [{ id: 't', type: 'transform', params: { x: 7 } }] }] });
    expect(after.shapes).toHaveLength(12);
    expect(after.shapes.map((s) => s.clone)).toEqual(before.shapes.map((s) => s.clone));
    for (const s of after.shapes) {
      const original = before.shapes.find((p) => p.clone === s.clone)!;
      const key = unit === 'rows' ? s.gridRow! : s.gridColumn!;
      expect(s.subpaths[0]!.start[0] - original.subpaths[0]!.start[0]).toBeCloseTo(key % 2 === 0 ? 7 : 0);
    }
  });
  it('warns about invalid formulas without evaluating them as code', () => {
    const report = validateScene({ version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: {}, stack: [{ id: 'r', type: 'range', params: { selector: 'nth', nth: '2n + alert(1)' } }] }] });
    expect(report.warnings.some((w) => w.includes('invalid An+B'))).toBe(true);
  });
  const source = `<svg viewBox="0 0 180 20">${Array.from({ length: 6 }, (_, i) => `<rect x="${i * 30}" width="20" height="20"/>`).join('')}</svg>`;
  it.each([
    ['even', '', [0, 40, 60, 100, 120, 160]],
    ['odd', '', [10, 30, 70, 90, 130, 150]],
    ['nth', '3n+2', [0, 40, 60, 90, 130, 150]],
    ['nth', '-n+3', [10, 40, 70, 90, 120, 150]],
    ['nth', '4', [0, 30, 60, 100, 120, 150]],
    ['nth', 'invalid', [0, 30, 60, 90, 120, 150]],
  ])('selects %s %s and applies a constant horizontal transform', (selector, nth, expected) => {
    const geo = createEngine(builtins).evaluateStack({ source, stack: [{ id: 'r', type: 'range', params: { selector, nth }, children: [{ id: 't', type: 'transform', params: { x: 10 } }] }] });
    expect(geo.shapes.map((s) => s.subpaths[0]!.start[0])).toEqual(expected);
  });

  it('intersects nth selection with the existing range bounds', () => {
    const geo = createEngine(builtins).evaluateStack({ source, stack: [{ id: 'r', type: 'range', params: { selector: 'even', start: 0.5, end: 1 }, children: [{ id: 't', type: 'transform', params: { x: 10 } }] }] });
    expect(geo.shapes.map((s) => s.subpaths[0]!.start[0])).toEqual([0, 30, 60, 100, 120, 160]);
  });

  it.each([['n', [1, 2, 3, 4, 5, 6]], ['2n + 1', [1, 3, 5]], ['0n+2', [2]], ['-2n+5', [1, 3, 5]], ['0', []], ['-4', []]])('parses %s with CSS one-based indexing', (text, selected) => {
    const match = nthSelector(text)!;
    expect([1, 2, 3, 4, 5, 6].filter(match)).toEqual(selected);
  });
});
