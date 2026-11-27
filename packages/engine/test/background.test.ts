import { describe, expect, it } from 'vitest';
import { builtins, createEngine, toAnimatedSVG, toLottie, validateScene, type SceneV1 } from '../src';

const engine = createEngine(builtins);
const scene = (background?: string): SceneV1 => ({
  version: 1,
  document: { width: 200, height: 100 },
  ...(background ? { background } : {}),
  objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: 40, height: 40 }, stack: [] }],
  animation: { duration: 1, tracks: [{ id: 'k', node: 'r', on: 'node', param: 'x', keys: [{ t: 0, value: 0 }, { t: 1, value: 50 }] }] },
});

describe('scene background', () => {
  it('is drawn first, over the whole viewBox, in the static SVG', () => {
    const svg = engine.toSVG(scene('#112233'));
    expect(svg).toContain('<rect x="-100" y="-50" width="200" height="100" fill="#112233"/>');
    expect(svg.indexOf('<rect')).toBeLessThan(svg.indexOf('<path'));
    expect(engine.toSVG(scene())).not.toContain('<rect');
  });
  it('keeps a translucent colour as written', () => {
    expect(engine.toSVG(scene('#11223380'))).toContain('fill="#11223380"');
  });
  it('goes into the animated SVG and Lottie (a solid layer at the back)', () => {
    expect(toAnimatedSVG(engine, scene('#112233')).svg).toContain('fill="#112233"');
    const layers = toLottie(engine, scene('#11223380')).data.layers as { ty: number; sc?: string; ks: { o: { k: number } } }[];
    const back = layers[layers.length - 1]!;
    expect(back).toMatchObject({ ty: 1, sc: '#112233' });
    expect(back.ks.o.k).toBeCloseTo(50.2, 1);
  });
  it('validates as a hex colour', () => {
    expect(validateScene(scene('#112233')).errors).toEqual([]);
    expect(validateScene(scene('#11223380')).errors).toEqual([]);
    expect(validateScene(scene('red')).errors.join()).toMatch(/background/);
  });
});
