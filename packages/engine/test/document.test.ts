import { describe, expect, it } from 'vitest';
import { bounds, builtins, createEngine, migrateScene, type SceneV2 } from '../src';

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
    expect(doc.geometry.shapes.map((s) => s.node)).toEqual(['a', 'b']);
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
    const ys = doc.geometry.shapes.map((s) => bounds({ viewBox: [0, 0, 0, 0], shapes: [s] }).y);
    expect(ys).toEqual([5, 15]); // −5 + 10 × 1 y −5 + 10 × 2
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
