import { describe, expect, it } from 'vitest';
import { builtins, createEngine, sampleScene, setKey, valueAt, type SceneV2 } from '../src';

const scene = (): SceneV2 => ({
  version: 2,
  objects: [{ kind: 'shape', id: 's', name: 's', shape: 'star', params: { radius: 50, fillColor: '#000000' }, stack: [{ id: 'w', type: 'wave', params: { amplitude: 0 } }] }],
  animation: {
    duration: 2,
    tracks: [
      { id: 'a', node: 's', on: 'node', param: 'x', keys: [{ t: 0, value: 0, ease: 'linear' }, { t: 2, value: 100 }] },
      { id: 'b', node: 's', on: 'shape', param: 'fillColor', keys: [{ t: 0, value: '#000000', ease: 'linear' }, { t: 1, value: '#ffffff' }] },
      { id: 'c', node: 's', on: 'modifier', modifier: 'w', param: 'amplitude', keys: [{ t: 0, value: 0, ease: 'hold' }, { t: 1, value: 0.2 }] },
    ],
  },
});

describe('animación', () => {
  it('interpola números, colores y respeta hold', () => {
    const s = sampleScene(scene(), 1);
    const n = s.objects[0]!;
    expect(n.transform?.x).toBeCloseTo(50);
    expect(n.kind === 'shape' && n.params.fillColor).toBe('#ffffff');
    const half = sampleScene(scene(), 0.5).objects[0]!;
    expect(half.kind === 'shape' && half.params.fillColor).toBe('#808080');
    expect(half.stack[0]!.params?.amplitude).toBe(0);
    // Pasada la última clave, su valor.
    expect(sampleScene(scene(), 1.5).objects[0]!.stack[0]!.params?.amplitude).toBe(0.2);
  });

  it('no toca la escena original; sin animación, la devuelve tal cual', () => {
    const sc = scene();
    sampleScene(sc, 1);
    expect(sc.objects[0]!.transform).toBeUndefined();
    const plain: SceneV2 = { version: 2, objects: [] };
    expect(sampleScene(plain, 1)).toBe(plain);
  });

  it('easing por defecto: ease-in-out (despacio al principio y al final)', () => {
    const keys = [{ t: 0, value: 0 }, { t: 1, value: 1 }];
    expect(valueAt(keys, 0.1)).toBeLessThan(0.1);
    expect(valueAt(keys, 0.5)).toBeCloseTo(0.5);
  });

  it('setKey sustituye la clave del mismo fotograma y ordena', () => {
    let keys = setKey([], 1, 10);
    keys = setKey(keys, 0, 0);
    keys = setKey(keys, 1.01, 20, 30);
    expect(keys).toEqual([{ t: 0, value: 0 }, { t: 1.01, value: 20 }]);
  });

  it('el motor dibuja la escena muestreada', () => {
    const doc = createEngine(builtins).evaluateDocument(sampleScene(scene(), 2));
    expect(doc.nodes.get('s')!.box.x).toBeGreaterThan(40);
  });
});

describe('curvas expo, back, elastic y bounce', () => {
  it('back y elastic se pasan del destino y vuelven; bounce y expo acaban en 1', () => {
    const keys = (e: string) => [{ t: 0, value: 0, ease: e as never }, { t: 1, value: 1 }];
    const max = (e: string) => Math.max(...Array.from({ length: 50 }, (_, i) => valueAt(keys(e), i / 50) as number));
    expect(max('back-out')).toBeGreaterThan(1.02);
    expect(max('elastic-out')).toBeGreaterThan(1.02);
    expect(valueAt(keys('bounce-out'), 0.999)).toBeCloseTo(1, 2);
    expect(valueAt(keys('expo-out'), 0.3)).toBeGreaterThan(0.8);
  });
});
