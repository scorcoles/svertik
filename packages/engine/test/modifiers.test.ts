import { describe, expect, it } from 'vitest';
import { covers, simplify } from '../src/clip';
import { sampleScene } from '../src/animation';
import { bend, bounds, builtins, createEngine, noise, randomizeParams, resolveParams, rng, spherize, transform, twist, wave, zeroParams, toSVG, type Shape, type StackInput } from '../src';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60"/></svg>';
const scene = (stack: StackInput['stack']): StackInput => ({ source: square, stack });
const engine = () => createEngine(builtins);

describe('modifiers', () => {
  it('transform moves', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'transform', params: { x: 5, y: -5 } }]));
    expect(bounds(geo)).toEqual({ x: 25, y: 15, width: 60, height: 60 });
  });

  it('transform scales around the pivot (the centre by default)', () => {
    const b = bounds(engine().evaluateStack(scene([{ id: 'a', type: 'transform', params: { scale: 0.5 } }])));
    expect(b.x).toBeCloseTo(35);
    expect(b.width).toBeCloseTo(30);
  });

  it('spherize does not move what is outside the radius', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'spherize', params: { radius: 0.1, strength: 1 } }]));
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('spherize with positive strength pushes out what is inside', () => {
    const steps = engine().evaluateStackSteps(scene([{ id: 'a', type: 'spherize', params: { radius: 0.6, strength: 1 } }]));
    // The midpoint of the top side (50, 20) is 30 from the centre, inside the radius (36).
    const all = steps[1]!.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = all.find((p) => Math.abs(p[0] - 50) < 0.5)!;
    expect(top[1]).toBeLessThan(20);
  });

  it('twist with angle 0 and wave with amplitude 0 change nothing', () => {
    const e = engine();
    const base = bounds(e.evaluateStack(scene([])));
    expect(bounds(e.evaluateStack(scene([{ id: 'a', type: 'twist', params: { angle: 0 } }])))).toEqual(base);
    expect(bounds(e.evaluateStack(scene([{ id: 'a', type: 'wave', params: { amplitude: 0 } }])))).toEqual(base);
  });

  it('bend with a positive angle makes an ∩ arc: the top corners drop relative to the middle of the side', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'bend', params: { angle: 60 } }]));
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 40);
    const mid = top.reduce((a, p) => (Math.abs(p[0] - 50) < Math.abs(a[0] - 50) ? p : a));
    const corner = top.reduce((a, p) => (p[0] < a[0] ? p : a));
    expect(corner[1]).toBeGreaterThan(mid[1] + 5); // in SVG, y grows downwards
  });

  it('noise is deterministic: same seed, same result; another seed, another', () => {
    const run = (seed: number) => toSVG(engine().evaluateStack(scene([{ id: 'a', type: 'noise', params: { seed } }])));
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('a disabled modifier does nothing', () => {
    const geo = engine().evaluateStack(scene([{ id: 'a', type: 'transform', enabled: false, params: { x: 50 } }]));
    expect(bounds(geo).x).toBe(20);
  });

  it('an unknown type throws', () => {
    expect(() => engine().evaluateStack(scene([{ id: 'a', type: 'nope' }]))).toThrow(/nope/);
  });

  it('all have valid defaults', () => {
    for (const m of [transform, spherize, twist, bend, wave, noise]) {
      expect(() => engine().evaluateStack(scene([{ id: 'a', type: m.type, params: resolveParams(m.params) }]))).not.toThrow();
    }
  });
});

describe('engine', () => {
  it('reuses the steps that have not changed', () => {
    const e = engine();
    const stack: StackInput['stack'] = [
      { id: 'a', type: 'spherize' },
      { id: 'b', type: 'wave', params: { phase: 0 } },
    ];
    const first = e.evaluateStackSteps(scene(stack));
    const second = e.evaluateStackSteps(scene([stack[0]!, { id: 'b', type: 'wave', params: { phase: 90 } }]));
    expect(second[1]).toBe(first[1]); // spherize, from the cache
    expect(second[2]).not.toBe(first[2]);
  });

  it('the whole chain always gives the same SVG', () => {
    const svg = toSVG(
      engine().evaluateStack(
        scene([
          { id: 'a', type: 'transform', params: { rotation: 10 } },
          { id: 'b', type: 'spherize' },
          { id: 'c', type: 'twist' },
          { id: 'd', type: 'wave' },
          { id: 'e', type: 'noise' },
        ]),
      ),
      { precision: 1 },
    );
    expect(svg).toMatchSnapshot();
  });
});

describe('crack', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'crack', params: { mode: 'lines', ...params } }] });

  it('cut: cuts the cracks as gaps (no stroke shape on top); shatter: separates the pieces', () => {
    const cut = run({ mode: 'cut', width: 2 });
    expect(cut.shapes.every((s) => s.style.stroke !== '#000000')).toBe(true);
    // There are gaps: more subpaths (or pieces) than the whole square.
    expect(cut.shapes.flatMap((s) => s.subpaths).length).toBeGreaterThan(1);
    const shatter = run({ mode: 'shatter', width: 2, separation: 10 });
    expect(shatter.shapes.map((s) => s.clone)).toEqual(shatter.shapes.map((_, i) => i));
    const b = bounds(shatter);
    expect(b.width).toBeGreaterThan(60);
  });

  it('adds a stroke-only shape on top and leaves the original alone', () => {
    const geo = run({});
    expect(geo.shapes).toHaveLength(2);
    expect(geo.shapes[1]!.style).toMatchObject({ fill: 'none', stroke: '#000000' });
    expect(bounds({ ...geo, shapes: [geo.shapes[0]!] })).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('the cracks stay inside the shape', () => {
    const b = bounds({ ...run({ length: 2, cracks: 12 }), shapes: [run({ length: 2, cracks: 12 }).shapes[1]!] });
    expect(b.x).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(b.y).toBeGreaterThanOrEqual(20 - 1e-6);
    expect(b.x + b.width).toBeLessThanOrEqual(80 + 1e-6);
    expect(b.y + b.height).toBeLessThanOrEqual(80 + 1e-6);
  });

  it('growth 0 draws nothing; growing does not change the drawing, only how much shows', () => {
    expect(run({ growth: 0 }).shapes).toHaveLength(1);
    const half = run({ growth: 0.5 }).shapes[1]!;
    const full = run({ growth: 1 }).shapes[1]!;
    expect(half.subpaths.length).toBeLessThanOrEqual(full.subpaths.length);
    expect(half.subpaths[0]!.start).toEqual(full.subpaths[0]!.start);
    expect(half.subpaths[0]!.segs[0]!.p).toEqual(full.subpaths[0]!.segs[0]!.p);
  });

  it('impact outside the shape: no cracks', () => {
    expect(run({ impact: [-1, -1] }).shapes).toHaveLength(1);
  });

  it('is deterministic with the seed', () => {
    const svg = (seed: number) => toSVG(createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'crack', params: { seed } }] }));
    expect(svg(2)).toBe(svg(2));
    expect(svg(2)).not.toBe(svg(3));
  });
});

describe('rotate3d', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'r', type: 'rotate3d', params }] });

  it('without rotation nothing changes', () => {
    expect(bounds(run({ rotateX: 0 }))).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
  it('only Z equals a flat turn (90° leaves the square the same size)', () => {
    const b = bounds(run({ rotateX: 0, rotateZ: 90 }));
    expect(b.width).toBeCloseTo(60);
    expect(b.height).toBeCloseTo(60);
  });
  it('tilting on X with perspective: the edge coming closer grows and the one going away shrinks', () => {
    const pts = run({ rotateX: 40 }).shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 50);
    const bottom = pts.filter((p) => p[1] > 50);
    const span = (ps: typeof pts) => Math.max(...ps.map((p) => p[0])) - Math.min(...ps.map((p) => p[0]));
    expect(span(top)).not.toBeCloseTo(span(bottom), 0);
  });
});

describe('clone', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'clone', params }] });

  it('grid: rows × columns copies, centred on the original', () => {
    const geo = run({ mode: 'grid', columns: 3, rows: 2 });
    expect(geo.shapes).toHaveLength(6);
    const b = bounds(geo);
    expect(b.x + b.width / 2).toBeCloseTo(50);
    expect(b.y + b.height / 2).toBeCloseTo(50);
  });
  it('radial: count copies at the requested distance', () => {
    const geo = run({ mode: 'radial', count: 4, radius: 1, align: false });
    expect(geo.shapes).toHaveLength(4);
    expect(bounds(geo).width).toBeCloseTo(60 + 2 * 60);
  });
  it('the viewBox grows to fit the copies', () => {
    const geo = run({ mode: 'linear', count: 5 });
    expect(geo.viewBox[2]).toBeGreaterThan(100);
  });
});

describe('step', () => {
  const run = (stack: StackInput['stack'], source = square) => createEngine(builtins).evaluateStack({ source, stack });
  const boxOf = (geo: ReturnType<typeof run>, i: number) => bounds({ ...geo, shapes: [geo.shapes[i]!] });

  it('Clone tags each copy with its number and deformers keep it', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'grid', columns: 2, rows: 2 } },
      { id: 'w', type: 'wave' },
    ]);
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
  });

  it('without children it does nothing', () => {
    const base = run([{ id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } }]);
    const geo = run([{ id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } }, { id: 's', type: 'step' }]);
    expect(geo.shapes.map((_, i) => boxOf(geo, i))).toEqual(base.shapes.map((_, i) => boxOf(base, i)));
  });

  it('applies any child modifier with its numbers multiplied by the position', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 3 } },
      { id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { rotation: 45 } }] },
    ]);
    // 45° (1st) and 135° (3rd) give the same width; 90° (2nd), the square's: each copy turns on its centre.
    expect(boxOf(geo, 0).width).toBeCloseTo(boxOf(geo, 2).width);
    expect(boxOf(geo, 1).width).toBeCloseTo(60);
  });

  it('scale grows from 1, not from 0', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 2 } },
      { id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { scale: 1.5 } }] },
    ]);
    expect(boxOf(geo, 0).width).toBeCloseTo(90); // 1 + 0.5 × 1
    expect(boxOf(geo, 1).width).toBeCloseTo(120); // 1 + 0.5 × 2
  });

  it('inside each copy, centre 0.5 is the copy centre', () => {
    const geo = run([
      { id: 'c', type: 'clone', params: { mode: 'linear', count: 2 } },
      { id: 's', type: 'step', children: [{ id: 'sp', type: 'spherize', params: { strength: 0.5, radius: 0.4 } }] },
    ]);
    // Both copies deform (with a global centre, the second would be outside the radius).
    expect(geo.shapes[0]!.subpaths[0]!.segs.length).toBeGreaterThan(4);
    expect(geo.shapes[1]!.subpaths[0]!.segs.length).toBeGreaterThan(4);
  });

  it('without Clone each shape is an element; a disabled child does not count', () => {
    const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="10" height="10"/><rect x="50" y="0" width="10" height="10"/></svg>';
    const on = run([{ id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { y: 5 } }] }], two);
    expect(boxOf(on, 1).y - boxOf(on, 0).y).toBeCloseTo(5);
    const off = run([{ id: 's', type: 'step', children: [{ id: 't', type: 'transform', enabled: false, params: { y: 5 } }] }], two);
    expect(boxOf(off, 0).y).toBe(0);
  });
});

describe('distortions', () => {
  const run = (type: string, params: Record<string, unknown> = {}) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'x', type, params }] });

  it('all work with their defaults and with no effect return the same', () => {
    const neutral: Record<string, Record<string, unknown>> = {
      taper: { amount: 0 },
      shear: { x: 0, y: 0 },
      ripple: { amplitude: 0 },
      melt: { amount: 0 },
      perspective: { topLeft: [0, 0], topRight: [1, 0] },
      envelope: {},
      cylinder: { wrap: 0.0001, perspective: 0 },
    };
    for (const [type, params] of Object.entries(neutral)) {
      expect(() => run(type)).not.toThrow();
      if (type === 'cylinder') continue; // with minimum wrap it is almost flat, not identical
      const b = bounds(run(type, params));
      expect(b.x).toBeCloseTo(20);
      expect(b.width).toBeCloseTo(60);
    }
  });

  it('taper narrows the end; shear slants', () => {
    const t = run('taper', { amount: 0.5 }).shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const bottom = t.filter((p) => p[1] > 79.999);
    expect(Math.max(...bottom.map((p) => p[0])) - Math.min(...bottom.map((p) => p[0]))).toBeCloseTo(30);
    expect(bounds(run('shear', { x: 45, y: 0 })).width).toBeCloseTo(120);
  });

  it('perspective takes each corner to its place', () => {
    const geo = run('perspective', { topLeft: [0.25, 0], topRight: [0.75, 0], bottomRight: [1, 1], bottomLeft: [0, 1] });
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => Math.abs(p[1] - 20) < 1e-6);
    expect(Math.min(...top.map((p) => p[0]))).toBeCloseTo(35);
    expect(Math.max(...top.map((p) => p[0]))).toBeCloseTo(65);
  });

  it('melt only goes down, and more the lower', () => {
    const b = bounds(run('melt', { amount: 0.5 }));
    expect(b.y).toBeCloseTo(20);
    expect(b.y + b.height).toBeGreaterThan(80);
  });
});

describe('dice', () => {
  it('randomizes within the ranges and is reproducible with the same randomness', async () => {
    const { randomizeParams, rng, spherize, clone, crack } = await import('../src');
    const a = randomizeParams(spherize.params, resolveParams(spherize.params), rng(5));
    const b = randomizeParams(spherize.params, resolveParams(spherize.params), rng(5));
    expect(a).toEqual(b);
    expect(a.strength as number).toBeGreaterThanOrEqual(-1);
    expect(a.strength as number).toBeLessThanOrEqual(1);
    const [cx, cy] = a.center as [number, number];
    expect(cx).toBeGreaterThanOrEqual(0.2);
    expect(cy).toBeLessThanOrEqual(0.8);
    // Clone's mode and Crack's colour are not randomized.
    expect(randomizeParams(clone.params, resolveParams(clone.params), rng(1)).mode).toBe('grid');
    expect(randomizeParams(crack.params, resolveParams(crack.params), rng(1)).color).toBe('#000000');
  });
});

describe('color', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/><rect x="50" width="10" height="10" fill="#ff0000" stroke="#0000ff"/><rect y="50" width="10" height="10" fill="none"/></svg>';
  const run = (params: Record<string, unknown>, stack: StackInput['stack'] = []) =>
    createEngine(builtins).evaluateStack({ source: two, stack: [...stack, { id: 'c', type: 'color', params }] });

  it('shift: turning the hue of red by 120° gives green; none is left alone', () => {
    const geo = run({ mode: 'shift', hue: 120 });
    expect(geo.shapes[0]!.style.fill).toBe('#00ff00');
    expect(geo.shapes[2]!.style.fill).toBe('none');
    expect(geo.shapes[1]!.style.stroke).toBe('#0000ff'); // target fill: the stroke stays the same
  });

  it('gradient spreads from one colour to another across the elements', () => {
    const geo = run({ mode: 'gradient', from: '#000000', to: '#ffffff' });
    expect(geo.shapes[0]!.style.fill).toBe('#000000');
    expect(geo.shapes[1]!.style.fill).toBe('#636363');
  });

  it('random is deterministic and changes with the seed', () => {
    const a = run({ mode: 'random', seed: 3 }).shapes.map((s) => s.style.fill);
    expect(run({ mode: 'random', seed: 3 }).shapes.map((s) => s.style.fill)).toEqual(a);
    expect(run({ mode: 'random', seed: 4 }).shapes.map((s) => s.style.fill)).not.toEqual(a);
  });

  it('inside Step the hue steps copy by copy', () => {
    const geo = createEngine(builtins).evaluateStack({
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#ff0000"/></svg>',
      stack: [
        { id: 'cl', type: 'clone', params: { mode: 'linear', count: 3 } },
        { id: 's', type: 'step', children: [{ id: 'c', type: 'color', params: { hue: 120 } }] },
      ],
    });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00ff00', '#0000ff', '#ff0000']);
  });

  it('parseColor understands short hex, rgb() and names', async () => {
    const { parseColor } = await import('../src');
    expect(parseColor('#f00')).toEqual([255, 0, 0, 1]);
    expect(parseColor('rgb(0, 128, 255)')).toEqual([0, 128, 255, 1]);
    expect(parseColor('white')).toEqual([255, 255, 255, 1]);
    expect(parseColor('url(#g)')).toBeNull();
  });
});

describe('paint', () => {
  const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/><line x1="0" y1="50" x2="100" y2="50" stroke="#000" fill="none"/></svg>';
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: src, stack: [{ id: 'p', type: 'paint', params }] });

  it('amount 1 replaces the fill; 0.5 mixes; unfilled lines are not filled', () => {
    expect(run({ fillColor: '#0000ff' }).shapes[0]!.style.fill).toBe('#0000ff');
    expect(run({ fillColor: '#0000ff', fillAmount: 0.5 }).shapes[0]!.style.fill).toBe('#b200b8');
    expect(run({ fillColor: '#0000ff' }).shapes[1]!.style.fill).toBe('none');
    expect(run({ fillColor: '#0000ff', fillEmpty: true }).shapes[1]!.style.fill).toBe('#0000ff');
  });

  it('the stroke is added with its colour, width and opacity', () => {
    const s = run({ fill: false, stroke: true, strokeColor: '#00ff00', strokeWidth: 3, strokeOpacity: 0.5 }).shapes[0]!.style;
    expect(s).toMatchObject({ fill: '#ff0000', stroke: '#00ff00', 'stroke-width': '3', 'stroke-opacity': '0.5' });
  });
});

describe('tint', () => {
  it('pushes the colour towards the target; in Step, each copy a little more', () => {
    const geo = createEngine(builtins).evaluateStack({
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000000"/></svg>',
      stack: [
        { id: 'cl', type: 'clone', params: { mode: 'linear', count: 3 } },
        { id: 's', type: 'step', children: [{ id: 't', type: 'tint', params: { color: '#ffffff', amount: 0.25 } }] },
      ],
    });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#222222', '#636363', '#aeaeae']);
  });
});

describe('mirror', () => {
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mirror', params }] });

  it('symmetry: the original and its reflection on the other side of the right edge', () => {
    const geo = run({});
    expect(geo.shapes).toHaveLength(2);
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 120, height: 60 });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1]);
  });

  it('without the original and vertical, with the axis at the centre: it stays in place', () => {
    const geo = run({ axis: 'vertical', position: 0.5, original: 'transform' });
    expect(geo.shapes).toHaveLength(1);
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
});

describe('linear clone with even gaps', () => {
  it('with scale, the gaps between copies are all equal', () => {
    const geo = createEngine(builtins).evaluateStack({
      source: square,
      stack: [{ id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.5, 0], scaleStep: 0.5, even: true } }],
    });
    const boxes = geo.shapes.map((s) => bounds({ viewBox: [0, 0, 0, 0], shapes: [s] })).sort((a, b) => a.x - b.x);
    const gaps = boxes.slice(1).map((b, i) => b.x - (boxes[i]!.x + boxes[i]!.width));
    // The square is 60 and the offset 90: a gap of 30 between all of them.
    for (const g of gaps) expect(g).toBeCloseTo(30);
  });
});

describe('gradient', () => {
  it('puts url(#…) in the fill and writes the gradient in <defs>', () => {
    const e = createEngine(builtins);
    const scene: StackInput = { source: square, stack: [{ id: 'g', type: 'gradient', params: { angle: 0 } }] };
    const geo = e.evaluateStack(scene);
    expect(geo.shapes[0]!.style.fill).toMatch(/^url\(#svk-/);
    const svg = toSVG(e.evaluateStack(scene));
    expect(svg).toContain('<defs><linearGradient');
    expect(svg).toContain('x1="0" y1="0.5" x2="1" y2="0.5"');
  });
});

describe('mosaic', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params }] });
  const area = (geo: { shapes: { subpaths: { start: readonly [number, number]; segs: { p: readonly [number, number] }[] }[] }[] }) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + Math.abs(a) / 2;
    }, 0);

  it('without a gap, 2 × 2 tiles covering the drawing; each one an element', () => {
    const geo = run({ columns: 2, rows: 2, gutter: [0, 0] });
    expect(geo.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
    expect(area(geo)).toBeCloseTo(3600);
  });

  it('the gap, in px: the space between tiles', () => {
    // 2 × 2 tiles of 30 with a 10 px gap: each one 20 × 20.
    expect(area(run({ columns: 2, rows: 2, gutter: [10, 10] }))).toBeCloseTo(4 * 400);
    // Only in X: 3 × 3 tiles of 20 with 10 px → 10 × 20 each.
    expect(area(run({ columns: 3, rows: 3, gutter: [10, 0] }))).toBeCloseTo(9 * 200);
    // More gap than tile: nothing remains.
    expect(run({ columns: 2, rows: 2, gutter: [40, 40] }).shapes).toHaveLength(0);
  });

  it('triangles and hexagons cover everything; circles, π/4', () => {
    expect(area(run({ tile: 'triangle', columns: 3, rows: 3, gutter: [0, 0] }))).toBeCloseTo(3600, 0);
    expect(area(run({ tile: 'hexagon', columns: 3, rows: 3, gutter: [0, 0] }))).toBeCloseTo(3600, 0);
    expect(area(run({ tile: 'circle', columns: 2, rows: 2, gutter: [0, 0] }) ) / 3600).toBeCloseTo(Math.PI / 4, 2);
  });

  it('polygons and stars, one per cell', () => {
    const hex = run({ tile: 'polygon', sides: 6, columns: 2, rows: 2, gutter: [0, 0] });
    expect(hex.shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3]);
    // Hexagon inscribed in a cell of 30 (radius 15): 3√3/2 · r².
    expect(area(hex) / 4).toBeCloseTo((3 * Math.sqrt(3) / 2) * 15 * 15, 0);
    expect(area(run({ tile: 'star', sides: 5, columns: 2, rows: 2, gutter: [0, 0] }))).toBeLessThan(area(run({ tile: 'polygon', sides: 5, columns: 2, rows: 2, gutter: [0, 0] })));
  });

  it('whole: whole tiles where the drawing covers at least half', () => {
    // 4 × 4 cells of 25 on the 100 canvas, but the drawing is the 60 square: the grid fits
    // to it, so all fall inside and come out whole (complete circles, not clipped).
    const geo = run({ tile: 'circle', fit: 'whole', columns: 3, rows: 3, gutter: [0, 0] });
    expect(geo.shapes).toHaveLength(9);
    expect(area(geo) / 3600).toBeCloseTo(Math.PI / 4, 2);
  });
});

describe('mosaic with another object as the shape', () => {
  it('each cell holds the object shape, fitted without distortion', () => {
    const doc = createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'object', id: 'd', name: 'd', source: square, stack: [{ id: 'm', type: 'mosaic', params: { tile: 'shape', source: 'tri', columns: 2, rows: 2, gutter: [0, 0], fit: 'whole' } }] },
        { kind: 'shape', id: 'tri', name: 'tri', shape: 'polygon', params: { sides: 3 }, stack: [], transform: { x: 500 } },
      ],
    });
    const tiles = doc.geometry.shapes.filter((s) => s.node === 'd');
    expect(tiles).toHaveLength(4);
    // Each tile, a triangle (3 vertices).
    expect(tiles.every((s) => s.subpaths[0]!.segs.length === 3)).toBe(true);
  });

  it('without an object, the drawing as it was', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params: { tile: 'shape' } }] });
    expect(bounds(geo)).toMatchObject({ x: 20, width: 60 });
  });
});

describe('turned mosaic', () => {
  it('with the grid at 45° it still covers the whole drawing', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'm', type: 'mosaic', params: { columns: 4, rows: 4, gutter: [0, 0], angle: 45 } }] });
    const b = bounds(geo);
    expect(b.x).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(60);
    // The corner pieces are triangles (the grid is diagonal).
    expect(geo.shapes.some((s) => s.subpaths[0]!.segs.length === 3)).toBe(true);
  });
});

describe('damage', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params }] });
  const holes = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).length;

  it('cuts cracks, chips and specks; same seed, same result', () => {
    const a = run({ seed: 7 });
    expect(holes(a)).toBeGreaterThan(5);
    expect(JSON.stringify(run({ seed: 7 }))).toBe(JSON.stringify(a));
    expect(JSON.stringify(run({ seed: 8 }))).not.toBe(JSON.stringify(a));
    // It stays inside the shape.
    const b = bounds(a);
    expect(b.x).toBeGreaterThanOrEqual(19.99);
    expect(b.x + b.width).toBeLessThanOrEqual(80.01);
  });

  it('with nothing to cut, leaves the shape as it was', () => {
    const geo = run({ cracks: 0, chips: 0, specks: 0 });
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });
});

describe('roughen and fractal', () => {
  const run = (stack: StackInput['stack']) => createEngine(builtins).evaluateStack({ source: square, stack });
  const points = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).reduce((n, sp) => n + sp.segs.length, 0);

  it('koch: each iteration multiplies the segments by 4 (square: 4 → 16 → 64)', () => {
    expect(points(run([{ id: 'r', type: 'roughen', params: { mode: 'koch', iterations: 1 } }]))).toBe(16);
    expect(points(run([{ id: 'r', type: 'roughen', params: { mode: 'koch', iterations: 2 } }]))).toBe(64);
  });

  it('organic: tears without straying much, and always the same with the same seed', () => {
    const a = run([{ id: 'r', type: 'roughen', params: { amount: 0.5, detail: 0.05 } }]);
    expect(points(a)).toBeGreaterThan(20);
    expect(JSON.stringify(run([{ id: 'r', type: 'roughen', params: { amount: 0.5, detail: 0.05 } }]))).toBe(JSON.stringify(a));
  });

  it('fractal: sierpinski 3ⁿ copies; carpet capped; tree keeps every level', () => {
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'sierpinski', depth: 3 } }]).shapes).toHaveLength(27);
    // 8⁵ = 32,768 > 4,096: drops to 8⁴.
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'carpet', depth: 5 } }]).shapes).toHaveLength(4096);
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 3 } }]).shapes).toHaveLength(1 + 2 + 4 + 8);
    expect(run([{ id: 'f', type: 'fractal', params: { preset: 'spiral', depth: 10 } }]).shapes).toHaveLength(11);
  });
});

describe('fractal fit and glitch', () => {
  const run = (stack: StackInput['stack']) => createEngine(builtins).evaluateStack({ source: square, stack });

  it('fit: the tree fits in the original square box', () => {
    const b = bounds(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 6 } }]));
    expect(b.width).toBeLessThanOrEqual(60.01);
    expect(b.height).toBeLessThanOrEqual(60.01);
    expect(b.x).toBeGreaterThanOrEqual(19.99);
    const free = bounds(run([{ id: 'f', type: 'fractal', params: { preset: 'tree', depth: 6, fit: false } }]));
    expect(free.height).toBeGreaterThan(60);
  });

  it('glitch, in pieces: each does its own thing and they combine; same seed, same result', () => {
    // Slices: bands, each one an element.
    const sl = run([{ id: 's', type: 'slices', params: { count: 6, chance: 1, seed: 3 } }]);
    expect(new Set(sl.shapes.map((s) => s.clone)).size).toBe(6);
    expect(JSON.stringify(run([{ id: 's', type: 'slices', params: { count: 6, chance: 1, seed: 3 } }]))).toBe(JSON.stringify(sl));
    // Blocks: more pieces (what is inside each block, separate) and the same surface moved.
    expect(run([{ id: 'b', type: 'blocks', params: { count: 4, size: 0.2, seed: 2 } }]).shapes.length).toBeGreaterThan(1);
    // Scanlines: the square is still one, with gaps.
    const sc = run([{ id: 'l', type: 'scanlines', params: { count: 10 } }]);
    expect(sc.shapes).toHaveLength(1);
    expect(sc.shapes[0]!.subpaths.length).toBeGreaterThan(5);
    // Streaks: the drawing, plus streaks in the drawing colour.
    const st = run([{ id: 'r', type: 'streaks', params: { count: 5 } }]);
    expect(st.shapes).toHaveLength(6);
    // Chained: the bands go through the blocks.
    expect(run([{ id: 's', type: 'slices', params: { seed: 1 } }, { id: 'b', type: 'blocks', params: { seed: 1 } }]).shapes.length).toBeGreaterThan(sl.shapes.length);
  });

});

describe('damage: pieces', () => {
  it('a through crack splits the square: each piece is an element', () => {
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params: { cracks: 0, chips: 0, specks: 0, through: 1, roughness: 0 } }] });
    expect(geo.shapes.length).toBeGreaterThanOrEqual(2);
    expect(geo.shapes.map((s) => s.clone)).toEqual(geo.shapes.map((_, i) => i));
  });
});

describe('to zero and dice', () => {
  it('to zero: numbers and angles to 0, scale to 1, counts to their minimum', () => {
    const t = builtins.find((m) => m.type === 'transform')!;
    expect(zeroParams(t.params, resolveParams(t.params, { x: 5, rotation: 30, scale: 2 }))).toMatchObject({ x: 0, rotation: 0, scale: 1 });
    const c = builtins.find((m) => m.type === 'clone')!;
    expect(zeroParams(c.params, resolveParams(c.params)).count).toBe(1);
    // Places in the drawing (Explosion's centre) go back to their default, not to the corner.
    const ex = builtins.find((d) => d.type === 'explosion')!;
    expect(zeroParams(ex.params, resolveParams(ex.params, { center: [0.1, 0.9], amount: 1 }))).toMatchObject({ center: [0.5, 0.5], amount: 0 });
    // Distances, to zero: Mosaic's gap.
    const mo = builtins.find((d) => d.type === 'mosaic')!;
    expect(zeroParams(mo.params, resolveParams(mo.params)).gutter).toEqual([0, 0]);
  });
  it('the dice stays close to the starting values (not end to end)', () => {
    const c = builtins.find((m) => m.type === 'clone')!;
    for (let i = 0; i < 50; i++) {
      const v = randomizeParams(c.params, resolveParams(c.params), rng(i)).count as number;
      expect(v).toBeLessThanOrEqual(6 + 64 * 0.15 + 1);
    }
  });
});

describe('radial gradient with a middle colour', () => {
  it('radial with centre, radius and focus; middle colour', () => {
    const svg = toSVG(createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'g', type: 'gradient', params: { kind: 'radial', center: [0.3, 0.4], radius: 0.8, focus: [0.2, 0.2], via: true, viaColor: '#ff0000' } }] }));
    expect(svg).toContain('<radialGradient');
    expect(svg).toContain('cx="0.3" cy="0.4" r="0.8" fx="0.2" fy="0.2"');
    expect(svg).toContain('stop-color="#ff0000"');
  });
});

describe('range, field and opacity', () => {
  const grid = (stack: StackInput['stack']) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.2, 0] } }, ...stack] });
  const op = (geo: ReturnType<typeof grid>) => geo.shapes.map((s) => Number(s.style.opacity ?? 1));

  it('range: only the elements in the range get the effect (square)', () => {
    const geo = grid([{ id: 'r', type: 'range', params: { start: 0, end: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([0, 0, 1, 1]);
  });

  it('range with offset: the range moves', () => {
    const geo = grid([{ id: 'r', type: 'range', params: { start: 0, end: 0.5, offset: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([1, 1, 0, 0]);
  });

  it('field: more effect near the centre, none outside the radius', () => {
    const geo = grid([{ id: 'f', type: 'field', params: { center: [0.5, 0.5], radius: 0.35, softness: 0.5 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    const o = op(geo);
    // The leftmost copy is far away: almost untouched; the ones at the centre, almost invisible.
    expect(Math.max(...o)).toBeGreaterThan(0.9);
    expect(Math.min(...o)).toBeLessThan(0.5);
  });

  it('after a Clone, fractions are measured on all the copies, not on one', () => {
    // Centre on the left edge of the set and a small radius: only the first copy.
    const geo = grid([{ id: 'f', type: 'field', params: { center: [0, 0.5], radius: 0.2, softness: 0 }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] }]);
    expect(op(geo)).toEqual([0, 1, 1, 1]);
  });

  it('in the scene, each effect says which box it measures on (refs)', () => {
    const engine = createEngine(builtins);
    const doc = engine.evaluateDocument({
      version: 2,
      objects: [{ kind: 'shape', id: 'n', name: 'n', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [
        { id: 'before', type: 'spherize' },
        { id: 'c', type: 'clone', params: { mode: 'linear', count: 3, offset: [2, 0] } },
        { id: 'after', type: 'field' },
      ] }],
    });
    const info = doc.nodes.get('n')!;
    expect(info.refs!.before!.width).toBeCloseTo(10);
    expect(info.refs!.c!.width).toBeCloseTo(10);
    expect(info.refs!.after!.width).toBeCloseTo(50);
    expect(info.refs!['']!.width).toBeCloseTo(50);
  });
});

describe('weighted trim', () => {
  it('inside Stagger, strokes draw one after another', () => {
    const lines = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40"><line x1="0" y1="0" x2="100" y2="0" stroke="#000"/><line x1="0" y1="20" x2="100" y2="20" stroke="#000"/><line x1="0" y1="40" x2="100" y2="40" stroke="#000"/></svg>';
    const len = (progress: number) =>
      createEngine(builtins)
        .evaluateStack({ source: lines, stack: [{ id: 's', type: 'stagger', params: { progress, stagger: 1, ease: 'linear' }, children: [{ id: 't', type: 'trim', params: { end: 0 } }] }] })
        .shapes.map((sh) => Math.round(sh.subpaths.reduce((sum, sp) => sum + sp.segs.reduce((a, g, i) => a + Math.hypot(g.p[0] - (i ? sp.segs[i - 1]!.p[0] : sp.start[0]), g.p[1] - (i ? sp.segs[i - 1]!.p[1] : sp.start[1])), 0), 0)));
    expect(len(0)).toEqual([0, 0, 0]);
    expect(len(0.5)).toEqual([100, 50, 0]);
    expect(len(1)).toEqual([100, 100, 100]);
  });
});

describe('stagger', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({
      source: square,
      stack: [
        { id: 'c', type: 'clone', params: { mode: 'linear', count: 4, offset: [1.2, 0] } },
        { id: 's', type: 'stagger', params: { ease: 'linear', ...params }, children: [{ id: 'o', type: 'opacity', params: { opacity: 0 } }] },
      ],
    });
  const op = (geo: ReturnType<typeof run>) => geo.shapes.map((s) => Math.round(Number(s.style.opacity ?? 1) * 100) / 100);

  it('in: at the start all with the effect; at the end, all in place', () => {
    expect(op(run({ progress: 0 }))).toEqual([0, 0, 0, 0]);
    expect(op(run({ progress: 1 }))).toEqual([1, 1, 1, 1]);
  });
  it('halfway and fully staggered: the first ones have arrived and the last ones have not', () => {
    expect(op(run({ progress: 0.5, stagger: 1 }))).toEqual([1, 1, 0, 0]);
  });
  it('out and reverse order', () => {
    expect(op(run({ progress: 0.5, stagger: 1, direction: 'out', order: 'reverse' }))).toEqual([1, 1, 0, 0]);
  });
});

describe('damage: continuous growth', () => {
  const run = (params: Record<string, unknown>) =>
    createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'd', type: 'damage', params: { seed: 4, ...params } }] });
  const area = (geo: ReturnType<typeof run>) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + a / 2;
    }, 0);

  it('when growing, what is cut only increases (the cracks advance along their path)', () => {
    const areas = [0.25, 0.5, 0.75, 1].map((g) => Math.abs(area(run({ growth: g, chips: 0, specks: 0, roughness: 0.5 }))));
    for (let i = 1; i < areas.length; i++) expect(areas[i]!).toBeLessThanOrEqual(areas[i - 1]! + 1e-6);
  });

  it('specks and chips do not move when Growth changes', () => {
    const a = run({ growth: 0.3, cracks: 0 }), b = run({ growth: 0.9, cracks: 0 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('trim', () => {
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 't', type: 'trim', params }] });
  const length = (geo: ReturnType<typeof run>) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      let p0 = sp.start, l = 0;
      for (const g of sp.segs) {
        l += Math.hypot(g.p[0] - p0[0], g.p[1] - p0[1]);
        p0 = g.p;
      }
      return sum + l;
    }, 0);
  it('keeps the requested part of the length (square of 240: half, 120)', () => {
    expect(length(run({ start: 0, end: 0.5 }))).toBeCloseTo(120, 0);
    expect(length(run({ start: 0.25, end: 0.5 }))).toBeCloseTo(60, 0);
  });
  it('on a closed path, the offset wraps around without losing length', () => {
    expect(length(run({ start: 0, end: 0.5, offset: 0.75 }))).toBeCloseTo(120, 0);
  });
  it('end 0: nothing remains', () => {
    expect(run({ start: 0, end: 0 }).shapes.flatMap((s) => s.subpaths)).toHaveLength(0);
  });
});

describe('fast clipping', () => {
  it('simplify removes the extra points and keeps the shape', () => {
    // A square with 100 points per side: with tolerance, its 4 corners remain.
    const side = (i: number): [number, number][] => Array.from({ length: 100 }, (_, k) => {
      const t = k / 100;
      return ([[t * 10, 0], [10, t * 10], [10 - t * 10, 10], [0, 10 - t * 10]] as [number, number][])[i]!;
    });
    const ring = [...side(0), ...side(1), ...side(2), ...side(3)];
    const out = simplify([[[...ring, ring[0]!]]], 0.01);
    expect(out[0]![0]!.length).toBe(5);
  });

  it('covers: the box, fully inside the surface or not', () => {
    const sq = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] as [number, number][][][];
    expect(covers(sq, { x: 2, y: 2, width: 3, height: 3 })).toBe(true);
    // An edge crosses it (even though the square corners are far away).
    expect(covers(sq, { x: 8, y: 2, width: 4, height: 3 })).toBe(false);
    expect(covers(sq, { x: 20, y: 20, width: 3, height: 3 })).toBe(false);
  });
});

describe('bones', () => {
  // A long bar (100 × 10), with the chain from left to right.
  const bar = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 10"><rect width="100" height="10"/></svg>';
  const run = (params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source: bar, stack: [{ id: 'b', type: 'bones', params }] });
  const tip = (geo: ReturnType<typeof run>) => {
    // The point furthest from the chain origin: the tip.
    const pts = geo.shapes.flatMap((s) => s.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]));
    return pts.reduce((best, q) => (Math.hypot(q[0], q[1] - 5) > Math.hypot(best[0], best[1] - 5) ? q : best));
  };

  it('with the angles at 0, the drawing as it was', () => {
    expect(bounds(run({ angle1: 0, angle2: 0, angle3: 0, angle4: 0 }))).toEqual({ x: 0, y: 0, width: 100, height: 10 });
  });

  it('each bone turns on its joint: bending the last only moves the tip', () => {
    const geo = run({ segments: 2, angle1: 0, angle2: 90, smooth: 0 });
    const b = bounds(geo);
    // The first bone (0–50) stays; the second goes straight down from x ≈ 50.
    expect(b.x).toBeCloseTo(0, 0);
    expect(b.x + b.width).toBeLessThan(60);
    expect(b.y + b.height).toBeGreaterThan(50);
  });

  it('IK: the tip reaches the target', () => {
    // Target (in fractions of the bar): x = 60, y = 40.
    const [x, y] = tip(run({ segments: 3, ik: true, target: [0.6, 4], smooth: 0 }));
    expect(Math.hypot(x - 60, y - 40)).toBeLessThan(6);
  });
});

describe('glitch on strokes (no fill)', () => {
  const rings = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g fill="none" stroke="#ededed" stroke-width="2"><circle cx="100" cy="100" r="40"/><circle cx="100" cy="100" r="80"/></g></svg>';
  const vline = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="50" y1="0" x2="50" y2="100" stroke="#000"/><line x1="0" y1="50" x2="100" y2="50" stroke="#000" fill="none"/></svg>';
  const run = (source: string, type: string, params: Record<string, unknown>) => createEngine(builtins).evaluateStack({ source, stack: [{ id: 'g', type, params }] });
  const length = (geo: ReturnType<typeof run>) =>
    geo.shapes.reduce((sum, s) => sum + s.subpaths.reduce((a, sp) => a + sp.segs.reduce((b, g, i) => b + Math.hypot(g.p[0] - (i ? sp.segs[i - 1]!.p[0] : sp.start[0]), g.p[1] - (i ? sp.segs[i - 1]!.p[1] : sp.start[1])), 0), 0), 0);
  const points = (geo: ReturnType<typeof run>) => JSON.stringify(geo.shapes.map((s) => s.subpaths));

  it('Blocks cuts and displaces the rings', () => {
    const before = run(rings, 'blocks', { count: 0 });
    const after = run(rings, 'blocks', { count: 12, size: 0.15, shift: 0.1, seed: 3 });
    expect(points(after)).not.toBe(points(before));
    expect(before.shapes).toHaveLength(2);
    // It moves pieces, it does not lose them: the total length is that of the two rings (2π · 120).
    expect(length(after)).toBeCloseTo(2 * Math.PI * 120, 0);
    expect(after.shapes.every((s) => s.style.fill === 'none' && s.style.stroke === '#ededed')).toBe(true);
  });

  it('Slices: each band an element; the length is kept', () => {
    const geo = run(vline, 'slices', { count: 5, chance: 1, shift: 0.1 });
    expect(length(geo)).toBeCloseTo(200, 0);
    expect(new Set(geo.shapes.map((s) => s.clone)).size).toBe(5);
  });

  it('Scanlines removes the parts falling on the little lines', () => {
    const geo = run(vline, 'scanlines', { count: 10, width: 2 });
    // The vertical loses 10 × 2 px; the horizontal (y = 50) falls right between two little lines and loses nothing.
    expect(length(geo)).toBeCloseTo(180, 0);
  });
});

describe('streaks', () => {
  it('with Bite, each streak leaves a gap in the shape; with 0, the shape stays intact', () => {
    const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#777"/></svg>';
    const run = (bite: number) => createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 's', type: 'streaks', params: { count: 5, width: 4, bite, seed: 2 } }] });
    const intact = run(0).shapes[0]!;
    expect(intact.subpaths).toHaveLength(1);
    expect(intact.subpaths[0]!.segs).toHaveLength(4);
    // With a gap, the square outline has more vertices (the notches).
    const bitten = run(1).shapes[0]!;
    expect(bitten.subpaths.reduce((n, sp) => n + sp.segs.length, 0)).toBeGreaterThan(4 + 5 * 3);
  });

  it('what sticks out on one side is missing on the other, the same length with Bite 1', () => {
    const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" fill="#777"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 's', type: 'streaks', params: { count: 1, width: 4, bite: 1, seed: 7 } }] });
    const [shape, bar] = geo.shapes;
    const xs = (sh: typeof shape) => sh!.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]).map((q) => q[0]);
    const barX = xs(bar);
    const barLen = Math.max(...barX) - Math.min(...barX);
    const outLeft = Math.min(...barX) < 0;
    // The notch: the square vertices that are neither on its corners nor on its top and bottom sides.
    const notch = shape!.subpaths.flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]).filter((q) => q[1] > 0.5 && q[1] < 199.5 && q[0] > 0.5 && q[0] < 199.5).map((q) => q[0]);
    expect(notch.length).toBeGreaterThan(0);
    // It sticks out on the left: the notch is on the right, and goes in as far as the streak sticks out.
    if (outLeft) expect(200 - Math.min(...notch)).toBeCloseTo(barLen, 0);
    else expect(Math.max(...notch)).toBeCloseTo(barLen, 0);
  });

  it('each streak leaves from the real outline (on a circle, not from its box)', () => {
    const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="100" fill="#777"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: circle, stack: [{ id: 's', type: 'streaks', params: { count: 40, length: 0.1, width: 1, seed: 3 } }] });
    const streaks = geo.shapes.slice(1);
    expect(streaks).toHaveLength(40);
    for (const s of streaks) {
      const pts = [s.subpaths[0]!.start, ...s.subpaths[0]!.segs.map((g) => g.p)];
      const xs = pts.map((q) => q[0]), y = (Math.min(...pts.map((q) => q[1])) + Math.max(...pts.map((q) => q[1]))) / 2;
      // The circle edge at that height.
      const half = Math.sqrt(Math.max(0, 100 ** 2 - (y - 100) ** 2));
      const [e0, e1] = [100 - half, 100 + half];
      const touches = (x: number) => Math.min(...xs) - 1 <= x && x <= Math.max(...xs) + 1;
      expect(touches(e0) || touches(e1)).toBe(true);
    }
  });
});

describe('rgb split', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 20"><rect x="0" y="0" width="20" height="20" fill="#fff"/><rect x="60" y="0" width="20" height="20" fill="#fff"/></svg>';
  const xOf = (s: Shape) => s.subpaths[0]!.start[0];
  it('two coloured copies, shifted to each side, behind the drawing', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5 } }] });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00e5ff', '#00e5ff', '#ff2bd6', '#ff2bd6', '#fff', '#fff']);
    expect(xOf(geo.shapes[0]!) - xOf(geo.shapes[4]!)).toBeCloseTo(-5);
    expect(xOf(geo.shapes[2]!) - xOf(geo.shapes[4]!)).toBeCloseTo(5);
  });
  it('in front and with a blend mode', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5, layer: 'front', blend: 'screen' } }] });
    expect(geo.shapes[0]!.style.fill).toBe('#fff');
    expect(geo.shapes.at(-1)!.style['mix-blend-mode']).toBe('screen');
  });
  it('without the original: only the two copies', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 5, original: false } }] });
    expect(geo.shapes.map((s) => s.style.fill)).toEqual(['#00e5ff', '#00e5ff', '#ff2bd6', '#ff2bd6']);
  });
  it('inside Step, each element with its own distance (the 2nd, double)', () => {
    const geo = createEngine(builtins).evaluateStack({ source: two, stack: [{ id: 's', type: 'step', children: [{ id: 'r', type: 'rgbsplit', params: { distance: 4 } }] }] });
    const cyan = geo.shapes.filter((s) => s.style.fill === '#00e5ff').map(xOf);
    expect(cyan).toEqual([-4, 52]);
  });
});

describe('rgb split with effects inside (only on the copies)', () => {
  const scene = (children: { id: string; type: string; params?: Record<string, unknown>; children?: unknown[] }[]) => ({
    version: 2 as const,
    objects: [{ kind: 'shape' as const, id: 'n', name: 'n', shape: 'rectangle', params: { width: 100, height: 40, fillColor: '#ffffff' }, transform: { x: 50 }, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 6 }, children: children as never }] }],
  });
  it('Blur inside: a <filter> only for the copies; the drawing without it', () => {
    const geo = createEngine(builtins).evaluateDocument(scene([{ id: 'b', type: 'blur', params: { amount: 3 } }])).geometry;
    const ids = Object.keys(geo.filters ?? {});
    expect(ids).toHaveLength(1);
    const [copyA, copyB, original] = geo.shapes;
    expect(copyA!.wrap).toEqual([ids[0]]);
    expect(copyB!.wrap).toEqual([ids[0]]);
    expect(original!.wrap ?? []).toEqual([]);
    expect(createEngine(builtins).toSVG(scene([{ id: 'b', type: 'blur', params: { amount: 3 } }]))).toContain('feGaussianBlur');
  });
  it('Transform inside: moves the copies, not the drawing', () => {
    const plain = createEngine(builtins).evaluateDocument(scene([])).geometry.shapes;
    const moved = createEngine(builtins).evaluateDocument(scene([{ id: 't', type: 'transform', params: { y: 10 } }])).geometry.shapes;
    expect(moved[2]!.subpaths[0]!.start).toEqual(plain[2]!.subpaths[0]!.start);
    expect(moved[0]!.subpaths[0]!.start[1]).toBeCloseTo(plain[0]!.subpaths[0]!.start[1] + 10);
  });
  it('not placed in a scene (evaluateStack), an inner filter does not break the SVG', () => {
    const src = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: src, stack: [{ id: 'r', type: 'rgbsplit', params: { distance: 2 }, children: [{ id: 'b', type: 'blur' }] }] });
    expect(toSVG(geo)).not.toContain('filter=');
  });
  it('after RGB Split, another effect does not lose the copies filter', () => {
    const s = scene([{ id: 'b', type: 'blur', params: { amount: 3 } }]);
    s.objects[0]!.stack.push({ id: 'w', type: 'wave', children: undefined as never, params: { amplitude: 0.02 } as never });
    expect(Object.keys(createEngine(builtins).evaluateDocument(s).geometry.filters ?? {})).toHaveLength(1);
  });
});

describe('round corners', () => {
  const run = (params: Record<string, unknown>, source = square) =>
    createEngine(builtins).evaluateStack({ source, stack: [{ id: 'r', type: 'roundcorners', params }] });
  const segs = (geo: ReturnType<typeof run>) => geo.shapes[0]!.subpaths[0]!.segs;
  const anchors = (geo: ReturnType<typeof run>) => {
    const sp = geo.shapes[0]!.subpaths[0]!;
    return [sp.start, ...sp.segs.map((s) => s.p)];
  };

  it('square: 4 sides + 4 arcs; the box does not change and the corners disappear', () => {
    const geo = run({ radius: 10 });
    expect(segs(geo)).toHaveLength(8);
    const b = bounds(geo);
    expect(b.x).toBeCloseTo(20);
    expect(b.width).toBeCloseTo(60);
    // No anchor on a corner; the cuts, 10 away from it.
    for (const p of anchors(geo)) expect(Math.hypot(p[0] - 20, p[1] - 20)).toBeGreaterThan(9.9);
    expect(anchors(geo).some((p) => Math.abs(p[0] - 30) < 1e-6 && Math.abs(p[1] - 20) < 1e-6)).toBe(true);
  });

  it('the arc goes where a circle of that radius would', () => {
    const geo = run({ radius: 10 });
    const sp = geo.shapes[0]!.subpaths[0]!;
    // Midpoint of each arc: 10 from the centre of its rounding (e.g. (30, 30) at the top-left corner).
    let p0 = sp.start;
    const mids: (readonly [number, number])[] = [];
    for (const s of sp.segs) {
      const m = [0.125 * p0[0] + 0.375 * s.c1[0] + 0.375 * s.c2[0] + 0.125 * s.p[0], 0.125 * p0[1] + 0.375 * s.c1[1] + 0.375 * s.c2[1] + 0.125 * s.p[1]] as const;
      if (Math.abs(p0[0] - s.p[0]) > 1e-6 && Math.abs(p0[1] - s.p[1]) > 1e-6) mids.push(m);
      p0 = s.p;
    }
    expect(mids).toHaveLength(4);
    const tl = mids.find((m) => m[0] < 50 && m[1] < 50)!;
    expect(Math.hypot(tl[0] - 30, tl[1] - 30)).toBeCloseTo(10, 1);
  });

  it('the radius shrinks if it does not fit (half a side at most)', () => {
    const geo = run({ radius: 400 });
    const b = bounds(geo);
    expect(b.width).toBeCloseTo(60);
    expect(segs(geo).length).toBeGreaterThanOrEqual(4);
  });

  it('the limit leaves corners wider than it', () => {
    // The square corners are 90°: with limit 80, none.
    expect(segs(run({ radius: 10, limit: 80 }))).toHaveLength(4);
    expect(segs(run({ radius: 10, limit: 90 }))).toHaveLength(8);
  });

  it('chamfer: cuts straight; radius 0 and a circle do not change', () => {
    const geo = run({ radius: 10, shape: 'chamfer' });
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.segs).toHaveLength(8);
    const circle = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30"/></svg>';
    const before = createEngine(builtins).evaluateStack({ source: circle, stack: [] });
    expect(JSON.stringify(run({ radius: 10 }, circle).shapes[0]!.subpaths)).toBe(JSON.stringify(before.shapes[0]!.subpaths));
    expect(JSON.stringify(run({ radius: 0 }).shapes[0]!.subpaths)).toBe(JSON.stringify(createEngine(builtins).evaluateStack({ source: square, stack: [] }).shapes[0]!.subpaths));
  });

  it('on an open path, the ends are left alone', () => {
    const polyline = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polyline points="10,90 50,10 90,90" fill="none" stroke="black"/></svg>';
    const geo = run({ radius: 10 }, polyline);
    const sp = geo.shapes[0]!.subpaths[0]!;
    expect(sp.segs).toHaveLength(3);
    expect(sp.start[0]).toBeCloseTo(10);
    expect(sp.segs[2]!.p[0]).toBeCloseTo(90);
  });
});

describe('metaball', () => {
  const circle = (id: string, x: number, r: number) => ({ kind: 'shape' as const, id, name: id, shape: 'ellipse', params: { width: 2 * r, height: 2 * r }, stack: [], transform: { x } });
  const run = (gap: number, params: Record<string, unknown> = {}) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'm', type: 'metaball', params: { reach: 40, ...params } }], children: [circle('a', -gap / 2, 50), circle('b', gap / 2, 35)] }],
    }).geometry;
  const loops = (geo: ReturnType<typeof run>) => geo.shapes.flatMap((s) => s.subpaths).filter((sp) => sp.closed).length;

  it('far (more than Reach between edges): two shapes; close: one, wider than both circles together', () => {
    expect(loops(run(140))).toBe(2);
    expect(loops(run(90))).toBe(1);
    const b = bounds(run(90));
    // The circles go from -95 to 80; the blob almost the same (the smooth union does not stick out at the ends).
    expect(b.x).toBeGreaterThan(-97);
    expect(b.x + b.width).toBeLessThan(82);
  });

  it('the outline follows the circle where there is no fusion (error below a cell)', () => {
    const geo = run(140);
    const pts = geo.shapes.flatMap((s) => s.subpaths).flatMap((sp) => [sp.start, ...sp.segs.map((g) => g.p)]);
    const big = pts.filter((q) => q[0] < 0);
    for (const q of big) expect(Math.abs(Math.hypot(q[0] + 70, q[1]) - 50)).toBeLessThan(1.5);
  });

  it('Reach 0: like a plain union; Grow fattens', () => {
    expect(loops(run(90, { reach: 0 }))).toBe(2);
    expect(bounds(run(140, { grow: 10 })).width).toBeGreaterThan(bounds(run(140)).width + 18);
  });

  it('a ring (with a hole) keeps the hole winding the other way', () => {
    const ringSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 50a50 50 0 1 0 100 0a50 50 0 1 0-100 0zM25 50a25 25 0 1 1 50 0a25 25 0 1 1-50 0z" fill-rule="evenodd"/></svg>';
    const geo = createEngine(builtins).evaluateStack({ source: ringSvg, stack: [{ id: 'm', type: 'metaball', params: { reach: 5 } }] });
    const sps = geo.shapes[0]!.subpaths;
    expect(sps).toHaveLength(2);
    const area = (sp: (typeof sps)[number]) => {
      const p = [sp.start, ...sp.segs.map((g) => g.p)];
      return p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length]![1] - p[(i + 1) % p.length]![0] * q[1], 0);
    };
    expect(Math.sign(area(sps[0]!))).not.toBe(Math.sign(area(sps[1]!)));
  });

  it('fast: two circles, under 60 ms', () => {
    run(90);
    const t0 = performance.now();
    run(91);
    expect(performance.now() - t0).toBeLessThan(60);
  });
});

describe('follow path', () => {
  // A 10 square running along a line from (0,0) to (200,0) (and a closed circle of radius 100).
  const box = (params: Record<string, unknown>, path: Record<string, unknown> = { kind: 'shape', id: 'p', name: 'p', shape: 'line', params: { length: 200 }, stack: [], transform: { x: 100 } }) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [{ id: 'f', type: 'followpath', params: { target: 'p', ...params } }], transform: { x: -500, y: 300 } },
        path,
      ],
    } as never).nodes.get('b')!.box;
  const centre = (b: { x: number; y: number; width: number; height: number }) => [b.x + b.width / 2, b.y + b.height / 2];

  it('goes to the point of the path Position says, wherever the object is', () => {
    const [x0, y0] = centre(box({ position: 0 }));
    expect(x0).toBeCloseTo(0, 0);
    expect(y0).toBeCloseTo(0, 0);
    expect(centre(box({ position: 0.5 }))[0]).toBeCloseTo(100, 0);
    // On an open path it does not go past the end.
    expect(centre(box({ position: 1 }))[0]).toBeCloseTo(200, 0);
  });

  it('Offset moves it to one side; Orient turns it with the path', () => {
    expect(centre(box({ position: 0.5, offset: 20 }))[1]).toBeCloseTo(20, 0);
    const circle = { kind: 'shape', id: 'p', name: 'p', shape: 'ellipse', params: { width: 200, height: 200 }, stack: [] };
    // A long rectangle: lying down where the circle runs vertically if it turns; unchanged if not.
    const long = (orient: boolean) =>
      createEngine(builtins).evaluateDocument({
        version: 2,
        objects: [
          { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 40, height: 4 }, stack: [{ id: 'f', type: 'followpath', params: { target: 'p', position: 0, orient } }] },
          circle,
        ],
      } as never).nodes.get('b')!.box;
    const a = long(true), b = long(false);
    expect(a.height).toBeGreaterThan(a.width);
    expect(b.width).toBeGreaterThan(b.height);
  });

  it('without a path, it stays as it is', () => {
    expect(box({ target: '' }).x).toBeCloseTo(-505);
  });
});

describe('connect', () => {
  const sq = (id: string, x: number, y = 0) => ({ kind: 'shape' as const, id, name: id, shape: 'rectangle', params: { width: 40, height: 40 }, stack: [], transform: { x, y } });
  const run = (params: Record<string, unknown>, a = sq('a', 0), b = sq('b', 200)) => {
    const doc = createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: { strokeColor: '#ff0000' }, stack: [{ id: 'c', type: 'connect', params: { from: 'a', to: 'b', ...params } }], transform: { x: 999, y: -50 } },
        a,
        b,
      ],
    } as never);
    return doc.geometry.shapes.filter((s) => s.node === 'l');
  };
  const ends = (shapes: ReturnType<typeof run>) => {
    const sp = shapes[0]!.subpaths[0]!;
    return [sp.start, sp.segs[sp.segs.length - 1]!.p] as const;
  };

  it('edge to edge, with its gap, wherever the line is; with the line style', () => {
    const shapes = run({});
    const [s, e] = ends(shapes);
    // Edges at x = 20 and x = 180; a gap of 6 (to the sampling precision).
    expect(s[0]).toBeCloseTo(26, 0);
    expect(e[0]).toBeCloseTo(174, 0);
    expect(s[1]).toBeCloseTo(0);
    expect(shapes[0]!.style.stroke).toBe('#ff0000');
    expect(shapes[0]!.style.fill).toBe('none');
  });

  it('without Edges, centre to centre; follows the objects when they move', () => {
    const [s, e] = ends(run({ edges: false, gap: 0 }, sq('a', 0), sq('b', 100, 100)));
    expect(s[0]).toBeCloseTo(0);
    expect(e[0]).toBeCloseTo(100);
    expect(e[1]).toBeCloseTo(100);
  });

  it('arc curves to one side; arrow adds the head; without objects nothing changes', () => {
    const arc = run({ shape: 'arc', bend: 0.3 });
    expect(Math.min(...arc[0]!.subpaths[0]!.segs.flatMap((g) => [g.c1[1], g.c2[1]]))).not.toBeCloseTo(0);
    expect(run({ arrow: 'both' })[0]!.subpaths).toHaveLength(3);
    expect(run({ from: '' })[0]!.subpaths[0]!.segs).toHaveLength(1);
  });
});

describe('trace', () => {
  // A square going from x = 0 to x = 100 in 1 s (linear), and the line with Trace behind.
  const scene = (params: Record<string, unknown> = {}) => ({
    version: 2,
    objects: [
      { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [] },
      { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: { strokeColor: '#00ff00' }, stack: [{ id: 't', type: 'trace', params: { target: 'b', length: 0.5, samples: 10, smooth: false, ...params } }], transform: { x: 40, y: 70 } },
    ],
    animation: { duration: 1, tracks: [{ id: 'k', node: 'b', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100, ease: 'linear' }] }] },
  }) as never;
  const trail = (e: ReturnType<typeof createEngine>, t: number, params?: Record<string, unknown>) => {
    return e.evaluateDocument(sampleScene(scene(params), t)).geometry.shapes.filter((s) => s.node === 'l');
  };

  it('at 0.8 s: from where it was 0.5 s ago (x ≈ 30) to where it is (80), with the line style', () => {
    const e = createEngine(builtins);
    const shapes = trail(e, 0.8);
    const sp = shapes[0]!.subpaths[0]!;
    const xs = [sp.start, ...sp.segs.map((g) => g.p)].map((q) => q[0]);
    expect(Math.min(...xs)).toBeCloseTo(30, 0);
    expect(Math.max(...xs)).toBeCloseTo(80, 5);
    expect(sp.segs.length).toBeGreaterThanOrEqual(9);
    expect(shapes[0]!.style.stroke).toBe('#00ff00');
  });

  it('at the start there is no trail yet; without a time (a still scene), neither', () => {
    const e = createEngine(builtins);
    expect(trail(e, 0)).toHaveLength(0);
    expect(e.evaluateDocument(scene()).geometry.shapes.filter((s) => s.node === 'l')).toHaveLength(0);
  });

  it('changes with time (not stuck in the cache) and gives the same going backwards', () => {
    const e = createEngine(builtins);
    const end = (t: number) => {
      const sp = trail(e, t)[0]!.subpaths[0]!;
      return sp.segs[sp.segs.length - 1]!.p[0];
    };
    expect(end(0.5)).toBeCloseTo(50, 5);
    expect(end(0.6)).toBeCloseTo(60, 5);
    expect(end(0.5)).toBeCloseTo(50, 5);
  });
});

describe('look at', () => {
  // A long rectangle (front to the right) at the origin and a point (circle) to look at.
  const run = (params: Record<string, unknown>, tx: number, ty: number) =>
    createEngine(builtins).evaluateDocument({
      version: 2,
      objects: [
        { kind: 'shape', id: 'a', name: 'a', shape: 'rectangle', params: { width: 60, height: 6 }, stack: [{ id: 'l', type: 'lookat', params: { target: 't', ...params } }] },
        { kind: 'shape', id: 't', name: 't', shape: 'ellipse', params: { width: 10, height: 10 }, stack: [], transform: { x: tx, y: ty } },
      ],
    } as never).nodes.get('a')!.box;

  it('turns to look at it (below: vertical; to the right: unchanged) without moving', () => {
    const down = run({}, 0, 200);
    expect(down.height).toBeCloseTo(60, 0);
    expect(down.x + down.width / 2).toBeCloseTo(0, 5);
    expect(run({}, 200, 0).width).toBeCloseTo(60, 0);
  });

  it('Facing says which side is the front; Amount, how much it turns', () => {
    expect(run({ facing: 90 }, 0, 200).width).toBeCloseTo(60, 0);
    // Halfway, 45°: the box is almost square.
    const half = run({ amount: 0.5 }, 0, 200);
    expect(Math.abs(half.width - half.height)).toBeLessThan(1);
  });
});

describe('trace in a loop', () => {
  it('when a lap starts, the trail carries on from the end of the previous one', () => {
    const scene = {
      version: 2,
      objects: [
        { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: 10, height: 10 }, stack: [] },
        { kind: 'shape', id: 'l', name: 'l', shape: 'line', params: {}, stack: [{ id: 't', type: 'trace', params: { target: 'b', length: 0.5, samples: 10, smooth: false } }] },
      ],
      animation: { duration: 1, loop: true, tracks: [{ id: 'k', node: 'b', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100, ease: 'linear' }] }] },
    } as never;
    const geo = createEngine(builtins).evaluateDocument(sampleScene(scene, 0.1)).geometry.shapes.find((s) => s.node === 'l')!;
    const xs = [geo.subpaths[0]!.start, ...geo.subpaths[0]!.segs.map((g) => g.p)].map((q) => q[0]);
    expect(Math.max(...xs)).toBeGreaterThan(80);
    expect(xs[xs.length - 1]).toBeCloseTo(10, 5);
  });
});

describe('pixelate', () => {
  const two = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100" fill="#ff0000"/><circle cx="50" cy="50" r="30" fill="#0000ff"/></svg>';
  const run = (params: Record<string, unknown>, source = two) => createEngine(builtins).evaluateStack({ source, stack: [{ id: 'p', type: 'pixelate', params }] });

  it('little squares in the colour of what is on top; runs per row', () => {
    const geo = run({ size: 10 });
    const fills = geo.shapes.map((s) => s.style.fill).sort();
    expect(fills).toEqual(['#0000ff', '#ff0000']);
    const blue = geo.shapes.find((s) => s.style.fill === '#0000ff')!;
    // The centre (50, 50) is blue; the corner, red. Everything on multiples of 10.
    for (const sp of blue.subpaths) for (const q of [sp.start, ...sp.segs.map((g) => g.p)]) {
      expect(q[0] % 10).toBeCloseTo(0);
      expect(q[1] % 10).toBeCloseTo(0);
    }
    // One run per row of the same colour (not a square per pixel).
    expect(blue.subpaths.length).toBeLessThanOrEqual(6);
  });

  it('with gap or dots, one path per pixel; with size 0 nothing changes', () => {
    expect(run({ size: 10, gap: 2 }).shapes.reduce((n, s) => n + s.subpaths.length, 0)).toBe(100);
    expect(run({ size: 10, shape: 'dot' }).shapes.reduce((n, s) => n + s.subpaths.length, 0)).toBe(100);
    expect(run({ size: 0 }).shapes).toHaveLength(2);
  });

  it('a line (stroke only) is pixelated too, with its stroke colour', () => {
    const ln = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="0" y1="5" x2="100" y2="5" stroke="#00ff00" stroke-width="10"/></svg>';
    const geo = run({ size: 10 }, ln);
    expect(geo.shapes).toHaveLength(1);
    expect(geo.shapes[0]!.style.fill).toBe('#00ff00');
  });
});

describe('dashed stroke and stroke behind', () => {
  it('primitives and Paint write dasharray, dashoffset and paint-order only when needed', async () => {
    const { buildShape } = await import('../src/shapes');
    const st = (p: Record<string, unknown>) => buildShape('rectangle', { stroke: true, ...p }).shapes[0]!.style;
    expect(st({})['stroke-dasharray']).toBeUndefined();
    expect(st({ dash: 6 })['stroke-dasharray']).toBe('6 6');
    expect(st({ dash: 6, gap: 2, dashOffset: 3 })).toMatchObject({ 'stroke-dasharray': '6 2', 'stroke-dashoffset': '3' });
    expect(st({ behind: true })['paint-order']).toBe('stroke');
    // Without a stroke, nothing.
    expect(buildShape('rectangle', { dash: 6 }).shapes[0]!.style['stroke-dasharray']).toBeUndefined();
    const geo = createEngine(builtins).evaluateStack({ source: square, stack: [{ id: 'p', type: 'paint', params: { stroke: true, dash: 4, behind: true } }] });
    expect(geo.shapes[0]!.style).toMatchObject({ 'stroke-dasharray': '4 4', 'paint-order': 'stroke' });
  });
});
