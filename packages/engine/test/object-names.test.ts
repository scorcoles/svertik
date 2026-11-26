import { describe, expect, it } from 'vitest';
import { builtins, createEngine, evaluateSceneExpressions, renameReferences, sceneNames, systemName, validateExpression, type SceneV1 } from '../src/index';

const E = (expr: string, fallback = 0) => ({ $expr: expr, fallback });
const scene = (): SceneV1 => ({
  version: 1,
  custom: { follow: E('scene.object.esfera_roja_copia.x * 2', -1) },
  objects: [
    { kind: 'shape', id: 'a', name: 'Esféra Roja copia', shape: 'donut', params: { radius: 100 }, transform: { x: E('scene.time * 10') }, stack: [
      { id: 'g', type: 'clone', name: 'Grid', params: { mode: 'grid' }, children: [] },
      { id: 'e', type: 'each', params: {}, children: [{ id: 't', type: 'transform', params: { rotation: 30 } }] },
    ] },
    { kind: 'shape', id: 'b', name: 'Follower', shape: 'ellipse', params: { width: E('scene.object.esfera_roja_copia.radius / 2'), height: E('scene.object.esfera_roja_copia.each.transform.rotation') },
      transform: { y: E('scene.object.esfera_roja_copia.x + scene.object.follower.width') }, stack: [] },
    { kind: 'shape', id: 'c', name: 'Follower', shape: 'ellipse', params: { width: E('scene.custom.follow') }, stack: [] },
  ],
} as SceneV1);
const node = (s: SceneV1, id: string) => s.objects.find((o) => o.id === id) as unknown as { params: Record<string, number>; transform: Record<string, number> };

describe('system names', () => {
  it('turn display names into names formulas can use', () => {
    expect(systemName('Esféra Roja copia')).toBe('esfera_roja_copia');
    expect(systemName('  3D  Ñandú!! ')).toBe('_3d_nandu');
    expect(systemName('***', 'shape')).toBe('shape');
  });
  it('name objects scene-wide and effects within their stack, telling repeats apart in order', () => {
    const names = sceneNames(scene());
    expect([...names.nodes.values()]).toEqual(['esfera_roja_copia', 'follower', 'follower_2']);
    expect(names.modifiers.get('g')).toBe('esfera_roja_copia.grid');
    expect(names.modifiers.get('t')).toBe('esfera_roja_copia.each.transform');
  });
});

describe('scene.object.*', () => {
  it('parses a path of at least an object and a value', () => {
    expect(validateExpression('scene.object.esfera.grid.each.rotation')).toBeNull();
    expect(validateExpression('scene.object.esfera')).toMatch(/scene\.object/);
  });
  it('reads other objects, their effects (nested) and defaults, resolving chains between them', () => {
    const out = evaluateSceneExpressions({ ...scene(), at: 2 }, { defaults: (owner, type) => (owner === 'shape' && type === 'donut' ? { radius: 80, innerRadius: 45 } : undefined) });
    expect(node(out, 'b').params).toMatchObject({ width: 50, height: 30 });
    // y reads the object's x (a formula) and its own width (another formula): passes settle it.
    expect(node(out, 'b').transform.y).toBe(20 + 50);
    // Document variables can read objects too.
    expect(node(out, 'c').params.width).toBe(40);
  });
  it('works through the engine, and an unknown path uses the fallback', () => {
    const s: SceneV1 = { version: 1, objects: [
      { kind: 'shape', id: 'a', name: 'A', shape: 'ellipse', params: { width: E('scene.object.b.width + 10', 7), height: 10 }, stack: [] },
      { kind: 'shape', id: 'b', name: 'B', shape: 'ellipse', params: { height: 10 }, stack: [] },
    ] } as SceneV1;
    const box = createEngine(builtins).evaluateDocument(s).nodes.get('a')!.bounds;
    expect(box.width).toBeCloseTo(150);  // B's width left at its default (140)
    const missing = evaluateSceneExpressions({ ...s, objects: [{ ...s.objects[0]!, params: { width: E('scene.object.nobody.x', 7) } } as SceneV1['objects'][0]] });
    expect(node(missing, 'a').params.width).toBe(7);
  });
});

describe('renaming keeps references', () => {
  it('rewrites object and effect paths in every formula', () => {
    const s = scene();
    const before = sceneNames(s);
    s.objects[0]!.name = 'Bola';
    (s.objects[0]!.stack[0] as { name?: string }).name = 'Rejilla';
    const n = renameReferences(s, before, sceneNames(s));
    expect(n).toBe(4);
    expect(node(s, 'b').params).toMatchObject({ width: { $expr: 'scene.object.bola.radius / 2' }, height: { $expr: 'scene.object.bola.each.transform.rotation' } });
    expect((s.custom!.follow as { $expr: string }).$expr).toBe('scene.object.bola.x * 2');
    // Another object whose name starts the same is left alone.
    expect((node(s, 'b').transform.y as unknown as { $expr: string }).$expr).toBe('scene.object.bola.x + scene.object.follower.width');
  });
});
