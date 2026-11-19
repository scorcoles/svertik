import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, uprightBounds, type SceneV1 } from '../src';

const engine = createEngine(builtins);
const source = '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>';
const run = (params: Record<string, unknown>) => engine.evaluateStack({ source, stack: [{ id: 'g', type: 'gravity', params: { physics: false, ...params } }] });

describe('gravity', () => {
  it.each([false, true])('falls down the scene, regardless of object rotation (rigid bodies: %s)', (physics) => {
    const engine = createEngine(builtins);
    for (const rotation of [0, 30, 90]) {
      const scene = (time: number): SceneV1 => ({ version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 40, fill: true }, transform: { rotation }, stack: [{ id: 'fall', type: 'gravity', params: { time, physics, floor: [0.5, 20] } }] }] });
      const before = bounds(engine.evaluateDocument(scene(0)).geometry);
      const after = bounds(engine.evaluateDocument(scene(0.2)).geometry);
      expect(after.x).toBeCloseTo(before.x, 6);
      expect(after.y - before.y).toBeCloseTo(2, 5);
    }
  });

  it('keeps the floor on the scene horizon for a rotated and scaled group', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'group', id: 'parent', name: 'Parent', transform: { rotation: 55, scale: 2 }, stack: [{ id: 'fall', type: 'gravity', params: { time: 10, physics: false, floor: [0.5, 2], rotation: 0 } }], children: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 40, fill: true }, stack: [] }] }] };
    // The upright reference has height 80 and floor Y = -40 + 2 * 80 = 120.
    const box = bounds(createEngine(builtins).evaluateDocument(scene).geometry);
    expect(box.y + box.height).toBeCloseTo(120, 5);
  });
  it('matches the horizon-aligned floor guide when Gravity is inside a rotated parent', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'group', id: 'parent', name: 'Parent', transform: { rotation: 55, scale: 2 }, stack: [], children: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 40, fill: true }, stack: [{ id: 'fall', type: 'gravity', params: { time: 10, physics: false, floor: [0.5, 2] } }] }] }] };
    const doc = createEngine(builtins).evaluateDocument(scene);
    const info = doc.nodes.get('box')!, reference = uprightBounds(info.bounds, info.matrix);
    const box = bounds(doc.geometry);
    expect(box.y + box.height).toBeCloseTo(reference.y + reference.height * 2, 5);
  });
  it('starts at rest and falls with time squared', () => {
    expect(bounds(run({ time: 0 })).y).toBe(0);
    expect(bounds(run({ time: 1, floor: [0, 10] })).y).toBeCloseTo(50);
    expect(bounds(run({ time: 2, floor: [0, 10] })).y).toBeCloseTo(200);
    expect(bounds(run({ time: 3, gravity: 0 })).y).toBe(0);
  });
  it('rests on the floor without deforming and can seek backwards', () => {
    expect(bounds(run({ time: 5 }))).toEqual({ x: 0, y: 50, width: 100, height: 100 });
    expect(bounds(run({ time: 0.5 })).y).toBeCloseTo(12.5);
    expect(run({ time: 5 })).toEqual(run({ time: 5 }));
  });
  it('slides along an inclined floor without penetrating it', () => {
    const b = bounds(run({ time: 3, floor: [0, 2], rotation: 45 }));
    expect(b.x).toBeGreaterThan(0);
    expect((b.y + b.height - b.x) / Math.sqrt(2)).toBeCloseTo(200 / Math.sqrt(2));
  });
  it('uses the curve extremum for floor contact, rather than control points', () => {
    const geo = engine.evaluateStack({
      source: '<svg viewBox="0 0 100 100"><path d="M0 0 C0 100 100 100 100 0"/></svg>',
      stack: [{ id: 'g', type: 'gravity', params: { physics: false, time: 10, floor: [0, 2] } }],
    });
    const path = geo.shapes[0]!.subpaths[0]!;
    // This curve reaches 75 at t=0.5; the stable source box is its control hull (100).
    expect(path.start[1] + 75).toBeCloseTo(200);
  });
  it('lands independent pieces separately', () => {
    const geo = engine.evaluateStack({
      source: '<svg viewBox="0 0 100 100"><rect width="20" height="20"/><rect x="50" y="50" width="20" height="20"/></svg>',
      stack: [{ id: 'g', type: 'gravity', params: { physics: false, time: 10 } }],
    });
    const bottoms = geo.shapes.map((shape) => {
      const b = bounds({ ...geo, shapes: [shape] });
      return b.y + b.height;
    });
    expect(bottoms[0]).toBeCloseTo(bottoms[1]!);
  });
});

const rigidSource = '<svg viewBox="-20 0 100 100"><path d="M0 0 L80 20 L60 100 L-20 80 Z"/></svg>';
const rigid = (time: number, params: Record<string, unknown> = {}, svg = rigidSource) => engine.evaluateStack({
  source: svg,
  stack: [{ id: 'g', type: 'gravity', params: { time, ...params } }],
});
const edgeAngle = (geo: ReturnType<typeof rigid>) => {
  const path = geo.shapes[0]!.subpaths[0]!;
  const end = path.segs[0]!.p;
  return Math.atan2(end[1] - path.start[1], end[0] - path.start[0]);
};

describe('gravity rigid bodies', () => {
  it('tips a block resting on one corner and settles on a face', () => {
    const initial = edgeAngle(rigid(0));
    const landed = rigid(8, { bounce: 0 });
    expect(Math.abs(edgeAngle(landed) - initial)).toBeGreaterThan(0.1);
    expect(Math.abs(Math.sin(edgeAngle(landed) * 2))).toBeLessThan(0.03);
    expect(bounds(landed).y + bounds(landed).height).toBeCloseTo(150, 1);
  });
  it('preserves rigid distances and source geometry', () => {
    const original = rigid(0), copy = structuredClone(original);
    const fallen = rigid(4);
    const length = (geo: typeof original) => {
      const path = geo.shapes[0]!.subpaths[0]!;
      return Math.hypot(path.segs[0]!.p[0] - path.start[0], path.segs[0]!.p[1] - path.start[1]);
    };
    expect(length(fallen)).toBeCloseTo(length(original), 8);
    expect(original).toEqual(copy);
  });
  it('replays identically after seeking backwards', () => {
    const late = rigid(4);
    rigid(0.2);
    expect(rigid(4)).toEqual(late);
    expect(rigid(0)).toEqual(engine.evaluateStack({ source: rigidSource, stack: [] }));
  });
  it('keeps a symmetric block stable on a flat floor', () => {
    const geo = rigid(8, { bounce: 0 }, source);
    expect(Math.abs(edgeAngle(geo))).toBeLessThan(0.01);
    expect(bounds(geo).y + bounds(geo).height).toBeCloseTo(150, 1);
  });
  it('falls analytically before impact', () => {
    expect(bounds(rigid(0.5, { floor: [0, 10] }, source)).y).toBeCloseTo(12.5, 8);
    expect(bounds(rigid(1, { gravity: 0 }, source)).y).toBe(0);
  });
  it('friction slows sliding on a slope', () => {
    const smooth = rigid(5, { rotation: 15, friction: 0, bounce: 0 }, source);
    const rough = rigid(5, { rotation: 15, friction: 1, bounce: 0 }, source);
    expect(bounds(smooth).x - bounds(rough).x).toBeGreaterThan(20);
  });
});

it('gravity bounce lifts a body again after impact', () => {
  const bouncing = bounds(rigid(1.5, { bounce: 0.8 }, source));
  const resting = bounds(rigid(1.5, { bounce: 0 }, source));
  expect(resting.y - bouncing.y).toBeGreaterThan(10);
});

it('gravity keeps compound clone pieces in one rigid body and preserves paint order', () => {
  const geo = engine.evaluateStack({
    source: '<svg viewBox="0 0 100 100"><rect width="20" height="20" fill="red"/><rect x="40" y="40" width="20" height="20" fill="blue"/></svg>',
    stack: [{ id: 'c', type: 'clone', params: { count: 2 } }, { id: 'g', type: 'gravity', params: { time: 5, bounce: 0 } }],
  });
  const initial = engine.evaluateStack({
    source: '<svg viewBox="0 0 100 100"><rect width="20" height="20" fill="red"/><rect x="40" y="40" width="20" height="20" fill="blue"/></svg>',
    stack: [{ id: 'c', type: 'clone', params: { count: 2 } }],
  });
  expect(geo.shapes.map((s) => [s.clone, s.style])).toEqual(initial.shapes.map((s) => [s.clone, s.style]));
  const tags = [...new Set(geo.shapes.map((s) => s.clone))];
  for (const tag of tags) {
    const parts = geo.shapes.filter((s) => s.clone === tag);
    const originals = initial.shapes.filter((s) => s.clone === tag);
    expect(parts.length).toBeGreaterThan(1);
    const distance = (list: typeof parts) => Math.hypot(
      list[0]!.subpaths[0]!.start[0] - list[1]!.subpaths[0]!.start[0],
      list[0]!.subpaths[0]!.start[1] - list[1]!.subpaths[0]!.start[1],
    );
    expect(distance(parts)).toBeCloseTo(distance(originals), 8);
  }
});

const splitSource = '<svg viewBox="0 0 100 100"><rect width="20" height="20"/><rect x="80" width="20" height="20"/></svg>';
const thrown = (time: number, gravity = 1, rotation = 0) => engine.evaluateStack({
  source: splitSource,
  stack: [
    { id: 'blast', type: 'explosion', params: { motion: 'impulse', amount: 1, force: 1, chaos: 0, spin: 0, shrink: 0 } },
    { id: 'turn', type: 'transform', params: { rotation } },
    { id: 'fall', type: 'gravity', params: { time, gravity, floor: [0, 100] } },
  ],
});

describe('explosion inertia and cached physics', () => {
  it('impulse mode starts in place and keeps horizontal velocity under gravity', () => {
    const start = thrown(0), later = thrown(0.5), twice = thrown(1);
    const boxes = (geo: typeof start) => geo.shapes.map((shape) => bounds({ ...geo, shapes: [shape] }));
    expect(boxes(start)[0]!.x).toBeCloseTo(0);
    expect(boxes(later)[0]!.x).toBeCloseTo(-50);
    expect(boxes(twice)[0]!.x).toBeCloseTo(-100);
    expect(boxes(later)[1]!.x).toBeCloseTo(130);
    expect(boxes(later)[0]!.y).toBeCloseTo(12.5);
    expect(later.shapes.every((shape) => !shape.impulse)).toBe(true);
  });
  it('conserves velocity with zero gravity and rotates impulses with a Transform', () => {
    const initial = thrown(0, 0, 90), later = thrown(0.5, 0, 90);
    const a = initial.shapes[0]!.subpaths[0]!.start;
    const b = later.shapes[0]!.subpaths[0]!.start;
    expect(b[0] - a[0]).toBeCloseTo(0);
    expect(b[1] - a[1]).toBeCloseTo(-50);
  });
  it('preserves spin in free flight', () => {
    const run = (time: number) => engine.evaluateStack({ source, stack: [
      { id: 'blast', type: 'explosion', params: { motion: 'impulse', amount: 1, force: 0, spin: 90, shrink: 0 } },
      { id: 'fall', type: 'gravity', params: { gravity: 0, time, floor: [0, 100] } },
    ] });
    const angle1 = edgeAngle(run(0.25)), angle2 = edgeAngle(run(0.5));
    expect(Math.abs(angle1)).toBeGreaterThan(0.01);
    expect(angle2).toBeCloseTo(angle1 * 2, 8);
  });
  it('cached seeks and parameter changes match cold simulations, including fractional frames', () => {
    const hot = createEngine(builtins);
    for (const [time, bounce, floor, rotation] of [[4, 0.2, 1.5, 0], [0.237, 0.2, 1.5, 0], [3.333, 0.2, 1.5, 0], [1.7, 0.7, 1.8, 15], [4, 0.2, 1.5, 0]]) {
      const input = { source: rigidSource, stack: [{ id: 'g', type: 'gravity', params: { time, bounce, floor: [0.5, floor], rotation } }] };
      const cold = createEngine(builtins).evaluateStack(input);
      expect(hot.evaluateStack(input)).toEqual(cold);
    }
  });
});
