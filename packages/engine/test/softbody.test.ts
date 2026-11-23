import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, validateScene, type SceneV1 } from '../src';

const line = '<svg viewBox="-80 -80 160 160"><path d="M-80 0H80" fill="none" stroke="#111111" stroke-width="2"/></svg>';
const square = '<svg viewBox="-40 -40 80 80"><rect x="-40" y="-40" width="80" height="80" fill="#09fdd1"/></svg>';
const materialKeys = new Set(['mode', 'stiffness', 'bending', 'volume', 'damping', 'pins', 'segments']);
const run = (source: string, params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source, stack: [
  { id: 's', type: 'softbody', params: Object.fromEntries(Object.entries(params).filter(([k]) => materialKeys.has(k))) },
  { id: 'g', type: 'gravity', params: Object.fromEntries(Object.entries(params).filter(([k]) => !materialKeys.has(k))) },
] });

describe('Soft Body', () => {
  it('warns when material is assigned after the simulation, including inside Range', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'cross', name: 'Cross', shape: 'cross', params: {}, stack: [
      { id: 'fall', type: 'gravity', params: {} },
      { id: 'range', type: 'range', params: { selector: 'even' }, children: [{ id: 'material', type: 'softbody', params: {} }] },
    ] }] };
    expect(validateScene(scene).warnings.some((w) => w.includes('Soft Body is after'))).toBe(true);
    scene.objects[0]!.stack.reverse();
    expect(validateScene(scene).warnings.some((w) => w.includes('Soft Body is after'))).toBe(false);
  });
  it('is consumed by a Physics group, whose acceleration and collisions remain the controls', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'group', id: 'world', name: 'Physics world', stack: [{ id: 'physics', type: 'physics', params: { time: 1.8, acceleration: [0, 100], bounce: 0, friction: 0.4 } }], children: [
      { kind: 'shape', id: 'box', name: 'Elastic box', shape: 'rectangle', params: { width: 40, height: 40, fill: true }, stack: [{ id: 'material', type: 'softbody', params: { stiffness: 0.3, damping: 0.2 } }] },
      { kind: 'shape', id: 'floor', name: 'Immovable floor', shape: 'rectangle', params: { width: 300, height: 20, fill: true }, transform: { y: 100 }, stack: [{ id: 'fixed', type: 'rigidbody', params: { immovable: true } }] },
    ] }] };
    expect(validateScene(scene).errors).toEqual([]);
    const geo = createEngine(builtins).evaluateDocument(scene).geometry;
    const box = bounds({ ...geo, shapes: geo.shapes.filter((s) => s.node === 'box') });
    expect(box.y).toBeGreaterThan(30);
    expect(box.y + box.height).toBeLessThan(91);
    const floor = bounds({ ...geo, shapes: geo.shapes.filter((s) => s.node === 'floor') });
    expect(floor.y).toBeCloseTo(90, 5);
  });
  it('only adds material metadata, with no motion or force controls', () => {
    const engine = createEngine(builtins);
    const original = engine.evaluateStack({ source: square, stack: [] });
    const material = engine.evaluateStack({ source: square, stack: [{ id: 's', type: 'softbody', params: { stiffness: 0.3 } }] });
    expect(material.shapes[0]!.subpaths).toEqual(original.shapes[0]!.subpaths);
    expect(material.shapes[0]!.softBody?.stiffness).toBe(0.3);
    const definition = builtins.find((m) => m.type === 'softbody')!;
    expect(Object.keys(definition.params)).not.toEqual(expect.arrayContaining(['time', 'gravity', 'floor', 'solids']));
    for (const name of ['time', 'gravity', 'floor', 'solids', 'bounce']) expect(Object.keys(definition.params)).not.toContain(name);
  });

  it('bends a fibre between fixed ends and preserves its paint', () => {
    const geo = run(line, { time: 1, pins: 'ends', stiffness: 0.8, bending: 0.05, gravity: 1, floor: [0.5, 10] });
    const path = geo.shapes[0]!.subpaths[0]!;
    expect(path.start).toEqual([-80, 0]);
    expect(path.segs.at(-1)!.p).toEqual([80, 0]);
    expect(Math.max(...path.segs.map((s) => s.p[1]))).toBeGreaterThan(10);
    expect(geo.shapes[0]!.style.stroke).toBe('#111111');
    expect(geo.shapes[0]!.style.fill).toBe('none');
  });

  it('deforms briefly at impact and quickly recovers like firm rubber', () => {
    const settings = { stiffness: 0.2, volume: 0.5, damping: 0.1, bounce: 0 };
    const geo = run(square, { ...settings, time: 1.06 });
    const box = bounds(geo);
    expect(geo.shapes[0]!.subpaths[0]!.closed).toBe(true);
    expect(box.y + box.height).toBeLessThanOrEqual(80.001);
    expect(box.width).toBeGreaterThan(80);
    expect(box.height).toBeLessThan(80);
    expect(box.height).toBeGreaterThan(5);
    const recovered = bounds(run(square, { ...settings, time: 1.7 }));
    expect(recovered.width).toBeCloseTo(80, 1);
    expect(recovered.height).toBeCloseTo(80, 1);
    for (const shape of geo.shapes) for (const sp of shape.subpaths) for (const seg of sp.segs) for (const q of [seg.c1, seg.c2, seg.p]) expect(q.every(Number.isFinite)).toBe(true);
  });

  it('damps internal deformation without slowing the translation of a falling body', () => {
    const loose = bounds(run(square, { time: 0.3, damping: 0, floor: [0.5, 10] }));
    const damped = bounds(run(square, { time: 0.3, damping: 0.95, floor: [0.5, 10] }));
    expect(damped.y).toBeCloseTo(loose.y, 6);
    expect(damped.height).toBeCloseTo(loose.height, 6);
  });

  it('preserves its rest pose without gravity or an impulse', () => {
    const before = bounds(createEngine(builtins).evaluateStack({ source: square, stack: [] }));
    const after = bounds(run(square, { time: 2, gravity: 0 }));
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(after[key]).toBeCloseTo(before[key], 6);
  });

  it('collides with a thin hidden Solid instead of tunnelling through it', () => {
    const scene: SceneV1 = { version: 1, objects: [
      { kind: 'object', id: 'fiber', name: 'Fiber', source: line, stack: [
        { id: 'launch', type: 'rigidbody', params: { velocity: [0, 3000] } },
        { id: 'soft', type: 'softbody', params: { damping: 0, stiffness: 1, bending: 1 } },
        { id: 'fall', type: 'gravity', params: { time: 0.1, gravity: 0, bounce: 0, solids: ['solid'], floor: [0.5, 100] } },
      ] },
      { kind: 'shape', id: 'solid', name: 'Solid', visible: false, shape: 'rectangle', params: { width: 400, height: 2, fill: true }, transform: { y: 50 }, stack: [] },
    ] };
    expect(validateScene(scene).errors).toEqual([]);
    const box = bounds(createEngine(builtins).evaluateDocument(scene).geometry);
    expect(box.y + box.height).toBeLessThan(49.1);
    expect(box.y).toBeGreaterThan(45);
  });

  it('is deterministic when seeking backwards and between fractional frames', () => {
    const scene = (time: number): SceneV1 => ({ version: 1, objects: [{ kind: 'object', id: 'box', name: 'Box', source: square, stack: [{ id: 'soft', type: 'softbody', params: { stiffness: 0.4 } }, { id: 'fall', type: 'gravity', params: { time, bounce: 0.3 } }] }] });
    const engine = createEngine(builtins);
    engine.evaluateDocument(scene(0.233)); engine.evaluateDocument(scene(2.413)); engine.evaluateDocument(scene(0.118));
    expect(engine.toSVG(scene(2.413))).toBe(createEngine(builtins).toSVG(scene(2.413)));
  });
});
