import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, isScene, renderInto, type Geometry, type SceneV2 } from '../src';

const rect = (w: number, h: number, fill = '#000') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
const engine = () => createEngine(builtins);

describe('scene', () => {
  it('recognises a scene (and rejects what is not one)', () => {
    expect(isScene({ version: 2, objects: [] })).toBe(true);
    expect(isScene({ version: 1, source: rect(10, 10), stack: [] })).toBe(false);
    expect(isScene(null)).toBe(false);
  });

  it('each object is centred on the origin and moves with its position', () => {
    const scene: SceneV2 = {
      version: 2,
      objects: [
        { kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [] },
        { kind: 'object', id: 'b', name: 'b', source: rect(20, 20), stack: [], transform: { x: 100 } },
      ],
    };
    const doc = engine().evaluateDocument(scene);
    expect(doc.nodes.get('a')!.box).toEqual({ x: -5, y: -5, width: 10, height: 10 });
    expect(doc.nodes.get('b')!.box).toEqual({ x: 90, y: -10, width: 20, height: 20 });
    // The first in the list is painted last (in front).
    expect(doc.geometry.shapes.map((s) => s.node)).toEqual(['b', 'a']);
  });

  it('each object has its own stack and its own reference box', () => {
    const scene: SceneV2 = {
      version: 2,
      objects: [
        { kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [{ id: 't', type: 'transform', params: { scale: 2 } }] },
        { kind: 'object', id: 'b', name: 'b', source: rect(10, 10), stack: [], transform: { x: 50 } },
      ],
    };
    const doc = engine().evaluateDocument(scene);
    expect(doc.nodes.get('a')!.box.width).toBeCloseTo(20);
    expect(doc.nodes.get('b')!.box.width).toBeCloseTo(10);
  });

  it('grouping moves nothing; moving the group moves its children', () => {
    const child = (id: string, x: number) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack: [], transform: { x } });
    const loose: SceneV2 = { version: 2, objects: [child('a', 0), child('b', 30)] };
    const grouped: SceneV2 = { version: 2, objects: [{ kind: 'group', id: 'g', name: 'g', stack: [], children: [child('a', 0), child('b', 30)] }] };
    const e = engine();
    expect(bounds(e.evaluateDocument(grouped).geometry)).toEqual(bounds(e.evaluateDocument(loose).geometry));
    const moved = { ...grouped, objects: [{ ...grouped.objects[0]!, transform: { y: 7 } }] } as SceneV2;
    const doc = e.evaluateDocument(moved);
    expect(doc.nodes.get('b')!.box.y).toBeCloseTo(2);
    expect(doc.nodes.get('g')!.box.y).toBeCloseTo(2);
  });

  it('Step on a group treats each child as an element', () => {
    const child = (id: string, x: number) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack: [], transform: { x } });
    const scene: SceneV2 = {
      version: 2,
      objects: [
        {
          kind: 'group',
          id: 'g',
          name: 'g',
          stack: [{ id: 's', type: 'step', children: [{ id: 't', type: 'transform', params: { y: 10 } }] }],
          children: [child('a', 0), child('b', 30)],
        },
      ],
    };
    const doc = engine().evaluateDocument(scene);
    const y = (id: string) => bounds({ viewBox: [0, 0, 0, 0], shapes: doc.geometry.shapes.filter((s) => s.node === id) }).y;
    expect([y('a'), y('b')]).toEqual([5, 15]); // −5 + 10 × 1 and −5 + 10 × 2, in list order
  });

  it('invisible is not painted; opacity multiplies', () => {
    const scene: SceneV2 = {
      version: 2,
      objects: [
        { kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [], visible: false },
        { kind: 'object', id: 'b', name: 'b', source: rect(10, 10), stack: [], opacity: 0.5 },
      ],
    };
    const doc = engine().evaluateDocument(scene);
    expect(doc.geometry.shapes).toHaveLength(1);
    expect(doc.geometry.shapes[0]!.style.opacity).toBe('0.5');
  });

  it('the viewBox fits what is there, or the fixed document size', () => {
    const one: SceneV2 = { version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(100, 50), stack: [] }] };
    expect(engine().evaluateDocument(one).geometry.viewBox).toEqual([-55, -30, 110, 60]);
    expect(engine().evaluateDocument({ ...one, document: { width: 400, height: 300 } }).geometry.viewBox).toEqual([-200, -150, 400, 300]);
  });

  it('toSVG and mount accept a scene', () => {
    const e = engine();
    expect(e.toSVG({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [] }] })).toContain('<path');
    expect(e.toSVG({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [] }] })).toContain('viewBox="-5.5 -5.5 11 11"');
  });
});

describe('primitives', () => {
  const shape = (s: string, params: Record<string, unknown> = {}, extra: object = {}): SceneV2 => ({
    version: 2,
    objects: [{ kind: 'shape', id: 's', name: s, shape: s, params, stack: [], ...extra }],
  });

  it('all generate with their defaults', async () => {
    const { shapes } = await import('../src');
    for (const def of shapes) expect(() => engine().evaluateDocument(shape(def.type))).not.toThrow();
  });

  it('the rectangle measures what it says and is centred (or where its position says)', () => {
    expect(engine().evaluateDocument(shape('rectangle', { width: 100, height: 40 })).nodes.get('s')!.box).toEqual({ x: -50, y: -20, width: 100, height: 40 });
    const moved = engine().evaluateDocument(shape('rectangle', { width: 100, height: 40 }, { transform: { x: 200, y: 50 } }));
    expect(moved.nodes.get('s')!.box).toEqual({ x: 150, y: 30, width: 100, height: 40 });
  });

  it('style: fill and stroke from the parameters', () => {
    const doc = engine().evaluateDocument(shape('star', { fillColor: '#ff0000', stroke: true, strokeColor: '#000000', strokeWidth: 3 }));
    expect(doc.geometry.shapes[0]!.style).toMatchObject({ fill: '#ff0000', stroke: '#000000', 'stroke-width': '3' });
    expect(engine().evaluateDocument(shape('line')).geometry.shapes[0]!.style.fill).toBe('none');
  });

  it('the polygon has as many sides as asked; the star, twice as many vertices as points', () => {
    const poly = engine().evaluateDocument(shape('polygon', { sides: 7 })).geometry.shapes[0]!.subpaths[0]!;
    expect(poly.segs).toHaveLength(7);
    const st = engine().evaluateDocument(shape('star', { points: 6 })).geometry.shapes[0]!.subpaths[0]!;
    expect(st.segs).toHaveLength(12);
  });

  it('a primitive carries its effect stack', () => {
    const doc = engine().evaluateDocument(shape('rectangle', { width: 100, height: 100 }, { stack: [{ id: 't', type: 'transform', params: { scale: 2 } }] }));
    expect(doc.nodes.get('s')!.box.width).toBeCloseTo(200);
  });
});

describe('node flips', () => {
  it('flipX mirrors around the node centre without moving it', () => {
    const tri = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L0 10Z"/></svg>';
    const scene: SceneV2 = { version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: tri, stack: [], transform: { flipX: true } }] };
    const doc = engine().evaluateDocument(scene);
    expect(doc.nodes.get('a')!.box).toEqual({ x: -5, y: -5, width: 10, height: 10 });
    // The right-angle vertex goes from the left (−5, −5) to the right (5, −5).
    const pts = doc.geometry.shapes[0]!.subpaths[0]!.segs.map((s) => s.p.map((v) => Math.round(v)));
    expect(pts).toContainEqual([5, 5]);
    expect(pts).not.toContainEqual([-5, 5]);
  });
});

describe('boolean', () => {
  const at = (id: string, x: number, size = 10) => ({ kind: 'object' as const, id, name: id, source: rect(size, size), stack: [], transform: { x } });
  const area = (geo: Geometry) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + Math.abs(a) / 2;
    }, 0);
  const run = (mode: string) =>
    engine().evaluateDocument({
      version: 2,
      // Two 10 squares overlapping by half: the first in the list, in front.
      objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'b', type: 'boolean', params: { mode } }], children: [at('front', 5), at('back', 0)] }],
    }).geometry;

  it('unites, subtracts, intersects and excludes', () => {
    expect(area(run('union'))).toBeCloseTo(150);
    expect(area(run('intersect'))).toBeCloseTo(50);
    expect(area(run('exclude'))).toBeCloseTo(100);
    // What is in front is removed from the back one: its left half remains.
    const sub = run('subtract');
    expect(area(sub)).toBeCloseTo(50);
    expect(bounds(sub).x).toBeCloseTo(-5);
  });
  it('lines are not lost: whole when uniting, clipped when intersecting', () => {
    // A line crossing both squares, from −20 to 20 at y = 0, inside the back one.
    const lined = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 10 10"><rect x="-5" y="-5" width="10" height="10"/><path d="M-20 0 L20 0" fill="none" stroke="#000"/></svg>`;
    const go = (mode: string) =>
      engine().evaluateDocument({
        version: 2,
        objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'b', type: 'boolean', params: { mode } }], children: [at('front', 5), { kind: 'object', id: 'back', name: 'back', source: lined, stack: [] }] }],
      }).geometry;
    const lineOf = (geo: Geometry) => geo.shapes.find((s) => s.subpaths.some((sp) => !sp.closed));
    expect(bounds({ viewBox: [0, 0, 1, 1], shapes: [lineOf(go('union'))!] }).width).toBeCloseTo(40);
    // What they share is x from 0 to 5: the line, clipped to that.
    const cut = bounds({ viewBox: [0, 0, 1, 1], shapes: [lineOf(go('intersect'))!] });
    expect(cut.x).toBeCloseTo(0, 0);
    expect(cut.width).toBeCloseTo(5, 0);
  });

  it('without tagged elements, each shape is one', () => {
    const two = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></svg>`;
    const geo = engine().evaluateDocument({ version: 2, objects: [{ kind: 'object', id: 'o', name: 'o', source: two, stack: [{ id: 'b', type: 'boolean', params: { mode: 'intersect' } }] }] }).geometry;
    expect(area(geo)).toBeCloseTo(50);
  });
});

describe('effects that use another object', () => {
  const dot = (id: string, stack: SceneV2['objects'][number]['stack']) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack });
  const path = { kind: 'shape' as const, id: 'p', name: 'p', shape: 'line', params: { length: 200, angle: 0 }, stack: [], transform: { x: 50, y: 30 } };

  it('Clone on the outline: the copies, spread along the other object path', () => {
    const doc = engine().evaluateDocument({
      version: 2,
      objects: [dot('d', [{ id: 'c', type: 'clone', params: { mode: 'object', target: 'p', count: 5, align: false } }]), path],
    });
    const box = doc.nodes.get('d')!.box;
    // The line goes from x = −50 to 150 at y = 30: 10 × 10 copies centred on its ends and in between.
    expect(box.x).toBeCloseTo(-55);
    expect(box.width).toBeCloseTo(210);
    expect(box.y).toBeCloseTo(25);
    expect(doc.geometry.shapes.filter((s) => s.node === 'd')).toHaveLength(5);
  });

  it('Clone without an object (or with one that does not exist) leaves the drawing as it was', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [dot('d', [{ id: 'c', type: 'clone', params: { mode: 'object', target: 'nope' } }])] });
    expect(doc.nodes.get('d')!.box).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });

  it('Path Wrap stretches the drawing along the path', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [dot('d', [{ id: 'w', type: 'pathwrap', params: { target: 'p' } }]), path] });
    const box = doc.nodes.get('d')!.box;
    expect(box.x).toBeCloseTo(-50);
    expect(box.width).toBeCloseTo(200);
    expect(box.y).toBeCloseTo(25);
  });
});

describe('pivot', () => {
  const sq = (transform: object) => engine().evaluateDocument({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [], transform }] }).nodes.get('a')!.box;
  it('changing the pivot, without rotation or scale, does not move the object', () => {
    expect(sq({ pivot: [0, 0] })).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });
  it('turns around the pivot (the top left corner)', () => {
    const b = sq({ pivot: [0, 0], rotation: 180 });
    expect(b.x).toBeCloseTo(-15);
    expect(b.y).toBeCloseTo(-15);
  });
});

describe('blend modes', () => {
  it('the mode goes in style (it is CSS, not an SVG attribute); the child mode wins over the group', () => {
    const e = engine();
    const scene: SceneV2 = {
      version: 2,
      objects: [
        {
          kind: 'group', id: 'g', name: 'g', stack: [], blend: 'screen',
          children: [
            { kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [], blend: 'multiply' },
            { kind: 'object', id: 'b', name: 'b', source: rect(10, 10), stack: [] },
          ],
        },
      ],
    };
    const svg = e.toSVG(scene);
    expect(svg).toContain('style="mix-blend-mode:multiply"');
    expect(svg).toContain('style="mix-blend-mode:screen"');
    expect(svg).not.toContain(' mix-blend-mode="');
  });
});

describe('morph and explosion', () => {
  const area = (geo: Geometry) =>
    geo.shapes.flatMap((s) => s.subpaths).reduce((sum, sp) => {
      const pts = [sp.start, ...sp.segs.map((g) => g.p)];
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) a += pts[i]![0] * pts[i + 1]![1] - pts[i + 1]![0] * pts[i]![1];
      return sum + Math.abs(a) / 2;
    }, 0);
  const scene = (amount: number): SceneV2 => ({
    version: 2,
    objects: [
      { kind: 'shape', id: 'sq', name: 'sq', shape: 'rectangle', params: { width: 100, height: 100 }, stack: [{ id: 'm', type: 'morph', params: { target: 'c', amount } }] },
      { kind: 'shape', id: 'c', name: 'c', shape: 'ellipse', params: { width: 50, height: 50 }, stack: [], visible: false },
    ],
  });
  it('morph: from square (amount 0) to circle (amount 1)', () => {
    expect(area(engine().evaluateDocument(scene(0)).geometry)).toBeCloseTo(10000, -2);
    expect(area(engine().evaluateDocument(scene(1)).geometry)).toBeCloseTo(Math.PI * 25 * 25, -2);
  });
  it('explosion: the pieces move away from the centre', () => {
    const e = engine();
    const base: SceneV2 = { version: 2, objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: 100, height: 100 }, stack: [{ id: 'mo', type: 'mosaic', params: { columns: 4, rows: 4, gutter: [0, 0] } }] }] };
    const before = e.evaluateDocument(base).nodes.get('r')!.box;
    base.objects[0]!.stack.push({ id: 'x', type: 'explosion', params: { amount: 1, force: 0.5 } });
    const after = e.evaluateDocument(base).nodes.get('r')!.box;
    expect(after.width).toBeGreaterThan(before.width * 1.3);
  });
});

describe('morph with steps', () => {
  it('the original, the steps and the target: each one an element', () => {
    const scene: SceneV2 = {
      version: 2,
      objects: [
        { kind: 'shape', id: 'sq', name: 'sq', shape: 'rectangle', params: { width: 100, height: 100 }, stack: [{ id: 'm', type: 'morph', params: { target: 'c', amount: 1, steps: 3 } }] },
        { kind: 'shape', id: 'c', name: 'c', shape: 'ellipse', params: { width: 50, height: 50 }, stack: [], transform: { x: 300 } },
      ],
    };
    const shapes = engine().evaluateDocument(scene).geometry.shapes.filter((s) => s.node === 'sq');
    expect(shapes.map((s) => s.clone)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('live render', () => {
  it('removes style attributes the shape no longer has', async () => {
    const { Window } = await import('happy-dom');
    const win = new Window();
    const svg = win.document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    const base = { viewBox: [0, 0, 10, 10] as [number, number, number, number], shapes: [{ subpaths: [], style: { fill: '#000', opacity: '0' } }] };
    renderInto(svg, base);
    expect(svg.querySelector('path')!.getAttribute('opacity')).toBe('0');
    renderInto(svg, { ...base, shapes: [{ subpaths: [], style: { fill: '#000' } }] });
    expect(svg.querySelector('path')!.getAttribute('opacity')).toBeNull();
  });
});

describe('cache of effects that use another object', () => {
  // A test effect that counts how many times it is computed and copies the other object box.
  let calls = 0;
  const spy = {
    type: 'spy',
    label: 'Spy',
    kind: 'generator' as const,
    params: { target: { type: 'node' as const, default: '' } },
    apply(geo: Geometry, p: { target: string }, ctx: { target?: (id: string) => Geometry | null }) {
      const t = p.target ? ctx.target?.(p.target) : null;
      if (t) calls++;
      return t ?? geo;
    },
  };
  const scene = (otherX: number, targetW: number): SceneV2 => ({
    version: 2,
    objects: [
      { kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [{ id: 's', type: 'spy', params: { target: 'b' } }] },
      { kind: 'shape', id: 'b', name: 'b', shape: 'rectangle', params: { width: targetW, height: 10 }, stack: [], transform: { x: 100 } },
      { kind: 'object', id: 'c', name: 'c', source: rect(10, 10), stack: [], transform: { x: otherX } },
    ],
  });

  it('is not redone when something else changes; it is when the object it looks at changes', () => {
    const e = createEngine([...builtins, spy]);
    calls = 0;
    const first = e.evaluateDocument(scene(0, 20));
    expect(calls).toBeGreaterThan(0);
    calls = 0;
    e.evaluateDocument(scene(0, 20));
    expect(calls).toBe(0);
    // Moving a third one does not affect it.
    e.evaluateDocument(scene(50, 20));
    expect(calls).toBe(0);
    // Changing the other does; and with the right result.
    const after = e.evaluateDocument(scene(50, 40));
    expect(calls).toBeGreaterThan(0);
    expect(after.nodes.get('a')!.box.width).toBeCloseTo(40);
    expect(first.nodes.get('a')!.box.width).toBeCloseTo(20);
  });
});

describe('step cache', () => {
  it('changing the last effect of the stack does not redo the ones above it', () => {
    let calls = 0;
    const heavy = {
      type: 'heavy',
      label: 'Heavy',
      kind: 'deformer' as const,
      params: {},
      apply(geo: Geometry) {
        calls++;
        return geo;
      },
    };
    const e = createEngine([...builtins, heavy]);
    const scene = (dx: number): SceneV2 => ({
      version: 2,
      objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [{ id: 'h', type: 'heavy' }, { id: 't', type: 'transform', params: { x: dx } }] }],
    });
    e.evaluateDocument(scene(0));
    expect(calls).toBe(1);
    e.evaluateDocument(scene(5));
    e.evaluateDocument(scene(10));
    expect(calls).toBe(1);
    expect(e.evaluateDocument(scene(20)).nodes.get('a')!.box.x).toBeCloseTo(15);
  });
});

describe('filters', () => {
  const scene = (stack: SceneV2['objects'][number]['stack'], extra: Partial<SceneV2> = {}): SceneV2 => ({
    version: 2,
    objects: [
      { kind: 'object', id: 'a', name: 'a', source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10"/><rect x="10" width="10" height="10"/></svg>`, stack },
      { kind: 'object', id: 'b', name: 'b', source: rect(10, 10), stack: [], transform: { x: 40 } },
    ],
    ...extra,
  });

  it('they do not touch the geometry; they group the object shapes in a <g filter>', () => {
    const e = engine();
    const plain = e.evaluateDocument(scene([]));
    const doc = e.evaluateDocument(scene([{ id: 's', type: 'shadow', params: { offset: [0, 30], blur: 0 } }]));
    expect(doc.nodes.get('a')!.box).toEqual(plain.nodes.get('a')!.box);
    expect(doc.geometry.shapes.filter((s) => s.wrap?.[0] === 'a')).toHaveLength(2);
    expect(doc.geometry.shapes.find((s) => s.node === 'b')!.wrap).toBeUndefined();
    const svg = e.toSVG(scene([{ id: 's', type: 'shadow', params: { offset: [0, 30], blur: 0 } }]));
    expect(svg).toContain('<filter id="sv-f-a"');
    expect(svg).toContain('<feDropShadow');
    expect(svg.match(/<g filter="url\(#sv-f-a\)">/g)).toHaveLength(1);
    // The automatic framing counts the shadow (30 down): it is not clipped.
    expect(doc.geometry.viewBox[3]).toBeGreaterThan(plain.geometry.viewBox[3] + 25);
  });

  it('they chain in stack order; disabled ones do not count', () => {
    const doc = engine().evaluateDocument(scene([
      { id: 'b1', type: 'blur', params: { amount: 4 } },
      { id: 'g1', type: 'glow', enabled: false },
      { id: 'd1', type: 'displace' },
    ]));
    const f = doc.geometry.filters!.a!.markup;
    expect(f.indexOf('feGaussianBlur')).toBeLessThan(f.indexOf('feDisplacementMap'));
    expect(f).toContain('in="f0"');
    expect(f).not.toContain('feFlood');
  });

  it('on the live canvas: groups appear and disappear without losing the paths', () => {
    const e = engine();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as unknown as SVGSVGElement;
    renderInto(svg, e.evaluateDocument(scene([{ id: 's', type: 'shadow' }])).geometry);
    expect(svg.querySelectorAll('g[data-svertik-fx] > path')).toHaveLength(2);
    expect(svg.querySelectorAll(':scope > path')).toHaveLength(1);
    expect(svg.querySelector('g')!.getAttribute('filter')).toMatch(/^url\(#s\d+-sv-f-a\)$/);
    renderInto(svg, e.evaluateDocument(scene([])).geometry);
    expect(svg.querySelectorAll('g')).toHaveLength(0);
    expect(svg.querySelectorAll(':scope > path')).toHaveLength(3);
  });
});

describe('zoned filters', () => {
  const one = (params: Record<string, unknown>, transform = {}): SceneV2 => ({
    version: 2,
    objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(100, 50), stack: [{ id: 'b', type: 'blur', params }], transform }],
  });
  const markup = (s: SceneV2) => engine().evaluateDocument(s).geometry.filters!.a!.markup;

  it('whole, without a mask; with an area, a mask with the gradient and the original outside it', () => {
    expect(markup(one({}))).not.toContain('feImage');
    const m = markup(one({ area: 'radial', center: [0, 0.5], radius: 0.5 }));
    expect(m).toContain('<feImage href="data:image/svg+xml');
    expect(m).toContain('operator="out"');
    // The centre, in the document: the object (100 × 50) is centred on the origin → x = −50.
    expect(decodeURIComponent(m)).toContain('cx="-50" cy="0" r="50"');
  });

  it('the area follows the moved object; the band carries a linear gradient', () => {
    expect(decodeURIComponent(markup(one({ area: 'radial', center: [0.5, 0.5] }, { x: 200 })))).toContain('cx="200"');
    expect(decodeURIComponent(markup(one({ area: 'band', angle: 0, radius: 0.2 })))).toMatch(/linearGradient id="m"[^>]*y1="-20"[^>]*y2="20"/);
  });
});

describe('instance', () => {
  const orig = (stack: SceneV2['objects'][number]['stack'] = [], transform = {}) =>
    ({ kind: 'object' as const, id: 'a', name: 'a', source: rect(10, 10), stack, transform });
  const inst = (extra: Record<string, unknown> = {}) => ({ kind: 'instance' as const, id: 'i', name: 'i', of: 'a', stack: [], transform: { x: 100 }, ...extra });

  it('draws the original result (with its effects) in its own place, in front or behind', () => {
    const stack = [{ id: 't', type: 'transform', params: { scale: 2 } }];
    for (const objects of [[inst(), orig(stack, { x: -50 })], [orig(stack, { x: -50 }), inst()]]) {
      const doc = engine().evaluateDocument({ version: 2, objects } as SceneV2);
      expect(doc.nodes.get('a')!.box).toEqual({ x: -60, y: -10, width: 20, height: 20 });
      expect(doc.nodes.get('i')!.box).toEqual({ x: 90, y: -10, width: 20, height: 20 });
      // Its shapes are its own (clicking selects the instance).
      expect(doc.geometry.shapes.map((s) => s.node).sort()).toEqual(['a', 'i']);
    }
  });

  it('follows the original when it changes; carries its own effects on top', () => {
    const e = engine();
    const scene = { version: 2, objects: [orig(), inst({ stack: [{ id: 'r', type: 'transform', params: { scale: 0.5 } }] })] } as SceneV2;
    expect(e.evaluateDocument(scene).nodes.get('i')!.box.width).toBeCloseTo(5);
    (scene.objects[0] as { source: string }).source = rect(40, 40);
    expect(e.evaluateDocument(scene).nodes.get('i')!.box.width).toBeCloseTo(20);
  });

  it('shows even if the original is hidden (a master)', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [{ ...orig(), visible: false }, inst()] } as SceneV2);
    expect(doc.geometry.shapes.map((s) => s.node)).toEqual(['i']);
  });

  it('an instance of its own group, or in a circular chain, draws nothing (and does not hang)', () => {
    const scene = {
      version: 2,
      objects: [
        { kind: 'group', id: 'g', name: 'g', stack: [], children: [orig(), { ...inst(), of: 'g' }] },
        { kind: 'instance', id: 'x', name: 'x', of: 'y', stack: [] },
        { kind: 'instance', id: 'y', name: 'y', of: 'x', stack: [] },
      ],
    } as SceneV2;
    const doc = engine().evaluateDocument(scene);
    expect(doc.geometry.shapes.map((s) => s.node)).toEqual(['a']);
  });

  it('of an original that does not exist: nothing, and validateScene warns', async () => {
    const { validateScene } = await import('../src/validate');
    const scene = { version: 2, objects: [{ ...inst(), of: 'nope' }] } as SceneV2;
    expect(engine().evaluateDocument(scene).geometry.shapes).toHaveLength(0);
    const r = validateScene(scene);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/nope/);
  });
});

describe('effector', () => {
  const obj = (id: string, x: number) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack: [], transform: { x } });
  const eff = (extra: Record<string, unknown> = {}) => ({
    kind: 'effector' as const, id: 'e', name: 'e', targets: ['a', 'b'], stack: [{ id: 's', type: 'transform', params: { scale: 2 } }], ...extra,
  });

  it('applies its effects to each target separately (each on its own box) and draws nothing', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [eff(), obj('a', 0), obj('b', 100), obj('c', 200)] } as SceneV2);
    expect(doc.nodes.get('a')!.box).toEqual({ x: -10, y: -10, width: 20, height: 20 });
    expect(doc.nodes.get('b')!.box).toEqual({ x: 90, y: -10, width: 20, height: 20 });
    expect(doc.nodes.get('c')!.box.width).toBe(10);
    expect(doc.geometry.shapes.map((s) => s.node).sort()).toEqual(['a', 'b', 'c']);
  });

  it('goes after the target own stack; hidden it does nothing', () => {
    const own = { ...obj('a', 0), stack: [{ id: 'o', type: 'transform', params: { scale: 0.5 } }] };
    const move = { stack: [{ id: 's', type: 'transform', params: { x: 10 } }], targets: ['a'] };
    const e = engine();
    // First its own (scale 0.5 around the centre: 2.5–7.5), then the effector one (+10): 12.5–17.5,
    // which once placed (source centre at 0) ends at 7.5. The other way round it would be 2.5.
    expect(e.evaluateDocument({ version: 2, objects: [eff(move), own] } as SceneV2).nodes.get('a')!.box.x).toBeCloseTo(7.5);
    expect(e.evaluateDocument({ version: 2, objects: [eff({ visible: false }), obj('a', 0)] } as SceneV2).nodes.get('a')!.box.width).toBe(10);
  });

  it('delay: each target sees the effector animation a little later', async () => {
    const { sampleScene } = await import('../src/animation');
    const scene = {
      version: 2,
      objects: [eff({ delay: 0.5 }), obj('a', 0), obj('b', 100)],
      animation: { duration: 2, tracks: [{ id: 't', node: 'e', on: 'modifier', modifier: 's', param: 'scale', keys: [{ t: 0, value: 1, ease: 'linear' }, { t: 1, value: 3, ease: 'linear' }] }] },
    } as SceneV2;
    const at = (t: number) => engine().evaluateDocument(sampleScene(scene, t)).nodes;
    // At 0.5 s: a, halfway (scale 2); b, still at the start (scale 1).
    expect(at(0.5).get('a')!.box.width).toBeCloseTo(20);
    expect(at(0.5).get('b')!.box.width).toBeCloseTo(10);
    // At 1.5 s: both at the end.
    expect(at(1.5).get('b')!.box.width).toBeCloseTo(30);
    // Without a time (the scene as it is), all the same.
    expect(engine().evaluateDocument(scene).nodes.get('b')!.box.width).toBeCloseTo(20);
  });

  it('validateScene accepts the effector and warns about targets that do not exist', async () => {
    const { validateScene } = await import('../src/validate');
    const r = validateScene({ version: 2, objects: [eff({ targets: ['a', 'zzz'] }), obj('a', 0)] } as SceneV2);
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(' ')).toMatch(/zzz/);
  });
});

describe('onlyFor (reduced scene for trails)', () => {
  it('keeps the node, what its effects use, its original and its effectors, and nothing else', async () => {
    const { onlyFor } = await import('../src/document');
    const o = (id: string, stack: SceneV2['objects'][number]['stack'] = []) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack });
    const scene = {
      version: 2,
      objects: [
        o('comet', [{ id: 'f', type: 'followpath', params: { target: 'orbit' } }]),
        o('orbit'),
        o('other'),
        { kind: 'instance', id: 'i', name: 'i', of: 'comet', stack: [] },
        { kind: 'effector', id: 'e', name: 'e', targets: ['comet'], stack: [{ id: 's', type: 'transform', params: { x: 1 } }] },
        { kind: 'group', id: 'g', name: 'g', stack: [], children: [o('inner')] },
      ],
    } as SceneV2;
    expect(onlyFor(scene, 'comet').objects.map((n) => n.id)).toEqual(['comet', 'orbit', 'e']);
    expect(onlyFor(scene, 'i').objects.map((n) => n.id)).toEqual(['comet', 'orbit', 'i', 'e']);
    expect(onlyFor(scene, 'inner').objects.map((n) => n.id)).toEqual(['g']);
  });
});

describe('mask', () => {
  const scene = (params: Record<string, unknown>, maskVisible = false) => ({
    version: 2,
    objects: [
      { kind: 'object', id: 'a', name: 'a', source: rect(100, 100, '#ff0000'), stack: [{ id: 'm', type: 'mask', params: { source: 'c', ...params } }] },
      { kind: 'shape', id: 'c', name: 'c', shape: 'ellipse', params: { width: 60, height: 60 }, stack: [], visible: maskVisible, transform: { x: 20 } },
    ],
  }) as SceneV2;

  it('wraps the object in a <g mask> with the other (hidden) shape, already placed', () => {
    const svg = engine().toSVG(scene({}));
    expect(svg).toMatch(/<mask id="sv-m-a--mask" maskUnits="userSpaceOnUse"/);
    expect(svg).toMatch(/<g mask="url\(#sv-m-a--mask\)">/);
    // The mask: the circle in white, centred at x = 20 (from -10 to 50).
    const mask = /<mask[^>]*>(.*?)<\/mask>/s.exec(svg)![1]!;
    expect(mask).toMatch(/fill="#fff"/);
    expect(mask).toMatch(/M50 0/);
    // The hidden circle is not painted outside the mask.
    expect((svg.match(/<path/g) ?? []).length).toBe(2);
  });

  it('inverted: everything white and the shape black; luminance: with its colours', () => {
    const inv = engine().toSVG(scene({ invert: true }));
    expect(inv).toMatch(/<mask[^>]*><rect[^>]*fill="#fff"\/><path[^>]*fill="#000"/);
    const lum = engine().toSVG(scene({ mode: 'luminance' }));
    expect(/<mask[^>]*>(.*?)<\/mask>/s.exec(lum)![1]).toMatch(/fill="#d9d9d9"/);
  });

  it('without a chosen mask, or disabled, nothing changes', () => {
    expect(engine().toSVG(scene({ source: '' }))).not.toMatch(/mask/);
    const off = scene({});
    (off.objects[0]!.stack[0] as { enabled?: boolean }).enabled = false;
    expect(engine().toSVG(off)).not.toMatch(/mask/);
  });
});

describe('bevel, thicken and tone filters', () => {
  const svgWith = (type: string, params: Record<string, unknown> = {}) =>
    engine().toSVG({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(50, 50, '#ff0000'), stack: [{ id: 'f', type, params }] }] } as SceneV2);

  it('bevel: diffuse and specular light on the alpha, clipped to the drawing', () => {
    const s = svgWith('bevel');
    expect(s).toMatch(/<feDiffuseLighting[^>]*><feDistantLight azimuth="225" elevation="45"\/><\/feDiffuseLighting>/);
    expect(s).toMatch(/<feSpecularLighting/);
    expect(s).toMatch(/<g filter="url\(#sv-f-a\)">/);
  });

  it('thicken: dilates or erodes; outline, a coloured contour behind', () => {
    expect(svgWith('thicken', { amount: 3 })).toMatch(/operator="dilate" radius="3"/);
    expect(svgWith('thicken', { amount: -2 })).toMatch(/operator="erode" radius="2"/);
    const o = svgWith('thicken', { mode: 'outline', amount: 4, color: '#00ff00' });
    expect(o).toMatch(/<feFlood flood-color="#00ff00"\/>/);
    expect(o).toMatch(/<feMergeNode in="f-o"|<feMergeNode in="[^"]*-o"\/><feMergeNode/);
  });

  it('tone: posterize with its levels, duotone with its two colours, invert', () => {
    expect(svgWith('tone', { levels: 3 })).toMatch(/type="discrete" tableValues="0 0.5 1"/);
    const d = svgWith('tone', { mode: 'duotone', dark: '#000000', light: '#ffffff' });
    expect(d).toMatch(/<feFuncR type="table" tableValues="0 1"\/>/);
    expect(svgWith('tone', { mode: 'invert' })).toMatch(/tableValues="1 0"/);
  });
});
