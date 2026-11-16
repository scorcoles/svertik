import { describe, expect, it } from 'vitest';
import { installWire, wireColors, type SceneV1 } from '../src';

const scene: SceneV1 = {
  version: 1,
  objects: [{ kind: 'shape', id: 'a', name: 'A', shape: 'star', params: {}, stack: [] }],
};

describe('wire', () => {
  it('gives every node a colour', () => {
    expect(wireColors(scene).get('a')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('toggles with the W key, ignores typing and modifiers, and undoes itself', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const seen: boolean[] = [];
    const wire = installWire(svg, scene, { onChange: (on) => seen.push(on) });
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(svg.classList.contains('wire')).toBe(true);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true }));
    expect(svg.classList.contains('wire')).toBe(true);
    dispatchEvent(new KeyboardEvent('keydown', { key: 'W' }));
    expect(svg.classList.contains('wire')).toBe(false);
    expect(seen).toEqual([true, false]);
    wire.dispose();
    dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(svg.classList.contains('wire')).toBe(false);
    expect(document.head.querySelector('style')).toBeNull();
  });
});
