import { describe, expect, it } from 'vitest';
import { actualSize, fitScale, FIT, wheelIntent, zoomAt } from './viewport';

describe('viewport', () => {
  it('encaje: la escala menor entre ancho y alto', () => {
    expect(fitScale(800, 400, 200, 200)).toBe(2);
  });
  it('zoom hacia el puntero: ese punto no se mueve', () => {
    const v = zoomAt(FIT, 2, 100, 50);
    // Un punto de contenido que estaba en (100, 50) sigue en (100, 50).
    expect(100 * v.zoom + v.pan.x).toBeCloseTo(100 * 2 + (100 - 200));
    expect(v.pan).toEqual({ x: -100, y: -50 });
  });
  it('100 %: zoom = 1 / encaje', () => {
    expect(actualSize(FIT, 2, 800, 400).zoom).toBeCloseTo(0.5);
  });
  it('rueda de ratón = zoom; trackpad = desplazar; pellizco = zoom', () => {
    expect(wheelIntent({ deltaX: 0, deltaY: 100, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe('zoom');
    expect(wheelIntent({ deltaX: 2, deltaY: 7.5, deltaMode: 0, ctrlKey: false, metaKey: false })).toBe('pan');
    expect(wheelIntent({ deltaX: 0, deltaY: 3.2, deltaMode: 0, ctrlKey: true, metaKey: false })).toBe('zoom');
  });
});
