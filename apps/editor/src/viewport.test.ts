import { describe, expect, it } from 'vitest';
import { actualSize, fitScale, FIT, wheelIntent, zoomAt } from './viewport';

describe('viewport', () => {
  it('fit: the smaller scale of width and height', () => {
    expect(fitScale(800, 400, 200, 200)).toBe(2);
  });
  it('zoom towards the pointer: that point does not move', () => {
    const v = zoomAt(FIT, 2, 100, 50);
    // A content point that was at (100, 50) stays at (100, 50).
    expect(100 * v.zoom + v.pan.x).toBeCloseTo(100 * 2 + (100 - 200));
    expect(v.pan).toEqual({ x: -100, y: -50 });
  });
  it('100 %: zoom = 1 / encaje', () => {
    expect(actualSize(FIT, 2, 800, 400).zoom).toBeCloseTo(0.5);
  });
  it('mouse wheel = zoom; trackpad = pan; pinch = zoom', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe('zoom');
    expect(wheelIntent({ deltaX: 2, deltaY: 7.5, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe('pan');
    expect(wheelIntent({ deltaX: 0, deltaY: 3.2, deltaMode: 0, ctrlKey: true, metaKey: false })).toBe('zoom');
  });
});
