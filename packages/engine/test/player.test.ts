import { describe, expect, it } from 'vitest';
import { builtins, type SceneV1 } from '../src';
import { effectLoaders, effectTypes } from '../src/modifiers/manifest';
import { prepareScene, sceneEffectTypes, sceneHasText, sceneNeedsImporter } from '../src/prepare';

describe('effect manifest', () => {
  it('has the same effects as the barrel (the editor\'s and the player\'s)', () => {
    expect([...effectTypes].sort()).toEqual(builtins.map((m) => m.type).sort());
  });

  it('each effect loads its definition, under the name it declares', async () => {
    for (const type of effectTypes) {
      const defs = await effectLoaders[type]!();
      expect(defs.length).toBeGreaterThan(0);
      for (const def of defs) expect(def.type).toBe(type);
    }
  });
});

describe('what a scene needs', () => {
  const scene = (objects: unknown[]): SceneV1 => ({ version: 1, objects: objects as SceneV1['objects'] });

  it('the effects in the stacks, and those nested in them', () => {
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

  it('those of a pack (which keeps the original to undo it)', () => {
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

  it('flags text (needs fonts) and raw SVG (needs the importer)', () => {
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

describe('preparing a scene', () => {
  it('loads only the effects it uses', async () => {
    const defs = await prepareScene({
      version: 1,
      objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [{ id: 'x', type: 'twist', params: {} }] }],
    });
    expect(defs.map((d) => d.type)).toEqual(['twist']);
  });

  it('rejects unknown effects', async () => {
    await expect(
      prepareScene({
        version: 1,
        objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [{ id: 'x', type: 'nope', params: {} }] }],
      }),
    ).rejects.toThrow(/nope/);
  });
});
