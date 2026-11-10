import { describe, expect, it } from 'vitest';
import { describeEffects, describeScene, frameTimes, loadInput, registerBundledFonts, renderPNG, renderSVG } from '../src/lib';

registerBundledFonts();
const project = JSON.stringify({
  svertik: 'project',
  version: 1,
  name: 'demo',
  scene: {
    version: 2,
    objects: [
      { kind: 'shape', id: 't', name: 'Title', shape: 'text', params: { text: 'Hi', size: 60 }, stack: [{ id: 'd', type: 'damage', params: {} }] },
      { kind: 'shape', id: 's', name: 'Star', shape: 'star', params: {}, stack: [], transform: { x: 150 } },
    ],
    animation: { duration: 1, fps: 10, tracks: [{ id: 'k', node: 's', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0 }, { t: 1, value: 90 }] }] },
  },
});

describe('herramienta de terminal', () => {
  it('lee un proyecto .svrtk y un SVG suelto', () => {
    expect(loadInput(project, 'demo.svrtk').name).toBe('demo');
    const svg = loadInput('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', 'logo.svg');
    expect(svg.scene.objects[0]).toMatchObject({ kind: 'object', name: 'logo.svg' });
  });

  it('dibuja a SVG (con fondo) y a PNG', () => {
    const { scene } = loadInput(project, 'demo.svrtk');
    const svg = renderSVG(scene, 0.5, '#ffffff');
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="#ffffff"');
    const png = renderPNG(svg, 1);
    expect([...png.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe('PNG');
  });

  it('fotogramas de la animación y resumen del proyecto', () => {
    const { scene } = loadInput(project, 'demo.svrtk');
    expect(frameTimes(scene)).toHaveLength(10);
    expect(describeScene(scene)).toContain('Title [text]: damage');
    expect(describeScene(scene)).toContain('animación: 1 s');
  });

  it('describe todos los efectos con sus parámetros', () => {
    const d = describeEffects();
    expect(d.effects.find((e) => e.type === 'spherize')!.params.strength).toMatchObject({ type: 'number', min: -1, max: 1 });
    expect(d.shapes.map((s) => s.type)).toContain('text');
  });
});
