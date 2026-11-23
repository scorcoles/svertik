// The player end to end: prepares the scene (loads only its effects) and draws it.
import { describe, expect, it } from 'vitest';
import { play, loadScene } from '../src/player';
import type { SceneV1 } from '@svertik/engine/player';

const scene: SceneV1 = {
  version: 1,
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
  it('draws the scene into the given <svg>', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    const playing = await play(scene, svg);
    // The drawing is there: a <path> (the star, with its effect).
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0]!.getAttribute('d')).toContain('C');
    playing.stop();
  });

  it('takes a selector and makes the <svg> when the target is a container', async () => {
    const div = document.createElement('div');
    div.id = 'destino';
    document.body.appendChild(div);
    const playing = await play(scene, '#destino');
    expect(div.querySelector('svg')).toBeTruthy();
    expect(div.querySelectorAll('path').length).toBeGreaterThan(0);
    playing.stop();
  });

  it('rejects an invalid scene', async () => {
    await expect(play({ version: 0, objects: [] } as unknown as SceneV1, document.body)).rejects.toThrow();
  });
});

describe('loading a scene', () => {
  it('reads a scene JSON', async () => {
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

  it('rejects when it can\'t be read', async () => {
    const original = fetch;
    globalThis.fetch = (async () => new Response('', { status: 404 })) as typeof fetch;
    try {
      await expect(loadScene('x.json')).rejects.toThrow();
    } finally {
      globalThis.fetch = original;
    }
  });
});
