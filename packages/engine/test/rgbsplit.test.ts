import { describe, expect, it } from 'vitest';
import { builtins, createEngine, parseColor, validateScene, type SceneV1 } from '../src';

const source = '<svg viewBox="0 0 100 40"><rect width="100" height="40" fill="#80402080" stroke="#204080" stroke-width="2"/></svg>';
const run = (params: Record<string, unknown> = {}, svg = source) => createEngine(builtins).evaluateStack({ source: svg, stack: [{ id: 'rgb', type: 'rgbsplit', params }] });

describe('RGB channel split', () => {
  it('extracts channels with their source alpha and shifts only red and blue', () => {
    const shapes = run({ distance: 5 }).shapes;
    expect(shapes.map((s) => s.style.fill)).toEqual(['#80000080', '#00002080', '#00400080']);
    expect(shapes.map((s) => s.style.stroke)).toEqual(['#200000', '#000080', '#004000']);
    expect(shapes.map((s) => s.subpaths[0]!.start[0])).toEqual([-5, 5, 0]);
    expect(shapes.every((s) => s.style['mix-blend-mode'] === 'screen')).toBe(true);
  });

  it('reconstructs source RGB from dark and light plates', () => {
    for (const background of ['dark', 'light']) {
      const shapes = run({ background }).shapes;
      const plates = shapes.map((s) => parseColor(s.style.stroke!)!);
      const reconstructed = [0, 1, 2].map((k) => Math.round(background === 'dark'
        ? 255 * (1 - plates.reduce((v, p) => v * (1 - p[k]! / 255), 1))
        : 255 * plates.reduce((v, p) => v * (p[k]! / 255), 1)));
      expect(reconstructed).toEqual([32, 64, 128]);
      expect(shapes.every((s) => s.style['mix-blend-mode'] === (background === 'dark' ? 'screen' : 'multiply'))).toBe(true);
    }
  });

  it('preserves every gradient stop, opacity and transform, without changing the source', () => {
    const svg = '<svg viewBox="0 0 100 40"><defs><linearGradient id="g" gradientTransform="rotate(15)"><stop offset="0" stop-color="#804020"/><stop offset="0.5" stop-color="#204080" stop-opacity="0.4"/><stop offset="1" stop-color="#ffffff"/></linearGradient></defs><rect width="100" height="40" fill="url(#g)"/></svg>';
    const shapes = run({}, svg).shapes;
    expect(shapes).toHaveLength(3);
    expect(new Set(shapes.map((s) => s.gradients![0]!.id)).size).toBe(3);
    expect(shapes[0]!.gradients![0]!.stops.map((s) => s.color)).toEqual(['#800000', '#200000', '#ff0000']);
    for (const s of shapes) {
      const g = s.gradients![0]!;
      expect(s.style.fill).toBe(`url(#${g.id})`);
      expect(g.stops).toHaveLength(3);
      expect(g.stops[1]!.opacity).toBe(0.4);
      expect(g.gradientTransform).toBe('rotate(15)');
    }
  });

  it('keeps a stroke-only source unfilled and is an exact no-op at distance zero', () => {
    const svg = '<svg viewBox="0 0 100 40"><path d="M0 20H100" fill="none" stroke="#ffffff"/></svg>';
    expect(run({}, svg).shapes.every((s) => s.style.fill === 'none')).toBe(true);
    expect(run({ distance: 0 }, svg)).toEqual(createEngine(builtins).evaluateStack({ source: svg, stack: [] }));
  });

  it('filters shifted plates separately and leaves the green plate untouched', () => {
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 100, height: 40, fill: true, fillColor: '#ffffff' }, stack: [{ id: 'rgb', type: 'rgbsplit', params: {}, children: [{ id: 'move', type: 'transform', params: { y: 10 } }, { id: 'blur', type: 'blur', params: { amount: 2 } }] }] }] };
    expect(validateScene(scene).errors).toEqual([]);
    const engine = createEngine(builtins), geo = engine.evaluateDocument(scene).geometry;
    const [red, blue, green] = geo.shapes;
    expect(Object.keys(geo.filters ?? {})).toHaveLength(2);
    expect(red!.wrap?.length).toBe(1);
    expect(blue!.wrap?.length).toBe(1);
    expect(red!.wrap).not.toEqual(blue!.wrap);
    expect(green!.wrap ?? []).toEqual([]);
    expect(red!.subpaths[0]!.start[1] - green!.subpaths[0]!.start[1]).toBeCloseTo(10);
    expect(engine.toSVG(scene)).toContain('feGaussianBlur');
  });
});
