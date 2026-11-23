import { describe, expect, it } from 'vitest';
import { align, distribute } from './arrange';

const box = (id: string, x: number, y: number, w = 10, h = 10) => ({ id, box: { x, y, width: w, height: h } });

describe('align and distribute', () => {
  it('aligns to the selection\'s left and vertical centre', () => {
    const items = [box('a', 0, 0), box('b', 30, 20, 20, 20)];
    expect(align(items, 'left')).toEqual([{ id: 'a', dx: 0, dy: 0 }, { id: 'b', dx: -30, dy: 0 }]);
    expect(align(items, 'vcenter')).toEqual([{ id: 'a', dx: 0, dy: 15 }, { id: 'b', dx: 0, dy: -10 }]);
  });

  it('distributes with equal gaps, without moving the ends', () => {
    const items = [box('c', 100, 0), box('a', 0, 0), box('b', 20, 0, 30)];
    // They span 0..110; sizes 10 + 30 + 10 = 50 → two gaps of 30.
    expect(distribute(items, 'x')).toEqual([{ id: 'a', dx: 0, dy: 0 }, { id: 'b', dx: 20, dy: 0 }, { id: 'c', dx: 0, dy: 0 }]);
  });

  it('does nothing with too few nodes', () => {
    expect(align([box('a', 0, 0)], 'left')).toEqual([]);
    expect(distribute([box('a', 0, 0), box('b', 5, 5)], 'x')).toEqual([]);
  });
});
