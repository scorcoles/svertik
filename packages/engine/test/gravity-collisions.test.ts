import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, mapPoints, onlyFor, validateScene, type Geometry, type SceneV1, type Vec2 } from '../src';
import { collisionBody, fallWorld, physicsWorld } from '../src/modifiers/gravity-collisions';

const stacked = '<svg viewBox="0 0 40 110"><rect width="40" height="40"/><rect y="70" width="40" height="40"/></svg>';
const input = (time: number, collisions = true) => ({ source: stacked, stack: [{ id: 'g', type: 'gravity', params: { time, collisions, bounce: 0, friction: 0.8, floor: [0.5, 1.5] } }] });
const parts = (geo: Geometry) => geo.shapes.map((shape) => bounds({ ...geo, shapes: [shape] })).sort((a, b) => a.y - b.y);

function targetScene(targetSource: string, time = 5): SceneV1 {
  return {
    version: 1, document: { width: 400, height: 400 },
    objects: [
      { kind: 'shape', id: 'falling', name: 'Falling', shape: 'rectangle', params: { width: 20, height: 20 }, transform: { y: -100 }, stack: [{ id: 'fall', type: 'gravity', params: { time, solids: ['solid'], floor: [0.5, 30], bounce: 0, friction: 1 } }] },
      { kind: 'object', id: 'solid', name: 'Solid', source: targetSource, stack: [] },
    ],
  };
}
const platform = '<svg viewBox="-100 -10 200 20"><path d="M-100 -10H100V10H-100Z"/></svg>';

/** Total area of a collider's convex parts. */
const partsArea = (parts: ReadonlyArray<ReadonlyArray<ArrayLike<number>>>) =>
  parts.reduce((sum, points) => sum + Math.abs(points.reduce((a, p, i) => {
    const q = points[(i + 1) % points.length]!;
    return a + p[0]! * q[1]! - p[1]! * q[0]!;
  }, 0)) / 2, 0);

describe('gravity collisions', () => {
  it('stacks two pieces rather than letting them overlap', () => {
    const e = createEngine(builtins);
    const boxes = parts(e.evaluateStack(input(5)));
    expect(boxes[0]!.y + boxes[0]!.height).toBeLessThanOrEqual(boxes[1]!.y + 1);
    expect(boxes[1]!.y + boxes[1]!.height).toBeCloseTo(165, 0);
    const separate = parts(e.evaluateStack(input(5, false)));
    expect(Math.abs(separate[0]!.y - separate[1]!.y)).toBeLessThan(1);
  });
  it('transfers linear momentum in an elastic head-on collision', () => {
    const e = createEngine(builtins);
    const base = e.evaluateStack({ source: '<svg viewBox="-20 -20 40 40"><rect x="-20" y="-20" width="40" height="40"/></svg>', stack: [] });
    const make = (x: number, vx: number) => {
      const geo = mapPoints(base, ([px, py]) => [px + x, py]);
      geo.shapes[0]!.impulse = { velocity: [vx, 0], spin: 0 };
      return collisionBody(geo)!;
    };
    const world = { bodies: [make(-60, 100), make(60, -100)] };
    const poses = fallWorld(world, [0, 1000], 0, 0, 0.8, 0, 1, true);
    expect(poses[0]!.x).toBeLessThan(-40);
    expect(poses[1]!.x).toBeGreaterThan(40);
    expect(poses[0]!.x + poses[1]!.x).toBeCloseTo(0, 6);
  });
  it('contacts never add energy: fracture pieces hitting a ring', () => {
    const e = createEngine(builtins);
    const scene = (objects: SceneV1['objects']): SceneV1 => ({ version: 1, objects });
    const star = e.evaluateDocument(scene([{ kind: 'shape', id: 's', name: 'Star', shape: 'star', params: { radius: 124, points: 5, inner: 0.45, fill: true }, transform: { x: 111.2, y: 84.66 },
      stack: [{ id: 'c', type: 'crack', params: { growth: 0.4, length: 1.23, width: 0, impact: [0.497, 0.563], seed: 1 } }] }])).geometry;
    const ring = e.evaluateStack({ source: '<svg viewBox="-376 -376 752 752"><path fill-rule="evenodd" d="M-376 0A376 376 0 1 0 376 0A376 376 0 1 0 -376 0ZM-294 0A294 294 0 1 0 294 0A294 294 0 1 0 -294 0Z"/></svg>', stack: [] });
    const pieces = [...new Set(star.shapes.map((sh) => sh.clone))].map((clone) => {
      const geo = { ...star, shapes: star.shapes.filter((sh) => sh.clone === clone).map((sh) => ({ ...sh, impulse: { velocity: [132, -588] as Vec2, spin: 0 } })) };
      return collisionBody(geo, undefined, false, 4.5, true)!;
    });
    expect(pieces.length).toBeGreaterThan(2);
    const world = { bodies: [...pieces, collisionBody(ring, undefined, true, 4.5, true)!] };
    const energy = () => {
      const states = (world as unknown as { replay: { latest: { states: { vx: number; vy: number; omega: number }[] } } }).replay.latest.states;
      return world.bodies.reduce((sum, { body, fixed }, i) => fixed ? sum : sum + body.mass * (states[i]!.vx ** 2 + states[i]!.vy ** 2 + body.inertia * states[i]!.omega ** 2), 0);
    };
    physicsWorld(world, [0, 0], 0, 0, 1, true);
    const start = energy();
    for (const t of [0.5, 1, 2]) {
      physicsWorld(world, [0, 0], t, 0, 1, true);
      expect(energy()).toBeLessThanOrEqual(start * (1 + 1e-6));
    }
  });
  it('uses the selected target as a fixed solid in owner coordinates', () => {
    const scene = targetScene(platform);
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
    const result = createEngine(builtins).evaluateDocument(scene);
    const b = result.nodes.get('falling')!.box;
    expect(b.y + b.height).toBeCloseTo(-10, 0);
    expect(result.nodes.get('solid')!.box).toEqual({ x: -100, y: -10, width: 200, height: 20 });
  });
  it('collides with more than one selected solid', () => {
    const scene: SceneV1 = { version: 1, objects: [
      { kind: 'group', id: 'pieces', name: 'Pieces', children: [-60, 60].map((x, i) => ({ kind: 'shape', id: `piece-${i}`, name: 'Piece', shape: 'rectangle', params: { width: 20, height: 20 }, transform: { x, y: -100 }, stack: [] })), stack: [{ id: 'gravity', type: 'gravity', params: { time: 4, bounce: 0, solids: ['left', 'right'], floor: [0.5, 30] } }] },
      ...[-60, 60].map((x, i): SceneV1['objects'][number] => ({ kind: 'shape', id: i ? 'right' : 'left', name: 'Platform', shape: 'rectangle', params: { width: 50, height: 10 }, transform: { x, y: i * 50 }, stack: [] })),
    ] };
    expect(validateScene(scene)).toEqual({ errors: [], warnings: [] });
    const geo = createEngine(builtins).evaluateDocument(scene).geometryOf('pieces')!;
    const boxes = parts(geo).sort((a, b) => a.x - b.x);
    expect(boxes[0]!.y + boxes[0]!.height).toBeCloseTo(-5, 0);
    expect(boxes[1]!.y + boxes[1]!.height).toBeCloseTo(45, 0);
  });
  it('Gravity uses only the exterior perimeter of a solid, filling internal holes', () => {
    const scene = targetScene('<svg viewBox="-100 -10 200 20"><path fill-rule="evenodd" d="M-100 -10H100V10H-100Z M-30 -6H30V6H-30Z"/></svg>');
    const box = createEngine(builtins).evaluateDocument(scene).nodes.get('falling')!.box;
    expect(box.y + box.height).toBeCloseTo(-10, 0);
    const geometry = createEngine(builtins).evaluateStack({ source: (scene.objects[1] as { source: string }).source, stack: [] });
    const collider = collisionBody(geometry)!;
    expect(collider.parts).toHaveLength(1);
    expect(partsArea(collider.parts)).toBeCloseTo(4000, 5);
  });

  it('Physics keeps interior holes as open space (a hollow shape can contain bodies)', () => {
    const geometry = createEngine(builtins).evaluateStack({ source: '<svg viewBox="-100 -10 200 20"><path fill-rule="evenodd" d="M-100 -10H100V10H-100Z M-30 -6H30V6H-30Z"/></svg>', stack: [] });
    const collider = collisionBody(geometry, undefined, false, undefined, true)!;
    // The frame around the hole is split into convex parts; their area is the bar minus the hole.
    expect(collider.parts.length).toBeGreaterThan(1);
    expect(partsArea(collider.parts)).toBeCloseTo(200 * 20 - 60 * 12, 5);
    // No part covers the middle of the hole.
    const covers = (points: [number, number][], [x, y]: [number, number]) => {
      let odd = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i]!, [xj, yj] = points[j]!;
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
      }
      return odd;
    };
    expect(collider.parts.some((p) => covers(p as [number, number][], [0, 0]))).toBe(false);
  });

  it('ejects a piece that begins inside a convex letter outline instead of trapping it on a seam', () => {
    const e = createEngine(builtins);
    const small = e.evaluateStack({ source: '<svg viewBox="-10 -10 20 20"><rect x="-10" y="-10" width="20" height="20"/></svg>', stack: [] });
    small.shapes[0]!.impulse = { velocity: [50, 0], spin: 0 };
    const solid = e.evaluateStack({ source: '<svg viewBox="-50 -50 100 100"><circle r="50"/></svg>', stack: [] });
    const proxy = collisionBody(solid, undefined, true)!;
    expect(proxy.parts).toHaveLength(1);
    const world = { bodies: [collisionBody(small)!, proxy] };
    const pose = fallWorld(world, [0, 500], 0, 10, 2, 0.7, 0, false)[0]!;
    expect(Math.hypot(pose.x, pose.y)).toBeGreaterThan(50);
  });
  it('keeps gaps between separate exterior contours open', () => {
    const scene = targetScene('<svg viewBox="-100 -10 200 20"><path d="M-100 -10H-30V10H-100Z M30 -10H100V10H30Z"/></svg>');
    const box = createEngine(builtins).evaluateDocument(scene).nodes.get('falling')!.box;
    expect(box.y).toBeGreaterThan(100);
  });
  it('contacts a rotated and translated solid rather than its bounding box', () => {
    const scene = targetScene(platform, 6);
    scene.objects[1]!.transform = { x: 20, y: 60, rotation: 25 };
    const result = createEngine(builtins).evaluateDocument(scene);
    const geo = result.geometryOf('falling')!;
    const angle = 25 * Math.PI / 180, normal: Vec2 = [-Math.sin(angle), Math.cos(angle)];
    const distances = geo.shapes.flatMap((s) => s.subpaths.flatMap((p) => [p.start, ...p.segs.map((s) => s.p)]).map(([x, y]) => (x - 20) * normal[0] + (y - 60) * normal[1]));
    expect(Math.max(...distances)).toBeLessThan(-9);
    expect(result.nodes.get('falling')!.box.y).toBeLessThan(80);
  });
  it('cached seeks match a fresh world and target changes invalidate it', () => {
    const hot = createEngine(builtins);
    for (const time of [4, 0.237, 2.718, 5]) expect(hot.evaluateStack(input(time))).toEqual(createEngine(builtins).evaluateStack(input(time)));
    for (const y of [0, 60, -30]) {
      const scene = targetScene(platform);
      scene.objects[1]!.transform = { y };
      expect(hot.evaluateDocument(scene).nodes.get('falling')!.box).toEqual(createEngine(builtins).evaluateDocument(scene).nodes.get('falling')!.box);
    }
  });
  it('validates multiple references and keeps selected solids in reduced scenes', () => {
    const scene = targetScene(platform);
    expect(onlyFor(scene, 'falling').objects.map((n) => n.id)).toContain('solid');
    scene.objects[0]!.stack[0]!.params!.solids = ['solid', 'missing'];
    expect(validateScene(scene).warnings.join(' ')).toContain('missing');
    scene.objects[0]!.stack[0]!.params!.solids = 'solid';
    expect(validateScene(scene).errors.join(' ')).toContain('array of node ids');
  });
});
