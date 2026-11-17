import { describe, expect, it } from 'vitest';
import { builtins, createEngine, createMouseInstances, validateScene, type GroupNode, type SceneNode, type SceneV1 } from '../src';

const rect = (id: string, x = 0): SceneNode => ({ kind: 'shape', id, name: id, shape: 'rectangle', params: { width: 10, height: 10 }, transform: { x }, stack: [] });
const layer = (id: string, children: SceneNode[], extra: Partial<GroupNode> = {}): GroupNode => ({ kind: 'group', id, name: id, layer: true, children, stack: [], ...extra });
const scene = (objects: SceneNode[]): SceneV1 => ({ version: 1, document: { width: 200, height: 100 }, objects });

describe('layers', () => {
  it('a scene made of layers is valid and draws every visible layer', () => {
    const s = scene([layer('front', [rect('a', -20)]), layer('back', [rect('b', 20)])]);
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
    const svg = createEngine(builtins).toSVG(s);
    expect(svg.match(/<path/g)).toHaveLength(2);
  });

  it('a hidden layer is kept in the scene but not drawn or exported', () => {
    const s = scene([layer('front', [rect('a')]), layer('back', [rect('b')], { visible: false })]);
    const doc = createEngine(builtins).evaluateDocument(s);
    expect(doc.geometry.shapes.map((sh) => sh.node)).toEqual(['a']);
  });

  it('warns about top-level objects outside the layers', () => {
    const report = validateScene(scene([layer('l', [rect('a')]), rect('loose')]));
    expect(report.errors).toEqual([]);
    expect(report.warnings.join('\n')).toMatch(/"loose" is outside any layer/);
  });

  it('rejects nested layers', () => {
    const s = scene([layer('outer', [layer('inner', [rect('a')])])]);
    expect(validateScene(s).errors.join('\n')).toMatch(/"inner": a layer must be a top-level object/);
  });

  it('Mouse Instance copies stay in their layer, in front of its objects only', () => {
    const s = scene([
      layer('front', [rect('top')]),
      layer('back', [
        { kind: 'instance', id: 'mouse', name: 'Mouse', of: 'source', stack: [], mouse: {} },
        { ...rect('source'), visible: false },
      ]),
    ]);
    const m = createMouseInstances(s);
    m.event('click', [10, 10], 1);
    const frame = m.apply(s, 1);
    // Still two layers, in the same order; the copies went into "back".
    expect(frame.objects.map((n) => n.id)).toEqual(['front', 'back']);
    const back = frame.objects[1] as GroupNode;
    expect(back.children[0]!.id).toBe('mouse');
    expect((back.children[0] as GroupNode).children).toHaveLength(1);
  });
});
