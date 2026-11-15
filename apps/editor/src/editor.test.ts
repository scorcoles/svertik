import { describe, expect, it } from 'vitest';
import { apply, placementOf, bounds, builtins, createEngine, type SceneV1 } from '@svertik/engine';
import { Editor, locateNode } from './editor.svelte';
import { samples } from './samples';

// El objeto de partida (grid.svg); lo nuevo entra arriba de la lista, así que es el último.
const stack = (e: Editor) => e.scene!.objects.at(-1)!.stack;

/** La caja de lo dibujado en el documento, para comprobar que nada se mueve. */
const box = (e: Editor) => bounds(createEngine(builtins).evaluateDocument(e.scene as SceneV1).geometry);

const fresh = () => {
  const e = new Editor();
  e.load(samples.grid, 'grid.svg');
  return e;
};

describe('Editor', () => {
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

  it('añadir coloca el efecto debajo del seleccionado y lo selecciona', () => {
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

  it('quitar selecciona el siguiente', () => {
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

  it('deshacer justo después de arrastrar un valor deshace solo ese valor', () => {
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

  it('rechaza lo que no es SVG', () => {
    const e = new Editor();
    e.load('hola', 'x.txt');
    expect(e.scene).toBeNull();
    expect(e.error).toMatch(/SVG/);
  });
});

describe('marcador del punto', () => {
  it('aparece al mover un punto y se va a los 300 ms de parar', async () => {
    const e = fresh();
    e.add('spherize');
    e.setParam('center', [0.3, 0.6]);
    expect(e.marker).toEqual([0.3, 0.6]);
    await new Promise((r) => setTimeout(r, 200));
    e.setParam('center', [0.35, 0.6]); // sigue moviéndolo: se reinicia la cuenta
    await new Promise((r) => setTimeout(r, 200));
    expect(e.marker).toEqual([0.35, 0.6]);
    await new Promise((r) => setTimeout(r, 150));
    expect(e.marker).toBeNull();
  });

  it('los parámetros que no son puntos no lo muestran', () => {
    const e = fresh();
    e.add('spherize');
    e.setParam('strength', 0.2);
    expect(e.marker).toBeNull();
  });
});

describe('Step con hijos', () => {
  it('con Step seleccionado, lo que se añade entra dentro; con un hijo seleccionado, debajo de él', () => {
    const e = fresh();
    e.add('clone');
    e.add('step');
    e.add('twist');
    e.add('spherize');
    const step = stack(e)[1]!;
    expect(step.children!.map((m) => m.type)).toEqual(['twist', 'spherize']);
    expect(e.currentParent?.id).toBe(step.id);
  });

  it('un Step no entra en otro: va a la pila principal', () => {
    const e = fresh();
    e.add('step');
    e.add('step');
    expect(stack(e).map((m) => m.type)).toEqual(['step', 'step']);
  });

  it('moveTo mete y saca de Step; quitar un hijo selecciona su vecino o el Step', () => {
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

  it('los parámetros de un hijo se editan igual', () => {
    const e = fresh();
    e.add('step');
    e.add('transform');
    e.setParam('rotation', 10);
    expect(stack(e)[0]!.children![0]!.params!.rotation).toBe(10);
  });
});

describe('RGB Split con efectos dentro', () => {
  it('con RGB Split seleccionado, Blur y Step entran dentro; otro RGB Split va debajo', () => {
    const e = fresh();
    e.add('rgbsplit');
    const rgb = e.current!.id;
    e.add('blur');
    e.selected = rgb;
    e.add('step');
    expect(stack(e)[0]!.children!.map((m) => m.type)).toEqual(['blur', 'step']);
    // Dentro del Step de dentro: un efecto normal entra, debajo del seleccionado.
    e.add('transform');
    e.add('noise');
    expect(stack(e)[0]!.children![1]!.children!.map((m) => m.type)).toEqual(['transform', 'noise']);
    // Con el propio RGB Split seleccionado, otro RGB Split no entra: va debajo, en la pila.
    e.selected = rgb;
    e.add('rgbsplit');
    expect(stack(e).map((m) => m.type)).toEqual(['rgbsplit', 'rgbsplit']);
  });
  it('RGB Split puede ir dentro de Step, pero no dentro de sí mismo', () => {
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
  it('cambia los parámetros del seleccionado y se deshace con un paso', () => {
    const e = fresh();
    e.add('spherize');
    const before = JSON.stringify(e.current!.params);
    e.randomize(undefined, 42);
    expect(JSON.stringify(e.current!.params)).not.toBe(before);
    e.undo();
    expect(JSON.stringify(e.current!.params)).toBe(before);
  });
});

describe('varios objetos y grupos', () => {
  it('lo nuevo entra arriba de la lista (delante) y queda seleccionado; los efectos van a su pila', () => {
    const e = fresh();
    e.add('wave');
    e.load(samples.star, 'star.svg');
    expect(e.scene!.objects.map((n) => n.name)).toEqual(['star.svg', 'grid.svg']);
    expect(e.currentNode?.name).toBe('star.svg');
    e.add('twist');
    expect(e.scene!.objects[0]!.stack.map((m) => m.type)).toEqual(['twist']);
    expect(e.activeNode?.name).toBe('star.svg');
  });

  it('agrupar y desagrupar dejan los nodos en su sitio', () => {
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

  it('un grupo no entra en sí mismo', () => {
    const e = fresh();
    e.group(e.scene!.objects[0]!.id);
    const g = e.scene!.objects[0]!.id;
    e.moveNode(g, g, 0);
    expect(e.scene!.objects[0]!.id).toBe(g);
  });

  it('posición, opacidad y visibilidad de un nodo, con deshacer', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.setNode(id, 'x', 30, true);
    e.setNode(id, 'opacity', 0.5, true);
    expect(e.scene!.objects[0]).toMatchObject({ transform: { x: 30 }, opacity: 0.5 });
    e.undo();
    expect(e.scene!.objects[0]!.opacity).toBeUndefined();
  });

  it('applyScene sustituye la escena (y no hace nada si es igual)', () => {
    const e = fresh();
    const next = JSON.parse(JSON.stringify(e.scene)) as typeof e.scene & object;
    expect(e.applyScene(next)).toBe(false);
    next.objects.at(-1)!.stack.push({ id: 'x', type: 'wave' });
    expect(e.applyScene(next)).toBe(true);
    expect(stack(e).map((m) => m.type)).toEqual(['wave']);
  });
});

describe('primitivas', () => {
  it('sin escena, añadir una primitiva la crea; los nombres no se repiten', () => {
    const e = new Editor();
    e.addShape('star');
    e.addShape('star', { points: 7 }, { x: 50, y: 0 });
    expect(e.scene!.objects.map((n) => n.name)).toEqual(['Star 2', 'Star']);
    const second = e.scene!.objects[0]!;
    expect(second).toMatchObject({ kind: 'shape', shape: 'star', transform: { x: 50, y: 0 } });
    expect((second as { params: Record<string, unknown> }).params.points).toBe(7);
    expect(e.currentNode?.id).toBe(second.id);
  });

  it('con un grupo seleccionado, la primitiva entra en él; sus parámetros se editan y se deshacen', () => {
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

  it('los colores del rail: sin selección son los de las primitivas nuevas, con selección los suyos', () => {
    const e = new Editor();
    // Sin nada: los selectores muestran (y cambian) los valores de las primitivas nuevas.
    expect(e.currentFill).toBe('#333333');
    expect(e.currentOutline).toBe('#ededed');
    e.setFillColor('#ff0000');
    e.setOutlineColor('#00ff00');
    expect(e.fillColor).toBe('#ff0000');
    expect(e.strokeColor).toBe('#00ff00');
    expect(e.strokeOn).toBe(true);

    // La primitiva nueva nace con esos valores.
    e.addShape('star');
    const id = e.currentNode!.id;
    const shape = () => (locateNode(e.scene!.objects, id)!.node as { params: Record<string, unknown> }).params;
    expect(shape()).toMatchObject({ fillColor: '#ff0000', strokeColor: '#00ff00', stroke: true });

    // Con la primitiva seleccionada, el selector edita su relleno/contorno y no los de las nuevas.
    e.setFillColor('#0000ff');
    e.setOutlineColor('#ffffff');
    expect(shape()).toMatchObject({ fillColor: '#0000ff', strokeColor: '#ffffff' });
    expect(e.fillColor).toBe('#ff0000');
    expect(e.strokeColor).toBe('#00ff00');

    // Con un grupo elegido, el color llega a las primitivas de dentro.
    e.group();
    e.setFillColor('#123456');
    expect(shape()).toMatchObject({ fillColor: '#123456' });
  });
});

describe('copiar y pegar', () => {
  it('pega objetos con ids nuevos, desplazados, encima del original y seleccionados', () => {
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
    // Pegar otra vez lo mismo: un paso más allá.
    e.paste(text);
    expect(e.scene!.objects[0]!.transform).toMatchObject({ x: 32, y: 32 });
  });

  it('pegar en el mismo sitio (⌘⇧V): sin desplazamiento, aunque se pegue varias veces', () => {
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

  it('un efecto copiado se pega en el objeto activo, debajo del seleccionado', () => {
    const e = fresh();
    e.add('wave');
    e.add('twist');
    e.selected = stack(e)[0]!.id;
    e.paste(e.copySelection()!);
    expect(stack(e).map((m) => m.type)).toEqual(['wave', 'wave', 'twist']);
    expect(new Set(stack(e).map((m) => m.id)).size).toBe(3);
  });

  it('nombres al pegar: «copy», «copy 2»… solo si el nombre ya existe', () => {
    const e = fresh();
    const name = e.scene!.objects[0]!.name;
    e.selected = e.scene!.objects[0]!.id;
    e.duplicate();
    e.duplicate();
    e.selected = e.scene!.objects.at(-1)!.id;
    e.duplicate();
    expect(e.scene!.objects.map((n) => n.name)).toEqual([`${name} copy 2`, `${name} copy`, `${name} copy 3`, name]);
    // En un documento donde no existe, conserva su nombre.
    const other = new Editor();
    other.paste(e.copySelection()!);
    expect(other.scene!.objects[0]!.name).toBe(`${name} copy 3`);
  });

  it('duplicar varios a la vez; texto ajeno no se pega', () => {
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

describe('barra de booleanos', () => {
  it('agrupa y aplica el modo; sobre el grupo, solo cambia el modo', () => {
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

describe('atajo de Boolean', () => {
  it('con varios seleccionados, los agrupa y le pone Boolean al grupo', () => {
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
  it('mueve un efecto a la pila de otro objeto; con copia, deja el original', () => {
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

describe('orden de los objetos', () => {
  it('al frente, subir, bajar y al fondo (el primero de la lista, delante)', () => {
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

describe('animación en el editor', () => {
  it('el rombo crea la pista; cambiar el valor en otro instante añade una clave; quitarla todas deja de animar', () => {
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

describe('animar el encendido y repetir', () => {
  it('con «enabled» animado, el ojo pone una clave; la pista lo apaga y enciende al mover el cabezal', () => {
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
  it('setRepeat guarda las vueltas y cada cuánto; 1 lo quita', () => {
    const e = fresh();
    e.applyPreset('rise');
    const tr = e.animation!.tracks[0]!;
    e.setRepeat(tr.id, 3, 2);
    expect([tr.repeat, tr.every]).toEqual([3, 2]);
    e.setRepeat(tr.id, 1);
    expect([tr.repeat, tr.every]).toEqual([undefined, undefined]);
  });
});

describe('presets de animación', () => {
  it('Rise añade un Stagger con sus efectos y dos claves de Progress', () => {
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

describe('proyecto .svrtk', () => {
  it('guardar y volver a abrir deja el documento igual (y vale el JSON de la escena a secas)', () => {
    const e = fresh();
    e.add('wave');
    e.setName('mi-proyecto');
    const id = e.scene!.objects[0]!.id;
    e.toggleKey({ node: id, on: 'node', param: 'rotation' });
    const file = e.projectFile()!;
    const other = new Editor();
    expect(other.openProject(file)).toBe(true);
    expect(other.name).toBe('mi-proyecto');
    // Igual salvo lo que escribe el instante actual (el giro animado queda como 0 explícito).
    expect(JSON.stringify(other.scene!.animation)).toBe(JSON.stringify(e.scene!.animation));
    expect(other.scene!.objects.map((n) => [n.id, n.name, n.stack.map((m) => m.type)])).toEqual(e.scene!.objects.map((n) => [n.id, n.name, n.stack.map((m) => m.type)]));
    expect(new Editor().openProject(JSON.stringify(e.scene))).toBe(true);
    expect(new Editor().openProject('hola')).toBe(false);
  });
});

describe('interacciones en el editor', () => {
  it('añadir, cambiar y quitar; los destinos incluyen la colocación y los valores de sus efectos', () => {
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
  it('añadir, cambiar de acción y quitar, con deshacer', () => {
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

  it('autoplay se guarda en la animación', () => {
    const e = fresh();
    e.setAutoplay(false);
    expect(e.scene!.animation?.autoplay).toBe(false);
  });
});

describe('Archivo y pistas', () => {
  it('quitar un efecto animado se lleva su pista; arrastrar una clave encadena movimientos', () => {
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

  it('cambios sin guardar y archivo nuevo', () => {
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
  it('empaqueta el activo, se deshace y se desempaqueta', () => {
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
  it('hace un objeto por forma dentro de un grupo que conserva el sitio, la pila y la animación', () => {
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

  it('con una sola forma avisa y no toca el objeto', () => {
    const e = new Editor();
    e.load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', 'one.svg');
    const id = e.scene!.objects[0]!.id;
    e.selected = id;
    e.expand(id);
    expect(e.scene!.objects[0]!.kind).toBe('object');
    expect(e.notice).toContain('one shape');
  });
});

describe('Código y línea de tiempo', () => {
  it('abrir uno cierra el otro; cerrar la línea de tiempo la para', () => {
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
  it('tamaño fijo, ajustado a lo dibujado, y vuelta a automático', () => {
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
  it('el peso disponible más cercano y la cursiva solo si la familia la tiene', async () => {
    const { nearest } = await import('./fonts');
    const f = { family: 'X', category: 'sans' as const, weights: [300, 400, 700], italic: false, pick: false };
    expect(nearest(f, 900, true)).toEqual({ weight: 700, italic: false });
    expect(nearest(f, 350, false)).toEqual({ weight: 300, italic: false });
  });
});

describe('Utils: Instance', () => {
  it('crea la instancia delante del original, desplazada, y se puede cambiar de original y deshacer', () => {
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
    // Nunca de sí misma.
    e.setInstanceOf(inst.id, inst.id);
    expect(locateNode(e.scene!.objects, inst.id)!.node).toMatchObject({ of: star });
    e.undo();
    expect(locateNode(e.scene!.objects, inst.id)!.node).toMatchObject({ of: orig.id });
  });
});

describe('Utils: Effector', () => {
  it('nace con los seleccionados como targets; sus efectos van a su pila; targets y delay se cambian con deshacer', () => {
    const e = fresh();
    const a = e.scene!.objects[0]!.id;
    e.addShape('star');
    const b = e.scene!.objects[0]!.id;
    e.selected = a;
    e.toggleSelect(b);
    e.addEffector();
    const eff = e.scene!.objects[0]!;
    expect(eff.kind).toBe('effector');
    expect(eff.kind === 'effector' && eff.targets).toEqual([b, a]); // en el orden de la lista (de arriba abajo)
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
  it('crea una línea con Connect entre los dos seleccionados y deja seleccionado el efecto', () => {
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
  it('crea una línea con Trace del objeto activo, justo detrás de él', () => {
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
});

describe('paletas', () => {
  it('aplicar una paleta cambia los colores (se deshace); guardar y borrar las propias', () => {
    const e = new Editor();
    e.addShape('rectangle', { fillColor: '#ffffff' });
    e.addShape('ellipse', { fillColor: '#000000' });
    e.applyPalette('Ember');
    const fills = () => e.scene!.objects.map((n) => (n.kind === 'shape' ? n.params.fillColor : null));
    // El blanco, al más claro de Ember; el negro, al más oscuro.
    expect(fills()).toEqual(['#1c0f13', '#fdebc8']);
    e.undo();
    expect(fills()).toEqual(['#000000', '#ffffff']);

    expect(e.savePalette('Mine')).toBe(true);
    expect(e.palettes.find((p) => p.name === 'Mine')?.colors.length).toBeGreaterThanOrEqual(2);
    expect(e.paletteName).toBe('Mine');
    // No se puede pisar una de serie.
    expect(e.savePalette('Ember')).toBe(false);
    e.deletePalette('Mine');
    expect(e.palettes.some((p) => p.name === 'Mine')).toBe(false);
    expect(e.paletteName).toBe('In this document');
  });
});

describe('seguir al puntero', () => {
  it('pointer va con follow (posición); los puntos de los efectos y los números se pueden seguir', () => {
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
    // Volver a hover lo deja como un tween normal.
    e.setInteractionTrigger(it().id, 'hover');
    expect(it().action).toBe('tween');
    expect(it().range).toBeUndefined();
  });
});

describe('Reproducción sin timeline', () => {
  it('reproduce y recorre el bucle sin abrir el panel ni modificar el proyecto', () => {
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
  it('cerrar el panel no interrumpe la reproducción', () => {
    const e = fresh();
    e.timelineOpen = true;
    e.togglePlayback();
    e.timelineOpen = false;
    e.advancePlayback(0.5);
    expect(e.playing).toBe(true);
    expect(e.time).toBe(0.5);
  });
  it('respeta el final sin bucle y vuelve al inicio al reproducir otra vez', () => {
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
  it('los pasos de fotograma pausan y respetan los límites', () => {
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
  it('el reloj compacto aplica las pistas animadas', () => {
    const e = fresh();
    const id = e.scene!.objects[0]!.id;
    e.scene!.animation = { duration: 2, loop: false, tracks: [{ id: 'move', node: id, on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100 }] }] };
    e.togglePlayback();
    e.advancePlayback(1);
    expect(e.scene!.objects[0]!.transform?.x).toBeCloseTo(50);
    expect(e.timelineOpen).toBe(false);
  });
});

describe('Centrar en el documento', () => {
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
  it('centra el dibujo con efectos y pivote desplazado en un documento movido; se deshace de una vez', () => {
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
  it('centra un hijo dentro de un grupo girado y escalado', () => {
    const e = fresh();
    const child = e.scene!.objects[0]!;
    e.scene!.objects = [{ id: 'parent', kind: 'group', name: 'Group', children: [child], stack: [], transform: { x: 210, y: -130, rotation: 57, scale: 1.7, flipX: true } }];
    e.setDocument({ width: 800, height: 600 });
    refresh(e);
    e.centerNode(child.id);
    expectCentered(e, child.id, 0, 0);
  });
  it('sin tamaño fijo usa el centro del contenido actual', () => {
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

it('Particles sigue el reloj de la escena sin abrir el timeline y se deshace en un paso', () => {
  const e = fresh();
  e.add('particles');
  expect(e.current!.params!.time).toEqual({ $expr: 'scene.time', fallback: 1 });
  expect(e.animation?.duration).toBe(3);
  expect(e.timelineOpen).toBe(false);
  e.undo();
  expect(stack(e).some((m) => m.type === 'particles')).toBe(false);
  expect(e.animation).toBe(null);
});

it('seleccionar todo incluye todas las capas raíz sin duplicar los hijos de grupos ni cambiar el historial', () => {
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


it('los documentos nuevos nacen con un tamaño fijo de 1400×900, también al importar o crear la primera forma', () => {
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

it('abrir una escena existente en auto conserva su documento automático', () => {
  const e = fresh();
  const scene = JSON.parse(JSON.stringify(e.scene)) as SceneV1;
  delete scene.document;
  expect(e.openProject(JSON.stringify(scene))).toBe(true);
  expect(e.scene!.document).toBeUndefined();
});


it('añadir Color muestra un selector de color directo por defecto', () => {
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
