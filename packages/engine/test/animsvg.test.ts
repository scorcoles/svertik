import { describe, expect, it } from 'vitest';
import { builtins, createEngine, toAnimatedSVG, type SceneV2 } from '../src';

const scene: SceneV2 = {
  version: 2,
  objects: [
    { kind: 'shape', id: 'a', name: 'Mover', shape: 'star', params: {}, stack: [{ id: 's', type: 'shadow' }], transform: { x: 0 } },
    { kind: 'shape', id: 'b', name: 'Wavy', shape: 'rectangle', params: {}, stack: [{ id: 'w', type: 'wave', params: { amplitude: 0.1 } }], transform: { x: 300 } },
    { kind: 'shape', id: 'c', name: 'Still', shape: 'ellipse', params: {}, stack: [], transform: { x: -300 } },
  ],
  animation: {
    duration: 1,
    fps: 10,
    tracks: [
      { id: 'p', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100 }] },
      { id: 'ph', node: 'b', on: 'modifier', modifier: 'w', param: 'phase', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 180 }] },
    ],
  },
};

describe('SVG animado', () => {
  const out = toAnimatedSVG(createEngine(builtins), scene);

  it('un solo SVG con su CSS: duración, bucle y «reducir movimiento»', () => {
    expect(out.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox=/);
    expect(out.svg).toContain('animation-duration:1s');
    expect(out.svg).toContain('animation-iteration-count:infinite');
    expect(out.svg).toContain('prefers-reduced-motion');
  });

  it('lo que se mueve: una animación de transform (solo las claves necesarias); lo quieto, sin animación', () => {
    const mover = /@keyframes m\d+\{([^}]*\}){1,}?\}/.exec(out.svg)![0];
    // Movimiento lineal: el primer fotograma, el último y el 100 %.
    expect(mover.match(/%\{/g)).toHaveLength(3);
    // La elipse quieta, con su colocación como atributo.
    expect(out.svg).toMatch(/<g transform="matrix\(1,0,0,1,-300,0\)"><path/);
  });

  it('los filtros sí van; lo que cambia de forma, por tramos que se encienden y apagan', () => {
    expect(out.svg).toContain('<filter id="sv-f-a"');
    expect(out.svg).toContain('<g filter="url(#sv-f-a)">');
    expect(out.svg).toMatch(/@keyframes v\d+\{0%\{visibility:hidden\}/);
    expect(out.warnings.join('\n')).toMatch(/frame by frame.*Wavy/);
  });
});
