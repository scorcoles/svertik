import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type StackInput } from '../src';

// A 200×200 square from (0,0): its edge is the frame, its centre (100,100) is 100 px from it.
const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="0" y="0" width="200" height="200" fill="#222"/></svg>';
const run = (params: Record<string, unknown>) =>
  createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'g', type: 'vectorgrain', params }] } as StackInput);

/** The centre of every mark (the mean of its first segment end points is close enough for a test). */
const centres = (params: Record<string, unknown>) =>
  run({ source: 'replace', ...params }).shapes.flatMap((s) =>
    s.subpaths.map((sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      return [pts.reduce((a, q) => a + q[0], 0) / pts.length, pts.reduce((a, q) => a + q[1], 0) / pts.length] as [number, number];
    }),
  );
const edgeDistance = ([x, y]: [number, number]) => Math.min(x, y, 200 - x, 200 - y);

// A circle of radius 100 centred at (100,100): its real edge is the arc, not a polygon of chords.
const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="100" fill="#222"/></svg>';
/** For each mark: its nearest and farthest point from the circle's centre. */
const reach = (params: Record<string, unknown>) =>
  createEngine(builtins)
    .evaluateStack({ source: circle, stack: [{ id: 'g', type: 'vectorgrain', params: { source: 'replace', focus: 0, ...params } }] } as StackInput)
    .shapes.flatMap((s) =>
      s.subpaths.map((sp) => {
        const pts = sp.segs.map((g) => g.p);
        const ds = pts.map(([x, y]) => Math.hypot(x - 100, y - 100));
        return [Math.min(...ds), Math.max(...ds), pts.reduce((a, q) => a + q[0], 0) / pts.length] as const;
      }),
    );

describe('vectorgrain', () => {
  it('reaches the real curve: inside marks touch the edge without crossing it, outside ones never enter', () => {
    const inside = reach({ edge: 'inside', density: 3000, falloff: 20, size: 2 });
    expect(Math.max(...inside.map(([, far]) => far))).toBeLessThanOrEqual(100.05);
    // Some marks sit right against the edge (no bare band along it).
    expect(inside.filter(([, far]) => far > 99.5).length).toBeGreaterThan(5);
    const outside = reach({ edge: 'outside', density: 3000, falloff: 20, size: 2 });
    expect(Math.min(...outside.map(([near]) => near))).toBeGreaterThanOrEqual(99.95);
    expect(outside.filter(([near]) => near < 100.5).length).toBeGreaterThan(5);
  });

  it('is seeded: the same seed gives the same marks, another seed others', () => {
    const a = JSON.stringify(run({ seed: 3 }));
    expect(JSON.stringify(run({ seed: 3 }))).toBe(a);
    expect(JSON.stringify(run({ seed: 4 }))).not.toBe(a);
  });

  it('gathers at the edge: more marks near it than deep inside', () => {
    const pts = centres({ density: 600, falloff: 40, interior: 0, focus: 0 });
    const near = pts.filter((q) => edgeDistance(q) < 20).length;
    const deep = pts.filter((q) => edgeDistance(q) > 45).length;
    expect(near).toBeGreaterThan(50);
    expect(deep).toBe(0);
  });

  it('keeps some grain inside with Interior', () => {
    const deep = centres({ density: 600, falloff: 20, interior: 0.3 }).filter((q) => edgeDistance(q) > 45).length;
    expect(deep).toBeGreaterThan(20);
  });

  it('Center works as a light: in the middle the band is even; moved left, the right edge gets more and wider grain', () => {
    const halves = (center: [number, number]) => {
      const pts = reach({ edge: 'inside', density: 3000, falloff: 15, focus: 1, center });
      return {
        left: pts.filter(([, , x]) => x < 100).length,
        right: pts.filter(([, , x]) => x > 100).length,
        // How deep the grain goes on each side (95th percentile of the distance from the edge).
        depth: (side: 'l' | 'r') => {
          const ds = pts.filter(([, , x]) => (side === 'l' ? x < 60 : x > 140)).map(([, far]) => 100 - far).sort((a, b) => a - b);
          return ds[Math.floor(ds.length * 0.95)] ?? 0;
        },
      };
    };
    const even = halves([0.5, 0.5]);
    expect(Math.abs(even.left - even.right)).toBeLessThan((even.left + even.right) * 0.1);
    const lit = halves([0.15, 0.5]);
    expect(lit.right).toBeGreaterThan(lit.left * 2);
    expect(lit.depth('r')).toBeGreaterThan(lit.depth('l') * 1.5);
  });

  it('puts the marks on the side asked for', () => {
    const inside = centres({ edge: 'inside', density: 400, focus: 0 });
    expect(inside.every(([x, y]) => x >= 0 && x <= 200 && y >= 0 && y <= 200)).toBe(true);
    const outside = centres({ edge: 'outside', density: 400, falloff: 30 });
    expect(outside.length).toBeGreaterThan(0);
    expect(outside.every(([x, y]) => x < 0 || x > 200 || y < 0 || y > 200)).toBe(true);
  });

  it('keeps the drawing under the grain by default (painted first, so the grain is on top), or replaces it', () => {
    const kept = run({}).shapes;
    expect(kept[0]!.subpaths.length).toBe(1);
    expect(kept[0]!.style.fill).toBe('#222');
    const replaced = run({ source: 'replace' }).shapes;
    expect(replaced.every((s) => s.style.stroke === 'none')).toBe(true);
    expect(kept.length).toBe(replaced.length + 1);
  });

  it('uses the ink (black by default), or the shape fill', () => {
    const grain = (params: Record<string, unknown>) => run({ source: 'replace', ...params }).shapes[0]!.style.fill;
    expect(grain({})).toBe('#000000');
    expect(grain({ ink: '#ff0000' })).toBe('#ff0000');
    expect(grain({ color: 'original' })).toBe('#222');
  });

  it('blends the grain with what is under it', () => {
    const shapes = run({ blend: 'multiply' }).shapes;
    expect(shapes[0]!.style['mix-blend-mode']).toBeUndefined();
    expect(shapes.slice(1).every((s) => s.style['mix-blend-mode'] === 'multiply')).toBe(true);
  });

  it('shares one path per opacity level', () => {
    const shapes = run({ source: 'replace', density: 400, opacityJitter: 0.8 }).shapes;
    expect(shapes.length).toBeGreaterThan(1);
    expect(shapes.length).toBeLessThanOrEqual(8);
  });
});
