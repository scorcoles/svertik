import { describe, expect, it, vi } from 'vitest';
import { builtins, bounds, createEngine, createPlayer, type SceneV1 } from '../src';

// Fixed bars drawn flush with the document's left/right edges, as authored in the editor.
const scene = (fullViewport = true): SceneV1 => ({ version: 1, fullViewport, document: { width: 1920, height: 1080 }, objects: [
  { kind: 'shape', id: 'left', name: 'Left', shape: 'rectangle', params: { width: 20, height: 1080 }, transform: { x: -950 }, stack: [] },
  { kind: 'shape', id: 'right', name: 'Right', shape: 'rectangle', params: { width: 20, height: 1080 }, transform: { x: 950 }, stack: [] },
] });

describe('Full viewport', () => {
  it.each([[800, 500], [500, 800], [1920, 1080]])('maps both document edges to a %s × %s viewport without moving fixed bars', (width, height) => {
    const s = scene();
    const before = JSON.stringify(s);
    const engine = createEngine(builtins);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width)); svg.setAttribute('height', String(height));
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const player = createPlayer(engine, svg, s);
      // SVG's non-uniform viewport mapping stretches the entire original viewBox, rather than
      // resizing the document while leaving its fixed-coordinate objects behind.
      expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
      expect(svg.getAttribute('viewBox')).toBe('-960 -540 1920 1080');
      const doc = engine.evaluateDocument(s);
      const left = bounds({ ...doc.geometry, shapes: doc.geometry.shapes.filter(p => p.node === 'left') });
      const right = bounds({ ...doc.geometry, shapes: doc.geometry.shapes.filter(p => p.node === 'right') });
      expect(left.x).toBe(-960);
      expect(right.x + right.width).toBe(960);
      expect((left.x + 960) * width / 1920).toBe(0);
      expect((right.x + right.width + 960) * width / 1920).toBe(width);
      expect(left.height * height / 1080).toBe(height);
      expect(JSON.stringify(s)).toBe(before);
      player.stop();
      expect(svg.hasAttribute('preserveAspectRatio')).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([true, false])('preserves host aspect settings when Full is off and restores them on stop (Full: %s)', full => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const player = createPlayer(createEngine(builtins), svg, scene(full));
      expect(svg.getAttribute('preserveAspectRatio')).toBe(full ? 'none' : 'xMidYMid meet');
      player.stop();
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    } finally { vi.unstubAllGlobals(); }
  });
});
