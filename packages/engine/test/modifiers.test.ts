import { describe, expect, it } from 'vitest';
import { bend, bounds, builtins, createEngine, noise, resolveParams, spherize, transform, twist, wave, type Scene } from '../src';

const square = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="20" y="20" width="60" height="60"/></svg>';
const scene = (stack: Scene['stack']): Scene => ({ version: 1, source: square, stack });
const engine = () => createEngine(builtins);

describe('modificadores', () => {
  it('transform desplaza', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'transform', params: { x: 5, y: -5 } }]));
    expect(bounds(geo)).toEqual({ x: 25, y: 15, width: 60, height: 60 });
  });

  it('transform escala alrededor del pivote (centro por defecto)', () => {
    const b = bounds(engine().evaluate(scene([{ id: 'a', type: 'transform', params: { scale: 0.5 } }])));
    expect(b.x).toBeCloseTo(35);
    expect(b.width).toBeCloseTo(30);
  });

  it('spherize no mueve lo que queda fuera del radio', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'spherize', params: { radius: 0.1, strength: 1 } }]));
    expect(bounds(geo)).toEqual({ x: 20, y: 20, width: 60, height: 60 });
  });

  it('spherize con fuerza positiva empuja hacia fuera lo que está dentro', () => {
    const steps = engine().evaluateSteps(scene([{ id: 'a', type: 'spherize', params: { radius: 0.6, strength: 1 } }]));
    // El punto medio del lado superior (50, 20) está a 30 del centro, dentro del radio (36).
    const all = steps[1]!.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = all.find((p) => Math.abs(p[0] - 50) < 0.5)!;
    expect(top[1]).toBeLessThan(20);
  });

  it('twist con ángulo 0 y wave con amplitud 0 no cambian nada', () => {
    const e = engine();
    const base = bounds(e.evaluate(scene([])));
    expect(bounds(e.evaluate(scene([{ id: 'a', type: 'twist', params: { angle: 0 } }])))).toEqual(base);
    expect(bounds(e.evaluate(scene([{ id: 'a', type: 'wave', params: { amplitude: 0 } }])))).toEqual(base);
  });

  it('bend con ángulo positivo hace un arco ∩: las esquinas de arriba bajan respecto al centro del lado', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'bend', params: { angle: 60 } }]));
    const pts = geo.shapes[0]!.subpaths[0]!.segs.map((s) => s.p);
    const top = pts.filter((p) => p[1] < 40);
    const mid = top.reduce((a, p) => (Math.abs(p[0] - 50) < Math.abs(a[0] - 50) ? p : a));
    const corner = top.reduce((a, p) => (p[0] < a[0] ? p : a));
    expect(corner[1]).toBeGreaterThan(mid[1] + 5); // en SVG, y crece hacia abajo
  });

  it('noise es determinista: misma semilla, mismo resultado; otra semilla, otro', () => {
    const run = (seed: number) => engine().toSVG(scene([{ id: 'a', type: 'noise', params: { seed } }]));
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });

  it('un modificador desactivado no hace nada', () => {
    const geo = engine().evaluate(scene([{ id: 'a', type: 'transform', enabled: false, params: { x: 50 } }]));
    expect(bounds(geo).x).toBe(20);
  });

  it('un tipo desconocido avisa', () => {
    expect(() => engine().evaluate(scene([{ id: 'a', type: 'nope' }]))).toThrow(/nope/);
  });

  it('todos tienen valores por defecto válidos', () => {
    for (const m of [transform, spherize, twist, bend, wave, noise]) {
      expect(() => engine().evaluate(scene([{ id: 'a', type: m.type, params: resolveParams(m.params) }]))).not.toThrow();
    }
  });
});

describe('motor', () => {
  it('reutiliza los pasos que no han cambiado', () => {
    const e = engine();
    const stack: Scene['stack'] = [
      { id: 'a', type: 'spherize' },
      { id: 'b', type: 'wave', params: { phase: 0 } },
    ];
    const first = e.evaluateSteps(scene(stack));
    const second = e.evaluateSteps(scene([stack[0]!, { id: 'b', type: 'wave', params: { phase: 90 } }]));
    expect(second[1]).toBe(first[1]); // spherize, de la caché
    expect(second[2]).not.toBe(first[2]);
  });

  it('la cadena completa da siempre el mismo SVG', () => {
    const svg = engine().toSVG(
      scene([
        { id: 'a', type: 'transform', params: { rotation: 10 } },
        { id: 'b', type: 'spherize' },
        { id: 'c', type: 'twist' },
        { id: 'd', type: 'wave' },
        { id: 'e', type: 'noise' },
      ]),
      { precision: 1 },
    );
    expect(svg).toMatchSnapshot();
  });
});
