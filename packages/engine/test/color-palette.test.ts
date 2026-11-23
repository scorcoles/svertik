import { expect, it } from 'vitest';
import { applyPalette, builtins, createEngine, sceneColors, validateScene, type SceneV1 } from '../src';
const palette = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
const scene = (index: number): SceneV1 => ({ version: 1, objects: [{ kind: 'shape', id: 'cross', name: 'Cross', shape: 'cross', params: { fillColor: '#000000' }, stack: [{ id: 'color', type: 'color', params: { mode: 'palette', palette, paletteMode: 'index', index } }] }] });
it('selects exact palette colors by index, wraps indices and validates the scene', () => {
  const engine = createEngine(builtins);
  for (const [index, expected] of [[0, '#ff0000'], [4, '#ff00ff'], [5, '#ff0000'], [-1, '#ff00ff']] as const) {
    expect(engine.evaluateDocument(scene(index)).geometry.shapes[0]!.style.fill).toBe(expected);
  }
  expect(validateScene(scene(0))).toEqual({ errors: [], warnings: [] });
});
it('discovers and remaps palette entries through the document color tools', () => {
  const s = scene(0);
  expect(sceneColors(s)).toEqual(expect.arrayContaining(palette));
  applyPalette(s, ['#ffffff']);
  expect(s.objects[0]!.stack[0]!.params!.palette).toEqual(palette.map(() => '#ffffff'));
});
it('rejects an invalid or empty palette', () => {
  const s = scene(0);
  for (const invalid of [[], ['red'], ['#123456', 123]]) {
    s.objects[0]!.stack[0]!.params!.palette = invalid;
    expect(validateScene(s).errors.length).toBeGreaterThan(0);
  }
});
