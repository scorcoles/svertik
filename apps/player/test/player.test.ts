// El reproductor, de punta a punta: prepara la escena (carga solo sus efectos) y la dibuja.
import { describe, expect, it } from 'vitest';
import { play, loadScene } from '../src/player';
import type { SceneV2 } from '@svertik/engine/player';

const scene: SceneV2 = {
  version: 2,
  objects: [
    {
      kind: 'shape',
      id: 'star',
      name: 'Star',
      shape: 'star',
      params: { radius: 100, points: 5, fillColor: '#09fdd1' },
      stack: [{ id: 'tw', type: 'twist', params: { angle: 45 } }],
      transform: { x: 100, y: 100 },
    },
  ],
  animation: { duration: 2, fps: 30, tracks: [{ id: 'k', node: 'star', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0 }, { t: 2, value: 90 }] }] },
};

describe('reproductor', () => {
  it('dibuja la escena en el <svg> que se le pasa', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    const playing = await play(scene, svg);
    // El dibujo está: un <path> (la estrella, con su efecto).
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0]!.getAttribute('d')).toContain('C');
    playing.stop();
  });

  it('acepta un selector y crea el <svg> si el destino es un contenedor', async () => {
    const div = document.createElement('div');
    div.id = 'destino';
    document.body.appendChild(div);
    const playing = await play(scene, '#destino');
    expect(div.querySelector('svg')).toBeTruthy();
    expect(div.querySelectorAll('path').length).toBeGreaterThan(0);
    playing.stop();
  });

  it('avisa si la escena no es válida', async () => {
    await expect(play({ version: 1 } as unknown as SceneV2, document.body)).rejects.toThrow();
  });
});

describe('cargar una escena', () => {
  it('lee el JSON de una escena', async () => {
    const json = JSON.stringify({ svertik: 'project', name: 'x', scene });
    const original = fetch;
    globalThis.fetch = (async () => new Response(json, { status: 200 })) as typeof fetch;
    try {
      const loaded = await loadScene('x.json');
      expect(loaded.objects).toHaveLength(1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('avisa si no se puede leer', async () => {
    const original = fetch;
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    try {
      await expect(loadScene('x.json')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
