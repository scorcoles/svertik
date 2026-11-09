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
