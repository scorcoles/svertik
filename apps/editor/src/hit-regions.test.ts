import { describe, expect, it } from 'vitest';
import { builtins, createEngine, type SceneV1 } from '@svertik/engine';
import { hatchObjectAt } from './hit-regions';

describe('hatching interaction region', () => {
  const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'rect', name: 'Rectangle', shape: 'rectangle', params: { width: 100, height: 100, fill: true, fillColor: '#000000' }, stack: [{ id: 'h', type: 'crosshatch', params: { spacing: 20, angle: 0, layers: 1 } }] }] };
  it('selects the object between threads, rather than requiring a stroke hit', () => {
    const doc = createEngine(builtins).evaluateDocument(scene);
    expect(hatchObjectAt(scene, doc.geometry, doc.nodes, 0, 3)).toBe('rect');
    expect(hatchObjectAt(scene, doc.geometry, doc.nodes, 80, 3)).toBeNull();
  });
  it('uses the moved output region, not the source location', () => {
    const s = structuredClone(scene);
    s.objects[0]!.stack.push({ id: 'move', type: 'transform', params: { x: 200 } });
    const doc = createEngine(builtins).evaluateDocument(s);
    expect(hatchObjectAt(s, doc.geometry, doc.nodes, 200, 3)).toBe('rect');
    expect(hatchObjectAt(s, doc.geometry, doc.nodes, 0, 3)).toBeNull();
  });
  it('keeps ordinary unfilled path selection unchanged', () => {
    const s = structuredClone(scene); s.objects[0]!.stack = [];
    const doc = createEngine(builtins).evaluateDocument(s);
    expect(hatchObjectAt(s, doc.geometry, doc.nodes, 0, 3)).toBeNull();
  });
});
