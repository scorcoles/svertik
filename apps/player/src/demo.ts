// La escena de la página de demostración: un SVG y su configuración en JSON, como el «Flash Player»
// de antes: el motor, el dibujo y el JSON, y se reproduce.
import { play } from './player';
import type { SceneV2 } from '@svertik/engine/player';

const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <rect x="30" y="30" width="340" height="340" fill="#09fdd1"/>
  <circle cx="200" cy="200" r="120" fill="#0d0d10"/>
  <rect x="160" y="160" width="80" height="80" fill="#ededed"/>
</svg>`;

const scene: SceneV2 = {
  version: 2,
  document: { width: 720, height: 400 },
  objects: [
    {
      kind: 'object',
      id: 'box',
      name: 'Box',
      source,
      stack: [
        { id: 'sph', type: 'spherize', params: { strength: 0.45, radius: 0.55 } },
        { id: 'tw', type: 'twist', params: { angle: 45, radius: 0.7 } },
        { id: 'wv', type: 'wave', params: { amplitude: 0.03, wavelength: 0.35, phase: 0 } },
      ],
    },
  ],
  animation: {
    duration: 6,
    fps: 30,
    loop: true,
    tracks: [
      { id: 'k1', node: 'box', on: 'modifier', modifier: 'wv', param: 'phase', keys: [{ t: 0, value: 0 }, { t: 6, value: 360 }] },
      { id: 'k2', node: 'box', on: 'modifier', modifier: 'tw', param: 'angle', keys: [{ t: 0, value: -30 }, { t: 3, value: 40 }, { t: 6, value: -30 }] },
      { id: 'k3', node: 'box', on: 'modifier', modifier: 'sph', param: 'strength', keys: [{ t: 0, value: 0.1 }, { t: 3, value: 0.7 }, { t: 6, value: 0.1 }] },
    ],
  },
};

await play(scene, '#stage');
