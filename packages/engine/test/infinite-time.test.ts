import { describe, expect, it, vi } from 'vitest';
import { builtins, createEngine, createPlayer, evaluateSceneExpressions, sampleScene, validateScene, type SceneV1 } from '../src';

const scene = (): SceneV1 => ({
  version: 1,
  animation: { duration: 10, infinite: true, loop: false, fps: 30, tracks: [
    { id: 'scale', node: 'shape', on: 'node', param: 'scale', keys: [{ t: 0, value: 1, ease: 'linear' }, { t: 10, value: 2 }] },
  ] },
  custom: { cycle: { $expr: 'scene.cycle', fallback: -1 }, elapsed: { $expr: 'scene.time', fallback: -1 }, progress: { $expr: 'scene.progress', fallback: -1 } },
  objects: [{ kind: 'shape', id: 'shape', name: 'Shape', shape: 'rectangle', params: { width: { $expr: '10 + scene.custom.cycle', fallback: 10 }, height: { $expr: '1 + scene.custom.elapsed', fallback: 1 }, strokeWidth: { $expr: 'scene.custom.progress', fallback: 0 } }, stack: [] }],
});

describe('Infinite time and scene.cycle', () => {
  it.each([[0, 0], [9.9, 0], [10, 1], [179.9, 17], [180, 18]])('samples elapsed %s with cycle %s and holds the timeline after its duration', (t, cycle) => {
    const s = scene();
    const sampled = evaluateSceneExpressions(sampleScene(s, t));
    expect(sampled.at).toBe(t);
    expect(sampled.custom).toEqual(s.custom);
    expect(sampled.objects[0]).toMatchObject({ params: { width: 10 + cycle, height: 1 + t, strokeWidth: Math.min(1, t / 10) } });
    expect(sampled.objects[0]!.transform?.scale).toBeCloseTo(1 + Math.min(t, 10) / 10);
    expect(s.objects[0]!.transform).toBeUndefined();
    expect(validateScene(s)).toEqual({ errors: [], warnings: [] });
  });

  it('keeps a trackless procedural scene alive past its duration in the shared player', () => {
    const s = scene(); s.animation!.tracks = []; s.animation!.loop = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let draw: FrameRequestCallback = () => {};
    const frames: number[] = [];
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { draw = fn; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    try {
      const player = createPlayer(createEngine(builtins), svg, s, { onFrame: ({ t }) => frames.push(t) });
      draw(181000);
      expect(frames.at(-1)).toBe(180);
      draw(182000);
      expect(frames.at(-1)).toBe(181);
      player.stop();
    } finally { vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });

  it('keeps explicit child composition loops running in the infinite parent', () => {
    const s = scene(); s.objects = [{ kind: 'group', id: 'comp', name: 'Loop', stack: [], children: [], composition: {
      params: { time: { $expr: 'scene.time', fallback: 0 }, loop: 'loop' },
      scene: { version: 1, animation: { duration: 2, tracks: [] }, objects: [{ kind: 'shape', id: 'child', name: 'Child', shape: 'rectangle', stack: [], params: { width: { $expr: '10 + scene.time', fallback: 10 }, height: { $expr: '10 + scene.cycle', fallback: 10 } } }] },
    } }]; s.animation!.tracks = [];
    const doc = createEngine(builtins).evaluateDocument(sampleScene(s, 181));
    expect(doc.nodes.get('comp')!.box.width).toBeCloseTo(11);
    expect(doc.nodes.get('comp')!.box.height).toBeCloseTo(10);
  });
});
