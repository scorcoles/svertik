// El efecto Trace (Tracer): el recorrido del objeto que sigue.
//
// Se reproduce como el reproductor (fotograma a fotograma), no con una evaluación suelta: el
// motor resuelve las dependencias entre objetos usando el fotograma anterior, y una estela
// calculada de golpe puede salir distinta.

import { describe, expect, it } from 'vitest';
import { builtins, createEngine, sampleScene, type SceneV1 } from '../src';

const engine = () => createEngine(builtins);

/** Un grupo con un objeto que se mueve y una estela que lo sigue. */
const scene = (): SceneV1 => ({
  version: 1,
  objects: [
    {
      kind: 'group',
      id: 'g',
      name: 'g',
      stack: [],
      children: [
        {
          kind: 'shape',
          id: 'obj',
          name: 'obj',
          shape: 'rectangle',
          params: { width: 10, height: 10, fillColor: '#09fdd1' },
          stack: [],
        },
        {
          kind: 'shape',
          id: 'trail',
          name: 'trail',
          shape: 'line',
          params: { x1: 0, y1: 0, x2: 0, y2: 0 },
          stack: [{ id: 'tr', type: 'trace', params: { target: 'obj', length: 1, samples: 20 } }],
        },
      ],
    },
  ],
  animation: {
    duration: 2,
    loop: true,
    tracks: [
      { id: 'k1', node: 'obj', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100, ease: 'linear' }] },
    ],
  },
});

/** Reproduce la escena hasta `t` y devuelve la caja de la estela. */
const trailBoxAt = (t: number) => {
  const e = engine();
  const s = scene();
  for (let i = 0; i * (1 / 30) <= t + 1e-9; i++) e.toSVG(sampleScene(s, i / 30));
  const doc = e.evaluateDocument(sampleScene(s, t));
  return doc.nodes.get('trail')!.box;
};

describe('traza', () => {
  it('el recorrido dibujado es el del objeto que sigue', () => {
    // A los 0,5 s el objeto va de x=0 a x=25; la estela debe recorrerlo.
    const box = trailBoxAt(0.5);
    expect(box.width).toBeGreaterThan(20);
    expect(box.height).toBeLessThan(5);   // el objeto se mueve en horizontal
  });

  it('con el objeto quieto, la estela no crece', () => {
    const e = engine();
    const s = scene();
    s.animation!.tracks[0]!.keys = [{ t: 0, value: 0 }, { t: 2, value: 0 }];
    for (let i = 0; i <= 30; i++) e.toSVG(sampleScene(s, i / 30));
    const doc = e.evaluateDocument(sampleScene(s, 1));
    const box = doc.nodes.get('trail')!.box;
    expect(box.width).toBeLessThan(1);
  });

  it('la estela no hace crecer el trabajo del motor: el tiempo por fotograma se mantiene', () => {
    const e = engine();
    const s = scene();
    // 60 fotogramas: con la estela y sin ella, el coste debe parecerse.
    const with_ = (() => { const t0 = performance.now(); for (let i = 0; i < 60; i++) e.toSVG(sampleScene(s, i / 30)); return performance.now() - t0; })();
    const s2 = scene();
    s2.objects[0]!.kind === 'group' && (s2.objects[0] as { children: unknown[] }).children.splice(1, 1);
    const e2 = engine();
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) e2.toSVG(sampleScene(s2, i / 30));
    const without = performance.now() - t0;
    // La estela no puede costar más que el resto de la escena por un margen grande.
    expect(with_).toBeLessThan(without * 4 + 200);
  });
});
