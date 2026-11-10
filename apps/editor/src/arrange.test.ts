import { describe, expect, it } from 'vitest';
import { align, distribute } from './arrange';

const box = (id: string, x: number, y: number, w = 10, h = 10) => ({ id, box: { x, y, width: w, height: h } });

describe('alinear y distribuir', () => {
  it('alinea a la izquierda y al centro vertical de la selección', () => {
    const items = [box('a', 0, 0), box('b', 30, 20, 20, 20)];
    expect(align(items, 'left')).toEqual([{ id: 'a', dx: 0, dy: 0 }, { id: 'b', dx: -30, dy: 0 }]);
    expect(align(items, 'vcenter')).toEqual([{ id: 'a', dx: 0, dy: 15 }, { id: 'b', dx: 0, dy: -10 }]);
  });

  it('reparte con huecos iguales, sin mover los extremos', () => {
    const items = [box('c', 100, 0), box('a', 0, 0), box('b', 20, 0, 30)];
    // Ocupan 0..110; tamaños 10 + 30 + 10 = 50 → dos huecos de 30.
    expect(distribute(items, 'x')).toEqual([{ id: 'a', dx: 0, dy: 0 }, { id: 'b', dx: 20, dy: 0 }, { id: 'c', dx: 0, dy: 0 }]);
  });

  it('con pocos nodos no hace nada', () => {
    expect(align([box('a', 0, 0)], 'left')).toEqual([]);
    expect(distribute([box('a', 0, 0), box('b', 5, 5)], 'x')).toEqual([]);
  });
});
