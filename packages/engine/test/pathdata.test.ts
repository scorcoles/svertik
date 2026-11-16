import { describe, expect, it } from 'vitest';
import { line, toPathData, type Shape } from '../src';

const square: Shape = {
  style: {},
  subpaths: [{ start: [0, 0], segs: [line([0, 0], [10, 0]), line([10, 0], [10, 10]), { c1: [10, 15], c2: [5, 15], p: [0, 10] }], closed: true }],
};

describe('toPathData', () => {
  it('writes every segment as a cubic by default (animated SVG needs the same commands in every frame)', () => {
    expect(toPathData(square)).toBe('M0 0C3.33 0 6.67 0 10 0C10 3.33 10 6.67 10 10C10 15 5 15 0 10Z');
  });

  it('with lines, writes exact straight segments as L and keeps real curves', () => {
    expect(toPathData(square, 2, true)).toBe('M0 0L10 0L10 10C10 15 5 15 0 10Z');
  });
});

import { builtins, createEngine } from '../src';
import { sampleScene } from '../src/animation';
import { cases, needsFont } from './corpus/scenes';

/** Turns each `L x y` back into the cubic `line()` would make, so both writings can be compared number by number. */
function expandLines(d: string): number[] {
  const out: number[] = [];
  let cur: [number, number] = [0, 0];
  for (const m of d.matchAll(/([MCLZ])([^MCLZ]*)/g)) {
    const n = m[2]!.trim() ? m[2]!.trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'M') (cur = [n[0]!, n[1]!]), out.push(...n);
    else if (m[1] === 'C') (cur = [n[4]!, n[5]!]), out.push(...n);
    else if (m[1] === 'L') {
      const [x, y] = [n[0]!, n[1]!];
      out.push(cur[0] + (x - cur[0]) / 3, cur[1] + (y - cur[1]) / 3, cur[0] + (2 * (x - cur[0])) / 3, cur[1] + (2 * (y - cur[1])) / 3, x, y);
      cur = [x, y];
    }
  }
  return out;
}

describe('toPathData with lines draws the same as without (whole corpus)', () => {
  const engine = createEngine(builtins);
  for (const c of cases.filter((c) => !needsFont(c))) {
    it(c.id, () => {
      const duration = c.scene.animation?.duration ?? 2;
      for (const t of [0, duration / 2]) {
        const geo = engine.evaluateDocument(sampleScene(c.scene, t)).geometry;
        for (const s of geo.shapes) {
          const a = expandLines(toPathData(s));
          const b = expandLines(toPathData(s, 2, true));
          expect(b.length).toBe(a.length);
          // Rounding happens at different points (control points from rounded vs exact ends): within 0.02.
          for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThan(0.02);
        }
      }
    });
  }
});
