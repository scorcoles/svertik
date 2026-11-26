import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, createMouseInstances, sampleScene, type SceneNode, type SceneV1 } from '../src';

// A box falling onto an immovable floor, inside Physics; optionally a ball born at runtime (`since`).
const scene = (born?: number, extra: Partial<SceneV1> = {}): SceneV1 => ({
  version: 1,
  animation: { duration: 4, fps: 30, tracks: [] },
  objects: [{
    kind: 'group', id: 'g', name: 'World',
    stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [0, 600], bounce: 0.2, friction: 0.5 } }],
    children: [
      ...(born === undefined ? [] : [{
        kind: 'group', id: 'copy', name: 'Copy', since: born, stack: [],
        children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, transform: { x: 120, y: -150 }, stack: [] }],
      } as SceneNode]),
      { kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 60, height: 60 }, transform: { x: 0, y: -100 }, stack: [] },
      { kind: 'shape', id: 'floor', name: 'Floor', shape: 'rectangle', params: { width: 800, height: 40 }, transform: { x: 0, y: 200 }, stack: [{ id: 'fix', type: 'rigidbody', params: { immovable: true } }] },
    ],
  }],
  ...extra,
});
const centre = (e: ReturnType<typeof createEngine>, s: SceneV1, t: number, node: string) => {
  const shapes = e.evaluateDocument({ ...sampleScene(s, t), at: t }).geometry.shapes.filter((x) => x.node === node);
  if (!shapes.length) return null;
  const b = bounds({ viewBox: [0, 0, 0, 0], shapes });
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, bottom: b.y + b.height };
};

describe('Physics as a live world', () => {
  it('a body born at runtime joins the running simulation at its birth, at rest where it is', () => {
    const e = createEngine(builtins), plain = createEngine(builtins);
    const withCopy = scene(1), without = scene();
    for (let f = 0; f <= 29; f++) {
      const t = f / 30;
      expect(centre(e, withCopy, t, 'ball')).toBeNull();
      expect(centre(e, withCopy, t, 'box')).toEqual(centre(plain, without, t, 'box'));
    }
    // Its birth frame: where it was placed (it has only fallen for the steps since the birth).
    const ball = centre(e, withCopy, 1, 'ball')!;
    expect(ball.x).toBeCloseTo(120, 3);
    expect(Math.abs(ball.y - -150)).toBeLessThan(1);
    // Then it falls onto the floor too.
    for (let f = 31; f <= 90; f++) centre(e, withCopy, f / 30, 'box');
    expect(centre(e, withCopy, 3, 'ball')!.bottom).toBeGreaterThan(170);
    expect(centre(e, withCopy, 3, 'ball')!.bottom).toBeLessThan(185);
  });

  it('jumping to a time after the birth gives what playing up to it gives', () => {
    const played = createEngine(builtins), s = scene(1);
    for (let f = 0; f <= 60; f++) centre(played, s, f / 30, 'box');
    const jumped = createEngine(builtins);
    const a = centre(played, s, 2, 'ball')!, b = centre(jumped, scene(1), 2, 'ball')!;
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('going back before the birth removes the body; forward again it is born at the same moment', () => {
    const e = createEngine(builtins), s = scene(1);
    for (let f = 0; f <= 60; f++) centre(e, s, f / 30, 'box');
    const ahead = centre(e, s, 2, 'ball')!;
    expect(centre(e, s, 0.5, 'ball')).toBeNull();
    for (let f = 15; f <= 60; f++) centre(e, s, f / 30, 'box');
    const again = centre(e, s, 2, 'ball')!;
    expect(again.y).toBeCloseTo(ahead.y, 6);
  });

  it('runs past the old 60 s limit', () => {
    const e = createEngine(builtins);
    const s = scene(undefined, {});
    const late = centre(e, s, 90, 'box')!;
    // Resting on the floor (its top at 180).
    expect(late.bottom).toBeGreaterThan(170);
    expect(late.bottom).toBeLessThan(185);
  });
});

describe('Gravity inside Physics', () => {
  it('hands its pull and floor to Physics instead of simulating twice', () => {
    const s: SceneV1 = {
      version: 1,
      animation: { duration: 4, fps: 30, tracks: [] },
      objects: [{
        kind: 'group', id: 'g', name: 'World',
        stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, bounce: 0.1, friction: 0.5 } }],
        children: [
          { kind: 'shape', id: 'a', name: 'A', shape: 'rectangle', params: { width: 50, height: 50 }, transform: { x: -100, y: 0 }, stack: [{ id: 'gr-a', type: 'gravity', params: { gravity: 2, floor: [0.5, 4] } }] },
          { kind: 'shape', id: 'b', name: 'B', shape: 'rectangle', params: { width: 50, height: 50 }, transform: { x: 100, y: 0 }, stack: [] },
        ],
      }],
    };
    const e = createEngine(builtins);
    for (let f = 0; f <= 90; f++) centre(e, s, f / 30, 'a');
    const a = centre(e, s, 3, 'a')!, b = centre(e, s, 3, 'b')!;
    // A rests on its own floor (4 box heights down from the top: 175), B floats where it was.
    expect(a.bottom).toBeGreaterThan(170);
    expect(a.bottom).toBeLessThan(180);
    expect(a.x).toBeCloseTo(-100, 0);
    expect(b.y).toBeCloseTo(0, 6);
  });
});

describe('Soft bodies in the live world', () => {
  const soft = (id: string, x: number, y: number) => ({ kind: 'shape', id, name: id, shape: 'ellipse', params: { width: 60, height: 60 }, transform: { x, y }, stack: [{ id: id + '-sb', type: 'softbody', params: {} }] } as SceneNode);
  const cells = (born?: number, gravity = false): SceneV1 => ({
    version: 1,
    animation: { duration: 4, fps: 30, tracks: [] },
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: gravity ? [0, 0] : [0, 600], bounce: 0.1, friction: 0.5 } }],
      children: [
        ...(born === undefined ? [] : [{ kind: 'group', id: 'copy', name: 'Copy', since: born, stack: [], children: [soft('new', 150, -150)] } as SceneNode]),
        gravity ? { ...soft('a', -100, 0), stack: [...soft('a', 0, 0).stack, { id: 'a-gr', type: 'gravity', params: { gravity: 2, floor: [0.5, 4] } }] } as SceneNode : soft('a', -100, 0),
        { kind: 'shape', id: 'floor', name: 'Floor', shape: 'rectangle', params: { width: 800, height: 40 }, transform: { x: 0, y: 200 }, stack: [{ id: 'fix', type: 'rigidbody', params: { immovable: true } }] },
      ],
    }],
  });

  it('a soft body born at runtime leaves the others untouched before it and starts at rest', () => {
    const e = createEngine(builtins), plain = createEngine(builtins);
    for (let f = 0; f <= 29; f++) expect(centre(e, cells(1), f / 30, 'a')).toEqual(centre(plain, cells(), f / 30, 'a'));
    const born = centre(e, cells(1), 1, 'new')!;
    expect(born.x).toBeCloseTo(150, 1);
    expect(Math.abs(born.y - -150)).toBeLessThan(1);
    for (let f = 31; f <= 90; f++) centre(e, cells(1), f / 30, 'a');
    const later = centre(e, cells(1), 3, 'new')!;
    expect(later.bottom).toBeGreaterThan(165);
    expect(later.bottom).toBeLessThan(185);
  });

  it('a Gravity on a soft body inside Physics pulls it onto its own floor', () => {
    const e = createEngine(builtins);
    for (let f = 0; f <= 90; f++) centre(e, cells(undefined, true), f / 30, 'a');
    const a = centre(e, cells(undefined, true), 3, 'a')!;
    // Floor 4 heights below its top (-30 + 240 = 210) is under the immovable floor's top (180): it lands on that.
    expect(a.bottom).toBeGreaterThan(165);
    expect(a.bottom).toBeLessThan(185);
  });
});

describe('Mouse Instance inside a Physics group', () => {
  it('a click adds a body to the running world, where it was clicked', () => {
    const cell = (id: string, x: number): SceneNode => ({ kind: 'shape', id, name: id, shape: 'ellipse', params: { width: 50, height: 50 }, transform: { x, y: -150 }, stack: [] });
    const s: SceneV1 = {
      version: 1, document: { width: 800, height: 600 }, animation: { duration: 10, fps: 30, tracks: [], infinite: true, loop: false },
      objects: [{
        kind: 'group', id: 'g', name: 'World',
        stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [0, 600], bounce: 0.1, friction: 0.5 } }],
        children: [
          { kind: 'instance', id: 'gen', name: 'Gen', of: 'c0', stack: [], mouse: { event: 'click' } } as SceneNode,
          cell('c0', -200), cell('c1', -100), cell('c2', 0), cell('c3', 100),
          { kind: 'shape', id: 'floor', name: 'Floor', shape: 'rectangle', params: { width: 800, height: 40 }, transform: { x: 0, y: 250 }, stack: [{ id: 'fix', type: 'rigidbody', params: { immovable: true } }] },
        ],
      }],
    };
    const e = createEngine(builtins), plain = createEngine(builtins), mouse = createMouseInstances(s);
    const shapes = (eng: typeof e, scene: SceneV1, t: number) => eng.evaluateDocument({ ...sampleScene(scene, t), at: t }).geometry.shapes;
    for (let f = 0; f <= 60; f++) {
      const t = f / 30, mine = shapes(e, mouse.apply(s, t), t), theirs = shapes(plain, s, t);
      // Nothing changes until the click (each copy is a body of its own, not merged with a sibling's).
      expect(mine.map((x) => bounds({ viewBox: [0, 0, 0, 0], shapes: [x] }))).toEqual(theirs.map((x) => bounds({ viewBox: [0, 0, 0, 0], shapes: [x] })));
    }
    expect(mouse.event('click', [300, -250], 2.01, 1, 2.01)).toBe(true);
    const born = shapes(e, mouse.apply(s, 2 + 1 / 30), 2 + 1 / 30).filter((x) => x.node?.startsWith('@mouse'));
    expect(born).toHaveLength(1);
    const box = bounds({ viewBox: [0, 0, 0, 0], shapes: born });
    expect(box.x + box.width / 2).toBeCloseTo(300, 0);
    expect(Math.abs(box.y + box.height / 2 - -250)).toBeLessThan(1);
    let last = born;
    for (let f = 62; f <= 150; f++) last = shapes(e, mouse.apply(s, f / 30), f / 30).filter((x) => x.node?.startsWith('@mouse'));
    const landed = bounds({ viewBox: [0, 0, 0, 0], shapes: last });
    expect(landed.y + landed.height).toBeGreaterThan(220);
    expect(landed.y + landed.height).toBeLessThan(236);
  });
});

describe('Physics in Play', () => {
  it('the live pointer (and other runtime values) changing every frame does not restart the world', () => {
    const e = createEngine(builtins), s = scene();
    const frame = (t: number) => {
      const start = performance.now();
      e.evaluateDocument({ ...sampleScene(s, t), at: t, pointer: { posX: Math.sin(t) * 300, posY: t * 10, inside: 1 }, runtime: { dt: 1 / 30 } });
      return performance.now() - start;
    };
    for (let f = 0; f <= 240; f++) frame(f / 30);
    // Restarting would replay 8 s of simulation on each frame.
    let total = 0;
    for (let f = 241; f <= 270; f++) total += frame(f / 30);
    expect(total / 30).toBeLessThan(40);
  });
});

describe('Poke (a click on a body)', () => {
  const world = (pokes?: SceneV1['pokes'], soft = false): SceneV1 => ({
    version: 1,
    animation: { duration: 4, fps: 30, tracks: [] },
    ...(pokes ? { pokes } : {}),
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, poke: 300 } }],
      children: [
        { kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, stack: soft ? [{ id: 'sb', type: 'softbody', params: {} }] : [] },
        { kind: 'shape', id: 'other', name: 'Other', shape: 'ellipse', params: { width: 40, height: 40 }, transform: { x: 0, y: 300 }, stack: [] },
      ],
    }],
  });
  for (const soft of [false, true]) it(`pushes the clicked body from that moment on (${soft ? 'soft' : 'rigid'})`, () => {
    const e = createEngine(builtins), plain = createEngine(builtins);
    const pokes = [{ at: 1, node: 'ball', dir: [1, 0] as [number, number] }];
    for (let f = 0; f <= 60; f++) {
      const t = f / 30;
      const s = t >= 1 ? world(pokes, soft) : world(undefined, soft);
      const ball = centre(e, s, t, 'ball')!;
      if (t <= 1 + 1e-9) expect(ball.x).toBeCloseTo(centre(plain, world(undefined, soft), t, 'ball')!.x, 6);
    }
    // One second after the push at 300 px/s (no forces, no contacts on the way).
    expect(centre(e, world(pokes, soft), 2, 'ball')!.x).toBeGreaterThan(285);
    expect(centre(e, world(pokes, soft), 2, 'ball')!.x).toBeLessThan(305);
    expect(centre(e, world(pokes, soft), 2, 'other')!.x).toBeCloseTo(0, 6);
    // Seeking back and forth again gives the same.
    centre(e, world(pokes, soft), 0.5, 'ball');
    for (let f = 15; f <= 60; f++) centre(e, world(pokes, soft), f / 30, 'ball');
    expect(centre(e, world(pokes, soft), 2, 'ball')!.x).toBeGreaterThan(285);
  });

  it('marks the bodies a click can push', () => {
    const shapes = createEngine(builtins).evaluateDocument({ ...sampleScene(world(), 0.5), at: 0.5 }).geometry.shapes;
    expect(shapes.every((s) => s.pokeable)).toBe(true);
  });
});

describe('Soft bodies that overlap', () => {
  const blob = (id: string, x: number, y: number, extra: object = {}) => ({ kind: 'shape', id, name: id, shape: 'ellipse', params: { width: 60, height: 60 }, transform: { x, y }, stack: [{ id: id + '-sb', type: 'softbody', params: {} }], ...extra } as SceneNode);
  const pair = (b: SceneNode, acceleration: [number, number] = [0, 0]): SceneV1 => ({
    version: 1, animation: { duration: 4, fps: 30, tracks: [] },
    objects: [{ kind: 'group', id: 'g', name: 'W', stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration, bounce: 0.1, friction: 0.3 } }], children: [blob('a', 0, 0), b] }],
  });
  const gap = (e: ReturnType<typeof createEngine>, s: SceneV1, t: number) => {
    const a = centre(e, s, t, 'a')!, b = centre(e, s, t, 'b') ?? centre(e, s, t, 'inner');
    return b ? Math.hypot(a.x - b.x, a.y - b.y) : Infinity;
  };

  it('two bodies born half inside each other push apart', () => {
    const e = createEngine(builtins), s = pair(blob('b', 25, 0));
    for (let f = 0; f <= 30; f++) gap(e, s, f / 30);
    expect(gap(e, s, 1)).toBeGreaterThan(54);
  });

  it('a body born deep inside another gets out on its own side', () => {
    const e = createEngine(builtins), s = pair(blob('b', 6, 0));
    for (let f = 0; f <= 45; f++) gap(e, s, f / 30);
    expect(gap(e, s, 1.5)).toBeGreaterThan(54);
    expect(centre(e, s, 1.5, 'b')!.x).toBeGreaterThan(centre(e, s, 1.5, 'a')!.x);
  });

  it('a body born touching another (a click next to a pile) collides with it instead of passing through', () => {
    // A is fixed; at 1 s a body is born diagonally above it (their boxes already overlap, their outlines
    // don't) and falls onto it: it must stay on top.
    const s: SceneV1 = {
      version: 1, animation: { duration: 4, fps: 30, tracks: [] },
      objects: [{ kind: 'group', id: 'g', name: 'W', stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [0, 400], bounce: 0.1, friction: 0.8 } }],
        children: [
          { kind: 'group', id: 'copy', name: 'Copy', since: 1, stack: [], children: [blob('inner', 40, -50)] } as SceneNode,
          blob('a', 0, 0, { stack: [{ id: 'a-sb', type: 'softbody', params: {} }, { id: 'a-fix', type: 'rigidbody', params: { immovable: true } }] }),
        ] }],
    };
    const e = createEngine(builtins);
    for (let f = 0; f <= 45; f++) gap(e, s, f / 30);
    expect(gap(e, s, 1.5)).toBeGreaterThan(50);
    expect(centre(e, s, 1.5, 'inner')!.y).toBeLessThan(centre(e, s, 1.5, 'a')!.y);
  });
});

describe('Burst (a double-click on a body)', () => {
  const world = (bursts?: SceneV1['bursts'], soft = false): SceneV1 => ({
    version: 1, animation: { duration: 4, fps: 30, tracks: [] },
    ...(bursts ? { bursts } : {}),
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, collisions: false, burst: 6, burstSpeed: 200 } }],
      children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 120, height: 120 }, stack: [
        ...(soft ? [{ id: 'sb', type: 'softbody', params: {} }] : []),
        { id: 'rb', type: 'rigidbody', params: { velocity: [100, 0] } },
      ] }],
    }],
  });
  const pieces = (e: ReturnType<typeof createEngine>, s: SceneV1, t: number) => e.evaluateDocument({ ...sampleScene(s, t), at: t }).geometry.shapes.filter((x) => x.node === 'ball');
  for (const soft of [false, true]) it(`breaks the body into pieces that go on with its motion and fly apart (${soft ? 'soft' : 'rigid'})`, () => {
    const e = createEngine(builtins), plain = createEngine(builtins);
    const bursts = [{ at: 1, node: 'ball' }];
    for (let f = 0; f <= 60; f++) {
      const t = f / 30, s = t >= 1 ? world(bursts, soft) : world(undefined, soft);
      const now = pieces(e, s, t);
      if (t < 1 - 1e-9) {
        expect(now).toHaveLength(1);
        expect(centre(e, s, t, 'ball')!.x).toBeCloseTo(centre(plain, world(undefined, soft), t, 'ball')!.x, 6);
      }
    }
    const after = pieces(e, world(bursts, soft), 2);
    expect(after.length).toBeGreaterThanOrEqual(4);
    // The pieces' centre goes on at the body's 100 px/s; they spread out (200 px/s for a second).
    const box = bounds({ viewBox: [0, 0, 0, 0], shapes: after });
    expect(box.x + box.width / 2).toBeGreaterThan(170);
    expect(box.x + box.width / 2).toBeLessThan(230);
    expect(box.width).toBeGreaterThan(300);
    // Back before the double-click: whole again.
    expect(pieces(e, world(bursts, soft), 0.5)).toHaveLength(1);
  });

  it('marks the bodies a double-click can still break', () => {
    const e = createEngine(builtins);
    expect(pieces(e, world(), 0.5).every((x) => x.burstable)).toBe(true);
    expect(pieces(e, world([{ at: 0.2, node: 'ball' }]), 0.5).some((x) => x.burstable)).toBe(false);
  });
});

describe('Drag & throw', () => {
  const world = (drags?: SceneV1['drags'], soft = false): SceneV1 => ({
    version: 1, animation: { duration: 4, fps: 30, tracks: [] },
    ...(drags ? { drags } : {}),
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, drag: true } }],
      children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 60, height: 60 }, stack: soft ? [{ id: 'sb', type: 'softbody', params: {} }] : [] }],
    }],
  });
  for (const soft of [false, true]) it(`a dragged body follows the pointer and keeps its speed when let go (${soft ? 'soft' : 'rigid'})`, () => {
    const e = createEngine(builtins);
    // Grabbed at its centre at 1 s, moved 200 px right in half a second (400 px/s), let go at 1.5 s.
    const points: { at: number; x: number; y: number }[] = [];
    let drag: NonNullable<SceneV1['drags']>[number] = { id: 1, node: 'ball', points };
    for (let f = 0; f <= 75; f++) {
      const t = f / 30;
      if (t >= 1 - 1e-9 && t <= 1.5 + 1e-9) points.push({ at: t, x: (t - 1) * 400, y: 0 });
      if (t > 1.5 + 1e-9 && drag.end === undefined) drag = { ...drag, end: 1.5 };
      const s = t >= 1 - 1e-9 ? world([{ ...drag, points: [...points] }], soft) : world(undefined, soft);
      centre(e, s, t, 'ball');
    }
    const s = world([{ ...drag, points: [...points], end: 1.5 }], soft);
    const held = centre(e, s, 1.5, 'ball')!;
    // It has followed (a spring: a little behind).
    expect(held.x).toBeGreaterThan(130);
    expect(held.x).toBeLessThan(205);
    expect(Math.abs(held.y)).toBeLessThan(10);
    // Let go, it goes on (no forces): far past the pointer's last place, still moving right.
    const later = centre(e, s, 2.5, 'ball')!;
    expect(later.x).toBeGreaterThan(held.x + 200);
    expect(centre(e, s, 2.5 - 1 / 30, 'ball')!.x).toBeLessThan(later.x);
  });

  it('marks the bodies the pointer can grab', () => {
    expect(createEngine(builtins).evaluateDocument({ ...sampleScene(world(), 0.5), at: 0.5 }).geometry.shapes.every((x) => x.draggable)).toBe(true);
  });
});

describe('Air drag', () => {
  it('slows a thrown body to a stop: 200 px/s with 2/s of drag covers about 100 px', () => {
    const s = (damping: number): SceneV1 => ({ version: 1, animation: { duration: 4, fps: 30, tracks: [] }, objects: [{ kind: 'group', id: 'g', name: 'W',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, damping } }],
      children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, stack: [{ id: 'rb', type: 'rigidbody', params: { velocity: [200, 0] } }] }] }] });
    const far = centre(createEngine(builtins), s(2), 4, 'ball')!.x;
    expect(far).toBeGreaterThan(95);
    expect(far).toBeLessThan(101);
    expect(centre(createEngine(builtins), s(0), 4, 'ball')!.x).toBeCloseTo(800, 0);
  });
});

describe('Network inside Physics', () => {
  it('links follow the bodies they join, and snap when stretched too far', () => {
    const scene = (pokes: SceneV1['pokes']): SceneV1 => ({ version: 1, animation: { duration: 4, fps: 30, tracks: [] }, pokes,
      objects: [{ kind: 'group', id: 'g', name: 'W', stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, poke: 300, collisions: false } }],
        children: [{ kind: 'shape', id: 'dots', name: 'D', shape: 'ellipse', params: { width: 20, height: 20 }, stack: [{ id: 'cl', type: 'clone', params: { mode: 'grid', columns: 3, rows: 1, spacing: [4, 4] } }, { id: 'net', type: 'network', params: { neighbors: 2, maxDistance: 400 } }] }] }] });
    const shapes = (s: SceneV1, t: number) => createEngine(builtins).evaluateDocument({ ...sampleScene(s, t), at: t }).geometry.shapes;
    const rest = shapes(scene([]), 0.05);
    const first = rest.filter((x) => !x.networkLink).sort((a, b) => bounds({ viewBox: [0, 0, 0, 0], shapes: [a] }).x - bounds({ viewBox: [0, 0, 0, 0], shapes: [b] }).x)[0]!;
    const after = shapes(scene([{ at: 0.2, node: 'dots', dir: [0, 1], body: first.body }]), 1);
    const links = after.filter((x) => x.networkLink);
    // Three links at rest; the short one from the pushed dot snapped, the long one reaches down to it.
    expect(rest.filter((x) => x.networkLink)).toHaveLength(3);
    expect(links).toHaveLength(2);
    expect(Math.max(...links.map((x) => bounds({ viewBox: [0, 0, 0, 0], shapes: [x] }).height))).toBeGreaterThan(200);
  });
});

describe('Defaults', () => {
  it('a Physics without Time follows scene.time', () => {
    const s: SceneV1 = { version: 1, animation: { duration: 4, fps: 30, tracks: [] }, objects: [{ kind: 'group', id: 'g', name: 'W',
      stack: [{ id: 'ph', type: 'physics', params: {} }],
      children: [{ kind: 'shape', id: 'ball', name: 'Ball', shape: 'ellipse', params: { width: 40, height: 40 }, stack: [{ id: 'rb', type: 'rigidbody', params: { velocity: [100, 0] } }] }] }] };
    expect(centre(createEngine(builtins), s, 2, 'ball')!.x).toBeCloseTo(200, 3);
  });
  it('Opacity starts at half', () => {
    const shapes = createEngine(builtins).evaluateDocument({ version: 1, objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: {}, stack: [{ id: 'o', type: 'opacity', params: {} }] }] }).geometry.shapes;
    expect(Number(shapes[0]!.style.opacity ?? shapes[0]!.style['fill-opacity'])).toBeCloseTo(0.5, 6);
  });
});

describe('Physics with an animated input', () => {
  // A bar that grows (its width follows the time) towards a box, without gravity. The group's size changes
  // every frame: the world must go on (not restart from the first frame's shapes), so the bar pushes the box.
  const s: SceneV1 = {
    version: 1,
    animation: { duration: 3, fps: 30, tracks: [] },
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [0, 0], bounce: 0 } }],
      children: [
        { kind: 'shape', id: 'bar', name: 'Bar', shape: 'rectangle', params: { width: { $expr: '60 + 300 * scene.time', fallback: 60 }, height: 40 }, transform: { x: -100, y: 0 }, stack: [{ id: 'fix', type: 'rigidbody', params: { immovable: true } }] },
        { kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 60, height: 60 }, transform: { x: 100, y: 0 }, stack: [] },
      ],
    }],
  };
  it('a growing body pushes the one it reaches', () => {
    const e = createEngine(builtins);
    let box = centre(e, s, 0, 'box');
    for (let f = 1; f <= 45; f++) box = centre(e, s, f / 30, 'box');
    // At 1.5 s the bar's right end is at -100 + 255 = 155: the box (60 wide) is pushed past it.
    expect(box!.x).toBeGreaterThan(150);
  });
});

describe('Rigid Body pin', () => {
  // A bar pinned by its left end, under gravity: it swings down about that end, which stays put.
  const s = (pin: boolean): SceneV1 => ({
    version: 1,
    animation: { duration: 3, fps: 30, tracks: [] },
    objects: [{
      kind: 'group', id: 'g', name: 'World',
      stack: [{ id: 'ph', type: 'physics', params: { time: { $expr: 'scene.time', fallback: 0 }, acceleration: [0, 600], bounce: 0 } }],
      children: [{ kind: 'shape', id: 'bar', name: 'Bar', shape: 'rectangle', params: { width: 200, height: 20 }, transform: { x: 100, y: 0 }, stack: [{ id: 'rb', type: 'rigidbody', params: { pin, pinPoint: [0, 0.5] } }] }],
    }],
  });
  const ends = (e: ReturnType<typeof createEngine>, scene: SceneV1, t: number) => {
    const pts = e.evaluateDocument({ ...sampleScene(scene, t), at: t }).geometry.shapes.flatMap((x) => x.subpaths.flatMap((p) => [p.start, ...p.segs.map((q) => q.p)]));
    return pts;
  };
  it('the pinned point stays, the rest swings down', () => {
    const e = createEngine(builtins);
    let pts = ends(e, s(true), 0);
    for (let f = 1; f <= 30; f++) pts = ends(e, s(true), f / 30);
    // Some point of the bar is still near the pin (0, 0); the far end has swung down, about 200 from it.
    expect(Math.min(...pts.map(([x, y]) => Math.hypot(x, y)))).toBeLessThan(12);
    const far = pts.reduce((a, b) => (Math.hypot(...b) > Math.hypot(...a) ? b : a));
    expect(Math.hypot(...far)).toBeLessThan(215);
    expect(far[1]).toBeGreaterThan(100);
  });
  it('without the pin it just falls', () => {
    const e = createEngine(builtins);
    let pts = ends(e, s(false), 0);
    for (let f = 1; f <= 30; f++) pts = ends(e, s(false), f / 30);
    expect(Math.min(...pts.map(([, y]) => y))).toBeGreaterThan(200);
  });
});
