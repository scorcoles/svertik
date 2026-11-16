import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type StackInput } from '../src';

// One open path: a straight horizontal line pinned at (0,0) and (100,0), with some slack drawn as a sag.
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0C20 60 80 60 100 0" stroke="#000" fill="none"/></svg>';
const nodes = (time: number, extra: Record<string, unknown> = {}, source = svg) => {
  const engine = createEngine(builtins);
  const geo = engine.evaluateStack({ source, stack: [{ id: 'r', type: 'rope', params: { time, ...extra } }] } as StackInput);
  const sp = geo.shapes[0]!.subpaths[0]!;
  return [sp.start, ...sp.segs.map((s) => s.p)];
};

describe('rope', () => {
  it('keeps both ends pinned', () => {
    const pts = nodes(1.5);
    expect(pts[0]![0]).toBeCloseTo(0); expect(pts[0]![1]).toBeCloseTo(0);
    expect(pts[pts.length - 1]![0]).toBeCloseTo(100); expect(pts[pts.length - 1]![1]).toBeCloseTo(0);
  });

  it('does not stretch: links keep their rest length', () => {
    const rest = nodes(0), moved = nodes(1.5);
    const link = (p: readonly (readonly [number, number])[], i: number) => Math.hypot(p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]);
    for (let i = 0; i < rest.length - 1; i++) expect(link(moved, i)).toBeCloseTo(link(rest, i), 0);
  });

  it('drops a slack rope drawn as a hump, and is deterministic', () => {
    const hump = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -60 100 120"><path d="M0 0C20 -80 80 -80 100 0" stroke="#000" fill="none"/></svg>';
    const start = nodes(0, {}, hump)[12]![1];
    expect(start).toBeLessThan(-30);
    // (Another drawing, so it does not share the cached chain of the one below.)
    const other = hump.replace('C20 -80 80 -80 100 0', 'C20 -80 80 -80 101 0');
    expect(nodes(1.5, { gravity: 0 }, other)[12]![1]).toBeCloseTo(nodes(0, {}, other)[12]![1], 0);
    const a = nodes(1.5, {}, hump), b = nodes(1.5, {}, hump);
    expect(a).toEqual(b);
    expect(a[12]![1]).toBeGreaterThan(start + 20);
  });

  it('settles a drawn hump into its rest shape before time 0', () => {
    const hump = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -60 100 120"><path d="M0 0C20 -80 80 -80 100 0" stroke="#000" fill="none"/></svg>';
    expect(nodes(0, { settle: 3 }, hump)[12]![1]).toBeGreaterThan(20);
  });

  it('keeps its state when an upstream effect hands over a new geometry object every frame', () => {
    const hump = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -60 100 120"><path d="M0 0C20 -80 80 -80 100 0" stroke="#000" fill="none"/></svg>';
    const engine = createEngine(builtins);
    const at = (time: number) => engine.evaluateStack({ source: hump, stack: [
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 40, offset: [0, 0.01] } },
      { id: 'r', type: 'rope', params: { time, settle: 6, segments: 40 } },
    ] } as StackInput);
    let t0 = performance.now(); at(0); const first = performance.now() - t0;
    t0 = performance.now(); for (let i = 1; i <= 5; i++) at(i / 60); const next = (performance.now() - t0) / 5;
    expect(next).toBeLessThan(first / 4);
  });

  it('is pushed away by the pointer', () => {
    const free = nodes(0.5, { pointer: [0.5, 0.6], radius: 0 }), pushed = nodes(0.5, { pointer: [0.5, 0.5], radius: 0.25 });
    const mid = (p: readonly (readonly [number, number])[]) => p[Math.floor(p.length / 2)]!;
    expect(Math.hypot(mid(pushed)[0] - 50, mid(pushed)[1] - 50)).toBeGreaterThan(Math.hypot(mid(free)[0] - 50, mid(free)[1] - 50) - 1e-6);
  });
});
