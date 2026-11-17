import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtins, canvasCanPaint, createEngine, line, mountCanvas, paintCanvas, parseTransform, type Geometry, type SceneV1, type Shape } from '../src';

// A recording Canvas 2D: enough of the API to see what the renderer asks for.
class FakePath { ops: unknown[][] = []; moveTo(...a: number[]) { this.ops.push(['M', ...a]); } bezierCurveTo(...a: number[]) { this.ops.push(['C', ...a]); } closePath() { this.ops.push(['Z']); } addPath(p: FakePath) { this.ops.push(...p.ops); } }
const fakeContext = (width = 100, height = 100) => {
  const calls: { op: string; style?: unknown; alpha?: number; composite?: string; width?: number; dash?: number[] }[] = [];
  const ctx = {
    canvas: { width, height },
    fillStyle: '' as unknown, strokeStyle: '' as unknown, globalAlpha: 1, globalCompositeOperation: 'source-over', lineWidth: 1,
    lineCap: 'butt', lineJoin: 'miter', miterLimit: 4, lineDashOffset: 0, dash: [] as number[],
    transforms: [] as number[][],
    setTransform(...m: number[]) { this.transforms.push(m); }, transform() {}, clearRect() {}, save() {}, restore() {},
    setLineDash(d: number[]) { this.dash = d; },
    fill() { calls.push({ op: 'fill', style: this.fillStyle, alpha: this.globalAlpha, composite: this.globalCompositeOperation }); },
    stroke() { calls.push({ op: 'stroke', style: this.strokeStyle, alpha: this.globalAlpha, width: this.lineWidth, dash: this.dash }); },
    createLinearGradient: (...a: number[]) => ({ kind: 'linear', a, stops: [] as unknown[], addColorStop(o: number, c: string) { this.stops.push([o, c]); } }),
    createRadialGradient: (...a: number[]) => ({ kind: 'radial', a, stops: [] as unknown[], addColorStop(o: number, c: string) { this.stops.push([o, c]); } }),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, raw: ctx };
};

const square = (x: number, style: Shape['style'], extra: Partial<Shape> = {}): Shape => ({
  style, ...extra,
  subpaths: [{ start: [x, 0], segs: [line([x, 0], [x + 10, 0]), line([x + 10, 0], [x + 10, 10]), line([x + 10, 10], [x, 10])], closed: true }],
});
const geo = (shapes: Shape[], extra: Partial<Geometry> = {}): Geometry => ({ viewBox: [0, 0, 100, 50], shapes, ...extra });

let hadPath = false;
beforeAll(() => { hadPath = 'Path2D' in globalThis; (globalThis as Record<string, unknown>).Path2D ??= FakePath; });
afterAll(() => { if (!hadPath) delete (globalThis as Record<string, unknown>).Path2D; });

describe('canvas renderer', () => {
  it('parses SVG transform lists into one matrix', () => {
    expect(parseTransform('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
    const r = parseTransform('rotate(90)');
    expect(r.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, -1, 0, 0, 0]);
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('leaves filters and masks to SVG', () => {
    expect(canvasCanPaint(geo([square(0, { fill: '#fff' })]))).toBe(true);
    const filtered = geo([square(0, { fill: '#fff' }, { wrap: ['f1'] })], { filters: { f1: { markup: '<feGaussianBlur/>', region: [0, 0, 10, 10] } } });
    expect(canvasCanPaint(filtered)).toBe(false);
  });

  it('paints in order, maps the viewBox to the pixels and translates SVG styles', () => {
    const { ctx, calls, raw } = fakeContext(200, 100);
    paintCanvas(ctx, geo([
      square(0, { fill: '#ff0000', opacity: '0.5', 'fill-opacity': '0.5' }),
      square(20, { fill: 'none', stroke: '#00ff00', 'stroke-width': '3', 'stroke-dasharray': '4 2', 'mix-blend-mode': 'multiply' }),
      square(40, { fill: '#0000ff', opacity: '0' }),
      square(60, { fill: '#000000', stroke: '#ffffff', 'paint-order': 'stroke' }),
    ]));
    // The viewBox (100 × 50) on a 200 × 100 canvas: scale 2.
    expect(raw.transforms).toContainEqual([2, 0, 0, 2, 0, 0]);
    expect(calls).toEqual([
      { op: 'fill', style: '#ff0000', alpha: 0.25, composite: 'source-over' },
      { op: 'stroke', style: '#00ff00', alpha: 1, width: 3, dash: [4, 2] },
      // Opacity 0 paints nothing; paint-order stroke strokes first.
      { op: 'stroke', style: '#ffffff', alpha: 1, width: 1, dash: [] },
      { op: 'fill', style: '#000000', alpha: 1, composite: 'source-over' },
    ]);
  });

  it('paints gradients from the shape definitions, with stop opacity', () => {
    const { ctx, calls } = fakeContext();
    paintCanvas(ctx, geo([square(0, { fill: 'url(#g)' }, { gradients: [{ id: 'g', kind: 'linear', stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff', opacity: 0.5 }] }] })]));
    const style = calls[0]!.style as { kind: string; stops: unknown[] };
    expect(style.kind).toBe('linear');
    expect(style.stops).toEqual([[0, 'rgba(255,0,0,1)'], [1, 'rgba(0,0,255,0.5)']]);
  });

  it('returns what the pointer can hit, front first, skipping invisible shapes', () => {
    const { ctx } = fakeContext();
    const hits = paintCanvas(ctx, geo([
      square(0, { fill: '#fff' }, { node: 'back' }),
      square(0, { fill: '#fff', opacity: '0' }, { node: 'ghost' }),
      square(0, { fill: 'none', stroke: '#fff' }, { node: 'front' }),
    ]));
    expect(hits.map((h) => h.node)).toEqual(['front', 'back']);
  });

  it('without a 2D context (here, or an old browser) it keeps painting SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const scene: SceneV1 = { version: 1, objects: [{ kind: 'shape', id: 'r', name: 'R', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [] }] };
    const live = mountCanvas(createEngine(builtins), svg, scene, 'canvas');
    expect(live.onCanvas()).toBe(false);
    expect(svg.querySelectorAll('path[data-svertik-shape]')).toHaveLength(1);
    live.destroy();
    expect(svg.querySelector('foreignObject')).toBeNull();
  });
});
