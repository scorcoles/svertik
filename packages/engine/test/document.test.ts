import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, isScene, renderInto, type Geometry, type SceneV2 } from '../src';

const rect = (w: number, h: number, fill = '#000') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
const engine = () => createEngine(builtins);

describe('escena v2', () => {
  it('reconoce una escena (y rechaza lo que no lo es)', () => {
    expect(isScene({ version: 2, objects: [] })).toBe(true);
    expect(isScene({ version: 1, source: rect(10, 10), stack: [] })).toBe(false);
    expect(isScene(null)).toBe(false);
  });

  it('cada objeto queda centrado en el origen y se mueve con su posición', () => {
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
    // El primero de la lista se pinta el último (delante).
    expect(doc.geometry.shapes.map((s) => s.node)).toEqual(['b', 'a']);
  });

  it('cada objeto tiene su propia pila y su propia caja de referencia', () => {
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

  it('agrupar no mueve nada; mover el grupo mueve a sus hijos', () => {
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

  it('Step sobre un grupo trata cada hijo como un elemento', () => {
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
    expect([y('a'), y('b')]).toEqual([5, 15]); // −5 + 10 × 1 y −5 + 10 × 2, en el orden de la lista
  });

  it('invisible no se pinta; la opacidad se multiplica', () => {
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

  it('el viewBox se ajusta a lo que haya, o al tamaño fijo del documento', () => {
    const one: SceneV2 = { version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(100, 50), stack: [] }] };
    expect(engine().evaluateDocument(one).geometry.viewBox).toEqual([-55, -30, 110, 60]);
    expect(engine().evaluateDocument({ ...one, document: { width: 400, height: 300 } }).geometry.viewBox).toEqual([-200, -150, 400, 300]);
  });

  it('toSVG y mount aceptan las dos versiones', () => {
    const e = engine();
    expect(e.toSVG({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [] }] })).toContain('<path');
    expect(e.toSVG({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [] }] })).toContain('viewBox="-5.5 -5.5 11 11"');
  });
});

describe('primitivas', () => {
  const shape = (s: string, params: Record<string, unknown> = {}, extra: object = {}): SceneV2 => ({
    version: 2,
    objects: [{ kind: 'shape', id: 's', name: s, shape: s, params, stack: [], ...extra }],
  });

  it('todas se generan con sus valores por defecto', async () => {
    const { shapes } = await import('../src');
    for (const def of shapes) expect(() => engine().evaluateDocument(shape(def.type))).not.toThrow();
  });

  it('el rectángulo mide lo que dice y queda centrado (o donde diga su posición)', () => {
    expect(engine().evaluateDocument(shape('rectangle', { width: 100, height: 40 })).nodes.get('s')!.box).toEqual({ x: -50, y: -20, width: 100, height: 40 });
    const moved = engine().evaluateDocument(shape('rectangle', { width: 100, height: 40 }, { transform: { x: 200, y: 50 } }));
    expect(moved.nodes.get('s')!.box).toEqual({ x: 150, y: 30, width: 100, height: 40 });
  });

  it('estilo: relleno y trazo según los parámetros', () => {
    const doc = engine().evaluateDocument(shape('star', { fillColor: '#ff0000', stroke: true, strokeColor: '#000000', strokeWidth: 3 }));
    expect(doc.geometry.shapes[0]!.style).toMatchObject({ fill: '#ff0000', stroke: '#000000', 'stroke-width': '3' });
    expect(engine().evaluateDocument(shape('line')).geometry.shapes[0]!.style.fill).toBe('none');
  });

  it('el polígono tiene tantos lados como se pida; la estrella, el doble de vértices que puntas', () => {
    const poly = engine().evaluateDocument(shape('polygon', { sides: 7 })).geometry.shapes[0]!.subpaths[0]!;
    expect(poly.segs).toHaveLength(7);
    const st = engine().evaluateDocument(shape('star', { points: 6 })).geometry.shapes[0]!.subpaths[0]!;
    expect(st.segs).toHaveLength(12);
  });

  it('una primitiva lleva su pila de efectos', () => {
    const doc = engine().evaluateDocument(shape('rectangle', { width: 100, height: 100 }, { stack: [{ id: 't', type: 'transform', params: { scale: 2 } }] }));
    expect(doc.nodes.get('s')!.box.width).toBeCloseTo(200);
  });
});

describe('reflejo de nodos', () => {
  it('flipX refleja alrededor del centro del nodo sin moverlo', () => {
    const tri = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0L10 0L0 10Z"/></svg>';
    const scene: SceneV2 = { version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: tri, stack: [], transform: { flipX: true } }] };
    const doc = engine().evaluateDocument(scene);
    expect(doc.nodes.get('a')!.box).toEqual({ x: -5, y: -5, width: 10, height: 10 });
    // El vértice del ángulo recto pasa de la izquierda (−5, −5) a la derecha (5, −5).
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
      // Dos cuadrados de 10 solapados a la mitad: el primero de la lista, delante.
      objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'b', type: 'boolean', params: { mode } }], children: [at('front', 5), at('back', 0)] }],
    }).geometry;

  it('une, resta, intersecta y excluye', () => {
    expect(area(run('union'))).toBeCloseTo(150);
    expect(area(run('intersect'))).toBeCloseTo(50);
    expect(area(run('exclude'))).toBeCloseTo(100);
    // Al de atrás se le quita lo que tiene delante: queda su mitad izquierda.
    const sub = run('subtract');
    expect(area(sub)).toBeCloseTo(50);
    expect(bounds(sub).x).toBeCloseTo(-5);
  });
  it('las líneas no se pierden: enteras al unir, recortadas al intersectar', () => {
    // Una línea que atraviesa los dos cuadrados, de −20 a 20 en y = 0, dentro del de atrás.
    const lined = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-5 -5 10 10"><rect x="-5" y="-5" width="10" height="10"/><path d="M-20 0 L20 0" fill="none" stroke="#000"/></svg>`;
    const go = (mode: string) =>
      engine().evaluateDocument({
        version: 2,
        objects: [{ kind: 'group', id: 'g', name: 'g', stack: [{ id: 'b', type: 'boolean', params: { mode } }], children: [at('front', 5), { kind: 'object', id: 'back', name: 'back', source: lined, stack: [] }] }],
      }).geometry;
    const lineOf = (geo: Geometry) => geo.shapes.find((s) => s.subpaths.some((sp) => !sp.closed));
    expect(bounds({ viewBox: [0, 0, 1, 1], shapes: [lineOf(go('union'))!] }).width).toBeCloseTo(40);
    // Lo común es x de 0 a 5: la línea, recortada a eso.
    const cut = bounds({ viewBox: [0, 0, 1, 1], shapes: [lineOf(go('intersect'))!] });
    expect(cut.x).toBeCloseTo(0, 0);
    expect(cut.width).toBeCloseTo(5, 0);
  });

  it('sin elementos marcados, cada forma es uno', () => {
    const two = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10"/><rect x="5" width="10" height="10"/></svg>`;
    const geo = engine().evaluateDocument({ version: 2, objects: [{ kind: 'object', id: 'o', name: 'o', source: two, stack: [{ id: 'b', type: 'boolean', params: { mode: 'intersect' } }] }] }).geometry;
    expect(area(geo)).toBeCloseTo(50);
  });
});

describe('efectos que usan otro objeto', () => {
  const dot = (id: string, stack: SceneV2['objects'][number]['stack']) => ({ kind: 'object' as const, id, name: id, source: rect(10, 10), stack });
  const path = { kind: 'shape' as const, id: 'p', name: 'p', shape: 'line', params: { length: 200, angle: 0 }, stack: [], transform: { x: 50, y: 30 } };

  it('Clone sobre el contorno: las copias, repartidas por el trazado del otro objeto', () => {
    const doc = engine().evaluateDocument({
      version: 2,
      objects: [dot('d', [{ id: 'c', type: 'clone', params: { mode: 'object', target: 'p', count: 5, align: false } }]), path],
    });
    const box = doc.nodes.get('d')!.box;
    // La línea va de x = −50 a 150 en y = 30: copias de 10 × 10 centradas en sus extremos y entre medias.
    expect(box.x).toBeCloseTo(-55);
    expect(box.width).toBeCloseTo(210);
    expect(box.y).toBeCloseTo(25);
    expect(doc.geometry.shapes.filter((s) => s.node === 'd')).toHaveLength(5);
  });

  it('Clone sin objeto (o con uno que no existe) deja el dibujo como estaba', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [dot('d', [{ id: 'c', type: 'clone', params: { mode: 'object', target: 'nope' } }])] });
    expect(doc.nodes.get('d')!.box).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });

  it('Path Wrap estira el dibujo a lo largo del trazado', () => {
    const doc = engine().evaluateDocument({ version: 2, objects: [dot('d', [{ id: 'w', type: 'pathwrap', params: { target: 'p' } }]), path] });
    const box = doc.nodes.get('d')!.box;
    expect(box.x).toBeCloseTo(-50);
    expect(box.width).toBeCloseTo(200);
    expect(box.y).toBeCloseTo(25);
  });
});

describe('pivote', () => {
  const sq = (transform: object) => engine().evaluateDocument({ version: 2, objects: [{ kind: 'object', id: 'a', name: 'a', source: rect(10, 10), stack: [], transform }] }).nodes.get('a')!.box;
  it('cambiar el pivote, sin giro ni escala, no mueve el objeto', () => {
    expect(sq({ pivot: [0, 0] })).toEqual({ x: -5, y: -5, width: 10, height: 10 });
  });
  it('gira alrededor del pivote (la esquina superior izquierda)', () => {
    const b = sq({ pivot: [0, 0], rotation: 180 });
    expect(b.x).toBeCloseTo(-15);
    expect(b.y).toBeCloseTo(-15);
  });
});

describe('modos de fusión', () => {
  it('el modo va en style (es CSS, no un atributo de SVG); el del hijo manda sobre el del grupo', () => {
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

describe('morph y explosion', () => {
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
  it('morph: de cuadrado (amount 0) a círculo (amount 1)', () => {
    expect(area(engine().evaluateDocument(scene(0)).geometry)).toBeCloseTo(10000, -2);
    expect(area(engine().evaluateDocument(scene(1)).geometry)).toBeCloseTo(Math.PI * 25 * 25, -2);
  });
  it('explosion: los trozos se alejan del centro', () => {
    const e = engine();
    const base: SceneV2 = { version: 2, objects: [{ kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: 100, height: 100 }, stack: [{ id: 'mo', type: 'mosaic', params: { columns: 4, rows: 4, gutter: [0, 0] } }] }] };
    const before = e.evaluateDocument(base).nodes.get('r')!.box;
    base.objects[0]!.stack.push({ id: 'x', type: 'explosion', params: { amount: 1, force: 0.5 } });
    const after = e.evaluateDocument(base).nodes.get('r')!.box;
    expect(after.width).toBeGreaterThan(before.width * 1.3);
  });
});

describe('morph con pasos', () => {
  it('el original, los pasos y el destino: cada uno, un elemento', () => {
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

describe('render en vivo', () => {
  it('quita los atributos de estilo que la forma ya no tiene', async () => {
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

describe('caché de los que usan otro objeto', () => {
  // Un efecto de prueba que cuenta cuántas veces se calcula y copia la caja del otro objeto.
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

  it('no se rehace al tocar otra cosa; sí al cambiar el objeto al que mira', () => {
    const e = createEngine([...builtins, spy]);
    calls = 0;
    const first = e.evaluateDocument(scene(0, 20));
    expect(calls).toBeGreaterThan(0);
    calls = 0;
    e.evaluateDocument(scene(0, 20));
    expect(calls).toBe(0);
    // Mover un tercero no le afecta.
    e.evaluateDocument(scene(50, 20));
    expect(calls).toBe(0);
    // Cambiar el otro, sí; y con el resultado bueno.
    const after = e.evaluateDocument(scene(50, 40));
    expect(calls).toBeGreaterThan(0);
    expect(after.nodes.get('a')!.box.width).toBeCloseTo(40);
    expect(first.nodes.get('a')!.box.width).toBeCloseTo(20);
  });
});

describe('caché por pasos', () => {
  it('cambiar el último efecto de la pila no rehace los de debajo', () => {
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

describe('filtros', () => {
  const scene = (stack: SceneV2['objects'][number]['stack'], extra: Partial<SceneV2> = {}): SceneV2 => ({
    version: 2,
    objects: [
      { kind: 'object', id: 'a', name: 'a', source: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10"/><rect x="10" width="10" height="10"/></svg>`, stack },
      { kind: 'object', id: 'b', name: 'b', source: rect(10, 10), stack: [], transform: { x: 40 } },
    ],
    ...extra,
  });

  it('no tocan la geometría; agrupan las formas del objeto en un <g filter>', () => {
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
    // El encuadre automático cuenta la sombra (30 hacia abajo): no se corta.
    expect(doc.geometry.viewBox[3]).toBeGreaterThan(plain.geometry.viewBox[3] + 25);
  });

  it('se encadenan en el orden de la pila; apagados no cuentan', () => {
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

  it('en el lienzo vivo: los grupos aparecen y desaparecen sin perder los trazados', () => {
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
