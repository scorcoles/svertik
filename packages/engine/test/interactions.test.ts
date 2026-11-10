import { describe, expect, it } from 'vitest';
import { createInteractions, type SceneV2 } from '../src';

const scene = (): SceneV2 => ({
  version: 2,
  objects: [
    { kind: 'group', id: 'g', name: 'g', stack: [], children: [{ kind: 'shape', id: 'a', name: 'a', shape: 'star', params: {}, stack: [] }] },
    { kind: 'shape', id: 'b', name: 'b', shape: 'star', params: {}, stack: [] },
  ],
  interactions: [
    { id: 'h', node: 'g', trigger: 'hover', target: { node: 'g', on: 'node', param: 'scale' }, to: 2, duration: 1, ease: 'linear' },
    { id: 'c', node: 'b', trigger: 'click', target: { node: 'b', on: 'node', param: 'rotation' }, to: 90, duration: 0.5, ease: 'linear' },
  ],
});

describe('interacciones', () => {
  it('hover: el grupo crece al pasar por un hijo y vuelve al salir, desde donde esté', () => {
    const sc = scene();
    const it = createInteractions(() => sc);
    it.event('enter', 'a');
    it.step(0.5);
    expect(it.apply(sc).objects[0]!.transform?.scale).toBeCloseTo(1.5);
    it.event('leave', null);
    it.step(0.25);
    expect(it.apply(sc).objects[0]!.transform?.scale).toBeCloseTo(1.25);
    // La escena original no se toca.
    expect(sc.objects[0]!.transform).toBeUndefined();
  });

  it('clic: alterna entre ir y volver', () => {
    const sc = scene();
    const it = createInteractions(() => sc);
    it.event('click', 'b');
    expect(it.step(1)).toBe(true);
    expect(it.apply(sc).objects[1]!.transform?.rotation).toBeCloseTo(90);
    it.event('click', 'b');
    it.step(1);
    expect(it.apply(sc).objects[1]!.transform?.rotation ?? 0).toBeCloseTo(0);
    expect(it.step(1)).toBe(false);
  });
});
