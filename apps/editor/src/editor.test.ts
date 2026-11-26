import { describe, expect, it } from 'vitest';
import { apply, placementOf, bounds, builtins, createEngine, validateScene, stripPackGeometry, type SceneV1 } from '@svertik/engine';
import { Editor, locateNode } from './editor.svelte';
import { samples } from './samples';

// The starting object (grid.svg); new things go at the top of the list, so it is the last one.
const stack = (e: Editor) => e.scene!.objects.at(-1)!.stack;

/** The box of what is drawn in the document, to check nothing moves. */
const box = (e: Editor) => bounds(createEngine(builtins).evaluateDocument(e.scene as SceneV1).geometry);

const fresh = () => {
  const e = new Editor();
  e.load(samples.grid, 'grid.svg');
  return e;
};

describe('Editor', () => {
  it('adds Voronoi already moving: Time follows scene.time and Drift is visible', () => {
    const e = new Editor();
    e.scene = { version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', stack: [], shape: 'rectangle', params: { width: 200, height: 120 } }] };
    e.selected = 'box';
    e.add('voronoi');
    const voronoi = e.scene!.objects[0]!.stack[0]!;
    expect(voronoi.type).toBe('voronoi');
    expect(voronoi.params!.time).toEqual({ $expr: 'scene.time', fallback: 1 });
    expect(voronoi.params!.drift).toBeGreaterThan(0);
  });
  it('groups a loose vector before adding Physics (it simulates the objects of a group)', () => {
    const e = new Editor();
    e.scene = { version: 1, objects: [{ kind: 'shape', id: 'ball', name: 'Ball', stack: [], shape: 'ellipse', params: { width: 40, height: 40 } }] };
    e.selected = 'ball';
    expect(e.canAdd('physics')).toBe(true);
    e.add('physics');
    const group = e.scene!.objects[0]!;
    expect(group.kind).toBe('group');
    expect(group.kind === 'group' && group.children.map((c) => c.id)).toEqual(['ball']);
    expect(group.stack.map((m) => m.type)).toEqual(['physics']);
    expect(e.notice).toMatch(/Grouped first/);
    expect(group.name).toBe('Physics');
    expect(group.kind === 'group' && group.children[0]!.stack.map((m) => m.type)).toEqual(['rigidbody']);
  });
  it('starts an empty Physics group when nothing is selected', () => {
    const e = new Editor();
    e.scene = { version: 1, objects: [{ kind: 'shape', id: 'ball', name: 'Ball', stack: [], shape: 'ellipse', params: { width: 40, height: 40 } }] };
    e.selected = null;
    e.add('physics');
    const group = e.scene!.objects[0]!;
    expect(group).toMatchObject({ kind: 'group', name: 'Physics', children: [] });
    expect(group.stack.map((m) => m.type)).toEqual(['physics']);
    expect(e.scene!.objects[1]!.id).toBe('ball');
  });
  it.each([false, true])('edits canvas position with moving parent pivots (nested: %s)', (nested) => {
    const e = new Editor();
    e.scene = {
      version: 1,
      objects: [{ kind: 'group', id: 'parent', name: 'Parent', stack: [], transform: { rotation: 65, scale: 1.8 }, children: [
        { kind: 'shape', id: 'child', name: 'Child', stack: [], shape: 'rectangle', params: { width: 80, height: 40 }, transform: { x: 30, y: 20 } },
        { kind: 'shape', id: 'sibling', name: 'Sibling', stack: [], shape: 'rectangle', params: { width: 20, height: 20 }, transform: { x: -90, y: 50 } },
      ] }],
    };
    if (nested) e.scene!.objects = [{ kind: 'group', id: 'outer', name: 'Outer', stack: [], transform: { rotation: -30, scale: 0.7 }, children: e.scene!.objects }];
    const engine = createEngine(builtins);
    for (const target of [[250, -130], [-300, 220], [0, 0]] as [number, number][]) {
      e.setNodePosition('child', target, 'world');
      const doc = engine.evaluateDocument(e.scene as SceneV1);
      const p = placementOf(locateNode(e.scene!.objects, 'child')!.node);
      const actual = apply(doc.nodes.get('parent')!.matrix, [p.x, p.y]);
      expect(actual[0]).toBeCloseTo(target[0], 5);
      expect(actual[1]).toBeCloseTo(target[1], 5);
    }
    e.setNodePosition('child', [12, 34]);
    expect(locateNode(e.scene!.objects, 'child')!.node.transform).toMatchObject({ x: 12, y: 34 });
    e.toggleLock('parent');
    e.setNodePosition('child', [99, 99], 'world');
    expect(locateNode(e.scene!.objects, 'child')!.node.transform).toMatchObject({ x: 12, y: 34 });
  });

  it('parents a node without moving it and follows the parent rotation', () => {
    const e = new Editor();
    e.addShape('rectangle', { width: 80, height: 60 }, { x: 30, y: 20 });
    const parent = e.selected!;
    e.addShape('cross', {}, { x: 150, y: 20 });
    const child = e.selected!;
    const engine = createEngine(builtins);
    const before = engine.evaluateDocument(e.scene as SceneV1).nodes.get(child)!.box;
    e.infos = engine.evaluateDocument(e.scene as SceneV1).nodes;
    e.moveNode(child, parent, 0);
    const after = engine.evaluateDocument(e.scene as SceneV1).nodes.get(child)!.box;
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    e.setNode(parent, 'rotation', 90);
    const rotated = engine.evaluateDocument(e.scene as SceneV1).nodes.get(child)!.box;
    expect(rotated.x).not.toBeCloseTo(after.x);
    expect(rotated.y).not.toBeCloseTo(after.y);
    e.infos = engine.evaluateDocument(e.scene as SceneV1).nodes;
    e.moveNode(child, null, 0);
    const unparented = engine.evaluateDocument(e.scene as SceneV1).nodes.get(child)!.box;
    expect(unparented.x).toBeCloseTo(rotated.x);
    expect(unparented.y).toBeCloseTo(rotated.y);
    e.infos = engine.evaluateDocument(e.scene as SceneV1).nodes;
    e.moveNode(child, parent, 0);
    e.toggleLock(parent);
    expect(e.isLocked(child)).toBe(true);
    expect(e.isCollapsed(parent)).toBe(true);
    const x = locateNode(e.scene!.objects, child)!.node.transform?.x;
    e.setNode(child, 'x', 999);
    expect(locateNode(e.scene!.objects, child)!.node.transform?.x).toBe(x);
  });

  it('adding puts the effect below the selected one and selects it', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.selected = stack(e)[0]!.id;
    e.add('twist');
    expect(stack(e).map((m) => m.type)).toEqual(['spherize', 'twist', 'wave']);
    expect(e.current?.type).toBe('twist');
  });

  for (const type of ['gravity', 'oscillate', 'wiggle', 'pulse', 'shake']) {
    it(`${type} follows scene.time when added`, () => {
      const e = fresh(); e.add(type);
      expect(e.current?.params?.time).toEqual({ $expr: 'scene.time', fallback: 1 });
      expect(e.scene?.animation).toBeDefined();
      if (type !== 'gravity') expect(e.current?.children?.[0]?.type).toBe('transform');
    });
  }

  it('removing selects the next one', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.selected = stack(e)[0]!.id;
    e.remove();
    expect(stack(e).map((m) => m.type)).toEqual(['wave']);
    expect(e.current?.type).toBe('wave');
  });

  it('mover reordena', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.move(stack(e)[1]!.id, 0);
    expect(stack(e).map((m) => m.type)).toEqual(['wave', 'spherize']);
  });

  it('undo right after dragging a value undoes only that value', () => {
    const e = fresh();
    e.add('crack');
    e.setParam('growth', 0.5); // queda pendiente (agrupado)
    e.undo();
    expect(stack(e).map((m) => m.type)).toEqual(['crack']);
    expect(e.current?.params?.growth).toBe(1);
    e.redo();
    expect(e.current?.params?.growth).toBe(0.5);
  });

  it.each([1, 2])('keeps the document open after deleting all %s objects', (count) => {
    const e = new Editor();
    e.newFile(800, 600);
    e.name = 'Keep this document';
    e.scene!.notes = 'Keep these notes';
    for (let i = 0; i < count; i++) e.addShape('rectangle');
    e.selected = e.scene!.objects[0]!.id;
    e.also = e.scene!.objects.slice(1).map(n => n.id);
    e.removeSelection();
    expect(e.scene?.objects).toEqual([]);
    expect(e.scene?.document).toMatchObject({ width: 800, height: 600 });
    expect(e.scene?.notes).toBe('Keep these notes');
    expect(e.name).toBe('Keep this document');
    expect(e.selected).toBeNull();
    expect(e.also).toEqual([]);
    e.undo();
    expect(e.scene?.objects).toHaveLength(count);
    e.redo();
    expect(e.scene?.objects).toEqual([]);
    expect(e.scene?.document).toMatchObject({ width: 800, height: 600 });
  });

  it('rejects what is not SVG', () => {
    const e = new Editor();
    e.load('hola', 'x.txt');
    expect(e.scene).toBeNull();
    expect(e.error).toMatch(/SVG/);
  });
});

describe('point marker', () => {
  it('shows while a point moves and goes 300 ms after it stops', async () => {
    const e = fresh();
    e.add('spherize');
    e.setParam('center', [0.3, 0.6]);
    expect(e.marker).toEqual([0.3, 0.6]);
    await new Promise((r) => setTimeout(r, 200));
    e.setParam('center', [0.35, 0.6]); // keeps moving it: the countdown restarts
    await new Promise((r) => setTimeout(r, 200));
    expect(e.marker).toEqual([0.35, 0.6]);
    await new Promise((r) => setTimeout(r, 150));
    expect(e.marker).toBeNull();
  });

  it('parameters that are not points do not show it', () => {
    const e = fresh();
    e.add('spherize');
    e.setParam('strength', 0.2);
    expect(e.marker).toBeNull();
  });
});

describe('Step with children', () => {
  it('with Step selected, what is added goes inside; with a child selected, below it', () => {
    const e = fresh();
    e.add('clone');
    e.add('step');
    e.add('twist');
    e.add('spherize');
    const step = stack(e)[1]!;
    expect(step.children!.map((m) => m.type)).toEqual(['twist', 'spherize']);
    expect(e.currentParent?.id).toBe(step.id);
  });

  it('a Step does not go inside another: it goes to the main stack', () => {
    const e = fresh();
    e.add('step');
    e.add('step');
    expect(stack(e).map((m) => m.type)).toEqual(['step', 'step']);
  });

  it('moveTo moves into and out of Step; removing a child selects its neighbour or the Step', () => {
    const e = fresh();
    e.add('wave');
    const wave = e.current!.id;
    e.add('step');
    const step = e.current!.id;
    e.moveTo(wave, step, 0);
    expect(stack(e).map((m) => m.type)).toEqual(['step']);
    expect(stack(e)[0]!.children!.map((m) => m.type)).toEqual(['wave']);
    e.remove(wave);
    expect(e.selected).toBe(step);
    e.add('noise');
    e.moveTo(e.current!.id, null, 0);
    expect(stack(e).map((m) => m.type)).toEqual(['noise', 'step']);
  });

  it('a child\'s parameters are edited the same way', () => {
    const e = fresh();
    e.add('step');
    e.add('transform');
    e.setParam('rotation', 10);
    expect(stack(e)[0]!.children![0]!.params!.rotation).toBe(10);
  });
});

describe('RGB Split with nested effects', () => {
  it('with RGB Split selected, Blur and Step go inside; another RGB Split goes below', () => {
    const e = fresh();
    e.add('rgbsplit');
    const rgb = e.current!.id;
    e.add('blur');
    e.selected = rgb;
    e.add('step');
    expect(stack(e)[0]!.children!.map((m) => m.type)).toEqual(['blur', 'step']);
    // Inside the inner Step: a normal effect goes in, below the selected one.
    e.add('transform');
    e.add('noise');
    expect(stack(e)[0]!.children![1]!.children!.map((m) => m.type)).toEqual(['transform', 'noise']);
    // With the RGB Split itself selected, another RGB Split does not go in: it goes below, in the stack.
    e.selected = rgb;
    e.add('rgbsplit');
    expect(stack(e).map((m) => m.type)).toEqual(['rgbsplit', 'rgbsplit']);
  });
  it('RGB Split can go inside Step, but not inside itself', () => {
    const e = fresh();
    e.add('step');
    e.add('rgbsplit');
    const rgb = e.current!.id;
    expect(stack(e)[0]!.children!.map((m) => m.type)).toEqual(['rgbsplit']);
    e.add('blur');
    const blur = e.current!.id;
    e.moveTo(rgb, blur, 0);
    expect(stack(e)[0]!.children![0]!.id).toBe(rgb);
  });
});

describe('dado', () => {
  it('changes the selection\'s parameters and undoes in one step', () => {
    const e = fresh();
    e.add('spherize');
    const before = JSON.stringify(e.current!.params);
    e.randomize(undefined, 42);
    expect(JSON.stringify(e.current!.params)).not.toBe(before);
    e.undo();
    expect(JSON.stringify(e.current!.params)).toBe(before);
  });
});

describe('several objects and groups', () => {
  it('new things go at the top of the list (in front) and stay selected; effects go to their stack', () => {
    const e = fresh();
    e.add('wave');
    e.load(samples.star, 'star.svg');
    expect(e.scene!.objects.map((n) => n.name)).toEqual(['star.svg', 'grid.svg']);
    expect(e.currentNode?.name).toBe('star.svg');
    e.add('twist');
    expect(e.scene!.objects[0]!.stack.map((m) => m.type)).toEqual(['twist']);
    expect(e.activeNode?.name).toBe('star.svg');
  });

  it('grouping and ungrouping leave nodes in place', () => {
    const e = fresh();
    e.load(samples.star, 'star.svg');
    const star = e.scene!.objects[0]!.id;
    e.group(star);
    const g = e.scene!.objects[0]!;
    expect(g.kind).toBe('group');
    e.moveNode(e.scene!.objects[1]!.id, g.id, 0);
    expect(e.scene!.objects).toHaveLength(1);
    expect((e.scene!.objects[0] as { children: { name: string }[] }).children.map((c) => c.name)).toEqual(['grid.svg', 'star.svg']);
    e.ungroup(g.id);
    expect(e.scene!.objects.map((n) => n.name)).toEqual(['grid.svg', 'star.svg']);
  });

  it('a group does not go inside itself', () => {
    const e = fresh();
    e.group(e.scene!.objects[0]!.id);
    const g = e.scene!.objects[0]!.id;
    e.moveNode(g, g, 0);
    expect(e.scene!.objects[0]!.id).toBe(g);
  });

  it('a node\'s position, opacity and visibility, with undo', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.setNode(id, 'x', 30, true);
    e.setNode(id, 'opacity', 0.5, true);
    expect(e.scene!.objects[0]).toMatchObject({ transform: { x: 30 }, opacity: 0.5 });
    e.undo();
    expect(e.scene!.objects[0]!.opacity).toBeUndefined();
  });

  it('applyScene replaces the scene (and does nothing if it is the same)', () => {
    const e = fresh();
    const next = JSON.parse(JSON.stringify(e.scene)) as typeof e.scene & object;
    expect(e.applyScene(next)).toBe(false);
    next.objects.at(-1)!.stack.push({ id: 'x', type: 'wave' });
    expect(e.applyScene(next)).toBe(true);
    expect(stack(e).map((m) => m.type)).toEqual(['wave']);
  });
});

describe('primitivas', () => {
  it('without a scene, adding a primitive creates one; names do not repeat', () => {
    const e = new Editor();
    e.addShape('star');
    e.addShape('star', { points: 7 }, { x: 50, y: 0 });
    expect(e.scene!.objects.map((n) => n.name)).toEqual(['Star 2', 'Star']);
    const second = e.scene!.objects[0]!;
    expect(second).toMatchObject({ kind: 'shape', shape: 'star', transform: { x: 50, y: 0 } });
    expect((second as { params: Record<string, unknown> }).params.points).toBe(7);
    expect(e.currentNode?.id).toBe(second.id);
  });

  it('with a group selected, the primitive goes inside it; its parameters are edited and undone', () => {
    const e = fresh();
    e.group(e.scene!.objects[0]!.id);
    e.addShape('rectangle');
    const g = e.scene!.objects[0] as { children: { kind: string; id: string }[] };
    expect(g.children.map((c) => c.kind)).toEqual(['shape', 'object']);
    const id = g.children[0]!.id;
    e.setShapeParam(id, 'radius', 12);
    e.flush();
    e.undo();
    expect((locateNode(e.scene!.objects, id)!.node as { params: Record<string, unknown> }).params.radius).toBe(0);
  });

  it('rail colours: without a selection they are the new primitives\', with one its own', () => {
    const e = new Editor();
    // With nothing selected: the pickers show (and change) the values for new primitives.
    expect(e.currentFill).toBe('#333333');
    expect(e.currentOutline).toBe('#ededed');
    e.setFillColor('#ff0000');
    e.setOutlineColor('#00ff00');
    expect(e.fillColor).toBe('#ff0000');
    expect(e.strokeColor).toBe('#00ff00');
    expect(e.strokeOn).toBe(true);

    // The new primitive starts with those values.
    e.addShape('star');
    const id = e.currentNode!.id;
    const shape = () => (locateNode(e.scene!.objects, id)!.node as { params: Record<string, unknown> }).params;
    expect(shape()).toMatchObject({ fillColor: '#ff0000', strokeColor: '#00ff00', stroke: true });

    // With the primitive selected, the picker edits its fill/stroke, not the new primitives' ones.
    e.setFillColor('#0000ff');
    e.setOutlineColor('#ffffff');
    expect(shape()).toMatchObject({ fillColor: '#0000ff', strokeColor: '#ffffff' });
    expect(e.fillColor).toBe('#ff0000');
    expect(e.strokeColor).toBe('#00ff00');

    // With a group chosen, the colour reaches the primitives inside it.
    e.group();
    e.setFillColor('#123456');
    expect(shape()).toMatchObject({ fillColor: '#123456' });
  });
});

describe('copy and paste', () => {
  it('pastes objects with new ids, offset, above the original and selected', () => {
    const e = fresh();
    e.add('wave');
    const original = e.scene!.objects[0]!;
    e.selected = original.id;
    const text = e.copySelection()!;
    expect(e.paste(text)).toBe(true);
    const [copy, orig] = e.scene!.objects;
    expect(orig!.id).toBe(original.id);
    expect(copy!.id).not.toBe(original.id);
    expect(copy!.stack[0]!.type).toBe('wave');
    expect(copy!.stack[0]!.id).not.toBe(original.stack[0]!.id);
    expect(copy!.transform).toMatchObject({ x: 16, y: 16 });
    expect(e.selected).toBe(copy!.id);
    // Pasting the same again: one step further.
    e.paste(text);
    expect(e.scene!.objects[0]!.transform).toMatchObject({ x: 32, y: 32 });
  });

  it('copies node, shape and nested effect tracks with fresh IDs and position offsets', () => {
    const e = new Editor();
    e.addShape('rectangle');
    const original = e.scene!.objects[0]!;
    original.stack = [{ id: 'step-original', type: 'step', params: {}, children: [{ id: 'move-original', type: 'transform', params: {} }] }];
    e.scene!.animation = { duration: 5, fps: 60, loop: false, tracks: [
      { id: 'position', node: original.id, on: 'node', param: 'x', keys: [{ t: 0, value: 10, ease: 'ease-in' }, { t: 5, value: 100 }], repeat: 2, every: 5 },
      { id: 'shape', node: original.id, on: 'shape', param: 'width', keys: [{ t: 0, value: 80 }, { t: 5, value: 160 }] },
      { id: 'effect', node: original.id, on: 'modifier', modifier: 'move-original', param: 'x', keys: [{ t: 0, value: 0 }, { t: 5, value: 50 }] },
    ] };
    e.selected = original.id;
    e.record(true);
    const text = e.copySelection()!;
    e.paste(text);
    const copy = e.scene!.objects[0]!;
    const tracks = e.scene!.animation!.tracks.filter(tr => tr.node === copy.id);
    expect(tracks).toHaveLength(3);
    expect(tracks[0]).toMatchObject({ repeat: 2, every: 5, keys: [{ t: 0, value: 26, ease: 'ease-in' }, { t: 5, value: 116 }] });
    expect(tracks[2]!.modifier).toBe(copy.stack[0]!.children![0]!.id);
    expect(new Set(e.scene!.animation!.tracks.map(tr => tr.id)).size).toBe(6);
    e.setTime(2.5);
    expect(copy.transform!.x).toBeCloseTo(original.transform!.x! + 16);
    e.undo();
    expect(e.scene!.objects).toHaveLength(1);
    expect(e.scene!.animation!.tracks).toHaveLength(3);
    e.redo();
    expect(e.scene!.animation!.tracks).toHaveLength(6);
    const other = new Editor();
    other.paste(text, 0);
    expect(other.scene!.animation).toMatchObject({ duration: 5, fps: 60, loop: false });
    expect(other.scene!.animation!.tracks[0]!.keys[0]!.value).toBe(10);
    other.setTime(2.5);
    expect(other.scene!.objects[0]!.transform!.x).toBeCloseTo(21.25);
  });

  it('includes child animation when copying a group and excludes unrelated tracks', () => {
    const e = new Editor();
    e.addShape('rectangle');
    const child = e.scene!.objects[0]!;
    e.group();
    const group = e.currentNode!;
    e.selected = null;
    e.addShape('star');
    const outside = e.currentNode!.id;
    e.scene!.animation = { duration: 3, tracks: [
      { id: 'child-x', node: child.id, on: 'node', param: 'x', keys: [{ t: 0, value: 0 }, { t: 3, value: 30 }] },
      { id: 'unrelated', node: outside, on: 'node', param: 'x', keys: [{ t: 0, value: 99 }] },
    ] };
    e.selected = group.id;
    e.duplicate();
    const copy = e.currentNode!;
    expect(copy.children).toHaveLength(1);
    const tracks = e.scene!.animation!.tracks.filter(tr => tr.node === copy.children![0]!.id);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]!.keys[1]!.value).toBe(30);
    expect(e.scene!.animation!.tracks).toHaveLength(3);
  });

  it('paste in place (⌘⇧V): no offset, even when pasted several times', () => {
    const e = fresh();
    const original = e.scene!.objects[0]!;
    original.transform = { x: 40, y: -10 };
    e.selected = original.id;
    const text = e.copySelection()!;
    e.paste(text, 0);
    e.paste(text, 0);
    expect(e.scene!.objects[0]!.transform).toMatchObject({ x: 40, y: -10 });
    expect(e.scene!.objects[0]!.id).not.toBe(original.id);
  });

  it('a copied effect pastes into the active object, below the selected one', () => {
    const e = fresh();
    e.add('wave');
    e.add('twist');
    e.selected = stack(e)[0]!.id;
    e.paste(e.copySelection()!);
    expect(stack(e).map((m) => m.type)).toEqual(['wave', 'wave', 'twist']);
    expect(new Set(stack(e).map((m) => m.id)).size).toBe(3);
  });

  it('names when pasting: "copy", "copy 2"… only if the name exists', () => {
    const e = fresh();
    const name = e.scene!.objects[0]!.name;
    e.selected = e.scene!.objects[0]!.id;
    e.duplicate();
    e.duplicate();
    e.selected = e.scene!.objects.at(-1)!.id;
    e.duplicate();
    expect(e.scene!.objects.map((n) => n.name)).toEqual([`${name} copy 2`, `${name} copy`, `${name} copy 3`, name]);
    // In a document where it does not exist, it keeps its name.
    const other = new Editor();
    other.paste(e.copySelection()!);
    expect(other.scene!.objects[0]!.name).toBe(`${name} copy 3`);
  });

  it('duplicating several at once; foreign text does not paste', () => {
    const e = fresh();
    e.addShape('star');
    const ids = e.scene!.objects.map((n) => n.id);
    e.selected = ids[0]!;
    e.toggleSelect(ids[1]!);
    e.duplicate();
    expect(e.scene!.objects).toHaveLength(4);
    expect(e.selectedNodes).toHaveLength(2);
    expect(e.paste('hola')).toBe(false);
    expect(e.paste('{"a":1}')).toBe(false);
  });
});

describe('boolean bar', () => {
  it('groups and applies the mode; on the group, only changes the mode', () => {
    const e = fresh();
    e.addShape('star');
    const ids = e.scene!.objects.map((n) => n.id);
    e.selected = ids[0]!;
    e.toggleSelect(ids[1]!);
    e.booleanize('subtract');
    const g = e.scene!.objects[0]!;
    expect(g.stack.map((m) => [m.type, m.params?.mode])).toEqual([['boolean', 'subtract']]);
    expect(e.selected).toBe(g.id);
    e.booleanize('intersect');
    expect(g.stack.map((m) => [m.type, m.params?.mode])).toEqual([['boolean', 'intersect']]);
  });
});

describe('Boolean shortcut', () => {
  it('with several selected, groups them and gives the group Boolean', () => {
    const e = fresh();
    e.addShape('star');
    const ids = e.scene!.objects.map((n) => n.id);
    e.selected = ids[0]!;
    e.toggleSelect(ids[1]!);
    e.add('boolean');
    expect(e.scene!.objects).toHaveLength(1);
    const g = e.scene!.objects[0]!;
    expect(g.kind).toBe('group');
    expect(g.stack.map((m) => m.type)).toEqual(['boolean']);
    expect(e.current?.type).toBe('boolean');
  });
});

describe('arrastrar efectos entre objetos', () => {
  it('moves an effect to another object\'s stack; with copy, leaves the original', () => {
    const e = fresh();
    e.addShape('star');
    const [star, grid] = e.scene!.objects;
    e.selected = grid!.id;
    e.add('wave');
    const wave = grid!.stack[0]!.id;
    e.moveTo(wave, null, 0, star!.id, true);
    expect(star!.stack.map((m) => m.type)).toEqual(['wave']);
    expect(grid!.stack.map((m) => m.type)).toEqual(['wave']);
    expect(star!.stack[0]!.id).not.toBe(wave);
    e.moveTo(wave, null, 1, star!.id);
    expect(grid!.stack).toHaveLength(0);
    expect(star!.stack.map((m) => m.type)).toEqual(['wave', 'wave']);
  });
});

describe('object order', () => {
  it('to front, forward, backward and to back (the first in the list is in front)', () => {
    const e = fresh();
    e.addShape('star');
    e.addShape('ellipse');
    const names = () => e.scene!.objects.map((n) => n.name);
    const grid = e.scene!.objects[2]!;
    e.selected = grid.id;
    e.reorder('forward');
    expect(names()[1]).toBe(grid.name);
    e.reorder('front');
    expect(names()[0]).toBe(grid.name);
    e.reorder('back');
    expect(names()[2]).toBe(grid.name);
    e.reorder('backward');
    expect(names()[2]).toBe(grid.name);
  });
});

describe('animation in the editor', () => {
  it('the diamond creates the track; changing the value at another time adds a key; removing them all stops animating', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.toggleKey({ node: id, on: 'node', param: 'rotation' });
    expect(e.keyState({ node: id, on: 'node', param: 'rotation' })).toBe('key');
    e.setTime(2);
    expect(e.keyState({ node: id, on: 'node', param: 'rotation' })).toBe('animated');
    e.setNode(id, 'rotation', 90, true);
    expect(e.animation!.tracks[0]!.keys.map((k) => [k.t, k.value])).toEqual([[0, 0], [2, 90]]);
    e.setTime(1);
    expect(e.scene!.objects[0]!.transform?.rotation).toBeCloseTo(45);
    e.setTime(2);
    e.toggleKey({ node: id, on: 'node', param: 'rotation' });
    e.setTime(0);
    e.toggleKey({ node: id, on: 'node', param: 'rotation' });
    expect(e.animation!.tracks).toHaveLength(0);
  });
});

describe('animating enabled, and repeats', () => {
  it('with "enabled" animated, the eye adds a key; the track turns it off and on as the playhead moves', () => {
    const e = fresh();
    e.applyPreset('rise');
    const node = e.scene!.objects[0]!;
    const m = node.stack.at(-1)!;
    const t = { node: node.id, on: 'modifier' as const, modifier: m.id, param: 'enabled' };
    e.setTime(0);
    e.toggleKey(t);
    e.setTime(1);
    e.setEnabled(m.id, false);
    expect(e.track(t)!.keys.map((k) => [k.t, k.value])).toEqual([[0, true], [1, false]]);
    e.setTime(0);
    expect(m.enabled).not.toBe(false);
    e.setTime(1);
    expect(m.enabled).toBe(false);
  });
  it('setRepeat stores the laps and how often; 1 removes it', () => {
    const e = fresh();
    e.applyPreset('rise');
    const tr = e.animation!.tracks[0]!;
    e.setRepeat(tr.id, 3, 2);
    expect([tr.repeat, tr.every]).toEqual([3, 2]);
    e.setRepeat(tr.id, 1);
    expect([tr.repeat, tr.every]).toEqual([undefined, undefined]);
  });
});

describe('animation presets', () => {
  it('Rise adds a Stagger with its effects and two Progress keys', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.selected = id;
    e.applyPreset('rise');
    const st = e.scene!.objects[0]!.stack.at(-1)!;
    expect(st.type).toBe('stagger');
    expect(st.children!.map((c) => c.type)).toEqual(['transform', 'opacity']);
    const tr = e.animation!.tracks.find((t) => t.modifier === st.id)!;
    expect(tr.keys.map((k) => k.value)).toEqual([0, 1]);
    expect(e.timelineOpen).toBe(true);
  });
});

describe('proyecto JSON', () => {
  it('saving and opening again leaves the document the same (and a bare scene JSON works)', () => {
    const e = fresh();
    e.add('wave');
    e.setName('mi-proyecto');
    const id = e.scene!.objects[0]!.id;
    e.toggleKey({ node: id, on: 'node', param: 'rotation' });
    const file = e.projectFile()!;
    const other = new Editor();
    expect(other.openProject(file)).toBe(true);
    expect(other.name).toBe('mi-proyecto');
    // The same except what the current time writes (the animated rotation stays as an explicit 0).
    expect(JSON.stringify(other.scene!.animation)).toBe(JSON.stringify(e.scene!.animation));
    expect(other.scene!.objects.map((n) => [n.id, n.name, n.stack.map((m) => m.type)])).toEqual(e.scene!.objects.map((n) => [n.id, n.name, n.stack.map((m) => m.type)]));
    expect(new Editor().openProject(JSON.stringify(e.scene))).toBe(true);
    expect(new Editor().openProject('hola')).toBe(false);
  });

  it('without embedding SVGs: the file only names them, opening asks for them and giving them draws the same', () => {
    const e = fresh();
    const object = e.scene!.objects.find((n) => n.kind === 'object')!;
    expect(object).toBeTruthy();
    const svg = (object as { source: string }).source;
    e.embedSources = false;
    const file = e.projectFile()!;
    expect(file).not.toContain('<svg');
    expect(JSON.parse(file).embedSources).toBe(false);
    const other = new Editor();
    expect(other.openProject(file)).toBe(true);
    expect(other.embedSources).toBe(false);
    const href = (other.scene!.objects.find((n) => n.id === object.id) as { href: string }).href;
    expect(other.missingSvgs).toEqual([href]);
    expect(other.dirty).toBe(false);
    expect(other.attachSvgFiles(new Map([['otro.svg', svg]]))).toBe(0);
    expect(other.attachSvgFiles(new Map([[href, svg]]))).toBe(1);
    expect(other.missingSvgs).toEqual([]);
    expect(other.dirty).toBe(false);
    const engine = createEngine(builtins);
    expect(engine.toSVG(other.scene!)).toBe(engine.toSVG(e.scene!));
    // With the option set again, the SVG goes back inside the file.
    other.embedSources = true;
    expect(other.projectFile()).toContain('<svg');
  });
});

describe('interactions in the editor', () => {
  it('add, change and remove; targets include placement and its effects\' values', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.selected = id;
    e.add('spherize');
    e.addInteraction(id);
    expect(e.scene!.interactions).toHaveLength(1);
    const it = e.scene!.interactions![0]!;
    e.updateInteraction(it.id, { trigger: 'click', to: 2 });
    expect(e.scene!.interactions![0]).toMatchObject({ trigger: 'click', to: 2 });
    const labels = e.interactionTargets(id).map((t) => t.label);
    expect(labels).toContain('Scale');
    expect(labels).toContain('Spherize · strength');
    e.removeInteraction(it.id);
    expect(e.scene!.interactions).toHaveLength(0);
  });
});

describe('Interacciones', () => {
  it('add, change action and remove, with undo', () => {
    const e = fresh();
    const node = e.scene!.objects.at(-1)!.id;
    e.add('damage');
    e.addInteraction(node);
    const it0 = e.scene!.interactions![0]!;
    expect(it0).toMatchObject({ node, trigger: 'hover' });

    e.setInteractionAction(it0.id, 'play');
    expect(e.scene!.interactions![0]!.segment).toEqual([0, e.animation?.duration ?? 3]);

    e.setInteractionAction(it0.id, 'seed');
    const fx = stack(e)[0]!;
    expect(e.scene!.interactions![0]!.target).toEqual({ node, on: 'modifier', modifier: fx.id, param: 'seed' });

    e.setInteractionAction(it0.id, 'toggle');
    expect(e.scene!.interactions![0]!.target.modifier).toBe(fx.id);

    e.removeInteraction(it0.id);
    expect(e.scene!.interactions).toEqual([]);
    e.undo();
    expect(e.scene!.interactions).toHaveLength(1);
  });

  it('autoplay is stored in the animation', () => {
    const e = fresh();
    e.setAutoplay(false);
    expect(e.scene!.animation?.autoplay).toBe(false);
  });
});

describe('File and tracks', () => {
  it('removing an animated effect takes its track; dragging a key chains moves', () => {
    const e = fresh();
    e.add('damage');
    const fx = stack(e)[0]!;
    const node = e.scene!.objects.at(-1)!.id;
    e.toggleKey({ node, on: 'modifier', modifier: fx.id, param: 'growth' });
    e.toggleKey({ node, on: 'node', param: 'scale' });
    expect(e.animation!.tracks).toHaveLength(2);
    const tr = e.animation!.tracks.find((t) => t.on === 'node')!;
    let t = e.moveKey(tr.id, 0, 1 / 30);
    t = e.moveKey(tr.id, t, 2 / 30);
    expect(tr.keys[0]!.t).toBe(t);
    expect(t).toBeCloseTo(0.067, 3);
    e.remove(fx.id);
    expect(e.animation!.tracks.map((x) => x.on)).toEqual(['node']);
  });

  it('unsaved changes and new file', () => {
    const e = fresh();
    expect(e.dirty).toBe(true);
    e.markSaved();
    expect(e.dirty).toBe(false);
    e.add('wave');
    expect(e.dirty).toBe(true);
    e.newFile();
    expect(e.scene).toMatchObject({ document: { width: 1400, height: 900 }, objects: [] });
    expect(e.dirty).toBe(false);
  });
});

describe('Pack', () => {
  it.each([false, true])('packs the three-cross scene from the stack or inspector (explicit id: %s)', (explicit) => {
    const e = new Editor();
    const ids = ['cross-fdhdy0', 'cross-o4x053', 'cross-dr77w2'];
    e.scene = {
      version: 1, document: { width: 1400, height: 900 },
      objects: ids.map((id, i) => ({
        kind: 'shape' as const, id, name: ['Cross copy 2', 'Cross copy', 'Cross'][i]!, shape: 'cross',
        params: { size: 253, width: 51, fill: true, fillColor: '#333333', stroke: false,
          strokeColor: '#ededed', strokeWidth: 2, strokeJoin: 'round', strokeCap: 'round',
          dash: 0, gap: 0, dashOffset: 0, behind: false },
        stack: [], transform: { x: [0.13, 426.03, -426.03000000000003][i]!, y: 0 },
      })),
    };
    expect(validateScene(e.scene).errors).toEqual([]);
    e.selected = ids[0]!;
    e.toggleSelect(ids[1]!);
    e.toggleSelect(ids[2]!);
    const before = box(e);
    e.pack(explicit ? e.activeNode!.id : undefined);
    expect(e.scene!.objects).toHaveLength(1);
    expect(e.packed).toBe(true);
    const after = box(e);
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(after[key]).toBeCloseTo(before[key], 5);
    e.unpack();
    expect(e.scene!.objects.map((n) => n.id)).toEqual(ids);
    expect(validateScene(e.scene!).errors).toEqual([]);
  });

  it.each([2, 3, 40])('packs %i selected objects together and unpacks in one undo step', (count) => {
    const e = new Editor();
    e.scene = { version: 1, objects: Array.from({ length: count }, (_, i) => ({
      kind: 'shape' as const, id: `shape-${i}`, name: `Shape ${i}`, shape: 'rectangle',
      params: { width: 20, height: 20 }, transform: { x: i * 30 }, stack: [],
    })) };
    expect(validateScene(e.scene).errors).toEqual([]);
    const ids = e.scene.objects.map((n) => n.id);
    e.selected = ids[count - 1]!;
    e.also = ids.slice(0, -1);
    e.record(true);
    e.pack();
    expect(e.scene!.objects).toHaveLength(1);
    expect(e.packed).toBe(true);
    const pack = e.scene!.objects[0]!;
    expect(pack.kind === 'object' && pack.packed?.original).toMatchObject({ kind: 'group', children: ids.map((id) => ({ id })) });
    e.undo();
    expect(e.scene!.objects.map((n) => n.id)).toEqual(ids);
    e.redo();
    // A saved/reopened pack retains the automatic-folder marker.
    e.scene = JSON.parse(JSON.stringify(stripPackGeometry(e.scene as SceneV1)));
    e.unpack();
    expect(validateScene(e.scene!).errors).toEqual([]);
    expect(e.scene!.objects.map((n) => n.id)).toEqual(ids);
    expect(e.selectedNodes.map((n) => n.id)).toEqual(ids);
    e.undo();
    expect(e.scene!.objects).toHaveLength(1);
    expect(e.packed).toBe(true);
  });

  it('keeps edits on the pack when unpacking an automatic group', () => {
    const e = fresh();
    e.duplicate();
    const ids = e.scene!.objects.map((n) => n.id);
    e.selected = ids[0]!;
    e.also = ids.slice(1);
    e.pack();
    e.add('wave');
    e.unpack();
    expect(e.scene!.objects).toHaveLength(1);
    const group = e.scene!.objects[0]!;
    expect(group.kind).toBe('group');
    expect(group.stack.map((m) => m.type)).toEqual(['wave']);
    expect(group.children!.map((n) => n.id)).toEqual(ids);
  });

  it('does not partially pack a selection spanning folders', () => {
    const e = fresh();
    e.duplicate();
    const ids = e.scene!.objects.map((n) => n.id);
    e.group(ids[0]);
    const before = JSON.stringify(e.scene);
    e.selected = ids[0]!;
    e.also = [ids[1]!];
    e.pack();
    expect(JSON.stringify(e.scene)).toBe(before);
    expect(e.notice).toMatch(/same folder/);
  });

  it('packs the active node, undoes and unpacks', () => {
    const e = fresh();
    e.add('wave');
    const node = e.scene!.objects.at(-1)!;
    e.selected = node.id;
    e.pack();
    expect(e.packed).toBe(true);
    const pack = e.scene!.objects.at(-1)!;
    expect(pack.kind === 'object' && pack.packed?.original?.id).toBe(node.id);
    e.unpack();
    expect(e.scene!.objects.at(-1)!.id).toBe(node.id);
    expect(e.scene!.objects.at(-1)!.stack.map((m) => m.type)).toEqual(['wave']);
    e.undo();
    expect(e.packed).toBe(true);
  });
});

describe('Expandir SVG', () => {
  it('makes one object per shape inside a group that keeps the place, the stack and the animation', () => {
    const e = new Editor();
    e.load(samples.star, 'star.svg');
    const id = e.scene!.objects[0]!.id;
    e.setNode(id, 'x', 20, true);
    e.setNode(id, 'y', -10, true);
    e.setNode(id, 'rotation', 25, true);
    e.setNode(id, 'scale', 1.3, true);
    e.selected = id;
    e.add('wave');
    e.toggleKey({ node: id, on: 'node', param: 'x' });
    const before = box(e);
    expect(e.shapeCount(samples.star)).toBe(2);
    e.expand(id);
    const g = e.scene!.objects[0]!;
    expect(g.kind).toBe('group');
    expect(g.id).toBe(id);
    if (g.kind !== 'group') return;
    expect(g.stack.map((m) => m.type)).toEqual(['wave']);
    expect(g.children.map((c) => c.name)).toEqual(['star 2', 'star 1']);
    expect(g.children.every((c) => c.kind === 'object' && c.stack.length === 0)).toBe(true);
    expect(e.animation!.tracks.map((t) => t.node)).toEqual([id]);
    const after = box(e);
    for (const k of ['x', 'y', 'width', 'height'] as const) expect(after[k]).toBeCloseTo(before[k], 2);
  });

  it('with a single shape it warns and leaves the object alone', () => {
    const e = new Editor();
    e.load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', 'one.svg');
    const id = e.scene!.objects[0]!.id;
    e.selected = id;
    e.expand(id);
    expect(e.scene!.objects[0]!.kind).toBe('object');
    expect(e.notice).toContain('one shape');
  });
});

describe('Code and timeline', () => {
  it('opening one closes the other; closing the timeline stops it', () => {
    const e = fresh();
    e.codeOpen = true;
    e.timelineOpen = true;
    e.playing = true;
    expect(e.codeOpen).toBe(false);
    e.codeOpen = true;
    expect(e.timelineOpen).toBe(false);
    expect(e.playing).toBe(false);
  });
});

describe('Documento', () => {
  it('fixed size, fit to the drawing, and back to automatic', () => {
    const e = fresh();
    e.setDocument({ width: 1920, height: 1080 });
    expect(e.scene!.document).toEqual({ width: 1920, height: 1080 });
    e.contentBox = { x: 10, y: 20, width: 99.5, height: 50 };
    e.fitDocument();
    expect(e.scene!.document).toEqual({ width: 100, height: 50, x: 59.75, y: 45 });
    e.setDocument(null);
    expect(e.scene!.document).toBeUndefined();
  });
});

describe('Fuentes', () => {
  it('the nearest available weight, and italic only if the family has it', async () => {
    const { nearest } = await import('./fonts');
    const f = { family: 'X', category: 'sans' as const, weights: [300, 400, 700], italic: false, pick: false };
    expect(nearest(f, 900, true)).toEqual({ weight: 700, italic: false });
    expect(nearest(f, 350, false)).toEqual({ weight: 300, italic: false });
  });
});

describe('Utils: Instance', () => {
  it('creates the instance in front of the original, offset; its original can be changed and undone', () => {
    const e = fresh();
    const orig = e.scene!.objects[0]!;
    e.addInstance();
    const inst = e.scene!.objects[0]!;
    expect(inst.kind).toBe('instance');
    expect(inst.kind === 'instance' && inst.of).toBe(orig.id);
    expect(e.scene!.objects[1]!.id).toBe(orig.id);
    expect(inst.name).toBe('grid.svg instance');
    expect(inst.transform!.x).toBeGreaterThan(0);
    expect(e.selected).toBe(inst.id);

    e.addShape('star');
    const star = e.scene!.objects[0]!.id;
    e.setInstanceOf(inst.id, star);
    expect(locateNode(e.scene!.objects, inst.id)!.node).toMatchObject({ of: star });
    // Never of itself.
    e.setInstanceOf(inst.id, inst.id);
    expect(locateNode(e.scene!.objects, inst.id)!.node).toMatchObject({ of: star });
    e.undo();
    expect(locateNode(e.scene!.objects, inst.id)!.node).toMatchObject({ of: orig.id });
  });
});

describe('Utils: Effector', () => {
  it('starts with the selection as targets; its effects go to its stack; targets and delay change with undo', () => {
    const e = fresh();
    const a = e.scene!.objects[0]!.id;
    e.addShape('star');
    const b = e.scene!.objects[0]!.id;
    e.selected = a;
    e.toggleSelect(b);
    e.addEffector();
    const eff = e.scene!.objects[0]!;
    expect(eff.kind).toBe('effector');
    expect(eff.kind === 'effector' && eff.targets).toEqual([b, a]); // in list order (top to bottom)
    e.add('twist');
    expect(eff.stack.map((m) => m.type)).toEqual(['twist']);

    e.setEffectorTarget(eff.id, a, false);
    e.setEffectorDelay(eff.id, 0.25, true);
    let node = locateNode(e.scene!.objects, eff.id)!.node;
    expect(node).toMatchObject({ targets: [b], delay: 0.25 });
    e.undo();
    e.undo();
    node = locateNode(e.scene!.objects, eff.id)!.node;
    expect(node).toMatchObject({ targets: [b, a] });
  });
});

describe('Utils: Connector', () => {
  it('creates a line with Connect between the two selected and leaves the effect selected', () => {
    const e = fresh();
    const a = e.scene!.objects[0]!.id;
    e.addShape('star');
    const b = e.scene!.objects[0]!.id;
    e.selected = a;
    e.toggleSelect(b);
    e.addConnector();
    const n = e.scene!.objects[0]!;
    expect(n).toMatchObject({ kind: 'shape', shape: 'line', name: 'Connector' });
    expect(n.stack[0]).toMatchObject({ type: 'connect' });
    expect([n.stack[0]!.params!.from, n.stack[0]!.params!.to].sort()).toEqual([a, b].sort());
    expect(e.current?.type).toBe('connect');
  });
});

describe('Utils: Tracer', () => {
  it('creates a line with Trace of the active object, right behind it', () => {
    const e = fresh();
    e.addShape('star');
    const star = e.scene!.objects[0]!.id;
    e.addTracer();
    const list = e.scene!.objects;
    expect(list[0]!.id).toBe(star);
    expect(list[1]).toMatchObject({ kind: 'shape', shape: 'line', name: 'Star trace' });
    expect(list[1]!.stack[0]).toMatchObject({ type: 'trace', params: { target: star } });
    expect(e.current?.type).toBe('trace');
  });
  it("draws the trail in the object's own colour (not the line's near-white default)", () => {
    const e = fresh();
    e.addShape('star', { fillColor: '#737373' });
    e.addTracer();
    const line = e.scene!.objects[1]!;
    expect(line.kind === 'shape' && line.params.strokeColor).toBe('#737373');
  });
});

describe('paletas', () => {
  it('applying a palette changes the colours (undoable); saving and deleting custom ones', () => {
    const e = new Editor();
    e.addShape('rectangle', { fillColor: '#ffffff' });
    e.addShape('ellipse', { fillColor: '#000000' });
    e.applyPalette('Ember');
    const fills = () => e.scene!.objects.map((n) => (n.kind === 'shape' ? n.params.fillColor : null));
    // White to Ember's lightest; black to its darkest.
    expect(fills()).toEqual(['#1c0f13', '#fdebc8']);
    e.undo();
    expect(fills()).toEqual(['#000000', '#ffffff']);

    expect(e.savePalette('Mine')).toBe(true);
    expect(e.palettes.find((p) => p.name === 'Mine')?.colors.length).toBeGreaterThanOrEqual(2);
    expect(e.paletteName).toBe('Mine');
    // A built-in one cannot be overwritten.
    expect(e.savePalette('Ember')).toBe(false);
    e.deletePalette('Mine');
    expect(e.palettes.some((p) => p.name === 'Mine')).toBe(false);
    expect(e.paletteName).toBe('In this document');
  });
});

describe('following the pointer', () => {
  it('pointer goes with follow (position); effect points and numbers can follow', () => {
    const e = new Editor();
    e.addShape('star');
    const id = e.scene!.objects[0]!.id;
    e.add('spherize');
    e.addInteraction(id);
    const it = () => e.scene!.interactions![0]!;
    e.setInteractionTrigger(it().id, 'pointer');
    expect(it()).toMatchObject({ trigger: 'pointer', action: 'follow', target: { param: 'position' }, axis: 'both' });
    const labels = e.followTargets(id).map((t) => t.label);
    expect(labels).toContain('Position');
    expect(labels.some((l) => l.startsWith('Spherize · Center'))).toBe(true);
    const rot = e.followTargets(id).find((t) => t.label === 'Rotation')!;
    e.setFollowTarget(it().id, rot.target, rot.kind);
    expect(it().range).toEqual([-45, 45]);
    // Going back to hover leaves it as a normal tween.
    e.setInteractionTrigger(it().id, 'hover');
    expect(it().action).toBe('tween');
    expect(it().range).toBeUndefined();
  });
});

describe('Playback without the timeline', () => {
  it('plays and loops without opening the panel or changing the project', () => {
    const e = fresh();
    const before = JSON.stringify(e.scene);
    e.togglePlayback();
    expect(e.timelineOpen).toBe(false);
    e.advancePlayback(1.5);
    expect(e.time).toBe(1.5);
    e.advancePlayback(2);
    expect(e.time).toBe(0.5);
    expect(e.playing).toBe(true);
    expect(JSON.stringify(e.scene)).toBe(before);
  });
  it('closing the panel does not interrupt playback', () => {
    const e = fresh();
    e.timelineOpen = true;
    e.togglePlayback();
    e.timelineOpen = false;
    e.advancePlayback(0.5);
    expect(e.playing).toBe(true);
    expect(e.time).toBe(0.5);
  });
  it('stops at the end without loop and goes back to the start when played again', () => {
    const e = fresh();
    e.setDuration(2);
    e.setLoop(false);
    e.togglePlayback();
    e.advancePlayback(2.5);
    expect(e.time).toBe(2);
    expect(e.playing).toBe(false);
    e.togglePlayback();
    expect(e.time).toBe(0);
    expect(e.playing).toBe(true);
    e.advancePlayback(0.25);
    e.togglePlayback();
    e.advancePlayback(1);
    expect(e.time).toBe(0.25);
  });
  it('frame steps pause and respect the limits', () => {
    const e = fresh();
    e.togglePlayback();
    e.stepFrame(1);
    expect(e.playing).toBe(false);
    expect(e.time).toBeCloseTo(1 / 30);
    e.stepFrame(-1);
    e.stepFrame(-1);
    expect(e.time).toBe(0);
    e.setTime(99);
    expect(e.time).toBe(3);
    e.stepFrame(1);
    expect(e.time).toBe(3);
  });
  it('the compact clock applies the animated tracks', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.scene!.animation = { duration: 2, loop: false, tracks: [{ id: 'move', node: id, on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100 }] }] };
    e.togglePlayback();
    e.advancePlayback(1);
    expect(e.scene!.objects[0]!.transform?.x).toBeCloseTo(50);
    expect(e.timelineOpen).toBe(false);
  });
});

describe('Centre in the document', () => {
  const refresh = (e: Editor) => {
    const doc = createEngine(builtins).evaluateDocument(e.scene as SceneV1);
    e.infos = doc.nodes;
    e.contentBox = bounds(doc.geometry);
    return doc;
  };
  const expectCentered = (e: Editor, id: string, x: number, y: number) => {
    const b = refresh(e).nodes.get(id)!.box;
    expect(b.x + b.width / 2).toBeCloseTo(x, 6);
    expect(b.y + b.height / 2).toBeCloseTo(y, 6);
  };
  it('centres a drawing with effects and an offset pivot in a moved document; undoes at once', () => {
    const e = fresh();
    const node = e.scene!.objects[0]!;
    e.setDocument({ width: 800, height: 600, x: 120, y: -80 });
    e.selected = node.id;
    e.add('transform');
    e.setParam('x', 75);
    e.setNode(node.id, 'rotation', 32);
    e.setNode(node.id, 'x', 260);
    e.setNode(node.id, 'y', 190, true);
    refresh(e);
    e.setPivot(node.id, [0.1, 0.8], true);
    refresh(e);
    const before = JSON.parse(JSON.stringify(node.transform));
    e.centerNode(node.id);
    expectCentered(e, node.id, 120, -80);
    e.undo();
    expect(e.scene!.objects[0]!.transform).toEqual(before);
  });
  it('centres a child inside a rotated and scaled group', () => {
    const e = fresh();
    const child = e.scene!.objects[0]!;
    e.scene!.objects = [{ id: 'parent', kind: 'group', name: 'Group', children: [child], stack: [], transform: { x: 210, y: -130, rotation: 57, scale: 1.7, flipX: true } }];
    e.setDocument({ width: 800, height: 600 });
    refresh(e);
    e.centerNode(child.id);
    expectCentered(e, child.id, 0, 0);
  });
  it('without a fixed size it uses the current content\'s centre', () => {
    const e = fresh();
    e.setDocument(null);
    const first = e.scene!.objects[0]!;
    e.addShape('rectangle');
    const node = e.currentNode!;
    e.setNode(node.id, 'x', 400, true);
    refresh(e);
    const b = e.contentBox!;
    const center = [b.x + b.width / 2, b.y + b.height / 2];
    e.centerNode(first.id);
    expectCentered(e, first.id, center[0]!, center[1]!);
  });
});

it('Particles follows the scene clock without opening the timeline and undoes in one step', () => {
  const e = fresh();
  e.add('particles');
  expect(e.current!.params!.time).toEqual({ $expr: 'scene.time', fallback: 1 });
  expect(e.animation?.duration).toBe(3);
  expect(e.timelineOpen).toBe(false);
  e.undo();
  expect(stack(e).some((m) => m.type === 'particles')).toBe(false);
  expect(e.animation).toBe(null);
});

it('select all includes every root layer without duplicating group children or changing the history', () => {
  const e = fresh();
  e.addShape('rectangle');
  const child = e.scene!.objects[0]!;
  e.scene!.objects[0] = { kind: 'group', id: 'group', name: 'Group', stack: [], children: [child] };
  e.selected = child.id;
  e.tool = 'ellipse';
  const history = e.historyInfo;
  e.selectAll();
  expect(e.selectedNodes.map((n) => n.id)).toEqual(e.scene!.objects.map((n) => n.id));
  expect(e.isSelected(child.id)).toBe(false);
  expect(e.tool).toBe(null);
  expect(e.historyInfo).toEqual(history);
});


it('new documents start with a fixed 1400×900 size, also when importing or creating the first shape', () => {
  const e = new Editor();
  e.newFile();
  expect(e.scene).toMatchObject({ version: 1, document: { width: 1400, height: 900 }, objects: [] });
  expect(e.dirty).toBe(false);
  e.addShape('rectangle');
  expect(e.scene!.document).toEqual({ width: 1400, height: 900 });
  const shape = new Editor();
  shape.addShape('ellipse');
  expect(shape.scene!.document).toEqual({ width: 1400, height: 900 });
  expect(fresh().scene!.document).toEqual({ width: 1400, height: 900 });
});

it('opening an existing scene in auto keeps its automatic document', () => {
  const e = fresh();
  const scene = JSON.parse(JSON.stringify(e.scene)) as SceneV1;
  delete scene.document;
  expect(e.openProject(JSON.stringify(scene))).toBe(true);
  expect(e.scene!.document).toBeUndefined();
});


it('adding Color shows a direct colour picker by default', () => {
  const e = fresh();
  e.add('color');
  expect(e.current!.params!.mode).toBe('solid');
  expect(e.current!.params!.color).toBe('#D2502F');
});


describe('Composition editing', () => {
  it('creates an empty composition, edits it, saves the entire project and navigates back', () => {
    const e = fresh(); const parentCount = e.scene!.objects.length;
    const id = e.createComposition()!;
    expect(e.scene!.objects.length).toBe(parentCount + 1);
    e.time = 1.25; e.openComposition(id);
    expect(e.compositionPath).toEqual([id]);
    expect(e.scene!.objects).toEqual([]);
    e.addShape('cross');
    expect(e.scene!.objects).toHaveLength(1);
    const saved = JSON.parse(e.projectFile()!);
    expect(saved.scene.objects.find((n: any) => n.id === id).composition.scene.objects).toHaveLength(1);
    e.leaveComposition(0);
    expect(e.compositionPath).toEqual([]);
    expect(e.selected).toBe(id);
    expect(e.time).toBe(1.25);
    expect(e.scene!.objects).toHaveLength(parentCount + 1);
  });
  it('moves a selection and its tracks without changing its geometry, then supports undo inside it', () => {
    const e = fresh();
    const originalId = e.scene!.objects[0]!.id;
    e.scene!.animation = { duration: 2, tracks: [{ id: 'move-comp', node: originalId, on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 50 }] }] };
    const before = box(e);
    const id = e.createComposition(true)!;
    expect(e.scene!.animation!.tracks).toEqual([]);
    expect(e.currentNode?.kind === 'group' && e.currentNode.composition?.scene.animation?.tracks).toHaveLength(1);
    expect(e.currentNode?.id).toBe(id);
    expect(bounds(createEngine(builtins).evaluateDocument(JSON.parse(JSON.stringify(e.scene))).geometry)).toEqual(before);
    e.openComposition(id); const child = e.scene!.objects[0]!;
    e.setNode(child.id, 'name', 'Inside', true);
    e.undo(); expect(e.scene!.objects[0]!.name).not.toBe('Inside');
    e.redo(); expect(e.scene!.objects[0]!.name).toBe('Inside');
    e.leaveComposition(0); e.undo();
    expect(JSON.parse(e.projectFile()!).scene.objects.find((n: any) => n.id === id).composition.scene.objects[0].name).not.toBe('Inside');
  });
  it('imports a project as an isolated scene and opens another project from inside it', () => {
    const e = fresh();
    expect(e.importComposition(JSON.stringify({ svertik: 'project', name: 'Imported', scene: { version: 1, notes: 'Keep these notes', objects: [], document: { width: 800, height: 600 } } }))).toBe(true);
    const id = e.selected!; e.openComposition(id);
    expect(e.scene!.notes).toBe('Keep these notes');
    e.createComposition(); const nested = e.selected!; e.openComposition(nested);
    expect(e.compositionPath).toHaveLength(2);
    const saved = e.projectFile()!;
    e.openProject(saved); expect(e.compositionPath).toEqual([]);
    expect(e.scene!.objects[0]!.name).toBe('Imported');
  });  it('does not insert shapes or drag nodes into the hidden children of a composition', () => {
    const e = fresh(); const original = e.scene!.objects[0]!.id;
    const id = e.createComposition()!;
    e.moveNode(original, id, 0);
    expect(e.scene!.objects).toHaveLength(2);
    e.selected = id; e.addShape('cross');
    expect(e.scene!.objects).toHaveLength(3);
    const n = e.scene!.objects.find(n => n.id === id)!;
    expect(n.kind === 'group' && n.children).toEqual([]);
  });

});

describe('Scale multiple objects', () => {
  const setup = () => {
    const e = new Editor(); e.newFile();
    e.addShape('rectangle', { width: 20, height: 20 }, { x: -50, y: 0 }); const a = e.selected!;
    e.addShape('rectangle', { width: 20, height: 20 }, { x: 50, y: 0 }); const b = e.selected!;
    e.also = [a]; return { e, a, b };
  };
  it('scales geometry and spacing about a shared center without compounding a drag', () => {
    const { e, a, b } = setup(); const scale = e.captureSelectionScale()!;
    scale(2); scale(3); e.flush();
    expect(e.scene!.objects.find(n => n.id === a)!.transform).toMatchObject({ x: -150, scale: 3 });
    expect(e.scene!.objects.find(n => n.id === b)!.transform).toMatchObject({ x: 150, scale: 3 });
    e.undo(); expect(e.scene!.objects.find(n => n.id === a)!.transform?.scale ?? 1).toBe(1);
  });
  it('does not scale a child twice when its parent is also selected', () => {
    const { e, a } = setup(); e.selected = a; e.group(); const group = e.selected!;
    e.also = [a]; e.scaleSelection(2);
    expect(e.scene!.objects.find(n => n.id === group)!.transform?.scale).toBe(2);
    expect(e.scene!.objects.find(n => n.id === group)!.kind === 'group' && (e.scene!.objects.find(n => n.id === group) as any).children[0].transform.scale).toBeUndefined();
  });
  it('scales objects in rotated groups around the selection center in document space', () => {
    const { e, a, b } = setup();
    e.selected = a; e.group(); e.setNode(e.selected!, 'rotation', 45, true);
    e.selected = b; e.group(); e.setNode(e.selected!, 'rotation', -30, true);
    e.selected = a; e.also = [b];
    const before = createEngine(builtins).evaluateDocument(JSON.parse(JSON.stringify(e.scene)));
    const aa = before.nodes.get(a)!.box, bb = before.nodes.get(b)!.box;
    const cx = (Math.min(aa.x, bb.x) + Math.max(aa.x + aa.width, bb.x + bb.width)) / 2;
    e.scaleSelection(2);
    const doc = createEngine(builtins).evaluateDocument(JSON.parse(JSON.stringify(e.scene)));
    const left = doc.nodes.get(a)!.box, right = doc.nodes.get(b)!.box;
    expect(left.x + left.width / 2).toBeCloseTo(-100 - cx);
    expect(right.x + right.width / 2).toBeCloseTo(100 - cx);
    expect(left.width).toBeCloseTo(40 * Math.SQRT2);
  });
});


describe('Time Remap editing', () => {
  it('converts the clock expression to numeric keys and auto-keys subsequent edits', () => {
    const e = fresh(); const id = e.createComposition()!;
    e.setTime(0.5); e.toggleCompositionKey(id, 'time');
    const target = { node: id, on: 'composition' as const, param: 'time' };
    expect(e.track(target)!.keys[0]!.value).toBe(0.5);
    e.setTime(1); e.setCompositionParam(id, 'time', 2);
    expect(e.track(target)!.keys).toHaveLength(2);
    e.setCompositionParam(id, 'time', { $expr: 'scene.time', fallback: 0 });
    expect(e.track(target)).toBeUndefined();
  });
  it('manages markers locally and persists clock modulation', () => {
    const e = fresh(); const id = e.createComposition()!;
    e.setClockModulator(id, 'pulse');
    e.setClockSignalParam(id, 'amplitude', 0.5);
    e.setTime(1); e.addMarker(); const marker = e.animation!.markers![0]!;
    e.setMarker(marker.id, 'name', 'Impact');
    e.setMarker(marker.id, 't', 1.25);
    e.openComposition(id); expect(e.animation!.markers).toBeUndefined();
    e.addMarker(); e.leaveComposition(0);
    expect(e.animation!.markers![0]!.name).toBe('Impact');
    const saved = JSON.parse(e.projectFile()!);
    expect(saved.scene.objects[0].composition.modulation.params.amplitude).toBe(0.5);
    e.removeMarker(marker.id); expect(e.animation!.markers).toEqual([]);
  });
});

it('creates and configures a Mouse Instance without changing the source', () => {
  const e = fresh();
  const source = e.activeNode!;
  const before = JSON.stringify(source);
  e.addMouseInstance();
  const mouse = e.activeNode!;
  expect(mouse).toMatchObject({ kind: 'instance', of: source.id, mouse: {} });
  e.setMouseParam(mouse.id, 'event', 'double-click');
  expect(e.activeNode).toMatchObject({ mouse: { event: 'double-click' } });
  expect(JSON.stringify(locateNode(e.scene!.objects, source.id)!.node)).toBe(before);
});

it('saves Full viewport as opt-in and restores the prior state with undo', () => {
  const e = fresh();
  const doc = JSON.stringify(e.scene!.document);
  expect(e.scene!.fullViewport).toBeUndefined();
  e.setFullViewport(true);
  expect(e.scene!.fullViewport).toBe(true);
  expect(JSON.stringify(e.scene!.document)).toBe(doc);
  e.undo();
  expect(e.scene!.fullViewport).toBeUndefined();
  e.setFullViewport(true);
  e.setFullViewport(false);
  expect(e.scene!.fullViewport).toBeUndefined();
});

it('keeps infinite editor time across duration, pause/resume and duration edits, with scene Loop disabled', () => {
  const e = fresh();
  e.setInfiniteTime(true);
  e.setDuration(10);
  e.setLoop(true);
  expect(e.animation).toMatchObject({ infinite: true, loop: false, duration: 10 });
  e.togglePlayback();
  e.advancePlayback(180);
  expect(e.time).toBe(180);
  expect(e.playing).toBe(true);
  e.togglePlayback();
  e.togglePlayback();
  expect(e.time).toBe(180);
  e.setDuration(5);
  expect(e.time).toBe(180);
  e.setInfiniteTime(false);
  expect(e.time).toBe(5);
  expect(e.animation?.loop).toBe(false);
});

describe('AI agent round trip', () => {
  it('copies the scene with a prompt, and applies the scene in the answer as one undo step', () => {
    const e = fresh();
    e.addShape('star', { fillColor: '#123456' });
    const prompt = e.agentPrompt()!;
    expect(prompt).toContain('https://svertik.com/docs/engine/');
    expect(prompt).toContain('"#123456"');
    // No notes: the agent is asked to ask what the scene is for, and to keep the answer as notes.
    expect(prompt).toContain('has no notes yet');
    e.scene!.notes = 'A poster for a jazz night.';
    expect(e.agentPrompt()).not.toContain('has no notes yet');
    const scene = JSON.parse(prompt.match(/```json\n([\s\S]*?)```/)![1]!);
    scene.objects[0].params.fillColor = '#ff0000';
    // An answer with words around a fenced block.
    const answer = 'Done! Here is the scene:\n```json\n' + JSON.stringify(scene) + '\n```\nEnjoy.';
    expect(e.fromAgent(answer)).toBe('applied');
    const fill = () => (e.scene!.objects[0]!.kind === 'shape' ? e.scene!.objects[0]!.params.fillColor : null);
    expect(fill()).toBe('#ff0000');
    e.undo();
    expect(fill()).toBe('#123456');
  });

  it('says what is selected, so "this" in the request has a meaning', () => {
    const e = fresh();
    e.addShape('star');
    const star = e.scene!.objects[0]!;
    e.add('twist');
    expect(e.agentPrompt()).toContain(`object "${star.name}" (id "${star.id}"), effect "Twist"`);
  });

  it('sends long embedded data as a stand-in and puts it back from the answer', () => {
    const e = fresh();
    e.addShape('star');
    const big = '<svg xmlns="http://www.w3.org/2000/svg">' + '<path d="M0 0L10 10"/>'.repeat(200) + '</svg>';
    e.scene!.objects.push({ kind: 'object', id: 'logo', name: 'Logo', source: big, stack: [] } as never);
    const prompt = e.agentPrompt()!;
    expect(prompt).not.toContain('<path d=');
    expect(prompt).toContain('svertik:kept:1');
    const scene = JSON.parse(prompt.match(/```json\n([\s\S]*?)```/)![1]!);
    scene.objects[0].name = 'Renamed';
    expect(e.fromAgent(JSON.stringify(scene))).toBe('applied');
    const logo = e.scene!.objects.find((n) => n.id === 'logo') as { source?: string };
    expect(logo.source).toBe(big);
    // A stand-in this editor never gave out cannot be restored: reported, not applied.
    scene.objects[1].source = 'svertik:kept:99';
    expect(e.fromAgent(JSON.stringify(scene))).toBe('invalid');
  });

  it('leaves ordinary pastes alone and reports a broken scene', () => {
    const e = fresh();
    e.addShape('star');
    expect(e.fromAgent('just some text')).toBe('none');
    expect(e.fromAgent('{"version": 1, "objects": [{"kind": "shape", "id": "a", "name": "A", "shape": "nope", "params": {}, "stack": []}]}')).toBe('invalid');
    expect(e.notice).toBeTruthy();
    // A message for the agent, listing what to fix.
    expect(e.agentFixRequest).toContain('does not validate');
    expect(e.agentFixRequest).toContain('nope');
  });
});

describe('rail colours: None', () => {
  it('turns the selection\'s fill or stroke off, keeping its colour; picking a colour turns it back on', () => {
    const e = fresh();
    e.addShape('star', { fillColor: '#123456' });
    const star = () => e.scene!.objects[0] as { params: Record<string, unknown> };
    e.setFillNone();
    expect(star().params.fill).toBe(false);
    expect(star().params.fillColor).toBe('#123456');
    expect(e.currentFillOff).toBe(true);
    e.setFillColor('#ff0000');
    expect(star().params.fill).toBe(true);
    expect(e.currentFillOff).toBe(false);
    e.setOutlineColor('#00ff00');
    expect(e.currentStrokeOff).toBe(false);
    e.setStrokeNone();
    expect(star().params.stroke).toBe(false);
    expect(e.currentStrokeOff).toBe(true);
  });

  it('without a selection, new primitives come without fill', () => {
    const e = fresh();
    e.selected = null;
    e.setFillNone();
    expect(e.currentFillOff).toBe(true);
    e.addShape('rectangle');
    expect((e.scene!.objects[0] as { params: Record<string, unknown> }).params.fill).toBe(false);
  });
});

describe('swap fill and stroke', () => {
  it('swaps the colours and which one is on, for the selection or for new primitives', () => {
    const e = fresh();
    e.addShape('star', { fillColor: '#111111', strokeColor: '#eeeeee', stroke: false });
    e.swapFillStroke();
    const p = (e.scene!.objects[0] as { params: Record<string, unknown> }).params;
    expect([p.fillColor, p.strokeColor, p.fill, p.stroke]).toEqual(['#eeeeee', '#111111', false, true]);
    e.selected = null;
    e.fillColor = '#ff0000'; e.strokeColor = '#0000ff'; e.strokeOn = false;
    e.swapFillStroke();
    expect([e.fillColor, e.strokeColor, e.fillOn, e.strokeOn]).toEqual(['#0000ff', '#ff0000', false, true]);
  });
});
