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
    expect(e.scene).toBeNull();
    expect(e.dirty).toBe(false);
  });
});
