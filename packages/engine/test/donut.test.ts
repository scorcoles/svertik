import { describe, expect, it } from 'vitest';
import { buildShape, builtins, createEngine, type SceneV1, type SubPath } from '../src';

// Signed area of the polygon through a path's end points (enough to tell its direction).
const area = (sp: SubPath) => {
  const pts = [sp.start, ...sp.segs.map((g) => g.p)];
  let a = 0;
  for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
  return a / 2;
};

describe('donut', () => {
  it('is two exact circles, the hole the other way round', () => {
    const [shape] = buildShape('donut', { radius: 100, innerRadius: 40 }).shapes;
    const [outer, inner] = shape!.subpaths;
    expect(shape!.subpaths).toHaveLength(2);
    expect(outer!.segs).toHaveLength(4);
    expect(inner!.segs).toHaveLength(4);
    expect(Math.sign(area(outer!))).toBe(-Math.sign(area(inner!)));
    expect(Math.max(...inner!.segs.map((g) => Math.hypot(...g.p)))).toBeCloseTo(40);
    expect(inner!.start).toEqual(inner!.segs.at(-1)!.p);
  });

  it('without a hole, or with no ring left, is a circle', () => {
    expect(buildShape('donut', { radius: 100, innerRadius: 0 }).shapes[0]!.subpaths).toHaveLength(1);
    expect(buildShape('donut', { radius: 100, innerRadius: 150 }).shapes[0]!.subpaths).toHaveLength(1);
  });
});

describe('an immovable body', () => {
  it('stays put when its object is moved, turned or stretched', () => {
    const e = createEngine(builtins);
    const scene: SceneV1 = {
      version: 1,
      objects: [{
        kind: 'group', id: 'g', name: 'g', stack: [{ id: 'ph', type: 'physics', params: { time: 2 } }],
        children: [
          { kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, stack: [{ id: 'rb1', type: 'rigidbody', params: { velocity: [0, -400] } }], transform: { x: 0, y: 0 } },
          { kind: 'shape', id: 'ring', name: 'Ring', shape: 'donut', params: { radius: 200, innerRadius: 160 }, stack: [{ id: 'rb2', type: 'rigidbody', params: { velocity: [0, 0], immovable: true } }], transform: { x: 30, y: 20, rotation: 10, stretch: [1, 0.9] } },
        ],
      }],
    };
    const ring = (s: SceneV1) => e.evaluateDocument(s).geometry.shapes.filter((x) => x.node === 'ring');
    const at0 = ring({ ...scene, objects: [{ ...scene.objects[0]!, stack: [] }] });
    expect(ring(scene)[0]!.subpaths[0]!.start[0]).toBeCloseTo(at0[0]!.subpaths[0]!.start[0], 3);
    expect(ring(scene)[0]!.subpaths[0]!.start[1]).toBeCloseTo(at0[0]!.subpaths[0]!.start[1], 3);
  });
});
