import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, migrateScene, type Geometry, type SceneV2 } from '../src';

const rect = (w: number, h: number, fill = '#000') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${fill}"/></svg>`;
const engine = () => createEngine(builtins);

describe('escena v2', () => {
  it('migra una v1 a un objeto con la misma pila', () => {
    const v2 = migrateScene({ version: 1, source: rect(10, 10), stack: [{ id: 'w', type: 'wave' }] }, 'a.svg');
    expect(v2.objects).toHaveLength(1);
    expect(v2.objects[0]).toMatchObject({ kind: 'object', name: 'a.svg', stack: [{ id: 'w', type: 'wave' }] });
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
    expect(e.toSVG({ version: 1, source: rect(10, 10), stack: [] })).toContain('<path');
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
});
