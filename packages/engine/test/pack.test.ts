import { describe, expect, it } from 'vitest';
import { builtins, createEngine, packNode, unpackNode, type SceneV2 } from '../src';

const scene = (): SceneV2 => ({
  version: 2,
  objects: [
    {
      kind: 'group',
      id: 'g',
      name: 'g',
      stack: [],
      transform: { x: 40, y: -10, rotation: 20, scale: 1.5 },
      children: [
        { kind: 'shape', id: 'star', name: 'Star', shape: 'star', params: {}, stack: [{ id: 'tw', type: 'twist', params: { angle: 90 } }], transform: { x: 30, rotation: 10 }, opacity: 0.8 },
        { kind: 'shape', id: 'box', name: 'Box', shape: 'rectangle', params: { width: 50, height: 20 }, stack: [] },
      ],
    },
  ],
  animation: { duration: 2, tracks: [{ id: 'tr', node: 'star', on: 'modifier', modifier: 'tw', param: 'angle', keys: [{ t: 0, value: 0 }, { t: 2, value: 90 }] }] },
  interactions: [{ id: 'i', node: 'box', trigger: 'hover', target: { node: 'box', on: 'node', param: 'scale' }, to: 1.2, duration: 0.3 }],
});
const round = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)));
const strip = (shapes: { node?: string; clone?: number }[]) => shapes.map(({ node: _n, clone: _c, ...s }) => s);

describe('pack', () => {
  it('el paquete se ve igual que el original, dentro de un grupo girado y escalado', () => {
    const e = createEngine(builtins);
    const s = scene();
    const before = e.evaluateDocument(s);
    const r = packNode(s, 'star', before, 'k1');
    expect(r?.animated).toBe(true);
    const after = e.evaluateDocument(s);
    expect(round(strip(after.geometry.shapes))).toEqual(round(strip(before.geometry.shapes)));
    // Su animación y sus interacciones se van dentro; las de otros, no.
    expect(s.animation!.tracks).toHaveLength(0);
    expect(s.interactions).toHaveLength(1);
    expect(s.objects[0]!.kind === 'group' && s.objects[0]!.children[0]!.id).toBe('star');
  });

  it('desempaquetar devuelve el original, con lo que se haya movido el paquete', () => {
    const e = createEngine(builtins);
    const s = scene();
    packNode(s, 'star', e.evaluateDocument(s), 'k1');
    const g = s.objects[0]!;
    if (g.kind !== 'group') throw new Error();
    g.children[0]!.transform = { ...g.children[0]!.transform, x: (g.children[0]!.transform?.x ?? 0) + 5 };
    g.children[0]!.stack.push({ id: 'w', type: 'wave', params: {} });
    expect(unpackNode(s, 'star', (x) => `${x}-2`)).toBe('star');
    const back = g.children[0]!;
    expect(back.transform?.x).toBeCloseTo(35);
    expect(back.opacity).toBe(0.8);
    expect(back.stack.map((m) => m.id)).toEqual(['tw', 'w']);
    expect(s.animation!.tracks.map((t) => t.id)).toEqual(['tr']);
  });

  it('lo que lo usaba de referencia lo sigue encontrando', () => {
    const e = createEngine(builtins);
    const s: SceneV2 = {
      version: 2,
      objects: [
        { kind: 'shape', id: 'r', name: 'r', shape: 'rectangle', params: { width: 100, height: 100 }, stack: [{ id: 'm', type: 'mosaic', params: { tile: 'shape', source: 'star', columns: 2, rows: 2, fit: 'whole', gutter: [0, 0] } }] },
        { kind: 'shape', id: 'star', name: 'Star', shape: 'star', params: {}, stack: [{ id: 'tw', type: 'twist', params: { angle: 90 } }], visible: false },
      ],
    };
    const before = e.evaluateDocument(s);
    packNode(s, 'star', before, 'k1');
    const after = e.evaluateDocument(s);
    expect(round(strip(after.geometry.shapes))).toEqual(round(strip(before.geometry.shapes)));
  });

  it('un paquete duplicado: al desempaquetar los dos, el segundo recibe ids nuevos', () => {
    const e = createEngine(builtins);
    const s = scene();
    packNode(s, 'star', e.evaluateDocument(s), 'k1');
    const g = s.objects[0]!;
    if (g.kind !== 'group') throw new Error();
    g.children.push({ ...JSON.parse(JSON.stringify(g.children[0])), id: 'pack-2' });
    unpackNode(s, 'star', (x) => `${x}-a`);
    expect(unpackNode(s, 'pack-2', (x) => `${x}-b`)).toBe('star-b');
    const copy = g.children.at(-1)!;
    expect(copy.stack[0]!.id).toBe('tw-b');
    expect(s.animation!.tracks.map((t) => [t.node, t.modifier])).toEqual([['star', 'tw'], ['star-b', 'tw-b']]);
  });
});
