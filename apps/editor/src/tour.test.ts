import { describe, expect, it } from 'vitest';
import { placeCard, stepFrom, TOUR, type TourStep } from './tour';

const steps: TourStep[] = ['a', 'b', 'c', 'd'].map((target) => ({ target, title: target, body: '' }));
const view = { width: 1400, height: 900 };
const card = { width: 300, height: 160 };

describe('tour', () => {
  it('skips steps whose area is not on screen, both ways', () => {
    const present = (s: TourStep) => s.target !== 'b';
    expect(stepFrom(steps, -1, 1, present)).toBe(0);
    expect(stepFrom(steps, 0, 1, present)).toBe(2);
    expect(stepFrom(steps, 2, -1, present)).toBe(0);
    expect(stepFrom(steps, 3, 1, present)).toBe(-1);
    expect(stepFrom(steps, 0, -1, present)).toBe(-1);
    expect(stepFrom(steps, -1, 1, () => false)).toBe(-1);
  });

  it('puts the card beside tall areas, below short ones, over the corner of huge ones, always on screen', () => {
    // The rail on the left: to its right.
    expect(placeCard({ left: 0, top: 40, width: 48, height: 800 }, card, view)).toEqual({ left: 60, top: 40 });
    // The inspector on the right: to its left.
    expect(placeCard({ left: 1100, top: 40, width: 300, height: 800 }, card, view)).toEqual({ left: 788, top: 40 });
    // The Play button in the top bar: below, pulled inside the viewport.
    expect(placeCard({ left: 1250, top: 4, width: 80, height: 28 }, card, view)).toEqual({ left: 1088, top: 44 });
    // A button in the status bar: above.
    expect(placeCard({ left: 400, top: 870, width: 80, height: 24 }, card, view)).toEqual({ left: 400, top: 698 });
    // The canvas, which leaves no room around it.
    const spot = placeCard({ left: 40, top: 30, width: 1320, height: 840 }, card, view);
    expect(spot.left + card.width).toBeLessThanOrEqual(view.width - 12);
    expect(spot.top).toBeGreaterThanOrEqual(12);
  });

  it('has a title and text for every step, and unique targets', () => {
    expect(new Set(TOUR.map((s) => s.target)).size).toBe(TOUR.length);
    for (const s of TOUR) expect(s.title && s.body).toBeTruthy();
  });
});
