import { describe, expect, it } from 'vitest';
import { builtins, createEngine, toLottie, type SceneV2 } from '../src';

const scene: SceneV2 = {
  version: 2,
  objects: [
    // Solo se mueve y gira: una capa, con claves de colocación.
    { kind: 'shape', id: 'a', name: 'Mover', shape: 'star', params: {}, stack: [], transform: { x: 0 } },
    // Su forma cambia (un efecto animado): fotograma a fotograma. Con sombra: aviso.
    { kind: 'shape', id: 'b', name: 'Wavy', shape: 'rectangle', params: {}, stack: [{ id: 'w', type: 'wave', params: { amplitude: 0.1 } }, { id: 's', type: 'shadow' }], transform: { x: 300 } },
  ],
  animation: {
    duration: 1,
    fps: 10,
    tracks: [
      { id: 'p', node: 'a', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 100 }] },
      { id: 'r', node: 'a', on: 'node', param: 'rotation', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 90 }] },
      { id: 'ph', node: 'b', on: 'modifier', modifier: 'w', param: 'phase', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 180 }] },
    ],
  },
  interactions: [{ id: 'i', node: 'a', trigger: 'hover', target: { node: 'a', on: 'node', param: 'scale' }, to: 1.2, duration: 0.3 }],
};

describe('Lottie', () => {
  const out = toLottie(createEngine(builtins), scene, { name: 'test' });
  const layers = out.data.layers as { nm: string; ip: number; op: number; ks: { p: { a: number; k: unknown[] } }; shapes: { it: { ty: string }[] }[] }[];

  it('cabecera: fotogramas, tamaño y nombre', () => {
    expect(out.data).toMatchObject({ fr: 10, ip: 0, op: 10, nm: 'test' });
    expect(out.frames).toBe(10);
  });

  it('lo que solo se mueve: una capa con claves de posición (las de una recta, fuera)', () => {
    const mover = layers.filter((l) => l.nm === 'Mover');
    expect(mover).toHaveLength(1);
    expect(mover[0]!.ks.p.a).toBe(1);
    // Movimiento lineal: basta con la primera y la última.
    expect(mover[0]!.ks.p.k).toHaveLength(2);
    expect(mover[0]!.shapes[0]!.it.map((x) => x.ty)).toEqual(['sh', 'fl', 'tr']);
  });

  it('lo que cambia de forma: una capa por fotograma; y los avisos', () => {
    const wavy = layers.filter((l) => l.nm === 'Wavy');
    expect(wavy.length).toBeGreaterThan(1);
    // Entre todas, cubren los 10 fotogramas, sin huecos.
    expect(wavy.reduce((sum, l) => sum + l.op - l.ip, 0)).toBe(10);
    expect(out.warnings.join('\n')).toMatch(/Filters/);
    expect(out.warnings.join('\n')).toMatch(/Interactions/);
    expect(out.warnings.join('\n')).toMatch(/frame by frame.*Wavy/);
  });

  it('sin animación: un fotograma, sin avisos de peso', () => {
    const still = toLottie(createEngine(builtins), { version: 2, objects: [scene.objects[0]!] });
    expect(still.data).toMatchObject({ op: 1 });
    expect(still.warnings).toEqual([]);
  });

  it('los trozos de una explosión (que solo se mueven, giran y encogen): una capa con sus claves, no fotograma a fotograma', () => {
    const boom: SceneV2 = {
      version: 2,
      objects: [{ kind: 'shape', id: 'p', name: 'Pieces', shape: 'rectangle', params: {}, stack: [{ id: 'c', type: 'clone', params: { mode: 'grid', columns: 3, rows: 2 } }, { id: 'x', type: 'explosion', params: { amount: 0 } }] }],
      animation: { duration: 1, fps: 10, tracks: [{ id: 'a', node: 'p', on: 'modifier', modifier: 'x', param: 'amount', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 1, value: 1 }] }] },
    };
    const out = toLottie(createEngine(builtins), boom);
    const ls = out.data.layers as { shapes: { it: { ty: string; p?: { a: number } }[] }[] }[];
    expect(ls).toHaveLength(1);
    // Cada trozo, un grupo con su transformación animada.
    expect(ls[0]!.shapes).toHaveLength(6);
    expect(ls[0]!.shapes.every((g) => g.it.at(-1)!.ty === 'tr' && g.it.at(-1)!.p!.a === 1)).toBe(true);
    expect(out.warnings).toEqual([]);
  });
});
