import { describe, expect, it } from 'vitest';
import { apply, buildShape, builtins, createEngine, insertPathPoint, isPathContours, manualPathParts, movePathHandle, pathPoint, setPathPointMode, validateScene, type PathContour, type SceneV1, type Vec2 } from '../src';
const curve = (): PathContour => ({ closed: false, points: [
  { ...pathPoint(0, 0), mode: 'free', out: [50, -80] },
  { ...pathPoint(120, 20), mode: 'free', in: [-40, 60] },
] });
const sample = (a: Vec2, b: Vec2, c: Vec2, d: Vec2, t: number): Vec2 => {
  const u = 1-t;
  return [0,1].map(i => u*u*u*a[i]! + 3*u*u*t*b[i]! + 3*u*t*t*c[i]! + t*t*t*d[i]!) as unknown as Vec2;
};
describe('manual Path primitive', () => {
  it('builds open cubics, closed contours and multiple contours without centring their coordinates', () => {
    const open = curve(); const closed = { ...curve(), closed: true };
    const geo = buildShape('path', { contours: [open, closed] });
    expect(geo.origin).toEqual([0, 0]);
    expect(geo.shapes[0]!.subpaths.map(p => [p.closed, p.segs.length])).toEqual([[false, 1], [true, 2]]);
    expect(geo.shapes[0]!.subpaths[0]!.start).toEqual([0, 0]);
  });
  it('constrains free, smooth and symmetric handles independently', () => {
    const p = { ...pathPoint(10, 20), mode: 'smooth' as const, in: [-30, 0], out: [50, 0] } as const;
    const smooth = movePathHandle(p, 'out', [0, 60]);
    expect(smooth.in).toEqual([-0, -30]);
    expect(movePathHandle({ ...p, mode: 'symmetric' }, 'out', [0, 60]).in).toEqual([-0, -60]);
    expect(movePathHandle({ ...p, mode: 'free' }, 'out', [0, 60]).in).toEqual([-30, 0]);
    expect(movePathHandle(p, 'out', [0, 60], true).mode).toBe('free');
    expect(movePathHandle(p, 'out', [0, 60], true).in).toEqual([-30, 0]);
  });
  it('creates curve handles from corners and removes them in Corner mode', () => {
    const c = { closed: false, points: [pathPoint(0, 0), pathPoint(100, 50), pathPoint(200, 0)] };
    const p = setPathPointMode(c, 1, 'symmetric');
    expect(p.in[0]).toBeLessThan(0); expect(p.out[0]).toBeGreaterThan(0);
    expect(setPathPointMode({ ...c, points: [c.points[0]!, p, c.points[2]!] }, 1, 'corner').out).toEqual([0, 0]);
  });
  it.each([false, true])('inserts points without changing cubic geometry (closed=%s)', (closed) => {
    const c = { ...curve(), closed };
    const segment = closed ? 1 : 0;
    const before = manualPathParts([c])[0]!, start = segment ? before.segs[segment-1]!.p : before.start, seg = before.segs[segment]!;
    const split = .37, after = manualPathParts([insertPathPoint(c, segment, split)])[0]!;
    for (const t of [.05, .2, .37, .5, .9]) {
      const expected = sample(start, seg.c1, seg.c2, seg.p, t);
      const left = t <= split, current = after.segs[segment + (left ? 0 : 1)]!;
      const from = left ? start : after.segs[segment]!.p;
      const actual = sample(from, current.c1, current.c2, current.p, left ? t/split : (t-split)/(1-split));
      expect(actual[0]).toBeCloseTo(expected[0], 8); expect(actual[1]).toBeCloseTo(expected[1], 8);
    }
  });
  it('preserves unchanged points in document space while editing under rotation and scale', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'path', name: 'Path', shape: 'path', params: { contours: [curve()] }, stack: [], transform: { x: 200, y: 100, rotation: 35, scale: 2 } }] };
    const engine = createEngine(builtins);
    const before = engine.evaluateDocument(scene).nodes.get('path')!;
    (scene.objects[0] as { params: Record<string, unknown> }).params.contours = [{ ...curve(), points: [curve().points[0]!, { ...curve().points[1]!, point: [300, 80] }] }];
    const after = engine.evaluateDocument(scene).nodes.get('path')!;
    expect(apply(after.matrix, [0, 0])).toEqual(apply(before.matrix, [0, 0]));
    expect(validateScene(scene).errors).toEqual([]);
    expect(validateScene(JSON.parse(JSON.stringify(scene))).errors).toEqual([]);
  });
  it('rejects malformed contours and non-finite coordinates', () => {
    expect(isPathContours([{ closed: false, points: [{ ...pathPoint(0, 0), out: [NaN, 0] }] }])).toBe(false);
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'p', name: 'p', shape: 'path', params: { contours: 'bad' }, stack: [] }] };
    expect(validateScene(scene).errors.length).toBeGreaterThan(0);
    expect(buildShape('path', { contours: 'bad' }).shapes[0]?.subpaths ?? []).toEqual([]);
  });
});

import { pathPointParam, readTarget, sampleScene } from '../src';
it('interpolates point position by stable id even after inserting another point, without mutating the source', () => {
  const contour = curve(); contour.points[1]!.id = 'destination';
  const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'p', name: 'Path', shape: 'path', params: { contours: [insertPathPoint(contour, 0)] }, stack: [] }], animation: { duration: 2, tracks: [{ id: 'move-point', node: 'p', on: 'shape', param: pathPointParam('destination'), keys: [{ t: 0, value: [120,20], ease: 'linear' }, { t: 2, value: [220,80] }] }] } };
  const target = scene.animation!.tracks[0]!;
  expect(readTarget(sampleScene(scene, 1), target)).toEqual([170,50]);
  expect(readTarget(scene, target)).toEqual([120,20]);
  expect(validateScene(scene)).toMatchObject({ errors: [], warnings: [] });
});
