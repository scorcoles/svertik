import { describe, expect, it } from 'vitest';
import { Editor, locateNode } from './editor.svelte';
import { samples } from './samples';

// El objeto de partida (grid.svg); lo nuevo entra arriba de la lista, así que es el último.
const stack = (e: Editor) => e.scene!.objects.at(-1)!.stack;

const fresh = () => {
  const e = new Editor();
  e.load(samples.grid, 'grid.svg');
  return e;
};

describe('Editor', () => {
  it('añadir coloca el efecto debajo del seleccionado y lo selecciona', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.selected = stack(e)[0]!.id;
    e.add('twist');
    expect(stack(e).map((m) => m.type)).toEqual(['spherize', 'twist', 'wave']);
    expect(e.current?.type).toBe('twist');
  });

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

  it('quitar el único objeto vuelve al estado vacío', () => {
    const e = fresh();
    e.remove(e.scene!.objects[0]!.id);
    expect(e.scene).toBeNull();
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

  it('applyScene acepta una v1 y la convierte', () => {
    const e = fresh();
    e.applyScene({ version: 1, source: samples.rings, stack: [{ id: 'x', type: 'wave' }] });
    expect(e.scene!.version).toBe(2);
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
