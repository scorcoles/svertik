import { describe, expect, it } from 'vitest';
import { builtins, validateScene, type GroupNode, type SceneV1 } from '@svertik/engine';
import { Editor } from './editor.svelte';

const withShape = () => {
  const e = new Editor();
  e.addShape('rectangle');
  return e;
};
const ids = (e: Editor) => e.scene!.objects.map((n) => n.id);
const childIds = (l: GroupNode | null | undefined) => l?.children.map((n) => n.id) ?? [];

describe('layers', () => {
  it('a scene without layers is one implicit layer: the stack root is its objects', () => {
    const e = withShape();
    expect(e.layers).toEqual([]);
    expect(e.activeLayer).toBeNull();
    expect(e.root).toBe(e.scene!.objects);
  });

  it('the first new layer turns the existing objects into "Layer 1" and goes in front of it', () => {
    const e = withShape();
    const shape = e.scene!.objects[0]!.id;
    e.addLayer();
    expect(e.layers.map((l) => l.name)).toEqual(['Layer 2', 'Layer 1']);
    expect(childIds(e.layers[1])).toEqual([shape]);
    expect(e.activeLayer?.name).toBe('Layer 2');
    expect(e.root).toEqual([]);
    expect(validateScene(e.scene as SceneV1, builtins)).toEqual({ errors: [], warnings: [] });
  });

  it('new objects go to the active layer; selecting an object activates its layer', () => {
    const e = withShape();
    const first = e.scene!.objects[0]!.id;
    e.addLayer();
    e.addShape('ellipse');
    const second = e.selected!;
    expect(childIds(e.activeLayer)).toEqual([second]);
    e.selected = first;
    expect(e.activeLayer?.name).toBe('Layer 1');
    // Selecting a layer id activates it instead of selecting it.
    e.selected = e.layers[0]!.id;
    expect(e.activeLayer?.name).toBe('Layer 2');
    expect(e.selected).toBeNull();
  });

  it('a locked active layer refuses new objects; a hidden one is shown again', () => {
    const e = withShape();
    e.addLayer();
    const layer = e.activeLayer!;
    e.toggleLock(layer.id);
    e.addShape('ellipse');
    expect(layer.children).toHaveLength(0);
    expect(e.notice).toMatch(/locked/);
    e.toggleLock(layer.id);
    e.setLayerVisible(layer.id, false);
    expect(layer.visible).toBe(false);
    e.addShape('ellipse');
    expect(layer.children).toHaveLength(1);
    expect(layer.visible).toBeUndefined();
  });

  it('moves the selection to another layer in one undo step', () => {
    const e = withShape();
    const shape = e.scene!.objects[0]!.id;
    e.addLayer();
    const [front, back] = e.layers;
    e.selected = shape;
    e.moveSelectionToLayer(front!.id);
    expect(childIds(front)).toEqual([shape]);
    expect(childIds(back)).toEqual([]);
    expect(e.activeLayer?.id).toBe(front!.id);
    e.undo();
    expect(childIds(e.layers[1])).toEqual([shape]);
  });

  it('reorders layers and keeps the last one', () => {
    const e = withShape();
    e.addLayer();
    const before = ids(e);
    e.moveLayer(before[0]!, 1);
    expect(ids(e)).toEqual([before[1], before[0]]);
    e.removeLayer(before[0]!);
    expect(e.layers).toHaveLength(1);
    e.removeLayer(e.layers[0]!.id);
    expect(e.layers).toHaveLength(1);
  });

  it('select all takes only the active layer', () => {
    const e = withShape();
    e.addLayer();
    e.addShape('ellipse');
    e.addShape('star');
    e.selectAll();
    expect(e.selectedNodes).toHaveLength(2);
  });
});

describe('opening a scene with layers', () => {
  const layered = (n: number) => JSON.stringify({
    version: 1,
    objects: Array.from({ length: n }, (_, i) => ({ kind: 'group', id: `layer-${i}`, name: `Layer ${i + 1}`, layer: true, children: [{ kind: 'shape', id: `s-${i}`, name: 'S', shape: 'rectangle', params: {}, stack: [] }], stack: [] })),
  });
  it('shows the Layers panel, open, when the scene has more than two layers', () => {
    const e = new Editor();
    e.showLayers = false;
    e.layersOpen = false;
    expect(e.openProject(layered(3))).toBe(true);
    expect(e.showLayers).toBe(true);
    expect(e.layersOpen).toBe(true);
  });
  it('leaves it as it was with two layers or fewer', () => {
    const e = new Editor();
    e.showLayers = false;
    expect(e.openProject(layered(2))).toBe(true);
    expect(e.showLayers).toBe(false);
  });
});
