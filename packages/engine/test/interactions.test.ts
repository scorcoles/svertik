import { describe, expect, it } from 'vitest';
import { builtins, createEngine, createInteractions, type SceneV2 } from '../src';

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

describe('interacciones: acciones', () => {
  const base = (interactions: SceneV2['interactions']): SceneV2 => ({
    version: 2,
    objects: [{ kind: 'shape', id: 'b', name: 'b', shape: 'star', params: {}, stack: [{ id: 'g', type: 'slices', params: { seed: 1 } }, { id: 'w', type: 'wave', params: {} }] }],
    animation: { duration: 2, autoplay: false, tracks: [] },
    interactions,
  });

  it('play: el cabezal recorre el tramo al entrar y vuelve al salir', () => {
    const sc = base([{ id: 'p', node: 'b', trigger: 'hover', action: 'play', target: { node: 'b', on: 'node', param: 'x' }, to: 0, duration: 0, segment: [0.5, 1.5] }]);
    const it = createInteractions(() => sc);
    it.event('enter', 'b');
    it.step(0.4);
    expect(it.playhead()).toBeCloseTo(0.9);
    it.step(5);
    expect(it.playhead()).toBeCloseTo(1.5);
    it.event('leave', null);
    it.step(0.5);
    expect(it.playhead()).toBeCloseTo(1);
  });

  it('seed: una semilla nueva en cada clic; toggle: apaga el efecto', () => {
    const sc = base([
      { id: 's', node: 'b', trigger: 'click', action: 'seed', target: { node: 'b', on: 'modifier', modifier: 'g', param: 'seed' }, to: 0, duration: 0 },
      { id: 't', node: 'b', trigger: 'click', action: 'toggle', target: { node: 'b', on: 'modifier', modifier: 'w', param: '' }, to: 0, duration: 0 },
    ]);
    const it = createInteractions(() => sc);
    it.event('click', 'b');
    const out = it.apply(sc);
    expect(out.objects[0]!.stack[0]!.params!.seed).not.toBe(1);
    expect(out.objects[0]!.stack[1]!.enabled).toBe(false);
    it.event('click', 'b');
    expect(it.apply(sc).objects[0]!.stack[1]!.enabled ?? true).toBe(true);
  });

  it('enter: se dispara cuando el dibujo entra en pantalla', () => {
    const sc = base([{ id: 'e', node: 'b', trigger: 'enter', action: 'tween', target: { node: 'b', on: 'node', param: 'scale' }, to: 2, duration: 1, ease: 'linear' }]);
    const it = createInteractions(() => sc);
    it.event('view', null);
    it.step(0.5);
    expect(it.apply(sc).objects[0]!.transform?.scale).toBeCloseTo(1.5);
  });
});

describe('follow (pointer)', () => {
  const doc = (sc: SceneV2) => createEngine(builtins).evaluateDocument({ ...sc, document: { width: 200, height: 100 } });
  const base = (follow: Record<string, unknown>): SceneV2 => ({
    version: 2,
    document: { width: 200, height: 100 },
    objects: [{ kind: 'shape', id: 'a', name: 'a', shape: 'rectangle', params: { width: 20, height: 20 }, stack: [{ id: 'sp', type: 'spherize', params: { center: [0.5, 0.5] } }] }],
    interactions: [{ id: 'f', node: 'a', trigger: 'pointer', action: 'follow', target: { node: 'a', on: 'node', param: 'position' }, to: null, duration: 0, ...follow }],
  });

  it('la posición va bajo el puntero y vuelve a su sitio al salir', () => {
    const sc = base({});
    const it = createInteractions(() => sc);
    it.pointer([40, -20], doc(sc));
    it.step(1 / 30);
    expect(it.apply(sc).objects[0]!.transform).toMatchObject({ x: 40, y: -20 });
    it.pointer(null, null);
    it.step(1 / 30);
    expect(it.apply(sc).objects[0]!.transform ?? { x: 0, y: 0 }).toMatchObject({ x: 0, y: 0 });
    expect(it.isActive()).toBe(false);
  });

  it('con inercia, se acerca poco a poco; con stay, se queda al salir', () => {
    const sc = base({ duration: 0.5, stay: true });
    const it = createInteractions(() => sc);
    it.pointer([90, 0], doc(sc));
    it.step(0.1);
    const x1 = it.apply(sc).objects[0]!.transform!.x!;
    expect(x1).toBeGreaterThan(5);
    expect(x1).toBeLessThan(40);
    for (let i = 0; i < 60; i++) it.step(0.1);
    it.pointer(null, null);
    it.step(0.1);
    expect(it.apply(sc).objects[0]!.transform!.x).toBeCloseTo(90, 1);
  });

  it('un punto de un efecto: en fracciones de su caja (el centro de Spherize, bajo el puntero)', () => {
    const sc = base({ target: { node: 'a', on: 'modifier', modifier: 'sp', param: 'center' } });
    const it = createInteractions(() => sc);
    // La caja del rectángulo va de -10 a 10: el puntero en (10, 0) es la fracción (1, 0,5).
    it.pointer([10, 0], doc(sc));
    it.step(1 / 30);
    expect((it.apply(sc).objects[0]!.stack[0]!.params as { center: number[] }).center).toEqual([1, 0.5]);
  });

  it('un número recorre su rango a lo ancho del documento (o a lo alto)', () => {
    const sc = base({ target: { node: 'a', on: 'node', param: 'rotation' }, range: [0, 180], axis: 'x' });
    const it = createInteractions(() => sc);
    it.pointer([50, 0], doc(sc)); // de -100 a 100: el 75 %
    it.step(1 / 30);
    expect(it.apply(sc).objects[0]!.transform!.rotation).toBeCloseTo(135);
  });
});
