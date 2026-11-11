import { describe, expect, it } from 'vitest';
import { applyPalette, paletteMap, PALETTES, sceneColors, type SceneV2 } from '../src';

const scene = (): SceneV2 => ({
  version: 2,
  objects: [
    { kind: 'shape', id: 'a', name: 'a', shape: 'rectangle', params: { fillColor: '#000000', strokeColor: '#FFFFFF' }, stack: [{ id: 'p', type: 'paint', params: { fillColor: '#808080' } }] },
    { kind: 'object', id: 'o', name: 'o', source: '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#f00" width="1" height="1"/></svg>', stack: [] },
  ],
  animation: { duration: 1, tracks: [{ id: 'k', node: 'a', on: 'shape', param: 'fillColor', keys: [{ t: 0, value: '#000000' }, { t: 1, value: '#808080' }] }] },
});

describe('paletas', () => {
  it('sceneColors: de parámetros, efectos, SVG de origen y claves, normalizados', () => {
    expect(sceneColors(scene()).sort()).toEqual(['#000000', '#808080', '#ff0000', '#ffffff']);
  });

  it('paletteMap: por luminosidad, de lo oscuro a lo claro', () => {
    const m = paletteMap(['#ffffff', '#000000', '#808080'], ['#eeeeee', '#111111', '#777777']);
    expect(m.get('#000000')).toBe('#111111');
    expect(m.get('#808080')).toBe('#777777');
    expect(m.get('#ffffff')).toBe('#eeeeee');
  });

  it('applyPalette cambia los colores en todas partes (también las claves y el SVG)', () => {
    const s = scene();
    const n = applyPalette(s, ['#101010', '#202020', '#303030', '#f0f0f0']);
    expect(n).toBeGreaterThan(0);
    const colors = sceneColors(s);
    for (const c of colors) expect(['#101010', '#202020', '#303030', '#f0f0f0']).toContain(c);
    expect(s.animation!.tracks[0]!.keys[0]!.value).toBe('#101010');
    expect((s.objects[1] as { source: string }).source).not.toMatch(/#f00\b/);
  });

  it('las de serie: todas con colores válidos y sin nombres repetidos', () => {
    expect(new Set(PALETTES.map((p) => p.name)).size).toBe(PALETTES.length);
    for (const p of PALETTES) for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
