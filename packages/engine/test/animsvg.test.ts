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

  it('a single SVG with its CSS: duration, loop and reduced motion', () => {
    expect(out.svg).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox=/);
    expect(out.svg).toContain('animation-duration:1s');
    expect(out.svg).toContain('animation-iteration-count:infinite');
    expect(out.svg).toContain('prefers-reduced-motion');
  });

  it('what moves: a transform animation (only the keys needed); what is still, no animation', () => {
    const mover = /@keyframes m\d+\{([^}]*\}){1,}?\}/.exec(out.svg)![0];
    // Linear motion: the first frame, the last and 100 %.
    expect(mover.match(/%\{/g)).toHaveLength(3);
    // The still ellipse, with its placement as an attribute.
    expect(out.svg).toMatch(/<g transform="matrix\(1,0,0,1,-300,0\)"><path/);
  });

  it('filters do go; what changes shape, in segments that switch on and off', () => {
    expect(out.svg).toContain('<filter id="sv-f-a"');
    expect(out.svg).toContain('<g filter="url(#sv-f-a)">');
    expect(out.svg).toMatch(/@keyframes v\d+\{0%\{visibility:hidden\}/);
    expect(out.warnings.join('\n')).toMatch(/frame by frame.*Wavy/);
  });
});
