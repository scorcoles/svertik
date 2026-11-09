import { describe, expect, it } from 'vitest';
import { Editor } from './editor.svelte';
import { samples } from './samples';

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
    e.selected = e.scene!.stack[0]!.id;
    e.add('twist');
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['spherize', 'twist', 'wave']);
    expect(e.current?.type).toBe('twist');
  });

  it('quitar selecciona el siguiente', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.selected = e.scene!.stack[0]!.id;
    e.remove();
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['wave']);
    expect(e.current?.type).toBe('wave');
  });

  it('mover reordena', () => {
    const e = fresh();
    e.add('spherize');
    e.add('wave');
    e.move(e.scene!.stack[1]!.id, 0);
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['wave', 'spherize']);
  });

  it('deshacer justo después de arrastrar un valor deshace solo ese valor', () => {
    const e = fresh();
    e.add('crack');
    e.setParam('growth', 0.5); // queda pendiente (agrupado)
    e.undo();
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['crack']);
    expect(e.current?.params?.growth).toBe(1);
    e.redo();
    expect(e.current?.params?.growth).toBe(0.5);
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
    const step = e.scene!.stack[1]!;
    expect(step.children!.map((m) => m.type)).toEqual(['twist', 'spherize']);
    expect(e.currentParent?.id).toBe(step.id);
  });

  it('un Step no entra en otro: va a la pila principal', () => {
    const e = fresh();
    e.add('step');
    e.add('step');
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['step', 'step']);
  });

  it('moveTo mete y saca de Step; quitar un hijo selecciona su vecino o el Step', () => {
    const e = fresh();
    e.add('wave');
    const wave = e.current!.id;
    e.add('step');
    const step = e.current!.id;
    e.moveTo(wave, step, 0);
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['step']);
    expect(e.scene!.stack[0]!.children!.map((m) => m.type)).toEqual(['wave']);
    e.remove(wave);
    expect(e.selected).toBe(step);
    e.add('noise');
    e.moveTo(e.current!.id, null, 0);
    expect(e.scene!.stack.map((m) => m.type)).toEqual(['noise', 'step']);
  });

  it('los parámetros de un hijo se editan igual', () => {
    const e = fresh();
    e.add('step');
    e.add('transform');
    e.setParam('rotation', 10);
    expect(e.scene!.stack[0]!.children![0]!.params!.rotation).toBe(10);
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
