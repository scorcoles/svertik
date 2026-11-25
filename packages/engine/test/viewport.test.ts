import { describe, expect, it, vi } from 'vitest';
import { builtins, bounds, createEngine, createPlayer, type SceneV1 } from '../src';

// Fixed bars drawn flush with the document's left/right edges, as authored in the editor.
const scene = (fullViewport: SceneV1['fullViewport'] = 'stretch'): SceneV1 => ({ version: 1, fullViewport, document: { width: 1920, height: 1080 }, objects: [
  { kind: 'shape', id: 'left', name: 'Left', shape: 'rectangle', params: { width: 20, height: 1080 }, transform: { x: -950 }, stack: [] },
  { kind: 'shape', id: 'right', name: 'Right', shape: 'rectangle', params: { width: 20, height: 1080 }, transform: { x: 950 }, stack: [] },
] });

describe('Full viewport', () => {
  it.each([[800, 500], [500, 800], [1920, 1080]])('Stretch maps both document edges to a %s × %s viewport without moving fixed bars', (width, height) => {
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

  // Full fits like CSS object-fit; `true` is contain (no distortion).
  it.each([
    [true, 'xMidYMid meet'],
    ['contain', 'xMidYMid meet'],
    ['cover', 'xMidYMid slice'],
    ['stretch', 'none'],
    [false, 'xMinYMin meet'],
  ] as const)('fits as Full %s asks and restores the host aspect setting on stop', (full, aspect) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const player = createPlayer(createEngine(builtins), svg, scene(full));
      expect(svg.getAttribute('preserveAspectRatio')).toBe(aspect);
      player.stop();
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMinYMin meet');
    } finally { vi.unstubAllGlobals(); }
  });

  // Adapt: the document itself takes the viewport's shape, around the same centre.
  it.each([
    // Content on: × (800 / 1080) to fit the height, so 2000 px across are 2700 document px.
    [true, '-1350 -540 2700 1080'],
    // Content off: 1 document px per CSS px.
    [false, '-1000 -400 2000 800'],
  ] as const)('Adapt (content %s) gives the document the viewport\'s shape', (adaptContent, viewBox) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.getBoundingClientRect = () => ({ width: 2000, height: 800, x: 0, y: 0, left: 0, top: 0, right: 2000, bottom: 800, toJSON: () => ({}) });
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    try {
      const player = createPlayer(createEngine(builtins), svg, { ...scene('adapt'), ...(adaptContent ? {} : { adaptContent: false }) });
      expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
      expect(svg.getAttribute('viewBox')).toBe(viewBox);
      player.stop();
    } finally { vi.unstubAllGlobals(); }
  });
});
