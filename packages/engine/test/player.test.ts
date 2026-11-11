import { describe, expect, it } from 'vitest';
import { builtins, type SceneV2 } from '../src';
import { effectLoaders, effectTypes } from '../src/modifiers/manifest';
import { prepareScene, sceneEffectTypes, sceneHasText, sceneNeedsImporter } from '../src/prepare';

describe('manifiesto de efectos', () => {
  it('tiene los mismos efectos que el barril (los del editor y los del reproductor)', () => {
    expect([...effectTypes].sort()).toEqual(builtins.map((m) => m.type).sort());
  });

  it('cada efecto carga su definición, y con el nombre que dice', async () => {
    for (const type of effectTypes) {
      const defs = await effectLoaders[type]!();
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) expect(def.type).toBe(type);
    }
  });
});

describe('qué necesita una escena', () => {
  const scene = (objects: unknown[]): SceneV2 => ({ version: 2, objects: objects as SceneV2['objects'] });

  it('los efectos de las pilas, y los de dentro de ellos', () => {
    const s = scene([
      { kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [{ id: 'x', type: 'twist', params: {} }] },
      {
        kind: 'group',
        id: 'g',
        name: 'G',
        stack: [{ id: 'y', type: 'step', params: {}, children: [{ id: 'z', type: 'wave', params: {} }] }],
        children: [{ kind: 'shape', id: 'b', name: 'B', shape: 'star', params: {}, stack: [{ id: 'w', type: 'spherize', params: {} }] }],
      },
    ]);
    expect(sceneEffectTypes(s).sort()).toEqual(['spherize', 'step', 'twist', 'wave']);
  });

  it('los de un paquete (que guarda el original para poder deshacerlo)', () => {
    const s = scene([
      {
        kind: 'object',
        id: 'o',
        name: 'O',
        source: '<svg/>',
        stack: [],
        packed: { key: 'k', geometry: { viewBox: [0, 0, 1, 1], shapes: [] }, at: { x: 0, y: 0 }, original: { kind: 'shape', id: 'i', name: 'I', shape: 'star', params: {}, stack: [{ id: 'q', type: 'bend', params: {} }] } },
      },
    ]);
    expect(sceneEffectTypes(s)).toEqual(['bend']);
  });

  it('avisa si el texto (que necesita fuentes) o el SVG suelto (que necesita el importador)', () => {
    expect(sceneHasText(scene([{ kind: 'shape', id: 'a', name: 'A', shape: 'text', params: {}, stack: [] }]))).toBe(true);
    expect(sceneHasText(scene([{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [] }]))).toBe(false);
    expect(sceneNeedsImporter(scene([{ kind: 'object', id: 'o', name: 'O', source: '<svg/>', stack: [] }]))).toBe(true);
    expect(
      sceneNeedsImporter(
        scene([{ kind: 'object', id: 'o', name: 'O', source: '<svg/>', stack: [], packed: { key: 'k', geometry: { viewBox: [0, 0, 1, 1], shapes: [] }, at: { x: 0, y: 0 } } }]),
      ),
    ).toBe(false);
  });
});

describe('preparar una escena', () => {
  it('carga solo los efectos que usa', async () => {
    const defs = await prepareScene({
      version: 2,
      objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [{ id: 'x', type: 'twist', params: {} }] }],
    });
    expect(defs.map((d) => d.type)).toEqual(['twist']);
  });

  it('avisa de los efectos que no existen', async () => {
    await expect(
      prepareScene({
        version: 2,
        objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [{ id: 'x', type: 'nope', params: {} }] }],
      }),
    ).rejects.toThrow(/nope/);
  });
});
