import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, sampleScene, validateScene, compositionTime, sceneDuration, type GroupNode, type SceneV1 } from '../src';
import { prepareScene } from '../src/prepare';

const inner = (): SceneV1 => ({ version: 1, document: { width: 300, height: 200 }, animation: { duration: 4, tracks: [
  { id: 'move', node: 'box', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 4, value: 80 }] },
] }, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 20, height: 20 }, stack: [] }] });
const comp = (id: string, scene = inner(), params: Record<string, unknown> = {}): GroupNode => ({ kind: 'group', id, name: id, children: [], stack: [], composition: { scene, params } });
const engine = createEngine(builtins);
const root = (...objects: GroupNode[]): SceneV1 => ({ version: 1, objects });
const at = (s: SceneV1, t: number) => engine.evaluateDocument(sampleScene(s, t));

describe('Compositions', () => {
  it('samples independent clocks with isolated IDs and black-box selection', () => {
    const a = comp('a'), b = comp('b', inner(), { speed: 0.5 }); b.transform = { y: 100 };
    const s = root(a, b); expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
    const doc = at(s, 2);
    expect(bounds(doc.geometryOf('a')!).x).toBeCloseTo(30);
    expect(bounds(doc.geometryOf('b')!).x).toBeCloseTo(10);
    expect(new Set(doc.geometry.shapes.map(s => s.node))).toEqual(new Set(['a', 'b']));
    expect(sceneDuration(s)).toBe(8);
    expect(at(s, 0).geometry).not.toEqual(doc.geometry);
    expect(at(s, 2).geometry).toEqual(doc.geometry);
  });
  it('does not collide with parent IDs that resemble an internal namespace', () => {
    const s = root(comp('a'), comp('1:a::box'));
    const doc = at(s, 1);
    expect(doc.geometry.shapes).toHaveLength(2);
    expect(doc.nodes.get('1:a::box')!.kind).toBe('group');
    expect(new Set(doc.geometry.shapes.map(s => s.node))).toEqual(new Set(['a', '1:a::box']));
  });
  it('supports start, offset, reverse, looping, pingpong and freezing', () => {
    expect(compositionTime(1, 4, { start: 2 })).toBe(0);
    expect(compositionTime(3, 4, { start: 2, speed: 2, offset: 1 })).toBe(3);
    expect(compositionTime(1, 4, { reverse: true })).toBe(3);
    expect(compositionTime(5, 4, { loop: 'loop' })).toBe(1);
    expect(compositionTime(5, 4, { loop: 'pingpong' })).toBe(3);
    expect(compositionTime(100, 4, { speed: 0, offset: 2 })).toBe(2);
    expect(compositionTime(1, 4, { speed: -1, offset: 4 })).toBe(3);
  });
  it('uses the local clock for expressions, nested compositions and time effects', () => {
    const local = inner(); local.animation!.tracks = [];
    local.objects[0]!.stack = [{ id: 'transform', type: 'transform', params: { x: { $expr: 'scene.time * 20', fallback: 0 } } }];
    const nested = root(comp('inside', local, { speed: 2 })); nested.animation = { duration: 4, tracks: [] };
    const doc = at(root(comp('outer', nested, { speed: 0.5 })), 2);
    expect(bounds(doc.geometry).x).toBeCloseTo(30);
  });
  it('keeps mask/instance references local and filters valid', () => {
    const local = inner(); local.animation!.tracks = [];
    local.objects[0]!.stack = [{ id: 'mask', type: 'mask', params: { source: 'window' } }, { id: 'blur', type: 'blur', params: { amount: 2 } }];
    local.objects.push({ kind: 'shape', id: 'window', name: 'Window', shape: 'ellipse', params: { width: 10, height: 10 }, visible: false, stack: [] });
    const s = root(comp('a', local), comp('b', structuredClone(local)));
    const svg = engine.toSVG(s);
    expect(svg).toContain('a::box--mask'); expect(svg).toContain('b::box--mask');
    expect(svg).toContain('<feGaussianBlur');
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
  });
  it('validates nested scopes, rejects cycles, and loads only required effects', async () => {
    const local = inner(); local.objects[0]!.stack = [{ id: 'wiggle', type: 'wiggle', params: { time: { $expr: 'scene.time', fallback: 0 } }, children: [{ id: 'shift', type: 'transform', params: { x: 5 } }] }];
    const s = root(comp('a', local));
    const minimal = createEngine(await prepareScene(s));
    expect(minimal.evaluateDocument(sampleScene(s, 1)).geometry).toEqual(at(s, 1).geometry);
    const cyclic = root(); cyclic.objects.push(comp('cycle', cyclic));
    expect(validateScene(cyclic).errors.join()).toContain('cyclic');
    local.objects[0]!.stack[0]!.type = 'unknown';
    expect(validateScene(s).errors.join()).toContain('unknown');
  });
  it('uses local time for particles and gravity, including reverse seeking', () => {
    const local = inner(); local.animation!.tracks = [];
    local.objects[0]!.stack = [
      { id: 'particles', type: 'particles', params: { count: 8, speed: 0.2, gravity: 0, time: { $expr: 'scene.time', fallback: 0 } } },
      { id: 'gravity', type: 'gravity', params: { time: { $expr: 'scene.time', fallback: 0 }, gravity: 1 } },
    ];
    const s = root(comp('physics', local, { speed: 0.5 }));
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
    for (const t of [0.2, 1, 0.6]) expect(bounds(at(s, t * 2).geometry)).toEqual(bounds(at(local, t).geometry));
  });
  it('keyframes the local clock for forward playback, a hold and reverse seeking', () => {
    const s = root(comp('a', inner(), { time: 0 }));
    s.animation = { duration: 4, tracks: [{ id: 'remap', node: 'a', on: 'composition', param: 'time', keys: [
      { t: 0, value: 0, ease: 'linear' }, { t: 1, value: 2, ease: 'hold' },
      { t: 2, value: 2, ease: 'linear' }, { t: 3, value: 0 },
    ] }] };
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
    expect(bounds(at(s, 0.5).geometry).x).toBeCloseTo(10);
    expect(at(s, 1).geometry).toEqual(at(s, 1.9).geometry);
    expect(at(s, 2.5).geometry).toEqual(at(s, 0.5).geometry);
    expect(at(s, 3).geometry).toEqual(at(s, 0).geometry);
  });
  it('quantizes the local clock while retaining the exact final frame', () => {
    expect(compositionTime(0.21, 3, { frameRate: 6 })).toBeCloseTo(1 / 6);
    expect(compositionTime(0.29, 3, { frameRate: 6 })).toBeCloseTo(1 / 6);
    expect(compositionTime(4, 3.1, { frameRate: 6 })).toBe(3.1);
    const s = root(comp('a', inner(), { frameRate: 6 }));
    expect(at(s, 0.21).geometry).toEqual(at(s, 0.29).geometry);
  });
  it('modulates clocks with shared signals before quantization, deterministically', () => {
    const sine = { type: 'oscillate' as const, params: { frequency: 1, amplitude: 0.5 } };
    expect(compositionTime(0.25, 4, {}, sine)).toBeCloseTo(0.75);
    expect(compositionTime(0.25, 4, { frameRate: 2 }, sine)).toBe(0.5);
    expect(compositionTime(0.25, 4, {}, { ...sine, enabled: false })).toBe(0.25);
    const n = comp('a'); n.composition!.modulation = { type: 'wiggle', params: { amplitude: 0.2, seed: 3 } };
    const s = root(n); const first = at(s, 1).geometry; at(s, 3);
    expect(at(s, 1).geometry).toEqual(first);
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
  });
  it('provides a selectable frame for an empty composition', () => {
    const doc = at(root(comp('empty', { version: 1, objects: [], document: { width: 400, height: 300 } })), 1);
    expect(doc.nodes.get('empty')!.box).toEqual({ x: -200, y: -150, width: 400, height: 300 });
    expect(doc.geometry.shapes).toHaveLength(0);
  });
});
